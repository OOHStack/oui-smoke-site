import type { Metadata, Viewport } from "next";
import "./prep-viewport.css";

export const metadata: Metadata = {
  title: "Prep · Oui Smoke",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function PrepLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="prep-root">
      <div className="prep-scroller">{children}</div>
    </div>
  );
}
