import { format } from "date-fns";
import { getSiteUrl } from "@/lib/guest";
import {
  DEFAULT_PRICING,
  type PricingConfig,
} from "@/lib/pricing";

import { CONTACT_EMAIL } from "@/lib/brand-contact";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function onsiteRatesLine(pricing: PricingConfig = DEFAULT_PRICING) {
  const refill = pricing.refillPriceCents / 100;
  return `$${pricing.onsiteUnitRate} + $${refill} refills (+ HST), or $${pricing.onsiteUnlimitedRate} unlimited (+ HST)`;
}

function moneyCad(cents: number) {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
  }).format(cents / 100);
}

/** Brand tokens aligned with public/site.css */
const brand = {
  bg: "#0a0908",
  elevated: "#141210",
  ink: "#f7f4ef",
  inkSoft: "rgba(247, 244, 239, 0.78)",
  inkMute: "rgba(247, 244, 239, 0.52)",
  accent: "#e4574d",
  line: "rgba(247, 244, 239, 0.16)",
  sans: "'Outfit', system-ui, -apple-system, Segoe UI, sans-serif",
  display: "'Bebas Neue', 'Arial Narrow', Impact, sans-serif",
};

function logoUrl() {
  return `${getSiteUrl()}/logo-white.png`;
}

function layout(opts: {
  title: string;
  bodyHtml: string;
  preheader?: string;
  eyebrow?: string;
}) {
  const site = getSiteUrl();
  const logo = logoUrl();
  const pre = opts.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;height:0;width:0;">${escapeHtml(opts.preheader)}</div>`
    : "";
  const eyebrow = opts.eyebrow
    ? `<p style="margin:0 0 10px;font-family:${brand.sans};font-size:11px;letter-spacing:0.28em;text-transform:uppercase;color:${brand.accent};font-weight:500;">${escapeHtml(opts.eyebrow)}</p>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="dark">
  <meta name="supported-color-schemes" content="dark">
  <title>${escapeHtml(opts.title)}</title>
  <!--[if !mso]><!-->
  <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Outfit:wght@300;400;500;600&display=swap" rel="stylesheet">
  <!--<![endif]-->
  <style>
    @media (prefers-color-scheme: light) {
      /* Keep brand dark even if clients force light — intentional */
    }
  </style>
</head>
<body style="margin:0;padding:0;background:${brand.bg};color:${brand.ink};-webkit-font-smoothing:antialiased;">
${pre}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${brand.bg};background-image:radial-gradient(ellipse 80% 50% at 50% -10%, #2a1810 0%, transparent 55%);">
  <tr>
    <td align="center" style="padding:40px 16px 48px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
        <!-- Logo -->
        <tr>
          <td align="center" style="padding:0 0 28px;">
            <a href="${site}" style="text-decoration:none;">
              <img src="${logo}" alt="Oui Smoke" width="200" height="54" style="display:block;width:200px;max-width:70%;height:auto;border:0;outline:none;" />
            </a>
          </td>
        </tr>
        <!-- Card -->
        <tr>
          <td style="background:${brand.elevated};border:1px solid ${brand.line};border-radius:4px;">
            <!-- Accent bar -->
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr><td style="height:3px;line-height:3px;font-size:0;background:${brand.accent};border-radius:4px 4px 0 0;">&nbsp;</td></tr>
            </table>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="padding:32px 28px 28px;">
                  ${eyebrow}
                  <h1 style="margin:0 0 20px;font-family:${brand.display};font-size:42px;line-height:0.95;letter-spacing:0.04em;font-weight:400;color:${brand.ink};text-transform:uppercase;">
                    ${escapeHtml(opts.title)}
                  </h1>
                  <div style="font-family:${brand.sans};font-size:15px;line-height:1.65;font-weight:300;color:${brand.inkSoft};">
                    ${opts.bodyHtml}
                  </div>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td align="center" style="padding:28px 12px 0;font-family:${brand.sans};font-size:12px;line-height:1.7;color:${brand.inkMute};font-weight:300;">
            <a href="${site}" style="color:${brand.inkSoft};text-decoration:none;letter-spacing:0.12em;text-transform:uppercase;font-size:11px;">ouismoke.co</a>
            <span style="color:${brand.line};padding:0 8px;">·</span>
            GTA full-service hookah
            <br>
            <a href="mailto:${CONTACT_EMAIL}" style="color:${brand.inkMute};text-decoration:none;">${CONTACT_EMAIL}</a>
            <span style="color:${brand.line};padding:0 8px;">·</span>
            <a href="https://instagram.com/ouismoke" style="color:${brand.inkMute};text-decoration:none;">@ouismoke</a>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

function p(text: string) {
  return `<p style="margin:0 0 16px;">${text}</p>`;
}

function btn(href: string, label: string) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 8px;">
  <tr>
    <td style="border-radius:2px;background:${brand.accent};">
      <a href="${escapeHtml(href)}" style="display:inline-block;padding:14px 26px;font-family:${brand.sans};font-size:12px;font-weight:500;letter-spacing:0.14em;text-transform:uppercase;color:${brand.ink};text-decoration:none;">${escapeHtml(label)}</a>
    </td>
  </tr>
</table>`;
}

