"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  guestPayTierUnitChargeCents,
  summarizeGuestLedger,
  type GuestPayTier,
} from "@/lib/ops/guest-pay";
import { DEFAULT_PRICING, type PricingConfig } from "@/lib/pricing";
import { formatCadCents } from "@/lib/job-balance";
import TipSplitEditor from "@/components/admin/TipSplitEditor";

export type LedgerAssignment = {
  id: number;
  guestPayTier?: GuestPayTier | null;
  hookah: { modelNumber: number };
  status: string;
  sentOutAt?: string | null;
  sortOrder?: number | null;
};

export type LedgerPayment = {
  id: number;
  kind: string;
  status: string;
  amountCents: number;
  jobHookahId: number | null;
  label?: string | null;
};

type FilterId = "open" | "paid" | "no_tier" | "all" | "standard" | "unlimited";

const COLLAPSED_ROWS = 5;

function paidIds(payments: LedgerPayment[]) {
  return new Set(
    payments
      .filter((p) => p.kind === "onsite_unit" && p.status === "succeeded")
      .map((p) => p.jobHookahId)
      .filter((id): id is number => id != null),
  );
}

function pendingIds(payments: LedgerPayment[]) {
  return new Set(
    payments
      .filter((p) => p.kind === "onsite_unit" && p.status === "pending")
      .map((p) => p.jobHookahId)
      .filter((id): id is number => id != null),
  );
}

function refillCentsByAssignment(payments: LedgerPayment[]) {
  const map = new Map<number, number>();
  for (const p of payments) {
    if (p.kind !== "refill" || p.status !== "succeeded" || p.jobHookahId == null) {
      continue;
    }
    map.set(p.jobHookahId, (map.get(p.jobHookahId) ?? 0) + p.amountCents);
  }
  return map;
}

function statusRank(status: string) {
  if (status === "out") return 0;
  if (status === "staged") return 1;
  if (status === "returned") return 2;
  return 3;
}

function compareBySendOut(a: LedgerAssignment, b: LedgerAssignment) {
  const rank = statusRank(a.status) - statusRank(b.status);
  if (rank !== 0) return rank;

  const aOut = a.sentOutAt ? new Date(a.sentOutAt).getTime() : NaN;
  const bOut = b.sentOutAt ? new Date(b.sentOutAt).getTime() : NaN;
  const aHas = Number.isFinite(aOut);
  const bHas = Number.isFinite(bOut);
  if (aHas && bHas && aOut !== bOut) return aOut - bOut;
  if (aHas !== bHas) return aHas ? -1 : 1;

  const aSort = a.sortOrder ?? Number.MAX_SAFE_INTEGER;
  const bSort = b.sortOrder ?? Number.MAX_SAFE_INTEGER;
  if (aSort !== bSort) return aSort - bSort;

  return a.hookah.modelNumber - b.hookah.modelNumber;
}

