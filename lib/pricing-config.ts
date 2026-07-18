import {
  EXTRA_HOUR_RATE,
  HST_RATE,
  INCLUDED_HOURS,
  LED_RATE,
  MIN_PACKAGE_DOLLARS,
  MIN_PACKAGE_HOOKAHS,
  ONSITE_UNIT_RATE,
  ONSITE_UNLIMITED_RATE,
  REFILL_PRICE_CENTS,
  WATER_RATE,
  BRANDING_MIN,
  BRANDING_MEDIUM,
  BRANDING_LARGE,
  GUEST_REBOOK_PROMO,
} from "@/lib/pricing-defaults";

/** Live site pricing + ops defaults (singleton). */
export type PricingConfig = {
  refillPriceCents: number;
  onsiteUnitRate: number;
  onsiteUnlimitedRate: number;
  guestRebookCode: string;
  guestRebookDiscountDollars: number;
  guestRebookLabel: string;
  includedHours: number;
  minPackageHookahs: number;
  minPackageDollars: number;
  midTierRate: number;
  highTierRate: number;
  extraHourRate: number;
  hstRate: number;
  ledRate: number;
  waterRate: number;
  brandingMin: number;
  brandingMedium: number;
  brandingLarge: number;
  defaultCheckIntervalMinutes: number;
};

export const DEFAULT_PRICING: PricingConfig = {
  refillPriceCents: REFILL_PRICE_CENTS,
  onsiteUnitRate: ONSITE_UNIT_RATE,
  onsiteUnlimitedRate: ONSITE_UNLIMITED_RATE,
  guestRebookCode: GUEST_REBOOK_PROMO.code,
  guestRebookDiscountDollars: GUEST_REBOOK_PROMO.discountDollars,
  guestRebookLabel: GUEST_REBOOK_PROMO.label,
  includedHours: INCLUDED_HOURS,
  minPackageHookahs: MIN_PACKAGE_HOOKAHS,
  minPackageDollars: MIN_PACKAGE_DOLLARS,
  midTierRate: 95,
  highTierRate: 85,
  extraHourRate: EXTRA_HOUR_RATE,
  hstRate: HST_RATE,
  ledRate: LED_RATE,
  waterRate: WATER_RATE,
  brandingMin: BRANDING_MIN,
  brandingMedium: BRANDING_MEDIUM,
  brandingLarge: BRANDING_LARGE,
  defaultCheckIntervalMinutes: 45,
};

