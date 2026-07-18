import Link from "next/link";
import { and, count, eq, gte, inArray, lte, lt, or, sql } from "drizzle-orm";
import { addDays, format } from "date-fns";
import { getDb } from "@/lib/db";
import { jobs, jobHookahs, hookahs, serviceRequests } from "@/lib/db/schema";
import { getSession } from "@/lib/auth/session";
import StatusBadge from "@/components/admin/StatusBadge";
import DashboardMotion from "@/components/admin/DashboardMotion";
import PartnerOnePagerCard from "@/components/admin/PartnerOnePagerCard";
import PromoModeCard from "@/components/admin/PromoModeCard";

function callLabel(type: string, flavourLabel: string | null, priceCents: number | null) {
  if (type === "refill") {
    const flavour = flavourLabel ? `: ${flavourLabel}` : "";
    const price =
      priceCents != null ? ` · $${(priceCents / 100).toFixed(2)}` : "";
    return `Refill${flavour}${price}`;
  }
  if (type === "order_unit") {
    const flavour = flavourLabel ? `: ${flavourLabel}` : "";
    const price =
      priceCents != null ? ` · $${(priceCents / 100).toFixed(0)}` : "";
    return `Floor order${flavour}${price}`;
  }
  if (type === "coals") return "Fresh coals";
  if (type === "issue") return "Issue";
  return "Help";
}

