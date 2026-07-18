"use client";

import { useEffect, useRef, useState } from "react";
import { readApiError } from "@/lib/api-error";

type FloorOrderRow = {
  id: number;
  jobId: number;
  jobTitle: string;
  clientName: string;
  message: string | null;
  flavourLabel?: string | null;
  priceCents?: number | null;
  requestedGuestPayTier?: "standard" | "unlimited" | null;
  paymentStatus?: string | null;
  assignmentId: number | null;
  modelNumber: number | null;
};

type Candidates = {
  staged: Array<{
    assignmentId: number;
    hookahId: number;
    modelNumber: number;
    label: string | null;
    flavourLabel: string | null;
  }>;
  available: Array<{
    hookahId: number;
    modelNumber: number;
    label: string | null;
  }>;
};

type Props = {
  row: FloorOrderRow;
  terminalReady: boolean;
  onClose: () => void;
  onDone: () => void;
  onError: (message: string, retry?: () => void) => void;
};

export default function FloorOrderModal({
  row,
  terminalReady,
  onClose,
  onDone,
  onError,
}: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [candidates, setCandidates] = useState<Candidates | null>(null);
  const [loadError, setLoadError] = useState("");
  const [pick, setPick] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const dollars =
    row.priceCents != null ? `$${(row.priceCents / 100).toFixed(0)}` : null;
  const tierLabel =
    row.requestedGuestPayTier === "unlimited"
      ? "Unlimited"
      : row.requestedGuestPayTier === "standard"
        ? "Standard"
        : "Hookah";

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadError("");
      const res = await fetch(`/api/service-requests/${row.id}`);
      if (!res.ok) {
        if (!cancelled) setLoadError(await readApiError(res));
        return;
      }
      const data = (await res.json()) as { candidates: Candidates };
      if (cancelled) return;
      setCandidates(data.candidates);
      const staged0 = data.candidates.staged[0];
      const avail0 = data.candidates.available[0];
      if (row.assignmentId != null) {
        setPick(`a:${row.assignmentId}`);
      } else if (staged0) {
        setPick(`a:${staged0.assignmentId}`);
      } else if (avail0) {
        setPick(`h:${avail0.hookahId}`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [row.id, row.assignmentId]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  function parsePick(): { assignmentId?: number; hookahId?: number } {
    if (pick.startsWith("a:")) {
      return { assignmentId: Number(pick.slice(2)) };
    }
    if (pick.startsWith("h:")) {
      return { hookahId: Number(pick.slice(2)) };
    }
    return {};
  }

  async function fulfill(payChannel: "cash" | "already_paid" | "terminal") {
    setBusy(true);
    try {
      const res = await fetch(`/api/service-requests/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "fulfill_floor_order",
          payChannel,
          ...parsePick(),
        }),
      });
      if (!res.ok) {
        onError(await readApiError(res), () => void fulfill(payChannel));
        return;
      }
      const data = (await res.json()) as { ready?: boolean };
      if (payChannel === "terminal" && !data.ready) {
        onClose();
        return;
      }
      onDone();
    } finally {
      setBusy(false);
    }
  }

  const waitingTerminal =
    row.paymentStatus === "pending" && row.assignmentId != null;
  const finishPaid =
    row.paymentStatus === "succeeded" && row.assignmentId != null;

  return (
    <div
      className="confirm-modal-backdrop"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="confirm-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="floor-order-title"
        tabIndex={-1}
        style={{ width: "min(100%, 28rem)" }}
      >
        <div className="confirm-modal__body">
          <h2 id="floor-order-title" className="confirm-modal__title">
            Floor order
          </h2>
          <p className="confirm-modal__message">
            {tierLabel}
            {row.flavourLabel ? ` · ${row.flavourLabel}` : ""}
            {dollars ? ` · ${dollars}` : ""}
            <br />
            {row.jobTitle} · {row.clientName}
            {row.message ? (
              <>
                <br />
                {row.message}
              </>
            ) : null}
          </p>

          {loadError ? (
            <p className="confirm-modal__message" style={{ color: "var(--danger)" }}>
              {loadError}
            </p>
          ) : null}

          {waitingTerminal ? (
            <p className="confirm-modal__message">
              Terminal checkout is open
              {row.modelNumber != null ? ` for #${row.modelNumber}` : ""}. When
              it clears, the guest QR shows on the event display and the unit
              lands on Ready to send.
            </p>
          ) : finishPaid ? (
            <p className="confirm-modal__message">
              Paid
              {row.modelNumber != null ? ` · #${row.modelNumber}` : ""}. Confirm
              to show the guest QR and park it on Ready to send.
            </p>
          ) : (
            <>
              <p className="confirm-modal__message">
                Assign a unit and collect — QR shows on the event display when
                paid; the unit stays on Ready to send so you can prep and walk
                it out.
              </p>
              <label className="field" style={{ display: "grid", gap: 6 }}>
                <span>Assign to hookah</span>
                <select
                  value={pick}
                  onChange={(e) => setPick(e.target.value)}
                  disabled={busy || !candidates}
                >
                  <option value="">Select a unit…</option>
                  {candidates?.staged.length ? (
                    <optgroup label="Staged on this job">
                      {candidates.staged.map((s) => (
                        <option key={`a-${s.assignmentId}`} value={`a:${s.assignmentId}`}>
                          #{s.modelNumber}
                          {s.flavourLabel ? ` · ${s.flavourLabel}` : ""}
                          {s.label ? ` · ${s.label}` : ""}
                        </option>
                      ))}
                    </optgroup>
                  ) : null}
                  {candidates?.available.length ? (
                    <optgroup label="Available fleet">
                      {candidates.available.map((h) => (
                        <option key={`h-${h.hookahId}`} value={`h:${h.hookahId}`}>
                          #{h.modelNumber}
                          {h.label ? ` · ${h.label}` : ""}
                        </option>
                      ))}
                    </optgroup>
                  ) : null}
                </select>
              </label>
              {candidates &&
              candidates.staged.length === 0 &&
              candidates.available.length === 0 ? (
                <p className="confirm-modal__message">
                  No free hookahs — stage a unit on the job or free one from the
                  fleet.
                </p>
              ) : null}
            </>
          )}
        </div>

        <div className="confirm-modal__footer">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={onClose}
            disabled={busy}
          >
            Later
          </button>
          {finishPaid ? (
            <button
              type="button"
              className="btn btn-ok"
              disabled={busy}
              onClick={() => void fulfill("already_paid")}
            >
              {busy ? "…" : "Ready to send"}
            </button>
          ) : waitingTerminal ? (
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={onClose}
            >
              Waiting on terminal
            </button>
          ) : (
            <>
              <button
                type="button"
                className="btn"
                disabled={busy || !pick}
                onClick={() => void fulfill("cash")}
              >
                {busy ? "…" : "Cash · QR"}
              </button>
              <button
                type="button"
                className="btn"
                disabled={busy || !pick}
                onClick={() => void fulfill("already_paid")}
              >
                Paid · QR
              </button>
              <button
                type="button"
                className="btn btn-ok"
                disabled={busy || !pick || !terminalReady}
                title={
                  terminalReady
                    ? "Push amount to Square Terminal"
                    : "Terminal not ready"
                }
                onClick={() => void fulfill("terminal")}
              >
                {busy ? "…" : "Terminal"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
