"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useSse } from "@/lib/hooks/useSse";
import NightGallery from "@/components/NightGallery";
import "./serve.css";

type FlavourOption = {
  id: number;
  name: string;
  kind: string;
  description?: string | null;
};

type ActiveRequest = {
  id: number;
  type: string;
  message: string | null;
  status: string;
  flavourLabel?: string | null;
  priceCents?: number | null;
  payPreference?: "phone" | "terminal" | null;
  requestedGuestPayTier?: "standard" | "unlimited" | null;
  checkoutUrl?: string | null;
  paymentStatus?: string | null;
  createdAt: string;
  acknowledgedAt: string | null;
  acknowledgedBy?: string | null;
  etaMinutes?: number | null;
  etaAt?: string | null;
};

type SessionSummary = {
  flavour: string | null;
  refillCount: number;
  durationMs: number | null;
  requestCount: number;
  coalsCount: number;
  refillRequestCount: number;
  issueCount: number;
};

type GuestFeedback = {
  rating: number | null;
  comment: string;
  submittedAt: string;
};

type RebookPromo = {
  code: string;
  discountDollars: number;
  label: string;
  bookUrl: string;
};

type ServePayload = {
  modelNumber: number;
  flavour: string | null;
  flavourId: number | null;
  jobTitle: string;
  sentOutAt: string | null;
  sessionEnded: boolean;
  refillPriceCents: number;
  refillChargeCents?: number;
  standardUnitCents?: number;
  unlimitedUnitCents?: number;
  standardUnitChargeCents?: number;
  unlimitedUnitChargeCents?: number;
  canOrderUnit?: boolean;
  hstRate?: number;
  hstPercent?: string;
  guestPayTier?: "standard" | "unlimited" | null;
  refillCount?: number;
  flavours: FlavourOption[];
  activeRequest: ActiveRequest | null;
  recentRequests?: ActiveRequest[];
  sessionSummary?: SessionSummary | null;
  guestFeedback?: GuestFeedback | null;
  rebookPromo?: RebookPromo | null;
  photos?: Array<{ id: number; url: string; createdAt?: string }>;
  serverTime: string;
};

const REQUEST_TYPES = [
  {
    type: "coals",
    label: "Fresh coals",
    hint: "Heat is fading — send coals",
  },
  {
    type: "refill",
    label: "Flavour refill",
    hint: "Same flavour or a new one",
  },
  {
    type: "order_unit",
    label: "Another hookah",
    hint: "Add a second or third — pick flavour & plan",
  },
  {
    type: "issue",
    label: "Something’s off",
    hint: "Hose, draw, tip — we can help",
  },
] as const;

function formatMoney(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function withHstDisplay(exclusiveCents: number, hstRate = 0.13) {
  if (exclusiveCents <= 0) return 0;
  return exclusiveCents + Math.round(exclusiveCents * hstRate);
}

function formatElapsed(ms: number) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  return `${m}m ${String(s).padStart(2, "0")}s`;
}

function requestLabel(
  active: ActiveRequest,
  hstRate = 0.13,
) {
  if (active.type === "coals") return "Fresh coals";
  if (active.type === "refill") {
    const flavour = active.flavourLabel ? ` · ${active.flavourLabel}` : "";
    const exclusive = active.priceCents ?? 0;
    const price =
      exclusive > 0
        ? ` · ${formatMoney(withHstDisplay(exclusive, hstRate))} incl. HST`
        : " · included";
    const pay =
      exclusive > 0
        ? active.payPreference === "terminal"
          ? " · terminal"
          : active.payPreference === "phone"
            ? " · phone"
            : ""
        : "";
    return `Refill${flavour}${price}${pay}`;
  }
  if (active.type === "order_unit") {
    const tier =
      active.requestedGuestPayTier === "unlimited"
        ? "Unlimited"
        : active.requestedGuestPayTier === "standard"
          ? "Standard"
          : "Extra";
    const flavour = active.flavourLabel ? ` · ${active.flavourLabel}` : "";
    const exclusive = active.priceCents ?? 0;
    const price =
      exclusive > 0
        ? ` · ${formatMoney(withHstDisplay(exclusive, hstRate))} incl. HST`
        : "";
    return `Another hookah · ${tier}${flavour}${price}`;
  }
  if (active.type === "issue") return "Issue";
  return "Help";
}

async function preparePhoto(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.type.includes("heic") || file.type.includes("heif")) {
    return file;
  }
  if (file.size <= 2.5 * 1024 * 1024) return file;

  try {
    const bitmap = await createImageBitmap(file);
    const maxEdge = 1920;
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", 0.82),
    );
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.\w+$/, ".jpg"), {
      type: "image/jpeg",
    });
  } catch {
    return file;
  }
}

