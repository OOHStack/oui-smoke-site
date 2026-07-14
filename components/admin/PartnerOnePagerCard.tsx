"use client";

import { useState } from "react";

const SHARE_URL = "https://ouismoke.co/partner";

export default function PartnerOnePagerCard() {
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(SHARE_URL);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy this link:", SHARE_URL);
    }
  }

  return (
    <section className="panel partner-share-card">
      <div className="partner-share-card__copy">
        <p className="eyebrow">Share kit</p>
        <h2 className="panel-title" style={{ marginBottom: "0.35rem" }}>
          Partner one-pager
        </h2>
        <p className="page-sub" style={{ margin: 0 }}>
          Smoke-free rates sheet for warm DMs, planners, DJs, and venue partners.
        </p>
      </div>
      <div className="partner-share-card__actions">
        <button type="button" className="btn btn-primary" onClick={copyLink}>
          {copied ? "Copied" : "Copy link"}
        </button>
        <a
          className="btn"
          href="/partner"
          target="_blank"
          rel="noopener noreferrer"
        >
          Open
        </a>
        <a
          className="btn btn-ghost"
          href="/partner"
          target="_blank"
          rel="noopener noreferrer"
        >
          Open &amp; print PDF
        </a>
      </div>
      <p className="partner-share-card__url">{SHARE_URL}</p>
    </section>
  );
}
