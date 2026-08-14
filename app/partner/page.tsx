import type { Metadata } from "next";
import PartnerEntrance from "./PartnerEntrance";
import PartnerSheet from "./PartnerSheet";

export const metadata: Metadata = {
  title: "Fully hosted catering · Partners",
  description:
    "Oui Smoke fully hosted hookah catering for planners, hosts, and vendors across Toronto and the GTA. You cover the event — guests smoke included.",
  alternates: {
    canonical: "/partner",
  },
  openGraph: {
    title: "Oui Smoke · Fully hosted catering",
    description:
      "Fully hosted hookah catering — Toronto & GTA. Share-ready rates and booking links for industry partners.",
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
    title: "Oui Smoke · Fully hosted catering",
    description: "Fully hosted hookah catering — Toronto & GTA.",
    images: ["/og-image.jpg"],
  },
};

export default function PartnerOnePagerPage() {
  return (
    <PartnerEntrance>
      <PartnerSheet mode="package" />
    </PartnerEntrance>
  );
}
