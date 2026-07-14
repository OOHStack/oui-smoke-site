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
        <span className="list-meta">
          Percents must total 100% (now {sum.toFixed(1)}%)
        </span>
      </div>
      <div className="tip-split-editor__rows">
        {rows.map((row, i) => (
          <label key={row.name} className="tip-split-editor__row">
            <span>{row.name}</span>
            <input
              type="number"
              min={0}
              max={100}
              step={0.5}
              value={row.percent}
              onChange={(e) => setPercent(i, Number(e.target.value) || 0)}
            />
            <span className="list-meta">%</span>
          </label>
        ))}
      </div>
      <div className="guest-ledger__actions">
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
      {tipCents > 0 ? (
        <ul className="tip-split" style={{ marginTop: "0.55rem" }}>
          {preview.map((s) => (
            <li key={s.name}>
              {s.name}
              {s.percent != null ? ` · ${s.percent}%` : ""} ·{" "}
              {formatCadCents(s.cents)}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
