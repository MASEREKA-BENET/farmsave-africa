// Test-only PostgreSQL wire server. The deployed application always uses configured PostgreSQL/Neon.
import { PGlite } from "@electric-sql/pglite";
import { createServer, LogLevel } from "pglite-server";
import { readFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { seedNeon } from "./seed-neon.mjs";
const db = new PGlite();
await db.exec(await readFile("prisma/migrations/202611050100_neon_backend/migration.sql", "utf8"));
const server = createServer(db, { logLevel: LogLevel.Error });
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
Object.assign(process.env, { DATABASE_URL: `postgresql://postgres:postgres@127.0.0.1:${address.port}/postgres?sslmode=disable`, DATABASE_POOL_MAX: "1", AUTH_SECRET: randomBytes(48).toString("base64url"), AUTH_URL: "http://127.0.0.1:3107", NEXTAUTH_URL: "http://127.0.0.1:3107", NEXT_PUBLIC_SITE_URL: "http://127.0.0.1:3107", AUTH_REQUIRE_EMAIL_VERIFICATION: "false", FARMSAVE_DEV_SEED: "true", E2E_LIVE: "true", SEED_PASSWORD: randomBytes(24).toString("base64url"), RESEND_API_KEY: "", EMAIL_FROM: "" });
try {
  await seedNeon();
  console.info("Starting real Auth.js/Prisma browser workflows against an isolated local PostgreSQL engine. Test credentials are not printed.");
  const child = spawn(process.execPath, ["node_modules/@playwright/test/cli.js", "test", ...process.argv.slice(2)], { env: process.env, stdio: "inherit" });
  process.exitCode = await new Promise(resolve => child.on("exit", code => resolve(code ?? 1)));
} finally { server.close(); await db.close(); }
