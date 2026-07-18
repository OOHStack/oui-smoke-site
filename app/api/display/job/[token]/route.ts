import { loadJobDisplayBoard } from "@/lib/job-display-board";
import { placeFloorDisplayOrder } from "@/lib/job-display-order";
import { NextResponse } from "next/server";

type Ctx = { params: Promise<{ token: string }> };

/** Public per-job event tablet snapshot. */
export async function GET(_request: Request, ctx: Ctx) {
  const { token } = await ctx.params;
  const board = await loadJobDisplayBoard(token);
  if (!board) {
    return NextResponse.json({ error: "Invalid display link" }, { status: 404 });
  }
  return NextResponse.json(board, {
    headers: { "Cache-Control": "no-store" },
  });
}

/** Floor tablet: place an on-site order (tier + flavour → prep / alerts). */
export async function POST(request: Request, ctx: Ctx) {
  const { token } = await ctx.params;
  let body: {
    action?: string;
    guestPayTier?: unknown;
    flavourId?: unknown;
    guestLabel?: unknown;
  } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body.action !== "order") {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  const result = await placeFloorDisplayOrder({
    token,
    guestPayTier: body.guestPayTier,
    flavourId: body.flavourId,
    guestLabel: body.guestLabel,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({
    ok: true,
    requestId: result.requestId,
    priceCents: result.priceCents,
    flavourLabel: result.flavourLabel,
    tier: result.tier,
  });
}
