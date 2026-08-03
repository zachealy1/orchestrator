import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripHorizontal, Plus } from "lucide-react";
import { useMemo, useState, type ButtonHTMLAttributes, type CSSProperties } from "react";
import "../kanban.css";
import { KanbanCardTile } from "./KanbanCardTile";
import type {
  KanbanCard,
  KanbanCardAction,
  KanbanColumn,
  KanbanColumnId,
  KanbanMoveRequest,
} from "./types";

export type KanbanBoardProps = {
  columns: KanbanColumn[];
  disabled?: boolean;
  onMoveCard: (request: KanbanMoveRequest) => void;
  onReorderColumns: (columnIds: KanbanColumnId[]) => void;
  onOpenCard?: (card: KanbanCard) => void;
  onCardAction?: (action: KanbanCardAction, card: KanbanCard) => void;
  onCreateCard?: (columnId: KanbanColumnId) => void;
};

type DragKind = "card" | "column";

const cardDragId = (id: string) => `kanban-card:${id}`;
const columnDragId = (id: string) => `kanban-column:${id}`;
const columnDropId = (id: string) => `kanban-column-drop:${id}`;

function activeAttemptRequiresStop(card: KanbanCard) {
  return [
    "starting",
    "running",
    "pause-requested",
    "paused",
    "waiting-for-input",
    "waiting-for-approval",
    "blocked",
    "stopping",
  ].includes(card.executionState);
}

function sortedColumns(columns: KanbanColumn[]) {
  return [...columns]
    .sort((left, right) => left.position - right.position)
    .map((column) => ({
      ...column,
      cards: [...column.cards].sort(
        (left, right) => left.position - right.position,
      ),
    }));
}

function SortableCard({
  card,
  disabled,
  onOpen,
  onAction,
}: {
  card: KanbanCard;
  disabled: boolean;
  onOpen?: (card: KanbanCard) => void;
  onAction?: (action: KanbanCardAction, card: KanbanCard) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: cardDragId(card.id),
    disabled,
    data: { kind: "card" satisfies DragKind, cardId: card.id, columnId: card.columnId },
  });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  const dragHandleProps = {
    ...attributes,
    ...listeners,
    disabled,
  } as ButtonHTMLAttributes<HTMLButtonElement>;

  return (
    <div ref={setNodeRef} className="kanban-sortable-card">
      <KanbanCardTile
        card={card}
        style={style}
        dragging={isDragging}
        actionsDisabled={disabled}
        dragHandleProps={dragHandleProps}
        onOpen={onOpen}
        onAction={onAction}
      />
    </div>
  );
}

function SortableColumn({
  column,
  disabled,
  target,
  onOpenCard,
  onCardAction,
  onCreateCard,
}: {
  column: KanbanColumn;
  disabled: boolean;
  target: boolean;
  onOpenCard?: (card: KanbanCard) => void;
  onCardAction?: (action: KanbanCardAction, card: KanbanCard) => void;
  onCreateCard?: (columnId: KanbanColumnId) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: columnDragId(column.id),
    disabled,
    data: { kind: "column" satisfies DragKind, columnId: column.id },
  });
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: columnDropId(column.id),
    disabled,
    data: { kind: "column-drop", columnId: column.id },
  });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  const cardIds = column.cards.map((card) => cardDragId(card.id));

  return (
    <section
      ref={setNodeRef}
      className={`kanban-column${isDragging ? " is-dragging" : ""}${
        target || isOver ? " is-drop-target" : ""
      }`}
      style={style}
      aria-labelledby={`kanban-column-title-${column.id}`}
      data-column-id={column.id}
    >
      <header className="kanban-column-header">
        <div>
          <h2 id={`kanban-column-title-${column.id}`}>{column.title}</h2>
          <span
            aria-label={`${column.cards.length} ${
              column.cards.length === 1 ? "card" : "cards"
            }`}
          >
            {column.cards.length}
          </span>
        </div>
        <div className="kanban-column-actions">
          {onCreateCard ? (
            <button
              type="button"
              className="kanban-icon-button"
              aria-label={`Create card in ${column.title}`}
              disabled={disabled}
              onClick={() => onCreateCard(column.id)}
            >
              <Plus size={16} aria-hidden="true" />
            </button>
          ) : null}
          <button
            type="button"
            className="kanban-column-drag-handle"
            aria-label={`Move ${column.title} column`}
            disabled={disabled}
            {...attributes}
            {...listeners}
          >
            <GripHorizontal size={17} aria-hidden="true" />
          </button>
        </div>
      </header>
      {column.description ? (
        <p className="kanban-column-description">{column.description}</p>
      ) : null}
      <div ref={setDropRef} className="kanban-column-dropzone">
        <SortableContext
          items={cardIds}
          strategy={verticalListSortingStrategy}
          disabled={disabled}
        >
          {column.cards.length > 0 ? (
            <div className="kanban-card-list">
              {column.cards.map((card) => (
                <SortableCard
                  key={card.id}
                  card={card}
                  disabled={disabled}
                  onOpen={onOpenCard}
                  onAction={onCardAction}
                />
              ))}
            </div>
          ) : (
            <button
              type="button"
              className="kanban-column-empty"
              onClick={() => onCreateCard?.(column.id)}
              disabled={disabled || !onCreateCard}
            >
              <span>Drop cards here</span>
              {onCreateCard ? <small>or create a card</small> : null}
            </button>
          )}
        </SortableContext>
      </div>
    </section>
  );
}

