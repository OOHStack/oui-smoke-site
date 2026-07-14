/** Job money story: quote → deposit → balance → paid in full */

export type PaymentLike = {
  kind: string;
  status: string;
  amountCents: number;
};

export type JobMoneyLike = {
  quotedCents?: number | null;
  actualCents?: number | null;
  depositPercent?: number | null;
  paymentModel?: string | null;
};

export type JobMoneyStatus =
  | "no_quote"
  | "deposit_due"
  | "deposit_pending"
  | "balance_due"
  | "balance_pending"
  | "paid_in_full"
  | "n_a";

export const DEFAULT_DEPOSIT_PERCENT = 50;
export const DEPOSIT_PERCENT_PRESETS = [25, 50, 100] as const;

export function clampDepositPercent(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return DEFAULT_DEPOSIT_PERCENT;
  return Math.min(100, Math.max(1, Math.round(n)));
}

/** Total the client owes for the package (final actual wins over quote). */
export function jobDueCents(job: JobMoneyLike): number {
  if (job.actualCents != null && job.actualCents >= 0) return job.actualCents;
  if (job.quotedCents != null && job.quotedCents >= 0) return job.quotedCents;
  return 0;
}

export function jobPaidCents(payments: PaymentLike[]): number {
  return payments
    .filter((p) => p.status === "succeeded")
    .reduce((sum, p) => sum + p.amountCents, 0);
}

export function jobPendingCents(payments: PaymentLike[]): number {
  return payments
    .filter((p) => p.status === "pending")
    .reduce((sum, p) => sum + p.amountCents, 0);
}

export function suggestedDepositCents(
  dueCents: number,
  depositPercent: number = DEFAULT_DEPOSIT_PERCENT,
): number {
  if (dueCents < 100) return 0;
  const pct = clampDepositPercent(depositPercent);
  if (pct >= 100) return dueCents;
  return Math.max(100, Math.round((dueCents * pct) / 100));
}

export function jobBalanceCents(dueCents: number, paidCents: number): number {
  return Math.max(0, dueCents - paidCents);
}

export function hasSucceededDeposit(payments: PaymentLike[]): boolean {
  return payments.some((p) => p.kind === "deposit" && p.status === "succeeded");
}

export function hasPendingDeposit(payments: PaymentLike[]): boolean {
  return payments.some((p) => p.kind === "deposit" && p.status === "pending");
}

export function hasPendingBalance(payments: PaymentLike[]): boolean {
  return payments.some((p) => p.kind === "balance" && p.status === "pending");
}

export function moneyStatus(opts: {
  paymentModel?: string | null;
  dueCents: number;
  paidCents: number;
  payments: PaymentLike[];
}): JobMoneyStatus {
  if (opts.paymentModel && opts.paymentModel !== "client_deposit") {
    return "n_a";
  }
  if (opts.dueCents <= 0) return "no_quote";
  const balance = jobBalanceCents(opts.dueCents, opts.paidCents);
  if (balance <= 0) return "paid_in_full";
  if (hasSucceededDeposit(opts.payments) || opts.paidCents > 0) {
    if (hasPendingBalance(opts.payments)) return "balance_pending";
    return "balance_due";
  }
  if (hasPendingDeposit(opts.payments)) return "deposit_pending";
  return "deposit_due";
}

export function moneyStatusLabel(status: JobMoneyStatus): string {
  switch (status) {
    case "no_quote":
      return "Add a quote";
    case "deposit_due":
      return "Deposit due";
    case "deposit_pending":
      return "Deposit link open";
    case "balance_due":
      return "Balance due";
    case "balance_pending":
      return "Balance link open";
    case "paid_in_full":
      return "Paid in full";
    case "n_a":
      return "No Square package";
  }
}

export function formatCadCents(cents: number, currency = "CAD") {
  return (cents / 100).toLocaleString("en-CA", {
    style: "currency",
    currency,
  });
}

export function summarizeJobMoney(
  job: JobMoneyLike,
  payments: PaymentLike[],
) {
  const dueCents = jobDueCents(job);
  const paidCents = jobPaidCents(payments);
  const pendingCents = jobPendingCents(payments);
  const balanceCents = jobBalanceCents(dueCents, paidCents);
  const depositPercent = clampDepositPercent(
    job.depositPercent ?? DEFAULT_DEPOSIT_PERCENT,
  );
  const depositSuggestedCents = suggestedDepositCents(dueCents, depositPercent);
  const status = moneyStatus({
    paymentModel: job.paymentModel,
    dueCents,
    paidCents,
    payments,
  });

  return {
    dueCents,
    paidCents,
    pendingCents,
    balanceCents,
    depositPercent,
    depositSuggestedCents,
    status,
    statusLabel: moneyStatusLabel(status),
  };
}
