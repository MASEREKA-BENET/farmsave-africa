import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
let db: PGlite;
const ids = { farmer: "a0000000-0000-0000-0000-000000000001", buyer: "a0000000-0000-0000-0000-000000000002", transporter: "a0000000-0000-0000-0000-000000000003", coordinator: "a0000000-0000-0000-0000-000000000004", admin: "a0000000-0000-0000-0000-000000000005", stranger: "a0000000-0000-0000-0000-000000000006", partner: "a0000000-0000-0000-0000-000000000007" };
const district = "10000000-0000-0000-0000-000000000003";
const crop = "30000000-0000-0000-0000-000000000001";
let farmer: string, farm: string, farmCrop: string, harvest: string, listing: string, offer: string, order: string, request: string, quote: string, delivery: string, assisted: string;
async function actor(key: keyof typeof ids) { await db.exec(`reset role; select set_config('farmsave.user_id','${ids[key]}',false); set role farmsave_authenticated;`); }
async function save(kind: string, p: Record<string, unknown>) { const r = await db.query<{ id: string }>("select public.save_record($1,$2::jsonb) as id", [kind, JSON.stringify(p)]); return r.rows[0].id; }
async function rpc(name: string, values: unknown[]) { const r = await db.query<{ result: string }>(`select public.${name}(${values.map((_,i) => `$${i+1}`).join(",")}) as result`, values); return r.rows[0]?.result; }
beforeAll(async () => {
  db = new PGlite();
  await db.exec(await readFile("prisma/migrations/202611050100_neon_backend/migration.sql", "utf8"));
  await db.exec(await readFile("prisma/migrations/202611260001_agricultural_partner_enum/migration.sql", "utf8"));
  await db.exec(await readFile("prisma/migrations/202611260002_agricultural_partner_auth/migration.sql", "utf8"));
  await db.exec(await readFile("prisma/seed.sql", "utf8"));
  for (const [key, id] of Object.entries(ids)) {
    await db.query("insert into app_users(id,email,email_verified_at) values($1,$2,now())", [id, `${key}@test.example`]);
    await db.query("insert into profiles(id,full_name) values($1,$2)", [id, `Test ${key}`]);
  }
  await db.query("insert into user_roles(user_id,role) values($1,'admin')", [ids.admin]);
});
afterAll(async () => { await db?.close(); });
describe("Real PostgreSQL domain workflows and RLS", () => {
  it("enrolls safe roles and rejects self-admin", async () => {
    await actor("farmer"); await expect(rpc("enroll_account", ["admin"])).rejects.toThrow("Invalid account type"); await rpc("enroll_account", ["farmer"]);
    await actor("buyer"); await rpc("enroll_account", ["buyer"]);
    await actor("transporter"); await rpc("enroll_account", ["transporter"]);
    await actor("coordinator"); await rpc("enroll_account", ["coordinator"]);
    await actor("partner"); await rpc("enroll_account", ["agricultural_partner"]);
    const partnerRole = await db.query<{ role: string }>("select role from user_roles where user_id=$1", [ids.partner]);
    expect(partnerRole.rows[0]?.role).toBe("agricultural_partner");
    expect((await db.query("select * from user_roles where user_id=$1", [ids.coordinator])).rows).toHaveLength(0);
    await actor("admin"); await rpc("manage_record", ["profiles",ids.coordinator,"role","coordinator"]);
    await save("coordinator_areas", {coordinator_id:ids.coordinator,district_id:district});
  });
  it("farmer records a real farm, crop, expected and actual harvest", async () => {
    await actor("farmer"); farmer=await save("farmer_profiles", {full_name:"Test farmer",district_id:district,locality:"Kasese area",consent:true});
    farm=await save("farms", {farmer_id:farmer,name:"Pilot farm",district_id:district,locality:"Kasese",size_acres:2});
    farmCrop=await save("farm_crops", {farm_id:farm,crop_id:crop,planted_on:"2026-08-01",area_acres:1});
    await expect(save("harvests", {farm_crop_id:farmCrop,expected_date:"2026-11-08",expected_quantity:100,unit:"bag"})).rejects.toThrow("Unit");
    harvest=await save("harvests", {farm_crop_id:farmCrop,expected_date:"2026-11-08",expected_quantity:100,unit:"kg"});
    await save("actual_harvest", {harvest_id:harvest,quantity:100,harvested_on:"2026-11-08",quality:"Grade A",reason:"Weighed on farm"});
    listing=await save("produce_listings", {harvest_id:harvest,quantity:100,price:2000,available_on:"2026-11-08"});
  });
  it("buyer searches, offers and cannot edit the farmer's records", async () => {
    await actor("buyer"); expect((await db.query("select * from farms")).rows).toHaveLength(0);
    expect((await db.query("select * from produce_listings")).rows).toHaveLength(1);
    await expect(save("actual_harvest", {harvest_id:harvest,quantity:200,harvested_on:"2026-11-08",quality:"A",reason:"unauthorized"})).rejects.toThrow("access denied");
    await expect(rpc("submit_offer", [listing,0,1800,""])).rejects.toThrow("invalid");
    offer=await rpc("submit_offer", [listing,60,1800,"Collect tomorrow"]);
    await actor("partner");
    expect((await db.query("select * from produce_listings")).rows).toHaveLength(1);
    expect((await db.query("select * from farms")).rows).toHaveLength(0);
    await expect(save("farmer_profiles", { full_name: "Unauthorized farmer", district_id: district, locality: "Kasese area", consent: true })).rejects.toThrow("denied");
    await expect(rpc("set_user_role", [ids.partner, "admin"])).rejects.toThrow("Administrator");
  });
  it("acceptance reserves inventory; a competing offer cannot double-sell", async () => {
    await actor("buyer"); const competing=await rpc("submit_offer", [listing,60,1900,""]);
    await actor("farmer"); order=await rpc("decide_offer", [offer,true]);
    await expect(rpc("decide_offer", [competing,true])).rejects.toThrow("no longer available");
    const balance=await db.query<{available_quantity:string;reserved_quantity:string}>("select * from harvests where id=$1", [harvest]);
    expect(Number(balance.rows[0].available_quantity)).toBe(40); expect(Number(balance.rows[0].reserved_quantity)).toBe(60);
    expect((await db.query("select * from sales")).rows).toHaveLength(0);
    await expect(save("loss_records", {harvest_id:harvest,quantity:50,loss_date:"2026-11-08",stage:"storage",cause:"spoilage"})).rejects.toThrow("balance");
    await actor("buyer"); await rpc("transition_order", [order,"confirm_purchase",null]);
  });
  it("verified transporter quotes, receives assignment and delivers", async () => {
    await actor("farmer"); request=await save("transport_requests", {farmer_id:farmer,harvest_id:harvest,order_id:order,destination_district_id:district,destination_area:"Public collection point",quantity:60,collection_date:"2026-11-09"});
    await actor("transporter"); const profile=await save("transport_profiles", {vehicle_description:"Pickup",registration_number:"TEST001",capacity:1000,capacity_unit:"kg",service_districts:[district]});
    await expect(rpc("quote_transport", [request,20000,""])).rejects.toThrow("Verification");
    await actor("admin"); await rpc("manage_record", ["transport_profiles",profile,"verify",""]);
    await actor("transporter"); quote=await rpc("quote_transport", [request,20000,"Collection at 8am"]);
    await actor("farmer"); delivery=await rpc("assign_transport", [quote]);
    await actor("transporter"); await rpc("transition_delivery", [delivery,"picked_up",null]); await rpc("transition_delivery", [delivery,"delivered",18000]);
    await actor("farmer"); await rpc("transition_delivery", [delivery,"confirm_delivery",null]);
    expect((await db.query("select * from expenses")).rows).toHaveLength(1);
  });
  it("sale completes only with buyer confirmation, records actual revenue and losses", async () => {
    await actor("farmer"); await rpc("transition_order", [order,"preparing",null]); await rpc("transition_order", [order,"ready_for_collection",null]); await rpc("transition_order", [order,"completed",1750]);
    await save("loss_records", {harvest_id:harvest,quantity:5,loss_date:"2026-11-09",stage:"storage",cause:"spoilage"});
    await save("expenses", {farmer_id:farmer,harvest_id:harvest,category:"packaging",amount:5000,description:"Crate hire",expense_date:"2026-11-09"});
    const result=await db.query<{revenue:string}>("select sum(quantity*unit_price) as revenue from sales where confirmed"); expect(Number(result.rows[0].revenue)).toBe(105000);
    const h=await db.query<{available_quantity:string;sold_quantity:string;lost_quantity:string}>("select * from harvests where id=$1",[harvest]); expect(Number(h.rows[0].available_quantity)).toBe(35); expect(Number(h.rows[0].sold_quantity)).toBe(60); expect(Number(h.rows[0].lost_quantity)).toBe(5);
    await expect(rpc("transition_order", [order,"completed",1750])).rejects.toThrow("finalized");
  });
  it("cancellation releases reservations", async () => {
    await actor("buyer"); const b=await rpc("submit_offer",[listing,10,1700,""]);
    await actor("farmer"); const o=await rpc("decide_offer",[b,true]);
    await actor("buyer"); await rpc("transition_order",[o,"cancelled",null]);
    await actor("farmer"); const r=await db.query<{available_quantity:string}>("select available_quantity from harvests where id=$1",[harvest]); expect(Number(r.rows[0].available_quantity)).toBe(35);
  });
  it("coordinator performs assisted enrollment, surveys, training and verification", async () => {
    await actor("coordinator"); assisted=await save("farmer_profiles", {full_name:"Assisted farmer",district_id:district,locality:"Pilot village",consent:true});
    const p={farmer_id:assisted,crop_id:crop,typical_quantity:100,loss_quantity:20,unit:"kg",handling:"Manual sorting",storage:"Shade",transport:"Hired vehicle",buyer_access:"Local market",reported_sales:100000,reported_costs:20000,challenges:"Packaging",training_needs:"Storage",survey_date:"2026-11-01",period_days:30,pilot_phase:"pilot",source:"farmer_reported"};
    await save("baseline_surveys",p); await save("followup_surveys",{...p,loss_quantity:10,survey_date:"2026-12-01"});
    const training=await save("training_sessions",{title:"Handling workshop",district_id:district,crop_id:crop,venue:"Community meeting point",scheduled_at:"2026-11-10T09:00:00Z",capacity:20});
    await save("training_attendance",{session_id:training,farmer_id:assisted,attended:true}); await save("field_reports",{farmer_id:assisted,observation:"Farmer requested packaging guidance",report_date:"2026-11-10"});
    await rpc("manage_record",["harvests",harvest,"verify",""]);
    const r=await db.query<{user_id:string|null;created_by:string}>("select * from farmer_profiles where id=$1",[assisted]); expect(r.rows[0].user_id).toBeNull(); expect(r.rows[0].created_by).toBe(ids.coordinator);
  });
  it("support requests follow the permitted workflow",async()=>{
    await actor("farmer"); const s=await save("service_requests",{farmer_id:farmer,kind:"storage",description:"Need reviewed storage guidance"});
    await expect(rpc("manage_record",["service_requests",s,"resolved",""])).rejects.toThrow("Coordinator");
    await actor("coordinator"); for(const status of ["assigned","in_progress","resolved"]) await rpc("manage_record",["service_requests",s,status,""]);
  });
  it("admin reviews real records, publishes reviewed guidance, audits and suspends access",async()=>{
    await actor("admin"); await save("crop_guidance",{crop_id:crop,title:"Reviewed example",harvesting:"Training content",sorting:"Training content",storage:"Training content",packaging:"Training content",transport:"Training content",risks:"Training content",published:true,reviewer_qualification:"Test agronomist"});
    expect((await db.query("select * from audit_logs")).rows.length).toBeGreaterThan(10);
    await rpc("manage_record",["profiles",ids.buyer,"status","suspended"]);
    await actor("buyer"); expect((await db.query("select * from orders")).rows).toHaveLength(0); await expect(rpc("submit_offer",[listing,1,1000,""])).rejects.toThrow("Buyer account");
  });
  it("unassigned coordinator cannot access another district, direct mutations are denied",async()=>{
    await actor("admin"); const other=await save("districts",{name:"Other district",region_id:"10000000-0000-0000-0000-000000000002"});
    await actor("coordinator"); await expect(save("farmer_profiles",{full_name:"Outside farmer",district_id:other,locality:"Outside area",consent:true})).rejects.toThrow("denied");
    await expect(db.query("update harvests set total_quantity=9999 where id=$1",[harvest])).rejects.toThrow("permission denied");
    await expect(db.query("insert into user_roles(user_id,role) values($1,'admin')",[ids.coordinator])).rejects.toThrow("permission denied");
    await expect(rpc("check_rate",["bypass",100,60])).rejects.toThrow("permission denied");
  });
  it("calculates comparable survey results and scoped financial totals in PostgreSQL",async()=>{
    await actor("admin"); const r=await db.query<{report:{revenue:number;costs:number;comparisons:{relative_reduction:number;verified:boolean}[]}}>("select impact_report('{}') as report");
    expect(Number(r.rows[0].report.revenue)).toBe(105000);expect(Number(r.rows[0].report.costs)).toBe(23000);
    expect(r.rows[0].report.comparisons[0].relative_reduction).toBe(50);expect(r.rows[0].report.comparisons[0].verified).toBe(false);
    const summary=await db.query<{summary:{completed:number;farmers:number}}>("select workspace_summary() as summary");expect(summary.rows[0].summary.completed).toBe(1);expect(summary.rows[0].summary.farmers).toBe(2);
    await actor("transporter");await expect(db.query("select impact_report('{}')")).rejects.toThrow("denied");
  });
  it("persists contact forms, rejects invalid addresses and enforces anonymous rate limits",async()=>{
    await db.exec("reset role; set role farmsave_anonymous;");
    await expect(rpc("submit_contact",["Test name","invalid","A meaningful message","test-bucket"])).rejects.toThrow("Invalid email");
    for(let i=0;i<5;i++)await rpc("submit_contact",["Test name","test@example.org","A meaningful message","test-bucket"]);
    await expect(rpc("submit_contact",["Test name","test@example.org","A meaningful message","test-bucket"])).rejects.toThrow("Too many");
    expect((await db.query("select * from crops")).rows.length).toBeGreaterThan(0);
    await expect(db.query("select * from contact_messages")).rejects.toThrow("permission denied");
    await actor("admin");expect((await db.query("select * from contact_messages")).rows).toHaveLength(5);
  });
  it("private storage policies deny cross-user reads and uploads",async()=>{
     await actor("farmer"); await db.query("insert into stored_files(owner_id,object_key,original_name,purpose,mime_type,size_bytes,state) values($1,$2,'test.pdf','document','application/pdf',100,'ready')", [ids.farmer, `${ids.farmer}/test.pdf`]);
     await actor("transporter");expect((await db.query("select * from stored_files")).rows).toHaveLength(0);await expect(db.query("insert into stored_files(owner_id,object_key,original_name,purpose,mime_type,size_bytes,state) values($1,$2,'intrusion.pdf','document','application/pdf',100,'ready')", [ids.farmer, `${ids.farmer}/intrusion.pdf`])).rejects.toThrow("row-level security");
     await actor("admin");expect((await db.query("select * from stored_files")).rows).toHaveLength(1);
  });
  it("only uses explicit reviewed crop unit conversions",async()=>{
    await actor("admin");await save("crop_unit_conversions",{crop_id:crop,from_unit:"crate",to_unit:"kg",factor:25});
    await actor("farmer");expect(Number(await rpc("convert_crop_quantity",[crop,2,"crate","kg"]))).toBe(50);await expect(rpc("convert_crop_quantity",[crop,2,"bag","kg"])).rejects.toThrow("No reviewed conversion");
  });
  it("deletes unused setup records but preserves linked farm history",async()=>{
    await actor("farmer");const unused=await save("farms",{farmer_id:farmer,name:"Unused farm",district_id:district,locality:"Kasese",size_acres:1});await rpc("delete_empty_record",["farms",unused]);
    await expect(rpc("delete_empty_record",["farms",farm])).rejects.toThrow("foreign key");
  });
  it("rejects PostgreSQL NaN inventory and non-finite costs even through direct RPC",async()=>{
    await actor("farmer");await expect(save("actual_harvest",{harvest_id:harvest,quantity:"NaN",harvested_on:"2026-11-09",quality:"Grade A",reason:"Invalid direct request"})).rejects.toThrow("check constraint");
    await expect(save("expenses",{farmer_id:farmer,category:"other",amount:"NaN",description:"Invalid amount",expense_date:"2026-11-09"})).rejects.toThrow("check constraint");
  });
  it("disputes preserve reservations until an administrator records a resolution",async()=>{
    await actor("admin");await rpc("manage_record",["profiles",ids.buyer,"status","active"]);
    await actor("buyer");const b=await rpc("submit_offer",[listing,10,1500,""]);
    await actor("farmer");const o=await rpc("decide_offer",[b,true]);await rpc("transition_order",[o,"disputed",null]);
    await expect(rpc("resolve_dispute",[o,"returned_and_cancelled","Both parties confirmed no collection"])).rejects.toThrow("Administrator");
    await actor("admin");await rpc("resolve_dispute",[o,"returned_and_cancelled","Both parties confirmed no collection"]);
    const r=await db.query<{available_quantity:string}>("select available_quantity from harvests where id=$1",[harvest]);expect(Number(r.rows[0].available_quantity)).toBe(35);
  });
  it("a second farmer cannot read or modify another farmer's private records",async()=>{
    await actor("stranger");await rpc("enroll_account",["farmer"]);expect((await db.query("select * from farmer_profiles")).rows).toHaveLength(0);expect((await db.query("select * from harvests")).rows).toHaveLength(0);
    await expect(save("farms",{id:farm,farmer_id:farmer,name:"Unauthorized update",district_id:district,locality:"Kasese",size_acres:3})).rejects.toThrow("access denied");
  });
  it("permits expected-plan edits but protects established harvest inventory",async()=>{
    await actor("farmer");const plan=await save("harvests",{farm_crop_id:farmCrop,expected_date:"2026-12-01",expected_quantity:50,unit:"kg"});await save("harvests",{id:plan,farm_crop_id:farmCrop,expected_date:"2026-12-05",expected_quantity:70,unit:"kg"});
    const r=await db.query<{expected_quantity:string}>("select expected_quantity from harvests where id=$1",[plan]);expect(Number(r.rows[0].expected_quantity)).toBe(70);
    await expect(save("harvests",{id:harvest,farm_crop_id:farmCrop,expected_date:"2026-12-05",expected_quantity:200,unit:"kg"})).rejects.toThrow("unharvested plans");
  });
});
