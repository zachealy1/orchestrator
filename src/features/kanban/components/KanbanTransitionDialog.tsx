import { Archive, Check, CircleStop, RefreshCw, Trash2, X } from "lucide-react";
import { useEffect, useRef } from "react";
import "../kanban.css";
import type {
  KanbanCard,
  KanbanCleanupOption,
  KanbanTransitionKind,
} from "./types";

export type KanbanTransitionDialogProps = {
  open: boolean;
  kind: KanbanTransitionKind;
  card: KanbanCard;
  destinationLabel?: string;
  cleanupOptions?: KanbanCleanupOption[];
  busy?: boolean;
  error?: string | null;
  confirmDisabled?: boolean;
  messageLabel?: string;
  messageValue?: string;
  messagePlaceholder?: string;
  onMessageChange?: (value: string) => void;
  onCleanupOptionChange?: (optionId: string, selected: boolean) => void;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
};

const COPY: Record<
  KanbanTransitionKind,
  { eyebrow: string; title: string; description: string; confirm: string; danger: boolean }
> = {
  stop: {
    eyebrow: "Active agent",
    title: "Stop this agent?",
    description:
      "The current turn will be interrupted. Its conversation, branch, worktree, and completed output are preserved so the card can be retried later.",
    confirm: "Stop agent",
    danger: true,
  },
  "stop-and-move": {
    eyebrow: "Active agent",
    title: "Stop this agent and move the card?",
    description:
      "The current turn will be interrupted before the card moves. Its conversation, branch, worktree, and completed output are preserved.",
    confirm: "Stop agent and move",
    danger: true,
  },
  "approve-done": {
    eyebrow: "Review decision",
    title: "Approve this result?",
    description:
      "This marks the card Done. It does not commit, push, merge, remove a worktree, or delete a branch.",
    confirm: "Approve and mark Done",
    danger: false,
  },
  "request-changes": {
    eyebrow: "Continue work",
    title: "Return this card to In progress?",
    description:
      "A continuation turn will start in the same card conversation and isolated worktrees. Add the requested changes in the conversation after continuing.",
    confirm: "Request changes",
    danger: false,
  },
  archive: {
    eyebrow: "Archive card",
    title: "Archive this card?",
    description:
      "Archived cards leave the board but retain their conversation, review state, branches, worktrees, and Git artifacts. An active agent must stop first.",
    confirm: "Archive card",
    danger: false,
  },
  delete: {
    eyebrow: "Destructive action",
    title: "Delete this card?",
    description:
      "Choose artifact cleanup explicitly. Uncommitted work is never discarded and branches are never deleted unless you select and confirm those actions.",
    confirm: "Delete card",
    danger: true,
  },
  "discard-uncommitted": {
    eyebrow: "Uncommitted work",
    title: "Discard uncommitted changes?",
    description:
      "This permanently removes uncommitted work from the card worktree. Commits and conversation history are not affected.",
    confirm: "Discard changes",
    danger: true,
  },
};

function ConfirmIcon({ kind }: { kind: KanbanTransitionKind }) {
  if (kind === "stop" || kind === "stop-and-move") {
    return <CircleStop size={16} aria-hidden="true" />;
  }
  if (kind === "approve-done") return <Check size={16} aria-hidden="true" />;
  if (kind === "request-changes") return <RefreshCw size={16} aria-hidden="true" />;
  if (kind === "archive") return <Archive size={16} aria-hidden="true" />;
  return <Trash2 size={16} aria-hidden="true" />;
}

export function KanbanTransitionDialog({
  open,
  kind,
  card,
  destinationLabel,
  cleanupOptions = [],
  busy = false,
  error,
  confirmDisabled = false,
  messageLabel,
  messageValue = "",
  messagePlaceholder,
  onMessageChange,
  onCleanupOptionChange,
  onCancel,
  onConfirm,
}: KanbanTransitionDialogProps) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  const copy = COPY[kind];

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => confirmRef.current?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onCancel();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [busy, onCancel, open]);

  if (!open) return null;

  return (
    <div
      className="kanban-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel();
      }}
    >
      <section
        className="kanban-transition-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="kanban-transition-title"
        aria-describedby="kanban-transition-description"
      >
        <header>
          <div>
            <span className="kanban-eyebrow">{copy.eyebrow}</span>
            <h2 id="kanban-transition-title">{copy.title}</h2>
          </div>
          <button
            type="button"
            className="kanban-icon-button"
            aria-label="Close confirmation"
            disabled={busy}
            onClick={onCancel}
          >
            <X size={17} aria-hidden="true" />
          </button>
        </header>
        <p id="kanban-transition-description">{copy.description}</p>
        <div className="kanban-transition-card">
          <strong>{card.title}</strong>
          <span>{card.description}</span>
          {destinationLabel ? <small>Destination: {destinationLabel}</small> : null}
        </div>

        {messageLabel ? (
          <label className="kanban-field kanban-transition-message">
            <span>{messageLabel}</span>
            <textarea
              rows={5}
              value={messageValue}
              placeholder={messagePlaceholder}
              disabled={busy}
              onChange={(event) => onMessageChange?.(event.target.value)}
            />
          </label>
        ) : null}

        {cleanupOptions.length > 0 ? (
          <fieldset className="kanban-cleanup-options">
            <legend>Artifact cleanup</legend>
            {cleanupOptions.map((option) => (
              <label
                key={option.id}
                className={option.destructive ? "is-destructive" : undefined}
              >
                <input
                  type="checkbox"
                  checked={option.selected}
                  disabled={busy || option.disabled}
                  onChange={(event) =>
                    onCleanupOptionChange?.(option.id, event.target.checked)
                  }
                />
                <span>
                  <strong>{option.label}</strong>
                  <small>{option.description}</small>
                </span>
              </label>
            ))}
          </fieldset>
        ) : null}

        {error ? (
          <p className="kanban-form-error" role="alert">
            {error}
          </p>
        ) : null}
        <footer>
          <button type="button" className="secondary" disabled={busy} onClick={onCancel}>
            Cancel
          </button>
          <button
            ref={confirmRef}
            type="button"
            className={copy.danger ? "kanban-danger-button" : "kanban-primary-button"}
            disabled={busy || confirmDisabled}
            onClick={() => void onConfirm()}
          >
            <ConfirmIcon kind={kind} />
            {busy ? "Working…" : copy.confirm}
          </button>
        </footer>
      </section>
    </div>
  );
}
