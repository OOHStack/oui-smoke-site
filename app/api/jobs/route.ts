import { requireApiSession } from "@/lib/auth/api";
import { getDb } from "@/lib/db";
import { hookahOutOnOtherActiveJob } from "@/lib/fleet";
import { createClientToken } from "@/lib/guest";
import { getPaymentSettings } from "@/lib/payment-settings";
import { normalizePaymentModel } from "@/lib/payment-model";
import { jobEvents, jobHookahs, jobs } from "@/lib/db/schema";
import { and, count, desc, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";

type FlavourAssignment = {
  hookahId: number;
  flavourId?: number;
  flavourLabel?: string;
};

export async function GET(request: Request) {
  const { error } = await requireApiSession();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const statusFilter = searchParams.get("status");
  const activeOnly = searchParams.get("active") === "1";

  const db = getDb();

  const conditions = [];
  if (statusFilter) {
    conditions.push(
      eq(jobs.status, statusFilter as "draft" | "confirmed" | "active" | "completed" | "cancelled")
    );
  }
  if (activeOnly) {
    conditions.push(inArray(jobs.status, ["active", "confirmed"]));
  }

  const jobRows =
    conditions.length > 0
      ? await db
          .select()
          .from(jobs)
          .where(and(...conditions))
          .orderBy(desc(jobs.updatedAt))
      : await db.select().from(jobs).orderBy(desc(jobs.updatedAt));

  const countRows = await db
    .select({ jobId: jobHookahs.jobId, assignmentCount: count() })
    .from(jobHookahs)
    .groupBy(jobHookahs.jobId);

  const countMap = new Map(countRows.map((r) => [r.jobId, Number(r.assignmentCount)]));

  const result = jobRows.map((job) => ({
    ...job,
    assignmentCount: countMap.get(job.id) ?? 0,
  }));

  return NextResponse.json(result);
}

export async function POST(request: Request) {
  const { session, error } = await requireApiSession();
  if (error) return error;

  try {
    const body = await request.json();

    if (!body?.title || typeof body.title !== "string") {
      return NextResponse.json({ error: "title required" }, { status: 400 });
    }
    if (!body?.clientName || typeof body.clientName !== "string") {
      return NextResponse.json({ error: "clientName required" }, { status: 400 });
    }

    const db = getDb();

    const hookahIds: number[] = Array.isArray(body.hookahIds)
      ? body.hookahIds.filter((id: unknown) => typeof id === "number")
      : [];

    const flavourAssignments: FlavourAssignment[] = Array.isArray(body.flavourAssignments)
      ? body.flavourAssignments.filter(
          (a: unknown) =>
            a != null &&
            typeof a === "object" &&
            "hookahId" in a &&
            typeof (a as FlavourAssignment).hookahId === "number",
        )
      : [];

    const assignmentMap = new Map<number, FlavourAssignment>();

    for (const hookahId of hookahIds) {
      assignmentMap.set(hookahId, { hookahId });
    }
    for (const assignment of flavourAssignments) {
      assignmentMap.set(assignment.hookahId, {
        hookahId: assignment.hookahId,
        flavourId: assignment.flavourId,
        flavourLabel: assignment.flavourLabel,
      });
    }

    for (const hookahId of assignmentMap.keys()) {
      // No job yet — exclude id 0 so any active "out" assignment conflicts
      if (await hookahOutOnOtherActiveJob(db, hookahId, 0)) {
        return NextResponse.json(
          { error: "A selected hookah is already out on another active job" },
          { status: 409 },
        );
      }
    }

    const settings = await getPaymentSettings();
    const [job] = await db
      .insert(jobs)
      .values({
        title: body.title,
        clientName: body.clientName,
        clientEmail: body.clientEmail ?? "",
        clientPhone: body.clientPhone ?? "",
        location: body.location ?? "",
        startsAt: body.startsAt ? new Date(body.startsAt) : null,
        endsAt: body.endsAt ? new Date(body.endsAt) : null,
        bookedHours: body.bookedHours ?? 4,
        checkIntervalMinutes: body.checkIntervalMinutes ?? 45,
        guestCount: body.guestCount ?? null,
        quotedCents: body.quotedCents ?? null,
        depositPercent:
          body.depositPercent != null
            ? Number(body.depositPercent)
            : settings.defaultDepositPercent,
        staffNames: body.staffNames ?? "",
        packingNotes: body.packingNotes ?? "",
        status: body.status ?? "draft",
        paymentModel: normalizePaymentModel(body.paymentModel),
        clientToken: createClientToken(),
      })
      .returning();

    if (assignmentMap.size > 0) {
      await db.insert(jobHookahs).values(
        [...assignmentMap.values()].map((a) => ({
          jobId: job.id,
          hookahId: a.hookahId,
          status: "staged" as const,
          flavourId: a.flavourId ?? null,
          flavourLabel: a.flavourLabel ?? "",
        })),
      );
    }

    await db.insert(jobEvents).values({
      jobId: job.id,
      type: "created",
      message: `Job "${job.title}" created`,
      createdBy: session.name,
    });

    return NextResponse.json(job, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Create failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
