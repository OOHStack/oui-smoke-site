import { getDb } from "@/lib/db";
import { jobs, payments } from "@/lib/db/schema";
import {
  hasPendingBalance,
  jobBalanceCents,
  jobDueCents,
  jobPaidCents,
  summarizeJobMoney,
} from "@/lib/job-balance";
import { createJobCheckoutLink } from "@/lib/job-payment-link";
import { getPaymentSettings } from "@/lib/payment-settings";
import { requiresClientDeposit } from "@/lib/payment-model";
import { sanitizeBuyerEmail } from "@/lib/square";
import { and, eq, gte, isNotNull, lte, ne } from "drizzle-orm";

const MS_DAY = 24 * 60 * 60 * 1000;

/** True when the event is within the auto-balance window (including overdue-today). */
export function isWithinBalanceWindow(
  startsAt: Date | string | null | undefined,
  daysBefore: number,
  now = new Date(),
): boolean {
  if (!startsAt) return false;
  const start = startsAt instanceof Date ? startsAt : new Date(startsAt);
  if (Number.isNaN(start.getTime())) return false;
  const days = Math.max(0, Math.round(daysBefore));
  const windowStart = new Date(start.getTime() - days * MS_DAY);
  // Allow through end of event day (+12h cushion)
  const windowEnd = new Date(start.getTime() + 12 * 60 * 60 * 1000);
  return now >= windowStart && now <= windowEnd;
}

/**
 * Send balance link for one job if deposit is paid, balance remains, and
 * (unless force) settings + schedule window allow it.
 */
export async function maybeAutoSendBalance(
  jobId: number,
  opts: { force?: boolean; createdBy?: string } = {},
): Promise<{ sent: boolean; reason?: string; url?: string }> {
  const settings = await getPaymentSettings();
  if (!opts.force && !settings.autoBalanceEnabled) {
    return { sent: false, reason: "auto_balance_disabled" };
  }

  const db = getDb();
  const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
  if (!job) return { sent: false, reason: "job_not_found" };
  if (!requiresClientDeposit(job.paymentModel)) {
    return { sent: false, reason: "not_client_deposit" };
  }
  if (job.status === "cancelled" || job.status === "completed") {
    return { sent: false, reason: "job_closed" };
  }
  if (!sanitizeBuyerEmail(job.clientEmail)) {
    return { sent: false, reason: "no_client_email" };
  }

  const existing = await db
    .select()
    .from(payments)
    .where(eq(payments.jobId, jobId));

  const summary = summarizeJobMoney(job, existing);
  if (summary.balanceCents < 100) {
    return { sent: false, reason: "nothing_due" };
  }
  if (summary.paidCents <= 0) {
    return { sent: false, reason: "deposit_not_paid" };
  }
  if (hasPendingBalance(existing)) {
    return { sent: false, reason: "balance_link_open" };
  }

  if (
    !opts.force &&
    !isWithinBalanceWindow(job.startsAt, settings.autoBalanceDaysBefore)
  ) {
    return { sent: false, reason: "outside_window" };
  }

  const result = await createJobCheckoutLink({
    jobId,
    kind: "balance",
    createdBy: opts.createdBy || "auto",
  });

  if (!result.ok) {
    return { sent: false, reason: result.reason };
  }
  return { sent: true, url: result.url, reason: result.emailed ? "emailed" : "created" };
}

/** Daily sweep: package jobs with deposit paid + balance due inside the window. */
export async function runAutoBalanceSweep(): Promise<{
  checked: number;
  sent: number;
  results: { jobId: number; sent: boolean; reason?: string }[];
}> {
  const settings = await getPaymentSettings();
  if (!settings.autoBalanceEnabled) {
    return { checked: 0, sent: 0, results: [] };
  }

  const db = getDb();
  const now = new Date();
  const days = Math.max(0, Math.round(settings.autoBalanceDaysBefore));
  const horizon = new Date(now.getTime() + days * MS_DAY);
  const past = new Date(now.getTime() - 12 * 60 * 60 * 1000);

  const candidates = await db
    .select()
    .from(jobs)
    .where(
      and(
        eq(jobs.paymentModel, "client_deposit"),
        ne(jobs.status, "cancelled"),
        ne(jobs.status, "completed"),
        isNotNull(jobs.startsAt),
        gte(jobs.startsAt, past),
        lte(jobs.startsAt, horizon),
      ),
    );

  const results: { jobId: number; sent: boolean; reason?: string }[] = [];
  let sent = 0;

  for (const job of candidates) {
    const existing = await db
      .select()
      .from(payments)
      .where(eq(payments.jobId, job.id));
    const due = jobDueCents(job);
    const paid = jobPaidCents(existing);
    const balance = jobBalanceCents(due, paid);
    if (paid <= 0 || balance < 100 || hasPendingBalance(existing)) {
      continue;
    }

    const outcome = await maybeAutoSendBalance(job.id, { createdBy: "cron" });
    results.push({
      jobId: job.id,
      sent: outcome.sent,
      reason: outcome.reason,
    });
    if (outcome.sent) sent += 1;
  }

  return { checked: candidates.length, sent, results };
}
