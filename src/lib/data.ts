import "server-only";
import { session } from "@/lib/auth";
import { resources, referenceSources, type DataSet } from "@/lib/resources";
import { queryTable, pagedTable } from "@/lib/db/queries";
export type Filters = { page?: string; q?: string; crop?: string; category?: string; country?: string; district?: string; quantity?: string; price?: string; quality?: string; available?: string; from?: string; to?: string; group?: string; phase?: string };
export async function loadSection(kinds: string[], filters: Filters) {
  const auth = await session();
  const lookups = new Set<string>();
  for (const kind of kinds) {
    for (const f of resources[kind].fields) if (f.source) lookups.add(f.source);
    for (const c of resources[kind].columns) if (referenceSources[c]) lookups.add(referenceSources[c]);
  }
  if (kinds.includes("produce_listings")) for (const t of ["crops", "crop_categories", "districts", "regions", "countries"]) lookups.add(t);
  if (lookups.has("harvests")) lookups.add("farm_crops");
  if (lookups.has("farm_crops")) { lookups.add("farms"); lookups.add("crops"); }
  if (lookups.has("districts")) lookups.add("regions");
  const data: DataSet = {};
  const errors: string[] = [];
  for (const table of lookups) {
    try { data[table] = await queryTable(auth.user.id, table); }
    catch { errors.push(`Could not load ${table.replaceAll("_", " ")}.`); }
  }
  const page = Math.max(1, Math.min(10000, Number.parseInt(filters.page ?? "1", 10) || 1));
  const tables: Record<string, { rows: import("@/lib/resources").DataRow[]; count: number }> = {};
  for (const kind of kinds.filter(k => resources[k].columns.length)) {
    const where: Record<string, unknown> = {};
    if (kind === "produce_listings") {
      if (auth.role === "buyer" || auth.role === "agricultural_partner") { where.status = "active"; where.quantity = { gt: 0 }; }
      if (filters.crop) where.crop_id = filters.crop;
      if (filters.district) where.district_id = filters.district;
      if (filters.quantity && Number.isFinite(Number(filters.quantity))) where.quantity = { gt: 0, gte: Number(filters.quantity) };
      if (filters.price && Number.isFinite(Number(filters.price))) where.price = { lte: Number(filters.price) };
      if (filters.quality) where.quality = filters.quality;
      if (filters.available) where.available_on = { lte: new Date(filters.available) };
      const cropFilter: Record<string, unknown> = {};
      if (filters.category) cropFilter.category_id = filters.category;
      if (filters.q) cropFilter.name = { contains: filters.q.slice(0, 120), mode: "insensitive" };
      if (Object.keys(cropFilter).length) where.crops = { is: cropFilter };
      if (filters.country) where.districts = { is: { regions: { is: { country_id: filters.country } } } };
    }
    try {
      tables[kind] = await pagedTable(auth.user.id, kind, { where, orderBy: { created_at: "desc" }, skip: (page - 1) * 20, take: 20 });
    } catch { errors.push(`Could not load ${resources[kind].title.toLowerCase()}.`); tables[kind] = { rows: [], count: 0 }; }
  }
  return { ...auth, data, tables, errors, page };
}
