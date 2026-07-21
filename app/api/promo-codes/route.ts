import { requireApiAdmin, requireApiSession } from "@/lib/auth/api";
import { getDb } from "@/lib/db";
import { promoCodes } from "@/lib/db/schema";
import {
  normalizePromoCode,
  parsePromoCodeInput,
} from "@/lib/promo-codes";
import { asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const activeOnly = searchParams.get("active") === "1";

  // Public: active codes only (for book estimate). Full list requires session.
  if (activeOnly) {
    const db = getDb();
    const rows = await db
      .select({
        code: promoCodes.code,
        discountDollars: promoCodes.discountDollars,
        label: promoCodes.label,
      })
      .from(promoCodes)
      .where(eq(promoCodes.active, true))
      .orderBy(asc(promoCodes.code));
    return NextResponse.json({
      promoCodes: rows.map((r) => ({
        code: normalizePromoCode(r.code),
        discountDollars: r.discountDollars,
        label: r.label,
      })),
    });
  }

  const { error } = await requireApiSession();
  if (error) return error;

  const db = getDb();
  const rows = await db.select().from(promoCodes).orderBy(asc(promoCodes.code));
  return NextResponse.json({ promoCodes: rows });
}

export async function POST(request: Request) {
  const { error } = await requireApiAdmin();
  if (error) return error;

  try {
    const body = await request.json();
    const code = parsePromoCodeInput(body?.code);
    if (!code) {
      return NextResponse.json(
        { error: "Code required (letters, numbers, - or _)" },
        { status: 400 },
      );
    }

    const discountRaw = Number(body?.discountDollars);
    if (!Number.isFinite(discountRaw) || discountRaw < 0) {
      return NextResponse.json(
        { error: "discountDollars must be a non-negative number" },
        { status: 400 },
      );
    }
    const discountDollars = Math.round(discountRaw);
    const label =
      typeof body?.label === "string" && body.label.trim()
        ? body.label.trim().slice(0, 80)
        : `$${discountDollars} off`;

    const db = getDb();
    const [row] = await db
      .insert(promoCodes)
      .values({
        code,
        label,
        discountDollars,
        active: body?.active === false ? false : true,
        updatedAt: new Date(),
      })
      .returning();

    return NextResponse.json(row, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Create failed";
    if (message.includes("unique") || message.includes("duplicate")) {
      return NextResponse.json(
        { error: "That promo code already exists" },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const { error } = await requireApiAdmin();
  if (error) return error;

  try {
    const body = await request.json();
    const id = body?.id;
    if (id == null || typeof id !== "number") {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }

    const updates: Partial<typeof promoCodes.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (body.code !== undefined) {
      const code = parsePromoCodeInput(body.code);
      if (!code) {
        return NextResponse.json(
          { error: "Invalid code (letters, numbers, - or _)" },
          { status: 400 },
        );
      }
      updates.code = code;
    }
    if (body.label !== undefined) {
      updates.label =
        typeof body.label === "string" ? body.label.trim().slice(0, 80) : "";
    }
    if (body.discountDollars !== undefined) {
      const discountRaw = Number(body.discountDollars);
      if (!Number.isFinite(discountRaw) || discountRaw < 0) {
        return NextResponse.json(
          { error: "discountDollars must be a non-negative number" },
          { status: 400 },
        );
      }
      updates.discountDollars = Math.round(discountRaw);
    }
    if (body.active !== undefined) updates.active = Boolean(body.active);

    if (Object.keys(updates).length <= 1) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    const db = getDb();
    const [row] = await db
      .update(promoCodes)
      .set(updates)
      .where(eq(promoCodes.id, id))
      .returning();

    if (!row) {
      return NextResponse.json({ error: "Promo code not found" }, { status: 404 });
    }

    return NextResponse.json(row);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Update failed";
    if (message.includes("unique") || message.includes("duplicate")) {
      return NextResponse.json(
        { error: "That promo code already exists" },
        { status: 409 },
      );
    }
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
    const [existing] = await db
      .select()
      .from(promoCodes)
      .where(eq(promoCodes.id, id))
      .limit(1);
    if (!existing) {
      return NextResponse.json({ error: "Promo code not found" }, { status: 404 });
    }

    await db.delete(promoCodes).where(eq(promoCodes.id, id));
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("promo code delete failed", err);
    const message = err instanceof Error ? err.message : "Delete failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
