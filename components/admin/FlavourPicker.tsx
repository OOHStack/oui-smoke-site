"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

export type FlavourOption = { id: number; name: string; active?: boolean };

type MenuPos = { top: number; left: number; width: number; maxHeight: number };

/**
 * Custom listbox — native <select> menus close whenever React re-renders the
 * parent (live SSE on the job page), which made flavour picking unusable.
 * Menu is portaled so modal overflow cannot clip it.
 */
export function FlavourPicker({
  value,
  flavours,
  disabled = false,
  emptyLabel = "Select a flavour",
  onChange,
}: {
  value: string;
  flavours: FlavourOption[];
  disabled?: boolean;
  emptyLabel?: string;
  onChange: (next: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<MenuPos | null>(null);
  const [mounted, setMounted] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const listId = useId();
  const options = flavours.filter((f) => f.active !== false);
  const selected = value
    ? options.find((f) => String(f.id) === value)
    : undefined;

  useEffect(() => {
    setMounted(true);
  }, []);

  useLayoutEffect(() => {
    if (!open || !rootRef.current) {
      setPos(null);
      return;
    }

    function place() {
      const trigger = rootRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const gap = 6;
      const viewportPad = 8;
      const spaceBelow = window.innerHeight - rect.bottom - gap - viewportPad;
      const spaceAbove = rect.top - gap - viewportPad;
      const preferBelow = spaceBelow >= 160 || spaceBelow >= spaceAbove;
      const maxHeight = Math.max(
        120,
        Math.min(280, preferBelow ? spaceBelow : spaceAbove),
      );
      const top = preferBelow
        ? rect.bottom + gap
        : Math.max(viewportPad, rect.top - gap - maxHeight);
      setPos({
        top,
        left: rect.left,
        width: rect.width,
        maxHeight,
      });
    }

    place();
    window.addEventListener("resize", place);
    // Capture scroll from modal body / page without closing.
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(e: MouseEvent | TouchEvent) {
      const target = e.target as Node | null;
      if (!target) return;
      if (rootRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    }

    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    // Capture so the hookah modal Escape handler does not close the dialog.
    window.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  function pick(next: string) {
    setOpen(false);
    if (next !== value) onChange(next);
  }

  const menu =
    open && pos && mounted
      ? createPortal(
          <ul
            ref={menuRef}
            id={listId}
            className="flavour-picker__menu flavour-picker__menu--portal"
            role="listbox"
            aria-label="Flavours"
            style={{
              top: pos.top,
              left: pos.left,
              width: pos.width,
              maxHeight: pos.maxHeight,
            }}
          >
            <li role="presentation">
              <button
                type="button"
                role="option"
                aria-selected={!value}
                className={`flavour-picker__option${
                  !value ? " is-active" : ""
                }`}
                onClick={() => pick("")}
              >
                {emptyLabel}
              </button>
            </li>
            {options.map((f) => {
              const id = String(f.id);
              const active = value === id;
              return (
                <li key={f.id} role="presentation">
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    className={`flavour-picker__option${
                      active ? " is-active" : ""
                    }`}
                    onClick={() => pick(id)}
                  >
                    {f.name}
                  </button>
                </li>
              );
            })}
          </ul>,
          document.body,
        )
      : null;

  return (
    <div
      ref={rootRef}
      className={`flavour-picker${open ? " is-open" : ""}${
        disabled ? " is-disabled" : ""
      }`}
    >
      <button
        type="button"
        className={`flavour-picker__trigger${value ? "" : " is-empty"}`}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => {
          if (!disabled) setOpen((v) => !v);
        }}
      >
        <span className="flavour-picker__label">
          {selected?.name ?? emptyLabel}
        </span>
        <span className="flavour-picker__caret" aria-hidden>
          ▾
        </span>
      </button>
      {menu}
    </div>
  );
}
