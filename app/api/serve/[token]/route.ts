import { loadServeSnapshot } from "@/lib/serve-snapshot";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { flavours, hookahs, jobHookahs, jobs, serviceRequests } from "@/lib/db/schema";
import { getPricing } from "@/lib/pricing";
import { notifyStaffPush } from "@/lib/push";
import { and, eq, inArray } from "drizzle-orm";

type RouteContext = { params: Promise<{ token: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { token } = await context.params;
  if (!token || token.length < 10) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const snapshot = await loadServeSnapshot(token);
  if ("error" in snapshot) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(snapshot);
}

export async function POST(request: Request, context: RouteContext) {
  const { token } = await context.params;
  if (!token || token.length < 10) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let body: {
    type?: string;
    message?: string;
    flavourId?: number;
    priceAgreed?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const type = body.type;
  if (type !== "coals" && type !== "refill" && type !== "issue" && type !== "other") {
    return NextResponse.json({ error: "Invalid request type" }, { status: 400 });
  }

  const message = typeof body.message === "string" ? body.message.trim().slice(0, 280) : "";

  const db = getDb();
  const [assignment] = await db
    .select({
      id: jobHookahs.id,
      jobId: jobHookahs.jobId,
      status: jobHookahs.status,
      flavourId: jobHookahs.flavourId,
      flavourLabel: jobHookahs.flavourLabel,
      modelNumber: hookahs.modelNumber,
      jobTitle: jobs.title,
    })
    .from(jobHookahs)
    .innerJoin(hookahs, eq(hookahs.id, jobHookahs.hookahId))
    .innerJoin(jobs, eq(jobs.id, jobHookahs.jobId))
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

  const [existing] = await db
    .select()
    .from(serviceRequests)
    .where(
      and(
        eq(serviceRequests.jobHookahId, assignment.id),
        inArray(serviceRequests.status, ["open", "acknowledged"]),
      ),
    )
    .limit(1);

  if (existing) {
    return NextResponse.json(
      {
        error: "You already have an active request — we’ll be with you soon",
        activeRequest: existing,
      },
      { status: 409 },
    );
  }

  let flavourId: number | null = null;
  let flavourLabel = "";
  let priceCents: number | null = null;
  let priceAgreed = false;

  if (type === "refill") {
    if (body.priceAgreed !== true) {
      return NextResponse.json(
        { error: "Please agree to the refill price before requesting" },
        { status: 400 },
      );
    }

    const requestedId =
      typeof body.flavourId === "number" ? body.flavourId : assignment.flavourId;

    if (!requestedId) {
      return NextResponse.json({ error: "Choose a flavour for the refill" }, { status: 400 });
    }

    const [flav] = await db
      .select()
      .from(flavours)
      .where(eq(flavours.id, requestedId))
      .limit(1);

    if (!flav || !flav.active) {
      return NextResponse.json({ error: "Flavour not available" }, { status: 400 });
    }

    flavourId = flav.id;
    flavourLabel = flav.name;
    const pricing = await getPricing();
    priceCents = pricing.refillPriceCents;
    priceAgreed = true;
  }

  const [created] = await db
    .insert(serviceRequests)
    .values({
      jobId: assignment.jobId,
      jobHookahId: assignment.id,
      type,
      message,
      flavourId,
      flavourLabel,
      priceCents,
      priceAgreed,
    })
    .returning();

  void notifyStaffPush({
    title: `Guest call · #${assignment.modelNumber}`,
    body:
      type === "refill"
        ? `Refill · ${flavourLabel || "flavour"} · $${((priceCents ?? 0) / 100).toFixed(0)}`
        : type === "coals"
          ? "Fresh coals"
          : type === "issue"
            ? message || "Something’s off"
            : message || "Help requested",
    url: `/admin/jobs/${assignment.jobId}`,
  });

  return NextResponse.json({ ok: true, request: created });
}
