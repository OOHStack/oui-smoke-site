/** Extra head / flavour refill charge (matches site + on-site pricing). */
export const REFILL_PRICE_CENTS = 3000;
export const REFILL_PRICE_DOLLARS = REFILL_PRICE_CENTS / 100;

/**
 * On-site / guest-pay menu (not package tiers).
 * Guests choose a unit with paid refills, or unlimited refills for the night.
 */
export const ONSITE_UNIT_RATE = 80;
export const ONSITE_UNLIMITED_RATE = 100;

/** Guest rebook offer after a session closes. */
export const GUEST_REBOOK_PROMO = {
  code: "OUI25",
  discountDollars: 25,
  label: "$25 off your next booking",
} as const;

/** Hours included in the GTA package base price (extras billed after this). */
export const INCLUDED_HOURS = 4;
/** Private event packages require at least this many hookahs. */
export const MIN_PACKAGE_HOOKAHS = 4;
/** Hard floor for any GTA private package (summer promo / standard start). */
export const MIN_PACKAGE_DOLLARS = 450;
export const EXTRA_HOUR_RATE = 150;
export const HST_RATE = 0.13;

export const LED_RATE = 15;
export const WATER_RATE = 8;
export const BRANDING_MIN = 4;
export const BRANDING_MEDIUM = 15;
export const BRANDING_LARGE = 20;

export function tierRateForHookahs(count: number) {
  if (count <= 4) {
    return {
      rate: MIN_PACKAGE_DOLLARS / MIN_PACKAGE_HOOKAHS,
      label: "4-hookah package · $450",
      flat: MIN_PACKAGE_DOLLARS as number | null,
    };
  }
  if (count <= 8) {
    return { rate: 95, label: "5–8 hookahs · $95 each", flat: null };
  }
  return { rate: 85, label: "9+ hookahs · $85 each", flat: null };
}

/** Package subtotal before extras/HST — never below the minimum floor. */
export function packageBaseForHookahs(count: number) {
  const units = Math.max(0, Math.floor(count) || 0);
  if (units < MIN_PACKAGE_HOOKAHS) return 0;
  const tier = tierRateForHookahs(units);
  const raw = tier.flat ?? units * tier.rate;
  return Math.max(MIN_PACKAGE_DOLLARS, raw);
}

/** Rough GTA package estimate from hookah count + service hours. */
export function estimateBooking(hookahs: number, hours: number, promoDollars = 0) {
  const units = Math.max(0, Math.min(40, Math.floor(hookahs) || 0));
  const serviceHours = Math.max(1, Math.min(12, Math.floor(hours) || INCLUDED_HOURS));
  if (units < MIN_PACKAGE_HOOKAHS) {
    return null;
  }

  const tier = tierRateForHookahs(units);
  const base = packageBaseForHookahs(units);
  const extraHours = Math.max(0, serviceHours - INCLUDED_HOURS);
  const extras = extraHours * EXTRA_HOUR_RATE;
  const subtotalBeforePromo = base + extras;
  const discount = Math.min(promoDollars, subtotalBeforePromo);
  const subtotal = Math.max(0, subtotalBeforePromo - discount);
  const hst = Math.round(subtotal * HST_RATE * 100) / 100;
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
