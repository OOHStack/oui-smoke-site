import { requireApiAdmin, requireApiSession } from "@/lib/auth/api";
import { getDb } from "@/lib/db";
import {
  cancelOpenServiceRequests,
  countOutAssignments,
  releaseJobHookahsToAvailable,
} from "@/lib/fleet";
import {
  createClientToken,
  clientPortalUrl,
  jobDisplayPortalUrl,
  prepPortalUrl,
} from "@/lib/guest";
import {
  getOrCreateJobDisplayToken,
  rotateJobDisplayToken,
} from "@/lib/job-display-token";
import {
  getOrCreateJobPrepToken,
  rotateJobPrepToken,
} from "@/lib/job-prep-token";
import {
  notifyBookingConfirmed,
  notifyJobCompleted,
} from "@/lib/email/workflow";
import { maybeAutoSendDeposit } from "@/lib/auto-deposit";
import { summarizeJobMoney } from "@/lib/job-balance";
import { normalizePaymentModel } from "@/lib/payment-model";
import { jobEvents, jobHookahs, jobs, payments, serviceRequests } from "@/lib/db/schema";
import { computeNextCheckAt } from "@/lib/ops/check-interval";
import { onsiteUnitPaymentMap } from "@/lib/ops/onsite-pay";
import {
  getPricingForJob,
  jobPricingOverrideCount,
  parseJobPricingOverride,
  pricingToPublic,
} from "@/lib/pricing";
import { guestRefillPaymentMap } from "@/lib/refill-payment-link";
import { isSquareTerminalReady } from "@/lib/square-status";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

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
      payPreference: serviceRequests.payPreference,
      createdAt: serviceRequests.createdAt,
      acknowledgedAt: serviceRequests.acknowledgedAt,
      acknowledgedBy: serviceRequests.acknowledgedBy,
    })
    .from(serviceRequests)
    .where(
      and(
        eq(serviceRequests.jobId, id),
        inArray(serviceRequests.status, ["open", "acknowledged"]),
      ),
    );

  const payMap = await guestRefillPaymentMap(
    activeCalls.filter((c) => c.type === "refill").map((c) => c.id),
  );

  const callByAssignment = new Map(
    activeCalls
      .filter((c) => c.jobHookahId != null)
      .map((c) => {
        const pay = payMap.get(c.id);
        return [
          c.jobHookahId as number,
          {
            ...c,
            paymentStatus: pay?.paymentStatus ?? null,
            checkoutUrl: pay?.checkoutUrl ?? null,
          },
        ] as const;
      }),
  );

  const assignmentsWithCalls = assignments.map((a) => ({
    ...a,
    activeCall: callByAssignment.get(a.id) ?? null,
  }));

  const unitPay = await onsiteUnitPaymentMap(assignments.map((a) => a.id));
  const assignmentsEnriched = assignmentsWithCalls.map((a) => ({
    ...a,
    unitPaymentStatus: unitPay.get(a.id)?.status ?? null,
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

  const pricing = await getPricingForJob(job);
  const pricingOverrides = parseJobPricingOverride(job.pricingJson);

  return NextResponse.json(
    {
      ...job,
      clientPortalUrl: job.clientToken ? clientPortalUrl(job.clientToken) : null,
      displayPortalUrl: job.displayToken
        ? jobDisplayPortalUrl(job.displayToken)
        : null,
      prepPortalUrl: job.prepToken ? prepPortalUrl(job.prepToken) : null,
      assignments: assignmentsEnriched,
      events,
      payments: paymentRows,
      paymentSummary: summarizeJobMoney(job, paymentRows),
      pricing: pricingToPublic(pricing),
      pricingOverrides,
      hasCustomPricing: jobPricingOverrideCount(pricingOverrides) > 0,
      terminalReady: await isSquareTerminalReady(),
      snapshotAt: Date.now(),
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
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
          displayPortalUrl: existing.displayToken
            ? jobDisplayPortalUrl(existing.displayToken)
            : null,
          prepPortalUrl: existing.prepToken
            ? prepPortalUrl(existing.prepToken)
            : null,
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
        displayPortalUrl: updated.displayToken
          ? jobDisplayPortalUrl(updated.displayToken)
          : null,
        prepPortalUrl: updated.prepToken
          ? prepPortalUrl(updated.prepToken)
          : null,
      });
    }

    if (body.ensureDisplayToken === true) {
      const link = await getOrCreateJobDisplayToken(id);
      if (!link) {
        return NextResponse.json({ error: "Job not found" }, { status: 404 });
      }
      const [updated] = await db.select().from(jobs).where(eq(jobs.id, id));
      return NextResponse.json({
        ...updated,
        clientPortalUrl: updated?.clientToken
          ? clientPortalUrl(updated.clientToken)
          : null,
        displayToken: link.token,
        displayPortalUrl: link.url,
        prepPortalUrl: updated?.prepToken
          ? prepPortalUrl(updated.prepToken)
          : null,
        created: link.created,
      });
    }

    if (body.rotateDisplayToken === true) {
      if (session.role !== "admin") {
        return NextResponse.json(
          { error: "Only admins can rotate the event display link" },
          { status: 403 },
        );
      }
      const link = await rotateJobDisplayToken(id);
      if (!link) {
        return NextResponse.json({ error: "Job not found" }, { status: 404 });
      }
      const [updated] = await db.select().from(jobs).where(eq(jobs.id, id));
      return NextResponse.json({
        ...updated,
        clientPortalUrl: updated?.clientToken
          ? clientPortalUrl(updated.clientToken)
          : null,
        displayToken: link.token,
        displayPortalUrl: link.url,
        prepPortalUrl: updated?.prepToken
          ? prepPortalUrl(updated.prepToken)
          : null,
        rotated: true,
      });
    }

    if (body.ensurePrepToken === true) {
      const link = await getOrCreateJobPrepToken(id);
      if (!link) {
        return NextResponse.json({ error: "Job not found" }, { status: 404 });
      }
      const [updated] = await db.select().from(jobs).where(eq(jobs.id, id));
      return NextResponse.json({
        ...updated,
        clientPortalUrl: updated?.clientToken
          ? clientPortalUrl(updated.clientToken)
          : null,
        displayPortalUrl: updated?.displayToken
          ? jobDisplayPortalUrl(updated.displayToken)
          : null,
        prepToken: link.token,
        prepPortalUrl: link.url,
        created: link.created,
      });
    }

    if (body.rotatePrepToken === true) {
      if (session.role !== "admin") {
        return NextResponse.json(
          { error: "Only admins can rotate the prep board link" },
          { status: 403 },
        );
      }
      const link = await rotateJobPrepToken(id);
      if (!link) {
        return NextResponse.json({ error: "Job not found" }, { status: 404 });
      }
      const [updated] = await db.select().from(jobs).where(eq(jobs.id, id));
      return NextResponse.json({
        ...updated,
        clientPortalUrl: updated?.clientToken
          ? clientPortalUrl(updated.clientToken)
          : null,
        displayPortalUrl: updated?.displayToken
          ? jobDisplayPortalUrl(updated.displayToken)
          : null,
        prepToken: link.token,
        prepPortalUrl: link.url,
        rotated: true,
      });
    }

    const tipFieldsTouched =
      body.tipCents !== undefined || body.tipSplitJson !== undefined;
    if (tipFieldsTouched && session.role !== "admin") {
      return NextResponse.json(
        { error: "Only admins can edit tips" },
        { status: 403 },
      );
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
      const mins = Number(body.checkIntervalMinutes);
      if (!Number.isFinite(mins)) {
        return NextResponse.json(
          { error: "Check interval must be a number" },
          { status: 400 },
        );
      }
      const rounded = Math.round(mins);
      if (rounded !== 0 && (rounded < 10 || rounded > 180)) {
        return NextResponse.json(
          { error: "Check interval must be Off (0) or 10–180 minutes" },
          { status: 400 },
        );
      }
      updates.checkIntervalMinutes = rounded;
    }
    if (body.guestCount !== undefined) updates.guestCount = body.guestCount;
    if (body.quotedCents !== undefined) updates.quotedCents = body.quotedCents;
    if (body.actualCents !== undefined) updates.actualCents = body.actualCents;
    if (body.tipCents !== undefined) updates.tipCents = body.tipCents;
    if (body.tipSplitJson !== undefined) {
      updates.tipSplitJson =
        typeof body.tipSplitJson === "string" ? body.tipSplitJson : "";
    }
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
    if (body.pricingJson !== undefined || body.pricingOverrides !== undefined) {
      const raw =
        body.pricingJson !== undefined
          ? body.pricingJson
          : body.pricingOverrides;
      if (raw === null) {
        updates.pricingJson = {};
      } else {
        updates.pricingJson = parseJobPricingOverride(raw);
      }
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

    // Sync floor timers when spot-check interval changes (0 = off → clear timers).
    if (
      updates.checkIntervalMinutes !== undefined &&
      updates.checkIntervalMinutes !== existing.checkIntervalMinutes
    ) {
      const now = new Date();
      const nextCheckAt = computeNextCheckAt(job.checkIntervalMinutes, now);
      await db
        .update(jobHookahs)
        .set({ nextCheckAt })
        .where(and(eq(jobHookahs.jobId, id), eq(jobHookahs.status, "out")));
    }

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

    if (updates.pricingJson !== undefined) {
      const nextOverrides = parseJobPricingOverride(job.pricingJson);
      const count = jobPricingOverrideCount(nextOverrides);
      await db.insert(jobEvents).values({
        jobId: id,
        type: "note",
        message:
          count > 0
            ? `Job rates updated · Standard $${nextOverrides.onsiteUnitRate ?? "catalog"} · Unlimited $${nextOverrides.onsiteUnlimitedRate ?? "catalog"} · refill $${
                nextOverrides.refillPriceCents != null
                  ? (nextOverrides.refillPriceCents / 100).toFixed(0)
                  : "catalog"
              }`
            : "Job rates reset to catalog defaults",
        createdBy: session.name,
      });
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

    const pricing = await getPricingForJob(job);
    const pricingOverrides = parseJobPricingOverride(job.pricingJson);

    return NextResponse.json({
      ...job,
      pricing: pricingToPublic(pricing),
      pricingOverrides,
      hasCustomPricing: jobPricingOverrideCount(pricingOverrides) > 0,
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
