"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import ActionErrorBanner from "@/components/admin/ActionErrorBanner";
import FloorOrderModal from "@/components/admin/FloorOrderModal";
import { RefillCollectActions } from "@/components/admin/RefillCollectActions";
import { readApiError } from "@/lib/api-error";
import { useSse } from "@/lib/hooks/useSse";
import { refillPayChip } from "@/lib/ops/guest-pay";

type ServiceRequestRow = {
  id: number;
  type: string;
  message: string | null;
  status: string;
  flavourLabel?: string | null;
  priceCents?: number | null;
  payPreference?: "phone" | "terminal" | null;
  requestedGuestPayTier?: "standard" | "unlimited" | null;
  paymentStatus?: string | null;
  checkoutUrl?: string | null;
  createdAt: string;
  acknowledgedBy?: string | null;
  jobId: number;
  jobTitle: string;
  clientName: string;
  location: string | null;
  assignmentId: number | null;
  modelNumber: number | null;
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
  if (type === "order_unit") return "Floor order";
  if (type === "issue") return "Issue";
  return "Help";
}

function unitLabel(row: ServiceRequestRow) {
  if (row.modelNumber != null) return `#${row.modelNumber}`;
  return "Floor";
}

export default function ServiceAlerts() {
  const [requests, setRequests] = useState<ServiceRequestRow[]>([]);
  const [open, setOpen] = useState(false);
  const [terminalReady, setTerminalReady] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [actionError, setActionError] = useState("");
  const [fulfillId, setFulfillId] = useState<number | null>(null);
  const retryRef = useRef<(() => void) | null>(null);
  const knownOpen = useRef<Set<number>>(new Set());
  const knownPay = useRef<Map<number, string>>(new Map());
  const primed = useRef(false);

  function fail(message: string, retry?: () => void) {
    setActionError(message);
    retryRef.current = retry ?? null;
    setOpen(true);
  }

  const applyRows = useCallback((rows: ServiceRequestRow[]) => {
    if (primed.current) {
      for (const row of rows) {
        if (row.status === "open" && !knownOpen.current.has(row.id)) {
          playChime();
          if (
            typeof Notification !== "undefined" &&
            Notification.permission === "granted"
          ) {
            new Notification(
              row.type === "order_unit"
                ? `Floor order · ${row.jobTitle}`
                : `Service · ${unitLabel(row)}`,
              {
                body:
                  row.type === "order_unit"
                    ? `${typeLabel(row.type)}${
                        row.flavourLabel ? ` · ${row.flavourLabel}` : ""
                      } — assign a hookah`
                    : `${typeLabel(row.type)} — ${row.jobTitle}`,
                tag: `service-${row.id}`,
              },
            );
          }
          setOpen(true);
          if (row.type === "order_unit") {
            setFulfillId(row.id);
          }
        }
        const prevPay = knownPay.current.get(row.id);
        if (
          (row.type === "refill" || row.type === "order_unit") &&
          row.paymentStatus === "succeeded" &&
          prevPay !== "succeeded"
        ) {
          playChime();
          if (
            typeof Notification !== "undefined" &&
            Notification.permission === "granted"
          ) {
            const dollars =
              row.priceCents != null
                ? `$${(row.priceCents / 100).toFixed(0)}`
                : "Payment";
            new Notification(
              row.type === "order_unit"
                ? `Floor order paid · ${unitLabel(row)}`
                : `Refill paid · ${unitLabel(row)}`,
              {
                body:
                  row.type === "order_unit"
                    ? `${dollars} received — on Ready to send`
                    : `${dollars} received via Square — deliver when ready`,
                tag: `${row.type}-paid-${row.id}`,
              },
            );
          }
          setOpen(true);
          if (row.type === "order_unit") {
            setFulfillId(row.id);
          }
        }
      }
    }

    knownOpen.current = new Set(
      rows.filter((r) => r.status === "open").map((r) => r.id),
    );
    knownPay.current = new Map(
      rows
        .filter(
          (r) =>
            (r.type === "refill" || r.type === "order_unit") && r.paymentStatus,
        )
        .map((r) => [r.id, r.paymentStatus || ""]),
    );
    primed.current = true;
    setRequests(rows);
  }, []);

  useSse<{ requests: ServiceRequestRow[]; terminalReady?: boolean }>(
    "/api/stream/service-requests",
    (data) => {
      applyRows(data.requests ?? []);
      if (typeof data.terminalReady === "boolean") {
        setTerminalReady(data.terminalReady);
      }
    },
  );

  useEffect(() => {
    if (
      typeof Notification !== "undefined" &&
      Notification.permission === "default"
    ) {
      Notification.requestPermission();
    }
  }, []);

  async function acknowledge(id: number) {
    setActionError("");
    const res = await fetch(`/api/service-requests/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "acknowledge" }),
    });
    if (!res.ok) {
      fail(await readApiError(res), () => void acknowledge(id));
      return;
    }
    const updated = (await res.json().catch(() => null)) as ServiceRequestRow | null;
    setRequests((prev) =>
      prev.map((r) =>
        r.id === id
          ? {
              ...r,
              status: "acknowledged",
              acknowledgedBy: updated?.acknowledgedBy ?? r.acknowledgedBy,
            }
          : r,
      ),
    );
  }

  async function deliverRefill(
    row: ServiceRequestRow,
    collectChannel?: "cash" | "terminal" | "already_paid",
  ) {
    setBusyId(row.id);
    setActionError("");
    try {
      const res = await fetch(`/api/jobs/${row.jobId}/hookahs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "deliver_refill",
          assignmentId: row.assignmentId,
          serviceRequestId: row.id,
          source: "guest",
          flavourLabel: row.flavourLabel ?? undefined,
          priceCents: row.priceCents ?? undefined,
          ...(collectChannel ? { collectChannel } : {}),
        }),
      });
      if (!res.ok) {
        fail(await readApiError(res), () =>
          void deliverRefill(row, collectChannel),
        );
        return;
      }
      setRequests((prev) => prev.filter((r) => r.id !== row.id));
    } finally {
      setBusyId(null);
    }
  }

  async function pushRefillTerminal(row: ServiceRequestRow) {
    setBusyId(row.id);
    setActionError("");
    try {
      const res = await fetch(`/api/jobs/${row.jobId}/hookahs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "push_refill_terminal",
          assignmentId: row.assignmentId,
          serviceRequestId: row.id,
          amountCents: row.priceCents ?? undefined,
          flavourLabel: row.flavourLabel ?? undefined,
        }),
      });
      if (!res.ok) {
        fail(await readApiError(res), () => void pushRefillTerminal(row));
        return;
      }
      setRequests((prev) =>
        prev.map((r) =>
          r.id === row.id
            ? { ...r, payPreference: "terminal", paymentStatus: "pending" }
            : r,
        ),
      );
    } finally {
      setBusyId(null);
    }
  }

  async function markDone(row: ServiceRequestRow) {
    if (row.type === "refill") {
      await deliverRefill(row);
    } else if (row.type === "order_unit") {
      setFulfillId(row.id);
      setOpen(true);
    } else {
      setActionError("");
      const res = await fetch(`/api/service-requests/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "resolve" }),
      });
      if (!res.ok) {
        fail(await readApiError(res), () => void markDone(row));
        return;
      }
      setRequests((prev) => prev.filter((r) => r.id !== row.id));
    }
  }

  const openCount = requests.filter((r) => r.status === "open").length;
  const waiting = requests.length;
  const fulfillRow =
    fulfillId != null ? requests.find((r) => r.id === fulfillId) : undefined;

  if (waiting === 0 && !open && !fulfillRow) return null;

  return (
    <div className="service-alerts">
      <button
        type="button"
        className={`service-alerts__bell ${openCount > 0 ? "service-alerts__bell--hot" : ""}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        Calls
        {waiting > 0 ? (
          <span className="service-alerts__count">{waiting}</span>
        ) : null}
      </button>

      {open ? (
        <div className="service-alerts__panel">
          <div className="service-alerts__head">
            <strong>Guest service</strong>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setOpen(false)}
            >
              Close
            </button>
          </div>
          <ActionErrorBanner
            message={actionError}
            onRetry={
              retryRef.current
                ? () => {
                    const fn = retryRef.current;
                    setActionError("");
                    fn?.();
                  }
                : undefined
            }
            onDismiss={() => {
              setActionError("");
              retryRef.current = null;
            }}
          />
          {!terminalReady ? (
            <p
              className="terminal-ready-banner"
              style={{ margin: "0.5rem 0.75rem" }}
            >
              Terminal not ready —{" "}
              <Link href="/admin/settings">Settings → Square</Link>
            </p>
          ) : null}
          {requests.length === 0 ? (
            <p className="empty">No active calls.</p>
          ) : (
            <ul className="service-alerts__list">
              {requests.map((r) => (
                <li
                  key={r.id}
                  className={`service-alerts__item service-alerts__item--${r.status}`}
                >
                  <div>
                    <div className="service-alerts__title">
                      {unitLabel(r)} · {typeLabel(r.type)}
                      {r.type === "refill" && r.flavourLabel
                        ? `: ${r.flavourLabel}`
                        : ""}
                      {r.type === "order_unit"
                        ? `: ${
                            r.requestedGuestPayTier === "unlimited"
                              ? "Unlimited"
                              : r.requestedGuestPayTier === "standard"
                                ? "Standard"
                                : "Extra"
                          }${r.flavourLabel ? ` · ${r.flavourLabel}` : ""}`
                        : ""}
                      {r.status === "acknowledged"
                        ? r.acknowledgedBy
                          ? ` · ${r.acknowledgedBy} on it`
                          : " · claimed"
                        : ""}
                    </div>
                    {r.type === "refill" || r.type === "order_unit"
                      ? (() => {
                          const chip = refillPayChip({
                            priceCents: r.priceCents,
                            payPreference: r.payPreference,
                            paymentStatus: r.paymentStatus,
                          });
                          if (!chip) return null;
                          const tone =
                            chip.startsWith("PAID") || chip === "INCLUDED"
                              ? "paid"
                              : chip.includes("TERMINAL")
                                ? "terminal"
                                : "awaiting";
                          return (
                            <div
                              className={`pay-chip pay-chip--${tone}`}
                              style={{ marginTop: 4 }}
                            >
                              {chip}
                            </div>
                          );
                        })()
                      : null}
                    <div className="list-meta">
                      {r.jobTitle} · {r.clientName}
                      {r.type === "order_unit"
                        ? " · Assign, collect → QR + Ready to send"
                        : ""}
                      {r.message ? ` · ${r.message}` : ""}
                    </div>
                    <Link
                      href={`/admin/jobs/${r.jobId}`}
                      className="service-alerts__link"
                    >
                      Open job
                    </Link>
                  </div>
                  <div className="service-alerts__actions">
                    {r.status === "open" && r.type !== "order_unit" ? (
                      <button
                        type="button"
                        className="btn btn-sm btn-ok"
                        onClick={() => acknowledge(r.id)}
                      >
                        I’m on it
                      </button>
                    ) : null}
                    {r.type === "refill" ? (
                      <RefillCollectActions
                        priceCents={r.priceCents}
                        paymentStatus={r.paymentStatus}
                        payPreference={r.payPreference}
                        checkoutUrl={r.checkoutUrl}
                        terminalReady={terminalReady}
                        busy={busyId === r.id}
                        onPushTerminal={() => pushRefillTerminal(r)}
                        onDeliver={(channel) => deliverRefill(r, channel)}
                      />
                    ) : r.type === "order_unit" ? (
                      <button
                        type="button"
                        className="btn btn-sm btn-ok"
                        onClick={() => setFulfillId(r.id)}
                      >
                        Assign & collect
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-sm"
                        onClick={() => markDone(r)}
                      >
                        Done
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {fulfillRow && fulfillRow.type === "order_unit" ? (
        <FloorOrderModal
          row={fulfillRow}
          terminalReady={terminalReady}
          onClose={() => setFulfillId(null)}
          onDone={() => {
            setRequests((prev) => prev.filter((r) => r.id !== fulfillRow.id));
            setFulfillId(null);
          }}
          onError={(message, retry) => fail(message, retry)}
        />
      ) : null}
    </div>
  );
}
