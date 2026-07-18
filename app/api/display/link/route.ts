import { requireApiSession } from "@/lib/auth/api";
import { loadDisplayBoard } from "@/lib/display-board";
import {
  getOrCreateDisplayToken,
  rotateDisplayToken,
} from "@/lib/display-token";
import { NextResponse } from "next/server";

/** Ops: get/create the event floor display link. */
export async function GET() {
  const { error } = await requireApiSession();
  if (error) return error;

  const link = await getOrCreateDisplayToken();
  const board = await loadDisplayBoard();
  return NextResponse.json({
    url: link.url,
    token: link.token,
    created: link.created,
    board,
  });
}

/** Ops: rotate the display link (invalidates the old tablet URL). */
export async function POST(request: Request) {
  const { error } = await requireApiSession();
  if (error) return error;

  let body: { action?: string } = {};
  try {
    body = await request.json();
  } catch {
    /* empty body ok for rotate */
  }

  if (body.action === "rotate") {
    const link = await rotateDisplayToken();
    return NextResponse.json({
      url: link.url,
      token: link.token,
      rotated: true,
    });
  }

  const link = await getOrCreateDisplayToken();
  return NextResponse.json({
    url: link.url,
    token: link.token,
    created: link.created,
  });
}
