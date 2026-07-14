import clsx from "clsx";

type BadgeKind = "job" | "hookah" | "assignment";

const JOB_STYLES: Record<string, string> = {
  draft: "badge-draft",
  confirmed: "badge-confirmed",
  active: "badge-active",
  completed: "badge-completed",
  cancelled: "badge-cancelled",
};

const HOOKAH_STYLES: Record<string, string> = {
  available: "badge-available",
  out: "badge-out",
  maintenance: "badge-maintenance",
  retired: "badge-retired",
};

const ASSIGNMENT_STYLES: Record<string, string> = {
  staged: "badge-staged",
  out: "badge-out",
  returned: "badge-returned",
};

const ASSIGNMENT_LABELS: Record<string, string> = {
  staged: "ready",
  out: "on floor",
  returned: "returned",
};

export default function StatusBadge({
  status,
  kind = "job",
}: {
  status: string;
  kind?: BadgeKind;
}) {
  const map =
    kind === "hookah"
      ? HOOKAH_STYLES
      : kind === "assignment"
        ? ASSIGNMENT_STYLES
        : JOB_STYLES;

  const label =
    kind === "assignment"
      ? (ASSIGNMENT_LABELS[status] ?? status)
      : status.replace("_", " ");

  return (
    <span className={clsx("badge", map[status] ?? "badge-draft")}>{label}</span>
  );
}
