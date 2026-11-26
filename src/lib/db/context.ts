import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";

export type DatabaseTransaction = Prisma.TransactionClient;

// SET LOCAL and actor identity live only inside this transaction, including with pooled Neon connections.
export function actorTransaction<T>(userId: string | null, operation: (db: DatabaseTransaction) => Promise<T>) {
  return prisma().$transaction(async db => {
    await db.$executeRawUnsafe(userId ? "SET LOCAL ROLE farmsave_authenticated" : "SET LOCAL ROLE farmsave_anonymous");
    await db.$queryRaw`SELECT set_config('farmsave.user_id', ${userId ?? ""}, true)`;
    return operation(db);
  }, { maxWait: 10000, timeout: 30000 });
}

const functions: Record<string, readonly (readonly [string, string])[]> = {
  save_record: [["kind", "text"], ["p", "jsonb"]],
  enroll_account: [["requested", "text"]],
  update_profile: [["p_name", "text"], ["p_phone", "text"]],
  submit_offer: [["listing", "uuid"], ["qty", "numeric"], ["price", "numeric"], ["note", "text"]],
  decide_offer: [["offer", "uuid"], ["accept", "boolean"]],
  transition_order: [["order_id", "uuid"], ["target", "text"], ["actual_price", "numeric"]],
  quote_transport: [["request", "uuid"], ["charge", "numeric"], ["note", "text"]],
  assign_transport: [["quote", "uuid"]],
  transition_delivery: [["delivery", "uuid"], ["target", "text"], ["charge", "numeric"]],
  manage_record: [["kind", "text"], ["record_id", "uuid"], ["command", "text"], ["value", "text"]],
  delete_empty_record: [["kind", "text"], ["record_id", "uuid"]],
  resolve_dispute: [["order_ref", "uuid"], ["resolution", "text"], ["reason", "text"]],
  convert_crop_quantity: [["crop", "uuid"], ["quantity", "numeric"], ["source_unit", "text"], ["target_unit", "text"]],
  harvest_reminders: [],
  submit_contact: [["p_name", "text"], ["p_email", "text"], ["p_message", "text"], ["p_bucket", "text"]]
};

export async function callFunction(db: DatabaseTransaction, name: string, parameters: Record<string, unknown> = {}) {
  if (!Object.hasOwn(functions, name)) throw new Error("Unsupported database operation.");
  const args = functions[name].map(([key, type]) => {
    const value = type === "jsonb" ? JSON.stringify(parameters[key]) : parameters[key] ?? null;
    return Prisma.sql`${value}::${Prisma.raw(type)}`;
  });
  // Both SQL identifiers and casts come exclusively from the server's static allowlist above.
  const result = await db.$queryRaw<{ result: string | null }[]>(Prisma.sql`SELECT ${Prisma.raw(`public.${name}`)}(${args.length ? Prisma.join(args) : Prisma.empty})::text AS result`);
  return result[0]?.result;
}

export function executeCommand(userId: string, name: string, parameters: Record<string, unknown>) {
  return actorTransaction(userId, db => callFunction(db, name, parameters));
}

export async function aggregate<T>(userId: string | null, name: "workspace_summary" | "impact_report" | "public_impact" | "public_contact_info", parameters: Record<string, unknown> = {}) {
  return actorTransaction(userId, async db => {
    const args = name === "impact_report" ? Prisma.sql`${JSON.stringify(parameters)}::jsonb` : Prisma.empty;
    const result = await db.$queryRaw<{ result: T }[]>(Prisma.sql`SELECT ${Prisma.raw(`public.${name}`)}(${args}) AS result`);
    return result[0].result;
  });
}

export function databaseError(error: unknown): { message: string; code?: string } {
  if (error && typeof error === "object" && "code" in error) {
    const e = error as { code: string; message?: string; meta?: { code?: string; message?: string; driverAdapterError?: { cause?: { originalCode?: string; originalMessage?: string } } } };
    if (e.code === "P2002") return { code: "23505", message: "Duplicate record" };
    if (e.code === "P2003") return { code: "23503", message: "Linked record" };
    const cause = e.meta?.driverAdapterError?.cause;
    return { code: e.meta?.code ?? cause?.originalCode ?? e.code, message: e.meta?.message ?? cause?.originalMessage ?? "Database operation failed" };
  }
  return { message: "The request could not be completed." };
}
