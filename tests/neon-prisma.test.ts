import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { createServer, LogLevel } from "pglite-server";
import { readFile } from "node:fs/promises";
import type { Server } from "node:net";
import { randomBytes } from "node:crypto";
import { hash as bcryptHash } from "bcryptjs";
import { prisma } from "../src/lib/db/prisma";
import { actorTransaction, executeCommand, aggregate, databaseError, callFunction } from "../src/lib/db/context";
import { resources } from "../src/lib/resources";
import { sectionFor } from "../src/lib/navigation";
import { queryTable, pagedTable } from "../src/lib/db/queries";
import { registerAccount, checkCredentials, resetPasswordWithToken, verifyEmailToken, tokenHash, changePassword } from "../src/lib/accounts";
import { hashPassword, verifyPassword } from "../src/lib/passwords";
import { beginUpload } from "../src/lib/storage";
import { detectFileType } from "../src/lib/file-validation";

let postgres: PGlite; let server: Server;
const users: Record<string, string> = {};
const password = "Development-only-password-2026";
const district = "10000000-0000-0000-0000-000000000003";
const crop = "30000000-0000-0000-0000-000000000001";
let farmer: string, farm: string, planting: string, harvest: string, listing: string, offer: string, order: string, delivery: string;
const save = async (role: string, kind: string, p: Record<string, unknown>) => (await executeCommand(users[role], "save_record", { kind, p }))!;
const command = (role: string, name: string, p: Record<string, unknown>) => executeCommand(users[role], name, p);

beforeAll(async () => {
  postgres = new PGlite();
  await postgres.exec(await readFile("prisma/migrations/202611050100_neon_backend/migration.sql", "utf8"));
  await postgres.exec(await readFile("prisma/migrations/202611260001_agricultural_partner_enum/migration.sql", "utf8"));
  await postgres.exec(await readFile("prisma/migrations/202611260002_agricultural_partner_auth/migration.sql", "utf8"));
  await postgres.exec(await readFile("prisma/seed.sql", "utf8"));
  server = createServer(postgres, { logLevel: LogLevel.Error });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); if (!address || typeof address === "string") throw new Error("Missing test database port");
  process.env.DATABASE_URL = `postgresql://postgres:postgres@127.0.0.1:${address.port}/postgres?sslmode=disable`;
  process.env.DATABASE_POOL_MAX = "1";
  process.env.AUTH_REQUIRE_EMAIL_VERIFICATION = "false";
  for (const role of ["farmer", "buyer", "transporter", "coordinator", "agricultural_partner", "other"]) {
    const account = await registerAccount({ email: `${role}@prisma.example.test`, password, full_name: `Test ${role}`, account_type: role === "other" ? "farmer" : role });
    users[role] = account.id;
  }
  const administrator = await prisma().app_users.create({ data: { email: "admin@prisma.example.test", email_verified_at: new Date(), password_hash: await hashPassword(password) } });
  users.admin = administrator.id;
  await prisma().profiles.create({ data: { id: administrator.id, full_name: "Test administrator" } });
  await prisma().user_roles.create({ data: { user_id: administrator.id, role: "admin" } });
  await command("admin", "manage_record", { kind: "profiles", record_id: users.coordinator, command: "role", value: "coordinator" });
  await save("admin", "coordinator_areas", { coordinator_id: users.coordinator, district_id: district });
});
afterAll(async () => { await prisma().$disconnect(); server?.close(); await postgres?.close(); delete (globalThis as { farmsavePrisma?: unknown }).farmsavePrisma; });

