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
          <ul className="page-cards">
            <li className="page-card">
              <h3>
                <Link href="/services/wedding-hookah-catering">Weddings</Link>
              </h3>
              <p>Lounge zones for cocktail hour, late-night, or outdoor reception moments.</p>
            </li>
            <li className="page-card">
              <h3>
                <Link href="/services/corporate-hookah-catering">Corporate</Link>
              </h3>
              <p>Hospitality experiences and brand activations with optional unit branding.</p>
            </li>
            <li className="page-card">
              <h3>
                <Link href="/services/private-event-hookah-catering">
                  Private events
                </Link>
              </h3>
              <p>Birthdays, engagements, bachelor/bachelorette, rooftop and backyard parties.</p>
            </li>
            <li className="page-card">
              <h3>
                <Link href="/services/hookah-rentals">Rentals vs catering</Link>
              </h3>
              <p>Understand staffed catering versus DIY rental before you decide.</p>
            </li>
          </ul>
        </div>
      </section>

      <section className="section">
        <div className="section__inner page-prose">
          <p className="eyebrow">The experience</p>
          <h2 className="section__title">What may be included</h2>
          <ul>
            <li>Delivery and setup of premium hookah units</li>
            <li>On-site staffing for service flow and guest support</li>
            <li>Package duration planning</li>
            <li>Refill structure based on package tier</li>
            <li>Optional add-ons — LED bases, water enhancers, unit branding</li>
            <li>Cleanup at the end of service</li>
          </ul>
          <p className="page-note">
            Exact inclusions depend on your package. Use the{" "}
            <Link href="/book">booking form</Link> or homepage estimator for a
            tailored quote.
          </p>
        </div>
      </section>

      <section className="section experience">
        <div className="section__inner page-prose">
          <p className="eyebrow">Coverage</p>
          <h2 className="section__title">Toronto and the GTA</h2>
          <p>
            Primary coverage is Toronto and the Greater Toronto Area. Travel
            outside the GTA is considered on request. See the{" "}
            <Link href="/service-areas">service areas overview</Link>.
          </p>
          <h3>How booking works</h3>
          <ol>
            <li>Share your date, city/venue, guest count, and preferred hookah count.</li>
            <li>We confirm availability and package fit.</li>
            <li>Finalize logistics: indoor/outdoor plan, setup window, and staffing.</li>
            <li>Event day: delivery, setup, managed service, and cleanup.</li>
          </ol>
          <p>
            Full walkthrough: <Link href="/how-it-works">How it works</Link>.
          </p>
        </div>
      </section>

      <FaqBlock faqs={faqs} />
    </MarketingPage>
  );
}
