import { AlertCircle, Loader2, Pencil, X } from "lucide-react";
import { useEffect } from "react";

export type GoalEditCandidate = {
  workspaceId: number;
  clientId: string;
  objective: string;
  status: "idle" | "stopping";
  error: string | null;
};

type GoalEditDialogProps = {
  candidate: GoalEditCandidate;
  onCancel: () => void;
  onConfirm: () => void;
};

export function GoalEditDialog({
  candidate,
  onCancel,
  onConfirm,
}: GoalEditDialogProps) {
  const isIdle = candidate.status === "idle";

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
      <section
        className="confirmation-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="goal-edit-title"
        aria-describedby="goal-edit-description"
      >
        <div>
          <h2 id="goal-edit-title">Replace draft and edit goal?</h2>
          <p id="goal-edit-description">
            This stops the current goal and replaces your unsent prompt with
            its objective. Attached files and selected skills remain available.
          </p>
          {candidate.error ? (
            <p className="account-handoff-error" role="alert">
              <AlertCircle size={15} aria-hidden="true" />
              <span>{candidate.error}</span>
            </p>
          ) : null}
        </div>
        <div className="confirmation-actions">
          <button
            className="native-plan-icon-action"
            type="button"
            aria-label="Keep current goal"
            data-tooltip="Keep current goal"
            disabled={!isIdle}
            onClick={onCancel}
          >
            <X size={15} aria-hidden="true" />
          </button>
          <button
            className="native-plan-icon-action"
            type="button"
            aria-label="Stop and edit goal"
            data-tooltip="Stop and edit goal"
            disabled={!isIdle}
            onClick={onConfirm}
          >
            {candidate.status === "stopping" ? (
              <Loader2 className="spin" size={15} aria-hidden="true" />
            ) : (
              <Pencil size={15} aria-hidden="true" />
            )}
          </button>
        </div>
      </section>
    </div>
  );
}
