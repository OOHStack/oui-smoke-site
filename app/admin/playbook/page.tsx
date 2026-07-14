import type { Metadata } from "next";
import { getOpsNightOfPlaybook } from "@/lib/ops/night-of-playbook";
import PlaybookDocument from "@/components/PlaybookDocument";

export const metadata: Metadata = {
  title: "Night-of playbook",
};

export default function AdminPlaybookPage() {
  const doc = getOpsNightOfPlaybook();
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
