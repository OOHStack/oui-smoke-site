"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BRANDING_LARGE,
  BRANDING_MEDIUM,
  BRANDING_MIN,
  EXTRA_HOUR_RATE,
  HST_RATE,
  INCLUDED_HOURS,
  LED_RATE,
  MIN_PACKAGE_DOLLARS,
  MIN_PACKAGE_HOOKAHS,
  ONSITE_UNIT_RATE,
  ONSITE_UNLIMITED_RATE,
  REFILL_PRICE_DOLLARS,
  WATER_RATE,
  estimateBooking,
  formatCad,
} from "@/lib/pricing";

export type PartnerMode = "package" | "on_site";

const INTRO_HOOKAHS = MIN_PACKAGE_HOOKAHS;
const INTRO_HOURS = INCLUDED_HOURS;
const MAX_HOURS = 12;
const MAX_HOOKAHS = 40;

type BrandingSize = typeof BRANDING_MEDIUM | typeof BRANDING_LARGE;

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

type Props = {
  mode: PartnerMode;
  onModeChange: (mode: PartnerMode) => void;
};

export default function PartnerEstimate({ mode, onModeChange }: Props) {
  const [hookahs, setHookahs] = useState(INTRO_HOOKAHS);
  const [hours, setHours] = useState(INTRO_HOURS);
  const [led, setLed] = useState(false);
  const [water, setWater] = useState(false);
  const [branding, setBranding] = useState(false);
  const [brandingSize, setBrandingSize] = useState<BrandingSize>(BRANDING_MEDIUM);

  const isPackage = mode === "package";
  const minHookahs = isPackage ? MIN_PACKAGE_HOOKAHS : 1;
  const minHours = isPackage ? INCLUDED_HOURS : 1;

  useEffect(() => {
    setHookahs((n) => clamp(n, minHookahs, MAX_HOOKAHS));
    setHours((n) => clamp(n, minHours, MAX_HOURS));
  }, [minHookahs, minHours]);

  const estimate = useMemo(
    () => (isPackage ? estimateBooking(hookahs, hours) : null),
    [hookahs, hours, isPackage],
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
    const ledTotal = led ? hookahs * LED_RATE : 0;
    const waterTotal = water ? hookahs * WATER_RATE : 0;
    const brandingUnits = branding ? Math.max(BRANDING_MIN, hookahs) : 0;
    const brandingTotal = brandingUnits * brandingSize;
    const subtotal = ledTotal + waterTotal + brandingTotal;
    const hst = Math.round(subtotal * HST_RATE * 100) / 100;
    return { ledTotal, waterTotal, brandingUnits, brandingTotal, subtotal, hst };
  }, [hookahs, led, water, branding, brandingSize, isPackage]);

  const total = useMemo(() => {
    if (!estimate) return null;
    return Math.round((estimate.total + addOns.subtotal + addOns.hst) * 100) / 100;
  }, [estimate, addOns]);

  const bookHref = `/book?type=${mode}&hookahs=${hookahs}&hours=${hours}`;
  const sizeLabel = brandingSize === BRANDING_LARGE ? "large" : "medium";

  return (
    <section className="partner-estimate" aria-label="Event estimate">
      <div className="partner-estimate__head">
        <h2>{isPackage ? "Estimate your event" : "Plan on-site sales"}</h2>
        <p>
          {isPackage
            ? `From ${formatCad(MIN_PACKAGE_DOLLARS)} · min ${MIN_PACKAGE_HOOKAHS} hookahs · up to ${INCLUDED_HOURS} hrs included · $${EXTRA_HOUR_RATE}/extra hour · HST in total.`
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
                Hookahs <em>(min {MIN_PACKAGE_HOOKAHS})</em>
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
                Hours <em>(up to {INCLUDED_HOURS} incl.)</em>
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
              <em>${LED_RATE} / hookah</em>
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
              <em>${WATER_RATE} / hookah</em>
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
                <em>Min. {BRANDING_MIN} · ${BRANDING_MEDIUM}–${BRANDING_LARGE}</em>
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
                  <option value={BRANDING_MEDIUM}>
                    Medium · ${BRANDING_MEDIUM}
                  </option>
                  <option value={BRANDING_LARGE}>
                    Large · ${BRANDING_LARGE}
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
                  {estimate.extraHours === 1 ? "" : "s"} × {formatCad(EXTRA_HOUR_RATE)}
                </span>
                <span>{formatCad(estimate.extras)}</span>
              </li>
            ) : (
              <li className="partner-estimate__lines--muted">
                <span>Up to {INCLUDED_HOURS} hours included</span>
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
              <span>HST (13%)</span>
              <span>{formatCad(estimate.hst + addOns.hst)}</span>
            </li>
          </ul>
          {branding && hookahs < BRANDING_MIN ? (
            <p className="partner-estimate__note">
              Branding bills for a minimum of {BRANDING_MIN} units.
            </p>
          ) : null}
          <p className="partner-estimate__note">
            Extra hours {formatCad(EXTRA_HOUR_RATE)} each. Refills:{" "}
            {hookahs <= 4 ? "1 included · $30 after" : "unlimited at this tier"}
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
                ${ONSITE_UNIT_RATE} · ${REFILL_PRICE_DOLLARS} refills
              </span>
            </li>
            <li>
              <span>Guest · unlimited</span>
              <span>${ONSITE_UNLIMITED_RATE} / unit</span>
            </li>
            <li className="partner-estimate__lines--muted">
              <span>Package deposit</span>
              <span>None</span>
            </li>
          </ul>
          <p className="partner-estimate__intro">
            Guests choose ${ONSITE_UNIT_RATE} with paid refills, or $
            {ONSITE_UNLIMITED_RATE} with unlimited refills for the night.
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
        <a className="partner-estimate__mail" href="mailto:ouismokeinc@gmail.com">
          Or email the brief
        </a>
      </div>
    </section>
  );
}
