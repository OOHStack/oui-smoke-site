"use client";

import { useEffect, useId, useRef, useState } from "react";

export type AdminToolbarMenuItem = {
  label: string;
  onClick: () => void | Promise<void>;
  disabled?: boolean;
  title?: string;
  danger?: boolean;
};

/** Compact toolbar dropdown for job tools (Prep / Display). */
export function AdminToolbarMenu({
  label,
  items,
  disabled,
  primary,
  title,
}: {
  label: string;
  items: AdminToolbarMenuItem[];
  disabled?: boolean;
  primary?: boolean;
  title?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="admin-toolbar-menu" ref={rootRef}>
      <button
        type="button"
        className={`btn btn-sm admin-toolbar-menu__trigger${
          primary ? " btn-primary" : ""
        }`}
        disabled={disabled}
        title={title}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((v) => !v)}
      >
        {label}
        <span className="admin-toolbar-menu__caret" aria-hidden>
          ▾
        </span>
      </button>
      {open ? (
        <div className="admin-toolbar-menu__panel" id={menuId} role="menu">
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              className={`admin-toolbar-menu__item${
                item.danger ? " admin-toolbar-menu__item--danger" : ""
              }`}
              disabled={disabled || item.disabled}
              title={item.title}
              onClick={() => {
                setOpen(false);
                void item.onClick();
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
