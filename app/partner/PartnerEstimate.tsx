"use client";

import { useEffect, useMemo, useState } from "react";
import {
  DEFAULT_PRICING,
  estimateBooking,
  formatCad,
  type PricingConfig,
} from "@/lib/pricing";

export type PartnerMode = "package" | "on_site";

const MAX_HOURS = 12;
const MAX_HOOKAHS = 40;

type BrandingSize = number;

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

type Props = {
  mode: PartnerMode;
  onModeChange: (mode: PartnerMode) => void;
};

export default function PartnerEstimate({ mode, onModeChange }: Props) {
  const [pricing, setPricing] = useState<PricingConfig>(DEFAULT_PRICING);
  const [hookahs, setHookahs] = useState(DEFAULT_PRICING.minPackageHookahs);
  const [hours, setHours] = useState(DEFAULT_PRICING.includedHours);
  const [led, setLed] = useState(false);
  const [water, setWater] = useState(false);
  const [branding, setBranding] = useState(false);
  const [brandingSize, setBrandingSize] = useState<BrandingSize>(
    DEFAULT_PRICING.brandingMedium,
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/pricing");
        if (!res.ok) return;
        const data = await res.json();
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
      } catch {
        /* keep defaults */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const isPackage = mode === "package";
  const minHookahs = isPackage ? pricing.minPackageHookahs : 1;
  const minHours = isPackage ? pricing.includedHours : 1;
  const refillPriceDollars = pricing.refillPriceCents / 100;

  useEffect(() => {
    setHookahs((n) => clamp(n, minHookahs, MAX_HOOKAHS));
    setHours((n) => clamp(n, minHours, MAX_HOURS));
  }, [minHookahs, minHours]);

  const estimate = useMemo(
    () => (isPackage ? estimateBooking(hookahs, hours, 0, pricing) : null),
    [hookahs, hours, isPackage, pricing],
  );

  const addOns = useMemo(() => {
    if (!isPackage) {
      return {
        ledTotal: 0,
        waterTotal: 0,
        brandingUnits: 0,
        brandingTotal: 0,
        subtotal: 0,
        hst: 0,
      };
    }
    const ledTotal = led ? hookahs * pricing.ledRate : 0;
    const waterTotal = water ? hookahs * pricing.waterRate : 0;
    const brandingUnits = branding ? Math.max(pricing.brandingMin, hookahs) : 0;
    const brandingTotal = brandingUnits * brandingSize;
    const subtotal = ledTotal + waterTotal + brandingTotal;
    const hst = Math.round(subtotal * pricing.hstRate * 100) / 100;
    return { ledTotal, waterTotal, brandingUnits, brandingTotal, subtotal, hst };
  }, [hookahs, led, water, branding, brandingSize, isPackage, pricing]);

  const total = useMemo(() => {
    if (!estimate) return null;
    return Math.round((estimate.total + addOns.subtotal + addOns.hst) * 100) / 100;
  }, [estimate, addOns]);

  const bookHref = `/book?type=${mode}&hookahs=${hookahs}&hours=${hours}`;
  const sizeLabel = brandingSize === pricing.brandingLarge ? "large" : "medium";
  const hstPercent = Math.round(pricing.hstRate * 100);

  return (
    <section className="partner-estimate" aria-label="Event estimate">
      <div className="partner-estimate__head">
        <h2>{isPackage ? "Estimate your event" : "Plan on-site sales"}</h2>
        <p>
          {isPackage
            ? `From ${formatCad(pricing.minPackageDollars)} · min ${pricing.minPackageHookahs} hookahs · up to ${pricing.includedHours} hrs included · $${pricing.extraHourRate}/extra hour · HST in total.`
            : "We staff your event and sell to guests. No host package deposit — set units and hours for the request."}
        </p>
      </div>

      <div className="partner-mode" role="tablist" aria-label="Booking type">
        <button
          type="button"
          role="tab"
          aria-selected={isPackage}
          className={`partner-mode__btn${isPackage ? " is-active" : ""}`}
          onClick={() => onModeChange("package")}
        >
          Package
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={!isPackage}
          className={`partner-mode__btn${!isPackage ? " is-active" : ""}`}
          onClick={() => onModeChange("on_site")}
        >
          On-site sales
        </button>
      </div>

      <div className="partner-estimate__controls">
        <div className="partner-stepper">
          <span className="partner-stepper__label" id="partner-hookahs-label">
            {isPackage ? (
              <>
                Hookahs <em>(min {pricing.minPackageHookahs})</em>
              </>
            ) : (
              "Hookahs to bring"
            )}
          </span>
          <div
            className="partner-stepper__row"
            role="group"
            aria-labelledby="partner-hookahs-label"
          >
            <button
              type="button"
              className="partner-stepper__btn"
              aria-label="Fewer hookahs"
              disabled={hookahs <= minHookahs}
              onClick={() => setHookahs((n) => clamp(n - 1, minHookahs, MAX_HOOKAHS))}
            >
              −
            </button>
            <output className="partner-stepper__value" aria-live="polite">
              {hookahs}
            </output>
            <button
              type="button"
              className="partner-stepper__btn"
              aria-label="More hookahs"
              disabled={hookahs >= MAX_HOOKAHS}
              onClick={() => setHookahs((n) => clamp(n + 1, minHookahs, MAX_HOOKAHS))}
            >
              +
            </button>
          </div>
        </div>

        <div className="partner-stepper">
          <span className="partner-stepper__label" id="partner-hours-label">
            {isPackage ? (
              <>
                Hours <em>(up to {pricing.includedHours} incl.)</em>
              </>
            ) : (
              "Hours on site"
            )}
          </span>
          <div
            className="partner-stepper__row"
            role="group"
            aria-labelledby="partner-hours-label"
          >
            <button
              type="button"
              className="partner-stepper__btn"
              aria-label="Fewer hours"
              disabled={hours <= minHours}
              onClick={() => setHours((n) => clamp(n - 1, minHours, MAX_HOURS))}
            >
              −
            </button>
            <output className="partner-stepper__value" aria-live="polite">
              {hours}
            </output>
            <button
              type="button"
              className="partner-stepper__btn"
              aria-label="More hours"
              disabled={hours >= MAX_HOURS}
              onClick={() => setHours((n) => clamp(n + 1, minHours, MAX_HOURS))}
            >
              +
            </button>
          </div>
        </div>
      </div>

      {isPackage ? (
        <div className="partner-estimate__addons" role="group" aria-label="Add-ons">
          <label className={`partner-toggle${led ? " is-on" : ""}`}>
            <input
              type="checkbox"
              checked={led}
              onChange={(e) => setLed(e.target.checked)}
            />
            <span className="partner-toggle__copy">
              <strong>LED base</strong>
              <em>${pricing.ledRate} / hookah</em>
            </span>
          </label>
          <label className={`partner-toggle${water ? " is-on" : ""}`}>
            <input
              type="checkbox"
              checked={water}
              onChange={(e) => setWater(e.target.checked)}
            />
            <span className="partner-toggle__copy">
              <strong>Water enhancers</strong>
              <em>${pricing.waterRate} / hookah</em>
            </span>
          </label>
          <div
            className={`partner-toggle partner-toggle--branding${branding ? " is-on" : ""}`}
          >
            <label className="partner-toggle__main">
              <input
                type="checkbox"
                checked={branding}
                onChange={(e) => setBranding(e.target.checked)}
              />
              <span className="partner-toggle__copy">
                <strong>Unit branding</strong>
                <em>
                  Min. {pricing.brandingMin} · ${pricing.brandingMedium}–$
                  {pricing.brandingLarge}
                </em>
              </span>
            </label>
            {branding ? (
              <label className="partner-branding-size">
                <span className="visually-hidden">Branding size</span>
                <select
                  value={brandingSize}
                  onChange={(e) =>
                    setBrandingSize(Number(e.target.value) as BrandingSize)
                  }
                >
                  <option value={pricing.brandingMedium}>
                    Medium · ${pricing.brandingMedium}
                  </option>
                  <option value={pricing.brandingLarge}>
                    Large · ${pricing.brandingLarge}
                  </option>
                </select>
              </label>
            ) : null}
          </div>
        </div>
      ) : null}

      {isPackage && estimate && total != null ? (
        <div className="partner-estimate__result" aria-live="polite">
          <div className="partner-estimate__total">
            <span>Estimated total</span>
            <strong key={`${hookahs}-${hours}-${led}-${water}-${branding}-${brandingSize}`}>
              {formatCad(total)}
            </strong>
          </div>
          <ul className="partner-estimate__lines">
            <li>
              <span>
                {estimate.tier.flat != null
                  ? `4-hookah package`
                  : `${estimate.units} × ${formatCad(estimate.tier.rate)}`}
                <small> · {estimate.tier.label.split("·")[0]?.trim()}</small>
              </span>
              <span>{formatCad(estimate.base)}</span>
            </li>
            {estimate.extraHours > 0 ? (
              <li>
                <span>
                  {estimate.extraHours} extra hour
                  {estimate.extraHours === 1 ? "" : "s"} ×{" "}
                  {formatCad(pricing.extraHourRate)}
                </span>
                <span>{formatCad(estimate.extras)}</span>
              </li>
            ) : (
              <li className="partner-estimate__lines--muted">
                <span>Up to {pricing.includedHours} hours included</span>
                <span>—</span>
              </li>
            )}
            {addOns.ledTotal > 0 ? (
              <li>
                <span>LED bases</span>
                <span>{formatCad(addOns.ledTotal)}</span>
              </li>
            ) : null}
            {addOns.waterTotal > 0 ? (
              <li>
                <span>Water enhancers</span>
                <span>{formatCad(addOns.waterTotal)}</span>
              </li>
            ) : null}
            {addOns.brandingTotal > 0 ? (
              <li>
                <span>
                  Unit branding ({sizeLabel}) × {addOns.brandingUnits}
                </span>
                <span>{formatCad(addOns.brandingTotal)}</span>
              </li>
            ) : null}
            <li>
              <span>HST ({hstPercent}%)</span>
              <span>{formatCad(estimate.hst + addOns.hst)}</span>
            </li>
          </ul>
          {branding && hookahs < pricing.brandingMin ? (
            <p className="partner-estimate__note">
              Branding bills for a minimum of {pricing.brandingMin} units.
            </p>
          ) : null}
          <p className="partner-estimate__note">
            Extra hours {formatCad(pricing.extraHourRate)} each. Refills:{" "}
            {hookahs <= 4
              ? `1 included · $${refillPriceDollars} after`
              : "unlimited at this tier"}
          </p>
        </div>
      ) : null}

      {!isPackage ? (
        <div
          className="partner-estimate__result partner-estimate__result--onsite"
          aria-live="polite"
        >
          <div className="partner-estimate__total">
            <span>Host cost</span>
            <strong>Guest pay</strong>
          </div>
          <ul className="partner-estimate__lines">
            <li>
              <span>Units on the floor</span>
              <span>{hookahs}</span>
            </li>
            <li>
              <span>Hours on site</span>
              <span>{hours}</span>
            </li>
            <li>
              <span>Guest · standard</span>
              <span>
                ${pricing.onsiteUnitRate} + HST · ${refillPriceDollars} + HST
                refills
              </span>
            </li>
            <li>
              <span>Guest · unlimited</span>
              <span>${pricing.onsiteUnlimitedRate} + HST / unit</span>
            </li>
            <li className="partner-estimate__lines--muted">
              <span>Package deposit</span>
              <span>None</span>
            </li>
          </ul>
          <p className="partner-estimate__intro">
            Guests choose ${pricing.onsiteUnitRate} with paid refills, or $
            {pricing.onsiteUnlimitedRate} with unlimited refills for the event —
            plus HST.
          </p>
          <p className="partner-estimate__note">
            We’ll confirm we can staff your date and venue before locking in.
          </p>
        </div>
      ) : null}

      <div className="partner-estimate__cta">
        <a className="partner-estimate__book" href={bookHref}>
          {isPackage ? "Book this estimate" : "Request on-site sales"}
        </a>
        <a className="partner-estimate__mail" href="mailto:contact@ouismoke.co">
          Or email the brief
        </a>
      </div>
    </section>
  );
}
