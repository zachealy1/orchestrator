import { AlertCircle, GitBranchPlus, Loader2, X } from "lucide-react";
import { useEffect } from "react";

export type ChatContinuationRepository = {
  path: string;
  relativePath: string;
  label: string;
  branch: string;
};

export function ChatWorktreeContinuationDialog({
  title,
  repositories,
  includeDirtyChanges,
  includeDirtyDisabled,
  pending,
  error,
  onIncludeDirtyChanges,
  onCancel,
  onConfirm,
}: {
  title: string;
  repositories: ChatContinuationRepository[];
  includeDirtyChanges: boolean;
  includeDirtyDisabled: boolean;
  pending: boolean;
  error: string | null;
  onIncludeDirtyChanges: (value: boolean) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  useEffect(() => {
    if (pending) return;
    const listener = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    addEventListener("keydown", listener);
    return () => removeEventListener("keydown", listener);
  }, [onCancel, pending]);

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !pending) onCancel();
      }}
    >
      <section
        className="confirmation-dialog chat-worktree-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="chat-worktree-title"
      >
        <div>
          <p className="eyebrow">Chat continuation</p>
          <h2 id="chat-worktree-title">Continue in new worktree</h2>
          <p>
            Create an isolated continuation of <strong>{title}</strong> across
            its associated repositories.
          </p>
        </div>
        <div className="chat-worktree-repositories" aria-label="Repositories">
          {repositories.map((repository) => (
            <div key={repository.path} className="chat-worktree-repository">
              <span>{repository.label}</span>
              <small>{repository.branch}</small>
            </div>
          ))}
        </div>
        <label
          className={`chat-worktree-dirty-option ${includeDirtyDisabled ? "disabled" : ""}`}
        >
          <input
            type="checkbox"
            checked={includeDirtyChanges}
            disabled={pending || includeDirtyDisabled}
            onChange={(event) =>
              onIncludeDirtyChanges(event.currentTarget.checked)
            }
          />
          <span>
            <strong>Include current uncommitted changes</strong>
            <small>
              {includeDirtyDisabled
                ? "Unavailable while this chat has an active turn."
                : "Off by default. Files are copied into the isolated worktrees."}
            </small>
          </span>
        </label>
        {error ? (
          <p className="confirmation-error" role="alert">
            <AlertCircle size={15} aria-hidden="true" />
            <span>{error}</span>
          </p>
        ) : null}
        <div className="confirmation-actions">
          <button
            className="native-plan-icon-action"
            type="button"
            aria-label="Cancel worktree continuation"
            data-tooltip="Cancel"
            disabled={pending}
            onClick={onCancel}
          >
            <X size={15} aria-hidden="true" />
          </button>
          <button
            className="native-plan-icon-action implement"
            type="button"
            aria-label="Create worktree continuation"
            data-tooltip="Continue in new worktree"
            disabled={pending || repositories.length === 0}
            onClick={onConfirm}
          >
            {pending ? (
              <Loader2 className="spin" size={15} aria-hidden="true" />
            ) : (
              <GitBranchPlus size={15} aria-hidden="true" />
            )}
          </button>
        </div>
      </section>
    </div>
  );
}
