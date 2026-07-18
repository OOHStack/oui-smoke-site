import { getDb } from "@/lib/db";
import { jobHookahs, jobs, siteSettings } from "@/lib/db/schema";
import { createGuestToken } from "@/lib/guest";
import { normalizePaymentModel } from "@/lib/payment-model";
import { eq } from "drizzle-orm";

export type DisplayQrTrigger = "on_paid" | "on_send_out";

export type DisplayWorkflowSettings = {
  /** When the event tablet shows the guest serve QR. */
  qrTrigger: DisplayQrTrigger;
  /** How long the QR takeover stays up (seconds). */
  qrDurationSeconds: number;
};

export const FALLBACK_DISPLAY_WORKFLOW: DisplayWorkflowSettings = {
  qrTrigger: "on_paid",
  qrDurationSeconds: 90,
};

const DURATION_MIN = 15;
const DURATION_MAX = 300;

export function clampQrDurationSeconds(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return FALLBACK_DISPLAY_WORKFLOW.qrDurationSeconds;
  return Math.min(DURATION_MAX, Math.max(DURATION_MIN, Math.round(n)));
}

export function normalizeDisplayQrTrigger(value: unknown): DisplayQrTrigger {
  return value === "on_send_out" ? "on_send_out" : "on_paid";
}

export function normalizeDisplayWorkflow(
  raw: unknown,
): DisplayWorkflowSettings {
  const obj =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    qrTrigger: normalizeDisplayQrTrigger(obj.qrTrigger),
    qrDurationSeconds: clampQrDurationSeconds(obj.qrDurationSeconds),
  };
}

export async function getDisplayWorkflowSettings(): Promise<DisplayWorkflowSettings> {
  try {
    const db = getDb();
    const [row] = await db
      .select({ displayWorkflowJson: siteSettings.displayWorkflowJson })
      .from(siteSettings)
      .where(eq(siteSettings.id, 1))
      .limit(1);
    if (!row) return { ...FALLBACK_DISPLAY_WORKFLOW };
    return normalizeDisplayWorkflow(row.displayWorkflowJson);
  } catch {
    return { ...FALLBACK_DISPLAY_WORKFLOW };
  }
}

export async function updateDisplayWorkflowSettings(
  patch: Partial<DisplayWorkflowSettings>,
): Promise<DisplayWorkflowSettings> {
  const db = getDb();
  const current = await getDisplayWorkflowSettings();
  const next = normalizeDisplayWorkflow({
    qrTrigger: patch.qrTrigger ?? current.qrTrigger,
    qrDurationSeconds: patch.qrDurationSeconds ?? current.qrDurationSeconds,
  });

  const [existing] = await db
    .select({ id: siteSettings.id })
    .from(siteSettings)
    .where(eq(siteSettings.id, 1))
    .limit(1);

  if (existing) {
    await db
      .update(siteSettings)
      .set({ displayWorkflowJson: next, updatedAt: new Date() })
      .where(eq(siteSettings.id, 1));
  } else {
    await db.insert(siteSettings).values({
      id: 1,
      pricingJson: {},
      displayWorkflowJson: next,
      updatedAt: new Date(),
    });
  }

  return next;
}

export function displayQrDurationMs(settings: DisplayWorkflowSettings): number {
  return settings.qrDurationSeconds * 1000;
}

/**
 * Mint guest token (if needed) and start/refresh the event-tablet QR takeover.
 * Honours Settings → Display trigger (paid vs send-out).
 */
export async function pushAssignmentDisplayQr(opts: {
  assignmentId: number;
  reason: "paid" | "send_out";
}): Promise<
  | { ok: true; guestToken: string; displayQrAt: Date }
  | { ok: false; skipped: true; reason: string }
> {
  const db = getDb();
  const settings = await getDisplayWorkflowSettings();

  const [row] = await db
    .select({
      id: jobHookahs.id,
      guestToken: jobHookahs.guestToken,
      jobId: jobHookahs.jobId,
      paymentModel: jobs.paymentModel,
    })
    .from(jobHookahs)
    .innerJoin(jobs, eq(jobs.id, jobHookahs.jobId))
    .where(eq(jobHookahs.id, opts.assignmentId))
    .limit(1);

  if (!row) {
    return { ok: false, skipped: true, reason: "not_found" };
  }

  const paymentModel = normalizePaymentModel(row.paymentModel);
  const isOnsite = paymentModel === "pay_at_event";

  if (opts.reason === "paid" && settings.qrTrigger !== "on_paid") {
    return { ok: false, skipped: true, reason: "trigger_send_out" };
  }
  if (opts.reason === "send_out" && settings.qrTrigger === "on_paid") {
    // Private / comp still need a QR moment at send-out (no unit pay).
    if (isOnsite) {
      return { ok: false, skipped: true, reason: "trigger_on_paid" };
    }
  }

  const now = new Date();
  const guestToken = row.guestToken || createGuestToken();

  await db
    .update(jobHookahs)
    .set({
      guestToken,
      displayQrAt: now,
    })
    .where(eq(jobHookahs.id, opts.assignmentId));

  return { ok: true, guestToken, displayQrAt: now };
}
