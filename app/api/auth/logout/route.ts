import { destroySession } from "@/lib/auth/session";
import { NextResponse } from "next/server";

export async function POST() {
  await destroySession();
  return NextResponse.json({ ok: true });
}
