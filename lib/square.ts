import { createHmac, timingSafeEqual } from "crypto";
import { getSiteUrl } from "@/lib/guest";

export type SquareMoney = {
  amount: number;
  currency: string;
};

export type SquarePaymentLink = {
  id: string;
  url: string;
  orderId?: string;
  longUrl?: string;
};

function squareBaseUrl() {
  const env = (process.env.SQUARE_ENVIRONMENT || "sandbox").toLowerCase();
  return env === "production"
    ? "https://connect.squareup.com"
    : "https://connect.squareupsandbox.com";
}

export function isSquareConfigured() {
  return Boolean(
    process.env.SQUARE_ACCESS_TOKEN && process.env.SQUARE_LOCATION_ID,
  );
}

/** Square rejects reserved / fake domains — only pass real buyer emails through. */
export function sanitizeBuyerEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const trimmed = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return null;
  if (
    /\.(test|invalid|example|localhost)$/i.test(trimmed) ||
    /@(example\.com|example\.org|example\.net|test\.com|localhost)$/i.test(trimmed)
  ) {
    return null;
  }
  return trimmed;
}

export function getSquareLocationId() {
  const id = process.env.SQUARE_LOCATION_ID;
  if (!id) throw new Error("SQUARE_LOCATION_ID is not set");
  return id;
}

async function squareFetch<T>(
  path: string,
  init: RequestInit & { idempotencyKey?: string } = {},
): Promise<T> {
  const token = process.env.SQUARE_ACCESS_TOKEN;
  if (!token) {
    throw new Error("SQUARE_ACCESS_TOKEN is not set");
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "Square-Version": "2025-01-23",
    ...(init.headers as Record<string, string> | undefined),
  };

  const res = await fetch(`${squareBaseUrl()}${path}`, {
    ...init,
    headers,
  });

  const data = (await res.json().catch(() => ({}))) as {
    errors?: Array<{ detail?: string; code?: string }>;
  } & T;

  if (!res.ok) {
    const detail =
      data.errors?.map((e) => e.detail || e.code).filter(Boolean).join("; ") ||
      `Square API ${res.status}`;
    throw new Error(detail);
  }

  return data;
}

/** Create a Square-hosted checkout link (quick pay). */
export async function createDepositPaymentLink(input: {
  idempotencyKey: string;
  name: string;
  amountCents: number;
  currency?: string;
  buyerEmail?: string | null;
  paymentNote: string;
  redirectUrl?: string;
}): Promise<SquarePaymentLink> {
  const body = {
    idempotency_key: input.idempotencyKey,
    quick_pay: {
      name: input.name.slice(0, 120),
      price_money: {
        amount: input.amountCents,
        currency: input.currency || "CAD",
      },
      location_id: getSquareLocationId(),
    },
    checkout_options: {
      redirect_url: input.redirectUrl || `${getSiteUrl()}/pay/thanks`,
      ask_for_shipping_address: false,
    },
    payment_note: input.paymentNote,
    ...(input.buyerEmail
      ? { pre_populated_data: { buyer_email: input.buyerEmail } }
      : {}),
  };

  const data = await squareFetch<{
    payment_link?: {
      id?: string;
      url?: string;
      order_id?: string;
      long_url?: string;
    };
  }>("/v2/online-checkout/payment-links", {
    method: "POST",
    body: JSON.stringify(body),
  });

  const link = data.payment_link;
  if (!link?.id || !link.url) {
    throw new Error("Square did not return a payment link");
  }

  return {
    id: link.id,
    url: link.url,
    orderId: link.order_id,
    longUrl: link.long_url,
  };
}

/**
 * Verify Square webhook signature.
 * HMAC-SHA256 of (notificationUrl + rawBody) with the signature key.
 */
export function verifySquareWebhookSignature(opts: {
  signatureHeader: string | null;
  body: string;
  notificationUrl?: string;
}): boolean {
  const key = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY;
  if (!key) {
    // Allow processing in sandbox without signature only if explicitly opted in
    return process.env.SQUARE_WEBHOOK_SKIP_VERIFY === "1";
  }
  if (!opts.signatureHeader) return false;

  const notificationUrl =
    opts.notificationUrl || `${getSiteUrl()}/api/square/webhook`;
  const payload = notificationUrl + opts.body;
  const hmac = createHmac("sha256", key).update(payload).digest("base64");

  try {
    const a = Buffer.from(hmac);
    const b = Buffer.from(opts.signatureHeader);
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/** Parse oui:payment:{id} from Square payment note */
export function parsePaymentNoteId(note: string | null | undefined): number | null {
  if (!note) return null;
  const m = note.match(/oui:payment:(\d+)/i);
  if (!m) return null;
  const id = Number(m[1]);
  return Number.isFinite(id) ? id : null;
}
