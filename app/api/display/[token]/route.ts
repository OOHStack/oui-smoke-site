import { loadDisplayBoard } from "@/lib/display-board";
import { isValidDisplayToken } from "@/lib/display-token";
import { NextResponse } from "next/server";

type Ctx = { params: Promise<{ token: string }> };

/** Public tablet snapshot — capability token only, no ops login. */
export async function GET(_request: Request, ctx: Ctx) {
  const { token } = await ctx.params;
  if (!(await isValidDisplayToken(token))) {
    return NextResponse.json({ error: "Invalid display link" }, { status: 404 });
  }

  const board = await loadDisplayBoard();
  return NextResponse.json(board, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
