import type { Metadata, Viewport } from "next";
import "../../display-viewport.css";

export const metadata: Metadata = {
  title: "Oui Smoke · Event floor",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function JobDisplayLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