function targetColumnId(event: DragOverEvent | DragEndEvent) {
  const overData = event.over?.data.current;
  if (!overData) return null;
  return typeof overData.columnId === "string"
    ? (overData.columnId as KanbanColumnId)
    : null;
}

export function KanbanBoard({
  columns,
  disabled = false,
  onMoveCard,
  onReorderColumns,
  onOpenCard,
  onCardAction,
  onCreateCard,
}: KanbanBoardProps) {
  const orderedColumns = useMemo(() => sortedColumns(columns), [columns]);
  const [activeCard, setActiveCard] = useState<KanbanCard | null>(null);
  const [activeColumn, setActiveColumn] = useState<KanbanColumn | null>(null);
  const [dropTargetColumn, setDropTargetColumn] = useState<KanbanColumnId | null>(
    null,
  );
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const allCards = orderedColumns.flatMap((column) => column.cards);

  function clearDragState() {
    setActiveCard(null);
    setActiveColumn(null);
    setDropTargetColumn(null);
  }

  function handleDragStart(event: DragStartEvent) {
    const data = event.active.data.current;
    if (data?.kind === "card") {
      setActiveCard(allCards.find((card) => card.id === data.cardId) ?? null);
      return;
    }
    if (data?.kind === "column") {
      setActiveColumn(
        orderedColumns.find((column) => column.id === data.columnId) ?? null,
      );
    }
  }

  function handleDragOver(event: DragOverEvent) {
    setDropTargetColumn(targetColumnId(event));
  }

  function handleDragEnd(event: DragEndEvent) {
    const activeData = event.active.data.current;
    const overData = event.over?.data.current;
    if (!activeData || !overData || !event.over) {
      clearDragState();
      return;
    }

    if (activeData.kind === "column") {
      const fromIndex = orderedColumns.findIndex(
        (column) => column.id === activeData.columnId,
      );
      const overColumnId = targetColumnId(event);
      const toIndex = orderedColumns.findIndex(
        (column) => column.id === overColumnId,
      );
      if (fromIndex >= 0 && toIndex >= 0 && fromIndex !== toIndex) {
        const next = [...orderedColumns];
        const [moved] = next.splice(fromIndex, 1);
        if (moved) next.splice(toIndex, 0, moved);
        onReorderColumns(next.map((column) => column.id));
      }
      clearDragState();
      return;
    }

    const card = allCards.find((candidate) => candidate.id === activeData.cardId);
    const toColumnId = targetColumnId(event);
    if (!card || !toColumnId) {
      clearDragState();
      return;
    }
    const targetColumn = orderedColumns.find((column) => column.id === toColumnId);
    if (!targetColumn) {
      clearDragState();
      return;
    }

    let toIndex = targetColumn.cards.length;
    if (overData.kind === "card") {
      const overIndex = targetColumn.cards.findIndex(
        (candidate) => candidate.id === overData.cardId,
      );
      if (overIndex >= 0) toIndex = overIndex;
    } else if (card.columnId === toColumnId) {
      toIndex = Math.max(0, targetColumn.cards.length - 1);
    }
    const fromColumn = orderedColumns.find(
      (column) => column.id === card.columnId,
    );
    const fromIndex = fromColumn?.cards.findIndex(
      (candidate) => candidate.id === card.id,
    );
    if (card.columnId !== toColumnId || fromIndex !== toIndex) {
      onMoveCard({
        cardId: card.id,
        fromColumnId: card.columnId,
        toColumnId,
        toIndex,
        requiresStop:
          card.columnId !== toColumnId && activeAttemptRequiresStop(card),
      });
    }
    clearDragState();
  }

  return (
    <div className="kanban-board" aria-label="Kanban board">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={clearDragState}
        accessibility={{
          screenReaderInstructions: {
            draggable:
              "Press space to pick up a card or column. Use arrow keys to move it, then press space again to drop. Press escape to cancel.",
          },
        }}
        autoScroll
      >
        <SortableContext
          items={orderedColumns.map((column) => columnDragId(column.id))}
          strategy={horizontalListSortingStrategy}
          disabled={disabled}
        >
          <div className="kanban-board-columns">
            {orderedColumns.map((column) => (
              <SortableColumn
                key={column.id}
                column={column}
                disabled={disabled}
                target={dropTargetColumn === column.id}
                onOpenCard={onOpenCard}
                onCardAction={onCardAction}
                onCreateCard={onCreateCard}
              />
            ))}
          </div>
        </SortableContext>
        <DragOverlay dropAnimation={null}>
          {activeCard ? (
            <div className="kanban-card-overlay">
              <KanbanCardTile card={activeCard} overlay />
            </div>
          ) : activeColumn ? (
            <div className="kanban-column-overlay">
              <strong>{activeColumn.title}</strong>
              <span>
                {activeColumn.cards.length}{" "}
                {activeColumn.cards.length === 1 ? "card" : "cards"}
              </span>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

export { activeAttemptRequiresStop };
