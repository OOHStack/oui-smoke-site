"use client";

import { useEffect, useMemo, useState } from "react";
import type { PartnerMode } from "./PartnerEstimate";

const BASE_SHARE_URL = "https://ouismoke.co/partner";

type ShareStatus = "idle" | "copied" | "shared";

function canUseNativeShare(data: ShareData) {
  if (typeof navigator === "undefined" || typeof navigator.share !== "function") {
    return false;
  }
  if (typeof navigator.canShare === "function") {
    try {
      return navigator.canShare(data);
    } catch {
      return false;
    }
  }
  return true;
}

type Props = {
  mode?: PartnerMode;
};

export default function PartnerToolbar({ mode = "package" }: Props) {
  const [status, setStatus] = useState<ShareStatus>("idle");
  const [nativeShare, setNativeShare] = useState(false);

  const shareUrl = useMemo(
    () =>
      mode === "on_site" ? `${BASE_SHARE_URL}?mode=on_site` : BASE_SHARE_URL,
    [mode],
  );

  const shareTitle =
    mode === "on_site"
      ? "Oui Smoke · On-site sales"
      : "Oui Smoke · Partner one-pager";

  const shareText =
    mode === "on_site"
      ? "On-site hookah sales for events — guests pay on the floor, no host package deposit."
      : "Private event hookah catering for planners, hosts & vendors — Toronto & GTA rates.";

  useEffect(() => {
    setNativeShare(
      canUseNativeShare({
        title: shareTitle,
        text: shareText,
        url: shareUrl,
      }),
    );
  }, [shareTitle, shareText, shareUrl]);

  function flash(next: ShareStatus) {
    setStatus(next);
    window.setTimeout(() => setStatus("idle"), 2000);
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      flash("copied");
    } catch {
      window.prompt("Copy this link:", shareUrl);
    }
  }

  async function smartShare() {
    const data: ShareData = {
      title: shareTitle,
      text: shareText,
      url: shareUrl,
    };

    if (canUseNativeShare(data)) {
      try {
        await navigator.share(data);
        flash("shared");
        return;
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (err instanceof Error && err.name === "AbortError") return;
      }
    }

    await copyLink();
  }

  const shareLabel =
    status === "shared"
      ? "Shared"
      : status === "copied"
        ? "Link copied"
        : nativeShare
          ? "Share"
          : "Share link";

  const bookHref = mode === "on_site" ? "/book?type=on_site" : "/book?type=package";

  return (
    <div className="partner-toolbar no-print">
      <div className="partner-toolbar__actions">
        <button type="button" className="partner-toolbar__btn" onClick={copyLink}>
          {status === "copied" ? "Link copied" : "Copy link"}
        </button>
        <button
          type="button"
          className="partner-toolbar__btn partner-toolbar__btn--solid"
          onClick={() => void smartShare()}
        >
          {shareLabel}
        </button>
        <a className="partner-toolbar__btn" href={bookHref}>
          Book page
        </a>
      </div>
    </div>
  );
}
