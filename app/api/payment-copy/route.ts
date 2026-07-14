import { getPublicPaymentCopy } from "@/lib/payment-settings";
import { NextResponse } from "next/server";

/** Public booking/marketing copy driven by Payments settings. */
export async function GET() {
  const copy = await getPublicPaymentCopy();
  return NextResponse.json(copy, {
    headers: {
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
    },
  });
}
