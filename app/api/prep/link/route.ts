import { requireApiSession } from "@/lib/auth/api";
import { loadPrepQueue } from "@/lib/prep-queue";
import {
  getOrCreatePrepToken,
  rotatePrepToken,
} from "@/lib/prep-token";
import { NextResponse } from "next/server";

/** Ops: get/create the dedicated kitchen prep link. */
export async function GET() {
  const { error } = await requireApiSession();
  if (error) return error;

  const link = await getOrCreatePrepToken();
  const queue = await loadPrepQueue();
  return NextResponse.json({
    url: link.url,
    token: link.token,
    created: link.created,
    queue,
  });
}

/** Ops: rotate the prep link (invalidates the old kitchen tablet URL). */
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
    const link = await rotatePrepToken();
    return NextResponse.json({ url: link.url, token: link.token, rotated: true });
  }

  const link = await getOrCreatePrepToken();
  return NextResponse.json({ url: link.url, token: link.token, created: link.created });
}
