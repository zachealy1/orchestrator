import {
  BrainCircuit,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  ClipboardCheck,
  CircleUserRound,
  Flag,
  FileText,
  Image as ImageIcon,
  Bot,
  Gauge,
  Paperclip,
  Play,
  ShieldCheck,
  Square,
  X,
} from "lucide-react";
import {
  memo,
  startTransition,
  useCallback,
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  ChangeEvent,
  ClipboardEvent as ReactClipboardEvent,
  CompositionEvent as ReactCompositionEvent,
  DragEvent,
  KeyboardEvent,
} from "react";
import { ComposerSelect } from "./ComposerSelect";
import { GoalProgressIndicator } from "./GoalProgressIndicator";
import { PlanProgressIndicator } from "./PlanProgressIndicator";
import { PromptQueueStatus } from "./PromptQueueStatus";
import type { GoalProgressIndicatorModel } from "../lib/goalProgress";
import type { PlanProgressIndicatorModel } from "../lib/planProgress";
import type {
  CodexAccountProfile,
  CodexAccessMode,
  ComposerMentionSearchStatus,
  CodexModel,
  ComposerContextFile,
  PromptQueueItem,
  SelectedComposerSkill,
  SlashCommandItem,
  SlashCommandSearchStatus,
} from "../types";
import { ORCHESTRATOR_PROMPT_CONTEXT_MIME } from "../types";
import {
  contextFileDisplayReference,
  contextFileExtensionLabel,
  contextFileInlineReferenceTokens,
  hasContextFilePayload,
  readDroppedContextFiles,
  restorePromptInlineFileReferencesForComposer,
  serializePromptInlineFileReferences,
} from "../lib/contextFiles";
import {
  isImageContextFile,
  loadImageAttachmentPreview,
} from "../lib/imageAttachments";
import { estimateTokens, recommendRoute } from "../lib/taskAnalysis";

export type ComposerStatusNotice = {
  id: string;
  tone: "approval" | "warning" | "success";
  title: string;
  detail: string;
  actionLabel?: string;
};

type Props = {
  disabled: boolean;
  runActive: boolean;
  prompt: string;
  promptRevision?: number;
  accounts: CodexAccountProfile[];
  selectedAccountId: number | null;
  accountPlaceholder?: string;
  accountSelectionDisabled: boolean;
  modelSelectionDisabled?: boolean;
  models: CodexModel[];
  modelLoadError: string | null;
  selectedModelId: string | null;
  selectedReasoningEffort: string | null;
  goalMode: boolean;
  planMode: boolean;
  goalProgress?: GoalProgressIndicatorModel | null;
  planProgress?: PlanProgressIndicatorModel | null;
  statusNotices?: ComposerStatusNotice[];
  queueItems?: PromptQueueItem[];
  queuePaused?: boolean;
  queueActionPendingItemId?: string | null;
  accessMode: CodexAccessMode;
  contextFiles: ComposerContextFile[];
  selectedSkills: SelectedComposerSkill[];
  mentionResults: ComposerContextFile[];
  mentionSearchStatus: ComposerMentionSearchStatus;
  mentionSearchError?: string | null;
  slashCommandResults: SlashCommandItem[];
  slashCommandSearchStatus: SlashCommandSearchStatus;
  slashCommandSearchError?: string | null;
  onAccountChange: (accountId: number) => void;
  onPromptChange: (prompt: string) => void;
  onModelChange: (modelId: string) => void;
  onReasoningEffortChange: (effort: string) => void;
  onGoalModeChange: (value: boolean) => void;
  onPlanModeChange: (value: boolean) => void;
  onPauseGoal: () => void;
  onResumeGoal: () => void;
  onEditGoal: () => void;
  onStopGoal: () => void;
  onStatusNoticeActivate?: (noticeId: string) => void;
  onQueueEdit?: (item: PromptQueueItem) => void;
  onQueueRemove?: (item: PromptQueueItem) => void;
  onQueueRetry?: (item: PromptQueueItem) => void;
  onQueueSkip?: (item: PromptQueueItem) => void;
  onQueueSendNow?: (item: PromptQueueItem) => void;
  onQueueResume?: () => void;
  onQueueReorder?: (orderedItemIds: string[]) => void;
  onDispatchQueued?: () => void;
  onAccessModeChange: (accessMode: CodexAccessMode) => void;
  onAddFiles: () => void;
  onMentionSearch: (query: string) => void;
  onMentionFileSelect: (file: ComposerContextFile) => void;
  onMentionClose: () => void;
  onSlashCommandSearch: (query: string) => void;
  onSlashCommandSelect: (item: SlashCommandItem) => void;
  onSlashCommandClose: () => void;
  onContextFilesDrop: (files: ComposerContextFile[]) => void;
  onContextFilesDropError?: (message: string) => void;
  contextDropActive?: boolean;
  onDropSurfaceElementChange?: (element: HTMLElement | null) => void;
  onPromptElementChange?: (element: HTMLTextAreaElement | null) => void;
  hasContextFileDropFallback?: () => boolean;
  getContextFileDropFallback?: () => ComposerContextFile[];
  onContextFileDropHandled?: () => void;
  onRemoveFile: (path: string) => void;
  onRemoveSkill: (skillId: string) => void;
  onRun: (prompt: string) => void;
  onStop: () => void;
};

type ComposerToken = {
  trigger: "@" | "/";
  start: number;
  end: number;
  query: string;
};

type SlashPanel = "commands" | "reasoning";

