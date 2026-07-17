import { requireApiSession } from "@/lib/auth/api";
import { getDb } from "@/lib/db";
import { hookahs, jobHookahs, jobs, serviceRequests } from "@/lib/db/schema";
import { guestRefillPaymentMap } from "@/lib/refill-payment-link";
import { isSquareTerminalReady } from "@/lib/square-status";
import { createSseResponse } from "@/lib/sse";
import { desc, eq, inArray } from "drizzle-orm";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function loadRequests() {
  const db = getDb();
  const rows = await db
    .select({
      id: serviceRequests.id,
      type: serviceRequests.type,
      message: serviceRequests.message,
      status: serviceRequests.status,
      flavourId: serviceRequests.flavourId,
      flavourLabel: serviceRequests.flavourLabel,
      priceCents: serviceRequests.priceCents,
      priceAgreed: serviceRequests.priceAgreed,
      payPreference: serviceRequests.payPreference,
      requestedGuestPayTier: serviceRequests.requestedGuestPayTier,
      createdAt: serviceRequests.createdAt,
      acknowledgedAt: serviceRequests.acknowledgedAt,
      acknowledgedBy: serviceRequests.acknowledgedBy,
      jobId: serviceRequests.jobId,
      jobTitle: jobs.title,
      clientName: jobs.clientName,
      location: jobs.location,
      assignmentId: serviceRequests.jobHookahId,
      modelNumber: hookahs.modelNumber,
      guestToken: jobHookahs.guestToken,
    })
    .from(serviceRequests)
    .innerJoin(jobs, eq(jobs.id, serviceRequests.jobId))
    .innerJoin(jobHookahs, eq(jobHookahs.id, serviceRequests.jobHookahId))
    .innerJoin(hookahs, eq(hookahs.id, jobHookahs.hookahId))
    .where(inArray(serviceRequests.status, ["open", "acknowledged"]))
    .orderBy(desc(serviceRequests.createdAt))
    .limit(50);

  const payMap = await guestRefillPaymentMap(
    rows
      .filter((r) => r.type === "refill" || r.type === "order_unit")
      .map((r) => r.id),
  );

  const requests = rows.map((r) => {
    const pay = payMap.get(r.id);
    return {
      ...r,
      paymentStatus: pay?.paymentStatus ?? null,
      checkoutUrl: pay?.checkoutUrl ?? null,
    };
  });

  return {
    requests,
    terminalReady: await isSquareTerminalReady(),
  };
}

export async function GET(request: Request) {
  const { error } = await requireApiSession();
  if (error) return error;

  return createSseResponse({
    signal: request.signal,
    intervalMs: 1500,
    getPayload: loadRequests,
  });
}
