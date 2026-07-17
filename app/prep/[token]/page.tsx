"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useSse } from "@/lib/hooks/useSse";
import { prepKindLabel, type PrepQueueSnapshot } from "@/lib/prep-queue";
import "./prep.css";

function playChime() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 520;
    gain.gain.value = 0.1;
    osc.start();
    osc.frequency.exponentialRampToValueAtTime(780, ctx.currentTime + 0.12);
    osc.stop(ctx.currentTime + 0.2);
    setTimeout(() => ctx.close(), 400);
  } catch {
    /* ignore */
  }
}

function ageLabel(iso: string, now: number) {
  const mins = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const h = Math.floor(mins / 60);
  return `${h}h ${mins % 60}m`;
}

export default function PrepKitchenPage() {
  const params = useParams();
  const token = params.token as string;
  const [data, setData] = useState<PrepQueueSnapshot | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  const knownIds = useRef<Set<string>>(new Set());
  const primed = useRef(false);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(t);
  }, []);

  useSse<PrepQueueSnapshot & { error?: string }>(
    token ? `/api/stream/prep/${encodeURIComponent(token)}` : null,
    (payload) => {
      if (payload.error) {
        setError("This prep link isn’t available.");
        setLoading(false);
        return;
      }

      const items = payload.items ?? [];
      if (primed.current) {
        for (const item of items) {
          if (!knownIds.current.has(item.id)) {
            playChime();
            break;
          }
        }
      }
      knownIds.current = new Set(items.map((i) => i.id));
      primed.current = true;
      setData(payload);
      setError("");
      setLoading(false);
    },
  );

  if (loading) {
    return (
      <div className="prep">
        <div className="prep__shell">
          <p className="prep__muted">Loading prep board…</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="prep">
        <div className="prep__shell">
          <p className="prep__error">{error || "Not found"}</p>
        </div>
      </div>
    );
  }

  const { items, tallies, counts } = data;

  return (
    <div className="prep">
      <div className="prep__shell">
        <header className="prep__head">
          <div>
            <p className="prep__kicker">Oui Smoke</p>
            <h1 className="prep__title">Prep board</h1>
            <p className="prep__muted">
              Pack heads for Ready-to-send · live as orders come in
            </p>
          </div>
          <div className="prep__counts" aria-live="polite">
            <strong>{counts.total}</strong>
            <span>in queue</span>
          </div>
        </header>

        <p className="prep__workflow">
          <strong>Workflow:</strong> Stage units → set flavour on the job → pack
          here → send out to the floor. Only flavoured orders appear. Refills
          and extra hookahs show when guests order.
        </p>

        {tallies.length > 0 ? (
          <section className="prep__tallies" aria-label="Flavour totals">
            {tallies.map((t) => (
              <div key={t.flavourName} className="prep__tally">
                <strong>{t.count}×</strong>
                <span>{t.flavourName}</span>
              </div>
            ))}
          </section>
        ) : null}

        {items.length === 0 ? (
          <div className="prep__empty">
            <p>You’re clear</p>
            <span>
              When staff stage a unit and set its flavour — or a guest orders a
              refill — it shows up here.
            </span>
          </div>
        ) : (
          <ul className="prep__list">
            {items.map((item) => (
              <li
                key={item.id}
                className={`prep__card prep__card--${item.kind}`}
              >
                <div className="prep__card-top">
                  <span className="prep__kind">{prepKindLabel(item.kind)}</span>
                  <span className="prep__age">
                    {ageLabel(item.createdAt, now)}
                  </span>
                </div>
                <h2 className="prep__flavour">{item.flavourName}</h2>
                {item.flavourComponents ? (
                  <p className="prep__recipe">{item.flavourComponents}</p>
                ) : null}
                <div className="prep__meta">
                  {item.modelNumber != null ? (
                    <span>#{item.modelNumber}</span>
                  ) : null}
                  {item.tier ? (
                    <span className="prep__tier">{item.tier}</span>
                  ) : null}
                  <span>{item.jobTitle}</span>
                  {item.location ? <span>{item.location}</span> : null}
                </div>
                {item.kind !== "new_unit" && item.paymentStatus ? (
                  <p className="prep__pay">
                    Pay · {item.paymentStatus}
                    {item.payPreference ? ` · ${item.payPreference}` : ""}
                  </p>
                ) : null}
                {item.kind === "order_unit" ? (
                  <p className="prep__hint">
                    Extra hookah — stage a free unit with this flavour, then
                    send out
                  </p>
                ) : item.kind === "new_unit" ? (
                  <p className="prep__hint">
                    Staged · pack this head, then staff send out
                  </p>
                ) : (
                  <p className="prep__hint">
                    Refill for floor unit
                    {item.modelNumber != null ? ` #${item.modelNumber}` : ""}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}

        <footer className="prep__foot">
          <span>
            {counts.newUnits} new · {counts.refills} refill · {counts.extras}{" "}
            extra
          </span>
          <span>Keep this page open</span>
        </footer>
      </div>
    </div>
  );
}
