"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  parseISO,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import StatusBadge from "@/components/admin/StatusBadge";
import { useConfirm } from "@/components/admin/ConfirmDialog";

type JobRow = {
  id: number;
  title: string;
  clientName: string;
  location?: string | null;
  status: string;
  startsAt: string | null;
  endsAt?: string | null;
  assignmentCount: number;
  staffNames?: string | null;
};

const STATUSES = ["all", "draft", "confirmed", "active", "completed", "cancelled"];

const MONTH_STATUS_ORDER = [
  "active",
  "confirmed",
  "draft",
  "completed",
  "cancelled",
] as const;

const STATUS_LABELS: Record<string, string> = {
  active: "Active",
  confirmed: "Confirmed",
  draft: "Draft",
  completed: "Completed",
  cancelled: "Cancelled",
};

function jobStart(job: JobRow): Date | null {
  if (!job.startsAt) return null;
  try {
    return parseISO(job.startsAt);
  } catch {
    return null;
  }
}

function dateTimeLabel(job: JobRow): string {
  const start = jobStart(job);
  if (!start) return "Unscheduled";
  const day = format(start, "MMM d");
  const startText = format(start, "h:mm a");
  if (!job.endsAt) return `${day} · ${startText}`;
  try {
    return `${day} · ${startText} – ${format(parseISO(job.endsAt), "h:mm a")}`;
  } catch {
    return `${day} · ${startText}`;
  }
}

