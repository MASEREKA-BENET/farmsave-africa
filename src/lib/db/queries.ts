import "server-only";
import { resources, type DataRow } from "@/lib/resources";
import { actorTransaction, type DatabaseTransaction } from "@/lib/db/context";

type ReadOptions = { where?: Record<string, unknown>; orderBy?: Record<string, "asc" | "desc">; take?: number; skip?: number };
type ResourceDelegate = { findMany: (options: ReadOptions) => Promise<unknown[]>; count: (options: { where?: Record<string, unknown> }) => Promise<number> };

function delegate(db: DatabaseTransaction, table: string) {
  if (!Object.hasOwn(resources, table) || !Object.hasOwn(db, table)) throw new Error("Unsupported resource.");
  return (db as unknown as Record<string, ResourceDelegate>)[table];
}

function serialize(value: unknown, key = ""): unknown {
  if (value instanceof Date) return key.endsWith("_at") ? value.toISOString() : value.toISOString().slice(0, 10);
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(v => serialize(v));
  if (value && typeof value === "object") {
    if ("toFixed" in value && typeof value.toFixed === "function") return String(value);
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, serialize(v, k)]));
  }
  return value;
}

export async function queryTable(userId: string, table: string, options: ReadOptions = {}) {
  return actorTransaction(userId, async db => {
    const model = delegate(db, table);
    const rows = await model.findMany({ take: 1000, ...options });
    return rows.map(row => serialize(row)) as DataRow[];
  });
}

export async function pagedTable(userId: string, table: string, options: ReadOptions) {
  return actorTransaction(userId, async db => {
    const model = delegate(db, table);
    const rows = await model.findMany(options);
    const count = await model.count({ where: options.where });
    const serialized = rows.map(row => serialize(row)) as DataRow[];
    if (table === "produce_listings" && serialized.length) {
      const files = await db.stored_files.findMany({ where: { listing_id: { in: serialized.map(row => row.id) }, purpose: "crop_image", state: "ready" }, select: { listing_id: true } });
      const available = new Set(files.map(file => file.listing_id));
      for (const row of serialized) row.has_photo = available.has(row.id);
    }
    return { rows: serialized, count };
  });
}
