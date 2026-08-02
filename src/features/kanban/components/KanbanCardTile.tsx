import {
  Archive,
  Check,
  CircleStop,
  Copy,
  GitBranch,
  GitCommitHorizontal,
  GitMerge,
  MoreHorizontal,
  Pause,
  Pencil,
  Play,
  RefreshCw,
  Rocket,
  Trash2,
} from "lucide-react";
import type { ButtonHTMLAttributes, CSSProperties, MouseEvent } from "react";
import type {
  KanbanCard,
  KanbanCardAction,
  KanbanExecutionState,
} from "./types";

export type KanbanCardTileProps = {
  card: KanbanCard;
  style?: CSSProperties;
  dragging?: boolean;
  overlay?: boolean;
  dragHandleProps?: ButtonHTMLAttributes<HTMLButtonElement>;
  onOpen?: (card: KanbanCard) => void;
  onAction?: (action: KanbanCardAction, card: KanbanCard) => void;
};

const STATE_LABELS: Record<KanbanExecutionState, string> = {
  idle: "Ready",
  starting: "Starting",
  running: "Running",
  "pause-requested": "Pausing",
  paused: "Paused",
  "waiting-for-input": "Waiting for input",
  "waiting-for-approval": "Waiting for approval",
  blocked: "Blocked",
  failed: "Failed",
  stopping: "Stopping",
  stopped: "Stopped",
  interrupted: "Interrupted",
  "completed-awaiting-review": "Awaiting review",
};

const ACTION_LABELS: Record<KanbanCardAction, string> = {
  open: "Open conversation",
  start: "Start agent",
  pause: "Pause agent",
  resume: "Resume agent",
  stop: "Stop agent",
  retry: "Retry work",
  edit: "Edit card",
  duplicate: "Duplicate card",
  archive: "Archive card",
  delete: "Delete card",
  commit: "Commit changes",
  "commit-and-push": "Commit and push",
  merge: "Merge branch",
  "request-changes": "Request changes",
  approve: "Approve result",
};

function ActionIcon({ action }: { action: KanbanCardAction }) {
  switch (action) {
    case "start":
    case "resume":
      return <Play size={14} aria-hidden="true" />;
    case "pause":
      return <Pause size={14} aria-hidden="true" />;
    case "stop":
      return <CircleStop size={14} aria-hidden="true" />;
    case "retry":
      return <RefreshCw size={14} aria-hidden="true" />;
    case "edit":
      return <Pencil size={14} aria-hidden="true" />;
    case "duplicate":
      return <Copy size={14} aria-hidden="true" />;
    case "archive":
      return <Archive size={14} aria-hidden="true" />;
    case "delete":
      return <Trash2 size={14} aria-hidden="true" />;
    case "commit":
      return <GitCommitHorizontal size={14} aria-hidden="true" />;
    case "commit-and-push":
      return <Rocket size={14} aria-hidden="true" />;
    case "merge":
      return <GitMerge size={14} aria-hidden="true" />;
    case "request-changes":
      return <RefreshCw size={14} aria-hidden="true" />;
    case "approve":
      return <Check size={14} aria-hidden="true" />;
    case "open":
      return <Play size={14} aria-hidden="true" />;
  }
}

function repositoryLabel(card: KanbanCard) {
  if (card.repositoryScope === "all") return "All repositories";
  const labels = card.repositories.map((repository) => repository.label);
  if (labels.length === 0) return "No repositories selected";
  if (labels.length <= 2) return labels.join(", ");
  return `${labels.slice(0, 2).join(", ")} +${labels.length - 2}`;
}

function stateTone(state: KanbanExecutionState) {
  if (state === "failed" || state === "blocked") return "danger";
  if (state === "waiting-for-approval" || state === "waiting-for-input") {
    return "attention";
  }
  if (state === "running" || state === "starting") return "active";
  if (state === "completed-awaiting-review") return "review";
  if (state === "paused" || state === "interrupted" || state === "stopped") {
    return "muted";
  }
  return "neutral";
}

export function KanbanCardTile({
  card,
  style,
  dragging = false,
  overlay = false,
  dragHandleProps,
  onOpen,
  onAction,
}: KanbanCardTileProps) {
  const branch = card.branches?.[0];
  const menuActions = (card.availableActions ?? []).filter(
    (action) => action !== "open",
  );

  function runAction(event: MouseEvent, action: KanbanCardAction) {
    event.stopPropagation();
    onAction?.(action, card);
  }

  return (
    <article
      className={`kanban-card-tile${dragging ? " is-dragging" : ""}${
        overlay ? " is-overlay" : ""
      }`}
      data-state={card.executionState}
      data-card-id={card.id}
      style={style}
      aria-label={`${card.title}, ${STATE_LABELS[card.executionState]}`}
    >
      <div className="kanban-card-topline">
        <span
          className="kanban-state-badge"
          data-tone={stateTone(card.executionState)}
        >
          <span className="kanban-state-dot" aria-hidden="true" />
          {STATE_LABELS[card.executionState]}
        </span>
        <div className="kanban-card-top-actions">
          {card.hasUnreadActivity ? (
            <span className="kanban-unread-dot" aria-label="Unread activity" />
          ) : null}
          {menuActions.length > 0 ? (
            <details className="kanban-card-menu">
              <summary aria-label={`Actions for ${card.title}`}>
                <MoreHorizontal size={16} aria-hidden="true" />
              </summary>
              <div className="kanban-card-menu-popover" role="menu">
                {menuActions.map((action) => (
                  <button
                    key={action}
                    type="button"
                    role="menuitem"
                    className={action === "delete" ? "danger" : undefined}
                    onClick={(event) => runAction(event, action)}
                  >
                    <ActionIcon action={action} />
                    <span>{ACTION_LABELS[action]}</span>
                  </button>
                ))}
              </div>
            </details>
          ) : null}
          {dragHandleProps ? (
            <button
              type="button"
              className="kanban-drag-handle"
              aria-label={`Move ${card.title}`}
              {...dragHandleProps}
            >
              <span aria-hidden="true">⠿</span>
            </button>
          ) : null}
        </div>
      </div>

      <button
        type="button"
        className="kanban-card-open"
        onClick={() => onOpen?.(card)}
      >
        <strong>{card.title}</strong>
        {card.description ? <span>{card.description}</span> : null}
      </button>

      <div className="kanban-card-metadata">
        <span title={card.repositories.map((repository) => repository.path).join("\n")}>
          {repositoryLabel(card)}
        </span>
        <span>{card.accountLabel}</span>
        <span>{card.modelLabel}</span>
        <span>{card.reasoningLevel}</span>
      </div>

      {branch || card.changedFileCount ? (
        <div className="kanban-card-footer">
          {branch ? (
            <span className="kanban-branch-label" title={branch.branch}>
              <GitBranch size={13} aria-hidden="true" />
              {branch.branch}
              {(card.branches?.length ?? 0) > 1
                ? ` +${(card.branches?.length ?? 1) - 1}`
                : ""}
            </span>
          ) : (
            <span />
          )}
          {card.changedFileCount ? (
            <span>
              {card.changedFileCount} changed {card.changedFileCount === 1 ? "file" : "files"}
            </span>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

export { ACTION_LABELS, STATE_LABELS };
