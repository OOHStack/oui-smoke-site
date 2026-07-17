import { getDb } from "@/lib/db";
import { paymentSettings } from "@/lib/db/schema";
import {
  clampDepositPercent,
  DEFAULT_DEPOSIT_PERCENT,
} from "@/lib/job-balance";
import { eq } from "drizzle-orm";

export type PaymentSettingsValues = {
  defaultDepositPercent: number;
  autoDepositOnBooking: boolean;
  autoDepositOnQuote: boolean;
  autoBalanceEnabled: boolean;
  autoBalanceDaysBefore: number;
  /** Overrides SQUARE_TERMINAL_DEVICE_ID when set (ops Settings → Square). */
  squareTerminalDeviceId: string | null;
};

export const FALLBACK_PAYMENT_SETTINGS: PaymentSettingsValues = {
  defaultDepositPercent: DEFAULT_DEPOSIT_PERCENT,
  autoDepositOnBooking: true,
  autoDepositOnQuote: true,
  autoBalanceEnabled: true,
  autoBalanceDaysBefore: 7,
  squareTerminalDeviceId: null,
};

function clampDays(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 7;
  return Math.min(60, Math.max(0, Math.round(n)));
}

function normalizeTerminalDeviceId(value: unknown): string | null {
  if (value == null) return null;
  const trimmed = String(value).trim();
  return trimmed ? trimmed.slice(0, 120) : null;
}

export async function getPaymentSettings(): Promise<PaymentSettingsValues> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(paymentSettings)
    .where(eq(paymentSettings.id, 1))
    .limit(1);

  if (!row) return { ...FALLBACK_PAYMENT_SETTINGS };

  return {
    defaultDepositPercent: clampDepositPercent(row.defaultDepositPercent),
    autoDepositOnBooking: Boolean(row.autoDepositOnBooking),
    autoDepositOnQuote: Boolean(row.autoDepositOnQuote),
    autoBalanceEnabled:
      row.autoBalanceEnabled == null
        ? true
        : Boolean(row.autoBalanceEnabled),
    autoBalanceDaysBefore: clampDays(
      row.autoBalanceDaysBefore ?? FALLBACK_PAYMENT_SETTINGS.autoBalanceDaysBefore,
    ),
    squareTerminalDeviceId: normalizeTerminalDeviceId(
      row.squareTerminalDeviceId,
    ),
  };
}

export async function updatePaymentSettings(
  patch: Partial<PaymentSettingsValues>,
): Promise<PaymentSettingsValues> {
  const db = getDb();
  const current = await getPaymentSettings();
  const next: PaymentSettingsValues = {
    defaultDepositPercent: clampDepositPercent(
      patch.defaultDepositPercent ?? current.defaultDepositPercent,
    ),
    autoDepositOnBooking:
      patch.autoDepositOnBooking ?? current.autoDepositOnBooking,
    autoDepositOnQuote: patch.autoDepositOnQuote ?? current.autoDepositOnQuote,
    autoBalanceEnabled: patch.autoBalanceEnabled ?? current.autoBalanceEnabled,
    autoBalanceDaysBefore: clampDays(
      patch.autoBalanceDaysBefore ?? current.autoBalanceDaysBefore,
    ),
    squareTerminalDeviceId:
      patch.squareTerminalDeviceId !== undefined
        ? normalizeTerminalDeviceId(patch.squareTerminalDeviceId)
        : current.squareTerminalDeviceId,
  };

  await db
    .insert(paymentSettings)
    .values({
      id: 1,
      defaultDepositPercent: next.defaultDepositPercent,
      autoDepositOnBooking: next.autoDepositOnBooking,
      autoDepositOnQuote: next.autoDepositOnQuote,
      autoBalanceEnabled: next.autoBalanceEnabled,
      autoBalanceDaysBefore: next.autoBalanceDaysBefore,
      squareTerminalDeviceId: next.squareTerminalDeviceId,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: paymentSettings.id,
      set: {
        defaultDepositPercent: next.defaultDepositPercent,
        autoDepositOnBooking: next.autoDepositOnBooking,
        autoDepositOnQuote: next.autoDepositOnQuote,
        autoBalanceEnabled: next.autoBalanceEnabled,
        autoBalanceDaysBefore: next.autoBalanceDaysBefore,
        squareTerminalDeviceId: next.squareTerminalDeviceId,
        updatedAt: new Date(),
      },
    });

  return next;
}

/** Client-facing timing copy from settings (e.g. “7 days before the event”). */
export function balanceTimingPhrase(
  days: number,
  enabled = true,
): string {
  if (!enabled) return "before the event";
  const n = clampDays(days);
  if (n === 0) return "on the day of the event";
  if (n === 1) return "1 day before the event";
  if (n === 7) return "about a week before the event";
  return `${n} days before the event`;
}

/** Public subset for marketing / booking copy — no ops toggles beyond what’s needed. */
export async function getPublicPaymentCopy() {
  const s = await getPaymentSettings();
  return {
    defaultDepositPercent: s.defaultDepositPercent,
    autoBalanceEnabled: s.autoBalanceEnabled,
    autoBalanceDaysBefore: s.autoBalanceDaysBefore,
    balanceTiming: balanceTimingPhrase(
      s.autoBalanceDaysBefore,
      s.autoBalanceEnabled,
    ),
  };
}
