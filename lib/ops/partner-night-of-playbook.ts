import {
  type PricingConfig,
  DEFAULT_PRICING,
} from "@/lib/pricing";
import type { PlaybookSection } from "@/lib/ops/night-of-playbook";

/** Venue / host-facing event-day expectations (no internal ops steps). */
export function getPartnerNightOfPlaybook(
  pricing: PricingConfig = DEFAULT_PRICING,
): {
  title: string;
  subtitle: string;
  sections: PlaybookSection[];
} {
  const refillDollars = pricing.refillPriceCents / 100;
  const hstPct = Math.round(pricing.hstRate * 100);
  return {
    title: "Event day — what to expect",
    subtitle: "On-site sales events: guests pay on the floor; Oui staff run service.",
    sections: [
      {
        id: "pricing",
        title: "Guest pricing",
        bullets: [
          `Standard · $${pricing.onsiteUnitRate} + HST per unit — refills $${refillDollars} + HST each.`,
          `Unlimited · $${pricing.onsiteUnlimitedRate} + HST per unit — unlimited flavour refills for the event.`,
          `Oui staff collect payment on the floor (Square terminal or cash), including ${hstPct}% HST. Hosts do not need to run a package deposit for on-site sales.`,
        ],
      },
      {
        id: "qr",
        title: "Guest QR at each unit",
        bullets: [
          `Each hookah on the floor has a guest QR. Guests scan for coals, flavour refills, or help.`,
          `Staff bring the terminal when a paid refill is due (Standard tier).`,
          `If a guest’s camera fails, they can wave staff over — service continues the same way.`,
        ],
      },
      {
        id: "roles",
        title: "Who does what",
        bullets: [
          `Oui staff stage, send out, check, refill, and close units.`,
          `Hosts point guests to staff and the QR — you do not need Oui admin access.`,
          `Escalate floor issues to the on-site Oui lead; they own rates and the terminal.`,
        ],
      },
    ],
  };
}
