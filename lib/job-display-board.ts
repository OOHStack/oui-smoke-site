import { getDb } from "@/lib/db";
import { flavours, hookahs, jobHookahs, jobs } from "@/lib/db/schema";
import type {
  DisplayFlavour,
  DisplayPackage,
} from "@/lib/display-board";
import {
  displayQrDurationMs,
  FALLBACK_DISPLAY_WORKFLOW,
  getDisplayWorkflowSettings,
} from "@/lib/display-workflow";
import { guestServeUrl } from "@/lib/guest";
import { findJobIdByDisplayToken } from "@/lib/job-display-token";
import {
  normalizePaymentModel,
  paymentModelLabel,
  type PaymentModel,
} from "@/lib/payment-model";
import { guestPayTierUnitCents } from "@/lib/ops/guest-pay";
import {
  getPricingForJob,
  hstPercentLabel,
  type PricingConfig,
} from "@/lib/pricing";
import { asc, eq } from "drizzle-orm";
import QRCode from "qrcode";

/** Default takeover window — overridden by Settings → Display. */
export const JOB_DISPLAY_TAKEOVER_MS =
  FALLBACK_DISPLAY_WORKFLOW.qrDurationSeconds * 1000;

export type JobDisplayTakeover = {
  assignmentId: number;
  modelNumber: number;
  hookahLabel: string | null;
  flavour: string;
  guestPayTier: "standard" | "unlimited" | null;
  /** When the QR takeover started (ISO). */
  shownAt: string;
  /** @deprecated alias of shownAt */
  sentOutAt: string;
  serveUrl: string;
  qrDataUrl: string;
  /** Milliseconds remaining in the takeover window (approx). */
  remainingMs: number;
};

export type JobDisplaySnapshot = {
  job: {
    id: number;
    title: string;
    clientName: string;
    location: string;
    paymentModel: PaymentModel;
    paymentModelLabel: string;
    status: string;
  };
  mode: "private" | "onsite" | "comp";
  idle: {
    headline: string;
    lede: string;
    showPrivatePackages: boolean;
    showOnsitePackages: boolean;
    privatePackages: DisplayPackage[];
    onsitePackages: DisplayPackage[];
    footnotes: string[];
  };
  flavours: DisplayFlavour[];
  floor: {
    outCount: number;
    stagedCount: number;
  };
  /** On-site only: guests can place a floor order from this tablet. */
  ordering: {
    enabled: boolean;
    standardCents: number;
    unlimitedCents: number;
    /** Standard plan refill add-on (exclusive of HST). */
    refillCents: number;
  };
  takeover: JobDisplayTakeover | null;
  serverTime: string;
};

const qrCache = new Map<string, string>();

async function qrFor(url: string, size = 512): Promise<string> {
  const key = `${size}:${url}`;
  const hit = qrCache.get(key);
  if (hit) return hit;
  const dataUrl = await QRCode.toDataURL(url, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: size,
    color: { dark: "#0a0908", light: "#ffffff" },
  });
  if (qrCache.size > 80) {
    const first = qrCache.keys().next().value;
    if (first) qrCache.delete(first);
  }
  qrCache.set(key, dataUrl);
  return dataUrl;
}

function buildPrivatePackages(pricing: PricingConfig): DisplayPackage[] {
  const min = pricing.minPackageHookahs;
  const floor = pricing.minPackageDollars;
  const refill = Math.round(pricing.refillPriceCents / 100);
  return [
    {
      id: "floor",
      eyebrow: "Private events",
      title: `${min} hookahs`,
      price: `$${floor}`,
      detail: `Flat package · 1 refill included, then $${refill}`,
    },
    {
      id: "mid",
      eyebrow: "Private events",
      title: "5–8 hookahs",
      price: `$${pricing.midTierRate}`,
      detail: "Per hookah · unlimited refills",
    },
    {
      id: "high",
      eyebrow: "Private events",
      title: "9+ hookahs",
      price: `$${pricing.highTierRate}`,
      detail: "Per hookah · unlimited refills",
    },
  ];
}

function buildOnsitePackages(pricing: PricingConfig): DisplayPackage[] {
  const refill = Math.round(pricing.refillPriceCents / 100);
  return [
    {
      id: "standard",
      eyebrow: "Tonight",
      title: "Standard",
      price: `$${pricing.onsiteUnitRate}`,
      detail: `Per hookah · refills $${refill}`,
    },
    {
      id: "unlimited",
      eyebrow: "Tonight",
      title: "Unlimited",
      price: `$${pricing.onsiteUnlimitedRate}`,
      detail: "Per hookah · refills included",
    },
  ];
}

function modeFor(paymentModel: PaymentModel): JobDisplaySnapshot["mode"] {
  if (paymentModel === "pay_at_event") return "onsite";
  if (paymentModel === "complimentary") return "comp";
  return "private";
}

