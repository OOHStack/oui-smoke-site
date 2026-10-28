import { requireApiSession } from "@/lib/auth/api";
import { getDb } from "@/lib/db";
import { hookahs } from "@/lib/db/schema";
import { getSiteUrl } from "@/lib/guest";
import { unitServeUrl, unitStickerSvg } from "@/lib/unit-sticker";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { error } = await requireApiSession();
  if (error) return error;
  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!Number.isSafeInteger(id) || id < 1) return NextResponse.json({ error: "Valid unit id required" }, { status: 400 });
  const [unit] = await getDb().select().from(hookahs).where(eq(hookahs.id, id)).limit(1);
  if (!unit) return NextResponse.json({ error: "Unit not found" }, { status: 404 });
  return new Response(await unitStickerSvg(unitServeUrl(getSiteUrl(), unit.qrToken), unit.modelNumber), {
    headers: { "Content-Type": "image/svg+xml", "Content-Disposition": `attachment; filename="oui-smoke-unit-${unit.modelNumber}-1in.svg"`, "Cache-Control": "private, no-store" },
  });
}
