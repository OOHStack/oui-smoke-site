"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  PasswordField,
  PasswordInput,
} from "@/components/admin/PasswordField";

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

export default function SettingsPage() {
  const router = useRouter();
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [users, setUsers] = useState<OpsUserRow[]>([]);
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

  useEffect(() => {
    (async () => {
      setLoading(true);
      const info = await loadSession();
      if (info?.role === "admin") {
        await loadTeam();
      }
      setLoading(false);
    })();
  }, [loadSession, loadTeam]);

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

  if (loading) return <p className="empty">Loading settings…</p>;

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-sub">Your account{isAdmin ? " · team access" : ""}</p>
        </div>
      </div>

      {error ? <p className="login-error">{error}</p> : null}
      {okMsg ? <p className="list-meta" style={{ color: "var(--ok)" }}>{okMsg}</p> : null}

      <section className="panel" style={{ marginBottom: "1rem" }}>
        <h2 className="panel-title">Your account</h2>
        {!session?.userId ? (
          <p className="empty">
            This session isn’t tied to a named ops user. Ask an admin to create an
            account for you, then sign in with that username.
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

      {isAdmin ? (
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
                      setNewUser((f) => ({ ...f, displayName: e.target.value }))
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
                        <div className="settings-reset" style={{ marginTop: "0.55rem" }}>
                          <PasswordInput
                            placeholder="New password (min 6)"
                            value={resetPassword}
                            onChange={setResetPassword}
                            minLength={6}
                            autoComplete="new-password"
                          />
                          <div className="job-card-actions" style={{ marginTop: "0.4rem" }}>
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
                        onClick={() => void patchUser(u.id, { active: !u.active })}
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