function idleCopy(
  mode: JobDisplaySnapshot["mode"],
  job: { title: string; clientName: string },
): Pick<JobDisplaySnapshot["idle"], "headline" | "lede"> {
  if (mode === "onsite") {
    return {
      headline: "Hookah on the floor",
      lede: "Tap Order to pick a plan and flavour — staff will pack it and bring your QR when it goes out.",
    };
  }
  if (mode === "comp") {
    return {
      headline: job.clientName || job.title || "Tonight",
      lede: "Complimentary service · pick a flavour and enjoy the night.",
    };
  }
  return {
    headline: job.title || "Your event",
    lede: `${job.clientName ? `${job.clientName} · ` : ""}Premium hookah, packed fresh for your guests.`,
  };
}

export async function loadJobDisplayBoard(
  token: string,
): Promise<JobDisplaySnapshot | null> {
  const jobId = await findJobIdByDisplayToken(token);
  if (jobId == null) return null;

  const db = getDb();
  const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
  if (!job) return null;

  const paymentModel = normalizePaymentModel(job.paymentModel);
  const mode = modeFor(paymentModel);
  const pricing = await getPricingForJob(job);

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

  const workflow = await getDisplayWorkflowSettings();
  const takeoverMs = displayQrDurationMs(workflow);

  const assignments = await db
    .select({
      id: jobHookahs.id,
      status: jobHookahs.status,
      flavourLabel: jobHookahs.flavourLabel,
      guestToken: jobHookahs.guestToken,
      guestPayTier: jobHookahs.guestPayTier,
      displayQrAt: jobHookahs.displayQrAt,
      modelNumber: hookahs.modelNumber,
      hookahLabel: hookahs.label,
    })
    .from(jobHookahs)
    .innerJoin(hookahs, eq(jobHookahs.hookahId, hookahs.id))
    .where(eq(jobHookahs.jobId, jobId));

  const outCount = assignments.filter((a) => a.status === "out").length;
  const stagedCount = assignments.filter((a) => a.status === "staged").length;

  const now = Date.now();
  const recentQr = assignments
    .filter(
      (a) =>
        a.status !== "returned" &&
        a.guestToken &&
        a.displayQrAt &&
        now - a.displayQrAt.getTime() <= takeoverMs,
    )
    .sort(
      (a, b) =>
        (b.displayQrAt?.getTime() ?? 0) - (a.displayQrAt?.getTime() ?? 0),
    )[0];

  let takeover: JobDisplayTakeover | null = null;
  if (recentQr?.guestToken && recentQr.displayQrAt) {
    const serveUrl = guestServeUrl(recentQr.guestToken);
    const shownMs = recentQr.displayQrAt.getTime();
    const shownAt = recentQr.displayQrAt.toISOString();
    takeover = {
      assignmentId: recentQr.id,
      modelNumber: recentQr.modelNumber,
      hookahLabel: recentQr.hookahLabel ?? null,
      flavour: (recentQr.flavourLabel ?? "").trim() || "Your flavour",
      guestPayTier:
        recentQr.guestPayTier === "standard" ||
        recentQr.guestPayTier === "unlimited"
          ? recentQr.guestPayTier
          : null,
      shownAt,
      sentOutAt: shownAt,
      serveUrl,
      qrDataUrl: await qrFor(serveUrl, 560),
      remainingMs: Math.max(0, takeoverMs - (now - shownMs)),
    };
  }

  const copy = idleCopy(mode, {
    title: job.title,
    clientName: job.clientName,
  });
  const refill = Math.round(pricing.refillPriceCents / 100);

  return {
    job: {
      id: job.id,
      title: job.title,
      clientName: job.clientName,
      location: job.location ?? "",
      paymentModel,
      paymentModelLabel: paymentModelLabel(paymentModel),
      status: job.status,
    },
    mode,
    idle: {
      ...copy,
      showPrivatePackages: mode === "private",
      showOnsitePackages: mode === "onsite",
      privatePackages: buildPrivatePackages(pricing),
      onsitePackages: buildOnsitePackages(pricing),
      footnotes:
        mode === "comp"
          ? ["Scan the code when your hookah arrives · coals & help on demand"]
          : mode === "onsite"
            ? [
                `Refills $${refill} on Standard · unlimited includes refills`,
                `Prices before ${hstPercentLabel(pricing.hstRate)}% HST`,
              ]
            : [
                `${pricing.includedHours} hours included · extra hours $${pricing.extraHourRate}`,
                `Prices before ${hstPercentLabel(pricing.hstRate)}% HST`,
              ],
    },
    flavours: menu.map((f) => ({
      id: f.id,
      name: f.name,
      kind: f.kind as "single" | "mix",
      description: (f.description ?? "").trim(),
    })),
    floor: { outCount, stagedCount },
    ordering: {
      enabled:
        mode === "onsite" &&
        job.status !== "completed" &&
        job.status !== "cancelled" &&
        job.status !== "draft",
      standardCents: guestPayTierUnitCents("standard", pricing),
      unlimitedCents: guestPayTierUnitCents("unlimited", pricing),
      refillCents: pricing.refillPriceCents,
    },
    takeover,
    serverTime: new Date(now).toISOString(),
  };
}
