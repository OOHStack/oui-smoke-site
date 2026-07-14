import type { Metadata } from "next";
import { getOpsNightOfPlaybook } from "@/lib/ops/night-of-playbook";
import { getPricing } from "@/lib/pricing";
import PlaybookDocument from "@/components/PlaybookDocument";

export const metadata: Metadata = {
  title: "Night-of playbook",
};

export default async function AdminPlaybookPage() {
  const pricing = await getPricing();
  const doc = getOpsNightOfPlaybook(pricing);
  return (
    <div className="admin-page">
      <PlaybookDocument
        title={doc.title}
        subtitle={doc.subtitle}
        sections={doc.sections}
        variant="ops"
      />
    </div>
  );
}
