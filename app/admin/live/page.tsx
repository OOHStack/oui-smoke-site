"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import ActionErrorBanner from "@/components/admin/ActionErrorBanner";
import Countdown from "@/components/admin/Countdown";
import StatusBadge from "@/components/admin/StatusBadge";
import { RefillCollectActions } from "@/components/admin/RefillCollectActions";
import { readApiError } from "@/lib/api-error";
import { useSse } from "@/lib/hooks/useSse";
import { refillPayChip, unitPayChip } from "@/lib/ops/guest-pay";

type OutAssignment = {
  assignmentId: number;
  jobId: number;
  jobTitle: string;
  clientName: string;
  paymentModel?: string | null;
  guestPayTier?: "standard" | "unlimited" | null;
  unitPaymentStatus?: string | null;
  hookahModel: number;
  hookahLabel: string | null;
  flavourName: string | null;
  nextCheckAt: string | null;
  issueFlag: boolean;
};

type ServiceCall = {
  id: number;
  type: string;
  status: string;
  message: string | null;
  flavourLabel?: string | null;
  priceCents?: number | null;
  payPreference?: "phone" | "terminal" | null;
  paymentStatus?: string | null;
  checkoutUrl?: string | null;
  jobId: number;
  assignmentId: number;
  modelNumber: number;
  jobTitle: string;
  acknowledgedBy?: string | null;
};

function payChipClass(chip: string) {
  if (chip.startsWith("PAID") || chip === "INCLUDED" || chip === "UNIT PAID") {
    return "pay-chip--paid";
  }
  if (chip.includes("TERMINAL") || chip === "UNIT UNPAID") {
    return "pay-chip--terminal";
  }
  return "pay-chip--awaiting";
}

