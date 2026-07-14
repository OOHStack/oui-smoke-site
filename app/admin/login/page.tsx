"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PasswordField } from "@/components/admin/PasswordField";
import { CONTACT_EMAIL } from "@/lib/brand-contact";

type Mode = "signin" | "forgot" | "reset";

function AdminLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const linkToken = (searchParams.get("token") || "").trim();

  const [mode, setMode] = useState<Mode>(linkToken ? "reset" : "signin");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [okMsg, setOkMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [bootstrapping, setBootstrapping] = useState(false);

  useEffect(() => {
    if (linkToken) setMode("reset");
  }, [linkToken]);

  useEffect(() => {
    fetch("/api/auth/session")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.authenticated) {
          router.replace("/admin");
        }
      })
      .catch(() => {});
  }, [router]);

  function switchMode(next: Mode) {
    setMode(next);
    setError("");
    setOkMsg("");
    setPassword("");
    setNewPassword("");
    setConfirmPassword("");
  }

  async function handleSignIn(e: FormEvent) {
    e.preventDefault();
    setError("");
    setOkMsg("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: username || undefined,
          password,
          name: name || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Invalid credentials");
        return;
      }

      router.replace("/admin");
      router.refresh();
    } catch {
      setError("Login failed. Try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleForgot(e: FormEvent) {
    e.preventDefault();
    setError("");
    setOkMsg("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Could not start reset");
        return;
      }
      setOkMsg(
        data.message ||
          `If that account exists, a reset link was sent to ${CONTACT_EMAIL}.`,
      );
      setMode("signin");
    } catch {
      setError("Could not start reset. Try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleReset(e: FormEvent) {
    e.preventDefault();
    setError("");
    setOkMsg("");

    if (!linkToken) {
      setError("This reset link is missing or invalid.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New passwords don’t match");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: linkToken,
          newPassword,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Reset failed");
        return;
      }

      setOkMsg("Password updated. Sign in with your new password.");
      setPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setMode("signin");
      router.replace("/admin/login");
    } catch {
      setError("Reset failed. Try again.");
    } finally {
      setLoading(false);
    }
  }

  const title =
    mode === "signin"
      ? "Sign in"
      : mode === "forgot"
        ? "Forgot password"
        : "Set new password";

  const lede =
    mode === "signin"
      ? "Access the floor board, fleet, and guest service tools."
      : mode === "forgot"
        ? `Enter your username. We’ll email a one-time reset link to ${CONTACT_EMAIL}.`
        : "Choose a new password for this account. The link works once and expires in an hour.";

  return (
    <div className="login-page">
      <div
        className="login-page__media"
        style={{ backgroundImage: "url(/images/model-2-web.jpg)" }}
        aria-hidden="true"
      />
      <div className="login-page__veil" aria-hidden="true" />

      <div className="login-shell">
        <div className="login-card">
          <header className="login-card__head">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className="login-logo"
              src="/logo-white.png"
              alt="Oui Smoke"
              width={220}
              height={59}
            />
            <p className="login-eyebrow">Operations console</p>
            <h1 className="login-title">{title}</h1>
            <p className="login-lede">{lede}</p>
          </header>

          {mode === "signin" ? (
            <form className="login-form" onSubmit={handleSignIn}>
              <div className="field">
                <label htmlFor="username">Username</label>
                <input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="your.username"
                  autoComplete="username"
                />
              </div>
              <PasswordField
                id="password"
                label="Password"
                value={password}
                onChange={setPassword}
                required
                autoComplete="current-password"
              />

              <details
                className="login-setup"
                onToggle={(e) =>
                  setBootstrapping((e.target as HTMLDetailsElement).open)
                }
              >
                <summary>First-time setup</summary>
                <div className="field" style={{ marginTop: "0.65rem" }}>
                  <label htmlFor="name">Admin display name</label>
                  <input
                    id="name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your name"
                    autoComplete="name"
                  />
                  {bootstrapping ? (
                    <p className="login-hint">
                      If no users exist yet, sign in with the OPS_PASSWORD and
                      optional username to create the first admin.
                    </p>
                  ) : null}
                </div>
              </details>

              {error ? <p className="login-error">{error}</p> : null}
              {okMsg ? <p className="login-ok">{okMsg}</p> : null}

              <button
                type="submit"
                className="btn btn-primary login-submit"
                disabled={loading}
              >
                {loading ? "Signing in…" : "Sign in"}
              </button>

              <button
                type="button"
                className="login-forgot"
                onClick={() => switchMode("forgot")}
              >
                Forgot password?
              </button>
            </form>
          ) : null}

          {mode === "forgot" ? (
            <form className="login-form" onSubmit={handleForgot}>
              <div className="field">
                <label htmlFor="forgot-username">Username</label>
                <input
                  id="forgot-username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="your.username"
                  required
                  autoComplete="username"
                />
              </div>
              <p className="login-hint">
                A secure link goes to the ops inbox at {CONTACT_EMAIL} —
                open it there to set a new password.
              </p>

              {error ? <p className="login-error">{error}</p> : null}

              <button
                type="submit"
                className="btn btn-primary login-submit"
                disabled={loading}
              >
                {loading ? "Sending…" : "Email reset link"}
              </button>

              <button
                type="button"
                className="login-forgot"
                onClick={() => switchMode("signin")}
              >
                Back to sign in
              </button>
            </form>
          ) : null}

          {mode === "reset" ? (
            <form className="login-form" onSubmit={handleReset}>
              {!linkToken ? (
                <p className="login-error">
                  This reset link is missing. Request a new one from sign in.
                </p>
              ) : (
                <>
                  <PasswordField
                    id="reset-new"
                    label="New password"
                    value={newPassword}
                    onChange={setNewPassword}
                    required
                    minLength={6}
                    autoComplete="new-password"
                  />
                  <PasswordField
                    id="reset-confirm"
                    label="Confirm new password"
                    value={confirmPassword}
                    onChange={setConfirmPassword}
                    required
                    minLength={6}
                    autoComplete="new-password"
                  />
                </>
              )}

              {error ? <p className="login-error">{error}</p> : null}
              {okMsg ? <p className="login-ok">{okMsg}</p> : null}

              <button
                type="submit"
                className="btn btn-primary login-submit"
                disabled={loading || !linkToken}
              >
                {loading ? "Updating…" : "Update password"}
              </button>

              <button
                type="button"
                className="login-forgot"
                onClick={() => {
                  switchMode("signin");
                  router.replace("/admin/login");
                }}
              >
                Back to sign in
              </button>
            </form>
          ) : null}

          <footer className="login-card__foot">
            Authorized personnel only · Oui Smoke Ops
          </footer>
        </div>
      </div>
    </div>
  );
}

export default function AdminLoginPage() {
  return (
    <Suspense
      fallback={
        <div className="login-page">
          <div className="login-shell">
            <div className="login-card">
              <p className="login-lede">Loading…</p>
            </div>
          </div>
        </div>
      }
    >
      <AdminLoginForm />
    </Suspense>
  );
}
