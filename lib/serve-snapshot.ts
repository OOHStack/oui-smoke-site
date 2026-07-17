import { getDb } from "@/lib/db";
import {
  flavours,
  hookahs,
  jobHookahs,
  jobPhotos,
  jobs,
  serviceRequests,
} from "@/lib/db/schema";
import {
  defaultRefillCentsForTier,
  guestPayTierUnitCents,
  isGuestPayTier,
  refillChargeCents,
  type GuestPayTier,
} from "@/lib/ops/guest-pay";
import { getPricingForJob, hstPercentLabel, withHstCents } from "@/lib/pricing";
import {
  findGuestOrderUnitPayment,
  findGuestRefillPayment,
} from "@/lib/refill-payment-link";
import { and, asc, desc, eq, inArray, lt, ne, sql } from "drizzle-orm";

/** Base minutes after claim before a quiet floor ETA. */
export const GUEST_ETA_BASE_MINUTES = 3;
/** Extra minutes per other open/acked call ahead on the same job. */
export const GUEST_ETA_PER_AHEAD_MINUTES = 2;
/** Cap so we never overpromise absurd waits. */
export const GUEST_ETA_MAX_MINUTES = 15;

/** @deprecated use guestEtaMinutesFromQueue — kept for imports that expect a constant. */
export const GUEST_ETA_MINUTES = GUEST_ETA_BASE_MINUTES;

export function guestEtaMinutesFromQueue(queueAhead: number): number {
  const n = Math.max(0, Math.floor(queueAhead));
  return Math.min(
    GUEST_ETA_MAX_MINUTES,
    GUEST_ETA_BASE_MINUTES + n * GUEST_ETA_PER_AHEAD_MINUTES,
  );
}

