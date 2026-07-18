import { getDb } from "@/lib/db";
import { jobEvents, jobs, payments } from "@/lib/db/schema";
import { getSiteUrl } from "@/lib/guest";
import { getPricingForJob, withHstCents } from "@/lib/pricing";
import {
  createDepositPaymentLink,
  isSquareConfigured,
} from "@/lib/square";
import { eq, inArray } from "drizzle-orm";

export function guestRefillPaymentKey(serviceRequestId: number) {
  return `guest-refill-${serviceRequestId}`;
}

export async function findGuestRefillPayment(serviceRequestId: number) {
  const db = getDb();
  const [row] = await db
    .select()
    .from(payments)
    .where(eq(payments.idempotencyKey, guestRefillPaymentKey(serviceRequestId)))
    .limit(1);
  return row ?? null;
}

/** Batch lookup of guest-refill / guest-order-unit payment status/url by service request id. */
export async function guestRefillPaymentMap(serviceRequestIds: number[]) {
  const map = new Map<
    number,
    {
      paymentStatus: string;
      checkoutUrl: string | null;
      paymentId: number;
    }
  >();
  if (serviceRequestIds.length === 0) return map;

  const keys = [
    ...serviceRequestIds.map(guestRefillPaymentKey),
    ...serviceRequestIds.map(guestOrderUnitPaymentKey),
  ];
  const db = getDb();
  const rows = await db
    .select()
    .from(payments)
    .where(inArray(payments.idempotencyKey, keys));

  for (const row of rows) {
    const refill = row.idempotencyKey.match(/^guest-refill-(\d+)$/);
    const order = row.idempotencyKey.match(/^guest-order-unit-(\d+)$/);
    const id = refill ? Number(refill[1]) : order ? Number(order[1]) : NaN;
    if (!Number.isFinite(id)) continue;
    map.set(id, {
      paymentStatus: row.status,
      checkoutUrl: row.checkoutUrl,
      paymentId: row.id,
    });
  }
  return map;
}

/**
 * Create a pending Square checkout link for a guest refill request.
 * Soft-fails (returns ok:false) so the service call still stands for cash/Terminal.
 */
export async function createGuestRefillCheckoutLink(opts: {
  jobId: number;
  jobHookahId: number;
  serviceRequestId: number;
  amountCents: number;
  flavourLabel: string;
  guestToken?: string | null;
  createdBy?: string;
}): Promise<
  | {
      ok: true;
      url: string;
      paymentId: number;
      amountCents: number;
    }
  | { ok: false; reason: string }
