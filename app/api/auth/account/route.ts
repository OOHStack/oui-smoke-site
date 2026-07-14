import { requireApiSession } from "@/lib/auth/api";
import {
  createSession,
  hashPassword,
  verifyUserPassword,
} from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { opsUsers } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

/** Update the signed-in user's own account (display name / password). */
export async function PATCH(request: Request) {
  const { session, error } = await requireApiSession();
  if (error) return error;

  if (!session.userId) {
    return NextResponse.json(
      { error: "This account can’t be edited here. Create a named ops user first." },
      { status: 400 },
    );
  }

  let body: {
    displayName?: string;
    currentPassword?: string;
    newPassword?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const db = getDb();
  const [user] = await db
    .select()
    .from(opsUsers)
    .where(eq(opsUsers.id, session.userId))
    .limit(1);

  if (!user || !user.active) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  const updates: Partial<typeof opsUsers.$inferInsert> = {
    updatedAt: new Date(),
  };
  let changingPassword = false;

  if (typeof body.displayName === "string") {
    const displayName = body.displayName.trim();
    if (!displayName) {
      return NextResponse.json({ error: "Display name required" }, { status: 400 });
    }
    updates.displayName = displayName;
  }

  if (typeof body.newPassword === "string" && body.newPassword.length > 0) {
    if (body.newPassword.length < 6) {
      return NextResponse.json(
        { error: "New password must be at least 6 characters" },
        { status: 400 },
      );
    }
    if (typeof body.currentPassword !== "string" || !body.currentPassword) {
      return NextResponse.json(
        { error: "Current password required to set a new one" },
        { status: 400 },
      );
    }
    const valid = await verifyUserPassword(body.currentPassword, user.passwordHash);
    if (!valid) {
      return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 });
    }
    updates.passwordHash = await hashPassword(body.newPassword);
    changingPassword = true;
  }

  if (Object.keys(updates).length <= 1) {
    return NextResponse.json({ error: "No changes to save" }, { status: 400 });
  }

  const [updated] = await db
    .update(opsUsers)
    .set(updates)
    .where(eq(opsUsers.id, user.id))
    .returning({
      id: opsUsers.id,
      username: opsUsers.username,
      displayName: opsUsers.displayName,
      role: opsUsers.role,
    });

  await createSession({
    role: updated.role,
    name: updated.displayName,
    userId: updated.id,
    username: updated.username,
  });

  return NextResponse.json({
    ok: true,
    user: updated,
    passwordChanged: changingPassword,
  });
}
