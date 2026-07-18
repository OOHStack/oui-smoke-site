"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useSse } from "@/lib/hooks/useSse";
import {
  prepKindLabel,
  type PrepItem,
  type PrepQueueSnapshot,
} from "@/lib/prep-queue";
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

function rebuildFromLists(
  prev: PrepQueueSnapshot,
  items: PrepItem[],
  packed: PrepItem[],
): PrepQueueSnapshot {
  const tallyMap = new Map<string, number>();
  for (const row of items) {
    tallyMap.set(row.flavourName, (tallyMap.get(row.flavourName) ?? 0) + 1);
  }
  const tallies = [...tallyMap.entries()]
    .map(([flavourName, count]) => ({ flavourName, count }))
    .sort(
      (a, b) =>
        b.count - a.count || a.flavourName.localeCompare(b.flavourName),
    );

  const packedTallyMap = new Map<string, number>();
  for (const row of packed) {
    packedTallyMap.set(
      row.flavourName,
      (packedTallyMap.get(row.flavourName) ?? 0) + 1,
    );
  }
  const packedTallies = [...packedTallyMap.entries()]
    .map(([flavourName, count]) => ({ flavourName, count }))
    .sort(
      (a, b) =>
        b.count - a.count || a.flavourName.localeCompare(b.flavourName),
    );

  const groupMap = new Map<string, PrepItem[]>();
  for (const row of packed) {
    const list = groupMap.get(row.flavourName) ?? [];
    list.push(row);
    groupMap.set(row.flavourName, list);
  }
  const packedByFlavour = [...groupMap.entries()]
    .map(([flavourName, groupItems]) => ({
      flavourName,
      flavourComponents: groupItems[0]?.flavourComponents ?? null,
      count: groupItems.length,
      items: [...groupItems].sort((a, b) => {
        const aT = a.packedAt ? new Date(a.packedAt).getTime() : 0;
        const bT = b.packedAt ? new Date(b.packedAt).getTime() : 0;
        return bT - aT;
      }),
    }))
    .sort(
      (a, b) =>
        b.count - a.count || a.flavourName.localeCompare(b.flavourName),
    );

  return {
    ...prev,
    jobId: prev.jobId,
    jobTitle: prev.jobTitle,
    clientName: prev.clientName,
    location: prev.location,
    items,
    tallies,
    packed,
    packedTallies,
    packedByFlavour,
    counts: {
      total: items.length,
      newUnits: items.filter((i) => i.kind === "new_unit").length,
      refills: items.filter((i) => i.kind === "refill").length,
      extras: items.filter((i) => i.kind === "order_unit").length,
      needsFlavour: 0,
      packed: packed.length,
    },
  };
}

function normalizeSnapshot(payload: PrepQueueSnapshot): PrepQueueSnapshot {
  const packed = payload.packed ?? [];
  const packedTallies = payload.packedTallies ?? [];
  const packedByFlavour = payload.packedByFlavour ?? [];
  return {
    ...payload,
    packed,
    packedTallies,
    packedByFlavour,
    counts: {
      ...payload.counts,
      packed: payload.counts?.packed ?? packed.length,
    },
  };
}

