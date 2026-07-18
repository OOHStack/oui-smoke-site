"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type Ref,
} from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCorners,
  getFirstCollision,
  pointerWithin,
  rectIntersection,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DraggableAttributes,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import Countdown from "@/components/admin/Countdown";
import StatusBadge from "@/components/admin/StatusBadge";
import { refillPayChip, unitPayChip } from "@/lib/ops/guest-pay";

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
  payPreference?: "phone" | "terminal" | null;
  paymentStatus?: string | null;
  checkoutUrl?: string | null;
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
  guestPayTier?: "standard" | "unlimited" | null;
  unitPaymentStatus?: string | null;
  sentOutAt: string | null;
  returnNotes: string | null;
  returnOutcome: "returned" | "not_returned" | "returned_with_issue" | null;
  hookah: BoardHookah;
  flavour: BoardFlavour | null;
  activeCall: BoardCall | null;
};

type BoardStatus = "staged" | "out" | "returned";
type Columns = Record<BoardStatus, number[]>;

const BOARD_GROUPS: Array<{
  key: BoardStatus;
  title: string;
  hint: string;
  empty: string;
}> = [
  {
    key: "staged",
    title: "Ready to send",
    hint: "Set flavour here for prep · then send out",
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

const COLUMN_IDS: BoardStatus[] = ["staged", "out", "returned"];

function callTypeLabel(type: string) {
  if (type === "coals") return "Coals";
  if (type === "refill") return "Refill";
  if (type === "order_unit") return "Floor order";
  if (type === "issue") return "Issue";
  return "Help";
}

function callChipText(call: BoardCall) {
  if (call.type === "order_unit") {
    return call.status === "acknowledged" ? "Floor order · claimed" : "Floor order";
  }
  if (call.status === "acknowledged") return "On the way";
  if (call.type === "refill" && call.flavourLabel) {
    return `Refill · ${call.flavourLabel}`;
  }
  return callTypeLabel(call.type);
}

function isRedundantHookahLabel(label: string, modelNumber: number) {
  const n = String(modelNumber);
  const normalized = label.trim().toLowerCase().replace(/\s+/g, " ");
  return (
    normalized === n ||
    normalized === `#${n}` ||
    normalized === `hookah #${n}` ||
    normalized === `hookah ${n}`
  );
}

function assignmentHasFlavour(a: BoardAssignment) {
  return (
    a.flavourId != null ||
    !!(a.flavourLabel && a.flavourLabel.trim()) ||
    !!a.flavour
  );
}

function isColumnId(id: UniqueIdentifier): id is BoardStatus {
  return id === "staged" || id === "out" || id === "returned";
}

function toItemId(id: number): string {
  return String(id);
}

function parseItemId(id: UniqueIdentifier): number | null {
  if (isColumnId(id)) return null;
  const n = Number(id);
  return Number.isFinite(n) ? n : null;
}

function sortAssignments(list: BoardAssignment[]) {
  return [...list].sort((a, b) => {
    const ao = a.sortOrder ?? 0;
    const bo = b.sortOrder ?? 0;
    if (ao !== bo) return ao - bo;
    return a.id - b.id;
  });
}

function columnsFromAssignments(assignments: BoardAssignment[]): Columns {
  const map: Columns = { staged: [], out: [], returned: [] };
  for (const a of sortAssignments(assignments)) {
    if (a.status === "staged" || a.status === "out" || a.status === "returned") {
      map[a.status].push(a.id);
    }
  }
  return map;
}

function itemsByIdFromAssignments(assignments: BoardAssignment[]) {
  const map: Record<number, BoardAssignment> = {};
  for (const a of assignments) map[a.id] = a;
  return map;
}

function findContainer(
  columns: Columns,
  id: UniqueIdentifier,
): BoardStatus | null {
  if (isColumnId(id)) return id;
  const itemId = parseItemId(id);
  if (itemId == null) return null;
  for (const key of COLUMN_IDS) {
    if (columns[key].includes(itemId)) return key;
  }
  return null;
}

function canEnterColumn(
  assignment: BoardAssignment,
  toStatus: BoardStatus,
): { ok: true } | { ok: false; reason: "NEED_FLAVOUR" | "NEED_RETURN" } {
  if (toStatus === "returned" && assignment.status !== "returned") {
    return { ok: false, reason: "NEED_RETURN" };
  }
  if (
    toStatus === "out" &&
    assignment.status !== "out" &&
    !assignmentHasFlavour(assignment)
  ) {
    return { ok: false, reason: "NEED_FLAVOUR" };
  }
  // Tier gate is server-side + modal; allow optimistic move — server will reject.
  return { ok: true };
}

export default function HookahBoard({
  assignments,
  onBoardPlace,
  onOpen,
  paymentModel,
  onBulkAction,
}: {
  assignments: BoardAssignment[];
  onBoardPlace: (payload: {
    assignmentId: number;
    toStatus: BoardStatus;
    beforeAssignmentId?: number | null;
  }) => Promise<{ ok: boolean; code?: string; error?: string }>;
  onOpen: (id: number, prompt?: string) => void;
  paymentModel?: "client_deposit" | "pay_at_event" | "complimentary";
  onBulkAction?: (payload: {
    bulkAction:
      | "send_out"
      | "check"
      | "return"
      | "restage"
      | "remove"
      | "set_guest_pay_tier";
    assignmentIds: number[];
    guestPayTier?: "standard" | "unlimited";
    outcome?: "returned" | "not_returned" | "returned_with_issue";
  }) => Promise<{ succeeded: number; failed: number; message?: string }>;
}) {
  const [itemsById, setItemsById] = useState(() =>
    itemsByIdFromAssignments(assignments),
  );
  const [columns, setColumns] = useState(() =>
    columnsFromAssignments(assignments),
  );
  const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null);
  const [overColumn, setOverColumn] = useState<BoardStatus | null>(null);
  const [boardError, setBoardError] = useState("");
  const [bulkMsg, setBulkMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(() => new Set());

  const columnsRef = useRef(columns);
  const itemsByIdRef = useRef(itemsById);
  const busyRef = useRef(false);

  columnsRef.current = columns;
  itemsByIdRef.current = itemsById;

  // Sync from server when not mid-drag / mid-save
  useEffect(() => {
    if (activeId != null || busy) return;
    setItemsById(itemsByIdFromAssignments(assignments));
    setColumns(columnsFromAssignments(assignments));
    const alive = new Set(assignments.map((a) => a.id));
    setSelected((prev) => {
      const next = new Set<number>();
      for (const id of prev) {
        if (alive.has(id)) next.add(id);
      }
      return next.size === prev.size ? prev : next;
    });
  }, [assignments, activeId, busy]);

  function toggleSelected(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setBulkMsg("");
  }

  function setColumnSelected(status: BoardStatus, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of columns[status]) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });
    setBulkMsg("");
  }

  function selectedInColumn(status: BoardStatus) {
    return columns[status].filter((id) => selected.has(id));
  }

  async function runBulk(
    status: BoardStatus,
    bulkAction:
      | "send_out"
      | "check"
      | "return"
      | "restage"
      | "remove"
      | "set_guest_pay_tier",
    extra?: {
      guestPayTier?: "standard" | "unlimited";
      outcome?: "returned" | "not_returned" | "returned_with_issue";
    },
  ) {
    if (!onBulkAction) return;
    const ids = selectedInColumn(status);
    if (ids.length === 0) return;
    setBulkBusy(true);
    setBulkMsg("");
    setBoardError("");
    try {
      const result = await onBulkAction({
        bulkAction,
        assignmentIds: ids,
        ...extra,
      });
      setSelected((prev) => {
        const next = new Set(prev);
        for (const id of ids) next.delete(id);
        return next;
      });
      const parts = [`${result.succeeded} updated`];
      if (result.failed > 0) parts.push(`${result.failed} skipped`);
      setBulkMsg(result.message ?? parts.join(" · "));
    } finally {
      setBulkBusy(false);
    }
  }

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 180, tolerance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const collisionDetection: CollisionDetection = useCallback((args) => {
    const pointerCollisions = pointerWithin(args);
    const intersections =
      pointerCollisions.length > 0 ? pointerCollisions : rectIntersection(args);

    let overId = getFirstCollision(intersections, "id");
    if (overId == null) {
      return closestCorners(args);
    }

    if (isColumnId(overId)) {
      const containerItems = columnsRef.current[overId];
      if (containerItems.length > 0) {
        overId = closestCorners({
          ...args,
          droppableContainers: args.droppableContainers.filter((container) =>
            containerItems.includes(Number(container.id)),
          ),
        })[0]?.id;
      }
    }

    return overId != null ? [{ id: overId }] : [];
  }, []);

  const activeAssignment = useMemo(() => {
    const id = activeId != null ? parseItemId(activeId) : null;
    return id != null ? itemsById[id] ?? null : null;
  }, [activeId, itemsById]);

  const persistPlace = useCallback(
    async (
      assignmentId: number,
      toStatus: BoardStatus,
      orderedIds: number[],
      snapshot: { columns: Columns; itemsById: Record<number, BoardAssignment> },
    ) => {
      const beforeAssignmentId = (() => {
        const idx = orderedIds.indexOf(assignmentId);
        if (idx < 0 || idx === orderedIds.length - 1) return null;
        return orderedIds[idx + 1] ?? null;
      })();

      busyRef.current = true;
      setBusy(true);
      setBoardError("");

      const result = await onBoardPlace({
        assignmentId,
        toStatus,
        beforeAssignmentId,
      });

      if (!result.ok) {
        setColumns(snapshot.columns);
        setItemsById(snapshot.itemsById);

        if (result.code === "NEED_FLAVOUR") {
          onOpen(
            assignmentId,
            "Assign a flavour, then send out to move this hookah onto the floor.",
          );
        } else if (result.code === "NEED_GUEST_TIER") {
          onOpen(
            assignmentId,
            "Choose Standard ($80) or Unlimited ($100) guest pay, then send out.",
          );
        } else if (result.code === "NEED_RETURN") {
          onOpen(
            assignmentId,
            "Close out this hookah — choose returned, not returned, or returned with issue.",
          );
        } else {
          setBoardError(result.error ?? "Couldn’t move hookah");
        }
      }

      busyRef.current = false;
      setBusy(false);
      setOverColumn(null);
    },
    [onBoardPlace, onOpen],
  );

  function handleDragStart(event: DragStartEvent) {
    setBoardError("");
    setActiveId(event.active.id);
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over) {
      setOverColumn(null);
      return;
    }

    const activeItemId = parseItemId(active.id);
    if (activeItemId == null) return;

    const overContainer = findContainer(columnsRef.current, over.id);
    setOverColumn(overContainer);

    const activeContainer = findContainer(columnsRef.current, active.id);
    if (!activeContainer || !overContainer || activeContainer === overContainer) {
      return;
    }

    const assignment = itemsByIdRef.current[activeItemId];
    if (!assignment) return;

    const gate = canEnterColumn(assignment, overContainer);
    if (!gate.ok) return;

    setColumns((prev) => {
      const activeItems = prev[activeContainer];
      const overItems = prev[overContainer];
      const activeIndex = activeItems.indexOf(activeItemId);
      if (activeIndex < 0) return prev;

      let newIndex: number;
      if (isColumnId(over.id)) {
        newIndex = overItems.length + 1;
      } else {
        const overItemId = parseItemId(over.id);
        const overIndex = overItemId != null ? overItems.indexOf(overItemId) : -1;
        const isBelowOverItem =
          over &&
          active.rect.current.translated &&
          active.rect.current.translated.top >
            over.rect.top + over.rect.height;

        const modifier = isBelowOverItem ? 1 : 0;
        newIndex = overIndex >= 0 ? overIndex + modifier : overItems.length + 1;
      }

      return {
        ...prev,
        [activeContainer]: activeItems.filter((id) => id !== activeItemId),
        [overContainer]: [
          ...overItems.slice(0, newIndex),
          activeItemId,
          ...overItems.slice(newIndex),
        ],
      };
    });

    setItemsById((prev) => ({
      ...prev,
      [activeItemId]: { ...prev[activeItemId], status: overContainer },
    }));
  }

  function handleDragCancel() {
    setActiveId(null);
    setOverColumn(null);
    setItemsById(itemsByIdFromAssignments(assignments));
    setColumns(columnsFromAssignments(assignments));
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);

    const activeItemId = parseItemId(active.id);
    if (activeItemId == null) {
      setOverColumn(null);
      return;
    }

    const snapshot = {
      columns: columnsFromAssignments(assignments),
      itemsById: itemsByIdFromAssignments(assignments),
    };

    const assignment = snapshot.itemsById[activeItemId];
    if (!assignment) {
      setOverColumn(null);
      return;
    }

    let nextColumns = columnsRef.current;
    const overContainer = over
      ? findContainer(nextColumns, over.id)
      : findContainer(nextColumns, active.id);

    if (!over || !overContainer) {
      handleDragCancel();
      return;
    }

    const gate = canEnterColumn(assignment, overContainer);
    if (!gate.ok) {
      setColumns(snapshot.columns);
      setItemsById(snapshot.itemsById);
      setOverColumn(null);
      if (gate.reason === "NEED_FLAVOUR") {
        onOpen(
          activeItemId,
          "Assign a flavour, then send out to move this hookah onto the floor.",
        );
      } else {
        onOpen(
          activeItemId,
          "Close out this hookah — choose returned, not returned, or returned with issue.",
        );
      }
      return;
    }

    const activeContainer = findContainer(nextColumns, active.id) ?? overContainer;

    // Same-column reorder on drop
    if (activeContainer === overContainer && !isColumnId(over.id)) {
      const overItemId = parseItemId(over.id);
      if (overItemId != null && activeItemId !== overItemId) {
        const list = nextColumns[overContainer];
        const oldIndex = list.indexOf(activeItemId);
        const newIndex = list.indexOf(overItemId);
        if (oldIndex >= 0 && newIndex >= 0 && oldIndex !== newIndex) {
          nextColumns = {
            ...nextColumns,
            [overContainer]: arrayMove(list, oldIndex, newIndex),
          };
          setColumns(nextColumns);
        }
      }
    }

    // Ensure status reflects destination
    setItemsById((prev) => ({
      ...prev,
      [activeItemId]: { ...prev[activeItemId], status: overContainer },
    }));

    const orderedIds = nextColumns[overContainer];
    const fromColumn = (() => {
      for (const key of COLUMN_IDS) {
        if (snapshot.columns[key].includes(activeItemId)) return key;
      }
      return assignment.status as BoardStatus;
    })();

    const fromOrder = snapshot.columns[fromColumn] ?? [];
    const unchanged =
      fromColumn === overContainer &&
      fromOrder.length === orderedIds.length &&
      fromOrder.every((id, i) => id === orderedIds[i]);

    setOverColumn(null);

    if (unchanged) return;

    await persistPlace(activeItemId, overContainer, orderedIds, snapshot);
  }

  return (
    <>
      <p className="job-fleet-hint" style={{ marginBottom: "0.65rem" }}>
        Drag to move · tap to open · Select all, then tap cards to multi-select
      </p>
      {boardError ? <p className="login-error">{boardError}</p> : null}
      {bulkMsg ? <p className="list-meta">{bulkMsg}</p> : null}
      {busy || bulkBusy ? (
        <p className="list-meta">{bulkBusy ? "Running bulk…" : "Updating board…"}</p>
      ) : null}

      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <div className="hookah-board-groups">
          {BOARD_GROUPS.map((group) => (
            <BoardColumn
              key={group.key}
              group={group}
              itemIds={columns[group.key]}
              itemsById={itemsById}
              isOver={overColumn === group.key}
              activeId={activeId}
              selected={selected}
              paymentModel={paymentModel}
              bulkBusy={bulkBusy}
              onOpen={onOpen}
              onToggleSelected={toggleSelected}
              onSelectAll={(on) => setColumnSelected(group.key, on)}
              onBulk={(action, extra) => runBulk(group.key, action, extra)}
            />
          ))}
        </div>

        <DragOverlay dropAnimation={{ duration: 180, easing: "ease" }}>
          {activeAssignment ? (
            <HookahTileContent
              assignment={activeAssignment}
              className="job-fleet-tile--dragging job-fleet-tile--overlay"
            />
          ) : null}
        </DragOverlay>
      </DndContext>
    </>
  );
}

