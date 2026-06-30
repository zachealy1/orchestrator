import {
  BrainCircuit,
  ClipboardCheck,
  CircleUserRound,
  Flag,
  FileText,
  GitBranch,
  Bot,
  Gauge,
  Paperclip,
  Play,
  ShieldCheck,
  X,
} from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ChangeEvent, DragEvent, KeyboardEvent } from "react";
import { ComposerSelect } from "./ComposerSelect";
import type {
  AccessLevel,
  CodexAccountProfile,
  ComposerMentionSearchStatus,
  CodexModel,
  ComposerContextFile,
  RouteRecommendation,
  SelectedComposerSkill,
  SlashCommandItem,
  SlashCommandSearchStatus,
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
  selectedSkills: SelectedComposerSkill[];
  mentionResults: ComposerContextFile[];
  mentionSearchStatus: ComposerMentionSearchStatus;
  mentionSearchError?: string | null;
  slashCommandResults: SlashCommandItem[];
  slashCommandSearchStatus: SlashCommandSearchStatus;
  slashCommandSearchError?: string | null;
  onAccountChange: (accountId: number) => void;
  onBranchChange: (branch: string) => void;
  onPromptChange: (prompt: string) => void;
  onModelChange: (modelId: string) => void;
  onReasoningEffortChange: (effort: string) => void;
  onGoalModeChange: (value: boolean) => void;
  onPlanModeChange: (value: boolean) => void;
  onAccessLevelChange: (accessLevel: AccessLevel) => void;
  onAddFiles: () => void;
  onMentionSearch: (query: string) => void;
  onMentionFileSelect: (file: ComposerContextFile) => void;
  onMentionClose: () => void;
  onSlashCommandSearch: (query: string) => void;
  onSlashCommandSelect: (item: SlashCommandItem) => void;
  onSlashCommandClose: () => void;
  onContextFilesDrop: (files: ComposerContextFile[]) => void;
  onContextFilesDropError?: (message: string) => void;
  onRemoveFile: (path: string) => void;
  onRemoveSkill: (skillId: string) => void;
  onPreflight: () => void;
  onRun: () => void;
};

type ComposerToken = {
  trigger: "@" | "/";
  start: number;
  end: number;
  query: string;
};