export async function loadServeSnapshot(token: string) {
  const db = getDb();
  const [assignment] = await db
    .select({
      id: jobHookahs.id,
      jobId: jobHookahs.jobId,
      status: jobHookahs.status,
      sentOutAt: jobHookahs.sentOutAt,
      returnedAt: jobHookahs.returnedAt,
      flavourId: jobHookahs.flavourId,
      flavourLabel: jobHookahs.flavourLabel,
      refillCount: jobHookahs.refillCount,
      guestPayTier: jobHookahs.guestPayTier,
      guestRating: jobHookahs.guestRating,
      guestComment: jobHookahs.guestComment,
      guestFeedbackAt: jobHookahs.guestFeedbackAt,
      modelNumber: hookahs.modelNumber,
      flavourName: flavours.name,
      jobTitle: jobs.title,
      jobStatus: jobs.status,
      paymentModel: jobs.paymentModel,
      pricingJson: jobs.pricingJson,
    })
    .from(jobHookahs)
    .innerJoin(hookahs, eq(hookahs.id, jobHookahs.hookahId))
    .innerJoin(jobs, eq(jobs.id, jobHookahs.jobId))
    .leftJoin(flavours, eq(flavours.id, jobHookahs.flavourId))
    .where(eq(jobHookahs.guestToken, token))
    .limit(1);

  if (!assignment) return { error: "not_found" as const };

  const pricing = await getPricingForJob(assignment);

  const tier = isGuestPayTier(assignment.guestPayTier)
    ? (assignment.guestPayTier as GuestPayTier)
    : null;
  const refillPriceCents = defaultRefillCentsForTier(tier, pricing);
  const refillTotalCents = refillChargeCents(refillPriceCents, pricing);

  let requests: Array<{
    id: number;
    type: (typeof serviceRequests.$inferSelect)["type"];
    message: string | null;
    status: (typeof serviceRequests.$inferSelect)["status"];
    flavourLabel: string | null;
    priceCents: number | null;
    payPreference: (typeof serviceRequests.$inferSelect)["payPreference"];
    requestedGuestPayTier: (typeof serviceRequests.$inferSelect)["requestedGuestPayTier"];
    createdAt: Date;
    acknowledgedAt: Date | null;
    resolvedAt: Date | null;
    acknowledgedBy: string | null;
  }> = [];

  try {
    requests = await db
      .select({
        id: serviceRequests.id,
        type: serviceRequests.type,
        message: serviceRequests.message,
        status: serviceRequests.status,
        flavourLabel: serviceRequests.flavourLabel,
        priceCents: serviceRequests.priceCents,
        payPreference: serviceRequests.payPreference,
        requestedGuestPayTier: serviceRequests.requestedGuestPayTier,
        createdAt: serviceRequests.createdAt,
        acknowledgedAt: serviceRequests.acknowledgedAt,
        resolvedAt: serviceRequests.resolvedAt,
        acknowledgedBy: serviceRequests.acknowledgedBy,
      })
      .from(serviceRequests)
      .where(eq(serviceRequests.jobHookahId, assignment.id))
      .orderBy(desc(serviceRequests.createdAt))
      .limit(10);
  } catch (err) {
    console.error("service_requests query failed", err);
  }

  const menu = await db
    .select({
      id: flavours.id,
      name: flavours.name,
      kind: flavours.kind,
      description: flavours.description,
    })
    .from(flavours)
    .where(eq(flavours.active, true))
    .orderBy(asc(flavours.name));

  let photos: Array<{ id: number; url: string; createdAt: Date }> = [];
  try {
    photos = await db
      .select({
        id: jobPhotos.id,
        url: jobPhotos.url,
        createdAt: jobPhotos.createdAt,
      })
      .from(jobPhotos)
      .where(eq(jobPhotos.jobHookahId, assignment.id))
      .orderBy(asc(jobPhotos.createdAt))
      .limit(24);
  } catch (err) {
    console.error("job_photos query failed", err);
  }

  const active =
    requests.find((r) => r.status === "open" || r.status === "acknowledged") ?? null;
  const currentFlavour = assignment.flavourName ?? assignment.flavourLabel ?? null;
  const sessionEnded =
    assignment.status !== "out" || assignment.jobStatus === "completed";

  const endAt =
    assignment.returnedAt ??
    (sessionEnded ? new Date() : null);
  const durationMs =
    assignment.sentOutAt && endAt
      ? Math.max(0, endAt.getTime() - new Date(assignment.sentOutAt).getTime())
      : null;

  const resolved = requests.filter((r) => r.status === "resolved");
  const sessionSummary = sessionEnded
    ? {
        flavour: currentFlavour,
        refillCount: assignment.refillCount ?? 0,
        durationMs,
        requestCount: requests.length,
        coalsCount: resolved.filter((r) => r.type === "coals").length,
        refillRequestCount: resolved.filter((r) => r.type === "refill").length,
        issueCount: resolved.filter((r) => r.type === "issue").length,
      }
    : null;

  let checkoutUrl: string | null = null;
  let paymentStatus: string | null = null;
  if (active?.type === "refill") {
    const pay = await findGuestRefillPayment(active.id);
    if (pay) {
      checkoutUrl = pay.checkoutUrl;
      paymentStatus = pay.status;
    }
  } else if (active?.type === "order_unit") {
    const pay = await findGuestOrderUnitPayment(active.id);
    if (pay) {
      checkoutUrl = pay.checkoutUrl;
      paymentStatus = pay.status;
    }
  }

  let queueAhead = 0;
  if (active?.status === "acknowledged") {
    try {
      const [row] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(serviceRequests)
        .where(
          and(
            eq(serviceRequests.jobId, assignment.jobId),
            inArray(serviceRequests.status, ["open", "acknowledged"]),
            ne(serviceRequests.id, active.id),
            lt(serviceRequests.createdAt, active.createdAt),
          ),
        );
      queueAhead = Number(row?.n ?? 0) || 0;
    } catch (err) {
      console.error("queue ahead count failed", err);
    }
  }

  const etaMinutes =
    active?.status === "acknowledged"
      ? guestEtaMinutesFromQueue(queueAhead)
      : null;

  const activeRequest = active
    ? {
        ...active,
        checkoutUrl,
        paymentStatus,
        queueAhead,
        etaMinutes,
        etaAt:
          etaMinutes != null && active.acknowledgedAt
            ? new Date(
                new Date(active.acknowledgedAt).getTime() +
                  etaMinutes * 60 * 1000,
              ).toISOString()
            : null,
      }
    : null;

  const standardUnitCents = guestPayTierUnitCents("standard", pricing);
  const unlimitedUnitCents = guestPayTierUnitCents("unlimited", pricing);
  const canOrderUnit = assignment.paymentModel === "pay_at_event";

  return {
    modelNumber: assignment.modelNumber,
    flavour: currentFlavour,
    flavourId: assignment.flavourId,
    jobTitle: assignment.jobTitle,
    assignmentStatus: assignment.status,
    jobStatus: assignment.jobStatus,
    paymentModel: assignment.paymentModel,
    sentOutAt: assignment.sentOutAt,
    returnedAt: assignment.returnedAt,
    refillCount: assignment.refillCount ?? 0,
    refillPriceCents,
    refillChargeCents: refillTotalCents,
    standardUnitCents,
    unlimitedUnitCents,
    standardUnitChargeCents: withHstCents(standardUnitCents, pricing.hstRate),
    unlimitedUnitChargeCents: withHstCents(unlimitedUnitCents, pricing.hstRate),
    canOrderUnit,
    hstRate: pricing.hstRate,
    hstPercent: hstPercentLabel(pricing.hstRate),
    guestPayTier: tier,
    flavours: menu,
    active: !!active,
    sessionEnded,
    sessionSummary,
    guestFeedback: assignment.guestFeedbackAt
      ? {
          rating: assignment.guestRating,
          comment: assignment.guestComment || "",
          submittedAt: assignment.guestFeedbackAt,
        }
      : null,
    rebookPromo: {
      code: pricing.guestRebookCode,
      discountDollars: pricing.guestRebookDiscountDollars,
      label: pricing.guestRebookLabel,
      bookUrl: `/book?code=${pricing.guestRebookCode}`,
    },
    activeRequest,
    recentRequests: requests.slice(0, 5),
    photos: photos.map((p) => ({
      id: p.id,
      url: p.url,
      createdAt: p.createdAt,
    })),
    serverTime: new Date().toISOString(),
  };
}
