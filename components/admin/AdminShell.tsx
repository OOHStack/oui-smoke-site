"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import clsx from "clsx";
import ServiceAlerts from "@/components/admin/ServiceAlerts";
import PushEnable from "@/components/admin/PushEnable";

const NAV = [
  { href: "/admin", label: "Dashboard", exact: true },
  { href: "/admin/jobs", label: "Jobs" },
  { href: "/admin/payments", label: "Payments" },
  { href: "/admin/live", label: "Live Floor" },
  { href: "/admin/prep", label: "Prep" },
  { href: "/admin/display", label: "Display" },
  { href: "/admin/fleet", label: "Fleet" },
  { href: "/admin/flavours", label: "Flavours" },
  { href: "/admin/playbook", label: "Playbook" },
  { href: "/admin/analytics", label: "Analytics" },
  { href: "/admin/settings", label: "Settings" },
];

export default function AdminShell({
  children,
  name,
  role,
}: {
  children: React.ReactNode;
  name?: string;
  role?: "admin" | "staff";
}) {
  const pathname = usePathname();
  const router = useRouter();
  const isLogin = pathname === "/admin/login";

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/admin/login");
    router.refresh();
  }

  if (isLogin) {
    return <>{children}</>;
  }

  return (
    <div className="admin-app">
      <header className="admin-header">
        <div className="admin-header-inner">
          <Link href="/admin" className="admin-logo" aria-label="Oui Smoke ops home">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className="admin-logo__img"
              src="/logo-white.png"
              alt="Oui Smoke"
              width={180}
              height={48}
            />
          </Link>

          <nav className="admin-nav" aria-label="Admin navigation">
            {NAV.map((item) => {
              const active = item.exact
                ? pathname === item.href
                : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={clsx("admin-nav-link", active && "active")}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="admin-header-actions">
            <ServiceAlerts />
            <PushEnable />
            {name ? (
              <Link
                href="/admin/settings"
                className={clsx(
                  "admin-user",
                  pathname.startsWith("/admin/settings") && "active",
                )}
                title="Account settings"
              >
                {name}
                {role ? ` · ${role}` : ""}
              </Link>
            ) : null}
            <button
              type="button"
              className="admin-nav-logout"
              onClick={handleLogout}
            >
              Logout
            </button>
          </div>
        </div>
      </header>
      <main className="admin-main">{children}</main>
      <footer className="admin-footer">
        <p className="admin-footer__text">Oui Smoke Ops · Toronto &amp; GTA</p>
      </footer>
    </div>
  );
}
