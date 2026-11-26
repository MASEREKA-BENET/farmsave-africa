"use client";
import { useState } from "react";
import { useForm } from "react-hook-form";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { command } from "@/app/actions/records";
import { deleteDocument } from "@/app/actions/documents";
import { uploadDocument } from "@/lib/uploads-client";
import type { ActionResult } from "@/lib/validation";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-provider";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
export function ProfilePanel({ name, phone, email, files, storageError }: { name: string; phone: string; email: string; files: string[]; storageError?: boolean }) {
  const { register, handleSubmit, formState: { isSubmitting } } = useForm({ defaultValues: { p_name: name, p_phone: phone } });
  const [result, setResult] = useState<ActionResult>(); const [busy, setBusy] = useState(false); const router = useRouter();
  return <div className="grid gap-5 xl:grid-cols-2">
    <section className="card"><h2 className="text-lg font-bold">Your profile</h2><p className="my-3 break-all text-sm text-muted-foreground">Signed in as {email}</p>
      <form className="space-y-5" onSubmit={handleSubmit(async p => { try { setResult(await command("update_profile", p)); router.refresh(); } catch { setResult({ ok: false, message: "Could not update profile." }); } })}>
        <label>Full name<input minLength={2} maxLength={120} required {...register("p_name")} /></label><label>Phone (optional)<input maxLength={30} autoComplete="tel" {...register("p_phone")} /></label><Button disabled={isSubmitting}>Save profile</Button>
      </form>
      <div className="mt-6 border-t border-border pt-5"><h3 className="mb-3 text-sm font-bold">Appearance</h3><ThemeToggle /><Link href="/account/password" className="mt-5 inline-block text-sm text-primary underline">Change password</Link></div>
    </section>
    <section className="card"><h2 className="text-lg font-bold">Private documents</h2><p className="mt-2 text-sm leading-relaxed text-muted-foreground">Only upload documents requested by the pilot team. Files are private to your account and authorized administrators. PDF, JPEG or PNG; maximum 5 MB.</p>
      {storageError && <p className="mt-3 text-sm text-destructive">Document storage is unavailable. Configure the private S3-compatible bucket and its upload CORS settings.</p>}
      <form className="mt-5 space-y-4" onSubmit={async event => {
        event.preventDefault(); const form = event.currentTarget; setBusy(true);
        try { const response = await uploadDocument(new FormData(form)); setResult(response); if (response.ok) { form.reset(); router.refresh(); } }
        catch { setResult({ ok: false, message: "Upload failed. Please try again." }); }
        finally { setBusy(false); }
      }}>
        <label>Choose a private document<input className="text-sm" type="file" name="file" accept="application/pdf,image/jpeg,image/png" required /></label><Button disabled={busy} variant="outline">{busy ? "Uploading…" : "Upload privately"}</Button>
      </form>
      <ul className="mt-5 space-y-3">{files.map(name => <li key={name} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border p-3 text-xs"><a href={`/api/documents?name=${encodeURIComponent(name)}`} target="_blank" rel="noreferrer" className="max-w-48 truncate text-primary underline">{name}</a><DeleteFile name={name} onResult={setResult} /></li>)}</ul>
    </section>
    {result && <p role="status" className={`card text-sm xl:col-span-2 ${result.ok ? "text-primary" : "text-destructive"}`}>{result.message}</p>}
  </div>;
}
function DeleteFile({ name, onResult }: { name: string; onResult: (result: ActionResult) => void }) {
  const [open, setOpen] = useState(false); const [busy, setBusy] = useState(false); const router = useRouter();
  return <Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button variant="ghost" size="sm">Delete</Button></DialogTrigger><DialogContent title="Delete private document" description="This permanently removes the uploaded file."><Button variant="destructive" disabled={busy} onClick={async () => {
    setBusy(true); try { const response = await deleteDocument(name); onResult(response); if (response.ok) { setOpen(false); router.refresh(); } } catch { onResult({ ok: false, message: "Could not delete the document." }); } finally { setBusy(false); }
  }}>{busy ? "Deleting…" : "Confirm deletion"}</Button></DialogContent></Dialog>;
}
