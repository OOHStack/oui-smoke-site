import Link from "next/link";
import { MarketingPage } from "@/components/seo/MarketingPage";
import { OWNER_TODOS } from "@/lib/seo/content";
import { buildPageMetadata } from "@/lib/seo/metadata";
import {
  breadcrumbListNode,
  graph,
  localBusinessNode,
  organizationNode,
  webPageNode,
  websiteNode,
} from "@/lib/seo/schema";
import { SITE } from "@/lib/seo/site";
import "../marketing.css";

const description =
  "Oui Smoke is a premium mobile hookah and shisha catering company serving private, wedding, and corporate events in Toronto and the GTA.";

export const metadata = buildPageMetadata({
  title: "About Oui Smoke | Premium Hookah Catering Toronto",
  description,
  path: "/about",
});

export default function AboutPage() {
  const jsonLd = graph(
    organizationNode(),
    localBusinessNode(),
    websiteNode(),
    webPageNode({
      path: "/about",
      name: "About Oui Smoke",
      description,
    }),
    breadcrumbListNode([
      { name: "Home", path: "/" },
      { name: "About", path: "/about" },
    ]),
  );

  return (
    <MarketingPage
      breadcrumb={[
        { name: "Home", href: "/" },
        { name: "About", href: "/about" },
      ]}
      eyebrow={SITE.legalName}
      title="About Oui Smoke"
      lede="Premium mobile hookah and shisha catering for private, wedding, and corporate events across Toronto and the Greater Toronto Area."
      answer="Oui Smoke designs staffed hookah experiences that feel intentional — equipment, service, and cleanup handled so hosts can focus on their guests."
      jsonLd={jsonLd}
      hero="about"
    >
      <section className="page-split" aria-labelledby="about-do-title">
        <div
          className="page-split__media"
          style={{ backgroundImage: "url('/images/model-2-web.jpg')" }}
          aria-hidden="true"
        />
        <div className="page-split__veil" aria-hidden="true" />
        <div className="page-split__inner">
          <p className="eyebrow">What we do</p>
          <h2 className="section__title" id="about-do-title">
            Managed experiences, on location
          </h2>
          <p className="section__lede">
            Delivery, setup, staffing, and cleanup — personalized with timing,
            unit counts, and optional add-ons like LED bases or unit branding.
          </p>
          <ul className="page-chips">
            <li>Private</li>
            <li>Wedding</li>
            <li>Corporate</li>
            <li>Toronto &amp; GTA</li>
          </ul>
        </div>
      </section>

      <section className="section experience">
        <div className="section__inner">
          <ul className="page-panels">
            <li className="page-panel">
              <h3>Where we operate</h3>
              <p>
                Toronto and the GTA first. Travel beyond on request.{" "}
                <Link href="/service-areas">See service areas</Link>.
              </p>
            </li>
            <li className="page-panel">
              <h3>How to reach us</h3>
              <p>
                Email <a href={`mailto:${SITE.email}`}>{SITE.email}</a> or use
                the <Link href="/book">booking form</Link>.
              </p>
            </li>
            <li className="page-panel">
              <h3>Adult-oriented</h3>
              <p>{SITE.ageNotice}</p>
            </li>
          </ul>
        </div>
      </section>

      <section className="section">
        <div className="section__inner">
          <p className="eyebrow">Pending approval</p>
          <h2 className="section__title">Details we won’t invent</h2>
          <p className="section__lede">
            These stay unpublished until confirmed — no fabricated claims for SEO.
          </p>
          <ul className="page-includes">
            {OWNER_TODOS.slice(0, 6).map((item, i) => (
              <li key={item}>
                <span className="page-includes__num" aria-hidden="true">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <p className="page-includes__copy">{item}</p>
              </li>
            ))}
          </ul>
          <p className="page-note" style={{ marginTop: "1.25rem" }}>
            Full checklist lives in the SEO owner docs for the team.
          </p>
        </div>
      </section>
    </MarketingPage>
  );
}
