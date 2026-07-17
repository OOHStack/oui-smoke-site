import { getDb } from "@/lib/db";
import { payments } from "@/lib/db/schema";
import {
  markPaymentFailed,
  markPaymentRefunded,
  markPaymentSucceeded,
} from "@/lib/payments";
import {
  parsePaymentNoteId,
  verifySquareWebhookSignature,
} from "@/lib/square";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

type SquarePayment = {
  id?: string;
  status?: string;
  order_id?: string;
  note?: string;
  amount_money?: { amount?: number; currency?: string };
};

type SquareTerminalCheckout = {
  id?: string;
  status?: string;
  note?: string;
  reference_id?: string;
  payment_ids?: string[];
};

type SquareRefund = {
  id?: string;
  status?: string;
  payment_id?: string;
  amount_money?: { amount?: number; currency?: string };
};

type SquareWebhookBody = {
  type?: string;
  data?: {
    type?: string;
    id?: string;
    object?: {
      payment?: SquarePayment;
      checkout?: SquareTerminalCheckout;
      refund?: SquareRefund;
    };
  };
};

async function resolvePaymentId(opts: {
  note?: string | null;
  orderId?: string | null;
  terminalCheckoutId?: string | null;
  referenceId?: string | null;
  squarePaymentId?: string | null;
}): Promise<number | null> {
  const db = getDb();
  const noteId =
    parsePaymentNoteId(opts.note) ?? parsePaymentNoteId(opts.referenceId);
  if (noteId != null) return noteId;

  if (opts.squarePaymentId) {
    const [bySquare] = await db
      .select({ id: payments.id })
      .from(payments)
      .where(eq(payments.squarePaymentId, opts.squarePaymentId))
      .limit(1);
    if (bySquare) return bySquare.id;
  }

  if (opts.terminalCheckoutId) {
    const [byTerminal] = await db
      .select({ id: payments.id })
      .from(payments)
      .where(eq(payments.squareTerminalCheckoutId, opts.terminalCheckoutId))
      .limit(1);
    if (byTerminal) return byTerminal.id;
  }

  if (opts.orderId) {
    const [byOrder] = await db
      .select({ id: payments.id })
      .from(payments)
      .where(eq(payments.squareOrderId, opts.orderId))
      .limit(1);
    if (byOrder) return byOrder.id;
  }

  return null;
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature =
    request.headers.get("x-square-hmacsha256-signature") ||
    request.headers.get("Square-Signature");

  if (
    !verifySquareWebhookSignature({
      signatureHeader: signature,
      body: rawBody,
    })
  ) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let body: SquareWebhookBody;
  try {
    body = JSON.parse(rawBody) as SquareWebhookBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const eventType = body.type || "";

  if (
    eventType === "terminal.checkout.updated" ||
    eventType === "terminal.checkout.created"
  ) {
    const checkout = body.data?.object?.checkout;
    if (!checkout?.id) {
      return NextResponse.json({ ok: true, ignored: "no checkout" });
    }

    const paymentId = await resolvePaymentId({
      note: checkout.note,
      referenceId: checkout.reference_id,
      terminalCheckoutId: checkout.id,
    });

    if (paymentId == null) {
      console.warn("Square terminal webhook: unmatched", checkout.id);
      return NextResponse.json({ ok: true, unmatched: true });
    }

    const status = (checkout.status || "").toUpperCase();
    if (status === "COMPLETED") {
      await markPaymentSucceeded({
        paymentId,
        squarePaymentId: checkout.payment_ids?.[0] ?? null,
      });
    } else if (
      status === "CANCELED" ||
      status === "CANCELLED" ||
      status === "CANCEL_REQUESTED"
    ) {
      await markPaymentFailed({ paymentId });
    }

    return NextResponse.json({ ok: true, terminal: true });
  }

  if (eventType === "refund.updated" || eventType === "refund.created") {
    const refund = body.data?.object?.refund;
    if (!refund?.payment_id) {
      return NextResponse.json({ ok: true, ignored: "no refund payment" });
    }

    const status = (refund.status || "").toUpperCase();
    if (status !== "COMPLETED" && status !== "PENDING") {
      return NextResponse.json({ ok: true, ignored: status });
    }

    // Only apply COMPLETED refunds to the ledger (PENDING may reverse).
    if (status !== "COMPLETED") {
      return NextResponse.json({ ok: true, refundPending: true });
    }

    const paymentId = await resolvePaymentId({
      squarePaymentId: refund.payment_id,
    });
    if (paymentId == null) {
      console.warn("Square refund webhook: unmatched", refund.payment_id);
      return NextResponse.json({ ok: true, unmatched: true });
    }

    await markPaymentRefunded({
      paymentId,
      squarePaymentId: refund.payment_id,
      reason: "Square refund",
      createdBy: "square",
    });

    return NextResponse.json({ ok: true, refund: true });
  }

  if (eventType !== "payment.updated" && eventType !== "payment.created") {
    return NextResponse.json({ ok: true, ignored: eventType });
  }

  const payment = body.data?.object?.payment;
  if (!payment?.id) {
    return NextResponse.json({ ok: true, ignored: "no payment" });
  }

  const paymentId = await resolvePaymentId({
    note: payment.note,
    orderId: payment.order_id,
    squarePaymentId: payment.id,
  });

  if (paymentId == null) {
    console.warn("Square webhook: unmatched payment", payment.id, payment.note);
    return NextResponse.json({ ok: true, unmatched: true });
  }

  const status = (payment.status || "").toUpperCase();
  if (status === "COMPLETED") {
    await markPaymentSucceeded({
      paymentId,
      squarePaymentId: payment.id,
      squareOrderId: payment.order_id ?? null,
    });
  } else if (
    status === "FAILED" ||
    status === "CANCELED" ||
    status === "CANCELLED"
  ) {
    await markPaymentFailed({
      paymentId,
      squarePaymentId: payment.id,
    });
  }

  return NextResponse.json({ ok: true });
}
