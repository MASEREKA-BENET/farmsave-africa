"use client";
import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { authenticate } from "@/app/actions/auth";
import { signIn } from "next-auth/react";
import { safeNext } from "@/lib/utils";
import { Button } from "@/components/ui/button";
type Values = { email: string; password: string; current_password: string; full_name: string; account_type: string; consent: boolean };
export function AuthForm({ mode, account = "farmer", next, token }: { mode: "login" | "register" | "reset" | "password" | "verify"; account?: string; next?: string; token?: string }) {
  const { register, handleSubmit, formState: { isSubmitting } } = useForm<Values>({ defaultValues: { account_type: account } });
  const [result, setResult] = useState<{ ok: boolean; message: string }>();
  return <form className="space-y-5" onSubmit={handleSubmit(async values => { try {
    if (mode === "login") {
      const response = await signIn("credentials", { email: values.email, password: values.password, redirect: false, callbackUrl: safeNext(next ?? null) });
      if (response?.ok && !response.error) window.location.assign(response.url ?? safeNext(next ?? null));
      else setResult({ ok: false, message: "Could not sign in. Check your credentials and email verification, or request a password reset." });
    } else setResult(await authenticate(mode, { ...values, token }));
  } catch { setResult({ ok: false, message: "Unable to connect. Please try again." }); } })}>
    {mode === "register" && <><label>Full name<input autoComplete="name" required minLength={2} maxLength={120} {...register("full_name")} /></label><label>I’m joining as<select {...register("account_type")}><option value="farmer">Farmer</option><option value="buyer">Buyer</option><option value="transporter">Transporter (verification required)</option><option value="coordinator">Field coordinator (approval required)</option></select></label></>}
    {mode !== "password" && <label>Email address<input type="email" autoComplete="email" required {...register("email")} /></label>}
    {mode === "password" && !token && <label>Current password<input type="password" required autoComplete="current-password" maxLength={128} {...register("current_password")} /></label>}
    {mode !== "reset" && mode !== "verify" && <label>Password<input type="password" aria-label="Password" minLength={12} maxLength={128} required autoComplete={mode === "login" ? "current-password" : "new-password"} {...register("password")} /><span className="mt-1 block text-xs font-normal text-muted-foreground">At least 12 characters.</span></label>}
    {mode === "register" && <label className="flex items-start gap-3 font-normal"><input className="mt-1 w-5 shrink-0" type="checkbox" required {...register("consent")} /><span>I agree to the <Link href="/terms" className="underline">terms</Link> and consent to the collection described in the <Link href="/privacy" className="underline">privacy notice</Link>.</span></label>}
    {result && <p role="status" className={`rounded-xl p-3 text-sm ${result.ok ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive"}`}>{result.message}</p>}
    <Button className="w-full" disabled={isSubmitting}>{isSubmitting ? "Please wait…" : { login: "Sign in", register: "Create account", reset: "Send recovery link", password: "Update password", verify: "Send verification link" }[mode]}</Button>
  </form>;
}
