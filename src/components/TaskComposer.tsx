import {
  BrainCircuit,
  ClipboardCheck,
  Flag,
  Paperclip,
  Play,
  X,
} from "lucide-react";
import type {
  AccessLevel,
  CodexModel,
  ComposerContextFile,
  RouteRecommendation,
} from "../types";

type Props = {
  disabled: boolean;
  prompt: string;
  routeRecommendation: RouteRecommendation;
  tokenEstimate: number;
  models: CodexModel[];
  modelLoadError: string | null;
  selectedModelId: string | null;
  selectedReasoningEffort: string | null;
  goalMode: boolean;
  planMode: boolean;
  accessLevel: AccessLevel;
  contextFiles: ComposerContextFile[];
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
  models,
  modelLoadError,
  selectedModelId,
  selectedReasoningEffort,
  goalMode,
  planMode,
  accessLevel,
  contextFiles,
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
  const selectedModel =
    models.find((model) => model.id === selectedModelId) ?? models[0] ?? null;
  const reasoningOptions = selectedModel?.supportedReasoningEfforts ?? [];
  const controlsDisabled = models.length === 0 || Boolean(modelLoadError);
  const planRecommended = routeRecommendation === "plan-first";

  return (
    <section className="composer-panel" aria-label="Task composer">
      <label className="prompt-field">
        <span className="sr-only">Prompt</span>
        <textarea
          value={prompt}
          onChange={(event) => onPromptChange(event.currentTarget.value)}
          placeholder="Do anything"
          rows={5}
        />
      </label>

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
          <span className="token-pill">{tokenEstimate.toLocaleString()} tokens</span>
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
        <label className="composer-select access-select">
          <span>Access</span>
          <select
            value={accessLevel}
            onChange={(event) => onAccessLevelChange(event.currentTarget.value as AccessLevel)}
            aria-label="Access"
          >
            <option value="ask">Ask for approval</option>
            <option value="full">Full access</option>
          </select>
        </label>

        <label className="composer-select agent-select">
          <span>Agent</span>
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
        </label>

        <label className="composer-select reasoning-select">
          <span>Reasoning</span>
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
