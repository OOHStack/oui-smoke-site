"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useSse } from "@/lib/hooks/useSse";
import NightGallery from "@/components/NightGallery";
import "./client.css";

type PortalPayload = {
  job: {
    title: string;
    clientName: string;
    location: string | null;
    status: string;
    startsAt: string | null;
    endsAt: string | null;
    guestCount: number | null;
  };
  counts: {
    total: number;
    out: number;
    staged: number;
    returned: number;
    openCalls: number;
  };
  floor: Array<{
    modelNumber: number;
    flavour: string;
    sentOutAt: string | null;
    refillCount: number;
  }>;
  calls: Array<{
    id: number;
    type: string;
    status: string;
    modelNumber: number;
    flavourLabel: string | null;
    createdAt: string;
    acknowledgedAt: string | null;
  }>;
  refillSpendCents: number;
  refillCount: number;
  photos?: Array<{ id: number; url: string; createdAt?: string }>;
  wrapped: boolean;
  serverTime: string;
  error?: string;
};

function money(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function callLabel(type: string) {
  if (type === "coals") return "Fresh coals";
  if (type === "refill") return "Flavour refill";
  if (type === "issue") return "Issue";
  return "Help";
}

export default function ClientPortalPage() {
  const params = useParams();
  const token = params.token as string;
  const [data, setData] = useState<PortalPayload | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/client/${encodeURIComponent(token)}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        setError("This event portal isn’t available.");
        setLoading(false);
        return;
      }
      setData(await res.json());
      setError("");
      setLoading(false);
    } catch {
      setError("Couldn’t reach Oui Smoke. Check your connection.");
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  useSse<PortalPayload>(
    token ? `/api/stream/client/${encodeURIComponent(token)}` : null,
    (json) => {
      if (json.error === "not_found") {
        setError("This event portal isn’t available.");
        setLoading(false);
        return;
      }
      setData(json);
      setError("");
      setLoading(false);
    },
  );

  if (loading) {
    return (
      <div className="client">
        <div className="client__shell">
          <p className="client__muted">Loading your event…</p>
        </div>
      </div>
    );
  }

  if (!data || error) {
    return (
      <div className="client">
        <div className="client__shell">
          <p className="client__error">{error || "Not found"}</p>
        </div>
      </div>
    );
  }

  const { job, counts, floor, calls } = data;

  return (
    <div className="client">
      <div className="client__shell">
        <header className="client__brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo-white.png"
            alt="Oui Smoke"
            className="client__logo"
            width={200}
            height={54}
          />
          <p className="client__kicker">Event portal · live</p>
        </header>

        <section className="client__hero">
          <h1 className="client__title">{job.title}</h1>
          <p className="client__lede">
            {job.clientName}
            {job.location ? ` · ${job.location}` : ""}
          </p>
          <p className="client__status">Status: {job.status}</p>
        </section>

        <section className="client__metrics" aria-label="Floor snapshot">
          <div className="client__metric">
            <span className="client__metric-value">{counts.out}</span>
            <span className="client__metric-label">On floor</span>
          </div>
          <div className="client__metric">
            <span className="client__metric-value">{counts.openCalls}</span>
            <span className="client__metric-label">Guest calls</span>
          </div>
          <div className="client__metric">
            <span className="client__metric-value">{money(data.refillSpendCents)}</span>
            <span className="client__metric-label">Refill spend</span>
          </div>
          <div className="client__metric">
            <span className="client__metric-value">{counts.returned}</span>
            <span className="client__metric-label">Returned</span>
          </div>
        </section>

        {data.wrapped ? (
          <section className="client__panel">
            <h2>Event wrapped</h2>
            <p>
              {counts.total} hookah{counts.total === 1 ? "" : "s"} · {data.refillCount} refill
              {data.refillCount === 1 ? "" : "s"} · {money(data.refillSpendCents)} refill revenue
            </p>
            <p className="client__muted">Thanks for hosting with Oui Smoke.</p>
          </section>
        ) : null}

        {data.photos && data.photos.length > 0 ? (
          <NightGallery
            photos={data.photos}
            title={data.wrapped ? "Event gallery" : "Guest photos"}
            subtitle={
              data.wrapped
                ? "Moments guests shared during your Oui Smoke event"
                : "Live photos from the floor — swipe to browse"
            }
          />
        ) : null}

        <section className="client__panel">
          <h2>On the floor</h2>
          {floor.length === 0 ? (
            <p className="client__muted">No hookahs out right now.</p>
          ) : (
            <ul className="client__list">
              {floor.map((row) => (
                <li key={row.modelNumber}>
                  <strong>#{row.modelNumber}</strong>
                  <span>{row.flavour}</span>
                  {row.refillCount > 0 ? (
                    <span className="client__chip">{row.refillCount} refill</span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="client__panel">
          <h2>Open guest calls</h2>
          {calls.length === 0 ? (
            <p className="client__muted">All clear — no open guest requests.</p>
          ) : (
            <ul className="client__list">
              {calls.map((c) => (
                <li key={c.id}>
                  <strong>#{c.modelNumber}</strong>
                  <span>
                    {callLabel(c.type)}
                    {c.flavourLabel ? ` · ${c.flavourLabel}` : ""}
                  </span>
                  <span className="client__chip">
                    {c.status === "acknowledged" ? "On the way" : "Received"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <footer className="client__foot">
          <p>Live view for hosts — updates automatically.</p>
          <p className="client__muted">Oui Smoke · Toronto &amp; GTA</p>
        </footer>
      </div>
    </div>
  );
}
