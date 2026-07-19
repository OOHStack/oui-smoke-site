import Link from "next/link";
import { MarketingPage } from "@/components/seo/MarketingPage";
import { buildPageMetadata } from "@/lib/seo/metadata";
import {
  breadcrumbListNode,
  graph,
  localBusinessNode,
  organizationNode,
  webPageNode,
  websiteNode,
} from "@/lib/seo/schema";
import "../marketing.css";

const description =
  "Oui Smoke provides mobile hookah catering across Toronto and the Greater Toronto Area, with travel beyond the GTA available on request.";

export const metadata = buildPageMetadata({
  title: "Toronto & GTA Service Areas | Oui Smoke Hookah Catering",
  description,
  path: "/service-areas",
});

const REGIONS = [
  {
    name: "Toronto",
    note: "Downtown, North York, Scarborough, Etobicoke, York, East York, and surrounding neighbourhoods.",
  },
  {
    name: "York Region",
    note: "Including Vaughan, Markham, Richmond Hill, Aurora, and Newmarket — confirm your venue city when inquiring.",
  },
  {
    name: "Peel Region",
    note: "Including Mississauga, Brampton, and Caledon for qualifying event dates.",
  },
  {
    name: "Durham Region",
    note: "Including Pickering, Ajax, Whitby, and Oshawa subject to date and travel planning.",
  },
  {
    name: "Halton Region",
    note: "Including Oakville, Burlington, Milton, and Halton Hills subject to date and travel planning.",
  },
] as const;

export default function ServiceAreasPage() {
  const jsonLd = graph(
    organizationNode(),
    localBusinessNode(),
    websiteNode(),
    webPageNode({
      path: "/service-areas",
      name: "Toronto and GTA service areas",
      description,
    }),
    breadcrumbListNode([
      { name: "Home", path: "/" },
      { name: "Service areas", path: "/service-areas" },
    ]),
  );

  return (
    <MarketingPage
      breadcrumb={[
        { name: "Home", href: "/" },
        { name: "Service areas", href: "/service-areas" },
      ]}
      eyebrow="Coverage"
      title="Toronto and GTA service areas"
      lede="Mobile hookah catering centered on Toronto and the Greater Toronto Area — with travel beyond the GTA reviewed per inquiry."
      answer="Oui Smoke is a service-area business. We come to your venue or property rather than operating a public walk-in lounge."
      jsonLd={jsonLd}
      hero="areas"
    >
      <section className="section experience">
        <div className="section__inner">
          <p className="eyebrow">Primary coverage</p>
          <h2 className="section__title">Where we serve</h2>
          <ul className="page-cards">
            {REGIONS.map((region) => (
              <li className="page-card" key={region.name}>
                <h3>{region.name}</h3>
                <p>{region.note}</p>
              </li>
            ))}
          </ul>
          <p className="page-todo">
            Dedicated city pages publish only when we can provide unique
            venue and logistics notes — not thin name-swap pages.
          </p>
        </div>
      </section>

      <section className="page-split" aria-labelledby="areas-logistics-title">
        <div
          className="page-split__media"
          style={{ backgroundImage: "url('/images/model-3-web.jpg')" }}
          aria-hidden="true"
        />
        <div className="page-split__veil" aria-hidden="true" />
        <div className="page-split__inner">
          <p className="eyebrow">Logistics</p>
          <h2 className="section__title" id="areas-logistics-title">
            What to consider by location
          </h2>
          <p className="section__lede">
            Every venue is different — permissions, access, and weather shape
            the plan as much as the city name.
          </p>
          <ul className="page-chips">
            <li>Venue permission</li>
            <li>Load-in access</li>
            <li>Weather plan</li>
            <li>Travel time</li>
          </ul>
          <div className="page-hero__actions">
            <Link className="btn btn--solid" href="/book">
              Book for your city
            </Link>
            <Link className="btn btn--ghost" href="/hookah-catering-toronto">
              Hookah catering
            </Link>
          </div>
        </div>
      </section>
    </MarketingPage>
  );
}
