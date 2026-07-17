import { CONTACT_MAILTO } from "@/lib/brand-contact";
import webpush from "web-push";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { pushSubscriptions, serviceRequests } from "@/lib/db/schema";
import { getSiteUrl } from "@/lib/guest";

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
};

export type NotifyStaffPushOpts = {
  /** When set, only notify these ops users (claimer follow-ups). Falls back to all if none match. */
  onlyUserIds?: Array<number | null | undefined>;
};

function configureWebPush() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || CONTACT_MAILTO;

  if (!publicKey || !privateKey) {
    return false;
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
  return true;
}

export function getVapidPublicKey() {
  return process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || null;
}

export async function notifyStaffPush(
  payload: PushPayload,
  opts: NotifyStaffPushOpts = {},
) {
  if (!configureWebPush()) {
    console.warn("Push skipped: VAPID keys not configured");
    return { sent: 0, failed: 0 };
  }

  const db = getDb();
  const onlyIds = (opts.onlyUserIds ?? []).filter(
    (id): id is number => typeof id === "number" && Number.isFinite(id),
  );

  let rows = await db.select().from(pushSubscriptions);
  if (onlyIds.length > 0) {
    const scoped = rows.filter(
      (r) => r.opsUserId != null && onlyIds.includes(r.opsUserId),
    );
    // Prefer claimer devices; if none linked yet, keep broadcasting so alerts aren't lost.
    if (scoped.length > 0) rows = scoped;
  }

  if (rows.length === 0) return { sent: 0, failed: 0 };

  const siteUrl = getSiteUrl();
  const data = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url ? `${siteUrl}${payload.url}` : `${siteUrl}/admin/live`,
    tag: payload.tag || "oui-service",
  });

  let sent = 0;
  let failed = 0;

  await Promise.all(
    rows.map(async (row) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: row.endpoint,
            keys: { p256dh: row.p256dh, auth: row.auth },
          },
          data,
          { TTL: 60 * 30, urgency: "high" },
        );
        sent += 1;
      } catch (err) {
        failed += 1;
        const status =
          err && typeof err === "object" && "statusCode" in err
            ? Number((err as { statusCode: number }).statusCode)
            : 0;
        if (status === 404 || status === 410) {
          await db
            .delete(pushSubscriptions)
            .where(eq(pushSubscriptions.id, row.id));
        } else {
          console.error("Push send failed", status || err);
        }
      }
    }),
  );

  return { sent, failed };
}

/** Parse guest-refill-{id} idempotency keys. */
export function guestRefillServiceRequestIdFromKey(key: string): number | null {
  const m = /^guest-refill-(\d+)$/.exec(key);
  if (!m) return null;
  const id = Number(m[1]);
  return Number.isFinite(id) ? id : null;
}

/** Push for an existing service request — scopes to claimer when claimed. */
export async function notifyStaffPushForServiceRequest(
  serviceRequestId: number | null | undefined,
  payload: PushPayload,
) {
  if (!serviceRequestId) {
    return notifyStaffPush(payload);
  }
  const db = getDb();
  const [row] = await db
    .select({ acknowledgedByUserId: serviceRequests.acknowledgedByUserId })
    .from(serviceRequests)
    .where(eq(serviceRequests.id, serviceRequestId))
    .limit(1);

  return notifyStaffPush(payload, {
    onlyUserIds: row?.acknowledgedByUserId != null ? [row.acknowledgedByUserId] : undefined,
  });
}
