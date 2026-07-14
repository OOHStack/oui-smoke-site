import { getDb } from "@/lib/db";
import { payments } from "@/lib/db/schema";
import { markPaymentFailed, markPaymentSucceeded } from "@/lib/payments";
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

type SquareWebhookBody = {
  type?: string;
  data?: {
    type?: string;
    id?: string;
    object?: {
      payment?: SquarePayment;
    };
  };
};

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
  if (eventType !== "payment.updated" && eventType !== "payment.created") {
    return NextResponse.json({ ok: true, ignored: eventType });
  }

  const payment = body.data?.object?.payment;
  if (!payment?.id) {
    return NextResponse.json({ ok: true, ignored: "no payment" });
  }

  const noteId = parsePaymentNoteId(payment.note);
  const db = getDb();

  let paymentId = noteId;
  if (paymentId == null && payment.order_id) {
    const [byOrder] = await db
      .select({ id: payments.id })
      .from(payments)
      .where(eq(payments.squareOrderId, payment.order_id))
      .limit(1);
    paymentId = byOrder?.id ?? null;
  }

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