export default function PrepKitchenPage() {
  const params = useParams();
  const token = params.token as string;
  const [data, setData] = useState<PrepQueueSnapshot | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");
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

      const snap = normalizeSnapshot(payload);
      const items = snap.items ?? [];
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
      setData(snap);
      setError("");
      setLoading(false);
    },
  );

  async function markComplete(item: PrepItem) {
    if (!token || busyId) return;
    setBusyId(item.id);
    setActionError("");

    const packedAt = new Date().toISOString();
    setData((prev) => {
      if (!prev) return prev;
      const items = prev.items.filter((i) => i.id !== item.id);
      const packed = [
        { ...item, packedAt, status: item.status },
        ...prev.packed.filter((i) => i.id !== item.id),
      ];
      return rebuildFromLists(prev, items, packed);
    });
    knownIds.current.delete(item.id);

    try {
      const res = await fetch(`/api/prep/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "complete", id: item.id }),
      });
      const body = (await res.json().catch(() => ({}))) as PrepQueueSnapshot & {
        error?: string;
        ok?: boolean;
      };
      if (!res.ok) {
        setActionError(body.error || "Couldn’t mark complete");
        return;
      }
      if (body.items) {
        const snap = normalizeSnapshot(body);
        knownIds.current = new Set(snap.items.map((i) => i.id));
        setData(snap);
      }
    } catch {
      setActionError("Network error — try again");
    } finally {
      setBusyId(null);
    }
  }

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

  const { items, tallies, packedByFlavour, packedTallies, counts } = data;

  return (
    <div className="prep">
      <div className="prep__shell">
        <header className="prep__head">
          <div>
            <p className="prep__kicker">Oui Smoke · Prep</p>
            <h1 className="prep__title">{data.jobTitle || "Prep board"}</h1>
            <p className="prep__muted">
              {data.clientName}
              {data.location ? ` · ${data.location}` : ""}
            </p>
          </div>
          <div className="prep__counts" aria-live="polite">
            <strong>{counts.total}</strong>
            <span>to pack</span>
            {counts.packed > 0 ? (
              <span className="prep__counts-sub">{counts.packed} packed</span>
            ) : null}
          </div>
        </header>

        <p className="prep__workflow">
          <strong>Workflow:</strong> Stage units → set flavour on the job → pack
          here → mark Done → staff send out. Packed heads stay below by flavour
          for the night.
        </p>

        {actionError ? (
          <p className="prep__action-error" role="alert">
            {actionError}
          </p>
        ) : null}

        <section className="prep__section" aria-label="To pack">
          <div className="prep__section-head">
            <h2 className="prep__section-title">To pack</h2>
            <span className="prep__section-count">{counts.total}</span>
          </div>

          {tallies.length > 0 ? (
            <div className="prep__tallies" aria-label="Flavour totals to pack">
              {tallies.map((t) => (
                <div key={t.flavourName} className="prep__tally">
                  <strong>{t.count}×</strong>
                  <span>{t.flavourName}</span>
                </div>
              ))}
            </div>
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
                  <h3 className="prep__flavour">{item.flavourName}</h3>
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
                      Extra hookah — pack this flavour, then staff stage &amp;
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
                  <button
                    type="button"
                    className="prep__done"
                    disabled={busyId === item.id}
                    onClick={() => void markComplete(item)}
                  >
                    {busyId === item.id ? "Saving…" : "Done · flavour packed"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="prep__section prep__section--packed" aria-label="Packed">
          <div className="prep__section-head">
            <h2 className="prep__section-title">Packed</h2>
            <span className="prep__section-count">{counts.packed}</span>
          </div>

          {packedTallies.length > 0 ? (
            <div className="prep__tallies prep__tallies--packed" aria-label="Packed by flavour">
              {packedTallies.map((t) => (
                <div key={t.flavourName} className="prep__tally prep__tally--packed">
                  <strong>{t.count}×</strong>
                  <span>{t.flavourName}</span>
                </div>
              ))}
            </div>
          ) : null}

          {packedByFlavour.length === 0 ? (
            <p className="prep__packed-empty">
              Packed flavours show here by count for the night.
            </p>
          ) : (
            <ul className="prep__packed-groups">
              {packedByFlavour.map((group) => (
                <li key={group.flavourName} className="prep__packed-group">
                  <div className="prep__packed-group-head">
                    <h3 className="prep__packed-flavour">
                      <strong>{group.count}×</strong> {group.flavourName}
                    </h3>
                    {group.flavourComponents ? (
                      <p className="prep__recipe">{group.flavourComponents}</p>
                    ) : null}
                  </div>
                  <ul className="prep__packed-items">
                    {group.items.map((item) => (
                      <li key={item.id} className="prep__packed-item">
                        <span className="prep__packed-kind">
                          {prepKindLabel(item.kind)}
                        </span>
                        {item.modelNumber != null ? (
                          <span>#{item.modelNumber}</span>
                        ) : null}
                        <span className="prep__packed-job">{item.jobTitle}</span>
                        <span className="prep__age">
                          {item.packedAt
                            ? ageLabel(item.packedAt, now)
                            : ageLabel(item.createdAt, now)}
                        </span>
                        {item.status === "out" ? (
                          <span className="prep__packed-status">On floor</span>
                        ) : item.status === "resolved" ? (
                          <span className="prep__packed-status">Delivered</span>
                        ) : item.status === "staged" ? (
                          <span className="prep__packed-status prep__packed-status--wait">
                            Ready to send
                          </span>
                        ) : (
                          <span className="prep__packed-status prep__packed-status--wait">
                            Awaiting floor
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </section>

        <footer className="prep__foot">
          <span>
            {counts.newUnits} new · {counts.refills} refill · {counts.extras}{" "}
            extra · {counts.packed} packed
          </span>
          <span>Keep this page open</span>
        </footer>
      </div>
    </div>
  );
}
