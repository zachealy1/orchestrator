import { Trash2, X } from "lucide-react";
import { useEffect } from "react";
import type { Workspace } from "./types";

type WorkspaceDeleteDialogProps = {
  workspace: Workspace;
  onCancel: () => void;
  onConfirm: () => void;
};

export function WorkspaceDeleteDialog({
  workspace,
  onCancel,
  onConfirm,
}: WorkspaceDeleteDialogProps) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onCancel]);

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <section
        className="confirmation-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="workspace-delete-title"
        aria-describedby="workspace-delete-description"
      >
        <div>
          <p className="eyebrow">Workspace</p>
          <h2 id="workspace-delete-title">Remove workspace?</h2>
          <p id="workspace-delete-description">
            This removes {workspace.label} from Orchestrator. The folder on disk
            will not be deleted.
          </p>
        </div>
        <div className="confirmation-actions">
          <button
            className="native-plan-icon-action"
            type="button"
            aria-label="Keep workspace"
            data-tooltip="Keep workspace"
            onClick={onCancel}
          >
            <X size={15} aria-hidden="true" />
          </button>
          <button
            className="native-plan-icon-action cancel"
            type="button"
            aria-label="Remove workspace"
            data-tooltip="Remove workspace"
            onClick={onConfirm}
          >
            <Trash2 size={15} aria-hidden="true" />
          </button>
        </div>
      </section>
    </div>
  );
}
