import { loadJobDisplayBoard } from "@/lib/job-display-board";
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
