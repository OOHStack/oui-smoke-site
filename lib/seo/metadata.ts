import type { Metadata } from "next";
import { SITE, absoluteUrl } from "./site";

export function buildPageMetadata(opts: {
  title: string;
  description: string;
  path: string;
  noIndex?: boolean;
}): Metadata {
  const url = absoluteUrl(opts.path);
  return {
    // Absolute avoids double-branding from root layout title template.
    title: { absolute: opts.title },
    description: opts.description,
    alternates: { canonical: opts.path },
    robots: opts.noIndex
      ? { index: false, follow: false }
      : { index: true, follow: true },
    openGraph: {
      type: "website",
      locale: SITE.locale,
      url,
      siteName: SITE.name,
      title: opts.title,
      description: opts.description,
      images: [
        {
          url: SITE.ogImagePath,
          width: 1200,
          height: 630,
          alt: `${SITE.name} — Premium hookah catering in Toronto & GTA`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: opts.title,
      description: opts.description,
      images: [SITE.ogImagePath],
    },
  };
}