function metaList(rows: Array<[string, string]>) {
  const items = rows
    .filter(([, v]) => Boolean(v && String(v).trim()))
    .map(
      ([k, v]) =>
        `<tr>
          <td style="padding:10px 16px 10px 0;border-top:1px solid ${brand.line};font-family:${brand.sans};font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:${brand.inkMute};white-space:nowrap;vertical-align:top;">${escapeHtml(k)}</td>
          <td style="padding:10px 0;border-top:1px solid ${brand.line};font-family:${brand.sans};font-size:15px;font-weight:400;color:${brand.ink};vertical-align:top;">${escapeHtml(v)}</td>
        </tr>`,
    )
    .join("");
  if (!items) return "";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 20px;">${items}</table>`;
}

export function bookingInquiryClientEmail(input: {
  clientName: string;
  location?: string;
  startsAt?: Date | null;
  promoCode?: string;
  paymentModel?: "client_deposit" | "pay_at_event" | "complimentary";
  depositPercent?: number;
  quotedCents?: number | null;
  balanceTiming?: string;
  pricing?: PricingConfig;
}) {
  const when = input.startsAt
    ? format(input.startsAt, "EEEE, MMM d · h:mm a")
    : "";
  const model = input.paymentModel || "client_deposit";
  const pct = input.depositPercent ?? 50;
  const timing = input.balanceTiming || "before the event";
  const rates = input.pricing ?? DEFAULT_PRICING;
  const nextStep =
    model === "pay_at_event"
      ? `No deposit is required — guests pay on-site (${onsiteRatesLine(rates)}). We’ll confirm timing and setup with you shortly.`
      : model === "complimentary"
        ? "This booking is complimentary. We’ll confirm timing and setup with you shortly."
        : `A ~${pct}% deposit locks your date. The remaining balance is due ${timing} — we’ll email a final payment link then.`;

  const html = layout({
    title: "We got your request",
    eyebrow: "Inquiry received",
    preheader: "Oui Smoke will follow up to confirm your event.",
    bodyHtml: [
      p(`Hi ${escapeHtml(input.clientName)},`),
      p(`Thanks for reaching out — your event inquiry is in our ops queue. ${nextStep}`),
      metaList([
        ["Event", when],
        ["Location", input.location || ""],
        ["Promo", input.promoCode || ""],
      ]),
      p(
        `Questions? Reply to this email or write <a href="mailto:${CONTACT_EMAIL}" style="color:${brand.accent};text-decoration:none;">${CONTACT_EMAIL}</a>.`,
      ),
    ].join(""),
  });
  return {
    subject: "We got your Oui Smoke request",
    html,
    text: `Hi ${input.clientName}, we received your Oui Smoke inquiry and will follow up soon.`,
  };
}

