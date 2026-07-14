import { requireApiSession } from "@/lib/auth/api";
import { getDb } from "@/lib/db";
import {
  flavours,
  hookahRefills,
  jobHookahs,
  serviceRequests,
} from "@/lib/db/schema";
import { asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { error } = await requireApiSession();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const activeOnly = searchParams.get("active") === "1";

  const db = getDb();
  const rows = activeOnly
    ? await db
        .select()
        .from(flavours)
        .where(eq(flavours.active, true))
        .orderBy(asc(flavours.name))
    : await db.select().from(flavours).orderBy(asc(flavours.name));

  return NextResponse.json(rows);
}

export async function POST(request: Request) {
  const { error } = await requireApiSession();
  if (error) return error;

  try {
    const body = await request.json();
    const name = body?.name;
    const kind = body?.kind;

    if (!name || typeof name !== "string") {
      return NextResponse.json({ error: "name required" }, { status: 400 });
    }

    if (kind !== "single" && kind !== "mix") {
      return NextResponse.json({ error: "kind must be single or mix" }, { status: 400 });
    }

    const db = getDb();
    const [row] = await db
      .insert(flavours)
      .values({
        name,
        kind,
        components: typeof body.components === "string" ? body.components : "",
        description: typeof body.description === "string" ? body.description : "",
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

    const updates: Partial<typeof flavours.$inferInsert> = {};
    if (body.name !== undefined) updates.name = body.name;
    if (body.kind !== undefined) {
      if (body.kind !== "single" && body.kind !== "mix") {
        return NextResponse.json({ error: "kind must be single or mix" }, { status: 400 });
      }
      updates.kind = body.kind;
    }
    if (body.components !== undefined) updates.components = body.components;
    if (body.description !== undefined) updates.description = body.description;
    if (body.active !== undefined) updates.active = Boolean(body.active);

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    const db = getDb();
    const [row] = await db
      .update(flavours)
      .set(updates)
      .where(eq(flavours.id, id))
      .returning();

    if (!row) {
      return NextResponse.json({ error: "Flavour not found" }, { status: 404 });
    }

    return NextResponse.json(row);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Update failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const { error } = await requireApiSession();
  if (error) return error;

  try {
    const body = await request.json();
    const id = body?.id;

    if (id == null || typeof id !== "number") {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }

    const db = getDb();
    const [existing] = await db.select().from(flavours).where(eq(flavours.id, id)).limit(1);
    if (!existing) {
      return NextResponse.json({ error: "Flavour not found" }, { status: 404 });
    }

    // Keep history labels; clear FK refs so the row can be removed
    await db
      .update(jobHookahs)
      .set({ flavourId: null })
      .where(eq(jobHookahs.flavourId, id));
    await db
      .update(serviceRequests)
      .set({ flavourId: null })
      .where(eq(serviceRequests.flavourId, id));
    await db
      .update(hookahRefills)
      .set({ flavourId: null })
      .where(eq(hookahRefills.flavourId, id));

    await db.delete(flavours).where(eq(flavours.id, id));

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("flavour delete failed", err);
    const message = err instanceof Error ? err.message : "Delete failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
