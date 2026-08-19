import { AlertCircle, Bot, Check, CircleUserRound, Gauge, Loader2, X } from "lucide-react";
import { useEffect, type KeyboardEventHandler, type RefObject } from "react";
import { ComposerSelect, type ComposerSelectOption } from "../../components/ComposerSelect";
import type { TaskChatEntry } from "../../components/TaskChatTurn";
import type { CodexModel, CodexProfileKey } from "../codex/types";

export type PlanImplementationDialogState = {
  requestId: number;
  workspaceId: number;
  chatId: number;
  kanbanCardId: string | null;
  entry: TaskChatEntry;
  allowDefaultProfile: boolean;
  accountId: number;
  profileKey: CodexProfileKey;
  models: CodexModel[];
  selectedModelId: string | null;
  reasoningEffort: string | null;
  status: "loading" | "idle" | "starting";
  error: string | null;
};

type PlanImplementationDialogProps = {
  dialog: PlanImplementationDialogState;
  defaultProfileKey: CodexProfileKey;
  accountOptions: ComposerSelectOption[];
  modelOptions: ComposerSelectOption[];
  reasoningOptions: ComposerSelectOption[];
  hasSelectedModel: boolean;
  dialogRef: RefObject<HTMLElement | null>;
  onTrapFocus: KeyboardEventHandler<HTMLElement>;
  onClose: () => void;
  onAccountChange: (value: string) => void;
  onModelChange: (value: string) => void;
  onReasoningChange: (value: string) => void;
  onConfirm: () => void;
};

export function PlanImplementationDialog({
  dialog,
  defaultProfileKey,
  accountOptions,
  modelOptions,
  reasoningOptions,
  hasSelectedModel,
  dialogRef,
  onTrapFocus,
  onClose,
  onAccountChange,
  onModelChange,
  onReasoningChange,
  onConfirm,
}: PlanImplementationDialogProps) {
  const isIdle = dialog.status === "idle";

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const element = dialogRef.current;
      if (!element || element.contains(document.activeElement)) return;
      const target =
        element.querySelector<HTMLElement>(
          '[role="combobox"]:not([disabled]), button:not([disabled])',
        ) ?? element;
      target.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [dialog.entry.clientId, dialog.status, dialogRef]);

  useEffect(() => {
    if (dialog.status === "starting") return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [dialog.status, onClose]);

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && dialog.status !== "starting") {
          onClose();
        }
      }}
    >
      <section
        className="confirmation-dialog plan-implementation-dialog"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="plan-implementation-title"
        aria-describedby="plan-implementation-description"
        tabIndex={-1}
        onKeyDown={onTrapFocus}
      >
        <div className="plan-implementation-copy">
          <h2 id="plan-implementation-title">Confirm implementation settings</h2>
          <p id="plan-implementation-description">
            Choose the account, model, and reasoning level for the
            implementation. Switching accounts starts a fresh Codex thread
            while keeping this conversation visible; token usage resets and
            hidden reasoning or tool state is not transferred.
          </p>
        </div>
        <div
          className="plan-implementation-fields"
          aria-busy={dialog.status === "loading"}
        >
          <ComposerSelect
            ariaLabel="Implementation account"
            value={
              dialog.profileKey === defaultProfileKey
                ? "default"
                : dialog.accountId.toString()
            }
            options={accountOptions}
            placeholder="Choose account"
            icon={<CircleUserRound size={16} />}
            disabled={!isIdle}
            onChange={onAccountChange}
          />
          <ComposerSelect
            ariaLabel="Implementation model"
            value={dialog.selectedModelId ?? ""}
            options={modelOptions}
            placeholder={dialog.status === "loading" ? "Loading models" : "Choose model"}
            icon={<Bot size={16} />}
            disabled={!isIdle || modelOptions.length === 0}
            onChange={onModelChange}
          />
          <ComposerSelect
            ariaLabel="Implementation reasoning"
            value={dialog.reasoningEffort ?? ""}
            options={reasoningOptions}
            placeholder="Default"
            icon={<Gauge size={16} />}
            disabled={!isIdle || reasoningOptions.length === 0}
            onChange={onReasoningChange}
          />
        </div>
        {dialog.error ? (
          <p className="account-handoff-error" role="alert">
            <AlertCircle size={15} aria-hidden="true" />
            <span>{dialog.error}</span>
          </p>
        ) : null}
        <div className="confirmation-actions">
          <button
            className="native-plan-icon-action"
            type="button"
            aria-label="Cancel implementation"
            data-tooltip="Cancel implementation"
            disabled={dialog.status === "starting"}
            onClick={onClose}
          >
            <X size={15} aria-hidden="true" />
          </button>
          <button
            className="native-plan-icon-action implement"
            type="button"
            aria-label="Implement plan"
            data-tooltip="Implement plan"
            disabled={!isIdle || !hasSelectedModel}
            onClick={onConfirm}
          >
            {dialog.status === "starting" ? (
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
