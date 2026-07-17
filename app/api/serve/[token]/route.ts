import { loadServeSnapshot } from "@/lib/serve-snapshot";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import {
  flavours,
  hookahs,
  jobHookahs,
  jobs,
  payments,
  serviceRequests,
} from "@/lib/db/schema";
import {
  defaultRefillCentsForTier,
  guestPayTierUnitCents,
  isGuestPayTier,
  isRefillPayPreference,
  type GuestPayTier,
  type RefillPayPreference,
} from "@/lib/ops/guest-pay";
import { getPricingForJob } from "@/lib/pricing";
import {
  notifyStaffPush,
  notifyStaffPushForServiceRequest,
} from "@/lib/push";
import {
  createGuestOrderUnitCheckoutLink,
  createGuestRefillCheckoutLink,
  findGuestOrderUnitPayment,
  findGuestRefillPayment,
} from "@/lib/refill-payment-link";
import { and, eq, inArray } from "drizzle-orm";

type RouteContext = { params: Promise<{ token: string }> };

type PayableGuestRequest = "refill" | "order_unit";

function isPayableGuestRequest(
  type: string,
): type is PayableGuestRequest {
  return type === "refill" || type === "order_unit";
}

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

async function loadAssignment(token: string) {
  const db = getDb();
  const [assignment] = await db
    .select({
      id: jobHookahs.id,
      jobId: jobHookahs.jobId,
      status: jobHookahs.status,
      flavourId: jobHookahs.flavourId,
      flavourLabel: jobHookahs.flavourLabel,
      guestPayTier: jobHookahs.guestPayTier,
      modelNumber: hookahs.modelNumber,
      jobTitle: jobs.title,
      paymentModel: jobs.paymentModel,
      pricingJson: jobs.pricingJson,
    })
    .from(jobHookahs)
    .innerJoin(hookahs, eq(hookahs.id, jobHookahs.hookahId))
    .innerJoin(jobs, eq(jobs.id, jobHookahs.jobId))
    .where(eq(jobHookahs.guestToken, token))
    .limit(1);
  return assignment ?? null;
}

async function loadActiveRequest(assignmentId: number) {
  const db = getDb();
  const [existing] = await db
    .select()
    .from(serviceRequests)
    .where(
      and(
        eq(serviceRequests.jobHookahId, assignmentId),
        inArray(serviceRequests.status, ["open", "acknowledged"]),
      ),
    )
    .limit(1);
  return existing ?? null;
}

async function findGuestPayablePayment(
  type: PayableGuestRequest,
  serviceRequestId: number,
) {
  return type === "order_unit"
    ? findGuestOrderUnitPayment(serviceRequestId)
    : findGuestRefillPayment(serviceRequestId);
}

async function createGuestPayableCheckout(opts: {
  type: PayableGuestRequest;
  jobId: number;
  jobHookahId: number;
  serviceRequestId: number;
  amountCents: number;
  flavourLabel: string;
  guestToken: string;
  tier?: GuestPayTier | null;
}) {
  if (opts.type === "order_unit") {
    const tier = opts.tier === "unlimited" ? "Unlimited" : "Standard";
    return createGuestOrderUnitCheckoutLink({
      jobId: opts.jobId,
      jobHookahId: opts.jobHookahId,
      serviceRequestId: opts.serviceRequestId,
      amountCents: opts.amountCents,
      flavourLabel: opts.flavourLabel || "flavour",
      tierLabel: tier,
      guestToken: opts.guestToken,
      createdBy: "guest",
    });
  }
  return createGuestRefillCheckoutLink({
    jobId: opts.jobId,
    jobHookahId: opts.jobHookahId,
    serviceRequestId: opts.serviceRequestId,
    amountCents: opts.amountCents,
    flavourLabel: opts.flavourLabel || "flavour",
    guestToken: opts.guestToken,
    createdBy: "guest",
  });
}

