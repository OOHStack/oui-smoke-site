import { randomUUID } from "crypto";
import { getDb } from "@/lib/db";
import { jobEvents, jobs, payments } from "@/lib/db/schema";
import { notifyDepositLink } from "@/lib/email/workflow";
import { getSiteUrl } from "@/lib/guest";
import {
  clampDepositPercent,
  DEFAULT_DEPOSIT_PERCENT,
  suggestedDepositCents,
} from "@/lib/job-balance";
import { getPaymentSettings } from "@/lib/payment-settings";
import { requiresClientDeposit } from "@/lib/payment-model";
import {
  createDepositPaymentLink,
  isSquareConfigured,
  sanitizeBuyerEmail,
} from "@/lib/square";
import { and, eq, inArray } from "drizzle-orm";

export type AutoDepositSource = "booking" | "quote" | "manual";

/**
 * If a client-deposit job has a quote, no open/paid deposit yet, and Square is
 * configured — create a deposit link (job deposit %) and email the client.
 * Booking/quote sources respect payment settings automations.
 */
export async function maybeAutoSendDeposit(
  jobId: number,
  source: AutoDepositSource = "manual",
): Promise<{
  sent: boolean;
  reason?: string;
  url?: string;
  paymentId?: number;
}> {
  if (!isSquareConfigured()) {
    return { sent: false, reason: "square_not_configured" };
  }

  if (source === "booking" || source === "quote") {
    const settings = await getPaymentSettings();
    if (source === "booking" && !settings.autoDepositOnBooking) {
      return { sent: false, reason: "auto_booking_disabled" };
    }
    if (source === "quote" && !settings.autoDepositOnQuote) {
      return { sent: false, reason: "auto_quote_disabled" };
    }
  }

  const db = getDb();
  const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
  if (!job) return { sent: false, reason: "job_not_found" };
  if (!requiresClientDeposit(job.paymentModel)) {
    return { sent: false, reason: "not_client_deposit" };
  }
  if (!job.quotedCents || job.quotedCents < 200) {
    return { sent: false, reason: "no_quote" };
  }
  if (!sanitizeBuyerEmail(job.clientEmail)) {
    return { sent: false, reason: "no_client_email" };
  }

  const existing = await db
    .select({ id: payments.id, status: payments.status })
    .from(payments)
    .where(
      and(
        eq(payments.jobId, jobId),
        eq(payments.kind, "deposit"),
        inArray(payments.status, ["pending", "succeeded"]),
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    return { sent: false, reason: "deposit_already_exists" };
  }

  const percent = clampDepositPercent(
    job.depositPercent ?? DEFAULT_DEPOSIT_PERCENT,
  );
  const amountCents = suggestedDepositCents(job.quotedCents, percent);
  if (amountCents < 100) {
    return { sent: false, reason: "deposit_too_small" };
  }

  const idempotencyKey = randomUUID();
  const label = `Deposit (${percent}%) — ${job.title}`.slice(0, 120);
  const createdBy = source === "manual" ? "ops" : "auto";

  const [pending] = await db
    .insert(payments)
    .values({
      jobId,
      kind: "deposit",
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
      redirectUrl: `${getSiteUrl()}/pay/thanks?job=${jobId}`,
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
      jobId,
      type: "note",
      message: `Auto deposit link created — $${dollars} CAD (${percent}% of quote)`,
      createdBy,
    });

    const balanceCents = Math.max(0, job.quotedCents - amountCents);
    const emailed = await notifyDepositLink({
      job,
      amountCents,
      checkoutUrl: link.url,
      dueCents: job.quotedCents,
      balanceAfterCents: balanceCents,
      depositPercent: percent,
      kind: "deposit",
    });

    if (emailed) {
      await db.insert(jobEvents).values({
        jobId,
        type: "note",
        message: `Deposit link emailed to ${job.clientEmail}`,
        createdBy,
      });
    }

    return {
      sent: true,
      url: link.url,
      paymentId: pending.id,
      reason: emailed ? "emailed" : "created_not_emailed",
    };
  } catch (err) {
    await db
      .update(payments)
      .set({ status: "failed", updatedAt: new Date() })
      .where(eq(payments.id, pending.id));
    console.error("auto deposit failed", err);
    return {
      sent: false,
      reason: err instanceof Error ? err.message : "square_failed",
    };
  }
}
