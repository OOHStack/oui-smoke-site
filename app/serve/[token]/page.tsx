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
    type: "issue",
    label: "Something’s off",
    hint: "Hose, draw, tip — we can help",
  },
] as const;

function formatMoney(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatElapsed(ms: number) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  return `${m}m ${String(s).padStart(2, "0")}s`;
}

function requestLabel(active: ActiveRequest) {
  if (active.type === "coals") return "Fresh coals";
  if (active.type === "refill") {
    const flavour = active.flavourLabel ? ` · ${active.flavourLabel}` : "";
    const price =
      active.priceCents != null ? ` · ${formatMoney(active.priceCents)}` : "";
    return `Refill${flavour}${price}`;
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
  const [priceAgreed, setPriceAgreed] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [rating, setRating] = useState(0);
  const [feedbackComment, setFeedbackComment] = useState("");
  const [feedbackBusy, setFeedbackBusy] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState("");

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
    extras?: { message?: string; flavourId?: number; priceAgreed?: boolean },
  ) {
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch(`/api/serve/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          message: extras?.message || undefined,
          flavourId: extras?.flavourId,
          priceAgreed: extras?.priceAgreed,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? "Couldn’t send request");
        await load();
        return;
      }
      setSelectedType(null);
      setNote("");
      setPriceAgreed(false);
      await load();
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
    if (!priceAgreed) {
      setError("Please agree to the refill price");
      return;
    }
    submit("refill", { flavourId, priceAgreed: true, message: note || undefined });
  }

  function openRefill() {
    setSelectedType("refill");
    setPriceAgreed(false);
    setNote("");
    setError("");
    if (data?.flavourId) setRefillFlavourId(String(data.flavourId));
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
  const priceLabel = formatMoney(data.refillPriceCents ?? 2500);
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

  return (
    <div className="serve">
      <div className="serve__shell">
        <header className="serve__brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-white.png" alt="Oui Smoke" className="serve__logo" width={200} height={54} />
          <p className="serve__kicker">Guest service</p>
        </header>

        <section className="serve__hero">
          <p className="serve__eyebrow">Your hookah</p>
          <h1 className="serve__number">#{data.modelNumber}</h1>
          {data.flavour ? <p className="serve__flavour">{data.flavour}</p> : null}
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
            className={`serve__status ${onTheWay ? "serve__status--way" : "serve__status--wait"}`}
          >
            <h2>{onTheWay ? "We’re on the way" : "Request received"}</h2>
            <p>
              {active.type === "refill"
                ? onTheWay
                  ? "A host is bringing a fresh head and a payment terminal."
                  : "We’ve got your refill — staff will bring a fresh head and a payment terminal."
                : onTheWay
                  ? "A host is coming to help — keep this page open."
                  : "We’ve got your request. Keep this page open for live updates."}
            </p>
            {etaLabel ? (
              <p className="serve__eta">
                ETA · <strong>{etaLabel}</strong>
              </p>
            ) : null}
            <div className="serve__pill">{requestLabel(active)}</div>
          </div>
        ) : selectedType === "refill" ? (
          <form className="serve__note serve__refill" onSubmit={handleRefillSubmit}>
            <h2 className="serve__section-title">Request a refill</h2>
            <p className="serve__muted">
              Pick the same flavour or switch. Staff will prep a new head and bring a payment terminal.
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

            <div className="serve__price">
              <span>Refill price</span>
              <strong>{priceLabel}</strong>
            </div>

            <label className="serve__agree">
              <input
                type="checkbox"
                checked={priceAgreed}
                onChange={(e) => setPriceAgreed(e.target.checked)}
              />
              <span>I agree to pay {priceLabel} for this refill</span>
            </label>

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
                  setPriceAgreed(false);
                  setError("");
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="serve__btn"
                disabled={submitting || !priceAgreed || !refillFlavourId}
              >
                Request refill
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
                {REQUEST_TYPES.map((item) => (
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
                      } else {
                        submit(item.type);
                      }
                    }}
                  >
                    <span className="serve__action-label">{item.label}</span>
                    <span className="serve__action-hint">{item.hint}</span>
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
