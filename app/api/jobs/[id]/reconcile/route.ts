import { requireApiSession } from "@/lib/auth/api";
import { getDb } from "@/lib/db";
import { jobs, payments } from "@/lib/db/schema";
import { formatCadCents, summarizeJobMoney } from "@/lib/job-balance";
import { getSquarePayment, isSquareConfigured } from "@/lib/square";
import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

type RouteContext = { params: Promise<{ id: string }> };

type ReconcileLine = {
  paymentId: number;
  kind: string;
  localStatus: string;
  localAmountCents: number;
  squarePaymentId: string | null;
  squareStatus: string | null;
  squareAmountCents: number | null;
  squareRefundedCents: number | null;
  match: "ok" | "mismatch" | "missing_square" | "local_only" | "pending";
  note: string;
};

/**
 * End-of-night check: compare this job’s ledger rows to Square Payments API.
 */
export async function GET(_request: Request, context: RouteContext) {
  const { error } = await requireApiSession();
  if (error) return error;

  const { id: idParam } = await context.params;
  const jobId = Number(idParam);
  if (!Number.isFinite(jobId)) {
    return NextResponse.json({ error: "Invalid job id" }, { status: 400 });
  }

  if (!isSquareConfigured()) {
    return NextResponse.json(
      { error: "Square is not configured" },
      { status: 503 },
    );
  }

  const db = getDb();
  const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  const rows = await db
    .select()
    .from(payments)
    .where(eq(payments.jobId, jobId))
    .orderBy(desc(payments.createdAt));

  const lines: ReconcileLine[] = [];
  let matched = 0;
  let mismatches = 0;
  let localOnly = 0;
  let pending = 0;

  for (const row of rows) {
    if (row.status === "pending") {
      pending += 1;
      lines.push({
        paymentId: row.id,
        kind: row.kind,
        localStatus: row.status,
        localAmountCents: row.amountCents,
        squarePaymentId: row.squarePaymentId,
        squareStatus: null,
        squareAmountCents: null,
        squareRefundedCents: null,
        match: "pending",
        note: row.squareTerminalCheckoutId
          ? "Open on Terminal — finish or cancel"
          : "Open payment link — finish or cancel",
      });
      continue;
    }

    if (!row.squarePaymentId) {
      localOnly += 1;
      lines.push({
        paymentId: row.id,
        kind: row.kind,
        localStatus: row.status,
        localAmountCents: row.amountCents,
        squarePaymentId: null,
        squareStatus: null,
        squareAmountCents: null,
        squareRefundedCents: null,
        match: "local_only",
        note:
          row.status === "succeeded"
            ? "Cash / manual — no Square payment id"
            : "No Square payment id",
      });
      continue;
    }

    const square = await getSquarePayment(row.squarePaymentId);
    if (!square) {
      mismatches += 1;
      lines.push({
        paymentId: row.id,
        kind: row.kind,
        localStatus: row.status,
        localAmountCents: row.amountCents,
        squarePaymentId: row.squarePaymentId,
        squareStatus: null,
        squareAmountCents: null,
        squareRefundedCents: null,
        match: "missing_square",
        note: "Square payment not found",
      });
      continue;
    }

    const squareStatus = (square.status || "").toUpperCase();
    const squareRefunded = square.refundedCents > 0;
    const expectedLocal =
      squareRefunded || squareStatus === "COMPLETED"
        ? squareRefunded &&
          square.refundedCents >= square.amountCents
          ? "refunded"
          : squareStatus === "COMPLETED"
            ? "succeeded"
            : row.status
        : squareStatus === "FAILED" ||
            squareStatus === "CANCELED" ||
            squareStatus === "CANCELLED"
          ? "failed"
          : row.status;

    const amountOk = square.amountCents === row.amountCents;
    const statusOk =
      (row.status === "succeeded" &&
        squareStatus === "COMPLETED" &&
        !squareRefunded) ||
      (row.status === "refunded" &&
        (squareRefunded || squareStatus === "COMPLETED")) ||
      (row.status === "failed" &&
        (squareStatus === "FAILED" ||
          squareStatus === "CANCELED" ||
          squareStatus === "CANCELLED")) ||
      (row.status === "cancelled" &&
        (squareStatus === "CANCELED" || squareStatus === "CANCELLED"));

    if (statusOk && amountOk) {
      matched += 1;
      lines.push({
        paymentId: row.id,
        kind: row.kind,
        localStatus: row.status,
        localAmountCents: row.amountCents,
        squarePaymentId: row.squarePaymentId,
        squareStatus: square.status,
        squareAmountCents: square.amountCents,
        squareRefundedCents: square.refundedCents,
        match: "ok",
        note: square.tipCents
          ? `OK · Square tip ${formatCadCents(square.tipCents)}`
          : "OK",
      });
    } else {
      mismatches += 1;
      const bits: string[] = [];
      if (!amountOk) {
        bits.push(
          `amount local ${formatCadCents(row.amountCents)} vs Square ${formatCadCents(square.amountCents)}`,
        );
      }
      if (!statusOk) {
        bits.push(
          `status local “${row.status}” vs Square “${square.status}” (expect ~${expectedLocal})`,
        );
      }
      if (squareRefunded && row.status !== "refunded") {
        bits.push(
          `Square refunded ${formatCadCents(square.refundedCents)} — mark refunded locally`,
        );
      }
      lines.push({
        paymentId: row.id,
        kind: row.kind,
        localStatus: row.status,
        localAmountCents: row.amountCents,
        squarePaymentId: row.squarePaymentId,
        squareStatus: square.status,
        squareAmountCents: square.amountCents,
        squareRefundedCents: square.refundedCents,
        match: "mismatch",
        note: bits.join(" · ") || "Mismatch",
      });
    }
  }

  const summary = summarizeJobMoney(job, rows);
  const localSucceededCents = rows
    .filter((p) => p.status === "succeeded")
    .reduce((s, p) => s + p.amountCents, 0);
  const squareSucceededCents = lines
    .filter(
      (l) =>
        l.squareStatus?.toUpperCase() === "COMPLETED" &&
        (l.squareRefundedCents ?? 0) < (l.squareAmountCents ?? 0),
    )
    .reduce((s, l) => s + (l.squareAmountCents ?? 0), 0);

  return NextResponse.json({
    jobId,
    checkedAt: new Date().toISOString(),
    counts: {
      total: rows.length,
      matched,
      mismatches,
      localOnly,
      pending,
    },
    totals: {
      localSucceededCents,
      squareSucceededCents,
      packageDueCents: summary.dueCents,
      packagePaidCents: summary.paidCents,
      packageBalanceCents: summary.balanceCents,
      tipCents: job.tipCents ?? 0,
    },
    lines,
  });
}
