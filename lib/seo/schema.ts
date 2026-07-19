import { SITE, absoluteUrl } from "./site";

export type JsonLd = Record<string, unknown>;

export function organizationNode(): JsonLd {
  return {
    "@type": "Organization",
    "@id": absoluteUrl("/#organization"),
    name: SITE.name,
    legalName: SITE.legalName,
    url: absoluteUrl("/"),
    logo: absoluteUrl(SITE.logoPath),
    email: SITE.email,
    sameAs: [...SITE.sameAs],
  };
}

export function localBusinessNode(overrides: JsonLd = {}): JsonLd {
  const node: JsonLd = {
    "@type": "LocalBusiness",
    "@id": absoluteUrl("/#localbusiness"),
    name: SITE.name,
    image: absoluteUrl(SITE.ogImagePath),
    url: absoluteUrl("/"),
    email: SITE.email,
    description: SITE.description,
    priceRange: SITE.priceRange,
    areaServed: SITE.areaServed.map((area) => ({
      "@type": area.type,
      name: area.name,
    })),
    parentOrganization: { "@id": absoluteUrl("/#organization") },
    ...overrides,
  };

  if (SITE.telephone) {
    node.telephone = SITE.telephone;
  }

  return node;
}

export function websiteNode(): JsonLd {
  return {
    "@type": "WebSite",
    "@id": absoluteUrl("/#website"),
    url: absoluteUrl("/"),
    name: SITE.name,
    publisher: { "@id": absoluteUrl("/#organization") },
    potentialAction: {
      "@type": "ReserveAction",
      target: absoluteUrl(SITE.bookingPath),
      name: "Book an event",
    },
  };
}

export function webPageNode(opts: {
  path: string;
  name: string;
  description: string;
  idSuffix?: string;
}): JsonLd {
  const url = absoluteUrl(opts.path);
  return {
    "@type": "WebPage",
    "@id": `${url}#webpage`,
    url,
    name: opts.name,
    description: opts.description,
    isPartOf: { "@id": absoluteUrl("/#website") },
    about: { "@id": absoluteUrl("/#localbusiness") },
    publisher: { "@id": absoluteUrl("/#organization") },
  };
}

export function breadcrumbListNode(
  items: { name: string; path: string }[],
): JsonLd {
  return {
    "@type": "BreadcrumbList",
    "@id": absoluteUrl(`${items[items.length - 1]?.path ?? "/"}#breadcrumb`),
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}

export function serviceNode(opts: {
  path: string;
  name: string;
  description: string;
  serviceType: string;
  areaNames?: string[];
}): JsonLd {
  return {
    "@type": "Service",
    "@id": absoluteUrl(`${opts.path}#service`),
    name: opts.name,
    serviceType: opts.serviceType,
    description: opts.description,
    url: absoluteUrl(opts.path),
    provider: { "@id": absoluteUrl("/#localbusiness") },
    areaServed: (opts.areaNames ?? ["Toronto", "Greater Toronto Area"]).map(
      (name) => ({
        "@type": name.includes("Area") ? "AdministrativeArea" : "City",
        name,
      }),
    ),
  };
}

export function faqPageNode(
  faqs: { question: string; answer: string }[],
): JsonLd | null {
  if (!faqs.length) return null;
  return {
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: faq.answer,
      },
    })),
  };
}

export function graph(...nodes: Array<JsonLd | null | undefined>): JsonLd {
  const filtered = nodes.filter(Boolean) as JsonLd[];
  return {
    "@context": "https://schema.org",
    "@graph": filtered,
  };
}

/** Serialize JSON-LD safely for embedding in script tags. */
export function serializeJsonLd(data: JsonLd): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
