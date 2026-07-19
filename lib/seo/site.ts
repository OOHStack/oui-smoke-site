/** Canonical site identity for SEO, schema, and llms.txt. */

export const SITE_URL = "https://ouismoke.co";

export const SITE = {
  name: "Oui Smoke",
  legalName: "Oui Smoke Catering Inc.",
  url: SITE_URL,
  email: "contact@ouismoke.co",
  locale: "en_CA",
  description:
    "Premium mobile hookah and shisha catering for private, wedding, and corporate events in Toronto and the Greater Toronto Area.",
  shortDescription:
    "Private & corporate premium hookah catering in Toronto and beyond the GTA.",
  /** Phone: OWNER TODO — add when approved for public use */
  telephone: null as string | null,
  /**
   * Service-area business: no public storefront address.
   * OWNER TODO — confirm areas before publishing dedicated location pages.
   */
  areaServed: [
    { type: "City" as const, name: "Toronto" },
    { type: "AdministrativeArea" as const, name: "Greater Toronto Area" },
  ],
  sameAs: [
    "https://instagram.com/ouismoke",
    "https://www.tiktok.com/@ouismoke",
  ],
  logoPath: "/logo-white.png",
  ogImagePath: "/og-image.jpg",
  priceRange: "$$",
  bookingPath: "/book",
  contactPath: "/#contact",
  ageNotice:
    "Adult-oriented service. Guests must meet applicable legal age requirements in Ontario (19+).",
} as const;

export function absoluteUrl(path = "/"): string {
  if (path.startsWith("http")) return path;
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${SITE_URL}${normalized === "/" ? "/" : normalized}`;
}
