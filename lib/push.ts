import webpush from "web-push";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { pushSubscriptions } from "@/lib/db/schema";
import { getSiteUrl } from "@/lib/guest";

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
};

function configureWebPush() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:ops@ouismoke.co";

  if (!publicKey || !privateKey) {
    return false;
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
  return true;
}

export function getVapidPublicKey() {
  return process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || null;
}

export async function notifyStaffPush(payload: PushPayload) {
  if (!configureWebPush()) {
    console.warn("Push skipped: VAPID keys not configured");
    return { sent: 0, failed: 0 };
  }

  const db = getDb();
  const rows = await db.select().from(pushSubscriptions);
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
        // Gone / expired subscription
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
