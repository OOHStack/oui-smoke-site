"use client";

import { useState } from "react";
import "../demo.css";

const ACTIONS = [
  { id: "coals", label: "Fresh coals", hint: "Heat is fading — send coals" },
  { id: "refill", label: "Flavour refill", hint: "Same flavour or a new one" },
  { id: "issue", label: "Something’s off", hint: "Hose, draw, tip — we can help" },
] as const;

export default function DemoQrPage() {
  const [sent, setSent] = useState<string | null>(null);

  return (
    <div className="demo demo--qr">
      <header className="demo-qr__brand">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-white.png" alt="Oui Smoke" width={200} height={54} />
        <p>Guest service · preview</p>
      </header>

      <section className="demo-qr__hero">
        <p className="demo-qr__eyebrow">Your hookah</p>
        <h1>#07</h1>
        <p>Blue Mist · Harborview Rooftop</p>
        <p className="demo-qr__timer">Session 1h 12m</p>
      </section>

      {sent ? (
        <div className="demo-qr__toast" role="status">
          <strong>Request queued</strong>
          <p>
            “{ACTIONS.find((a) => a.id === sent)?.label}” — in a real event this
            pings the Oui floor team instantly.
          </p>
          <button type="button" onClick={() => setSent(null)}>
            Back to menu
          </button>
        </div>
      ) : (
        <section className="demo-qr__actions" aria-label="Service requests">
          {ACTIONS.map((action) => (
            <button
              key={action.id}
              type="button"
              className="demo-qr__action"
              onClick={() => setSent(action.id)}
            >
              <strong>{action.label}</strong>
              <span>{action.hint}</span>
            </button>
          ))}
        </section>
      )}

      <p className="demo-qr__note">
        Guests scan a QR on each hookah — no app download.
      </p>
    </div>
  );
}
