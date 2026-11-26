import { NextResponse, type NextRequest } from "next/server";
import { authConfigured } from "@/lib/db/prisma";
import { verifyEmailToken } from "@/lib/accounts";
export async function GET(request: NextRequest) {
  if (!authConfigured()) return NextResponse.redirect(new URL("/setup", request.url));
  try {
    await verifyEmailToken(request.nextUrl.searchParams.get("token") ?? "");
    return NextResponse.redirect(new URL("/login?verified=1", request.url));
  } catch { return NextResponse.redirect(new URL("/login?error=expired", request.url)); }
}
