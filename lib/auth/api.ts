import { getSession, type OpsRole, type SessionUser } from "@/lib/auth/session";
import { NextResponse } from "next/server";

export async function requireApiSession() {
  const session = await getSession();
  if (!session) {
    return {
      session: null as null,
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  return { session, error: null as null };
}

export async function requireApiRole(roles: OpsRole[]) {
  const { session, error } = await requireApiSession();
  if (error || !session) {
    return { session: null as null, error: error! };
  }
  if (!roles.includes(session.role)) {
    return {
      session: null as null,
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }
  return { session: session as SessionUser, error: null as null };
}

export async function requireApiAdmin() {
  return requireApiRole(["admin"]);
}
