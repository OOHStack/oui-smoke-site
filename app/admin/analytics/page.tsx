"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type GuestFeedbackRow = {
  assignmentId: number;
  jobId: number;
  modelNumber: number;
  guestRating: number | null;
  guestComment: string | null;
  guestFeedbackAt: string | null;
  jobTitle: string;
  clientName: string;
};

type Analytics = {
  jobsByStatus: Record<string, number>;
  jobsCompleted30d: number;
  avgRating: number | null;
  totalRevenueCents: number;
  jobRevenueCents?: number;
  refillRevenueCents?: number;
  totalTipsCents: number;
  checkCompliance: number;
  currentlyOut: number;
  overdueChecks: number;
  topFlavours: { name: string; timesUsed: number }[];
  fleet: Record<string, number>;
  repeatClients: number;
  avgHookahsPerJob: number;
  incidents30d: number;
  avgAckSeconds?: number | null;
  avgResolveSeconds?: number | null;
  responseSampleCount?: number;
  ugcApproved?: number;
  ugcFeatured?: number;
  ugcTotal?: number;
  recentGuestFeedback?: GuestFeedbackRow[];
};

function formatFeedbackWhen(iso: string | null) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function formatMoney(cents: number) {
  return `$${(cents / 100).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

function formatSeconds(sec: number | null | undefined) {
  if (sec == null || Number.isNaN(sec)) return "—";
  if (sec < 60) return `${Math.round(sec)}s`;
  return `${(sec / 60).toFixed(1)}m`;
}

function labelStatus(status: string) {
  return status.replace(/_/g, " ");
}

function rankedEntries(record: Record<string, number>) {
  return Object.entries(record).sort((a, b) => b[1] - a[1]);
}

export default function AnalyticsPage() {
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/analytics");
    if (res.ok) {
      setData(await res.json());
    } else {
      setData(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const feedback = data?.recentGuestFeedback ?? [];
  const topFlavours = data?.topFlavours ?? [];
  const maxFlavourUses = useMemo(
    () => Math.max(1, ...topFlavours.map((f) => f.timesUsed)),
    [topFlavours],
  );
  const jobStatusRows = useMemo(
    () => rankedEntries(data?.jobsByStatus ?? {}),
    [data?.jobsByStatus],
  );
  const fleetRows = useMemo(
    () => rankedEntries(data?.fleet ?? {}),
    [data?.fleet],
  );
  const maxJobStatus = Math.max(1, ...jobStatusRows.map(([, n]) => n));
  const maxFleet = Math.max(1, ...fleetRows.map(([, n]) => n));

  if (loading) {
    return (
      <div className="analytics">
        <header className="analytics__head">
          <div>
            <h1 className="page-title">Analytics</h1>
            <p className="page-sub">Loading performance snapshot…</p>
          </div>
        </header>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="analytics">
        <header className="analytics__head">
          <div>
            <h1 className="page-title">Analytics</h1>
            <p className="page-sub login-error">Failed to load analytics.</p>
          </div>
          <button type="button" className="btn" onClick={load}>
            Retry
          </button>
        </header>
      </div>
    );
  }

  const overdueHot = data.overdueChecks > 0;
  const incidentsHot = data.incidents30d > 0;

  return (
    <div className="analytics">
      <header className="analytics__head">
        <div>
          <h1 className="page-title">Analytics</h1>
          <p className="page-sub">
            Money, floor health, and guest voice — completed jobs unless noted
            live
          </p>
        </div>
        <button type="button" className="btn" onClick={load}>
          Refresh
        </button>
      </header>

      <section className="analytics__hero" aria-label="Business outcomes">
        <div className="analytics__hero-primary">
          <p className="analytics__kicker">Revenue</p>
          <p className="analytics__hero-value">
            {formatMoney(data.totalRevenueCents)}
          </p>
          <p className="analytics__hero-split">
            <span>Jobs {formatMoney(data.jobRevenueCents ?? 0)}</span>
            <span aria-hidden="true">·</span>
            <span>Refills {formatMoney(data.refillRevenueCents ?? 0)}</span>
          </p>
        </div>
        <div className="analytics__hero-side">
          <div className="analytics__kpi">
            <span className="analytics__kpi-label">Tips</span>
            <strong className="analytics__kpi-value">
              {formatMoney(data.totalTipsCents)}
            </strong>
          </div>
          <div className="analytics__kpi">
            <span className="analytics__kpi-label">Completed · 30d</span>
            <strong className="analytics__kpi-value">
              {data.jobsCompleted30d}
            </strong>
          </div>
          <div className="analytics__kpi">
            <span className="analytics__kpi-label">Avg job rating</span>
            <strong className="analytics__kpi-value">
              {data.avgRating != null ? data.avgRating.toFixed(1) : "—"}
            </strong>
          </div>
          <div className="analytics__kpi">
            <span className="analytics__kpi-label">Repeat clients</span>
            <strong className="analytics__kpi-value">
              {data.repeatClients}
            </strong>
          </div>
        </div>
      </section>

      <section
        className={`analytics__health${overdueHot ? " analytics__health--alert" : ""}`}
        aria-label="Floor health"
      >
        <div className="analytics__section-head">
          <h2 className="analytics__section-title">Floor health</h2>
          <p className="analytics__section-lede">Live ops signals</p>
        </div>
        <div className="analytics__health-grid">
          <div className="analytics__stat">
            <span className="analytics__stat-label">Hookahs out</span>
            <strong className="analytics__stat-value">{data.currentlyOut}</strong>
          </div>
          <div className="analytics__stat">
            <span className="analytics__stat-label">Overdue checks</span>
            <strong
              className={`analytics__stat-value${overdueHot ? " is-accent" : ""}`}
            >
              {data.overdueChecks}
            </strong>
          </div>
          <div className="analytics__stat">
            <span className="analytics__stat-label">Check compliance</span>
            <strong className="analytics__stat-value">
              {data.checkCompliance}%
            </strong>
          </div>
          <div className="analytics__stat">
            <span className="analytics__stat-label">Incidents · 30d</span>
            <strong
              className={`analytics__stat-value${incidentsHot ? " is-warn" : ""}`}
            >
              {data.incidents30d}
            </strong>
          </div>
        </div>
      </section>

      <section className="analytics__service" aria-label="Service quality">
        <div className="analytics__section-head">
          <h2 className="analytics__section-title">Service quality</h2>
          <p className="analytics__section-lede">
            Guest call pace · {data.responseSampleCount ?? 0} calls in 30d
          </p>
        </div>
        <div className="analytics__service-grid">
          <div className="analytics__stat analytics__stat--panel">
            <span className="analytics__stat-label">Avg ack</span>
            <strong className="analytics__stat-value">
              {formatSeconds(data.avgAckSeconds)}
            </strong>
          </div>
          <div className="analytics__stat analytics__stat--panel">
            <span className="analytics__stat-label">Avg resolve</span>
            <strong className="analytics__stat-value">
              {formatSeconds(data.avgResolveSeconds)}
            </strong>
          </div>
          <div className="analytics__stat analytics__stat--panel">
            <span className="analytics__stat-label">Avg hookahs / job</span>
            <strong className="analytics__stat-value">
              {data.avgHookahsPerJob.toFixed(1)}
            </strong>
          </div>
          <div className="analytics__stat analytics__stat--panel">
            <span className="analytics__stat-label">UGC approved</span>
            <strong className="analytics__stat-value">
              {data.ugcApproved ?? 0}
              <span className="analytics__stat-suffix">
                {" "}
                / {data.ugcTotal ?? 0}
              </span>
            </strong>
            <span className="analytics__stat-meta">
              {data.ugcFeatured ?? 0} featured
            </span>
          </div>
        </div>
      </section>

      <div className="analytics__breakdowns">
        <section className="analytics__panel">
          <div className="analytics__section-head">
            <h2 className="analytics__section-title">Jobs by status</h2>
          </div>
          {jobStatusRows.length === 0 ? (
            <p className="empty">No jobs yet.</p>
          ) : (
            <ul className="analytics__bars">
              {jobStatusRows.map(([status, count]) => (
                <li key={status} className="analytics__bar-row">
                  <div className="analytics__bar-meta">
                    <span>{labelStatus(status)}</span>
                    <strong>{count}</strong>
                  </div>
                  <div className="analytics__bar-track" aria-hidden="true">
                    <span
                      className="analytics__bar-fill"
                      style={{ width: `${(count / maxJobStatus) * 100}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="analytics__panel">
          <div className="analytics__section-head">
            <h2 className="analytics__section-title">Fleet</h2>
          </div>
          {fleetRows.length === 0 ? (
            <p className="empty">No fleet data.</p>
          ) : (
            <ul className="analytics__bars">
              {fleetRows.map(([status, count]) => (
                <li key={status} className="analytics__bar-row">
                  <div className="analytics__bar-meta">
                    <span>{labelStatus(status)}</span>
                    <strong>{count}</strong>
                  </div>
                  <div className="analytics__bar-track" aria-hidden="true">
                    <span
                      className={`analytics__bar-fill${status === "out" ? " analytics__bar-fill--accent" : ""}${status === "maintenance" ? " analytics__bar-fill--warn" : ""}`}
                      style={{ width: `${(count / maxFleet) * 100}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="analytics__panel">
          <div className="analytics__section-head">
            <h2 className="analytics__section-title">Top flavours</h2>
          </div>
          {topFlavours.length === 0 ? (
            <p className="empty">No flavour data yet.</p>
          ) : (
            <ol className="analytics__bars">
              {topFlavours.map((f, i) => (
                <li key={f.name} className="analytics__bar-row">
                  <div className="analytics__bar-meta">
                    <span>
                      <span className="analytics__rank">{i + 1}</span>
                      {f.name}
                    </span>
                    <strong>{f.timesUsed}</strong>
                  </div>
                  <div className="analytics__bar-track" aria-hidden="true">
                    <span
                      className="analytics__bar-fill analytics__bar-fill--soft"
                      style={{
                        width: `${(f.timesUsed / maxFlavourUses) * 100}%`,
                      }}
                    />
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      <section className="analytics__feedback" aria-label="Guest feedback">
        <div className="analytics__section-head analytics__section-head--row">
          <div>
            <h2 className="analytics__section-title">Guest feedback</h2>
            <p className="analytics__section-lede">
              Latest QR ratings from the floor
            </p>
          </div>
          <span className="analytics__count">{feedback.length}</span>
        </div>
        {feedback.length === 0 ? (
          <p className="empty">
            No guest ratings yet — they appear when QR sessions wrap.
          </p>
        ) : (
          <ul className="analytics__feedback-list">
            {feedback.map((row) => (
              <li key={row.assignmentId}>
                <Link
                  href={`/admin/jobs/${row.jobId}`}
                  className="analytics__feedback-row"
                >
                  <div className="analytics__feedback-score">
                    {row.guestRating}
                    <span>/5</span>
                  </div>
                  <div className="analytics__feedback-copy">
                    <p className="analytics__feedback-title">
                      #{row.modelNumber} · {row.jobTitle}
                    </p>
                    <p className="analytics__feedback-meta">
                      {row.clientName}
                      {row.guestComment ? ` · “${row.guestComment}”` : ""}
                      {row.guestFeedbackAt
                        ? ` · ${formatFeedbackWhen(row.guestFeedbackAt)}`
                        : ""}
                    </p>
                  </div>
                  <span className="analytics__feedback-go">Open</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
