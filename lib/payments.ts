import { getDb } from "@/lib/db";
import {
  hookahs,
  jobEvents,
  jobHookahs,
  jobs,
  payments,
  serviceRequests,
} from "@/lib/db/schema";
import { maybeAutoSendBalance } from "@/lib/auto-balance";
import { notifyDepositPaid } from "@/lib/email/workflow";
import {
  jobBalanceCents,
  jobDueCents,
  jobPaidCents,
} from "@/lib/job-balance";
import { pushAssignmentDisplayQr } from "@/lib/display-workflow";
import { fulfillFloorOrder } from "@/lib/ops/fulfill-floor-order";
import {
  guestRefillServiceRequestIdFromKey,
  notifyStaffPush,
  notifyStaffPushForServiceRequest,
} from "@/lib/push";
import { and, eq, inArray, sql } from "drizzle-orm";

/** Sum succeeded tip rows onto jobs.tipCents (source of truth for tip split). */
export async function syncJobTipCents(jobId: number): Promise<number> {
  const db = getDb();
  const tipTotal = await db
    .select({
      sum: sql<number>`coalesce(sum(${payments.amountCents}), 0)`,
    })
    .from(payments)
    .where(
      and(
        eq(payments.jobId, jobId),
        eq(payments.kind, "tip"),
        eq(payments.status, "succeeded"),
      ),
    );
  const tipCents = Number(tipTotal[0]?.sum ?? 0);
  await db
    .update(jobs)
    .set({ tipCents, updatedAt: new Date() })
    .where(eq(jobs.id, jobId));
  return tipCents;
}

/** Mark a ledger row paid and advance draft jobs to confirmed on deposit. */
export async function markPaymentSucceeded(opts: {
  paymentId: number;
  squarePaymentId?: string | null;
  squareOrderId?: string | null;
}) {
  const db = getDb();
  const [row] = await db
    .select()
    .from(payments)
    .where(eq(payments.id, opts.paymentId))
    .limit(1);

  if (!row) return { ok: false as const, error: "Payment not found" };
  if (row.status === "succeeded") {
    return { ok: true as const, payment: row, already: true };
  }

  const now = new Date();
  const [updated] = await db
    .update(payments)
    .set({
      status: "succeeded",
      squarePaymentId: opts.squarePaymentId || row.squarePaymentId,
      squareOrderId: opts.squareOrderId || row.squareOrderId,
      paidAt: now,
      updatedAt: now,
    })
    .where(eq(payments.id, row.id))
    .returning();

  const dollars = (row.amountCents / 100).toFixed(2);

  // Guest refill: ledger + floor note + staff push (no package emails).
  if (row.kind === "refill") {
    await db.insert(jobEvents).values({
      jobId: row.jobId,
      jobHookahId: row.jobHookahId,
      type: "note",
      message: `Square refill paid — $${dollars} ${row.currency}${
        row.label ? ` · ${row.label}` : ""
      }`,
      createdBy: "square",
    });

    try {
      let modelLabel = "";
      if (row.jobHookahId) {
        const [unit] = await db
          .select({ modelNumber: hookahs.modelNumber })
          .from(jobHookahs)
          .innerJoin(hookahs, eq(hookahs.id, jobHookahs.hookahId))
          .where(eq(jobHookahs.id, row.jobHookahId))
          .limit(1);
        if (unit) modelLabel = `#${unit.modelNumber}`;
      }
      void notifyStaffPushForServiceRequest(
        guestRefillServiceRequestIdFromKey(row.idempotencyKey),
        {
          title: `Refill paid${modelLabel ? ` · ${modelLabel}` : ""}`,
          body: `$${dollars} received via Square${row.label ? ` · ${row.label}` : ""}. Deliver when ready.`,
          url: `/admin/jobs/${row.jobId}`,
          tag: `refill-paid-${row.id}`,
        },
      );
    } catch (err) {
      console.error("refill paid push failed", err);
    }

    return { ok: true as const, payment: updated, already: false };
  }

  // Tip / onsite / other guest charges: ledger note only (no package emails).
  if (row.kind === "tip") {
    const tipCents = await syncJobTipCents(row.jobId);
    await db.insert(jobEvents).values({
      jobId: row.jobId,
      jobHookahId: row.jobHookahId,
      type: "note",
      message: `Square tip paid — $${dollars} ${row.currency} · tip total $${(tipCents / 100).toFixed(2)}`,
      createdBy: "square",
    });
    return { ok: true as const, payment: updated, already: false };
  }

  if (row.kind === "onsite_unit" || row.kind === "other") {
    await db.insert(jobEvents).values({
      jobId: row.jobId,
      jobHookahId: row.jobHookahId,
      type: "note",
      message: `Square ${row.kind === "other" ? "extra hookah" : "guest unit"} paid — $${dollars} ${row.currency}${
        row.label ? ` · ${row.label}` : ""
      }`,
      createdBy: "square",
    });

    // Floor tablet orders: after Terminal clears, park on Ready to send (not out yet).
    if (row.kind === "onsite_unit" && row.jobHookahId != null) {
      try {
        const [floorReq] = await db
          .select({ id: serviceRequests.id })
          .from(serviceRequests)
          .where(
            and(
              eq(serviceRequests.jobId, row.jobId),
              eq(serviceRequests.jobHookahId, row.jobHookahId),
              eq(serviceRequests.type, "order_unit"),
              inArray(serviceRequests.status, ["open", "acknowledged"]),
            ),
          )
          .limit(1);
        if (floorReq) {
          const ready = await fulfillFloorOrder({
            serviceRequestId: floorReq.id,
            assignmentId: row.jobHookahId,
            payChannel: "already_paid",
            staffName: "square",
          });
          if (ready.ok && ready.ready) {
            void notifyStaffPush({
              title: `Floor order ready · #${ready.modelNumber}`,
              body: `Paid · QR on event display · make & carry out, then Send`,
              url: `/admin/jobs/${row.jobId}`,
              tag: `floor-ready-${floorReq.id}`,
            });
          }
        } else {
          // Regular onsite unit (not a floor-tablet order) — still show QR on paid.
          await pushAssignmentDisplayQr({
            assignmentId: row.jobHookahId,
            reason: "paid",
          });
        }
      } catch (err) {
        console.error("onsite unit paid / display QR failed", err);
      }
    }

    return { ok: true as const, payment: updated, already: false };
  }

  const [job] = await db.select().from(jobs).where(eq(jobs.id, row.jobId)).limit(1);
  let becameConfirmed = false;
  if (
    job &&
    row.kind === "deposit" &&
    job.status === "draft" &&
    job.paymentModel === "client_deposit"
  ) {
    await db
      .update(jobs)
      .set({ status: "confirmed", updatedAt: now })
      .where(eq(jobs.id, job.id));
    becameConfirmed = true;
    await db.insert(jobEvents).values({
      jobId: job.id,
      type: "status_change",
      message: "Status changed from draft to confirmed (deposit paid)",
      createdBy: "square",
    });
  }

  const allPayments = await db
    .select()
    .from(payments)
    .where(eq(payments.jobId, row.jobId));
  const dueCents = job ? jobDueCents(job) : 0;
  const paidCents = jobPaidCents(
    allPayments.map((p) =>
      p.id === row.id ? { ...p, status: "succeeded" } : p,
    ),
  );
  const balanceCents = jobBalanceCents(dueCents, paidCents);
  const paidInFull = dueCents > 0 && balanceCents <= 0;

  await db.insert(jobEvents).values({
    jobId: row.jobId,
    type: "note",
    message: paidInFull
      ? `Square ${row.kind} paid — $${dollars} ${row.currency} · paid in full`
      : `Square ${row.kind} paid — $${dollars} ${row.currency} · balance ${formatDollars(balanceCents)}`,
    createdBy: "square",
  });

  if (job && (row.kind === "deposit" || row.kind === "balance")) {
    await notifyDepositPaid({
      job: {
        ...job,
        status: becameConfirmed ? "confirmed" : job.status,
      },
      amountCents: row.amountCents,
      kind: row.kind,
      becameConfirmed,
      dueCents,
      balanceCents,
      paidInFull,
    });

    if (row.kind === "deposit" && !paidInFull && balanceCents >= 100) {
      const balance = await maybeAutoSendBalance(job.id, {
        createdBy: "auto",
      });
      if (balance.sent) {
        console.info("auto balance after deposit", job.id, balance.reason);
      }
    }
  }

  return { ok: true as const, payment: updated, already: false };
}

