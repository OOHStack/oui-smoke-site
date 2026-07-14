/** Parse comma / newline separated staff names into unique trimmed labels. */
export function parseStaffNames(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(/[,;\n]+/)) {
    const name = part.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

export type TipShare = { name: string; cents: number; percent?: number };

export type TipSplitEntry = { name: string; percent: number };

export function parseTipSplitJson(
  raw: string | null | undefined,
): TipSplitEntry[] | null {
  if (!raw?.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    const entries: TipSplitEntry[] = [];
    for (const row of parsed) {
      if (!row || typeof row !== "object") continue;
      const name = String((row as { name?: unknown }).name ?? "").trim();
      const percent = Number((row as { percent?: unknown }).percent);
      if (!name || !Number.isFinite(percent) || percent < 0) continue;
      entries.push({ name, percent: Math.round(percent * 100) / 100 });
    }
    if (entries.length === 0) return null;
    const sum = entries.reduce((s, e) => s + e.percent, 0);
    if (Math.abs(sum - 100) > 0.5) return null;
    return entries;
  } catch {
    return null;
  }
}

export function serializeTipSplit(entries: TipSplitEntry[]): string {
  return JSON.stringify(
    entries.map((e) => ({
      name: e.name.trim(),
      percent: Math.round(e.percent * 100) / 100,
    })),
  );
}

export function evenPercents(names: string[]): TipSplitEntry[] {
  if (names.length === 0) return [];
  const base = Math.floor((10000 / names.length)) / 100;
  let rem = Math.round((100 - base * names.length) * 100);
  return names.map((name) => {
    const extra = rem > 0 ? 0.01 : 0;
    if (rem > 0) rem -= 1;
    return { name, percent: Math.round((base + extra) * 100) / 100 };
  });
}

/**
 * Even split of tipCents across staff names.
 * Remainder cents go to the first names (1¢ each) so the sum matches exactly.
 */
export function evenTipSplit(
  tipCents: number,
  staffNames: string | null | undefined,
): TipShare[] {
  const names = parseStaffNames(staffNames);
  const total = Math.max(0, Math.floor(tipCents) || 0);
  if (names.length === 0) {
    return total > 0 ? [{ name: "Unassigned", cents: total, percent: 100 }] : [];
  }
  if (total === 0) {
    const pct = evenPercents(names);
    return pct.map((e) => ({ name: e.name, cents: 0, percent: e.percent }));
  }

  const base = Math.floor(total / names.length);
  let rem = total - base * names.length;
  const pct = evenPercents(names);
  return names.map((name, i) => {
    const extra = rem > 0 ? 1 : 0;
    if (rem > 0) rem -= 1;
    return {
      name,
      cents: base + extra,
      percent: pct[i]?.percent,
    };
  });
}

/** Split by custom percents (must sum ≈ 100). Remainder cents to earliest rows. */
export function percentTipSplit(
  tipCents: number,
  entries: TipSplitEntry[],
): TipShare[] {
  const total = Math.max(0, Math.floor(tipCents) || 0);
  if (entries.length === 0) return [];
  if (total === 0) {
    return entries.map((e) => ({
      name: e.name,
      cents: 0,
      percent: e.percent,
    }));
  }

  const raw = entries.map((e) => ({
    name: e.name,
    percent: e.percent,
    cents: Math.floor((total * e.percent) / 100),
  }));
  let allocated = raw.reduce((s, r) => s + r.cents, 0);
  let rem = total - allocated;
  for (let i = 0; i < raw.length && rem > 0; i++) {
    raw[i]!.cents += 1;
    rem -= 1;
  }
  return raw.map((r) => ({
    name: r.name,
    cents: r.cents,
    percent: r.percent,
  }));
}

/** Prefer custom tipSplitJson when valid; otherwise even split from staffNames. */
export function resolveTipSplit(opts: {
  tipCents: number;
  staffNames?: string | null;
  tipSplitJson?: string | null;
}): TipShare[] {
  const custom = parseTipSplitJson(opts.tipSplitJson);
  if (custom) return percentTipSplit(opts.tipCents, custom);
  return evenTipSplit(opts.tipCents, opts.staffNames);
}
