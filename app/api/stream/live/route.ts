import { requireApiSession } from "@/lib/auth/api";
import { getDb } from "@/lib/db";
import { hookahs, jobHookahs, jobs, serviceRequests } from "@/lib/db/schema";
import { onsiteUnitPaymentMap } from "@/lib/ops/onsite-pay";
import { guestRefillPaymentMap } from "@/lib/refill-payment-link";
import { isSquareTerminalReady } from "@/lib/square-status";
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
      paymentModel: jobs.paymentModel,
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
            guestPayTier: jobHookahs.guestPayTier,
            hookahModel: hookahs.modelNumber,
            hookahLabel: hookahs.label,
          })
          .from(jobHookahs)
          .innerJoin(hookahs, eq(hookahs.id, jobHookahs.hookahId))
          .where(
            and(inArray(jobHookahs.jobId, jobIds), eq(jobHookahs.status, "out")),
          )
          .orderBy(asc(jobHookahs.nextCheckAt));

  const unitPay = await onsiteUnitPaymentMap(outRows.map((r) => r.assignmentId));

  const items = outRows.map((row) => {
    const job = jobMap.get(row.jobId);
    const pay = unitPay.get(row.assignmentId);
    return {
      assignmentId: row.assignmentId,
      jobId: row.jobId,
      jobTitle: job?.title ?? "",
      clientName: job?.clientName ?? "",
      paymentModel: job?.paymentModel ?? null,
      hookahModel: row.hookahModel,
      hookahLabel: row.hookahLabel,
      flavourName: row.flavourLabel || null,
      guestPayTier: row.guestPayTier,
      nextCheckAt: row.nextCheckAt,
      issueFlag: row.issueFlag,
      unitPaymentStatus: pay?.status ?? null,
    };
  });

  const callRows = await db
    .select({
      id: serviceRequests.id,
      type: serviceRequests.type,
      status: serviceRequests.status,
      message: serviceRequests.message,
      flavourLabel: serviceRequests.flavourLabel,
      priceCents: serviceRequests.priceCents,
      payPreference: serviceRequests.payPreference,
      requestedGuestPayTier: serviceRequests.requestedGuestPayTier,
      jobId: serviceRequests.jobId,
      assignmentId: serviceRequests.jobHookahId,
      modelNumber: hookahs.modelNumber,
      jobTitle: jobs.title,
      clientName: jobs.clientName,
      acknowledgedBy: serviceRequests.acknowledgedBy,
      acknowledgedAt: serviceRequests.acknowledgedAt,
    })
    .from(serviceRequests)
    .innerJoin(jobs, eq(jobs.id, serviceRequests.jobId))
    .leftJoin(jobHookahs, eq(jobHookahs.id, serviceRequests.jobHookahId))
    .leftJoin(hookahs, eq(hookahs.id, jobHookahs.hookahId))
    .where(inArray(serviceRequests.status, ["open", "acknowledged"]))
    .orderBy(desc(serviceRequests.createdAt))
    .limit(50);

  const payMap = await guestRefillPaymentMap(
    callRows
      .filter((c) => c.type === "refill" || c.type === "order_unit")
      .map((c) => c.id),
  );
  const unitPayMap = await onsiteUnitPaymentMap(
    callRows
      .filter((c) => c.type === "order_unit" && c.assignmentId != null)
      .map((c) => c.assignmentId as number),
  );

  const calls = callRows.map((c) => {
    const pay = payMap.get(c.id);
    const unitPay =
      c.type === "order_unit" && c.assignmentId != null
        ? unitPayMap.get(c.assignmentId)
        : undefined;
    const paymentStatus =
      pay?.paymentStatus === "succeeded" || unitPay?.status === "succeeded"
        ? "succeeded"
        : pay?.paymentStatus ?? unitPay?.status ?? null;
    return {
      ...c,
      paymentStatus,
      checkoutUrl: pay?.checkoutUrl ?? null,
    };
  });

  const terminalReady = await isSquareTerminalReady();

  return { items, calls, terminalReady };
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
