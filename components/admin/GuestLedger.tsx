"use client";

import Link from "next/link";
import {
  guestPayTierUnitCents,
  summarizeGuestLedger,
  type GuestPayTier,
} from "@/lib/ops/guest-pay";
import { formatCadCents } from "@/lib/job-balance";
import { resolveTipSplit } from "@/lib/ops/tip-split";
import TipSplitEditor from "@/components/admin/TipSplitEditor";

export type LedgerAssignment = {
  id: number;
  guestPayTier?: GuestPayTier | null;
  hookah: { modelNumber: number };
  status: string;
};

export type LedgerPayment = {
  id: number;
  kind: string;
  status: string;
  amountCents: number;
  jobHookahId: number | null;
  label?: string | null;
};

export default function GuestLedger({
  jobId,
  assignments,
  payments,
  tipCents,
  staffNames,
  tipSplitJson,
  onMarkPaid,
  onApplySuggestedActual,
  onSaveTipSplit,
  busyId,
  tipSplitBusy,
}: {
  jobId: string | number;
  assignments: LedgerAssignment[];
  payments: LedgerPayment[];
  tipCents: number;
  staffNames: string | null | undefined;
  tipSplitJson?: string | null;
  onMarkPaid: (
    assignmentId: number,
    channel: "manual" | "terminal",
  ) => void | Promise<void>;
  onApplySuggestedActual: (cents: number) => void;
  onSaveTipSplit: (json: string) => void | Promise<void>;
  busyId?: number | null;
  tipSplitBusy?: boolean;
}) {
  const summary = summarizeGuestLedger({
    assignments: assignments.map((a) => ({
      id: a.id,
      guestPayTier: a.guestPayTier,
    })),
    payments,
  });

  const tipShares = resolveTipSplit({ tipCents, staffNames, tipSplitJson });

  function unitPaid(assignmentId: number) {
    return payments.some(
      (p) =>
        p.jobHookahId === assignmentId &&
        p.kind === "onsite_unit" &&
        p.status === "succeeded",
    );
  }

  function unitPendingTerminal(assignmentId: number) {
    return payments.some(
      (p) =>
        p.jobHookahId === assignmentId &&
        p.kind === "onsite_unit" &&
        p.status === "pending",
    );
  }

  function unitRefillCents(assignmentId: number) {
    return payments
      .filter(
        (p) =>
          p.jobHookahId === assignmentId &&
          p.kind === "refill" &&
          p.status === "succeeded",
      )
      .reduce((sum, p) => sum + p.amountCents, 0);
  }

  return (
    <div className="guest-ledger">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: "0.75rem",
          alignItems: "baseline",
          flexWrap: "wrap",
        }}
      >
        <h3 className="guest-ledger__title">Guest ledger</h3>
        <Link href="/admin/playbook" className="list-meta">
          Night-of playbook
        </Link>
      </div>

      <table className="guest-ledger__table">
        <thead>
          <tr>
            <th>Unit</th>
            <th>Tier</th>
            <th>Unit $</th>
            <th>Refills</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {assignments.length === 0 ? (
            <tr>
              <td colSpan={5} className="list-meta">
                No units on this job yet.
              </td>
            </tr>
          ) : (
            assignments.map((a) => {
              const paid = unitPaid(a.id);
              const pending = unitPendingTerminal(a.id);
              const tier = a.guestPayTier;
              return (
                <tr key={a.id}>
                  <td>
                    #{a.hookah.modelNumber}
                    <span className="list-meta"> · {a.status}</span>
                  </td>
                  <td>
                    {tier ? (
                      <span className={`tier-chip tier-chip--${tier}`}>
                        {tier}
                      </span>
                    ) : (
                      <span className="list-meta">—</span>
                    )}
                  </td>
                  <td>
                    {tier
                      ? formatCadCents(guestPayTierUnitCents(tier))
                      : "—"}
                    {paid ? (
                      <span className="list-meta"> · paid</span>
                    ) : pending ? (
                      <span className="list-meta"> · terminal…</span>
                    ) : null}
                  </td>
                  <td>{formatCadCents(unitRefillCents(a.id))}</td>
                  <td>
                    {tier && !paid ? (
                      <div className="guest-ledger__actions">
                        <button
                          type="button"
                          className="btn btn-sm btn-ok"
                          disabled={busyId === a.id || pending}
                          onClick={() => onMarkPaid(a.id, "terminal")}
                        >
                          Terminal
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm"
                          disabled={busyId === a.id}
                          onClick={() => onMarkPaid(a.id, "manual")}
                        >
                          Mark paid
                        </button>
                      </div>
                    ) : null}
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>

      <div className="guest-ledger__totals">
        <div>
          Units charged {formatCadCents(summary.unitChargedCents)} · collected{" "}
          {formatCadCents(summary.unitCollectedCents)}
        </div>
        <div>Refills collected {formatCadCents(summary.refillCollectedCents)}</div>
        <div>Tips collected {formatCadCents(summary.tipCollectedCents)}</div>
        <div>
          <strong>
            Suggested actual {formatCadCents(summary.suggestedActualCents)}
          </strong>
        </div>
        <div className="guest-ledger__actions">
          <button
            type="button"
            className="btn btn-sm"
            disabled={summary.suggestedActualCents <= 0}
            onClick={() => onApplySuggestedActual(summary.suggestedActualCents)}
          >
            Apply to Actual ($)
          </button>
        </div>
      </div>

      <TipSplitEditor
        tipCents={tipCents}
        staffNames={staffNames}
        tipSplitJson={tipSplitJson}
        busy={tipSplitBusy}
        onSave={onSaveTipSplit}
      />

      {tipShares.length > 0 && tipCents > 0 ? (
        <div className="tip-split">
          Cash-out preview for job #{jobId}:
          <ul>
            {tipShares.map((s) => (
              <li key={s.name}>
                {s.name}
                {s.percent != null ? ` · ${s.percent}%` : ""} ·{" "}
                {formatCadCents(s.cents)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
