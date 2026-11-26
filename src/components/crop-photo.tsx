"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus } from "lucide-react";
import { uploadFile } from "@/lib/uploads-client";
import type { ActionResult } from "@/lib/validation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
export function CropPhoto({ listingId }: { listingId: string }) {
  const [open, setOpen] = useState(false); const [busy, setBusy] = useState(false); const [result, setResult] = useState<ActionResult>(); const router = useRouter();
  return <Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button variant="outline" size="sm"><ImagePlus className="size-4" />Crop photo</Button></DialogTrigger><DialogContent title="Upload a crop photo" description="JPEG or PNG, up to 5 MB. Authorized marketplace participants can view the photo; do not include personal documents or precise private addresses."><form className="space-y-4" onSubmit={async event => {
    event.preventDefault(); const file = new FormData(event.currentTarget).get("file"); if (!(file instanceof File)) return;
    setBusy(true); try { const res = await uploadFile(file, "crop_image", listingId); setResult(res); if (res.ok) { setOpen(false); router.refresh(); } } catch { setResult({ ok: false, message: "Photo upload failed. Check the storage connection." }); } finally { setBusy(false); }
  }}><label>Crop image<input name="file" type="file" accept="image/jpeg,image/png" required /></label>{result && <p role="status" className="text-sm text-destructive">{result.message}</p>}<Button disabled={busy}>{busy ? "Uploading…" : "Upload photo"}</Button></form></DialogContent></Dialog>;
}
