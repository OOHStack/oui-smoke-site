import { getDb } from "@/lib/db";
import { hookahs, jobEvents, jobHookahs, jobs } from "@/lib/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";

type RouteContext = { params: Promise<{ token: string }> };

function clean(value: unknown, max = 500) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

export async function POST(request: Request, context: RouteContext) {
  const { token } = await context.params;
  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const ratingRaw = Number(body.rating);
  const rating = Number.isFinite(ratingRaw) ? Math.round(ratingRaw) : NaN;
  const comment = clean(body.comment, 600);

  if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
    return NextResponse.json({ error: "Choose a rating from 1 to 5" }, { status: 400 });
  }

  const db = getDb();
  const [assignment] = await db
    .select({
      id: jobHookahs.id,
      jobId: jobHookahs.jobId,
      status: jobHookahs.status,
      guestFeedbackAt: jobHookahs.guestFeedbackAt,
      modelNumber: hookahs.modelNumber,
      jobStatus: jobs.status,
      jobRating: jobs.rating,
    })
    .from(jobHookahs)
    .innerJoin(jobs, eq(jobs.id, jobHookahs.jobId))
    .innerJoin(hookahs, eq(hookahs.id, jobHookahs.hookahId))
    .where(eq(jobHookahs.guestToken, token))
    .limit(1);

  if (!assignment) {
    return NextResponse.json({ error: "This service link isn’t available" }, { status: 404 });
  }

  const sessionEnded =
    assignment.status !== "out" || assignment.jobStatus === "completed";
  if (!sessionEnded) {
    return NextResponse.json(
      { error: "Feedback opens once your session is wrapped" },
      { status: 400 },
    );
  }

  if (assignment.guestFeedbackAt) {
    return NextResponse.json({ error: "Feedback already submitted" }, { status: 409 });
  }

  const now = new Date();
  await db
    .update(jobHookahs)
    .set({
      guestRating: rating,
      guestComment: comment,
      guestFeedbackAt: now,
    })
    .where(and(eq(jobHookahs.id, assignment.id), isNull(jobHookahs.guestFeedbackAt)));

  if (assignment.jobRating == null) {
    await db
      .update(jobs)
      .set({
        rating,
        updatedAt: now,
        ...(rating >= 4 ? { rebookLikely: true } : {}),
      })
      .where(and(eq(jobs.id, assignment.jobId), isNull(jobs.rating)));
  }

  await db.insert(jobEvents).values({
    jobId: assignment.jobId,
    jobHookahId: assignment.id,
    type: "note",
    message: `Guest feedback · Hookah #${assignment.modelNumber}: ${rating}/5${
      comment ? ` — “${comment.slice(0, 120)}”` : ""
    }`,
    createdBy: "guest",
  });

  return NextResponse.json({
    ok: true,
    feedback: {
      rating,
      comment,
      submittedAt: now.toISOString(),
    },
  });
}
