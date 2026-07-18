"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import OuiMark from "@/components/brand/OuiMark";
import { useOuiMarkMotion } from "@/components/brand/useOuiMarkMotion";
import { useSse } from "@/lib/hooks/useSse";
import type { JobDisplaySnapshot } from "@/lib/job-display-board";
import "./job-display.css";

const HERO_PHOTO = "/images/model-2-web.jpg";
const CONFIRM_MS = 8_000;

type OrderStep = "closed" | "tier" | "flavour" | "done";

function playTakeoverChime() {
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(523.25, now);
    o.frequency.setValueAtTime(659.25, now + 0.12);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.08, now + 0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.38);
    o.connect(g);
    g.connect(ctx.destination);
    o.start(now);
    o.stop(now + 0.4);
    window.setTimeout(() => void ctx.close(), 500);
  } catch {
    /* ignore audio failures */
  }
}

function dollars(cents: number) {
  return `$${Math.round(cents / 100)}`;
}

export default function JobDisplayPage() {
  const params = useParams<{ token: string }>();
  const token = params?.token ?? "";
  const rootRef = useRef<HTMLDivElement>(null);
  const [board, setBoard] = useState<JobDisplaySnapshot | null>(null);
  const [error, setError] = useState("");
  const lastTakeoverId = useRef<number | null>(null);

  const [orderStep, setOrderStep] = useState<OrderStep>("closed");
  const [tier, setTier] = useState<"standard" | "unlimited" | "">("");
  const [flavourId, setFlavourId] = useState<number | null>(null);
  const [guestLabel, setGuestLabel] = useState("");
  const [orderBusy, setOrderBusy] = useState(false);
  const [orderError, setOrderError] = useState("");
  const [orderDone, setOrderDone] = useState<{
    flavourLabel: string;
    tier: string;
    priceCents: number;
  } | null>(null);

  useOuiMarkMotion(rootRef, Boolean(board) && !error);

  useSse<JobDisplaySnapshot & { error?: string }>(
    token ? `/api/stream/display/job/${encodeURIComponent(token)}` : null,
    (data) => {
      if (data?.error) {
        setError(data.error);
        setBoard(null);
        return;
      }
      setError("");
      setBoard(data);
    },
    Boolean(token),
  );

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    void (async () => {
      const res = await fetch(
        `/api/display/job/${encodeURIComponent(token)}`,
        { cache: "no-store" },
      );
      if (cancelled) return;
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Display link not found");
        return;
      }
      const data = (await res.json()) as JobDisplaySnapshot;
      setBoard(data);
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    const id = board?.takeover?.assignmentId ?? null;
    if (id != null && id !== lastTakeoverId.current) {
      lastTakeoverId.current = id;
      playTakeoverChime();
      setOrderStep("closed");
    }
  }, [board?.takeover?.assignmentId]);

  useEffect(() => {
    if (orderStep !== "done") return;
    const t = window.setTimeout(() => {
      setOrderStep("closed");
      setOrderDone(null);
      setTier("");
      setFlavourId(null);
      setGuestLabel("");
      setOrderError("");
    }, CONFIRM_MS);
    return () => window.clearTimeout(t);
  }, [orderStep]);

  async function submitOrder() {
    if (!token || !tier || flavourId == null) return;
    setOrderBusy(true);
    setOrderError("");
    try {
      const res = await fetch(
        `/api/display/job/${encodeURIComponent(token)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "order",
            guestPayTier: tier,
            flavourId,
            guestLabel: guestLabel.trim() || undefined,
          }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setOrderError(data.error ?? "Couldn’t place order");
        return;
      }
      setOrderDone({
        flavourLabel: data.flavourLabel ?? "Your flavour",
        tier: data.tier ?? tier,
        priceCents: data.priceCents ?? 0,
      });
      setOrderStep("done");
    } catch {
      setOrderError("Couldn’t reach Oui Smoke. Try again.");
    } finally {
      setOrderBusy(false);
    }
  }

  if (error) {
    return (
      <div className="jdisplay jdisplay--error">
        <div>
          <h1>Link inactive</h1>
          <p>{error}. Open Event display from the job page for a fresh link.</p>
        </div>
      </div>
    );
  }

  if (!board) {
    return (
      <div className="jdisplay jdisplay--loading">
        <p>Loading event floor…</p>
      </div>
    );
  }

  const takeover = board.takeover;
  const packages = board.idle.showOnsitePackages
    ? board.idle.onsitePackages
    : board.idle.showPrivatePackages
      ? board.idle.privatePackages
      : [];
  const orderingOpen =
    orderStep !== "closed" && orderStep !== "done" && !takeover;
  const canOrder = board.ordering.enabled && !takeover;

  return (
    <div
      ref={rootRef}
      className={`jdisplay${takeover ? " jdisplay--takeover" : ""}${
        orderingOpen || orderStep === "done" ? " jdisplay--ordering" : ""
      }`}
    >
      <div className="jdisplay__bg" aria-hidden />
      <div
        className="jdisplay__bg-photo"
        style={{ backgroundImage: `url(${HERO_PHOTO})` }}
        aria-hidden
      />
      <div className="jdisplay__veil" aria-hidden />

      <div className="jdisplay__shell">
        <header className="jdisplay__top">
          <div className="jdisplay__top-copy">
            <p className="jdisplay__kicker">
              {board.mode === "onsite"
                ? "On-site sales"
                : board.mode === "comp"
                  ? "Complimentary"
                  : "Private event"}
            </p>
            <h1 className="jdisplay__event">
              {board.job.title || board.job.clientName || "Oui Smoke"}
            </h1>
            <p className="jdisplay__meta">
              {[board.job.clientName, board.job.location]
                .filter(Boolean)
                .join(" · ") || "Oui Smoke"}
            </p>
          </div>
          <div className="jdisplay__mark-slot">
            <OuiMark className="jdisplay__mark oui-mark" />
          </div>
        </header>

        <div className="jdisplay__stage">
          <section
            className={`jdisplay__idle${
              takeover || orderingOpen || orderStep === "done" ? " is-dimmed" : ""
            }`}
            aria-hidden={Boolean(takeover || orderingOpen || orderStep === "done")}
          >
            <h2 className="jdisplay__headline">{board.idle.headline}</h2>
            <p className="jdisplay__lede">{board.idle.lede}</p>

            {canOrder ? (
              <button
                type="button"
                className="jdisplay__order-cta"
                onClick={() => {
                  setOrderError("");
                  setOrderStep("tier");
                }}
              >
                Order a hookah
              </button>
            ) : null}

            <div className="jdisplay__panels">
              <div>
                <p className="jdisplay__section-label">Flavour menu</p>
                {board.flavours.length === 0 ? (
                  <p className="jdisplay__lede">Ask the crew for the menu.</p>
                ) : (
                  <div className="jdisplay__flavours">
                    {board.flavours.map((f) => (
                      <article key={f.id} className="jdisplay__flavour">
                        <strong>{f.name}</strong>
                        {f.description ? <span>{f.description}</span> : null}
                      </article>
                    ))}
                  </div>
                )}
              </div>

              {packages.length > 0 ? (
                <div>
                  <p className="jdisplay__section-label">
                    {board.mode === "onsite" ? "Guest rates" : "Packages"}
                  </p>
                  <div className="jdisplay__rates">
                    {packages.map((pkg) => (
                      <article key={pkg.id} className="jdisplay__rate">
                        <h3 className="jdisplay__rate-title">{pkg.title}</h3>
                        <p className="jdisplay__rate-price">{pkg.price}</p>
                        <p className="jdisplay__rate-detail">{pkg.detail}</p>
                      </article>
                    ))}
                  </div>
                  <ul className="jdisplay__footnotes">
                    {board.idle.footnotes.map((n) => (
                      <li key={n}>{n}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div>
                  <p className="jdisplay__section-label">Service</p>
                  <p className="jdisplay__lede" style={{ marginTop: 0 }}>
                    When your hookah comes out, this screen will show your unit
                    number and a QR code for coals, refills, and help.
                  </p>
                  <ul className="jdisplay__footnotes">
                    {board.idle.footnotes.map((n) => (
                      <li key={n}>{n}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </section>

          <section
            className={`jdisplay__order${orderingOpen ? " is-on" : ""}`}
            aria-hidden={!orderingOpen}
          >
            {orderStep === "tier" ? (
              <div className="jdisplay__order-panel">
                <p className="jdisplay__cfd-kicker">Step 1</p>
                <h2 className="jdisplay__headline">Choose your plan</h2>
                <p className="jdisplay__lede">
                  Pay when staff bring the terminal. Prices before tax.
                </p>
                <div className="jdisplay__order-tiers">
                  <button
                    type="button"
                    className="jdisplay__order-choice"
                    onClick={() => {
                      setTier("standard");
                      setOrderStep("flavour");
                    }}
                  >
                    <strong>Standard</strong>
                    <span className="jdisplay__order-choice-price">
                      {dollars(board.ordering.standardCents)}
                    </span>
                    <span className="jdisplay__order-choice-note">
                      Refills extra{" "}
                      <em className="jdisplay__order-choice-accent">
                        {dollars(board.ordering.refillCents)}
                      </em>
                    </span>
                  </button>
                  <button
                    type="button"
                    className="jdisplay__order-choice"
                    onClick={() => {
                      setTier("unlimited");
                      setOrderStep("flavour");
                    }}
                  >
                    <strong>Unlimited</strong>
                    <span className="jdisplay__order-choice-price">
                      {dollars(board.ordering.unlimitedCents)}
                    </span>
                    <span className="jdisplay__order-choice-note">
                      Refills included
                    </span>
                  </button>
                </div>
                <button
                  type="button"
                  className="jdisplay__order-back"
                  onClick={() => setOrderStep("closed")}
                >
                  Cancel
                </button>
              </div>
            ) : null}

            {orderStep === "flavour" ? (
              <div className="jdisplay__order-panel jdisplay__order-panel--flavours">
                <p className="jdisplay__cfd-kicker">Step 2 · {tier}</p>
                <h2 className="jdisplay__headline">Pick a flavour</h2>
                <div className="jdisplay__order-flavours">
                  {board.flavours.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      className={`jdisplay__order-flavour${
                        flavourId === f.id ? " is-selected" : ""
                      }`}
                      onClick={() => setFlavourId(f.id)}
                    >
                      <em className="jdisplay__order-flavour-kind">
                        {f.kind === "mix" ? "Mix" : "Single"}
                      </em>
                      <strong>{f.name}</strong>
                      {f.description ? <span>{f.description}</span> : null}
                    </button>
                  ))}
                </div>
                <label className="jdisplay__order-label">
                  Name or table{" "}
                  <span className="jdisplay__order-optional">(optional)</span>
                  <input
                    type="text"
                    value={guestLabel}
                    maxLength={40}
                    placeholder="e.g. Table 4 · Maya"
                    onChange={(e) => setGuestLabel(e.target.value)}
                    autoComplete="off"
                  />
                </label>
                {orderError ? (
                  <p className="jdisplay__order-error">{orderError}</p>
                ) : null}
                <div className="jdisplay__order-actions">
                  <button
                    type="button"
                    className="jdisplay__order-back"
                    onClick={() => {
                      setFlavourId(null);
                      setOrderStep("tier");
                    }}
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    className="jdisplay__order-cta"
                    disabled={flavourId == null || orderBusy}
                    onClick={() => void submitOrder()}
                  >
                    {orderBusy ? "Sending…" : "Send order"}
                  </button>
                </div>
              </div>
            ) : null}
          </section>

          <section
            className={`jdisplay__order-done${orderStep === "done" ? " is-on" : ""}`}
            aria-live="polite"
            aria-hidden={orderStep !== "done"}
          >
            {orderDone ? (
              <div>
                <p className="jdisplay__cfd-kicker">Order received</p>
                <h2 className="jdisplay__headline">We&apos;re on it</h2>
                <p className="jdisplay__cfd-flavour">
                  {orderDone.tier === "unlimited" ? "Unlimited" : "Standard"} ·{" "}
                  {orderDone.flavourLabel}
                </p>
                <p className="jdisplay__cfd-hint">
                  Staff will pack your flavour and bring the terminal
                  {orderDone.priceCents > 0
                    ? ` · ${dollars(orderDone.priceCents)} before tax`
                    : ""}
                  . When your hookah goes out, this screen will show your QR.
                </p>
              </div>
            ) : null}
          </section>

          <section
            className={`jdisplay__cfd${takeover ? " is-on" : ""}`}
            aria-live="polite"
            aria-hidden={!takeover}
          >
            {takeover ? (
              <div className="jdisplay__cfd-grid">
                <div>
                  <p className="jdisplay__cfd-kicker">Your hookah is ready</p>
                  <p className="jdisplay__cfd-unit">#{takeover.modelNumber}</p>
                  <p className="jdisplay__cfd-flavour">{takeover.flavour}</p>
                  {takeover.guestPayTier ? (
                    <span className="jdisplay__cfd-tier">
                      {takeover.guestPayTier === "unlimited"
                        ? "Unlimited · refills included"
                        : "Standard"}
                    </span>
                  ) : null}
                  <p className="jdisplay__cfd-hint">
                    Scan for coals, flavour changes, and help — keep this code
                    with your table.
                  </p>
                </div>
                <div className="jdisplay__cfd-qr">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={takeover.qrDataUrl}
                    alt={`QR code for unit ${takeover.modelNumber}`}
                  />
                  <p>Scan to open</p>
                </div>
              </div>
            ) : null}
          </section>
        </div>

        <footer className="jdisplay__foot">
          <span>
            On the floor <strong>{board.floor.outCount}</strong>
            {board.floor.stagedCount > 0 ? (
              <>
                {" "}
                · Ready <strong>{board.floor.stagedCount}</strong>
              </>
            ) : null}
          </span>
          <span>Oui Smoke</span>
        </footer>
      </div>
    </div>
  );
}
