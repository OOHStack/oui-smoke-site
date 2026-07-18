"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  PasswordField,
  PasswordInput,
} from "@/components/admin/PasswordField";
import { CONTACT_EMAIL } from "@/lib/brand-contact";
import { DEPOSIT_PERCENT_PRESETS } from "@/lib/job-balance";
import {
  estimateBooking,
  formatCad,
  normalizePricing,
  type PricingConfig,
} from "@/lib/pricing";

type TabId = "account" | "rates" | "payments" | "display" | "square" | "team";

type DisplayWorkflowSettings = {
  qrTrigger: "on_paid" | "on_send_out";
  qrDurationSeconds: number;
};

type SessionInfo = {
  name: string;
  role: "admin" | "staff";
  username: string | null;
  userId: number | null;
};

type OpsUserRow = {
  id: number;
  username: string;
  displayName: string;
  role: "admin" | "staff";
  active: boolean;
  createdAt: string;
};

type PaymentSettings = {
  defaultDepositPercent: number;
  autoDepositOnBooking: boolean;
  autoDepositOnQuote: boolean;
  autoBalanceEnabled: boolean;
  autoBalanceDaysBefore: number;
  squareTerminalDeviceId?: string | null;
};

type SquareStatus = {
  checkedAt: string;
  configured: boolean;
  readyForLinks: boolean;
  readyForTerminal: boolean;
  environment: "production" | "sandbox";
  accessToken: { present: boolean; masked: string | null };
  webhook: {
    signatureConfigured: boolean;
    skipVerify: boolean;
    notificationUrl: string;
  };
  location: {
    configuredId: string | null;
    live: {
      id: string;
      name: string | null;
      status: string | null;
      currency: string | null;
      businessName: string | null;
      country: string | null;
      type: string | null;
    } | null;
    error: string | null;
  };
  terminal: {
    envDeviceId: string | null;
    dbDeviceId: string | null;
    activeDeviceId: string | null;
    activeSource: "database" | "env" | null;
    probe: { ok: boolean; detail: string } | null;
  };
  devices: Array<{
    id: string;
    status: string | null;
    name: string | null;
    deviceType: string | null;
  }>;
  deviceCodes: Array<{
    id: string;
    name: string | null;
    code: string | null;
    status: string | null;
    deviceId: string | null;
    locationId: string | null;
    productType: string | null;
    pairBy: string | null;
    createdAt: string | null;
  }>;
  apiError: string | null;
};

const TABS: { id: TabId; label: string; adminOnly?: boolean }[] = [
  { id: "account", label: "Account" },
  { id: "rates", label: "Rates", adminOnly: true },
  { id: "payments", label: "Payments", adminOnly: true },
  { id: "display", label: "Display", adminOnly: true },
  { id: "square", label: "Square", adminOnly: true },
  { id: "team", label: "Team", adminOnly: true },
];

const QR_DURATION_PRESETS = [30, 60, 90, 120, 180] as const;

const PREVIEW_UNITS = [4, 6, 10] as const;

function timingPhrase(days: number, enabled: boolean) {
  if (!enabled) return "before the event";
  if (days === 0) return "on the day of the event";
  if (days === 1) return "1 day before the event";
  if (days === 7) return "about a week before the event";
  return `${days} days before the event`;
}

/** Remove public-only fields from site-settings API before storing as PricingConfig. */
function stripPublicExtras(raw: Record<string, unknown>): PricingConfig {
  const { refillPriceDollars, guestRebookPromo, ...rest } = raw;
  const promo =
    guestRebookPromo &&
    typeof guestRebookPromo === "object" &&
    guestRebookPromo !== null
      ? (guestRebookPromo as {
          code?: string;
          discountDollars?: number;
          label?: string;
        })
      : undefined;

  return normalizePricing({
    ...rest,
    ...(typeof refillPriceDollars === "number" && rest.refillPriceCents == null
      ? { refillPriceCents: Math.round(refillPriceDollars * 100) }
      : {}),
    ...(promo
      ? {
          guestRebookCode: promo.code,
          guestRebookDiscountDollars: promo.discountDollars,
          guestRebookLabel: promo.label,
        }
      : {}),
  });
}

function parseTab(value: string | null, isAdmin: boolean): TabId {
  if (
    value === "rates" ||
    value === "payments" ||
    value === "display" ||
    value === "square" ||
    value === "team"
  ) {
    return isAdmin ? value : "account";
  }
  return "account";
}

