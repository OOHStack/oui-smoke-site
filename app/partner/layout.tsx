import type { Metadata } from "next";
import "./partner.css";

export const metadata: Metadata = {
  title: "Partner one-pager",
  description:
    "Oui Smoke private event hookah catering for planners, hosts, and vendors across Toronto and the GTA. Pricing, packages, and booking.",
  alternates: {
    canonical: "/partner",
  },
  openGraph: {
    title: "Oui Smoke · Partner one-pager",
    description:
      "Full-service private event hookah catering — Toronto & GTA. Share-ready rates and booking links for industry partners.",
    url: "/partner",
    images: [
      {
        url: "/og-image.jpg",
        width: 1200,
        height: 630,
        alt: "Oui Smoke — Premium hookah catering in Toronto & GTA",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Oui Smoke · Partner one-pager",
    description:
      "Full-service private event hookah catering — Toronto & GTA.",
    images: ["/og-image.jpg"],
  },
};

export default function PartnerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
