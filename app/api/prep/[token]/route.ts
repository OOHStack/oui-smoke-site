import { completePrepItem, loadPrepQueue } from "@/lib/prep-queue";
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

export async function POST(request: Request, context: RouteContext) {
  const { token } = await context.params;
  if (!(await isValidPrepToken(token))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let body: { action?: string; id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body.action !== "complete" || typeof body.id !== "string") {
    return NextResponse.json(
      { error: "action complete and id required" },
      { status: 400 },
    );
  }

  const result = await completePrepItem(body.id.trim());
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const snapshot = await loadPrepQueue();
  return NextResponse.json({ ok: true, ...snapshot }, {
    headers: { "Cache-Control": "no-store" },
  });
}
