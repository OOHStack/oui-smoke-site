"use client";

import { OpenCheckoutActions } from "@/components/admin/OpenCheckoutActions";

export type CollectChannel = "cash" | "terminal" | "already_paid";

/** Cash / Terminal / Already-paid + optional open pay link / push-only. */
export function RefillCollectActions({
  priceCents,
  paymentStatus,
  payPreference,
  checkoutUrl,
  terminalReady = true,
  busy,
  onDeliver,
  onPushTerminal,
  deliverLabel,
}: {
  priceCents?: number | null;
  paymentStatus?: string | null;
  payPreference?: string | null;
  checkoutUrl?: string | null;
  terminalReady?: boolean;
  busy?: boolean;
  onDeliver: (channel?: CollectChannel) => void | Promise<void>;
  onPushTerminal?: () => void | Promise<void>;
  deliverLabel?: string;
}) {
  const price = priceCents ?? 0;
  const paid = paymentStatus === "succeeded";
  const needsCollect = price > 0 && !paid;

  if (!needsCollect) {
    return (
      <button
        type="button"
        className="btn btn-sm btn-ok"
        disabled={busy}
        onClick={() => void onDeliver()}
      >
        {deliverLabel ?? "Deliver refill"}
      </button>
    );
  }

  return (
    <div className="refill-collect">
      {checkoutUrl ? <OpenCheckoutActions url={checkoutUrl} /> : null}
      {payPreference === "terminal" && onPushTerminal ? (
        <button
          type="button"
          className="btn btn-sm btn-primary"
          disabled={busy || !terminalReady}
          title={
            terminalReady
              ? undefined
              : "Pair a Square Terminal in Settings → Square"
          }
          onClick={() => void onPushTerminal()}
        >
          Push to terminal
        </button>
      ) : null}
      <div className="refill-collect__channels">
        <button
          type="button"
          className="btn btn-sm"
          disabled={busy}
          onClick={() => void onDeliver("cash")}
        >
          Cash · deliver
        </button>
        <button
          type="button"
          className="btn btn-sm btn-ok"
          disabled={busy || !terminalReady}
          title={
            terminalReady
              ? undefined
              : "Pair a Square Terminal in Settings → Square"
          }
          onClick={() => void onDeliver("terminal")}
        >
          Terminal · deliver
        </button>
        <button
          type="button"
          className="btn btn-sm btn-ghost"
          disabled={busy}
          onClick={() => void onDeliver("already_paid")}
          title="Only works once Square shows paid"
        >
          Already paid
        </button>
      </div>
    </div>
  );
}
