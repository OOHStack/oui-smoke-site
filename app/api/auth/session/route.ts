import { getSession } from "@/lib/auth/session";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({
    authenticated: true,
    name: session.name,
    role: session.role,
    username: session.username,
    userId: session.userId,
  });
}