export function bookingInquiryOpsEmail(input: {
  jobId: number;
  clientName: string;
  clientEmail?: string;
  clientPhone?: string;
  location?: string;
  startsAt?: Date | null;
  promoCode?: string;
  paymentModel?: "client_deposit" | "pay_at_event" | "complimentary";
}) {
  const adminUrl = `${getSiteUrl()}/admin/jobs/${input.jobId}`;
  const when = input.startsAt
    ? format(input.startsAt, "EEE MMM d, h:mm a")
    : "TBD";
  const model =
    input.paymentModel === "pay_at_event"
      ? "Pay at event"
      : input.paymentModel === "complimentary"
        ? "Complimentary"
        : "Client deposit";
  const html = layout({
    title: "New website inquiry",
    eyebrow: "Ops alert",
    preheader: `${input.clientName} · job #${input.jobId}`,
    bodyHtml: [
      metaList([
        ["Job", `#${input.jobId}`],
        ["Client", input.clientName],
        ["Email", input.clientEmail || ""],
        ["Phone", input.clientPhone || ""],
        ["When", when],
        ["Location", input.location || ""],
        ["Payment", model],
        ["Promo", input.promoCode || ""],
      ]),
      btn(adminUrl, "Open job"),
    ].join(""),
  });
  return {
    subject: `New inquiry · ${input.clientName} (#${input.jobId})`,
    html,
    text: `New inquiry from ${input.clientName}. Open ${adminUrl}`,
  };
}

export function depositLinkClientEmail(input: {
  clientName: string;
  amountCents: number;
  checkoutUrl: string;
  jobTitle: string;
  dueCents?: number;
  balanceAfterCents?: number;
  depositPercent?: number;
  kind?: "deposit" | "balance";
  balanceTiming?: string;
}) {
  const amount = moneyCad(input.amountCents);
  const kind = input.kind || "deposit";
  const isBalance = kind === "balance";
  const pct = input.depositPercent ?? 50;
  const timing = input.balanceTiming || "before the event";
  const due =
    input.dueCents != null && input.dueCents > 0
      ? moneyCad(input.dueCents)
      : "";
  const remaining =
    input.balanceAfterCents != null && input.balanceAfterCents > 0
      ? moneyCad(input.balanceAfterCents)
      : "";

  const explain = isBalance
    ? `This is your <strong style="color:${brand.ink};font-weight:500;">final balance</strong> for <strong style="color:${brand.ink};font-weight:500;">${escapeHtml(input.jobTitle)}</strong>${due ? ` (package total ${escapeHtml(due)})` : ""}.`
    : `This is your <strong style="color:${brand.ink};font-weight:500;">~${pct}% deposit</strong> to lock <strong style="color:${brand.ink};font-weight:500;">${escapeHtml(input.jobTitle)}</strong>${due ? ` (package total ${escapeHtml(due)})` : ""}.${remaining ? ` After this, about <strong style="color:${brand.ink};font-weight:500;">${escapeHtml(remaining)}</strong> remains — due ${escapeHtml(timing)}.` : ""}`;

  const html = layout({
    title: isBalance ? "Final payment" : "Your deposit",
    eyebrow: "Secure checkout",
    preheader: isBalance
      ? `Pay your ${amount} balance for Oui Smoke.`
      : `Secure ${amount} deposit for your Oui Smoke event.`,
    bodyHtml: [
      p(`Hi ${escapeHtml(input.clientName)},`),
      p(explain),
      `<p style="margin:8px 0 4px;font-family:${brand.display};font-size:36px;letter-spacing:0.04em;color:${brand.ink};">${escapeHtml(amount)}</p>`,
      `<p style="margin:0 0 8px;font-family:${brand.sans};font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:${brand.inkMute};">CAD · Square secure pay</p>`,
      btn(input.checkoutUrl, isBalance ? "Pay balance" : "Pay deposit"),
      p("Reply to this email if you have any questions before paying."),
    ].join(""),
  });
  return {
    subject: isBalance
      ? `Final payment for your Oui Smoke event · ${amount}`
      : `Deposit for your Oui Smoke event · ${amount}`,
    html,
    text: isBalance
      ? `Hi ${input.clientName}, pay your ${amount} balance here: ${input.checkoutUrl}`
      : `Hi ${input.clientName}, pay your ${amount} deposit here: ${input.checkoutUrl}`,
  };
}

