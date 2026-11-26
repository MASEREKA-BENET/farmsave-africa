import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import { callFunction, type DatabaseTransaction } from "@/lib/db/context";
import { hashPassword, verifyPassword } from "@/lib/passwords";

export function emailAddress(email: string) { return email.trim().toLowerCase(); }
export function tokenHash(token: string) { return createHash("sha256").update(token).digest("hex"); }
export function emailConfigured() { return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM); }
export function verificationRequired() { return process.env.AUTH_REQUIRE_EMAIL_VERIFICATION !== "false"; }

export async function throttle(bucket: string, limit = 10, seconds = 900) {
  const key = tokenHash(bucket);
  // A separate transaction commits the limit before authentication, even when credentials are invalid.
  await prisma().$queryRaw`SELECT public.check_rate(${key}, ${limit}::integer, ${seconds}::integer)::text`;
}

export async function registerAccount(input: { email: string; password: string; full_name: string; account_type: string }) {
  if (!["farmer", "buyer", "transporter", "coordinator", "agricultural_partner"].includes(input.account_type)) throw new Error("Invalid account type");
  const password_hash = await hashPassword(input.password);
  return prisma().$transaction(async db => {
    const user = await db.app_users.create({ data: { email: emailAddress(input.email), password_hash, email_verified_at: verificationRequired() ? null : new Date() } });
    await db.$queryRaw`SELECT set_config('farmsave.user_id', ${user.id}, true)`;
    await db.profiles.create({ data: { id: user.id, full_name: input.full_name.trim() } });
    await callFunction(db, "enroll_account", { requested: input.account_type });
    return user;
  });
}

export async function checkCredentials(email: string, password: string, ip = "unknown") {
  await throttle(`login-address:${emailAddress(email)}`);
  await throttle(`login-network:${ip}`, 100);
  const user = await prisma().app_users.findUnique({ where: { email: emailAddress(email) }, include: { profiles: true } });
  const valid = await verifyPassword(password, user?.password_hash ?? "scrypt-v2$00000000000000000000000000000000$" + "0".repeat(128));
  if (!user || !valid || !user.email_verified_at || user.profiles?.status !== "active") return null;
  if (user.password_hash?.startsWith("$2")) await prisma().app_users.update({ where: { id: user.id }, data: { password_hash: await hashPassword(password) } });
  return { id: user.id, email: user.email, name: user.profiles.full_name, sessionVersion: user.session_version };
}

export async function issueAccountEmail(userId: string, email: string, kind: "verify" | "reset") {
  if (!emailConfigured()) throw new Error("Email delivery is not configured.");
  const token = randomBytes(32).toString("base64url");
  const record = await prisma().account_tokens.create({ data: { user_id: userId, kind, token_hash: tokenHash(token), expires_at: new Date(Date.now() + (kind === "reset" ? 15 * 60000 : 24 * 3600000)) } });
  const origin = process.env.AUTH_URL || process.env.NEXT_PUBLIC_SITE_URL;
  if (!origin) throw new Error("Configure the canonical application URL.");
  const url = new URL(kind === "verify" ? "/auth/verify" : "/account/password", origin);
  url.searchParams.set("token", token);
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST", headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.EMAIL_FROM, to: email, subject: kind === "verify" ? "Verify your FarmSave Africa account" : "Reset your FarmSave Africa password", text: `Open this single-use link to ${kind === "verify" ? "verify your email" : "reset your password"}:\n\n${url}\n\nIf you did not request this, ignore this message.` }),
      signal: AbortSignal.timeout(10000)
    });
    if (!response.ok) throw new Error("Email provider rejected the request.");
  } catch {
    await prisma().account_tokens.delete({ where: { id: record.id } });
    throw new Error("Email delivery could not be completed. Please try again later.");
  }
}

async function consumeToken(db: DatabaseTransaction, token: string, kind: string) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new Error("The account link is invalid or has expired.");
  const record = await db.account_tokens.findUnique({ where: { token_hash: tokenHash(token) } });
  if (!record || record.kind !== kind) throw new Error("The account link is invalid or has expired.");
  const result = await db.account_tokens.updateMany({ where: { id: record.id, used_at: null, expires_at: { gt: new Date() } }, data: { used_at: new Date() } });
  if (result.count !== 1) throw new Error("The account link is invalid or has expired.");
  return record.user_id;
}

export function verifyEmailToken(token: string) {
  return prisma().$transaction(async db => {
    const id = await consumeToken(db, token, "verify");
    await db.app_users.update({ where: { id }, data: { email_verified_at: new Date() } });
  });
}

export async function resetPasswordWithToken(token: string, password: string) {
  const password_hash = await hashPassword(password);
  return prisma().$transaction(async db => {
    const id = await consumeToken(db, token, "reset");
    await db.app_users.update({ where: { id }, data: { password_hash, session_version: { increment: 1 }, email_verified_at: new Date() } });
    await db.account_tokens.updateMany({ where: { user_id: id, used_at: null, kind: "reset" }, data: { used_at: new Date() } });
  });
}

export async function changePassword(userId: string, current: string, password: string) {
  const user = await prisma().app_users.findUnique({ where: { id: userId } });
  if (!user || !await verifyPassword(current, user.password_hash)) throw new Error("Your current password is incorrect.");
  const changed = await prisma().app_users.updateMany({ where: { id: userId, password_hash: user.password_hash, session_version: user.session_version }, data: { password_hash: await hashPassword(password), session_version: { increment: 1 } } });
  if (changed.count !== 1) throw new Error("Your current password is incorrect.");
}

export function isDuplicateAccount(error: unknown) { return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"; }
