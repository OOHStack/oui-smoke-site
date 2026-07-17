/**
 * Send every Oui Smoke email template to the ops inbox and poll Resend delivery.
 *
 *   dotenv -e .env.local -- npx tsx scripts/send-email-suite.ts
 */
import { Resend } from "resend";
import { CONTACT_EMAIL, CONTACT_FROM } from "../lib/brand-contact";
import {
  bookingConfirmedClientEmail,
  bookingInquiryClientEmail,
  bookingInquiryOpsEmail,
  depositLinkClientEmail,
  depositPaidClientEmail,
  depositPaidOpsEmail,
  jobCompletedClientEmail,
  opsPasswordResetEmail,
} from "../lib/email/templates";

process.env.NEXT_PUBLIC_SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://ouismoke.co";

const TO = process.env.EMAIL_TEST_TO || CONTACT_EMAIL;
const FROM = process.env.RESEND_FROM || CONTACT_FROM;
const stamp = new Date().toISOString().slice(0, 19).replace("T", " ");

type Msg = { subject: string; html: string; text?: string };

function suite(): { name: string; msg: Msg }[] {
  const startsAt = new Date("2026-08-15T19:00:00");
  return [
    {
      name: "inquiry-client",
      msg: bookingInquiryClientEmail({
        clientName: "Vinesh",
        location: "Toronto, ON",
        startsAt,
        promoCode: "OUI25",
        paymentModel: "client_deposit",
        depositPercent: 50,
      }),
    },
    {
      name: "inquiry-ops",
      msg: bookingInquiryOpsEmail({
        jobId: 99901,
        clientName: "Vinesh",
        clientEmail: TO,
        clientPhone: "+1 416 555 0100",
        location: "Toronto, ON",
        startsAt,
        promoCode: "OUI25",
        paymentModel: "client_deposit",
      }),
    },
    {
      name: "deposit-link",
      msg: depositLinkClientEmail({
        clientName: "Vinesh",
        amountCents: 15000,
        checkoutUrl: "https://ouismoke.co/book",
        jobTitle: "Private · Summer soirée",
        dueCents: 30000,
        balanceAfterCents: 15000,
        depositPercent: 50,
        kind: "deposit",
      }),
    },
    {
      name: "balance-link",
      msg: depositLinkClientEmail({
        clientName: "Vinesh",
        amountCents: 15000,
        checkoutUrl: "https://ouismoke.co/book",
        jobTitle: "Private · Summer soirée",
        dueCents: 30000,
        kind: "balance",
      }),
    },
    {
      name: "deposit-paid-client",
      msg: depositPaidClientEmail({
        clientName: "Vinesh",
        amountCents: 15000,
        confirmed: true,
        clientPortalUrl: "https://ouismoke.co/book",
        kind: "deposit",
        balanceCents: 15000,
      }),
    },
    {
      name: "paid-in-full-client",
      msg: depositPaidClientEmail({
        clientName: "Vinesh",
        amountCents: 30000,
        confirmed: true,
        paidInFull: true,
        clientPortalUrl: "https://ouismoke.co/book",
      }),
    },
    {
      name: "deposit-paid-ops",
      msg: depositPaidOpsEmail({
        jobId: 99901,
        clientName: "Vinesh",
        amountCents: 15000,
        kind: "deposit",
        balanceCents: 15000,
      }),
    },
    {
      name: "booking-confirmed",
      msg: bookingConfirmedClientEmail({
        clientName: "Vinesh",
        startsAt,
        location: "Toronto, ON",
        clientPortalUrl: "https://ouismoke.co/book",
        paymentModel: "client_deposit",
      }),
    },
    {
      name: "password-reset-ops",
      msg: opsPasswordResetEmail({
        username: "vinesh",
        displayName: "Vinesh",
        resetUrl: "https://ouismoke.co/admin/login?token=test-preview-only",
        expiresInMinutes: 60,
      }),
    },
    {
      name: "job-completed",
      msg: jobCompletedClientEmail({
        clientName: "Vinesh",
        rebookUrl: "https://ouismoke.co/book",
      }),
    },
  ];
}

async function poll(
  resend: Resend,
  id: string,
): Promise<string> {
  for (let i = 0; i < 8; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const got = await resend.emails.get(id);
    const ev = got.data?.last_event || "unknown";
    if (ev === "delivered" || ev === "bounced" || ev === "complained") {
      return ev;
    }
  }
  const last = await resend.emails.get(id);
  return last.data?.last_event || "unknown";
}

async function main() {
  if (!process.env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY missing");
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const results: {
    name: string;
    subject: string;
    id?: string;
    event?: string;
    error?: string;
  }[] = [];

  console.log(`Sending ${suite().length} emails → ${TO} (from ${FROM})`);
  console.log(`Batch: ${stamp}\n`);

  for (const item of suite()) {
    const subject = `[Email suite ${stamp}] ${item.msg.subject}`;
    const { data, error } = await resend.emails.send({
      from: FROM,
      to: TO,
      replyTo: TO,
      subject,
      html: item.msg.html,
      text: item.msg.text,
    });

    if (error || !data?.id) {
      const errMsg =
        typeof error === "object" && error && "message" in error
          ? String((error as { message: string }).message)
          : JSON.stringify(error) || "no id";
      console.log(`FAIL  ${item.name}: ${errMsg}`);
      results.push({ name: item.name, subject, error: errMsg });
      continue;
    }

    process.stdout.write(`SENT  ${item.name} (${data.id}) … `);
    const event = await poll(resend, data.id);
    console.log(event);
    results.push({ name: item.name, subject, id: data.id, event });
  }

  const delivered = results.filter((r) => r.event === "delivered").length;
  const failed = results.filter((r) => r.error || r.event === "bounced").length;
  const pending = results.length - delivered - failed;

  console.log("\n--- Summary ---");
  console.log(`to: ${TO}`);
  console.log(`delivered: ${delivered}/${results.length}`);
  if (pending) console.log(`pending/sent: ${pending}`);
  if (failed) console.log(`failed: ${failed}`);
  console.log(JSON.stringify(results, null, 2));

  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
