import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Oui Smoke · Event floor",
  robots: { index: false, follow: false },
};

export default function JobDisplayLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
