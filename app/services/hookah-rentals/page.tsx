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
import "../../marketing.css";

const description =
  "Understand staffed Oui Smoke catering versus DIY hookah rental so you can choose the right setup for your Toronto or GTA event.";

export const metadata = buildPageMetadata({
  title: "Hookah Rentals vs Staffed Catering Toronto | Oui Smoke",
  description,
  path: "/services/hookah-rentals",
});

const faqs = [
  {
    question: "Does Oui Smoke offer unsupervised DIY rentals?",
    answer:
      "Oui Smoke is built around staffed, managed catering. If you are comparing DIY rental quotes elsewhere, use this page to understand the operational differences before you decide.",
  },
  {
    question: "When is staffed catering the better fit?",
    answer:
      "Choose staffed service when you want consistent guest experience, someone managing coals and service flow, and less host responsibility during the event.",
  },
];

export default function HookahRentalsPage() {
  const jsonLd = graph(
    organizationNode(),
    websiteNode(),
    webPageNode({
      path: "/services/hookah-rentals",
      name: "Hookah rentals vs staffed catering",
      description,
    }),
    breadcrumbListNode([
      { name: "Home", path: "/" },
      { name: "Services", path: "/hookah-catering-toronto" },
      { name: "Rentals vs catering", path: "/services/hookah-rentals" },
    ]),
    faqPageNode(faqs),
  );

  return (
    <MarketingPage
      breadcrumb={[
        { name: "Home", href: "/" },
        { name: "Services", href: "/hookah-catering-toronto" },
        { name: "Rentals vs catering", href: "/services/hookah-rentals" },
      ]}
      eyebrow="Compare your options"
      title="Hookah rentals vs staffed catering"
      lede="Not every event needs the same model. Choose based on service level and guest experience — not just sticker price."
      answer="Oui Smoke focuses on staffed mobile hookah catering. DIY rental may cost less upfront but shifts setup, monitoring, and cleanup to the host."
      jsonLd={jsonLd}
      hero="default"
    >
      <section className="section experience">
        <div className="section__inner">
          <p className="eyebrow">Side by side</p>
          <h2 className="section__title">What’s different</h2>
          <div className="page-table-wrap">
            <table className="page-table">
              <thead>
                <tr>
                  <th>Factor</th>
                  <th>Staffed catering</th>
                  <th>Typical DIY rental</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>On-site service</td>
                  <td>Staff manage the experience</td>
                  <td>Host or guests manage equipment</td>
                </tr>
                <tr>
                  <td>Setup &amp; cleanup</td>
                  <td>Included in managed service</td>
                  <td>Usually host responsibility</td>
                </tr>
                <tr>
                  <td>Guest experience</td>
                  <td>Guided, consistent service flow</td>
                  <td>Varies with guest familiarity</td>
                </tr>
                <tr>
                  <td>Best for</td>
                  <td>Weddings, corporate, premium private events</td>
                  <td>Hosts comfortable operating equipment</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section__inner page-prose">
          <p className="eyebrow">Next step</p>
          <h2 className="section__title">Want it managed?</h2>
          <p>
            Continue to{" "}
            <Link href="/hookah-catering-toronto">hookah catering in Toronto</Link>{" "}
            or <Link href="/book">request a booking</Link>.
          </p>
        </div>
      </section>

      <FaqBlock faqs={faqs} />
    </MarketingPage>
  );
}
