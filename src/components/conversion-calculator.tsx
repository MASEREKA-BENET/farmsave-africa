"use client";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { command } from "@/app/actions/records";
import type { DataSet } from "@/lib/resources";
import type { ActionResult } from "@/lib/validation";
import { Button } from "@/components/ui/button";
export function ConversionCalculator({data}:{data:DataSet}) {
 const {register,handleSubmit,formState:{isSubmitting}}=useForm<{crop:string;quantity:string;source_unit:string;target_unit:string}>();const[result,setResult]=useState<ActionResult>();
 return <details className="card"><summary className="cursor-pointer text-sm font-bold">Reviewed crop-unit conversion calculator</summary><p className="mb-5 mt-3 text-sm text-muted-foreground">Check a configured, professionally reviewed factor. Inventory and offers always remain in the original harvest unit.</p><form className="space-y-4" onSubmit={handleSubmit(async p=>{try{setResult(await command("convert_crop_quantity",p));}catch{setResult({ok:false,message:"Unable to calculate. Please try again."});}})}><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><label>Crop<select required {...register("crop")}><option value="">Choose crop</option>{data.crops?.map(c=><option key={c.id} value={c.id}>{String(c.name)}</option>)}</select></label><label>Quantity<input type="number" step="any" min="0" required {...register("quantity")}/></label><label>From unit<input required placeholder="e.g. crate" {...register("source_unit")}/></label><label>To unit<input required placeholder="e.g. kg" {...register("target_unit")}/></label></div><Button disabled={isSubmitting} variant="outline">Calculate using reviewed factor</Button>{result&&<p role="status" className={`text-sm ${result.ok?"text-primary":"text-destructive"}`}>{result.message}</p>}</form></details>;
}
