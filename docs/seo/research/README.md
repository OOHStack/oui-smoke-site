# Competitor research (internal)

Outputs in this folder are for internal SEO strategy only.  
**Do not** expose a public production route or dashboard for this data.

## Workflow

```bash
# Optional dry run
node scripts/seo/competitor-research.mjs --dry-run

# Fetch allowlisted public pages (respects robots.txt, rate limits, cache)
node scripts/seo/competitor-research.mjs --import docs/seo/research/manual-urls.txt
```

## Files

| File | Purpose |
|------|---------|
| `manual-urls.txt` | Admin URL import list |
| `competitor-inventory.csv` | Extracted public page signals |
| `competitor-fetch-log.json` | Retrieval log (URL + date + status) |
| `cache/` | Cached HTML payloads (gitignored recommended) |
| `competitor-gap-analysis.md` | Strategic gaps |
| `keyword-topic-map.csv` | Intent map |
| `content-opportunities.md` | Content opportunities |
| `local-entity-map.md` | Entity / geo map |

## Rules

- Public pages only; descriptive UA; timeouts; retries; allowlist/blocklist  
- Extract patterns and facts — never copy competitor prose into Oui Smoke pages  
- Clearly separate observed facts from recommendations  
