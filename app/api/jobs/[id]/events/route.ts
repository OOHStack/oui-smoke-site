import { requireApiSession } from "@/lib/auth/api";
import { getDb } from "@/lib/db";
import { jobEvents } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { error } = await requireApiSession();
  if (error) return error;

  const { id: idParam } = await context.params;
  const jobId = Number(idParam);
  if (!Number.isFinite(jobId)) {
    return NextResponse.json({ error: "Invalid job id" }, { status: 400 });
  }

  const db = getDb();
  const events = await db
    .select()
    .from(jobEvents)
    .where(eq(jobEvents.jobId, jobId))
    .orderBy(desc(jobEvents.createdAt));

  return NextResponse.json(events);
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

    if (!body?.message || typeof body.message !== "string") {
      return NextResponse.json({ error: "message required" }, { status: 400 });
    }

    const validTypes = [
      "note",
      "status_change",
      "sent_out",
      "returned",
      "checked",
      "refill",
      "issue",
      "alarm",
      "created",
    ] as const;
    const eventType =
      typeof body.type === "string" && validTypes.includes(body.type)
        ? body.type
        : "note";

    const db = getDb();
    const [event] = await db
      .insert(jobEvents)
      .values({
        jobId,
        jobHookahId: body.jobHookahId ?? null,
        type: eventType,
        message: body.message,
        createdBy: session.name,
      })
      .returning();

    return NextResponse.json(event, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Create failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
