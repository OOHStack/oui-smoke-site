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

const COLUMN_IDS: BoardStatus[] = ["staged", "out", "returned"];

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
  return { ok: true };
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
  const [itemsById, setItemsById] = useState(() =>
    itemsByIdFromAssignments(assignments),
  );
  const [columns, setColumns] = useState(() =>
    columnsFromAssignments(assignments),
  );
  const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null);
  const [overColumn, setOverColumn] = useState<BoardStatus | null>(null);
  const [boardError, setBoardError] = useState("");
  const [busy, setBusy] = useState(false);

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
  }, [assignments, activeId, busy]);

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
        Drag tiles between columns or between other tiles · drop anywhere, in any
        order · tap to open details
      </p>
      {boardError ? <p className="login-error">{boardError}</p> : null}
      {busy ? <p className="list-meta">Updating board…</p> : null}

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
              onOpen={onOpen}
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
  onOpen,
}: {
  group: (typeof BOARD_GROUPS)[number];
  itemIds: number[];
  itemsById: Record<number, BoardAssignment>;
  isOver: boolean;
  activeId: UniqueIdentifier | null;
  onOpen: (id: number, prompt?: string) => void;
}) {
  const { setNodeRef, isOver: isOverDroppable } = useDroppable({
    id: group.key,
  });

  const sortableIds = useMemo(() => itemIds.map(toItemId), [itemIds]);

  return (
    <div
      ref={setNodeRef}
      className={[
        "hookah-group",
        `hookah-group--${group.key}`,
        isOver || isOverDroppable ? "hookah-group--drop-target" : "",
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
        <span className="hookah-group__count">{itemIds.length}</span>
      </div>

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
                  onOpen={() => onOpen(id)}
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
  onOpen,
}: {
  assignment: BoardAssignment;
  isActive: boolean;
  onOpen: () => void;
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
      className={
        isDragging || isActive ? "job-fleet-tile--ghost" : undefined
      }
      attributes={attributes}
      listeners={listeners}
      onOpen={onOpen}
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
  onOpen,
  suppressClick,
  ref,
}: {
  assignment: BoardAssignment;
  className?: string;
  style?: CSSProperties;
  attributes?: DraggableAttributes;
  listeners?: ReturnType<typeof useSortable>["listeners"];
  onOpen?: () => void;
  suppressClick?: boolean;
  ref?: Ref<HTMLButtonElement>;
}) {
  const overdue =
    a.status === "out" &&
    !!a.nextCheckAt &&
    new Date(a.nextCheckAt).getTime() < Date.now();
  const flavourName = a.flavour?.name ?? a.flavourLabel ?? null;
  const call = a.activeCall;

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
      title={
        call
          ? `${callTypeLabel(call.type)}${call.message ? `: ${call.message}` : ""}${
              call.status === "acknowledged" ? " · on the way" : ""
            }`
          : undefined
      }
      onClick={(e) => {
        e.stopPropagation();
        if (suppressClick || !onOpen) return;
        onOpen();
      }}
      {...attributes}
      {...listeners}
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
