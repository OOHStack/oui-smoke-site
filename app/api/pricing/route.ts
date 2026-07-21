import {
  getPricing,
  pricingToPublic,
} from "@/lib/pricing";
import { listActivePartnerPromos } from "@/lib/promo-codes";
import { NextResponse } from "next/server";

/** Public catalog rates for book / partner estimate (no secrets). */
export async function GET() {
  const [pricing, partnerPromos] = await Promise.all([
    getPricing(),
    listActivePartnerPromos(),
  ]);
  return NextResponse.json({
    pricing: pricingToPublic(pricing),
    partnerPromos,
  });
}
