import { requireApiSession } from "@/lib/auth/api";
import { getSiteUrl } from "@/lib/guest";
import { getDb } from "@/lib/db";
import { hookahs, jobHookahs } from "@/lib/db/schema";
import { unitServeUrl } from "@/lib/unit-sticker";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import QRCode from "qrcode";

export async function GET(request: Request) {
  const { error } = await requireApiSession();
  if (error) return error;

  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  const rawHookahId = url.searchParams.get("hookahId");
  const hookahId = Number(rawHookahId);
  if (rawHookahId != null && (!Number.isSafeInteger(hookahId) || hookahId < 1)) {
    return NextResponse.json({ error: "Valid hookahId required" }, { status: 400 });
  }
  if (rawHookahId == null && !token) {
    return NextResponse.json({ error: "hookahId or token required" }, { status: 400 });
  }

  const db = getDb();
  const fields = { qrToken: hookahs.qrToken, modelNumber: hookahs.modelNumber };
  // New callers identify the physical unit directly. Translate older job-token
  // callers too, so every screen encodes the reusable sticker's permanent URL.
  const [unit] = rawHookahId != null
    ? await db.select(fields).from(hookahs).where(eq(hookahs.id, hookahId)).limit(1)
    : await db.select(fields).from(jobHookahs)
        .innerJoin(hookahs, eq(hookahs.id, jobHookahs.hookahId))
        .where(eq(jobHookahs.guestToken, token!)).limit(1);
  if (!unit) {
    return NextResponse.json({ error: "Unit not found" }, { status: 404 });
  }

  const serveUrl = unitServeUrl(getSiteUrl(), unit.qrToken);
  const dataUrl = await QRCode.toDataURL(serveUrl, {
    errorCorrectionLevel: "M",
    margin: 4,
    width: 512,
    color: { dark: "#000000", light: "#ffffff" },
  });

  return NextResponse.json(
    { url: serveUrl, qrDataUrl: dataUrl, modelNumber: unit.modelNumber },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
