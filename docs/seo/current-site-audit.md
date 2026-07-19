# Oui Smoke — Current Site SEO Audit

**Repo:** Oui Smoke Site  
**Audit date:** 2026-07-19  
**Live site:** https://ouismoke.co/  
**Stack:** Next.js 16 (`next@^16.2.10`) + static marketing HTML in `public/`

---

## Executive summary

The marketing homepage is **static HTML** (`public/index.html`), rewritten at `/` by `proxy.ts`. Booking and partner surfaces are **Next App Router**. Homepage meta, OG/Twitter, and JSON-LD were already present and crawlable. Main pre-work risks included: **duplicate `.html` vs clean URLs**, **root layout `canonical: "/"` inheritance on Next routes**, **no booking conversion events**, **thin NAP** (no phone), **no service/event landing pages**, **partner playbook indexable**, **`/display` and `/prep` missing from robots Disallow**, and **production `/sitemap.xml` returning HTTP 500** at audit time.

This audit documents the baseline. Implementation changes after this date are tracked in `final-implementation-report.md`.

---

## 1. Framework and rendering

| Surface | Mechanism | Crawlable HTML? |
|--------|-----------|-----------------|
| `/` | `proxy.ts` → `public/index.html` | Yes (static) |
| `/promo`, `/privacy`, `/terms`, `/accessibility` | Rewrites → `public/*.html` | Yes |
| `/book`, `/partner` | App Router | Yes (SSR shell) |
| `/admin/*`, token portals, `/demo/*` | App Router | Auth/token; noindex |

Homepage body copy, pricing, and CTAs are in HTML. GSAP animations, calculator totals, and platform tab switching are JS-enhanced; core narrative remains in the DOM.

---

## 2. URL structure (baseline)

**Indexable marketing/booking:** `/`, `/book`, `/partner`, `/promo`, `/privacy`, `/terms`, `/accessibility`

**Should stay noindex:** `/admin/*`, `/api/*`, `/demo/*`, `/client/*`, `/serve/*`, `/display/*`, `/prep/*`, `/pay/*`, `/partner/playbook`

**Duplicate URL risk:** `/privacy` vs `/privacy.html` (footer previously linked `.html`)

---

## 3. Metadata (baseline)

| URL | Title | Canonical |
|-----|-------|-----------|
| `/` | Oui Smoke — Premium Hookah Catering | `https://ouismoke.co/` |
| `/book` | Book an event · Oui Smoke | `/book` |
| `/partner` | Partner one-pager · Oui Smoke | `/partner` |
| Legal pages | Privacy / Terms / Accessibility | Clean paths |
| `/promo` | Promo Mode | `/promo` (no H1) |

Root `app/layout.tsx` previously set `alternates.canonical: "/"` for all Next pages lacking overrides.

---

## 4. Heading structure (homepage baseline)

- **H1:** “Not your average hookah catering” (brand in SVG, not H1)
- **H2s:** Experience, featured event, summer offer, pricing, add-ons, playlist, contact, modal titles
- **Issues:** H1 lacked Toronto/GTA; promo page lacked H1; modal headings less weighted

---

## 5. Crawlability risks

- Hero/lifestyle imagery via CSS `background-image` (weak image SEO)
- Calculator and platform explain copy partly duplicated in JS
- Book CTAs used `mailto:` until `booking.js` rewrote to `/book`
- Promo mode can redirect homepage via client JS
- Large JPG backgrounds + GSAP + Spotify iframe → CWV pressure

---

## 6. Structured data (baseline)

Present only on homepage `@graph`: Organization, LocalBusiness, WebSite (+ ReserveAction).

**Gaps:** no telephone/address (appropriate for service-area business if intentional), no Service/FAQPage/Offer, no JSON-LD on `/book` or service pages.

---

## 7. robots.txt and sitemap (baseline)

**robots.txt:** Disallow admin/serve/client/api/pay/demo. Missing `/display/`, `/prep/`, playbook.

**sitemap.ts:** `/`, `/book`, `/partner`, `/promo`, legal pages. `lastModified: new Date()` on every build. **Live `/sitemap.xml` returned 500 during audit** — treat as Priority 1 defect.

---

## 8. Internal linking (baseline)

Fragment-only primary nav. No homepage links to partner, how-it-works, or service landings. Footer used `./privacy.html` style paths.

---

## 9. Images

JPG/PNG/SVG; web-optimized `-web.jpg` variants exist. No AVIF/WebP in marketing HTML. OG image present (`/og-image.jpg`).

---

## 10. Analytics and forms

- GA4 `G-45J86Y7468` + Vercel Analytics
- Booking form fields: engagement, name, email, phone, eventType, date, startTime, hours, hookahs, location, guestCount, notes, promo, honeypot
- **No `generate_lead` events** on successful submit (baseline)

---

## 11. Geographic and service signals

Toronto / GTA / beyond GTA in meta, schema `areaServed`, locale line, pricing copy. Scarborough mentioned for a featured collab event. No dedicated city pages.

---

## 12. Trust signals

Privacy, Terms, Accessibility present. Legal name in schema. Social: Instagram + TikTok. **No testimonials, About page, or review schema** at baseline.

---

## 13. Indexability risks

1. `.html` duplicates  
2. Root canonical inheritance  
3. Partner playbook indexable without dedicated canonical  
4. Sitemap 500 in production  
5. www vs apex inconsistency in privacy copy  

---

## 14. Mobile / a11y / CWV

Responsive layout and reduced-motion handling exist. Risks: font + GSAP + media weight, decorative empty alts, calculator modal complexity.

---

## 15. LLM readability

Core narrative is in HTML (good). Interactive estimator/platform walkthrough are JS-heavy. No `llms.txt` at baseline.

---

## 16. Owner information gaps

See `docs/seo/owner-information-checklist.md`. Phone, hours, city-level coverage confirmation, testimonials, insurance language, and several operational claims remain unpublished pending approval.

---

## Priority recommendations (from audit)

1. Fix sitemap generation / production 500  
2. Clean URL redirects + footer links  
3. Service/event landing pages with unique crawlable copy  
4. Homepage clarity sections (geo, booking steps, FAQ)  
5. Structured data expansion matching visible content  
6. Conversion events on booking success  
7. robots Disallow for display/prep/playbook  
8. `llms.txt` + answer-engine-friendly definitions  
