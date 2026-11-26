import Link from "next/link";
import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import { session } from "@/lib/auth";
import { sectionFor } from "@/lib/navigation";
import { loadSection, type Filters } from "@/lib/data";
import { resources } from "@/lib/resources";
import type { ImpactReport } from "@/lib/metrics";
import { ResourceTable } from "@/components/resource-table";
import { MarketplaceFilters } from "@/components/marketplace-filters";
import { ImpactPanel } from "@/components/impact-panel";
import { ProfilePanel } from "@/components/profile-panel";
import { ConversionCalculator } from "@/components/conversion-calculator";
import { CommandButton } from "@/components/record-form";
import { Button } from "@/components/ui/button";
import { aggregate } from "@/lib/db/context";
import { queryTable } from "@/lib/db/queries";
import { listDocuments, storageConfigured } from "@/lib/storage";
export default async function WorkspaceSection({params,searchParams}:{params:Promise<{section:string}>;searchParams:Promise<Filters>}) {
 const [{section:key},filters,auth]=await Promise.all([params,searchParams,session()]);const section=sectionFor(auth.role,key);if(!section)notFound();
 const {data,tables,errors,page}=await loadSection(section.resources,filters);
 let report:ImpactReport|null=null;
 if(key==="impact"){
  try {
   report=await aggregate<ImpactReport>(auth.user.id,"impact_report",filters);
   for(const table of ["crops","crop_categories","districts","farmer_groups"])data[table]=await queryTable(auth.user.id,table);
  } catch { errors.push("Impact report could not be calculated. Check the filters and database migrations."); }
 }
 const queryFor=(n:number)=>{const p=new URLSearchParams(Object.entries(filters).filter(([,v])=>v!==undefined) as [string,string][]);p.set("page",String(n));return `?${p}`;};
 const maxCount=Math.max(0,...Object.values(tables).map(t=>t.count));
 let files:string[]=[];let storageError=false;
 if(key==="profile"){try{files=await listDocuments(auth.user.id);storageError=!storageConfigured();}catch{storageError=true;}}
 return <div className="space-y-6"><header className="flex flex-wrap items-start justify-between gap-4"><div><p className="eyebrow">FarmSave Africa</p><h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">{section.title}</h1><p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">{section.subtitle}</p></div>{key==="reports"&&<Button asChild variant="outline"><a href="/api/reports" download><Download className="size-4"/>Export impact CSV</a></Button>}</header>
 {errors.length>0&&<div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">{[...new Set(errors)].join(" ")} Verify the database connection and apply all migrations before using this workspace.</div>}
 {key==="profile"&&<ProfilePanel name={auth.profile.full_name} phone={auth.profile.phone??""} email={auth.user.email??""} files={files} storageError={storageError}/>}
 {key==="marketplace"&&<MarketplaceFilters data={data} filters={filters}/>}
 {["harvests","catalogue"].includes(key)&&<ConversionCalculator data={data}/>}
 {report&&<ImpactPanel report={report} data={data} filters={filters}/>}
 {section.resources.length>2&&<nav className="flex flex-wrap gap-2" aria-label="Page sections">{section.resources.map(kind=><a key={kind} href={`#${kind}`} className="rounded-full border border-border bg-card px-3 py-2 text-xs hover:border-primary">{resources[kind].title}</a>)}</nav>}
 {key==="settings"&&<section className="card"><h2 className="mb-3 font-bold">Administrative announcement</h2><CommandButton spec={{label:"Publish in-app announcement",name:"manage_record",params:{kind:"announcements",record_id:auth.user.id,command:"publish"},fields:[{name:"value",label:"Announcement message",type:"textarea"}],description:"This stores a notification for every active account. It does not send email, SMS or WhatsApp."}}/></section>}
 {section.resources.map(kind=><ResourceTable key={kind} kind={kind} rows={tables[kind]?.rows??[]} count={tables[kind]?.count??0} data={data} writable={section.write.includes(kind)} role={auth.role} userId={auth.user.id}/>)}
 {maxCount>20&&<nav className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4" aria-label="Records pagination"><p className="text-xs text-muted-foreground">Page {page} · up to 20 records per table</p><div className="flex gap-2">{page>1&&<Button asChild variant="outline" size="sm"><Link href={queryFor(page-1)}>Previous</Link></Button>}{page*20<maxCount&&<Button asChild variant="outline" size="sm"><Link href={queryFor(page+1)}>Next</Link></Button>}</div></nav>}
 </div>;
}
