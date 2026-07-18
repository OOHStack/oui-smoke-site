import { loadJobDisplayBoard } from "@/lib/job-display-board";
import { createSseResponse } from "@/lib/sse";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Ctx = { params: Promise<{ token: string }> };

/** Live CFD stream — takeover appears within ~1.5s of send-out. */
export async function GET(request: Request, ctx: Ctx) {
  const { token } = await ctx.params;
  if (!token || token.length < 10) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const first = await loadJobDisplayBoard(token);
  if (!first) {
    return NextResponse.json({ error: "Invalid display link" }, { status: 404 });
  }

  return createSseResponse({
    signal: request.signal,
    intervalMs: 1200,
    getPayload: async () => {
      const board = await loadJobDisplayBoard(token);
      if (!board) return { error: "Invalid display link" };
      return board;
    },
  });
}