export default function LiveFloorPage() {
  const [items, setItems] = useState<OutAssignment[]>([]);
  const [calls, setCalls] = useState<ServiceCall[]>([]);
  const [terminalReady, setTerminalReady] = useState(true);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<number | null>(null);
  const [actionError, setActionError] = useState("");
  const retryRef = useRef<(() => void) | null>(null);

  function fail(message: string, retry?: () => void) {
    setActionError(message);
    retryRef.current = retry ?? null;
  }

  useSse<{
    items: OutAssignment[];
    calls: ServiceCall[];
    terminalReady?: boolean;
  }>("/api/stream/live", (data) => {
    setItems(data.items ?? []);
    setCalls(data.calls ?? []);
    if (typeof data.terminalReady === "boolean") {
      setTerminalReady(data.terminalReady);
    }
    setLoading(false);
  });

  async function action(
    jobId: number,
    assignmentId: number,
    actionName: "check" | "return",
  ) {
    setActing(assignmentId);
    setActionError("");
    try {
      const res = await fetch(`/api/jobs/${jobId}/hookahs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: actionName,
          assignmentId,
          ...(actionName === "return" ? { outcome: "returned" } : {}),
        }),
      });
      if (!res.ok) {
        fail(await readApiError(res), () =>
          void action(jobId, assignmentId, actionName),
        );
        return;
      }
      if (actionName === "return") {
        setItems((prev) => prev.filter((i) => i.assignmentId !== assignmentId));
        setCalls((prev) => prev.filter((c) => c.assignmentId !== assignmentId));
      }
    } finally {
      setActing(null);
    }
  }

  async function serviceAct(id: number, actionName: "acknowledge" | "resolve") {
    setActionError("");
    const res = await fetch(`/api/service-requests/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: actionName }),
    });
    if (!res.ok) {
      fail(await readApiError(res), () => void serviceAct(id, actionName));
      return;
    }
    if (actionName === "acknowledge") {
      const updated = (await res.json().catch(() => null)) as ServiceCall | null;
      setCalls((prev) =>
        prev.map((c) =>
          c.id === id
            ? {
                ...c,
                status: "acknowledged",
                acknowledgedBy: updated?.acknowledgedBy ?? c.acknowledgedBy,
              }
            : c,
        ),
      );
    } else {
      setCalls((prev) => prev.filter((c) => c.id !== id));
    }
  }

  async function deliverRefill(
    call: ServiceCall,
    collectChannel?: "cash" | "terminal" | "already_paid",
  ) {
    setActing(call.assignmentId);
    setActionError("");
    try {
      const res = await fetch(`/api/jobs/${call.jobId}/hookahs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "deliver_refill",
          assignmentId: call.assignmentId,
          serviceRequestId: call.id,
          source: "guest",
          flavourLabel: call.flavourLabel ?? undefined,
          priceCents: call.priceCents ?? undefined,
          ...(collectChannel ? { collectChannel } : {}),
        }),
      });
      if (!res.ok) {
        fail(await readApiError(res), () =>
          void deliverRefill(call, collectChannel),
        );
        return;
      }
      setCalls((prev) => prev.filter((c) => c.id !== call.id));
    } finally {
      setActing(null);
    }
  }

  async function pushRefillTerminal(call: ServiceCall) {
    setActing(call.assignmentId);
    setActionError("");
    try {
      const res = await fetch(`/api/jobs/${call.jobId}/hookahs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "push_refill_terminal",
          assignmentId: call.assignmentId,
          serviceRequestId: call.id,
          amountCents: call.priceCents ?? undefined,
          flavourLabel: call.flavourLabel ?? undefined,
        }),
      });
      if (!res.ok) {
        fail(await readApiError(res), () => void pushRefillTerminal(call));
        return;
      }
      setCalls((prev) =>
        prev.map((c) =>
          c.id === call.id
            ? { ...c, payPreference: "terminal", paymentStatus: "pending" }
            : c,
        ),
      );
    } finally {
      setActing(null);
    }
  }

  async function markCallDone(call: ServiceCall) {
    if (call.type === "refill") {
      await deliverRefill(call);
    } else {
      await serviceAct(call.id, "resolve");
    }
  }

  const callByAssignment = new Map(calls.map((c) => [c.assignmentId, c]));

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">Live Floor</h1>
          <p className="page-sub">
            Hookahs out + guest service calls · live updates
          </p>
        </div>
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
        <p className="terminal-ready-banner">
          Square Terminal not ready — pair a device in{" "}
          <Link href="/admin/settings">Settings → Square</Link> before pushing
          charges.
        </p>
      ) : null}

      {calls.length > 0 ? (
        <section className="panel" style={{ marginBottom: "0.75rem" }}>
          <h2 className="panel-title">Guest calls needing you</h2>
          <div className="live-grid">
            {calls.map((c) => (
              <div
                key={c.id}
                className={`job-card ${c.status === "open" ? "overdue" : ""}`}
              >
                <div className="job-card-head">
                  <div>
                    <span className="job-card-title">
                      #{c.modelNumber} · {c.type}
                    </span>
                    <div className="list-meta">
                      {c.jobTitle}
                      {c.message ? ` · ${c.message}` : ""}
                      {c.status === "acknowledged"
                        ? c.acknowledgedBy
                          ? ` · ${c.acknowledgedBy} on it`
                          : " · claimed"
                        : ""}
                    </div>
                    {c.type === "refill"
                      ? (() => {
                          const chip = refillPayChip({
                            priceCents: c.priceCents,
                            payPreference: c.payPreference,
                            paymentStatus: c.paymentStatus,
                          });
                          if (!chip) return null;
                          return (
                            <span className={`pay-chip ${payChipClass(chip)}`}>
                              {chip}
                              {c.priceCents != null && c.priceCents > 0
                                ? ` · $${(c.priceCents / 100).toFixed(0)}`
                                : ""}
                            </span>
                          );
                        })()
                      : null}
                  </div>
                </div>
                <div className="job-card-actions">
                  {c.status === "open" ? (
                    <button
                      type="button"
                      className="btn btn-sm btn-ok"
                      onClick={() => serviceAct(c.id, "acknowledge")}
                    >
                      I’m on it
                    </button>
                  ) : null}
                  {c.type === "refill" ? (
                    <RefillCollectActions
                      priceCents={c.priceCents}
                      paymentStatus={c.paymentStatus}
                      payPreference={c.payPreference}
                      checkoutUrl={c.checkoutUrl}
                      terminalReady={terminalReady}
                      busy={acting === c.assignmentId}
                      onPushTerminal={() => pushRefillTerminal(c)}
                      onDeliver={(channel) => deliverRefill(c, channel)}
                    />
                  ) : (
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() => markCallDone(c)}
                    >
                      Done
                    </button>
                  )}
                  <Link href={`/admin/jobs/${c.jobId}`} className="btn btn-sm btn-ghost">
                    Open job
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {loading ? (
        <p className="empty">Loading live floor…</p>
      ) : items.length === 0 ? (
        <p className="empty">No hookahs out right now.</p>
      ) : (
        <div className="live-grid">
          {items.map((item) => {
            const overdue =
              item.nextCheckAt &&
              new Date(item.nextCheckAt).getTime() < Date.now();
            const call = callByAssignment.get(item.assignmentId);
            const unitChip =
              item.paymentModel === "pay_at_event" && item.guestPayTier
                ? unitPayChip(item.unitPaymentStatus)
                : null;

            return (
              <div
                key={item.assignmentId}
                className={`job-card ${overdue || call?.status === "open" ? "overdue" : ""}`}
              >
                <div className="job-card-head">
                  <div>
                    <span className="job-card-title">
                      #{item.hookahModel}
                      {item.hookahLabel ? ` ${item.hookahLabel}` : ""}
                    </span>
                    <div className="list-meta">
                      <Link href={`/admin/jobs/${item.jobId}`}>
                        {item.jobTitle}
                      </Link>
                      {" · "}
                      {item.clientName}
                      {item.flavourName ? ` · ${item.flavourName}` : ""}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: "0.35rem", alignItems: "center", flexWrap: "wrap" }}>
                    <StatusBadge status="out" kind="assignment" />
                    {item.guestPayTier ? (
                      <span className={`tier-chip tier-chip--${item.guestPayTier}`}>
                        {item.guestPayTier}
                      </span>
                    ) : null}
                    {unitChip ? (
                      <span className={`pay-chip ${payChipClass(unitChip)}`}>
                        {unitChip}
                      </span>
                    ) : null}
                    {call ? (
                      <span className="hookah-chip hookah-chip--overdue">
                        {call.status === "acknowledged"
                          ? "On the way"
                          : call.type === "refill"
                            ? `Refill${call.flavourLabel ? `: ${call.flavourLabel}` : ""}`
                            : call.type}
                      </span>
                    ) : null}
                    {call?.type === "refill"
                      ? (() => {
                          const chip = refillPayChip({
                            priceCents: call.priceCents,
                            payPreference: call.payPreference,
                            paymentStatus: call.paymentStatus,
                          });
                          if (!chip) return null;
                          return (
                            <span className={`pay-chip ${payChipClass(chip)}`}>
                              {chip}
                            </span>
                          );
                        })()
                      : null}
                    {item.issueFlag ? (
                      <span className="issue-flag">ISSUE</span>
                    ) : null}
                  </div>
                </div>

                <div>
                  <span className="list-meta">Next check: </span>
                  <Countdown target={item.nextCheckAt} />
                </div>

                <div className="job-card-actions">
                  {call?.status === "open" ? (
                    <button
                      type="button"
                      className="btn btn-sm btn-ok"
                      onClick={() => serviceAct(call.id, "acknowledge")}
                    >
                      On the way
                    </button>
                  ) : null}
                  {call?.type === "refill" ? (
                    <RefillCollectActions
                      priceCents={call.priceCents}
                      paymentStatus={call.paymentStatus}
                      payPreference={call.payPreference}
                      checkoutUrl={call.checkoutUrl}
                      terminalReady={terminalReady}
                      busy={acting === item.assignmentId}
                      onPushTerminal={() => pushRefillTerminal(call)}
                      onDeliver={(channel) => deliverRefill(call, channel)}
                    />
                  ) : call ? (
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() => markCallDone(call)}
                    >
                      Done
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="btn btn-sm btn-ok"
                    disabled={acting === item.assignmentId}
                    onClick={() =>
                      action(item.jobId, item.assignmentId, "check")
                    }
                  >
                    Check
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm"
                    disabled={acting === item.assignmentId}
                    onClick={() =>
                      action(item.jobId, item.assignmentId, "return")
                    }
                  >
                    Return OK
                  </button>
                  <Link
                    href={`/admin/jobs/${item.jobId}`}
                    className="btn btn-sm btn-ghost"
                  >
                    Open job
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
