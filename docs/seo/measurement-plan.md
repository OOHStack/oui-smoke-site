# Measurement Plan

No ranking or LLM-citation guarantees. Measure leading indicators and conversions.

## Platforms

| Platform | Purpose |
|----------|---------|
| Google Search Console | Queries, pages, index coverage, CWV |
| Bing Webmaster Tools | Bing/Copilot discovery |
| GA4 (`G-45J86Y7468`) | Behaviour + conversions |
| Google Business Profile insights | Calls, direction requests, website clicks |
| Vercel Analytics | Performance / visits supplement |

## Implemented / recommended events

| Event | Status | Notes |
|-------|--------|-------|
| `generate_lead` | Implemented on `/book` success | Includes engagement, event_type, location |
| `quote_complete` | Implemented with lead | Alias for reporting clarity |
| `quote_start` | Recommended | Fire when booking form engagement selected |
| Calculator open/complete | Recommended | Homepage calculator interactions |
| Phone click | N/A until phone published | |
| Email click | Recommended | `contact@ouismoke.co` links |
| Social outbound | Recommended | Instagram / TikTok |
| Service page views | Auto page_view | Mark key landing pages in GA4 |
| Guide → book | Recommended | Once guides publish |

## Reporting views

1. Organic landing pages (service vs home vs book)  
2. Branded vs non-branded queries (GSC)  
3. Toronto vs surrounding-city queries (GSC query contains city)  
4. Leads by engagement type (package vs on_site)  
5. Leads by event type / location (GA4 params)  
6. LLM referral where detectable (`chatgpt.com`, `perplexity.ai`, etc.)  
7. Index coverage + sitemap status  
8. CWV for `/`, `/book`, `/hookah-catering-toronto`  

## Setup steps

### Search Console
1. Verify property for `https://ouismoke.co/` (DNS or HTML tag via `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION`)  
2. Submit `https://ouismoke.co/sitemap.xml`  
3. Inspect key URLs after deploy  

### Bing Webmaster
1. Import from GSC or verify via `NEXT_PUBLIC_BING_SITE_VERIFICATION`  
2. Submit sitemap  

### GA4
1. Confirm measurement ID in production  
2. Mark `generate_lead` as conversion  
3. Register custom dimensions for `engagement`, `event_type`, `location` if needed  

## Cadence

- Weekly: GSC coverage + booking conversions  
- Monthly: query groups, landing page CTR, GBP  
- Quarterly: content gap refresh from Search Console + competitor script  
