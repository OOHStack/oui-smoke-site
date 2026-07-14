import { authenticateOpsUser, createSession } from "@/lib/auth/session";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const password = body?.password;
    const username = typeof body?.username === "string" ? body.username : "";
    const name = typeof body?.name === "string" ? body.name : "";

    if (!password || typeof password !== "string") {
      return NextResponse.json({ error: "Password required" }, { status: 400 });
    }

    const result = await authenticateOpsUser({
      username,
      password,
      displayName: name,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 401 });
    }

    await createSession(result.session);
    return NextResponse.json({
      ok: true,
      role: result.session.role,
      name: result.session.name,
    });
  } catch (err) {
    console.error("login failed", err);
    return NextResponse.json({ error: "Login failed" }, { status: 500 });
  }
}
