import { requireApiSession } from "@/lib/auth/api";
import { getDb } from "@/lib/db";
import { jobEvents, jobHookahs, jobs, payments, serviceRequests } from "@/lib/db/schema";
import { createSseResponse } from "@/lib/sse";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type RouteContext = { params: Promise<{ id: string }> };

async function loadJobSnapshot(id: number) {
  const db = getDb();
  const [job] = await db.select().from(jobs).where(eq(jobs.id, id));
  if (!job) return null;

  const assignments = await db.query.jobHookahs.findMany({
    where: eq(jobHookahs.jobId, id),
    with: { hookah: true, flavour: true },
    orderBy: [asc(jobHookahs.sortOrder), asc(jobHookahs.id)],
  });

  const activeCalls = await db
    .select({
      id: serviceRequests.id,
      jobHookahId: serviceRequests.jobHookahId,
      type: serviceRequests.type,
      message: serviceRequests.message,
      status: serviceRequests.status,
      flavourId: serviceRequests.flavourId,
      flavourLabel: serviceRequests.flavourLabel,
      priceCents: serviceRequests.priceCents,
      priceAgreed: serviceRequests.priceAgreed,
      createdAt: serviceRequests.createdAt,
      acknowledgedAt: serviceRequests.acknowledgedAt,
    })
    .from(serviceRequests)
    .where(
      and(
        eq(serviceRequests.jobId, id),
        inArray(serviceRequests.status, ["open", "acknowledged"]),
      ),
    );

  const callByAssignment = new Map(activeCalls.map((c) => [c.jobHookahId, c]));
  const assignmentsWithCalls = assignments.map((a) => ({
    ...a,
    activeCall: callByAssignment.get(a.id) ?? null,
  }));

  const events = await db
    .select()
    .from(jobEvents)
    .where(eq(jobEvents.jobId, id))
    .orderBy(desc(jobEvents.createdAt));

  const paymentRows = await db
    .select()
    .from(payments)
    .where(eq(payments.jobId, id));

  return {
    ...job,
    assignments: assignmentsWithCalls,
    events,
    payments: paymentRows,
  };
}

export async function GET(request: Request, context: RouteContext) {
  const { error } = await requireApiSession();
  if (error) return error;

  const { id: idParam } = await context.params;
  const id = Number(idParam);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "Invalid job id" }, { status: 400 });
  }

  return createSseResponse({
    signal: request.signal,
    intervalMs: 2000,
    getPayload: async () => {
      const snapshot = await loadJobSnapshot(id);
      if (!snapshot) return { error: "not_found" };
      return { job: snapshot };
    },
  });
}
