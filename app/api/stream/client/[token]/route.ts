import { loadClientPortalSnapshot } from "@/lib/client-portal";
import { createSseResponse } from "@/lib/sse";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type RouteContext = { params: Promise<{ token: string }> };

export async function GET(request: Request, context: RouteContext) {
  const { token } = await context.params;
  if (!token || token.length < 10) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return createSseResponse({
    signal: request.signal,
    getPayload: async () => loadClientPortalSnapshot(token),
  });
}