> {
  if (!isSquareConfigured()) {
    return { ok: false, reason: "square_not_configured" };
  }
  if (opts.amountCents < 100) {
    return { ok: false, reason: "amount_too_small" };
  }

  const pricing = await getPricingForJob(opts.jobId);
  const amountCents = withHstCents(opts.amountCents, pricing.hstRate);
  if (amountCents < 100) {
    return { ok: false, reason: "amount_too_small" };
  }

  const db = getDb();
  const existing = await findGuestRefillPayment(opts.serviceRequestId);
  if (existing?.status === "succeeded" && existing.checkoutUrl) {
    return {
      ok: true,
      url: existing.checkoutUrl,
      paymentId: existing.id,
      amountCents: existing.amountCents,
    };
  }
  if (existing?.status === "pending" && existing.checkoutUrl) {
    return {
      ok: true,
      url: existing.checkoutUrl,
      paymentId: existing.id,
      amountCents: existing.amountCents,
    };
  }

  const label = `Flavour refill · ${opts.flavourLabel}`.slice(0, 120);
  const idempotencyKey = guestRefillPaymentKey(opts.serviceRequestId);
  const createdBy = opts.createdBy || "guest";
  const netCents = Math.round(opts.amountCents);

  let pendingId: number;
  if (existing && (existing.status === "failed" || existing.status === "cancelled")) {
    const [revived] = await db
      .update(payments)
      .set({
        status: "pending",
        amountCents,
        label,
        checkoutUrl: null,
        squarePaymentLinkId: null,
        squareOrderId: null,
        squarePaymentId: null,
        paidAt: null,
        updatedAt: new Date(),
        createdBy,
      })
      .where(eq(payments.id, existing.id))
      .returning();
    pendingId = revived.id;
  } else if (existing) {
    pendingId = existing.id;
  } else {
    const [pending] = await db
      .insert(payments)
      .values({
        jobId: opts.jobId,
        jobHookahId: opts.jobHookahId,
        kind: "refill",
        status: "pending",
        amountCents,
        currency: "CAD",
        label,
        idempotencyKey,
        createdBy,
      })
      .returning();
    pendingId = pending.id;
  }

  try {
    const thanks = new URL(`${getSiteUrl()}/pay/thanks`);
    thanks.searchParams.set("job", String(opts.jobId));
    thanks.searchParams.set("refill", "1");
    thanks.searchParams.set("amount", String(amountCents));
    if (opts.flavourLabel) thanks.searchParams.set("flavour", opts.flavourLabel);
    if (opts.guestToken) thanks.searchParams.set("token", opts.guestToken);

    const link = await createDepositPaymentLink({
      idempotencyKey: `${idempotencyKey}-${pendingId}`,
      name: label,
      amountCents: netCents,
      amountMode: "exclusive",
      hstRate: pricing.hstRate,
      currency: "CAD",
      paymentNote: `oui:payment:${pendingId}`,
      redirectUrl: thanks.toString(),
      lineNote: "Oui Smoke · guest refill at your event",
      description: `Oui Smoke · refill · ${opts.flavourLabel}`,
    });

    await db
      .update(payments)
      .set({
        checkoutUrl: link.url,
        squarePaymentLinkId: link.id,
        squareOrderId: link.orderId ?? null,
        updatedAt: new Date(),
      })
      .where(eq(payments.id, pendingId));

    const dollars = (amountCents / 100).toFixed(2);
    await db.insert(jobEvents).values({
      jobId: opts.jobId,
      jobHookahId: opts.jobHookahId,
      type: "note",
      message: `Guest refill link created — $${dollars} CAD incl. HST · ${opts.flavourLabel}`,
      createdBy,
    });

    return {
      ok: true,
      url: link.url,
      paymentId: pendingId,
      amountCents,
    };
  } catch (err) {
    await db
      .update(payments)
      .set({ status: "failed", updatedAt: new Date() })
      .where(eq(payments.id, pendingId));
    console.error("createGuestRefillCheckoutLink failed", err);
    return {
      ok: false,
      reason: err instanceof Error ? err.message : "square_failed",
    };
  }
}

export function guestOrderUnitPaymentKey(serviceRequestId: number) {
  return `guest-order-unit-${serviceRequestId}`;
}

export async function findGuestOrderUnitPayment(serviceRequestId: number) {
  const db = getDb();
  const [row] = await db
    .select()
    .from(payments)
    .where(eq(payments.idempotencyKey, guestOrderUnitPaymentKey(serviceRequestId)))
    .limit(1);
  return row ?? null;
}

/**
 * Square checkout for a guest-ordered extra hookah (Standard / Unlimited).
 * Soft-fails so the service call still stands for cash/Terminal.
 */
export async function createGuestOrderUnitCheckoutLink(opts: {
  jobId: number;
  /** Prefer set once ops assigns a unit — enables onsite_unit ledger + auto Ready. */
  jobHookahId?: number | null;
  serviceRequestId: number;
  amountCents: number;
  flavourLabel: string;
  tierLabel: string;
  guestToken?: string | null;
  createdBy?: string;
}): Promise<
  | {
      ok: true;
      url: string;
      paymentId: number;
      amountCents: number;
    }
  | { ok: false; reason: string }
