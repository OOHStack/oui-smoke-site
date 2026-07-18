import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Oui Smoke · Event display",
  robots: { index: false, follow: false },
};

export default function DisplayLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
