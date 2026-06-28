import {
  BrainCircuit,
  ClipboardCheck,
  CircleUserRound,
  Flag,
  GitBranch,
  Bot,
  Gauge,
  Paperclip,
  Play,
  ShieldCheck,
  X,
} from "lucide-react";
import { useLayoutEffect, useRef } from "react";
import { ComposerSelect } from "./ComposerSelect";
import type {
  AccessLevel,
  CodexAccountProfile,
  CodexModel,
  ComposerContextFile,
  RouteRecommendation,
} from "../types";

type Props = {
  disabled: boolean;
  prompt: string;
  routeRecommendation: RouteRecommendation;
  tokenEstimate: number;
  accounts: CodexAccountProfile[];
  selectedAccountId: number | null;
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
  onAccountChange: (accountId: number) => void;
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
  accounts,
  selectedAccountId,
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
  onAccountChange,
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
          <ComposerSelect
            ariaLabel="Run account"
            value={selectedAccountId?.toString() ?? ""}
            options={accounts.map((account) => ({
              value: account.id.toString(),
              label: account.label,
            }))}
            placeholder="Sign in required"
            icon={<CircleUserRound size={16} />}
            className="account-select"
            disabled={accounts.length === 0 || accountSelectionDisabled}
            onChange={(value) => onAccountChange(Number(value))}
          />
        </div>

        <ComposerSelect
          ariaLabel="Branch"
          value={selectedBranch ?? ""}
          options={branches.map((branch) => ({ value: branch, label: branch }))}
          placeholder="No branches"
          icon={<GitBranch size={16} />}
          className="branch-select"
          disabled={branches.length === 0}
          onChange={onBranchChange}
        />

        <ComposerSelect
          ariaLabel="Access"
          value={accessLevel}
          options={[
            { value: "ask", label: "Ask for approval" },
            { value: "full", label: "Full access" },
          ]}
          placeholder="Ask for approval"
          icon={<ShieldCheck size={16} />}
          className="access-select"
          onChange={(value) => onAccessLevelChange(value as AccessLevel)}
        />

        <ComposerSelect
          ariaLabel="Agent"
          value={selectedModel?.id ?? ""}
          options={models.map((model) => ({
            value: model.id,
            label: model.displayName || model.model,
          }))}
          placeholder={modelLoadError ? "Models unavailable" : "Connect Codex"}
          icon={<Bot size={16} />}
          className="agent-select"
          disabled={controlsDisabled}
          onChange={onModelChange}
        />

        <ComposerSelect
          ariaLabel="Reasoning"
          value={selectedReasoningEffort ?? ""}
          options={reasoningOptions.map((option) => ({
            value: option.reasoningEffort,
            label: labelReasoningEffort(option.reasoningEffort),
          }))}
          placeholder="Default"
          icon={<Gauge size={16} />}
          className="reasoning-select"
          disabled={controlsDisabled || reasoningOptions.length === 0}
          onChange={onReasoningEffortChange}
        />
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
