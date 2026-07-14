"use client";

import { useEffect, useState } from "react";
import PartnerEstimate, { type PartnerMode } from "./PartnerEstimate";
import PartnerToolbar from "./PartnerToolbar";
import { DEFAULT_PRICING, type PricingConfig } from "@/lib/pricing";

function readInitialMode(): PartnerMode {
  if (typeof window === "undefined") return "package";
  const params = new URLSearchParams(window.location.search);
  const value = (params.get("mode") || params.get("type") || "").toLowerCase();
  return value === "on_site" ? "on_site" : "package";
}

function syncModeToUrl(mode: PartnerMode) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (mode === "on_site") {
    url.searchParams.set("mode", "on_site");
  } else {
    url.searchParams.delete("mode");
  }
  url.searchParams.delete("type");
  const next = `${url.pathname}${url.search}${url.hash}`;
  window.history.replaceState({}, "", next);
}

export default function PartnerSheet() {
  const [mode, setMode] = useState<PartnerMode>("package");
  const [pricing, setPricing] = useState<PricingConfig>(DEFAULT_PRICING);

  useEffect(() => {
    setMode(readInitialMode());
  }, []);

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

  const refillPriceDollars = pricing.refillPriceCents / 100;

  function onModeChange(next: PartnerMode) {
    setMode(next);
    syncModeToUrl(next);
  }

  const isPackage = mode === "package";

  return (
    <>
      <PartnerToolbar mode={mode} />

      <article
        className={`partner-sheet${isPackage ? "" : " partner-sheet--onsite"}`}
        aria-label="Oui Smoke partner one-pager"
        data-mode={mode}
      >
        <header className="partner-hero">
          <div className="partner-hero__copy">
            <svg
              className="partner-hero__logo partner-mark"
              viewBox="0 12 720 208"
              xmlns="http://www.w3.org/2000/svg"
              role="img"
              aria-label="Oui Smoke"
              focusable="false"
            >
              <title>Oui Smoke</title>
              <g
                className="partner-mark__brand"
                fill="none"
                stroke="currentColor"
                strokeWidth="5"
                strokeLinecap="butt"
                strokeLinejoin="round"
              >
                <g className="partner-mark__o">
                  <circle
                    className="partner-mark__stroke partner-mark__o-ring"
                    cx="100"
                    cy="110"
                    r="88"
                  />
                  <circle
                    className="partner-mark__stroke partner-mark__o-ring"
                    cx="100"
                    cy="110"
                    r="58"
                  />
                  <circle
                    className="partner-mark__stroke partner-mark__o-ring"
                    cx="100"
                    cy="110"
                    r="28"
                  />
                </g>
                <g className="partner-mark__u">
                  <path
                    className="partner-mark__stroke"
                    d="M214 22 V110 A78 78 0 0 0 370 110 V22"
                  />
                  <path
                    className="partner-mark__stroke"
                    d="M244 22 V110 A48 48 0 0 0 340 110 V22"
                  />
                  <path
                    className="partner-mark__stroke"
                    d="M274 22 V110 A18 18 0 0 0 310 110 V22"
                  />
                </g>
                <g className="partner-mark__i">
                  <line
                    className="partner-mark__stroke partner-mark__i-line"
                    x1="414"
                    y1="22"
                    x2="414"
                    y2="198"
                  />
                  <line
                    className="partner-mark__stroke partner-mark__i-line"
                    x1="436"
                    y1="22"
                    x2="436"
                    y2="198"
                  />
                  <line
                    className="partner-mark__stroke partner-mark__i-line"
                    x1="458"
                    y1="22"
                    x2="458"
                    y2="198"
                  />
                  <line
                    className="partner-mark__stroke partner-mark__i-line"
                    x1="480"
                    y1="22"
                    x2="480"
                    y2="198"
                  />
                  <line
                    className="partner-mark__stroke partner-mark__i-line"
                    x1="502"
                    y1="22"
                    x2="502"
                    y2="198"
                  />
                  <line
                    className="partner-mark__stroke partner-mark__i-line"
                    x1="524"
                    y1="22"
                    x2="524"
                    y2="198"
                  />
                </g>
              </g>
              <text
                className="partner-mark__word"
                x="548"
                y="198"
                fill="currentColor"
                fontFamily="Outfit, Helvetica Neue, Arial, sans-serif"
                fontSize="28"
                fontWeight="500"
                letterSpacing="0.28em"
              >
                SMOKE
              </text>
            </svg>
            <p className="partner-hero__eyebrow">For planners · hosts · vendors</p>
            <h1 className="partner-hero__title">
              {isPackage
                ? "Private event hookah catering"
                : "On-site hookah sales"}
            </h1>
            <p className="partner-hero__lede">
              {isPackage
                ? "Full-service delivery, setup, staff, and teardown for private celebrations across Toronto and the GTA."
                : `We bring units and staff — guests pay $${pricing.onsiteUnitRate} (+$${refillPriceDollars} refills) or $${pricing.onsiteUnlimitedRate} unlimited. No host package deposit.`}
            </p>
            <a className="partner-hero__jump no-print" href="#estimate">
              {isPackage ? "Build an estimate" : "Plan staffing"}
            </a>
          </div>
          <div className="partner-hero__media" aria-hidden="true">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/images/model-1-web.jpg"
              alt=""
              width={1600}
              height={2000}
            />
          </div>
        </header>

        <div className="partner-sheet__main" id="estimate">
          <PartnerEstimate mode={mode} onModeChange={onModeChange} />

          <aside className="partner-aside">
            <figure className="partner-aside__media">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/images/model-4-web.jpg"
                alt="Oui Smoke cube unit with citrus bowl and fruit infusion"
                width={1600}
                height={2000}
              />
            </figure>

            <section className="partner-aside__include">
              <h2>{isPackage ? "What’s included" : "How on-site works"}</h2>
              {isPackage ? (
                <ul>
                  <li>Premium units + flavours</li>
                  <li>On-site staff</li>
                  <li>Delivery, setup, teardown</li>
                  <li>Minimum 4 hookahs</li>
                  <li>Up to 4 hours included (GTA)</li>
                  <li>Live ops tracking</li>
                </ul>
              ) : (
                <ul>
                  <li>We attend with units + staff</li>
                  <li>
                    Guests pay ${pricing.onsiteUnitRate} / unit · $
                    {refillPriceDollars} refills
                  </li>
                  <li>
                    Or ${pricing.onsiteUnlimitedRate} / unit with unlimited refills
                  </li>
                  <li>No host package deposit</li>
                  <li>Floor ops handled by our team</li>
                </ul>
              )}
            </section>

            <section className="partner-aside__who">
              <h2>Who we work with</h2>
              <ul>
                <li>Birthdays &amp; house parties</li>
                <li>Backyard &amp; rooftop</li>
                <li>Stag / stagette &amp; weddings</li>
                <li>Corporate on private property</li>
                <li>Planners, DJs, venue partners</li>
              </ul>
            </section>
          </aside>
        </div>

        <section className="partner-rates" aria-label="GTA rate tiers">
          <div className="partner-rates__head">
            <h2>
              {isPackage
                ? "GTA package rates"
                : "Guest rates on the floor"}
            </h2>
            <p>
              {isPackage
                ? "From $450 · up to 4 hours included"
                : "Per unit · guests choose on the night"}
            </p>
          </div>
          {isPackage ? (
            <div className="partner-rates__tiers">
              <div className="partner-rates__tier">
                <span className="partner-rates__range">4</span>
                <strong className="partner-rates__price">$450</strong>
                <span className="partner-rates__meta">
                  Package floor · 1 refill
                </span>
              </div>
              <div className="partner-rates__tier">
                <span className="partner-rates__range">5–8</span>
                <strong className="partner-rates__price">$95</strong>
                <span className="partner-rates__meta">Unlimited refills</span>
              </div>
              <div className="partner-rates__tier">
                <span className="partner-rates__range">9+</span>
                <strong className="partner-rates__price">$85</strong>
                <span className="partner-rates__meta">Unlimited refills</span>
              </div>
            </div>
          ) : (
            <div className="partner-rates__tiers partner-rates__tiers--onsite">
              <div className="partner-rates__tier">
                <span className="partner-rates__range">Standard</span>
                <strong className="partner-rates__price">
                  ${pricing.onsiteUnitRate}
                </strong>
                <span className="partner-rates__meta">
                  Per unit · ${refillPriceDollars} refills
                </span>
              </div>
              <div className="partner-rates__tier">
                <span className="partner-rates__range">Unlimited</span>
                <strong className="partner-rates__price">
                  ${pricing.onsiteUnlimitedRate}
                </strong>
                <span className="partner-rates__meta">
                  Per unit · unlimited refills
                </span>
              </div>
            </div>
          )}
          <p className="partner-rates__extra">
            {isPackage ? (
              <>
                Extra hour <strong>$150</strong>
                <span aria-hidden="true"> · </span>
                Bill the higher of package floor or per-hookah total
              </>
            ) : (
              <>
                Host pays nothing up front — guests settle on site at $
                {pricing.onsiteUnitRate} or ${pricing.onsiteUnlimitedRate}. Extra staffing
                hours quoted if needed.
              </>
            )}
          </p>
        </section>

        <footer className="partner-sheet__foot">
          <div>
            <p className="partner-sheet__foot-label">Contact</p>
            <a href="mailto:contact@ouismoke.co">contact@ouismoke.co</a>
            <div className="partner-social" aria-label="Social media">
              <a
                className="partner-social__link"
                href="https://instagram.com/ouismoke"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Oui Smoke on Instagram"
              >
                <svg
                  className="partner-social__icon"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                  focusable="false"
                >
                  <path
                    fill="currentColor"
                    d="M12 7.2A4.8 4.8 0 1 0 12 16.8 4.8 4.8 0 0 0 12 7.2Zm0 7.9A3.1 3.1 0 1 1 12 8.9a3.1 3.1 0 0 1 0 6.2Zm6.1-8.2a1.12 1.12 0 1 1-2.24 0 1.12 1.12 0 0 1 2.24 0ZM12 2.5c-2.45 0-2.76.01-3.72.05-.96.04-1.61.2-2.18.42a4.4 4.4 0 0 0-1.59 1.04 4.4 4.4 0 0 0-1.04 1.59c-.23.57-.38 1.22-.42 2.18C3.01 9.24 3 9.55 3 12s.01 2.76.05 3.72c.04.96.2 1.61.42 2.18a4.4 4.4 0 0 0 1.04 1.59 4.4 4.4 0 0 0 1.59 1.04c.57.23 1.22.38 2.18.42 0.96.04 1.27.05 3.72.05s2.76-.01 3.72-.05c.96-.04 1.61-.2 2.18-.42a4.4 4.4 0 0 0 1.59-1.04 4.4 4.4 0 0 0 1.04-1.59c.23-.57.38-1.22.42-2.18.04-.96.05-1.27.05-3.72s-.01-2.76-.05-3.72c-.04-.96-.2-1.61-.42-2.18a4.4 4.4 0 0 0-1.04-1.59 4.4 4.4 0 0 0-1.59-1.04c-.57-.23-1.22-.38-2.18-.42C14.76 2.51 14.45 2.5 12 2.5Zm0 1.7c2.4 0 2.69.01 3.64.05.88.04 1.35.19 1.67.31.42.17.72.36 1.04.68.32.32.51.62.68 1.04.12.32.27.79.31 1.67.04.95.05 1.24.05 3.64s-.01 2.69-.05 3.64c-.04.88-.19 1.35-.31 1.67-.17.42-.36.72-.68 1.04-.32.32-.62.51-1.04.68-.32.12-.79.27-1.67.31-.95.04-1.24.05-3.64.05s-2.69-.01-3.64-.05c-.88-.04-1.35-.19-1.67-.31a2.8 2.8 0 0 1-1.04-.68 2.8 2.8 0 0 1-.68-1.04c-.12-.32-.27-.79-.31-1.67C4.71 14.69 4.7 14.4 4.7 12s.01-2.69.05-3.64c.04-.88.19-1.35.31-1.67.17-.42.36-.72.68-1.04.32-.32.62-.51 1.04-.68.32-.12.79-.27 1.67-.31C9.31 4.71 9.6 4.2 12 4.2Z"
                  />
                </svg>
              </a>
              <a
                className="partner-social__link"
                href="https://www.tiktok.com/@ouismoke"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Oui Smoke on TikTok"
              >
                <svg
                  className="partner-social__icon"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                  focusable="false"
                >
                  <path
                    fill="currentColor"
                    d="M19.6 7.8a5.7 5.7 0 0 1-3.3-1.1v7.2a5.7 5.7 0 1 1-5.7-5.7c.3 0 .6 0 .9.1v2.9a2.8 2.8 0 1 0 2 2.7V2.5h2.8c.2 1.7 1.2 3.3 2.7 4.2a5.6 5.6 0 0 0 2.7.9v2.8c-.7 0-1.4-.1-2.1-.4Z"
                  />
                </svg>
              </a>
            </div>
          </div>
          <p className="partner-sheet__note">
            Private events · Toronto &amp; beyond the GTA · Travel quoted on request
            {mode === "on_site" ? (
              <>
                {" · "}
                <a href="/partner/playbook">Night-of playbook</a>
              </>
            ) : null}
          </p>
        </footer>
      </article>
    </>
  );
}
