"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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

function formatMoney(cents: number) {
  const dollars = cents / 100;
  return Number.isInteger(dollars)
    ? `$${dollars}`
    : `$${dollars.toFixed(2)}`;
}

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

  const tierLabel =
    row.requestedGuestPayTier === "unlimited"
      ? "Unlimited"
      : row.requestedGuestPayTier === "standard"
        ? "Standard"
        : "Plan TBD";
  const flavour = (row.flavourLabel || "").trim() || "Flavour TBD";
  const priceLabel =
    row.priceCents != null && row.priceCents > 0
      ? `${formatMoney(row.priceCents)} + HST`
      : "Price TBD";

  const pickedSummary = useMemo(() => {
    if (!pick || !candidates) return null;
    if (pick.startsWith("a:")) {
      const id = Number(pick.slice(2));
      const s = candidates.staged.find((x) => x.assignmentId === id);
      if (!s) return null;
      return {
        modelNumber: s.modelNumber,
        source: "Ready to send" as const,
        detail: s.flavourLabel || s.label || null,
      };
    }
    if (pick.startsWith("h:")) {
      const id = Number(pick.slice(2));
      const h = candidates.available.find((x) => x.hookahId === id);
      if (!h) return null;
      return {
        modelNumber: h.modelNumber,
        source: "Fleet" as const,
        detail: h.label || null,
      };
    }
    return null;
  }, [pick, candidates]);

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
  const canCollect = Boolean(pick) && !busy && !waitingTerminal && !finishPaid;
  const noUnits =
    candidates &&
    candidates.staged.length === 0 &&
    candidates.available.length === 0;

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
        className="confirm-modal floor-order-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="floor-order-title"
        tabIndex={-1}
      >
        <div className="confirm-modal__body floor-order-modal__body">
          <div className="floor-order-modal__eyebrow">
            Floor tablet order
            <span>
              {row.jobTitle}
              {row.clientName ? ` · ${row.clientName}` : ""}
            </span>
          </div>
          <h2 id="floor-order-title" className="floor-order-modal__title">
            Guest ordered
          </h2>

          <div className="floor-order-summary" aria-label="Order details">
            <div className="floor-order-summary__cell">
              <span className="floor-order-summary__label">Plan</span>
              <strong
                className={`floor-order-summary__value floor-order-summary__value--tier floor-order-summary__value--${
                  row.requestedGuestPayTier || "unknown"
                }`}
              >
                {tierLabel}
              </strong>
            </div>
            <div className="floor-order-summary__cell floor-order-summary__cell--wide">
              <span className="floor-order-summary__label">Flavour</span>
              <strong className="floor-order-summary__value floor-order-summary__value--flavour">
                {flavour}
              </strong>
            </div>
            <div className="floor-order-summary__cell">
              <span className="floor-order-summary__label">Collect</span>
              <strong className="floor-order-summary__value floor-order-summary__value--price">
                {priceLabel}
              </strong>
            </div>
          </div>

          {row.message ? (
            <p className="floor-order-modal__note">“{row.message}”</p>
          ) : null}

          {loadError ? (
            <p className="floor-order-modal__error">{loadError}</p>
          ) : null}

          {waitingTerminal ? (
            <div className="floor-order-status floor-order-status--wait">
              <div className="floor-order-status__unit">
                {row.modelNumber != null ? `#${row.modelNumber}` : "Unit"}
              </div>
              <div>
                <strong>Waiting on Square Terminal</strong>
                <p>
                  Complete the charge on the device. When it clears, the guest QR
                  shows on the event display and this unit parks on Ready to send.
                </p>
              </div>
            </div>
          ) : finishPaid ? (
            <div className="floor-order-status floor-order-status--paid">
              <div className="floor-order-status__unit">
                {row.modelNumber != null ? `#${row.modelNumber}` : "Unit"}
              </div>
              <div>
                <strong>Paid — ready to finish</strong>
                <p>
                  Confirm to push the guest QR to the event display and keep the
                  unit on Ready to send for prep.
                </p>
              </div>
            </div>
          ) : (
            <>
              <section className="floor-order-step">
                <h3 className="floor-order-step__title">
                  <span className="floor-order-step__n">1</span>
                  Assign a hookah
                </h3>
                <p className="floor-order-step__hint">
                  Pick which physical unit this order becomes. Flavour above is
                  what the guest chose — set it on the unit when you prep.
                </p>
                <label className="floor-order-assign">
                  <span className="floor-order-assign__label">Unit</span>
                  <select
                    value={pick}
                    onChange={(e) => setPick(e.target.value)}
                    disabled={busy || !candidates}
                  >
                    <option value="">Select a unit…</option>
                    {candidates?.staged.length ? (
                      <optgroup label="Already on this job (Ready to send)">
                        {candidates.staged.map((s) => (
                          <option
                            key={`a-${s.assignmentId}`}
                            value={`a:${s.assignmentId}`}
                          >
                            #{s.modelNumber}
                            {s.flavourLabel ? ` · ${s.flavourLabel}` : ""}
                            {s.label ? ` · ${s.label}` : ""}
                          </option>
                        ))}
                      </optgroup>
                    ) : null}
                    {candidates?.available.length ? (
                      <optgroup label="Available in fleet">
                        {candidates.available.map((h) => (
                          <option
                            key={`h-${h.hookahId}`}
                            value={`h:${h.hookahId}`}
                          >
                            #{h.modelNumber}
                            {h.label ? ` · ${h.label}` : ""}
                          </option>
                        ))}
                      </optgroup>
                    ) : null}
                  </select>
                </label>
                {pickedSummary ? (
                  <p className="floor-order-assign__picked">
                    Assigning{" "}
                    <strong>#{pickedSummary.modelNumber}</strong>
                    <span>
                      {" "}
                      · {pickedSummary.source}
                      {pickedSummary.detail
                        ? ` · ${pickedSummary.detail}`
                        : ""}
                    </span>
                  </p>
                ) : null}
                {noUnits ? (
                  <p className="floor-order-modal__error">
                    No free hookahs — stage a unit on the job or free one from the
                    fleet, then reopen this order.
                  </p>
                ) : null}
              </section>

              <section className="floor-order-step">
                <h3 className="floor-order-step__title">
                  <span className="floor-order-step__n">2</span>
                  Collect {priceLabel}
                </h3>
                <p className="floor-order-step__hint">
                  Choose how you took payment. After collect, the guest QR goes to
                  the event display and the unit stays on Ready to send.
                </p>
                <div className="floor-order-pay">
                  <button
                    type="button"
                    className="floor-order-pay__btn"
                    disabled={!canCollect || noUnits}
                    onClick={() => void fulfill("cash")}
                  >
                    <strong>Cash</strong>
                    <span>Took cash at the table — then show guest QR</span>
                  </button>
                  <button
                    type="button"
                    className="floor-order-pay__btn"
                    disabled={!canCollect || noUnits}
                    onClick={() => void fulfill("already_paid")}
                  >
                    <strong>Already paid</strong>
                    <span>Phone link / Square already shows paid</span>
                  </button>
                  <button
                    type="button"
                    className="floor-order-pay__btn floor-order-pay__btn--primary"
                    disabled={!canCollect || noUnits || !terminalReady}
                    title={
                      terminalReady
                        ? `Push ${priceLabel} to Square Terminal`
                        : "Pair a Square Terminal in Settings → Square"
                    }
                    onClick={() => void fulfill("terminal")}
                  >
                    <strong>Square Terminal</strong>
                    <span>
                      {terminalReady
                        ? "Push charge to the paired Terminal"
                        : "Terminal not ready — pair in Settings"}
                    </span>
                  </button>
                </div>
              </section>
            </>
          )}
        </div>

        <div className="confirm-modal__footer floor-order-modal__footer">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={onClose}
            disabled={busy}
          >
            {waitingTerminal ? "Close" : "Later"}
          </button>
          {finishPaid ? (
            <button
              type="button"
              className="btn btn-ok"
              disabled={busy}
              onClick={() => void fulfill("already_paid")}
            >
              {busy ? "Working…" : "Show QR · Ready to send"}
            </button>
          ) : waitingTerminal ? (
            <button type="button" className="btn" disabled>
              Waiting on Terminal…
            </button>
          ) : busy ? (
            <span className="floor-order-modal__busy">Working…</span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
