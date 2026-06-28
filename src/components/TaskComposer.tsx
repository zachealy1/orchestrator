import {
  BrainCircuit,
  ChevronDown,
  ClipboardCheck,
  CircleUserRound,
  Flag,
  Folder,
  GitBranch,
  Bot,
  Gauge,
  Paperclip,
  Pin,
  Play,
  ShieldCheck,
  X,
} from "lucide-react";
import { useLayoutEffect, useRef } from "react";
import type {
  AccessLevel,
  CodexAccountProfile,
  CodexModel,
  ComposerContextFile,
  RouteRecommendation,
  Workspace,
} from "../types";

type Props = {
  disabled: boolean;
  prompt: string;
  routeRecommendation: RouteRecommendation;
  tokenEstimate: number;
  workspaces: Workspace[];
  selectedWorkspaceId: number | null;
  accounts: CodexAccountProfile[];
  selectedAccountId: number | null;
  defaultAccountId: number | null;
  accountSelectionDisabled: boolean;
  branches: string[];
  selectedBranch: string | null;
  models: CodexModel[];
  modelLoadError: string | null;
  selectedModelId: string | null;
  selectedReasoningEffort: string | null;
  goalMode: boolean;
  planMode: boolean;
  accessLevel: AccessLevel;
  contextFiles: ComposerContextFile[];
  onWorkspaceChange: (workspaceId: number) => void;
  onAddWorkspace: () => void;
  onAccountChange: (accountId: number) => void;
  onSetDefaultAccount: () => void;
  onBranchChange: (branch: string) => void;
  onPromptChange: (prompt: string) => void;
  onModelChange: (modelId: string) => void;
  onReasoningEffortChange: (effort: string) => void;
  onGoalModeChange: (value: boolean) => void;
  onPlanModeChange: (value: boolean) => void;
  onAccessLevelChange: (accessLevel: AccessLevel) => void;
  onAddFiles: () => void;
  onRemoveFile: (path: string) => void;
  onPreflight: () => void;
  onRun: () => void;
};

