import { maybeAutoSendDeposit } from "@/lib/auto-deposit";
import { getDb } from "@/lib/db";
import { createClientToken } from "@/lib/guest";
import { notifyBookingInquiry } from "@/lib/email/workflow";
import { getPaymentSettings } from "@/lib/payment-settings";
import { normalizePaymentModel } from "@/lib/payment-model";
import { estimateBooking } from "@/lib/pricing";
import { jobEvents, jobs } from "@/lib/db/schema";
import { NextResponse } from "next/server";

function clean(value: unknown, max = 200) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Honeypot — bots fill this; humans never see it.
  // Use a non-autofill name (not company/website/url) so browsers don't
  // silently "succeed" real submissions without creating a job.
  if (clean(body.oui_hp_blank) || clean(body.companyWebsite)) {
    console.warn("booking honeypot tripped — skipping create");
    return NextResponse.json({ ok: true });
  }

  const clientName = clean(body.name, 120);
  const clientEmail = clean(body.email, 160);
  const clientPhone = clean(body.phone, 40);
  const eventType = clean(body.eventType, 80);
  const location = clean(body.location, 200);
  const notes = clean(body.notes, 1000);
  const promoCode = clean(body.promoCode, 40).toUpperCase();
  const guestCountRaw = clean(body.guestCount, 20);
  const hookahCountRaw = clean(body.hookahs, 20);
  const date = clean(body.date, 40);
  const startTime = clean(body.startTime, 40);
  const hoursRaw = clean(body.hours, 10);
  const engagement = clean(body.engagement, 40).toLowerCase();

  if (!clientName) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }
  if (!clientEmail && !clientPhone) {
    return NextResponse.json(
      { error: "Email or phone is required" },
      { status: 400 },
    );
  }
  if (engagement !== "package" && engagement !== "on_site") {
    return NextResponse.json(
      { error: "Please choose package or on-site sales" },
      { status: 400 },
    );
  }

  const paymentModel = normalizePaymentModel(
    engagement === "on_site" ? "pay_at_event" : "client_deposit",
  );

  const guestCount = guestCountRaw ? parseInt(guestCountRaw, 10) : null;
  const bookedHours = hoursRaw ? parseInt(hoursRaw, 10) : 4;
  const hookahCount = hookahCountRaw ? parseInt(hookahCountRaw, 10) : 0;
  const hookahNote = hookahCountRaw ? `${hookahCountRaw} hookahs requested` : "";

  let startsAt: Date | null = null;
  if (date) {
    const iso = startTime ? `${date}T${startTime}` : `${date}T18:00`;
    const parsed = new Date(iso);
    if (!Number.isNaN(parsed.getTime())) startsAt = parsed;
  }

  const engagementLabel =
    paymentModel === "pay_at_event" ? "On-site sales" : "Full-service package";

  const titleParts = [engagementLabel, eventType || "Event", clientName].filter(
    Boolean,
  );

  const estimate =
    paymentModel === "client_deposit"
      ? estimateBooking(
          hookahCount,
          bookedHours,
          promoCode === "OUI25" ? 25 : 0,
        )
      : null;

  const quotedCents =
    estimate != null ? Math.round(estimate.total * 100) : null;

  const packingNotes = [
    `Engagement: ${engagementLabel}`,
    hookahNote,
    notes,
    promoCode === "OUI25" ? "Promo: OUI25 · $25 guest rebook discount" : "",
    estimate
      ? `Website estimate: $${estimate.total.toFixed(2)} CAD (incl. HST)`
      : "",
    "Source: website booking form",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const db = getDb();
    const settings = await getPaymentSettings();
    const [job] = await db
      .insert(jobs)
      .values({
        title: titleParts.join(" · ").slice(0, 160),
        clientName,
        clientEmail,
        clientPhone,
        location,
        startsAt,
        bookedHours: Number.isFinite(bookedHours) ? bookedHours : 4,
        guestCount: Number.isFinite(guestCount as number) ? guestCount : null,
        quotedCents,
        depositPercent: settings.defaultDepositPercent,
        packingNotes,
        status: "draft",
        paymentModel,
        clientToken: createClientToken(),
      })
      .returning();

    await db.insert(jobEvents).values({
      jobId: job.id,
      type: "created",
      message: `Draft job from website (${engagementLabel}) · ${clientEmail || clientPhone}${
        promoCode === "OUI25" ? " · Promo OUI25" : ""
      }`,
      createdBy: "website",
    });

    // Await emails so Vercel doesn't freeze the function before Resend finishes
    await notifyBookingInquiry({
      ...job,
      paymentModel,
      promoCode: promoCode === "OUI25" ? "OUI25" : undefined,
    });

    // Package bookings already have a website estimate — send deposit link now
    if (paymentModel === "client_deposit" && quotedCents) {
      const deposit = await maybeAutoSendDeposit(job.id, "booking");
      if (!deposit.sent) {
        console.info("booking auto-deposit skipped", job.id, deposit.reason);
      }
    }

    return NextResponse.json({
      ok: true,
      message: "Request received — we’ll follow up soon.",
      jobId: job.id,
      paymentModel,
      engagement,
    });
  } catch (err) {
    console.error("booking create failed", err);
    return NextResponse.json(
      { error: "Couldn’t submit right now. Email ouismokeinc@gmail.com." },
      { status: 500 },
    );
  }
}
