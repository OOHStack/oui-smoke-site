import { getDb } from "@/lib/db";
import { siteSettings } from "@/lib/db/schema";
import { createPrepToken, prepPortalUrl } from "@/lib/guest";
import { eq } from "drizzle-orm";

async function ensureSettingsRow() {
  const db = getDb();
  await db
    .insert(siteSettings)
    .values({ id: 1 })
    .onConflictDoNothing({ target: siteSettings.id });
}

export async function getOrCreatePrepToken(): Promise<{
  token: string;
  url: string;
  created: boolean;
}> {
  await ensureSettingsRow();
  const db = getDb();
  const [row] = await db
    .select({ prepToken: siteSettings.prepToken })
    .from(siteSettings)
    .where(eq(siteSettings.id, 1))
    .limit(1);

  if (row?.prepToken) {
    return { token: row.prepToken, url: prepPortalUrl(row.prepToken), created: false };
  }

  const token = createPrepToken();
  await db
    .update(siteSettings)
    .set({ prepToken: token, updatedAt: new Date() })
    .where(eq(siteSettings.id, 1));
  return { token, url: prepPortalUrl(token), created: true };
}

export async function rotatePrepToken(): Promise<{ token: string; url: string }> {
  await ensureSettingsRow();
  const db = getDb();
  const token = createPrepToken();
  await db
    .update(siteSettings)
    .set({ prepToken: token, updatedAt: new Date() })
    .where(eq(siteSettings.id, 1));
  return { token, url: prepPortalUrl(token) };
}

export async function isValidPrepToken(token: string): Promise<boolean> {
  if (!token || token.length < 10) return false;
  const db = getDb();
  const [row] = await db
    .select({ prepToken: siteSettings.prepToken })
    .from(siteSettings)
    .where(eq(siteSettings.id, 1))
    .limit(1);
  return !!row?.prepToken && row.prepToken === token;
}
