export const MAX_FILE_SIZE = 5 * 1024 * 1024;
export const fileTypes = ["application/pdf", "image/jpeg", "image/png"] as const;
export type FileType = typeof fileTypes[number];
export function detectFileType(bytes: Uint8Array): FileType | null {
  if (String.fromCharCode(...bytes.slice(0, 5)) === "%PDF-") return "application/pdf";
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "image/jpeg";
  if (bytes.slice(0, 8).join(",") === "137,80,78,71,13,10,26,10") return "image/png";
  return null;
}
export function fileExtension(mime: string) { return mime === "application/pdf" ? "pdf" : mime === "image/jpeg" ? "jpg" : "png"; }
