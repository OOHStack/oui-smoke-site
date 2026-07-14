"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useConfirm } from "@/components/admin/ConfirmDialog";

type Flavour = {
  id: number;
  name: string;
  kind: "single" | "mix";
  components: string | null;
  description: string | null;
  active: boolean;
  timesUsed: number;
};

type FlavourForm = {
  name: string;
  kind: string;
  components: string;
  description: string;
  active: boolean;
};

const emptyForm: FlavourForm = {
  name: "",
  kind: "single",
  components: "",
  description: "",
  active: true,
};

export default function FlavoursPage() {
  const { confirm, dialog } = useConfirm();
  const [flavours, setFlavours] = useState<Flavour[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState<Flavour | null>(null);
  const [editForm, setEditForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/flavours");
    if (res.ok) {
      const data = await res.json();
      setFlavours(data.flavours ?? data);
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
    const res = await fetch("/api/flavours", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        kind: form.kind,
        components: form.components || undefined,
        description: form.description || undefined,
      }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "Failed to add flavour");
      return;
    }
    setForm(emptyForm);
    await load();
  }

  function openEdit(f: Flavour) {
    setEditing(f);
    setEditForm({
      name: f.name,
      kind: f.kind,
      components: f.components ?? "",
      description: f.description ?? "",
      active: f.active,
    });
    setError("");
  }

  async function saveEdit(e: FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/flavours", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editing.id,
          name: editForm.name,
          kind: editForm.kind,
          components: editForm.components,
          description: editForm.description,
          active: editForm.active,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? "Failed to update flavour");
        return;
      }
      setEditing(null);
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function setActive(f: Flavour, active: boolean) {
    setError("");
    setBusyId(f.id);
    try {
      const res = await fetch("/api/flavours", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: f.id, active }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? "Failed to update flavour");
        return;
      }
      setFlavours((prev) =>
        prev.map((row) => (row.id === f.id ? { ...row, active } : row)),
      );
    } finally {
      setBusyId(null);
    }
  }

  async function deleteFlavour(f: Flavour) {
    const ok = await confirm({
      title: "Delete flavour?",
      message: `Delete “${f.name}”? Past jobs keep the flavour name on record, but this menu item will be removed.`,
      confirmLabel: "Delete flavour",
    });
    if (!ok) return;
    setError("");
    setBusyId(f.id);
    try {
      const res = await fetch("/api/flavours", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: f.id }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? "Failed to delete flavour");
        return;
      }
      if (editing?.id === f.id) setEditing(null);
      setFlavours((prev) => prev.filter((row) => row.id !== f.id));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      {dialog}
      <div className="page-head">
        <div>
          <h1 className="page-title">Flavours</h1>
          <p className="page-sub">
            Guests see name + description only — recipe components stay staff-side
          </p>
        </div>
      </div>

      {error ? <p className="login-error">{error}</p> : null}

      <form className="form panel" onSubmit={handleAdd} style={{ marginBottom: "0.75rem" }}>
        <h2 className="panel-title">Add flavour</h2>
        <div className="form-row form-row-2">
          <div className="field">
            <label htmlFor="name">Name</label>
            <input
              id="name"
              required
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>
          <div className="field">
            <label htmlFor="kind">Kind</label>
            <select
              id="kind"
              value={form.kind}
              onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value }))}
            >
              <option value="single">Single</option>
              <option value="mix">Blend</option>
            </select>
          </div>
        </div>
        <div className="field">
          <label htmlFor="description">Guest description</label>
          <input
            id="description"
            placeholder="Short vibe guests will read"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          />
        </div>
        {form.kind === "mix" ? (
          <div className="field">
            <label htmlFor="components">Staff recipe (hidden from guests)</label>
            <input
              id="components"
              placeholder="e.g. Strawberry, Orange, Ice"
              value={form.components}
              onChange={(e) =>
                setForm((f) => ({ ...f, components: e.target.value }))
              }
            />
          </div>
        ) : null}
        <button type="submit" className="btn btn-primary">
          Add flavour
        </button>
      </form>

      {loading ? (
        <p className="empty">Loading flavours…</p>
      ) : flavours.length === 0 ? (
        <p className="empty">No flavours yet.</p>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Kind</th>
                <th>Description</th>
                <th>Recipe</th>
                <th>Used</th>
                <th>Active</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {flavours.map((f) => (
                <tr key={f.id}>
                  <td>{f.name}</td>
                  <td>
                    <span className="badge">{f.kind === "mix" ? "blend" : f.kind}</span>
                  </td>
                  <td>{f.description || "—"}</td>
                  <td>{f.components || "—"}</td>
                  <td>{f.timesUsed}</td>
                  <td>
                    <span className={`chip ${f.active ? "active" : ""}`}>
                      {f.active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td>
                    <div className="row-actions">
                      <button
                        type="button"
                        className="btn btn-sm"
                        disabled={busyId === f.id}
                        onClick={() => void setActive(f, !f.active)}
                      >
                        {f.active ? "Deactivate" : "Activate"}
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm"
                        onClick={() => openEdit(f)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm btn-danger-ghost"
                        disabled={busyId === f.id}
                        onClick={() => void deleteFlavour(f)}
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
            aria-labelledby="edit-flavour-title"
            tabIndex={-1}
            onClick={(e) => e.stopPropagation()}
          >
            <form className="hookah-modal__body form" onSubmit={saveEdit}>
              <div className="hookah-modal__head">
                <h2 id="edit-flavour-title" className="hookah-modal__title">
                  Edit flavour
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
                  <label htmlFor="edit-name">Name</label>
                  <input
                    id="edit-name"
                    required
                    value={editForm.name}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, name: e.target.value }))
                    }
                  />
                </div>
                <div className="field">
                  <label htmlFor="edit-kind">Kind</label>
                  <select
                    id="edit-kind"
                    value={editForm.kind}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, kind: e.target.value }))
                    }
                  >
                    <option value="single">Single</option>
                    <option value="mix">Blend</option>
                  </select>
                </div>
              </div>
              <div className="field">
                <label htmlFor="edit-description">Guest description</label>
                <input
                  id="edit-description"
                  value={editForm.description}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, description: e.target.value }))
                  }
                />
              </div>
              {editForm.kind === "mix" ? (
                <div className="field">
                  <label htmlFor="edit-components">Staff recipe (hidden from guests)</label>
                  <input
                    id="edit-components"
                    value={editForm.components}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, components: e.target.value }))
                    }
                  />
                </div>
              ) : null}
              <label className="hookah-check">
                <input
                  type="checkbox"
                  checked={editForm.active}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, active: e.target.checked }))
                  }
                />
                Active on the menu
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
                  onClick={() => void deleteFlavour(editing)}
                >
                  Delete flavour
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
