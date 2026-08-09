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
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
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
  onCardAction?: (action: KanbanCardAction, card: KanbanCard) => void;
  onCardSelect?: (card: KanbanCard) => void;
};

type DragKind = "card";

const cardDragId = (id: string) => `kanban-card:${id}`;
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
  onAction,
  onSelect,
}: {
  card: KanbanCard;
  disabled: boolean;
  onAction?: (action: KanbanCardAction, card: KanbanCard) => void;
  onSelect?: (card: KanbanCard) => void;
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
        onAction={onAction}
        onSelect={onSelect}
      />
    </div>
  );
}

function SortableColumn({
  column,
  disabled,
  target,
  onCardAction,
  onCardSelect,
}: {
  column: KanbanColumn;
  disabled: boolean;
  target: boolean;
  onCardAction?: (action: KanbanCardAction, card: KanbanCard) => void;
  onCardSelect?: (card: KanbanCard) => void;
}) {
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: columnDropId(column.id),
    disabled,
    data: { kind: "column-drop", columnId: column.id },
  });
  const cardIds = column.cards.map((card) => cardDragId(card.id));

  return (
    <section
      className={`kanban-column${target || isOver ? " is-drop-target" : ""}`}
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
                  onAction={onCardAction}
                  onSelect={onCardSelect}
                />
              ))}
            </div>
          ) : (
            <div className="kanban-column-empty" aria-label={`${column.title} is empty`}>
              <span>Drop cards here</span>
            </div>
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
  onCardAction,
  onCardSelect,
}: KanbanBoardProps) {
  const orderedColumns = useMemo(() => sortedColumns(columns), [columns]);
  const [activeCard, setActiveCard] = useState<KanbanCard | null>(null);
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
    setDropTargetColumn(null);
  }

  function handleDragStart(event: DragStartEvent) {
    const data = event.active.data.current;
    if (data?.kind === "card") {
      setActiveCard(allCards.find((card) => card.id === data.cardId) ?? null);
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
              "Press space to pick up a card. Use arrow keys to move it, then press space again to drop. Press escape to cancel.",
          },
        }}
        autoScroll
      >
        <div className="kanban-board-columns">
          {orderedColumns.map((column) => (
            <SortableColumn
              key={column.id}
              column={column}
              disabled={disabled}
              target={dropTargetColumn === column.id}
              onCardAction={onCardAction}
              onCardSelect={onCardSelect}
            />
          ))}
        </div>
        <DragOverlay dropAnimation={null}>
          {activeCard ? (
            <div className="kanban-card-overlay">
              <KanbanCardTile card={activeCard} overlay />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

export { activeAttemptRequiresStop };
