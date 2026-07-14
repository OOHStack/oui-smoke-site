import {
  PASSWORD_RESET_TTL_MS,
  createPasswordResetToken,
  hashPasswordResetToken,
  passwordResetExpiry,
} from "@/lib/auth/password-reset";
import { getDb } from "@/lib/db";
import { opsUsers } from "@/lib/db/schema";
import { getOpsNotifyEmail, isEmailConfigured, sendEmail } from "@/lib/email/resend";
import { opsPasswordResetEmail } from "@/lib/email/templates";
import { getSiteUrl } from "@/lib/guest";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

const GENERIC_OK = {
  ok: true as const,
  message:
    "If that account exists, a reset link was sent to ouismokeinc@gmail.com.",
};

/**
 * Request a password-reset magic link.
 * Link is always emailed to the ops inbox (OPS_NOTIFY_EMAIL / ouismokeinc@gmail.com)
 * so resets stay under team control without per-user emails.
 */
export async function POST(request: Request) {
  let body: { username?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const username = (body.username || "").trim().toLowerCase();
  if (!username) {
    return NextResponse.json({ error: "Username required" }, { status: 400 });
  }

  if (!isEmailConfigured()) {
    return NextResponse.json(
      { error: "Email is not configured. Contact an admin." },
      { status: 503 },
    );
  }

  const db = getDb();
  const [user] = await db
    .select({
      id: opsUsers.id,
      username: opsUsers.username,
      displayName: opsUsers.displayName,
      active: opsUsers.active,
    })
    .from(opsUsers)
    .where(eq(opsUsers.username, username))
    .limit(1);

  // Always return the same shape when the username is unknown / inactive.
  if (!user || !user.active) {
    return NextResponse.json(GENERIC_OK);
  }

  const token = createPasswordResetToken();
  const tokenHash = hashPasswordResetToken(token);
  const expiresAt = passwordResetExpiry();

  await db
    .update(opsUsers)
    .set({
      passwordResetTokenHash: tokenHash,
      passwordResetExpiresAt: expiresAt,
      updatedAt: new Date(),
    })
    .where(eq(opsUsers.id, user.id));

  const resetUrl = `${getSiteUrl()}/admin/login?token=${encodeURIComponent(token)}`;
  const mail = opsPasswordResetEmail({
    username: user.username,
    displayName: user.displayName,
    resetUrl,
    expiresInMinutes: Math.round(PASSWORD_RESET_TTL_MS / 60000),
  });

  const sent = await sendEmail({
    to: getOpsNotifyEmail(),
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
  });

  if (!sent) {
    console.error("password reset email failed for", user.username);
    return NextResponse.json(
      { error: "Could not send reset email. Try again shortly." },
      { status: 502 },
    );
  }

  return NextResponse.json(GENERIC_OK);
}
