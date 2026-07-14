import { randomUUID } from "crypto";
import { getDb } from "@/lib/db";
import { jobEvents, jobs, payments } from "@/lib/db/schema";
import {
  clampDepositPercent,
  hasPendingBalance,
  hasPendingDeposit,
  hasSucceededDeposit,
  jobBalanceCents,
  jobDueCents,
  jobPaidCents,
} from "@/lib/job-balance";
import {
  createTerminalCheckout,
  isSquareTerminalConfigured,
} from "@/lib/square";
import { and, eq } from "drizzle-orm";

export type TerminalCollectKind =
  | "deposit"
  | "balance"
  | "onsite_unit"
  | "refill"
  | "tip";

/**
 * Create a pending ledger row (or reuse) and push amount to Square Terminal.
 * Webhook terminal.checkout.updated → markPaymentSucceeded when COMPLETED.
 */
export async function pushJobPaymentToTerminal(opts: {
  jobId: number;
  kind: TerminalCollectKind;
  amountCents: number;
  label: string;
  jobHookahId?: number | null;
  /** If set, update this existing pending/failed row instead of inserting. */
  paymentId?: number | null;
  createdBy?: string;
}): Promise<
  | {
      ok: true;
      paymentId: number;
      terminalCheckoutId: string;
      amountCents: number;
    }
  | { ok: false; reason: string }
> {
  if (!isSquareTerminalConfigured()) {
    return { ok: false, reason: "terminal_not_configured" };
  }

  const amountCents = Math.round(opts.amountCents);
  if (!Number.isFinite(amountCents) || amountCents < 100) {
    return { ok: false, reason: "amount_too_small" };
  }

  const db = getDb();
  const [job] = await db.select().from(jobs).where(eq(jobs.id, opts.jobId)).limit(1);
  if (!job) return { ok: false, reason: "job_not_found" };

  if (
    (opts.kind === "deposit" || opts.kind === "balance") &&
    job.paymentModel !== "client_deposit"
  ) {
    return { ok: false, reason: "not_client_deposit" };
  }

  const createdBy = opts.createdBy || "ops";
  const idempotencyKey = randomUUID();
  let paymentId = opts.paymentId ?? null;

  if (paymentId != null) {
    const [existing] = await db
      .select()
      .from(payments)
      .where(and(eq(payments.id, paymentId), eq(payments.jobId, opts.jobId)))
      .limit(1);
    if (!existing) return { ok: false, reason: "payment_not_found" };
    if (existing.status === "succeeded") {
      return { ok: false, reason: "already_paid" };
    }
    await db
      .update(payments)
      .set({
        amountCents,
        label: opts.label.slice(0, 120),
        status: "pending",
        updatedAt: new Date(),
      })
      .where(eq(payments.id, paymentId));
  } else {
    if (opts.kind === "deposit" || opts.kind === "balance") {
      const existing = await db
        .select()
        .from(payments)
        .where(eq(payments.jobId, opts.jobId));
      if (opts.kind === "deposit" && hasPendingDeposit(existing)) {
        return { ok: false, reason: "deposit_link_open" };
      }
      if (opts.kind === "deposit" && hasSucceededDeposit(existing)) {
        return { ok: false, reason: "deposit_already_paid" };
      }
      if (opts.kind === "balance" && hasPendingBalance(existing)) {
        return { ok: false, reason: "balance_link_open" };
      }
    }

    if (opts.kind === "onsite_unit" && opts.jobHookahId != null) {
      const paid = await db
        .select({ id: payments.id })
        .from(payments)
        .where(
          and(
            eq(payments.jobId, opts.jobId),
            eq(payments.jobHookahId, opts.jobHookahId),
            eq(payments.kind, "onsite_unit"),
            eq(payments.status, "succeeded"),
          ),
        )
        .limit(1);
      if (paid.length > 0) return { ok: false, reason: "already_paid" };

      const pending = await db
        .select({ id: payments.id })
        .from(payments)
        .where(
          and(
            eq(payments.jobId, opts.jobId),
            eq(payments.jobHookahId, opts.jobHookahId),
            eq(payments.kind, "onsite_unit"),
            eq(payments.status, "pending"),
          ),
        )
        .limit(1);
      if (pending[0]) {
        paymentId = pending[0].id;
        await db
          .update(payments)
          .set({
            amountCents,
            label: opts.label.slice(0, 120),
            updatedAt: new Date(),
          })
          .where(eq(payments.id, paymentId));
      }
    }

    if (paymentId == null) {
      const [row] = await db
        .insert(payments)
        .values({
          jobId: opts.jobId,
          jobHookahId: opts.jobHookahId ?? null,
          kind: opts.kind,
          status: "pending",
          amountCents,
          currency: "CAD",
          label: opts.label.slice(0, 120),
          idempotencyKey,
          createdBy,
        })
        .returning();
      paymentId = row.id;
    }
  }

  try {
    const note = `oui:payment:${paymentId}`;
    const checkout = await createTerminalCheckout({
      idempotencyKey: `term-${paymentId}-${idempotencyKey}`.slice(0, 64),
      amountCents,
      currency: "CAD",
      paymentNote: note,
      referenceId: note.slice(0, 40),
      label: opts.label,
    });

    await db
      .update(payments)
      .set({
        squareTerminalCheckoutId: checkout.id,
        status: "pending",
        updatedAt: new Date(),
      })
      .where(eq(payments.id, paymentId));

    const dollars = (amountCents / 100).toFixed(2);
    await db.insert(jobEvents).values({
      jobId: opts.jobId,
      jobHookahId: opts.jobHookahId ?? null,
      type: "note",
      message: `Terminal checkout sent · ${opts.kind} · $${dollars} CAD`,
      createdBy,
    });

    return {
      ok: true,
      paymentId,
      terminalCheckoutId: checkout.id,
      amountCents,
    };
  } catch (err) {
    await db
      .update(payments)
      .set({ status: "failed", updatedAt: new Date() })
      .where(eq(payments.id, paymentId!));
    console.error("pushJobPaymentToTerminal failed", err);
    return {
      ok: false,
      reason: err instanceof Error ? err.message : "terminal_failed",
    };
  }
}

