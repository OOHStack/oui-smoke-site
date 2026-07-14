import { requireApiSession } from "@/lib/auth/api";
import { getDb } from "@/lib/db";
import { jobs, payments } from "@/lib/db/schema";
import {
  formatCadCents,
  moneyStatusLabel,
  summarizeJobMoney,
  type JobMoneyStatus,
} from "@/lib/job-balance";
import { isSquareConfigured } from "@/lib/square";
import { desc, ne } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { error } = await requireApiSession();
  if (error) return error;

  const url = new URL(request.url);
  const filter = (url.searchParams.get("status") || "attention").toLowerCase();

  const db = getDb();
  const jobRows = await db
    .select()
    .from(jobs)
    .where(ne(jobs.status, "cancelled"))
    .orderBy(desc(jobs.updatedAt));

  const paymentRows = await db.select().from(payments);
  const byJob = new Map<number, typeof paymentRows>();
  for (const p of paymentRows) {
    const list = byJob.get(p.jobId) ?? [];
    list.push(p);
    byJob.set(p.jobId, list);
  }

  const attention: JobMoneyStatus[] = [
    "deposit_due",
    "deposit_pending",
    "balance_due",
    "balance_pending",
  ];

  const rows = jobRows
    .filter((j) => j.paymentModel === "client_deposit")
    .map((job) => {
      const summary = summarizeJobMoney(job, byJob.get(job.id) ?? []);
      return {
        id: job.id,
        title: job.title,
        clientName: job.clientName,
        status: job.status,
        startsAt: job.startsAt,
        quotedCents: job.quotedCents,
        paymentModel: job.paymentModel,
        summary,
        moneyLabel: moneyStatusLabel(summary.status),
        dueLabel: summary.dueCents ? formatCadCents(summary.dueCents) : "—",
        paidLabel: formatCadCents(summary.paidCents),
        balanceLabel: formatCadCents(summary.balanceCents),
      };
    })
    .filter((row) => {
      if (filter === "all") return true;
      if (filter === "paid") return row.summary.status === "paid_in_full";
      if (filter === "attention") {
        return attention.includes(row.summary.status);
      }
      return row.summary.status === filter;
    });

  const counts = {
    attention: 0,
    deposit_due: 0,
    deposit_pending: 0,
    balance_due: 0,
    balance_pending: 0,
    paid_in_full: 0,
    all: 0,
  };

  for (const job of jobRows.filter((j) => j.paymentModel === "client_deposit")) {
    const summary = summarizeJobMoney(job, byJob.get(job.id) ?? []);
    counts.all += 1;
    if (summary.status === "paid_in_full") counts.paid_in_full += 1;
    if (summary.status === "deposit_due") counts.deposit_due += 1;
    if (summary.status === "deposit_pending") counts.deposit_pending += 1;
    if (summary.status === "balance_due") counts.balance_due += 1;
    if (summary.status === "balance_pending") counts.balance_pending += 1;
    if (attention.includes(summary.status)) counts.attention += 1;
  }

  return NextResponse.json({
    jobs: rows,
    counts,
    squareConfigured: isSquareConfigured(),
  });
}
