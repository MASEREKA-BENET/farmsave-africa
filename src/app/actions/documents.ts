"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { session } from "@/lib/auth";
import { beginUpload, finishUpload, removeDocument } from "@/lib/storage";
import { fileTypes, MAX_FILE_SIZE } from "@/lib/file-validation";
import { throttle } from "@/lib/accounts";
import type { ActionResult } from "@/lib/validation";

const uploadSchema = z.object({ filename: z.string().trim().min(1).max(254), mime: z.enum(fileTypes), size: z.number().int().min(1).max(MAX_FILE_SIZE), purpose: z.enum(["document", "crop_image"]), listingId: z.guid().optional() });
export async function startUpload(input: unknown) {
  const { user } = await session();
  const parsed = uploadSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, message: "Choose a valid PDF, JPEG or PNG file up to 5 MB." };
  try {
    await throttle(`uploads:${user.id}`, 30, 3600);
    const result = await beginUpload(user.id, parsed.data);
    return { ok: true as const, ...result };
  } catch { return { ok: false as const, message: "Upload could not be prepared. Check file storage configuration and listing permissions." }; }
}
export async function completeUpload(id: string): Promise<ActionResult> {
  const { user } = await session();
  if (!z.guid().safeParse(id).success) return { ok: false, message: "Invalid upload reference." };
  try { await finishUpload(user.id, id); revalidatePath("/workspace", "layout"); return { ok: true, message: "File uploaded and verified." }; }
  catch { return { ok: false, message: "Upload verification failed. Check the file type, size and storage connection." }; }
}
export async function deleteDocument(name: string): Promise<ActionResult> {
  const { user } = await session();
  if (!/^[a-f0-9-]{36}\.(pdf|jpg|png)$/.test(name)) return { ok: false, message: "Invalid document name." };
  try { await removeDocument(user.id, name); revalidatePath("/workspace/profile"); return { ok: true, message: "Document deleted." }; }
  catch { return { ok: false, message: "Could not delete the document." }; }
}
