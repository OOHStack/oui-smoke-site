/** Spot-check timers: interval 0 (or negative) means off. */

export function spotChecksEnabled(intervalMinutes: number | null | undefined) {
  return (
    typeof intervalMinutes === "number" &&
    Number.isFinite(intervalMinutes) &&
    intervalMinutes > 0
  );
}

/** Next due time, or null when spot checks are off for the job. */
export function computeNextCheckAt(
  intervalMinutes: number | null | undefined,
  from: Date = new Date(),
): Date | null {
  if (!spotChecksEnabled(intervalMinutes)) return null;
  return new Date(from.getTime() + intervalMinutes! * 60_000);
}

export function checkIntervalLabel(intervalMinutes: number | null | undefined) {
  if (!spotChecksEnabled(intervalMinutes)) return "Off";
  return `${intervalMinutes}m`;
}
