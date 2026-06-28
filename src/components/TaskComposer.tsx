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
import { useLayoutEffect, useRef, useState } from "react";
import type { DragEvent } from "react";
import { ComposerSelect } from "./ComposerSelect";
import type {
  AccessLevel,
  CodexAccountProfile,
  CodexModel,
  ComposerContextFile,
  RouteRecommendation,
} from "../types";
import { ORCHESTRATOR_CONTEXT_FILE_MIME as CONTEXT_FILE_MIME } from "../types";

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
  onContextFilesDrop: (files: ComposerContextFile[]) => void;
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
  onContextFilesDrop,
  onRemoveFile,
  onPreflight,
  onRun,
}: Props) {
  const promptTextareaRef = useRef<HTMLTextAreaElement>(null);
  const [dragActive, setDragActive] = useState(false);
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

  function handleDragOver(event: DragEvent<HTMLElement>) {
    if (!hasContextFilePayload(event)) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setDragActive(true);
  }

  function handleDragLeave(event: DragEvent<HTMLElement>) {
    const relatedTarget = event.relatedTarget;
    if (
      !(relatedTarget instanceof Node) ||
      !event.currentTarget.contains(relatedTarget)
    ) {
      setDragActive(false);
    }
  }

  function handleDrop(event: DragEvent<HTMLElement>) {
    if (!hasContextFilePayload(event)) {
      return;
    }

    event.preventDefault();
    setDragActive(false);
    const files = readDroppedContextFiles(event);
    if (files.length > 0) {
      onContextFilesDrop(files);
    }
  }

  return (
    <section
      className={`composer-panel ${dragActive ? "drag-over" : ""}`}
      aria-label="Task composer"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
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

      <div className="composer-controls">
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
      </div>
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

function hasContextFilePayload(event: DragEvent<HTMLElement>) {
  return Array.from(event.dataTransfer.types).includes(CONTEXT_FILE_MIME);
}

function readDroppedContextFiles(event: DragEvent<HTMLElement>) {
  const raw = event.dataTransfer.getData(CONTEXT_FILE_MIME);
  if (!raw) {
    return [];
  }

  try {
    const payload = JSON.parse(raw);
    const files = Array.isArray(payload) ? payload : [payload];
    return files
      .map(readContextFile)
      .filter((file): file is ComposerContextFile => file !== null);
  } catch {
    return [];
  }
}

function readContextFile(value: unknown): ComposerContextFile | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const file = value as Record<string, unknown>;
  if (typeof file.path !== "string" || typeof file.name !== "string") {
    return null;
  }

  return {
    path: file.path,
    name: file.name,
    source: "explorer",
    status: "ready",
  };
}
