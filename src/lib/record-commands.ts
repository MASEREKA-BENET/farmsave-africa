import type { Role } from "@/lib/auth";
import type { DataRow } from "@/lib/resources";
import type { CommandSpec } from "@/components/record-form";
export function recordCommands(kind:string,r:DataRow,role:Role,userId:string):CommandSpec[] {
 const result:CommandSpec[]=[];const owner=["farmer","coordinator","admin"].includes(role);const staff=role==="coordinator"||role==="admin";
 const manage=(label:string,command:string,value="",destructive=false):CommandSpec=>({label,name:"manage_record",params:{kind,record_id:r.id,command,value},destructive});
 if(kind==="notifications"&&!r.read_at)result.push(manage("Mark as read","read"));
 if((kind==="harvests"||kind==="loss_records")&&staff&&!r.verified_by)result.push(manage("Verify record","verify"));
 if(kind==="produce_listings"&&r.status==="active") {
  if(owner)result.push(manage("Close listing","close","",true));
  if(role==="buyer"&&Number(r.quantity)>0)result.push({label:"Make an offer",name:"submit_offer",params:{listing:r.id},fields:[{name:"qty",label:`Requested quantity (${r.unit})`,type:"number",min:.001},{name:"price",label:`Proposed price per ${r.unit} (UGX)`,type:"number",min:.01},{name:"note",label:"Message (optional)",optional:true}],description:"An offer does not reserve inventory until the farmer accepts. Use the listing’s original unit."});
 }
 if(kind==="buyer_offers"&&r.status==="pending"&&owner) for(const accept of [true,false])result.push({label:accept?"Accept offer":"Reject offer",name:"decide_offer",params:{offer:r.id,accept},destructive:!accept});
 if(kind==="orders"&&!["completed","cancelled"].includes(String(r.status))) {
  const order=(label:string,target:string):CommandSpec=>({label,name:"transition_order",params:{order_id:r.id,target},destructive:["cancelled","disputed"].includes(target)});
  if(r.buyer_id===userId&&!r.buyer_confirmed&&r.status!=="disputed")result.push(order("Confirm purchase","confirm_purchase"));
  if(owner&&r.status==="accepted")result.push(order("Start preparing","preparing"));
  if(owner&&r.status==="preparing")result.push(order("Ready for collection","ready_for_collection"));
  if(owner&&r.status==="ready_for_collection")result.push({...order("Record completed sale","completed"),fields:[{name:"actual_price",label:"Actual received price per original unit (UGX)",type:"number",min:.01}],description:"Only confirm after the actual sale. Buyer confirmation is required; agreed offer prices are not automatically counted as revenue."});
  result.push(order("Cancel order","cancelled"));if(r.status!=="disputed")result.push(order("Flag dispute","disputed"));
 }
 if(kind==="transport_requests"&&role==="transporter"&&["requested","quoted"].includes(String(r.status)))result.push({label:"Submit quotation",name:"quote_transport",params:{request:r.id},fields:[{name:"charge",label:"Proposed total charge (UGX)",type:"number",min:.01},{name:"note",label:"Collection details",optional:true}]});
 if(kind==="transport_quotes"&&owner&&r.status==="pending")result.push({label:"Assign transporter",name:"assign_transport",params:{quote:r.id},description:"Confirm provider availability before assignment. Only one quote can be selected per request."});
 if(kind==="deliveries") {
  const delivery=(label:string,target:string):CommandSpec=>({label,name:"transition_delivery",params:{delivery:r.id,target}});
  if(r.transporter_id===userId&&r.status==="assigned")result.push(delivery("Confirm pickup","picked_up"));
  if(r.transporter_id===userId&&r.status==="picked_up")result.push({...delivery("Confirm delivery","delivered"),fields:[{name:"charge",label:"Actual delivery charge (UGX)",type:"number",min:0}]});
  if(owner&&r.status==="delivered"&&!r.confirmed_by)result.push({...delivery("Confirm actual charge","confirm_delivery"),description:"This records the delivery’s actual charge as a farmer transportation expense. Do not record it a second time manually."});
  if((owner||r.transporter_id===userId)&&!["delivered","cancelled"].includes(String(r.status))){if(r.status!=="picked_up")result.push({...delivery("Cancel delivery","cancelled"),destructive:true});if(r.status!=="disputed")result.push({...delivery("Flag delivery dispute","disputed"),destructive:true});}
 }
 if(kind==="service_requests") {
  const next:Record<string,string>={submitted:"assigned",assigned:"in_progress",in_progress:"resolved"};
  if(staff&&next[String(r.status)])result.push(manage(`Mark ${next[String(r.status)].replaceAll("_"," ")}`,next[String(r.status)]));
  if(["submitted","assigned"].includes(String(r.status)))result.push(manage("Cancel request","cancelled","",true));
 }
 if(kind==="transport_profiles"&&role==="admin"&&!r.verified)result.push(manage("Verify transporter","verify"));
  if(kind==="profiles"&&role==="admin"&&r.id!==userId) {
   result.push({label:"Change approved role",name:"set_user_role",params:{user_ref:r.id},fields:[{name:"role_name",label:"Approved role",type:"select",options:["farmer","buyer","transporter","coordinator","agricultural_partner","admin"]}],description:"Confirm the person’s identity and role authorization. Coordinator access also requires a district assignment."});
  result.push({label:"Change account status",name:"manage_record",params:{kind,record_id:r.id,command:"status"},fields:[{name:"value",label:"Account status",type:"select",options:["active","suspended","deactivated"]}],destructive:true});
 }
 if(kind==="orders"&&role==="admin"&&r.status==="disputed")result.push({label:"Resolve dispute",name:"resolve_dispute",params:{order_ref:r.id},fields:[{name:"resolution",label:"Agreed resolution",type:"select",options:["resume","returned_and_cancelled"]},{name:"reason",label:"Resolution evidence and agreement",type:"textarea"}],description:"Only release inventory after confirming that the reserved produce has been returned or was never collected. Resume returns fulfillment to Preparing."});
 if((["farms","farm_crops"].includes(kind)&&owner)||(role==="admin"&&["crops","crop_categories","coordinator_areas","group_memberships"].includes(kind))||(role==="admin"&&kind==="crop_guidance"&&!r.published))result.push({label:"Delete unused record",name:"delete_empty_record",params:{kind,record_id:r.id},destructive:true,description:"Only unused setup records can be removed. Linked harvests, transactions and other history prevent deletion."});
 return result;
}
