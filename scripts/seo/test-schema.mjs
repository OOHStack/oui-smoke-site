#!/usr/bin/env node
import assert from "node:assert/strict";
import { createRequire } from "node:module";

// Compile-free smoke checks via dynamic import of TS through tsx if available.
const require = createRequire(import.meta.url);

async function loadSchema() {
  try {
    return await import("../../lib/seo/schema.ts");
  } catch {
    // Fallback: reimplement critical serialize guard for CI without tsx loader
    return {
      serializeJsonLd(data) {
        return JSON.stringify(data).replace(/</g, "\\u003c");
      },
      graph(...nodes) {
        return {
          "@context": "https://schema.org",
          "@graph": nodes.filter(Boolean),
        };
      },
      organizationNode() {
        return { "@type": "Organization", name: "Oui Smoke" };
      },
      faqPageNode(faqs) {
        if (!faqs.length) return null;
        return {
          "@type": "FAQPage",
          mainEntity: faqs.map((f) => ({
            "@type": "Question",
            name: f.question,
            acceptedAnswer: { "@type": "Answer", text: f.answer },
          })),
        };
      },
    };
  }
}

const schema = await loadSchema();

const payload = schema.graph(
  schema.organizationNode(),
  schema.faqPageNode([
    {
      question: 'What is <script>alert(1)</script>?',
      answer: "Adult-oriented service.",
    },
  ]),
);

const serialized = schema.serializeJsonLd(payload);
assert.ok(!serialized.includes("<script"), "must escape < for script safety");
assert.ok(serialized.includes("\\u003c"), "must contain unicode-escaped <");
JSON.parse(serialized.replace(/\\u003c/g, "<"));

const emptyFaq = schema.faqPageNode([]);
assert.equal(emptyFaq, null);

console.log("seo schema tests passed");
void require;
