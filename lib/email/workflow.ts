import { clientPortalUrl, getSiteUrl } from "@/lib/guest";
import { sanitizeBuyerEmail } from "@/lib/square";
import { getOpsNotifyEmail, sendEmail } from "@/lib/email/resend";
import {
  bookingConfirmedClientEmail,
  bookingInquiryClientEmail,
  bookingInquiryOpsEmail,
  depositLinkClientEmail,
  depositPaidClientEmail,
  depositPaidOpsEmail,
  jobCompletedClientEmail,
} from "@/lib/email/templates";
import {
  balanceTimingPhrase,
  getPaymentSettings,
} from "@/lib/payment-settings";
import { getPricing } from "@/lib/pricing";
import {
  normalizePaymentModel,
  requiresClientDeposit,
  type PaymentModel,
} from "@/lib/payment-model";

type JobLike = {
  id: number;
  title: string;
  clientName: string;
  clientEmail?: string | null;
  clientPhone?: string | null;
  location?: string | null;
  startsAt?: Date | string | null;
  clientToken?: string | null;
  status?: string;
  paymentModel?: PaymentModel | string | null;
  quotedCents?: number | null;
  actualCents?: number | null;
  depositPercent?: number | null;
};

function asDate(value: Date | string | null | undefined) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function clientTo(job: JobLike) {
  return sanitizeBuyerEmail(job.clientEmail || "");
}

async function balanceCopy() {
  const settings = await getPaymentSettings();
  return {
    depositPercent: settings.defaultDepositPercent,
    balanceTiming: balanceTimingPhrase(
      settings.autoBalanceDaysBefore,
      settings.autoBalanceEnabled,
    ),
  };
}

export async function notifyBookingInquiry(job: JobLike & { promoCode?: string }) {
  const startsAt = asDate(job.startsAt);
  const paymentModel = normalizePaymentModel(job.paymentModel);
  const copy = await balanceCopy();
  const pricing = await getPricing();
  const to = clientTo(job);
  if (to) {
    const msg = bookingInquiryClientEmail({
      clientName: job.clientName,
      location: job.location || undefined,
      startsAt,
      promoCode: job.promoCode,
      paymentModel,
      depositPercent: job.depositPercent ?? copy.depositPercent,
      quotedCents: job.quotedCents ?? null,
      balanceTiming: copy.balanceTiming,
      pricing,
    });
    await sendEmail({ to, ...msg });
  }

  const ops = bookingInquiryOpsEmail({
    jobId: job.id,
    clientName: job.clientName,
    clientEmail: job.clientEmail || undefined,
    clientPhone: job.clientPhone || undefined,
    location: job.location || undefined,
    startsAt,
    promoCode: job.promoCode,
    paymentModel,
  });
  await sendEmail({ to: getOpsNotifyEmail(), ...ops });
}

export async function notifyDepositLink(opts: {
  job: JobLike;
  amountCents: number;
  checkoutUrl: string;
  dueCents?: number;
  balanceAfterCents?: number;
  depositPercent?: number;
  kind?: "deposit" | "balance";
}) {
  if (!requiresClientDeposit(opts.job.paymentModel)) return false;
  const to = clientTo(opts.job);
  if (!to) return false;
  const kind = opts.kind || "deposit";
  const copy = await balanceCopy();
  const msg = depositLinkClientEmail({
    clientName: opts.job.clientName,
    amountCents: opts.amountCents,
    checkoutUrl: opts.checkoutUrl,
    jobTitle: opts.job.title,
    dueCents: opts.dueCents,
    balanceAfterCents: opts.balanceAfterCents,
    depositPercent: opts.depositPercent ?? copy.depositPercent,
    kind,
    balanceTiming: copy.balanceTiming,
  });
  return sendEmail({ to, ...msg });
}

export async function notifyDepositPaid(opts: {
  job: JobLike;
  amountCents: number;
  kind: string;
  becameConfirmed: boolean;
  dueCents?: number;
  balanceCents?: number;
  paidInFull?: boolean;
}) {
  const portal = opts.job.clientToken
    ? clientPortalUrl(opts.job.clientToken)
    : null;
  const to = clientTo(opts.job);
  const copy = await balanceCopy();
  if (to) {
    const msg = depositPaidClientEmail({
      clientName: opts.job.clientName,
      amountCents: opts.amountCents,
      confirmed: opts.becameConfirmed || opts.job.status === "confirmed",
      clientPortalUrl: portal,
      kind: opts.kind,
      dueCents: opts.dueCents,
      balanceCents: opts.balanceCents,
      paidInFull: opts.paidInFull,
      balanceTiming: copy.balanceTiming,
    });
    await sendEmail({ to, ...msg });
  }

  const ops = depositPaidOpsEmail({
    jobId: opts.job.id,
    clientName: opts.job.clientName,
    amountCents: opts.amountCents,
    kind: opts.kind,
    balanceCents: opts.balanceCents,
    paidInFull: opts.paidInFull,
  });
  await sendEmail({ to: getOpsNotifyEmail(), ...ops });
}

export async function notifyBookingConfirmed(job: JobLike) {
  const to = clientTo(job);
  if (!to) return false;
  const pricing = await getPricing();
  const msg = bookingConfirmedClientEmail({
    clientName: job.clientName,
    startsAt: asDate(job.startsAt),
    location: job.location,
    clientPortalUrl: job.clientToken ? clientPortalUrl(job.clientToken) : null,
    paymentModel: normalizePaymentModel(job.paymentModel),
    pricing,
  });
  return sendEmail({ to, ...msg });
}

export async function notifyJobCompleted(job: JobLike) {
  const to = clientTo(job);
  if (!to) return false;
  const pricing = await getPricing();
  const msg = jobCompletedClientEmail({
    clientName: job.clientName,
    rebookUrl: `${getSiteUrl()}/book?code=${pricing.guestRebookCode}`,
  });
  return sendEmail({ to, ...msg });
}