export default async function AdminDashboardPage() {
  const session = await getSession();
  const db = getDb();
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const weekAhead = addDays(now, 7);

  const [activeRow] = await db
    .select({ n: count() })
    .from(jobs)
    .where(eq(jobs.status, "active"));

  const [outRow] = await db
    .select({ n: count() })
    .from(hookahs)
    .where(eq(hookahs.status, "out"));

  const [serviceOpenRow] = await db
    .select({ n: count() })
    .from(serviceRequests)
    .where(inArray(serviceRequests.status, ["open", "acknowledged"]));

  const overdueList = await db
    .select({
      assignmentId: jobHookahs.id,
      jobId: jobHookahs.jobId,
      modelNumber: hookahs.modelNumber,
      nextCheckAt: jobHookahs.nextCheckAt,
      jobTitle: jobs.title,
      clientName: jobs.clientName,
    })
    .from(jobHookahs)
    .innerJoin(jobs, eq(jobHookahs.jobId, jobs.id))
    .innerJoin(hookahs, eq(hookahs.id, jobHookahs.hookahId))
    .where(
      and(
        eq(jobHookahs.status, "out"),
        lt(jobHookahs.nextCheckAt, now),
        inArray(jobs.status, ["active", "confirmed"]),
      ),
    )
    .orderBy(jobHookahs.nextCheckAt);

  const openServiceCalls = await db
    .select({
      id: serviceRequests.id,
      type: serviceRequests.type,
      status: serviceRequests.status,
      message: serviceRequests.message,
      flavourLabel: serviceRequests.flavourLabel,
      priceCents: serviceRequests.priceCents,
      jobId: serviceRequests.jobId,
      jobTitle: jobs.title,
      modelNumber: hookahs.modelNumber,
      createdAt: serviceRequests.createdAt,
    })
    .from(serviceRequests)
    .innerJoin(jobs, eq(jobs.id, serviceRequests.jobId))
    .leftJoin(jobHookahs, eq(jobHookahs.id, serviceRequests.jobHookahId))
    .leftJoin(hookahs, eq(hookahs.id, jobHookahs.hookahId))
    .where(inArray(serviceRequests.status, ["open", "acknowledged"]))
    .orderBy(serviceRequests.createdAt)
    .limit(12);

  const [completedRow] = await db
    .select({ n: count() })
    .from(jobs)
    .where(
      and(eq(jobs.status, "completed"), gte(jobs.updatedAt, thirtyDaysAgo)),
    );

  const upcomingJobs = await db
    .select()
    .from(jobs)
    .where(
      and(
        or(
          and(gte(jobs.startsAt, now), lte(jobs.startsAt, weekAhead)),
          and(lte(jobs.startsAt, now), gte(jobs.endsAt, now)),
        ),
        sql`${jobs.status} NOT IN ('cancelled', 'completed')`,
      ),
    )
    .orderBy(jobs.startsAt)
    .limit(20);

  let recentGuestFeedback: Array<{
    assignmentId: number;
    jobId: number;
    modelNumber: number;
    guestRating: number | null;
    guestComment: string | null;
    guestFeedbackAt: Date | null;
    jobTitle: string;
    clientName: string;
  }> = [];
  try {
    recentGuestFeedback = await db
      .select({
        assignmentId: jobHookahs.id,
        jobId: jobHookahs.jobId,
        modelNumber: hookahs.modelNumber,
        guestRating: jobHookahs.guestRating,
        guestComment: jobHookahs.guestComment,
        guestFeedbackAt: jobHookahs.guestFeedbackAt,
        jobTitle: jobs.title,
        clientName: jobs.clientName,
      })
      .from(jobHookahs)
      .innerJoin(jobs, eq(jobs.id, jobHookahs.jobId))
      .innerJoin(hookahs, eq(hookahs.id, jobHookahs.hookahId))
      .where(sql`${jobHookahs.guestFeedbackAt} is not null`)
      .orderBy(sql`${jobHookahs.guestFeedbackAt} desc`)
      .limit(8);
  } catch {
    recentGuestFeedback = [];
  }

  const active = Number(activeRow?.n ?? 0);
  const out = Number(outRow?.n ?? 0);
  const calls = Number(serviceOpenRow?.n ?? 0);
  const overdue = overdueList.length;
  const completed = Number(completedRow?.n ?? 0);
  const needsAttention = calls > 0 || overdue > 0;

  return (
    <DashboardMotion>
      <section className="dash-hero">
        <div
          className="dash-hero__media"
          style={{ backgroundImage: "url(/images/model-2-web.jpg)" }}
          aria-hidden="true"
        />
        <div className="dash-hero__veil" aria-hidden="true" />
        <div className="dash-hero__content">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="dash-hero__brand"
            src="/logo-white.png"
            alt="Oui Smoke"
            width={220}
            height={59}
          />
          <h1 className="dash-hero__title">
            {needsAttention ? "Floor needs you" : "Ops is clear"}
          </h1>
          <p className="dash-hero__lede">
            {session?.name ? `${session.name} · ` : ""}
            {format(now, "EEEE, MMM d")}
            {needsAttention
              ? ` · ${calls} guest call${calls === 1 ? "" : "s"}, ${overdue} overdue`
              : " · all checks on schedule"}
          </p>
          <div className="dash-hero__actions">
            <Link href="/admin/live" className="btn btn-primary">
              Live floor
            </Link>
            <Link href="/admin/jobs/new" className="btn">
              New job
            </Link>
          </div>
        </div>
      </section>

      <section className="dash-pulse" aria-label="Live metrics">
        <Link href="/admin/jobs" className="dash-pulse__item dash-pulse__item--jobs">
          <span className="dash-pulse__label">Active jobs</span>
          <span className="dash-pulse__value">{active}</span>
        </Link>
        <Link href="/admin/live" className="dash-pulse__item dash-pulse__item--out">
          <span className="dash-pulse__label">Hookahs out</span>
          <span className="dash-pulse__value">{out}</span>
        </Link>
        <Link
          href="/admin/live"
          className={`dash-pulse__item dash-pulse__item--calls${calls > 0 ? " dash-pulse__item--hot" : ""}`}
        >
          <span className="dash-pulse__label">Guest calls</span>
          <span className="dash-pulse__value">{calls}</span>
        </Link>
        <Link
          href="/admin/live"
          className={`dash-pulse__item dash-pulse__item--overdue${overdue > 0 ? " dash-pulse__item--hot" : ""}`}
        >
          <span className="dash-pulse__label">Overdue</span>
          <span className="dash-pulse__value">{overdue}</span>
        </Link>
      </section>

      <PartnerOnePagerCard />
      <PromoModeCard />

      <div className="dash-rails">
        <section className="dash-rail">
          <div className="dash-rail__head">
            <h2 className="dash-rail__title">Guest calls</h2>
            <Link href="/admin/live" className="dash-rail__link">
              Live floor
            </Link>
          </div>
          {openServiceCalls.length === 0 ? (
            <p className="dash-empty">No open guest requests.</p>
          ) : (
            <ul className="dash-feed">
              {openServiceCalls.map((r) => (
                <li key={r.id}>
                  <Link href={`/admin/jobs/${r.jobId}`} className="dash-feed__row">
                    <div>
                      <div className="dash-feed__title">
                        {r.modelNumber != null ? `#${r.modelNumber}` : "Floor"} ·{" "}
                        {callLabel(r.type, r.flavourLabel, r.priceCents)}
                        {r.status === "acknowledged" ? " · on the way" : ""}
                      </div>
                      <div className="dash-feed__meta">
                        {r.jobTitle}
                        {r.message ? ` · ${r.message}` : ""}
                        {" · "}
                        {format(new Date(r.createdAt), "h:mm a")}
                      </div>
                    </div>
                    <span className="dash-feed__go">Open</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="dash-rail">
          <div className="dash-rail__head">
            <h2 className="dash-rail__title">Overdue checks</h2>
            <span className="dash-rail__count">{overdue}</span>
          </div>
          {overdueList.length === 0 ? (
            <p className="dash-empty">All checks on schedule.</p>
          ) : (
            <ul className="dash-feed">
              {overdueList.map((row) => (
                <li key={row.assignmentId}>
                  <Link href={`/admin/jobs/${row.jobId}`} className="dash-feed__row dash-feed__row--warn">
                    <div>
                      <div className="dash-feed__title">{row.jobTitle}</div>
                      <div className="dash-feed__meta">
                        {row.clientName} · Hookah #{row.modelNumber}
                      </div>
                    </div>
                    <span className="countdown countdown-overdue">OVERDUE</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="dash-rail dash-rail--feedback">
        <div className="dash-rail__head">
          <h2 className="dash-rail__title">Guest feedback</h2>
          <span className="dash-rail__count">{recentGuestFeedback.length}</span>
        </div>
        {recentGuestFeedback.length === 0 ? (
          <p className="dash-empty">No guest ratings yet — they’ll appear when QR sessions wrap.</p>
        ) : (
          <ul className="dash-feed">
            {recentGuestFeedback.map((row) => (
              <li key={row.assignmentId}>
                <Link href={`/admin/jobs/${row.jobId}`} className="dash-feed__row">
                  <div>
                    <div className="dash-feed__title">
                      {row.guestRating}/5 · #{row.modelNumber} · {row.jobTitle}
                    </div>
                    <div className="dash-feed__meta">
                      {row.clientName}
                      {row.guestComment ? ` · “${row.guestComment}”` : ""}
                      {row.guestFeedbackAt
                        ? ` · ${format(new Date(row.guestFeedbackAt), "MMM d, h:mm a")}`
                        : ""}
                    </div>
                  </div>
                  <span className="dash-feed__go">Open</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="dash-schedule">
        <div className="dash-schedule__inner">
          <div className="dash-rail__head">
            <div>
              <h2 className="dash-rail__title">This week</h2>
              <p className="dash-schedule__sub">
                {completed} completed in the last 30 days
              </p>
            </div>
            <Link href="/admin/jobs" className="dash-rail__link">
              All jobs
            </Link>
          </div>

          {upcomingJobs.length === 0 ? (
            <p className="dash-empty">No jobs scheduled in the next 7 days.</p>
          ) : (
            <ul className="dash-schedule__list">
              {upcomingJobs.map((job) => (
                <li key={job.id}>
                  <Link href={`/admin/jobs/${job.id}`} className="dash-schedule__row">
                    <div>
                      <div className="dash-feed__title">{job.title}</div>
                      <div className="dash-feed__meta">
                        {job.clientName}
                        {job.startsAt
                          ? ` · ${format(new Date(job.startsAt), "MMM d, h:mm a")}`
                          : ""}
                        {job.location ? ` · ${job.location}` : ""}
                      </div>
                    </div>
                    <StatusBadge status={job.status} kind="job" />
                  </Link>
                </li>
              ))}
            </ul>
          )}

          <div className="dash-schedule__actions">
            <Link href="/admin/jobs/new" className="btn btn-primary">
              New job
            </Link>
            <Link href="/admin/fleet" className="btn">
              Fleet
            </Link>
            <Link href="/admin/analytics" className="btn">
              Analytics
            </Link>
          </div>
        </div>
      </section>
    </DashboardMotion>
  );
}
