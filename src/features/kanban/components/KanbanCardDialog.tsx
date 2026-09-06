import {
  AlertCircle,
  Bot,
  Check,
  CircleUserRound,
  Copy,
  FileText,
  Gauge,
  Image as ImageIcon,
  ListTodo,
  Loader2,
  MessageCircle,
  Paperclip,
  Plus,
  ShieldCheck,
  Target,
  X,
} from "lucide-react";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { ComposerSelect } from "../../../components/ComposerSelect";
import type { ComposerContextFile } from "../../composer/types";
import { hasContextFilePayload, readDroppedContextFiles } from "../../../lib/contextFiles";
import { mergeContextFiles } from "../../composer/promptHelpers";
import { trapDialogFocus } from "../../../shared/dialogFocus";
import "../kanban.css";
import type {
  KanbanAccessMode,
  KanbanCard,
  KanbanCardDraft,
  KanbanRepository,
  KanbanSelectOption,
} from "./types";

export type KanbanCardDialogMode = "create" | "edit" | "duplicate";

export type KanbanCardDialogProps = {
  open: boolean;
  mode: KanbanCardDialogMode;
  card?: KanbanCard | null;
  defaults?: Partial<KanbanCardDraft>;
  repositories: KanbanRepository[];
  accountOptions: KanbanSelectOption[];
  sharedAccountOnly?: boolean;
  accessModeOptions?: KanbanSelectOption[];
  modelOptions: KanbanSelectOption[];
  reasoningOptions: KanbanSelectOption[];
  modelReasoningOptions?: Record<string, KanbanSelectOption[]>;
  executionSettingsLocked?: boolean;
  saving?: boolean;
  error?: string | null;
  onPickContextFiles?: () => Promise<ComposerContextFile[]>;
  onCancel: () => void;
  onSubmit: (draft: KanbanCardDraft) => void | Promise<void>;
};

const DEFAULT_ACCESS_OPTIONS: KanbanSelectOption[] = [
  { value: "ask-for-approval", label: "Ask for approval" },
  { value: "full-access", label: "Full access" },
];

function initialDraft(
  card: KanbanCard | null | undefined,
  mode: KanbanCardDialogMode,
  defaults: Partial<KanbanCardDraft> | undefined,
): KanbanCardDraft {
  return {
    title:
      defaults?.title ??
      (card ? `${card.title}${mode === "duplicate" ? " copy" : ""}` : ""),
    description: defaults?.description ?? card?.description ?? "",
    repositoryScope:
      defaults?.repositoryScope ?? card?.repositoryScope ?? "all",
    repositoryIds:
      defaults?.repositoryIds ?? card?.repositories.map((repository) => repository.id) ?? [],
    accountId: defaults?.accountId ?? card?.accountId ?? null,
    accessMode:
      defaults?.accessMode ?? card?.accessMode ?? "ask-for-approval",
    model: defaults?.model ?? card?.model ?? "",
    reasoningLevel:
      defaults?.reasoningLevel ?? card?.reasoningLevel ?? "",
    submissionMode:
      defaults?.submissionMode ?? card?.submissionMode ?? "normal",
    contextFiles:
      defaults?.contextFiles?.map((file) => ({ ...file })) ??
      card?.contextFiles?.map((file) => ({ ...file })) ??
      [],
    includeDirtyChanges:
      defaults?.includeDirtyChanges ?? card?.includeDirtyChanges ?? false,
    includeConversationHistory: false,
  };
}

