import { randomUUID } from "crypto";
import { getDb } from "@/lib/db";
import {
  flavours,
  hookahs,
  jobEvents,
  jobHookahs,
  jobs,
  payments,
  serviceRequests,
} from "@/lib/db/schema";
import { createGuestToken } from "@/lib/guest";
import {
  guestPayTierLabel,
  guestPayTierUnitCents,
  isGuestPayTier,
} from "@/lib/ops/guest-pay";
import { getPricingForJob, withHstCents } from "@/lib/pricing";
import { and, asc, eq, inArray, sql } from "drizzle-orm";

export type FloorPayChannel = "cash" | "already_paid" | "terminal";

async function nextSortOrder(
  db: ReturnType<typeof getDb>,
  jobId: number,
  status: "staged" | "out",
) {
  const [row] = await db
    .select({
      max: sql<number>`coalesce(max(${jobHookahs.sortOrder}), -1)`,
    })
    .from(jobHookahs)
    .where(and(eq(jobHookahs.jobId, jobId), eq(jobHookahs.status, status)));
  return (row?.max ?? -1) + 1;
}

export async function listFloorAssignCandidates(jobId: number) {
  const db = getDb();
  const staged = await db
    .select({
      assignmentId: jobHookahs.id,
      hookahId: jobHookahs.hookahId,
      modelNumber: hookahs.modelNumber,
      label: hookahs.label,
      status: jobHookahs.status,
      flavourLabel: jobHookahs.flavourLabel,
    })
    .from(jobHookahs)
    .innerJoin(hookahs, eq(hookahs.id, jobHookahs.hookahId))
    .where(and(eq(jobHookahs.jobId, jobId), eq(jobHookahs.status, "staged")))
    .orderBy(asc(hookahs.modelNumber));

  const busyOnJobs = await db
    .select({ hookahId: jobHookahs.hookahId })
    .from(jobHookahs)
    .where(inArray(jobHookahs.status, ["staged", "out"]));
  const busyIds = new Set(busyOnJobs.map((r) => r.hookahId));

  const available = (
    await db
      .select({
        hookahId: hookahs.id,
        modelNumber: hookahs.modelNumber,
        label: hookahs.label,
        status: hookahs.status,
      })
      .from(hookahs)
      .where(eq(hookahs.status, "available"))
      .orderBy(asc(hookahs.modelNumber))
      .limit(80)
  ).filter((h) => !busyIds.has(h.hookahId));

  return { staged, available };
}

export async function fulfillFloorOrder(opts: {
  serviceRequestId: number;
  assignmentId?: number;
  hookahId?: number;
  payChannel: FloorPayChannel;
  staffName: string;
  /** When true, only send out an already-linked paid unit (no new payment). */
  sendOnly?: boolean;
}): Promise<
  | {
      ok: true;
      assignmentId: number;
      modelNumber: number;
      guestToken: string | null;
      sentOut: boolean;
      terminalCheckoutId?: string;
      paymentId?: number;
    }
  | { ok: false; error: string; status: number; code?: string }
