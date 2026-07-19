import Link from "next/link";
import { MarketingPage, FaqBlock } from "@/components/seo/MarketingPage";
import { buildPageMetadata } from "@/lib/seo/metadata";
import {
  breadcrumbListNode,
  faqPageNode,
  graph,
  organizationNode,
  serviceNode,
  webPageNode,
  websiteNode,
} from "@/lib/seo/schema";
import "../../marketing.css";

const description =
  "Mobile hookah catering for birthdays, engagement parties, bachelor and bachelorette events, rooftop gatherings, and backyard celebrations in Toronto and the GTA.";

export const metadata = buildPageMetadata({
  title: "Private Event Hookah Catering Toronto | Oui Smoke",
  description,
  path: "/services/private-event-hookah-catering",
});

const faqs = [
  {
    question: "Can you serve backyard or rooftop events?",
    answer:
      "Yes, when the property and building rules allow it. Outdoor plans should account for space, weather, and neighbour or building restrictions. Confirm permissions before booking.",
  },
  {
    question: "What’s a practical starting package?",
    answer:
      "Private event packages on the site begin with a defined minimum unit count and package floor within the GTA. Use the estimator or booking form to model hookah count and hours for your guest list.",
  },
];

export default function PrivateEventHookahPage() {
  const jsonLd = graph(
    organizationNode(),
    websiteNode(),
    webPageNode({
      path: "/services/private-event-hookah-catering",
      name: "Private event hookah catering",
      description,
    }),
    serviceNode({
      path: "/services/private-event-hookah-catering",
      name: "Private event hookah catering",
      serviceType: "Private event hookah catering",
      description,
    }),
    breadcrumbListNode([
      { name: "Home", path: "/" },
      { name: "Services", path: "/hookah-catering-toronto" },
      {
        name: "Private event hookah catering",
        path: "/services/private-event-hookah-catering",
      },
    ]),
    faqPageNode(faqs),
  );

  return (
    <MarketingPage
      breadcrumb={[
        { name: "Home", href: "/" },
        { name: "Services", href: "/hookah-catering-toronto" },
        {
          name: "Private events",
          href: "/services/private-event-hookah-catering",
        },
      ]}
      eyebrow="Private celebrations"
      title="Private event hookah catering"
      lede="Birthdays, engagements, bachelor and bachelorette weekends, rooftop nights, and backyard gatherings — staffed so you can host instead of managing equipment."
      answer="Clear package pricing, optional add-ons, and a managed floor from setup through cleanup."
      jsonLd={jsonLd}
      hero="private"
    >
      <section className="section experience">
        <div className="section__inner">
          <p className="eyebrow">Formats</p>
          <h2 className="section__title">Popular private setups</h2>
          <ul className="pillars" style={{ marginTop: "2rem" }}>
            <li>
              <h3>Birthdays</h3>
              <p>Lounge setups that match the vibe of the night.</p>
            </li>
            <li>
              <h3>Engagements</h3>
              <p>Intimate celebrations with attentive service.</p>
            </li>
            <li>
              <h3>Rooftop &amp; backyard</h3>
              <p>Outdoor gatherings where property rules allow.</p>
            </li>
          </ul>
        </div>
      </section>

      <section className="page-split" aria-labelledby="private-ready-title">
        <div
          className="page-split__media"
          style={{ backgroundImage: "url('/images/model-4-web.jpg')" }}
          aria-hidden="true"
        />
        <div className="page-split__veil" aria-hidden="true" />
        <div className="page-split__inner">
          <p className="eyebrow">Before you inquire</p>
          <h2 className="section__title" id="private-ready-title">
            Have these ready
          </h2>
          <p className="section__lede">
            A tight brief gets you a faster, cleaner package recommendation.
          </p>
          <ul className="page-chips">
            <li>Date &amp; time</li>
            <li>City / venue</li>
            <li>Indoor or outdoor</li>
            <li>Guest count</li>
            <li>Hookahs &amp; hours</li>
          </ul>
          <div className="page-hero__actions">
            <Link className="btn btn--solid" href="/book">
              Book an event
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
