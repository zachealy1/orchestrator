import { AlertCircle, Check, Loader2, X } from "lucide-react";
import { useEffect } from "react";
import type { AccountHandoffCandidate } from "./types";
export type { AccountHandoffCandidate, PendingAccountHandoff } from "./types";

type AccountHandoffDialogProps = {
  candidate: AccountHandoffCandidate;
  onCancel: () => void;
  onConfirm: () => void;
};

export function AccountHandoffDialog({
  candidate,
  onCancel,
  onConfirm,
}: AccountHandoffDialogProps) {
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
        className="confirmation-dialog account-handoff-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="account-handoff-title"
        aria-describedby="account-handoff-description"
      >
        <div>
          <h2 id="account-handoff-title">Switch account for this chat?</h2>
          <p id="account-handoff-description">
            {`Continue from ${candidate.fromLabel} with ${candidate.targetLabel}. The next turn starts a fresh Codex thread. Visible messages remain, but token usage resets and hidden reasoning or tool state cannot be transferred.`}
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
            aria-label="Keep current account"
            data-tooltip="Keep current account"
            disabled={!isIdle}
            onClick={onCancel}
          >
            <X size={15} aria-hidden="true" />
          </button>
          <button
            className="native-plan-icon-action implement"
            type="button"
            aria-label="Switch account"
            data-tooltip="Switch account"
            disabled={!isIdle}
            onClick={onConfirm}
          >
            {candidate.status === "selecting" ? (
              <Loader2 className="spin" size={15} aria-hidden="true" />
            ) : (
              <Check size={15} aria-hidden="true" />
            )}
          </button>
        </div>
      </section>
    </div>
  );
}
