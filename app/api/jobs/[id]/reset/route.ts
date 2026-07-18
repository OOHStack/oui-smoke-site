import { del } from "@vercel/blob";
import { requireApiAdmin } from "@/lib/auth/api";
import { verifySessionPassword } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import {
  flavours,
  hookahRefills,
  jobEvents,
  jobHookahs,
  jobPhotos,
  jobs,
  payments,
  serviceRequests,
} from "@/lib/db/schema";
import { releaseJobHookahsToAvailable } from "@/lib/fleet";
import { and, eq, inArray, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Clear operational / test activity on a job while keeping the job shell
 * (details, packing notes, staged assignments, client portal token).
 * Clears prep-board packed marks, flavour assignments, and analytics counters
 * contributed by this job (outcome, refills, checks, flavour timesUsed).
 */
export async function POST(request: Request, context: RouteContext) {
  const { session, error } = await requireApiAdmin();
  if (error || !session) return error!;

  const { id: idParam } = await context.params;
  const jobId = Number(idParam);
  if (!Number.isFinite(jobId)) {
    return NextResponse.json({ error: "Invalid job id" }, { status: 400 });
  }

  let body: { password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const password = typeof body.password === "string" ? body.password : "";
  if (!password) {
    return NextResponse.json({ error: "Password required" }, { status: 400 });
  }

  const ok = await verifySessionPassword(session, password);
  if (!ok) {
    return NextResponse.json({ error: "Incorrect password" }, { status: 403 });
  }

  const db = getDb();
  const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  const photos = await db
    .select()
    .from(jobPhotos)
    .where(eq(jobPhotos.jobId, jobId));

  for (const photo of photos) {
    try {
      await del(photo.url, { token: process.env.BLOB_READ_WRITE_TOKEN });
    } catch (err) {
      console.error("blob delete failed on reset", err);
    }
  }

  // Capture flavour usage before wiping so Top flavours / timesUsed stay honest.
  const assignmentRows = await db
    .select({ flavourId: jobHookahs.flavourId })
    .from(jobHookahs)
    .where(eq(jobHookahs.jobId, jobId));
  const refillRows = await db
    .select({ flavourId: hookahRefills.flavourId })
    .from(hookahRefills)
    .where(eq(hookahRefills.jobId, jobId));

  const flavourDecrements = new Map<number, number>();
  const bumpFlavour = (flavourId: number | null | undefined) => {
    if (flavourId == null) return;
    flavourDecrements.set(
      flavourId,
      (flavourDecrements.get(flavourId) ?? 0) + 1,
    );
  };
  for (const row of refillRows) bumpFlavour(row.flavourId);
  // Reverse assignment / send-out flavour bumps (best-effort; clamped at 0).
  for (const row of assignmentRows) bumpFlavour(row.flavourId);

  await db.delete(jobPhotos).where(eq(jobPhotos.jobId, jobId));
  await db.delete(hookahRefills).where(eq(hookahRefills.jobId, jobId));
  await db.delete(jobEvents).where(eq(jobEvents.jobId, jobId));
  await db.delete(serviceRequests).where(eq(serviceRequests.jobId, jobId));
  // Guest ledger rows only — keep succeeded package deposit/balance history
  await db
    .delete(payments)
    .where(
      and(
        eq(payments.jobId, jobId),
        inArray(payments.kind, ["onsite_unit", "refill", "tip", "other"]),
      ),
    );

  for (const [flavourId, amount] of flavourDecrements) {
    await db
      .update(flavours)
      .set({
        timesUsed: sql`greatest(${flavours.timesUsed} - ${amount}, 0)`,
      })
      .where(eq(flavours.id, flavourId));
  }

  await db
    .update(jobHookahs)
    .set({
      status: "staged",
      sentOutAt: null,
      returnedAt: null,
      lastCheckedAt: null,
      nextCheckAt: null,
      checkCount: 0,
      refillCount: 0,
      sortOrder: 0,
      outNotes: "",
      returnNotes: "",
      returnOutcome: null,
      issueFlag: false,
      guestToken: null,
      guestPayTier: null,
      guestRating: null,
      guestComment: "",
      guestFeedbackAt: null,
      displayQrAt: null,
      // Prep board “packed” marks — so kitchen queue starts fresh
      prepCompletedAt: null,
      flavourId: null,
      flavourLabel: "",
    })
    .where(eq(jobHookahs.jobId, jobId));

  await releaseJobHookahsToAvailable(db, jobId);

  const nextStatus =
    job.status === "active" || job.status === "completed"
      ? "confirmed"
      : job.status;

  await db
    .update(jobs)
    .set({
      status: nextStatus,
      actualCents: null,
      tipCents: 0,
      tipSplitJson: "",
      outcomeNotes: "",
      rating: null,
      rebookLikely: null,
      incidentCount: 0,
      updatedAt: new Date(),
    })
    .where(eq(jobs.id, jobId));

  await db.insert(jobEvents).values({
    jobId,
    type: "note",
    message:
      "Job reset — cleared floor activity, flavours, prep board, ledger, requests, photos, outcomes, and analytics counters",
    createdBy: session.name,
  });

  return NextResponse.json({ ok: true, status: nextStatus });
}
