import { put, del } from "@vercel/blob";
import { getDb } from "@/lib/db";
import { hookahs, jobEvents, jobHookahs, jobPhotos } from "@/lib/db/schema";
import { count, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

type RouteContext = { params: Promise<{ token: string }> };

const MAX_BYTES = 6 * 1024 * 1024;
const MAX_PHOTOS_PER_ASSIGNMENT = 30;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);

export async function GET(_request: Request, context: RouteContext) {
  const { token } = await context.params;
  if (!token || token.length < 10) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const db = getDb();
  const [assignment] = await db
    .select({ id: jobHookahs.id })
    .from(jobHookahs)
    .where(eq(jobHookahs.guestToken, token))
    .limit(1);

  if (!assignment) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const photos = await db
    .select({
      id: jobPhotos.id,
      url: jobPhotos.url,
      createdAt: jobPhotos.createdAt,
    })
    .from(jobPhotos)
    .where(eq(jobPhotos.jobHookahId, assignment.id));

  return NextResponse.json({ photos, count: photos.length });
}

export async function POST(request: Request, context: RouteContext) {
  const { token } = await context.params;
  if (!token || token.length < 10) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json({ error: "Photo uploads aren’t configured yet" }, { status: 503 });
  }

  const db = getDb();
  const [assignment] = await db
    .select({
      id: jobHookahs.id,
      jobId: jobHookahs.jobId,
      status: jobHookahs.status,
      modelNumber: hookahs.modelNumber,
    })
    .from(jobHookahs)
    .innerJoin(hookahs, eq(hookahs.id, jobHookahs.hookahId))
    .where(eq(jobHookahs.guestToken, token))
    .limit(1);

  if (!assignment) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (assignment.status !== "out") {
    return NextResponse.json(
      { error: "This hookah is no longer on the floor" },
      { status: 400 },
    );
  }

  const [countRow] = await db
    .select({ n: count() })
    .from(jobPhotos)
    .where(eq(jobPhotos.jobHookahId, assignment.id));

  if ((countRow?.n ?? 0) >= MAX_PHOTOS_PER_ASSIGNMENT) {
    return NextResponse.json(
      { error: "Photo limit reached for this hookah — thanks for sharing" },
      { status: 429 },
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid upload" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Choose a photo to upload" }, { status: 400 });
  }

  const consentRaw = form.get("consentAgreed");
  const consentAgreed =
    consentRaw === "true" || consentRaw === "1" || consentRaw === "on";
  if (!consentAgreed) {
    return NextResponse.json(
      { error: "Please agree to the photo consent before uploading" },
      { status: 400 },
    );
  }

  let socialHandle =
    typeof form.get("socialHandle") === "string"
      ? String(form.get("socialHandle")).trim().slice(0, 80)
      : "";
  if (socialHandle && !socialHandle.startsWith("@")) {
    socialHandle = `@${socialHandle.replace(/^@+/, "")}`;
  }
  // strip spaces / weird chars lightly
  socialHandle = socialHandle.replace(/\s+/g, "");

  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "Photo is too large — try one under 6 MB" },
      { status: 400 },
    );
  }

  const contentType = file.type || "image/jpeg";
  if (!ALLOWED.has(contentType) && !contentType.startsWith("image/")) {
    return NextResponse.json({ error: "Only image uploads are allowed" }, { status: 400 });
  }

  const ext =
    contentType.includes("png")
      ? "png"
      : contentType.includes("webp")
        ? "webp"
        : contentType.includes("heic") || contentType.includes("heif")
          ? "heic"
          : "jpg";

  const pathname = `jobs/${assignment.jobId}/hookah-${assignment.modelNumber}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  let blob;
  try {
    blob = await put(pathname, file, {
      access: "public",
      contentType,
      addRandomSuffix: false,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
  } catch (err) {
    console.error("blob put failed", err);
    return NextResponse.json({ error: "Upload failed — try again" }, { status: 500 });
  }

  try {
    const [row] = await db
      .insert(jobPhotos)
      .values({
        jobId: assignment.jobId,
        jobHookahId: assignment.id,
        url: blob.url,
        downloadUrl: blob.downloadUrl,
        pathname: blob.pathname,
        contentType,
        sizeBytes: file.size,
        consentAgreed: true,
        socialHandle,
        consentedAt: new Date(),
      })
      .returning();

    await db.insert(jobEvents).values({
      jobId: assignment.jobId,
      jobHookahId: assignment.id,
      type: "note",
      message: socialHandle
        ? `Guest shared a photo from #${assignment.modelNumber} (${socialHandle})`
        : `Guest shared a photo from #${assignment.modelNumber}`,
      createdBy: "guest",
    });

    return NextResponse.json({ ok: true, photo: row });
  } catch (err) {
    console.error("photo db insert failed", err);
    try {
      await del(blob.url, { token: process.env.BLOB_READ_WRITE_TOKEN });
    } catch {
      /* ignore cleanup failure */
    }
    return NextResponse.json({ error: "Couldn’t save photo" }, { status: 500 });
  }
}
