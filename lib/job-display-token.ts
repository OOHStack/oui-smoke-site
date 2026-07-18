import { getDb } from "@/lib/db";
import { jobs } from "@/lib/db/schema";
import { createDisplayToken, jobDisplayPortalUrl } from "@/lib/guest";
import { eq } from "drizzle-orm";

export async function getOrCreateJobDisplayToken(jobId: number): Promise<{
  token: string;
  url: string;
  created: boolean;
} | null> {
  const db = getDb();
  const [row] = await db
    .select({
      id: jobs.id,
      displayToken: jobs.displayToken,
    })
    .from(jobs)
    .where(eq(jobs.id, jobId))
    .limit(1);
  if (!row) return null;

  if (row.displayToken) {
    return {
      token: row.displayToken,
      url: jobDisplayPortalUrl(row.displayToken),
      created: false,
    };
  }

  const token = createDisplayToken();
  await db
    .update(jobs)
    .set({ displayToken: token, updatedAt: new Date() })
    .where(eq(jobs.id, jobId));
  return { token, url: jobDisplayPortalUrl(token), created: true };
}

export async function rotateJobDisplayToken(jobId: number): Promise<{
  token: string;
  url: string;
} | null> {
  const db = getDb();
  const [row] = await db
    .select({ id: jobs.id })
    .from(jobs)
    .where(eq(jobs.id, jobId))
    .limit(1);
  if (!row) return null;

  const token = createDisplayToken();
  await db
    .update(jobs)
    .set({ displayToken: token, updatedAt: new Date() })
    .where(eq(jobs.id, jobId));
  return { token, url: jobDisplayPortalUrl(token) };
}

export async function findJobIdByDisplayToken(
  token: string,
): Promise<number | null> {
  if (!token || token.length < 10) return null;
  const db = getDb();
  const [row] = await db
    .select({ id: jobs.id })
    .from(jobs)
    .where(eq(jobs.displayToken, token))
    .limit(1);
  return row?.id ?? null;
}
