import Link from "next/link";
import { MarketingPage } from "@/components/seo/MarketingPage";
import { buildPageMetadata } from "@/lib/seo/metadata";
import {
  breadcrumbListNode,
  graph,
  organizationNode,
  webPageNode,
  websiteNode,
} from "@/lib/seo/schema";
import "../marketing.css";

const description =
  "Practical planning guides for booking hookah catering in Toronto and the GTA — guest counts, venues, weddings, costs, and timelines.";

export const metadata = buildPageMetadata({
  title: "Event Planning Guides | Oui Smoke Toronto",
  description,
  path: "/guides",
});

const GUIDE_DRAFTS = [
  {
    title: "How Hookah Catering Works for Toronto Events",
    summary: "End-to-end process from inquiry to cleanup.",
  },
  {
    title: "How Many Hookahs Do You Need for an Event?",
    summary: "Guest-count and concurrency planning guidance.",
  },
  {
    title: "Hookah Catering Costs in Toronto: What Affects the Price?",
    summary: "Units, hours, add-ons, and travel variables.",
  },
  {
    title: "Hookah Catering for Weddings: A Planning Guide",
    summary: "Lounge placement, timeline, and venue permissions.",
  },
  {
    title: "Hookah Catering for Corporate Events and Brand Activations",
    summary: "Hospitality and branding considerations.",
  },
  {
    title: "Staffed Hookah Catering vs. Hookah Rental",
    summary: "Decision framework for hosts comparing models.",
  },
  {
    title: "Questions to Ask Before Hiring a Hookah Catering Company",
    summary: "Vetting checklist for planners and hosts.",
  },
  {
    title: "Venue Requirements for a Mobile Hookah Experience",
    summary: "Space, permissions, and load-in basics.",
  },
  {
    title: "Outdoor Hookah Catering: Weather, Space and Event Planning",
    summary: "Outdoor feasibility notes for GTA seasons.",
  },
  {
    title: "How Far in Advance Should You Book Hookah Catering?",
    summary: "Seasonality and booking lead-time guidance.",
  },
  {
    title: "Planning a Hookah Lounge Area at a Wedding",
    summary: "Flow, placement, and guest experience.",
  },
  {
    title: "Hookah Service for Large Guest Counts",
    summary: "Scaling units and staffing thoughtfully.",
  },
  {
    title: "What Is Included in a Full-Service Hookah Package?",
    summary: "Typical inclusions and customization points.",
  },
  {
    title: "Toronto and GTA Hookah Event Planning Checklist",
    summary: "A practical host checklist before the big day.",
  },
] as const;

export default function GuidesHubPage() {
  const jsonLd = graph(
    organizationNode(),
    websiteNode(),
    webPageNode({
      path: "/guides",
      name: "Hookah event planning guides",
      description,
    }),
    breadcrumbListNode([
      { name: "Home", path: "/" },
      { name: "Guides", path: "/guides" },
    ]),
  );

  return (
    <MarketingPage
      breadcrumb={[
        { name: "Home", href: "/" },
        { name: "Guides", href: "/guides" },
      ]}
      eyebrow="Planning guides"
      title="Hookah event planning guides"
      lede="A premium advice hub for hosts and planners — focused on booking usefulness, not keyword filler. Full articles publish after editorial review."
      answer="Browse the roadmap below. Drafts stay in review; published articles will answer the main question up front and link to booking."
      jsonLd={jsonLd}
      hero="areas"
    >
      <section className="section experience">
        <div className="section__inner">
          <p className="eyebrow">Roadmap</p>
          <h2 className="section__title">Guides in draft</h2>
          <p className="section__lede">
            Individual articles are not auto-published. Editorial drafts live in
            the repository for owner approval.
          </p>
          <ul className="page-guide-list">
            {GUIDE_DRAFTS.map((guide) => (
              <li key={guide.title}>
                <strong>{guide.title}</strong>
                <p>{guide.summary}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="section">
        <div className="section__inner page-prose">
          <p className="eyebrow">Plan now</p>
          <h2 className="section__title">Useful while guides cook</h2>
          <p>
            Start with <Link href="/how-it-works">How it works</Link>, the{" "}
            <Link href="/faq">FAQ</Link>, or{" "}
            <Link href="/book">book an event</Link>.
          </p>
        </div>
      </section>
    </MarketingPage>
  );
}
