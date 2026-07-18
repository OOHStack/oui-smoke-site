import { del } from "@vercel/blob";
import { requireApiAdmin } from "@/lib/auth/api";
import { verifySessionPassword } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import {
  hookahRefills,
  jobEvents,
  jobHookahs,
  jobPhotos,
  jobs,
  payments,
  serviceRequests,
} from "@/lib/db/schema";
import { releaseJobHookahsToAvailable } from "@/lib/fleet";
import { and, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Clear operational / test activity on a job while keeping the job shell
 * (details, packing notes, staged assignments, client portal token).
 * Clears prep-board packed marks and flavour assignments on units.
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
      "Job reset — cleared floor activity, flavours, prep board, ledger, requests, photos, and outcomes",
    createdBy: session.name,
  });

  return NextResponse.json({ ok: true, status: nextStatus });
}
