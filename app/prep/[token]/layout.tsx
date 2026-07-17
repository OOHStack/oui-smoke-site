import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Prep · Oui Smoke",
  robots: { index: false, follow: false },
};

export default function PrepLayout({ children }: { children: React.ReactNode }) {
  return children;
}
