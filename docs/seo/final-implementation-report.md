# Final Implementation Report — Oui Smoke SEO Program

**Date:** 2026-07-19  
**Site:** https://ouismoke.co/  
**Standard:** Premium event-company site — not an SEO content farm

---

## Audit findings (baseline)

See `docs/seo/current-site-audit.md`. Highlights:

- Hybrid Next.js + static `public/index.html` homepage  
- Strong brand visuals; weak commercial landing architecture  
- Production `/sitemap.xml` returned **500** at audit time  
- Duplicate `.html` URLs; mailto booking CTAs; no lead events  
- No service/event/location/FAQ/About marketing routes  

---

## Competitors researched

Fetched (ethical script, robots-aware, cached):

1. hayaticatering.ca  
2. shishachauffeurs.com  
3. fumeshisha.ca  
4. cloudsvapeandshisha.com/catering-services/  
5. classiccafe.ca/catering  

Outputs: `docs/seo/research/competitor-inventory.csv`, fetch log, gap analysis.

### Research limitations

- Allowlisted hosts only; rate-limited; 7-day cache  
- No private social data; no content reuse  
- Some sites return sparse HTML / JS shells (e.g. limited body extract)  
- Manual import supported via `manual-urls.txt`  

---

## Files changed / added (major)

### Technical SEO
- `app/robots.ts`, `app/sitemap.ts`, `app/layout.tsx`, `next.config.ts`  
- `public/llms.txt`  
- `public/index.html`, `public/site.css` (homepage clarity + footer/nav)  
- `lib/analytics.ts` + booking conversion events  
- `lib/seo/*`, `components/seo/*`, `app/marketing.css`  
- `.env.example` verification placeholders  

### Marketing routes (App Router)
- `/hookah-catering-toronto`  
- `/services/wedding-hookah-catering`  
- `/services/corporate-hookah-catering`  
- `/services/private-event-hookah-catering`  
- `/services/hookah-rentals`  
- `/service-areas`  
- `/how-it-works`  
- `/packages`  
- `/faq`  
- `/about`  
- `/guides`  

### Docs & research
- `docs/seo/*` plans, audit, keyword map, GBP, PR, measurement, owner checklist  
- `scripts/seo/competitor-research.mjs`, `scripts/seo/test-schema.mjs`  
- Draft guide template under `docs/seo/drafts/`  

---

## Routes added

All Priority 1–2 marketing URLs listed above (published, original copy, no doorway city pages).

## Routes revised

- `/` homepage metadata, H1, schema, FAQ/geo/booking sections, internal links, CTAs → `/book`  
- `/partner/playbook` → `noindex, nofollow` + self canonical  
- Root layout: removed inherited `canonical: "/"`, improved default meta, viewport themeColor  

## Redirects created

Permanent (via `next.config.ts`):

- `/index.html` → `/`  
- `/privacy.html` → `/privacy`  
- `/terms.html` → `/terms`  
- `/accessibility.html` → `/accessibility`  
- `/promo.html` → `/promo`  

Verified locally: `/privacy.html` → **308** `/privacy`.

## Structured data added

- Homepage: Organization, LocalBusiness, WebSite, Service, FAQPage  
- Service/marketing pages: Organization/WebSite/WebPage/Service/Breadcrumb/FAQ as eligible  
- Reusable builders in `lib/seo/schema.ts` with script-safe serialization test  

## Performance notes

- No intentional CWV regression to animations/calculator  
- Marketing pages reuse light brand CSS (no new heavy carousels)  
- Homepage still uses large JPG backgrounds + GSAP — future optimization opportunity (WebP/AVIF, image priority)  
- Production build succeeded; sitemap now generates **18** URLs locally  

## Content drafts created

- Guides hub roadmap (14 topics) live at `/guides` as draft listing  
- Full draft outline: `docs/seo/drafts/01-how-hookah-catering-works-toronto.md`  
- **No AI articles auto-published as indexable guide posts**

## Content requiring owner approval

See `docs/seo/owner-information-checklist.md`. Especially:

- Phone, hours, travel fees, testimonials, insurance, sanitation, equipment brands  
- Which cities deserve dedicated pages  
- Guide factual details (setup times, guest ratios)  

## Missing business details (intentionally unpublished)

Invented metrics, fake ratings, storefront address, and health claims were not added.

---

## Local QA (2026-07-19)

| Check | Result |
|-------|--------|
| `npm run build` | Pass |
| `npm run seo:test-schema` | Pass |
| `npm run seo:research` | 5 rows fetched |
| Sitemap | 200, 18 URLs |
| robots.txt | 200, disallows display/prep/playbook |
| llms.txt | 200 |
| New marketing pages | 200 + unique canonicals + H1s |
| `.html` redirect | 308 to clean URL |
| Partner playbook | noindex |
| Calculator/booking code paths | Untouched except GA lead event |

---

## Search Console setup steps

1. Add `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` (or DNS TXT)  
2. Verify `https://ouismoke.co/`  
3. Submit `https://ouismoke.co/sitemap.xml`  
4. Request indexing for `/`, `/hookah-catering-toronto`, wedding/corporate pages, `/book`  

## Bing setup steps

1. Add `NEXT_PUBLIC_BING_SITE_VERIFICATION` or import from GSC  
2. Submit sitemap  
3. Confirm Bing Places service-area listing  

## Google Business Profile steps

Follow `docs/seo/google-business-profile-plan.md` — service-area business, no fake storefront address, UTM’d booking URL.

---

## Recommended next 90 days

| Week | Focus |
|------|-------|
| 1–2 | Deploy; GSC/Bing verify; fix live sitemap 500 via deploy; GBP cleanup |
| 3–4 | Owner checklist answers; publish 2 approved guides; add testimonials if approved |
| 5–8 | Venue/planner outreach with deep links; photo caption pass; CWV image optimization |
| 9–12 | Review GSC queries; expand only city pages with unique logistics notes; refine FAQ from real inquiries |

## Recommended next 12 months (authority)

See `docs/seo/digital-pr-and-entity-plan.md` — partnerships, case studies, directories, ethical mentions. No link schemes.

---

## Maintainability

- Page registry: `lib/seo/pages.ts`  
- Shared schema/metadata helpers  
- Competitor research script (internal only)  
- Draft guides stay in `docs/seo/drafts/` until editorial approval  

**Reminder:** Rankings and AI citations cannot be guaranteed. This program improves crawlability, clarity, usefulness, and conversion pathways.
