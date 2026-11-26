"use client";
import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { contactSchema, type ActionResult } from "@/lib/validation";
import { contact } from "@/app/actions/contact";
import { Button } from "@/components/ui/button";
export function ContactForm() {
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(contactSchema), defaultValues: { name: "", email: "", message: "", website: "" } });
  const [result, setResult] = useState<ActionResult>();
  return <form className="card space-y-5 p-6 sm:p-8" onSubmit={handleSubmit(async values => { try { const r = await contact(values); setResult(r); if (r.ok) reset(); } catch { setResult({ ok: false, message: "We couldn’t connect. Please try again." }); } })}><div className="grid gap-5 sm:grid-cols-2"><label>Your name<input autoComplete="name" required {...register("name")} />{errors.name && <span className="text-xs text-destructive">{errors.name.message}</span>}</label><label>Email address<input type="email" autoComplete="email" required {...register("email")} />{errors.email && <span className="text-xs text-destructive">{errors.email.message}</span>}</label></div><label>How can we help?<textarea rows={4} required {...register("message")} />{errors.message && <span className="text-xs text-destructive">{errors.message.message}</span>}</label><div className="hidden" aria-hidden="true"><label>Website<input tabIndex={-1} autoComplete="off" {...register("website")} /></label></div><p className="text-xs text-muted-foreground">By sending this message, you consent to us storing your details to respond. Read our <Link href="/privacy" className="underline">privacy notice</Link>.</p>{result && <p role="status" className={`rounded-xl p-3 text-sm ${result.ok ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive"}`}>{result.message}</p>}<Button disabled={isSubmitting}>{isSubmitting ? "Saving…" : "Send message"}</Button></form>;
}
