import "server-only";
import { S3Client, PutObjectCommand, HeadObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { actorTransaction } from "@/lib/db/context";
import { detectFileType, fileExtension, MAX_FILE_SIZE, type FileType } from "@/lib/file-validation";

export function storageConfigured() { return Boolean(process.env.S3_BUCKET && process.env.S3_REGION && process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY); }
export function storageClient() {
  if (!storageConfigured()) throw new Error("Private file storage is not configured.");
  return new S3Client({ region: process.env.S3_REGION!, endpoint: process.env.S3_ENDPOINT || undefined, forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true", credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID!, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY! } });
}

export async function beginUpload(userId: string, input: { filename: string; mime: FileType; size: number; purpose: "document" | "crop_image"; listingId?: string }) {
  const client = storageClient();
  if (input.size < 1 || input.size > MAX_FILE_SIZE || (input.purpose === "crop_image" && (input.mime === "application/pdf" || !input.listingId))) throw new Error("Invalid file size or image type.");
  const id = crypto.randomUUID();
  const key = input.purpose === "document" ? `${userId}/${id}.${fileExtension(input.mime)}` : `${userId}/crops/${input.listingId}/${id}.${fileExtension(input.mime)}`;
  const file = await actorTransaction(userId, db => db.stored_files.create({ data: { id, owner_id: userId, listing_id: input.listingId ?? null, purpose: input.purpose, object_key: key, original_name: input.filename.slice(0, 254), mime_type: input.mime, size_bytes: input.size } }));
  const url = await getSignedUrl(client, new PutObjectCommand({ Bucket: process.env.S3_BUCKET!, Key: key, ContentType: input.mime, ContentLength: input.size, IfNoneMatch: "*" }), { expiresIn: 120 });
  return { id: file.id, url };
}

export async function finishUpload(userId: string, id: string) {
  const file = await actorTransaction(userId, db => db.stored_files.findFirst({ where: { id, owner_id: userId } }));
  if (!file || !["pending", "ready"].includes(file.state)) throw new Error("Upload is unavailable.");
  if (file.state === "ready") return;
  const client = storageClient();
  const location = { Bucket: process.env.S3_BUCKET!, Key: file.object_key };
  const metadata = await client.send(new HeadObjectCommand(location));
  const content = await client.send(new GetObjectCommand({ ...location, Range: "bytes=0-15" }));
  const bytes = await content.Body?.transformToByteArray();
  if (metadata.ContentLength !== file.size_bytes || metadata.ContentLength > MAX_FILE_SIZE || metadata.ContentType !== file.mime_type || !bytes || detectFileType(bytes) !== file.mime_type) {
    await client.send(new DeleteObjectCommand(location));
    await actorTransaction(userId, db => db.stored_files.update({ where: { id }, data: { state: "rejected" } }));
    throw new Error("The file content must match its declared PDF, JPEG or PNG format and size.");
  }
  await actorTransaction(userId, db => db.stored_files.updateMany({ where: { id, owner_id: userId, state: "pending" }, data: { state: "ready" } }));
}

export async function listDocuments(userId: string) {
  const files = await actorTransaction(userId, db => db.stored_files.findMany({ where: { owner_id: userId, purpose: "document", state: "ready" }, orderBy: { created_at: "desc" }, take: 100 }));
  return files.map(file => file.object_key.split("/").at(-1)!);
}

export async function documentUrl(userId: string, ownerId: string, name: string) {
  const file = await actorTransaction(userId, db => db.stored_files.findFirst({ where: { owner_id: ownerId, object_key: `${ownerId}/${name}`, purpose: "document", state: "ready" } }));
  if (!file) return null;
  return getSignedUrl(storageClient(), new GetObjectCommand({ Bucket: process.env.S3_BUCKET!, Key: file.object_key, ResponseContentDisposition: `attachment; filename="${name}"`, ResponseCacheControl: "private, no-store" }), { expiresIn: 60 });
}

export async function cropImageUrl(userId: string, listingId: string) {
  const file = await actorTransaction(userId, async db => {
    const listing = await db.produce_listings.findUnique({ where: { id: listingId } });
    if (!listing) return null;
    return db.stored_files.findFirst({ where: { listing_id: listingId, purpose: "crop_image", state: "ready" }, orderBy: { created_at: "desc" } });
  });
  return file ? getSignedUrl(storageClient(), new GetObjectCommand({ Bucket: process.env.S3_BUCKET!, Key: file.object_key, ResponseContentType: file.mime_type, ResponseCacheControl: "private, max-age=60" }), { expiresIn: 60 }) : null;
}

export async function removeDocument(userId: string, name: string) {
  const file = await actorTransaction(userId, db => db.stored_files.findFirst({ where: { owner_id: userId, object_key: `${userId}/${name}`, purpose: "document", state: "ready" } }));
  if (!file) throw new Error("Document unavailable.");
  await actorTransaction(userId, db => db.stored_files.update({ where: { id: file.id }, data: { state: "deleting" } }));
  try { await storageClient().send(new DeleteObjectCommand({ Bucket: process.env.S3_BUCKET!, Key: file.object_key })); }
  catch (error) { await actorTransaction(userId, db => db.stored_files.update({ where: { id: file.id }, data: { state: "ready" } })); throw error; }
  await actorTransaction(userId, db => db.stored_files.delete({ where: { id: file.id } }));
}