describe("Neon schema through Prisma's PostgreSQL adapter", () => {
  it("registers real accounts with hashes and denies public admin enrollment", async () => {
    const user = await prisma().app_users.findUniqueOrThrow({ where: { id: users.farmer } });
    expect(user.password_hash).not.toBe(password);
    expect(await verifyPassword(password, user.password_hash)).toBe(true);
    expect(await checkCredentials(" FARMER@PRISMA.EXAMPLE.TEST ", password)).toMatchObject({ id: users.farmer });
    expect(await checkCredentials("farmer@prisma.example.test", "incorrect-password")).toBeNull();
    await expect(registerAccount({ email: "injected@prisma.example.test", password, full_name: "Injected role", account_type: "admin" })).rejects.toThrow("Invalid account type");
    await expect(registerAccount({ email: "farmer@prisma.example.test", password, full_name: "Duplicate farmer", account_type: "farmer" })).rejects.toMatchObject({ code: "P2002" });
  });
  it("preserves imported bcrypt credentials and upgrades them at successful login", async () => {
    const old = await bcryptHash(password, 10);
    await prisma().app_users.update({ where: { id: users.other }, data: { password_hash: old } });
    expect(await checkCredentials("other@prisma.example.test", password)).toMatchObject({ id: users.other });
    expect((await prisma().app_users.findUniqueOrThrow({ where: { id: users.other } })).password_hash).toMatch(/^scrypt-/);
    expect(await verifyPassword("x".repeat(73), old)).toBe(false);
  });
  it("creates a farm, planting, editable plan and actual inventory through Prisma transactions", async () => {
    farmer = await save("farmer", "farmer_profiles", { full_name: "Prisma farmer", district_id: district, locality: "Kasese area", consent: true });
    farm = await save("farmer", "farms", { farmer_id: farmer, name: "Prisma test farm", district_id: district, locality: "Kasese", size_acres: 2 });
    planting = await save("farmer", "farm_crops", { farm_id: farm, crop_id: crop, planted_on: "2026-10-01", area_acres: 1 });
    harvest = await save("farmer", "harvests", { farm_crop_id: planting, expected_date: "2026-11-01", expected_quantity: 100, unit: "kg" });
    await save("farmer", "harvests", { id: harvest, farm_crop_id: planting, expected_date: "2026-11-02", expected_quantity: 100, unit: "kg" });
    await save("farmer", "actual_harvest", { harvest_id: harvest, quantity: 100, harvested_on: "2026-11-02", quality: "Grade A", reason: "Verified weight" });
    listing = await save("farmer", "produce_listings", { harvest_id: harvest, quantity: 100, price: 2000, available_on: "2026-11-02" });
    const rows = await queryTable(users.farmer, "harvests"); expect(rows[0].available_quantity).toBe("100"); expect(rows[0].expected_date).toBe("2026-11-02");
  });
  it("enforces ownership, allowlists and pooled RLS context without actor leakage", async () => {
    expect(await queryTable(users.buyer, "farms")).toHaveLength(0);
    expect(await queryTable(users.other, "farmer_profiles")).toHaveLength(0);
    await expect(save("other", "actual_harvest", { harvest_id: harvest, quantity: 200, harvested_on: "2026-11-02", quality: "A", reason: "Unauthorized" })).rejects.toThrow();
    await expect(queryTable(users.farmer, "app_users")).rejects.toThrow("Unsupported resource");
    await expect(executeCommand(users.farmer, "__proto__", {})).rejects.toThrow("Unsupported");
    const owner = await prisma().$queryRaw<{ actor: string | null; role: string }[]>`select current_actor()::text as actor,current_user as role`;
    expect(owner[0].actor || "").toBe(""); expect(owner[0].role).toBe("postgres");
    await expect(actorTransaction(users.farmer, db => db.harvests.update({ where: { id: harvest }, data: { total_quantity: 9999 } }))).rejects.toThrow();
  });
  it("runs marketplace relational filters through Prisma", async () => {
    const result = await pagedTable(users.buyer, "produce_listings", { where: { status: "active", crops: { is: { name: { contains: "tom", mode: "insensitive" } } }, districts: { is: { regions: { is: { country_id: "10000000-0000-0000-0000-000000000001" } } } } }, take: 20 });
    expect(result.count).toBe(1); expect(result.rows[0].id).toBe(listing);
  });
  it("registers agricultural partners with read-only public marketplace access", async () => {
    expect(sectionFor("agricultural_partner", "marketplace")?.write).toEqual([]);
    expect(sectionFor("agricultural_partner", "users")).toBeNull();
    expect(await prisma().user_roles.findUniqueOrThrow({ where: { user_id: users.agricultural_partner } })).toMatchObject({ role: "agricultural_partner" });
    expect(await queryTable(users.agricultural_partner, "produce_listings")).toHaveLength(1);
    expect(await queryTable(users.agricultural_partner, "farms")).toHaveLength(0);
    await expect(save("agricultural_partner", "farmer_profiles", { full_name: "Unauthorized farmer", district_id: district, locality: "Kasese area", consent: true })).rejects.toThrow();
    await expect(command("agricultural_partner", "set_user_role", { user_ref: users.agricultural_partner, role_name: "admin" })).rejects.toThrow();
    await command("admin", "set_user_role", { user_ref: users.other, role_name: "agricultural_partner" });
    expect(await prisma().user_roles.findUniqueOrThrow({ where: { user_id: users.other } })).toMatchObject({ role: "agricultural_partner", approved_by: users.admin });
    await expect(command("admin", "set_user_role", { user_ref: users.admin, role_name: "farmer" })).rejects.toThrow("own role");
  });
  it("supports zero-argument reminders and every resource-table query used by the workspaces",async()=>{
    await actorTransaction(users.farmer,db=>callFunction(db,"harvest_reminders"));
    for(const [name,resource] of Object.entries(resources))if(resource.columns.length)expect(Array.isArray(await queryTable(users.admin,name,{take:1}))).toBe(true);
    for(const role of ["farmer","buyer","transporter","coordinator","agricultural_partner","admin"])expect(await aggregate(users[role],"workspace_summary")).toBeTruthy();
  });
  it("reserves partial orders, rejects competing allocations and protects available balance", async () => {
    offer = (await command("buyer", "submit_offer", { listing, qty: 60, price: 1800, note: "Collect" }))!;
    const competing = await command("buyer", "submit_offer", { listing, qty: 60, price: 1900, note: "Competing" });
    order = (await command("farmer", "decide_offer", { offer, accept: true }))!;
    await expect(command("farmer", "decide_offer", { offer: competing, accept: true })).rejects.toThrow();
    await expect(save("farmer", "loss_records", { harvest_id: harvest, quantity: 41, loss_date: "2026-11-02", stage: "storage", cause: "Spoilage" })).rejects.toThrow();
    const balance = await prisma().harvests.findUniqueOrThrow({ where: { id: harvest } }); expect(Number(balance.reserved_quantity)).toBe(60); expect(Number(balance.available_quantity)).toBe(40);
    expect(await prisma().sales.count()).toBe(0);
    await command("buyer", "transition_order", { order_id: order, target: "confirm_purchase", actual_price: null });
  });
  it("coordinates verified quotations, assignment, pickup, delivery and actual transport cost", async () => {
    const request = await save("farmer", "transport_requests", { farmer_id: farmer, harvest_id: harvest, order_id: order, destination_district_id: district, destination_area: "Collection point", quantity: 60, collection_date: "2026-11-02" });
    const transport = await save("transporter", "transport_profiles", { vehicle_description: "Pickup", registration_number: "PRISMA-TEST", capacity: 1000, capacity_unit: "kg", service_districts: [district] });
    await expect(command("transporter", "quote_transport", { request, charge: 20000, note: "" })).rejects.toThrow();
    await command("admin", "manage_record", { kind: "transport_profiles", record_id: transport, command: "verify", value: "" });
    const quote = await command("transporter", "quote_transport", { request, charge: 20000, note: "Collection 8am" });
    delivery = (await command("farmer", "assign_transport", { quote }))!;
    await command("transporter", "transition_delivery", { delivery, target: "picked_up", charge: null });
    await command("transporter", "transition_delivery", { delivery, target: "delivered", charge: 18000 });
    await command("farmer", "transition_delivery", { delivery, target: "confirm_delivery", charge: null });
    await expect(command("farmer", "transition_delivery", { delivery, target: "confirm_delivery", charge: null })).rejects.toThrow();
  });
  it("records actual sales, losses and expenses and reports accurate net proceeds", async () => {
    for (const target of ["preparing", "ready_for_collection", "completed"]) await command("farmer", "transition_order", { order_id: order, target, actual_price: target === "completed" ? 1750 : null });
    await save("farmer", "loss_records", { harvest_id: harvest, quantity: 5, loss_date: "2026-11-02", stage: "storage", cause: "Spoilage" });
    await save("farmer", "expenses", { farmer_id: farmer, harvest_id: harvest, category: "packaging", amount: 5000, description: "Crate hire", expense_date: "2026-11-02" });
    const summary = await aggregate<{ revenue: number; costs: number; quantities: { available: number }[] }>(users.farmer, "workspace_summary");
    expect(summary.revenue).toBe(105000); expect(summary.costs).toBe(23000); expect(Number(summary.quantities[0].available)).toBe(35);
    expect(await queryTable(users.buyer, "expenses")).toHaveLength(0);
  });
  it("supports assisted enrollment, baseline/follow-up comparison, training and audit history", async () => {
    const assisted = await save("coordinator", "farmer_profiles", { full_name: "Assisted Prisma farmer", district_id: district, locality: "Pilot area", consent: true });
    const p = { farmer_id: assisted, crop_id: crop, typical_quantity: 100, loss_quantity: 20, unit: "kg", handling: "Manual sorting", storage: "Shade", transport: "Hired vehicle", buyer_access: "Local market", reported_sales: 100000, reported_costs: 20000, challenges: "Packaging", training_needs: "Storage", survey_date: "2026-10-01", period_days: 30, pilot_phase: "pilot", source: "farmer_reported" };
    await save("coordinator", "baseline_surveys", p); await save("coordinator", "followup_surveys", { ...p, loss_quantity: 10, survey_date: "2026-11-01" });
    const training = await save("coordinator", "training_sessions", { title: "Handling", district_id: district, crop_id: crop, venue: "Community venue", scheduled_at: "2026-11-01T09:00:00Z", capacity: 20 });
    await save("coordinator", "training_attendance", { session_id: training, farmer_id: assisted, attended: true });
    await save("coordinator", "field_reports", { farmer_id: assisted, observation: "Requested storage training", report_date: "2026-11-01" });
    const report = await aggregate<{ trained: number; comparisons: { relative_reduction: number; verified: boolean }[] }>(users.admin, "impact_report");
    expect(report.trained).toBe(1); expect(report.comparisons[0].relative_reduction).toBe(50); expect(report.comparisons[0].verified).toBe(false);
    expect((await queryTable(users.admin, "audit_logs")).length).toBeGreaterThan(20);
    expect((await prisma().farmer_profiles.findUniqueOrThrow({ where: { id: assisted } })).user_id).toBeNull();
  });
  it("enforces one-use verification and password reset tokens and revokes previous sessions", async () => {
    process.env.AUTH_REQUIRE_EMAIL_VERIFICATION = "true";
    const user = await registerAccount({ email: "verification@prisma.example.test", password, full_name: "Verification farmer", account_type: "farmer" });
    expect(await checkCredentials("verification@prisma.example.test", password)).toBeNull();
    const verification = randomBytes(32).toString("base64url");
    await prisma().account_tokens.create({ data: { user_id: user.id, token_hash: tokenHash(verification), kind: "verify", expires_at: new Date(Date.now() + 60000) } });
    await verifyEmailToken(verification); await expect(verifyEmailToken(verification)).rejects.toThrow("expired");
    const reset = randomBytes(32).toString("base64url");
    await prisma().account_tokens.create({ data: { user_id: user.id, token_hash: tokenHash(reset), kind: "reset", expires_at: new Date(Date.now() + 60000) } });
    await resetPasswordWithToken(reset, "Changed-password-2026"); await expect(resetPasswordWithToken(reset, password)).rejects.toThrow("expired");
    expect(await checkCredentials("verification@prisma.example.test", password)).toBeNull();
    expect(await checkCredentials("verification@prisma.example.test", "Changed-password-2026")).toMatchObject({ sessionVersion: 1 });
    await expect(changePassword(user.id, password, "Another-password-2026")).rejects.toThrow("incorrect");
  });
  it("restricts signed uploads to the owner, verifies file signatures and never exposes bucket secrets", async () => {
    Object.assign(process.env, { S3_BUCKET: "test-private", S3_REGION: "us-east-1", S3_ACCESS_KEY_ID: "test-access-key", S3_SECRET_ACCESS_KEY: "test-secret-key", S3_ENDPOINT: "https://storage.example.test", S3_FORCE_PATH_STYLE: "true" });
    const file = await beginUpload(users.farmer, { filename: "private.pdf", mime: "application/pdf", size: 100, purpose: "document" });
    expect(file.url).toContain("X-Amz-Signature="); expect(file.url).not.toContain("test-secret-key");
    const privateRows = await actorTransaction(users.buyer, db => db.stored_files.findMany()); expect(privateRows).toHaveLength(0);
    await expect(beginUpload(users.buyer, { filename: "crop.png", mime: "image/png", size: 100, purpose: "crop_image", listingId: listing })).rejects.toThrow();
    expect(detectFileType(new TextEncoder().encode("<svg onload=evil>"))).toBeNull(); expect(detectFileType(new TextEncoder().encode("%PDF-test"))).toBe("application/pdf");
    const record = await prisma().stored_files.findUniqueOrThrow({ where: { id: file.id } }); expect(record.state).toBe("pending");
  });
  it("keeps constraints, account suspension and domain error translation effective", async () => {
    await expect(save("farmer", "actual_harvest", { harvest_id: harvest, quantity: "NaN", harvested_on: "2026-11-02", quality: "A", reason: "Invalid request" })).rejects.toThrow();
    await command("admin", "manage_record", { kind: "profiles", record_id: users.buyer, command: "status", value: "suspended" });
    expect(await checkCredentials("buyer@prisma.example.test", password)).toBeNull(); expect(await queryTable(users.buyer, "orders")).toHaveLength(0);
    await expect(command("farmer", "submit_offer", { listing, qty: 1, price: 1000, note: "" })).rejects.toThrow("Buyer account required");
    // This development wire server omits PostgreSQL SQLSTATE; exercise the production adapter shape explicitly.
    expect(databaseError({code:"P2010",meta:{code:"P0001",message:"Buyer account required"}})).toEqual({code:"P0001",message:"Buyer account required"});
  });
});
