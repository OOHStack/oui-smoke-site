import {
  ONSITE_UNIT_RATE,
  ONSITE_UNLIMITED_RATE,
  REFILL_PRICE_CENTS,
} from "@/lib/pricing";

export type GuestPayTier = "standard" | "unlimited";

export function isGuestPayTier(value: unknown): value is GuestPayTier {
  return value === "standard" || value === "unlimited";
}

export function guestPayTierUnitCents(tier: GuestPayTier): number {
  return tier === "unlimited"
    ? ONSITE_UNLIMITED_RATE * 100
    : ONSITE_UNIT_RATE * 100;
}

export function guestPayTierLabel(tier: GuestPayTier | null | undefined): string {
  if (tier === "unlimited") return `Unlimited · $${ONSITE_UNLIMITED_RATE}`;
  if (tier === "standard") return `Standard · $${ONSITE_UNIT_RATE}`;
  return "No tier";
}

/** Default refill charge for a unit’s guest-pay tier. */
export function defaultRefillCentsForTier(
  tier: GuestPayTier | null | undefined,
): number {
  if (tier === "unlimited") return 0;
  return REFILL_PRICE_CENTS;
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
}) {
  const succeeded = opts.payments.filter((p) => p.status === "succeeded");

  let unitChargedCents = 0;
  let unitCollectedCents = 0;
  let refillCollectedCents = 0;
  let tipCollectedCents = 0;

  for (const a of opts.assignments) {
    if (a.guestPayTier) {
      unitChargedCents += guestPayTierUnitCents(a.guestPayTier);
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
