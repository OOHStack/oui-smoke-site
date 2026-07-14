import {
  type PricingConfig,
  DEFAULT_PRICING,
} from "@/lib/pricing";

export type PlaybookSection = {
  id: string;
  title: string;
  intro?: string;
  bullets: string[];
};

/** Staff night-of process — rates stay in sync with live pricing. */
export function getOpsNightOfPlaybook(
  pricing: PricingConfig = DEFAULT_PRICING,
): {
  title: string;
  subtitle: string;
  sections: PlaybookSection[];
} {
  const refillDollars = pricing.refillPriceCents / 100;
  return {
    title: "Night-of playbook",
    subtitle: "Floor lead process for guest pay, refills, and QR failures.",
    sections: [
      {
        id: "guest-pay",
        title: `Guest pay — who collects $${pricing.onsiteUnitRate} vs $${pricing.onsiteUnlimitedRate}`,
        intro:
          "Package / client-deposit jobs skip this menu — the client already paid. Use this only for Pay at event.",
        bullets: [
          `Owner: the person with the Square terminal (floor lead). Runners do not negotiate rates.`,
          `When: before or at send-out (Ready → On the floor). Choose the tier in the app before the unit leaves.`,
          `Standard · $${pricing.onsiteUnitRate} — paid refills at $${refillDollars} each.`,
          `Unlimited · $${pricing.onsiteUnlimitedRate} — no per-refill charge for that unit that night.`,
          `Collect on Terminal (auto-captures when the device completes) or Mark paid for cash. End-of-night Actual ($) is suggested from the ledger.`,
        ],
      },
      {
        id: "refills",
        title: "How refills are logged",
        intro:
          "Every refill is logged in the app — unlimited only skips the money, not the log.",
        bullets: [
          `Guest QR refill → call appears on Live / the unit tile → prep a new head → collect $${refillDollars} if Standard → Deliver refill · paid.`,
          `In-person ask: same flow from the unit modal — pick flavour, then Deliver refill.`,
          `Unlimited units: deliver and log at $0 (no terminal charge).`,
          `Coals / help / issue: acknowledge and clear separately — do not use Deliver refill for those.`,
        ],
      },
      {
        id: "qr-fail",
        title: "If a unit QR fails",
        bullets: [
          `Open the unit on the job board → Show guest QR code (refresh the modal if needed).`,
          `Still broken → Regenerate guest link, then show the new QR.`,
          `Phone/camera still fails → take the request in person and log from the unit modal or Live. Service continues without the guest page.`,
          `Do not re-stage or re-send just to “fix” QR — prefer regenerate. QR only works while the unit is Out with a guest token.`,
        ],
      },
      {
        id: "tips",
        title: "Tips",
        bullets: [
          `Floor lead records the total tip on the job. Edit tip % per person when the split isn’t even — percents must total 100%.`,
          `Keep staffNames current so the tip editor stays accurate.`,
          `Guest unit pay: prefer Terminal to auto-capture, or Mark paid for cash.`,
        ],
      },
    ],
  };
}
