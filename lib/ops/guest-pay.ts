import {
  type PricingConfig,
  DEFAULT_PRICING,
  hstPercentLabel,
  withHstCents,
} from "@/lib/pricing-config";
import {
  ONSITE_UNIT_RATE,
  ONSITE_UNLIMITED_RATE,
  REFILL_PRICE_CENTS,
} from "@/lib/pricing-defaults";

export type GuestPayTier = "standard" | "unlimited";

export function isGuestPayTier(value: unknown): value is GuestPayTier {
  return value === "standard" || value === "unlimited";
}

/** Tax-exclusive unit catalog amount (cents). */
export function guestPayTierUnitCents(
  tier: GuestPayTier,
  pricing: PricingConfig = DEFAULT_PRICING,
): number {
  return tier === "unlimited"
    ? pricing.onsiteUnlimitedRate * 100
    : pricing.onsiteUnitRate * 100;
}

/** What staff/Square should collect for a unit (incl. HST). */
export function guestPayTierUnitChargeCents(
  tier: GuestPayTier,
  pricing: PricingConfig = DEFAULT_PRICING,
): number {
  return withHstCents(guestPayTierUnitCents(tier, pricing), pricing.hstRate);
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

export function guestPayTierGuestHeadline(
  tier: GuestPayTier | null | undefined,
): string {
  if (tier === "unlimited") return "Unlimited";
  if (tier === "standard") return "Standard";
  return "Your plan";
}

export function guestPayTierGuestDetail(
  tier: GuestPayTier | null | undefined,
  refillPriceCents: number,
  pricing: PricingConfig = DEFAULT_PRICING,
): string {
  const hst = hstPercentLabel(pricing.hstRate);
  if (tier === "unlimited") {
    return `Refills included · no charge (unit $${pricing.onsiteUnlimitedRate} + HST)`;
  }
  if (tier === "standard") {
    return `Refills ${formatCents(refillPriceCents)} + HST each (unit $${pricing.onsiteUnitRate} + HST)`;
  }
  if (refillPriceCents > 0) {
    return `Refills ${formatCents(refillPriceCents)} + ${hst}% HST each`;
  }
  return "Refills included";
}

/** Exclusive refill cents → charge cents (incl. HST), or 0 if included. */
export function refillChargeCents(
  exclusiveCents: number,
  pricing: PricingConfig = DEFAULT_PRICING,
): number {
  if (exclusiveCents <= 0) return 0;
  return withHstCents(exclusiveCents, pricing.hstRate);
}

function formatCents(cents: number) {
  return `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;
}

export type RefillPayPreference = "phone" | "terminal";

export function isRefillPayPreference(
  value: unknown,
): value is RefillPayPreference {
  return value === "phone" || value === "terminal";
}

/** Staff-facing refill payment chip / modal copy. */
export function refillPayStaffCopy(opts: {
  priceCents?: number | null;
  payPreference?: string | null;
  paymentStatus?: string | null;
}): {
  chip: string | null;
  label: string;
  detail: string;
  tone: "paid" | "awaiting" | "terminal" | "included" | "collect";
} {
  const price = opts.priceCents ?? 0;
  const pref = opts.payPreference;
  const status = opts.paymentStatus;
  const chip = refillPayChip(opts);

  if (price <= 0) {
    return {
      chip,
      label: "Included",
      detail: "Unlimited / complimentary — no payment needed",
      tone: "included",
    };
  }

  if (status === "succeeded") {
    return {
      chip,
      label: pref === "terminal" ? "Paid · terminal" : "Paid · phone",
      detail:
        pref === "terminal"
          ? "Collected on the floor — deliver the head"
          : "Square confirmed on phone — deliver the head",
      tone: "paid",
    };
  }

  if (pref === "terminal") {
    return {
      chip,
      label: "Bring terminal",
      detail: "Guest asked staff to collect with the terminal (+ HST)",
      tone: "terminal",
    };
  }

  if (status === "pending" || pref === "phone") {
    return {
      chip,
      label: "Awaiting phone pay",
      detail:
        "Guest has a Square link — or collect on terminal/cash if needed (+ HST)",
      tone: "awaiting",
    };
  }

  return {
    chip,
    label: "Collect payment",
    detail: "Mark paid after you collect (amount includes HST)",
    tone: "collect",
  };
}

/** Compact staff chip for boards / alerts. */
export function refillPayChip(opts: {
  priceCents?: number | null;
  payPreference?: string | null;
  paymentStatus?: string | null;
}): string | null {
  const price = opts.priceCents ?? 0;
  const pref = opts.payPreference;
  const status = opts.paymentStatus;

  if (price <= 0) return "INCLUDED";
  if (status === "succeeded") {
    if (pref === "terminal") return "PAID · TERMINAL";
    if (pref === "phone") return "PAID · PHONE";
    return "PAID";
  }
  if (pref === "terminal") return "BRING TERMINAL";
  if (status === "pending" || pref === "phone") return "AWAITING · PHONE";
  return "COLLECT";
}

export type UnitPayStatus = "unpaid" | "pending" | "paid";

export function unitPayChip(status: string | null | undefined): string | null {
  if (status === "succeeded") return "UNIT PAID";
  if (status === "pending") return "UNIT · TERMINAL…";
  return "UNIT UNPAID";
}

export function unitPayStatusFromRow(
  status: string | null | undefined,
): UnitPayStatus {
  if (status === "succeeded") return "paid";
  if (status === "pending") return "pending";
  return "unpaid";
}

/** Default refill charge for a unit’s guest-pay tier (exclusive). */
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
      unitChargedCents += guestPayTierUnitChargeCents(a.guestPayTier, pricing);
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
