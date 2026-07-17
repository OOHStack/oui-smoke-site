import { loadPrepQueue } from "@/lib/prep-queue";
import { isValidPrepToken } from "@/lib/prep-token";
import { NextResponse } from "next/server";

type RouteContext = { params: Promise<{ token: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { token } = await context.params;
  if (!(await isValidPrepToken(token))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const snapshot = await loadPrepQueue();
  return NextResponse.json(snapshot, {
    headers: { "Cache-Control": "no-store" },
  });
}
