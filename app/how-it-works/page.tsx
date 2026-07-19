import Link from "next/link";
import { MarketingPage, FaqBlock } from "@/components/seo/MarketingPage";
import { buildPageMetadata } from "@/lib/seo/metadata";
import {
  breadcrumbListNode,
  faqPageNode,
  graph,
  organizationNode,
  webPageNode,
  websiteNode,
} from "@/lib/seo/schema";
import "../marketing.css";

const description =
  "From inquiry to cleanup: how Oui Smoke plans, staffs, and runs mobile hookah experiences for Toronto and GTA events.";

export const metadata = buildPageMetadata({
  title: "How Hookah Catering Works | Oui Smoke Toronto",
  description,
  path: "/how-it-works",
});

const faqs = [
  {
    question: "How long does setup usually take?",
    answer:
      "Setup windows depend on unit count, access, and venue constraints. Share load-in details when you book so we can plan an appropriate arrival window.",
  },
  {
    question: "Who handles cleanup?",
    answer:
      "Oui Smoke handles breakdown and removal of our equipment at the end of the booked service window.",
  },
];

const STEPS = [
  {
    num: "01",
    title: "Inquiry",
    body: "Use the booking form or homepage estimator. Include date, city/venue, indoor or outdoor plan, guest count, preferred hookah count, and hours.",
  },
  {
    num: "02",
    title: "Confirmation",
    body: "We review availability and package structure, then confirm next steps including deposit timing based on current payment settings.",
  },
  {
    num: "03",
    title: "Logistics",
    body: "Align on access, setup window, service duration, and add-ons. Venue permission remains the client’s responsibility.",
  },
  {
    num: "04",
    title: "Event day",
    body: "Delivery, setup, staffed service, and cleanup. Hosts can also preview how live operations are managed from the homepage platform section.",
  },
] as const;

export default function HowItWorksPage() {
  const jsonLd = graph(
    organizationNode(),
    websiteNode(),
    webPageNode({
      path: "/how-it-works",
      name: "How Oui Smoke hookah catering works",
      description,
    }),
    breadcrumbListNode([
      { name: "Home", path: "/" },
      { name: "How it works", path: "/how-it-works" },
    ]),
    faqPageNode(faqs),
  );

  return (
    <MarketingPage
      breadcrumb={[
        { name: "Home", href: "/" },
        { name: "How it works", href: "/how-it-works" },
      ]}
      eyebrow="Booking & operations"
      title="How Oui Smoke hookah catering works"
      lede="A clear path from first inquiry to a managed event-day experience — built for hosts who want premium service without DIY logistics."
      answer="You share event details, we confirm package fit and availability, then our team delivers, sets up, staffs the experience, and cleans up."
      jsonLd={jsonLd}
      hero="default"
    >
      <section className="section experience">
        <div className="section__inner">
          <p className="eyebrow">The process</p>
          <h2 className="section__title">Four steps to the floor</h2>
          <ol className="process-steps">
            {STEPS.map((step) => (
              <li key={step.num}>
                <span className="process-steps__num" aria-hidden="true">
                  {step.num}
                </span>
                <div className="process-steps__copy">
                  <strong>{step.title}</strong>
                  <span>{step.body}</span>
                </div>
              </li>
            ))}
          </ol>
          <div className="section__actions">
            <Link className="btn btn--solid" href="/book">
              Start a booking
            </Link>
            <Link className="btn btn--ghost" href="/packages">
              View packages
            </Link>
          </div>
        </div>
      </section>

      <FaqBlock faqs={faqs} />
    </MarketingPage>
  );
}
