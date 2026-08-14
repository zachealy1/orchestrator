import { Archive, RotateCcw, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import "../kanban.css";
import { KanbanCardTile } from "./KanbanCardTile";
import type { KanbanCard, KanbanColumnId } from "./types";

export type KanbanArchivedViewProps = {
  cards: KanbanCard[];
  disabled?: boolean;
  onClose?: () => void;
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
  onClose,
  onRestoreCard,
  onDeleteCard,
}: KanbanArchivedViewProps) {
  const [search, setSearch] = useState("");
  const visibleCards = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    if (!query) return cards;
    return cards.filter((card) =>
      `${card.title}\n${card.description}`.toLocaleLowerCase().includes(query),
    );
  }, [cards, search]);
  const cardsByColumn = useMemo(() => {
    const grouped = new Map<KanbanColumnId, KanbanCard[]>(
      ARCHIVE_COLUMNS.map((column) => [column.id, []]),
    );
    visibleCards.forEach((card) => {
      const target = grouped.get(card.columnId) ?? grouped.get("todo");
      target?.push(card);
    });
    grouped.forEach((columnCards) =>
      columnCards.sort((left, right) => left.position - right.position),
    );
    return grouped;
  }, [visibleCards]);

  return (
    <section className="kanban-archived-view" aria-labelledby="kanban-archive-title">
      <header>
        <div>
          <span className="eyebrow">Preserved workflows</span>
          <h1 id="kanban-archive-title">Archived cards</h1>
          <p>
            Archive keeps conversations, branches, worktrees, and review artifacts without running an agent.
          </p>
        </div>
        {onClose ? (
          <button
            type="button"
            className="kanban-icon-button"
            aria-label="Close archived cards"
            disabled={disabled}
            onClick={onClose}
          >
            <X size={18} aria-hidden="true" />
          </button>
        ) : null}
      </header>

      <label className="kanban-search-field kanban-archive-search">
        <Search size={16} aria-hidden="true" />
        <span className="sr-only">Search archived cards</span>
        <input
          type="search"
          value={search}
          disabled={disabled}
          placeholder="Search archived cards"
          onChange={(event) => setSearch(event.target.value)}
        />
        {search ? (
          <button
            type="button"
            aria-label="Clear archived card search"
            disabled={disabled}
            onClick={() => setSearch("")}
          >
            <X size={14} aria-hidden="true" />
          </button>
        ) : null}
      </label>

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
                      <span>
                        {cards.length > 0 && visibleCards.length === 0
                          ? "No matching cards"
                          : "No archived cards"}
                      </span>
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
