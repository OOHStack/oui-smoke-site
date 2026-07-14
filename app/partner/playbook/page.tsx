import type { Metadata } from "next";
import Link from "next/link";
import { getPartnerNightOfPlaybook } from "@/lib/ops/partner-night-of-playbook";
import PlaybookDocument from "@/components/PlaybookDocument";

export const metadata: Metadata = {
  title: "Night-of · Oui Smoke",
  description:
    "What hosts and partners should expect on Oui Smoke on-site sales nights.",
};

export default function PartnerPlaybookPage() {
  const doc = getPartnerNightOfPlaybook();
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
