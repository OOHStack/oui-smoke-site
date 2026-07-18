import { getDb } from "@/lib/db";
import { flavours, jobs, serviceRequests } from "@/lib/db/schema";
import { findJobIdByDisplayToken } from "@/lib/job-display-token";
import {
  guestPayTierUnitCents,
  isGuestPayTier,
  type GuestPayTier,
} from "@/lib/ops/guest-pay";
import { normalizePaymentModel } from "@/lib/payment-model";
import { getPricingForJob } from "@/lib/pricing";
import { notifyStaffPush } from "@/lib/push";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";

const MAX_OPEN_FLOOR_ORDERS = 5;
const DUPLICATE_WINDOW_MS = 20_000;

export type PlaceFloorOrderInput = {
  token: string;
  guestPayTier: unknown;
  flavourId: unknown;
  guestLabel?: unknown;
};

export type PlaceFloorOrderResult =
  | { ok: true; requestId: number; priceCents: number; flavourLabel: string; tier: GuestPayTier }
  | { ok: false; error: string; status: number };

export async function placeFloorDisplayOrder(
  input: PlaceFloorOrderInput,
): Promise<PlaceFloorOrderResult> {
  const jobId = await findJobIdByDisplayToken(input.token);
  if (jobId == null) {
    return { ok: false, error: "Invalid display link", status: 404 };
  }

  if (!isGuestPayTier(input.guestPayTier)) {
    return { ok: false, error: "Choose Standard or Unlimited", status: 400 };
  }
  const tier = input.guestPayTier;

  const flavourId =
    typeof input.flavourId === "number"
      ? input.flavourId
      : Number(input.flavourId);
  if (!Number.isFinite(flavourId) || flavourId <= 0) {
    return { ok: false, error: "Choose a flavour", status: 400 };
  }

  const guestLabel =
    typeof input.guestLabel === "string"
      ? input.guestLabel.trim().slice(0, 40)
      : "";

  const db = getDb();
  const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
  if (!job) {
    return { ok: false, error: "Event not found", status: 404 };
  }

  const paymentModel = normalizePaymentModel(job.paymentModel);
  if (paymentModel !== "pay_at_event") {
    return {
      ok: false,
      error: "Self-order is only available for on-site sales events",
      status: 400,
    };
  }

  if (job.status === "completed" || job.status === "cancelled") {
    return { ok: false, error: "This event is closed", status: 400 };
  }

  const [flav] = await db
    .select()
    .from(flavours)
    .where(eq(flavours.id, flavourId))
    .limit(1);
  if (!flav || !flav.active) {
    return { ok: false, error: "Flavour not available", status: 400 };
  }

  const openFloor = await db
    .select({
      id: serviceRequests.id,
      flavourId: serviceRequests.flavourId,
      requestedGuestPayTier: serviceRequests.requestedGuestPayTier,
      createdAt: serviceRequests.createdAt,
    })
    .from(serviceRequests)
    .where(
      and(
        eq(serviceRequests.jobId, jobId),
        eq(serviceRequests.type, "order_unit"),
        isNull(serviceRequests.jobHookahId),
        inArray(serviceRequests.status, ["open", "acknowledged"]),
      ),
    )
    .orderBy(desc(serviceRequests.createdAt));

  if (openFloor.length >= MAX_OPEN_FLOOR_ORDERS) {
    return {
      ok: false,
      error: "Kitchen is catching up — ask staff, or try again in a moment",
      status: 429,
    };
  }

  const now = Date.now();
  const dup = openFloor.find(
    (r) =>
      r.flavourId === flav.id &&
      r.requestedGuestPayTier === tier &&
      now - r.createdAt.getTime() < DUPLICATE_WINDOW_MS,
  );
  if (dup) {
    return {
      ok: false,
      error: "That order was just sent — staff have it",
      status: 409,
    };
  }

  const pricing = await getPricingForJob(job);
  const priceCents = guestPayTierUnitCents(tier, pricing);
  const flavourLabel = flav.name;
  const tierLabel = tier === "unlimited" ? "Unlimited" : "Standard";
  const messageParts = ["Floor tablet order"];
  if (guestLabel) messageParts.push(guestLabel);
  const message = messageParts.join(" · ");

  const [created] = await db
    .insert(serviceRequests)
    .values({
      jobId,
      jobHookahId: null,
      type: "order_unit",
      message,
      flavourId: flav.id,
      flavourLabel,
      priceCents,
      priceAgreed: true,
      payPreference: "terminal",
      requestedGuestPayTier: tier,
    })
    .returning();

  void notifyStaffPush({
    title: `Floor order · ${job.title}`,
    body: `${tierLabel} · ${flavourLabel}${
      priceCents > 0 ? ` · $${(priceCents / 100).toFixed(0)}` : ""
    } · bring terminal${guestLabel ? ` · ${guestLabel}` : ""}`,
    url: `/admin/jobs/${jobId}`,
    tag: `floor-order-${created.id}`,
  });

  return {
    ok: true,
    requestId: created.id,
    priceCents,
    flavourLabel,
    tier,
  };
}
