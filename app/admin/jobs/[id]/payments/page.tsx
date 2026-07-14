"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { format } from "date-fns";
import {
  DEPOSIT_PERCENT_PRESETS,
  formatCadCents,
  type JobMoneyStatus,
} from "@/lib/job-balance";
import {
  PAYMENT_MODELS,
  paymentModelLabel,
  requiresClientDeposit,
  type PaymentModel,
} from "@/lib/payment-model";

type Job = {
  id: number;
  title: string;
  status: string;
  paymentModel?: PaymentModel;
  clientName: string;
  clientEmail: string | null;
  startsAt?: string | null;
  quotedCents: number | null;
  actualCents: number | null;
  tipCents: number | null;
  depositPercent?: number;
};

type JobPayment = {
  id: number;
  kind: string;
  status: string;
  amountCents: number;
  currency: string;
  label: string | null;
  checkoutUrl: string | null;
  paidAt: string | null;
  createdAt: string;
};

type MoneySummary = {
  dueCents: number;
  paidCents: number;
  pendingCents: number;
  balanceCents: number;
  depositPercent: number;
  depositSuggestedCents: number;
  status: JobMoneyStatus;
  statusLabel: string;
};

function centsToDollars(cents: number | null | undefined): string {
  if (cents == null) return "";
  return (cents / 100).toFixed(2);
}

function guideForStatus(opts: {
  status: JobMoneyStatus;
  depositPercent: number;
  suggestedDollars: string;
  balanceCents: number;
  clientEmail: string | null;
  squareConfigured: boolean;
  balanceTiming: string;
}): { title: string; body: string; step: number } {
  if (!opts.squareConfigured) {
    return {
      step: 0,
      title: "Square isn’t connected",
      body: "Add SQUARE_ACCESS_TOKEN and SQUARE_LOCATION_ID on Vercel before you can send payment links.",
    };
  }
  switch (opts.status) {
    case "no_quote":
      return {
        step: 1,
        title: "Set the package total",
        body: "Enter the full quote below, then save. That unlocks the deposit amount.",
      };
    case "deposit_due":
      return {
        step: 2,
        title: "Send the deposit",
        body: `Email a ${opts.depositPercent}% deposit${
          opts.suggestedDollars ? ` ($${opts.suggestedDollars})` : ""
        } to lock the date.${
          opts.clientEmail ? ` Goes to ${opts.clientEmail}.` : " Add a client email on the job first."
        }`,
      };
    case "deposit_pending":
      return {
        step: 2,
        title: "Waiting on deposit",
        body: "A deposit link is open. Copy it from Activity if the client needs it again — the job confirms when they pay.",
      };
    case "balance_due":
      return {
        step: 3,
        title: "Collect the balance",
        body: `Deposit is in. Remaining ${formatCadCents(opts.balanceCents)} is due ${opts.balanceTiming} — send now, or let the scheduled reminder handle it.`,
      };
    case "balance_pending":
      return {
        step: 3,
        title: "Waiting on balance",
        body: "A final payment link is open. Copy it from Activity if they need a nudge.",
      };
    case "paid_in_full":
      return {
        step: 4,
        title: "Paid in full",
        body: "Package is settled. Nothing left to collect on Square for this job.",
      };
    default:
      return {
        step: 0,
        title: "Package payments",
        body: "Track deposit and balance for this booking.",
      };
  }
}

function stepState(
  step: number,
  current: number,
  paidInFull: boolean,
): "done" | "current" | "todo" {
  if (paidInFull || step < current) return "done";
  if (step === current) return "current";
  return "todo";
}

