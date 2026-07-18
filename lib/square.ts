import { createHmac, randomUUID, timingSafeEqual } from "crypto";
import { CONTACT_EMAIL } from "@/lib/brand-contact";
import { getSiteUrl } from "@/lib/guest";
import {
  DEFAULT_PRICING,
  hstCents,
  hstPercentLabel,
  splitInclusiveHstCents,
  withHstCents,
} from "@/lib/pricing-config";

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

/** Env-only Terminal device id (Dashboard / Vercel). Prefer resolveSquareTerminalDeviceId for runtime. */
export function getEnvSquareTerminalDeviceId() {
  return process.env.SQUARE_TERMINAL_DEVICE_ID?.trim() || null;
}

/** Sync check — env device id only. Prefer isSquareTerminalReady() when DB override matters. */
export function isSquareTerminalConfigured() {
  return Boolean(isSquareConfigured() && getEnvSquareTerminalDeviceId());
}

export function getSquareTerminalDeviceId() {
  const id = getEnvSquareTerminalDeviceId();
  if (!id) throw new Error("SQUARE_TERMINAL_DEVICE_ID is not set");
  return id;
}

export function getSquareEnvironment(): "production" | "sandbox" {
  return (process.env.SQUARE_ENVIRONMENT || "sandbox").toLowerCase() ===
    "production"
    ? "production"
    : "sandbox";
}

export function isSquareWebhookConfigured() {
  return Boolean(process.env.SQUARE_WEBHOOK_SIGNATURE_KEY?.trim()) ||
    process.env.SQUARE_WEBHOOK_SKIP_VERIFY === "1";
}

/** Mask secrets for admin UI — never return full tokens. */
export function maskSecret(value: string | null | undefined, keep = 4): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (trimmed.length <= keep) return "••••";
  return `${"•".repeat(Math.min(12, trimmed.length - keep))}${trimmed.slice(-keep)}`;
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

export type CheckoutAmountMode =
  /** amountCents is tax-inclusive (deposit / balance quotes). */
  | "inclusive"
  /** amountCents is before HST (guest unit / refill catalog). */
  | "exclusive";

/**
 * Create a Square-hosted checkout with net + HST line items and Oui branding cues.
 * Logo / button colours still come from Square Dashboard → Payment links → Branding.
 */
