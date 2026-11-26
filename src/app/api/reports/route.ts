import { NextResponse, type NextRequest } from "next/server";
import { databaseConfigured } from "@/lib/db/prisma";
import { identity } from "@/lib/auth";
import { aggregate } from "@/lib/db/context";
import { csv } from "@/lib/utils";
import type { ImpactReport } from "@/lib/metrics";
export async function GET(request: NextRequest) {
  if (!databaseConfigured()) return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  const current = await identity();
  if (!current) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  if (current.profile?.status !== "active" || !current.role || !["admin", "coordinator"].includes(current.role)) return NextResponse.json({ error: "Report access denied" }, { status: 403 });
  const p = Object.fromEntries([...request.nextUrl.searchParams].filter(([k]) => ["from", "to", "crop", "category", "district", "group", "phase"].includes(k)));
  try {
    const r = await aggregate<ImpactReport>(current.user.id, "impact_report", p);
    const rows: Record<string, unknown>[] = [{ record_type: "summary", farmers: r.farmers, trained: r.trained, buyer_participation: r.buyer_participation, completed_deliveries: r.completed_deliveries, confirmed_revenue_ugx: r.revenue, recorded_costs_ugx: r.costs, net_proceeds_after_recorded_costs_ugx: r.revenue - r.costs }, ...r.quantities.map(q => ({ record_type: "harvest_cohort", ...q })), ...r.comparisons.map(c => ({ record_type: "survey_comparison", ...c }))];
    return new NextResponse("\ufeff" + csv(rows), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="farmsave-impact-${new Date().toISOString().slice(0, 10)}.csv"`, "Cache-Control": "private, no-store" } });
  } catch { return NextResponse.json({ error: "Report could not be generated. Check your filters." }, { status: 400 }); }
}
