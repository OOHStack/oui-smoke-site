"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import StatusBadge from "@/components/admin/StatusBadge";
import { useConfirm } from "@/components/admin/ConfirmDialog";

type Hookah = {
  id: number;
  modelNumber: number;
  label: string | null;
  status: string;
  notes: string | null;
};

type EditForm = {
  modelNumber: string;
  label: string;
  status: string;
  notes: string;
};

export default function FleetPage() {
  const { confirm, dialog } = useConfirm();
  const [hookahs, setHookahs] = useState<Hookah[]>([]);
  const [loading, setLoading] = useState(true);
  const [modelNumber, setModelNumber] = useState("");
  const [label, setLabel] = useState("");
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<Hookah | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({
    modelNumber: "",
    label: "",
    status: "available",
    notes: "",
  });
  const [busy, setBusy] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/hookahs");
    if (res.ok) {
      const data = await res.json();
      setHookahs(data.hookahs ?? data);
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

  async function addHookah(e: FormEvent) {
    e.preventDefault();
    setError("");
    const res = await fetch("/api/hookahs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        modelNumber: parseInt(modelNumber, 10),
        label: label || undefined,
      }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "Failed to add hookah");
      return;
    }
    setModelNumber("");
    setLabel("");
    await load();
  }

  function openEdit(h: Hookah) {
    setEditing(h);
    setEditForm({
      modelNumber: String(h.modelNumber),
      label: h.label ?? "",
      status: h.status,
      notes: h.notes ?? "",
    });
    setError("");
  }

  async function saveEdit(e: FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/hookahs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editing.id,
          modelNumber: parseInt(editForm.modelNumber, 10),
          label: editForm.label || null,
          status: editForm.status,
          notes: editForm.notes,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? "Failed to update hookah");
        return;
      }
      setEditing(null);
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function deleteHookah(h: Hookah) {
    const ok = await confirm({
      title: "Delete hookah?",
      message: `Delete hookah #${h.modelNumber}? This can’t be undone.`,
      confirmLabel: "Delete hookah",
    });
    if (!ok) return;
    setError("");
    const res = await fetch("/api/hookahs", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: h.id }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "Failed to delete hookah");
      return;
    }
    if (editing?.id === h.id) setEditing(null);
    await load();
  }

  return (
    <div>
      {dialog}
      <div className="page-head">
        <div>
          <h1 className="page-title">Fleet</h1>
          <p className="page-sub">Hookah inventory and status</p>
        </div>
      </div>

      <form className="form panel" onSubmit={addHookah} style={{ marginBottom: "0.75rem" }}>
        <h2 className="panel-title">Add hookah</h2>
        <div className="form-row form-row-2">
          <div className="field">
            <label htmlFor="model">Model #</label>
            <input
              id="model"
              type="number"
              min="1"
              required
              value={modelNumber}
              onChange={(e) => setModelNumber(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="label">Label (optional)</label>
            <input
              id="label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </div>
        </div>
        {error && !editing ? <p className="login-error">{error}</p> : null}
        <button type="submit" className="btn btn-primary">
          Add hookah
        </button>
      </form>

      {loading ? (
        <p className="empty">Loading fleet…</p>
      ) : (
        <div className="fleet-grid">
          {hookahs.map((h) => (
            <div key={h.id} className="fleet-tile">
              <div className="fleet-num">#{h.modelNumber}</div>
              {h.label ? <div className="list-meta">{h.label}</div> : null}
              <StatusBadge status={h.status} kind="hookah" />
              {h.notes ? <p className="fleet-tile__notes">{h.notes}</p> : null}
              <div className="row-actions fleet-tile__actions">
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => openEdit(h)}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-danger-ghost"
                  onClick={() => void deleteHookah(h)}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
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
            aria-labelledby="edit-hookah-title"
            tabIndex={-1}
            onClick={(e) => e.stopPropagation()}
          >
            <form className="hookah-modal__body form" onSubmit={saveEdit}>
              <div className="hookah-modal__head">
                <h2 id="edit-hookah-title" className="hookah-modal__title">
                  Edit #{editing.modelNumber}
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
                  <label htmlFor="edit-model">Model #</label>
                  <input
                    id="edit-model"
                    type="number"
                    min="1"
                    required
                    value={editForm.modelNumber}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, modelNumber: e.target.value }))
                    }
                  />
                </div>
                <div className="field">
                  <label htmlFor="edit-status">Status</label>
                  <select
                    id="edit-status"
                    value={editForm.status}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, status: e.target.value }))
                    }
                  >
                    <option value="available">available</option>
                    <option value="out">out</option>
                    <option value="maintenance">maintenance</option>
                    <option value="retired">retired</option>
                  </select>
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
              <div className="field">
                <label htmlFor="edit-notes">Notes</label>
                <textarea
                  id="edit-notes"
                  rows={3}
                  value={editForm.notes}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, notes: e.target.value }))
                  }
                />
              </div>
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
                  onClick={() => void deleteHookah(editing)}
                >
                  Delete hookah
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