export default function SettingsHub() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [session, setSession] = useState<SessionInfo | null>(null);
  const [users, setUsers] = useState<OpsUserRow[]>([]);
  const [pricing, setPricing] = useState<PricingConfig | null>(null);
  const [pricingDraft, setPricingDraft] = useState<PricingConfig | null>(null);
  const [paymentSettings, setPaymentSettings] = useState<PaymentSettings | null>(
    null,
  );
  const [paymentDraft, setPaymentDraft] = useState<PaymentSettings | null>(null);
  const [displaySettings, setDisplaySettings] =
    useState<DisplayWorkflowSettings | null>(null);
  const [displayDraft, setDisplayDraft] =
    useState<DisplayWorkflowSettings | null>(null);
  const [squareStatus, setSquareStatus] = useState<SquareStatus | null>(null);
  const [squareBusy, setSquareBusy] = useState(false);
  const [deviceIdDraft, setDeviceIdDraft] = useState("");
  const [activePairCode, setActivePairCode] = useState<{
    id: string;
    code: string;
    pairBy: string | null;
  } | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [okMsg, setOkMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const [profile, setProfile] = useState({
    displayName: "",
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  const [newUser, setNewUser] = useState({
    username: "",
    displayName: "",
    password: "",
    role: "staff" as "admin" | "staff",
  });

  const [resetId, setResetId] = useState<number | null>(null);
  const [resetPassword, setResetPassword] = useState("");

  const isAdmin = session?.role === "admin";
  const tab = parseTab(searchParams.get("tab"), isAdmin);

  const setTab = useCallback(
    (next: TabId) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next === "account") {
        params.delete("tab");
      } else {
        params.set("tab", next);
      }
      const qs = params.toString();
      router.replace(qs ? `/admin/settings?${qs}` : "/admin/settings", {
        scroll: false,
      });
    },
    [router, searchParams],
  );

  const loadSession = useCallback(async () => {
    const res = await fetch("/api/auth/session");
    if (!res.ok) {
      router.replace("/admin/login");
      return null;
    }
    const data = await res.json();
    const info: SessionInfo = {
      name: data.name,
      role: data.role,
      username: data.username ?? null,
      userId: data.userId ?? null,
    };
    setSession(info);
    setProfile((p) => ({ ...p, displayName: data.name ?? "" }));
    return info;
  }, [router]);

  const loadTeam = useCallback(async () => {
    const res = await fetch("/api/ops-users");
    if (res.status === 403) {
      setUsers([]);
      return;
    }
    if (!res.ok) {
      setError("Failed to load team accounts");
      return;
    }
    const data = await res.json();
    setUsers(data.users ?? []);
  }, []);

  const loadRates = useCallback(async () => {
    const res = await fetch("/api/site-settings");
    if (!res.ok) {
      setError("Failed to load rates");
      return;
    }
    const data = await res.json();
    const normalized = stripPublicExtras(
      (data.pricing ?? {}) as Record<string, unknown>,
    );
    setPricing(normalized);
    setPricingDraft(normalized);
  }, []);

  const loadPayments = useCallback(async () => {
    const res = await fetch("/api/payment-settings");
    if (!res.ok) {
      setError("Failed to load payment defaults");
      return;
    }
    const data = await res.json();
    setPaymentSettings(data.settings);
    setPaymentDraft(data.settings);
  }, []);

  const loadDisplay = useCallback(async () => {
    const res = await fetch("/api/display-settings");
    if (!res.ok) {
      setError("Failed to load display workflow settings");
      return;
    }
    const data = await res.json();
    setDisplaySettings(data.settings);
    setDisplayDraft(data.settings);
  }, []);

  const loadSquare = useCallback(async (probe = false) => {
    const res = await fetch(
      `/api/square/status${probe ? "?probe=1" : ""}`,
    );
    if (res.status === 403) {
      setSquareStatus(null);
      return;
    }
    if (!res.ok) {
      setError("Failed to load Square status");
      return;
    }
    const data = await res.json();
    const status = data.status as SquareStatus;
    setSquareStatus(status);
    setDeviceIdDraft(status.terminal.activeDeviceId ?? "");
  }, []);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      const info = await loadSession();
      if (info?.role === "admin") {
        await Promise.all([
          loadTeam(),
          loadRates(),
          loadPayments(),
          loadDisplay(),
          loadSquare(),
        ]);
      }
      setLoading(false);
    })();
  }, [loadSession, loadTeam, loadRates, loadPayments, loadDisplay, loadSquare]);

  useEffect(() => {
    const raw = searchParams.get("tab");
    if (!isAdmin && raw && raw !== "account") {
      setTab("account");
    }
  }, [isAdmin, searchParams, setTab]);

  const previewRows = useMemo(() => {
    if (!pricingDraft) return [];
    return PREVIEW_UNITS.map((units) => {
      const est = estimateBooking(
        units,
        pricingDraft.includedHours,
        0,
        pricingDraft,
      );
      return { units, est };
    });
  }, [pricingDraft]);

  const balanceTiming = paymentDraft
    ? timingPhrase(
        paymentDraft.autoBalanceDaysBefore,
        paymentDraft.autoBalanceEnabled,
      )
    : "about a week before the event";

  async function saveProfile(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setOkMsg("");

    if (profile.newPassword) {
      if (profile.newPassword !== profile.confirmPassword) {
        setError("New passwords don’t match");
        setBusy(false);
        return;
      }
      if (!profile.currentPassword) {
        setError("Enter your current password to change it");
        setBusy(false);
        return;
      }
    }

    const res = await fetch("/api/auth/account", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        displayName: profile.displayName,
        currentPassword: profile.currentPassword || undefined,
        newPassword: profile.newPassword || undefined,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "Couldn’t save account");
      return;
    }

    setOkMsg(data.passwordChanged ? "Password updated" : "Profile saved");
    setProfile((p) => ({
      ...p,
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
      displayName: data.user?.displayName ?? p.displayName,
    }));
    setSession((s) =>
      s
        ? {
            ...s,
            name: data.user?.displayName ?? s.name,
          }
        : s,
    );
    router.refresh();
  }

  async function saveRates(e: FormEvent) {
    e.preventDefault();
    if (!pricingDraft || !isAdmin) return;
    setBusy(true);
    setError("");
    setOkMsg("");
    try {
      const res = await fetch("/api/site-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pricing: pricingDraft }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Couldn’t save rates");
        return;
      }
      const normalized = stripPublicExtras(
        (data.pricing ?? {}) as Record<string, unknown>,
      );
      setPricing(normalized);
      setPricingDraft(normalized);
      setOkMsg("Rates saved — book, partner, and ops will use these values.");
    } finally {
      setBusy(false);
    }
  }

  async function savePayments(e: FormEvent) {
    e.preventDefault();
    if (!paymentDraft || !isAdmin) return;
    setBusy(true);
    setError("");
    setOkMsg("");
    try {
      const res = await fetch("/api/payment-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(paymentDraft),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Couldn’t save payment defaults");
        return;
      }
      setPaymentSettings(data.settings);
      setPaymentDraft(data.settings);
      setOkMsg("Payment defaults saved — book page and emails will match.");
    } finally {
      setBusy(false);
    }
  }

  async function saveDisplay(e: FormEvent) {
    e.preventDefault();
    if (!displayDraft || !isAdmin) return;
    setBusy(true);
    setError("");
    setOkMsg("");
    try {
      const res = await fetch("/api/display-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(displayDraft),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Couldn’t save display settings");
        return;
      }
      setDisplaySettings(data.settings);
      setDisplayDraft(data.settings);
      setOkMsg("Display workflow saved — event tablets will use these rules.");
    } finally {
      setBusy(false);
    }
  }

  async function runSquareAction(
    action: string,
    body: Record<string, unknown> = {},
  ) {
    if (!isAdmin) return;
    setSquareBusy(true);
    setError("");
    setOkMsg("");
    try {
      const res = await fetch("/api/square/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...body }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Square action failed");
        return;
      }
      if (data.status) {
        setSquareStatus(data.status as SquareStatus);
        setDeviceIdDraft(
          (data.status as SquareStatus).terminal.activeDeviceId ?? "",
        );
      }
      if (action === "create_device_code" && data.deviceCode?.code) {
        setActivePairCode({
          id: data.deviceCode.id,
          code: data.deviceCode.code,
          pairBy: data.deviceCode.pairBy ?? null,
        });
        setOkMsg(`Pairing code ${data.deviceCode.code} — enter it on the Square Terminal within 5 minutes.`);
      } else if (action === "set_terminal_device") {
        setOkMsg(
          body.deviceId
            ? "Active Terminal device saved"
            : "Cleared Terminal device override (using env if set)",
        );
        setActivePairCode(null);
      } else if (action === "probe") {
        const probe = (data.status as SquareStatus | undefined)?.terminal.probe;
        setOkMsg(
          probe?.ok
            ? "Terminal probe succeeded — device is ready"
            : `Terminal probe failed: ${probe?.detail ?? "unknown"}`,
        );
      } else if (action === "refresh_device_code" && data.deviceCode) {
        if (data.deviceCode.status === "PAIRED" && data.deviceCode.deviceId) {
          setOkMsg(`Paired · device ${data.deviceCode.deviceId}`);
          setActivePairCode(null);
        } else {
          setOkMsg(`Code status: ${data.deviceCode.status ?? "unknown"}`);
        }
      } else {
        setOkMsg("Square status updated");
      }
    } finally {
      setSquareBusy(false);
    }
  }

  async function createUser(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setOkMsg("");
    const res = await fetch("/api/ops-users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newUser),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "Could not create user");
      return;
    }
    setNewUser({ username: "", displayName: "", password: "", role: "staff" });
    setOkMsg(`Created @${data.user?.username}`);
    await loadTeam();
  }

  async function patchUser(id: number, body: Record<string, unknown>) {
    setBusy(true);
    setError("");
    setOkMsg("");
    const res = await fetch("/api/ops-users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...body }),
    });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Update failed");
      return;
    }
    setResetId(null);
    setResetPassword("");
    setOkMsg("Account updated");
    await loadTeam();
  }

  function updatePricing<K extends keyof PricingConfig>(
    key: K,
    value: PricingConfig[K],
  ) {
    setPricingDraft((d) => (d ? { ...d, [key]: value } : d));
  }

  if (loading) return <p className="empty">Loading settings…</p>;

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">Control Center</h1>
          <p className="page-sub">
            Your account
            {isAdmin ? " · rates · payments · display · Square · team" : ""}
          </p>
        </div>
      </div>

      {error ? <p className="login-error">{error}</p> : null}
      {okMsg ? (
        <p className="list-meta" style={{ color: "var(--ok)" }}>
          {okMsg}
        </p>
      ) : null}

      {isAdmin ? (
        <nav className="control-tabs" aria-label="Settings sections">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`chip${tab === t.id ? " active" : ""}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>
      ) : null}

      {tab === "account" ? (
        <section className="panel">
          <h2 className="panel-title">Your account</h2>
          {!session?.userId ? (
            <p className="empty">
              This session isn’t tied to a named ops user. Ask an admin to create
              an account for you, then sign in with that username.
            </p>
          ) : (
            <form className="form" onSubmit={saveProfile}>
              <div className="field">
                <label htmlFor="settings-username">Username</label>
                <input
                  id="settings-username"
                  value={session.username ?? ""}
                  disabled
                  readOnly
                />
                <p className="list-meta" style={{ marginTop: "0.35rem" }}>
                  Role: {session.role}
                </p>
              </div>
              <div className="field">
                <label htmlFor="settings-display">Display name</label>
                <input
                  id="settings-display"
                  value={profile.displayName}
                  onChange={(e) =>
                    setProfile((p) => ({ ...p, displayName: e.target.value }))
                  }
                  required
                />
              </div>
              <PasswordField
                id="settings-current"
                label="Current password"
                value={profile.currentPassword}
                onChange={(value) =>
                  setProfile((p) => ({ ...p, currentPassword: value }))
                }
                autoComplete="current-password"
                placeholder="Required only to change password"
              />
              <div className="form-row form-row-2">
                <PasswordField
                  id="settings-new"
                  label="New password"
                  value={profile.newPassword}
                  onChange={(value) =>
                    setProfile((p) => ({ ...p, newPassword: value }))
                  }
                  minLength={6}
                  autoComplete="new-password"
                />
                <PasswordField
                  id="settings-confirm"
                  label="Confirm new password"
                  value={profile.confirmPassword}
                  onChange={(value) =>
                    setProfile((p) => ({ ...p, confirmPassword: value }))
                  }
                  minLength={6}
                  autoComplete="new-password"
                />
              </div>
              <button type="submit" className="btn btn-primary" disabled={busy}>
                Save account
              </button>
            </form>
          )}
        </section>
      ) : null}

      {tab === "rates" && isAdmin ? (
        <section className="panel">
          <h2 className="panel-title">Catalog rates</h2>
          <p className="list-meta" style={{ marginBottom: "1rem" }}>
            Drives /book, partner estimates, guest refill pricing, and job
            defaults. Check interval applies to new jobs.
          </p>

          {pricingDraft ? (
            <form className="form" onSubmit={saveRates}>
              <h3 className="panel-title" style={{ fontSize: "0.95rem" }}>
                On-site sales
              </h3>
              <div className="form-row form-row-2">
                <div className="field">
                  <label htmlFor="onsite-unit">Per-unit rate ($)</label>
                  <input
                    id="onsite-unit"
                    type="number"
                    min={1}
                    step={1}
                    value={pricingDraft.onsiteUnitRate}
                    onChange={(e) =>
                      updatePricing(
                        "onsiteUnitRate",
                        Math.max(0, Number(e.target.value) || 0),
                      )
                    }
                  />
                </div>
                <div className="field">
                  <label htmlFor="onsite-unlimited">Unlimited rate ($)</label>
                  <input
                    id="onsite-unlimited"
                    type="number"
                    min={1}
                    step={1}
                    value={pricingDraft.onsiteUnlimitedRate}
                    onChange={(e) =>
                      updatePricing(
                        "onsiteUnlimitedRate",
                        Math.max(0, Number(e.target.value) || 0),
                      )
                    }
                  />
                </div>
              </div>

              <div className="field">
                <label htmlFor="refill-price">Guest refill price ($)</label>
                <input
                  id="refill-price"
                  type="number"
                  min={0}
                  step={1}
                  value={pricingDraft.refillPriceCents / 100}
                  onChange={(e) =>
                    updatePricing(
                      "refillPriceCents",
                      Math.max(0, Math.round((Number(e.target.value) || 0) * 100)),
                    )
                  }
                  style={{ width: "6rem" }}
                />
              </div>

              <h3 className="panel-title" style={{ fontSize: "0.95rem" }}>
                Package floor & tiers
              </h3>
              <div className="form-row form-row-3">
                <div className="field">
                  <label htmlFor="min-hookahs">Min hookahs</label>
                  <input
                    id="min-hookahs"
                    type="number"
                    min={1}
                    max={40}
                    value={pricingDraft.minPackageHookahs}
                    onChange={(e) =>
                      updatePricing(
                        "minPackageHookahs",
                        Math.min(
                          40,
                          Math.max(1, Math.round(Number(e.target.value) || 1)),
                        ),
                      )
                    }
                  />
                </div>
                <div className="field">
                  <label htmlFor="min-dollars">Floor total ($)</label>
                  <input
                    id="min-dollars"
                    type="number"
                    min={1}
                    step={1}
                    value={pricingDraft.minPackageDollars}
                    onChange={(e) =>
                      updatePricing(
                        "minPackageDollars",
                        Math.max(0, Number(e.target.value) || 0),
                      )
                    }
                  />
                </div>
                <div className="field">
                  <label htmlFor="included-hours">Included hours</label>
                  <input
                    id="included-hours"
                    type="number"
                    min={1}
                    max={12}
                    value={pricingDraft.includedHours}
                    onChange={(e) =>
                      updatePricing(
                        "includedHours",
                        Math.min(
                          12,
                          Math.max(1, Math.round(Number(e.target.value) || 1)),
                        ),
                      )
                    }
                  />
                </div>
              </div>

              <div className="form-row form-row-3">
                <div className="field">
                  <label htmlFor="mid-tier">5–8 hookahs ($/ea)</label>
                  <input
                    id="mid-tier"
                    type="number"
                    min={0}
                    step={1}
                    value={pricingDraft.midTierRate}
                    onChange={(e) =>
                      updatePricing(
                        "midTierRate",
                        Math.max(0, Number(e.target.value) || 0),
                      )
                    }
                  />
                </div>
                <div className="field">
                  <label htmlFor="high-tier">9+ hookahs ($/ea)</label>
                  <input
                    id="high-tier"
                    type="number"
                    min={0}
                    step={1}
                    value={pricingDraft.highTierRate}
                    onChange={(e) =>
                      updatePricing(
                        "highTierRate",
                        Math.max(0, Number(e.target.value) || 0),
                      )
                    }
                  />
                </div>
                <div className="field">
                  <label htmlFor="extra-hour">Extra hour ($)</label>
                  <input
                    id="extra-hour"
                    type="number"
                    min={0}
                    step={1}
                    value={pricingDraft.extraHourRate}
                    onChange={(e) =>
                      updatePricing(
                        "extraHourRate",
                        Math.max(0, Number(e.target.value) || 0),
                      )
                    }
                  />
                </div>
              </div>

              <div className="field">
                <label htmlFor="hst-rate">HST rate (%)</label>
                <input
                  id="hst-rate"
                  type="number"
                  min={0}
                  max={100}
                  step={0.01}
                  value={Math.round(pricingDraft.hstRate * 10000) / 100}
                  onChange={(e) =>
                    updatePricing(
                      "hstRate",
                      Math.min(
                        1,
                        Math.max(0, (Number(e.target.value) || 0) / 100),
                      ),
                    )
                  }
                  style={{ width: "5.5rem" }}
                />
              </div>

              <h3 className="panel-title" style={{ fontSize: "0.95rem" }}>
                Add-ons
              </h3>
              <div className="form-row form-row-3">
                <div className="field">
                  <label htmlFor="led-rate">LED ($/hookah)</label>
                  <input
                    id="led-rate"
                    type="number"
                    min={0}
                    step={1}
                    value={pricingDraft.ledRate}
                    onChange={(e) =>
                      updatePricing(
                        "ledRate",
                        Math.max(0, Number(e.target.value) || 0),
                      )
                    }
                  />
                </div>
                <div className="field">
                  <label htmlFor="water-rate">Water ($/hookah)</label>
                  <input
                    id="water-rate"
                    type="number"
                    min={0}
                    step={1}
                    value={pricingDraft.waterRate}
                    onChange={(e) =>
                      updatePricing(
                        "waterRate",
                        Math.max(0, Number(e.target.value) || 0),
                      )
                    }
                  />
                </div>
                <div className="field">
                  <label htmlFor="branding-min">Branding min units</label>
                  <input
                    id="branding-min"
                    type="number"
                    min={0}
                    step={1}
                    value={pricingDraft.brandingMin}
                    onChange={(e) =>
                      updatePricing(
                        "brandingMin",
                        Math.max(0, Number(e.target.value) || 0),
                      )
                    }
                  />
                </div>
              </div>

              <div className="form-row form-row-2">
                <div className="field">
                  <label htmlFor="branding-medium">Branding medium ($/unit)</label>
                  <input
                    id="branding-medium"
                    type="number"
                    min={0}
                    step={1}
                    value={pricingDraft.brandingMedium}
                    onChange={(e) =>
                      updatePricing(
                        "brandingMedium",
                        Math.max(0, Number(e.target.value) || 0),
                      )
                    }
                  />
                </div>
                <div className="field">
                  <label htmlFor="branding-large">Branding large ($/unit)</label>
                  <input
                    id="branding-large"
                    type="number"
                    min={0}
                    step={1}
                    value={pricingDraft.brandingLarge}
                    onChange={(e) =>
                      updatePricing(
                        "brandingLarge",
                        Math.max(0, Number(e.target.value) || 0),
                      )
                    }
                  />
                </div>
              </div>

              <h3 className="panel-title" style={{ fontSize: "0.95rem" }}>
                Guest rebook promo
              </h3>
              <div className="form-row form-row-3">
                <div className="field">
                  <label htmlFor="rebook-code">Promo code</label>
                  <input
                    id="rebook-code"
                    value={pricingDraft.guestRebookCode}
                    maxLength={32}
                    onChange={(e) =>
                      updatePricing("guestRebookCode", e.target.value)
                    }
                  />
                </div>
                <div className="field">
                  <label htmlFor="rebook-discount">Discount ($)</label>
                  <input
                    id="rebook-discount"
                    type="number"
                    min={0}
                    step={1}
                    value={pricingDraft.guestRebookDiscountDollars}
                    onChange={(e) =>
                      updatePricing(
                        "guestRebookDiscountDollars",
                        Math.max(0, Number(e.target.value) || 0),
                      )
                    }
                  />
                </div>
                <div className="field">
                  <label htmlFor="rebook-label">Label</label>
                  <input
                    id="rebook-label"
                    value={pricingDraft.guestRebookLabel}
                    maxLength={80}
                    onChange={(e) =>
                      updatePricing("guestRebookLabel", e.target.value)
                    }
                  />
                </div>
              </div>

              <h3 className="panel-title" style={{ fontSize: "0.95rem" }}>
                Ops defaults
              </h3>
              <div className="field">
                <label htmlFor="check-interval">Default spot-check timer</label>
                <select
                  id="check-interval"
                  value={String(pricingDraft.defaultCheckIntervalMinutes)}
                  onChange={(e) =>
                    updatePricing(
                      "defaultCheckIntervalMinutes",
                      Math.round(Number(e.target.value) || 0),
                    )
                  }
                  style={{ width: "12rem" }}
                >
                  <option value="0">Off — no timers</option>
                  <option value="30">Every 30 min</option>
                  <option value="45">Every 45 min</option>
                  <option value="60">Every 60 min</option>
                  <option value="90">Every 90 min</option>
                  <option value="120">Every 120 min</option>
                </select>
                <p className="list-meta" style={{ marginTop: "0.35rem" }}>
                  Used when creating new jobs. Per-job override is on Edit job.
                  Off skips overdue beeps and countdowns.
                </p>
              </div>

              <div className="panel" style={{ marginTop: "1rem", padding: "0.85rem" }}>
                <h3 className="panel-title" style={{ fontSize: "0.9rem" }}>
                  Live preview
                </h3>
                <p className="list-meta" style={{ marginBottom: "0.65rem" }}>
                  Package estimate at {pricingDraft.includedHours} included hours
                  (no add-ons or promo):
                </p>
                <ul className="list">
                  {previewRows.map(({ units, est }) => (
                    <li key={units} className="list-row">
                      <span>
                        <strong>{units} hookahs</strong>
                        <span className="list-meta">
                          {est
                            ? est.tier.label
                            : `Below min (${pricingDraft.minPackageHookahs})`}
                        </span>
                      </span>
                      <strong>
                        {est ? formatCad(est.total) : "—"}
                      </strong>
                    </li>
                  ))}
                </ul>
              </div>

              <button
                type="submit"
                className="btn btn-primary"
                disabled={
                  busy ||
                  !pricing ||
                  JSON.stringify(pricingDraft) === JSON.stringify(pricing)
                }
                style={{ marginTop: "1rem" }}
              >
                {busy ? "Saving…" : "Save rates"}
              </button>
            </form>
          ) : (
            <p className="empty">Loading rates…</p>
          )}
        </section>
      ) : null}

      {tab === "payments" && isAdmin ? (
        <section className="panel">
          <h2 className="panel-title">Payment defaults</h2>
          <p className="list-meta" style={{ marginBottom: "1rem" }}>
            These drive new jobs, the book page, and client emails. Deposit
            default:{" "}
            <strong>{paymentDraft?.defaultDepositPercent ?? 50}%</strong>.
            Balance due: <strong>{balanceTiming}</strong>.
          </p>

          {paymentDraft ? (
            <form className="form" onSubmit={savePayments}>
              <div className="field">
                <label>Default deposit %</label>
                <div className="deposit-pct">
                  {DEPOSIT_PERCENT_PRESETS.map((pct) => (
                    <button
                      key={pct}
                      type="button"
                      className={`chip${paymentDraft.defaultDepositPercent === pct ? " active" : ""}`}
                      onClick={() =>
                        setPaymentDraft({
                          ...paymentDraft,
                          defaultDepositPercent: pct,
                        })
                      }
                    >
                      {pct}%
                    </button>
                  ))}
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={paymentDraft.defaultDepositPercent}
                    onChange={(e) =>
                      setPaymentDraft({
                        ...paymentDraft,
                        defaultDepositPercent: Math.min(
                          100,
                          Math.max(1, Number(e.target.value) || 50),
                        ),
                      })
                    }
                    aria-label="Default deposit percent"
                  />
                </div>
              </div>

              <label className="pay-toggle">
                <input
                  type="checkbox"
                  checked={paymentDraft.autoDepositOnBooking}
                  onChange={(e) =>
                    setPaymentDraft({
                      ...paymentDraft,
                      autoDepositOnBooking: e.target.checked,
                    })
                  }
                />
                <span>
                  <strong>Auto-email deposit on website booking</strong>
                  <em>When a package inquiry includes an estimate</em>
                </span>
              </label>

              <label className="pay-toggle">
                <input
                  type="checkbox"
                  checked={paymentDraft.autoDepositOnQuote}
                  onChange={(e) =>
                    setPaymentDraft({
                      ...paymentDraft,
                      autoDepositOnQuote: e.target.checked,
                    })
                  }
                />
                <span>
                  <strong>Auto-email deposit when quote is saved</strong>
                  <em>Only if no deposit link exists yet</em>
                </span>
              </label>

              <label className="pay-toggle">
                <input
                  type="checkbox"
                  checked={paymentDraft.autoBalanceEnabled}
                  onChange={(e) =>
                    setPaymentDraft({
                      ...paymentDraft,
                      autoBalanceEnabled: e.target.checked,
                    })
                  }
                />
                <span>
                  <strong>Auto-email balance before the event</strong>
                  <em>
                    After deposit is paid, send the remaining balance when the
                    event is inside the window
                  </em>
                </span>
              </label>

              <div className="field">
                <label htmlFor="balance-days">Days before event</label>
                <input
                  id="balance-days"
                  type="number"
                  min={0}
                  max={60}
                  disabled={!paymentDraft.autoBalanceEnabled}
                  value={paymentDraft.autoBalanceDaysBefore}
                  onChange={(e) =>
                    setPaymentDraft({
                      ...paymentDraft,
                      autoBalanceDaysBefore: Math.min(
                        60,
                        Math.max(0, Number(e.target.value) || 7),
                      ),
                    })
                  }
                  style={{ width: "5.5rem" }}
                />
                <p className="list-meta" style={{ marginTop: "0.35rem" }}>
                  Clients see “due {balanceTiming}” on /book and in emails.
                </p>
              </div>

              <button
                type="submit"
                className="btn btn-primary"
                disabled={
                  busy ||
                  !paymentSettings ||
                  JSON.stringify(paymentDraft) ===
                    JSON.stringify(paymentSettings)
                }
              >
                {busy ? "Saving…" : "Save payment defaults"}
              </button>
            </form>
          ) : (
            <p className="empty">Loading payment defaults…</p>
          )}
        </section>
      ) : null}

      {tab === "display" && isAdmin ? (
        <section className="panel">
          <h2 className="panel-title">Event display workflow</h2>
          <p className="list-meta" style={{ marginTop: 0 }}>
            Controls when the job tablet shows the guest serve QR after an
            on-site unit is collected — and how long it stays up.
          </p>
          {displayDraft ? (
            <form className="form" onSubmit={saveDisplay}>
              <div className="field">
                <span>Show guest QR when</span>
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "0.45rem",
                    marginTop: "0.45rem",
                  }}
                >
                  <button
                    type="button"
                    className={`chip${
                      displayDraft.qrTrigger === "on_paid" ? " active" : ""
                    }`}
                    onClick={() =>
                      setDisplayDraft({
                        ...displayDraft,
                        qrTrigger: "on_paid",
                      })
                    }
                  >
                    Marked paid
                  </button>
                  <button
                    type="button"
                    className={`chip${
                      displayDraft.qrTrigger === "on_send_out" ? " active" : ""
                    }`}
                    onClick={() =>
                      setDisplayDraft({
                        ...displayDraft,
                        qrTrigger: "on_send_out",
                      })
                    }
                  >
                    Sent to floor
                  </button>
                </div>
                <p className="list-meta" style={{ marginTop: "0.45rem" }}>
                  {displayDraft.qrTrigger === "on_paid"
                    ? "Cash, already paid, or Terminal clearance shows the QR. Unit stays on Ready to send so you can prep and walk it out. Private/comp jobs still show QR at send-out."
                    : "QR appears when you tap Send (unit moves On the floor). Paying alone won’t trigger the tablet."}
                </p>
              </div>

              <div className="field">
                <label htmlFor="qr-duration">QR on screen (seconds)</label>
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "0.45rem",
                    marginBottom: "0.45rem",
                  }}
                >
                  {QR_DURATION_PRESETS.map((sec) => (
                    <button
                      key={sec}
                      type="button"
                      className={`chip${
                        displayDraft.qrDurationSeconds === sec ? " active" : ""
                      }`}
                      onClick={() =>
                        setDisplayDraft({
                          ...displayDraft,
                          qrDurationSeconds: sec,
                        })
                      }
                    >
                      {sec}s
                    </button>
                  ))}
                </div>
                <input
                  id="qr-duration"
                  type="number"
                  min={15}
                  max={300}
                  step={5}
                  value={displayDraft.qrDurationSeconds}
                  onChange={(e) =>
                    setDisplayDraft({
                      ...displayDraft,
                      qrDurationSeconds: Math.min(
                        300,
                        Math.max(15, Math.round(Number(e.target.value) || 90)),
                      ),
                    })
                  }
                  style={{ width: "6.5rem" }}
                />
                <p className="list-meta" style={{ marginTop: "0.45rem" }}>
                  Newest paid/sent unit wins if more than one is in the window.
                </p>
              </div>

              <button
                type="submit"
                className="btn btn-ok"
                disabled={
                  busy ||
                  JSON.stringify(displayDraft) ===
                    JSON.stringify(displaySettings)
                }
              >
                {busy ? "Saving…" : "Save display settings"}
              </button>
            </form>
          ) : (
            <p className="empty">Loading display settings…</p>
          )}
        </section>
      ) : null}

      {tab === "square" && isAdmin ? (
        <section className="panel">
          <div className="square-status-head">
            <div>
              <h2 className="panel-title">Square</h2>
              <p className="list-meta" style={{ marginBottom: 0 }}>
                Connection health for payment links, webhooks, and Terminal
                collect. Secrets stay on the server — only masked values are
                shown. New links show net + HST and use {CONTACT_EMAIL} as
                support email — set your logo and button colours in Square
                Dashboard → Payment links → Branding.
              </p>
            </div>
            <div className="square-status-actions">
              <button
                type="button"
                className="btn btn-sm"
                disabled={squareBusy}
                onClick={() => void loadSquare(false)}
              >
                Refresh
              </button>
              <button
                type="button"
                className="btn btn-sm"
                disabled={squareBusy || !squareStatus?.configured}
                onClick={() => void runSquareAction("probe")}
              >
                Probe Terminal
              </button>
            </div>
          </div>

          {squareStatus ? (
            <>
              <div className="square-status-grid">
                <div
                  className={`square-status-card${squareStatus.readyForLinks ? " is-ok" : " is-bad"}`}
                >
                  <span className="square-status-card__label">Payment links</span>
                  <strong>
                    {squareStatus.readyForLinks ? "Ready" : "Not ready"}
                  </strong>
                  <em>{squareStatus.environment}</em>
                </div>
                <div
                  className={`square-status-card${squareStatus.readyForTerminal ? " is-ok" : " is-warn"}`}
                >
                  <span className="square-status-card__label">Terminal</span>
                  <strong>
                    {squareStatus.readyForTerminal ? "Ready" : "Needs device"}
                  </strong>
                  <em>
                    {squareStatus.terminal.activeSource
                      ? `via ${squareStatus.terminal.activeSource}`
                      : "no device id"}
                  </em>
                </div>
                <div
                  className={`square-status-card${squareStatus.webhook.signatureConfigured ? " is-ok" : " is-warn"}`}
                >
                  <span className="square-status-card__label">Webhook</span>
                  <strong>
                    {squareStatus.webhook.signatureConfigured
                      ? "Signed"
                      : squareStatus.webhook.skipVerify
                        ? "Skip verify"
                        : "Not set"}
                  </strong>
                  <em>signature key</em>
                </div>
              </div>

              <dl className="square-kv">
                <div>
                  <dt>Access token</dt>
                  <dd>
                    {squareStatus.accessToken.present
                      ? squareStatus.accessToken.masked
                      : "Missing"}
                  </dd>
                </div>
                <div>
                  <dt>Location</dt>
                  <dd>
                    {squareStatus.location.live
                      ? `${squareStatus.location.live.name ?? "Location"} · ${squareStatus.location.live.id}${
                          squareStatus.location.live.status
                            ? ` · ${squareStatus.location.live.status}`
                            : ""
                        }`
                      : squareStatus.location.error ||
                        squareStatus.location.configuredId ||
                        "Missing"}
                  </dd>
                </div>
                <div>
                  <dt>Webhook URL</dt>
                  <dd className="mono">{squareStatus.webhook.notificationUrl}</dd>
                </div>
                <div>
                  <dt>Active device</dt>
                  <dd className="mono">
                    {squareStatus.terminal.activeDeviceId || "—"}
                  </dd>
                </div>
                {squareStatus.terminal.probe ? (
                  <div>
                    <dt>Last probe</dt>
                    <dd>
                      {squareStatus.terminal.probe.ok ? "OK · " : "Failed · "}
                      {squareStatus.terminal.probe.detail}
                    </dd>
                  </div>
                ) : null}
                {squareStatus.apiError ? (
                  <div>
                    <dt>API note</dt>
                    <dd>{squareStatus.apiError}</dd>
                  </div>
                ) : null}
              </dl>

              <div className="square-section">
                <h3 className="square-section__title">Active Terminal device</h3>
                <p className="list-meta">
                  Saved here overrides <code>SQUARE_TERMINAL_DEVICE_ID</code>{" "}
                  without redeploying. Use a device id from a successful Terminal
                  API pairing (not Tap to Pay / Point of Sale alone).
                </p>
                <div className="square-device-form">
                  <input
                    value={deviceIdDraft}
                    onChange={(e) => setDeviceIdDraft(e.target.value)}
                    placeholder="Paired device id"
                    aria-label="Terminal device id"
                    className="mono"
                  />
                  <button
                    type="button"
                    className="btn btn-sm btn-primary"
                    disabled={squareBusy}
                    onClick={() =>
                      void runSquareAction("set_terminal_device", {
                        deviceId: deviceIdDraft.trim() || null,
                      })
                    }
                  >
                    Save device
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost"
                    disabled={squareBusy || !squareStatus.terminal.dbDeviceId}
                    onClick={() =>
                      void runSquareAction("set_terminal_device", {
                        deviceId: null,
                      })
                    }
                  >
                    Clear override
                  </button>
                </div>
                {squareStatus.terminal.envDeviceId ? (
                  <p className="list-meta" style={{ marginTop: "0.45rem" }}>
                    Env fallback:{" "}
                    <code>{squareStatus.terminal.envDeviceId}</code>
                  </p>
                ) : null}
              </div>

              <div className="square-section">
                <div className="square-section__row">
                  <h3 className="square-section__title">Pair Square Terminal</h3>
                  <button
                    type="button"
                    className="btn btn-sm btn-primary"
                    disabled={squareBusy || !squareStatus.configured}
                    onClick={() => void runSquareAction("create_device_code")}
                  >
                    Create pairing code
                  </button>
                </div>
                <p className="list-meta">
                  On the hardware Terminal: Sign in → Device Code → enter the
                  code within 5 minutes. Then refresh the code and tap Use
                  device.
                </p>
                {activePairCode ? (
                  <div className="square-pair-banner">
                    <div>
                      <span className="square-pair-banner__code">
                        {activePairCode.code}
                      </span>
                      {activePairCode.pairBy ? (
                        <em>Expires {new Date(activePairCode.pairBy).toLocaleTimeString()}</em>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      className="btn btn-sm"
                      disabled={squareBusy}
                      onClick={() =>
                        void runSquareAction("refresh_device_code", {
                          codeId: activePairCode.id,
                        })
                      }
                    >
                      Check pairing
                    </button>
                  </div>
                ) : null}

                {squareStatus.deviceCodes.length > 0 ? (
                  <ul className="square-code-list">
                    {squareStatus.deviceCodes.slice(0, 8).map((code) => (
                      <li key={code.id}>
                        <div>
                          <strong>{code.name || "Terminal"}</strong>
                          <span className="list-meta">
                            {" "}
                            · {code.status || "—"}
                            {code.code ? ` · ${code.code}` : ""}
                          </span>
                          {code.deviceId ? (
                            <div className="mono">{code.deviceId}</div>
                          ) : null}
                        </div>
                        <div className="square-code-list__actions">
                          {code.status === "UNPAIRED" && code.id ? (
                            <button
                              type="button"
                              className="btn btn-sm"
                              disabled={squareBusy}
                              onClick={() => {
                                if (code.code) {
                                  setActivePairCode({
                                    id: code.id,
                                    code: code.code,
                                    pairBy: code.pairBy,
                                  });
                                }
                                void runSquareAction("refresh_device_code", {
                                  codeId: code.id,
                                });
                              }}
                            >
                              Refresh
                            </button>
                          ) : null}
                          {code.deviceId ? (
                            <button
                              type="button"
                              className="btn btn-sm btn-primary"
                              disabled={squareBusy}
                              onClick={() =>
                                void runSquareAction("set_terminal_device", {
                                  deviceId: code.deviceId,
                                })
                              }
                            >
                              Use device
                            </button>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="empty" style={{ marginTop: "0.65rem" }}>
                    No device codes yet.
                  </p>
                )}
              </div>

              <div className="square-section">
                <h3 className="square-section__title">Known devices</h3>
                {squareStatus.devices.length > 0 ? (
                  <ul className="square-code-list">
                    {squareStatus.devices.map((device) => (
                      <li key={device.id}>
                        <div>
                          <strong>{device.name || "Device"}</strong>
                          <span className="list-meta">
                            {" "}
                            · {device.status || "—"}
                            {device.deviceType ? ` · ${device.deviceType}` : ""}
                          </span>
                          <div className="mono">{device.id}</div>
                        </div>
                        <button
                          type="button"
                          className="btn btn-sm btn-primary"
                          disabled={squareBusy}
                          onClick={() =>
                            void runSquareAction("set_terminal_device", {
                              deviceId: device.id,
                            })
                          }
                        >
                          Use device
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="empty">
                    No paired Terminal API devices on this merchant yet.
                  </p>
                )}
              </div>

              <p className="list-meta" style={{ marginTop: "0.85rem" }}>
                Checked {new Date(squareStatus.checkedAt).toLocaleString()}.
                iPhone Tap to Pay in Square Point of Sale is separate from this
                Terminal API push.
              </p>
            </>
          ) : (
            <p className="empty">Loading Square status…</p>
          )}
        </section>
      ) : null}

      {tab === "team" && isAdmin ? (
        <>
          <section className="panel" style={{ marginBottom: "1rem" }}>
            <h2 className="panel-title">Create account</h2>
            <form className="form" onSubmit={createUser}>
              <div className="form-row form-row-2">
                <div className="field">
                  <label htmlFor="new-username">Username</label>
                  <input
                    id="new-username"
                    value={newUser.username}
                    onChange={(e) =>
                      setNewUser((f) => ({ ...f, username: e.target.value }))
                    }
                    required
                    autoComplete="off"
                  />
                </div>
                <div className="field">
                  <label htmlFor="new-display">Display name</label>
                  <input
                    id="new-display"
                    value={newUser.displayName}
                    onChange={(e) =>
                      setNewUser((f) => ({
                        ...f,
                        displayName: e.target.value,
                      }))
                    }
                    required
                  />
                </div>
              </div>
              <div className="form-row form-row-2">
                <PasswordField
                  id="new-password"
                  label="Password"
                  value={newUser.password}
                  onChange={(value) =>
                    setNewUser((f) => ({ ...f, password: value }))
                  }
                  required
                  minLength={6}
                  autoComplete="new-password"
                />
                <div className="field">
                  <label htmlFor="new-role">Role</label>
                  <select
                    id="new-role"
                    value={newUser.role}
                    onChange={(e) =>
                      setNewUser((f) => ({
                        ...f,
                        role: e.target.value === "admin" ? "admin" : "staff",
                      }))
                    }
                  >
                    <option value="staff">Staff — live ops</option>
                    <option value="admin">Admin — settings + deletes</option>
                  </select>
                </div>
              </div>
              <button type="submit" className="btn btn-primary" disabled={busy}>
                Create user
              </button>
            </form>
          </section>

          <section className="panel">
            <h2 className="panel-title">Team accounts</h2>
            {users.length === 0 ? (
              <p className="empty">No users yet.</p>
            ) : (
              <ul className="list">
                {users.map((u) => (
                  <li key={u.id} className="list-row settings-user-row">
                    <div>
                      <strong>{u.displayName}</strong>
                      <div className="list-meta">
                        @{u.username} · {u.role}
                        {!u.active ? " · inactive" : ""}
                        {session?.userId === u.id ? " · you" : ""}
                      </div>
                      {resetId === u.id ? (
                        <div
                          className="settings-reset"
                          style={{ marginTop: "0.55rem" }}
                        >
                          <PasswordInput
                            placeholder="New password (min 6)"
                            value={resetPassword}
                            onChange={setResetPassword}
                            minLength={6}
                            autoComplete="new-password"
                          />
                          <div
                            className="job-card-actions"
                            style={{ marginTop: "0.4rem" }}
                          >
                            <button
                              type="button"
                              className="btn btn-sm btn-primary"
                              disabled={busy || resetPassword.length < 6}
                              onClick={() =>
                                void patchUser(u.id, { password: resetPassword })
                              }
                            >
                              Save password
                            </button>
                            <button
                              type="button"
                              className="btn btn-sm btn-ghost"
                              onClick={() => {
                                setResetId(null);
                                setResetPassword("");
                              }}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                    <div className="job-card-actions">
                      <button
                        type="button"
                        className="btn btn-sm"
                        disabled={busy}
                        onClick={() =>
                          void patchUser(u.id, {
                            role: u.role === "admin" ? "staff" : "admin",
                          })
                        }
                      >
                        Make {u.role === "admin" ? "staff" : "admin"}
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm"
                        disabled={busy}
                        onClick={() =>
                          void patchUser(u.id, { active: !u.active })
                        }
                      >
                        {u.active ? "Deactivate" : "Activate"}
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm btn-ghost"
                        disabled={busy}
                        onClick={() => {
                          setResetId(u.id);
                          setResetPassword("");
                        }}
                      >
                        Reset password
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
