import { describe,expect,it } from "vitest";
import { authSchema,contactSchema } from "../src/lib/validation";
import { resourceSchema } from "../src/lib/resources";
import { csv,safeNext } from "../src/lib/utils";
import { lossRate,lossReduction } from "../src/lib/metrics";
describe("Input and reporting boundaries",()=>{
 it("preserves valid PostgreSQL reference UUIDs regardless of RFC version bits",()=>{
   expect(resourceSchema("farms").safeParse({farmer_id:crypto.randomUUID(),name:"Pilot farm",country_id:"10000000-0000-0000-0000-000000000001",district_id:"10000000-0000-0000-0000-000000000003",locality:"Kasese",size_acres:2}).success).toBe(true);
 });
 it("rejects spam and invalid contact inputs",()=>{expect(contactSchema.safeParse({name:"Farmer",email:"farmer@example.org",message:"Please tell me about the pilot",website:"spam.example"}).success).toBe(false);});
 it("accepts the five public registration roles but rejects self-registration as admin",()=>{const base={email:"person@example.org",password:"Strong-password-2026",full_name:"Test person",consent:true};for(const account_type of ["farmer","buyer","transporter","coordinator","agricultural_partner"])expect(authSchema.safeParse({...base,account_type}).success).toBe(true);expect(authSchema.safeParse({...base,account_type:"admin"}).success).toBe(false);});
 it("requires assisted farmer consent",()=>{expect(resourceSchema("farmer_profiles").safeParse({full_name:"Example farmer",phone:"",district_id:"10000000-0000-0000-0000-000000000003",locality:"Kasese",consent:false}).success).toBe(false);});
 it("does not permit negative quantities or arbitrary field injection",()=>{const schema=resourceSchema("produce_listings");expect(schema.safeParse({harvest_id:crypto.randomUUID(),quantity:-1,price:2000,available_on:"2026-11-05"}).success).toBe(false);const result=schema.parse({harvest_id:crypto.randomUUID(),quantity:1,price:2000,available_on:"2026-11-05",farmer_id:"injected",role:"admin"});expect(result).not.toHaveProperty("role");expect(result).not.toHaveProperty("farmer_id");});
 it("handles zero and missing baselines without invented reductions",()=>{expect(lossRate(5,100)).toBe(5);expect(lossRate(0,0)).toBeNull();expect(lossReduction(20,10)).toBe(50);expect(lossReduction(0,0)).toBeNull();expect(lossReduction(null,10)).toBeNull();});
 it("prevents open redirects and preserves password recovery destination",()=>{expect(safeNext("https://evil.example")).toBe("/workspace");expect(safeNext("//evil.example")).toBe("/workspace");expect(safeNext("/workspace-evil")).toBe("/workspace");expect(safeNext("/account/password")).toBe("/account/password");});
 it("escapes CSV quotes, line breaks and spreadsheet formulas",()=>{const text=csv([{name:'=HYPERLINK("evil")',note:"line1\nline2"}]);expect(text).toContain("'=HYPERLINK");expect(text).toContain('""evil""');expect(text).toContain('"line1\nline2"');});
});
