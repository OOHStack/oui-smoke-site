import { MarketingPage, FaqBlock } from "@/components/seo/MarketingPage";
import { CORE_FAQS } from "@/lib/seo/content";
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
  "Answers about booking Oui Smoke hookah catering in Toronto and the GTA — venues, staffing, guest planning, age requirements, and timelines.";

export const metadata = buildPageMetadata({
  title: "Hookah Catering FAQ | Oui Smoke Toronto",
  description,
  path: "/faq",
});

const faqs = [
  ...CORE_FAQS,
  {
    question: "How do I estimate cost?",
    answer:
      "Use the event cost calculator on the homepage or submit the booking form with hookah count and hours. Package floors, per-hookah rates, and add-ons are listed on the pricing section of the homepage.",
  },
  {
    question: "Can you travel outside the GTA?",
    answer:
      "Yes, on request. Share the destination when you inquire so travel considerations can be reviewed for your date.",
  },
  {
    question: "Is hookah safe or risk-free?",
    answer:
      "No tobacco or shisha experience is risk-free. Oui Smoke does not market hookah as safe, harmless, or healthier. Hosts should make informed adult choices and follow venue and legal requirements.",
  },
];

export default function FaqPage() {
  const jsonLd = graph(
    organizationNode(),
    websiteNode(),
    webPageNode({
      path: "/faq",
      name: "Frequently asked questions",
      description,
    }),
    breadcrumbListNode([
      { name: "Home", path: "/" },
      { name: "FAQ", path: "/faq" },
    ]),
    faqPageNode(faqs),
  );

  return (
    <MarketingPage
      breadcrumb={[
        { name: "Home", href: "/" },
        { name: "FAQ", href: "/faq" },
      ]}
      eyebrow="Questions"
      title="Frequently asked questions"
      lede="Practical answers for hosts planning mobile hookah catering in Toronto and the GTA."
      jsonLd={jsonLd}
      hero="areas"
    >
      <FaqBlock faqs={faqs} />
    </MarketingPage>
  );
}
