import type { Metadata } from "next";
import "./serve-layout.css";

export const metadata: Metadata = {
  title: "Oui Smoke · Guest service",
  description: "Request coals, refills, or help for your hookah.",
  robots: { index: false, follow: false },
};

/**
 * Background MUST be a sibling of the scroll/content tree — never a child of
 * an overflow scroller. iOS Safari expands scrollHeight when position:fixed
 * lives inside overflow:auto, which caused the endless blank space under QR pages.
 */
export default function ServeLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="serve-page-bg" aria-hidden="true">
        <div className="serve-page-bg__media" />
        <div className="serve-page-bg__veil" />
      </div>
      <div className="serve-scroller">{children}</div>
    </>
  );
}
