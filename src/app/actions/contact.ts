"use server";
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { contactSchema, friendlyError, type ActionResult } from "@/lib/validation";
import { databaseConfigured } from "@/lib/db/prisma";
import { actorTransaction, callFunction, databaseError } from "@/lib/db/context";
export async function contact(input: unknown): Promise<ActionResult> {
  const p = contactSchema.safeParse(input);
  if (!p.success) return { ok: false, message: "Please enter your name, a valid email and a message of 10–3,000 characters." };
  if (!databaseConfigured()) return { ok: false, message: "Contact submissions will open when the pilot’s database is connected. Please try again later." };
  const h = await headers();
  const bucket = createHash("sha256").update(h.get("x-forwarded-for")?.split(",")[0].trim() ?? "shared").digest("hex");
  try {
    await actorTransaction(null, db => callFunction(db,"submit_contact",{p_name:p.data.name,p_email:p.data.email,p_message:p.data.message,p_bucket:bucket}));
    return {ok:true,message:"Thank you. Your message has been saved for the FarmSave team to review."};
  } catch(error) { return {ok:false,message:friendlyError(databaseError(error))}; }
}
