"use client";

import { useCallback, useEffect, useState } from "react";
import type { DisplayBoardSnapshot } from "@/lib/display-board";

export default function AdminDisplayPage() {
  const [url, setUrl] = useState("");
  const [board, setBoard] = useState<DisplayBoardSnapshot | null>(null);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const loadLink = useCallback(async () => {
    const res = await fetch("/api/display/link", { cache: "no-store" });
    if (!res.ok) {
      setError("Couldn’t load display link");
      return;
    }
    const data = await res.json();
    setUrl(data.url ?? "");
    if (data.board) setBoard(data.board as DisplayBoardSnapshot);
  }, []);

  useEffect(() => {
    void loadLink();
  }, [loadLink]);

  async function copyLink() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setMsg("Display link copied — open it on the event tablet.");
    } catch {
      setMsg(url);
    }
  }

  async function rotateLink() {
    if (
      !window.confirm(
        "Rotate the display link? The old tablet URL will stop working.",
      )
    ) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/display/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "rotate" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Couldn’t rotate link");
        return;
      }
      setUrl(data.url ?? "");
      setMsg("New display link ready — copy it to the event tablet.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">Event display</h1>
          <p className="page-sub">
            Secondary tablet for the floor — brand, live flavours, packages, and
            QR codes for booking. No admin login on the tablet.
          </p>
        </div>
        <div className="page-head-actions">
          {url ? (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-primary btn-sm"
            >
              Open display
            </a>
          ) : null}
        </div>
      </div>

      {error ? <p className="login-error">{error}</p> : null}
      {msg ? <p className="collect-toast">{msg}</p> : null}

      <section className="panel">
        <h2 className="panel-title">Dedicated link</h2>
        <p className="list-meta" style={{ marginTop: 0 }}>
          Bookmark this URL on a landscape tablet, set brightness high, and
          leave it cycling. Screens: brand → flavours → packages → scan to book.
          Tap to advance; press P to pause.
        </p>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "0.5rem",
            alignItems: "center",
            marginTop: "0.75rem",
          }}
        >
          <code
            style={{
              flex: "1 1 220px",
              fontSize: "0.85rem",
              wordBreak: "break-all",
            }}
          >
            {url || "Loading…"}
          </code>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => void copyLink()}
            disabled={!url}
          >
            Copy link
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => void rotateLink()}
            disabled={busy || !url}
          >
            Rotate link
          </button>
        </div>
      </section>

      {board ? (
        <section className="panel" style={{ marginTop: "1rem" }}>
          <h2 className="panel-title">What guests will see</h2>
          <p className="list-meta" style={{ marginTop: 0 }}>
            Pulled from active flavours and live pricing. Update those in admin
            and the tablet refreshes within a minute.
          </p>
          <ul className="list-meta" style={{ marginTop: "0.75rem" }}>
            <li>
              <strong>{board.flavours.length}</strong> active flavours
              {board.flavours.length
                ? ` · ${board.flavours
                    .slice(0, 6)
                    .map((f) => f.name)
                    .join(", ")}${board.flavours.length > 6 ? "…" : ""}`
                : ""}
            </li>
            <li>
              Private floor package{" "}
              <strong>{board.privatePackages[0]?.price ?? "—"}</strong>
              {" · "}
              On-site standard{" "}
              <strong>{board.onsitePackages[0]?.price ?? "—"}</strong>
            </li>
            <li>
              QR targets:{" "}
              {board.links.map((l) => l.label).join(" · ")}
            </li>
          </ul>
        </section>
      ) : null}
    </div>
  );
}
