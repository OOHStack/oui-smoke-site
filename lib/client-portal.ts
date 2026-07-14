import { getDb } from "@/lib/db";
import {
  hookahRefills,
  hookahs,
  jobHookahs,
  jobPhotos,
  jobs,
  serviceRequests,
} from "@/lib/db/schema";
import { and, asc, count, eq, inArray, sum } from "drizzle-orm";

export async function loadClientPortalSnapshot(token: string) {
  const db = getDb();
  const [job] = await db
    .select({
      id: jobs.id,
      title: jobs.title,
      clientName: jobs.clientName,
      location: jobs.location,
      status: jobs.status,
      startsAt: jobs.startsAt,
      endsAt: jobs.endsAt,
      guestCount: jobs.guestCount,
    })
    .from(jobs)
    .where(eq(jobs.clientToken, token))
    .limit(1);

  if (!job) return { error: "not_found" as const };

  const assignments = await db
    .select({
      id: jobHookahs.id,
      status: jobHookahs.status,
      modelNumber: hookahs.modelNumber,
      flavourLabel: jobHookahs.flavourLabel,
      sentOutAt: jobHookahs.sentOutAt,
      refillCount: jobHookahs.refillCount,
      nextCheckAt: jobHookahs.nextCheckAt,
    })
    .from(jobHookahs)
    .innerJoin(hookahs, eq(hookahs.id, jobHookahs.hookahId))
    .where(eq(jobHookahs.jobId, job.id));

  const openCalls = await db
    .select({
      id: serviceRequests.id,
      type: serviceRequests.type,
      status: serviceRequests.status,
      modelNumber: hookahs.modelNumber,
      flavourLabel: serviceRequests.flavourLabel,
      createdAt: serviceRequests.createdAt,
      acknowledgedAt: serviceRequests.acknowledgedAt,
    })
    .from(serviceRequests)
    .innerJoin(jobHookahs, eq(jobHookahs.id, serviceRequests.jobHookahId))
    .innerJoin(hookahs, eq(hookahs.id, jobHookahs.hookahId))
    .where(
      and(
        eq(serviceRequests.jobId, job.id),
        inArray(serviceRequests.status, ["open", "acknowledged"]),
      ),
    );

  const [refillRow] = await db
    .select({
      totalCents: sum(hookahRefills.priceCents),
      refillCount: count(),
    })
    .from(hookahRefills)
    .where(eq(hookahRefills.jobId, job.id));

  let photos: Array<{ id: number; url: string; createdAt: Date }> = [];
  try {
    photos = await db
      .select({
        id: jobPhotos.id,
        url: jobPhotos.url,
        createdAt: jobPhotos.createdAt,
      })
      .from(jobPhotos)
      .where(eq(jobPhotos.jobId, job.id))
      .orderBy(asc(jobPhotos.createdAt))
      .limit(40);
  } catch (err) {
    console.error("client portal photos query failed", err);
  }

  const out = assignments.filter((a) => a.status === "out");
  const staged = assignments.filter((a) => a.status === "staged");
  const returned = assignments.filter((a) => a.status === "returned");

  return {
    job: {
      title: job.title,
      clientName: job.clientName,
      location: job.location,
      status: job.status,
      startsAt: job.startsAt,
      endsAt: job.endsAt,
      guestCount: job.guestCount,
    },
    counts: {
      total: assignments.length,
      out: out.length,
      staged: staged.length,
      returned: returned.length,
      openCalls: openCalls.length,
    },
    floor: out.map((a) => ({
      modelNumber: a.modelNumber,
      flavour: a.flavourLabel || "—",
      sentOutAt: a.sentOutAt,
      refillCount: a.refillCount,
    })),
    calls: openCalls.map((c) => ({
      id: c.id,
      type: c.type,
      status: c.status,
      modelNumber: c.modelNumber,
      flavourLabel: c.flavourLabel,
      createdAt: c.createdAt,
      acknowledgedAt: c.acknowledgedAt,
    })),
    refillSpendCents: Number(refillRow?.totalCents ?? 0),
    refillCount: Number(refillRow?.refillCount ?? 0),
    photos: photos.map((p) => ({
      id: p.id,
      url: p.url,
      createdAt: p.createdAt,
    })),
    wrapped: job.status === "completed" || job.status === "cancelled",
    serverTime: new Date().toISOString(),
  };
}
