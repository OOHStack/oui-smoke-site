import { getDb } from "@/lib/db";
import { jobEvents, jobs, payments } from "@/lib/db/schema";
import { maybeAutoSendBalance } from "@/lib/auto-balance";
import { notifyDepositPaid } from "@/lib/email/workflow";
import {
  jobBalanceCents,
  jobDueCents,
  jobPaidCents,
} from "@/lib/job-balance";
import { eq } from "drizzle-orm";

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

  const dollars = (row.amountCents / 100).toFixed(2);
  await db.insert(jobEvents).values({
    jobId: row.jobId,
    type: "note",
    message: paidInFull
      ? `Square ${row.kind} paid — $${dollars} ${row.currency} · paid in full`
      : `Square ${row.kind} paid — $${dollars} ${row.currency} · balance ${formatDollars(balanceCents)}`,
    createdBy: "square",
  });

  if (job) {
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