> {
  const db = getDb();
  const [request] = await db
    .select()
    .from(serviceRequests)
    .where(eq(serviceRequests.id, opts.serviceRequestId))
    .limit(1);

  if (!request) {
    return { ok: false, error: "Order not found", status: 404 };
  }
  if (request.type !== "order_unit") {
    return { ok: false, error: "Not a floor / extra-hookah order", status: 400 };
  }
  if (request.status !== "open" && request.status !== "acknowledged") {
    return { ok: false, error: "Order is no longer active", status: 400 };
  }
  if (!isGuestPayTier(request.requestedGuestPayTier)) {
    return { ok: false, error: "Order is missing a pay tier", status: 400 };
  }
  if (request.flavourId == null && !(request.flavourLabel ?? "").trim()) {
    return { ok: false, error: "Order is missing a flavour", status: 400 };
  }

  const [job] = await db
    .select()
    .from(jobs)
    .where(eq(jobs.id, request.jobId))
    .limit(1);
  if (!job) {
    return { ok: false, error: "Job not found", status: 404 };
  }

  let assignmentId = opts.assignmentId ?? request.jobHookahId ?? null;

  // Add available fleet unit onto the job as staged, then assign.
  if (assignmentId == null && typeof opts.hookahId === "number") {
    const [hookah] = await db
      .select()
      .from(hookahs)
      .where(eq(hookahs.id, opts.hookahId))
      .limit(1);
    if (!hookah || hookah.status !== "available") {
      return {
        ok: false,
        error: "That hookah isn’t available",
        status: 409,
        code: "HOOKAH_BUSY",
      };
    }
    const onJob = await db
      .select({ id: jobHookahs.id })
      .from(jobHookahs)
      .where(
        and(
          eq(jobHookahs.jobId, job.id),
          eq(jobHookahs.hookahId, opts.hookahId),
        ),
      )
      .limit(1);
    if (onJob[0]) {
      assignmentId = onJob[0].id;
    } else {
      const sortOrder = await nextSortOrder(db, job.id, "staged");
      const [created] = await db
        .insert(jobHookahs)
        .values({
          jobId: job.id,
          hookahId: opts.hookahId,
          status: "staged",
          sortOrder,
          flavourId: request.flavourId,
          flavourLabel: request.flavourLabel ?? "",
          guestPayTier: request.requestedGuestPayTier,
        })
        .returning();
      assignmentId = created.id;
    }
  }

  if (assignmentId == null) {
    return {
      ok: false,
      error: "Pick a hookah to assign this order to",
      status: 400,
      code: "NEED_ASSIGNMENT",
    };
  }

  const [assignment] = await db
    .select()
    .from(jobHookahs)
    .where(
      and(eq(jobHookahs.id, assignmentId), eq(jobHookahs.jobId, job.id)),
    )
    .limit(1);
  if (!assignment) {
    return { ok: false, error: "Assignment not found on this job", status: 404 };
  }
  if (assignment.status === "returned") {
    return { ok: false, error: "That unit was already returned", status: 409 };
  }

  const [hookah] = await db
    .select()
    .from(hookahs)
    .where(eq(hookahs.id, assignment.hookahId))
    .limit(1);
  if (!hookah) {
    return { ok: false, error: "Hookah not found", status: 404 };
  }

  const flavourId = request.flavourId ?? assignment.flavourId;
  const flavourLabel =
    (request.flavourLabel ?? "").trim() ||
    (assignment.flavourLabel ?? "").trim();
  const tier = request.requestedGuestPayTier;

  // Link request + prep assignment flavour/tier
  await db
    .update(serviceRequests)
    .set({
      jobHookahId: assignmentId,
      status: "acknowledged",
      acknowledgedAt: request.acknowledgedAt ?? new Date(),
      acknowledgedBy: request.acknowledgedBy || opts.staffName,
    })
    .where(eq(serviceRequests.id, request.id));

  await db
    .update(jobHookahs)
    .set({
      flavourId: flavourId ?? null,
      flavourLabel,
      guestPayTier: tier,
      prepCompletedAt: null,
    })
    .where(eq(jobHookahs.id, assignmentId));

  const pricing = await getPricingForJob(job);
  const exclusiveCents =
    request.priceCents != null && request.priceCents > 0
      ? request.priceCents
      : guestPayTierUnitCents(tier, pricing);
  const amountCents = withHstCents(exclusiveCents, pricing.hstRate);
  const label = `${guestPayTierLabel(tier, pricing)} + HST`;

  if (opts.payChannel === "terminal" && !opts.sendOnly) {
    const { pushJobPaymentToTerminal } = await import(
      "@/lib/terminal-checkout"
    );
    const result = await pushJobPaymentToTerminal({
      jobId: job.id,
      kind: "onsite_unit",
      amountCents: exclusiveCents,
      label,
      jobHookahId: assignmentId,
      createdBy: opts.staffName,
    });
    if (!result.ok) {
      return {
        ok: false,
        error:
          result.reason === "terminal_not_configured"
            ? "Set SQUARE_TERMINAL_DEVICE_ID to collect on Terminal"
            : result.reason,
        status: result.reason === "terminal_not_configured" ? 503 : 400,
      };
    }
    await db.insert(jobEvents).values({
      jobId: job.id,
      jobHookahId: assignmentId,
      type: "note",
      message: `Floor order assigned to #${hookah.modelNumber} · terminal pushed · ${flavourLabel}`,
      createdBy: opts.staffName,
    });
    return {
      ok: true,
      assignmentId,
      modelNumber: hookah.modelNumber,
      guestToken: assignment.guestToken,
      sentOut: false,
      terminalCheckoutId: result.terminalCheckoutId,
      paymentId: result.paymentId,
    };
  }

  // Ensure paid (cash / already_paid / sendOnly after terminal)
  const existingPay = await db
    .select({ id: payments.id })
    .from(payments)
    .where(
      and(
        eq(payments.jobId, job.id),
        eq(payments.jobHookahId, assignmentId),
        eq(payments.kind, "onsite_unit"),
        inArray(payments.status, ["succeeded", "pending"]),
      ),
    )
    .limit(1);

  let paymentId: number | undefined;
  if (
    !opts.sendOnly &&
    (opts.payChannel === "cash" || opts.payChannel === "already_paid")
  ) {
    const succeeded = existingPay.length
      ? await db
          .select({ id: payments.id, status: payments.status })
          .from(payments)
          .where(
            and(
              eq(payments.jobId, job.id),
              eq(payments.jobHookahId, assignmentId),
              eq(payments.kind, "onsite_unit"),
              eq(payments.status, "succeeded"),
            ),
          )
          .limit(1)
      : [];

    if (succeeded[0]) {
      paymentId = succeeded[0].id;
    } else {
      const now = new Date();
      const [row] = await db
        .insert(payments)
        .values({
          jobId: job.id,
          jobHookahId: assignmentId,
          kind: "onsite_unit",
          status: "succeeded",
          amountCents,
          label,
          idempotencyKey: `floor-${request.id}-${assignmentId}-${randomUUID()}`,
          createdBy: opts.staffName,
          paidAt: now,
        })
        .returning();
      paymentId = row.id;
      await db.insert(jobEvents).values({
        jobId: job.id,
        jobHookahId: assignmentId,
        type: "note",
        message: `Floor order paid · ${label}${
          opts.payChannel === "cash" ? " · cash" : ""
        }`,
        createdBy: opts.staffName,
      });
    }
  } else if (opts.sendOnly) {
    const paid = await db
      .select({ id: payments.id })
      .from(payments)
      .where(
        and(
          eq(payments.jobId, job.id),
          eq(payments.jobHookahId, assignmentId),
          eq(payments.kind, "onsite_unit"),
          eq(payments.status, "succeeded"),
        ),
      )
      .limit(1);
    if (!paid[0]) {
      return {
        ok: false,
        error: "Collect payment before sending to the floor display",
        status: 409,
        code: "NEED_PAYMENT",
      };
    }
    paymentId = paid[0].id;
  }

  // Send out → event display QR takeover
  const now = new Date();
  const nextCheckAt = new Date(
    now.getTime() + job.checkIntervalMinutes * 60_000,
  );
  const guestToken = assignment.guestToken || createGuestToken();
  const sortOrder =
    assignment.status === "out"
      ? assignment.sortOrder
      : await nextSortOrder(db, job.id, "out");

  await db
    .update(jobHookahs)
    .set({
      status: "out",
      sentOutAt: now,
      returnedAt: null,
      nextCheckAt,
      flavourId: flavourId ?? null,
      flavourLabel,
      guestPayTier: tier,
      guestToken,
      sortOrder,
      prepCompletedAt: null,
    })
    .where(eq(jobHookahs.id, assignmentId));

  await db
    .update(hookahs)
    .set({ status: "out" })
    .where(eq(hookahs.id, assignment.hookahId));

  if (flavourId) {
    await db
      .update(flavours)
      .set({ timesUsed: sql`${flavours.timesUsed} + 1` })
      .where(eq(flavours.id, flavourId));
  }

  await db
    .update(serviceRequests)
    .set({
      status: "resolved",
      resolvedAt: now,
      resolvedBy: opts.staffName,
      jobHookahId: assignmentId,
    })
    .where(eq(serviceRequests.id, request.id));

  await db.insert(jobEvents).values({
    jobId: job.id,
    jobHookahId: assignmentId,
    type: "sent_out",
    message: `Floor order sent out · #${hookah.modelNumber} · ${flavourLabel} · QR on event display`,
    createdBy: opts.staffName,
  });

  return {
    ok: true,
    assignmentId,
    modelNumber: hookah.modelNumber,
    guestToken,
    sentOut: true,
    paymentId,
  };
}
