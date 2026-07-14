import { requireApiAdmin, requireApiSession } from "@/lib/auth/api";
import { getDb } from "@/lib/db";
import {
  cancelOpenServiceRequests,
  countOutAssignments,
  releaseJobHookahsToAvailable,
} from "@/lib/fleet";
import { createClientToken, clientPortalUrl } from "@/lib/guest";
import {
  notifyBookingConfirmed,
  notifyJobCompleted,
} from "@/lib/email/workflow";
import { maybeAutoSendDeposit } from "@/lib/auto-deposit";
import { summarizeJobMoney } from "@/lib/job-balance";
import { normalizePaymentModel } from "@/lib/payment-model";
import { jobEvents, jobHookahs, jobs, payments, serviceRequests } from "@/lib/db/schema";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { error } = await requireApiSession();
  if (error) return error;

  const { id: idParam } = await context.params;
  const id = Number(idParam);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "Invalid job id" }, { status: 400 });
  }

  const db = getDb();

  const [job] = await db.select().from(jobs).where(eq(jobs.id, id));
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  const assignments = await db.query.jobHookahs.findMany({
    where: eq(jobHookahs.jobId, id),
    with: {
      hookah: true,
      flavour: true,
    },
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

  const callByAssignment = new Map(
    activeCalls.map((c) => [c.jobHookahId, c]),
  );

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

  return NextResponse.json({
    ...job,
    clientPortalUrl: job.clientToken ? clientPortalUrl(job.clientToken) : null,
    assignments: assignmentsWithCalls,
    events,
    paymentSummary: summarizeJobMoney(job, paymentRows),
  });
}

export async function PATCH(request: Request, context: RouteContext) {
  const { session, error } = await requireApiSession();
  if (error) return error;

  const { id: idParam } = await context.params;
  const id = Number(idParam);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "Invalid job id" }, { status: 400 });
  }

  try {
    const body = await request.json();
    const db = getDb();

    const [existing] = await db.select().from(jobs).where(eq(jobs.id, id));
    if (!existing) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    if (body.ensureClientToken === true) {
      if (existing.clientToken) {
        return NextResponse.json({
          ...existing,
          clientPortalUrl: clientPortalUrl(existing.clientToken),
        });
      }
      const token = createClientToken();
      const [updated] = await db
        .update(jobs)
        .set({ clientToken: token, updatedAt: new Date() })
        .where(eq(jobs.id, id))
        .returning();
      return NextResponse.json({
        ...updated,
        clientPortalUrl: clientPortalUrl(token),
      });
    }

    const updates: Partial<typeof jobs.$inferInsert> = {};

    const stringFields = [
      "title",
      "clientName",
      "clientEmail",
      "clientPhone",
      "location",
      "staffNames",
      "packingNotes",
      "outcomeNotes",
    ] as const;
    for (const field of stringFields) {
      if (body[field] !== undefined) updates[field] = body[field];
    }

    if (body.startsAt !== undefined) {
      updates.startsAt = body.startsAt ? new Date(body.startsAt) : null;
    }
    if (body.endsAt !== undefined) {
      updates.endsAt = body.endsAt ? new Date(body.endsAt) : null;
    }
    if (body.bookedHours !== undefined) updates.bookedHours = body.bookedHours;
    if (body.checkIntervalMinutes !== undefined) {
      updates.checkIntervalMinutes = body.checkIntervalMinutes;
    }
    if (body.guestCount !== undefined) updates.guestCount = body.guestCount;
    if (body.quotedCents !== undefined) updates.quotedCents = body.quotedCents;
    if (body.actualCents !== undefined) updates.actualCents = body.actualCents;
    if (body.tipCents !== undefined) updates.tipCents = body.tipCents;
    if (body.depositPercent !== undefined) {
      const pct = Number(body.depositPercent);
      if (Number.isFinite(pct)) {
        updates.depositPercent = Math.min(100, Math.max(1, Math.round(pct)));
      }
    }
    if (body.rating !== undefined) updates.rating = body.rating;
    if (body.rebookLikely !== undefined) updates.rebookLikely = body.rebookLikely;
    if (body.status !== undefined) updates.status = body.status;
    if (body.paymentModel !== undefined) {
      updates.paymentModel = normalizePaymentModel(body.paymentModel);
    }

    if (body.status === "active") {
      updates.updatedAt = new Date();
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    const nextStatus = body.status as string | undefined;
    const statusChanging =
      typeof nextStatus === "string" && nextStatus !== existing.status;

    if (statusChanging && nextStatus === "completed") {
      const stillOut = await countOutAssignments(db, id);
      if (stillOut > 0) {
        return NextResponse.json(
          {
            error: `Return all floor hookahs before completing (${stillOut} still out)`,
          },
          { status: 400 },
        );
      }
    }

    if (
      statusChanging &&
      (nextStatus === "completed" || nextStatus === "cancelled")
    ) {
      await cancelOpenServiceRequests(db, {
        jobId: id,
        cancelledBy: session.name,
      });
      await releaseJobHookahsToAvailable(db, id);
      // Keep guestToken so QR pages become feedback + rebook after close-out
    }

    const [job] = await db.update(jobs).set(updates).where(eq(jobs.id, id)).returning();

    if (statusChanging) {
      await db.insert(jobEvents).values({
        jobId: id,
        type: "status_change",
        message: `Status changed from ${existing.status} to ${nextStatus}`,
        createdBy: session.name,
      });

      if (nextStatus === "confirmed" && existing.status !== "confirmed") {
        await notifyBookingConfirmed(job);
      }
      if (nextStatus === "completed" && existing.status !== "completed") {
        await notifyJobCompleted(job);
      }
    }

    // Auto-send deposit when a package quote is first saved / updated
    let autoDeposit: Awaited<ReturnType<typeof maybeAutoSendDeposit>> | null =
      null;
    if (
      body.quotedCents !== undefined &&
      body.quotedCents != null &&
      body.quotedCents !== existing.quotedCents
    ) {
      autoDeposit = await maybeAutoSendDeposit(id, "quote");
    }

    return NextResponse.json({
      ...job,
      autoDeposit: autoDeposit
        ? { sent: autoDeposit.sent, reason: autoDeposit.reason }
        : undefined,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Update failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { session, error } = await requireApiAdmin();
  if (error) return error;

  const { id: idParam } = await context.params;
  const id = Number(idParam);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "Invalid job id" }, { status: 400 });
  }

  const db = getDb();
  const [existing] = await db.select().from(jobs).where(eq(jobs.id, id));
  if (!existing) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  // Release fleet before cascade deletes assignments
  await cancelOpenServiceRequests(db, {
    jobId: id,
    cancelledBy: session.name,
  });
  await releaseJobHookahsToAvailable(db, id);

  await db.delete(jobs).where(eq(jobs.id, id));

  return NextResponse.json({ ok: true });
}
