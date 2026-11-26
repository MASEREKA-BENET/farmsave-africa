import { z } from "zod";
export type ActionResult = { ok: boolean; message: string; nextStep?: "sign-in" };
export const authSchema = z.object({ email: z.email().max(254), password: z.string().min(12, "Use at least 12 characters").max(128), full_name: z.string().max(120).optional(), account_type: z.enum(["farmer", "buyer", "transporter", "coordinator", "agricultural_partner"]).optional(), consent: z.boolean().optional() });
export const contactSchema = z.object({ name: z.string().trim().min(2).max(120), email: z.email().max(254), message: z.string().trim().min(10).max(3000), website: z.string().max(0, "Please leave this field blank") });
export function friendlyError(error: { message: string; code?: string }): string {
  if (error.code === "23505") return "This record already exists. Update the existing record instead.";
  if (error.code === "23503") return "A linked record is unavailable. Refresh the page and try again.";
  if (error.code === "23514" || error.code === "23502" || error.code === "22P02") return "Please check the values and required fields.";
  if (error.code === "42501") return "Your account does not have permission to perform this action.";
  if (error.code === "P0001") return error.message;
  return "The request could not be completed. Please try again.";
}
