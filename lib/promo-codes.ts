import { getDb } from "@/lib/db";
import { promoCodes } from "@/lib/db/schema";
import type { PricingConfig } from "@/lib/pricing-config";
import { asc, eq } from "drizzle-orm";

export type ResolvedPromo = {
  code: string;
  discountDollars: number;
  label: string;
};

export type PartnerPromo = {
  code: string;
  discountDollars: number;
  label: string;
};

type PromoPricing = Pick<
  PricingConfig,
  "guestRebookCode" | "guestRebookDiscountDollars" | "guestRebookLabel"
>;

export function normalizePromoCode(raw: string | null | undefined): string {
  return (raw || "").trim().toUpperCase();
}

/** Resolve against guest-rebook settings + an optional partner list (from DB / pricing API). */
export function resolvePromoCode(
  raw: string | null | undefined,
  pricing: PromoPricing,
  partners: PartnerPromo[] = [],
): ResolvedPromo | null {
  const code = normalizePromoCode(raw);
  if (!code) return null;

  const guestCode = normalizePromoCode(pricing.guestRebookCode);
  if (guestCode && code === guestCode) {
    return {
      code: guestCode,
      discountDollars: pricing.guestRebookDiscountDollars,
      label: pricing.guestRebookLabel,
    };
  }

  const partner = partners.find((p) => normalizePromoCode(p.code) === code);
  if (partner) {
    return {
      code,
      discountDollars: Math.max(0, Number(partner.discountDollars) || 0),
      label: partner.label || `${code} discount`,
    };
  }

  return null;
}

/** Active partner promos for booking estimate / public pricing. */
export async function listActivePartnerPromos(): Promise<PartnerPromo[]> {
  try {
    const db = getDb();
    const rows = await db
      .select({
        code: promoCodes.code,
        discountDollars: promoCodes.discountDollars,
        label: promoCodes.label,
      })
      .from(promoCodes)
      .where(eq(promoCodes.active, true))
      .orderBy(asc(promoCodes.code));
    return rows.map((r) => ({
      code: normalizePromoCode(r.code),
      discountDollars: Math.max(0, r.discountDollars),
      label: r.label || "",
    }));
  } catch {
    return [];
  }
}

/** Server-side resolve using live DB partner codes. */
export async function resolvePromoCodeLive(
  raw: string | null | undefined,
  pricing: PromoPricing,
): Promise<ResolvedPromo | null> {
  const partners = await listActivePartnerPromos();
  return resolvePromoCode(raw, pricing, partners);
}

/** Validate + normalize a code string for create/update. */
export function parsePromoCodeInput(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const code = normalizePromoCode(raw);
  if (!code || code.length > 32) return null;
  if (!/^[A-Z0-9_-]+$/.test(code)) return null;
  return code;
}
