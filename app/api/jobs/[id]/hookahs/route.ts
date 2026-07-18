import { requireApiSession } from "@/lib/auth/api";
import { getDb } from "@/lib/db";
import {
  flavours,
  hookahRefills,
  hookahs,
  jobEvents,
  jobHookahs,
  jobs,
  payments,
  serviceRequests,
} from "@/lib/db/schema";
import {
  cancelOpenServiceRequests,
  hookahOutOnOtherActiveJob,
} from "@/lib/fleet";
import { createGuestToken } from "@/lib/guest";
import {
  defaultRefillCentsForTier,
  guestPayTierLabel,
  guestPayTierUnitCents,
  isGuestPayTier,
  type GuestPayTier,
} from "@/lib/ops/guest-pay";
import { getPricingForJob, withHstCents } from "@/lib/pricing";
import { findGuestRefillPayment } from "@/lib/refill-payment-link";
import { randomUUID } from "crypto";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

type RouteContext = { params: Promise<{ id: string }> };

async function nextSortOrder(
  db: ReturnType<typeof getDb>,
  jobId: number,
  status: "staged" | "out" | "returned",
) {
  const [row] = await db
    .select({ max: sql<number>`coalesce(max(${jobHookahs.sortOrder}), -1)` })
    .from(jobHookahs)
    .where(and(eq(jobHookahs.jobId, jobId), eq(jobHookahs.status, status)));
  return Number(row?.max ?? -1) + 1;
}

async function applyColumnOrder(
  db: ReturnType<typeof getDb>,
  jobId: number,
  status: "staged" | "out" | "returned",
  orderedIds: number[],
) {
  for (let i = 0; i < orderedIds.length; i++) {
    await db
      .update(jobHookahs)
      .set({ sortOrder: i })
      .where(
        and(
          eq(jobHookahs.id, orderedIds[i]!),
          eq(jobHookahs.jobId, jobId),
          eq(jobHookahs.status, status),
        ),
      );
  }
}

