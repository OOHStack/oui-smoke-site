"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useConfirm } from "@/components/admin/ConfirmDialog";

type PromoCode = {
  id: number;
  code: string;
  label: string;
  discountDollars: number;
  active: boolean;
};

type PromoForm = {
  code: string;
  label: string;
  discountDollars: string;
  active: boolean;
};

const emptyForm: PromoForm = {
  code: "",
  label: "",
  discountDollars: "50",
  active: true,
};

export default function PromoCodesPage() {
  const { confirm, dialog } = useConfirm();
  const [promos, setPromos] = useState<PromoCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState<PromoCode | null>(null);
  const [editForm, setEditForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/promo-codes");
    if (res.ok) {
      const data = await res.json();
      setPromos(data.promoCodes ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!editing) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setEditing(null);
    }
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [editing]);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    setError("");
    const res = await fetch("/api/promo-codes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: form.code,
        label: form.label || undefined,
        discountDollars: Number(form.discountDollars),
        active: form.active,
      }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "Failed to add promo code");
      return;
    }
    setForm(emptyForm);
    await load();
  }

  function openEdit(p: PromoCode) {
    setEditing(p);
    setEditForm({
      code: p.code,
      label: p.label ?? "",
      discountDollars: String(p.discountDollars),
      active: p.active,
    });
    setError("");
  }

  async function saveEdit(e: FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/promo-codes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editing.id,
          code: editForm.code,
          label: editForm.label,
          discountDollars: Number(editForm.discountDollars),
          active: editForm.active,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? "Failed to update promo code");
        return;
      }
      setEditing(null);
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function setActive(p: PromoCode, active: boolean) {
    setError("");
    setBusyId(p.id);
    try {
      const res = await fetch("/api/promo-codes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: p.id, active }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? "Failed to update promo code");
        return;
      }
      setPromos((prev) =>
        prev.map((row) => (row.id === p.id ? { ...row, active } : row)),
      );
    } finally {
      setBusyId(null);
    }
  }

  async function deletePromo(p: PromoCode) {
    const ok = await confirm({
      title: "Delete promo code?",
      message: `Delete “${p.code}”? Guests will no longer be able to use this code at booking.`,
      confirmLabel: "Delete promo",
    });
    if (!ok) return;
    setError("");
    setBusyId(p.id);
    try {
      const res = await fetch("/api/promo-codes", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: p.id }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? "Failed to delete promo code");
        return;
      }
      if (editing?.id === p.id) setEditing(null);
      setPromos((prev) => prev.filter((row) => row.id !== p.id));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      {dialog}
      <div className="page-head">
        <div>
          <h1 className="page-title">Promo codes</h1>
          <p className="page-sub">
            Partner and campaign codes for package bookings. Guest rebook code
            stays under Settings → Rates.
          </p>
        </div>
      </div>

      {error ? <p className="login-error">{error}</p> : null}

      <form className="form panel" onSubmit={handleAdd} style={{ marginBottom: "0.75rem" }}>
        <h2 className="panel-title">Add promo code</h2>
        <div className="form-row form-row-2">
          <div className="field">
            <label htmlFor="code">Code</label>
            <input
              id="code"
              required
              placeholder="e.g. MRLEWIN"
              value={form.code}
              onChange={(e) =>
                setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))
              }
              style={{ textTransform: "uppercase" }}
            />
          </div>
          <div className="field">
            <label htmlFor="discountDollars">Discount ($)</label>
            <input
              id="discountDollars"
              type="number"
              min={0}
              step={1}
              required
              value={form.discountDollars}
              onChange={(e) =>
                setForm((f) => ({ ...f, discountDollars: e.target.value }))
              }
            />
          </div>
        </div>
        <div className="field">
          <label htmlFor="label">Label (shown on book page)</label>
          <input
            id="label"
            placeholder="e.g. $50 off · Mr. Lewin referral"
            value={form.label}
            onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
          />
        </div>
        <button type="submit" className="btn btn-primary">
          Add promo code
        </button>
      </form>

      {loading ? (
        <p className="empty">Loading promo codes…</p>
      ) : promos.length === 0 ? (
        <p className="empty">No promo codes yet.</p>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Discount</th>
                <th>Label</th>
                <th>Active</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {promos.map((p) => (
                <tr key={p.id}>
                  <td>
                    <strong>{p.code}</strong>
                  </td>
                  <td>${p.discountDollars}</td>
                  <td>{p.label || "—"}</td>
                  <td>
                    <span className={`chip ${p.active ? "active" : ""}`}>
                      {p.active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td>
                    <div className="row-actions">
                      <button
                        type="button"
                        className="btn btn-sm"
                        disabled={busyId === p.id}
                        onClick={() => void setActive(p, !p.active)}
                      >
                        {p.active ? "Deactivate" : "Activate"}
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm"
                        onClick={() => openEdit(p)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm btn-danger-ghost"
                        disabled={busyId === p.id}
                        onClick={() => void deletePromo(p)}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing ? (
        <div
          className="hookah-modal-backdrop"
          onClick={() => setEditing(null)}
          role="presentation"
        >
          <div
            ref={dialogRef}
            className="hookah-modal admin-edit-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-promo-title"
            tabIndex={-1}
            onClick={(e) => e.stopPropagation()}
          >
            <form className="hookah-modal__body form" onSubmit={saveEdit}>
              <div className="hookah-modal__head">
                <h2 id="edit-promo-title" className="hookah-modal__title">
                  Edit promo code
                </h2>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setEditing(null)}
                >
                  Close
                </button>
              </div>
              <div className="form-row form-row-2">
                <div className="field">
                  <label htmlFor="edit-code">Code</label>
                  <input
                    id="edit-code"
                    required
                    value={editForm.code}
                    onChange={(e) =>
                      setEditForm((f) => ({
                        ...f,
                        code: e.target.value.toUpperCase(),
                      }))
                    }
                    style={{ textTransform: "uppercase" }}
                  />
                </div>
                <div className="field">
                  <label htmlFor="edit-discount">Discount ($)</label>
                  <input
                    id="edit-discount"
                    type="number"
                    min={0}
                    step={1}
                    required
                    value={editForm.discountDollars}
                    onChange={(e) =>
                      setEditForm((f) => ({
                        ...f,
                        discountDollars: e.target.value,
                      }))
                    }
                  />
                </div>
              </div>
              <div className="field">
                <label htmlFor="edit-label">Label</label>
                <input
                  id="edit-label"
                  value={editForm.label}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, label: e.target.value }))
                  }
                />
              </div>
              <label className="hookah-check">
                <input
                  type="checkbox"
                  checked={editForm.active}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, active: e.target.checked }))
                  }
                />
                Active at booking
              </label>
              {error ? <p className="login-error">{error}</p> : null}
              <div className="hookah-modal__btn-stack" style={{ marginTop: "0.75rem" }}>
                <button
                  type="submit"
                  className="btn btn-ok hookah-modal__btn-main"
                  disabled={busy}
                >
                  {busy ? "Saving…" : "Save changes"}
                </button>
                <button
                  type="button"
                  className="btn btn-danger-ghost"
                  disabled={busy}
                  onClick={() => void deletePromo(editing)}
                >
                  Delete promo
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
