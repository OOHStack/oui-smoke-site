export type PaymentModel = "client_deposit" | "pay_at_event" | "complimentary";

export const PAYMENT_MODELS: Array<{
  value: PaymentModel;
  label: string;
  hint: string;
}> = [
  {
    value: "client_deposit",
    label: "Client deposit",
    hint: "Private / corporate bookings — Square deposit to confirm",
  },
  {
    value: "pay_at_event",
    label: "Pay at event",
    hint: "Guests pay on the floor (refills/terminal) — no client deposit",
  },
  {
    value: "complimentary",
    label: "Complimentary",
    hint: "House / partner / marketing — no client package charge",
  },
];

export function normalizePaymentModel(value: unknown): PaymentModel {
  if (value === "pay_at_event" || value === "complimentary" || value === "client_deposit") {
    return value;
  }
  return "client_deposit";
}

export function requiresClientDeposit(model: PaymentModel | string | null | undefined) {
  return normalizePaymentModel(model) === "client_deposit";
}

export function paymentModelLabel(model: PaymentModel | string | null | undefined) {
  const value = normalizePaymentModel(model);
  return PAYMENT_MODELS.find((m) => m.value === value)?.label ?? "Client deposit";
}
