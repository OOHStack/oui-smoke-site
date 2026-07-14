/**
 * Pricing helpers — prefer getPricing() for live DB values.
 * Module-level constants remain as fallbacks for client/static imports.
 */
import { getDb } from "@/lib/db";
import { siteSettings } from "@/lib/db/schema";
import {
  DEFAULT_PRICING,
  normalizePricing,
  pricingToPublic,
  type PricingConfig,
} from "@/lib/pricing-config";
import { eq } from "drizzle-orm";

export {
  DEFAULT_PRICING,
  normalizePricing,
  pricingToPublic,
  type PricingConfig,
} from "@/lib/pricing-config";

/** @deprecated Prefer getPricing() — kept for backward-compatible imports */
export const REFILL_PRICE_CENTS = DEFAULT_PRICING.refillPriceCents;
export const REFILL_PRICE_DOLLARS = DEFAULT_PRICING.refillPriceCents / 100;
export const ONSITE_UNIT_RATE = DEFAULT_PRICING.onsiteUnitRate;
export const ONSITE_UNLIMITED_RATE = DEFAULT_PRICING.onsiteUnlimitedRate;
export const GUEST_REBOOK_PROMO = {
  code: DEFAULT_PRICING.guestRebookCode,
  discountDollars: DEFAULT_PRICING.guestRebookDiscountDollars,
  label: DEFAULT_PRICING.guestRebookLabel,
} as const;
export const INCLUDED_HOURS = DEFAULT_PRICING.includedHours;
export const MIN_PACKAGE_HOOKAHS = DEFAULT_PRICING.minPackageHookahs;
export const MIN_PACKAGE_DOLLARS = DEFAULT_PRICING.minPackageDollars;
export const EXTRA_HOUR_RATE = DEFAULT_PRICING.extraHourRate;
export const HST_RATE = DEFAULT_PRICING.hstRate;
export const LED_RATE = DEFAULT_PRICING.ledRate;
export const WATER_RATE = DEFAULT_PRICING.waterRate;
export const BRANDING_MIN = DEFAULT_PRICING.brandingMin;
export const BRANDING_MEDIUM = DEFAULT_PRICING.brandingMedium;
export const BRANDING_LARGE = DEFAULT_PRICING.brandingLarge;

let cache: { at: number; value: PricingConfig } | null = null;
const CACHE_MS = 15_000;

export function clearPricingCache() {
  cache = null;
}

export async function getPricing(): Promise<PricingConfig> {
  if (cache && Date.now() - cache.at < CACHE_MS) {
    return cache.value;
  }
  try {
    const db = getDb();
    const [row] = await db
      .select()
      .from(siteSettings)
      .where(eq(siteSettings.id, 1))
      .limit(1);
    const value = row
      ? normalizePricing({
          ...(typeof row.pricingJson === "object" && row.pricingJson
            ? (row.pricingJson as Record<string, unknown>)
            : {}),
          defaultCheckIntervalMinutes: row.defaultCheckIntervalMinutes,
        })
      : { ...DEFAULT_PRICING };
    cache = { at: Date.now(), value };
    return value;
  } catch {
    return { ...DEFAULT_PRICING };
  }
}

export async function updatePricing(
  patch: Partial<PricingConfig>,
): Promise<PricingConfig> {
  const current = await getPricing();
  const next = normalizePricing({ ...current, ...patch });
  const db = getDb();
  const { defaultCheckIntervalMinutes, ...pricingFields } = next;
  await db
    .insert(siteSettings)
    .values({
      id: 1,
      pricingJson: pricingFields,
      defaultCheckIntervalMinutes,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: siteSettings.id,
      set: {
        pricingJson: pricingFields,
        defaultCheckIntervalMinutes,
        updatedAt: new Date(),
      },
    });
  clearPricingCache();
  return next;
}

export function tierRateForHookahs(
  count: number,
  pricing: PricingConfig = DEFAULT_PRICING,
) {
  if (count <= pricing.minPackageHookahs) {
    return {
      rate: pricing.minPackageDollars / pricing.minPackageHookahs,
      label: `${pricing.minPackageHookahs}-hookah package · $${pricing.minPackageDollars}`,
      flat: pricing.minPackageDollars as number | null,
    };
  }
  if (count <= 8) {
    return {
      rate: pricing.midTierRate,
      label: `5–8 hookahs · $${pricing.midTierRate} each`,
      flat: null,
    };
  }
  return {
    rate: pricing.highTierRate,
    label: `9+ hookahs · $${pricing.highTierRate} each`,
    flat: null,
  };
}

export function packageBaseForHookahs(
  count: number,
  pricing: PricingConfig = DEFAULT_PRICING,
) {
  const units = Math.max(0, Math.floor(count) || 0);
  if (units < pricing.minPackageHookahs) return 0;
  const tier = tierRateForHookahs(units, pricing);
  const raw = tier.flat ?? units * tier.rate;
  return Math.max(pricing.minPackageDollars, raw);
}

export function estimateBooking(
  hookahs: number,
  hours: number,
  promoDollars = 0,
  pricing: PricingConfig = DEFAULT_PRICING,
) {
  const units = Math.max(0, Math.min(40, Math.floor(hookahs) || 0));
  const serviceHours = Math.max(
    1,
    Math.min(12, Math.floor(hours) || pricing.includedHours),
  );
  if (units < pricing.minPackageHookahs) {
    return null;
  }

  const tier = tierRateForHookahs(units, pricing);
  const base = packageBaseForHookahs(units, pricing);
  const extraHours = Math.max(0, serviceHours - pricing.includedHours);
  const extras = extraHours * pricing.extraHourRate;
  const subtotalBeforePromo = base + extras;
  const discount = Math.min(promoDollars, subtotalBeforePromo);
  const subtotal = Math.max(0, subtotalBeforePromo - discount);
  const hst = Math.round(subtotal * pricing.hstRate * 100) / 100;
  const total = Math.round((subtotal + hst) * 100) / 100;

  return {
    units,
    serviceHours,
    tier,
    base,
    extraHours,
    extras,
    discount,
    subtotal,
    hst,
    total,
  };
}

export function formatCadFromCents(cents: number) {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
  }).format(cents / 100);
}

export function formatCad(amount: number) {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
  }).format(amount);
}