export async function POST(request: Request, context: RouteContext) {
  const { session, error } = await requireApiSession();
  if (error) return error;

  const { id: idParam } = await context.params;
  const jobId = Number(idParam);
  if (!Number.isFinite(jobId)) {
    return NextResponse.json({ error: "Invalid job id" }, { status: 400 });
  }

  try {
    const body = await request.json();
    const action = body?.action;

    if (!action || typeof action !== "string") {
      return NextResponse.json({ error: "action required" }, { status: 400 });
    }

    const db = getDb();

    const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId));
    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    switch (action) {
      case "add": {
        const hookahId = body.hookahId;
        if (typeof hookahId !== "number") {
          return NextResponse.json({ error: "hookahId required" }, { status: 400 });
        }

        if (await hookahOutOnOtherActiveJob(db, hookahId, jobId)) {
          return NextResponse.json(
            { error: "Hookah is already out on another active job" },
            { status: 409 }
          );
        }

        const [existing] = await db
          .select()
          .from(jobHookahs)
          .where(and(eq(jobHookahs.jobId, jobId), eq(jobHookahs.hookahId, hookahId)))
          .limit(1);

        if (existing) {
          return NextResponse.json({ error: "Hookah already on this job" }, { status: 409 });
        }

        const [hookah] = await db
          .select()
          .from(hookahs)
          .where(eq(hookahs.id, hookahId))
          .limit(1);

        if (!hookah) {
          return NextResponse.json({ error: "Hookah not found" }, { status: 404 });
        }

        const sortOrder = await nextSortOrder(db, jobId, "staged");

        const [assignment] = await db
          .insert(jobHookahs)
          .values({
            jobId,
            hookahId,
            status: "staged",
            flavourId: body.flavourId ?? null,
            flavourLabel: body.flavourLabel ?? "",
            sortOrder,
          })
          .returning();

        await db.insert(jobEvents).values({
          jobId,
          jobHookahId: assignment.id,
          type: "note",
          message: `Hookah #${hookah.modelNumber} staged`,
          createdBy: session.name,
        });

        return NextResponse.json(assignment);
      }

      case "add_many": {
        const rawIds = body.hookahIds;
        if (!Array.isArray(rawIds) || rawIds.length === 0) {
          return NextResponse.json({ error: "hookahIds required" }, { status: 400 });
        }

        const hookahIds = [
          ...new Set(
            rawIds.filter((id): id is number => typeof id === "number" && Number.isFinite(id)),
          ),
        ];

        if (hookahIds.length === 0) {
          return NextResponse.json({ error: "hookahIds required" }, { status: 400 });
        }

        const defaultFlavourId =
          typeof body.defaultFlavourId === "number" ? body.defaultFlavourId : null;
        const flavourByHookahId =
          body.flavourByHookahId &&
          typeof body.flavourByHookahId === "object" &&
          !Array.isArray(body.flavourByHookahId)
            ? (body.flavourByHookahId as Record<string, unknown>)
            : {};

        const flavourCache = new Map<number, { id: number; name: string }>();
        async function resolveFlavour(id: number | null) {
          if (id == null) return null;
          const cached = flavourCache.get(id);
          if (cached) return cached;
          const [flav] = await db
            .select({ id: flavours.id, name: flavours.name })
            .from(flavours)
            .where(eq(flavours.id, id))
            .limit(1);
          if (!flav) return null;
          flavourCache.set(id, flav);
          return flav;
        }

        const created = [];
        const skipped: Array<{ hookahId: number; reason: string }> = [];

        for (const hookahId of hookahIds) {
          if (await hookahOutOnOtherActiveJob(db, hookahId, jobId)) {
            skipped.push({ hookahId, reason: "out on another job" });
            continue;
          }

          const [existing] = await db
            .select()
            .from(jobHookahs)
            .where(and(eq(jobHookahs.jobId, jobId), eq(jobHookahs.hookahId, hookahId)))
            .limit(1);

          if (existing) {
            skipped.push({ hookahId, reason: "already on this job" });
            continue;
          }

          const [hookah] = await db
            .select()
            .from(hookahs)
            .where(eq(hookahs.id, hookahId))
            .limit(1);

          if (!hookah) {
            skipped.push({ hookahId, reason: "not found" });
            continue;
          }

          if (hookah.status === "retired" || hookah.status === "maintenance") {
            skipped.push({ hookahId, reason: hookah.status });
            continue;
          }

          const rawFlavour = flavourByHookahId[String(hookahId)];
          const perFlavourId =
            typeof rawFlavour === "number"
              ? rawFlavour
              : typeof rawFlavour === "string" && rawFlavour
                ? parseInt(rawFlavour, 10)
                : null;
          const flavourId =
            Number.isFinite(perFlavourId) && perFlavourId
              ? perFlavourId
              : defaultFlavourId;
          const flav = await resolveFlavour(flavourId);
          const sortOrder = await nextSortOrder(db, jobId, "staged");

          const [assignment] = await db
            .insert(jobHookahs)
            .values({
              jobId,
              hookahId,
              status: "staged",
              flavourId: flav?.id ?? null,
              flavourLabel: flav?.name ?? "",
              sortOrder,
            })
            .returning();

          if (flav) {
            await db
              .update(flavours)
              .set({ timesUsed: sql`${flavours.timesUsed} + 1` })
              .where(eq(flavours.id, flav.id));
          }

          await db.insert(jobEvents).values({
            jobId,
            jobHookahId: assignment.id,
            type: "note",
            message: flav
              ? `Hookah #${hookah.modelNumber} staged · ${flav.name}`
              : `Hookah #${hookah.modelNumber} staged`,
            createdBy: session.name,
          });

          created.push(assignment);
        }

        if (created.length === 0) {
          return NextResponse.json(
            {
              error: skipped[0]?.reason
                ? `Couldn’t add hookahs (${skipped[0].reason})`
                : "Couldn’t add hookahs",
              skipped,
            },
            { status: 409 },
          );
        }

        return NextResponse.json({ assignments: created, skipped });
      }

      case "board_place": {
        const assignmentId = body.assignmentId;
        const toStatus = body.toStatus;
        const beforeAssignmentId =
          typeof body.beforeAssignmentId === "number" ? body.beforeAssignmentId : null;

        if (typeof assignmentId !== "number") {
          return NextResponse.json({ error: "assignmentId required" }, { status: 400 });
        }
        if (toStatus !== "staged" && toStatus !== "out" && toStatus !== "returned") {
          return NextResponse.json({ error: "Invalid toStatus" }, { status: 400 });
        }

        const [assignment] = await db
          .select()
          .from(jobHookahs)
          .where(and(eq(jobHookahs.id, assignmentId), eq(jobHookahs.jobId, jobId)))
          .limit(1);

        if (!assignment) {
          return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
        }

        // Close-out always goes through the return outcome modal
        if (toStatus === "returned" && assignment.status !== "returned") {
          return NextResponse.json(
            { error: "Choose a return outcome", code: "NEED_RETURN" },
            { status: 409 },
          );
        }

        if (toStatus === "out" && assignment.status !== "out") {
          if (await hookahOutOnOtherActiveJob(db, assignment.hookahId, jobId)) {
            return NextResponse.json(
              { error: "Hookah is already out on another active job" },
              { status: 409 },
            );
          }

          const hasFlavour =
            assignment.flavourId != null ||
            !!(assignment.flavourLabel && assignment.flavourLabel.trim());
          if (!hasFlavour) {
            return NextResponse.json(
              { error: "Assign a flavour before sending out", code: "NEED_FLAVOUR" },
              { status: 409 },
            );
          }

          if (job.paymentModel === "pay_at_event" && !assignment.guestPayTier) {
            if (isGuestPayTier(body.guestPayTier)) {
              await db
                .update(jobHookahs)
                .set({ guestPayTier: body.guestPayTier })
                .where(eq(jobHookahs.id, assignmentId));
              assignment.guestPayTier = body.guestPayTier;
            } else {
              return NextResponse.json(
                {
                  error: "Choose Standard or Unlimited guest pay before sending out",
                  code: "NEED_GUEST_TIER",
                },
                { status: 409 },
              );
            }
          }

          const now = new Date();
          const nextCheckAt = new Date(now.getTime() + job.checkIntervalMinutes * 60_000);
          const guestToken = assignment.guestToken || createGuestToken();

          await db
            .update(jobHookahs)
            .set({
              status: "out",
              sentOutAt: assignment.sentOutAt ?? now,
              returnedAt: null,
              nextCheckAt,
              guestToken,
              ...(assignment.guestPayTier
                ? { guestPayTier: assignment.guestPayTier }
                : {}),
            })
            .where(eq(jobHookahs.id, assignmentId));

          await db
            .update(hookahs)
            .set({ status: "out" })
            .where(eq(hookahs.id, assignment.hookahId));

          await db.insert(jobEvents).values({
            jobId,
            jobHookahId: assignmentId,
            type: "sent_out",
            message: "Hookah sent out",
            createdBy: session.name,
          });
        }

        if (toStatus === "staged" && assignment.status !== "staged") {
          await db
            .update(jobHookahs)
            .set({
              status: "staged",
              sentOutAt: null,
              returnedAt: null,
              nextCheckAt: null,
              guestToken: null,
              prepCompletedAt: null,
            })
            .where(eq(jobHookahs.id, assignmentId));

          await db
            .update(hookahs)
            .set({ status: "available" })
            .where(eq(hookahs.id, assignment.hookahId));

          await cancelOpenServiceRequests(db, {
            jobHookahId: assignmentId,
            cancelledBy: session.name,
          });

          await db.insert(jobEvents).values({
            jobId,
            jobHookahId: assignmentId,
            type: "note",
            message: "Hookah moved back to ready",
            createdBy: session.name,
          });
        }

        const columnRows = await db
          .select({ id: jobHookahs.id })
          .from(jobHookahs)
          .where(and(eq(jobHookahs.jobId, jobId), eq(jobHookahs.status, toStatus)))
          .orderBy(asc(jobHookahs.sortOrder), asc(jobHookahs.id));

        const ids = columnRows.map((r) => r.id).filter((id) => id !== assignmentId);
        let insertAt = ids.length;
        if (beforeAssignmentId != null) {
          const idx = ids.indexOf(beforeAssignmentId);
          if (idx >= 0) insertAt = idx;
        }
        ids.splice(insertAt, 0, assignmentId);
        await applyColumnOrder(db, jobId, toStatus, ids);

        const [updated] = await db
          .select()
          .from(jobHookahs)
          .where(eq(jobHookahs.id, assignmentId))
          .limit(1);

        return NextResponse.json({ assignment: updated, orderedIds: ids });
      }

      case "remove": {
        const assignmentId = body.assignmentId;
        if (typeof assignmentId !== "number") {
          return NextResponse.json({ error: "assignmentId required" }, { status: 400 });
        }

        const [assignment] = await db
          .select()
          .from(jobHookahs)
          .where(and(eq(jobHookahs.id, assignmentId), eq(jobHookahs.jobId, jobId)))
          .limit(1);

        if (!assignment) {
          return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
        }

        if (assignment.status !== "staged") {
          return NextResponse.json(
            { error: "Only staged assignments can be removed" },
            { status: 400 }
          );
        }

        await db.delete(jobHookahs).where(eq(jobHookahs.id, assignmentId));

        await db.insert(jobEvents).values({
          jobId,
          type: "note",
          message: `Staged hookah assignment removed`,
          createdBy: session.name,
        });

        return NextResponse.json({ ok: true });
      }

      case "send_out": {
        const assignmentId = body.assignmentId;
        if (typeof assignmentId !== "number") {
          return NextResponse.json({ error: "assignmentId required" }, { status: 400 });
        }

        const [assignment] = await db
          .select()
          .from(jobHookahs)
          .where(and(eq(jobHookahs.id, assignmentId), eq(jobHookahs.jobId, jobId)))
          .limit(1);

        if (!assignment) {
          return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
        }

        if (await hookahOutOnOtherActiveJob(db, assignment.hookahId, jobId)) {
          return NextResponse.json(
            { error: "Hookah is already out on another active job" },
            { status: 409 }
          );
        }

        const note = typeof body.note === "string" ? body.note : "";
        const flavourId =
          typeof body.flavourId === "number" ? body.flavourId : assignment.flavourId;
        const flavourLabel =
          typeof body.flavourLabel === "string"
            ? body.flavourLabel
            : assignment.flavourLabel;
        const hasFlavour =
          flavourId != null ||
          (typeof flavourLabel === "string" && flavourLabel.trim().length > 0);

        if (!hasFlavour) {
          return NextResponse.json(
            { error: "Assign a flavour before sending out" },
            { status: 400 }
          );
        }

        if (job.paymentModel === "pay_at_event" && !assignment.guestPayTier) {
          if (isGuestPayTier(body.guestPayTier)) {
            await db
              .update(jobHookahs)
              .set({ guestPayTier: body.guestPayTier })
              .where(eq(jobHookahs.id, assignmentId));
            assignment.guestPayTier = body.guestPayTier;
          } else {
            return NextResponse.json(
              {
                error: "Choose Standard or Unlimited guest pay before sending out",
                code: "NEED_GUEST_TIER",
              },
              { status: 409 },
            );
          }
        }

        const now = new Date();
        const nextCheckAt = new Date(now.getTime() + job.checkIntervalMinutes * 60_000);
        const guestToken = assignment.guestToken || createGuestToken();
        const sortOrder =
          assignment.status === "out"
            ? assignment.sortOrder
            : await nextSortOrder(db, jobId, "out");

        const [updated] = await db
          .update(jobHookahs)
          .set({
            status: "out",
            sentOutAt: now,
            returnedAt: null,
            nextCheckAt,
            flavourId: flavourId ?? null,
            flavourLabel: flavourLabel ?? "",
            outNotes: note ? note : assignment.outNotes,
            guestToken,
            sortOrder,
            ...(assignment.guestPayTier
              ? { guestPayTier: assignment.guestPayTier }
              : {}),
          })
          .where(eq(jobHookahs.id, assignmentId))
          .returning();

        await db
          .update(hookahs)
          .set({ status: "out" })
          .where(eq(hookahs.id, assignment.hookahId));

        if (flavourId) {
          await db
            .update(flavours)
            .set({ timesUsed: sql`${flavours.timesUsed} + 1` })
            .where(eq(flavours.id, flavourId));
        }

        await db.insert(jobEvents).values({
          jobId,
          jobHookahId: assignmentId,
          type: "sent_out",
          message: note || `Hookah sent out`,
          createdBy: session.name,
        });

        return NextResponse.json(updated);
      }

      case "restage": {
        const assignmentId = body.assignmentId;
        if (typeof assignmentId !== "number") {
          return NextResponse.json({ error: "assignmentId required" }, { status: 400 });
        }

        const [assignment] = await db
          .select()
          .from(jobHookahs)
          .where(and(eq(jobHookahs.id, assignmentId), eq(jobHookahs.jobId, jobId)))
          .limit(1);

        if (!assignment) {
          return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
        }

        if (assignment.status === "staged") {
          return NextResponse.json(assignment);
        }

        const sortOrder = await nextSortOrder(db, jobId, "staged");

        const [updated] = await db
          .update(jobHookahs)
          .set({
            status: "staged",
            nextCheckAt: null,
            returnedAt: null,
            guestToken: null,
            prepCompletedAt: null,
            sortOrder,
          })
          .where(eq(jobHookahs.id, assignmentId))
          .returning();

        await db
          .update(hookahs)
          .set({ status: "available" })
          .where(eq(hookahs.id, assignment.hookahId));

        await cancelOpenServiceRequests(db, {
          jobHookahId: assignmentId,
          cancelledBy: session.name,
        });

        const [hookah] = await db
          .select()
          .from(hookahs)
          .where(eq(hookahs.id, assignment.hookahId))
          .limit(1);

        await db.insert(jobEvents).values({
          jobId,
          jobHookahId: assignmentId,
          type: "note",
          message: `Hookah #${hookah?.modelNumber ?? assignment.hookahId} moved back to ready`,
          createdBy: session.name,
        });

        return NextResponse.json(updated);
      }

      case "return": {
        const assignmentId = body.assignmentId;
        if (typeof assignmentId !== "number") {
          return NextResponse.json({ error: "assignmentId required" }, { status: 400 });
        }

        const outcome = body.outcome;
        if (
          outcome !== "returned" &&
          outcome !== "not_returned" &&
          outcome !== "returned_with_issue"
        ) {
          return NextResponse.json(
            { error: "outcome must be returned, not_returned, or returned_with_issue" },
            { status: 400 },
          );
        }

        const [assignment] = await db
          .select()
          .from(jobHookahs)
          .where(and(eq(jobHookahs.id, assignmentId), eq(jobHookahs.jobId, jobId)))
          .limit(1);

        if (!assignment) {
          return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
        }

        if (assignment.status === "returned") {
          return NextResponse.json(assignment);
        }

        // Allow close-out from ready or floor (drag in any order)
        if (assignment.status !== "out" && assignment.status !== "staged") {
          return NextResponse.json(
            { error: "Only ready or floor hookahs can be closed out" },
            { status: 400 },
          );
        }

        const now = new Date();
        const note = typeof body.note === "string" ? body.note.trim() : "";
        const withIssue = outcome === "returned_with_issue" || outcome === "not_returned";
        const sortOrder = await nextSortOrder(db, jobId, "returned");

        const [updated] = await db
          .update(jobHookahs)
          .set({
            status: "returned",
            returnedAt: now,
            nextCheckAt: null,
            returnOutcome: outcome,
            returnNotes: note || assignment.returnNotes,
            issueFlag: withIssue ? true : assignment.issueFlag,
            sortOrder,
          })
          .where(eq(jobHookahs.id, assignmentId))
          .returning();

        if (outcome === "returned") {
          await db
            .update(hookahs)
            .set({ status: "available" })
            .where(eq(hookahs.id, assignment.hookahId));
        } else {
          await db
            .update(hookahs)
            .set({ status: "maintenance" })
            .where(eq(hookahs.id, assignment.hookahId));
        }

        await cancelOpenServiceRequests(db, {
          jobHookahId: assignmentId,
          cancelledBy: session.name,
        });

        const outcomeLabel =
          outcome === "returned"
            ? "Returned OK"
            : outcome === "not_returned"
              ? "Not returned"
              : "Returned with issue";

        await db.insert(jobEvents).values({
          jobId,
          jobHookahId: assignmentId,
          type: withIssue ? "issue" : "returned",
          message: note ? `${outcomeLabel}: ${note}` : outcomeLabel,
          createdBy: session.name,
        });

        return NextResponse.json(updated);
      }

      case "check": {
        const assignmentId = body.assignmentId;
        if (typeof assignmentId !== "number") {
          return NextResponse.json({ error: "assignmentId required" }, { status: 400 });
        }

        const [assignment] = await db
          .select()
          .from(jobHookahs)
          .where(and(eq(jobHookahs.id, assignmentId), eq(jobHookahs.jobId, jobId)))
          .limit(1);

        if (!assignment) {
          return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
        }

        if (assignment.status !== "out") {
          return NextResponse.json({ error: "Assignment must be out to check" }, { status: 400 });
        }

        const now = new Date();
        const nextCheckAt = new Date(now.getTime() + job.checkIntervalMinutes * 60_000);
        const note = typeof body.note === "string" ? body.note.trim() : "";

        const [updated] = await db
          .update(jobHookahs)
          .set({
            lastCheckedAt: now,
            nextCheckAt,
            checkCount: sql`${jobHookahs.checkCount} + 1`,
          })
          .where(eq(jobHookahs.id, assignmentId))
          .returning();

        await db.insert(jobEvents).values({
          jobId,
          jobHookahId: assignmentId,
          type: "checked",
          message: note || "Staff check completed",
          createdBy: session.name,
        });

        return NextResponse.json(updated);
      }

      case "deliver_refill": {
        const assignmentId = body.assignmentId;
        if (typeof assignmentId !== "number") {
          return NextResponse.json({ error: "assignmentId required" }, { status: 400 });
        }

        const [assignment] = await db
          .select()
          .from(jobHookahs)
          .where(and(eq(jobHookahs.id, assignmentId), eq(jobHookahs.jobId, jobId)))
          .limit(1);

        if (!assignment) {
          return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
        }
        if (assignment.status !== "out") {
          return NextResponse.json({ error: "Hookah must be on the floor" }, { status: 400 });
        }

        let flavourId =
          typeof body.flavourId === "number" ? body.flavourId : null;
        let flavourLabel =
          typeof body.flavourLabel === "string" ? body.flavourLabel.trim() : "";
        const serviceRequestId =
          typeof body.serviceRequestId === "number" ? body.serviceRequestId : null;
        const note = typeof body.note === "string" ? body.note.trim() : "";
        const source = body.source === "guest" ? "guest" : "staff";
        const pricing = await getPricingForJob(jobId);
        const defaultPrice = defaultRefillCentsForTier(
          assignment.guestPayTier as GuestPayTier | null,
          pricing,
        );
        const priceCents =
          typeof body.priceCents === "number" ? body.priceCents : defaultPrice;
        const collectChannel =
          body.collectChannel === "cash" ||
          body.collectChannel === "terminal" ||
          body.collectChannel === "already_paid"
            ? (body.collectChannel as "cash" | "terminal" | "already_paid")
            : null;

        if (serviceRequestId) {
          const [req] = await db
            .select()
            .from(serviceRequests)
            .where(eq(serviceRequests.id, serviceRequestId))
            .limit(1);
          if (req && req.jobHookahId === assignmentId) {
            flavourId = req.flavourId ?? flavourId;
            flavourLabel = req.flavourLabel || flavourLabel;
          }
        }

        if (flavourId) {
          const [flav] = await db
            .select()
            .from(flavours)
            .where(eq(flavours.id, flavourId))
            .limit(1);
          if (flav) flavourLabel = flav.name;
        }

        if (!flavourLabel && !flavourId) {
          // same flavour refill
          flavourId = assignment.flavourId;
          flavourLabel = assignment.flavourLabel || "";
          if (flavourId && !flavourLabel) {
            const [flav] = await db
              .select()
              .from(flavours)
              .where(eq(flavours.id, flavourId))
              .limit(1);
            flavourLabel = flav?.name ?? "";
          }
        }

        if (!flavourLabel) {
          return NextResponse.json({ error: "Flavour required for refill" }, { status: 400 });
        }

        const previousLabel = assignment.flavourLabel || "";
        const now = new Date();
        const nextCheckAt = new Date(now.getTime() + job.checkIntervalMinutes * 60_000);

        // Gate unpaid charged refills before mutating assignment / ledger
        let terminalPushId: number | null = null;
        if (priceCents > 0) {
          const guestPayPre = serviceRequestId
            ? await findGuestRefillPayment(serviceRequestId)
            : null;
          if (guestPayPre?.status !== "succeeded") {
            if (!collectChannel) {
              return NextResponse.json(
                {
                  error: "Choose how you collected payment",
                  code: "NEED_COLLECT_CHANNEL",
                },
                { status: 409 },
              );
            }
            if (collectChannel === "already_paid") {
              return NextResponse.json(
                {
                  error: "Payment isn’t confirmed yet",
                  code: "PAYMENT_NOT_CONFIRMED",
                },
                { status: 409 },
              );
            }
            if (collectChannel === "terminal") {
              if (guestPayPre?.status === "pending") {
                await db
                  .update(payments)
                  .set({ status: "cancelled", updatedAt: now })
                  .where(eq(payments.id, guestPayPre.id));
              }
              const { pushJobPaymentToTerminal } = await import(
                "@/lib/terminal-checkout"
              );
              const result = await pushJobPaymentToTerminal({
                jobId,
                kind: "refill",
                amountCents: priceCents,
                label: `Refill · ${flavourLabel} + HST`,
                jobHookahId: assignmentId,
                createdBy: session.name,
              });
              if (!result.ok) {
                return NextResponse.json(
                  {
                    error:
                      result.reason === "terminal_not_configured"
                        ? "Set Terminal device in Settings → Square"
                        : result.reason,
                    code: "TERMINAL_PUSH_FAILED",
                  },
                  {
                    status:
                      result.reason === "terminal_not_configured" ? 503 : 400,
                  },
                );
              }
              terminalPushId = result.paymentId;
            }
          }
        }

        const [updated] = await db
          .update(jobHookahs)
          .set({
            flavourId: flavourId ?? null,
            flavourLabel,
            refillCount: sql`${jobHookahs.refillCount} + 1`,
            lastCheckedAt: now,
            nextCheckAt,
            checkCount: sql`${jobHookahs.checkCount} + 1`,
          })
          .where(eq(jobHookahs.id, assignmentId))
          .returning();

        if (flavourId) {
          await db
            .update(flavours)
            .set({ timesUsed: sql`${flavours.timesUsed} + 1` })
            .where(eq(flavours.id, flavourId));
        }

        const [refillRow] = await db
          .insert(hookahRefills)
          .values({
            jobId,
            jobHookahId: assignmentId,
            flavourId: flavourId ?? null,
            flavourLabel,
            previousFlavourLabel: previousLabel,
            priceCents,
            source,
            serviceRequestId,
            note,
            createdBy: session.name,
          })
          .returning();

        if (priceCents > 0) {
          const guestPay = serviceRequestId
            ? await findGuestRefillPayment(serviceRequestId)
            : null;

          if (guestPay?.status === "succeeded" || terminalPushId != null) {
            // Square / Terminal already tracking — don't invent cash.
          } else {
            // cash invent
            if (guestPay?.status === "pending") {
              await db
                .update(payments)
                .set({ status: "cancelled", updatedAt: now })
                .where(eq(payments.id, guestPay.id));
            }

            await db.insert(payments).values({
              jobId,
              jobHookahId: assignmentId,
              kind: "refill",
              status: "succeeded",
              amountCents: withHstCents(priceCents, pricing.hstRate),
              label: `Refill · ${flavourLabel} + HST`,
              idempotencyKey: guestPay
                ? `refill-cash-${refillRow.id}`
                : `refill-${refillRow.id}`,
              createdBy: session.name,
              paidAt: now,
            });
          }
        }

        if (serviceRequestId) {
          await db
            .update(serviceRequests)
            .set({
              status: "resolved",
              resolvedAt: now,
              resolvedBy: session.name,
              acknowledgedAt: now,
              acknowledgedBy: session.name,
            })
            .where(eq(serviceRequests.id, serviceRequestId));
        }

        const same =
          previousLabel.trim().toLowerCase() === flavourLabel.trim().toLowerCase();
        const charged =
          priceCents > 0
            ? withHstCents(priceCents, pricing.hstRate)
            : 0;
        await db.insert(jobEvents).values({
          jobId,
          jobHookahId: assignmentId,
          type: "refill",
          message: note
            ? `Refill delivered (${same ? "same" : "new"}: ${flavourLabel}) — ${note}`
            : charged > 0
              ? `Refill delivered (${same ? "same" : "new"}: ${flavourLabel}) · $${(charged / 100).toFixed(2)} incl. HST`
              : `Refill delivered (${same ? "same" : "new"}: ${flavourLabel}) · included`,
          createdBy: session.name,
        });

        return NextResponse.json({ assignment: updated, refill: refillRow });
      }

      case "set_flavour": {
        const assignmentId = body.assignmentId;
        if (typeof assignmentId !== "number") {
          return NextResponse.json({ error: "assignmentId required" }, { status: 400 });
        }

        const updates: Partial<typeof jobHookahs.$inferInsert> = {};
        if (typeof body.flavourId === "number") {
          updates.flavourId = body.flavourId;
          if (body.flavourId > 0) {
            const [flav] = await db
              .select({ id: flavours.id, name: flavours.name })
              .from(flavours)
              .where(eq(flavours.id, body.flavourId))
              .limit(1);
            if (!flav) {
              return NextResponse.json({ error: "Flavour not found" }, { status: 400 });
            }
            updates.flavourLabel = flav.name;
          } else {
            updates.flavourId = null;
            updates.flavourLabel = "";
          }
        } else if (typeof body.flavourLabel === "string") {
          updates.flavourLabel = body.flavourLabel;
        }

        if (Object.keys(updates).length === 0) {
          return NextResponse.json({ error: "flavourId or flavourLabel required" }, { status: 400 });
        }

        // Flavour change means kitchen needs to pack again.
        updates.prepCompletedAt = null;

        const [updated] = await db
          .update(jobHookahs)
          .set(updates)
          .where(and(eq(jobHookahs.id, assignmentId), eq(jobHookahs.jobId, jobId)))
          .returning();

        if (!updated) {
          return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
        }

        const label = updated.flavourLabel?.trim() || "cleared";
        await db.insert(jobEvents).values({
          jobId,
          jobHookahId: assignmentId,
          type: "note",
          message: `Flavour set · ${label}`,
          createdBy: session.name,
        });

        return NextResponse.json(updated);
      }

      case "flag_issue": {
        const assignmentId = body.assignmentId;
        if (typeof assignmentId !== "number") {
          return NextResponse.json({ error: "assignmentId required" }, { status: 400 });
        }

        const [assignment] = await db
          .select()
          .from(jobHookahs)
          .where(and(eq(jobHookahs.id, assignmentId), eq(jobHookahs.jobId, jobId)))
          .limit(1);

        if (!assignment) {
          return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
        }

        const clearing = assignment.issueFlag;
        const [updated] = await db
          .update(jobHookahs)
          .set({ issueFlag: !clearing })
          .where(eq(jobHookahs.id, assignmentId))
          .returning();

        if (!clearing) {
          await db
            .update(jobs)
            .set({ incidentCount: sql`${jobs.incidentCount} + 1` })
            .where(eq(jobs.id, jobId));
        }

        const note =
          typeof body.note === "string" && body.note.trim()
            ? body.note.trim()
            : clearing
              ? "Issue resolved"
              : "Issue flagged";

        await db.insert(jobEvents).values({
          jobId,
          jobHookahId: assignmentId,
          type: clearing ? "note" : "issue",
          message: note,
          createdBy: session.name,
        });

        return NextResponse.json(updated);
      }

      case "note": {
        const assignmentId = body.assignmentId;
        if (typeof assignmentId !== "number") {
          return NextResponse.json({ error: "assignmentId required" }, { status: 400 });
        }
        if (!body.note || typeof body.note !== "string") {
          return NextResponse.json({ error: "note required" }, { status: 400 });
        }

        const [assignment] = await db
          .select()
          .from(jobHookahs)
          .where(and(eq(jobHookahs.id, assignmentId), eq(jobHookahs.jobId, jobId)))
          .limit(1);

        if (!assignment) {
          return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
        }

        const appendNote = (existing: string | null, note: string) =>
          existing && existing.trim() ? `${existing}\n${note}` : note;

        const noteField =
          assignment.status === "returned"
            ? { returnNotes: appendNote(assignment.returnNotes, body.note) }
            : { outNotes: appendNote(assignment.outNotes, body.note) };

        const [updated] = await db
          .update(jobHookahs)
          .set(noteField)
          .where(eq(jobHookahs.id, assignmentId))
          .returning();

        await db.insert(jobEvents).values({
          jobId,
          jobHookahId: assignmentId,
          type: "note",
          message: body.note,
          createdBy: session.name,
        });

        return NextResponse.json(updated);
      }

      case "set_guest_pay_tier": {
        const assignmentId = body.assignmentId;
        const tier = body.guestPayTier;
        if (typeof assignmentId !== "number") {
          return NextResponse.json({ error: "assignmentId required" }, { status: 400 });
        }
        if (!isGuestPayTier(tier)) {
          return NextResponse.json(
            { error: "guestPayTier must be standard or unlimited" },
            { status: 400 },
          );
        }

        const [updated] = await db
          .update(jobHookahs)
          .set({ guestPayTier: tier })
          .where(and(eq(jobHookahs.id, assignmentId), eq(jobHookahs.jobId, jobId)))
          .returning();

        if (!updated) {
          return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
        }

        await db.insert(jobEvents).values({
          jobId,
          jobHookahId: assignmentId,
          type: "note",
          message: `Guest pay set · ${guestPayTierLabel(tier)}`,
          createdBy: session.name,
        });

        return NextResponse.json(updated);
      }

      case "push_refill_terminal": {
        const assignmentId = body.assignmentId;
        if (typeof assignmentId !== "number") {
          return NextResponse.json({ error: "assignmentId required" }, { status: 400 });
        }

        const [assignment] = await db
          .select()
          .from(jobHookahs)
          .where(and(eq(jobHookahs.id, assignmentId), eq(jobHookahs.jobId, jobId)))
          .limit(1);

        if (!assignment) {
          return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
        }

        const serviceRequestId =
          typeof body.serviceRequestId === "number" ? body.serviceRequestId : null;
        let flavourLabel =
          typeof body.flavourLabel === "string" ? body.flavourLabel.trim() : "";
        const pricing = await getPricingForJob(jobId);
        let amountCents =
          typeof body.amountCents === "number"
            ? Math.round(body.amountCents)
            : defaultRefillCentsForTier(
                assignment.guestPayTier as GuestPayTier | null,
                pricing,
              );

        if (serviceRequestId) {
          const [req] = await db
            .select()
            .from(serviceRequests)
            .where(eq(serviceRequests.id, serviceRequestId))
            .limit(1);
          if (req && req.jobHookahId === assignmentId) {
            flavourLabel = req.flavourLabel || flavourLabel;
            if (typeof req.priceCents === "number") amountCents = req.priceCents;
            if (req.payPreference === "phone") {
              const guestPay = await findGuestRefillPayment(serviceRequestId);
              if (guestPay?.status === "pending") {
                await db
                  .update(payments)
                  .set({ status: "cancelled", updatedAt: new Date() })
                  .where(eq(payments.id, guestPay.id));
              }
              await db
                .update(serviceRequests)
                .set({ payPreference: "terminal" })
                .where(eq(serviceRequests.id, serviceRequestId));
            }
          }
        }

        if (amountCents < 100) {
          return NextResponse.json(
            { error: "No charge to push — refill is included" },
            { status: 400 },
          );
        }

        const { pushJobPaymentToTerminal } = await import(
          "@/lib/terminal-checkout"
        );
        const result = await pushJobPaymentToTerminal({
          jobId,
          kind: "refill",
          amountCents,
          label: `Refill · ${flavourLabel || assignment.flavourLabel || "flavour"} + HST`,
          jobHookahId: assignmentId,
          createdBy: session.name,
        });
        if (!result.ok) {
          return NextResponse.json(
            {
              error:
                result.reason === "terminal_not_configured"
                  ? "Set Terminal device in Settings → Square"
                  : result.reason,
            },
            { status: result.reason === "terminal_not_configured" ? 503 : 400 },
          );
        }
        return NextResponse.json({
          ok: true,
          paymentId: result.paymentId,
          terminalCheckoutId: result.terminalCheckoutId,
        });
      }

      case "mark_onsite_paid": {
        const assignmentId = body.assignmentId;
        if (typeof assignmentId !== "number") {
          return NextResponse.json({ error: "assignmentId required" }, { status: 400 });
        }

        const [assignment] = await db
          .select()
          .from(jobHookahs)
          .where(and(eq(jobHookahs.id, assignmentId), eq(jobHookahs.jobId, jobId)))
          .limit(1);

        if (!assignment) {
          return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
        }
        if (!isGuestPayTier(assignment.guestPayTier)) {
          return NextResponse.json(
            { error: "Set guest pay tier first", code: "NEED_GUEST_TIER" },
            { status: 409 },
          );
        }

        const existing = await db
          .select({ id: payments.id })
          .from(payments)
          .where(
            and(
              eq(payments.jobId, jobId),
              eq(payments.jobHookahId, assignmentId),
              eq(payments.kind, "onsite_unit"),
              eq(payments.status, "succeeded"),
            ),
          )
          .limit(1);

        if (existing.length > 0) {
          return NextResponse.json({ ok: true, alreadyPaid: true });
        }

        const pricing = await getPricingForJob(jobId);
        const exclusiveCents = guestPayTierUnitCents(
          assignment.guestPayTier,
          pricing,
        );
        const amountCents = withHstCents(exclusiveCents, pricing.hstRate);
        const label = `${guestPayTierLabel(assignment.guestPayTier, pricing)} + HST`;

        if (body.channel === "terminal") {
          const { pushJobPaymentToTerminal } = await import(
            "@/lib/terminal-checkout"
          );
          const result = await pushJobPaymentToTerminal({
            jobId,
            kind: "onsite_unit",
            amountCents: exclusiveCents,
            label,
            jobHookahId: assignmentId,
            createdBy: session.name,
          });
          if (!result.ok) {
            return NextResponse.json(
              {
                error:
                  result.reason === "terminal_not_configured"
                    ? "Set SQUARE_TERMINAL_DEVICE_ID to collect on Terminal"
                    : result.reason,
              },
              { status: result.reason === "terminal_not_configured" ? 503 : 400 },
            );
          }
          return NextResponse.json({
            ok: true,
            channel: "terminal",
            paymentId: result.paymentId,
            terminalCheckoutId: result.terminalCheckoutId,
          });
        }

        const now = new Date();
        const [row] = await db
          .insert(payments)
          .values({
            jobId,
            jobHookahId: assignmentId,
            kind: "onsite_unit",
            status: "succeeded",
            amountCents,
            label,
            idempotencyKey: `onsite-${assignmentId}-${randomUUID()}`,
            createdBy: session.name,
            paidAt: now,
          })
          .returning();

        await db.insert(jobEvents).values({
          jobId,
          jobHookahId: assignmentId,
          type: "note",
          message: `Guest unit paid · ${label}`,
          createdBy: session.name,
        });

        return NextResponse.json({ payment: row, channel: "manual" });
      }

      case "add_guest_tip": {
        const amountCents =
          typeof body.amountCents === "number"
            ? Math.round(body.amountCents)
            : typeof body.amountDollars === "number"
              ? Math.round(body.amountDollars * 100)
              : NaN;
        if (!Number.isFinite(amountCents) || amountCents <= 0) {
          return NextResponse.json({ error: "Positive tip amount required" }, { status: 400 });
        }

        const assignmentId =
          typeof body.assignmentId === "number" ? body.assignmentId : null;
        const now = new Date();
        const [row] = await db
          .insert(payments)
          .values({
            jobId,
            jobHookahId: assignmentId,
            kind: "tip",
            status: "succeeded",
            amountCents,
            label: assignmentId ? `Tip · unit #${assignmentId}` : "Tip",
            idempotencyKey: `tip-${jobId}-${randomUUID()}`,
            createdBy: session.name,
            paidAt: now,
          })
          .returning();

        const { syncJobTipCents } = await import("@/lib/payments");
        const tipCents = await syncJobTipCents(jobId);

        await db.insert(jobEvents).values({
          jobId,
          jobHookahId: assignmentId,
          type: "note",
          message: `Tip recorded · $${(amountCents / 100).toFixed(2)}`,
          createdBy: session.name,
        });

        return NextResponse.json({ payment: row, tipCents });
      }

      case "collect_tip_terminal": {
        const amountCents =
          typeof body.amountCents === "number"
            ? Math.round(body.amountCents)
            : typeof body.amountDollars === "number"
              ? Math.round(body.amountDollars * 100)
              : NaN;
        if (!Number.isFinite(amountCents) || amountCents < 100) {
          return NextResponse.json(
            { error: "Tip must be at least $1.00" },
            { status: 400 },
          );
        }

        const assignmentId =
          typeof body.assignmentId === "number" ? body.assignmentId : null;
        const { pushJobPaymentToTerminal } = await import(
          "@/lib/terminal-checkout"
        );
        const result = await pushJobPaymentToTerminal({
          jobId,
          kind: "tip",
          amountCents,
          label: assignmentId
            ? `Tip · unit #${assignmentId}`
            : "Tip",
          jobHookahId: assignmentId,
          createdBy: session.name,
        });
        if (!result.ok) {
          return NextResponse.json(
            {
              error:
                result.reason === "terminal_not_configured"
                  ? "Set Terminal device in Settings → Square"
                  : result.reason,
            },
            {
              status:
                result.reason === "terminal_not_configured" ? 503 : 400,
            },
          );
        }
        return NextResponse.json({
          ok: true,
          channel: "terminal",
          paymentId: result.paymentId,
          terminalCheckoutId: result.terminalCheckoutId,
          amountCents: result.amountCents,
        });
      }

      case "ensure_guest_token": {
        const assignmentId = body.assignmentId;
        if (typeof assignmentId !== "number") {
          return NextResponse.json({ error: "assignmentId required" }, { status: 400 });
        }

        const [assignment] = await db
          .select()
          .from(jobHookahs)
          .where(and(eq(jobHookahs.id, assignmentId), eq(jobHookahs.jobId, jobId)))
          .limit(1);

        if (!assignment) {
          return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
        }

        if (assignment.guestToken && body.regenerate !== true) {
          return NextResponse.json(assignment);
        }

        const guestToken = createGuestToken();
        const [updated] = await db
          .update(jobHookahs)
          .set({ guestToken })
          .where(eq(jobHookahs.id, assignmentId))
          .returning();

        await db.insert(jobEvents).values({
          jobId,
          jobHookahId: assignmentId,
          type: "note",
          message: body.regenerate === true ? "Guest QR regenerated" : "Guest QR created",
          createdBy: session.name,
        });

        return NextResponse.json(updated);
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Action failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
