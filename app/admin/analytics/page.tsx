"use client";

import { useCallback, useEffect, useState } from "react";

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
};

function formatMoney(cents: number) {
  return `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function formatSeconds(sec: number | null | undefined) {
  if (sec == null || Number.isNaN(sec)) return "—";
  if (sec < 60) return `${Math.round(sec)}s`;
  return `${(sec / 60).toFixed(1)}m`;
}

export default function AnalyticsPage() {
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/analytics");
    if (res.ok) {
      setData(await res.json());
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <p className="empty">Loading analytics…</p>;
  if (!data) return <p className="login-error">Failed to load analytics.</p>;

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">Analytics</h1>
          <p className="page-sub">Performance and fleet metrics</p>
        </div>
        <button type="button" className="btn" onClick={load}>
          Refresh
        </button>
      </div>

      <div className="analytics-grid" style={{ marginBottom: "0.75rem" }}>
        <div className="metric-card">
          <div className="metric-label">Revenue</div>
          <div className="metric-value">{formatMoney(data.totalRevenueCents)}</div>
          <div className="list-meta" style={{ marginTop: "0.25rem" }}>
            Jobs {formatMoney(data.jobRevenueCents ?? 0)} · Refills{" "}
            {formatMoney(data.refillRevenueCents ?? 0)}
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Refill revenue</div>
          <div className="metric-value">
            {formatMoney(data.refillRevenueCents ?? 0)}
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Tips</div>
          <div className="metric-value">{formatMoney(data.totalTipsCents)}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Avg rating</div>
          <div className="metric-value">
            {data.avgRating != null ? data.avgRating.toFixed(1) : "—"}
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Check compliance</div>
          <div className="metric-value">{data.checkCompliance}%</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Currently out</div>
          <div className="metric-value warn">{data.currentlyOut}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Overdue checks</div>
          <div className="metric-value accent">{data.overdueChecks}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Completed (30d)</div>
          <div className="metric-value">{data.jobsCompleted30d}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Incidents (30d)</div>
          <div className="metric-value">{data.incidents30d}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Repeat clients</div>
          <div className="metric-value">{data.repeatClients}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Avg hookahs / job</div>
          <div className="metric-value">
            {data.avgHookahsPerJob.toFixed(1)}
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Avg ack time (30d)</div>
          <div className="metric-value">{formatSeconds(data.avgAckSeconds)}</div>
          <div className="list-meta" style={{ marginTop: "0.25rem" }}>
            {data.responseSampleCount ?? 0} guest calls
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Avg resolve time (30d)</div>
          <div className="metric-value">{formatSeconds(data.avgResolveSeconds)}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">UGC approved</div>
          <div className="metric-value">
            {data.ugcApproved ?? 0}
            <span className="list-meta"> / {data.ugcTotal ?? 0}</span>
          </div>
          <div className="list-meta" style={{ marginTop: "0.25rem" }}>
            {data.ugcFeatured ?? 0} featured
          </div>
        </div>
      </div>

      <div className="grid-2">
        <section className="panel">
          <h2 className="panel-title">Jobs by status</h2>
          <ul className="list">
            {Object.entries(data.jobsByStatus).map(([status, count]) => (
              <li key={status} className="list-item">
                <span>{status}</span>
                <strong>{count}</strong>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel">
          <h2 className="panel-title">Fleet utilization</h2>
          <ul className="list">
            {Object.entries(data.fleet).map(([status, count]) => (
              <li key={status} className="list-item">
                <span>{status}</span>
                <strong>{count}</strong>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="panel" style={{ marginTop: "0.75rem" }}>
        <h2 className="panel-title">Top flavours</h2>
        {data.topFlavours.length === 0 ? (
          <p className="empty">No flavour data yet.</p>
        ) : (
          <ul className="list">
            {data.topFlavours.map((f) => (
              <li key={f.name} className="list-item">
                <span>{f.name}</span>
                <strong>{f.timesUsed}</strong>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
