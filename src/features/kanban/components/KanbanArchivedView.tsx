import { Archive, RotateCcw, Search, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import "../kanban.css";
import type { KanbanCard } from "./types";

export type KanbanArchivedViewProps = {
  cards: KanbanCard[];
  disabled?: boolean;
  onClose?: () => void;
  onRestoreCard: (card: KanbanCard) => void;
  onDeleteCard: (card: KanbanCard) => void;
};

function archivedDate(value: string | null | undefined) {
  if (!value) return "Archived";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Archived";
  return `Archived ${new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date)}`;
}

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

      {visibleCards.length > 0 ? (
        <div className="kanban-archive-list">
          {visibleCards.map((card) => (
            <article key={card.id}>
              <div className="kanban-archive-card-content">
                <span className="kanban-archive-icon" aria-hidden="true">
                  <Archive size={17} />
                </span>
                <span>
                  <strong>{card.title}</strong>
                  <small>{card.description}</small>
                </span>
              </div>
              <div className="kanban-archive-metadata">
                <span>{archivedDate(card.archivedAt)}</span>
                <span>
                  {card.repositoryScope === "all"
                    ? "All repositories"
                    : `${card.repositories.length} selected ${
                        card.repositories.length === 1 ? "repository" : "repositories"
                      }`}
                </span>
                {card.branches?.length ? (
                  <span>
                    {card.branches.length} preserved {card.branches.length === 1 ? "branch" : "branches"}
                  </span>
                ) : null}
              </div>
              <div className="kanban-archive-actions">
                <button
                  type="button"
                  className="secondary"
                  disabled={disabled}
                  onClick={() => onRestoreCard(card)}
                >
                  <RotateCcw size={14} aria-hidden="true" />
                  Restore
                </button>
                <button
                  type="button"
                  className="danger"
                  disabled={disabled}
                  onClick={() => onDeleteCard(card)}
                >
                  <Trash2 size={14} aria-hidden="true" />
                  Delete…
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="kanban-archive-empty">
          <Archive size={28} aria-hidden="true" />
          <strong>{cards.length === 0 ? "No archived cards" : "No matching cards"}</strong>
          <p>
            {cards.length === 0
              ? "Cards you archive will appear here with their artifacts preserved."
              : "Try a different title or description."}
          </p>
        </div>
      )}
    </section>
  );
}
