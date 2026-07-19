import type { Metadata } from "next";
import Link from "next/link";
import { getPartnerNightOfPlaybook } from "@/lib/ops/partner-night-of-playbook";
import { getPricing } from "@/lib/pricing";
import PlaybookDocument from "@/components/PlaybookDocument";

export const metadata: Metadata = {
  title: "Event day · Oui Smoke",
  description:
    "What hosts and partners should expect at Oui Smoke on-site sales events.",
  robots: { index: false, follow: false },
  alternates: { canonical: "/partner/playbook" },
};

export default async function PartnerPlaybookPage() {
  const pricing = await getPricing();
  const doc = getPartnerNightOfPlaybook(pricing);
  return (
    <div className="partner-playbook-page">
      <p className="partner-playbook-page__back no-print">
        <Link href="/partner?mode=on_site">← Partner rates</Link>
      </p>
      <PlaybookDocument
        title={doc.title}
        subtitle={doc.subtitle}
        sections={doc.sections}
        variant="partner"
      />
    </div>
  );
}