export default function JobPaymentsPage() {
  const params = useParams();
  const jobId = params.id as string;

  const [job, setJob] = useState<Job | null>(null);
  const [payments, setPayments] = useState<JobPayment[]>([]);
  const [summary, setSummary] = useState<MoneySummary | null>(null);
  const [squareConfigured, setSquareConfigured] = useState(false);
  const [quotedDollars, setQuotedDollars] = useState("");
  const [depositPercent, setDepositPercent] = useState(50);
  const [customAmount, setCustomAmount] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [modelBusy, setModelBusy] = useState(false);
  const [quoteBusy, setQuoteBusy] = useState(false);
  const [balanceTiming, setBalanceTiming] = useState(
    "about a week before the event",
  );

  const load = useCallback(async () => {
    const [jobRes, payRes, copyRes] = await Promise.all([
      fetch(`/api/jobs/${jobId}`),
      fetch(`/api/jobs/${jobId}/payments`),
      fetch("/api/payment-copy"),
    ]);
    if (!jobRes.ok) {
      setError("Failed to load job");
      setLoading(false);
      return;
    }
    const data = await jobRes.json();
    const { assignments: _a, events: _e, ...jobData } = data;
    setJob(jobData as Job);
    setQuotedDollars(centsToDollars(jobData.quotedCents));
    setDepositPercent(jobData.depositPercent ?? 50);
    if (payRes.ok) {
      const payData = await payRes.json();
      setPayments(payData.payments ?? []);
      setSquareConfigured(!!payData.squareConfigured);
      if (payData.summary) setSummary(payData.summary as MoneySummary);
    }
    if (copyRes.ok) {
      const copy = await copyRes.json().catch(() => null);
      if (copy?.balanceTiming) setBalanceTiming(copy.balanceTiming);
    }
    setLoading(false);
  }, [jobId]);

  useEffect(() => {
    void load();
  }, [load]);

  const suggestedDollars = useMemo(() => {
    if (!summary?.depositSuggestedCents) return "";
    return (summary.depositSuggestedCents / 100).toFixed(2);
  }, [summary]);

  async function savePaymentModel(paymentModel: string) {
    setModelBusy(true);
    setMsg("");
    try {
      const res = await fetch(`/api/jobs/${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentModel }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? "Couldn’t update payment model");
        return;
      }
      setMsg("Payment model updated.");
      await load();
    } finally {
      setModelBusy(false);
    }
  }

  async function saveQuote(e: FormEvent) {
    e.preventDefault();
    setQuoteBusy(true);
    setMsg("");
    setError("");
    try {
      const quotedCents = quotedDollars
        ? Math.round(parseFloat(quotedDollars) * 100)
        : null;
      const res = await fetch(`/api/jobs/${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quotedCents, depositPercent }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? "Couldn’t save");
        return;
      }
      const updated = await res.json();
      if (updated.autoDeposit?.sent) {
        setMsg("Quote saved — deposit link emailed.");
      } else {
        setMsg("Quote saved.");
      }
      await load();
    } finally {
      setQuoteBusy(false);
    }
  }

  async function sendLink(kind: "deposit" | "balance") {
    setBusy(true);
    setMsg("");
    setError("");
    try {
      const body: Record<string, unknown> = { kind };
      if (customAmount.trim()) body.amountDollars = customAmount.trim();
      const res = await fetch(`/api/jobs/${jobId}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(d.error ?? "Couldn’t create payment link");
        return;
      }
      const url = d.url as string | undefined;
      const label = kind === "balance" ? "Balance" : "Deposit";
      if (url) {
        try {
          await navigator.clipboard.writeText(url);
          setMsg(
            d.emailed
              ? `${label} link copied and emailed.`
              : `${label} link copied.`,
          );
        } catch {
          setMsg(url);
        }
      }
      setCustomAmount("");
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function copyPaymentLink(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setMsg("Link copied.");
    } catch {
      setMsg(url);
    }
  }

  if (loading) return <p className="empty">Loading payments…</p>;
  if (!job) return <p className="login-error">{error || "Job not found"}</p>;

  const model = job.paymentModel || "client_deposit";
  const status = summary?.status ?? "no_quote";
  const canSendDeposit =
    requiresClientDeposit(model) &&
    squareConfigured &&
    status === "deposit_due" &&
    (Boolean(customAmount) || (summary?.depositSuggestedCents ?? 0) >= 100);
  const canSendBalance =
    requiresClientDeposit(model) &&
    squareConfigured &&
    status === "balance_due" &&
    (summary?.balanceCents ?? 0) >= 100;

  const guide = guideForStatus({
    status,
    depositPercent: summary?.depositPercent ?? depositPercent,
    suggestedDollars,
    balanceCents: summary?.balanceCents ?? 0,
    clientEmail: job.clientEmail,
    squareConfigured,
    balanceTiming,
  });

  const paidInFull = status === "paid_in_full";
  const progressPct =
    summary && summary.dueCents > 0
      ? Math.min(100, Math.round((summary.paidCents / summary.dueCents) * 100))
      : 0;

  const openLink = payments.find(
    (p) => p.status === "pending" && p.checkoutUrl,
  );

  return (
    <div className="collect-page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Collect</h1>
          <p className="page-sub">
            <Link href="/admin/payments">Payments</Link>
            {" / "}
            <Link href={`/admin/jobs/${jobId}`}>{job.title}</Link>
          </p>
        </div>
        <div className="page-head-actions">
          <Link href={`/admin/jobs/${jobId}`} className="btn btn-sm">
            Back to job
          </Link>
        </div>
      </div>

      {error ? <p className="login-error">{error}</p> : null}
      {msg ? <p className="collect-toast">{msg}</p> : null}

      {!requiresClientDeposit(model) ? (
        <section className="panel collect-hero">
          <p className="collect-hero__kicker">Payment model</p>
          <h2 className="collect-hero__title">{paymentModelLabel(model)}</h2>
          <p className="collect-hero__body">
            This job doesn’t use Square package deposits. Guests pay on the floor,
            or the booking is complimentary.
          </p>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => setShowAdvanced(true)}
          >
            Change payment model
          </button>
        </section>
      ) : (
        <>
          <section className="panel collect-hero">
            <div className="collect-hero__meta">
              <div>
                <p className="collect-hero__kicker">Client</p>
                <p className="collect-hero__client">{job.clientName}</p>
                {job.clientEmail ? (
                  <p className="collect-hero__email">{job.clientEmail}</p>
                ) : (
                  <p className="collect-hero__email collect-hero__email--warn">
                    No email on file — add one on the job to send links
                  </p>
                )}
              </div>
              <div className="collect-hero__when">
                {job.startsAt ? (
                  <>
                    <p className="collect-hero__kicker">Event</p>
                    <p>{format(new Date(job.startsAt), "EEE MMM d · h:mm a")}</p>
                  </>
                ) : null}
              </div>
            </div>

            <p className="collect-hero__kicker" style={{ marginTop: "1.1rem" }}>
              Status
            </p>
            <h2 className="collect-hero__title">
              {summary?.statusLabel ?? "Add a quote"}
            </h2>
            <p className="collect-hero__body">
              Deposit locks the date. Remaining balance is due {balanceTiming}.
            </p>

            <div
              className="collect-meter"
              aria-hidden={!summary?.dueCents}
            >
              <div className="collect-meter__track">
                <div
                  className="collect-meter__fill"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <div className="collect-meter__labels">
                <span>
                  Collected{" "}
                  <strong>{formatCadCents(summary?.paidCents ?? 0)}</strong>
                </span>
                <span>
                  of{" "}
                  <strong>
                    {summary?.dueCents
                      ? formatCadCents(summary.dueCents)
                      : "—"}
                  </strong>
                </span>
                <span>
                  Left{" "}
                  <strong>{formatCadCents(summary?.balanceCents ?? 0)}</strong>
                </span>
              </div>
            </div>

            <ol className="collect-path" aria-label="Payment path">
              {(
                [
                  { n: 1, label: "Quote" },
                  { n: 2, label: "Deposit" },
                  { n: 3, label: "Balance" },
                  { n: 4, label: "Paid" },
                ] as const
              ).map((s) => {
                const state = stepState(s.n, guide.step, paidInFull);
                return (
                  <li
                    key={s.n}
                    className={`collect-path__step collect-path__step--${state}`}
                  >
                    <span className="collect-path__num">{s.n}</span>
                    <span className="collect-path__label">{s.label}</span>
                  </li>
                );
              })}
            </ol>
          </section>

          <section className="panel collect-next">
            <p className="collect-next__eyebrow">What’s next</p>
            <h3 className="collect-next__title">{guide.title}</h3>
            <p className="collect-next__body">{guide.body}</p>

            {!squareConfigured ? null : (
              <div className="collect-next__actions">
                {status === "deposit_due" ? (
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={busy || !canSendDeposit}
                    onClick={() => void sendLink("deposit")}
                  >
                    {busy
                      ? "Creating…"
                      : `Send deposit · $${customAmount || suggestedDollars || "—"}`}
                  </button>
                ) : null}

                {status === "no_quote" ? (
                  <p className="list-meta" style={{ margin: 0 }}>
                    Save a package total first — the deposit button appears after.
                  </p>
                ) : null}

                {status === "deposit_pending" && openLink ? (
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => void copyPaymentLink(openLink.checkoutUrl!)}
                  >
                    Copy open deposit link
                  </button>
                ) : null}

                {status === "balance_due" ? (
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={busy || !canSendBalance}
                    onClick={() => void sendLink("balance")}
                  >
                    {busy
                      ? "Creating…"
                      : `Send balance · ${formatCadCents(
                          customAmount
                            ? Math.round(parseFloat(customAmount) * 100)
                            : (summary?.balanceCents ?? 0),
                        )}`}
                  </button>
                ) : null}

                {status === "balance_pending" && openLink ? (
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => void copyPaymentLink(openLink.checkoutUrl!)}
                  >
                    Copy open balance link
                  </button>
                ) : null}

                {status === "paid_in_full" ? (
                  <span className="collect-badge collect-badge--ok">Settled</span>
                ) : null}
              </div>
            )}

            {(status === "deposit_due" || status === "balance_due") &&
            squareConfigured ? (
              <details className="collect-override">
                <summary>Use a different amount</summary>
                <input
                  type="number"
                  min="1"
                  step="0.01"
                  value={customAmount}
                  onChange={(e) => setCustomAmount(e.target.value)}
                  placeholder={
                    status === "balance_due"
                      ? centsToDollars(summary?.balanceCents)
                      : suggestedDollars || "Custom $"
                  }
                />
              </details>
            ) : null}
          </section>

          <section className="panel collect-section">
            <div className="collect-section__head">
              <h2 className="panel-title" style={{ margin: 0 }}>
                1 · Package total
              </h2>
              <p className="list-meta" style={{ margin: 0 }}>
                Full amount owed (quote, or actual if set on Outcome)
              </p>
            </div>
            <form className="collect-quote" onSubmit={saveQuote}>
              <div className="field">
                <label htmlFor="quoted">Amount ($ CAD)</label>
                <input
                  id="quoted"
                  type="number"
                  min="0"
                  step="0.01"
                  value={quotedDollars}
                  onChange={(e) => setQuotedDollars(e.target.value)}
                  placeholder="e.g. 722.00"
                />
              </div>
              <div className="collect-quote__side">
                <p className="list-meta" style={{ margin: 0 }}>
                  Deposit at {summary?.depositPercent ?? depositPercent}% →{" "}
                  <strong>
                    {suggestedDollars ? `$${suggestedDollars}` : "—"}
                  </strong>
                </p>
                <button
                  type="submit"
                  className="btn btn-sm"
                  disabled={quoteBusy}
                >
                  {quoteBusy ? "Saving…" : "Save quote"}
                </button>
              </div>
            </form>
          </section>

          <section className="panel collect-section">
            <div className="collect-section__head">
              <h2 className="panel-title" style={{ margin: 0 }}>
                2 · Activity
              </h2>
              <p className="list-meta" style={{ margin: 0 }}>
                Links sent and payments received
              </p>
            </div>
            {payments.length > 0 ? (
              <ul className="collect-ledger">
                {payments.map((p) => (
                  <li key={p.id} className="collect-ledger__row">
                    <div className="collect-ledger__main">
                      <span
                        className={`collect-badge collect-badge--${
                          p.status === "succeeded"
                            ? "ok"
                            : p.status === "pending"
                              ? "wait"
                              : "muted"
                        }`}
                      >
                        {p.status}
                      </span>
                      <strong>
                        {formatCadCents(p.amountCents, p.currency || "CAD")}
                      </strong>
                      <span className="collect-ledger__kind">{p.kind}</span>
                    </div>
                    <div className="collect-ledger__meta">
                      {p.paidAt
                        ? `Paid ${format(new Date(p.paidAt), "MMM d, h:mm a")}`
                        : format(new Date(p.createdAt), "MMM d, h:mm a")}
                      {p.checkoutUrl && p.status === "pending" ? (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => void copyPaymentLink(p.checkoutUrl!)}
                        >
                          Copy link
                        </button>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="collect-empty">
                Nothing sent yet. Set a quote, then send the deposit from What’s
                next.
              </p>
            )}
          </section>
        </>
      )}

      <section className="panel collect-section collect-section--muted">
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => setShowAdvanced((v) => !v)}
        >
          {showAdvanced ? "Hide advanced" : "Advanced · model & deposit %"}
        </button>
        {showAdvanced ? (
          <div className="collect-advanced">
            <div className="field">
              <label htmlFor="payment-model">Payment model</label>
              <select
                id="payment-model"
                value={model}
                disabled={modelBusy}
                onChange={(e) => void savePaymentModel(e.target.value)}
              >
                {PAYMENT_MODELS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
            {requiresClientDeposit(model) ? (
              <div className="field">
                <label>Deposit % for this job</label>
                <div className="deposit-pct">
                  {DEPOSIT_PERCENT_PRESETS.map((pct) => (
                    <button
                      key={pct}
                      type="button"
                      className={`chip${depositPercent === pct ? " active" : ""}`}
                      onClick={() => setDepositPercent(pct)}
                    >
                      {pct}%
                    </button>
                  ))}
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={depositPercent}
                    onChange={(e) =>
                      setDepositPercent(
                        Math.min(
                          100,
                          Math.max(1, Number(e.target.value) || 50),
                        ),
                      )
                    }
                  />
                  <button
                    type="button"
                    className="btn btn-sm"
                    disabled={quoteBusy}
                    onClick={() =>
                      void (async () => {
                        setQuoteBusy(true);
                        try {
                          await fetch(`/api/jobs/${jobId}`, {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ depositPercent }),
                          });
                          setMsg("Deposit % saved for this job.");
                          await load();
                        } finally {
                          setQuoteBusy(false);
                        }
                      })()
                    }
                  >
                    Save %
                  </button>
                </div>
                <p className="list-meta" style={{ marginTop: "0.5rem" }}>
                  Global default lives in{" "}
                  <Link href="/admin/payments">Payments settings</Link>.
                </p>
              </div>
            ) : null}
          </div>
        ) : null}
      </section>
    </div>
  );
}
