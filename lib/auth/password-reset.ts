import { createHash, randomBytes, timingSafeEqual } from "crypto";

export const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000; // 1 hour

export function createPasswordResetToken() {
  return randomBytes(32).toString("base64url");
}

export function hashPasswordResetToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function passwordResetTokensMatch(token: string, storedHash: string) {
  const a = Buffer.from(hashPasswordResetToken(token), "utf8");
  const b = Buffer.from(storedHash, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function passwordResetExpiry(from = new Date()) {
  return new Date(from.getTime() + PASSWORD_RESET_TTL_MS);
}
