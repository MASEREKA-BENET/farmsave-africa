import { NextResponse, type NextRequest } from "next/server";
import { identity } from "@/lib/auth";
import { documentUrl } from "@/lib/storage";
export async function GET(request: NextRequest) {
  const current = await identity();
  if (!current) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  if (current.profile?.status !== "active") return NextResponse.json({ error: "Account access denied" }, { status: 403 });
  const name = request.nextUrl.searchParams.get("name") ?? "";
  const owner = request.nextUrl.searchParams.get("owner") || current.user.id;
  if (owner !== current.user.id && current.role !== "admin") return NextResponse.json({ error: "Document access denied" }, { status: 403 });
  if (!/^[a-f0-9-]{36}\.(pdf|jpg|png)$/.test(name)) return NextResponse.json({ error: "Invalid document" }, { status: 400 });
  try {
    const url = await documentUrl(current.user.id, owner, name);
    return url ? NextResponse.redirect(url, { headers: { "Cache-Control": "private, no-store" } }) : NextResponse.json({ error: "Document unavailable" }, { status: 404 });
  } catch { return NextResponse.json({ error: "Document storage unavailable" }, { status: 503 }); }
}
