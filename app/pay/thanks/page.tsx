import Link from "next/link";
import type { Metadata } from "next";
import "./thanks.css";

export const metadata: Metadata = {
  title: "Payment received",
  robots: { index: false, follow: false },
};

export default async function PayThanksPage({
  searchParams,
}: {
  searchParams: Promise<{ job?: string }>;
}) {
  const params = await searchParams;
  const jobHint = params.job ? ` for job #${params.job}` : "";

  return (
    <main className="pay-thanks">
      <div className="pay-thanks__panel">
        <p className="pay-thanks__brand">Oui Smoke</p>
        <h1>Thank you</h1>
        <p>
          Your payment{jobHint} was submitted through Square. We’ll confirm your
          booking shortly — watch your email or texts from the Oui team.
        </p>
        <Link href="/" className="pay-thanks__link">
          Back to Oui Smoke
        </Link>
      </div>
    </main>
  );
}
