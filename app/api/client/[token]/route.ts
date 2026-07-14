import { loadClientPortalSnapshot } from "@/lib/client-portal";
import { NextResponse } from "next/server";

type RouteContext = { params: Promise<{ token: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { token } = await context.params;
  if (!token || token.length < 10) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const snapshot = await loadClientPortalSnapshot(token);
  if ("error" in snapshot) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(snapshot);
}
