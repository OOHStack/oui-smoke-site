import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Platform preview",
  description: "Interactive preview of Oui Smoke event ops and guest QR tools.",
  robots: { index: false, follow: false },
};

export default function DemoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