export async function createDepositPaymentLink(input: {
  idempotencyKey: string;
  /** Primary line-item title (service / deposit / refill). */
  name: string;
  amountCents: number;
  /** Defaults to inclusive for booking deposits. */
  amountMode?: CheckoutAmountMode;
  hstRate?: number;
  currency?: string;
  buyerEmail?: string | null;
  buyerPhone?: string | null;
  paymentNote: string;
  redirectUrl?: string;
  /** Optional note under the service line (event name, flavour, etc.). */
  lineNote?: string | null;
  /** Payment-link description (seller-facing + some checkout contexts). */
  description?: string | null;
}): Promise<SquarePaymentLink> {
  const currency = input.currency || "CAD";
  const hstRate = input.hstRate ?? DEFAULT_PRICING.hstRate;
  const mode = input.amountMode ?? "inclusive";
  const raw = Math.max(0, Math.round(input.amountCents));

  let netCents: number;
  let taxCents: number;
  if (mode === "exclusive") {
    netCents = raw;
    taxCents = hstCents(raw, hstRate);
  } else {
    const split = splitInclusiveHstCents(raw, hstRate);
    netCents = split.netCents;
    taxCents = split.taxCents;
  }

  const totalCents =
    mode === "exclusive" ? withHstCents(netCents, hstRate) : raw;
  if (totalCents < 100) {
    throw new Error("Checkout amount must be at least $1.00");
  }

  // Keep total exact: if reverse-split drifted, put remainder on tax line.
  if (mode === "inclusive" && netCents + taxCents !== totalCents) {
    taxCents = Math.max(0, totalCents - netCents);
  }

  const hstLabel = `HST (${hstPercentLabel(hstRate)}%)`;
  const title = input.name.replace(/\s*\+?\s*HST\s*$/i, "").trim().slice(0, 120);
  const lineNote = (input.lineNote || "").trim().slice(0, 500) || undefined;

  const lineItems: Array<Record<string, unknown>> = [
    {
      name: title || "Oui Smoke",
      quantity: "1",
      item_type: "ITEM",
      base_price_money: { amount: netCents, currency },
      ...(lineNote ? { note: lineNote } : {}),
    },
  ];
  if (taxCents > 0) {
    lineItems.push({
      name: hstLabel,
      quantity: "1",
      item_type: "ITEM",
      base_price_money: { amount: taxCents, currency },
      note: "Ontario HST",
    });
  }

  const body = {
    idempotency_key: input.idempotencyKey,
    description: (
      input.description ||
      "Oui Smoke — mobile hookah catering"
    ).slice(0, 500),
    order: {
      location_id: getSquareLocationId(),
      reference_id: input.paymentNote.slice(0, 40),
      line_items: lineItems,
    },
    checkout_options: {
      redirect_url: input.redirectUrl || `${getSiteUrl()}/pay/thanks`,
      ask_for_shipping_address: false,
      merchant_support_email: CONTACT_EMAIL,
      accepted_payment_methods: {
        apple_pay: true,
        google_pay: true,
        cash_app_pay: false,
      },
    },
    payment_note: input.paymentNote,
    ...(input.buyerEmail || input.buyerPhone
      ? {
          pre_populated_data: {
            ...(input.buyerEmail ? { buyer_email: input.buyerEmail } : {}),
            ...(input.buyerPhone
              ? { buyer_phone_number: input.buyerPhone }
              : {}),
          },
        }
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

export type SquareTerminalCheckout = {
  id: string;
  status?: string;
  paymentIds?: string[];
};

/** Push an amount to the paired Square Terminal hardware. */
export async function createTerminalCheckout(input: {
  idempotencyKey: string;
  amountCents: number;
  currency?: string;
  /** Stored as note + reference for webhook matching — use oui:payment:{id} */
  paymentNote: string;
  referenceId?: string;
  label?: string;
  /** Paired Terminal API device id — falls back to env if omitted. */
  deviceId?: string | null;
}): Promise<SquareTerminalCheckout> {
  const deviceId = input.deviceId?.trim() || getSquareTerminalDeviceId();
  const body = {
    idempotency_key: input.idempotencyKey.slice(0, 64),
    checkout: {
      amount_money: {
        amount: input.amountCents,
        currency: input.currency || "CAD",
      },
      device_options: {
        device_id: deviceId,
        skip_receipt_screen: false,
      },
      reference_id: (input.referenceId || input.paymentNote).slice(0, 40),
      note: input.paymentNote.slice(0, 500),
    },
  };

  const data = await squareFetch<{
    checkout?: {
      id?: string;
      status?: string;
      payment_ids?: string[];
    };
  }>("/v2/terminals/checkouts", {
    method: "POST",
    body: JSON.stringify(body),
  });

  const checkout = data.checkout;
  if (!checkout?.id) {
    throw new Error("Square Terminal did not return a checkout");
  }

  return {
    id: checkout.id,
    status: checkout.status,
    paymentIds: checkout.payment_ids,
  };
}

export type SquarePaymentRecord = {
  id: string;
  status: string | null;
  amountCents: number;
  tipCents: number;
  currency: string | null;
  orderId: string | null;
  note: string | null;
  createdAt: string | null;
  refundedCents: number;
};

export async function getSquarePayment(
  paymentId: string,
): Promise<SquarePaymentRecord | null> {
  try {
    const data = await squareFetch<{
      payment?: {
        id?: string;
        status?: string;
        amount_money?: { amount?: number; currency?: string };
        tip_money?: { amount?: number };
        order_id?: string;
        note?: string;
        created_at?: string;
        refunded_money?: { amount?: number };
      };
    }>(`/v2/payments/${encodeURIComponent(paymentId)}`);
    const p = data.payment;
    if (!p?.id) return null;
    return {
      id: p.id,
      status: p.status ?? null,
      amountCents: Number(p.amount_money?.amount ?? 0),
      tipCents: Number(p.tip_money?.amount ?? 0),
      currency: p.amount_money?.currency ?? null,
      orderId: p.order_id ?? null,
      note: p.note ?? null,
      createdAt: p.created_at ?? null,
      refundedCents: Number(p.refunded_money?.amount ?? 0),
    };
  } catch {
    return null;
  }
}

/** Full or partial refund against a completed Square payment. */
export async function createSquareRefund(input: {
  idempotencyKey: string;
  paymentId: string;
  amountCents: number;
  currency?: string;
  reason?: string;
}): Promise<{ id: string; status: string | null; amountCents: number }> {
  const amountCents = Math.round(input.amountCents);
  if (!Number.isFinite(amountCents) || amountCents < 1) {
    throw new Error("Refund amount must be at least 1 cent");
  }

  const data = await squareFetch<{
    refund?: {
      id?: string;
      status?: string;
      amount_money?: { amount?: number };
    };
  }>("/v2/refunds", {
    method: "POST",
    body: JSON.stringify({
      idempotency_key: input.idempotencyKey.slice(0, 45),
      payment_id: input.paymentId,
      amount_money: {
        amount: amountCents,
        currency: input.currency || "CAD",
      },
      reason: (input.reason || "Oui Smoke refund").slice(0, 192),
    }),
  });

  const refund = data.refund;
  if (!refund?.id) throw new Error("Square did not return a refund");
  return {
    id: refund.id,
    status: refund.status ?? null,
    amountCents: Number(refund.amount_money?.amount ?? amountCents),
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

export type SquareDeviceCode = {
  id: string;
  name: string | null;
  code: string | null;
  status: string | null;
  deviceId: string | null;
  locationId: string | null;
  productType: string | null;
  pairBy: string | null;
  createdAt: string | null;
};

export type SquareDeviceSummary = {
  id: string;
  status: string | null;
  name: string | null;
  deviceType: string | null;
};

/** Create a Terminal API pairing code (valid ~5 minutes until used). */
export async function createSquareDeviceCode(input?: {
  name?: string;
  locationId?: string;
}): Promise<SquareDeviceCode> {
  const data = await squareFetch<{
    device_code?: {
      id?: string;
      name?: string;
      code?: string;
      status?: string;
      device_id?: string;
      location_id?: string;
      product_type?: string;
      pair_by?: string;
      created_at?: string;
    };
  }>("/v2/devices/codes", {
    method: "POST",
    body: JSON.stringify({
      idempotency_key: randomUUID(),
      device_code: {
        name: (input?.name || "Oui Floor Terminal").slice(0, 80),
        product_type: "TERMINAL_API",
        location_id: input?.locationId || getSquareLocationId(),
      },
    }),
  });

  const dc = data.device_code;
  if (!dc?.id) throw new Error("Square did not return a device code");
  return mapDeviceCode(dc);
}

export async function getSquareDeviceCode(id: string): Promise<SquareDeviceCode | null> {
  try {
    const data = await squareFetch<{
      device_code?: Parameters<typeof mapDeviceCode>[0];
    }>(`/v2/devices/codes/${encodeURIComponent(id)}`);
    return data.device_code ? mapDeviceCode(data.device_code) : null;
  } catch {
    return null;
  }
}

export async function listSquareDeviceCodes(): Promise<SquareDeviceCode[]> {
  const data = await squareFetch<{
    device_codes?: Array<Parameters<typeof mapDeviceCode>[0]>;
  }>("/v2/devices/codes");
  return (data.device_codes ?? []).map(mapDeviceCode);
}

export async function listSquareDevices(): Promise<SquareDeviceSummary[]> {
  const data = await squareFetch<{
    devices?: Array<{
      id?: string;
      status?: string;
      attributes?: {
        name?: string;
        type?: string;
        device_type?: string;
      };
    }>;
  }>("/v2/devices");
  return (data.devices ?? []).map((d) => ({
    id: d.id || "",
    status: d.status ?? null,
    name: d.attributes?.name ?? null,
    deviceType: d.attributes?.type ?? d.attributes?.device_type ?? null,
  })).filter((d) => d.id);
}

export async function getSquareLocationSummary(locationId?: string) {
  const id = locationId || getSquareLocationId();
  const data = await squareFetch<{
    location?: {
      id?: string;
      name?: string;
      status?: string;
      currency?: string;
      business_name?: string;
      country?: string;
      type?: string;
    };
  }>(`/v2/locations/${encodeURIComponent(id)}`);
  const loc = data.location;
  if (!loc?.id) throw new Error("Square location not found");
  return {
    id: loc.id,
    name: loc.name ?? null,
    status: loc.status ?? null,
    currency: loc.currency ?? null,
    businessName: loc.business_name ?? null,
    country: loc.country ?? null,
    type: loc.type ?? null,
  };
}

/** Probe whether a device id is authorized for Terminal checkouts (cancels immediately if created). */
export async function probeSquareTerminalDevice(deviceId: string): Promise<{
  ok: boolean;
  detail: string;
  checkoutId?: string;
}> {
  try {
    const checkout = await createTerminalCheckout({
      idempotencyKey: randomUUID(),
      amountCents: 100,
      paymentNote: "oui:probe",
      referenceId: "oui-probe",
      deviceId,
    });
    if (checkout.id) {
      try {
        await squareFetch(`/v2/terminals/checkouts/${checkout.id}/cancel`, {
          method: "POST",
          body: JSON.stringify({}),
        });
      } catch {
        /* best-effort cancel */
      }
    }
    return {
      ok: true,
      detail: "Device accepted a Terminal checkout",
      checkoutId: checkout.id,
    };
  } catch (err) {
    return {
      ok: false,
      detail: err instanceof Error ? err.message : "Probe failed",
    };
  }
}

function mapDeviceCode(dc: {
  id?: string;
  name?: string;
  code?: string;
  status?: string;
  device_id?: string;
  location_id?: string;
  product_type?: string;
  pair_by?: string;
  created_at?: string;
}): SquareDeviceCode {
  return {
    id: dc.id || "",
    name: dc.name ?? null,
    code: dc.code ?? null,
    status: dc.status ?? null,
    deviceId: dc.device_id ?? null,
    locationId: dc.location_id ?? null,
    productType: dc.product_type ?? null,
    pairBy: dc.pair_by ?? null,
    createdAt: dc.created_at ?? null,
  };
}
