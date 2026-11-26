"use client";
import { useState } from "react";
import Link from "next/link";
import { Search, Inbox, BookOpen } from "lucide-react";
import type { Role } from "@/lib/auth";
import { resources, referenceSources, lookup, type DataRow, type DataSet } from "@/lib/resources";
import { recordCommands } from "@/lib/record-commands";
import { label, money } from "@/lib/utils";
import { RecordForm, CommandButton } from "@/components/record-form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { CropPhoto } from "@/components/crop-photo";
function display(key:string,value:unknown,data:DataSet) {
 if(value===null||value===undefined||value==="")return "—";
 if(referenceSources[key])return lookup(referenceSources[key],value,data);
 if(["verified_by","confirmed_by"].includes(key))return value?"Confirmed":"Not verified";
 if(typeof value==="boolean")return value?"Yes":"No";
 if(key==="id"||key.endsWith("_by")||key==="actor_id"||key==="entity_id")return String(value).slice(0,8);
 if(["amount","price","unit_price","actual_charge"].includes(key))return money(Number(value));
 if(Array.isArray(value))return value.join(", ");
 if(typeof value==="object")return JSON.stringify(value);
 if(key.endsWith("_at"))return new Date(String(value)).toLocaleString("en-UG",{dateStyle:"medium",timeStyle:"short"});
 return String(value).replaceAll("_"," ");
}
export function ResourceTable({kind,rows,count,data,writable,role,userId}:{kind:string;rows:DataRow[];count:number;data:DataSet;writable:boolean;role:Role;userId:string}) {
 const r=resources[kind];const [q,setQ]=useState("");const filtered=rows.filter(row=>r.columns.some(c=>display(c,row[c],data).toLowerCase().includes(q.toLowerCase())));
 return <section className="card min-w-0 scroll-mt-28 p-4 sm:p-6" id={kind}><div className="flex flex-wrap items-start justify-between gap-4"><div className="max-w-2xl"><h2 className="text-lg font-bold">{r.title}{r.columns.length>0&&<span className="ml-2 rounded-full bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">{count}</span>}</h2><p className="mt-1 text-sm leading-relaxed text-muted-foreground">{r.description}</p></div>{writable&&r.fields.length>0&&<RecordForm kind={kind} data={data}/>}</div>
 {r.columns.length>0&&<><label className="relative my-5 block max-w-sm"><span className="sr-only">Search this page of {r.title.toLowerCase()}</span><Search className="absolute left-3 top-3.5 size-4 text-muted-foreground"/><input className="pl-10 text-sm" value={q} onChange={e=>setQ(e.target.value)} placeholder="Search this page…"/></label>{filtered.length===0?<div className="rounded-xl border border-dashed border-border px-5 py-10 text-center"><Inbox className="mx-auto size-8 text-muted-foreground"/><p className="mt-3 font-semibold">{q?"No matching records":"No records yet"}</p><p className="mt-2 text-sm text-muted-foreground">{q?"Try a different search.":writable?"Add your first record to get started.":"Updates will appear here when activity is recorded."}</p></div>:<div className="grid gap-3 md:block md:overflow-x-auto"><table className="hidden w-full text-left text-sm md:table"><thead><tr className="border-b border-border bg-muted/60">{r.columns.map(c=><th scope="col" key={c} className="whitespace-nowrap px-3 py-3 text-xs font-semibold text-muted-foreground">{label(c)}</th>)}<th scope="col" className="px-3 py-3 text-xs">Actions</th></tr></thead><tbody>{filtered.map(row=><tr key={row.id} data-record-id={row.id} className="border-b border-border last:border-0">{r.columns.map(c=><td key={c} className="max-w-72 px-3 py-4 align-top"><Cell field={c} value={display(c,row[c],data)}/></td>)}<td className="min-w-40 px-3 py-3 align-top"><Actions kind={kind} row={row} data={data} writable={writable} role={role} userId={userId}/></td></tr>)}</tbody></table><div className="grid gap-3 md:hidden">{filtered.map(row=><article key={row.id} data-record-id={row.id} className="rounded-xl border border-border p-4"><dl className="grid grid-cols-[minmax(0,.8fr)_minmax(0,1.2fr)] gap-x-3 gap-y-3 text-sm">{r.columns.map(c=><div className="contents" key={c}><dt className="text-xs text-muted-foreground">{label(c)}</dt><dd className="min-w-0 break-words"><Cell field={c} value={display(c,row[c],data)}/></dd></div>)}</dl><div className="mt-4 border-t border-border pt-3"><Actions kind={kind} row={row} data={data} writable={writable} role={role} userId={userId}/></div></article>)}</div></div>}</>}
 </section>;
}
function Cell({field,value}:{field:string;value:string}) { return field==="status"||field==="source"?<span data-field={field} className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${["cancelled","rejected","disputed","suspended"].includes(value)?"bg-destructive/10 text-destructive":"bg-primary/10 text-primary"}`}>{label(value)}</span>:<span data-field={field} className="break-words">{value}</span>; }
function Actions({kind,row,data,writable,role,userId}:{kind:string;row:DataRow;data:DataSet;writable:boolean;role:Role;userId:string}) {
 const commands = recordCommands(kind, row, role, userId);
 const editable = writable && resources[kind].editable && (kind !== "harvests" || Number(row.total_quantity) === 0);
 return <div className="flex flex-wrap gap-2">
   {editable && <RecordForm kind={kind} data={data} row={row} />}
   {kind === "produce_listings" && Boolean(row.has_photo) && <a href={`/api/images?listing=${row.id}`} target="_blank" rel="noreferrer" className="inline-flex min-h-9 items-center px-2 text-xs text-primary underline">View crop photo</a>}
   {kind === "produce_listings" && writable && <CropPhoto listingId={row.id} />}
   {commands.map((spec, i) => <CommandButton key={i} spec={spec} data={data} />)}
   {kind === "notifications" && typeof row.href === "string" && <Link className="inline-flex min-h-9 items-center px-2 text-xs text-primary underline" href={row.href}>View update</Link>}
   {kind === "crop_guidance" && <Dialog>
     <DialogTrigger asChild><Button variant="outline" size="sm"><BookOpen className="size-4" />Read guidance</Button></DialogTrigger>
     <DialogContent title={String(row.title)} description={`Reviewed by ${row.reviewer_qualification ?? "Not yet reviewed — draft"}`}>
       <div className="space-y-5">{["harvesting", "sorting", "storage", "packaging", "transport", "risks"].map(k => <section key={k}>
         <h3 className="font-bold">{label(k)}</h3>
         <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{String(row[k])}</p>
       </section>)}</div>
     </DialogContent>
   </Dialog>}
   {commands.length === 0 && !writable && kind !== "crop_guidance" && kind !== "notifications" && <span className="text-xs text-muted-foreground">View only</span>}
 </div>;
}
