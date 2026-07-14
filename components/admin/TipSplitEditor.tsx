"use client";

import { useEffect, useMemo, useState } from "react";
import {
  evenPercents,
  parseStaffNames,
  parseTipSplitJson,
  resolveTipSplit,
  serializeTipSplit,
  type TipSplitEntry,
} from "@/lib/ops/tip-split";
import { formatCadCents } from "@/lib/job-balance";

export default function TipSplitEditor({
  tipCents,
  staffNames,
  tipSplitJson,
  onSave,
  busy,
}: {
  tipCents: number;
  staffNames: string | null | undefined;
  tipSplitJson: string | null | undefined;
  onSave: (json: string) => void | Promise<void>;
  busy?: boolean;
}) {
  const names = useMemo(() => parseStaffNames(staffNames), [staffNames]);
  const [rows, setRows] = useState<TipSplitEntry[]>(() => {
    const custom = parseTipSplitJson(tipSplitJson);
    if (custom) return custom;
    return evenPercents(names);
  });

  useEffect(() => {
    const custom = parseTipSplitJson(tipSplitJson);
    if (custom) {
      setRows(custom);
      return;
    }
    setRows(evenPercents(names));
  }, [tipSplitJson, names]);

  const sum = rows.reduce((s, r) => s + r.percent, 0);
  const sumOk = Math.abs(sum - 100) <= 0.5;
  const preview = resolveTipSplit({
    tipCents,
    staffNames,
    tipSplitJson: sumOk ? serializeTipSplit(rows) : tipSplitJson,
  });
  const previewByName = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of preview) map.set(s.name, s.cents);
    return map;
  }, [preview]);

  function setPercent(index: number, percent: number) {
    setRows((prev) =>
      prev.map((r, i) =>
        i === index
          ? { ...r, percent: Math.max(0, Math.min(100, percent)) }
          : r,
      ),
    );
  }

  if (names.length === 0) {
    return (
      <p className="tip-split">
        Add staff names on the job to edit tip percentages.
      </p>
    );
  }

  return (
    <div className="tip-split-editor">
      <div className="tip-split-editor__head">
        <strong>Tip split</strong>
        <span className={`list-meta${sumOk ? "" : " tip-split-editor__warn"}`}>
          {sumOk
            ? `Totals 100%`
            : `Must total 100% (now ${sum.toFixed(1)}%)`}
        </span>
      </div>

      <ul className="tip-split-editor__rows">
        {rows.map((row, i) => (
          <li key={row.name} className="tip-split-editor__row">
            <span className="tip-split-editor__name">{row.name}</span>
            <div className="tip-split-editor__pct">
              <input
                type="number"
                min={0}
                max={100}
                step={0.5}
                value={row.percent}
                aria-label={`${row.name} tip percent`}
                onChange={(e) => setPercent(i, Number(e.target.value) || 0)}
              />
              <span aria-hidden="true">%</span>
            </div>
            {tipCents > 0 ? (
              <span className="tip-split-editor__cash list-meta">
                {formatCadCents(previewByName.get(row.name) ?? 0)}
              </span>
            ) : null}
          </li>
        ))}
      </ul>

      <div className="tip-split-editor__actions">
        <button
          type="button"
          className="btn btn-sm"
          disabled={busy}
          onClick={() => setRows(evenPercents(names))}
        >
          Reset even
        </button>
        <button
          type="button"
          className="btn btn-sm btn-ok"
          disabled={busy || !sumOk}
          onClick={() => onSave(serializeTipSplit(rows))}
        >
          Save split
        </button>
      </div>
    </div>
  );
}
