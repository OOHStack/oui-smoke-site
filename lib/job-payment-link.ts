import { randomUUID } from "crypto";
import { getDb } from "@/lib/db";
import { jobEvents, jobs, payments } from "@/lib/db/schema";
import { notifyDepositLink } from "@/lib/email/workflow";
import { getSiteUrl } from "@/lib/guest";
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
  createDepositPaymentLink,
  isSquareConfigured,
  sanitizeBuyerEmail,
} from "@/lib/square";
import { eq } from "drizzle-orm";

export type CheckoutKind = "deposit" | "balance";

export async function createJobCheckoutLink(opts: {
  jobId: number;
  kind: CheckoutKind;
  amountCents?: number | null;
  label?: string;
  createdBy?: string;
}): Promise<
  | {
      ok: true;
      url: string;
      emailed: boolean;
      paymentId: number;
      amountCents: number;
      kind: CheckoutKind;
    }
  | { ok: false; reason: string }
> {
  if (!isSquareConfigured()) {
    return { ok: false, reason: "square_not_configured" };
  }

  const db = getDb();
  const [job] = await db
    .select()
    .from(jobs)
    .where(eq(jobs.id, opts.jobId))
    .limit(1);
  if (!job) return { ok: false, reason: "job_not_found" };
  if (job.paymentModel !== "client_deposit") {
    return { ok: false, reason: "not_client_deposit" };
  }

  const existing = await db
    .select()
    .from(payments)
    .where(eq(payments.jobId, opts.jobId));

  const dueCents = jobDueCents(job);
  const paidCents = jobPaidCents(existing);
  const balanceCents = jobBalanceCents(dueCents, paidCents);
  const percent = clampDepositPercent(job.depositPercent);
  const kind = opts.kind;

  if (kind === "deposit" && hasPendingDeposit(existing)) {
    return { ok: false, reason: "deposit_link_open" };
  }
  if (kind === "deposit" && hasSucceededDeposit(existing)) {
    return { ok: false, reason: "deposit_already_paid" };
  }
  if (kind === "balance" && hasPendingBalance(existing)) {
    return { ok: false, reason: "balance_link_open" };
  }
  if (kind === "balance" && balanceCents < 100) {
    return { ok: false, reason: "nothing_due" };
  }
  if (kind === "balance" && dueCents < 100) {
    return { ok: false, reason: "no_quote" };
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
    return { ok: false, reason: "amount_too_small" };
  }
  if (kind === "balance" && amountCents > balanceCents) {
    amountCents = balanceCents;
  }
  if (amountCents < 100) {
    return { ok: false, reason: "amount_too_small" };
  }
  if (amountCents > 5_000_000) {
    return { ok: false, reason: "amount_too_large" };
  }

  const createdBy = opts.createdBy || "ops";
  const defaultLabel =
    kind === "balance"
      ? `Balance — ${job.title}`
      : `Deposit (${percent}%) — ${job.title}`;
  const label = (opts.label?.trim() || defaultLabel).slice(0, 120);
  const idempotencyKey = randomUUID();

  const [pending] = await db
    .insert(payments)
    .values({
      jobId: opts.jobId,
      kind,
      status: "pending",
      amountCents,
      currency: "CAD",
      label,
      idempotencyKey,
      createdBy,
    })
    .returning();

  try {
    const link = await createDepositPaymentLink({
      idempotencyKey,
      name: label,
      amountCents,
      currency: "CAD",
      buyerEmail: sanitizeBuyerEmail(job.clientEmail),
      paymentNote: `oui:payment:${pending.id}`,
      redirectUrl: `${getSiteUrl()}/pay/thanks?job=${opts.jobId}`,
    });

    await db
      .update(payments)
      .set({
        checkoutUrl: link.url,
        squarePaymentLinkId: link.id,
        squareOrderId: link.orderId ?? null,
        updatedAt: new Date(),
      })
      .where(eq(payments.id, pending.id));

    const dollars = (amountCents / 100).toFixed(2);
    await db.insert(jobEvents).values({
      jobId: opts.jobId,
      type: "note",
      message: `${kind === "balance" ? "Balance" : "Deposit"} link created — $${dollars} CAD`,
      createdBy,
    });

    const balanceAfter =
      kind === "deposit"
        ? Math.max(0, dueCents - amountCents)
        : Math.max(0, balanceCents - amountCents);

    let emailed = false;
    if (sanitizeBuyerEmail(job.clientEmail)) {
      emailed = await notifyDepositLink({
        job,
        amountCents,
        checkoutUrl: link.url,
        dueCents,
        balanceAfterCents: balanceAfter,
        depositPercent: percent,
        kind,
      });
      if (emailed) {
        await db.insert(jobEvents).values({
          jobId: opts.jobId,
          type: "note",
          message: `${kind === "balance" ? "Balance" : "Deposit"} link emailed to ${job.clientEmail}`,
          createdBy,
        });
      }
    }

    return {
      ok: true,
      url: link.url,
      emailed,
      paymentId: pending.id,
      amountCents,
      kind,
    };
  } catch (err) {
    await db
      .update(payments)
      .set({ status: "failed", updatedAt: new Date() })
      .where(eq(payments.id, pending.id));
    console.error("createJobCheckoutLink failed", err);
    return {
      ok: false,
      reason: err instanceof Error ? err.message : "square_failed",
    };
  }
}
