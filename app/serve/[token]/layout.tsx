import type { Metadata } from "next";
import "./serve-layout.css";

export const metadata: Metadata = {
  title: "Oui Smoke · Guest service",
  description: "Request coals, refills, or help for your hookah.",
  robots: { index: false, follow: false },
};

/**
 * Background MUST be a sibling of the scroll/content tree — never a child of
 * an overflow scroller. Document scroll is locked; only .serve-scroller scrolls.
 * Avoid position:fixed wallpaper (iOS expands scrollHeight with fixed layers).
 */
export default function ServeLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="serve-root">
      <div className="serve-page-bg" aria-hidden="true">
        <div className="serve-page-bg__media" />
        <div className="serve-page-bg__veil" />
      </div>
      <div className="serve-scroller">{children}</div>
    </div>
  );
}
