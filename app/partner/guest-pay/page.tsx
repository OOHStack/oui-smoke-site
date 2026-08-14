import type { Metadata } from "next";
import PartnerEntrance from "../PartnerEntrance";
import PartnerSheet from "../PartnerSheet";

export const metadata: Metadata = {
  title: "Guest-pay catering · Partners",
  description:
    "Oui Smoke brings hookahs to your event. Guests pay on the floor through our customer web app. Fully managed staff, setup, and cleanup — no deposit or venue fees.",
  alternates: {
    canonical: "/partner/guest-pay",
  },
  openGraph: {
    title: "Oui Smoke · Guest-pay catering",
    description:
      "We bring our hookahs to your event and your guests pay for our services. Fully managed with staff, setup, and cleanup.",
    url: "/partner/guest-pay",
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
    title: "Oui Smoke · Guest-pay catering",
    description:
      "Guests pay on the floor. Fully managed staff, setup, and cleanup — no venue deposit.",
    images: ["/og-image.jpg"],
  },
};

export default function PartnerGuestPayPage() {
  return (
    <PartnerEntrance>
      <PartnerSheet mode="on_site" />
    </PartnerEntrance>
  );
}
