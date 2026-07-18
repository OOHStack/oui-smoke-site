import { requireApiSession } from "@/lib/auth/api";
import { getDb } from "@/lib/db";
import { jobEvents, serviceRequests } from "@/lib/db/schema";
import {
  fulfillFloorOrder,
  listFloorAssignCandidates,
  type FloorPayChannel,
} from "@/lib/ops/fulfill-floor-order";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { error } = await requireApiSession();
  if (error) return error;

  const { id: idParam } = await context.params;
  const id = Number(idParam);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const db = getDb();
  const [existing] = await db
    .select()
    .from(serviceRequests)
    .where(eq(serviceRequests.id, id))
    .limit(1);
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const candidates = await listFloorAssignCandidates(existing.jobId);
  return NextResponse.json({
    request: existing,
    candidates,
  });
}

export async function PATCH(request: Request, context: RouteContext) {
  const { session, error } = await requireApiSession();
  if (error) return error;

  const { id: idParam } = await context.params;
  const id = Number(idParam);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  let body: {
    action?: string;
    assignmentId?: number;
    hookahId?: number;
    payChannel?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const action = body.action;
  if (
    action !== "acknowledge" &&
    action !== "resolve" &&
    action !== "cancel" &&
    action !== "fulfill_floor_order"
  ) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const db = getDb();
  const [existing] = await db
    .select()
    .from(serviceRequests)
    .where(eq(serviceRequests.id, id))
    .limit(1);

  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (action === "fulfill_floor_order") {
    const payChannel = body.payChannel as FloorPayChannel | undefined;
    if (
      payChannel !== "cash" &&
      payChannel !== "already_paid" &&
      payChannel !== "terminal"
    ) {
      return NextResponse.json(
        { error: "Choose cash, already paid, or terminal" },
        { status: 400 },
      );
    }
    const result = await fulfillFloorOrder({
      serviceRequestId: id,
      assignmentId:
        typeof body.assignmentId === "number" ? body.assignmentId : undefined,
      hookahId: typeof body.hookahId === "number" ? body.hookahId : undefined,
      payChannel,
      staffName: session.name,
    });
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, code: result.code },
        { status: result.status },
      );
    }
    return NextResponse.json(result);
  }

  const now = new Date();
  let updated;

  if (action === "acknowledge") {
    if (existing.status !== "open" && existing.status !== "acknowledged") {
      return NextResponse.json({ error: "Request is not active" }, { status: 400 });
    }
    const keepClaim =
      existing.status === "acknowledged" && existing.acknowledgedBy;
    [updated] = await db
      .update(serviceRequests)
      .set({
        status: "acknowledged",
        acknowledgedAt: existing.acknowledgedAt ?? now,
        acknowledgedBy: keepClaim ? existing.acknowledgedBy : session.name,
        acknowledgedByUserId: keepClaim
          ? existing.acknowledgedByUserId
          : session.userId,
      })
      .where(eq(serviceRequests.id, id))
      .returning();

    if (!keepClaim) {
      await db.insert(jobEvents).values({
        jobId: existing.jobId,
        jobHookahId: existing.jobHookahId,
        type: "note",
        message: `I’m on it — guest ${existing.type} request`,
        createdBy: session.name,
      });
    }
  } else if (action === "resolve") {
    [updated] = await db
      .update(serviceRequests)
      .set({
        status: "resolved",
        resolvedAt: now,
        resolvedBy: session.name,
        acknowledgedAt: existing.acknowledgedAt ?? now,
        acknowledgedBy: existing.acknowledgedBy || session.name,
        acknowledgedByUserId:
          existing.acknowledgedByUserId ?? session.userId,
      })
      .where(eq(serviceRequests.id, id))
      .returning();

    await db.insert(jobEvents).values({
      jobId: existing.jobId,
      jobHookahId: existing.jobHookahId,
      type: "note",
      message: `Resolved guest ${existing.type} request`,
      createdBy: session.name,
    });
  } else {
    [updated] = await db
      .update(serviceRequests)
      .set({ status: "cancelled", resolvedAt: now, resolvedBy: session.name })
      .where(eq(serviceRequests.id, id))
      .returning();
  }

  return NextResponse.json(updated);
}
