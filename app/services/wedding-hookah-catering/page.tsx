import Link from "next/link";
import { MarketingPage, FaqBlock } from "@/components/seo/MarketingPage";
import { WEDDING_FAQS } from "@/lib/seo/content";
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
  "Staffed hookah experiences for weddings and wedding-related celebrations across Toronto and the GTA — planned around your venue, timeline, and guest flow.";

export const metadata = buildPageMetadata({
  title: "Wedding Hookah Catering Toronto | Oui Smoke",
  description,
  path: "/services/wedding-hookah-catering",
});

const faqs = [
  ...WEDDING_FAQS,
  {
    question: "Do we need the venue’s approval?",
    answer:
      "Yes. Couples or their planners should confirm that the venue allows hookah/shisha service and clarify any outdoor-only, designated-area, or timing restrictions.",
  },
];

export default function WeddingHookahPage() {
  const jsonLd = graph(
    organizationNode(),
    websiteNode(),
    webPageNode({
      path: "/services/wedding-hookah-catering",
      name: "Wedding hookah catering in Toronto",
      description,
    }),
    serviceNode({
      path: "/services/wedding-hookah-catering",
      name: "Wedding hookah catering",
      serviceType: "Wedding hookah catering",
      description,
    }),
    breadcrumbListNode([
      { name: "Home", path: "/" },
      { name: "Services", path: "/hookah-catering-toronto" },
      {
        name: "Wedding hookah catering",
        path: "/services/wedding-hookah-catering",
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
          name: "Wedding hookah catering",
          href: "/services/wedding-hookah-catering",
        },
      ]}
      eyebrow="Weddings · Toronto & GTA"
      title="Wedding hookah catering in Toronto"
      lede="A staffed lounge moment for cocktail hour, outdoor receptions, or late-night celebrations — planned around your venue rules and wedding timeline."
      answer="We coordinate setup windows, staffing, and service duration so the experience fits your celebration rather than competing with it."
      jsonLd={jsonLd}
      hero="wedding"
      ctaTitle="Request a wedding quote"
      ctaBody="Tell us your date, venue city, approximate guest count, and when you’d like the lounge available."
    >
      <section className="section experience">
        <div className="section__inner">
          <p className="eyebrow">How couples use it</p>
          <h2 className="section__title">Lounge moments that fit the day</h2>
          <ul className="pillars" style={{ marginTop: "2rem" }}>
            <li>
              <h3>Cocktail hour</h3>
              <p>A lounge zone while photos continue and guests arrive.</p>
            </li>
            <li>
              <h3>Outdoor terrace</h3>
              <p>Courtyard or patio activations where venue rules allow.</p>
            </li>
            <li>
              <h3>Late night</h3>
              <p>An adult reception amenity after dinner and dancing.</p>
            </li>
          </ul>
        </div>
      </section>

      <section className="section">
        <div className="section__inner page-prose">
          <p className="eyebrow">Planning</p>
          <h2 className="section__title">What we’ll align on</h2>
          <h3>Venue and space</h3>
          <p>
            Confirm indoor versus outdoor permission, proximity to food service,
            wind exposure outdoors, and a clear footprint for units and guest
            circulation.
          </p>
          <h3>Guest count and hookah planning</h3>
          <p>
            Hookah count depends on how concurrent you expect lounge use to be —
            not only total headcount. Share expected lounge traffic when you
            inquire.
          </p>
          <h3>Timeline</h3>
          <p>
            We plan around ceremony, dinner, and entertainment cues. See{" "}
            <Link href="/how-it-works">how booking works</Link>.
          </p>
        </div>
      </section>

      <FaqBlock faqs={faqs} />
    </MarketingPage>
  );
}
