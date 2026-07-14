/** Hardcoded fallbacks — used when DB has no site_settings row yet. */

export const REFILL_PRICE_CENTS = 3000;
export const ONSITE_UNIT_RATE = 80;
export const ONSITE_UNLIMITED_RATE = 100;

export const GUEST_REBOOK_PROMO = {
  code: "OUI25",
  discountDollars: 25,
  label: "$25 off your next booking",
} as const;

export const INCLUDED_HOURS = 4;
export const MIN_PACKAGE_HOOKAHS = 4;
export const MIN_PACKAGE_DOLLARS = 450;
export const EXTRA_HOUR_RATE = 150;
export const HST_RATE = 0.13;

export const LED_RATE = 15;
export const WATER_RATE = 8;
export const BRANDING_MIN = 4;
export const BRANDING_MEDIUM = 15;
export const BRANDING_LARGE = 20;