type PromptContextClipboardPayload = {
  version: 1;
  prompt: string;
  files: ComposerContextFile[];
};

const ACCESS_MODE_OPTIONS = [
  { value: "ask-for-approval", label: "Ask for approval" },
  { value: "full-access", label: "Full access" },
];

const PROMPT_AUTOSIZE_MIRROR_CHARACTER_LIMIT = 8_000;
const PROMPT_AUTOSIZE_CAPPED_LINES = 12;
const DISABLED_WEBKIT_WRITING_SUGGESTIONS = {
  writingsuggestions: "false",
} as const;
const NOOP = () => undefined;
const NOOP_QUEUE_ITEM = (_item: PromptQueueItem) => undefined;
const NOOP_QUEUE_ORDER = (_itemIds: string[]) => undefined;

export function promptAutosizeMirrorText(prompt: string) {
  if (prompt.length > PROMPT_AUTOSIZE_MIRROR_CHARACTER_LIMIT) {
    return `${"\n".repeat(PROMPT_AUTOSIZE_CAPPED_LINES)}\u200b`;
  }
  return `${prompt}\u200b`;
}

export const TaskComposer = memo(function TaskComposer({
  disabled,
  runActive,
  prompt,
  promptRevision = 0,
  accounts,
  selectedAccountId,
  accountPlaceholder = "Sign in required",
  accountSelectionDisabled,
  modelSelectionDisabled = false,
  models,
  modelLoadError,
  selectedModelId,
  selectedReasoningEffort,
  goalMode,
  planMode,
  goalProgress = null,
  planProgress = null,
  statusNotices = [],
  queueItems = [],
  queuePaused = false,
  queueActionPendingItemId = null,
  accessMode,
  contextFiles,
  selectedSkills,
  mentionResults,
  mentionSearchStatus,
  mentionSearchError,
  slashCommandResults,
  slashCommandSearchStatus,
  slashCommandSearchError,
  onAccountChange,
  onPromptChange,
  onModelChange,
  onReasoningEffortChange,
  onGoalModeChange,
  onPlanModeChange,
  onPauseGoal,
  onResumeGoal,
  onEditGoal,
  onStopGoal,
  onStatusNoticeActivate,
  onQueueEdit = NOOP_QUEUE_ITEM,
  onQueueRemove = NOOP_QUEUE_ITEM,
  onQueueRetry = NOOP_QUEUE_ITEM,
  onQueueSkip = NOOP_QUEUE_ITEM,
  onQueueSendNow = NOOP_QUEUE_ITEM,
  onQueueResume = NOOP,
  onQueueReorder = NOOP_QUEUE_ORDER,
  onDispatchQueued = NOOP,
  onAccessModeChange,
  onAddFiles,
  onMentionSearch,
  onMentionFileSelect,
  onMentionClose,
  onSlashCommandSearch,
  onSlashCommandSelect,
  onSlashCommandClose,
  onContextFilesDrop,
  onContextFilesDropError,
  contextDropActive = false,
  onDropSurfaceElementChange,
  onPromptElementChange,
  hasContextFileDropFallback,
  getContextFileDropFallback,
  onContextFileDropHandled,
  onRemoveFile,
  onRemoveSkill,
  onRun,
  onStop,
}: Props) {
  const promptTextareaRef = useRef<HTMLTextAreaElement>(null);
  const compositionActiveRef = useRef(false);
  const externalPromptRevisionRef = useRef(promptRevision);
  const draftPromptRef = useRef(prompt);
  const pendingVisualPromptRef = useRef(prompt);
  const visualPromptFrameRef = useRef<number | null>(null);
  const [draftPrompt, setDraftPrompt] = useState(prompt);
  const [dragActive, setDragActive] = useState(false);
  const [activeToken, setActiveToken] = useState<ComposerToken | null>(null);
  const [activePopoverIndex, setActivePopoverIndex] = useState(0);
  const [slashPanel, setSlashPanel] = useState<SlashPanel>("commands");
  const selectedModel = useMemo(
    () => models.find((model) => model.id === selectedModelId) ?? models[0] ?? null,
    [models, selectedModelId],
  );
  const reasoningOptions = selectedModel?.supportedReasoningEfforts ?? [];
  const controlsDisabled = models.length === 0 || Boolean(modelLoadError);
  const mentionOpen = activeToken?.trigger === "@";
  const slashOpen = activeToken?.trigger === "/";
  const inlineContextFiles = useMemo(
    () => contextFiles.filter((file) => file.source === "search"),
    [contextFiles],
  );
  const attachmentContextFiles = useMemo(
    () => contextFiles.filter((file) => file.source !== "search"),
    [contextFiles],
  );
  const dropTargetActive = dragActive || contextDropActive;
  const setDropSurfaceRef = useCallback(
    (element: HTMLElement | null) => {
      onDropSurfaceElementChange?.(element);
    },
    [onDropSurfaceElementChange],
  );
  const setPromptTextareaElement = useCallback(
    (element: HTMLTextAreaElement | null) => {
      promptTextareaRef.current = element;
      onPromptElementChange?.(element);
    },
    [onPromptElementChange],
  );

  const cancelVisualPromptUpdate = useCallback(() => {
    if (visualPromptFrameRef.current !== null) {
      window.cancelAnimationFrame(visualPromptFrameRef.current);
      visualPromptFrameRef.current = null;
    }
  }, []);

  const publishVisualPrompt = useCallback(
    (nextPrompt: string, immediate = false) => {
      pendingVisualPromptRef.current = nextPrompt;
      if (immediate) {
        cancelVisualPromptUpdate();
        setDraftPrompt(nextPrompt);
        return;
      }
      if (visualPromptFrameRef.current !== null) return;

      visualPromptFrameRef.current = window.requestAnimationFrame(() => {
        visualPromptFrameRef.current = null;
        const pendingPrompt = pendingVisualPromptRef.current;
        startTransition(() => {
          setDraftPrompt((current) => {
            if (pendingVisualPromptRef.current !== pendingPrompt) return current;
            return current === pendingPrompt ? current : pendingPrompt;
          });
        });
      });
    },
    [cancelVisualPromptUpdate],
  );

  function updateDraftPrompt(
    nextPrompt: string,
    options: { immediate?: boolean; syncTextarea?: boolean } = {},
  ) {
    draftPromptRef.current = nextPrompt;
    if (
      options.syncTextarea &&
      promptTextareaRef.current &&
      promptTextareaRef.current.value !== nextPrompt
    ) {
      promptTextareaRef.current.value = nextPrompt;
    }
    publishVisualPrompt(nextPrompt, options.immediate);
    onPromptChange(nextPrompt);
  }

  useLayoutEffect(() => {
    if (externalPromptRevisionRef.current === promptRevision) {
      return;
    }

    externalPromptRevisionRef.current = promptRevision;
    compositionActiveRef.current = false;
    cancelVisualPromptUpdate();
    draftPromptRef.current = prompt;
    pendingVisualPromptRef.current = prompt;
    if (
      promptTextareaRef.current &&
      promptTextareaRef.current.value !== prompt
    ) {
      promptTextareaRef.current.value = prompt;
    }
    setDraftPrompt(prompt);
    setActiveToken(null);
    setActivePopoverIndex(0);
    setSlashPanel("commands");
  }, [cancelVisualPromptUpdate, prompt, promptRevision]);

  useEffect(
    () => () => {
      cancelVisualPromptUpdate();
    },
    [cancelVisualPromptUpdate],
  );

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

    if (composerTokensEqual(activeToken, token)) {
      return false;
    }

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

    return true;
  }

  function handlePromptChange(event: ChangeEvent<HTMLTextAreaElement>) {
    const textarea = event.currentTarget;
    const selectionStart = textarea.selectionStart;
    const selectionEnd = textarea.selectionEnd;
    const nextPrompt = compositionActiveRef.current
      ? textarea.value
      : normalizePromptInput(textarea.value, event.nativeEvent);
    if (textarea.value !== nextPrompt) {
      textarea.value = nextPrompt;
      textarea.setSelectionRange(selectionStart, selectionEnd);
    }
    draftPromptRef.current = nextPrompt;
    onPromptChange(nextPrompt);
    const searchChanged = !compositionActiveRef.current
      ? updateSearchFromPrompt(nextPrompt, textarea.selectionStart)
      : false;
    publishVisualPrompt(
      nextPrompt,
      inlineContextFiles.length > 0 || searchChanged,
    );
  }

  function handlePromptCompositionStart() {
    compositionActiveRef.current = true;
  }

  function handlePromptCompositionEnd(
    event: ReactCompositionEvent<HTMLTextAreaElement>,
  ) {
    compositionActiveRef.current = false;
    const nextPrompt = normalizePromptQuotes(event.currentTarget.value);
    if (event.currentTarget.value !== nextPrompt) {
      const selectionStart = event.currentTarget.selectionStart;
      const selectionEnd = event.currentTarget.selectionEnd;
      event.currentTarget.value = nextPrompt;
      event.currentTarget.setSelectionRange(selectionStart, selectionEnd);
    }
    draftPromptRef.current = nextPrompt;
    onPromptChange(nextPrompt);
    const searchChanged = updateSearchFromPrompt(
      nextPrompt,
      event.currentTarget.selectionStart,
    );
    publishVisualPrompt(nextPrompt, inlineContextFiles.length > 0 || searchChanged);
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

    if (event.key === "Backspace" || event.key === "Delete") {
      const inlineDeletion = getInlineFileDeletion(
        draftPromptRef.current,
        inlineContextFiles,
        event.currentTarget.selectionStart,
        event.currentTarget.selectionEnd,
        event.key,
      );

      if (inlineDeletion) {
        event.preventDefault();
        closeActiveSearch();
        updateDraftPrompt(inlineDeletion.value, {
          immediate: true,
          syncTextarea: true,
        });
        inlineDeletion.files.forEach((file) => onRemoveFile(file.path));
        window.requestAnimationFrame(() => {
          promptTextareaRef.current?.focus();
          promptTextareaRef.current?.setSelectionRange(
            inlineDeletion.caret,
            inlineDeletion.caret,
          );
        });
        return;
      }
    }

    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      closeActiveSearch();
      if (!disabled) {
        if (draftPromptRef.current.trim()) {
          onRun(draftPromptRef.current);
        } else if (!runActive && !queuePaused && queueItems.length > 0) {
          onDispatchQueued();
        }
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

    const nextPrompt = replaceComposerToken(
      draftPromptRef.current,
      activeToken,
      inlineFilePromptToken(file),
    );
    updateDraftPrompt(nextPrompt.value, {
      immediate: true,
      syncTextarea: true,
    });
    onMentionFileSelect(file);
    setActiveToken(null);
    setActivePopoverIndex(0);
    onMentionClose();

    window.requestAnimationFrame(() => {
      promptTextareaRef.current?.focus();
      promptTextareaRef.current?.setSelectionRange(nextPrompt.caret, nextPrompt.caret);
    });
  }

  function handlePromptCopy(event: ReactClipboardEvent<HTMLTextAreaElement>) {
    const textarea = event.currentTarget;
    const selectionStart = textarea.selectionStart;
    const selectionEnd = textarea.selectionEnd;
    if (selectionEnd <= selectionStart || inlineContextFiles.length === 0) {
      return;
    }

    const currentPrompt = textarea.value;
    const selectedPrompt = currentPrompt.slice(selectionStart, selectionEnd);
    const selectedFiles = getInlineFilesFullyInsideRange(
      currentPrompt,
      inlineContextFiles,
      selectionStart,
      selectionEnd,
    );
    if (selectedFiles.length === 0) {
      return;
    }

    writePromptContextClipboard(event, {
      version: 1,
      prompt: serializePromptInlineFileReferences(selectedPrompt, selectedFiles),
      files: selectedFiles,
    });
  }

  function handlePromptPaste(event: ReactClipboardEvent<HTMLTextAreaElement>) {
    const payload = readPromptContextClipboard(event.clipboardData);
    if (!payload) {
      return;
    }

    event.preventDefault();

    const textarea = event.currentTarget;
    const selectionStart = textarea.selectionStart;
    const selectionEnd = textarea.selectionEnd;
    const pastedPrompt = normalizePromptQuotes(
      restorePromptInlineFileReferencesForComposer(payload.prompt, payload.files),
    );
    const currentPrompt = textarea.value;
    const nextPrompt = `${currentPrompt.slice(0, selectionStart)}${pastedPrompt}${currentPrompt.slice(selectionEnd)}`;
    const nextCaret = selectionStart + pastedPrompt.length;

    updateDraftPrompt(nextPrompt, {
      immediate: true,
      syncTextarea: true,
    });
    for (const file of payload.files) {
      onMentionFileSelect(file);
    }
    closeActiveSearch();

    window.requestAnimationFrame(() => {
      promptTextareaRef.current?.focus();
      promptTextareaRef.current?.setSelectionRange(nextCaret, nextCaret);
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

    const nextPrompt = removeComposerToken(draftPromptRef.current, activeToken);
    updateDraftPrompt(nextPrompt.value, {
      immediate: true,
      syncTextarea: true,
    });
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

    const nextPrompt = removeComposerToken(draftPromptRef.current, activeToken);
    updateDraftPrompt(nextPrompt.value, {
      immediate: true,
      syncTextarea: true,
    });
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

  function hasContextFileDrop(event: DragEvent<HTMLElement>) {
    return (
      hasContextFilePayload(event.dataTransfer) ||
      (hasContextFileDropFallback?.() ?? false)
    );
  }

  function readContextFileDrop(event: DragEvent<HTMLElement>) {
    const result = readDroppedContextFiles(event.dataTransfer);
    if (result.files.length > 0) {
      return result;
    }

    const fallbackFiles = getContextFileDropFallback?.() ?? [];
    return fallbackFiles.length > 0
      ? { ...result, files: fallbackFiles }
      : result;
  }

  function handleDragOver(event: DragEvent<HTMLElement>) {
    if (!hasContextFileDrop(event)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
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
    if (!hasContextFileDrop(event)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    setDragActive(false);
    const { files, skipped } = readContextFileDrop(event);
    if (files.length > 0) {
      onContextFilesDrop(files);
    }
    if (skipped > 0) {
      onContextFilesDropError?.(
        `Skipped ${skipped} dropped file${skipped === 1 ? "" : "s"} because the file path was unavailable.`,
      );
    }
    onContextFileDropHandled?.();
  }

  const hasComposerStatus =
    statusNotices.length > 0 ||
    Boolean(goalProgress) ||
    Boolean(planProgress) ||
    queueItems.length > 0;
  const hasDraftPrompt = draftPrompt.trim().length > 0;
  const queueDraftWhileRunning = runActive && hasDraftPrompt;
  const primaryActionIsStop = runActive && !queueDraftWhileRunning;
  const primaryActionLabel = primaryActionIsStop
    ? "Stop Codex"
    : queueDraftWhileRunning
      ? "Add prompt to queue"
      : hasDraftPrompt
        ? "Run Codex"
        : queueItems.length > 0
          ? "Run next queued prompt"
          : "Run Codex";

  return (
    <section
      className={`composer-panel ${dropTargetActive ? "drop-target-active" : ""} ${
        hasComposerStatus ? "has-composer-status" : ""
      }`}
      aria-label="Task composer"
    >
      {hasComposerStatus ? (
        <div className="composer-status-stack">
          {statusNotices.map((notice) => (
            <ComposerStatusRow
              key={notice.id}
              notice={notice}
              onActivate={onStatusNoticeActivate}
            />
          ))}
          {goalProgress ? (
            <GoalProgressIndicator
              progress={goalProgress}
              onPause={onPauseGoal}
              onResume={onResumeGoal}
              onEdit={onEditGoal}
              onStop={onStopGoal}
            />
          ) : null}
          {planProgress ? (
            <PlanProgressIndicator progress={planProgress} />
          ) : null}
          {queueItems.length > 0 ? (
            <PromptQueueStatus
              items={queueItems}
              paused={queuePaused}
              actionPendingItemId={queueActionPendingItemId}
              onEdit={onQueueEdit}
              onRemove={onQueueRemove}
              onRetry={onQueueRetry}
              onSkip={onQueueSkip}
              onSendNow={onQueueSendNow}
              onResume={onQueueResume}
              onReorder={onQueueReorder}
            />
          ) : null}
        </div>
      ) : null}
      <div
        className="composer-input-zone"
        ref={setDropSurfaceRef}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div className={`prompt-shell ${attachmentContextFiles.length > 0 ? "has-context-files" : ""}`}>
          {attachmentContextFiles.length > 0 ? (
            <ContextFileList files={attachmentContextFiles} onRemoveFile={onRemoveFile} />
          ) : null}

          <label
            className={`prompt-field ${
              inlineContextFiles.length > 0 ? "has-inline-context" : ""
            }`}
          >
            <span className="sr-only">Prompt</span>
            <span className="prompt-autosize-mirror" aria-hidden="true">
              {promptAutosizeMirrorText(draftPrompt)}
            </span>
            {inlineContextFiles.length > 0 ? (
              <PromptInlineHighlight
                prompt={draftPrompt}
                files={inlineContextFiles}
              />
            ) : null}
            <textarea
              ref={setPromptTextareaElement}
              aria-label="Prompt"
              defaultValue={prompt}
              onChange={handlePromptChange}
              onCompositionStart={handlePromptCompositionStart}
              onCompositionEnd={handlePromptCompositionEnd}
              onCopy={handlePromptCopy}
              onPaste={handlePromptPaste}
              onKeyDown={handlePromptKeyDown}
              onBlur={closeActiveSearch}
              autoCapitalize="none"
              autoComplete="off"
              autoCorrect="off"
              {...DISABLED_WEBKIT_WRITING_SUGGESTIONS}
              data-enable-grammarly="false"
              data-gramm="false"
              data-gramm_editor="false"
              placeholder="Do that thing!"
              rows={1}
              spellCheck={false}
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

        <PromptTokenEstimate prompt={draftPrompt} />
      </div>

      <div className="composer-controls">
        <div className="composer-toolbar" role="toolbar" aria-label="Prompt actions">
          <div className="composer-action-group">
            <button
              className={`mode-toggle ${goalMode ? "active" : ""}`}
              type="button"
              aria-pressed={goalMode}
              onClick={handleGoalModeClick}
            >
              <Flag size={16} />
              <span className="composer-button-label">Goal mode</span>
            </button>

            <PlanModeToggle
              active={planMode}
              prompt={draftPrompt}
              onClick={handlePlanModeClick}
            />

            <button className="secondary compact-action" type="button" onClick={onAddFiles}>
              <Paperclip size={16} />
              <span className="composer-button-label">Add files</span>
            </button>
          </div>

          <div className="composer-run-group">
            <button
              className={`send-button ${primaryActionIsStop ? "stop" : ""}`}
              type="button"
              onClick={() => {
                if (runActive) {
                  if (draftPromptRef.current.trim()) {
                    onRun(draftPromptRef.current);
                  } else {
                    onStop();
                  }
                } else if (hasDraftPrompt) {
                  onRun(draftPromptRef.current);
                } else {
                  onDispatchQueued();
                }
              }}
              disabled={
                queueDraftWhileRunning
                  ? disabled
                  : runActive
                  ? false
                  : disabled ||
                    (!hasDraftPrompt &&
                      (queueItems.length === 0 || queuePaused))
              }
              aria-label={primaryActionLabel}
              title={primaryActionLabel}
            >
              {primaryActionIsStop ? (
                <Square size={15} fill="currentColor" />
              ) : (
                <Play size={16} />
              )}
              <span className="sr-only">{primaryActionLabel}</span>
            </button>
          </div>
        </div>

        <ComposerOptionsRow
          accessMode={accessMode}
          accountSelectionDisabled={accountSelectionDisabled}
          accounts={accounts}
          controlsDisabled={controlsDisabled}
          modelLoadError={modelLoadError}
          modelSelectionDisabled={modelSelectionDisabled}
          models={models}
          onAccessModeChange={onAccessModeChange}
          onAccountChange={onAccountChange}
          onModelChange={onModelChange}
          onReasoningEffortChange={onReasoningEffortChange}
          reasoningOptions={reasoningOptions}
          selectedAccountId={selectedAccountId}
          accountPlaceholder={accountPlaceholder}
          selectedModel={selectedModel}
          selectedReasoningEffort={selectedReasoningEffort}
        />

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
});

function ComposerStatusRow({
  notice,
  onActivate,
}: {
  notice: ComposerStatusNotice;
  onActivate?: (noticeId: string) => void;
}) {
  const actionable = Boolean(notice.actionLabel && onActivate);
  const content = (
    <>
      {notice.tone === "approval" ? (
        <ShieldCheck size={15} aria-hidden="true" />
      ) : notice.tone === "success" ? (
        <CheckCircle2 size={15} aria-hidden="true" />
      ) : (
        <CircleAlert size={15} aria-hidden="true" />
      )}
      <strong>{notice.title}</strong>
      <span className="composer-status-detail">{notice.detail}</span>
      {actionable ? (
        <ChevronRight
          className="composer-status-chevron"
          size={15}
          aria-hidden="true"
        />
      ) : null}
    </>
  );

  return (
    <div
      className="composer-status-notice"
      data-tone={notice.tone}
      role={notice.tone === "success" ? "status" : "alert"}
    >
      {actionable ? (
        <button
          className="composer-status-action"
          type="button"
          aria-label={notice.actionLabel}
          title={notice.actionLabel}
          onClick={() => onActivate?.(notice.id)}
        >
          {content}
        </button>
      ) : (
        <div className="composer-status-content">{content}</div>
      )}
    </div>
  );
}

const PromptTokenEstimate = memo(function PromptTokenEstimate({
  prompt,
}: {
  prompt: string;
}) {
  const deferredPrompt = useDeferredValue(prompt);
  const tokenEstimate = useMemo(
    () => estimateTokens(deferredPrompt),
    [deferredPrompt],
  );

  return (
    <div className="composer-meta-row" aria-label="Prompt metadata">
      <span
        className="token-pill"
        title="Estimated from draft text only; Codex reports actual context usage after the run starts"
      >
        {tokenEstimate.toLocaleString()} tokens
      </span>
    </div>
  );
});

const PlanModeToggle = memo(function PlanModeToggle({
  active,
  prompt,
  onClick,
}: {
  active: boolean;
  prompt: string;
  onClick: () => void;
}) {
  const deferredPrompt = useDeferredValue(prompt);
  const planRecommended = useMemo(
    () => recommendRoute(deferredPrompt) === "plan-first",
    [deferredPrompt],
  );

  return (
    <button
      className={`mode-toggle ${active ? "active" : ""} ${
        planRecommended ? "recommended" : ""
      }`}
      type="button"
      aria-pressed={active}
      onClick={onClick}
    >
      <BrainCircuit size={16} />
      <span className="composer-button-label">Plan mode</span>
    </button>
  );
});

const ComposerOptionsRow = memo(function ComposerOptionsRow({
  accessMode,
  accountSelectionDisabled,
  accounts,
  controlsDisabled,
  modelLoadError,
  modelSelectionDisabled,
  models,
  onAccessModeChange,
  onAccountChange,
  onModelChange,
  onReasoningEffortChange,
  reasoningOptions,
  selectedAccountId,
  accountPlaceholder,
  selectedModel,
  selectedReasoningEffort,
}: {
  accessMode: CodexAccessMode;
  accountSelectionDisabled: boolean;
  accounts: CodexAccountProfile[];
  controlsDisabled: boolean;
  modelLoadError: string | null;
  modelSelectionDisabled: boolean;
  models: CodexModel[];
  onAccessModeChange: (accessMode: CodexAccessMode) => void;
  onAccountChange: (accountId: number) => void;
  onModelChange: (modelId: string) => void;
  onReasoningEffortChange: (effort: string) => void;
  reasoningOptions: NonNullable<CodexModel["supportedReasoningEfforts"]>;
  selectedAccountId: number | null;
  accountPlaceholder: string;
  selectedModel: CodexModel | null;
  selectedReasoningEffort: string | null;
}) {
  const accountOptions = useMemo(
    () =>
      accounts.map((account) => ({
        value: account.id.toString(),
        label: account.label,
      })),
    [accounts],
  );
  const modelOptions = useMemo(
    () =>
      models.map((model) => ({
        value: model.id,
        label: model.displayName || model.model,
      })),
    [models],
  );
  const reasoningSelectOptions = useMemo(
    () =>
      reasoningOptions.map((option) => ({
        value: option.reasoningEffort,
        label: labelReasoningEffort(option.reasoningEffort),
      })),
    [reasoningOptions],
  );
  const handleAccountChange = useCallback(
    (value: string) => onAccountChange(Number(value)),
    [onAccountChange],
  );
  const handleAccessModeChange = useCallback(
    (value: string) => onAccessModeChange(value as CodexAccessMode),
    [onAccessModeChange],
  );

  return (
    <div className="composer-options-row">
      <div className="account-select-group">
        <ComposerSelect
          ariaLabel="Run account"
          value={selectedAccountId?.toString() ?? ""}
          options={accountOptions}
          placeholder={accountPlaceholder}
          icon={<CircleUserRound size={16} />}
          className="account-select"
          disabled={accounts.length === 0 || accountSelectionDisabled}
          onChange={handleAccountChange}
        />
      </div>

      <ComposerSelect
        ariaLabel="Access"
        value={accessMode}
        options={ACCESS_MODE_OPTIONS}
        placeholder="Ask for approval"
        icon={<ShieldCheck size={16} />}
        className="access-select"
        onChange={handleAccessModeChange}
      />

      <ComposerSelect
        ariaLabel="Agent"
        value={selectedModel?.id ?? ""}
        options={modelOptions}
        placeholder={modelLoadError ? "Models unavailable" : "Connect Codex"}
        icon={<Bot size={16} />}
        className="agent-select"
        disabled={controlsDisabled || modelSelectionDisabled}
        onChange={onModelChange}
      />

      <ComposerSelect
        ariaLabel="Reasoning"
        value={selectedReasoningEffort ?? ""}
        options={reasoningSelectOptions}
        placeholder="Default"
        icon={<Gauge size={16} />}
        className="reasoning-select"
        disabled={
          controlsDisabled || modelSelectionDisabled || reasoningOptions.length === 0
        }
        onChange={onReasoningEffortChange}
      />
    </div>
  );
});

const ContextFileList = memo(function ContextFileList({
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
            {isImageContextFile(file) ? (
              <ComposerImageAttachmentPreview file={file} />
            ) : (
              <span className="context-attachment-icon" aria-hidden="true">
                <FileText size={23} />
              </span>
            )}
            <span className="context-attachment-copy">
              <strong>{file.name}</strong>
              <small>{contextFileExtensionLabel(file.name)}</small>
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
});

const ComposerImageAttachmentPreview = memo(
  function ComposerImageAttachmentPreview({
    file,
  }: {
    file: ComposerContextFile;
  }) {
    const [thumbnailDataUrl, setThumbnailDataUrl] = useState<string | null>(null);

    useEffect(() => {
      let active = true;
      void loadImageAttachmentPreview(file.canonicalPath ?? file.path)
        .then((preview) => {
          if (active) {
            setThumbnailDataUrl(preview?.thumbnailDataUrl ?? null);
          }
        })
        .catch(() => {
          if (active) setThumbnailDataUrl(null);
        });
      return () => {
        active = false;
      };
    }, [file.canonicalPath, file.path]);

    return (
      <span className="context-attachment-icon image" aria-hidden="true">
        {thumbnailDataUrl ? (
          <img src={thumbnailDataUrl} alt="" draggable={false} />
        ) : (
          <ImageIcon size={18} />
        )}
      </span>
    );
  },
);

const PromptInlineHighlight = memo(function PromptInlineHighlight({
  prompt,
  files,
}: {
  prompt: string;
  files: ComposerContextFile[];
}) {
  return (
    <div className="prompt-inline-highlight" aria-hidden="true">
      {buildPromptInlineSegments(prompt, files).map((segment, index) =>
        segment.kind === "file" ? (
          <span className="inline-context-mention" key={`${segment.file.path}-${index}`}>
            <span className="inline-context-type">
              {contextFileExtensionLabel(segment.file.name)}
            </span>{" "}
            <span className="inline-context-name">{segment.text}</span>
          </span>
        ) : (
          <span key={`text-${index}`}>{segment.text}</span>
        ),
      )}
    </div>
  );
});

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

  let token = value.slice(start, end);
  if (!token.startsWith("@") && token.includes("@")) {
    const triggerIndex = token.lastIndexOf("@", caret - start);
    if (triggerIndex >= 0) {
      start += triggerIndex;
      token = value.slice(start, end);
    }
  }

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

function replaceComposerToken(
  value: string,
  token: ComposerToken,
  replacement: string,
) {
  const rawBefore = value.slice(0, token.start);
  const needsLeadingSpace =
    rawBefore.length > 0 && !/\s$/.test(rawBefore) && replacement.length > 0;
  const before = needsLeadingSpace ? `${rawBefore} ` : rawBefore;
  let after = value.slice(token.end);
  after = /^\s/.test(after) ? after.replace(/^\s+/, " ") : ` ${after}`;
  const nextValue = `${before}${replacement}${after}`;
  const caret = before.length + replacement.length + 1;

  return {
    value: nextValue,
    caret,
  };
}

function buildPromptInlineSegments(
  prompt: string,
  files: ComposerContextFile[],
) {
  const candidates = buildInlineFileTokenCandidates(files);
  const segments: Array<
    | { kind: "text"; text: string }
    | { kind: "file"; text: string; file: ComposerContextFile }
  > = [];
  let cursor = 0;

  while (cursor < prompt.length) {
    const match = candidates.find((candidate) =>
      matchesInlineFileToken(prompt, cursor, candidate.token),
    );

    if (!match) {
      const nextMatchIndex = findNextInlineFileIndex(prompt, cursor + 1, candidates);
      const end = nextMatchIndex === -1 ? prompt.length : nextMatchIndex;
      segments.push({ kind: "text", text: prompt.slice(cursor, end) });
      cursor = end;
      continue;
    }

    segments.push({
      kind: "file",
      text: match.file.name,
      file: match.file,
    });
    cursor += match.token.length;
  }

  return segments;
}

function getInlineFileDeletion(
  prompt: string,
  files: ComposerContextFile[],
  selectionStart: number,
  selectionEnd: number,
  key: "Backspace" | "Delete",
) {
  const ranges = getInlineFileTokenRanges(prompt, files);
  if (ranges.length === 0) {
    return null;
  }

  const collapsed = selectionStart === selectionEnd;
  let deletionStart = selectionStart;
  let deletionEnd = selectionEnd;

  if (collapsed && key === "Backspace") {
    if (selectionStart <= 0) {
      return null;
    }
    deletionStart = selectionStart - 1;
  } else if (collapsed && key === "Delete") {
    if (selectionStart >= prompt.length) {
      return null;
    }
    deletionEnd = selectionStart + 1;
  }

  const affectedRanges = ranges.filter((range) =>
    deletionTouchesInlineFileRange(
      prompt,
      range,
      deletionStart,
      deletionEnd,
      key,
      collapsed,
    ),
  );

  if (affectedRanges.length === 0) {
    return null;
  }

  let removeStart = Math.min(
    deletionStart,
    ...affectedRanges.map((range) => range.start),
  );
  let removeEnd = Math.max(
    deletionEnd,
    ...affectedRanges.map((range) => range.end),
  );

  if (removeEnd < prompt.length && /\s/.test(prompt[removeEnd])) {
    removeEnd += 1;
  } else if (
    removeStart > 0 &&
    removeEnd < prompt.length &&
    /\s/.test(prompt[removeStart - 1]) &&
    /\s/.test(prompt[removeEnd])
  ) {
    removeStart -= 1;
  }

  const before = prompt.slice(0, removeStart);
  const after = prompt.slice(removeEnd);
  return {
    value: `${before}${after}`,
    caret: before.length,
    files: dedupeComposerContextFiles(affectedRanges.map((range) => range.file)),
  };
}

function getInlineFileTokenRanges(
  prompt: string,
  files: ComposerContextFile[],
) {
  const candidates = buildInlineFileTokenCandidates(files);
  const ranges: Array<{
    start: number;
    end: number;
    file: ComposerContextFile;
    token: string;
  }> = [];
  let cursor = 0;

  while (cursor < prompt.length) {
    const match = candidates.find((candidate) =>
      matchesInlineFileToken(prompt, cursor, candidate.token),
    );

    if (!match) {
      cursor += 1;
      continue;
    }

    ranges.push({
      start: cursor,
      end: cursor + match.token.length,
      file: match.file,
      token: match.token,
    });
    cursor += match.token.length;
  }

  return ranges;
}

function getInlineFilesFullyInsideRange(
  prompt: string,
  files: ComposerContextFile[],
  selectionStart: number,
  selectionEnd: number,
) {
  return dedupeComposerContextFiles(
    getInlineFileTokenRanges(prompt, files)
      .filter((range) => range.start >= selectionStart && range.end <= selectionEnd)
      .map((range) => range.file),
  );
}

function deletionTouchesInlineFileRange(
  prompt: string,
  range: { start: number; end: number },
  deletionStart: number,
  deletionEnd: number,
  key: "Backspace" | "Delete",
  collapsed: boolean,
) {
  if (deletionStart < range.end && deletionEnd > range.start) {
    return true;
  }

  if (collapsed && key === "Backspace") {
    return deletionStart === range.end && /\s/.test(prompt[deletionStart] ?? "");
  }

  return false;
}

function buildInlineFileTokenCandidates(files: ComposerContextFile[]) {
  return files
    .filter((file) => file.name.trim().length > 0)
    .flatMap((file) =>
      contextFileInlineReferenceTokens(file).map((token) => ({ file, token })),
    )
    .sort((a, b) => b.token.length - a.token.length);
}

function dedupeComposerContextFiles(files: ComposerContextFile[]) {
  const seen = new Set<string>();
  const deduped: ComposerContextFile[] = [];

  for (const file of files) {
    if (!seen.has(file.path)) {
      seen.add(file.path);
      deduped.push(file);
    }
  }

  return deduped;
}

function findNextInlineFileIndex(
  prompt: string,
  start: number,
  candidates: Array<{ file: ComposerContextFile; token: string }>,
) {
  for (let index = start; index < prompt.length; index += 1) {
    if (
      candidates.some((candidate) =>
        matchesInlineFileToken(prompt, index, candidate.token),
      )
    ) {
      return index;
    }
  }

  return -1;
}

function matchesInlineFileToken(prompt: string, index: number, token: string) {
  if (!prompt.startsWith(token, index)) {
    return false;
  }

  const before = index === 0 ? "" : prompt[index - 1];
  const after = prompt[index + token.length] ?? "";
  return !isFileNameBoundaryCharacter(before) && !isFileNameBoundaryCharacter(after);
}

function isFileNameBoundaryCharacter(value: string) {
  return /[A-Za-z0-9_.-]/.test(value);
}

function inlineFilePromptToken(file: ComposerContextFile) {
  return contextFileDisplayReference(file);
}

function normalizePromptQuotes(prompt: string) {
  if (!/[\u2018\u2019\u201c\u201d]/.test(prompt)) {
    return prompt;
  }

  return prompt
    .replace(/[\u201c\u201d]/g, "\"")
    .replace(/[\u2018\u2019]/g, "'");
}

function normalizePromptInput(prompt: string, nativeEvent: Event) {
  const inputEvent = nativeEvent as Event & {
    data?: string | null;
    inputType?: string;
  };

  if (typeof inputEvent.data === "string") {
    return /[\u2018\u2019\u201c\u201d]/.test(inputEvent.data)
      ? normalizePromptQuotes(prompt)
      : prompt;
  }

  if (inputEvent.data === null && inputEvent.inputType?.startsWith("delete")) {
    return prompt;
  }

  return normalizePromptQuotes(prompt);
}

function composerTokensEqual(
  first: ComposerToken | null,
  second: ComposerToken | null,
) {
  return (
    first === second ||
    (first !== null &&
      second !== null &&
      first.trigger === second.trigger &&
      first.start === second.start &&
      first.end === second.end &&
      first.query === second.query)
  );
}

function writePromptContextClipboard(
  event: ReactClipboardEvent<HTMLElement>,
  payload: PromptContextClipboardPayload,
) {
  event.preventDefault();
  event.clipboardData.setData("text/plain", payload.prompt);
  event.clipboardData.setData(
    ORCHESTRATOR_PROMPT_CONTEXT_MIME,
    JSON.stringify(payload),
  );
}

function readPromptContextClipboard(
  clipboardData: Pick<DataTransfer, "getData">,
): PromptContextClipboardPayload | null {
  const raw = clipboardData.getData(ORCHESTRATOR_PROMPT_CONTEXT_MIME);
  if (!raw) {
    return null;
  }

  try {
    const payload = JSON.parse(raw) as Partial<PromptContextClipboardPayload>;
    if (
      payload.version !== 1 ||
      typeof payload.prompt !== "string" ||
      !Array.isArray(payload.files)
    ) {
      return null;
    }

    const files = payload.files
      .map(readPromptContextClipboardFile)
      .filter((file): file is ComposerContextFile => file !== null);
    if (files.length === 0) {
      return null;
    }

    return {
      version: 1,
      prompt: payload.prompt,
      files: dedupeComposerContextFiles(files),
    };
  } catch {
    return null;
  }
}

function readPromptContextClipboardFile(value: unknown): ComposerContextFile | null {
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
    relativePath: typeof file.relativePath === "string" ? file.relativePath : undefined,
    source: "search",
    status: "ready",
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
