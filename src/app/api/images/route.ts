import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { identity } from "@/lib/auth";
import { cropImageUrl } from "@/lib/storage";
export async function GET(request: NextRequest) {
  const current = await identity();
  if (!current) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  if (current.profile?.status !== "active") return NextResponse.json({ error: "Account access denied" }, { status: 403 });
  const id = z.guid().safeParse(request.nextUrl.searchParams.get("listing"));
  if (!id.success) return NextResponse.json({ error: "Invalid listing" }, { status: 400 });
  try {
    const url = await cropImageUrl(current.user.id, id.data);
    return url ? NextResponse.redirect(url, { headers: { "Cache-Control": "private, no-store" } }) : NextResponse.json({ error: "Image unavailable" }, { status: 404 });
  } catch { return NextResponse.json({ error: "Image storage unavailable" }, { status: 503 }); }
}