function JobCard({
  job,
  highlighted,
  compact,
}: {
  job: JobRow;
  highlighted?: boolean;
  compact?: boolean;
}) {
  return (
    <Link
      href={`/admin/jobs/${job.id}`}
      className={[
        "jobs-cal__card",
        `jobs-cal__card--${job.status}`,
        compact ? "is-compact" : "",
        highlighted ? "is-highlighted" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="jobs-cal__card-top">
        {!compact ? (
          <time className="jobs-cal__card-time">{dateTimeLabel(job)}</time>
        ) : (
          <h4 className="jobs-cal__card-title">{job.title}</h4>
        )}
        <StatusBadge status={job.status} kind="job" />
      </div>
      {!compact ? (
        <>
          <h4 className="jobs-cal__card-title">{job.title}</h4>
          <p className="jobs-cal__card-client">{job.clientName}</p>
          <div className="jobs-cal__card-meta">
            {job.location ? <span>{job.location}</span> : null}
            <span>
              {job.assignmentCount ?? 0} hookah
              {(job.assignmentCount ?? 0) === 1 ? "" : "s"}
            </span>
            {job.staffNames ? <span>{job.staffNames}</span> : null}
          </div>
        </>
      ) : (
        <p className="jobs-cal__card-client">{job.clientName}</p>
      )}
    </Link>
  );
}

export default function JobsPage() {
  const router = useRouter();
  const { confirm, dialog } = useConfirm();
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [filter, setFilter] = useState("all");
  const [view, setView] = useState<"list" | "calendar">("calendar");
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [selectedDay, setSelectedDay] = useState(() => new Date());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const qs = filter !== "all" ? `?status=${filter}` : "";
    const res = await fetch(`/api/jobs${qs}`);
    if (res.ok) {
      const data = await res.json();
      setJobs(data.jobs ?? data);
    }
    setLoading(false);
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  const scheduled = useMemo(
    () => jobs.filter((job) => jobStart(job) != null),
    [jobs],
  );

  const unscheduled = useMemo(
    () => jobs.filter((job) => jobStart(job) == null),
    [jobs],
  );

  const jobsByDay = useMemo(() => {
    const map = new Map<string, JobRow[]>();
    for (const job of scheduled) {
      const start = jobStart(job);
      if (!start) continue;
      const key = format(start, "yyyy-MM-dd");
      const list = map.get(key) ?? [];
      list.push(job);
      map.set(key, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => {
        const aTime = jobStart(a)?.getTime() ?? 0;
        const bTime = jobStart(b)?.getTime() ?? 0;
        return aTime - bTime;
      });
    }
    return map;
  }, [scheduled]);

  const calendarDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(month));
    const end = endOfWeek(endOfMonth(month));
    return eachDayOfInterval({ start, end });
  }, [month]);

  const selectedKey = format(selectedDay, "yyyy-MM-dd");
  const dayJobs = jobsByDay.get(selectedKey) ?? [];
  const selectedIds = useMemo(
    () => new Set(dayJobs.map((job) => job.id)),
    [dayJobs],
  );

  const monthJobs = useMemo(() => {
    return scheduled
      .filter((job) => {
        const start = jobStart(job);
        return start != null && isSameMonth(start, month);
      })
      .sort((a, b) => {
        const aTime = jobStart(a)?.getTime() ?? 0;
        const bTime = jobStart(b)?.getTime() ?? 0;
        return aTime - bTime;
      });
  }, [scheduled, month]);

  const monthByStatus = useMemo(() => {
    return MONTH_STATUS_ORDER.map((status) => ({
      status,
      label: STATUS_LABELS[status],
      jobs: monthJobs.filter((job) => job.status === status),
    })).filter((group) => group.jobs.length > 0);
  }, [monthJobs]);

  const monthJobCount = monthJobs.length;

  async function deleteJob(job: JobRow) {
    const ok = await confirm({
      title: "Delete job?",
      message: `Delete “${job.title}”? This removes the job, assignments, events, and guest photos.`,
      confirmLabel: "Delete job",
    });
    if (!ok) return;
    setBusyId(job.id);
    setError("");
    try {
      const res = await fetch(`/api/jobs/${job.id}`, { method: "DELETE" });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? "Failed to delete job");
        return;
      }
      await load();
    } finally {
      setBusyId(null);
    }
  }

  function goMonth(delta: number) {
    const next = addMonths(month, delta);
    setMonth(next);
    if (!isSameMonth(selectedDay, next)) {
      setSelectedDay(startOfMonth(next));
    }
  }

  function selectDay(day: Date) {
    setSelectedDay(day);
    if (!isSameMonth(day, month)) {
      setMonth(startOfMonth(day));
    }
  }

  return (
    <div>
      {dialog}
      <div className="page-head">
        <div>
          <h1 className="page-title">Jobs</h1>
          <p className="page-sub">Bookings, schedule, and status</p>
        </div>
        <div className="page-head-actions">
          <div className="view-toggle" role="group" aria-label="Jobs view">
            <button
              type="button"
              className={`view-toggle__btn ${view === "calendar" ? "active" : ""}`}
              onClick={() => setView("calendar")}
            >
              Calendar
            </button>
            <button
              type="button"
              className={`view-toggle__btn ${view === "list" ? "active" : ""}`}
              onClick={() => setView("list")}
            >
              List
            </button>
          </div>
          <Link href="/admin/jobs/new" className="btn btn-primary">
            New job
          </Link>
        </div>
      </div>

      <div className="chips">
        {STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            className={`chip ${filter === s ? "active" : ""}`}
            onClick={() => setFilter(s)}
          >
            {s}
          </button>
        ))}
      </div>

      {error ? <p className="login-error">{error}</p> : null}

      {loading ? (
        <p className="empty">Loading jobs…</p>
      ) : view === "calendar" ? (
        <div className="jobs-cal">
          <header className="jobs-cal__hero">
            <div className="jobs-cal__hero-text">
              <p className="jobs-cal__eyebrow">Schedule</p>
              <h2 className="jobs-cal__month">{format(month, "MMMM yyyy")}</h2>
              <p className="jobs-cal__meta">
                {monthJobCount} job{monthJobCount === 1 ? "" : "s"} this month
                {unscheduled.length > 0
                  ? ` · ${unscheduled.length} unscheduled`
                  : ""}
              </p>
            </div>
            <div className="jobs-cal__nav">
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => goMonth(-1)}
                aria-label="Previous month"
              >
                ←
              </button>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => {
                  const today = new Date();
                  setMonth(startOfMonth(today));
                  setSelectedDay(today);
                }}
              >
                Today
              </button>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => goMonth(1)}
                aria-label="Next month"
              >
                →
              </button>
            </div>
          </header>

          <div className="jobs-cal__layout">
            <section className="jobs-cal__grid-wrap" aria-label="Month calendar">
              <div className="jobs-cal__weekdays">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                  <span key={d}>{d}</span>
                ))}
              </div>
              <div className="jobs-cal__grid">
                {calendarDays.map((day) => {
                  const key = format(day, "yyyy-MM-dd");
                  const dayList = jobsByDay.get(key) ?? [];
                  const inMonth = isSameMonth(day, month);
                  const selected = isSameDay(day, selectedDay);
                  const today = isToday(day);
                  return (
                    <button
                      key={key}
                      type="button"
                      className={[
                        "jobs-cal__cell",
                        inMonth ? "" : "is-outside",
                        selected ? "is-selected" : "",
                        today ? "is-today" : "",
                        dayList.length ? "has-jobs" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      onClick={() => selectDay(day)}
                      aria-pressed={selected}
                      aria-label={`${format(day, "EEEE, MMM d")}${
                        dayList.length ? `, ${dayList.length} jobs` : ""
                      }`}
                    >
                      <span className="jobs-cal__daynum">{format(day, "d")}</span>
                      <span className="jobs-cal__dots" aria-hidden="true">
                        {dayList.slice(0, 3).map((job) => (
                          <span
                            key={job.id}
                            className={`jobs-cal__dot jobs-cal__dot--${job.status}`}
                          />
                        ))}
                        {dayList.length > 3 ? (
                          <span className="jobs-cal__more">+{dayList.length - 3}</span>
                        ) : null}
                      </span>
                      <span className="jobs-cal__previews">
                        {dayList.slice(0, 2).map((job) => (
                          <span
                            key={job.id}
                            className={`jobs-cal__preview jobs-cal__preview--${job.status}`}
                          >
                            {format(jobStart(job)!, "h:mma").toLowerCase()}{" "}
                            {job.title}
                          </span>
                        ))}
                        {dayList.length > 2 ? (
                          <span className="jobs-cal__preview-more">
                            +{dayList.length - 2} more
                          </span>
                        ) : null}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>

            <aside className="jobs-cal__agenda" aria-live="polite">
              <div className="jobs-cal__agenda-head">
                <p className="jobs-cal__eyebrow">This month</p>
                <h3 className="jobs-cal__agenda-date">
                  {format(month, "MMM yyyy")}
                </h3>
                <p className="jobs-cal__meta">
                  {monthJobCount === 0
                    ? "No jobs scheduled"
                    : `${monthJobCount} job${monthJobCount === 1 ? "" : "s"} · by status`}
                  {dayJobs.length > 0
                    ? ` · ${dayJobs.length} on ${format(selectedDay, "MMM d")}`
                    : ""}
                </p>
              </div>

              {monthByStatus.length === 0 && unscheduled.length === 0 ? (
                <div className="jobs-cal__empty">
                  <p>Nothing booked this month.</p>
                  <Link
                    href={`/admin/jobs/new?startsAt=${encodeURIComponent(
                      format(selectedDay, "yyyy-MM-dd'T'10:00"),
                    )}`}
                    className="btn btn-sm btn-primary"
                  >
                    Book a job
                  </Link>
                </div>
              ) : (
                <div className="jobs-cal__groups">
                  {monthByStatus.map((group) => (
                    <section
                      key={group.status}
                      className={`jobs-cal__group jobs-cal__group--${group.status}`}
                    >
                      <div className="jobs-cal__group-head">
                        <h4 className="jobs-cal__section-label">{group.label}</h4>
                        <span className="jobs-cal__group-count">
                          {group.jobs.length}
                        </span>
                      </div>
                      <ul className="jobs-cal__list">
                        {group.jobs.map((job) => (
                          <li key={job.id}>
                            <JobCard
                              job={job}
                              highlighted={selectedIds.has(job.id)}
                            />
                          </li>
                        ))}
                      </ul>
                    </section>
                  ))}

                  {unscheduled.length > 0 ? (
                    <section className="jobs-cal__group jobs-cal__group--unscheduled">
                      <div className="jobs-cal__group-head">
                        <h4 className="jobs-cal__section-label">Unscheduled</h4>
                        <span className="jobs-cal__group-count">
                          {unscheduled.length}
                        </span>
                      </div>
                      <ul className="jobs-cal__list jobs-cal__list--compact">
                        {unscheduled.map((job) => (
                          <li key={job.id}>
                            <JobCard job={job} compact />
                          </li>
                        ))}
                      </ul>
                    </section>
                  ) : null}
                </div>
              )}
            </aside>
          </div>
        </div>
      ) : jobs.length === 0 ? (
        <p className="empty">No jobs found.</p>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Job</th>
                <th>Client</th>
                <th>Status</th>
                <th>Start</th>
                <th>Hookahs</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.id}>
                  <td>
                    <Link href={`/admin/jobs/${job.id}`}>{job.title}</Link>
                  </td>
                  <td>{job.clientName}</td>
                  <td>
                    <StatusBadge status={job.status} kind="job" />
                  </td>
                  <td>
                    {job.startsAt
                      ? format(new Date(job.startsAt), "MMM d, h:mm a")
                      : "—"}
                  </td>
                  <td>{job.assignmentCount ?? 0}</td>
                  <td>
                    <div className="row-actions">
                      <button
                        type="button"
                        className="btn btn-sm"
                        onClick={() => router.push(`/admin/jobs/${job.id}`)}
                      >
                        Open
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm btn-danger-ghost"
                        disabled={busyId === job.id}
                        onClick={() => void deleteJob(job)}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
