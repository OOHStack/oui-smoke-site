import Link from "next/link";
import { MarketingPage, FaqBlock } from "@/components/seo/MarketingPage";
import { CORE_FAQS } from "@/lib/seo/content";
import { buildPageMetadata } from "@/lib/seo/metadata";
import {
  breadcrumbListNode,
  faqPageNode,
  graph,
  localBusinessNode,
  organizationNode,
  serviceNode,
  webPageNode,
  websiteNode,
} from "@/lib/seo/schema";
import "../marketing.css";

export const metadata = buildPageMetadata({
  title: "Hookah Catering Toronto | Premium Mobile Shisha · Oui Smoke",
  description:
    "Professionally managed mobile hookah and shisha catering for private parties, weddings, and corporate events in Toronto and across the GTA.",
  path: "/hookah-catering-toronto",
});

const faqs = CORE_FAQS;

const INCLUDES = [
  "Delivery and setup of premium hookah units",
  "On-site staffing for service flow and guest support",
  "Package duration planning",
  "Refill structure based on package tier",
  "Optional add-ons — LED bases, enhancers, branding",
  "Cleanup at the end of service",
] as const;

const STEPS = [
  {
    num: "01",
    title: "Share the brief",
    body: "Date, city or venue, guest count, and preferred hookah count.",
  },
  {
    num: "02",
    title: "Confirm the package",
    body: "We check availability and lock the right structure for your event.",
  },
  {
    num: "03",
    title: "Align logistics",
    body: "Indoor or outdoor plan, setup window, add-ons, and access.",
  },
  {
    num: "04",
    title: "We run the floor",
    body: "Delivery, setup, managed service, and cleanup — so you can host.",
  },
] as const;

export default function HookahCateringTorontoPage() {
  const jsonLd = graph(
    organizationNode(),
    localBusinessNode(),
    websiteNode(),
    webPageNode({
      path: "/hookah-catering-toronto",
      name: "Hookah catering in Toronto and the GTA",
      description: metadata.description as string,
    }),
    serviceNode({
      path: "/hookah-catering-toronto",
      name: "Mobile hookah and shisha catering",
      serviceType: "Hookah catering",
      description:
        "Premium staffed mobile hookah catering for private, wedding, and corporate events in Toronto and the Greater Toronto Area.",
    }),
    breadcrumbListNode([
      { name: "Home", path: "/" },
      { name: "Hookah catering Toronto", path: "/hookah-catering-toronto" },
    ]),
    faqPageNode([...faqs]),
  );

  return (
    <MarketingPage
      breadcrumb={[
        { name: "Home", href: "/" },
        { name: "Hookah catering Toronto", href: "/hookah-catering-toronto" },
      ]}
      eyebrow="Toronto · GTA · beyond on request"
      title="Hookah catering in Toronto and the GTA"
      lede="Oui Smoke brings a professionally managed mobile hookah experience to private celebrations, weddings, and corporate events across Toronto and the Greater Toronto Area."
      answer="We deliver equipment, staff the experience, and manage setup through cleanup — a polished lounge moment without DIY logistics."
      jsonLd={jsonLd}
      hero="default"
    >
      <section className="section experience">
        <div className="section__inner">
          <p className="eyebrow">Who it’s for</p>
          <h2 className="section__title">Hosts who want it managed</h2>
          <p className="section__lede">
            Birthdays, engagement parties, bachelor and bachelorette events,
            weddings, rooftop and backyard gatherings, corporate hospitality, and
            brand activations.
          </p>
          <div className="page-cards">
            <Link className="page-card" href="/services/wedding-hookah-catering">
              <h3>Weddings</h3>
              <p>Lounge zones for cocktail hour, late-night, or outdoor reception moments.</p>
              <span className="page-card__go">Explore →</span>
            </Link>
            <Link className="page-card" href="/services/corporate-hookah-catering">
              <h3>Corporate</h3>
              <p>Hospitality experiences and brand activations with optional unit branding.</p>
              <span className="page-card__go">Explore →</span>
            </Link>
            <Link
              className="page-card"
              href="/services/private-event-hookah-catering"
            >
              <h3>Private events</h3>
              <p>Birthdays, engagements, bachelor/bachelorette, rooftop and backyard parties.</p>
              <span className="page-card__go">Explore →</span>
            </Link>
            <Link className="page-card" href="/services/hookah-rentals">
              <h3>Rentals vs catering</h3>
              <p>Understand staffed catering versus DIY rental before you decide.</p>
              <span className="page-card__go">Compare →</span>
            </Link>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section__inner">
          <p className="eyebrow">The experience</p>
          <h2 className="section__title">What may be included</h2>
          <p className="section__lede">
            A managed package built around your guest flow — not a pile of gear
            left at the door.
          </p>
          <ul className="page-includes">
            {INCLUDES.map((item, i) => (
              <li key={item}>
                <span className="page-includes__num" aria-hidden="true">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <p className="page-includes__copy">{item}</p>
              </li>
            ))}
          </ul>
          <div className="section__actions">
            <Link className="btn btn--solid" href="/book">
              Book an event
            </Link>
            <Link className="btn btn--ghost" href="/#pricing">
              View pricing
            </Link>
          </div>
        </div>
      </section>

      <section className="page-split" aria-labelledby="coverage-title">
        <div
          className="page-split__media"
          style={{ backgroundImage: "url('/images/model-1-web.jpg')" }}
          aria-hidden="true"
        />
        <div className="page-split__veil" aria-hidden="true" />
        <div className="page-split__inner">
          <p className="eyebrow">Coverage</p>
          <h2 className="section__title" id="coverage-title">
            Toronto and the GTA
          </h2>
          <p className="section__lede">
            Mobile service to your venue or property across Toronto and the
            Greater Toronto Area. Travel beyond the GTA on request.
          </p>
          <ul className="page-chips" aria-label="Regions we commonly serve">
            <li>Toronto</li>
            <li>York</li>
            <li>Peel</li>
            <li>Durham</li>
            <li>Halton</li>
          </ul>
          <div className="page-hero__actions">
            <Link className="btn btn--solid" href="/service-areas">
              Service areas
            </Link>
            <Link className="btn btn--ghost" href="/book">
              Check your date
            </Link>
          </div>
        </div>
      </section>

      <section className="section experience">
        <div className="section__inner">
          <p className="eyebrow">How booking works</p>
          <h2 className="section__title">Four steps to the floor</h2>
          <p className="section__lede">
            From first inquiry to cleanup — built for hosts who want premium
            service without DIY logistics.
          </p>
          <div className="page-rows">
            {STEPS.map((step) => (
              <Link
                key={step.num}
                className="page-row"
                href="/how-it-works"
              >
                <span className="page-row__num" aria-hidden="true">
                  {step.num}
                </span>
                <span className="page-row__copy">
                  <strong>{step.title}</strong>
                  <span>{step.body}</span>
                </span>
                <span className="page-row__go" aria-hidden="true">
                  →
                </span>
              </Link>
            ))}
          </div>
          <div className="section__actions">
            <Link className="btn btn--solid" href="/how-it-works">
              Full walkthrough
            </Link>
            <Link className="btn btn--ghost" href="/book">
              Start booking
            </Link>
          </div>
        </div>
      </section>

      <FaqBlock faqs={faqs} />
    </MarketingPage>
  );
}
