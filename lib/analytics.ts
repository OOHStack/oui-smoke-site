/** Lightweight GA4 event helpers (no-ops when gtag is unavailable). */

type GtagFn = (...args: unknown[]) => void;

function gtag(): GtagFn | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & { gtag?: GtagFn };
  return typeof w.gtag === "function" ? w.gtag : null;
}

export function trackEvent(
  name: string,
  params?: Record<string, string | number | boolean | undefined>,
) {
  const fn = gtag();
  if (!fn) return;
  fn("event", name, params ?? {});
}

export function trackGenerateLead(opts: {
  engagement: string;
  eventType?: string;
  location?: string;
}) {
  trackEvent("generate_lead", {
    engagement: opts.engagement,
    event_type: opts.eventType || undefined,
    location: opts.location || undefined,
  });
  trackEvent("quote_complete", {
    engagement: opts.engagement,
  });
}
