import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Oui Smoke · Event portal",
  description: "Live view of your Oui Smoke event floor.",
  robots: { index: false, follow: false },
};

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  return children;
}
