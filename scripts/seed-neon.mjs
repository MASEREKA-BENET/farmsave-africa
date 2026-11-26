import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.ts";
import { readFile } from "node:fs/promises";
import { hashPassword } from "../src/lib/passwords.ts";

export async function seedNeon({ referenceOnly = false } = {}) {
  if (!process.env.DATABASE_URL) throw new Error("Configure DATABASE_URL before seeding Neon.");
  if (!referenceOnly && (process.env.FARMSAVE_DEV_SEED !== "true" || process.env.NODE_ENV === "production")) throw new Error("Development accounts require FARMSAVE_DEV_SEED=true in a separate development project.");
  if (!referenceOnly && (process.env.SEED_PASSWORD?.length ?? 0) < 12) throw new Error("Set SEED_PASSWORD to a private development password of at least 12 characters.");
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, max: 1 }) });
  try {
    const reference = await readFile("prisma/seed.sql", "utf8");
    for (const statement of reference.split(";").map(value => value.trim()).filter(Boolean)) await db.$executeRawUnsafe(statement);
    if (referenceOnly) return;
    const password_hash = await hashPassword(process.env.SEED_PASSWORD);
    const accounts = {};
    for (const role of ["farmer", "buyer", "transporter", "coordinator", "agricultural_partner", "admin"]) {
      const email = `${role}@farmsave.example.test`;
      const user = await db.app_users.upsert({ where: { email }, create: { email, password_hash, email_verified_at: new Date() }, update: { password_hash, email_verified_at: new Date(), session_version: { increment: 1 } } });
      accounts[role] = user;
      await db.profiles.upsert({ where: { id: user.id }, create: { id: user.id, full_name: `Development ${role}` }, update: { status: "active" } });
      await db.user_roles.upsert({ where: { user_id: user.id }, create: { user_id: user.id, role }, update: { role } });
    }
    const district = "10000000-0000-0000-0000-000000000003";
    await db.coordinator_areas.upsert({ where: { coordinator_id_district_id: { coordinator_id: accounts.coordinator.id, district_id: district } }, create: { coordinator_id: accounts.coordinator.id, district_id: district }, update: {} });
    const farmer = await db.farmer_profiles.findUnique({ where: { user_id: accounts.farmer.id } });
    if (!farmer) await db.farmer_profiles.create({ data: { user_id: accounts.farmer.id, full_name: "Development farmer", district_id: district, locality: "Development example area", consent_at: new Date(), created_by: accounts.farmer.id } });
  } finally { await db.$disconnect(); }
}

if (process.argv[1]?.replaceAll("\\", "/").endsWith("scripts/seed-neon.mjs")) {
  try {
    await seedNeon({ referenceOnly: process.argv.includes("--reference-only") });
     console.info(process.argv.includes("--reference-only") ? "Reference catalogue ready; no example accounts created." : "Neon development accounts ready: farmer, buyer, transporter, coordinator, agricultural_partner, admin @farmsave.example.test. Password is your configured SEED_PASSWORD.");
  } catch { console.error("Seeding could not complete. Check DATABASE_URL, applied migrations and the development seed/password settings."); process.exitCode = 1; }
}
