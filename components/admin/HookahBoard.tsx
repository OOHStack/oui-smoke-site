"use client";

import { useCallback, useRef, useState, useMemo } from "react";
import gsap from "gsap";
import { Draggable } from "gsap/Draggable";
import { Flip } from "gsap/Flip";
import { useGSAP } from "@gsap/react";
import Countdown from "@/components/admin/Countdown";
import StatusBadge from "@/components/admin/StatusBadge";

gsap.registerPlugin(Draggable, Flip, useGSAP);

export type BoardFlavour = { id: number; name: string; active: boolean };
export type BoardHookah = {
  id: number;
  modelNumber: number;
  label: string | null;
  status: string;
};
export type BoardCall = {
  id: number;
  type: string;
  message: string | null;
  status: string;
  flavourLabel?: string | null;
  priceCents?: number | null;
  createdAt: string;
  acknowledgedAt: string | null;
};
export type BoardAssignment = {
  id: number;
  status: string;
  flavourId: number | null;
  flavourLabel: string | null;
  nextCheckAt: string | null;
  lastCheckedAt: string | null;
  checkCount: number;
  refillCount: number;
  sortOrder?: number;
  issueFlag: boolean;
  guestToken: string | null;
  sentOutAt: string | null;
  returnNotes: string | null;
  returnOutcome: "returned" | "not_returned" | "returned_with_issue" | null;
  hookah: BoardHookah;
  flavour: BoardFlavour | null;
  activeCall: BoardCall | null;
};

type BoardStatus = "staged" | "out" | "returned";

const BOARD_GROUPS: Array<{
  key: BoardStatus;
  title: string;
  hint: string;
  empty: string;
}> = [
  {
    key: "staged",
    title: "Ready to send",
    hint: "Drag freely · reorder anytime",
    empty: "Drop hookahs here to stage",
  },
  {
    key: "out",
    title: "On the floor",
    hint: "Drag here to send out · timers run here",
    empty: "Drop hookahs here to send them out",
  },
  {
    key: "returned",
    title: "Returned",
    hint: "Drop here to close out",
    empty: "Drop here when they come back",
  },
];

function callTypeLabel(type: string) {
  if (type === "coals") return "Coals";
  if (type === "refill") return "Refill";
  if (type === "issue") return "Issue";
  return "Help";
}

function assignmentHasFlavour(a: BoardAssignment) {
  return (
    a.flavourId != null ||
    !!(a.flavourLabel && a.flavourLabel.trim()) ||
    !!a.flavour
  );
}

function hitFromPoint(x: number, y: number, draggedEl: Element) {
  const stack = document.elementsFromPoint(x, y);
  let column: BoardStatus | null = null;
  let beforeId: number | null = null;

  for (const el of stack) {
    if (!(el instanceof HTMLElement)) continue;
    if (el === draggedEl || draggedEl.contains(el)) continue;

    if (!beforeId && el.dataset.assignmentId) {
      const id = Number(el.dataset.assignmentId);
      if (Number.isFinite(id)) beforeId = id;
    }
    if (!column && el.dataset.boardColumn) {
      const key = el.dataset.boardColumn;
      if (key === "staged" || key === "out" || key === "returned") {
        column = key;
      }
    }
    if (column && beforeId) break;
  }

  return { column, beforeId };
}

