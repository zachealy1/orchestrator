import { Archive, RotateCcw } from "lucide-react";
import { useMemo } from "react";
import "../kanban.css";
import { KanbanCardTile } from "./KanbanCardTile";
import type { KanbanCard, KanbanColumnId } from "./types";

export type KanbanArchivedViewProps = {
  cards: KanbanCard[];
  disabled?: boolean;
  onRestoreCard: (card: KanbanCard) => void;
  onDeleteCard: (card: KanbanCard) => void;
};

const ARCHIVE_COLUMNS: Array<{
  id: KanbanColumnId;
  title: string;
  description: string;
}> = [
  { id: "todo", title: "To do", description: "Ready to start" },
  {
    id: "in-progress",
    title: "In progress",
    description: "Agent work and attention",
  },
  {
    id: "in-review",
    title: "In review",
    description: "Review and merge on GitHub",
  },
  {
    id: "done",
    title: "Done",
    description: "Merged or explicitly completed work",
  },
];

export function KanbanArchivedView({
  cards,
  disabled = false,
  onRestoreCard,
  onDeleteCard,
}: KanbanArchivedViewProps) {
  const cardsByColumn = useMemo(() => {
    const grouped = new Map<KanbanColumnId, KanbanCard[]>(
      ARCHIVE_COLUMNS.map((column) => [column.id, []]),
    );
    cards.forEach((card) => {
      const target = grouped.get(card.columnId) ?? grouped.get("todo");
      target?.push(card);
    });
    grouped.forEach((columnCards) =>
      columnCards.sort((left, right) => left.position - right.position),
    );
    return grouped;
  }, [cards]);

  return (
    <section className="kanban-archived-view" aria-label="Archived cards">
      <div
        className="kanban-board kanban-archive-board"
        role="region"
        aria-label="Archived Kanban board"
      >
        <div className="kanban-board-columns">
          {ARCHIVE_COLUMNS.map((column) => {
            const columnCards = cardsByColumn.get(column.id) ?? [];
            return (
              <section
                key={column.id}
                className="kanban-column"
                aria-labelledby={`kanban-archive-column-${column.id}`}
              >
                <header className="kanban-column-header">
                  <div>
                    <h2 id={`kanban-archive-column-${column.id}`}>{column.title}</h2>
                    <span
                      aria-label={`${columnCards.length} ${
                        columnCards.length === 1 ? "archived card" : "archived cards"
                      }`}
                    >
                      {columnCards.length}
                    </span>
                  </div>
                </header>
                <p className="kanban-column-description">{column.description}</p>
                <div className="kanban-column-dropzone">
                  {columnCards.length > 0 ? (
                    <div className="kanban-card-list">
                      {columnCards.map((card) => (
                        <KanbanCardTile
                          key={card.id}
                          card={{
                            ...card,
                            hasStartedTurn: false,
                            hasUnreadActivity: false,
                            availableActions: ["delete"],
                          }}
                          actionsDisabled={disabled}
                          primaryAction={{
                            label: `Restore ${card.title} to board`,
                            icon: <RotateCcw size={16} aria-hidden="true" />,
                            onClick: () => onRestoreCard(card),
                          }}
                          onAction={(action) => {
                            if (action === "delete") onDeleteCard(card);
                          }}
                        />
                      ))}
                    </div>
                  ) : (
                    <div
                      className="kanban-column-empty kanban-archive-column-empty"
                      aria-label={`${column.title} has no archived cards`}
                    >
                      <Archive size={18} aria-hidden="true" />
                      <span>No archived cards</span>
                    </div>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </section>
  );
}
