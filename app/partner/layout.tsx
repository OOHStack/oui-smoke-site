import type { Metadata } from "next";
import "./partner.css";

export const metadata: Metadata = {
  title: "Partners",
  description:
    "Oui Smoke hosted and guest-pay hookah catering for planners, hosts, and vendors across Toronto and the GTA.",
};

export default function PartnerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
