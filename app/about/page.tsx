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
      <section className="section experience">
        <div className="section__inner page-prose">
          <p className="eyebrow">What we do</p>
          <h2 className="section__title">Managed experiences, on location</h2>
          <p>
            We bring a managed lounge experience to events: delivery, setup,
            staffing, and cleanup. Packages can be personalized with timing,
            unit counts, and optional add-ons such as LED bases or unit branding.
          </p>
          <h3>Where we operate</h3>
          <p>
            Toronto and the GTA are our primary service area. Travel beyond the
            GTA is available on request.{" "}
            <Link href="/service-areas">See service areas</Link>.
          </p>
          <h3>How to reach us</h3>
          <p>
            Email <a href={`mailto:${SITE.email}`}>{SITE.email}</a> or use the{" "}
            <Link href="/book">booking form</Link>.
          </p>
          <p className="page-note">
            Public phone number and inquiry-hours language: owner approval
            required before publication.
          </p>
          <h3>Adult-oriented service</h3>
          <p>{SITE.ageNotice}</p>
        </div>
      </section>

      <section className="section">
        <div className="section__inner page-prose">
          <p className="eyebrow">Pending approval</p>
          <h2 className="section__title">Details we won’t invent</h2>
          <p className="page-note">
            The following stay unpublished until confirmed:
          </p>
          <ul>
            {OWNER_TODOS.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </section>
    </MarketingPage>
  );
}
