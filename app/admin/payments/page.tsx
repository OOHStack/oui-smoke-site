"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { type JobMoneyStatus } from "@/lib/job-balance";

type Settings = {
  defaultDepositPercent: number;
  autoDepositOnBooking: boolean;
  autoDepositOnQuote: boolean;
  autoBalanceEnabled: boolean;
  autoBalanceDaysBefore: number;
};

type OverviewJob = {
  id: number;
  title: string;
  clientName: string;
  status: string;
  startsAt: string | null;
  moneyLabel: string;
  dueLabel: string;
  paidLabel: string;
  balanceLabel: string;
  summary: { status: JobMoneyStatus; dueCents?: number; paidCents?: number };
};

type Counts = {
  attention: number;
  deposit_due: number;
  deposit_pending: number;
  balance_due: number;
  balance_pending: number;
  paid_in_full: number;
  all: number;
};

const FILTERS: { id: string; label: string; hint: string }[] = [
  {
    id: "attention",
    label: "Needs attention",
    hint: "Deposit or balance still open",
  },
  { id: "deposit_due", label: "Deposit due", hint: "Ready to send deposit" },
  { id: "balance_due", label: "Balance due", hint: "Deposit in, balance left" },
  { id: "paid_in_full", label: "Paid in full", hint: "Settled packages" },
  { id: "all", label: "All package jobs", hint: "Every client-deposit job" },
];

function timingPhrase(days: number, enabled: boolean) {
  if (!enabled) return "before the event";
  if (days === 0) return "on the day of the event";
  if (days === 1) return "1 day before the event";
  if (days === 7) return "about a week before the event";
  return `${days} days before the event`;
}

function hubGuide(opts: {
  squareConfigured: boolean;
  counts: Counts | null;
  settings: Settings | null;
}): { title: string; body: string } {
  if (!opts.squareConfigured) {
    return {
      title: "Connect Square",
      body: "Set SQUARE_ACCESS_TOKEN and SQUARE_LOCATION_ID on Vercel so deposit and balance links can send.",
    };
  }
  const c = opts.counts;
  if (!c) {
    return {
      title: "Loading payments…",
      body: "Checking package jobs and open balances.",
    };
  }
  if (c.attention > 0) {
    const bits: string[] = [];
    if (c.deposit_due + c.deposit_pending > 0) {
      bits.push(
        `${c.deposit_due + c.deposit_pending} deposit${c.deposit_due + c.deposit_pending === 1 ? "" : "s"}`,
      );
    }
    if (c.balance_due + c.balance_pending > 0) {
      bits.push(
        `${c.balance_due + c.balance_pending} balance${c.balance_due + c.balance_pending === 1 ? "" : "s"}`,
      );
    }
    return {
      title: `${c.attention} job${c.attention === 1 ? "" : "s"} need attention`,
      body: `Open a job below to collect — ${bits.join(" and ")} still in progress.`,
    };
  }
  if (c.all === 0) {
    return {
      title: "No package jobs yet",
      body: "Website package bookings and quoted client-deposit jobs will show up here.",
    };
  }
  const timing = opts.settings
    ? timingPhrase(
        opts.settings.autoBalanceDaysBefore,
        opts.settings.autoBalanceEnabled,
      )
    : "before the event";
  return {
    title: "All caught up",
    body: `No open deposits or balances. Final payment links auto-send ${timing} when that automation is on.`,
  };
}

function statusBadgeClass(status: JobMoneyStatus) {
  if (status === "paid_in_full") return "ok";
  if (status === "deposit_pending" || status === "balance_pending") return "wait";
  if (status === "deposit_due" || status === "balance_due") return "wait";
  return "muted";
}

