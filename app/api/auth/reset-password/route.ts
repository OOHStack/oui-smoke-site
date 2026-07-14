import {
  hashPasswordResetToken,
  passwordResetTokensMatch,
} from "@/lib/auth/password-reset";
import { hashPassword } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { opsUsers } from "@/lib/db/schema";
import { and, eq, gt, isNotNull } from "drizzle-orm";
import { NextResponse } from "next/server";

/**
 * Complete a magic-link password reset.
 * Body: { token, newPassword }
 */
export async function POST(request: Request) {
  let body: { token?: string; newPassword?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const token = typeof body.token === "string" ? body.token.trim() : "";
  const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";

  if (!token) {
    return NextResponse.json({ error: "Reset link is invalid" }, { status: 400 });
  }
  if (newPassword.length < 6) {
    return NextResponse.json(
      { error: "New password must be at least 6 characters" },
      { status: 400 },
    );
  }

  const tokenHash = hashPasswordResetToken(token);
  const db = getDb();
  const [user] = await db
    .select({
      id: opsUsers.id,
      active: opsUsers.active,
      passwordResetTokenHash: opsUsers.passwordResetTokenHash,
      passwordResetExpiresAt: opsUsers.passwordResetExpiresAt,
    })
    .from(opsUsers)
    .where(
      and(
        eq(opsUsers.passwordResetTokenHash, tokenHash),
        isNotNull(opsUsers.passwordResetTokenHash),
        gt(opsUsers.passwordResetExpiresAt, new Date()),
      ),
    )
    .limit(1);

  if (
    !user ||
    !user.active ||
    !user.passwordResetTokenHash ||
    !passwordResetTokensMatch(token, user.passwordResetTokenHash)
  ) {
    return NextResponse.json(
      { error: "This reset link is invalid or has expired" },
      { status: 400 },
    );
  }

  await db
    .update(opsUsers)
    .set({
      passwordHash: await hashPassword(newPassword),
      passwordResetTokenHash: null,
      passwordResetExpiresAt: null,
      updatedAt: new Date(),
    })
    .where(eq(opsUsers.id, user.id));

  return NextResponse.json({ ok: true });
}