export function depositPaidClientEmail(input: {
  clientName: string;
  amountCents: number;
  confirmed: boolean;
  clientPortalUrl?: string | null;
  kind?: string;
  dueCents?: number;
  balanceCents?: number;
  paidInFull?: boolean;
  balanceTiming?: string;
}) {
  const amount = moneyCad(input.amountCents);
  const isBalance = input.kind === "balance";
  const paidInFull = Boolean(input.paidInFull);
  const remaining =
    input.balanceCents != null && input.balanceCents > 0
      ? moneyCad(input.balanceCents)
      : "";
  const timing = input.balanceTiming || "before the event";

  let title = "Payment received";
  let eyebrow = "Thank you";
  let body = `We’ve received your <strong style="color:${brand.ink};font-weight:500;">${escapeHtml(amount)}</strong> payment. Thank you.`;

  if (paidInFull) {
    title = "Paid in full";
    eyebrow = "All set";
    body = `We’ve received your <strong style="color:${brand.ink};font-weight:500;">${escapeHtml(amount)}</strong> payment — your Oui Smoke package is paid in full.`;
  } else if (isBalance) {
    title = "Balance received";
    eyebrow = "Thank you";
    body = `We’ve received your <strong style="color:${brand.ink};font-weight:500;">${escapeHtml(amount)}</strong> balance payment. Thank you.`;
  } else if (input.confirmed) {
    title = "You’re confirmed";
    eyebrow = "Booking locked in";
    body = `We’ve received your <strong style="color:${brand.ink};font-weight:500;">${escapeHtml(amount)}</strong> deposit — your Oui Smoke booking is confirmed.${remaining ? ` Remaining balance: <strong style="color:${brand.ink};font-weight:500;">${escapeHtml(remaining)}</strong>. We’ll email your final payment link ${escapeHtml(timing)}.` : ""}`;
  }

  const html = layout({
    title,
    eyebrow,
    preheader: `${amount} payment received.`,
    bodyHtml: [
      p(`Hi ${escapeHtml(input.clientName)},`),
      p(body),
      input.clientPortalUrl
        ? btn(input.clientPortalUrl, "Open client portal")
        : "",
      p("We’ll be in touch with timing and setup details as the date approaches."),
    ].join(""),
  });
  return {
    subject: paidInFull
      ? "Oui Smoke — paid in full"
      : input.confirmed && !isBalance
        ? "Oui Smoke booking confirmed"
        : "Oui Smoke payment received",
    html,
    text: `Hi ${input.clientName}, we received your ${amount} payment.${input.confirmed ? " Your booking is confirmed." : ""}${remaining && !paidInFull ? ` Balance remaining: ${remaining}.` : ""}`,
  };
}

export function depositPaidOpsEmail(input: {
  jobId: number;
  clientName: string;
  amountCents: number;
  kind: string;
  balanceCents?: number;
  paidInFull?: boolean;
}) {
  const adminUrl = `${getSiteUrl()}/admin/jobs/${input.jobId}/payments`;
  const amount = moneyCad(input.amountCents);
  const remaining =
    input.balanceCents != null ? moneyCad(input.balanceCents) : "—";
  const html = layout({
    title: input.paidInFull ? "Paid in full" : "Payment received",
    eyebrow: "Ops alert",
    preheader: `${amount} · ${input.clientName}`,
    bodyHtml: [
      metaList([
        ["Job", `#${input.jobId}`],
        ["Client", input.clientName],
        ["Amount", amount],
        ["Kind", input.kind],
        ["Balance left", input.paidInFull ? "None" : remaining],
      ]),
      btn(adminUrl, "Open payments"),
    ].join(""),
  });
  return {
    subject: input.paidInFull
      ? `Paid in full · ${input.clientName} (#${input.jobId})`
      : `Paid ${amount} · ${input.clientName} (#${input.jobId})`,
    html,
    text: `${input.clientName} paid ${amount}. ${adminUrl}`,
  };
}

