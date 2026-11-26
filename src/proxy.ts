import { getToken } from "next-auth/jwt";
import { NextResponse, type NextRequest } from "next/server";
export async function proxy(request: NextRequest) {
  if (!process.env.DATABASE_URL?.trim() || (process.env.AUTH_SECRET?.trim().length ?? 0) < 32) return NextResponse.redirect(new URL("/setup", request.url));
  const token = await getToken({ req: request, secret: process.env.AUTH_SECRET });
  if (!token) {
    const url = new URL("/login", request.url);
    url.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}
export const config = { matcher: ["/workspace/:path*"] };
