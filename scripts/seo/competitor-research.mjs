#!/usr/bin/env node
/**
 * Ethical competitor research helper for Oui Smoke SEO.
 *
 * Rules:
 * - Public pages only
 * - Respect robots.txt Disallow
 * - Rate-limited, cached, descriptive UA
 * - No content copying into production pages
 * - Manual URL import supported
 *
 * Usage:
 *   node scripts/seo/competitor-research.mjs
 *   node scripts/seo/competitor-research.mjs --import docs/seo/research/manual-urls.txt
 *   node scripts/seo/competitor-research.mjs --dry-run
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const OUT_DIR = path.join(ROOT, "docs/seo/research");
const CACHE_DIR = path.join(OUT_DIR, "cache");
const USER_AGENT =
  "OuiSmokeSeoResearch/1.0 (+https://ouismoke.co/; research@ouismoke.co)";
const REQUEST_GAP_MS = 2500;
const TIMEOUT_MS = 15000;
const MAX_RETRIES = 1;

const SEED_URLS = [
  "https://hayaticatering.ca/",
  "https://shishachauffeurs.com/",
  "https://fumeshisha.ca/",
  "https://cloudsvapeandshisha.com/catering-services/",
  "https://classiccafe.ca/catering",
];

const BLOCKLIST = [
  /facebook\.com/i,
  /instagram\.com/i,
  /tiktok\.com/i,
  /linkedin\.com\/in\//i,
  /login/i,
  /cart/i,
  /checkout/i,
];

const ALLOWLIST_HOSTS = [
  "hayaticatering.ca",
  "www.hayaticatering.ca",
  "shishachauffeurs.com",
  "www.shishachauffeurs.com",
  "fumeshisha.ca",
  "www.fumeshisha.ca",
  "cloudsvapeandshisha.com",
  "www.cloudsvapeandshisha.com",
  "classiccafe.ca",
  "www.classiccafe.ca",
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function csvEscape(value) {
  const s = String(value ?? "");
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

async function ensureDirs() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  await fs.mkdir(CACHE_DIR, { recursive: true });
}

function hostAllowed(url) {
  try {
    const host = new URL(url).hostname;
    return ALLOWLIST_HOSTS.includes(host);
  } catch {
    return false;
  }
}

function isBlocked(url) {
  return BLOCKLIST.some((re) => re.test(url));
}

async function readManualImport(filePath) {
  if (!filePath) return [];
  const abs = path.isAbsolute(filePath)
    ? filePath
    : path.join(ROOT, filePath);
  const raw = await fs.readFile(abs, "utf8");
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
}

async function fetchText(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
      },
      signal: controller.signal,
      redirect: "follow",
    });
    const text = await res.text();
    return { ok: res.ok, status: res.status, text, finalUrl: res.url };
  } finally {
    clearTimeout(timer);
  }
}

async function robotsAllows(origin, pathname) {
  try {
    const robotsUrl = new URL("/robots.txt", origin).toString();
    const { ok, text } = await fetchText(robotsUrl);
    if (!ok) return true; // fail open for missing robots, still rate-limit
    const lines = text.split(/\r?\n/);
    let inStar = false;
    const disallows = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const [key, ...rest] = trimmed.split(":");
      const value = rest.join(":").trim();
      if (/^user-agent$/i.test(key)) {
        inStar = value === "*";
      } else if (inStar && /^disallow$/i.test(key)) {
        if (value) disallows.push(value);
      }
    }
    return !disallows.some(
      (rule) => rule === "/" || pathname.startsWith(rule),
    );
  } catch {
    return false;
  }
}

function extractBetween(html, re) {
  const m = html.match(re);
  return m ? m[1].replace(/\s+/g, " ").trim() : "";
}

function extractAll(html, re) {
  const out = [];
  let m;
  const flags = re.flags.includes("g") ? re.flags : `${re.flags}g`;
  const global = new RegExp(re.source, flags);
  while ((m = global.exec(html))) {
    out.push(m[1].replace(/\s+/g, " ").trim());
  }
  return out;
}

function stripTags(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function analyzeHtml(url, html, retrievedAt) {
  const title = extractBetween(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
  const metaDescription = extractBetween(
    html,
    /<meta[^>]+name=["']description["'][^>]+content=["']([\s\S]*?)["']/i,
  ) || extractBetween(
    html,
    /<meta[^>]+content=["']([\s\S]*?)["'][^>]+name=["']description["']/i,
  );
  const h1 = extractAll(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i).map(stripTags);
  const h2 = extractAll(html, /<h2[^>]*>([\s\S]*?)<\/h2>/i)
    .map(stripTags)
    .slice(0, 20);
  const h3 = extractAll(html, /<h3[^>]*>([\s\S]*?)<\/h3>/i)
    .map(stripTags)
    .slice(0, 20);
  const bodyText = stripTags(html);
  const wordCount = bodyText ? bodyText.split(/\s+/).length : 0;
  const hasFaq = /faq|frequently asked/i.test(bodyText);
  const hasPricing = /\$\s?\d|pricing|packages?/i.test(bodyText);
  const schemaTypes = [
    ...new Set(
      (html.match(/"@type"\s*:\s*"([^"]+)"/g) || []).map((s) =>
        s.replace(/"@type"\s*:\s*"/, "").replace(/"$/, ""),
      ),
    ),
  ];
  const cities = [
    "Toronto",
    "Mississauga",
    "Brampton",
    "Vaughan",
    "Markham",
    "Richmond Hill",
    "Pickering",
    "Ajax",
    "Whitby",
    "Oshawa",
    "GTA",
  ].filter((c) => new RegExp(`\\b${c}\\b`, "i").test(bodyText));

  return {
    domain: new URL(url).hostname,
    pageUrl: url,
    pageType: "unknown",
    title,
    metaDescription,
    h1: h1.join(" | "),
    h2: h2.join(" | "),
    h3: h3.join(" | "),
    approxWordCount: wordCount,
    citiesMentioned: cities.join("; "),
    pricingPresentation: hasPricing ? "mentions pricing/packages" : "",
    hasFaq: hasFaq ? "yes" : "no",
    schemaTypes: schemaTypes.join("; "),
    retrievedAt,
    excerpt: bodyText.slice(0, 280),
  };
}

async function cachedFetch(url, dryRun) {
  const key = Buffer.from(url).toString("base64url");
  const cachePath = path.join(CACHE_DIR, `${key}.json`);
  try {
    const cached = JSON.parse(await fs.readFile(cachePath, "utf8"));
    const ageMs = Date.now() - Date.parse(cached.retrievedAt);
    if (ageMs < 1000 * 60 * 60 * 24 * 7) {
      return { ...cached, fromCache: true };
    }
  } catch {
    // no cache
  }

  if (dryRun) {
    return {
      url,
      ok: false,
      status: 0,
      html: "",
      retrievedAt: new Date().toISOString(),
      skipped: "dry-run",
      fromCache: false,
    };
  }

  let lastErr;
  for (let i = 0; i <= MAX_RETRIES; i++) {
    try {
      const result = await fetchText(url);
      const payload = {
        url,
        finalUrl: result.finalUrl,
        ok: result.ok,
        status: result.status,
        html: result.ok ? result.text : "",
        retrievedAt: new Date().toISOString(),
      };
      await fs.writeFile(cachePath, JSON.stringify(payload, null, 2));
      return { ...payload, fromCache: false };
    } catch (err) {
      lastErr = err;
      await sleep(1000);
    }
  }
  return {
    url,
    ok: false,
    status: 0,
    html: "",
    retrievedAt: new Date().toISOString(),
    error: String(lastErr),
    fromCache: false,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const importIdx = args.indexOf("--import");
  const importPath = importIdx >= 0 ? args[importIdx + 1] : null;

  await ensureDirs();
  const manual = await readManualImport(importPath);
  const urls = [...new Set([...SEED_URLS, ...manual])].filter(
    (url) => hostAllowed(url) && !isBlocked(url),
  );

  const rows = [];
  const log = [];

  for (const url of urls) {
    const parsed = new URL(url);
    const allowed = await robotsAllows(parsed.origin, parsed.pathname);
    if (!allowed) {
      log.push({ url, status: "blocked-by-robots", at: new Date().toISOString() });
      await sleep(REQUEST_GAP_MS);
      continue;
    }

    const fetched = await cachedFetch(url, dryRun);
    log.push({
      url,
      status: fetched.status,
      ok: fetched.ok,
      fromCache: fetched.fromCache,
      skipped: fetched.skipped || null,
      error: fetched.error || null,
      at: fetched.retrievedAt,
    });

    if (fetched.ok && fetched.html) {
      rows.push(analyzeHtml(fetched.finalUrl || url, fetched.html, fetched.retrievedAt));
    }

    if (!fetched.fromCache) await sleep(REQUEST_GAP_MS);
  }

  const headers = [
    "domain",
    "pageUrl",
    "pageType",
    "title",
    "metaDescription",
    "h1",
    "h2",
    "h3",
    "approxWordCount",
    "citiesMentioned",
    "pricingPresentation",
    "hasFaq",
    "schemaTypes",
    "retrievedAt",
    "excerpt",
  ];

  const csv = [
    headers.join(","),
    ...rows.map((row) => headers.map((h) => csvEscape(row[h])).join(",")),
  ].join("\n");

  await fs.writeFile(path.join(OUT_DIR, "competitor-inventory.csv"), csv);
  await fs.writeFile(
    path.join(OUT_DIR, "competitor-fetch-log.json"),
    JSON.stringify({ userAgent: USER_AGENT, log }, null, 2),
  );

  console.log(
    `Wrote ${rows.length} competitor rows to docs/seo/research/competitor-inventory.csv`,
  );
  console.log(`Log: docs/seo/research/competitor-fetch-log.json`);
  if (dryRun) console.log("Dry run only — no live fetches.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
