import type { MetadataRoute } from "next";
import { publishedSeoPaths } from "@/lib/seo/pages";
import { SITE_URL } from "@/lib/seo/site";

/** Stable lastmod for crawl consistency (update when content meaningfully changes). */
const LAST_MODIFIED = new Date("2026-07-19T12:00:00.000Z");

const EXTRA_PATHS = [
  "/partner",
  "/promo",
  "/privacy",
  "/terms",
  "/accessibility",
] as const;

const PRIORITY: Record<string, number> = {
  "/": 1,
  "/hookah-catering-toronto": 0.95,
  "/book": 0.9,
  "/services/wedding-hookah-catering": 0.85,
  "/services/corporate-hookah-catering": 0.85,
  "/services/private-event-hookah-catering": 0.85,
  "/packages": 0.8,
  "/how-it-works": 0.8,
  "/service-areas": 0.75,
  "/faq": 0.7,
  "/guides": 0.7,
  "/about": 0.65,
  "/services/hookah-rentals": 0.65,
  "/partner": 0.6,
  "/promo": 0.4,
  "/privacy": 0.3,
  "/terms": 0.3,
  "/accessibility": 0.3,
};

export default function sitemap(): MetadataRoute.Sitemap {
  const paths = Array.from(
    new Set([...publishedSeoPaths(), ...EXTRA_PATHS]),
  );

  return paths.map((path) => ({
    url: path === "/" ? `${SITE_URL}/` : `${SITE_URL}${path}`,
    lastModified: LAST_MODIFIED,
    changeFrequency:
      path === "/" || path === "/book" || path === "/packages"
        ? "weekly"
        : path.startsWith("/privacy") ||
            path.startsWith("/terms") ||
            path.startsWith("/accessibility")
          ? "yearly"
          : "monthly",
    priority: PRIORITY[path] ?? 0.5,
  }));
}