export async function POST(request: Request, context: RouteContext) {
  const { token } = await context.params;
  if (!token || token.length < 10) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let body: {
    action?: string;
    type?: string;
    message?: string;
    flavourId?: number;
    priceAgreed?: boolean;
    payPreference?: string;
    guestPayTier?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const assignment = await loadAssignment(token);
  if (!assignment) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (assignment.status !== "out") {
    return NextResponse.json(
      { error: "This hookah is no longer on the floor" },
      { status: 400 },
    );
  }

  const db = getDb();

  // —— Guest recovery actions on an active request ——
  if (
    body.action === "cancel_request" ||
    body.action === "update_pay_preference" ||
    body.action === "retry_checkout"
  ) {
    const active = await loadActiveRequest(assignment.id);
    if (!active || !isPayableGuestRequest(active.type)) {
      return NextResponse.json(
        { error: "No active paid request to update" },
        { status: 400 },
      );
    }

    const pay = await findGuestPayablePayment(active.type, active.id);
    if (pay?.status === "succeeded") {
      return NextResponse.json(
        {
          error:
            active.type === "order_unit"
              ? "This hookah is already paid — staff will bring it soon"
              : "This refill is already paid — staff will deliver soon",
        },
        { status: 400 },
      );
    }

    if (body.action === "cancel_request") {
      if (pay?.status === "pending") {
        await db
          .update(payments)
          .set({ status: "cancelled", updatedAt: new Date() })
          .where(eq(payments.id, pay.id));
      }
      await db
        .update(serviceRequests)
        .set({
          status: "cancelled",
          resolvedAt: new Date(),
          resolvedBy: "guest",
        })
        .where(eq(serviceRequests.id, active.id));
      const snapshot = await loadServeSnapshot(token);
      return NextResponse.json({
        ok: true,
        cancelled: true,
        ...("error" in snapshot ? {} : snapshot),
      });
    }

    if (body.action === "retry_checkout") {
      if (active.payPreference !== "phone" || (active.priceCents ?? 0) <= 0) {
        return NextResponse.json(
          { error: "Nothing to retry — switch to phone pay first" },
          { status: 400 },
        );
      }
      const link = await createGuestPayableCheckout({
        type: active.type,
        jobId: assignment.jobId,
        jobHookahId: assignment.id,
        serviceRequestId: active.id,
        amountCents: active.priceCents!,
        flavourLabel: active.flavourLabel || "flavour",
        guestToken: token,
        tier: isGuestPayTier(active.requestedGuestPayTier)
          ? active.requestedGuestPayTier
          : null,
      });
      const snapshot = await loadServeSnapshot(token);
      return NextResponse.json({
        ok: link.ok,
        linkOk: link.ok,
        linkReason: link.ok ? undefined : link.reason,
        checkoutUrl: link.ok ? link.url : null,
        ...("error" in snapshot ? {} : snapshot),
      });
    }

    // update_pay_preference
    if (!isRefillPayPreference(body.payPreference)) {
      return NextResponse.json(
        { error: "Choose phone or terminal" },
        { status: 400 },
      );
    }
    if ((active.priceCents ?? 0) <= 0) {
      return NextResponse.json(
        { error: "No payment needed for this request" },
        { status: 400 },
      );
    }

    const nextPref = body.payPreference as RefillPayPreference;
    let checkoutUrl: string | null = null;
    let linkOk = true;
    let linkReason: string | undefined;

    if (nextPref === "terminal") {
      if (pay?.status === "pending") {
        await db
          .update(payments)
          .set({ status: "cancelled", updatedAt: new Date() })
          .where(eq(payments.id, pay.id));
      }
      await db
        .update(serviceRequests)
        .set({ payPreference: "terminal" })
        .where(eq(serviceRequests.id, active.id));
    } else {
      await db
        .update(serviceRequests)
        .set({ payPreference: "phone" })
        .where(eq(serviceRequests.id, active.id));
      const link = await createGuestPayableCheckout({
        type: active.type,
        jobId: assignment.jobId,
        jobHookahId: assignment.id,
        serviceRequestId: active.id,
        amountCents: active.priceCents!,
        flavourLabel: active.flavourLabel || "flavour",
        guestToken: token,
        tier: isGuestPayTier(active.requestedGuestPayTier)
          ? active.requestedGuestPayTier
          : null,
      });
      linkOk = link.ok;
      if (link.ok) checkoutUrl = link.url;
      else linkReason = link.reason;
    }

    void notifyStaffPushForServiceRequest(active.id, {
      title: `Guest call · #${assignment.modelNumber}`,
      body:
        nextPref === "terminal"
          ? `Switched to terminal · ${active.flavourLabel || active.type}`
          : `Switched to phone pay · ${active.flavourLabel || active.type}`,
      url: `/admin/jobs/${assignment.jobId}`,
    });

    const snapshot = await loadServeSnapshot(token);
    return NextResponse.json({
      ok: true,
      payPreference: nextPref,
      checkoutUrl,
      linkOk,
      linkReason,
      ...("error" in snapshot ? {} : snapshot),
    });
  }

  // —— Create a new service request ——
  const type = body.type;
  if (
    type !== "coals" &&
    type !== "refill" &&
    type !== "issue" &&
    type !== "other" &&
    type !== "order_unit"
  ) {
    return NextResponse.json({ error: "Invalid request type" }, { status: 400 });
  }

  const message =
    typeof body.message === "string" ? body.message.trim().slice(0, 280) : "";

  const existing = await loadActiveRequest(assignment.id);
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
  let payPreference: RefillPayPreference | null = null;
  let requestedGuestPayTier: GuestPayTier | null = null;

  if (type === "refill") {
    if (body.priceAgreed !== true) {
      return NextResponse.json(
        { error: "Please confirm your refill before requesting" },
        { status: 400 },
      );
    }

    const requestedId =
      typeof body.flavourId === "number" ? body.flavourId : assignment.flavourId;

    if (!requestedId) {
      return NextResponse.json(
        { error: "Choose a flavour for the refill" },
        { status: 400 },
      );
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
    const pricing = await getPricingForJob(assignment);
    const tier = isGuestPayTier(assignment.guestPayTier)
      ? (assignment.guestPayTier as GuestPayTier)
      : null;
    priceCents = defaultRefillCentsForTier(tier, pricing);
    priceAgreed = true;

    if ((priceCents ?? 0) > 0) {
      if (!isRefillPayPreference(body.payPreference)) {
        return NextResponse.json(
          {
            error:
              "Choose how you’d like to pay — on your phone, or have staff bring the terminal",
          },
          { status: 400 },
        );
      }
      payPreference = body.payPreference;
    }
  }

  if (type === "order_unit") {
    if (assignment.paymentModel !== "pay_at_event") {
      return NextResponse.json(
        { error: "Extra hookahs aren’t available for this event" },
        { status: 400 },
      );
    }
    if (body.priceAgreed !== true) {
      return NextResponse.json(
        { error: "Please confirm your order before requesting" },
        { status: 400 },
      );
    }
    if (!isGuestPayTier(body.guestPayTier)) {
      return NextResponse.json(
        { error: "Choose Standard or Unlimited" },
        { status: 400 },
      );
    }
    if (typeof body.flavourId !== "number") {
      return NextResponse.json(
        { error: "Choose a flavour for the new hookah" },
        { status: 400 },
      );
    }

    const [flav] = await db
      .select()
      .from(flavours)
      .where(eq(flavours.id, body.flavourId))
      .limit(1);

    if (!flav || !flav.active) {
      return NextResponse.json({ error: "Flavour not available" }, { status: 400 });
    }

    if (!isRefillPayPreference(body.payPreference)) {
      return NextResponse.json(
        {
          error:
            "Choose how you’d like to pay — on your phone, or have staff bring the terminal",
        },
        { status: 400 },
      );
    }

    const pricing = await getPricingForJob(assignment);
    flavourId = flav.id;
    flavourLabel = flav.name;
    requestedGuestPayTier = body.guestPayTier;
    priceCents = guestPayTierUnitCents(requestedGuestPayTier, pricing);
    priceAgreed = true;
    payPreference = body.payPreference;
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
      payPreference,
      requestedGuestPayTier,
    })
    .returning();

  let checkoutUrl: string | null = null;
  let paymentId: number | null = null;
  let linkOk = true;
  let linkReason: string | undefined;

  if (
    isPayableGuestRequest(type) &&
    (priceCents ?? 0) > 0 &&
    payPreference === "phone"
  ) {
    const link = await createGuestPayableCheckout({
      type,
      jobId: assignment.jobId,
      jobHookahId: assignment.id,
      serviceRequestId: created.id,
      amountCents: priceCents!,
      flavourLabel: flavourLabel || "flavour",
      guestToken: token,
      tier: requestedGuestPayTier,
    });
    if (link.ok) {
      checkoutUrl = link.url;
      paymentId = link.paymentId;
    } else {
      linkOk = false;
      linkReason = link.reason;
    }
  }

  const payNote =
    !isPayableGuestRequest(type)
      ? ""
      : (priceCents ?? 0) <= 0
        ? " · complimentary"
        : payPreference === "terminal"
          ? " · bring terminal"
          : checkoutUrl
            ? " · phone pay link"
            : " · phone pay (link failed)";

  const tierNote =
    type === "order_unit" && requestedGuestPayTier
      ? requestedGuestPayTier === "unlimited"
        ? "Unlimited"
        : "Standard"
      : "";

  void notifyStaffPush({
    title: `Guest call · #${assignment.modelNumber}`,
    body:
      type === "order_unit"
        ? `Extra hookah · ${tierNote} · ${flavourLabel || "flavour"}${(priceCents ?? 0) > 0 ? ` · $${((priceCents ?? 0) / 100).toFixed(0)}` : ""}${payNote}`
        : type === "refill"
          ? `Refill · ${flavourLabel || "flavour"}${(priceCents ?? 0) > 0 ? ` · $${((priceCents ?? 0) / 100).toFixed(0)}` : ""}${payNote}`
          : type === "coals"
            ? "Fresh coals"
            : type === "issue"
              ? message || "Something’s off"
              : message || "Help requested",
    url: `/admin/jobs/${assignment.jobId}`,
  });

  return NextResponse.json({
    ok: true,
    request: created,
    checkoutUrl,
    paymentId,
    payPreference,
    linkOk,
    linkReason,
  });
}
