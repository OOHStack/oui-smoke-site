"use client";

import { FormEvent, Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { trackGenerateLead } from "@/lib/analytics";
import {
  DEFAULT_PRICING,
  estimateBooking,
  formatCad,
  type PricingConfig,
} from "@/lib/pricing";
import "./book.css";

type Engagement = "package" | "on_site";

type PaymentCopy = {
  defaultDepositPercent: number;
  autoBalanceEnabled: boolean;
  autoBalanceDaysBefore: number;
  balanceTiming: string;
};

const FALLBACK_COPY: PaymentCopy = {
  defaultDepositPercent: 50,
  autoBalanceEnabled: true,
  autoBalanceDaysBefore: 7,
  balanceTiming: "about a week before the event",
};

function BookForm() {
  const searchParams = useSearchParams();
  const promoCode = (searchParams.get("code") || "").trim().toUpperCase();

  const initialType = (searchParams.get("type") || "").trim().toLowerCase();
  const initialHours = (() => {
    const n = Number(searchParams.get("hours"));
    if (!Number.isFinite(n)) return "4";
    return String(Math.min(12, Math.max(1, Math.floor(n))));
  })();
  const initialHookahs = (() => {
    const n = Number(searchParams.get("hookahs"));
    const min = initialType === "package" ? 4 : 1;
    if (!Number.isFinite(n)) return "4";
    return String(Math.min(40, Math.max(min, Math.floor(n))));
  })();

  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<null | Engagement>(null);
  const [error, setError] = useState("");
  const [engagement, setEngagement] = useState<Engagement | "">(
    initialType === "package" || initialType === "on_site"
      ? (initialType as Engagement)
      : "",
  );
  const [hours, setHours] = useState(initialHours);
  const [hookahs, setHookahs] = useState(initialHookahs);
  const [payCopy, setPayCopy] = useState<PaymentCopy>(FALLBACK_COPY);
  const [pricing, setPricing] = useState<PricingConfig>(DEFAULT_PRICING);

  const promo = useMemo(() => {
    if (
      promoCode &&
      promoCode === pricing.guestRebookCode.toUpperCase()
    ) {
      return {
        discountDollars: pricing.guestRebookDiscountDollars,
        label: pricing.guestRebookLabel,
      };
    }
    return null;
  }, [promoCode, pricing]);

  useEffect(() => {
    if (engagement !== "package") return;
    setHookahs((current) => {
      const n = Number(current);
      if (!Number.isFinite(n) || n < pricing.minPackageHookahs) {
        return String(pricing.minPackageHookahs);
      }
      return current;
    });
  }, [engagement, pricing.minPackageHookahs]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [copyRes, priceRes] = await Promise.all([
          fetch("/api/payment-copy"),
          fetch("/api/pricing"),
        ]);
        if (copyRes.ok) {
          const data = (await copyRes.json()) as PaymentCopy;
          if (!cancelled && data?.defaultDepositPercent) {
            setPayCopy({
              defaultDepositPercent: data.defaultDepositPercent,
              autoBalanceEnabled: data.autoBalanceEnabled !== false,
              autoBalanceDaysBefore: data.autoBalanceDaysBefore ?? 7,
              balanceTiming:
                data.balanceTiming || FALLBACK_COPY.balanceTiming,
            });
          }
        }
        if (priceRes.ok) {
          const data = await priceRes.json();
          if (!cancelled && data.pricing) {
            const p = data.pricing as PricingConfig & {
              refillPriceDollars?: number;
              guestRebookPromo?: unknown;
            };
            const {
              refillPriceDollars: _d,
              guestRebookPromo: _g,
              ...rest
            } = p;
            setPricing({ ...DEFAULT_PRICING, ...rest });
          }
        }
      } catch {
        /* keep fallback */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const depositPct = payCopy.defaultDepositPercent;
  const balanceTiming = payCopy.balanceTiming;
  const refillDollars = pricing.refillPriceCents / 100;

  const estimate = useMemo(() => {
    if (engagement !== "package") return null;
    const units = Number(hookahs);
    const serviceHours = Number(hours);
    return estimateBooking(
      units,
      serviceHours,
      promo?.discountDollars ?? 0,
      pricing,
    );
  }, [hookahs, hours, promo, engagement, pricing]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!engagement) {
      setError("Choose how you’d like Oui Smoke at your event.");
      return;
    }
    setBusy(true);
    setError("");
    const form = new FormData(e.currentTarget);
    const payload = Object.fromEntries(form.entries());
    payload.engagement = engagement;
    try {
      const res = await fetch("/api/booking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Couldn’t submit");
        return;
      }
      // Require a real job id — honeypot / soft-success responses omit it
      if (!data.jobId) {
        setError(
          "Couldn’t submit right now. Email contact@ouismoke.co or try again.",
        );
        return;
      }
      const nextEngagement =
        (data.engagement as Engagement) || engagement;
      trackGenerateLead({
        engagement: nextEngagement,
        eventType: String(payload.eventType || ""),
        location: String(payload.location || ""),
      });
      setDone(nextEngagement);
    } catch {
      setError("Couldn’t reach Oui Smoke. Try again or email contact@ouismoke.co.");
    } finally {
      setBusy(false);
    }
  }

  if (done === "package") {
    return (
      <section className="book__panel">
        <h1>Request received</h1>
        <p className="book__lede">
          Thanks — your full-service package inquiry is in our queue
          {promo ? ` with your ${promo.label.toLowerCase()}` : ""}.
        </p>
        <ol className="book__steps">
          <li>Check your email for a confirmation from contact@ouismoke.co.</li>
          <li>
            You’ll get a Square deposit link (~{depositPct}% of the estimate) to
            lock the date.
          </li>
          <li>
            After the deposit clears, you’re confirmed. Final balance is due{" "}
            {balanceTiming}.
          </li>
        </ol>
        <p className="book__alt">
          Watch for email from <strong>contact@ouismoke.co</strong>. Questions?{" "}
          <a href="mailto:contact@ouismoke.co">contact@ouismoke.co</a>
        </p>
        <Link href="/" className="book__btn">
          Back to Oui Smoke
        </Link>
      </section>
    );
  }

  if (done === "on_site") {
    return (
      <section className="book__panel">
        <h1>Request received</h1>
        <p className="book__lede">
          Thanks — we’ll review hosting on-site sales at your event.
        </p>
        <ol className="book__steps">
          <li>We’ll confirm we can attend your date and venue.</li>
          <li>
            No package deposit — guests pay ${pricing.onsiteUnitRate} (+$
            {refillDollars} refills) or ${pricing.onsiteUnlimitedRate}{" "}
            unlimited per unit, plus HST.
          </li>
          <li>We’ll send timing and floor details once confirmed.</li>
        </ol>
        <p className="book__alt">
          Watch for email from <strong>contact@ouismoke.co</strong>. Questions?{" "}
          <a href="mailto:contact@ouismoke.co">contact@ouismoke.co</a>
        </p>
        <Link href="/" className="book__btn">
          Back to Oui Smoke
        </Link>
      </section>
    );
  }

  return (
    <form className="book__panel" onSubmit={onSubmit}>
      <h1>Book Oui Smoke</h1>
      <p className="book__lede">
        Tell us how you want us there — then we’ll set up the right next steps.
      </p>

      {promo ? (
        <div className="book__promo">
          <strong>{promo.label}</strong>
          <span>
            Code <em>{promoCode}</em> will be noted for package bookings.
          </span>
        </div>
      ) : null}

      <input type="hidden" name="promoCode" value={promo ? promoCode : ""} />

      <fieldset className="book__engagement">
        <legend>How should we work your event?</legend>
        <label
          className={`book__choice${engagement === "package" ? " is-selected" : ""}`}
        >
          <input
            type="radio"
            name="engagementUi"
            checked={engagement === "package"}
            onChange={() => setEngagement("package")}
          />
          <span className="book__choice-body">
            <strong>Full-service package</strong>
            <span>
              We deliver, set up, and host for a fixed package price. A deposit
              locks your date.
            </span>
          </span>
        </label>
        <label
          className={`book__choice${engagement === "on_site" ? " is-selected" : ""}`}
        >
          <input
            type="radio"
            name="engagementUi"
            checked={engagement === "on_site"}
            onChange={() => setEngagement("on_site")}
          />
          <span className="book__choice-body">
            <strong>On-site sales</strong>
            <span>
              We attend your event and sell to guests at ${pricing.onsiteUnitRate}{" "}
              (+${refillDollars} refills) or ${pricing.onsiteUnlimitedRate}{" "}
              unlimited, plus HST. No package deposit from you.
            </span>
          </span>
        </label>
      </fieldset>

      <label htmlFor="name">Full name</label>
      <input id="name" name="name" required autoComplete="name" />

      <label htmlFor="email">Email</label>
      <input id="email" name="email" type="email" autoComplete="email" />

      <label htmlFor="phone">Phone</label>
      <input id="phone" name="phone" type="tel" autoComplete="tel" />

      <label htmlFor="eventType">Event type</label>
      <select id="eventType" name="eventType" defaultValue="private">
        <option value="private">Private</option>
        <option value="corporate">Corporate</option>
        <option value="wedding">Wedding</option>
        <option value="festival">Festival / public</option>
        <option value="other">Other</option>
      </select>

      <div className="book__row">
        <div className="book__field">
          <label htmlFor="date">Event date</label>
          <input id="date" name="date" type="date" />
        </div>
        <div className="book__field">
          <label htmlFor="startTime">Start time</label>
          <input id="startTime" name="startTime" type="time" />
        </div>
      </div>

      <div className="book__row">
        <div className="book__field">
          <label htmlFor="hours">
            {engagement === "on_site" ? "Hours on site" : "Service length (hours)"}
          </label>
          <input
            id="hours"
            name="hours"
            type="number"
            min={1}
            max={12}
            value={hours}
            onChange={(e) => setHours(e.target.value)}
          />
        </div>
        <div className="book__field">
          <label htmlFor="hookahs">
            {engagement === "on_site" ? "Hookahs to bring" : "Hookahs needed"}
          </label>
          <input
            id="hookahs"
            name="hookahs"
            type="number"
            min={engagement === "package" ? 4 : 1}
            max={40}
            value={hookahs}
            onChange={(e) => setHookahs(e.target.value)}
          />
        </div>
      </div>

      <label htmlFor="location">Venue / address</label>
      <input id="location" name="location" />

      <label htmlFor="guestCount">Expected guests</label>
      <input id="guestCount" name="guestCount" type="number" min={1} />

      <label htmlFor="notes">Notes</label>
      <textarea
        id="notes"
        name="notes"
        rows={4}
        placeholder={
          engagement === "on_site"
            ? "Crowd size, indoor/outdoor, power access…"
            : "Flavours, indoor/outdoor, add-ons…"
        }
      />

      {engagement === "package" && estimate ? (
        <aside className="book__estimate" aria-live="polite">
          <div className="book__estimate-head">
            <span>Estimated package</span>
            <strong>{formatCad(estimate.total)}</strong>
          </div>
          <ul className="book__estimate-lines">
            <li>
              <span>
                {estimate.tier.flat != null
                  ? "4-hookah package"
                  : `${estimate.units} hookahs × ${formatCad(estimate.tier.rate)}`}
              </span>
              <span>{formatCad(estimate.base)}</span>
            </li>
            {estimate.extraHours > 0 ? (
              <li>
                <span>
                  {estimate.extraHours} extra hour
                  {estimate.extraHours === 1 ? "" : "s"} × {formatCad(pricing.extraHourRate)}
                </span>
                <span>{formatCad(estimate.extras)}</span>
              </li>
            ) : (
              <li>
                <span>Up to 4 hours included</span>
                <span>Included</span>
              </li>
            )}
            {estimate.discount > 0 ? (
              <li className="book__estimate-discount">
                <span>Promo {promoCode}</span>
                <span>−{formatCad(estimate.discount)}</span>
              </li>
            ) : null}
            <li>
              <span>HST ({Math.round(pricing.hstRate * 100)}%)</span>
              <span>{formatCad(estimate.hst)}</span>
            </li>
          </ul>
          <p className="book__estimate-note">
            After you send this request, we’ll email a deposit link (typically ~
            {depositPct}% of the quote) to lock your date. Remaining balance is
            due {balanceTiming}.
          </p>
        </aside>
      ) : null}

      {engagement === "on_site" ? (
        <aside className="book__estimate" aria-live="polite">
          <div className="book__estimate-head">
            <span>On-site model</span>
            <strong>Guest pay</strong>
          </div>
          <ul className="book__estimate-lines">
            <li>
              <span>Standard unit</span>
              <span>
                ${pricing.onsiteUnitRate} + HST · ${refillDollars} + HST
                refills
              </span>
            </li>
            <li>
              <span>Unlimited unit</span>
              <span>${pricing.onsiteUnlimitedRate} + HST / event</span>
            </li>
          </ul>
          <p className="book__estimate-note" style={{ margin: "0.65rem 0 0" }}>
            No host package deposit. Guests choose a rate on the floor; HST (
            {Math.round(pricing.hstRate * 100)}%) is added at charge. We’ll
            confirm we can staff your date.
          </p>
        </aside>
      ) : null}

      {!engagement ? (
        <p className="book__estimate-hint">
          Choose package or on-site sales to continue.
        </p>
      ) : null}

      <input
        className="book__hp"
        name="oui_hp_blank"
        type="text"
        tabIndex={-1}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        aria-hidden="true"
      />

      {error ? <p className="book__error">{error}</p> : null}

      <button type="submit" className="book__btn" disabled={busy || !engagement}>
        {busy ? "Sending…" : "Send request"}
      </button>
      <p className="book__alt">
        Prefer email?{" "}
        <a href="mailto:contact@ouismoke.co">contact@ouismoke.co</a>
      </p>
    </form>
  );
}

export default function BookPage() {
  return (
    <div className="book">
      <div className="book__shell">
        <header className="book__brand">
          <div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-white.png" alt="Oui Smoke" width={200} height={54} />
            <p className="book__kicker">Book an event</p>
          </div>
          <Link href="/" className="book__back">
            Back to site
          </Link>
        </header>
        <Suspense fallback={<section className="book__panel"><p>Loading…</p></section>}>
          <BookForm />
        </Suspense>
      </div>
    </div>
  );
}
