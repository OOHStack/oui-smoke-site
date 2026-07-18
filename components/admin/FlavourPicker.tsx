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

function measureMenuPos(trigger: HTMLElement): MenuPos {
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
  return {
    top,
    left: rect.left,
    width: Math.max(rect.width, 160),
    maxHeight,
  };
}

/**
 * Custom listbox — native <select> menus close on live SSE re-renders.
 * Menu is portaled above the hookah modal backdrop.
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
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const listId = useId();
  const options = flavours.filter((f) => f.active !== false);
  const selected = value
    ? options.find((f) => String(f.id) === value)
    : undefined;

  function openMenu() {
    if (disabled || !rootRef.current) return;
    setPos(measureMenuPos(rootRef.current));
    setOpen(true);
  }

  function closeMenu() {
    setOpen(false);
  }

  useLayoutEffect(() => {
    if (!open || !rootRef.current) return;

    function place() {
      if (!rootRef.current) return;
      setPos(measureMenuPos(rootRef.current));
    }

    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    // Defer so the opening click does not immediately count as "outside".
    let active = false;
    const arm = window.setTimeout(() => {
      active = true;
    }, 0);

    function onPointerDown(e: MouseEvent | TouchEvent) {
      if (!active) return;
      const target = e.target as Node | null;
      if (!target) return;
      if (rootRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      closeMenu();
    }

    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      closeMenu();
    }

    document.addEventListener("mousedown", onPointerDown, true);
    document.addEventListener("touchstart", onPointerDown, true);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.clearTimeout(arm);
      document.removeEventListener("mousedown", onPointerDown, true);
      document.removeEventListener("touchstart", onPointerDown, true);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  function pick(next: string) {
    closeMenu();
    if (next !== value) onChange(next);
  }

  const menu =
    typeof document !== "undefined" && open && pos
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
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (disabled) return;
          if (open) closeMenu();
          else openMenu();
        }}
      >
        <span className="flavour-picker__label">
          {selected?.name ?? emptyLabel}
        </span>
        <span className="flavour-picker__caret" aria-hidden>
          <svg
            width="12"
            height="8"
            viewBox="0 0 12 8"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M1.2 1.6 6 6.4 10.8 1.6"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </button>
      {menu}
    </div>
  );
}
