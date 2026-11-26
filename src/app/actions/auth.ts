"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { authSchema, type ActionResult } from "@/lib/validation";
import { authConfigurationMessage, authConfigured, prisma } from "@/lib/db/prisma";
import { identity } from "@/lib/auth";
import { changePassword, emailAddress, emailConfigured, isDuplicateAccount, issueAccountEmail, registerAccount, resetPasswordWithToken, throttle, verificationRequired } from "@/lib/accounts";

export async function authenticate(mode: string, input: unknown): Promise<ActionResult> {
  if (!authConfigured()) return { ok: false, message: authConfigurationMessage() };
  const schema = mode === "reset" || mode === "verify" ? z.object({ email: z.email().max(254) }) : mode === "password" ? z.object({ password: z.string().min(12).max(128), current_password: z.string().max(128).optional(), token: z.string().max(128).optional() }) : authSchema;
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const p = parsed.data as { email: string; password: string; current_password?: string; token?: string; full_name?: string; account_type?: string; consent?: boolean };
  try {
    if (mode === "reset" || mode === "verify") {
      if (!emailConfigured()) return { ok: false, message: "Account email delivery is not configured. Please contact the pilot administrator." };
      await throttle(`${mode}:${emailAddress(p.email)}`, 3, 3600);
      const user = await prisma().app_users.findUnique({ where: { email: emailAddress(p.email) } });
      if (user && (mode === "reset" || !user.email_verified_at)) await issueAccountEmail(user.id, p.email, mode);
      return { ok: true, message: "If that address has an eligible account, a secure email link will arrive shortly." };
    }
    if (mode === "password") {
      if (p.token) await resetPasswordWithToken(p.token, p.password);
      else {
        const current = await identity();
        if (!current || current.profile?.status !== "active") return { ok: false, message: "Sign in or open a valid password-recovery link first." };
        await changePassword(current.user.id, p.current_password ?? "", p.password);
      }
      return { ok: true, message: "Password updated. Your previous sessions are revoked; sign in again with your new password." };
    }
    if (mode === "register") {
      if (!p.consent || !p.full_name || p.full_name.trim().length < 2 || !p.account_type) return { ok: false, message: "Enter your name, select an account type and accept the privacy notice." };
      if (verificationRequired() && !emailConfigured()) return { ok: false, message: "Registration requires email verification, but email delivery is not configured yet." };
      await throttle(`registration:${emailAddress(p.email)}`, 3, 3600);
      const existing = await prisma().app_users.findUnique({ where: { email: emailAddress(p.email) } });
      if (existing) return { ok: false, message: "An account with this email already exists. Sign in or reset your password." };
      const user = await registerAccount({ email: p.email, password: p.password, full_name: p.full_name, account_type: p.account_type });
      if (verificationRequired()) {
        await issueAccountEmail(user.id, p.email, "verify");
        return { ok: true, message: "Your account was created. Check your email to verify it before signing in." };
      }
      return { ok: true, message: "Your account was created. Signing you in…", nextStep: "sign-in" };
    }
    return { ok: false, message: "Use the sign-in form to authenticate with Auth.js." };
  } catch (error) {
    if (mode === "register" && isDuplicateAccount(error)) return { ok: false, message: "An account with this email already exists. Sign in or reset your password." };
    const message = error instanceof Error ? error.message : "";
    const safe = ["The account link is invalid or has expired.", "Your current password is incorrect.", "Email delivery could not be completed. Please try again later."];
    return { ok: false, message: safe.includes(message) ? message : "The account request could not be completed. Please check your details or try again later." };
  }
}

export async function logout() {
  const current = await identity();
  if (current) await prisma().app_users.update({ where: { id: current.user.id }, data: { session_version: { increment: 1 } } });
  const store = await cookies();
  for (const item of store.getAll()) if (/^(?:__Secure-)?next-auth\.session-token(?:\.|$)/.test(item.name)) store.delete(item.name);
  redirect("/login");
}
