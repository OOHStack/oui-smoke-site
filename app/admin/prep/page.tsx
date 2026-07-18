"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { prepKindLabel, type PrepQueueSnapshot } from "@/lib/prep-queue";

export default function AdminPrepPage() {
  const [url, setUrl] = useState("");
  const [queue, setQueue] = useState<PrepQueueSnapshot | null>(null);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const loadLink = useCallback(async () => {
    const res = await fetch("/api/prep/link", { cache: "no-store" });
    if (!res.ok) {
      setError("Couldn’t load prep link");
      return;
    }
    const data = await res.json();
    setUrl(data.url ?? "");
    if (data.queue) setQueue(data.queue);
  }, []);

  useEffect(() => {
    void loadLink();
    const t = setInterval(() => void loadLink(), 4000);
    return () => clearInterval(t);
  }, [loadLink]);

  async function copyLink() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setMsg("Prep link copied — open it on the kitchen tablet.");
    } catch {
      setMsg(url);
    }
  }

  async function rotateLink() {
    if (
      !window.confirm(
        "Rotate the prep link? The old kitchen URL will stop working.",
      )
    ) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/prep/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "rotate" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Couldn’t rotate link");
        return;
      }
      setUrl(data.url ?? "");
      setMsg("New prep link ready — copy it to the kitchen tablet.");
    } finally {
      setBusy(false);
    }
  }

  const items = queue?.items ?? [];
  const tallies = queue?.tallies ?? [];
  const packedTallies = queue?.packedTallies ?? [];
  const packedByFlavour = queue?.packedByFlavour ?? [];
  const counts = queue?.counts;

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">Prep kitchen</h1>
          <p className="page-sub">
            Kitchen board for packing heads. Stage a unit and set its flavour on
            the job — it lands here before send-out. Refills and extra hookahs
            appear when guests order.
          </p>
        </div>
        <div className="page-head-actions">
          {url ? (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-primary btn-sm"
            >
              Open prep board
            </a>
          ) : null}
        </div>
      </div>

      {error ? <p className="login-error">{error}</p> : null}
      {msg ? <p className="collect-toast">{msg}</p> : null}

      <section className="panel">
        <h2 className="panel-title">Dedicated link</h2>
        <p className="list-meta" style={{ marginTop: 0 }}>
          No admin login needed on the kitchen tablet. Bookmark this URL and
          keep it open — it chimes when something new lands in the queue.
        </p>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "0.5rem",
            alignItems: "center",
            marginTop: "0.75rem",
          }}
        >
          <code
            style={{
              flex: "1 1 220px",
              padding: "0.55rem 0.7rem",
              background: "color-mix(in srgb, var(--panel) 70%, var(--line))",
              borderRadius: 8,
              fontSize: "0.85rem",
              wordBreak: "break-all",
            }}
          >
            {url || "Creating link…"}
          </code>
          <button
            type="button"
            className="btn btn-ok btn-sm"
            disabled={!url || busy}
            onClick={() => void copyLink()}
          >
            Copy link
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={busy}
            onClick={() => void rotateLink()}
          >
            Rotate link
          </button>
        </div>
      </section>

      <section className="panel" style={{ marginTop: "1rem" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: "0.75rem",
            alignItems: "baseline",
          }}
        >
          <h2 className="panel-title" style={{ margin: 0 }}>
            Queue preview
          </h2>
          <span className="list-meta">
            {counts
              ? `${counts.total} to pack · ${counts.packed ?? 0} packed · ${counts.newUnits} new · ${counts.refills} refill · ${counts.extras} extra`
              : "Loading…"}
          </span>
        </div>

        {tallies.length > 0 ? (
          <p className="list-meta" style={{ marginTop: "0.65rem" }}>
            To pack:{" "}
            {tallies.map((t) => `${t.count}× ${t.flavourName}`).join(" · ")}
          </p>
        ) : null}

        {items.length === 0 ? (
          <p className="empty" style={{ marginTop: "0.75rem" }}>
            Nothing to pack — stage a unit and set its flavour to feed this
            board.
          </p>
        ) : (
          <ul className="collect-ledger" style={{ marginTop: "0.75rem" }}>
            {items.map((item) => (
              <li key={item.id} className="collect-ledger__row">
                <div className="collect-ledger__main">
                  <span className="collect-badge collect-badge--wait">
                    {prepKindLabel(item.kind)}
                  </span>
                  <strong>{item.flavourName}</strong>
                  {item.modelNumber != null ? (
                    <span className="collect-ledger__kind">
                      #{item.modelNumber}
                    </span>
                  ) : null}
                </div>
                <div className="collect-ledger__meta">
                  {item.jobTitle}
                  {item.flavourComponents
                    ? ` · ${item.flavourComponents}`
                    : ""}
                  {" · "}
                  <Link href={`/admin/jobs/${item.jobId}`}>Open job</Link>
                </div>
              </li>
            ))}
          </ul>
        )}

        <h3 className="panel-title" style={{ marginTop: "1.25rem" }}>
          Packed by flavour
        </h3>
        {packedTallies.length > 0 ? (
          <p className="list-meta" style={{ marginTop: "0.45rem" }}>
            {packedTallies
              .map((t) => `${t.count}× ${t.flavourName}`)
              .join(" · ")}
          </p>
        ) : (
          <p className="empty" style={{ marginTop: "0.45rem" }}>
            Nothing packed yet tonight.
          </p>
        )}
        {packedByFlavour.length > 0 ? (
          <ul className="collect-ledger" style={{ marginTop: "0.75rem" }}>
            {packedByFlavour.map((group) => (
              <li key={group.flavourName} className="collect-ledger__row">
                <div className="collect-ledger__main">
                  <span className="collect-badge collect-badge--ok">
                    {group.count}×
                  </span>
                  <strong>{group.flavourName}</strong>
                </div>
                <div className="collect-ledger__meta">
                  {group.items
                    .map((item) =>
                      [
                        prepKindLabel(item.kind),
                        item.modelNumber != null ? `#${item.modelNumber}` : null,
                        item.status === "out"
                          ? "on floor"
                          : item.status === "staged"
                            ? "ready to send"
                            : item.status === "resolved"
                              ? "delivered"
                              : "awaiting floor",
                      ]
                        .filter(Boolean)
                        .join(" "),
                    )
                    .join(" · ")}
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </div>
  );
}
