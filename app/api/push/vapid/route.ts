import { requireApiSession } from "@/lib/auth/api";
import { getVapidPublicKey } from "@/lib/push";
import { NextResponse } from "next/server";

export async function GET() {
  const { error } = await requireApiSession();
  if (error) return error;

  const publicKey = getVapidPublicKey();
  if (!publicKey) {
    return NextResponse.json(
      { error: "Push not configured", configured: false },
      { status: 503 },
    );
  }

  return NextResponse.json({ publicKey, configured: true });
}
