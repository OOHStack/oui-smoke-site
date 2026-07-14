import { requireApiSession } from "@/lib/auth/api";
import { getDb } from "@/lib/db";
import { hookahs, jobHookahs, jobs, serviceRequests } from "@/lib/db/schema";
import { createSseResponse } from "@/lib/sse";
import { desc, eq, inArray } from "drizzle-orm";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function loadRequests() {
  const db = getDb();
  return db
    .select({
      id: serviceRequests.id,
      type: serviceRequests.type,
      message: serviceRequests.message,
      status: serviceRequests.status,
      flavourId: serviceRequests.flavourId,
      flavourLabel: serviceRequests.flavourLabel,
      priceCents: serviceRequests.priceCents,
      priceAgreed: serviceRequests.priceAgreed,
      createdAt: serviceRequests.createdAt,
      acknowledgedAt: serviceRequests.acknowledgedAt,
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
}

export async function GET(request: Request) {
  const { error } = await requireApiSession();
  if (error) return error;

  return createSseResponse({
    signal: request.signal,
    intervalMs: 1500,
    getPayload: async () => ({ requests: await loadRequests() }),
  });
}