export function KanbanCardDialog({
  open,
  mode,
  card,
  defaults,
  repositories,
  accountOptions,
  sharedAccountOnly = false,
  accessModeOptions = DEFAULT_ACCESS_OPTIONS,
  modelOptions,
  reasoningOptions,
  modelReasoningOptions,
  executionSettingsLocked = false,
  saving = false,
  error,
  onPickContextFiles,
  onCancel,
  onSubmit,
}: KanbanCardDialogProps) {
  const defaultsKey = useMemo(() => JSON.stringify(defaults ?? {}), [defaults]);
  const [draft, setDraft] = useState<KanbanCardDraft>(() =>
    initialDraft(card, mode, defaults),
  );
  const [validationError, setValidationError] = useState<string | null>(null);
  const [invalidField, setInvalidField] = useState<
    "title" | "description" | null
  >(null);
  const dialogRef = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const validationErrorId = useId();

  useEffect(() => {
    if (!open) return;
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    return () => previousFocusRef.current?.focus({ preventScroll: true });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setDraft(initialDraft(card, mode, defaults));
    setValidationError(null);
    setInvalidField(null);
    const frame = window.requestAnimationFrame(() => titleRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [card?.id, defaultsKey, mode, open]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented && !saving) {
        onCancel();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onCancel, open, saving]);

  useEffect(() => {
    if (saving) dialogRef.current?.focus({ preventScroll: true });
  }, [saving]);

  if (!open) return null;

  const title =
    mode === "create" ? "Create card" : mode === "duplicate" ? "Duplicate card" : "Edit card";
  const submitLabel =
    mode === "create" ? "Create card" : mode === "duplicate" ? "Duplicate" : "Save changes";
  const executionFieldsDisabled =
    saving || (mode === "edit" && executionSettingsLocked);
  const multiRepositoryWorkspace = repositories.length > 1;
  const modelOptionsForReasoning = modelReasoningOptions
    ? (modelReasoningOptions[draft.model] ?? [])
    : reasoningOptions;
  const selectedReasoningOptions =
    draft.reasoningLevel &&
    !modelOptionsForReasoning.some(
      (option) => option.value === draft.reasoningLevel,
    )
      ? [
          reasoningOptions.find(
            (option) => option.value === draft.reasoningLevel,
          ) ?? {
            value: draft.reasoningLevel,
            label: draft.reasoningLevel,
          },
          ...modelOptionsForReasoning,
        ]
      : modelOptionsForReasoning;

  function patchDraft(patch: Partial<KanbanCardDraft>) {
    setDraft((current) => ({ ...current, ...patch }));
    setValidationError(null);
    setInvalidField(null);
  }

  function addContextFiles(files: ComposerContextFile[]) {
    patchDraft({ contextFiles: mergeContextFiles(draft.contextFiles, files) });
  }

  async function chooseContextFiles() {
    if (!onPickContextFiles || executionFieldsDisabled) return;
    addContextFiles(await onPickContextFiles());
  }

  function removeContextFile(path: string) {
    patchDraft({
      contextFiles: draft.contextFiles.filter((file) => file.path !== path),
    });
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const titleValue = draft.title.trim();
    const description = draft.description.trim();
    const submittedDraft = !executionSettingsLocked && repositories.length > 0
      ? {
          ...draft,
          repositoryScope: multiRepositoryWorkspace
            ? "all" as const
            : "selected" as const,
          repositoryIds: repositories.map((repository) => repository.id),
        }
      : draft;
    if (!titleValue) {
      setValidationError("Enter a card title.");
      setInvalidField("title");
      titleRef.current?.focus();
      return;
    }
    if (!description) {
      setValidationError("Describe the work for the agent.");
      setInvalidField("description");
      descriptionRef.current?.focus();
      return;
    }
    void onSubmit({ ...submittedDraft, title: titleValue, description });
  }

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) onCancel();
      }}
    >
      <section
        ref={dialogRef}
        className="confirmation-dialog kanban-card-dialog"
        role="dialog"
        aria-modal="true"
        aria-busy={saving}
        aria-labelledby="kanban-card-dialog-title"
        aria-describedby="kanban-card-dialog-description"
        tabIndex={-1}
        onKeyDown={trapDialogFocus}
      >
        <header>
          <div>
            <h2 id="kanban-card-dialog-title">{title}</h2>
            <p id="kanban-card-dialog-description">
              Saving a card does not start an agent. Start it explicitly or move it to In progress.
            </p>
          </div>
          <button
            type="button"
            className="kanban-icon-button"
            aria-label="Close card dialog"
            data-tooltip="Close card dialog"
            disabled={saving}
            onClick={onCancel}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        <form onSubmit={handleSubmit}>
          <div className="kanban-card-dialog-scroll">
            <div className="kanban-card-editor-layout">
              <div className="kanban-card-editor-task">
                <label className="kanban-field">
                  <span>Title</span>
                  <input
                    ref={titleRef}
                    value={draft.title}
                    maxLength={160}
                    disabled={saving}
                    aria-invalid={invalidField === "title"}
                    aria-describedby={invalidField === "title" ? validationErrorId : undefined}
                    onChange={(event) => patchDraft({ title: event.target.value })}
                  />
                </label>
                <label className="kanban-field">
                  <span>Description</span>
                  <textarea
                    ref={descriptionRef}
                    value={draft.description}
                    rows={5}
                    disabled={saving}
                    aria-invalid={invalidField === "description"}
                    aria-describedby={invalidField === "description" ? validationErrorId : undefined}
                    placeholder="Describe the desired outcome, constraints, and verification."
                    onChange={(event) => patchDraft({ description: event.target.value })}
                  />
                </label>

                <section className="kanban-agent-context" aria-labelledby="kanban-agent-context-title">
                  <div className="kanban-agent-context-heading">
                    <h4 id="kanban-agent-context-title">Agent context</h4>
                    <button
                      type="button"
                      className="kanban-icon-button"
                      aria-label="Add files to agent context"
                      data-tooltip="Add files"
                      disabled={executionFieldsDisabled || !onPickContextFiles}
                      onClick={() => void chooseContextFiles()}
                    >
                      <Paperclip size={16} aria-hidden="true" />
                    </button>
                  </div>
                  <div
                    className={`kanban-agent-context-drop${draft.contextFiles.length === 0 ? " empty" : ""}`}
                    onDragOver={(event) => {
                      if (!executionFieldsDisabled && hasContextFilePayload(event.dataTransfer)) {
                        event.preventDefault();
                        event.dataTransfer.dropEffect = "copy";
                      }
                    }}
                    onDrop={(event) => {
                      if (executionFieldsDisabled || !hasContextFilePayload(event.dataTransfer)) return;
                      event.preventDefault();
                      const dropped = readDroppedContextFiles(event.dataTransfer);
                      if (dropped.files.length > 0) addContextFiles(dropped.files);
                    }}
                  >
                    {draft.contextFiles.map((file) => (
                      <div className="kanban-agent-context-file" key={file.canonicalPath ?? file.path}>
                        {file.mediaKind === "image" ? (
                          <ImageIcon size={15} aria-hidden="true" />
                        ) : (
                          <FileText size={15} aria-hidden="true" />
                        )}
                        <span title={file.path}>{file.name}</span>
                        <button
                          type="button"
                          className="kanban-icon-button"
                          aria-label={`Remove ${file.name}`}
                          data-tooltip={`Remove ${file.name}`}
                          disabled={executionFieldsDisabled}
                          onClick={() => removeContextFile(file.path)}
                        >
                          <X size={14} aria-hidden="true" />
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      className="kanban-agent-context-add"
                      disabled={executionFieldsDisabled || !onPickContextFiles}
                      onClick={() => void chooseContextFiles()}
                    >
                      {draft.contextFiles.length === 0 ? "Drop files here or add files" : "Add more files"}
                    </button>
                  </div>
                </section>

                {repositories.length > 0 ? (
                  <label className="kanban-include-dirty-option">
                    <input
                      type="checkbox"
                      checked={draft.includeDirtyChanges}
                      disabled={executionFieldsDisabled}
                      onChange={(event) => patchDraft({ includeDirtyChanges: event.target.checked })}
                    />
                    <span>
                      <strong>Include current uncommitted changes</strong>
                      <small>
                        {multiRepositoryWorkspace
                          ? "Current source changes are copied into each isolated worktree at first start."
                          : "Selected source changes are copied into the isolated worktree at first start."}
                      </small>
                    </span>
                  </label>
                ) : null}

                {mode === "edit" && executionSettingsLocked ? (
                  <p className="kanban-field-help">{multiRepositoryWorkspace ? "Mode, context, and execution settings" : "Repository, mode, context, and execution settings"} are locked after isolated worktrees are provisioned. Title and description remain editable.</p>
                ) : null}

                {mode === "duplicate" ? (
                  <label className="kanban-duplicate-history">
                    <input
                      type="checkbox"
                      checked={draft.includeConversationHistory}
                      disabled={saving}
                      onChange={(event) => patchDraft({ includeConversationHistory: event.target.checked })}
                    />
                    <span>
                      <strong>Include conversation context</strong>
                      <small>Prior prompts and final responses are copied as historical context. Process state and approvals are not copied.</small>
                    </span>
                  </label>
                ) : null}
              </div>

              <aside className="kanban-card-editor-settings" aria-labelledby="kanban-run-settings-title">
                <h3 id="kanban-run-settings-title">Run settings</h3>
                <fieldset className="kanban-mode-picker" disabled={executionFieldsDisabled}>
                  <legend>Mode</legend>
                  <div className="kanban-mode-options">
                    {([
                      ["normal", "Chat", MessageCircle],
                      ["plan", "Plan", ListTodo],
                      ["goal", "Goal", Target],
                    ] as const).map(([value, label, Icon]) => (
                      <label key={value}>
                        <input
                          type="radio"
                          name="submission-mode"
                          value={value}
                          checked={draft.submissionMode === value}
                          onChange={() => patchDraft({ submissionMode: value })}
                        />
                        <span><Icon size={15} aria-hidden="true" />{label}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>

                <div className="kanban-field">
                  <span>Account</span>
                  <ComposerSelect
                    ariaLabel="Account"
                    value={sharedAccountOnly ? "shared" : draft.accountId ?? ""}
                    options={
                      sharedAccountOnly
                        ? [{ value: "shared", label: "Codex app account (shared)" }]
                        : [{ value: "", label: "Workspace default" }, ...accountOptions]
                    }
                    placeholder={
                      sharedAccountOnly
                        ? "Codex app account (shared)"
                        : "Workspace default"
                    }
                    icon={<CircleUserRound size={16} />}
                    className="kanban-field-select"
                    disabled={executionFieldsDisabled || sharedAccountOnly}
                    onChange={(value) => {
                      const accountId = value || null;
                      patchDraft(accountId === draft.accountId ? { accountId } : { accountId, model: "", reasoningLevel: "" });
                    }}
                  />
                </div>
                <div className="kanban-field">
                  <span>Access</span>
                  <ComposerSelect
                    ariaLabel="Access mode"
                    value={draft.accessMode}
                    options={accessModeOptions}
                    placeholder="Ask for approval"
                    icon={<ShieldCheck size={16} />}
                    className="kanban-field-select"
                    disabled={executionFieldsDisabled}
                    onChange={(value) => patchDraft({ accessMode: value as KanbanAccessMode })}
                  />
                </div>
                <div className="kanban-field">
                  <span>Model</span>
                  <ComposerSelect
                    ariaLabel="Model"
                    value={draft.model}
                    options={[{ value: "", label: "Account default" }, ...modelOptions]}
                    placeholder="Account default"
                    icon={<Bot size={16} />}
                    className="kanban-field-select"
                    disabled={executionFieldsDisabled}
                    onChange={(value) => patchDraft(value === draft.model ? { model: value } : { model: value, reasoningLevel: "" })}
                  />
                </div>
                <div className="kanban-field">
                  <span>Reasoning</span>
                  <ComposerSelect
                    ariaLabel="Reasoning level"
                    value={draft.reasoningLevel}
                    options={[{ value: "", label: "Model default" }, ...selectedReasoningOptions]}
                    placeholder="Model default"
                    icon={<Gauge size={16} />}
                    className="kanban-field-select"
                    disabled={executionFieldsDisabled || selectedReasoningOptions.length === 0}
                    onChange={(value) => patchDraft({ reasoningLevel: value })}
                  />
                </div>
              </aside>
            </div>

            {validationError || error ? (
              <p
                className="kanban-form-error"
                id={validationError ? validationErrorId : undefined}
                role="alert"
              >
                <AlertCircle size={15} aria-hidden="true" />
                <span>{validationError ?? error}</span>
              </p>
            ) : null}
          </div>

          <footer className="confirmation-actions">
            <button
              type="button"
              className="native-plan-icon-action cancel"
              aria-label="Cancel"
              data-tooltip="Cancel"
              disabled={saving}
              onClick={onCancel}
            >
              <X size={16} aria-hidden="true" />
            </button>
            <button
              type="submit"
              className="native-plan-icon-action implement"
              aria-label={saving ? "Saving card" : submitLabel}
              data-tooltip={saving ? "Saving card" : submitLabel}
              disabled={saving}
            >
              {saving ? (
                <Loader2 className="spin" size={16} aria-hidden="true" />
              ) : mode === "duplicate" ? (
                <Copy size={16} aria-hidden="true" />
              ) : mode === "create" ? (
                <Plus size={16} aria-hidden="true" />
              ) : (
                <Check size={16} aria-hidden="true" />
              )}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}