> {
  if (!isSquareConfigured()) {
    return { ok: false, reason: "square_not_configured" };
  }
  if (opts.amountCents < 100) {
    return { ok: false, reason: "amount_too_small" };
  }

  const pricing = await getPricingForJob(opts.jobId);
  const amountCents = withHstCents(opts.amountCents, pricing.hstRate);
  if (amountCents < 100) {
    return { ok: false, reason: "amount_too_small" };
  }

  const db = getDb();
  const existing = await findGuestOrderUnitPayment(opts.serviceRequestId);
  if (existing?.status === "succeeded" && existing.checkoutUrl) {
    return {
      ok: true,
      url: existing.checkoutUrl,
      paymentId: existing.id,
      amountCents: existing.amountCents,
    };
  }
  if (existing?.status === "pending" && existing.checkoutUrl) {
    // Keep assignment linked if ops assigned after the link was minted.
    if (
      opts.jobHookahId != null &&
      existing.jobHookahId == null
    ) {
      await db
        .update(payments)
        .set({
          jobHookahId: opts.jobHookahId,
          kind: "onsite_unit",
          updatedAt: new Date(),
        })
        .where(eq(payments.id, existing.id));
    }
    return {
      ok: true,
      url: existing.checkoutUrl,
      paymentId: existing.id,
      amountCents: existing.amountCents,
    };
  }

  const label =
    `Extra hookah · ${opts.tierLabel} · ${opts.flavourLabel}`.slice(0, 120);
  const idempotencyKey = guestOrderUnitPaymentKey(opts.serviceRequestId);
  const createdBy = opts.createdBy || "guest";
  const netCents = Math.round(opts.amountCents);
  const jobHookahId = opts.jobHookahId ?? null;
  // Prefer onsite_unit once assigned so webhook parks Ready + QR like Terminal.
  const kind = jobHookahId != null ? "onsite_unit" : "other";

  let pendingId: number;
  if (existing && (existing.status === "failed" || existing.status === "cancelled")) {
    const [revived] = await db
      .update(payments)
      .set({
        status: "pending",
        amountCents,
        label,
        kind,
        jobHookahId,
        checkoutUrl: null,
        squarePaymentLinkId: null,
        squareOrderId: null,
        squarePaymentId: null,
        paidAt: null,
        updatedAt: new Date(),
        createdBy,
      })
      .where(eq(payments.id, existing.id))
      .returning();
    pendingId = revived.id;
  } else if (existing) {
    pendingId = existing.id;
    await db
      .update(payments)
      .set({
        status: "pending",
        amountCents,
        label,
        kind,
        jobHookahId,
        updatedAt: new Date(),
        createdBy,
      })
      .where(eq(payments.id, existing.id));
  } else {
    const [pending] = await db
      .insert(payments)
      .values({
        jobId: opts.jobId,
        jobHookahId,
        kind,
        status: "pending",
        amountCents,
        currency: "CAD",
        label,
        idempotencyKey,
        createdBy,
      })
      .returning();
    pendingId = pending.id;
  }

  try {
    const thanks = new URL(`${getSiteUrl()}/pay/thanks`);
    thanks.searchParams.set("job", String(opts.jobId));
    thanks.searchParams.set("order_unit", "1");
    thanks.searchParams.set("amount", String(amountCents));
    if (opts.flavourLabel) thanks.searchParams.set("flavour", opts.flavourLabel);
    if (opts.guestToken) thanks.searchParams.set("token", opts.guestToken);

    const link = await createDepositPaymentLink({
      idempotencyKey: `${idempotencyKey}-${pendingId}`,
      name: label,
      amountCents: netCents,
      amountMode: "exclusive",
      hstRate: pricing.hstRate,
      currency: "CAD",
      paymentNote: `oui:payment:${pendingId}`,
      redirectUrl: thanks.toString(),
      lineNote: `${opts.tierLabel} plan · Oui Smoke floor order`,
      description: `Oui Smoke · ${opts.tierLabel} · ${opts.flavourLabel}`,
    });

    await db
      .update(payments)
      .set({
        checkoutUrl: link.url,
        squarePaymentLinkId: link.id,
        squareOrderId: link.orderId ?? null,
        kind,
        jobHookahId,
        updatedAt: new Date(),
      })
      .where(eq(payments.id, pendingId));

    const dollars = (amountCents / 100).toFixed(2);
    await db.insert(jobEvents).values({
      jobId: opts.jobId,
      jobHookahId: jobHookahId,
      type: "note",
      message: `Guest extra-hookah link created — $${dollars} CAD incl. HST · ${opts.tierLabel} · ${opts.flavourLabel}`,
      createdBy,
    });

    return {
      ok: true,
      url: link.url,
      paymentId: pendingId,
      amountCents,
    };
  } catch (err) {
    await db
      .update(payments)
      .set({ status: "failed", updatedAt: new Date() })
      .where(eq(payments.id, pendingId));
    console.error("createGuestOrderUnitCheckoutLink failed", err);
    return {
      ok: false,
      reason: err instanceof Error ? err.message : "square_failed",
    };
  }
}