function num(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function str(value: unknown, fallback: string): string {
  if (typeof value === "string" && value.trim()) return value.trim();
  return fallback;
}

export function normalizePricing(
  raw: Partial<PricingConfig> | Record<string, unknown> | null | undefined,
): PricingConfig {
  const d = DEFAULT_PRICING;
  const src = (raw ?? {}) as Record<string, unknown>;
  return {
    refillPriceCents: Math.max(
      0,
      Math.round(num(src.refillPriceCents, d.refillPriceCents)),
    ),
    onsiteUnitRate: Math.max(0, num(src.onsiteUnitRate, d.onsiteUnitRate)),
    onsiteUnlimitedRate: Math.max(
      0,
      num(src.onsiteUnlimitedRate, d.onsiteUnlimitedRate),
    ),
    guestRebookCode: str(src.guestRebookCode, d.guestRebookCode).slice(0, 32),
    guestRebookDiscountDollars: Math.max(
      0,
      num(src.guestRebookDiscountDollars, d.guestRebookDiscountDollars),
    ),
    guestRebookLabel: str(src.guestRebookLabel, d.guestRebookLabel).slice(0, 80),
    includedHours: Math.min(
      12,
      Math.max(1, Math.round(num(src.includedHours, d.includedHours))),
    ),
    minPackageHookahs: Math.min(
      40,
      Math.max(1, Math.round(num(src.minPackageHookahs, d.minPackageHookahs))),
    ),
    minPackageDollars: Math.max(
      0,
      num(src.minPackageDollars, d.minPackageDollars),
    ),
    midTierRate: Math.max(0, num(src.midTierRate, d.midTierRate)),
    highTierRate: Math.max(0, num(src.highTierRate, d.highTierRate)),
    extraHourRate: Math.max(0, num(src.extraHourRate, d.extraHourRate)),
    hstRate: Math.min(1, Math.max(0, num(src.hstRate, d.hstRate))),
    ledRate: Math.max(0, num(src.ledRate, d.ledRate)),
    waterRate: Math.max(0, num(src.waterRate, d.waterRate)),
    brandingMin: Math.max(0, num(src.brandingMin, d.brandingMin)),
    brandingMedium: Math.max(0, num(src.brandingMedium, d.brandingMedium)),
    brandingLarge: Math.max(0, num(src.brandingLarge, d.brandingLarge)),
    defaultCheckIntervalMinutes: (() => {
      const raw = Math.round(
        num(src.defaultCheckIntervalMinutes, d.defaultCheckIntervalMinutes),
      );
      // 0 = spot checks off for new jobs; otherwise clamp to 10–180.
      if (raw <= 0) return 0;
      return Math.min(180, Math.max(10, raw));
    })(),
  };
}

export function pricingToPublic(p: PricingConfig) {
  return {
    ...p,
    refillPriceDollars: p.refillPriceCents / 100,
    guestRebookPromo: {
      code: p.guestRebookCode,
      discountDollars: p.guestRebookDiscountDollars,
      label: p.guestRebookLabel,
    },
  };
}

/** Integer-cent HST on an exclusive subtotal. */
export function hstCents(
  subtotalCents: number,
  rate: number = DEFAULT_PRICING.hstRate,
): number {
  const base = Math.max(0, Math.round(subtotalCents));
  if (base <= 0 || rate <= 0) return 0;
  return Math.round(base * rate);
}

/** Exclusive subtotal + HST (what Square / cash should collect). */
export function withHstCents(
  subtotalCents: number,
  rate: number = DEFAULT_PRICING.hstRate,
): number {
  const base = Math.max(0, Math.round(subtotalCents));
  if (base <= 0) return 0;
  return base + hstCents(base, rate);
}

/**
 * Split a tax-inclusive total into net + HST for checkout line items.
 * Prefers a net that re-adds to the same total via withHstCents.
 */
export function splitInclusiveHstCents(
  totalCents: number,
  rate: number = DEFAULT_PRICING.hstRate,
): { netCents: number; taxCents: number } {
  const total = Math.max(0, Math.round(totalCents));
  if (total <= 0) return { netCents: 0, taxCents: 0 };
  if (rate <= 0) return { netCents: total, taxCents: 0 };

  const guess = Math.round(total / (1 + rate));
  for (const net of [guess, guess - 1, guess + 1, guess - 2, guess + 2]) {
    if (net > 0 && withHstCents(net, rate) === total) {
      return { netCents: net, taxCents: total - net };
    }
  }

  const netCents = Math.max(1, guess);
  return { netCents, taxCents: Math.max(0, total - netCents) };
}

/** e.g. 0.13 → "13" for labels. */
export function hstPercentLabel(rate: number = DEFAULT_PRICING.hstRate): string {
  const pct = Math.round(rate * 10000) / 100;
  return Number.isInteger(pct)
    ? String(pct)
    : pct.toFixed(2).replace(/\.?0+$/, "");
}

/** Floor fields that can be overridden per job. */
export const JOB_PRICING_OVERRIDE_KEYS = [
  "onsiteUnitRate",
  "onsiteUnlimitedRate",
  "refillPriceCents",
  "hstRate",
] as const;

export type JobPricingOverrideKey = (typeof JOB_PRICING_OVERRIDE_KEYS)[number];
export type JobPricingOverride = Partial<
  Pick<PricingConfig, JobPricingOverrideKey>
>;

/** Keep only known job override keys with finite numbers. */
export function parseJobPricingOverride(
  raw: unknown,
): JobPricingOverride {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const src = raw as Record<string, unknown>;
  const out: JobPricingOverride = {};
  for (const key of JOB_PRICING_OVERRIDE_KEYS) {
    if (src[key] === undefined || src[key] === null || src[key] === "") continue;
    const n = typeof src[key] === "number" ? src[key] : Number(src[key]);
    if (!Number.isFinite(n)) continue;
    if (key === "refillPriceCents") {
      out.refillPriceCents = Math.max(0, Math.round(n));
    } else if (key === "hstRate") {
      out.hstRate = Math.min(1, Math.max(0, n));
    } else if (key === "onsiteUnitRate") {
      out.onsiteUnitRate = Math.max(0, n);
    } else if (key === "onsiteUnlimitedRate") {
      out.onsiteUnlimitedRate = Math.max(0, n);
    }
  }
  return out;
}

export function jobPricingOverrideCount(override: JobPricingOverride): number {
  return JOB_PRICING_OVERRIDE_KEYS.filter((k) => override[k] !== undefined).length;
}

export function mergeJobPricing(
  global: PricingConfig,
  override: unknown,
): PricingConfig {
  const patch = parseJobPricingOverride(override);
  if (jobPricingOverrideCount(patch) === 0) return global;
  return normalizePricing({ ...global, ...patch });
}
