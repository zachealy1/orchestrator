import { AlertCircle, GitBranchPlus, Loader2, X } from "lucide-react";
import { useEffect, type RefObject } from "react";
import type { Workspace } from "./types";

export type BranchCreationDialogState = {
  workspace: Workspace;
  repositoryPath: string;
  repositoryLabel: string;
  baseBranch: string | null;
  branchName: string;
  status: "idle" | "creating";
  error: string | null;
};

type BranchCreationDialogProps = {
  dialog: BranchCreationDialogState;
  inputRef: RefObject<HTMLInputElement | null>;
  onBranchNameChange: (branchName: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
};

export function BranchCreationDialog({
  dialog,
  inputRef,
  onBranchNameChange,
  onCancel,
  onConfirm,
}: BranchCreationDialogProps) {
  const isIdle = dialog.status === "idle";

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      inputRef.current?.focus({ preventScroll: true });
      inputRef.current?.select();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [dialog.workspace.id, inputRef]);

  useEffect(() => {
    if (!isIdle) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isIdle, onCancel]);

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && isIdle) onCancel();
      }}
    >
      <form
        className="confirmation-dialog branch-creation-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="branch-creation-title"
        aria-describedby="branch-creation-description"
        onSubmit={(event) => {
          event.preventDefault();
          onConfirm();
        }}
      >
        <div>
          <h2 id="branch-creation-title">Create branch</h2>
          <p id="branch-creation-description">
            Create and switch to a new local branch
            {dialog.baseBranch
              ? ` from ${dialog.baseBranch}`
              : " from the current Git state"}
            {` in ${dialog.repositoryLabel}`}. Current workspace changes will
            carry over.
          </p>
        </div>
        <label className="branch-creation-field">
          <span>Branch name</span>
          <input
            ref={inputRef}
            type="text"
            value={dialog.branchName}
            placeholder="feature/my-branch"
            autoComplete="off"
            spellCheck={false}
            disabled={!isIdle}
            onChange={(event) => onBranchNameChange(event.currentTarget.value)}
          />
        </label>
        {dialog.error ? (
          <p className="confirmation-error" role="alert">
            <AlertCircle size={15} aria-hidden="true" />
            <span>{dialog.error}</span>
          </p>
        ) : null}
        <div className="confirmation-actions">
          <button
            className="native-plan-icon-action"
            type="button"
            aria-label="Cancel branch creation"
            data-tooltip="Cancel branch creation"
            disabled={!isIdle}
            onClick={onCancel}
          >
            <X size={15} aria-hidden="true" />
          </button>
          <button
            className="native-plan-icon-action implement"
            type="submit"
            aria-label="Create branch"
            data-tooltip="Create branch"
            disabled={!isIdle}
          >
            {dialog.status === "creating" ? (
              <Loader2 className="spin" size={15} aria-hidden="true" />
            ) : (
              <GitBranchPlus size={15} aria-hidden="true" />
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
