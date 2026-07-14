import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Book an event",
  description:
    "Request a Oui Smoke hookah catering package for your private or corporate event in Toronto and the GTA. Tell us the date, guest count, and vibe.",
  alternates: {
    canonical: "/book",
  },
  openGraph: {
    title: "Book an event · Oui Smoke",
    description:
      "Request premium hookah catering for private and corporate events across Toronto and the GTA.",
    url: "/book",
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
    title: "Book an event · Oui Smoke",
    description:
      "Request premium hookah catering for private and corporate events across Toronto and the GTA.",
    images: ["/og-image.jpg"],
  },
};

export default function BookLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
