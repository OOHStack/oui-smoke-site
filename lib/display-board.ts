import { CONTACT_EMAIL } from "@/lib/brand-contact";
import { getDb } from "@/lib/db";
import { flavours } from "@/lib/db/schema";
import { getSiteUrl } from "@/lib/guest";
import {
  getPricing,
  hstPercentLabel,
  type PricingConfig,
} from "@/lib/pricing";
import { asc, eq } from "drizzle-orm";
import QRCode from "qrcode";

export type DisplayFlavour = {
  id: number;
  name: string;
  kind: "single" | "mix";
  description: string;
};

export type DisplayPackage = {
  id: string;
  eyebrow: string;
  title: string;
  price: string;
  detail: string;
};

export type DisplayQrLink = {
  id: string;
  label: string;
  hint: string;
  url: string;
  qrDataUrl: string;
};

export type DisplayBoardSnapshot = {
  brand: {
    name: string;
    tagline: string;
    contactEmail: string;
  };
  flavours: DisplayFlavour[];
  privatePackages: DisplayPackage[];
  onsitePackages: DisplayPackage[];
  footnotes: string[];
  links: DisplayQrLink[];
  updatedAt: string;
};

async function qrFor(url: string, size = 420): Promise<string> {
  return QRCode.toDataURL(url, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: size,
    color: { dark: "#0a0908", light: "#ffffff" },
  });
}

function buildPrivatePackages(pricing: PricingConfig): DisplayPackage[] {
  const min = pricing.minPackageHookahs;
  const floor = pricing.minPackageDollars;
  const refill = Math.round(pricing.refillPriceCents / 100);
  return [
    {
      id: "floor",
      eyebrow: "Private events",
      title: `${min} hookahs`,
      price: `$${floor}`,
      detail: `Flat package · 1 refill included, then $${refill} each`,
    },
    {
      id: "mid",
      eyebrow: "Private events",
      title: "5–8 hookahs",
      price: `$${pricing.midTierRate}`,
      detail: "Per hookah · unlimited refills",
    },
    {
      id: "high",
      eyebrow: "Private events",
      title: "9+ hookahs",
      price: `$${pricing.highTierRate}`,
      detail: "Per hookah · unlimited refills",
    },
  ];
}

function buildOnsitePackages(pricing: PricingConfig): DisplayPackage[] {
  const refill = Math.round(pricing.refillPriceCents / 100);
  return [
    {
      id: "standard",
      eyebrow: "On the floor",
      title: "Standard",
      price: `$${pricing.onsiteUnitRate}`,
      detail: `Per hookah · refills $${refill}`,
    },
    {
      id: "unlimited",
      eyebrow: "On the floor",
      title: "Unlimited",
      price: `$${pricing.onsiteUnlimitedRate}`,
      detail: "Per hookah · refills included",
    },
  ];
}

export async function loadDisplayBoard(): Promise<DisplayBoardSnapshot> {
  const db = getDb();
  const pricing = await getPricing();
  const site = getSiteUrl();
  const bookUrl = `${site}/book`;
  const instagramUrl = "https://instagram.com/ouismoke";
  const siteUrl = site;

  const menu = await db
    .select({
      id: flavours.id,
      name: flavours.name,
      kind: flavours.kind,
      description: flavours.description,
    })
    .from(flavours)
    .where(eq(flavours.active, true))
    .orderBy(asc(flavours.name));

  const [bookQr, igQr, siteQr] = await Promise.all([
    qrFor(bookUrl, 512),
    qrFor(instagramUrl, 360),
    qrFor(siteUrl, 360),
  ]);

  return {
    brand: {
      name: "Oui Smoke",
      tagline: "Premium hookah for events that matter.",
      contactEmail: CONTACT_EMAIL,
    },
    flavours: menu.map((f) => ({
      id: f.id,
      name: f.name,
      kind: f.kind as "single" | "mix",
      description: (f.description ?? "").trim(),
    })),
    privatePackages: buildPrivatePackages(pricing),
    onsitePackages: buildOnsitePackages(pricing),
    footnotes: [
      `${pricing.includedHours} hours included · extra hours $${pricing.extraHourRate}`,
      `Prices before ${hstPercentLabel(pricing.hstRate)}% HST`,
      `Questions · ${CONTACT_EMAIL}`,
    ],
    links: [
      {
        id: "book",
        label: "Book an event",
        hint: "Scan to request a date",
        url: bookUrl,
        qrDataUrl: bookQr,
      },
      {
        id: "instagram",
        label: "@ouismoke",
        hint: "Follow along",
        url: instagramUrl,
        qrDataUrl: igQr,
      },
      {
        id: "site",
        label: "ouismoke.co",
        hint: "Packages & gallery",
        url: siteUrl,
        qrDataUrl: siteQr,
      },
    ],
    updatedAt: new Date().toISOString(),
  };
}
