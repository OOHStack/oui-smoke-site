"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSse } from "@/lib/hooks/useSse";

type ServiceRequestRow = {
  id: number;
  type: string;
  message: string | null;
  status: string;
  flavourLabel?: string | null;
  priceCents?: number | null;
  createdAt: string;
  jobId: number;
  jobTitle: string;
  clientName: string;
  location: string | null;
  assignmentId: number;
  modelNumber: number;
};

function playChime() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 660;
    gain.gain.value = 0.12;
    osc.start();
    osc.frequency.exponentialRampToValueAtTime(990, ctx.currentTime + 0.15);
    osc.stop(ctx.currentTime + 0.22);
    setTimeout(() => ctx.close(), 500);
  } catch {
    /* ignore */
  }
}

function typeLabel(type: string) {
  if (type === "coals") return "Coals";
  if (type === "refill") return "Refill";
  if (type === "issue") return "Issue";
  return "Help";
}

export default function ServiceAlerts() {
  const [requests, setRequests] = useState<ServiceRequestRow[]>([]);
  const [open, setOpen] = useState(false);
  const knownOpen = useRef<Set<number>>(new Set());
  const primed = useRef(false);

  const applyRows = useCallback((rows: ServiceRequestRow[]) => {
    if (primed.current) {
      for (const row of rows) {
        if (row.status === "open" && !knownOpen.current.has(row.id)) {
          playChime();
          if (typeof Notification !== "undefined" && Notification.permission === "granted") {
            new Notification(`Service · Hookah #${row.modelNumber}`, {
              body: `${typeLabel(row.type)} — ${row.jobTitle}`,
              tag: `service-${row.id}`,
            });
          }
          setOpen(true);
        }
      }
    }

    knownOpen.current = new Set(rows.filter((r) => r.status === "open").map((r) => r.id));
    primed.current = true;
    setRequests(rows);
  }, []);

  useSse<{ requests: ServiceRequestRow[] }>(
    "/api/stream/service-requests",
    (data) => applyRows(data.requests ?? []),
  );

  useEffect(() => {
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  async function acknowledge(id: number) {
    await fetch(`/api/service-requests/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "acknowledge" }),
    });
  }

  async function markDone(row: ServiceRequestRow) {
    if (row.type === "refill") {
      await fetch(`/api/jobs/${row.jobId}/hookahs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "deliver_refill",
          assignmentId: row.assignmentId,
          serviceRequestId: row.id,
          source: "guest",
          flavourLabel: row.flavourLabel ?? undefined,
          priceCents: row.priceCents ?? undefined,
        }),
      });
    } else {
      await fetch(`/api/service-requests/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "resolve" }),
      });
    }
  }

  const openCount = requests.filter((r) => r.status === "open").length;
  const waiting = requests.length;

  if (waiting === 0 && !open) return null;

  return (
    <div className="service-alerts">
      <button
        type="button"
        className={`service-alerts__bell ${openCount > 0 ? "service-alerts__bell--hot" : ""}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        Calls
        {waiting > 0 ? <span className="service-alerts__count">{waiting}</span> : null}
      </button>

      {open ? (
        <div className="service-alerts__panel">
          <div className="service-alerts__head">
            <strong>Guest service</strong>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>
              Close
            </button>
          </div>
          {requests.length === 0 ? (
            <p className="empty">No active calls.</p>
          ) : (
            <ul className="service-alerts__list">
              {requests.map((r) => (
                <li key={r.id} className={`service-alerts__item service-alerts__item--${r.status}`}>
                  <div>
                    <div className="service-alerts__title">
                      #{r.modelNumber} · {typeLabel(r.type)}
                      {r.type === "refill" && r.flavourLabel ? `: ${r.flavourLabel}` : ""}
                      {r.status === "acknowledged" ? " · on the way" : ""}
                    </div>
                    <div className="list-meta">
                      {r.jobTitle} · {r.clientName}
                      {r.message ? ` · ${r.message}` : ""}
                    </div>
                    <Link href={`/admin/jobs/${r.jobId}`} className="service-alerts__link">
                      Open job
                    </Link>
                  </div>
                  <div className="service-alerts__actions">
                    {r.status === "open" ? (
                      <button
                        type="button"
                        className="btn btn-sm btn-ok"
                        onClick={() => acknowledge(r.id)}
                      >
                        On the way
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() => markDone(r)}
                    >
                      {r.type === "refill" ? "Delivered · paid" : "Done"}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
