"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { session } from "@/lib/auth";
import { resourceSchema } from "@/lib/resources";
import { canWrite } from "@/lib/navigation";
import { friendlyError, type ActionResult } from "@/lib/validation";
import { databaseError, executeCommand } from "@/lib/db/context";
export async function saveRecord(kind:string,input:unknown):Promise<ActionResult> {
  const {user,role}=await session();
  if(!canWrite(role,kind)) return {ok:false,message:"Your workspace does not allow this action."};
  const p=resourceSchema(kind).safeParse(input);
  if(!p.success) return {ok:false,message:p.error.issues[0].message};
  try { await executeCommand(user.id,"save_record",{kind,p:p.data}); revalidatePath("/workspace","layout"); return {ok:true,message:"Record saved successfully."}; }
  catch(error) { return {ok:false,message:friendlyError(databaseError(error))}; }
}
const commandSchemas:Record<string,z.ZodType>={
 submit_offer:z.object({listing:z.guid(),qty:z.coerce.number().positive(),price:z.coerce.number().positive(),note:z.string().max(1000).default("")}),
 decide_offer:z.object({offer:z.guid(),accept:z.boolean()}),
 transition_order:z.object({order_id:z.guid(),target:z.enum(["confirm_purchase","preparing","ready_for_collection","completed","cancelled","disputed"]),actual_price:z.coerce.number().positive().nullable().default(null)}),
 quote_transport:z.object({request:z.guid(),charge:z.coerce.number().positive(),note:z.string().max(1000).default("")}),
 assign_transport:z.object({quote:z.guid()}),
  transition_delivery:z.object({delivery:z.guid(),target:z.enum(["picked_up","delivered","confirm_delivery","cancelled","disputed"]),charge:z.coerce.number().nonnegative().nullable().default(null)}),
  manage_record:z.object({kind:z.string().max(50),record_id:z.guid(),command:z.string().max(50),value:z.string().max(3000).default("")}),
  set_user_role:z.object({user_ref:z.guid(),role_name:z.enum(["farmer","buyer","transporter","coordinator","agricultural_partner","admin"])}),
 update_profile:z.object({p_name:z.string().trim().min(2).max(120),p_phone:z.string().max(30)})
 ,delete_empty_record:z.object({kind:z.string().max(50),record_id:z.guid()})
 ,resolve_dispute:z.object({order_ref:z.guid(),resolution:z.enum(["resume","returned_and_cancelled"]),reason:z.string().trim().min(10).max(3000)})
 ,convert_crop_quantity:z.object({crop:z.guid(),quantity:z.coerce.number().nonnegative(),source_unit:z.string().min(1).max(40),target_unit:z.string().min(1).max(40)})
};
export async function command(name:string,input:unknown):Promise<ActionResult> {
 const {user}=await session(); const p=Object.hasOwn(commandSchemas,name)?commandSchemas[name].safeParse(input):null;
 if(!p?.success) return {ok:false,message:"Please check the values for this action."};
 try { const data=await executeCommand(user.id,name,p.data as Record<string,unknown>); revalidatePath("/workspace","layout"); return {ok:true,message:name==="convert_crop_quantity"?`Converted quantity: ${data} ${(p.data as {target_unit:string}).target_unit}. Inventory was not changed.`:"Update saved."}; }
 catch(error) { return {ok:false,message:friendlyError(databaseError(error))}; }
}