function BoardColumn({
  group,
  itemIds,
  itemsById,
  isOver,
  activeId,
  selected,
  paymentModel,
  bulkBusy,
  onOpen,
  onToggleSelected,
  onSelectAll,
  onBulk,
}: {
  group: (typeof BOARD_GROUPS)[number];
  itemIds: number[];
  itemsById: Record<number, BoardAssignment>;
  isOver: boolean;
  activeId: UniqueIdentifier | null;
  selected: Set<number>;
  paymentModel?: "client_deposit" | "pay_at_event" | "complimentary";
  bulkBusy: boolean;
  onOpen: (id: number, prompt?: string) => void;
  onToggleSelected: (id: number) => void;
  onSelectAll: (on: boolean) => void;
  onBulk: (
    action:
      | "send_out"
      | "check"
      | "return"
      | "restage"
      | "remove"
      | "set_guest_pay_tier",
    extra?: {
      guestPayTier?: "standard" | "unlimited";
      outcome?: "returned" | "not_returned" | "returned_with_issue";
    },
  ) => void;
}) {
  const { setNodeRef, isOver: isOverDroppable } = useDroppable({
    id: group.key,
  });

  const sortableIds = useMemo(() => itemIds.map(toItemId), [itemIds]);
  const selectedIds = itemIds.filter((id) => selected.has(id));
  const allSelected = itemIds.length > 0 && selectedIds.length === itemIds.length;
  const someSelected = selectedIds.length > 0;
  const payAtEvent = paymentModel === "pay_at_event";

  return (
    <div
      ref={setNodeRef}
      className={[
        "hookah-group",
        `hookah-group--${group.key}`,
        isOver || isOverDroppable ? "hookah-group--drop-target" : "",
        someSelected ? "hookah-group--has-selection" : "",
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
        <div className="hookah-group__head-aside">
          {itemIds.length > 0 ? (
            <button
              type="button"
              className={`hookah-group__select-all${allSelected ? " is-on" : ""}`}
              disabled={bulkBusy}
              onClick={() => onSelectAll(!allSelected)}
            >
              {allSelected ? "Clear all" : "Select all"}
            </button>
          ) : null}
          <span className="hookah-group__count">{itemIds.length}</span>
        </div>
      </div>

      {someSelected ? (
        <div className="hookah-bulk" role="toolbar" aria-label={`${group.title} bulk actions`}>
          <span className="hookah-bulk__count">{selectedIds.length} selected</span>
          {group.key === "staged" ? (
            <>
              <button
                type="button"
                className="btn btn-sm btn-primary"
                disabled={bulkBusy}
                onClick={() => onBulk("send_out")}
              >
                Send to floor
              </button>
              {payAtEvent ? (
                <>
                  <button
                    type="button"
                    className="btn btn-sm btn-primary"
                    disabled={bulkBusy}
                    onClick={() =>
                      onBulk("send_out", { guestPayTier: "standard" })
                    }
                  >
                    Send as Standard
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-primary"
                    disabled={bulkBusy}
                    onClick={() =>
                      onBulk("send_out", { guestPayTier: "unlimited" })
                    }
                  >
                    Send as Unlimited
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm"
                    disabled={bulkBusy}
                    onClick={() =>
                      onBulk("set_guest_pay_tier", { guestPayTier: "standard" })
                    }
                  >
                    Tier · Standard
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm"
                    disabled={bulkBusy}
                    onClick={() =>
                      onBulk("set_guest_pay_tier", {
                        guestPayTier: "unlimited",
                      })
                    }
                  >
                    Tier · Unlimited
                  </button>
                </>
              ) : null}
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                disabled={bulkBusy}
                onClick={() => onBulk("remove")}
              >
                Remove
              </button>
            </>
          ) : null}
          {group.key === "out" ? (
            <>
              <button
                type="button"
                className="btn btn-sm"
                disabled={bulkBusy}
                onClick={() => onBulk("check")}
              >
                Log check
              </button>
              <button
                type="button"
                className="btn btn-sm btn-primary"
                disabled={bulkBusy}
                onClick={() => onBulk("return", { outcome: "returned" })}
              >
                Return OK
              </button>
            </>
          ) : null}
          {group.key === "returned" ? (
            <button
              type="button"
              className="btn btn-sm btn-primary"
              disabled={bulkBusy}
              onClick={() => onBulk("restage")}
            >
              Move to ready
            </button>
          ) : null}
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            disabled={bulkBusy}
            onClick={() => onSelectAll(false)}
          >
            Clear
          </button>
        </div>
      ) : null}

      <SortableContext items={sortableIds} strategy={rectSortingStrategy}>
        {itemIds.length === 0 ? (
          <p className="hookah-group__empty">{group.empty}</p>
        ) : (
          <div className="fleet-grid job-fleet-grid">
            {itemIds.map((id) => {
              const a = itemsById[id];
              if (!a) return null;
              return (
                <SortableHookahTile
                  key={id}
                  assignment={a}
                  isActive={activeId === toItemId(id)}
                  selected={selected.has(id)}
                  selectMode={someSelected}
                  showUnitPay={payAtEvent}
                  onOpen={() => onOpen(id)}
                  onToggleSelected={() => onToggleSelected(id)}
                />
              );
            })}
          </div>
        )}
      </SortableContext>
    </div>
  );
}

function SortableHookahTile({
  assignment,
  isActive,
  selected,
  selectMode,
  showUnitPay,
  onOpen,
  onToggleSelected,
}: {
  assignment: BoardAssignment;
  isActive: boolean;
  selected: boolean;
  selectMode: boolean;
  showUnitPay?: boolean;
  onOpen: () => void;
  onToggleSelected: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: toItemId(assignment.id) });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <HookahTileContent
      ref={setNodeRef}
      assignment={assignment}
      style={style}
      className={[
        isDragging || isActive ? "job-fleet-tile--ghost" : "",
        selected ? "job-fleet-tile--selected" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      attributes={attributes}
      listeners={listeners}
      selected={selected}
      selectMode={selectMode}
      showUnitPay={showUnitPay}
      onOpen={onOpen}
      onToggleSelected={onToggleSelected}
      suppressClick={isDragging || isActive}
    />
  );
}

function HookahTileContent({
  assignment: a,
  className,
  style,
  attributes,
  listeners,
  selected,
  selectMode,
  showUnitPay,
  onOpen,
  onToggleSelected,
  suppressClick,
  ref,
}: {
  assignment: BoardAssignment;
  className?: string;
  style?: CSSProperties;
  attributes?: DraggableAttributes;
  listeners?: ReturnType<typeof useSortable>["listeners"];
  selected?: boolean;
  selectMode?: boolean;
  showUnitPay?: boolean;
  onOpen?: () => void;
  onToggleSelected?: () => void;
  suppressClick?: boolean;
  ref?: Ref<HTMLButtonElement>;
}) {
  const overdue =
    a.status === "out" &&
    !!a.nextCheckAt &&
    new Date(a.nextCheckAt).getTime() < Date.now();
  const flavourName = a.flavour?.name ?? a.flavourLabel ?? null;
  const call = a.activeCall;
  const rawLabel = a.hookah.label?.trim() || null;
  const label =
    rawLabel && !isRedundantHookahLabel(rawLabel, a.hookah.modelNumber)
      ? rawLabel
      : null;
  const unitChip =
    showUnitPay && a.guestPayTier ? unitPayChip(a.unitPaymentStatus) : null;
  const unitTone =
    a.unitPaymentStatus === "succeeded"
      ? "paid"
      : a.unitPaymentStatus === "pending"
        ? "awaiting"
        : "terminal";
  const refillChip =
    call?.type === "refill"
      ? refillPayChip({
          priceCents: call.priceCents,
          payPreference: call.payPreference,
          paymentStatus: call.paymentStatus,
        })
      : null;
  const refillTone =
    refillChip &&
    (refillChip.startsWith("PAID") || refillChip === "INCLUDED"
      ? "paid"
      : refillChip.includes("TERMINAL")
        ? "terminal"
        : "awaiting");

  return (
    <button
      ref={ref}
      type="button"
      data-assignment-id={a.id}
      style={style}
      className={[
        "fleet-tile",
        "job-fleet-tile",
        `job-fleet-tile--${a.status}`,
        overdue ? "job-fleet-tile--overdue" : "",
        a.issueFlag ? "job-fleet-tile--issue" : "",
        call ? `job-fleet-tile--call job-fleet-tile--call-${call.type}` : "",
        call?.status === "acknowledged" ? "job-fleet-tile--call-acked" : "",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
      aria-pressed={selected ? true : undefined}
      title={
        call
          ? `${callTypeLabel(call.type)}${
              call.message && call.type !== "order_unit"
                ? `: ${call.message}`
                : ""
            }${call.status === "acknowledged" ? " · claimed" : ""}`
          : selectMode
            ? selected
              ? "Selected — tap to deselect"
              : "Tap to select"
            : undefined
      }
      onClick={(e) => {
        e.stopPropagation();
        if (suppressClick) return;
        if (selectMode && onToggleSelected) {
          onToggleSelected();
          return;
        }
        onOpen?.();
      }}
      {...attributes}
      {...listeners}
    >
      <div className="job-fleet-tile__top">
        <div className="fleet-num">#{a.hookah.modelNumber}</div>
        {label ? <div className="job-fleet-tile__label">{label}</div> : null}
        {flavourName ? (
          <div className="job-fleet-tile__flavour">{flavourName}</div>
        ) : a.status === "staged" ? (
          <div className="job-fleet-tile__flavour job-fleet-tile__flavour--warn">
            Set flavour for prep
          </div>
        ) : null}
      </div>

      <div className="job-fleet-tile__chips">
        <StatusBadge status={a.status} kind="assignment" />
        {a.guestPayTier ? (
          <span className={`tier-chip tier-chip--${a.guestPayTier}`}>
            {a.guestPayTier}
          </span>
        ) : null}
        {unitChip ? (
          <span className={`pay-chip pay-chip--${unitTone}`}>{unitChip}</span>
        ) : null}
        {a.issueFlag && !call ? (
          <span className="hookah-chip hookah-chip--issue">Issue</span>
        ) : null}
      </div>

      {a.status === "out" && a.nextCheckAt ? (
        <div className="job-fleet-tile__timer">
          <Countdown target={a.nextCheckAt} />
        </div>
      ) : null}
      {a.refillCount > 0 ? (
        <div className="job-fleet-tile__meta">
          {a.refillCount} refill{a.refillCount === 1 ? "" : "s"}
        </div>
      ) : null}

      {call ? (
        <div className={`job-fleet-tile__call hookah-call-chip--${call.type}`}>
          <span className="job-fleet-tile__call-label">{callChipText(call)}</span>
          {call.message &&
          call.type !== "refill" &&
          call.type !== "order_unit" ? (
            <span className="job-fleet-tile__call-msg">{call.message}</span>
          ) : null}
        </div>
      ) : null}
      {refillChip && refillTone ? (
        <span className={`pay-chip pay-chip--${refillTone}`}>{refillChip}</span>
      ) : null}
    </button>
  );
}