type SlashPanel = "commands" | "reasoning";

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
  selectedSkills,
  mentionResults,
  mentionSearchStatus,
  mentionSearchError,
  slashCommandResults,
  slashCommandSearchStatus,
  slashCommandSearchError,
  onAccountChange,
  onBranchChange,
  onPromptChange,
  onModelChange,
  onReasoningEffortChange,
  onGoalModeChange,
  onPlanModeChange,
  onAccessLevelChange,
  onAddFiles,
  onMentionSearch,
  onMentionFileSelect,
  onMentionClose,
  onSlashCommandSearch,
  onSlashCommandSelect,
  onSlashCommandClose,
  onContextFilesDrop,
  onContextFilesDropError,
  onRemoveFile,
  onRemoveSkill,
  onPreflight,
  onRun,
}: Props) {
  const promptTextareaRef = useRef<HTMLTextAreaElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const [activeToken, setActiveToken] = useState<ComposerToken | null>(null);
  const [activePopoverIndex, setActivePopoverIndex] = useState(0);
  const [slashPanel, setSlashPanel] = useState<SlashPanel>("commands");
  const selectedModel =
    models.find((model) => model.id === selectedModelId) ?? models[0] ?? null;
  const reasoningOptions = selectedModel?.supportedReasoningEfforts ?? [];
  const controlsDisabled = models.length === 0 || Boolean(modelLoadError);
  const planRecommended = routeRecommendation === "plan-first";
  const mentionOpen = activeToken?.trigger === "@";
  const slashOpen = activeToken?.trigger === "/";

  useEffect(() => {
    setActivePopoverIndex(0);
  }, [
    activeToken?.query,
    activeToken?.trigger,
    mentionResults.length,
    slashCommandResults.length,
    reasoningOptions.length,
    slashPanel,
  ]);

  function handleGoalModeClick() {
    const nextGoalMode = !goalMode;
    onGoalModeChange(nextGoalMode);
    if (nextGoalMode && planMode) {
      onPlanModeChange(false);
    }
  }

  function handlePlanModeClick() {
    const nextPlanMode = !planMode;
    onPlanModeChange(nextPlanMode);
    if (nextPlanMode && goalMode) {
      onGoalModeChange(false);
    }
  }

  function closeActiveSearch() {
    if (!activeToken) {
      return;
    }

    const trigger = activeToken.trigger;
    setActiveToken(null);
    setActivePopoverIndex(0);
    setSlashPanel("commands");

    if (trigger === "@") {
      onMentionClose();
    } else {
      onSlashCommandClose();
    }
  }

  function updateSearchFromPrompt(nextPrompt: string, caret: number) {
    const previousTrigger = activeToken?.trigger ?? null;
    const token = readComposerToken(nextPrompt, caret);
    setActiveToken(token);
    setActivePopoverIndex(0);
    setSlashPanel("commands");

    if (token?.trigger === "@") {
      onMentionSearch(token.query);
    } else if (previousTrigger === "@") {
      onMentionClose();
    }

    if (token?.trigger === "/") {
      onSlashCommandSearch(token.query);
    } else if (previousTrigger === "/") {
      onSlashCommandClose();
    }
  }

  function handlePromptChange(event: ChangeEvent<HTMLTextAreaElement>) {
    const nextPrompt = event.currentTarget.value;
    onPromptChange(nextPrompt);
    updateSearchFromPrompt(nextPrompt, event.currentTarget.selectionStart);
  }

  function handlePromptKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (activeToken && event.key === "Escape") {
      event.preventDefault();
      closeActiveSearch();
      return;
    }

    const itemCount = getActivePopoverItemCount();
    if (activeToken && event.key === "ArrowDown" && itemCount > 0) {
      event.preventDefault();
      setActivePopoverIndex((current) => (current + 1) % itemCount);
      return;
    }

    if (activeToken && event.key === "ArrowUp" && itemCount > 0) {
      event.preventDefault();
      setActivePopoverIndex(
        (current) => (current - 1 + itemCount) % itemCount,
      );
      return;
    }

    if (
      activeToken &&
      (event.key === "Enter" || event.key === "Tab") &&
      itemCount > 0
    ) {
      event.preventDefault();
      selectActivePopoverItem();
      return;
    }

    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      closeActiveSearch();
      if (!disabled) {
        onRun();
      }
    }
  }

  function getActivePopoverItemCount() {
    if (mentionOpen) {
      return mentionResults.length;
    }

    if (slashOpen && slashPanel === "reasoning") {
      return reasoningOptions.length;
    }

    if (slashOpen) {
      return slashCommandResults.length;
    }

    return 0;
  }

  function selectActivePopoverItem() {
    if (mentionOpen) {
      selectMentionFile(mentionResults[activePopoverIndex] ?? mentionResults[0]);
      return;
    }

    if (slashOpen && slashPanel === "reasoning") {
      const option = reasoningOptions[activePopoverIndex] ?? reasoningOptions[0];
      if (option) {
        selectReasoningEffort(option.reasoningEffort);
      }
      return;
    }

    if (slashOpen) {
      selectSlashCommand(
        slashCommandResults[activePopoverIndex] ?? slashCommandResults[0],
      );
    }
  }

  function selectMentionFile(file: ComposerContextFile) {
    if (activeToken?.trigger !== "@") {
      return;
    }

    const nextPrompt = removeComposerToken(prompt, activeToken);
    onPromptChange(nextPrompt.value);
    onMentionFileSelect(file);
    setActiveToken(null);
    setActivePopoverIndex(0);
    onMentionClose();

    window.requestAnimationFrame(() => {
      promptTextareaRef.current?.focus();
      promptTextareaRef.current?.setSelectionRange(nextPrompt.caret, nextPrompt.caret);
    });
  }

  function selectSlashCommand(item: SlashCommandItem | undefined) {
    if (!item || activeToken?.trigger !== "/") {
      return;
    }

    if (item.kind === "builtin" && item.command === "reasoning") {
      setSlashPanel("reasoning");
      setActivePopoverIndex(0);
      return;
    }

    const nextPrompt = removeComposerToken(prompt, activeToken);
    onPromptChange(nextPrompt.value);
    onSlashCommandSelect(item);
    setActiveToken(null);
    setActivePopoverIndex(0);
    setSlashPanel("commands");
    onSlashCommandClose();

    window.requestAnimationFrame(() => {
      promptTextareaRef.current?.focus();
      promptTextareaRef.current?.setSelectionRange(nextPrompt.caret, nextPrompt.caret);
    });
  }

  function selectReasoningEffort(effort: string) {
    if (activeToken?.trigger !== "/") {
      return;
    }

    const nextPrompt = removeComposerToken(prompt, activeToken);
    onPromptChange(nextPrompt.value);
    onReasoningEffortChange(effort);
    setActiveToken(null);
    setActivePopoverIndex(0);
    setSlashPanel("commands");
    onSlashCommandClose();

    window.requestAnimationFrame(() => {
      promptTextareaRef.current?.focus();
      promptTextareaRef.current?.setSelectionRange(nextPrompt.caret, nextPrompt.caret);
    });
  }

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
    const { files, skipped } = readDroppedContextFiles(event);
    if (files.length > 0) {
      onContextFilesDrop(files);
    }
    if (skipped > 0) {
      onContextFilesDropError?.(
        `Skipped ${skipped} dropped file${skipped === 1 ? "" : "s"} because the file path was unavailable.`,
      );
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
      <div className={`prompt-shell ${contextFiles.length > 0 ? "has-context-files" : ""}`}>
        {contextFiles.length > 0 ? (
          <ContextFileList files={contextFiles} onRemoveFile={onRemoveFile} />
        ) : null}

        <label className="prompt-field">
          <span className="sr-only">Prompt</span>
          <textarea
            ref={promptTextareaRef}
            value={prompt}
            onChange={handlePromptChange}
            onKeyDown={handlePromptKeyDown}
            onBlur={closeActiveSearch}
            placeholder="Do anything"
            rows={1}
          />
        </label>

        {mentionOpen ? (
          <div
            className="mention-search-popover"
            role="listbox"
            aria-label="Workspace file suggestions"
          >
            <MentionSearchContent
              query={activeToken.query}
              results={mentionResults}
              status={mentionSearchStatus}
              error={mentionSearchError}
              activeIndex={activePopoverIndex}
              onSelect={selectMentionFile}
              onActiveIndexChange={setActivePopoverIndex}
            />
          </div>
        ) : slashOpen ? (
          <div
            className="mention-search-popover slash-command-popover"
            role="listbox"
            aria-label={
              slashPanel === "reasoning"
                ? "Reasoning effort suggestions"
                : "Slash command suggestions"
            }
          >
            <SlashCommandContent
              panel={slashPanel}
              query={activeToken.query}
              results={slashCommandResults}
              status={slashCommandSearchStatus}
              error={slashCommandSearchError}
              reasoningOptions={reasoningOptions}
              activeIndex={activePopoverIndex}
              onSelect={selectSlashCommand}
              onReasoningSelect={selectReasoningEffort}
              onActiveIndexChange={setActivePopoverIndex}
            />
          </div>
        ) : null}
      </div>

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
              onClick={handleGoalModeClick}
            >
              <Flag size={16} />
              Goal mode
            </button>

            <button
              className={`mode-toggle ${planMode ? "active" : ""} ${planRecommended ? "recommended" : ""}`}
              type="button"
              aria-pressed={planMode}
              onClick={handlePlanModeClick}
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

        {selectedSkills.length > 0 ? (
          <div className="context-file-list" aria-label="Selected skills">
            {selectedSkills.map((skill) => (
              <span className="context-chip skill" key={skill.id}>
                <BrainCircuit size={13} />
                <span title={skill.description ?? skill.name}>{skill.name}</span>
                <button
                  type="button"
                  onClick={() => onRemoveSkill(skill.id)}
                  aria-label={`Remove ${skill.name}`}
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

function ContextFileList({
  files,
  onRemoveFile,
}: {
  files: ComposerContextFile[];
  onRemoveFile: (path: string) => void;
}) {
  return (
    <div className="context-file-list prompt-context-list" aria-label="Selected context files">
      {files.map((file) =>
        file.source === "search" ? (
          <span
            className={`context-mention ${file.status ?? "ready"}`}
            key={file.path}
            title={file.path}
          >
            <span aria-hidden="true">#</span>
            <span>{file.name}</span>
            <button
              type="button"
              onClick={() => onRemoveFile(file.path)}
              aria-label={`Remove ${file.name}`}
            >
              <X size={12} />
            </button>
          </span>
        ) : (
          <article
            className={`context-attachment ${file.status ?? "ready"}`}
            key={file.path}
            title={file.path}
          >
            <span className="context-attachment-icon" aria-hidden="true">
              <FileText size={23} />
            </span>
            <span className="context-attachment-copy">
              <strong>{file.name}</strong>
              <small>{fileExtensionLabel(file.name)}</small>
            </span>
            <button
              type="button"
              onClick={() => onRemoveFile(file.path)}
              aria-label={`Remove ${file.name}`}
            >
              <X size={15} />
            </button>
          </article>
        ),
      )}
    </div>
  );
}

function MentionSearchContent({
  query,
  results,
  status,
  error,
  activeIndex,
  onSelect,
  onActiveIndexChange,
}: {
  query: string;
  results: ComposerContextFile[];
  status: ComposerMentionSearchStatus;
  error?: string | null;
  activeIndex: number;
  onSelect: (file: ComposerContextFile) => void;
  onActiveIndexChange: (index: number) => void;
}) {
  if (status === "disabled") {
    return <div className="mention-search-empty">Choose a folder first.</div>;
  }

  if (!query.trim()) {
    return <div className="mention-search-empty">Type a file name.</div>;
  }

  if (status === "loading") {
    return <div className="mention-search-empty">Searching files...</div>;
  }

  if (status === "error") {
    return (
      <div className="mention-search-empty error">
        {error ?? "Unable to search files."}
      </div>
    );
  }

  if (results.length === 0) {
    return <div className="mention-search-empty">No files found.</div>;
  }

  return (
    <>
      {results.map((file, index) => (
        <button
          type="button"
          role="option"
          aria-selected={index === activeIndex}
          className={`mention-search-option ${index === activeIndex ? "active" : ""}`}
          key={file.path}
          onMouseEnter={() => onActiveIndexChange(index)}
          onMouseDown={(event) => {
            event.preventDefault();
            onSelect(file);
          }}
        >
          <Paperclip size={13} aria-hidden="true" />
          <span>
            <strong>{file.name}</strong>
            <small>{relativeFileLabel(file)}</small>
          </span>
        </button>
      ))}
    </>
  );
}

function SlashCommandContent({
  panel,
  query,
  results,
  status,
  error,
  reasoningOptions,
  activeIndex,
  onSelect,
  onReasoningSelect,
  onActiveIndexChange,
}: {
  panel: SlashPanel;
  query: string;
  results: SlashCommandItem[];
  status: SlashCommandSearchStatus;
  error?: string | null;
  reasoningOptions: NonNullable<CodexModel["supportedReasoningEfforts"]>;
  activeIndex: number;
  onSelect: (item: SlashCommandItem) => void;
  onReasoningSelect: (effort: string) => void;
  onActiveIndexChange: (index: number) => void;
}) {
  if (panel === "reasoning") {
    if (reasoningOptions.length === 0) {
      return (
        <div className="mention-search-empty">
          No reasoning options for this agent.
        </div>
      );
    }

    return (
      <>
        {reasoningOptions.map((option, index) => (
          <button
            type="button"
            role="option"
            aria-selected={index === activeIndex}
            className={`mention-search-option slash-command-option ${
              index === activeIndex ? "active" : ""
            }`}
            key={option.reasoningEffort}
            onMouseEnter={() => onActiveIndexChange(index)}
            onMouseDown={(event) => {
              event.preventDefault();
              onReasoningSelect(option.reasoningEffort);
            }}
          >
            <Gauge size={13} aria-hidden="true" />
            <span>
              <strong>{labelReasoningEffort(option.reasoningEffort)}</strong>
              <small>{option.description || "Set reasoning effort"}</small>
            </span>
          </button>
        ))}
      </>
    );
  }

  if (status === "disabled" && results.length === 0) {
    return <div className="mention-search-empty">Sign in to load skills.</div>;
  }

  if (results.length === 0 && status === "loading") {
    return <div className="mention-search-empty">Loading commands...</div>;
  }

  if (results.length === 0 && status === "error") {
    return (
      <div className="mention-search-empty error">
        {error ?? "Skills unavailable."}
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <div className="mention-search-empty">
        {query.trim() ? "No commands found." : "No commands available."}
      </div>
    );
  }

  return (
    <>
      {results.map((item, index) => (
        <button
          type="button"
          role="option"
          aria-selected={index === activeIndex}
          className={`mention-search-option slash-command-option ${
            index === activeIndex ? "active" : ""
          }`}
          key={slashCommandKey(item)}
          onMouseEnter={() => onActiveIndexChange(index)}
          onMouseDown={(event) => {
            event.preventDefault();
            onSelect(item);
          }}
        >
          {slashCommandIcon(item)}
          <span>
            <strong>{item.title}</strong>
            <small>{item.description}</small>
          </span>
        </button>
      ))}
      {status === "loading" ? (
        <div className="mention-search-empty">Loading skills...</div>
      ) : null}
      {status === "error" ? (
        <div className="mention-search-empty error">
          {error ?? "Skills unavailable."}
        </div>
      ) : null}
    </>
  );
}

function slashCommandKey(item: SlashCommandItem) {
  return item.kind === "skill" ? `skill:${item.skill.id}` : `builtin:${item.command}`;
}

function slashCommandIcon(item: SlashCommandItem) {
  if (item.kind === "skill") {
    return <BrainCircuit size={13} aria-hidden="true" />;
  }

  switch (item.command) {
    case "plan":
      return <BrainCircuit size={13} aria-hidden="true" />;
    case "goal":
      return <Flag size={13} aria-hidden="true" />;
    case "reasoning":
      return <Gauge size={13} aria-hidden="true" />;
    case "compact":
      return <ClipboardCheck size={13} aria-hidden="true" />;
    case "status":
      return <ShieldCheck size={13} aria-hidden="true" />;
    case "review":
      return <ClipboardCheck size={13} aria-hidden="true" />;
    case "mcp":
      return <Bot size={13} aria-hidden="true" />;
    case "init":
      return <FileText size={13} aria-hidden="true" />;
  }
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
  const types = Array.from(event.dataTransfer.types);
  return (
    types.includes(CONTEXT_FILE_MIME) ||
    types.includes("Files") ||
    (event.dataTransfer.files?.length ?? 0) > 0
  );
}

function readDroppedContextFiles(event: DragEvent<HTMLElement>) {
  const raw = event.dataTransfer.getData(CONTEXT_FILE_MIME);
  const files: ComposerContextFile[] = [];
  let skipped = 0;

  if (raw) {
    try {
      const payload = JSON.parse(raw);
      const payloadFiles = Array.isArray(payload) ? payload : [payload];
      files.push(
        ...payloadFiles
          .map(readContextFile)
          .filter((file): file is ComposerContextFile => file !== null),
      );
    } catch {
      skipped += 1;
    }
  }

  for (const file of Array.from(event.dataTransfer.files ?? [])) {
    const dropped = readNativeDroppedFile(file);
    if (dropped) {
      files.push(dropped);
    } else {
      skipped += 1;
    }
  }

  return { files, skipped };
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

function readNativeDroppedFile(file: File): ComposerContextFile | null {
  const path = readNativeFilePath(file);
  if (!path) {
    return null;
  }

  return {
    path,
    name: file.name || basename(path),
    source: "explorer",
    status: "ready",
  };
}

function readNativeFilePath(file: File) {
  const candidate = file as File & { path?: unknown };
  return typeof candidate.path === "string" && candidate.path.trim()
    ? candidate.path
    : null;
}

function fileExtensionLabel(name: string) {
  const normalized = name.trim();
  const dotIndex = normalized.lastIndexOf(".");
  if (dotIndex <= 0 || dotIndex === normalized.length - 1) {
    return "FILE";
  }
  return normalized.slice(dotIndex + 1).toUpperCase();
}

function basename(path: string) {
  return path.replace(/\\/g, "/").split("/").filter(Boolean).pop() ?? path;
}

function readComposerToken(value: string, caret: number): ComposerToken | null {
  if (caret < 0 || caret > value.length) {
    return null;
  }

  let start = caret;
  while (start > 0 && !/\s/.test(value[start - 1])) {
    start -= 1;
  }

  let end = caret;
  while (end < value.length && !/\s/.test(value[end])) {
    end += 1;
  }

  const token = value.slice(start, end);
  if (!token.startsWith("@") && !token.startsWith("/")) {
    return null;
  }

  return {
    trigger: token.startsWith("@") ? "@" : "/",
    start,
    end,
    query: token.slice(1),
  };
}

function removeComposerToken(value: string, token: ComposerToken) {
  let before = value.slice(0, token.start);
  let after = value.slice(token.end);

  if (before.endsWith(" ") && /^\s+/.test(after)) {
    after = after.replace(/^\s+/, "");
  } else if (!before && /^\s+/.test(after)) {
    after = after.replace(/^\s+/, "");
  } else if (!after && /\s+$/.test(before)) {
    before = before.replace(/\s+$/, "");
  }

  return {
    value: `${before}${after}`,
    caret: before.length,
  };
}

function relativeFileLabel(file: ComposerContextFile) {
  if (file.relativePath) {
    return file.relativePath;
  }

  const normalizedName = file.name.replace(/\\/g, "/");
  const normalizedPath = file.path.replace(/\\/g, "/");
  return normalizedPath.endsWith(`/${normalizedName}`) ? normalizedPath : file.path;
}
