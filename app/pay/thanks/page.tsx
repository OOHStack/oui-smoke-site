import Link from "next/link";
import type { Metadata } from "next";
import "./thanks.css";

export const metadata: Metadata = {
  title: "Payment received",
  robots: { index: false, follow: false },
};

function money(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

export default async function PayThanksPage({
  searchParams,
}: {
  searchParams: Promise<{
    job?: string;
    refill?: string;
    token?: string;
    amount?: string;
    flavour?: string;
  }>;
}) {
  const params = await searchParams;
  const isRefill = params.refill === "1" || params.refill === "true";
  const amountCents = params.amount ? Number(params.amount) : NaN;
  const amountLabel =
    Number.isFinite(amountCents) && amountCents > 0 ? money(amountCents) : null;
  const flavour = params.flavour?.trim() || null;
  const serveHref =
    params.token && params.token.length >= 10
      ? `/serve/${encodeURIComponent(params.token)}`
      : null;

  if (isRefill) {
    return (
      <main className="pay-thanks">
        <div className="pay-thanks__panel">
          <p className="pay-thanks__brand">Oui Smoke</p>
          <p className="pay-thanks__badge">Payment received</p>
          <h1>Refill paid</h1>
          <p>
            {amountLabel ? (
              <>
                We received your <strong>{amountLabel}</strong> Square payment
                {flavour ? (
                  <>
                    {" "}
                    for <strong>{flavour}</strong>
                  </>
                ) : null}
                . Staff can see it’s paid and will bring your fresh head shortly.
              </>
            ) : (
              <>
                We received your Square refill payment. Staff can see it’s paid
                and will bring your fresh head shortly.
              </>
            )}
          </p>
          {serveHref ? (
            <Link href={serveHref} className="pay-thanks__link">
              Back to your hookah
            </Link>
          ) : (
            <p className="pay-thanks__hint">
              Return to the guest page you scanned — it will show Paid.
            </p>
          )}
        </div>
      </main>
    );
  }

  const jobHint = params.job ? ` for job #${params.job}` : "";

  return (
    <main className="pay-thanks">
      <div className="pay-thanks__panel">
        <p className="pay-thanks__brand">Oui Smoke</p>
        <p className="pay-thanks__badge">Payment received</p>
        <h1>Thank you</h1>
        <p>
          Your payment{jobHint} was submitted through Square. We’ll confirm your
          booking shortly — watch your email from the Oui team.
        </p>
        <Link href="/" className="pay-thanks__link">
          Back to Oui Smoke
        </Link>
      </div>
    </main>
  );
}