export default function GuestServePage() {
  const params = useParams();
  const token = params.token as string;
  const photoInputRef = useRef<HTMLInputElement>(null);

  const [data, setData] = useState<ServePayload | null>(null);
  const [error, setError] = useState("");
  const [photoMsg, setPhotoMsg] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoConsent, setPhotoConsent] = useState(false);
  const [socialHandle, setSocialHandle] = useState("");
  const [note, setNote] = useState("");
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [refillFlavourId, setRefillFlavourId] = useState("");
  const [orderTier, setOrderTier] = useState<"standard" | "unlimited" | "">(
    "",
  );
  const [payPreference, setPayPreference] = useState<"phone" | "terminal" | null>(
    null,
  );
  const [now, setNow] = useState(() => Date.now());
  const [rating, setRating] = useState(0);
  const [feedbackComment, setFeedbackComment] = useState("");
  const [feedbackBusy, setFeedbackBusy] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState("");
  const [toast, setToast] = useState("");
  const [toastBusy, setToastBusy] = useState(false);
  const [statusFlash, setStatusFlash] = useState(false);
  const prevRequestSig = useRef<string | null>(null);
  const suppressResolveToast = useRef(false);

  function showToast(message: string, busy = false) {
    setToast(message);
    setToastBusy(busy);
  }

  function flashStatus() {
    setStatusFlash(true);
    window.setTimeout(() => setStatusFlash(false), 900);
    try {
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        navigator.vibrate?.(40);
      }
    } catch {
      /* ignore */
    }
  }

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/serve/${encodeURIComponent(token)}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        setError(
          payload.error === "Not found"
            ? "This service link isn’t available."
            : "Couldn’t load this hookah right now. Try refreshing.",
        );
        setLoading(false);
        return;
      }
      const json = await res.json();
      setData(json);
      setError("");
      setLoading(false);
      setRefillFlavourId((prev) =>
        prev || (json.flavourId ? String(json.flavourId) : ""),
      );
    } catch {
      setError("Couldn’t reach Oui Smoke. Check your connection and refresh.");
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, [load]);

  useEffect(() => {
    if (!toast || toastBusy) return;
    const t = window.setTimeout(() => setToast(""), 4500);
    return () => window.clearTimeout(t);
  }, [toast, toastBusy]);

  useEffect(() => {
    const active = data?.activeRequest;
    const sig = active
      ? `${active.id}:${active.status}:${active.paymentStatus ?? ""}:${active.payPreference ?? ""}`
      : null;

    if (prevRequestSig.current == null) {
      prevRequestSig.current = sig;
      return;
    }
    if (sig === prevRequestSig.current) return;

    const prev = prevRequestSig.current;
    prevRequestSig.current = sig;

    if (prev && !sig) {
      if (suppressResolveToast.current) {
        suppressResolveToast.current = false;
      } else {
        showToast("All set — enjoy your smoke.");
        flashStatus();
      }
      return;
    }
    if (!sig || !active) return;

    const [, prevStatus, prevPay] = prev.split(":");

    if (prevStatus === "open" && active.status === "acknowledged") {
      showToast("Staff are on the way.");
      flashStatus();
    } else if (
      (active.type === "refill" || active.type === "order_unit") &&
      prevPay !== "succeeded" &&
      active.paymentStatus === "succeeded"
    ) {
      showToast(
        active.type === "order_unit"
          ? "Payment confirmed — your next hookah is coming."
          : "Payment confirmed — refill is in motion.",
      );
      flashStatus();
    } else if (!prev && sig) {
      flashStatus();
    }
  }, [data?.activeRequest]);

  useSse<ServePayload & { error?: string }>(
    token ? `/api/stream/serve/${encodeURIComponent(token)}` : null,
    (json) => {
      if (json.error === "not_found") {
        setError("This service link isn’t available.");
        setLoading(false);
        return;
      }
      setData(json);
      setError("");
      setLoading(false);
      setRefillFlavourId((prev) =>
        prev || (json.flavourId ? String(json.flavourId) : ""),
      );
    },
  );

  const elapsed = useMemo(() => {
    if (!data?.sentOutAt) return null;
    return formatElapsed(now - new Date(data.sentOutAt).getTime());
  }, [data?.sentOutAt, now]);

  async function submit(
    type: string,
    extras?: {
      message?: string;
      flavourId?: number;
      priceAgreed?: boolean;
      payPreference?: "phone" | "terminal";
      guestPayTier?: "standard" | "unlimited";
    },
  ) {
    setSubmitting(true);
    setError("");
    showToast("Sending your request…", true);
    try {
      const res = await fetch(`/api/serve/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          message: extras?.message || undefined,
          flavourId: extras?.flavourId,
          priceAgreed: extras?.priceAgreed,
          payPreference: extras?.payPreference,
          guestPayTier: extras?.guestPayTier,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? "Couldn’t send request");
        setToast("");
        setToastBusy(false);
        await load();
        return;
      }
      setSelectedType(null);
      setNote("");
      setPayPreference(null);
      setOrderTier("");
      if (type === "refill" || type === "order_unit") {
        // keep flavour pick for next time
      } else {
        setRefillFlavourId(data?.flavourId ? String(data.flavourId) : "");
      }
      await load();
      showToast(
        type === "refill"
          ? "Refill requested — watching for staff updates."
          : type === "order_unit"
            ? "Extra hookah requested — watching for staff updates."
          : type === "coals"
            ? "Coals requested — we’ll update this page live."
            : "Request sent — keep this page open for live updates.",
      );
      flashStatus();
      if (typeof json.checkoutUrl === "string" && json.checkoutUrl) {
        window.open(json.checkoutUrl, "_blank", "noopener,noreferrer");
      }
      if (
        json.linkOk === false &&
        (type === "refill" || type === "order_unit")
      ) {
        setError(
          "Pay link didn’t open — you can retry or switch to terminal on the next screen.",
        );
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function submitFeedback(e: FormEvent) {
    e.preventDefault();
    if (rating < 1) {
      setError("Pick a rating from 1 to 5");
      return;
    }
    setFeedbackBusy(true);
    setError("");
    setFeedbackMsg("");
    try {
      const res = await fetch(`/api/serve/${encodeURIComponent(token)}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating, comment: feedbackComment }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? "Couldn’t send feedback");
        return;
      }
      setFeedbackMsg("Thanks — your feedback helps us make every night better.");
      setData((prev) =>
        prev
          ? {
              ...prev,
              guestFeedback: {
                rating,
                comment: feedbackComment.trim(),
                submittedAt: json.feedback?.submittedAt ?? new Date().toISOString(),
              },
            }
          : prev,
      );
    } finally {
      setFeedbackBusy(false);
    }
  }

  async function uploadPhoto(file: File) {
    if (!photoConsent) {
      setError("Please agree to the photo consent before uploading");
      return;
    }
    setUploadingPhoto(true);
    setError("");
    setPhotoMsg("");
    try {
      const prepared = await preparePhoto(file);
      const form = new FormData();
      form.append("file", prepared);
      form.append("consentAgreed", "true");
      if (socialHandle.trim()) {
        form.append("socialHandle", socialHandle.trim());
      }
      const res = await fetch(`/api/serve/${encodeURIComponent(token)}/photos`, {
        method: "POST",
        body: form,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? "Couldn’t upload photo");
        return;
      }
      setPhotoMsg("Photo sent — thanks for sharing with Oui.");
      setPhotoConsent(false);
      setSocialHandle("");
    } finally {
      setUploadingPhoto(false);
      if (photoInputRef.current) photoInputRef.current.value = "";
    }
  }

  function handleIssueSubmit(e: FormEvent) {
    e.preventDefault();
    if (!selectedType) return;
    submit(selectedType, { message: note });
  }

  function handleRefillSubmit(e: FormEvent) {
    e.preventDefault();
    if (!data) return;
    const flavourId = refillFlavourId
      ? parseInt(refillFlavourId, 10)
      : data.flavourId ?? undefined;
    if (!flavourId) {
      setError("Choose a flavour for your refill");
      return;
    }
    const needsPay = (data.refillPriceCents ?? 0) > 0;
    if (needsPay && !payPreference) {
      setError("Choose how you’d like to pay");
      return;
    }
    submit("refill", {
      flavourId,
      priceAgreed: true,
      payPreference: needsPay ? payPreference! : undefined,
      message: note || undefined,
    });
  }

  function openRefill() {
    setSelectedType("refill");
    setPayPreference(null);
    setNote("");
    setError("");
    if (data?.flavourId) setRefillFlavourId(String(data.flavourId));
  }

  function openOrderUnit() {
    setSelectedType("order_unit");
    setOrderTier("");
    setPayPreference(null);
    setNote("");
    setError("");
    if (data?.flavourId) setRefillFlavourId(String(data.flavourId));
  }

  function handleOrderUnitSubmit(e: FormEvent) {
    e.preventDefault();
    if (!data) return;
    if (orderTier !== "standard" && orderTier !== "unlimited") {
      setError("Choose Standard or Unlimited");
      return;
    }
    const flavourId = refillFlavourId
      ? parseInt(refillFlavourId, 10)
      : undefined;
    if (!flavourId) {
      setError("Choose a flavour for the new hookah");
      return;
    }
    if (!payPreference) {
      setError("Choose how you’d like to pay");
      return;
    }
    submit("order_unit", {
      flavourId,
      guestPayTier: orderTier,
      priceAgreed: true,
      payPreference,
      message: note || undefined,
    });
  }

  if (loading) {
    return (
      <div className="serve">
        <div className="serve__shell">
          <p className="serve__muted">Loading your hookah…</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="serve">
        <div className="serve__shell">
          <p className="serve__error">{error || "Not found"}</p>
        </div>
      </div>
    );
  }

  const active = data.activeRequest;
  const onTheWay = active?.status === "acknowledged";
  const hstRate = data.hstRate ?? 0.13;
  const hstPct = data.hstPercent ?? String(Math.round(hstRate * 100));
  const chargeCents =
    data.refillChargeCents ??
    withHstDisplay(data.refillPriceCents ?? 0, hstRate);
  const priceLabel =
    chargeCents > 0
      ? `${formatMoney(chargeCents)} incl. HST`
      : "Included";
  const exclusiveLabel = formatMoney(data.refillPriceCents ?? 0);
  const isUnlimited = data.guestPayTier === "unlimited" || data.refillPriceCents <= 0;
  const isStandard = data.guestPayTier === "standard" || (!isUnlimited && data.refillPriceCents > 0);
  const refillPaid =
    (active?.type === "refill" || active?.type === "order_unit") &&
    active.paymentStatus === "succeeded";
  const refillCheckoutUrl =
    (active?.type === "refill" || active?.type === "order_unit") &&
    active.paymentStatus === "pending" &&
    active.payPreference !== "terminal"
      ? active.checkoutUrl
      : null;
  const etaRemaining =
    onTheWay && active?.etaAt
      ? Math.max(0, Math.ceil((new Date(active.etaAt).getTime() - now) / 1000))
      : null;
  const etaLabel =
    etaRemaining == null
      ? null
      : etaRemaining <= 0
        ? "Any moment now"
        : etaRemaining >= 60
          ? `About ${Math.ceil(etaRemaining / 60)} min`
          : `About ${etaRemaining}s`;
  const summaryDuration =
    data.sessionSummary?.durationMs != null
      ? formatElapsed(data.sessionSummary.durationMs)
      : null;
  const recent = (data.recentRequests ?? []).filter(
    (r) => !active || r.id !== active.id,
  );

  const refillStatusCopy = (() => {
    if (active?.type !== "refill") return null;
    const host = active.acknowledgedBy?.trim() || null;
    const free = (active.priceCents ?? 0) <= 0;
    if (free) {
      return onTheWay
        ? host
          ? `Your refill is included. ${host} is bringing a fresh head now.`
          : "Your refill is included. A host is bringing a fresh head now."
        : "Your refill is included — staff are preparing a fresh head. No payment needed.";
    }
    if (refillPaid) {
      return onTheWay
        ? host
          ? `Payment confirmed. ${host} is bringing your fresh head now.`
          : "Payment confirmed. A host is bringing your fresh head now."
        : "Payment confirmed. Staff are preparing your refill — no need to pay again.";
    }
    if (active.payPreference === "terminal") {
      return onTheWay
        ? host
          ? `${host} is coming with the payment terminal. Pay when they arrive.`
          : "A host is coming with the payment terminal. Pay when they arrive."
        : "We’ve got your refill. Staff will bring the terminal so you can pay in person.";
    }
    if (refillCheckoutUrl) {
      return onTheWay
        ? host
          ? `${host} is on the way. Complete payment on your phone so we can mark this paid.`
          : "A host is on the way. Complete payment on your phone so we can mark this paid."
        : "We’ve got your refill. Tap Pay below — staff prep a fresh head while you checkout.";
    }
    if (active.payPreference === "phone" && !refillCheckoutUrl) {
      return "Pay link didn’t open. Retry below, or switch to terminal so staff can collect in person.";
    }
    return onTheWay
      ? host
        ? `${host} is on the way with your refill.`
        : "A host is on the way with your refill."
      : "We’ve got your refill — staff are preparing a fresh head.";
  })();

  const orderUnitStatusCopy = (() => {
    if (active?.type !== "order_unit") return null;
    const host = active.acknowledgedBy?.trim() || null;
    const tier =
      active.requestedGuestPayTier === "unlimited"
        ? "Unlimited"
        : "Standard";
    const flavour = active.flavourLabel || "your flavour";
    if (refillPaid) {
      return onTheWay
        ? host
          ? `Payment confirmed. ${host} is prepping another ${tier} hookah · ${flavour}.`
          : `Payment confirmed. Staff are prepping another ${tier} hookah · ${flavour}.`
        : `Payment confirmed. Staff will stage another ${tier} hookah · ${flavour}.`;
    }
    if (active.payPreference === "terminal") {
      return onTheWay
        ? host
          ? `${host} is coming with the terminal for your extra ${tier} hookah.`
          : "A host is coming with the terminal for your extra hookah."
        : `We’ve got your order · ${tier} · ${flavour}. Staff will bring the terminal.`;
    }
    if (refillCheckoutUrl) {
      return onTheWay
        ? host
          ? `${host} is on it. Complete payment on your phone for the extra hookah.`
          : "A host is on it. Complete payment on your phone for the extra hookah."
        : `We’ve got your order · ${tier} · ${flavour}. Tap Pay below while staff prep.`;
    }
    if (active.payPreference === "phone" && !refillCheckoutUrl) {
      return "Pay link didn’t open. Retry below, or switch to terminal so staff can collect in person.";
    }
    return onTheWay
      ? host
        ? `${host} is preparing your extra hookah.`
        : "A host is preparing your extra hookah."
      : `We’ve got your order · ${tier} · ${flavour}.`;
  })();

  const standardUnitLabel = formatMoney(
    data.standardUnitChargeCents ??
      withHstDisplay(data.standardUnitCents ?? 8000, hstRate),
  );
  const unlimitedUnitLabel = formatMoney(
    data.unlimitedUnitChargeCents ??
      withHstDisplay(data.unlimitedUnitCents ?? 10000, hstRate),
  );
  const actionTypes = REQUEST_TYPES.filter(
    (item) => item.type !== "order_unit" || data.canOrderUnit,
  );

  async function guestRequestAction(
    action: "cancel_request" | "update_pay_preference" | "retry_checkout",
    payPreference?: "phone" | "terminal",
  ) {
    setSubmitting(true);
    setError("");
    showToast(
      action === "cancel_request"
        ? "Cancelling request…"
        : action === "retry_checkout"
          ? "Retrying pay link…"
          : payPreference === "terminal"
            ? "Switching to terminal…"
            : "Switching to phone pay…",
      true,
    );
    try {
      const res = await fetch(`/api/serve/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, payPreference }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? "Couldn’t update request");
        setToast("");
        setToastBusy(false);
        await load();
        return;
      }
      if (json.modelNumber != null) {
        setData(json);
      } else {
        await load();
      }
      if (action === "cancel_request") {
        suppressResolveToast.current = true;
        showToast("Request cancelled.");
      } else if (action === "retry_checkout") {
        showToast(
          json.linkOk === false
            ? "Pay link still failed — try terminal."
            : "Pay link ready — check the button below.",
        );
      } else if (payPreference === "terminal") {
        showToast("Switched to terminal — staff will collect on the floor.");
      } else {
        showToast("Switched to phone pay.");
      }
      flashStatus();
      if (typeof json.checkoutUrl === "string" && json.checkoutUrl) {
        window.open(json.checkoutUrl, "_blank", "noopener,noreferrer");
      }
      if (json.linkOk === false) {
        setError("Pay link still failed — try again or switch to terminal.");
      }
    } finally {
      setSubmitting(false);
    }
  }
  return (
    <div className="serve">
      <div className="serve__shell">
        <header className="serve__brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-white.png" alt="Oui Smoke" className="serve__logo" width={200} height={54} />
          <p className="serve__kicker">Guest service</p>
        </header>

        {toast ? (
          <p className={`serve__toast${toastBusy ? " serve__toast--busy" : ""}`}>
            {toast}
          </p>
        ) : null}

        <section className="serve__hero">
          <p className="serve__eyebrow">Your hookah</p>
          <h1 className="serve__number">#{data.modelNumber}</h1>
          {data.flavour ? <p className="serve__flavour">{data.flavour}</p> : null}
          {data.guestPayTier || data.refillPriceCents >= 0 ? (
            <div
              className={`serve__tier${isUnlimited ? " serve__tier--unlimited" : " serve__tier--standard"}`}
            >
              <strong>{isUnlimited ? "Unlimited" : isStandard ? "Standard" : "Your plan"}</strong>
              <span>
                {isUnlimited
                  ? "Refills included · no charge"
                  : `Refills ${exclusiveLabel} + ${hstPct}% HST (${priceLabel})`}
              </span>
            </div>
          ) : null}
          {elapsed && !data.sessionEnded ? (
            <p className="serve__timer">
              With you for <strong>{elapsed}</strong>
            </p>
          ) : null}
        </section>

        {data.sessionEnded ? (
          <div className="serve__status serve__status--done">
            <h2>Session wrapped</h2>
            <p>This hookah is no longer on the floor. Thanks for smoking with Oui.</p>
            {data.sessionSummary ? (
              <div className="serve__summary">
                <p className="serve__summary-title">Your night with Oui</p>
                <ul className="serve__summary-list">
                  {summaryDuration ? (
                    <li>
                      <span>Time smoked</span>
                      <strong>{summaryDuration}</strong>
                    </li>
                  ) : null}
                  {data.sessionSummary.flavour ? (
                    <li>
                      <span>Flavour</span>
                      <strong>{data.sessionSummary.flavour}</strong>
                    </li>
                  ) : null}
                  <li>
                    <span>Refills</span>
                    <strong>{data.sessionSummary.refillCount}</strong>
                  </li>
                  <li>
                    <span>Staff visits</span>
                    <strong>{data.sessionSummary.requestCount}</strong>
                  </li>
                </ul>
              </div>
            ) : null}

            {data.photos && data.photos.length > 0 ? (
              <NightGallery
                photos={data.photos}
                title="Your night"
                subtitle="Moments you shared from this hookah"
              />
            ) : null}

            {data.guestFeedback ? (
              <div className="serve__feedback serve__feedback--done">
                <p className="serve__feedback-title">Thanks for the {data.guestFeedback.rating}/5</p>
                <p>
                  We read every guest note in ops — your experience shapes how we run the next event.
                </p>
              </div>
            ) : (
              <form className="serve__feedback" onSubmit={submitFeedback}>
                <p className="serve__feedback-title">How was your session?</p>
                <p className="serve__feedback-lede">
                  Rate the night — we review every response on the dashboard.
                </p>
                <div className="serve__stars" role="group" aria-label="Rating from 1 to 5">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      className={`serve__star${rating >= n ? " is-on" : ""}`}
                      aria-pressed={rating === n}
                      onClick={() => setRating(n)}
                    >
                      {n}
                    </button>
                  ))}
                </div>
                <label className="serve__feedback-label" htmlFor="guest-feedback">
                  Anything we should know? <span className="serve__optional">(optional)</span>
                </label>
                <textarea
                  id="guest-feedback"
                  className="serve__textarea"
                  rows={3}
                  maxLength={600}
                  value={feedbackComment}
                  onChange={(e) => setFeedbackComment(e.target.value)}
                  placeholder="Service, flavours, vibe…"
                />
                {feedbackMsg ? <p className="serve__photo-ok">{feedbackMsg}</p> : null}
                <button type="submit" className="serve__btn" disabled={feedbackBusy || rating < 1}>
                  {feedbackBusy ? "Sending…" : "Send feedback"}
                </button>
              </form>
            )}

            {data.rebookPromo ? (
              <div className="serve__rebook">
                <p className="serve__feedback-title">{data.rebookPromo.label}</p>
                <p>
                  Book your next Oui Smoke event and take{" "}
                  <strong>${data.rebookPromo.discountDollars} off</strong>. Use code{" "}
                  <strong>{data.rebookPromo.code}</strong> — we’ll apply it when we confirm your quote.
                </p>
                <a className="serve__btn serve__btn--rebook" href={data.rebookPromo.bookUrl}>
                  Book with ${data.rebookPromo.discountDollars} off
                </a>
              </div>
            ) : null}
          </div>
        ) : active ? (
          <div
            className={`serve__status ${
              refillPaid
                ? "serve__status--paid"
                : onTheWay
                  ? "serve__status--way"
                  : "serve__status--wait"
            }${statusFlash ? " is-flash" : ""}`}
          >
            {refillPaid ? (
              <p className="serve__paid-badge">Payment received</p>
            ) : null}
            <h2>
              {refillPaid
                ? "You’re paid — we’re on it"
                : onTheWay
                  ? active.acknowledgedBy
                    ? `${active.acknowledgedBy} is on the way`
                    : "We’re on the way"
                  : "Request received"}
            </h2>
            <p>
              {active.type === "refill"
                ? refillStatusCopy
                : active.type === "order_unit"
                  ? orderUnitStatusCopy
                : onTheWay
                  ? active.acknowledgedBy
                    ? `${active.acknowledgedBy} claimed your request — keep this page open.`
                    : "A host claimed your request — keep this page open."
                  : "We’ve got your request. Keep this page open for live updates."}
            </p>
            <ol className="serve__loop" aria-label="Live request progress">
              <li className="serve__loop-step is-done">
                <span className="serve__loop-dot" aria-hidden />
                <div>
                  <strong>Request sent</strong>
                  <span>Staff can see it on the floor</span>
                </div>
              </li>
              <li
                className={`serve__loop-step ${
                  onTheWay || refillPaid
                    ? "is-done"
                    : "is-current"
                }`}
              >
                <span className="serve__loop-dot" aria-hidden />
                <div>
                  <strong>Staff on the way</strong>
                  <span>
                    {onTheWay || refillPaid
                      ? active.acknowledgedBy
                        ? `${active.acknowledgedBy} is heading over`
                        : "A host is heading over"
                      : "Waiting for staff to pick this up"}
                  </span>
                </div>
              </li>
              {(active.type === "refill" || active.type === "order_unit") &&
              (active.priceCents ?? 0) > 0 ? (
                <li
                  className={`serve__loop-step ${
                    refillPaid
                      ? "is-done"
                      : onTheWay
                        ? "is-current"
                        : ""
                  }`}
                >
                  <span className="serve__loop-dot" aria-hidden />
                  <div>
                    <strong>Payment</strong>
                    <span>
                      {refillPaid
                        ? "Confirmed"
                        : active.payPreference === "terminal"
                          ? "Pay when staff arrive with the terminal"
                          : "Pay on your phone, or switch to terminal"}
                    </span>
                  </div>
                </li>
              ) : null}
              <li
                className={`serve__loop-step ${
                  refillPaid && onTheWay ? "is-current" : ""
                }`}
              >
                <span className="serve__loop-dot" aria-hidden />
                <div>
                  <strong>
                    {active.type === "order_unit"
                      ? "Extra hookah out"
                      : active.type === "refill"
                        ? "Fresh head delivered"
                        : "Complete"}
                  </strong>
                  <span>
                    {active.type === "order_unit"
                      ? "Staff stage a new unit and bring its QR"
                      : "This clears when staff finish at your table"}
                  </span>
                </div>
              </li>
            </ol>
            {refillPaid && active.priceCents != null && active.priceCents > 0 ? (
              <p className="serve__paid-amount">
                {formatMoney(
                  withHstDisplay(active.priceCents, hstRate),
                )}{" "}
                incl. HST confirmed
                {active.payPreference === "terminal" ? " with staff" : " via Square"}
              </p>
            ) : null}
            {etaLabel ? (
              <p className="serve__eta">
                ETA · <strong>{etaLabel}</strong>
              </p>
            ) : null}
            <div className="serve__pill">{requestLabel(active, hstRate)}</div>
            {refillCheckoutUrl ? (
              <a
                className="serve__btn"
                href={refillCheckoutUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ marginTop: 16, display: "inline-flex" }}
              >
                Pay{" "}
                {active.priceCents != null
                  ? `${formatMoney(withHstDisplay(active.priceCents, hstRate))} incl. HST`
                  : priceLabel}{" "}
                on your phone
              </a>
            ) : null}
            {active.type === "refill" || active.type === "order_unit"
              ? (active.priceCents ?? 0) > 0 && !refillPaid
                ? (
              <div className="serve__recover">
                {active.payPreference === "phone" && !refillCheckoutUrl ? (
                  <button
                    type="button"
                    className="serve__btn"
                    disabled={submitting}
                    onClick={() => void guestRequestAction("retry_checkout")}
                  >
                    Retry pay link
                  </button>
                ) : null}
                {active.payPreference === "phone" ? (
                  <button
                    type="button"
                    className="serve__btn serve__btn--ghost"
                    disabled={submitting}
                    onClick={() =>
                      void guestRequestAction("update_pay_preference", "terminal")
                    }
                  >
                    Switch to terminal
                  </button>
                ) : (
                  <button
                    type="button"
                    className="serve__btn serve__btn--ghost"
                    disabled={submitting}
                    onClick={() =>
                      void guestRequestAction("update_pay_preference", "phone")
                    }
                  >
                    Switch to phone pay
                  </button>
                )}
                <button
                  type="button"
                  className="serve__btn serve__btn--ghost"
                  disabled={submitting}
                  onClick={() => void guestRequestAction("cancel_request")}
                >
                  Cancel request
                </button>
              </div>
                )
                : null
              : null}
            {(active.type === "refill" || active.type === "order_unit") &&
            active.payPreference === "terminal" &&
            !refillPaid ? (
              <p className="serve__muted" style={{ marginTop: 12 }}>
                No phone payment needed — pay when staff arrive with the terminal.
              </p>
            ) : null}
            {refillPaid ? (
              <p className="serve__muted" style={{ marginTop: 12 }}>
                Staff can see this payment. Keep this page open for live updates.
              </p>
            ) : null}
          </div>
        ) : selectedType === "refill" ? (
          <form className="serve__note serve__refill" onSubmit={handleRefillSubmit}>
            <h2 className="serve__section-title">Request a refill</h2>
            <p className="serve__muted">
              {isUnlimited
                ? "Pick the same flavour or switch. Refills are included on Unlimited — no charge."
                : `Pick the same flavour or switch. Standard refills are ${priceLabel}.`}
            </p>

            <label htmlFor="refill-flavour">Flavour</label>
            <select
              id="refill-flavour"
              value={refillFlavourId}
              onChange={(e) => setRefillFlavourId(e.target.value)}
              required
            >
              <option value="">Choose flavour…</option>
              {data.flavours.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                  {data.flavourId === f.id ? " (current)" : ""}
                </option>
              ))}
            </select>
            {(() => {
              const selected = data.flavours.find(
                (f) => String(f.id) === refillFlavourId,
              );
              if (!selected?.description) return null;
              return (
                <p className="serve__muted serve__mix-hint">{selected.description}</p>
              );
            })()}

            {isUnlimited ? (
              <div className="serve__price serve__price--included">
                <span>This refill</span>
                <strong>Included</strong>
              </div>
            ) : (
              <>
                <div className="serve__price">
                  <span>Refill price</span>
                  <strong>{priceLabel}</strong>
                </div>

                <p className="serve__pay-label">How do you want to pay?</p>
                <div className="serve__pay-choices" role="group" aria-label="Pay method">
                  <button
                    type="button"
                    className={`serve__pay-choice${payPreference === "phone" ? " is-on" : ""}`}
                    onClick={() => setPayPreference("phone")}
                  >
                    <strong>Pay on my phone</strong>
                    <span>Get a Square link now — staff prep while you checkout</span>
                  </button>
                  <button
                    type="button"
                    className={`serve__pay-choice${payPreference === "terminal" ? " is-on" : ""}`}
                    onClick={() => setPayPreference("terminal")}
                  >
                    <strong>Bring the terminal</strong>
                    <span>Staff collect payment when they deliver your refill</span>
                  </button>
                </div>
              </>
            )}

            <label htmlFor="refill-note">Note (optional)</label>
            <textarea
              id="refill-note"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Anything staff should know…"
              maxLength={280}
            />

            <div className="serve__note-actions">
              <button
                type="button"
                className="serve__btn serve__btn--ghost"
                onClick={() => {
                  setSelectedType(null);
                  setNote("");
                  setPayPreference(null);
                  setError("");
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="serve__btn"
                disabled={
                  submitting ||
                  !refillFlavourId ||
                  (!isUnlimited && !payPreference)
                }
              >
                {isUnlimited
                  ? "Request refill"
                  : payPreference === "phone"
                    ? "Request & pay on phone"
                    : payPreference === "terminal"
                      ? "Request · bring terminal"
                      : "Request refill"}
              </button>
            </div>
          </form>
        ) : selectedType === "order_unit" ? (
          <form
            className="serve__note serve__refill"
            onSubmit={handleOrderUnitSubmit}
          >
            <h2 className="serve__section-title">Order another hookah</h2>
            <p className="serve__muted">
              Pick Standard or Unlimited, then a flavour. Staff will stage a new
              unit and bring its QR code.
            </p>

            <p className="serve__pay-label">Plan</p>
            <div className="serve__pay-choices" role="group" aria-label="Plan">
              <button
                type="button"
                className={`serve__pay-choice${orderTier === "standard" ? " is-on" : ""}`}
                onClick={() => setOrderTier("standard")}
              >
                <strong>Standard · {standardUnitLabel}</strong>
                <span>Incl. HST · refills extra</span>
              </button>
              <button
                type="button"
                className={`serve__pay-choice${orderTier === "unlimited" ? " is-on" : ""}`}
                onClick={() => setOrderTier("unlimited")}
              >
                <strong>Unlimited · {unlimitedUnitLabel}</strong>
                <span>Incl. HST · refills included</span>
              </button>
            </div>

            <label htmlFor="order-flavour">Flavour</label>
            <select
              id="order-flavour"
              value={refillFlavourId}
              onChange={(e) => setRefillFlavourId(e.target.value)}
              required
            >
              <option value="">Choose flavour…</option>
              {data.flavours.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>

            <p className="serve__pay-label">How do you want to pay?</p>
            <div className="serve__pay-choices" role="group" aria-label="Pay method">
              <button
                type="button"
                className={`serve__pay-choice${payPreference === "phone" ? " is-on" : ""}`}
                onClick={() => setPayPreference("phone")}
              >
                <strong>Pay on my phone</strong>
                <span>Get a Square link now — staff prep while you checkout</span>
              </button>
              <button
                type="button"
                className={`serve__pay-choice${payPreference === "terminal" ? " is-on" : ""}`}
                onClick={() => setPayPreference("terminal")}
              >
                <strong>Bring the terminal</strong>
                <span>Staff collect when they bring the new hookah</span>
              </button>
            </div>

            <label htmlFor="order-note">Note (optional)</label>
            <textarea
              id="order-note"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Table number, who it’s for…"
              maxLength={280}
            />

            <div className="serve__note-actions">
              <button
                type="button"
                className="serve__btn serve__btn--ghost"
                onClick={() => {
                  setSelectedType(null);
                  setNote("");
                  setPayPreference(null);
                  setOrderTier("");
                  setError("");
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="serve__btn"
                disabled={
                  submitting ||
                  !orderTier ||
                  !refillFlavourId ||
                  !payPreference
                }
              >
                {payPreference === "phone"
                  ? "Order & pay on phone"
                  : payPreference === "terminal"
                    ? "Order · bring terminal"
                    : "Order hookah"}
              </button>
            </div>
          </form>
        ) : (
          <>
            <section className="serve__actions">
              <h2 className="serve__section-title">Need something?</h2>
              <p className="serve__muted">
                Tap below — we’ll see it instantly on the floor.
              </p>
              <div className="serve__grid">
                {actionTypes.map((item) => (
                  <button
                    key={item.type}
                    type="button"
                    className="serve__action"
                    disabled={submitting}
                    onClick={() => {
                      if (item.type === "issue") {
                        setSelectedType("issue");
                        setError("");
                      } else if (item.type === "refill") {
                        openRefill();
                      } else if (item.type === "order_unit") {
                        openOrderUnit();
                      } else {
                        submit(item.type);
                      }
                    }}
                  >
                    <span className="serve__action-label">{item.label}</span>
                    <span className="serve__action-hint">
                      {item.type === "refill"
                        ? isUnlimited
                          ? "Included on Unlimited — no charge"
                          : `Standard · ${priceLabel} · phone or terminal`
                        : item.type === "order_unit"
                          ? `Standard ${standardUnitLabel} · Unlimited ${unlimitedUnitLabel}`
                          : item.hint}
                    </span>
                  </button>
                ))}
              </div>
            </section>

            {selectedType === "issue" ? (
              <form className="serve__note" onSubmit={handleIssueSubmit}>
                <label htmlFor="note">What’s going on?</label>
                <textarea
                  id="note"
                  rows={3}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Optional — e.g. hose issue, tip fell, won’t draw…"
                  maxLength={280}
                />
                <div className="serve__note-actions">
                  <button
                    type="button"
                    className="serve__btn serve__btn--ghost"
                    onClick={() => {
                      setSelectedType(null);
                      setNote("");
                    }}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="serve__btn" disabled={submitting}>
                    Send request
                  </button>
                </div>
              </form>
            ) : null}
          </>
        )}

        {!data.sessionEnded && recent.length > 0 ? (
          <section className="serve__history">
            <h2 className="serve__section-title">Tonight so far</h2>
            <ul className="serve__history-list">
              {recent.map((r) => (
                <li key={r.id}>
                  <span>{requestLabel(r)}</span>
                  <span className="serve__history-status">{r.status}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {!data.sessionEnded ? (
          <section className="serve__photo">
            <h2 className="serve__section-title">Share a moment</h2>
            <p className="serve__muted">
              Send a photo from your night — Oui may feature it on social media.
            </p>

            <label className="serve__agree serve__agree--photo" htmlFor="photo-consent">
              <input
                id="photo-consent"
                type="checkbox"
                checked={photoConsent}
                onChange={(e) => setPhotoConsent(e.target.checked)}
              />
              <span>
                I confirm I have the right to share this photo and give Oui Smoke permission
                to use it on Instagram, TikTok, and other marketing channels, with or without
                tagging me.
              </span>
            </label>

            <label className="serve__handle-label" htmlFor="social-handle">
              Social handle <span className="serve__optional">(optional)</span>
            </label>
            <input
              id="social-handle"
              className="serve__handle"
              type="text"
              value={socialHandle}
              onChange={(e) => setSocialHandle(e.target.value)}
              placeholder="@yourhandle"
              maxLength={80}
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
            />
            <p className="serve__handle-hint">
              If you’d like a tag when we post, leave your Instagram or TikTok handle.
            </p>

            <input
              ref={photoInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="serve__file"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void uploadPhoto(file);
              }}
            />
            <button
              type="button"
              className="serve__btn serve__btn--photo"
              disabled={uploadingPhoto || !photoConsent}
              onClick={() => {
                if (!photoConsent) {
                  setError("Please agree to the photo consent before uploading");
                  return;
                }
                photoInputRef.current?.click();
              }}
            >
              {uploadingPhoto ? "Uploading…" : "Take / upload photo"}
            </button>
            {photoMsg ? <p className="serve__photo-ok">{photoMsg}</p> : null}
          </section>
        ) : null}

        {error ? <p className="serve__error">{error}</p> : null}

        <footer className="serve__foot">
          {data.sessionEnded ? (
            <>
              <p>Thanks for smoking with Oui.</p>
              <p className="serve__muted">Oui Smoke · Toronto &amp; GTA</p>
            </>
          ) : (
            <>
              <p>Keep this window open while you smoke.</p>
              <p className="serve__muted">Oui Smoke · Toronto &amp; GTA</p>
            </>
          )}
        </footer>
      </div>
    </div>
  );
}
