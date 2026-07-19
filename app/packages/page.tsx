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
  "Explore Oui Smoke package structure for Toronto and GTA events — hookah counts, hours, refills, and add-ons. Get a tailored estimate online.";

export const metadata = buildPageMetadata({
  title: "Hookah Catering Packages & Pricing | Oui Smoke Toronto",
  description,
  path: "/packages",
});

export default function PackagesPage() {
  const jsonLd = graph(
    organizationNode(),
    websiteNode(),
    webPageNode({
      path: "/packages",
      name: "Packages and pricing",
      description,
    }),
    breadcrumbListNode([
      { name: "Home", path: "/" },
      { name: "Packages", path: "/packages" },
    ]),
  );

  return (
    <MarketingPage
      breadcrumb={[
        { name: "Home", href: "/" },
        { name: "Packages", href: "/packages" },
      ]}
      eyebrow="Within the GTA"
      title="Packages and pricing"
      lede="Clear package structure for private event catering — with an online estimator when you want numbers for your date."
      answer="Private event packages use per-hookah rates within the GTA, a package minimum, included hours, and optional add-ons. Current rates live on the homepage pricing table."
      jsonLd={jsonLd}
      hero="default"
      ctaTitle="Estimate your package"
      ctaBody="Use the homepage calculator for a quick model, or submit the booking form for a confirmed conversation about your date."
    >
      <section className="section experience">
        <div className="section__inner">
          <p className="eyebrow">Quote variables</p>
          <h2 className="section__title">What shapes the number</h2>
          <ul className="pillars" style={{ marginTop: "2rem" }}>
            <li>
              <h3>Hookahs</h3>
              <p>Unit count and package tier, including refill structure.</p>
            </li>
            <li>
              <h3>Hours</h3>
              <p>Included duration plus optional additional time.</p>
            </li>
            <li>
              <h3>Add-ons</h3>
              <p>LED bases, enhancers, branding, and travel beyond the GTA.</p>
            </li>
          </ul>
          <div className="section__actions">
            <Link className="btn btn--solid" href="/#pricing">
              See live pricing
            </Link>
            <Link className="btn btn--ghost" href="/book">
              Book an event
            </Link>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section__inner">
          <p className="eyebrow">Engagement styles</p>
          <h2 className="section__title">Two ways to book</h2>
          <ul className="page-cards">
            <li className="page-card">
              <h3>Package catering</h3>
              <p>
                Pre-planned unit count and hours for private events — the most
                common path for hosts who want a complete experience.
              </p>
            </li>
            <li className="page-card">
              <h3>On-site style</h3>
              <p>
                Alternative engagement options through the booking form when
                your event format needs a different service model.
              </p>
            </li>
          </ul>
        </div>
      </section>
    </MarketingPage>
  );
}
