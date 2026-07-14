import { jwtVerify } from "jose";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const COOKIE = "oui_ops_session";

const MARKETING_EXACT = new Set([
  "/",
  "/promo",
  "/privacy",
  "/terms",
  "/accessibility",
]);

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Gate admin UI (login excluded). APIs keep requireApiSession().
  if (pathname.startsWith("/admin")) {
    if (pathname === "/admin/login" || pathname.startsWith("/admin/login/")) {
      return NextResponse.next();
    }

    const token = request.cookies.get(COOKIE)?.value;
    if (!token) {
      return NextResponse.redirect(new URL("/admin/login", request.url));
    }

    const secret = process.env.OPS_SESSION_SECRET || process.env.OPS_PASSWORD;
    if (!secret) {
      return NextResponse.redirect(new URL("/admin/login", request.url));
    }

    try {
      await jwtVerify(token, new TextEncoder().encode(secret));
      return NextResponse.next();
    } catch {
      return NextResponse.redirect(new URL("/admin/login", request.url));
    }
  }

  if (
    pathname.startsWith("/api") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon")
  ) {
    return NextResponse.next();
  }

  if (pathname === "/") {
    return NextResponse.rewrite(new URL("/index.html", request.url));
  }

  if (MARKETING_EXACT.has(pathname)) {
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
