import { requireApiSession } from "@/lib/auth/api";
import { getDb } from "@/lib/db";
import { hookahs, jobHookahs, jobs, serviceRequests } from "@/lib/db/schema";
import { createSseResponse } from "@/lib/sse";
import { and, asc, desc, eq, inArray } from "drizzle-orm";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function loadLiveFloor() {
  const db = getDb();

  const activeJobs = await db
    .select({
      id: jobs.id,
      title: jobs.title,
      clientName: jobs.clientName,
    })
    .from(jobs)
    .where(inArray(jobs.status, ["active", "confirmed"]));

  const jobIds = activeJobs.map((j) => j.id);
  const jobMap = new Map(activeJobs.map((j) => [j.id, j]));

  const outRows =
    jobIds.length === 0
      ? []
      : await db
          .select({
            assignmentId: jobHookahs.id,
            jobId: jobHookahs.jobId,
            nextCheckAt: jobHookahs.nextCheckAt,
            issueFlag: jobHookahs.issueFlag,
            flavourLabel: jobHookahs.flavourLabel,
            hookahModel: hookahs.modelNumber,
            hookahLabel: hookahs.label,
          })
          .from(jobHookahs)
          .innerJoin(hookahs, eq(hookahs.id, jobHookahs.hookahId))
          .where(
            and(inArray(jobHookahs.jobId, jobIds), eq(jobHookahs.status, "out")),
          )
          .orderBy(asc(jobHookahs.nextCheckAt));

  const items = outRows.map((row) => {
    const job = jobMap.get(row.jobId);
    return {
      assignmentId: row.assignmentId,
      jobId: row.jobId,
      jobTitle: job?.title ?? "",
      clientName: job?.clientName ?? "",
      hookahModel: row.hookahModel,
      hookahLabel: row.hookahLabel,
      flavourName: row.flavourLabel || null,
      nextCheckAt: row.nextCheckAt,
      issueFlag: row.issueFlag,
    };
  });

  const calls = await db
    .select({
      id: serviceRequests.id,
      type: serviceRequests.type,
      status: serviceRequests.status,
      message: serviceRequests.message,
      flavourLabel: serviceRequests.flavourLabel,
      priceCents: serviceRequests.priceCents,
      jobId: serviceRequests.jobId,
      assignmentId: serviceRequests.jobHookahId,
      modelNumber: hookahs.modelNumber,
      jobTitle: jobs.title,
    })
    .from(serviceRequests)
    .innerJoin(jobs, eq(jobs.id, serviceRequests.jobId))
    .innerJoin(jobHookahs, eq(jobHookahs.id, serviceRequests.jobHookahId))
    .innerJoin(hookahs, eq(hookahs.id, jobHookahs.hookahId))
    .where(inArray(serviceRequests.status, ["open", "acknowledged"]))
    .orderBy(desc(serviceRequests.createdAt))
    .limit(50);

  return { items, calls };
}

export async function GET(request: Request) {
  const { error } = await requireApiSession();
  if (error) return error;

  return createSseResponse({
    signal: request.signal,
    intervalMs: 1500,
    getPayload: loadLiveFloor,
  });
}
