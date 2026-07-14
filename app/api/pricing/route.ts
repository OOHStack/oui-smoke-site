import {
  getPricing,
  pricingToPublic,
} from "@/lib/pricing";
import { NextResponse } from "next/server";

/** Public catalog rates for book / partner estimate (no secrets). */
export async function GET() {
  const pricing = await getPricing();
  return NextResponse.json({ pricing: pricingToPublic(pricing) });
}
