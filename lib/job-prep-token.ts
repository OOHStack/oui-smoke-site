import { getDb } from "@/lib/db";
import { jobs } from "@/lib/db/schema";
import { createPrepToken, prepPortalUrl } from "@/lib/guest";
import { eq } from "drizzle-orm";

export async function getOrCreateJobPrepToken(jobId: number): Promise<{
  token: string;
  url: string;
  created: boolean;
} | null> {
  const db = getDb();
  const [row] = await db
    .select({
      id: jobs.id,
      prepToken: jobs.prepToken,
    })
    .from(jobs)
    .where(eq(jobs.id, jobId))
    .limit(1);
  if (!row) return null;

  if (row.prepToken) {
    return {
      token: row.prepToken,
      url: prepPortalUrl(row.prepToken),
      created: false,
    };
  }

  const token = createPrepToken();
  await db
    .update(jobs)
    .set({ prepToken: token, updatedAt: new Date() })
    .where(eq(jobs.id, jobId));
  return { token, url: prepPortalUrl(token), created: true };
}

export async function rotateJobPrepToken(jobId: number): Promise<{
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

  const token = createPrepToken();
  await db
    .update(jobs)
    .set({ prepToken: token, updatedAt: new Date() })
    .where(eq(jobs.id, jobId));
  return { token, url: prepPortalUrl(token) };
}

export async function findJobIdByPrepToken(
  token: string,
): Promise<number | null> {
  if (!token || token.length < 10) return null;
  const db = getDb();
  const [row] = await db
    .select({ id: jobs.id })
    .from(jobs)
    .where(eq(jobs.prepToken, token))
    .limit(1);
  return row?.id ?? null;
}
