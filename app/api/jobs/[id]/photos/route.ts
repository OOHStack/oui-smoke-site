import { del } from "@vercel/blob";
import { requireApiSession } from "@/lib/auth/api";
import { getDb } from "@/lib/db";
import { jobPhotos } from "@/lib/db/schema";
import { and, desc, eq } from "drizzle-orm";
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
  const photos = await db
    .select()
    .from(jobPhotos)
    .where(eq(jobPhotos.jobId, jobId))
    .orderBy(desc(jobPhotos.createdAt));

  return NextResponse.json({ photos });
}

export async function DELETE(request: Request, context: RouteContext) {
  const { error } = await requireApiSession();
  if (error) return error;

  const { id: idParam } = await context.params;
  const jobId = Number(idParam);
  if (!Number.isFinite(jobId)) {
    return NextResponse.json({ error: "Invalid job id" }, { status: 400 });
  }

  let body: { photoId?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (typeof body.photoId !== "number") {
    return NextResponse.json({ error: "photoId required" }, { status: 400 });
  }

  const db = getDb();
  const [photo] = await db
    .select()
    .from(jobPhotos)
    .where(and(eq(jobPhotos.id, body.photoId), eq(jobPhotos.jobId, jobId)))
    .limit(1);

  if (!photo) {
    return NextResponse.json({ error: "Photo not found" }, { status: 404 });
  }

  try {
    await del(photo.url, { token: process.env.BLOB_READ_WRITE_TOKEN });
  } catch (err) {
    console.error("blob delete failed", err);
  }

  await db.delete(jobPhotos).where(eq(jobPhotos.id, photo.id));

  return NextResponse.json({ ok: true });
}

export async function PATCH(request: Request, context: RouteContext) {
  const { session, error } = await requireApiSession();
  if (error) return error;

  const { id: idParam } = await context.params;
  const jobId = Number(idParam);
  if (!Number.isFinite(jobId)) {
    return NextResponse.json({ error: "Invalid job id" }, { status: 400 });
  }

  let body: {
    photoId?: number;
    approvedForSocial?: boolean;
    featured?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (typeof body.photoId !== "number") {
    return NextResponse.json({ error: "photoId required" }, { status: 400 });
  }

  const db = getDb();
  const [photo] = await db
    .select()
    .from(jobPhotos)
    .where(and(eq(jobPhotos.id, body.photoId), eq(jobPhotos.jobId, jobId)))
    .limit(1);

  if (!photo) {
    return NextResponse.json({ error: "Photo not found" }, { status: 404 });
  }

  const approvedForSocial =
    typeof body.approvedForSocial === "boolean"
      ? body.approvedForSocial
      : photo.approvedForSocial;
  const featured =
    typeof body.featured === "boolean" ? body.featured : photo.featured;

  const [updated] = await db
    .update(jobPhotos)
    .set({
      approvedForSocial,
      featured: approvedForSocial ? featured : false,
      reviewedAt: new Date(),
      reviewedBy: session?.name || session?.username || "ops",
    })
    .where(eq(jobPhotos.id, photo.id))
    .returning();

  return NextResponse.json({ photo: updated });
}
