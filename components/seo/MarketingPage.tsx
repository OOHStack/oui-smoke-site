import Link from "next/link";
import type { ReactNode } from "react";
import { MarketingChrome } from "./MarketingChrome";
import { JsonLdScript } from "./JsonLd";
import type { JsonLd } from "@/lib/seo/schema";

const HERO_IMAGES = {
  default: "/images/model-2-web.jpg",
  wedding: "/images/model-3-web.jpg",
  corporate: "/images/model-4-web.jpg",
  private: "/images/model-5-web.jpg",
  areas: "/images/model-1-web.jpg",
  about: "/images/model-1-web.jpg",
} as const;

function Breadcrumb({
  items,
}: {
  items: { name: string; href: string }[];
}) {
  return (
    <nav className="page-hero__crumb" aria-label="Breadcrumb">
      <ol>
        {items.map((crumb, i) => (
          <li key={crumb.href}>
            {i < items.length - 1 ? (
              <Link href={crumb.href}>{crumb.name}</Link>
            ) : (
              <span aria-current="page">{crumb.name}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function MarketingPage({
  breadcrumb,
  eyebrow,
  title,
  lede,
  answer,
  jsonLd,
  children,
  hero = "default",
  ctaTitle = "Ready when you are",
  ctaBody = "Tell us the date, guest count, and vibe — we’ll craft a package around it.",
}: {
  breadcrumb: { name: string; href: string }[];
  eyebrow: string;
  title: string;
  lede: string;
  answer?: string;
  jsonLd: JsonLd;
  children: ReactNode;
  hero?: keyof typeof HERO_IMAGES;
  ctaTitle?: string;
  ctaBody?: string;
}) {
  const image = HERO_IMAGES[hero];

  return (
    <MarketingChrome>
      <JsonLdScript data={jsonLd} />

      <section className="page-hero" aria-labelledby="page-hero-title">
        <div
          className="page-hero__media"
          style={{ backgroundImage: `url('${image}')` }}
          aria-hidden="true"
        />
        <div className="page-hero__veil" aria-hidden="true" />
        <div className="page-hero__inner">
          <Breadcrumb items={breadcrumb} />
          <p className="eyebrow">{eyebrow}</p>
          <h1 className="page-hero__title" id="page-hero-title">
            {title}
          </h1>
          <p className="page-hero__lede">{lede}</p>
          {answer ? <p className="page-hero__answer">{answer}</p> : null}
          <div className="page-hero__actions">
            <Link className="btn btn--solid" href="/book">
              Book an event
            </Link>
            <Link className="btn btn--ghost" href="/#pricing">
              View pricing
            </Link>
          </div>
        </div>
      </section>

      <div className="page-body">{children}</div>

      <section className="section contact" aria-labelledby="page-cta-title">
        <div
          className="contact__media"
          style={{ backgroundImage: "url('/images/model-1-web.jpg')" }}
          aria-hidden="true"
        />
        <div className="contact__veil" aria-hidden="true" />
        <div className="section__inner contact__inner">
          <p className="eyebrow">Let’s build your event</p>
          <h2 className="section__title" id="page-cta-title">
            {ctaTitle}
          </h2>
          <p className="section__lede">{ctaBody}</p>
          <div className="contact__links">
            <Link className="btn btn--solid" href="/book">
              Book an event
            </Link>
            <a className="btn btn--ghost" href="mailto:contact@ouismoke.co">
              Email Oui Smoke
            </a>
          </div>
          <p className="locale">Toronto · Available beyond the GTA</p>
        </div>
      </section>
    </MarketingChrome>
  );
}

export function FaqBlock({
  faqs,
}: {
  faqs: readonly { question: string; answer: string }[];
}) {
  return (
    <section className="section experience">
      <div className="section__inner">
        <p className="eyebrow">FAQ</p>
        <h2 className="section__title">Common questions</h2>
        <div className="page-faq" style={{ marginTop: "2rem" }}>
          {faqs.map((faq) => (
            <details key={faq.question}>
              <summary>{faq.question}</summary>
              <p>{faq.answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