export function bookingConfirmedClientEmail(input: {
  clientName: string;
  startsAt?: Date | null;
  location?: string | null;
  clientPortalUrl?: string | null;
  paymentModel?: "client_deposit" | "pay_at_event" | "complimentary";
  pricing?: PricingConfig;
}) {
  const when = input.startsAt
    ? format(input.startsAt, "EEEE, MMM d · h:mm a")
    : "";
  const model = input.paymentModel || "client_deposit";
  const rates = input.pricing ?? DEFAULT_PRICING;
  const refill = rates.refillPriceCents / 100;
  const body =
    model === "pay_at_event"
      ? `Your Oui Smoke booking is confirmed. Guests pay $${rates.onsiteUnitRate} (+$${refill} refills) or $${rates.onsiteUnlimitedRate} unlimited on site, plus HST — no client deposit was required.`
      : model === "complimentary"
        ? "Your Oui Smoke booking is confirmed. This one is on us — we’re looking forward to hosting."
        : "Your Oui Smoke booking is confirmed. We’re looking forward to hosting.";

  const html = layout({
    title: "You’re confirmed",
    eyebrow: "See you soon",
    preheader: "Your Oui Smoke event is locked in.",
    bodyHtml: [
      p(`Hi ${escapeHtml(input.clientName)},`),
      p(body),
      metaList([
        ["When", when],
        ["Location", input.location || ""],
      ]),
      input.clientPortalUrl
        ? btn(input.clientPortalUrl, "Open client portal")
        : "",
    ].join(""),
  });
  return {
    subject: "Oui Smoke booking confirmed",
    html,
    text: `Hi ${input.clientName}, your Oui Smoke booking is confirmed.`,
  };
}

export function opsPasswordResetEmail(input: {
  username: string;
  displayName: string;
  resetUrl: string;
  expiresInMinutes: number;
}) {
  const html = layout({
    title: "Reset your access",
    eyebrow: "Operations console",
    preheader: `Secure password reset for @${input.username} · expires in ${input.expiresInMinutes} minutes.`,
    bodyHtml: [
      p(
        `A password reset was requested for <strong style="color:${brand.ink};font-weight:500;">${escapeHtml(input.displayName)}</strong>.`,
      ),
      p(
        "Use the button below to choose a new password. This link works once and then expires — if you didn’t ask for this, you can ignore the email and the current password stays unchanged.",
      ),
      metaList([
        ["Account", input.displayName],
        ["Username", `@${input.username}`],
        ["Expires", `${input.expiresInMinutes} minutes`],
      ]),
      btn(input.resetUrl, "Set new password"),
      p(
        `<span style="color:${brand.inkMute};font-size:13px;">Button not working? Open the secure link from this email on your device — don’t forward it.</span>`,
      ),
    ].join(""),
  });

  return {
    subject: `Oui Smoke · password reset for @${input.username}`,
    html,
    text: `Password reset for ${input.displayName} (@${input.username}). Open ${input.resetUrl} within ${input.expiresInMinutes} minutes. If you didn’t request this, ignore the email.`,
  };
}

export function jobCompletedClientEmail(input: {
  clientName: string;
  rebookUrl?: string;
}) {
  const html = layout({
    title: "Thank you",
    eyebrow: "Until next time",
    preheader: "Hope the night was smooth.",
    bodyHtml: [
      p(`Hi ${escapeHtml(input.clientName)},`),
      p(
        "Thank you for having Oui Smoke. If you’d like to book again, we’d love to host — reply to this email or use the link below.",
      ),
      input.rebookUrl ? btn(input.rebookUrl, "Book again") : "",
    ].join(""),
  });
  return {
    subject: "Thank you from Oui Smoke",
    html,
    text: `Hi ${input.clientName}, thank you for having Oui Smoke. Book again at ${input.rebookUrl || getSiteUrl() + "/book"}`,
  };
}