export default function AdminPaymentsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [jobs, setJobs] = useState<OverviewJob[]>([]);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [filter, setFilter] = useState("attention");
  const [squareConfigured, setSquareConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);

  const loadSettings = useCallback(async () => {
    const [sessionRes, settingsRes] = await Promise.all([
      fetch("/api/auth/session"),
      fetch("/api/payment-settings"),
    ]);
    if (sessionRes.ok) {
      const s = await sessionRes.json();
      setIsAdmin(s.role === "admin");
    }
    if (settingsRes.ok) {
      const data = await settingsRes.json();
      setSettings(data.settings);
    }
  }, []);

  const loadOverview = useCallback(async () => {
    const res = await fetch(`/api/payments/overview?status=${filter}`);
    if (!res.ok) {
      setError("Failed to load payments overview");
      return;
    }
    const data = await res.json();
    setJobs(data.jobs ?? []);
    setCounts(data.counts ?? null);
    setSquareConfigured(!!data.squareConfigured);
  }, [filter]);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      await loadSettings();
      await loadOverview();
      setLoading(false);
    })();
  }, [loadSettings, loadOverview]);

  const guide = useMemo(
    () => hubGuide({ squareConfigured, counts, settings }),
    [squareConfigured, counts, settings],
  );

  const paidCount = counts?.paid_in_full ?? 0;
  const depositCount = counts
    ? counts.deposit_due + counts.deposit_pending
    : 0;
  const balanceCount = counts
    ? counts.balance_due + counts.balance_pending
    : 0;
  const packageCount = counts?.all ?? 0;
  const paidPct =
    packageCount > 0
      ? Math.min(100, Math.round((paidCount / packageCount) * 100))
      : 0;

  const stageTiles = [
    {
      id: "deposit_due" as const,
      label: "Deposit",
      count: depositCount,
      hint:
        depositCount === 0
          ? "None waiting"
          : depositCount === 1
            ? "Job waiting on deposit"
            : "Jobs waiting on deposit",
      filterId: "deposit_due",
      tone: depositCount > 0 ? "current" : "todo",
    },
    {
      id: "balance_due" as const,
      label: "Balance",
      count: balanceCount,
      hint:
        balanceCount === 0
          ? "None waiting"
          : balanceCount === 1
            ? "Job waiting on balance"
            : "Jobs waiting on balance",
      filterId: "balance_due",
      tone: balanceCount > 0 ? "current" : "todo",
    },
    {
      id: "paid_in_full" as const,
      label: "Paid",
      count: paidCount,
      hint:
        paidCount === 0
          ? "None settled yet"
          : paidCount === 1
            ? "Package fully paid"
            : "Packages fully paid",
      filterId: "paid_in_full",
      tone: paidCount > 0 ? "done" : "todo",
    },
  ];

  return (
    <div className="collect-page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Payments</h1>
          <p className="page-sub">Track package deposits and balances</p>
        </div>
      </div>

      {error ? <p className="login-error">{error}</p> : null}
      {msg ? <p className="collect-toast">{msg}</p> : null}

      <section className="panel collect-hero">
        <p className="collect-hero__kicker">Package payments</p>
        <h2 className="collect-hero__title">
          {counts
            ? counts.attention > 0
              ? `${counts.attention} job${counts.attention === 1 ? "" : "s"} need collecting`
              : packageCount > 0
                ? "All packages settled"
                : "No package jobs yet"
            : "Payments"}
        </h2>
        <p className="collect-hero__body">
          After a quote is accepted, money moves in two steps: deposit, then
          balance. Tap a stage to filter the list below.
        </p>

        <div className="collect-meter" aria-hidden={packageCount === 0}>
          <div className="collect-meter__track">
            <div
              className="collect-meter__fill"
              style={{ width: `${paidPct}%` }}
            />
          </div>
          <div className="collect-meter__labels">
            <span>
              <strong>{paidCount}</strong> fully paid
            </span>
            <span>
              <strong>{counts?.attention ?? 0}</strong> still collecting
            </span>
            <span>
              <strong>{packageCount}</strong> package jobs total
            </span>
          </div>
        </div>

        <div className="pay-hub__stages" role="group" aria-label="Payment stages">
          {stageTiles.map((stage) => (
            <button
              key={stage.id}
              type="button"
              className={`pay-hub__stage pay-hub__stage--${stage.tone}${
                filter === stage.filterId ? " is-active" : ""
              }`}
              onClick={() => setFilter(stage.filterId)}
            >
              <span className="pay-hub__stage-label">{stage.label}</span>
              <strong className="pay-hub__stage-count">{stage.count}</strong>
              <span className="pay-hub__stage-hint">{stage.hint}</span>
            </button>
          ))}
        </div>

        {!squareConfigured ? (
          <p className="collect-hero__email collect-hero__email--warn" style={{ marginTop: "0.85rem" }}>
            Square isn’t connected — payment links won’t send until env vars are set.
          </p>
        ) : null}
      </section>

      <section className="panel collect-next">
        <p className="collect-next__eyebrow">What’s next</p>
        <h3 className="collect-next__title">{guide.title}</h3>
        <p className="collect-next__body">{guide.body}</p>
        <div className="collect-next__actions">
          {counts && counts.attention > 0 ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setFilter("attention")}
            >
              Show jobs that need attention
            </button>
          ) : null}
          {counts && counts.deposit_due > 0 && filter !== "deposit_due" ? (
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => setFilter("deposit_due")}
            >
              Deposit due · {counts.deposit_due}
            </button>
          ) : null}
          {counts && counts.balance_due > 0 && filter !== "balance_due" ? (
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => setFilter("balance_due")}
            >
              Balance due · {counts.balance_due}
            </button>
          ) : null}
        </div>
      </section>

      <section className="panel collect-section">
        <div className="collect-section__head">
          <h2 className="panel-title" style={{ margin: 0 }}>
            1 · By job
          </h2>
          <p className="list-meta" style={{ margin: 0 }}>
            {FILTERS.find((f) => f.id === filter)?.hint}
          </p>
        </div>

        <div className="chips" style={{ marginBottom: "0.85rem" }}>
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              className={`chip ${filter === f.id ? "active" : ""}`}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
              {counts ? ` · ${counts[f.id as keyof Counts] ?? 0}` : ""}
            </button>
          ))}
        </div>

        {loading ? (
          <p className="collect-empty">Loading jobs…</p>
        ) : jobs.length === 0 ? (
          <p className="collect-empty">No jobs in this view.</p>
        ) : (
          <ul className="collect-ledger">
            {jobs.map((job) => (
              <li key={job.id} className="collect-ledger__row pay-hub__job">
                <div className="collect-ledger__main">
                  <span
                    className={`collect-badge collect-badge--${statusBadgeClass(job.summary.status)}`}
                  >
                    {job.moneyLabel}
                  </span>
                  <div className="pay-hub__job-copy">
                    <Link
                      href={`/admin/jobs/${job.id}/payments`}
                      className="pay-hub__job-title"
                    >
                      {job.title}
                    </Link>
                    <span className="list-meta">
                      {job.clientName}
                      {job.startsAt
                        ? ` · ${format(new Date(job.startsAt), "MMM d, h:mm a")}`
                        : ""}
                    </span>
                  </div>
                </div>
                <div className="pay-hub__job-money">
                  <span>
                    <em>Package</em>
                    <strong>{job.dueLabel}</strong>
                  </span>
                  <span>
                    <em>In</em>
                    <strong>{job.paidLabel}</strong>
                  </span>
                  <span>
                    <em>Left</em>
                    <strong>{job.balanceLabel}</strong>
                  </span>
                  <Link
                    href={`/admin/jobs/${job.id}/payments`}
                    className="btn btn-sm"
                  >
                    Collect
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel collect-section collect-section--muted">
        <h2 className="panel-title" style={{ marginTop: 0 }}>
          Defaults &amp; automations
        </h2>
        <p className="list-meta" style={{ margin: "0 0 0.65rem" }}>
          Deposit {settings?.defaultDepositPercent ?? 50}% · balance{" "}
          {settings
            ? timingPhrase(
                settings.autoBalanceDaysBefore,
                settings.autoBalanceEnabled,
              )
            : "…"}
        </p>
        {isAdmin ? (
          <Link href="/admin/settings?tab=payments" className="btn btn-sm">
            Edit defaults in Settings → Payments
          </Link>
        ) : (
          <p className="list-meta" style={{ margin: 0 }}>
            Only admins can change payment defaults (Settings → Payments).
          </p>
        )}
      </section>
    </div>
  );
}
