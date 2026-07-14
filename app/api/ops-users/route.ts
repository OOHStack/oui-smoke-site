import { requireApiAdmin } from "@/lib/auth/api";
import { hashPassword } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { opsUsers } from "@/lib/db/schema";
import { asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function GET() {
  const { error } = await requireApiAdmin();
  if (error) return error;

  const db = getDb();
  const users = await db
    .select({
      id: opsUsers.id,
      username: opsUsers.username,
      displayName: opsUsers.displayName,
      role: opsUsers.role,
      active: opsUsers.active,
      createdAt: opsUsers.createdAt,
    })
    .from(opsUsers)
    .orderBy(asc(opsUsers.username));

  return NextResponse.json({ users });
}

export async function POST(request: Request) {
  const { session, error } = await requireApiAdmin();
  if (error) return error;

  try {
    const body = await request.json();
    const username =
      typeof body.username === "string" ? body.username.trim().toLowerCase() : "";
    const displayName =
      typeof body.displayName === "string" ? body.displayName.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const role = body.role === "admin" ? "admin" : "staff";

    if (!username || username.length < 2) {
      return NextResponse.json({ error: "Username required" }, { status: 400 });
    }
    if (!displayName) {
      return NextResponse.json({ error: "Display name required" }, { status: 400 });
    }
    if (!password || password.length < 6) {
      return NextResponse.json(
        { error: "Password must be at least 6 characters" },
        { status: 400 },
      );
    }

    const db = getDb();
    const [created] = await db
      .insert(opsUsers)
      .values({
        username,
        displayName,
        passwordHash: await hashPassword(password),
        role,
        active: true,
      })
      .returning({
        id: opsUsers.id,
        username: opsUsers.username,
        displayName: opsUsers.displayName,
        role: opsUsers.role,
        active: opsUsers.active,
        createdAt: opsUsers.createdAt,
      });

    return NextResponse.json({ user: created }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Create failed";
    if (message.includes("unique") || message.includes("duplicate")) {
      return NextResponse.json({ error: "Username already taken" }, { status: 409 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const { session, error } = await requireApiAdmin();
  if (error) return error;

  try {
    const body = await request.json();
    const id = typeof body.id === "number" ? body.id : Number(body.id);
    if (!Number.isFinite(id)) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }

    const db = getDb();
    const [existing] = await db.select().from(opsUsers).where(eq(opsUsers.id, id)).limit(1);
    if (!existing) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const updates: Partial<typeof opsUsers.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (typeof body.displayName === "string" && body.displayName.trim()) {
      updates.displayName = body.displayName.trim();
    }
    if (body.role === "admin" || body.role === "staff") {
      // Prevent demoting yourself if you're the last admin
      if (
        existing.role === "admin" &&
        body.role === "staff" &&
        session.userId === existing.id
      ) {
        return NextResponse.json(
          { error: "You can’t demote your own admin account" },
          { status: 400 },
        );
      }
      updates.role = body.role;
    }
    if (typeof body.active === "boolean") {
      if (body.active === false && session.userId === existing.id) {
        return NextResponse.json(
          { error: "You can’t deactivate your own account" },
          { status: 400 },
        );
      }
      updates.active = body.active;
    }
    if (typeof body.password === "string" && body.password.length >= 6) {
      updates.passwordHash = await hashPassword(body.password);
    }

    const [updated] = await db
      .update(opsUsers)
      .set(updates)
      .where(eq(opsUsers.id, id))
      .returning({
        id: opsUsers.id,
        username: opsUsers.username,
        displayName: opsUsers.displayName,
        role: opsUsers.role,
        active: opsUsers.active,
        createdAt: opsUsers.createdAt,
      });

    return NextResponse.json({ user: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Update failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