export function TaskComposer({
  disabled,
  prompt,
  routeRecommendation,
  tokenEstimate,
  workspaces,
  selectedWorkspaceId,
  accounts,
  selectedAccountId,
  defaultAccountId,
  accountSelectionDisabled,
  branches,
  selectedBranch,
  models,
  modelLoadError,
  selectedModelId,
  selectedReasoningEffort,
  goalMode,
  planMode,
  accessLevel,
  contextFiles,
  onWorkspaceChange,
  onAddWorkspace,
  onAccountChange,
  onSetDefaultAccount,
  onBranchChange,
  onPromptChange,
  onModelChange,
  onReasoningEffortChange,
  onGoalModeChange,
  onPlanModeChange,
  onAccessLevelChange,
  onAddFiles,
  onRemoveFile,
  onPreflight,
  onRun,
}: Props) {
  const promptTextareaRef = useRef<HTMLTextAreaElement>(null);
  const selectedModel =
    models.find((model) => model.id === selectedModelId) ?? models[0] ?? null;
  const reasoningOptions = selectedModel?.supportedReasoningEfforts ?? [];
  const controlsDisabled = models.length === 0 || Boolean(modelLoadError);
  const planRecommended = routeRecommendation === "plan-first";
  const addWorkspaceValue = "__add_workspace__";

  useLayoutEffect(() => {
    const textarea = promptTextareaRef.current;

    if (!textarea) {
      return;
    }

    const maxHeight = 220;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`;
    textarea.style.overflowY = textarea.scrollHeight > maxHeight ? "auto" : "hidden";
  }, [prompt]);

  return (
    <section className="composer-panel" aria-label="Task composer">
      <label className="prompt-field">
        <span className="sr-only">Prompt</span>
        <textarea
          ref={promptTextareaRef}
          value={prompt}
          onChange={(event) => onPromptChange(event.currentTarget.value)}
          placeholder="Do anything"
          rows={1}
        />
      </label>

      <div className="composer-meta-row" aria-label="Prompt metadata">
        <span className="token-pill">{tokenEstimate.toLocaleString()} tokens</span>
      </div>

      <div className="composer-toolbar" role="toolbar" aria-label="Prompt actions">
        <div className="composer-action-group">
          <button className="secondary" type="button" onClick={onPreflight} disabled={disabled}>
            <ClipboardCheck size={16} />
            Preflight
          </button>

          <button
            className={`mode-toggle ${goalMode ? "active" : ""}`}
            type="button"
            aria-pressed={goalMode}
            onClick={() => onGoalModeChange(!goalMode)}
          >
            <Flag size={16} />
            Goal mode
          </button>

          <button
            className={`mode-toggle ${planMode ? "active" : ""} ${planRecommended ? "recommended" : ""}`}
            type="button"
            aria-pressed={planMode}
            onClick={() => onPlanModeChange(!planMode)}
          >
            <BrainCircuit size={16} />
            Plan mode
          </button>

          <button className="secondary compact-action" type="button" onClick={onAddFiles}>
            <Paperclip size={16} />
            Add files
          </button>
        </div>

        <div className="composer-run-group">
          <button
            className="send-button"
            type="button"
            onClick={onRun}
            disabled={disabled}
            aria-label="Run Codex"
          >
            <Play size={16} />
            <span className="sr-only">Run Codex</span>
          </button>
        </div>
      </div>

      <div className="composer-options-row">
        <div className="account-select-group">
          <label className="composer-select account-select">
            <span className="composer-select-icon" aria-hidden="true">
              <CircleUserRound size={16} />
            </span>
            <select
              value={selectedAccountId ?? ""}
              onChange={(event) => onAccountChange(Number(event.currentTarget.value))}
              disabled={accounts.length === 0 || accountSelectionDisabled}
              aria-label="Run account"
            >
              {accounts.length === 0 ? (
                <option value="">Sign in required</option>
              ) : (
                accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.label}
                  </option>
                ))
              )}
            </select>
            <ChevronDown className="select-chevron account-chevron-select" size={16} aria-hidden="true" />
          </label>
          <button
            className={`account-default-button secondary ${
              selectedAccountId !== null && selectedAccountId === defaultAccountId
                ? "active"
                : ""
            }`}
            type="button"
            onClick={onSetDefaultAccount}
            disabled={
              !selectedAccountId ||
              accountSelectionDisabled ||
              selectedAccountId === defaultAccountId
            }
            title={
              selectedAccountId === defaultAccountId
                ? "Workspace default account"
                : "Use as workspace default"
            }
            aria-label="Use selected account as workspace default"
          >
            <Pin size={14} />
          </button>
        </div>

        <label className="composer-select folder-select">
          <span className="composer-select-icon" aria-hidden="true">
            <Folder size={16} />
          </span>
          <select
            value={selectedWorkspaceId ?? ""}
            onChange={(event) => {
              const value = event.currentTarget.value;
              if (value === addWorkspaceValue) {
                onAddWorkspace();
                return;
              }
              onWorkspaceChange(Number(value));
            }}
            aria-label="Folder"
          >
            {selectedWorkspaceId === null ? (
              <option value="" disabled>
                Select folder
              </option>
            ) : null}
            {workspaces.map((workspace) => (
              <option key={workspace.id} value={workspace.id}>
                {workspace.label}
              </option>
            ))}
            <option value={addWorkspaceValue}>
              {workspaces.length === 0 ? "Add folder..." : "Add another folder..."}
            </option>
          </select>
          <ChevronDown className="select-chevron" size={16} aria-hidden="true" />
        </label>

        <label className="composer-select branch-select">
          <span className="composer-select-icon" aria-hidden="true">
            <GitBranch size={16} />
          </span>
          <select
            value={selectedBranch ?? ""}
            onChange={(event) => onBranchChange(event.currentTarget.value)}
            disabled={branches.length === 0}
            aria-label="Branch"
          >
            {branches.length === 0 ? (
              <option value="">No branches</option>
            ) : (
              branches.map((branch) => (
                <option key={branch} value={branch}>
                  {branch}
                </option>
              ))
            )}
          </select>
          <ChevronDown className="select-chevron" size={16} aria-hidden="true" />
        </label>

        <label className="composer-select access-select">
          <span className="composer-select-icon" aria-hidden="true">
            <ShieldCheck size={16} />
          </span>
          <select
            value={accessLevel}
            onChange={(event) => onAccessLevelChange(event.currentTarget.value as AccessLevel)}
            aria-label="Access"
          >
            <option value="ask">Ask for approval</option>
            <option value="full">Full access</option>
          </select>
          <ChevronDown className="select-chevron" size={16} aria-hidden="true" />
        </label>

        <label className="composer-select agent-select">
          <span className="composer-select-icon" aria-hidden="true">
            <Bot size={16} />
          </span>
          <select
            value={selectedModel?.id ?? ""}
            onChange={(event) => onModelChange(event.currentTarget.value)}
            disabled={controlsDisabled}
            aria-label="Agent"
          >
            {models.length === 0 ? (
              <option value="">{modelLoadError ? "Models unavailable" : "Connect Codex"}</option>
            ) : (
              models.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.displayName || model.model}
                </option>
              ))
            )}
          </select>
          <ChevronDown className="select-chevron" size={16} aria-hidden="true" />
        </label>

        <label className="composer-select reasoning-select">
          <span className="composer-select-icon" aria-hidden="true">
            <Gauge size={16} />
          </span>
          <select
            value={selectedReasoningEffort ?? ""}
            onChange={(event) => onReasoningEffortChange(event.currentTarget.value)}
            disabled={controlsDisabled || reasoningOptions.length === 0}
            aria-label="Reasoning"
          >
            {reasoningOptions.length === 0 ? (
              <option value="">Default</option>
            ) : (
              reasoningOptions.map((option) => (
                <option key={option.reasoningEffort} value={option.reasoningEffort}>
                  {labelReasoningEffort(option.reasoningEffort)}
                </option>
              ))
            )}
          </select>
          <ChevronDown className="select-chevron" size={16} aria-hidden="true" />
        </label>
      </div>

      {contextFiles.length > 0 ? (
        <div className="context-file-list" aria-label="Selected context files">
          {contextFiles.map((file) => (
            <span className={`context-chip ${file.status ?? "ready"}`} key={file.path}>
              <Paperclip size={13} />
              <span title={file.path}>{file.name}</span>
              <button
                type="button"
                onClick={() => onRemoveFile(file.path)}
                aria-label={`Remove ${file.name}`}
              >
                <X size={13} />
              </button>
            </span>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function labelReasoningEffort(effort: string) {
  if (!effort) {
    return "Default";
  }

  return effort
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
