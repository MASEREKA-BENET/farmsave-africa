import "server-only";
import type { NextAuthOptions } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import { authConfigured } from "@/lib/db/prisma";
import { checkCredentials } from "@/lib/accounts";
import { safeNext } from "@/lib/utils";
if (process.env.AUTH_URL && !process.env.NEXTAUTH_URL) process.env.NEXTAUTH_URL = process.env.AUTH_URL;

export const authOptions: NextAuthOptions = {
  secret: process.env.AUTH_SECRET,
  session: { strategy: "jwt", maxAge: 8 * 3600 },
  jwt: { maxAge: 8 * 3600 },
  pages: { signIn: "/login", error: "/login" },
  providers: [Credentials({
    name: "FarmSave Africa",
    credentials: { email: { label: "Email", type: "email" }, password: { label: "Password", type: "password" } },
    async authorize(credentials, request) {
      if (!authConfigured()) return null;
      const parsed = z.object({ email: z.email().max(254), password: z.string().min(12).max(128) }).safeParse(credentials);
      if (!parsed.success) return null;
      try {
        const ip = String(request.headers?.["x-forwarded-for"] || "unknown").split(",")[0].trim();
        return await checkCredentials(parsed.data.email, parsed.data.password, ip);
      } catch { return null; }
    }
  })],
  callbacks: {
    async jwt({ token, user }) {
      if (user) { token.sub = user.id; token.sessionVersion = user.sessionVersion; }
      return token;
    },
    async session({ session, token }) {
      if (session.user) { session.user.id = token.sub ?? ""; session.user.sessionVersion = Number(token.sessionVersion ?? -1); }
      return session;
    },
    async redirect({ url, baseUrl }) {
      try {
        const target = new URL(url, baseUrl);
        return target.origin === new URL(baseUrl).origin ? new URL(safeNext(target.pathname), baseUrl).toString() : `${baseUrl}/workspace`;
      } catch { return `${baseUrl}/workspace`; }
    }
  },
  logger: {
    error(code) { console.error(`Authentication failure: ${code}`); },
    warn(code) { console.warn(`Authentication configuration: ${code}`); },
    debug() { /* Never log credentials, JWTs or provider metadata. */ }
  }
};