export default function GuestLedger({
  assignments,
  payments,
  tipCents,
  staffNames,
  tipSplitJson,
  onMarkPaid,
  onApplySuggestedActual,
  onSaveTipSplit,
  onCollectTip,
  tipCollectBusy = false,
  busyId,
  tipSplitBusy,
  canEditTips = true,
  pricing = DEFAULT_PRICING,
  terminalReady = true,
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
  onCollectTip?: (
    amountDollars: string,
    channel: "terminal" | "manual",
  ) => boolean | Promise<boolean>;
  tipCollectBusy?: boolean;
  busyId?: number | null;
  tipSplitBusy?: boolean;
  canEditTips?: boolean;
  pricing?: PricingConfig;
  terminalReady?: boolean;
}) {
  const summary = summarizeGuestLedger({
    assignments: assignments.map((a) => ({
      id: a.id,
      guestPayTier: a.guestPayTier,
    })),
    payments,
    pricing,
  });

  const paid = useMemo(() => paidIds(payments), [payments]);
  const pending = useMemo(() => pendingIds(payments), [payments]);
  const refills = useMemo(() => refillCentsByAssignment(payments), [payments]);

  const openCount = assignments.filter(
    (a) => a.guestPayTier && !paid.has(a.id),
  ).length;
  const paidCount = assignments.filter((a) => paid.has(a.id)).length;
  const noTierCount = assignments.filter((a) => !a.guestPayTier).length;

  const [filter, setFilter] = useState<FilterId>("open");
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [tipsOpen, setTipsOpen] = useState(false);
  const [tipDollars, setTipDollars] = useState("");
  const [filterTouched, setFilterTouched] = useState(false);

  useEffect(() => {
    if (filterTouched) return;
    setFilter(openCount > 0 ? "open" : "all");
  }, [openCount, filterTouched]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return assignments
      .filter((a) => {
        const isPaid = paid.has(a.id);
        const isPending = pending.has(a.id);
        const tier = a.guestPayTier;

        if (filter === "open" && !(tier && !isPaid)) return false;
        if (filter === "paid" && !isPaid) return false;
        if (filter === "no_tier" && tier) return false;
        if (filter === "standard" && tier !== "standard") return false;
        if (filter === "unlimited" && tier !== "unlimited") return false;

        if (!q) return true;
        const hay = [
          String(a.hookah.modelNumber),
          `#${a.hookah.modelNumber}`,
          a.status,
          tier ?? "no tier",
          isPaid ? "paid" : "",
          isPending ? "terminal pending" : "",
        ]
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      })
      .sort(compareBySendOut);
  }, [assignments, paid, pending, filter, query]);

  const visible = expanded ? filtered : filtered.slice(0, COLLAPSED_ROWS);
  const hiddenCount = Math.max(0, filtered.length - visible.length);

  const filters: { id: FilterId; label: string; count?: number }[] = [
    { id: "open", label: "Needs pay", count: openCount },
    { id: "paid", label: "Paid", count: paidCount },
    { id: "no_tier", label: "No tier", count: noTierCount },
    { id: "standard", label: "Standard" },
    { id: "unlimited", label: "Unlimited" },
    { id: "all", label: "All", count: assignments.length },
  ];

  return (
    <div className="guest-ledger">
      <div className="guest-ledger__head">
        <div className="guest-ledger__head-main">
          <h3 className="guest-ledger__title">Guest ledger</h3>
          <Link href="/admin/playbook" className="list-meta">
            Playbook
          </Link>
        </div>
        <div className="guest-ledger__summary" aria-label="Ledger summary">
          <span>
            <em>Open</em>
            <strong>{openCount}</strong>
          </span>
          <span>
            <em>In</em>
            <strong>
              {formatCadCents(
                summary.unitCollectedCents + summary.refillCollectedCents,
              )}
            </strong>
          </span>
          <span>
            <em>Suggest</em>
            <strong>{formatCadCents(summary.suggestedActualCents)}</strong>
          </span>
          <button
            type="button"
            className="btn btn-sm"
            disabled={summary.suggestedActualCents <= 0}
            onClick={() => onApplySuggestedActual(summary.suggestedActualCents)}
          >
            Apply Actual
          </button>
        </div>
      </div>

      <div className="guest-ledger__toolbar">
        <label className="guest-ledger__search">
          <span className="guest-ledger__sr">Search units</span>
          <input
            type="search"
            placeholder="Search unit #, tier, status…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setExpanded(true);
            }}
            autoComplete="off"
          />
        </label>
        <div className="guest-ledger__filters" role="group" aria-label="Filter units">
          {filters.map((f) => (
            <button
              key={f.id}
              type="button"
              className={`chip${filter === f.id ? " active" : ""}`}
              onClick={() => {
                setFilterTouched(true);
                setFilter(f.id);
                setExpanded(f.id !== "open");
              }}
            >
              {f.label}
              {f.count != null ? ` · ${f.count}` : ""}
            </button>
          ))}
        </div>
      </div>

      <table className="guest-ledger__table">
        <thead>
          <tr>
            <th>Unit</th>
            <th>Tier</th>
            <th>Unit $ (incl. HST)</th>
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
          ) : filtered.length === 0 ? (
            <tr>
              <td colSpan={5} className="list-meta">
                No units match this search or filter.
              </td>
            </tr>
          ) : (
            visible.map((a) => {
              const isPaid = paid.has(a.id);
              const isPending = pending.has(a.id);
              const tier = a.guestPayTier;
              return (
                <tr
                  key={a.id}
                  className={isPaid ? "guest-ledger__row--paid" : undefined}
                >
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
                      ? formatCadCents(guestPayTierUnitChargeCents(tier, pricing))
                      : "—"}
                    {isPaid ? (
                      <span className="list-meta"> · paid</span>
                    ) : isPending ? (
                      <span className="list-meta"> · terminal…</span>
                    ) : null}
                  </td>
                  <td>{formatCadCents(refills.get(a.id) ?? 0)}</td>
                  <td>
                    {tier && !isPaid ? (
                      <div className="guest-ledger__actions">
                        <button
                          type="button"
                          className="btn btn-sm btn-ok"
                          disabled={
                            busyId === a.id || isPending || !terminalReady
                          }
                          title={
                            terminalReady
                              ? undefined
                              : "Pair a Square Terminal in Settings → Square"
                          }
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

      {hiddenCount > 0 || (expanded && filtered.length > COLLAPSED_ROWS) ? (
        <div className="guest-ledger__expand">
          {hiddenCount > 0 ? (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setExpanded(true)}
            >
              Show {hiddenCount} more
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setExpanded(false)}
            >
              Collapse list
            </button>
          )}
          <span className="list-meta">
            Showing {visible.length} of {filtered.length}
            {filter !== "all" || query ? " (filtered)" : ""}
          </span>
        </div>
      ) : null}

      <p className="guest-ledger__meta list-meta">
        Units charged {formatCadCents(summary.unitChargedCents)} · collected{" "}
        {formatCadCents(summary.unitCollectedCents)} · refills{" "}
        {formatCadCents(summary.refillCollectedCents)} · tips{" "}
        {formatCadCents(summary.tipCollectedCents)}
      </p>

      <button
        type="button"
        className="guest-ledger__tips-toggle"
        aria-expanded={tipsOpen}
        onClick={() => setTipsOpen((v) => !v)}
      >
        {tipsOpen ? "Hide tip split" : "Tip split & cash-out"}
        {tipCents > 0 ? ` · ${formatCadCents(tipCents)}` : ""}
      </button>

      {tipsOpen ? (
        <div className="guest-ledger__tips">
          {onCollectTip ? (
            <div className="guest-ledger__tip-collect">
              <div className="field" style={{ margin: 0 }}>
                <label htmlFor="ledger-tip-amount">Collect tip ($)</label>
                <input
                  id="ledger-tip-amount"
                  type="number"
                  min="1"
                  step="0.01"
                  value={tipDollars}
                  onChange={(e) => setTipDollars(e.target.value)}
                  placeholder="e.g. 40.00"
                  disabled={tipCollectBusy}
                />
              </div>
              <div className="guest-ledger__tip-actions">
                {terminalReady ? (
                  <button
                    type="button"
                    className="btn btn-ok btn-sm"
                    disabled={tipCollectBusy || !tipDollars.trim()}
                    onClick={async () => {
                      const ok = await onCollectTip(tipDollars, "terminal");
                      if (ok) setTipDollars("");
                    }}
                  >
                    {tipCollectBusy ? "Sending…" : "Collect on Terminal"}
                  </button>
                ) : null}
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={tipCollectBusy || !tipDollars.trim()}
                  onClick={async () => {
                    const ok = await onCollectTip(tipDollars, "manual");
                    if (ok) setTipDollars("");
                  }}
                >
                  Record cash tip
                </button>
              </div>
            </div>
          ) : null}
          {canEditTips ? (
            <TipSplitEditor
              tipCents={tipCents}
              staffNames={staffNames}
              tipSplitJson={tipSplitJson}
              busy={tipSplitBusy}
              onSave={onSaveTipSplit}
            />
          ) : (
            <p className="list-meta">
              Tip split is admin-only. Ask a floor lead / admin to edit percents.
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
