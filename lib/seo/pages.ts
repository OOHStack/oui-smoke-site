/**
 * SEO page registry — titles, descriptions, intent, publish status.
 * Owner-facing fields marked OWNER TODO stay unpublished or use placeholders.
 */

export type ContentStatus = "published" | "draft" | "planned";

export type SeoPage = {
  path: string;
  intent: string;
  primaryTopic: string;
  supportingTopics: string[];
  audience: string;
  title: string;
  h1: string;
  description: string;
  conversionAction: string;
  schemaTypes: string[];
  status: ContentStatus;
  internalLinks: string[];
};

export const SEO_PAGES: SeoPage[] = [
  {
    path: "/",
    intent: "brand + commercial",
    primaryTopic: "premium hookah catering Toronto",
    supportingTopics: [
      "shisha catering GTA",
      "private events",
      "corporate events",
      "wedding hookah",
    ],
    audience: "hosts planning premium events",
    title: "Oui Smoke — Premium Hookah Catering in Toronto & the GTA",
    h1: "Premium hookah catering for Toronto events",
    description:
      "Oui Smoke provides premium mobile hookah and shisha catering for private, wedding, and corporate events across Toronto and the Greater Toronto Area.",
    conversionAction: "Book / Estimate",
    schemaTypes: ["Organization", "LocalBusiness", "WebSite", "FAQPage"],
    status: "published",
    internalLinks: [
      "/hookah-catering-toronto",
      "/services/wedding-hookah-catering",
      "/book",
      "/how-it-works",
      "/faq",
    ],
  },
  {
    path: "/hookah-catering-toronto",
    intent: "core commercial",
    primaryTopic: "hookah catering Toronto",
    supportingTopics: [
      "shisha catering Toronto",
      "mobile hookah service",
      "GTA hookah catering",
    ],
    audience: "event hosts comparing caterers",
    title: "Hookah Catering Toronto | Premium Mobile Shisha · Oui Smoke",
    h1: "Hookah catering in Toronto and the GTA",
    description:
      "Professionally managed mobile hookah and shisha catering for private parties, weddings, and corporate events in Toronto and across the GTA.",
    conversionAction: "Book an event",
    schemaTypes: ["Service", "WebPage", "BreadcrumbList", "FAQPage"],
    status: "published",
    internalLinks: [
      "/services/wedding-hookah-catering",
      "/services/corporate-hookah-catering",
      "/services/private-event-hookah-catering",
      "/how-it-works",
      "/book",
      "/service-areas",
    ],
  },
  {
    path: "/services/wedding-hookah-catering",
    intent: "event — wedding",
    primaryTopic: "wedding hookah catering Toronto",
    supportingTopics: [
      "wedding shisha service",
      "reception lounge area",
      "guest experience",
    ],
    audience: "couples and wedding planners",
    title: "Wedding Hookah Catering Toronto | Oui Smoke",
    h1: "Wedding hookah catering in Toronto",
    description:
      "Staffed hookah experiences for weddings and wedding-related celebrations across Toronto and the GTA — planned around your venue, timeline, and guest flow.",
    conversionAction: "Request a wedding quote",
    schemaTypes: ["Service", "WebPage", "BreadcrumbList", "FAQPage"],
    status: "published",
    internalLinks: [
      "/hookah-catering-toronto",
      "/how-it-works",
      "/guides",
      "/book",
    ],
  },
  {
    path: "/services/corporate-hookah-catering",
    intent: "event — corporate",
    primaryTopic: "corporate hookah catering Toronto",
    supportingTopics: [
      "brand activations",
      "hospitality entertainment",
      "unit branding",
    ],
    audience: "corporate planners and agencies",
    title: "Corporate Hookah Catering Toronto | Oui Smoke",
    h1: "Corporate hookah catering and brand activations",
    description:
      "Premium mobile hookah service for corporate events, brand activations, and hospitality experiences in Toronto and the GTA.",
    conversionAction: "Request a corporate quote",
    schemaTypes: ["Service", "WebPage", "BreadcrumbList", "FAQPage"],
    status: "published",
    internalLinks: [
      "/hookah-catering-toronto",
      "/partner",
      "/how-it-works",
      "/book",
    ],
  },
  {
    path: "/services/private-event-hookah-catering",
    intent: "event — private",
    primaryTopic: "private event hookah catering",
    supportingTopics: [
      "birthday hookah catering",
      "bachelor party",
      "backyard events",
      "rooftop events",
    ],
    audience: "private hosts",
    title: "Private Event Hookah Catering Toronto | Oui Smoke",
    h1: "Private event hookah catering",
    description:
      "Mobile hookah catering for birthdays, engagement parties, bachelor and bachelorette events, rooftop gatherings, and backyard celebrations in Toronto and the GTA.",
    conversionAction: "Book a private event",
    schemaTypes: ["Service", "WebPage", "BreadcrumbList", "FAQPage"],
    status: "published",
    internalLinks: [
      "/hookah-catering-toronto",
      "/packages",
      "/how-it-works",
      "/book",
    ],
  },
  {
    path: "/services/hookah-rentals",
    intent: "comparison / rental",
    primaryTopic: "hookah rental Toronto vs catering",
    supportingTopics: ["DIY rental", "staffed service", "event logistics"],
    audience: "hosts comparing rental vs catering",
    title: "Hookah Rentals vs Staffed Catering Toronto | Oui Smoke",
    h1: "Hookah rentals and staffed catering — what’s the difference?",
    description:
      "Understand staffed Oui Smoke catering versus DIY hookah rental so you can choose the right setup for your Toronto or GTA event.",
    conversionAction: "Talk through options",
    schemaTypes: ["WebPage", "BreadcrumbList", "FAQPage"],
    status: "published",
    internalLinks: [
      "/hookah-catering-toronto",
      "/how-it-works",
      "/book",
    ],
  },
  {
    path: "/service-areas",
    intent: "location hub",
    primaryTopic: "GTA service coverage",
    supportingTopics: ["Toronto", "travel", "venue logistics"],
    audience: "hosts checking coverage",
    title: "Toronto & GTA Service Areas | Oui Smoke Hookah Catering",
    h1: "Toronto and GTA service areas",
    description:
      "Oui Smoke provides mobile hookah catering across Toronto and the Greater Toronto Area, with travel beyond the GTA available on request.",
    conversionAction: "Check availability",
    schemaTypes: ["WebPage", "BreadcrumbList"],
    status: "published",
    internalLinks: [
      "/hookah-catering-toronto",
      "/book",
      "/how-it-works",
    ],
  },
  {
    path: "/how-it-works",
    intent: "informational / planning",
    primaryTopic: "how hookah catering works",
    supportingTopics: [
      "setup",
      "staffing",
      "venue requirements",
      "booking timeline",
    ],
    audience: "first-time bookers",
    title: "How Hookah Catering Works | Oui Smoke Toronto",
    h1: "How Oui Smoke hookah catering works",
    description:
      "From inquiry to cleanup: how Oui Smoke plans, staffs, and runs mobile hookah experiences for Toronto and GTA events.",
    conversionAction: "Start a booking",
    schemaTypes: ["WebPage", "BreadcrumbList", "FAQPage"],
    status: "published",
    internalLinks: ["/book", "/faq", "/packages", "/hookah-catering-toronto"],
  },
  {
    path: "/packages",
    intent: "commercial / pricing",
    primaryTopic: "hookah catering packages",
    supportingTopics: ["pricing variables", "add-ons", "guest planning"],
    audience: "hosts comparing packages",
    title: "Hookah Catering Packages & Pricing | Oui Smoke Toronto",
    h1: "Packages and pricing",
    description:
      "Explore Oui Smoke package structure for Toronto and GTA events — hookah counts, hours, refills, and add-ons. Get a tailored estimate online.",
    conversionAction: "Estimate my event",
    schemaTypes: ["WebPage", "BreadcrumbList"],
    status: "published",
    internalLinks: ["/#pricing", "/book", "/how-it-works"],
  },
  {
    path: "/faq",
    intent: "question / planning",
    primaryTopic: "hookah catering FAQ",
    supportingTopics: ["venue permission", "age", "indoor outdoor", "lead time"],
    audience: "hosts with planning questions",
    title: "Hookah Catering FAQ | Oui Smoke Toronto",
    h1: "Frequently asked questions",
    description:
      "Answers about booking Oui Smoke hookah catering in Toronto and the GTA — venues, staffing, guest planning, age requirements, and timelines.",
    conversionAction: "Book an event",
    schemaTypes: ["FAQPage", "WebPage", "BreadcrumbList"],
    status: "published",
    internalLinks: ["/how-it-works", "/book", "/hookah-catering-toronto"],
  },
  {
    path: "/about",
    intent: "trust / entity",
    primaryTopic: "about Oui Smoke",
    supportingTopics: ["company identity", "service area", "approach"],
    audience: "hosts evaluating credibility",
    title: "About Oui Smoke | Premium Hookah Catering Toronto",
    h1: "About Oui Smoke",
    description:
      "Oui Smoke is a premium mobile hookah and shisha catering company serving private, wedding, and corporate events in Toronto and the GTA.",
    conversionAction: "Contact us",
    schemaTypes: ["AboutPage", "WebPage", "BreadcrumbList"],
    status: "published",
    internalLinks: ["/hookah-catering-toronto", "/how-it-works", "/book"],
  },
  {
    path: "/guides",
    intent: "informational hub",
    primaryTopic: "event planning guides",
    supportingTopics: ["wedding planning", "guest counts", "costs", "venues"],
    audience: "hosts researching before booking",
    title: "Event Planning Guides | Oui Smoke Toronto",
    h1: "Hookah event planning guides",
    description:
      "Practical planning guides for booking hookah catering in Toronto and the GTA — guest counts, venues, weddings, costs, and timelines.",
    conversionAction: "Browse guides / Book",
    schemaTypes: ["CollectionPage", "WebPage", "BreadcrumbList"],
    status: "published",
    internalLinks: ["/book", "/faq", "/how-it-works"],
  },
  {
    path: "/book",
    intent: "conversion",
    primaryTopic: "book hookah catering",
    supportingTopics: ["estimate", "package", "on-site"],
    audience: "ready-to-inquire hosts",
    title: "Book an Event | Oui Smoke",
    h1: "Book an event",
    description:
      "Request a Oui Smoke hookah catering package for your private or corporate event in Toronto and the GTA.",
    conversionAction: "Submit booking request",
    schemaTypes: ["WebPage"],
    status: "published",
    internalLinks: ["/", "/packages", "/how-it-works"],
  },
];

export function getSeoPage(path: string): SeoPage | undefined {
  return SEO_PAGES.find((page) => page.path === path);
}

export function publishedSeoPaths(): string[] {
  return SEO_PAGES.filter((page) => page.status === "published").map(
    (page) => page.path,
  );
}
