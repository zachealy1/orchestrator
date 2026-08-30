import {
  AlertCircle,
  Archive,
  ArrowRight,
  Check,
  Circle,
  CircleStop,
  FileText,
  GitPullRequest,
  Loader2,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { trapDialogFocus } from "../../../shared/dialogFocus";
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
  { title: string; description: string; confirm: string; danger: boolean }
> = {
  stop: {
    title: "Stop this agent?",
    description:
      "The current turn will be interrupted. Its conversation, branch, worktree, and completed output are preserved so the card can be retried later.",
    confirm: "Stop agent",
    danger: true,
  },
  "stop-and-move": {
    title: "Stop this agent and move the card?",
    description:
      "The current turn will be interrupted. The conversation, branch, worktree, and completed output will be preserved.",
    confirm: "Stop agent and move",
    danger: true,
  },
  "approve-done": {
    title: "Approve this result?",
    description:
      "This marks the card Done. It does not commit, push, merge, remove a worktree, or delete a branch.",
    confirm: "Approve and mark Done",
    danger: false,
  },
  "approve-local": {
    title: "Approve and merge locally?",
    description:
      "Orchestrator will commit outstanding card changes and merge each card branch into its captured local target. Nothing will be pushed.",
    confirm: "Approve and merge locally",
    danger: false,
  },
  "complete-without-pr": {
    title: "Complete without a pull request?",
    description:
      "No repository changes or commits were found. Completing this card moves it to Done without opening a pull request.",
    confirm: "Mark Done",
    danger: false,
  },
  "request-changes": {
    title: "Return this card to In progress?",
    description:
      "A continuation turn will start in the same card conversation and isolated worktrees. Add the requested changes in the conversation after continuing.",
    confirm: "Request changes",
    danger: false,
  },
  archive: {
    title: "Archive this card?",
    description:
      "Archived cards leave the board but retain their conversation, review state, branches, worktrees, and Git artifacts. An active agent must stop first.",
    confirm: "Archive card",
    danger: false,
  },
  delete: {
    title: "Delete this card?",
    description:
      "Choose artifact cleanup explicitly. Uncommitted work is never discarded and branches are never deleted unless you select and confirm those actions.",
    confirm: "Delete card",
    danger: true,
  },
  "discard-uncommitted": {
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
  if (
    kind === "approve-done" ||
    kind === "approve-local" ||
    kind === "complete-without-pr"
  ) {
    return <Check size={16} aria-hidden="true" />;
  }
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
  const cancelRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const [cleanupOpen, setCleanupOpen] = useState(true);
  const copy = COPY[kind];
  const isDelete = kind === "delete";
  const isArchive = kind === "archive";
  const isStopAndMove = kind === "stop-and-move";
  const isCompleteWithoutPullRequest = kind === "complete-without-pr";
  const usesSummaryLayout = isArchive || isCompleteWithoutPullRequest;
  const title = isDelete ? `Delete ${card.title}?` : copy.title;
  const description = isDelete
    ? "The card will be removed. Worktrees and branches stay on disk."
    : copy.description;

  useEffect(() => {
    if (!open) return;
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    return () => previousFocusRef.current?.focus({ preventScroll: true });
  }, [open]);

  useEffect(() => {
    if (open && kind === "delete") setCleanupOpen(true);
  }, [kind, open]);

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() =>
      (copy.danger ? cancelRef.current : confirmRef.current)?.focus(),
    );
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented && !busy) {
        onCancel();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [busy, copy.danger, onCancel, open]);

  useEffect(() => {
    if (busy) dialogRef.current?.focus({ preventScroll: true });
  }, [busy]);

  if (!open) return null;

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel();
      }}
    >
      <section
        ref={dialogRef}
        className={`confirmation-dialog kanban-transition-dialog${
          isArchive ? " is-archive" : ""
        }${isCompleteWithoutPullRequest ? " is-no-changes" : ""}${
          isStopAndMove ? " is-stop-and-move" : ""
        }`}
        role="alertdialog"
        aria-modal="true"
        aria-busy={busy}
        aria-labelledby="kanban-transition-title"
        aria-describedby="kanban-transition-description"
        tabIndex={-1}
        onKeyDown={trapDialogFocus}
      >
        <header className={isDelete ? "kanban-delete-header" : undefined}>
          <div
            className={
              isDelete
                ? "kanban-delete-heading"
                : isStopAndMove
                  ? "kanban-stop-move-heading"
                  : usesSummaryLayout
                    ? "kanban-summary-transition-heading"
                    : undefined
            }
          >
            {isDelete ? (
              <Trash2 className="kanban-delete-heading-icon" size={22} aria-hidden="true" />
            ) : isArchive ? (
              <Archive
                className="kanban-archive-transition-heading-icon"
                size={22}
                aria-hidden="true"
              />
            ) : isCompleteWithoutPullRequest ? (
              <GitPullRequest
                className="kanban-no-changes-transition-heading-icon"
                size={28}
                aria-hidden="true"
              />
            ) : isStopAndMove ? (
              <CircleStop
                className="kanban-stop-move-heading-icon"
                size={28}
                aria-hidden="true"
              />
            ) : null}
            <h2 id="kanban-transition-title">{title}</h2>
          </div>
          {!isStopAndMove ? (
            <button
              type="button"
              className="kanban-icon-button"
              aria-label="Close confirmation"
              data-tooltip="Close confirmation"
              disabled={busy}
              onClick={onCancel}
            >
              <X size={17} aria-hidden="true" />
            </button>
          ) : null}
        </header>
        <p id="kanban-transition-description">{description}</p>
        {isStopAndMove ? (
          <div className="kanban-stop-move-content">
            <div className="kanban-stop-move-task">
              <strong>{card.title}</strong>
              <span>{card.description}</span>
            </div>
            <div
              className="kanban-stop-move-route"
              aria-label={`Move card from In progress to ${destinationLabel ?? "the selected lane"}`}
            >
              <span className="kanban-stop-move-state is-current">
                <Loader2 className="spin" size={16} aria-hidden="true" />
                <span>In progress</span>
              </span>
              <ArrowRight size={18} aria-hidden="true" />
              <span className="kanban-stop-move-state is-destination">
                <Circle size={16} aria-hidden="true" />
                <span>{destinationLabel ?? "Selected lane"}</span>
              </span>
            </div>
          </div>
        ) : usesSummaryLayout ? (
          <div
            className={`kanban-transition-card kanban-summary-transition-card${
              isArchive ? " kanban-archive-transition-card" : ""
            }`}
          >
            <FileText size={isCompleteWithoutPullRequest ? 24 : 20} aria-hidden="true" />
            <div>
              <strong>{card.title}</strong>
              <span>{card.description}</span>
              {destinationLabel ? <small>Destination: {destinationLabel}</small> : null}
            </div>
          </div>
        ) : !isDelete ? (
          <div className="kanban-transition-card">
            <strong>{card.title}</strong>
            <span>{card.description}</span>
            {destinationLabel ? <small>Destination: {destinationLabel}</small> : null}
          </div>
        ) : null}

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
          <details
            className="kanban-cleanup-disclosure"
            open={cleanupOpen}
            onToggle={(event) => setCleanupOpen(event.currentTarget.open)}
          >
            <summary>Cleanup options</summary>
            <div className="kanban-cleanup-options">
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
            </div>
          </details>
        ) : null}

        {error ? (
          <p className="kanban-form-error" role="alert">
            <AlertCircle size={15} aria-hidden="true" />
            <span>{error}</span>
          </p>
        ) : null}
        <footer className="confirmation-actions">
          <button
            ref={cancelRef}
            type="button"
            className={
              isStopAndMove
                ? "native-plan-icon-action kanban-stop-move-cancel"
                : usesSummaryLayout
                ? "native-plan-icon-action cancel"
                : isDelete
                  ? "native-plan-icon-action kanban-transition-icon-action"
                  : "native-plan-icon-action"
            }
            aria-label="Cancel"
            data-tooltip="Cancel"
            disabled={busy}
            onClick={onCancel}
          >
            <X size={17} aria-hidden="true" />
          </button>
          <button
            ref={confirmRef}
            type="button"
            className={
              isStopAndMove
                ? "native-plan-icon-action kanban-stop-move-confirm"
                : usesSummaryLayout
                ? "native-plan-icon-action implement"
                : isDelete
                  ? "danger native-plan-icon-action kanban-transition-icon-action"
                  : `native-plan-icon-action ${
                      copy.danger ? "cancel" : "implement"
                    }`
            }
            aria-label={busy ? "Working…" : copy.confirm}
            data-tooltip={busy ? "Working…" : copy.confirm}
            disabled={busy || confirmDisabled}
            onClick={() => void onConfirm()}
          >
            {busy ? (
              <Loader2 className="spin" size={16} aria-hidden="true" />
            ) : (
              <ConfirmIcon kind={kind} />
            )}
          </button>
        </footer>
      </section>
    </div>
  );
}
