import { requireApiAdmin, requireApiSession } from "@/lib/auth/api";
import {
  getPricing,
  normalizePricing,
  pricingToPublic,
  updatePricing,
  type PricingConfig,
} from "@/lib/pricing";
import { NextResponse } from "next/server";

export async function GET() {
  const { error } = await requireApiSession();
  if (error) return error;
  const pricing = await getPricing();
  return NextResponse.json({ pricing: pricingToPublic(pricing) });
}

export async function PATCH(request: Request) {
  const { error } = await requireApiAdmin();
  if (error) return error;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const raw = (body.pricing ?? body) as Partial<PricingConfig>;
  const current = await getPricing();
  const next = normalizePricing({ ...current, ...raw });

  if (next.onsiteUnitRate <= 0 || next.onsiteUnlimitedRate <= 0) {
    return NextResponse.json(
      { error: "On-site rates must be greater than 0" },
      { status: 400 },
    );
  }
  if (next.minPackageDollars <= 0 || next.extraHourRate < 0) {
    return NextResponse.json(
      { error: "Package rates must be valid" },
      { status: 400 },
    );
  }
  if (next.hstRate < 0 || next.hstRate > 1) {
    return NextResponse.json(
      { error: "HST rate must be between 0 and 1" },
      { status: 400 },
    );
  }
  if (
    next.defaultCheckIntervalMinutes !== 0 &&
    (next.defaultCheckIntervalMinutes < 10 ||
      next.defaultCheckIntervalMinutes > 180)
  ) {
    return NextResponse.json(
      { error: "Check interval must be Off (0) or 10–180 minutes" },
      { status: 400 },
    );
  }

  const pricing = await updatePricing(next);
  return NextResponse.json({ pricing: pricingToPublic(pricing) });
}
