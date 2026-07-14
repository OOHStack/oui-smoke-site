import {
  ONSITE_UNIT_RATE,
  ONSITE_UNLIMITED_RATE,
  REFILL_PRICE_DOLLARS,
} from "@/lib/pricing";
import type { PlaybookSection } from "@/lib/ops/night-of-playbook";

/** Venue / host-facing night-of expectations (no internal ops steps). */
export function getPartnerNightOfPlaybook(): {
  title: string;
  subtitle: string;
  sections: PlaybookSection[];
} {
  return {
    title: "Night-of — what to expect",
    subtitle: "On-site sales nights: guests pay on the floor; Oui staff run service.",
    sections: [
      {
        id: "pricing",
        title: "Guest pricing",
        bullets: [
          `Standard · $${ONSITE_UNIT_RATE} per unit — refills $${REFILL_PRICE_DOLLARS} each.`,
          `Unlimited · $${ONSITE_UNLIMITED_RATE} per unit — unlimited flavour refills for the night.`,
          `Oui staff collect payment on the floor (Square terminal or cash). Hosts do not need to run a package deposit for on-site sales.`,
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
