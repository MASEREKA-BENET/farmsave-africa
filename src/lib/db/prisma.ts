import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const globalDatabase = globalThis as unknown as { farmsavePrisma?: PrismaClient };

export function databaseConfigured() { return Boolean(process.env.DATABASE_URL?.trim()); }
export function authSecretConfigured() { return (process.env.AUTH_SECRET?.trim().length ?? 0) >= 32; }
export function authConfigured() { return databaseConfigured() && authSecretConfigured(); }
export function authConfigurationMessage() {
  const missing = [!databaseConfigured() && "DATABASE_URL", !authSecretConfigured() && "AUTH_SECRET (at least 32 random characters)"].filter(Boolean);
  return `Authentication is unavailable. Configure ${missing.join(" and ")} in the Vercel environment variables.`;
}

export function prisma() {
  if (!databaseConfigured()) throw new Error("Connect Neon using DATABASE_URL before using this feature.");
  if (!globalDatabase.farmsavePrisma) {
    const adapter = new PrismaPg({
      connectionString: process.env.DATABASE_URL,
      max: Number(process.env.DATABASE_POOL_MAX || 5),
      connectionTimeoutMillis: 10000,
      idleTimeoutMillis: 10000
    });
    globalDatabase.farmsavePrisma = new PrismaClient({ adapter });
  }
  return globalDatabase.farmsavePrisma;
}
