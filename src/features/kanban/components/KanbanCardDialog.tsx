import { Copy, Plus, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
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
  accessModeOptions?: KanbanSelectOption[];
  modelOptions: KanbanSelectOption[];
  reasoningOptions: KanbanSelectOption[];
  executionSettingsLocked?: boolean;
  saving?: boolean;
  error?: string | null;
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
  accessModeOptions = DEFAULT_ACCESS_OPTIONS,
  modelOptions,
  reasoningOptions,
  executionSettingsLocked = false,
  saving = false,
  error,
  onCancel,
  onSubmit,
}: KanbanCardDialogProps) {
  const defaultsKey = useMemo(() => JSON.stringify(defaults ?? {}), [defaults]);
  const [draft, setDraft] = useState<KanbanCardDraft>(() =>
    initialDraft(card, mode, defaults),
  );
  const [validationError, setValidationError] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setDraft(initialDraft(card, mode, defaults));
    setValidationError(null);
    const frame = window.requestAnimationFrame(() => titleRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [card?.id, defaultsKey, mode, open]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving) onCancel();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onCancel, open, saving]);

  if (!open) return null;

  const title =
    mode === "create" ? "Create card" : mode === "duplicate" ? "Duplicate card" : "Edit card";
  const submitLabel =
    mode === "create" ? "Create card" : mode === "duplicate" ? "Duplicate" : "Save changes";
  const executionFieldsDisabled =
    saving || (mode === "edit" && executionSettingsLocked);

  function patchDraft(patch: Partial<KanbanCardDraft>) {
    setDraft((current) => ({ ...current, ...patch }));
    setValidationError(null);
  }

  function toggleRepository(repositoryId: string, checked: boolean) {
    patchDraft({
      repositoryIds: checked
        ? [...new Set([...draft.repositoryIds, repositoryId])]
        : draft.repositoryIds.filter((id) => id !== repositoryId),
    });
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const titleValue = draft.title.trim();
    const description = draft.description.trim();
    if (!titleValue) {
      setValidationError("Enter a card title.");
      titleRef.current?.focus();
      return;
    }
    if (!description) {
      setValidationError("Describe the work for the agent.");
      return;
    }
    if (draft.repositoryScope === "selected" && draft.repositoryIds.length === 0) {
      setValidationError("Choose at least one repository or use all repositories.");
      return;
    }
    void onSubmit({ ...draft, title: titleValue, description });
  }

  return (
    <div
      className="kanban-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) onCancel();
      }}
    >
      <section
        className="kanban-card-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="kanban-card-dialog-title"
        aria-describedby="kanban-card-dialog-description"
      >
        <header>
          <div>
            <span className="kanban-eyebrow">
              {mode === "duplicate" ? "New independent workflow" : "Kanban task"}
            </span>
            <h2 id="kanban-card-dialog-title">{title}</h2>
            <p id="kanban-card-dialog-description">
              Saving a card does not start an agent. Start it explicitly or move it to In progress.
            </p>
          </div>
          <button
            type="button"
            className="kanban-icon-button"
            aria-label="Close card dialog"
            disabled={saving}
            onClick={onCancel}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        <form onSubmit={handleSubmit}>
          <div className="kanban-dialog-fields">
            <label className="kanban-field kanban-field-wide">
              <span>Title</span>
              <input
                ref={titleRef}
                value={draft.title}
                maxLength={160}
                disabled={saving}
                onChange={(event) => patchDraft({ title: event.target.value })}
              />
            </label>
            <label className="kanban-field kanban-field-wide">
              <span>Description</span>
              <textarea
                value={draft.description}
                rows={7}
                disabled={saving}
                placeholder="Describe the desired outcome, constraints, and verification."
                onChange={(event) => patchDraft({ description: event.target.value })}
              />
            </label>

            <fieldset
              className="kanban-repository-picker kanban-field-wide"
              disabled={executionFieldsDisabled}
            >
              <legend>Repositories</legend>
              <div className="kanban-segmented-control">
                <label>
                  <input
                    type="radio"
                    name="repository-scope"
                    value="all"
                    checked={draft.repositoryScope === "all"}
                    disabled={executionFieldsDisabled}
                    onChange={() => patchDraft({ repositoryScope: "all" })}
                  />
                  <span>All in workspace</span>
                </label>
                <label>
                  <input
                    type="radio"
                    name="repository-scope"
                    value="selected"
                    checked={draft.repositoryScope === "selected"}
                    disabled={executionFieldsDisabled}
                    onChange={() => patchDraft({ repositoryScope: "selected" })}
                  />
                  <span>Selected repositories</span>
                </label>
              </div>
              {draft.repositoryScope === "selected" ? (
                <div className="kanban-repository-options">
                  {repositories.length > 0 ? (
                    repositories.map((repository) => (
                      <label key={repository.id}>
                        <input
                          type="checkbox"
                          checked={draft.repositoryIds.includes(repository.id)}
                          disabled={executionFieldsDisabled}
                          onChange={(event) =>
                            toggleRepository(repository.id, event.target.checked)
                          }
                        />
                        <span>
                          <strong>{repository.label}</strong>
                          <small>{repository.path}</small>
                        </span>
                      </label>
                    ))
                  ) : (
                    <p>No Git repositories were found in this workspace.</p>
                  )}
                </div>
              ) : (
                <p className="kanban-field-help">
                  The repository set is captured when this card first starts.
                </p>
              )}
              <label className="kanban-include-dirty-option">
                <input
                  type="checkbox"
                  checked={draft.includeDirtyChanges}
                  disabled={executionFieldsDisabled}
                  onChange={(event) =>
                    patchDraft({ includeDirtyChanges: event.target.checked })
                  }
                />
                <span>
                  <strong>Include current uncommitted changes</strong>
                  <small>
                    Off by default. When enabled, the selected source changes are copied into the isolated worktree at first start.
                  </small>
                </span>
              </label>
              {mode === "edit" && executionSettingsLocked ? (
                <p className="kanban-field-help">
                  Repository and execution settings are locked after isolated worktrees are provisioned. Title and description remain editable.
                </p>
              ) : null}
            </fieldset>

            <label className="kanban-field">
              <span>Account</span>
              <select
                value={draft.accountId ?? ""}
                disabled={executionFieldsDisabled}
                onChange={(event) =>
                  patchDraft({ accountId: event.target.value || null })
                }
              >
                <option value="">Workspace default</option>
                {accountOptions.map((option) => (
                  <option key={option.value} value={option.value} disabled={option.disabled}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="kanban-field">
              <span>Access mode</span>
              <select
                value={draft.accessMode}
                disabled={executionFieldsDisabled}
                onChange={(event) =>
                  patchDraft({ accessMode: event.target.value as KanbanAccessMode })
                }
              >
                {accessModeOptions.map((option) => (
                  <option key={option.value} value={option.value} disabled={option.disabled}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="kanban-field">
              <span>Model</span>
              <select
                value={draft.model}
                disabled={executionFieldsDisabled}
                onChange={(event) => patchDraft({ model: event.target.value })}
              >
                <option value="">Account default</option>
                {modelOptions.map((option) => (
                  <option key={option.value} value={option.value} disabled={option.disabled}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="kanban-field">
              <span>Reasoning level</span>
              <select
                value={draft.reasoningLevel}
                disabled={executionFieldsDisabled}
                onChange={(event) =>
                  patchDraft({ reasoningLevel: event.target.value })
                }
              >
                <option value="">Model default</option>
                {reasoningOptions.map((option) => (
                  <option key={option.value} value={option.value} disabled={option.disabled}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            {mode === "duplicate" ? (
              <label className="kanban-duplicate-history kanban-field-wide">
                <input
                  type="checkbox"
                  checked={draft.includeConversationHistory}
                  disabled={saving}
                  onChange={(event) =>
                    patchDraft({ includeConversationHistory: event.target.checked })
                  }
                />
                <span>
                  <strong>Include conversation context</strong>
                  <small>
                    Prior prompts and final responses are supplied as historical context on the first turn. The process, execution state, branches, worktrees, and approvals are never copied.
                  </small>
                </span>
              </label>
            ) : null}
          </div>

          {validationError || error ? (
            <p className="kanban-form-error" role="alert">
              {validationError ?? error}
            </p>
          ) : null}

          <footer>
            <button type="button" className="secondary" disabled={saving} onClick={onCancel}>
              Cancel
            </button>
            <button type="submit" className="kanban-primary-button" disabled={saving}>
              {mode === "duplicate" ? (
                <Copy size={15} aria-hidden="true" />
              ) : (
                <Plus size={15} aria-hidden="true" />
              )}
              {saving ? "Saving…" : submitLabel}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}
