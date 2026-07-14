import {
  ONSITE_UNIT_RATE,
  ONSITE_UNLIMITED_RATE,
  REFILL_PRICE_CENTS,
  type PricingConfig,
  DEFAULT_PRICING,
} from "@/lib/pricing";

export type GuestPayTier = "standard" | "unlimited";

export function isGuestPayTier(value: unknown): value is GuestPayTier {
  return value === "standard" || value === "unlimited";
}

export function guestPayTierUnitCents(
  tier: GuestPayTier,
  pricing: PricingConfig = DEFAULT_PRICING,
): number {
  return tier === "unlimited"
    ? pricing.onsiteUnlimitedRate * 100
    : pricing.onsiteUnitRate * 100;
}

export function guestPayTierLabel(
  tier: GuestPayTier | null | undefined,
  pricing: PricingConfig = DEFAULT_PRICING,
): string {
  if (tier === "unlimited") {
    return `Unlimited · $${pricing.onsiteUnlimitedRate}`;
  }
  if (tier === "standard") {
    return `Standard · $${pricing.onsiteUnitRate}`;
  }
  return "No tier";
}

/** Default refill charge for a unit’s guest-pay tier. */
export function defaultRefillCentsForTier(
  tier: GuestPayTier | null | undefined,
  pricing: PricingConfig = DEFAULT_PRICING,
): number {
  if (tier === "unlimited") return 0;
  return pricing.refillPriceCents;
}

export type GuestLedgerPayment = {
  kind: string;
  status: string;
  amountCents: number;
  jobHookahId: number | null;
};

export function summarizeGuestLedger(opts: {
  assignments: Array<{
    id: number;
    guestPayTier: GuestPayTier | null | undefined;
  }>;
  payments: GuestLedgerPayment[];
  pricing?: PricingConfig;
}) {
  const pricing = opts.pricing ?? DEFAULT_PRICING;
  const succeeded = opts.payments.filter((p) => p.status === "succeeded");

  let unitChargedCents = 0;
  let unitCollectedCents = 0;
  let refillCollectedCents = 0;
  let tipCollectedCents = 0;

  for (const a of opts.assignments) {
    if (a.guestPayTier) {
      unitChargedCents += guestPayTierUnitCents(a.guestPayTier, pricing);
    }
  }

  for (const p of succeeded) {
    if (p.kind === "onsite_unit") unitCollectedCents += p.amountCents;
    else if (p.kind === "refill") refillCollectedCents += p.amountCents;
    else if (p.kind === "tip") tipCollectedCents += p.amountCents;
  }

  const suggestedActualCents =
    unitCollectedCents + refillCollectedCents + tipCollectedCents;

  return {
    unitChargedCents,
    unitCollectedCents,
    refillCollectedCents,
    tipCollectedCents,
    suggestedActualCents,
  };
}

/** @deprecated Prefer passing pricing — sync fallbacks only */
export const FALLBACK_ONSITE = {
  unit: ONSITE_UNIT_RATE,
  unlimited: ONSITE_UNLIMITED_RATE,
  refillCents: REFILL_PRICE_CENTS,
};
