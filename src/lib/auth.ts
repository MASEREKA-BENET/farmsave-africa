import "server-only";
import { getServerSession } from "next-auth";
import { cache } from "react";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth-options";
import { authConfigured, prisma } from "@/lib/db/prisma";

export const roles = ["farmer", "buyer", "transporter", "coordinator", "admin"] as const;
export type Role = typeof roles[number];

export const identity = cache(async () => {
  if (!authConfigured()) return null;
  const signed = await getServerSession(authOptions);
  if (!signed?.user?.id) return null;
  // JWT roles are never trusted. Account status, session version and role are re-read on every request.
  const account = await prisma().app_users.findUnique({ where: { id: signed.user.id }, include: { profiles: { include: { user_roles_user_roles_user_idToprofiles: true } } } });
  if (!account || account.session_version !== signed.user.sessionVersion) return null;
  const profile = account.profiles;
  const assigned = profile?.user_roles_user_roles_user_idToprofiles?.role;
  const role = roles.find(value => value === assigned);
  return { user: { id: account.id, email: account.email }, profile, role };
});

export const session = cache(async () => {
  if (!authConfigured()) redirect("/setup");
  const current = await identity();
  if (!current) redirect("/login");
  if (!current.profile || current.profile.status !== "active" || !current.role) redirect("/account-status");
  return { user: current.user, profile: current.profile, role: current.role, roles: [current.role] };
});
