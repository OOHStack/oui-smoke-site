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
    defaultCheckIntervalMinutes: Math.min(
      180,
      Math.max(
        10,
        Math.round(
          num(src.defaultCheckIntervalMinutes, d.defaultCheckIntervalMinutes),
        ),
      ),
    ),
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
