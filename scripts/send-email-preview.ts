import { Resend } from "resend";
import { CONTACT_EMAIL, CONTACT_FROM } from "../lib/brand-contact";
import {
  bookingInquiryClientEmail,
  depositLinkClientEmail,
} from "../lib/email/templates";

async function main() {
  process.env.NEXT_PUBLIC_SITE_URL =
    process.env.NEXT_PUBLIC_SITE_URL || "https://ouismoke.co";

  const resend = new Resend(process.env.RESEND_API_KEY);
  if (!process.env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY missing");
  }

  const from = process.env.RESEND_FROM || CONTACT_FROM;
  const to = process.env.OPS_NOTIFY_EMAIL || CONTACT_EMAIL;

  const preview = depositLinkClientEmail({
    clientName: "Vinesh",
    amountCents: 15000,
    checkoutUrl: "https://ouismoke.co/book",
    jobTitle: "Private · Summer soirée",
  });
  const inquiry = bookingInquiryClientEmail({
    clientName: "Vinesh",
    location: "Toronto, ON",
    startsAt: new Date("2026-08-15T19:00:00"),
    promoCode: "OUI25",
  });

  const a = await resend.emails.send({
    from,
    to,
    replyTo: to,
    subject: `[Preview] ${preview.subject}`,
    html: preview.html,
    text: preview.text,
  });
  const b = await resend.emails.send({
    from,
    to,
    replyTo: to,
    subject: `[Preview] ${inquiry.subject}`,
    html: inquiry.html,
    text: inquiry.text,
  });

  console.log(JSON.stringify({ deposit: a.error || a.data, inquiry: b.error || b.data }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
