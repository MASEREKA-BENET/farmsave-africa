"use client";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { Plus, Pencil } from "lucide-react";
import { resources, resourceSchema, rowLabel, type DataRow, type DataSet, type Field } from "@/lib/resources";
import { saveRecord, command } from "@/app/actions/records";
import { label } from "@/lib/utils";
import { type ActionResult } from "@/lib/validation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
export function FieldInput({field:f,data,register}:{field:Field;data:DataSet;register:ReturnType<typeof useForm<Record<string,unknown>>>["register"]}) {
  const props={...register(f.name,{required:!f.optional && f.type!=="checkbox"}),required:!f.optional && f.type!=="checkbox","aria-label":f.label};
  if(f.type==="checkbox") return <label className="flex items-start gap-3 font-normal"><input type="checkbox" aria-label={f.label} className="mt-1 w-5 shrink-0" {...register(f.name)} />{f.label}</label>;
  return <label className={f.type==="textarea"?"sm:col-span-2":""}>{f.label}{f.optional&&<span className="font-normal text-muted-foreground"> (optional)</span>}
    {f.type==="textarea"?<textarea rows={3} maxLength={3000} {...props}/>: f.type==="select"||f.type==="multiselect"?<select {...props} multiple={f.type==="multiselect"} size={f.type==="multiselect"?4:undefined}>{f.type!=="multiselect"&&<option value="">Choose {f.label.toLowerCase()}</option>}{f.source?(data[f.source]??[]).map(r=><option key={r.id} value={r.id}>{rowLabel(f.source!,r,data)}</option>):f.options?.map(o=><option value={o} key={o}>{label(o)}</option>)}</select>:<input type={f.type==="number"?"number":f.type==="date"?"date":f.type==="datetime-local"?"datetime-local":"text"} min={f.min} step={f.type==="number"?"any":undefined} maxLength={f.type==="csv"?1000:254} {...props}/>}
    {f.help&&<span className="mt-1 block text-xs font-normal text-muted-foreground">{f.help}</span>}
  </label>;
}
export function RecordForm({kind,data,row}:{kind:string;data:DataSet;row?:DataRow}) {
 const r=resources[kind];const [open,setOpen]=useState(false);const [result,setResult]=useState<ActionResult>();
 const defaults:Record<string,unknown>={};
 for(const f of r.fields) { const value=row?.[f.name];defaults[f.name]=value??(f.type==="checkbox"?f.name==="active":f.type==="multiselect"?[]:f.type==="date"?new Date().toISOString().slice(0,10):f.source&&data[f.source]?.length===1?data[f.source][0].id:"");if(f.type==="csv"&&Array.isArray(value))defaults[f.name]=value.join(", "); }
 const {register,handleSubmit,reset,control,formState:{isSubmitting}}=useForm<Record<string,unknown>>({defaultValues:defaults});
 const values=useWatch({control});
 const selectedPlanting=data.farm_crops?.find(c=>c.id===values.farm_crop_id);
 const selectedCrop=data.crops?.find(c=>c.id===(values.crop_id??selectedPlanting?.crop_id));
 const formData:DataSet=values.country_id?{...data,districts:(data.districts??[]).filter(d=>data.regions?.some(r=>r.id===d.region_id&&r.country_id===values.country_id))}:data;
 const fields=r.fields.map(f=>f.name==="unit"&&["harvests","baseline_surveys","followup_surveys"].includes(kind)?{...f,type:"select" as const,options:(selectedCrop?.units??[]) as string[]}:f);
 return <Dialog open={open} onOpenChange={v=>{setOpen(v);setResult(undefined);if(v)reset(defaults);}}><DialogTrigger asChild><Button variant={row?"outline":"default"} size="sm">{row?<Pencil className="size-3.5"/>:<Plus className="size-4"/>}{row?"Edit":"Add record"}</Button></DialogTrigger><DialogContent title={row?`Edit ${r.title.toLowerCase()}`:r.title} description={r.description}><form className="space-y-5" onSubmit={handleSubmit(async raw=>{
   const values={...raw};for(const f of r.fields){if(f.type==="csv")values[f.name]=String(values[f.name]).split(",").map(s=>s.trim()).filter(Boolean);if(f.type==="datetime-local"&&values[f.name])values[f.name]=new Date(String(values[f.name])).toISOString();}if(row)values.id=row.id;
   const parsed=resourceSchema(kind).safeParse(values);if(!parsed.success){setResult({ok:false,message:parsed.error.issues.map(i=>`${label(String(i.path[0]))}: ${i.message}`).join("; ")});return;}
   try{const res=await saveRecord(kind,parsed.data);setResult(res);if(res.ok)setOpen(false);}catch{setResult({ok:false,message:"Unable to save. Check your connection and try again."});}
 })}><div className="grid gap-5 sm:grid-cols-2">{fields.map(f=><FieldInput key={f.name} field={f} data={formData} register={register}/>)}</div>{result&&<p role="status" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{result.message}</p>}<Button disabled={isSubmitting}>{isSubmitting?"Saving…":"Save record"}</Button></form></DialogContent></Dialog>;
}
export type CommandSpec={label:string;name:string;params:Record<string,unknown>;fields?:Field[];destructive?:boolean;description?:string};
export function CommandButton({spec,data={}}:{spec:CommandSpec;data?:DataSet}) {
 const [open,setOpen]=useState(false);const [result,setResult]=useState<ActionResult>();
 const {register,handleSubmit,formState:{isSubmitting}}=useForm<Record<string,unknown>>();
 return <Dialog open={open} onOpenChange={v=>{setOpen(v);setResult(undefined);}}><DialogTrigger asChild><Button variant={spec.destructive?"destructive":"outline"} size="sm">{spec.label}</Button></DialogTrigger><DialogContent title={spec.label} description={spec.description??"This action updates a real record and is checked against your permissions."}><form className="space-y-5" onSubmit={handleSubmit(async fields=>{try{const res=await command(spec.name,{...spec.params,...fields});setResult(res);if(res.ok)setOpen(false);}catch{setResult({ok:false,message:"Unable to update. Please try again."});}})}>{spec.fields?.map(f=><FieldInput key={f.name} field={f} data={data} register={register}/>)}{spec.destructive&&<p className="text-sm text-muted-foreground">Please confirm. Cancellation may release inventory or end this workflow.</p>}{result&&<p role="status" className="text-sm text-destructive">{result.message}</p>}<Button disabled={isSubmitting} variant={spec.destructive?"destructive":"default"}>{isSubmitting?"Saving…":"Confirm"}</Button></form></DialogContent></Dialog>;
}
