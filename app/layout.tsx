import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";

const siteUrl = "https://ouismoke.co";
const description =
  "Private & corporate premium hookah catering in Toronto and beyond the GTA. Personalized packages for birthdays, weddings, and corporate events.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Oui Smoke — Premium Hookah Catering",
    template: "%s · Oui Smoke",
  },
  description,
  applicationName: "Oui Smoke",
  keywords: [
    "hookah catering",
    "Toronto hookah",
    "GTA hookah catering",
    "private event hookah",
    "corporate hookah catering",
    "Oui Smoke",
  ],
  authors: [{ name: "Oui Smoke Catering Inc." }],
  creator: "Oui Smoke",
  publisher: "Oui Smoke Catering Inc.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "en_CA",
    url: siteUrl,
    siteName: "Oui Smoke",
    title: "Oui Smoke — Premium Hookah Catering",
    description,
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
    title: "Oui Smoke — Premium Hookah Catering",
    description:
      "Private & corporate premium hookah catering in Toronto and beyond the GTA.",
    images: ["/og-image.jpg"],
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon.svg", type: "image/svg+xml" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
  manifest: "/site.webmanifest",
  themeColor: "#0a0a0a",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en-CA">
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
