import { getDb } from "@/lib/db";
import {
  flavours,
  hookahs,
  jobHookahs,
  jobPhotos,
  jobs,
  serviceRequests,
} from "@/lib/db/schema";
import { GUEST_REBOOK_PROMO, REFILL_PRICE_CENTS } from "@/lib/pricing";
import { asc, desc, eq } from "drizzle-orm";

/** Default minutes from “On the way” until guest should expect staff. */
export const GUEST_ETA_MINUTES = 5;

export async function loadServeSnapshot(token: string) {
  const db = getDb();
  const [assignment] = await db
    .select({
      id: jobHookahs.id,
      status: jobHookahs.status,
      sentOutAt: jobHookahs.sentOutAt,
      returnedAt: jobHookahs.returnedAt,
      flavourId: jobHookahs.flavourId,
      flavourLabel: jobHookahs.flavourLabel,
      refillCount: jobHookahs.refillCount,
      guestRating: jobHookahs.guestRating,
      guestComment: jobHookahs.guestComment,
      guestFeedbackAt: jobHookahs.guestFeedbackAt,
      modelNumber: hookahs.modelNumber,
      flavourName: flavours.name,
      jobTitle: jobs.title,
      jobStatus: jobs.status,
    })
    .from(jobHookahs)
    .innerJoin(hookahs, eq(hookahs.id, jobHookahs.hookahId))
    .innerJoin(jobs, eq(jobs.id, jobHookahs.jobId))
    .leftJoin(flavours, eq(flavours.id, jobHookahs.flavourId))
    .where(eq(jobHookahs.guestToken, token))
    .limit(1);

  if (!assignment) return { error: "not_found" as const };

  let requests: Array<{
    id: number;
    type: (typeof serviceRequests.$inferSelect)["type"];
    message: string | null;
    status: (typeof serviceRequests.$inferSelect)["status"];
    flavourLabel: string | null;
    priceCents: number | null;
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

  const activeRequest = active
    ? {
        ...active,
        etaMinutes: active.status === "acknowledged" ? GUEST_ETA_MINUTES : null,
        etaAt:
          active.status === "acknowledged" && active.acknowledgedAt
            ? new Date(
                new Date(active.acknowledgedAt).getTime() +
                  GUEST_ETA_MINUTES * 60 * 1000,
              ).toISOString()
            : null,
      }
    : null;

  return {
    modelNumber: assignment.modelNumber,
    flavour: currentFlavour,
    flavourId: assignment.flavourId,
    jobTitle: assignment.jobTitle,
    assignmentStatus: assignment.status,
    jobStatus: assignment.jobStatus,
    sentOutAt: assignment.sentOutAt,
    returnedAt: assignment.returnedAt,
    refillCount: assignment.refillCount ?? 0,
    refillPriceCents: REFILL_PRICE_CENTS,
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
      code: GUEST_REBOOK_PROMO.code,
      discountDollars: GUEST_REBOOK_PROMO.discountDollars,
      label: GUEST_REBOOK_PROMO.label,
      bookUrl: `/book?code=${GUEST_REBOOK_PROMO.code}`,
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
