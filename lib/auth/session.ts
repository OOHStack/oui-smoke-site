import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { opsUsers } from "@/lib/db/schema";

const COOKIE = "oui_ops_session";

export type OpsRole = "admin" | "staff";

export type SessionUser = {
  role: OpsRole;
  name: string;
  userId: number | null;
  username: string | null;
};

function getSecret() {
  const dedicated = process.env.OPS_SESSION_SECRET?.trim();
  if (dedicated) {
    return new TextEncoder().encode(dedicated);
  }

  const fallback = process.env.OPS_PASSWORD?.trim();
  if (!fallback) {
    throw new Error("OPS_SESSION_SECRET must be set (OPS_PASSWORD fallback also missing)");
  }

  if (process.env.NODE_ENV === "production") {
    console.warn(
      "OPS_SESSION_SECRET is not set — falling back to OPS_PASSWORD. Set a dedicated session secret in production.",
    );
  }

  return new TextEncoder().encode(fallback);
}

export async function createSession(session: SessionUser) {
  const token = await new SignJWT({
    role: session.role,
    name: session.name,
    userId: session.userId,
    username: session.username,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("14d")
    .sign(getSecret());

  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 14,
  });
}

export async function destroySession() {
  const jar = await cookies();
  jar.delete(COOKIE);
}

export async function getSession(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret());
    const role = payload.role === "admin" ? "admin" : "staff";
    return {
      role,
      name: typeof payload.name === "string" ? payload.name : "ops",
      userId: typeof payload.userId === "number" ? payload.userId : null,
      username: typeof payload.username === "string" ? payload.username : null,
    };
  } catch {
    return null;
  }
}

export async function requireSession() {
  const session = await getSession();
  if (!session) {
    throw new Error("Unauthorized");
  }
  return session;
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

export async function verifyUserPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

/**
 * Authenticate username+password against ops_users.
 * Bootstrap: if no users exist and password matches OPS_PASSWORD, create first admin.
 * Legacy: if username empty and OPS_PASSWORD matches, sign in as admin "ops".
 */
export async function authenticateOpsUser(input: {
  username?: string;
  password: string;
  displayName?: string;
}): Promise<{ ok: true; session: SessionUser } | { ok: false; error: string }> {
  const password = input.password;
  const username = (input.username || "").trim().toLowerCase();
  const displayName = (input.displayName || "").trim();

  const db = getDb();
  const users = await db.select().from(opsUsers).limit(1);
  const hasUsers = users.length > 0;

  // Bootstrap first admin from OPS_PASSWORD
  if (!hasUsers) {
    const bootstrap = process.env.OPS_PASSWORD;
    if (!bootstrap || password !== bootstrap) {
      return { ok: false, error: "Invalid credentials" };
    }
    const uname = username || "admin";
    const [created] = await db
      .insert(opsUsers)
      .values({
        username: uname,
        displayName: displayName || "Admin",
        passwordHash: await hashPassword(password),
        role: "admin",
        active: true,
      })
      .returning();

    return {
      ok: true,
      session: {
        role: "admin",
        name: created.displayName,
        userId: created.id,
        username: created.username,
      },
    };
  }

  if (!username) {
    return { ok: false, error: "Username required" };
  }

  const [user] = await db
    .select()
    .from(opsUsers)
    .where(eq(opsUsers.username, username))
    .limit(1);

  if (!user || !user.active) {
    return { ok: false, error: "Invalid credentials" };
  }

  const valid = await verifyUserPassword(password, user.passwordHash);
  if (!valid) {
    return { ok: false, error: "Invalid credentials" };
  }

  return {
    ok: true,
    session: {
      role: user.role,
      name: user.displayName,
      userId: user.id,
      username: user.username,
    },
  };
}

/** Re-verify the signed-in user's password (sensitive actions). */
export async function verifySessionPassword(
  session: SessionUser,
  password: string,
): Promise<boolean> {
  if (!password) return false;

  if (session.userId != null) {
    const db = getDb();
    const [user] = await db
      .select({ passwordHash: opsUsers.passwordHash, active: opsUsers.active })
      .from(opsUsers)
      .where(eq(opsUsers.id, session.userId))
      .limit(1);
    if (!user || !user.active) return false;
    return verifyUserPassword(password, user.passwordHash);
  }

  const bootstrap = process.env.OPS_PASSWORD;
  return !!bootstrap && password === bootstrap;
}
