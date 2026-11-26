"use client";
import { startUpload, completeUpload } from "@/app/actions/documents";
import { MAX_FILE_SIZE } from "@/lib/file-validation";
import type { ActionResult } from "@/lib/validation";

export async function uploadFile(file: File, purpose: "document" | "crop_image", listingId?: string): Promise<ActionResult> {
  if (!file.size || file.size > MAX_FILE_SIZE) return { ok: false, message: "Choose a file up to 5 MB." };
  const result = await startUpload({ filename: file.name, mime: file.type, size: file.size, purpose, listingId });
  if (!result.ok) return result;
  // Bytes go directly to the private bucket, avoiding Vercel's server-action request body limit.
  const response = await fetch(result.url, { method: "PUT", body: file, headers: { "Content-Type": file.type, "If-None-Match": "*" } });
  if (!response.ok) return { ok: false, message: "The file could not be uploaded. Please try again." };
  return completeUpload(result.id);
}
export async function uploadDocument(form: FormData): Promise<ActionResult> {
  const file = form.get("file");
  if (!(file instanceof File)) return { ok: false, message: "Select a private document." };
  return uploadFile(file, "document");
}
