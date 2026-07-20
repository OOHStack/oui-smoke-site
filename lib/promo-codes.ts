import type { PricingConfig } from "@/lib/pricing-config";

export type ResolvedPromo = {
  code: string;
  discountDollars: number;
  label: string;
};

/** Fixed partner / campaign codes (not editable in admin). */
export const PARTNER_PROMOS: Record<
  string,
  { discountDollars: number; label: string }
> = {
  MRLEWIN: {
    discountDollars: 50,
    label: "$50 off · Mr. Lewin referral",
  },
};

type PromoPricing = Pick<
  PricingConfig,
  "guestRebookCode" | "guestRebookDiscountDollars" | "guestRebookLabel"
>;

/** Resolve a typed or URL promo code against live guest-rebook + partner codes. */
export function resolvePromoCode(
  raw: string | null | undefined,
  pricing: PromoPricing,
): ResolvedPromo | null {
  const code = (raw || "").trim().toUpperCase();
  if (!code) return null;

  const guestCode = (pricing.guestRebookCode || "").trim().toUpperCase();
  if (guestCode && code === guestCode) {
    return {
      code: guestCode,
      discountDollars: pricing.guestRebookDiscountDollars,
      label: pricing.guestRebookLabel,
    };
  }

  const partner = PARTNER_PROMOS[code];
  if (partner) {
    return { code, ...partner };
  }

  return null;
}
