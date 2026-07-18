import { getDb } from "@/lib/db";
import { siteSettings } from "@/lib/db/schema";
import { createDisplayToken, displayPortalUrl } from "@/lib/guest";
import { eq } from "drizzle-orm";

async function ensureSettingsRow() {
  const db = getDb();
  await db
    .insert(siteSettings)
    .values({ id: 1 })
    .onConflictDoNothing({ target: siteSettings.id });
}

export async function getOrCreateDisplayToken(): Promise<{
  token: string;
  url: string;
  created: boolean;
}> {
  await ensureSettingsRow();
  const db = getDb();
  const [row] = await db
    .select({ displayToken: siteSettings.displayToken })
    .from(siteSettings)
    .where(eq(siteSettings.id, 1))
    .limit(1);

  if (row?.displayToken) {
    return {
      token: row.displayToken,
      url: displayPortalUrl(row.displayToken),
      created: false,
    };
  }

  const token = createDisplayToken();
  await db
    .update(siteSettings)
    .set({ displayToken: token, updatedAt: new Date() })
    .where(eq(siteSettings.id, 1));
  return { token, url: displayPortalUrl(token), created: true };
}

export async function rotateDisplayToken(): Promise<{
  token: string;
  url: string;
}> {
  await ensureSettingsRow();
  const db = getDb();
  const token = createDisplayToken();
  await db
    .update(siteSettings)
    .set({ displayToken: token, updatedAt: new Date() })
    .where(eq(siteSettings.id, 1));
  return { token, url: displayPortalUrl(token) };
}

export async function isValidDisplayToken(token: string): Promise<boolean> {
  if (!token || token.length < 10) return false;
  const db = getDb();
  const [row] = await db
    .select({ displayToken: siteSettings.displayToken })
    .from(siteSettings)
    .where(eq(siteSettings.id, 1))
    .limit(1);
  return !!row?.displayToken && row.displayToken === token;
}
