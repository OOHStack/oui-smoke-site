import type { Metadata } from "next";
import { getSession } from "@/lib/auth/session";
import AdminShell from "@/components/admin/AdminShell";
import "./admin.css";

export const metadata: Metadata = {
  title: {
    default: "Ops",
    template: "%s · Oui Smoke",
  },
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
    },
  },
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();

  if (!session) {
    return <>{children}</>;
  }

  return (
    <AdminShell name={session.name} role={session.role}>
      {children}
    </AdminShell>
  );
}
