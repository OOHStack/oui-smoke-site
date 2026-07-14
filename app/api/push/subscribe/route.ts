import { requireApiSession } from "@/lib/auth/api";
import { getDb } from "@/lib/db";
import { pushSubscriptions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const { session, error } = await requireApiSession();
  if (error) return error;

  try {
    const body = await request.json();
    const endpoint = typeof body?.endpoint === "string" ? body.endpoint : "";
    const p256dh = typeof body?.keys?.p256dh === "string" ? body.keys.p256dh : "";
    const auth = typeof body?.keys?.auth === "string" ? body.keys.auth : "";

    if (!endpoint || !p256dh || !auth) {
      return NextResponse.json(
        { error: "Invalid push subscription" },
        { status: 400 },
      );
    }

    const userAgent = request.headers.get("user-agent")?.slice(0, 280) || "";
    const db = getDb();
    const now = new Date();

    const [existing] = await db
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.endpoint, endpoint))
      .limit(1);

    if (existing) {
      const [updated] = await db
        .update(pushSubscriptions)
        .set({
          p256dh,
          auth,
          userAgent,
          createdBy: session.name,
          updatedAt: now,
        })
        .where(eq(pushSubscriptions.id, existing.id))
        .returning();
      return NextResponse.json({ ok: true, subscription: updated });
    }

    const [created] = await db
      .insert(pushSubscriptions)
      .values({
        endpoint,
        p256dh,
        auth,
        userAgent,
        createdBy: session.name,
      })
      .returning();

    return NextResponse.json({ ok: true, subscription: created }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Subscribe failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const { error } = await requireApiSession();
  if (error) return error;

  try {
    const body = await request.json();
    const endpoint = typeof body?.endpoint === "string" ? body.endpoint : "";
    if (!endpoint) {
      return NextResponse.json({ error: "endpoint required" }, { status: 400 });
    }

    const db = getDb();
    await db
      .delete(pushSubscriptions)
      .where(eq(pushSubscriptions.endpoint, endpoint));

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unsubscribe failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