export default function HookahBoard({
  assignments,
  onBoardPlace,
  onOpen,
}: {
  assignments: BoardAssignment[];
  onBoardPlace: (payload: {
    assignmentId: number;
    toStatus: BoardStatus;
    beforeAssignmentId?: number | null;
  }) => Promise<{ ok: boolean; code?: string; error?: string }>;
  onOpen: (id: number, prompt?: string) => void;
}) {
  const boardRef = useRef<HTMLDivElement>(null);
  const [boardError, setBoardError] = useState("");
  const [overColumn, setOverColumn] = useState<BoardStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const dragMoved = useRef(false);
  const busyRef = useRef(false);

  const grouped = useMemo(() => {
    const map: Record<BoardStatus, BoardAssignment[]> = {
      staged: [],
      out: [],
      returned: [],
    };
    const sorted = [...assignments].sort((a, b) => {
      const ao = a.sortOrder ?? 0;
      const bo = b.sortOrder ?? 0;
      if (ao !== bo) return ao - bo;
      return a.id - b.id;
    });
    for (const a of sorted) {
      if (a.status === "staged" || a.status === "out" || a.status === "returned") {
        map[a.status].push(a);
      }
    }
    return map;
  }, [assignments]);

  const place = useCallback(
    async (
      assignment: BoardAssignment,
      toStatus: BoardStatus,
      beforeAssignmentId: number | null,
    ) => {
      if (busyRef.current) return;

      if (toStatus === "returned" && assignment.status !== "returned") {
        onOpen(
          assignment.id,
          "Close out this hookah — choose returned, not returned, or returned with issue.",
        );
        return;
      }

      if (toStatus === "out" && !assignmentHasFlavour(assignment)) {
        onOpen(
          assignment.id,
          "Assign a flavour, then send out to move this hookah onto the floor.",
        );
        return;
      }

      // Same slot no-op
      if (assignment.status === toStatus) {
        const col = grouped[toStatus];
        const fromIdx = col.findIndex((a) => a.id === assignment.id);
        const beforeIdx =
          beforeAssignmentId == null
            ? col.length
            : col.findIndex((a) => a.id === beforeAssignmentId);
        if (beforeIdx < 0) return;
        // inserting before self or before next sibling = no change
        if (beforeAssignmentId === assignment.id) return;
        if (beforeIdx === fromIdx || beforeIdx === fromIdx + 1) return;
        if (beforeAssignmentId == null && fromIdx === col.length - 1) return;
      }

      busyRef.current = true;
      setBusy(true);
      setBoardError("");

      const state = boardRef.current
        ? Flip.getState(boardRef.current.querySelectorAll("[data-flip-id]"))
        : null;

      const result = await onBoardPlace({
        assignmentId: assignment.id,
        toStatus,
        beforeAssignmentId,
      });

      if (!result.ok) {
        if (result.code === "NEED_FLAVOUR") {
          onOpen(
            assignment.id,
            "Assign a flavour, then send out to move this hookah onto the floor.",
          );
        } else if (result.code === "NEED_RETURN") {
          onOpen(
            assignment.id,
            "Close out this hookah — choose returned, not returned, or returned with issue.",
          );
        } else {
          setBoardError(result.error ?? "Couldn’t move hookah");
        }
      } else if (state) {
        requestAnimationFrame(() => {
          Flip.from(state, {
            duration: 0.45,
            ease: "power2.out",
            absolute: true,
            stagger: 0.015,
          });
        });
      }

      busyRef.current = false;
      setBusy(false);
      setOverColumn(null);
    },
    [grouped, onBoardPlace, onOpen],
  );

  useGSAP(
    () => {
      if (!boardRef.current) return;

      const tiles = gsap.utils.toArray<HTMLElement>(
        boardRef.current.querySelectorAll("[data-assignment-id]"),
      );

      const draggables = Draggable.create(tiles, {
        type: "x,y",
        zIndexBoost: true,
        edgeResistance: 0.85,
        inertia: false,
        dragClickables: true,
        onPress() {
          dragMoved.current = false;
          setBoardError("");
          (this.target as HTMLElement).classList.add("job-fleet-tile--dragging");
          gsap.to(this.target, { scale: 1.04, duration: 0.15, ease: "power2.out" });
        },
        onDrag() {
          if (Math.abs(this.x) + Math.abs(this.y) > 6) {
            dragMoved.current = true;
          }
          const { column } = hitFromPoint(
            this.pointerEvent?.clientX ?? 0,
            this.pointerEvent?.clientY ?? 0,
            this.target as Element,
          );
          setOverColumn(column);
        },
        onRelease() {
          (this.target as HTMLElement).classList.remove("job-fleet-tile--dragging");
        },
        async onDragEnd() {
          const target = this.target as HTMLElement;
          const assignmentId = Number(target.dataset.assignmentId);
          const assignment = assignments.find((a) => a.id === assignmentId);
          const pointerX = this.pointerEvent?.clientX ?? 0;
          const pointerY = this.pointerEvent?.clientY ?? 0;
          const { column, beforeId } = hitFromPoint(pointerX, pointerY, target);

          setOverColumn(null);

          // Clear drag chrome immediately so the tile can't sit above the
          // return/flavour modal (zIndexBoost leaves a huge inline z-index).
          gsap.killTweensOf(target);
          gsap.set(target, {
            x: 0,
            y: 0,
            scale: 1,
            clearProps: "zIndex,transform",
          });
          target.classList.remove("job-fleet-tile--dragging");

          if (!assignment || !column) return;

          await place(
            assignment,
            column,
            beforeId && beforeId !== assignment.id ? beforeId : null,
          );
        },
      });

      return () => {
        draggables.forEach((d) => d.kill());
      };
    },
    {
      scope: boardRef,
      dependencies: [assignments, grouped, place],
      revertOnUpdate: true,
    },
  );

  return (
    <>
      <p className="job-fleet-hint" style={{ marginBottom: "0.65rem" }}>
        Drag tiles between columns or between other tiles · drop anywhere, in any order · tap
        to open details
      </p>
      {boardError ? <p className="login-error">{boardError}</p> : null}
      {busy ? <p className="list-meta">Updating board…</p> : null}

      <div className="hookah-board-groups" ref={boardRef}>
        {BOARD_GROUPS.map((group) => {
          const items = grouped[group.key];
          return (
            <div
              key={group.key}
              className={[
                "hookah-group",
                `hookah-group--${group.key}`,
                overColumn === group.key ? "hookah-group--drop-target" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              data-board-column={group.key}
            >
              <div className="hookah-group__head">
                <div>
                  <h3 className="hookah-group__title">{group.title}</h3>
                  <p className="hookah-group__hint">{group.hint}</p>
                </div>
                <span className="hookah-group__count">{items.length}</span>
              </div>

              {items.length === 0 ? (
                <p className="hookah-group__empty">{group.empty}</p>
              ) : (
                <div className="fleet-grid job-fleet-grid">
                  {items.map((a) => (
                    <HookahTile
                      key={a.id}
                      assignment={a}
                      onOpen={() => {
                        if (dragMoved.current) return;
                        onOpen(a.id);
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

function HookahTile({
  assignment: a,
  onOpen,
}: {
  assignment: BoardAssignment;
  onOpen: () => void;
}) {
  const overdue =
    a.status === "out" &&
    !!a.nextCheckAt &&
    new Date(a.nextCheckAt).getTime() < Date.now();
  const flavourName = a.flavour?.name ?? a.flavourLabel ?? null;
  const call = a.activeCall;

  return (
    <button
      type="button"
      data-assignment-id={a.id}
      data-flip-id={`hookah-${a.id}`}
      className={[
        "fleet-tile",
        "job-fleet-tile",
        `job-fleet-tile--${a.status}`,
        overdue ? "job-fleet-tile--overdue" : "",
        a.issueFlag ? "job-fleet-tile--issue" : "",
        call ? `job-fleet-tile--call job-fleet-tile--call-${call.type}` : "",
        call?.status === "acknowledged" ? "job-fleet-tile--call-acked" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
      title={
        call
          ? `${callTypeLabel(call.type)}${call.message ? `: ${call.message}` : ""}${
              call.status === "acknowledged" ? " · on the way" : ""
            }`
          : undefined
      }
    >
      <div className="fleet-num">#{a.hookah.modelNumber}</div>
      <StatusBadge status={a.status} kind="assignment" />
      {flavourName ? <div className="list-meta">{flavourName}</div> : null}
      {a.status === "out" && a.nextCheckAt ? (
        <div className="job-fleet-tile__timer">
          <Countdown target={a.nextCheckAt} />
        </div>
      ) : null}
      {call ? (
        <span className={`hookah-call-chip hookah-call-chip--${call.type}`}>
          {call.status === "acknowledged"
            ? "On the way"
            : call.type === "refill" && call.flavourLabel
              ? `Refill: ${call.flavourLabel}`
              : callTypeLabel(call.type)}
          {call.message && call.type !== "refill" ? (
            <span className="hookah-call-chip__msg"> · {call.message}</span>
          ) : null}
        </span>
      ) : null}
      {a.issueFlag && !call ? (
        <span className="hookah-chip hookah-chip--issue">Issue</span>
      ) : null}
    </button>
  );
}
