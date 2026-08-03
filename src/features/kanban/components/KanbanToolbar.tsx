import { Archive, Filter, Layers3, Plus, Search, X } from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import { ComposerSelect } from "../../../components/ComposerSelect";
import { useDismissibleContextMenu } from "../../../shared/useDismissibleContextMenu";
import "../kanban.css";
import type {
  KanbanFilterGroup,
  KanbanFilterSelection,
  KanbanGroupBy,
} from "./types";

export type KanbanToolbarProps = {
  search: string;
  filters: KanbanFilterSelection;
  filterGroups: KanbanFilterGroup[];
  groupBy: KanbanGroupBy;
  visibleCardCount: number;
  totalCardCount: number;
  archivedOpen?: boolean;
  disabled?: boolean;
  onSearchChange: (value: string) => void;
  onFiltersChange: (filters: KanbanFilterSelection) => void;
  onGroupByChange: (value: KanbanGroupBy) => void;
  onCreateCard: () => void;
  onToggleArchived?: () => void;
};

const GROUP_OPTIONS: Array<{ value: KanbanGroupBy; label: string }> = [
  { value: "none", label: "No grouping" },
  { value: "repository", label: "Repository" },
  { value: "account", label: "Account" },
  { value: "access-mode", label: "Access mode" },
  { value: "model", label: "Model" },
  { value: "reasoning-level", label: "Reasoning level" },
  { value: "execution-state", label: "Execution state" },
];

export function KanbanToolbar({
  search,
  filters,
  filterGroups,
  groupBy,
  visibleCardCount,
  totalCardCount,
  archivedOpen = false,
  disabled = false,
  onSearchChange,
  onFiltersChange,
  onGroupByChange,
  onCreateCard,
  onToggleArchived,
}: KanbanToolbarProps) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filterMenuId = useId();
  const filterMenuRef = useRef<HTMLDivElement>(null);
  const filterTriggerRef = useRef<HTMLButtonElement>(null);
  const dismissFilters = useCallback(() => setFiltersOpen(false), []);
  useDismissibleContextMenu(
    filtersOpen,
    filterMenuRef,
    dismissFilters,
    filterTriggerRef,
  );
  useEffect(() => {
    if (disabled) setFiltersOpen(false);
  }, [disabled]);
  const activeFilterCount = Object.values(filters).reduce(
    (total, values) => total + values.length,
    0,
  );
  const constrained = Boolean(search.trim()) || activeFilterCount > 0;

  function handleFilterChange(
    groupId: string,
    optionValue: string,
    checked: boolean,
  ) {
    const current = filters[groupId] ?? [];
    const values = checked
      ? [...new Set([...current, optionValue])]
      : current.filter((value) => value !== optionValue);
    onFiltersChange({ ...filters, [groupId]: values });
  }

  function clearFilters() {
    onSearchChange("");
    onFiltersChange({});
  }

  return (
    <div className="kanban-toolbar" role="toolbar" aria-label="Kanban controls">
      <label className="kanban-search-field">
        <Search size={16} aria-hidden="true" />
        <span className="sr-only">Search cards</span>
        <input
          type="search"
          value={search}
          disabled={disabled}
          placeholder="Search cards"
          onChange={(event: ChangeEvent<HTMLInputElement>) =>
            onSearchChange(event.target.value)
          }
        />
        {search ? (
          <button
            type="button"
            disabled={disabled}
            aria-label="Clear card search"
            onClick={() => onSearchChange("")}
          >
            <X size={14} aria-hidden="true" />
          </button>
        ) : null}
      </label>

      <div className="kanban-filter-menu" ref={filterMenuRef}>
        <button
          ref={filterTriggerRef}
          type="button"
          className={`kanban-filter-trigger${
            activeFilterCount > 0 ? " is-active" : ""
          }${filtersOpen ? " is-open" : ""}`}
          aria-label={
            activeFilterCount > 0
              ? `Filters, ${activeFilterCount} active`
              : "Filters"
          }
          aria-haspopup="dialog"
          aria-expanded={filtersOpen}
          aria-controls={filtersOpen ? filterMenuId : undefined}
          disabled={disabled}
          onClick={() => setFiltersOpen((current) => !current)}
        >
          <Filter size={15} aria-hidden="true" />
          <span>Filters</span>
          {activeFilterCount > 0 ? (
            <span className="kanban-filter-count">{activeFilterCount}</span>
          ) : null}
        </button>
        {filtersOpen ? (
          <div
            className="kanban-filter-popover"
            id={filterMenuId}
            role="dialog"
            aria-label="Filter cards"
          >
            <header>
              <strong>Filter cards</strong>
              {activeFilterCount > 0 ? (
                <button
                  type="button"
                  className="small secondary"
                  onClick={() => onFiltersChange({})}
                >
                  Clear filters
                </button>
              ) : null}
            </header>
            <div className="kanban-filter-groups">
              {filterGroups.map((group) => (
                <fieldset key={group.id}>
                  <legend>{group.label}</legend>
                  {group.options.length > 0 ? (
                    group.options.map((option) => (
                      <label key={option.value}>
                        <input
                          type="checkbox"
                          checked={(filters[group.id] ?? []).includes(option.value)}
                          disabled={disabled || option.disabled}
                          onChange={(event) =>
                            handleFilterChange(
                              group.id,
                              option.value,
                              event.target.checked,
                            )
                          }
                        />
                        <span>{option.label}</span>
                        {option.count === undefined ? null : (
                          <small>{option.count}</small>
                        )}
                      </label>
                    ))
                  ) : (
                    <p>No options</p>
                  )}
                </fieldset>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <div className="kanban-group-control">
        <span className="sr-only">Group cards by</span>
        <ComposerSelect
          ariaLabel="Group cards by"
          value={groupBy}
          options={GROUP_OPTIONS}
          placeholder="No grouping"
          icon={<Layers3 size={15} />}
          className="kanban-group-select"
          disabled={disabled}
          onChange={(value) => onGroupByChange(value as KanbanGroupBy)}
        />
      </div>

      <span className="kanban-results-count" aria-live="polite">
        {constrained
          ? `${visibleCardCount} of ${totalCardCount} cards`
          : `${totalCardCount} ${totalCardCount === 1 ? "card" : "cards"}`}
      </span>

      {constrained ? (
        <button
          type="button"
          className="kanban-clear-button"
          disabled={disabled}
          onClick={clearFilters}
        >
          Clear all
        </button>
      ) : null}

      <div className="kanban-toolbar-spacer" />
      {onToggleArchived ? (
        <button
          type="button"
          className={archivedOpen ? "kanban-toolbar-button is-active" : "kanban-toolbar-button"}
          aria-pressed={archivedOpen}
          disabled={disabled}
          onClick={onToggleArchived}
        >
          <Archive size={15} aria-hidden="true" />
          <span>Archived</span>
        </button>
      ) : null}
      <button
        type="button"
        className="kanban-create-button"
        disabled={disabled}
        onClick={onCreateCard}
      >
        <Plus size={16} aria-hidden="true" />
        <span>New card</span>
      </button>
    </div>
  );
}
