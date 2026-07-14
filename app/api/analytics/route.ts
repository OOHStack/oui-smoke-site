import { requireApiSession } from "@/lib/auth/api";
import { getDb } from "@/lib/db";
import {
  flavours,
  hookahRefills,
  hookahs,
  jobHookahs,
  jobPhotos,
  jobs,
  serviceRequests,
} from "@/lib/db/schema";
import { and, avg, count, desc, eq, gt, isNotNull, lt, sql, sum } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function GET() {
  const { error } = await requireApiSession();
  if (error) return error;

  const db = getDb();
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const statusRows = await db
    .select({ status: jobs.status, count: count() })
    .from(jobs)
    .groupBy(jobs.status);

  const jobsByStatus = Object.fromEntries(
    statusRows.map((r) => [r.status, Number(r.count)]),
  );

  const [completed30d] = await db
    .select({ count: count() })
    .from(jobs)
    .where(and(eq(jobs.status, "completed"), gt(jobs.updatedAt, thirtyDaysAgo)));

  const [ratingRow] = await db
    .select({ avgRating: avg(jobs.rating) })
    .from(jobs)
    .where(and(eq(jobs.status, "completed"), sql`${jobs.rating} IS NOT NULL`));

  const [revenueRow] = await db
    .select({
      totalRevenueCents: sum(jobs.actualCents),
      totalTipsCents: sum(jobs.tipCents),
    })
    .from(jobs)
    .where(eq(jobs.status, "completed"));

  const [refillRevenueRow] = await db
    .select({ totalRefillCents: sum(hookahRefills.priceCents) })
    .from(hookahRefills);

  const jobRevenueCents = Number(revenueRow?.totalRevenueCents ?? 0);
  const refillRevenueCents = Number(refillRevenueRow?.totalRefillCents ?? 0);

  const [checkStats] = await db
    .select({
      totalChecks: sum(jobHookahs.checkCount),
    })
    .from(jobHookahs);

  const [currentlyOutRow] = await db
    .select({ count: count() })
    .from(jobHookahs)
    .where(eq(jobHookahs.status, "out"));

  const [overdueRow] = await db
    .select({ count: count() })
    .from(jobHookahs)
    .where(
      and(
        eq(jobHookahs.status, "out"),
        sql`${jobHookahs.nextCheckAt} IS NOT NULL`,
        lt(jobHookahs.nextCheckAt, now),
      ),
    );

  const totalChecks = Number(checkStats?.totalChecks ?? 0);
  const overdueChecks = Number(overdueRow?.count ?? 0);
  const checkCompliance =
    totalChecks + overdueChecks > 0
      ? Math.round((totalChecks / (totalChecks + overdueChecks)) * 100)
      : 100;

  const topFlavourRows = await db
    .select({
      id: flavours.id,
      name: flavours.name,
      kind: flavours.kind,
      timesUsed: flavours.timesUsed,
    })
    .from(flavours)
    .orderBy(desc(flavours.timesUsed))
    .limit(8);

  const fleetRows = await db
    .select({ status: hookahs.status, count: count() })
    .from(hookahs)
    .groupBy(hookahs.status);

  const fleet = {
    available: 0,
    out: 0,
    maintenance: 0,
    retired: 0,
  };
  for (const row of fleetRows) {
    fleet[row.status] = Number(row.count);
  }

  const repeatClientRows = await db
    .select({ clientName: jobs.clientName, jobCount: count() })
    .from(jobs)
    .where(eq(jobs.status, "completed"))
    .groupBy(jobs.clientName)
    .having(gt(count(), 1));

  const assignmentCountRows = await db
    .select({ cnt: count() })
    .from(jobHookahs)
    .innerJoin(jobs, eq(jobs.id, jobHookahs.jobId))
    .where(eq(jobs.status, "completed"))
    .groupBy(jobHookahs.jobId);

  const avgHookahsPerJob =
    assignmentCountRows.length > 0
      ? assignmentCountRows.reduce((acc, r) => acc + Number(r.cnt), 0) /
        assignmentCountRows.length
      : 0;

  const [incidentsRow] = await db
    .select({ count: sum(jobs.incidentCount) })
    .from(jobs)
    .where(gt(jobs.updatedAt, thirtyDaysAgo));

  const [ackTiming] = await db
    .select({
      avgAckSeconds: avg(
        sql<number>`extract(epoch from (${serviceRequests.acknowledgedAt} - ${serviceRequests.createdAt}))`,
      ),
      sampleCount: count(),
    })
    .from(serviceRequests)
    .where(
      and(
        isNotNull(serviceRequests.acknowledgedAt),
        gt(serviceRequests.createdAt, thirtyDaysAgo),
      ),
    );

  const [resolveTiming] = await db
    .select({
      avgResolveSeconds: avg(
        sql<number>`extract(epoch from (${serviceRequests.resolvedAt} - ${serviceRequests.createdAt}))`,
      ),
    })
    .from(serviceRequests)
    .where(
      and(
        isNotNull(serviceRequests.resolvedAt),
        gt(serviceRequests.createdAt, thirtyDaysAgo),
      ),
    );

  const [ugcRow] = await db
    .select({
      approved: sql<number>`count(*) filter (where ${jobPhotos.approvedForSocial})`,
      featured: sql<number>`count(*) filter (where ${jobPhotos.featured})`,
      total: count(),
    })
    .from(jobPhotos);

  return NextResponse.json({
    jobsByStatus,
    jobsCompleted30d: Number(completed30d?.count ?? 0),
    avgRating: ratingRow?.avgRating ? Number(ratingRow.avgRating) : null,
    totalRevenueCents: jobRevenueCents + refillRevenueCents,
    jobRevenueCents,
    refillRevenueCents,
    totalTipsCents: Number(revenueRow?.totalTipsCents ?? 0),
    checkCompliance,
    currentlyOut: Number(currentlyOutRow?.count ?? 0),
    overdueChecks,
    topFlavours: topFlavourRows,
    fleet,
    repeatClients: repeatClientRows.length,
    avgHookahsPerJob,
    incidents30d: Number(incidentsRow?.count ?? 0),
    avgAckSeconds:
      ackTiming?.avgAckSeconds != null ? Number(ackTiming.avgAckSeconds) : null,
    avgResolveSeconds:
      resolveTiming?.avgResolveSeconds != null
        ? Number(resolveTiming.avgResolveSeconds)
        : null,
    responseSampleCount: Number(ackTiming?.sampleCount ?? 0),
    ugcApproved: Number(ugcRow?.approved ?? 0),
    ugcFeatured: Number(ugcRow?.featured ?? 0),
    ugcTotal: Number(ugcRow?.total ?? 0),
  });
}