function formatDollars(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

export async function markPaymentFailed(opts: {
  paymentId: number;
  squarePaymentId?: string | null;
}) {
  const db = getDb();
  const [row] = await db
    .select()
    .from(payments)
    .where(eq(payments.id, opts.paymentId))
    .limit(1);
  if (!row || row.status === "succeeded") {
    return { ok: false as const };
  }

  await db
    .update(payments)
    .set({
      status: "failed",
      squarePaymentId: opts.squarePaymentId || row.squarePaymentId,
      updatedAt: new Date(),
    })
    .where(eq(payments.id, row.id));

  return { ok: true as const };
}

/** Mark a succeeded ledger row as refunded (full refund for v1). */
export async function markPaymentRefunded(opts: {
  paymentId: number;
  squarePaymentId?: string | null;
  reason?: string;
  createdBy?: string;
}) {
  const db = getDb();
  const [row] = await db
    .select()
    .from(payments)
    .where(eq(payments.id, opts.paymentId))
    .limit(1);

  if (!row) return { ok: false as const, error: "Payment not found" };
  if (row.status === "refunded") {
    return { ok: true as const, payment: row, already: true };
  }
  if (row.status !== "succeeded") {
    return { ok: false as const, error: "Only succeeded payments can be refunded" };
  }

  const now = new Date();
  const [updated] = await db
    .update(payments)
    .set({
      status: "refunded",
      squarePaymentId: opts.squarePaymentId || row.squarePaymentId,
      updatedAt: now,
    })
    .where(eq(payments.id, row.id))
    .returning();

  const dollars = (row.amountCents / 100).toFixed(2);
  await db.insert(jobEvents).values({
    jobId: row.jobId,
    jobHookahId: row.jobHookahId,
    type: "note",
    message: `Refund recorded · ${row.kind} · $${dollars} ${row.currency}${
      opts.reason ? ` · ${opts.reason}` : ""
    }`,
    createdBy: opts.createdBy || "square",
  });

  if (row.kind === "tip") {
    await syncJobTipCents(row.jobId);
  }

  return { ok: true as const, payment: updated, already: false };
}
