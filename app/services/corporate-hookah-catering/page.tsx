import Link from "next/link";
import { MarketingPage, FaqBlock } from "@/components/seo/MarketingPage";
import { CORPORATE_FAQS } from "@/lib/seo/content";
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
  "Premium mobile hookah service for corporate events, brand activations, and hospitality experiences in Toronto and the GTA.";

export const metadata = buildPageMetadata({
  title: "Corporate Hookah Catering Toronto | Oui Smoke",
  description,
  path: "/services/corporate-hookah-catering",
});

export default function CorporateHookahPage() {
  const faqs = [...CORPORATE_FAQS];
  const jsonLd = graph(
    organizationNode(),
    websiteNode(),
    webPageNode({
      path: "/services/corporate-hookah-catering",
      name: "Corporate hookah catering and brand activations",
      description,
    }),
    serviceNode({
      path: "/services/corporate-hookah-catering",
      name: "Corporate hookah catering",
      serviceType: "Corporate hookah catering",
      description,
    }),
    breadcrumbListNode([
      { name: "Home", path: "/" },
      { name: "Services", path: "/hookah-catering-toronto" },
      {
        name: "Corporate hookah catering",
        path: "/services/corporate-hookah-catering",
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
          name: "Corporate hookah catering",
          href: "/services/corporate-hookah-catering",
        },
      ]}
      eyebrow="Corporate · Activations · Hospitality"
      title="Corporate hookah catering and brand activations"
      lede="A managed mobile experience for launches, hospitality suites, private corporate gatherings, and partner events across Toronto and the GTA."
      answer="Staffed service, optional unit branding, and an operations platform that keeps floor service organized during live events."
      jsonLd={jsonLd}
      hero="corporate"
      ctaTitle="Request a corporate quote"
      ctaBody="Share the event date, location, expected attendance, branding needs, and whether you are booking directly or through an agency."
    >
      <section className="section experience">
        <div className="section__inner">
          <p className="eyebrow">Formats</p>
          <h2 className="section__title">Where this works well</h2>
          <ul className="pillars" style={{ marginTop: "2rem" }}>
            <li>
              <h3>Brand activations</h3>
              <p>Product experiences with optional branded units.</p>
            </li>
            <li>
              <h3>Hospitality</h3>
              <p>Private corporate suites and client entertainment.</p>
            </li>
            <li>
              <h3>Agency events</h3>
              <p>Partner-ready rates via our one-pager and booking links.</p>
            </li>
          </ul>
        </div>
      </section>

      <section className="section">
        <div className="section__inner">
          <p className="eyebrow">For planners</p>
          <h2 className="section__title">What you’ll get from us</h2>
          <p className="section__lede">
            Clear variables, branding options, and a single path to confirm —
            built for agencies and in-house teams.
          </p>
          <ul className="page-includes">
            <li>
              <span className="page-includes__num" aria-hidden="true">01</span>
              <p className="page-includes__copy">
                Clear package variables — units, hours, staffing
              </p>
            </li>
            <li>
              <span className="page-includes__num" aria-hidden="true">02</span>
              <p className="page-includes__copy">
                Indoor/outdoor feasibility notes
              </p>
            </li>
            <li>
              <span className="page-includes__num" aria-hidden="true">03</span>
              <p className="page-includes__copy">
                Branding add-ons when creative is ready
              </p>
            </li>
            <li>
              <span className="page-includes__num" aria-hidden="true">04</span>
              <p className="page-includes__copy">
                A single booking pathway for deposits and confirmations
              </p>
            </li>
          </ul>
          <div className="section__actions">
            <Link className="btn btn--solid" href="/partner">
              Partner one-pager
            </Link>
            <Link className="btn btn--ghost" href="/book">
              Request a quote
            </Link>
          </div>
        </div>
      </section>

      <FaqBlock faqs={faqs} />
    </MarketingPage>
  );
}
