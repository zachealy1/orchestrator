import { AlertCircle, Check, Loader2, X } from "lucide-react";
import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { trapDialogFocus } from "../../shared/dialogFocus";
import type { UsageResetConfirmation } from "../analytics/useCodexUsageResetController";

export function UsageResetDialog({
  confirmation,
  canConfirm,
  onCancel,
  onConfirm,
}: {
  confirmation: UsageResetConfirmation;
  canConfirm: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const busy = confirmation.status === "submitting";
  useEffect(() => {
    const previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    cancelRef.current?.focus({ preventScroll: true });
    return () => {
      window.requestAnimationFrame(() => {
        if (!previousFocus?.isConnected) return;
        const target = previousFocus.matches(":disabled")
          ? previousFocus
              .closest(".settings-account-usage")
              ?.querySelector<HTMLElement>(
                'button[aria-label="Refresh account usage"]:not(:disabled)',
              )
          : previousFocus;
        target?.focus({ preventScroll: true });
      });
    };
  }, []);
  useEffect(() => {
    if (busy) dialogRef.current?.focus({ preventScroll: true });
    else cancelRef.current?.focus({ preventScroll: true });
  }, [busy]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) {
        event.preventDefault();
        onCancel();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [busy, onCancel]);
  return createPortal(
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel();
      }}
    >
      <section
        className="confirmation-dialog usage-reset-dialog"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        aria-busy={busy}
        tabIndex={-1}
        onKeyDown={trapDialogFocus}
      >
        <div>
          <h2 id={titleId}>Use one usage reset?</h2>
          <p id={descriptionId}>
            This uses one earned reset for {confirmation.account.label} to reset
            eligible Codex usage limits.
          </p>
          {confirmation.error ? (
            <p className="confirmation-error" role="alert">
              <AlertCircle size={15} aria-hidden="true" />
              <span>{confirmation.error}</span>
            </p>
          ) : null}
        </div>
        <div className="confirmation-actions">
          <button
            className="native-plan-icon-action"
            ref={cancelRef}
            type="button"
            aria-label="Cancel reset"
            data-tooltip="Cancel reset"
            disabled={busy}
            onClick={onCancel}
          >
            <X size={15} aria-hidden="true" />
          </button>
          <button
            className="native-plan-icon-action implement"
            type="button"
            aria-label={
              busy
                ? "Applying reset"
                : confirmation.error
                  ? "Retry reset"
                  : "Use 1 reset"
            }
            data-tooltip={
              busy
                ? "Applying reset"
                : confirmation.error
                  ? "Retry reset"
                  : "Use 1 reset"
            }
            disabled={busy || !canConfirm}
            onClick={onConfirm}
          >
            {busy ? (
              <Loader2 className="spin" size={15} aria-hidden="true" />
            ) : (
              <Check size={15} aria-hidden="true" />
            )}
          </button>
        </div>
      </section>
    </div>,
    document.body,
  );
}
