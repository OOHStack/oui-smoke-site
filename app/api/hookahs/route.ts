import { requireApiAdmin, requireApiSession } from "@/lib/auth/api";
import { getDb } from "@/lib/db";
import { hookahs, jobHookahs } from "@/lib/db/schema";
import { asc, count, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function GET() {
  const { error } = await requireApiSession();
  if (error) return error;

  const db = getDb();
  const rows = await db.select().from(hookahs).orderBy(asc(hookahs.modelNumber));
  return NextResponse.json(rows);
}

export async function POST(request: Request) {
  const { error } = await requireApiSession();
  if (error) return error;

  try {
    const body = await request.json();
    const modelNumber = body?.modelNumber;

    if (modelNumber == null || typeof modelNumber !== "number") {
      return NextResponse.json({ error: "modelNumber required" }, { status: 400 });
    }

    const db = getDb();
    const [row] = await db
      .insert(hookahs)
      .values({
        modelNumber,
        label: typeof body.label === "string" ? body.label : null,
        notes: typeof body.notes === "string" ? body.notes : "",
      })
      .returning();

    return NextResponse.json(row, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Create failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const { error } = await requireApiSession();
  if (error) return error;

  try {
    const body = await request.json();
    const id = body?.id;

    if (id == null || typeof id !== "number") {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }

    const updates: Partial<typeof hookahs.$inferInsert> = {};
    if (body.status != null) updates.status = body.status;
    if (body.label !== undefined) updates.label = body.label;
    if (body.notes !== undefined) updates.notes = body.notes;
    if (body.modelNumber !== undefined) {
      if (typeof body.modelNumber !== "number" || !Number.isFinite(body.modelNumber)) {
        return NextResponse.json({ error: "modelNumber must be a number" }, { status: 400 });
      }
      updates.modelNumber = body.modelNumber;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    const db = getDb();
    const [row] = await db
      .update(hookahs)
      .set(updates)
      .where(eq(hookahs.id, id))
      .returning();

    if (!row) {
      return NextResponse.json({ error: "Hookah not found" }, { status: 404 });
    }

    return NextResponse.json(row);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Update failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const { error } = await requireApiAdmin();
  if (error) return error;

  try {
    const body = await request.json();
    const id = body?.id;

    if (id == null || typeof id !== "number") {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }

    const db = getDb();
    const [usage] = await db
      .select({ n: count() })
      .from(jobHookahs)
      .where(eq(jobHookahs.hookahId, id));

    if ((usage?.n ?? 0) > 0) {
      return NextResponse.json(
        {
          error:
            "This hookah is on a job history — mark it retired instead of deleting",
        },
        { status: 409 },
      );
    }

    const [deleted] = await db.delete(hookahs).where(eq(hookahs.id, id)).returning();
    if (!deleted) {
      return NextResponse.json({ error: "Hookah not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Delete failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
