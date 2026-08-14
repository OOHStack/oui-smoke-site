import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const mode = (
    request.nextUrl.searchParams.get("mode") ||
    request.nextUrl.searchParams.get("type") ||
    ""
  ).toLowerCase();

  if (mode === "on_site") {
    return NextResponse.redirect(new URL("/partner/guest-pay", request.url), 308);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/partner"],
};