/** Resolve deposit/balance amount the same way as payment links, then push Terminal. */
export async function createJobTerminalCheckout(opts: {
  jobId: number;
  kind: "deposit" | "balance";
  amountCents?: number | null;
  label?: string;
  createdBy?: string;
}) {
  if (!isSquareTerminalConfigured()) {
    return { ok: false as const, reason: "terminal_not_configured" };
  }

  const db = getDb();
  const [job] = await db.select().from(jobs).where(eq(jobs.id, opts.jobId)).limit(1);
  if (!job) return { ok: false as const, reason: "job_not_found" };
  if (job.paymentModel !== "client_deposit") {
    return { ok: false as const, reason: "not_client_deposit" };
  }

  const existing = await db.select().from(payments).where(eq(payments.jobId, opts.jobId));
  const dueCents = jobDueCents(job);
  const paidCents = jobPaidCents(existing);
  const balanceCents = jobBalanceCents(dueCents, paidCents);
  const percent = clampDepositPercent(job.depositPercent);
  const kind = opts.kind;

  if (kind === "deposit" && hasPendingDeposit(existing)) {
    return { ok: false as const, reason: "deposit_link_open" };
  }
  if (kind === "deposit" && hasSucceededDeposit(existing)) {
    return { ok: false as const, reason: "deposit_already_paid" };
  }
  if (kind === "balance" && hasPendingBalance(existing)) {
    return { ok: false as const, reason: "balance_link_open" };
  }
  if (kind === "balance" && balanceCents < 100) {
    return { ok: false as const, reason: "nothing_due" };
  }
  if (kind === "balance" && dueCents < 100) {
    return { ok: false as const, reason: "no_quote" };
  }

  let amountCents =
    opts.amountCents != null && Number.isFinite(opts.amountCents)
      ? Math.round(opts.amountCents)
      : null;

  if (amountCents == null) {
    if (kind === "balance") {
      amountCents = balanceCents;
    } else if (dueCents >= 100) {
      amountCents =
        percent >= 100
          ? dueCents
          : Math.max(100, Math.round((dueCents * percent) / 100));
    }
  }

  if (amountCents == null || amountCents < 100) {
    return { ok: false as const, reason: "amount_too_small" };
  }
  if (kind === "balance" && amountCents > balanceCents) {
    amountCents = balanceCents;
  }
  if (amountCents > 5_000_000) {
    return { ok: false as const, reason: "amount_too_large" };
  }

  const defaultLabel =
    kind === "balance"
      ? `Balance — ${job.title}`
      : `Deposit (${percent}%) — ${job.title}`;

  return pushJobPaymentToTerminal({
    jobId: opts.jobId,
    kind,
    amountCents,
    label: (opts.label?.trim() || defaultLabel).slice(0, 120),
    createdBy: opts.createdBy,
  });
}
