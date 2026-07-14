import { requireApiAdmin, requireApiSession } from "@/lib/auth/api";
import {
  getPaymentSettings,
  updatePaymentSettings,
} from "@/lib/payment-settings";
import { NextResponse } from "next/server";

export async function GET() {
  const { error } = await requireApiSession();
  if (error) return error;
  const settings = await getPaymentSettings();
  return NextResponse.json({ settings });
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

  const patch: {
    defaultDepositPercent?: number;
    autoDepositOnBooking?: boolean;
    autoDepositOnQuote?: boolean;
    autoBalanceEnabled?: boolean;
    autoBalanceDaysBefore?: number;
  } = {};

  if (body.defaultDepositPercent !== undefined) {
    patch.defaultDepositPercent = Number(body.defaultDepositPercent);
  }
  if (body.autoDepositOnBooking !== undefined) {
    patch.autoDepositOnBooking = Boolean(body.autoDepositOnBooking);
  }
  if (body.autoDepositOnQuote !== undefined) {
    patch.autoDepositOnQuote = Boolean(body.autoDepositOnQuote);
  }
  if (body.autoBalanceEnabled !== undefined) {
    patch.autoBalanceEnabled = Boolean(body.autoBalanceEnabled);
  }
  if (body.autoBalanceDaysBefore !== undefined) {
    patch.autoBalanceDaysBefore = Number(body.autoBalanceDaysBefore);
  }

  const settings = await updatePaymentSettings(patch);
  return NextResponse.json({ settings });
}
