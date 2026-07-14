import { requireApiSession } from "@/lib/auth/api";
import { getDb } from "@/lib/db";
import { jobs, payments } from "@/lib/db/schema";
import { summarizeJobMoney } from "@/lib/job-balance";
import { createJobCheckoutLink } from "@/lib/job-payment-link";
import {
  isSquareConfigured,
  isSquareTerminalConfigured,
} from "@/lib/square";
import { createJobTerminalCheckout } from "@/lib/terminal-checkout";
import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

type RouteContext = { params: Promise<{ id: string }> };

const REASON_MESSAGES: Record<string, string> = {
  square_not_configured:
    "Square is not configured. Set SQUARE_ACCESS_TOKEN and SQUARE_LOCATION_ID.",
  terminal_not_configured:
    "Square Terminal isn’t configured. Set SQUARE_TERMINAL_DEVICE_ID (paired device).",
  not_client_deposit:
    "This job doesn’t use client deposits. Switch payment model to “Client deposit”.",
  deposit_link_open:
    "A deposit payment is already open. Finish or cancel it in the ledger first.",
  deposit_already_paid: "Deposit already paid. Collect the balance instead.",
  balance_link_open:
    "A balance payment is already open. Finish or cancel it in the ledger first.",
  nothing_due: "Nothing left to collect — this job is paid in full.",
  no_quote: "Set a quote before collecting the balance.",
  amount_too_small: "Amount must be at least $1.00",
  amount_too_large: "Amount too large",
};

export async function GET(_request: Request, context: RouteContext) {
  const { error } = await requireApiSession();
  if (error) return error;

  const { id: idParam } = await context.params;
  const jobId = Number(idParam);
  if (!Number.isFinite(jobId)) {
    return NextResponse.json({ error: "Invalid job id" }, { status: 400 });
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

  return NextResponse.json({
    payments: rows,
    squareConfigured: isSquareConfigured(),
    terminalConfigured: isSquareTerminalConfigured(),
    summary: summarizeJobMoney(job, rows),
  });
}

/** Create a Square deposit/balance payment link or Terminal checkout. Cancel pending. */
export async function POST(request: Request, context: RouteContext) {
  const { session, error } = await requireApiSession();
  if (error || !session) return error!;

  const { id: idParam } = await context.params;
  const jobId = Number(idParam);
  if (!Number.isFinite(jobId)) {
    return NextResponse.json({ error: "Invalid job id" }, { status: 400 });
  }

  let body: {
    action?: string;
    paymentId?: number;
    kind?: string;
    channel?: string;
    amountCents?: number;
    amountDollars?: string | number;
    label?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const db = getDb();
  const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  if (body.action === "cancel_pending") {
    const paymentId = body.paymentId;
    if (typeof paymentId !== "number") {
      return NextResponse.json({ error: "paymentId required" }, { status: 400 });
    }
    const [row] = await db
      .select()
      .from(payments)
      .where(eq(payments.id, paymentId))
      .limit(1);
    if (!row || row.jobId !== jobId) {
      return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    }
    if (row.status !== "pending") {
      return NextResponse.json(
        { error: "Only pending payments can be cancelled" },
        { status: 400 },
      );
    }
    await db
      .update(payments)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(eq(payments.id, paymentId));

    const rows = await db
      .select()
      .from(payments)
      .where(eq(payments.jobId, jobId))
      .orderBy(desc(payments.createdAt));

    return NextResponse.json({
      ok: true,
      summary: summarizeJobMoney(job, rows),
      payments: rows,
    });
  }

  const existing = await db
    .select()
    .from(payments)
    .where(eq(payments.jobId, jobId));

  let kind: "deposit" | "balance" =
    body.kind === "balance" ? "balance" : "deposit";
  if (
    body.kind == null &&
    existing.some((p) => p.status === "succeeded")
  ) {
    kind = "balance";
  }

  let amountCents =
    typeof body.amountCents === "number" && Number.isFinite(body.amountCents)
      ? Math.round(body.amountCents)
      : null;
  if (amountCents == null && body.amountDollars != null) {
    const dollars = Number(body.amountDollars);
    if (Number.isFinite(dollars)) amountCents = Math.round(dollars * 100);
  }

  const channel = body.channel === "terminal" ? "terminal" : "link";

  if (channel === "terminal") {
    const result = await createJobTerminalCheckout({
      jobId,
      kind,
      amountCents,
      label: typeof body.label === "string" ? body.label : undefined,
      createdBy: session.name,
    });

    if (!result.ok) {
      const status =
        result.reason === "terminal_not_configured"
          ? 503
          : result.reason === "job_not_found"
            ? 404
            : 400;
      return NextResponse.json(
        { error: REASON_MESSAGES[result.reason] || result.reason },
        { status },
      );
    }

    const rows = await db
      .select()
      .from(payments)
      .where(eq(payments.jobId, jobId))
      .orderBy(desc(payments.createdAt));

    return NextResponse.json({
      channel: "terminal",
      terminalCheckoutId: result.terminalCheckoutId,
      kind,
      paymentId: result.paymentId,
      amountCents: result.amountCents,
      summary: summarizeJobMoney(job, rows),
    });
  }

  const result = await createJobCheckoutLink({
    jobId,
    kind,
    amountCents,
    label: typeof body.label === "string" ? body.label : undefined,
    createdBy: session.name,
  });

  if (!result.ok) {
    const status =
      result.reason === "square_not_configured"
        ? 503
        : result.reason === "job_not_found"
          ? 404
          : 400;
    return NextResponse.json(
      { error: REASON_MESSAGES[result.reason] || result.reason },
      { status },
    );
  }

  const rows = await db
    .select()
    .from(payments)
    .where(eq(payments.jobId, jobId))
    .orderBy(desc(payments.createdAt));

  return NextResponse.json({
    channel: "link",
    url: result.url,
    emailed: result.emailed,
    kind: result.kind,
    paymentId: result.paymentId,
    summary: summarizeJobMoney(job, rows),
  });
}
