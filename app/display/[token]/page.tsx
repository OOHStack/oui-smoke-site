"use client";

import {
  useCallback,
  useEffect,
  useEffectEvent,
  useState,
  type CSSProperties,
} from "react";
import { useParams } from "next/navigation";
import type { DisplayBoardSnapshot } from "@/lib/display-board";
import "./display.css";

const PANELS = ["welcome", "flavours", "packages", "connect"] as const;
type PanelId = (typeof PANELS)[number];

const PANEL_LABELS: Record<PanelId, string> = {
  welcome: "Brand",
  flavours: "Flavours",
  packages: "Packages",
  connect: "Scan",
};

const ROTATE_MS = 12_000;
const REFRESH_MS = 60_000;
const HERO_PHOTO = "/images/model-2-web.jpg";

export default function DisplayPage() {
  const params = useParams<{ token: string }>();
  const token = params?.token ?? "";
  const [board, setBoard] = useState<DisplayBoardSnapshot | null>(null);
  const [error, setError] = useState("");
  const [panel, setPanel] = useState(0);
  const [paused, setPaused] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    const res = await fetch(`/api/display/${encodeURIComponent(token)}`, {
      cache: "no-store",
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Display link not found");
      setBoard(null);
      return;
    }
    const data = (await res.json()) as DisplayBoardSnapshot;
    setBoard(data);
    setError("");
  }, [token]);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), REFRESH_MS);
    return () => clearInterval(t);
  }, [load]);

  const advance = useEffectEvent(() => {
    setPanel((i) => (i + 1) % PANELS.length);
  });

  useEffect(() => {
    if (!board || paused) return;
    const t = setInterval(() => advance(), ROTATE_MS);
    return () => clearInterval(t);
  }, [board, paused]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault();
        setPaused(true);
        setPanel((i) => (i + 1) % PANELS.length);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        setPaused(true);
        setPanel((i) => (i - 1 + PANELS.length) % PANELS.length);
      } else if (e.key === "p" || e.key === "P") {
        setPaused((p) => !p);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (error) {
    return (
      <div className="display display--error">
        <div>
          <h1>Link inactive</h1>
          <p>{error}. Ask ops for a fresh display URL.</p>
        </div>
      </div>
    );
  }

  if (!board) {
    return (
      <div className="display display--loading">
        <p>Loading Oui Smoke…</p>
      </div>
    );
  }

  const active = PANELS[panel];
  const book = board.links.find((l) => l.id === "book");
  const sideLinks = board.links.filter((l) => l.id !== "book");

  return (
    <div
      className="display"
      onClick={(e) => {
        const t = e.target as HTMLElement;
        if (t.closest("button, a, .display__flavours")) return;
        setPaused(true);
        setPanel((i) => (i + 1) % PANELS.length);
      }}
    >
      <div className="display__bg" aria-hidden />
      <div
        className={`display__bg-photo${active === "welcome" ? " is-on" : ""}`}
        style={{ backgroundImage: `url(${HERO_PHOTO})` } as CSSProperties}
        aria-hidden
      />

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className="display__logo-mark"
        src="/logo-white.png"
        alt=""
        width={110}
        height={40}
      />

      <div className="display__shell">
        <div className="display__stage">
          <section
            className={`display__panel${active === "welcome" ? " is-active" : ""}`}
            aria-hidden={active !== "welcome"}
          >
            <p className="display__kicker">Live at your event</p>
            <h1 className="display__brand">{board.brand.name}</h1>
            <p className="display__tagline">{board.brand.tagline}</p>
            <div className="display__welcome-meta">
              <span>
                <strong>{board.flavours.length}</strong> flavours tonight
              </span>
              <span>
                Private packages from{" "}
                <strong>{board.privatePackages[0]?.price ?? "—"}</strong>
              </span>
            </div>
          </section>

          <section
            className={`display__panel${active === "flavours" ? " is-active" : ""}`}
            aria-hidden={active !== "flavours"}
          >
            <p className="display__kicker">Menu</p>
            <h2 className="display__title">Tonight&apos;s flavours</h2>
            <p className="display__lede">
              Ask your host for a pour. Mixes and classics, packed fresh.
            </p>
            {board.flavours.length === 0 ? (
              <p className="display__empty">Flavour list coming up — ask the crew.</p>
            ) : (
              <div className="display__flavours">
                {board.flavours.map((f) => (
                  <article key={f.id} className="display__flavour">
                    <h3 className="display__flavour-name">{f.name}</h3>
                    <p className="display__flavour-kind">
                      {f.kind === "mix" ? "Mix" : "Single"}
                    </p>
                    {f.description ? (
                      <p className="display__flavour-desc">{f.description}</p>
                    ) : null}
                  </article>
                ))}
              </div>
            )}
          </section>

          <section
            className={`display__panel${active === "packages" ? " is-active" : ""}`}
            aria-hidden={active !== "packages"}
          >
            <p className="display__kicker">Rates</p>
            <h2 className="display__title">Packages</h2>
            <p className="display__lede">
              Private events and floor service — live numbers from Oui Smoke.
            </p>
            <div className="display__rates">
              <div className="display__rate-group">
                <h3>Private events</h3>
                <div className="display__rate-row">
                  {board.privatePackages.map((pkg) => (
                    <article key={pkg.id} className="display__rate">
                      <h4 className="display__rate-title">{pkg.title}</h4>
                      <p className="display__rate-price">
                        {pkg.price}
                        {pkg.id !== "floor" ? <span>/ea</span> : null}
                      </p>
                      <p className="display__rate-detail">{pkg.detail}</p>
                    </article>
                  ))}
                </div>
              </div>
              <div className="display__rate-group">
                <h3>On the floor</h3>
                <div className="display__rate-row">
                  {board.onsitePackages.map((pkg) => (
                    <article key={pkg.id} className="display__rate">
                      <h4 className="display__rate-title">{pkg.title}</h4>
                      <p className="display__rate-price">
                        {pkg.price}
                        <span>/ea</span>
                      </p>
                      <p className="display__rate-detail">{pkg.detail}</p>
                    </article>
                  ))}
                </div>
              </div>
            </div>
            <ul className="display__footnotes">
              {board.footnotes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </section>

          <section
            className={`display__panel${active === "connect" ? " is-active" : ""}`}
            aria-hidden={active !== "connect"}
          >
            <p className="display__kicker">Connect</p>
            <h2 className="display__title">Scan to book</h2>
            <p className="display__lede">
              Point your camera at a code — no app required.
            </p>
            <div className="display__connect">
              {book ? (
                <div className="display__qr-hero">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={book.qrDataUrl} alt={`QR code for ${book.label}`} />
                  <div>
                    <p className="display__qr-hero-label">{book.label}</p>
                    <p className="display__qr-hero-hint">{book.hint}</p>
                  </div>
                </div>
              ) : null}
              <div className="display__qr-side">
                {sideLinks.map((link) => (
                  <div key={link.id} className="display__qr-side-item">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={link.qrDataUrl} alt={`QR code for ${link.label}`} />
                    <div>
                      <strong>{link.label}</strong>
                      <span>{link.hint}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>

        <nav className="display__nav" aria-label="Display screens">
          <div className="display__dots">
            {PANELS.map((id, i) => (
              <button
                key={id}
                type="button"
                className={`display__dot${i === panel ? " is-active" : ""}`}
                aria-label={`Show ${PANEL_LABELS[id]}`}
                aria-current={i === panel ? "true" : undefined}
                onClick={(e) => {
                  e.stopPropagation();
                  setPaused(true);
                  setPanel(i);
                }}
              />
            ))}
          </div>
          <p className="display__hint">
            {paused ? "Paused · tap to advance" : PANEL_LABELS[active]}
          </p>
        </nav>
      </div>
    </div>
  );
}
