import { getDb } from "@/lib/db";
import { hookahs, jobHookahs, jobs, serviceRequests } from "@/lib/db/schema";
import { and, eq, inArray, ne } from "drizzle-orm";

type Db = ReturnType<typeof getDb>;

/** True if this hookah is currently out on a different active job. */
export async function hookahOutOnOtherActiveJob(
  db: Db,
  hookahId: number,
  jobId: number,
) {
  const [row] = await db
    .select({ id: jobHookahs.id })
    .from(jobHookahs)
    .innerJoin(jobs, eq(jobs.id, jobHookahs.jobId))
    .where(
      and(
        eq(jobHookahs.hookahId, hookahId),
        eq(jobHookahs.status, "out"),
        eq(jobs.status, "active"),
        ne(jobHookahs.jobId, jobId),
      ),
    )
    .limit(1);
  return !!row;
}

/** Cancel open/acknowledged guest calls for one assignment or a whole job. */
export async function cancelOpenServiceRequests(
  db: Db,
  opts: {
    jobId?: number;
    jobHookahId?: number;
    cancelledBy?: string;
  },
) {
  const conditions = [
    inArray(serviceRequests.status, ["open", "acknowledged"]),
  ];
  if (opts.jobId != null) conditions.push(eq(serviceRequests.jobId, opts.jobId));
  if (opts.jobHookahId != null) {
    conditions.push(eq(serviceRequests.jobHookahId, opts.jobHookahId));
  }
  if (opts.jobId == null && opts.jobHookahId == null) return;

  await db
    .update(serviceRequests)
    .set({
      status: "cancelled",
      resolvedAt: new Date(),
      resolvedBy: opts.cancelledBy ?? "system",
    })
    .where(and(...conditions));
}

/**
 * Clear fleet units stuck "out" on this job (delete/cancel/complete orphans).
 * Leaves maintenance/retired/available alone.
 */
export async function releaseJobHookahsToAvailable(db: Db, jobId: number) {
  const assignments = await db
    .select({ hookahId: jobHookahs.hookahId })
    .from(jobHookahs)
    .where(eq(jobHookahs.jobId, jobId));

  const hookahIds = [...new Set(assignments.map((a) => a.hookahId))];
  if (hookahIds.length === 0) return;

  await db
    .update(hookahs)
    .set({ status: "available" })
    .where(and(inArray(hookahs.id, hookahIds), eq(hookahs.status, "out")));
}

/** Count assignments still on the floor for a job. */
export async function countOutAssignments(db: Db, jobId: number) {
  const rows = await db
    .select({ id: jobHookahs.id })
    .from(jobHookahs)
    .where(and(eq(jobHookahs.jobId, jobId), eq(jobHookahs.status, "out")));
  return rows.length;
}
