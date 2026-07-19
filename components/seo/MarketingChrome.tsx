import Link from "next/link";
import type { ReactNode } from "react";

const NAV = [
  { href: "/hookah-catering-toronto", label: "Services" },
  { href: "/packages", label: "Packages" },
  { href: "/how-it-works", label: "How it works" },
  { href: "/service-areas", label: "Areas" },
  { href: "/faq", label: "FAQ" },
  { href: "/about", label: "About" },
] as const;

export function MarketingChrome({ children }: { children: ReactNode }) {
  return (
    <div className="page">
      <header className="topbar is-solid">
        <Link className="topbar__brand" href="/" aria-label="Oui Smoke home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo-white.png"
            alt="Oui Smoke"
            width={1355}
            height={364}
          />
        </Link>
        <nav className="topbar__nav" aria-label="Primary">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href}>
              {item.label}
            </Link>
          ))}
        </nav>
        <Link className="topbar__cta" href="/book">
          Book an event
        </Link>
      </header>

      <main>{children}</main>

      <footer className="footer">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-white.png" alt="" width={1355} height={364} />
        <p>Private &amp; corporate premium hookah catering</p>
        <p className="footer__note">
          Adult-oriented service. Guests must meet applicable legal age
          requirements in Ontario (19+).
        </p>
        <nav className="footer__legal" aria-label="Site">
          <Link href="/hookah-catering-toronto">Services</Link>
          <Link href="/services/wedding-hookah-catering">Weddings</Link>
          <Link href="/services/corporate-hookah-catering">Corporate</Link>
          <Link href="/service-areas">Areas</Link>
          <Link href="/guides">Guides</Link>
          <Link href="/book">Book</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/accessibility">Accessibility</Link>
        </nav>
      </footer>
    </div>
  );
}
