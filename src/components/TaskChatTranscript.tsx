import {
  measureElement as measureVirtualElement,
  useVirtualizer,
  type VirtualItem,
  type Virtualizer,
} from "@tanstack/react-virtual";
import {
  Activity,
  Ban,
  BrainCircuit,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock,
  FileDiff,
  FileText,
  Loader2,
  MessageSquare,
  Pencil,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Terminal,
  X,
} from "lucide-react";
import {
  memo,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import type {
  ClipboardEvent as ReactClipboardEvent,
  MouseEvent as ReactMouseEvent,
  RefObject,
  ReactNode,
} from "react";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";
import type {
  RunCommandActivity,
  RunEditedFile,
  RunViewState,
  StreamEvent,
} from "../lib/codexEventReducer";
import {
  validateRequestedFileSystemPermissions,
  type ApprovalChoice,
  type ApprovalResolutionHandler,
  type CodexApprovalRequest,
} from "../lib/codexApprovals";
import {
  isNativeUserInputRequest,
  requestKey,
  type NativeUserInputRequest,
  type UserInputQuestion,
  type UserInputResponse,
} from "../lib/nativePlanMode";
import {
  contextFileExtensionLabel,
  contextFileInlineReferenceTokens,
  contextFileLineReference,
} from "../lib/contextFiles";
import { isPreviewableSummaryLink } from "../lib/summaryLinks";
import {
  cacheTranscriptRowHeight,
  estimateHistoryPlaceholderHeight,
  estimateTranscriptRowHeight,
  getCachedTranscriptRowHeight,
  getTranscriptWidthBucket,
} from "../lib/transcriptVirtualization";
import {
  ORCHESTRATOR_PROMPT_CONTEXT_MIME,
  type CodexMessage,
  type ComposerContextFile,
  type HistoryPageLoadState,
  type HistoryPageDescriptor,
  type HistoryTranscriptIndex,
  type HistoryTurnHint,
  type PreparedHistoricalSummary,
  type ResolvedRunExecutionSettings,
} from "../types";

const AUTO_SCROLL_BOTTOM_THRESHOLD_PX = 48;
const HISTORY_SCROLL_SETTLE_DELAY_MS = 120;
const TRANSCRIPT_SCROLL_IDLE_DELAY_MS = 120;
const TRANSCRIPT_OVERSCAN_ROWS = 6;
const EMPTY_CONTEXT_FILES: ComposerContextFile[] = [];
const PLAN_PREVIEW_BLOCK_LIMIT = 5;
const PLAN_PREVIEW_CHARACTER_LIMIT = 1_600;
const PLAN_PREVIEW_LINE_LIMIT = 14;
const PLAN_MARKDOWN_PLUGINS = [remarkGfm];

type PositionedMarkdownNode = {
  type: string;
  value?: string;
  children?: PositionedMarkdownNode[];
  position?: {
    start: { offset?: number };
    end: { offset?: number };
  };
};

export type NativePlanPreview = {
  isLong: boolean;
  previewText: string;
};

export type NativePlanDisclosureChange = {
  anchorElement: HTMLElement;
  anchorTop: number;
  expanded: boolean;
  planKey: string;
};

export type NativePlanDisclosureChangeHandler = (
  change: NativePlanDisclosureChange,
) => void;

export type PendingInteractionPageChange = {
  anchorElement: HTMLElement;
  anchorTop: number;
};

export type PendingInteractionPageChangeHandler = (
  change: PendingInteractionPageChange,
) => void;

const planMarkdownParser = unified().use(remarkParse).use(remarkGfm);

function markdownNodeEndOffset(node: PositionedMarkdownNode) {
  return node.position?.end.offset ?? 0;
}

function markdownNodeSource(text: string, node: PositionedMarkdownNode) {
  const start = node.position?.start.offset;
  const end = node.position?.end.offset;
  if (start === undefined || end === undefined) return "";
  return text.slice(start, end);
}

export function buildNativePlanPreview(text: string): NativePlanPreview {
  const lineCount = text.split(/\r?\n/).length;
  try {
    const tree = planMarkdownParser.parse(text) as unknown as {
      children: PositionedMarkdownNode[];
    };
    const definitions = tree.children.filter(
      (node) => node.type === "definition",
    );
    const content = tree.children.filter(
      (node) => node.type !== "definition",
    );
    const isLong =
      content.length > PLAN_PREVIEW_BLOCK_LIMIT ||
      text.length > PLAN_PREVIEW_CHARACTER_LIMIT ||
      lineCount > PLAN_PREVIEW_LINE_LIMIT;
    if (!isLong) {
      return { isLong: false, previewText: text };
    }

    const selected = content.slice(0, PLAN_PREVIEW_BLOCK_LIMIT);
    const boundary = selected.reduce(
      (furthest, node) => Math.max(furthest, markdownNodeEndOffset(node)),
      0,
    );
    const definitionText = definitions
      .filter((node) => (node.position?.start.offset ?? 0) >= boundary)
      .map((node) => markdownNodeSource(text, node))
      .filter(Boolean)
      .join("\n\n");
    const preview = text.slice(0, boundary || text.length).trimEnd();
    return {
      isLong: true,
      previewText: definitionText
        ? `${preview}\n\n${definitionText}`
        : preview,
    };
  } catch {
    return {
      isLong: text.length > PLAN_PREVIEW_CHARACTER_LIMIT || lineCount > PLAN_PREVIEW_LINE_LIMIT,
      previewText: text,
    };
  }
}

export function nativePlanDisclosureKey(entry: TaskChatEntry) {
  const plan = entry.runView.nativePlan;
  const text = plan.completedText || plan.previewText;
  return [
    entry.clientId,
    plan.planItemId ?? "plan",
    plan.completedTurnId ?? "draft",
    planContentRevision(text),
  ].join(":");
}

export function editedFilesDisclosureKey(entry: TaskChatEntry) {
  const revision = entry.runView.editedFiles
    .map(
      (file) =>
        `${file.path}:${file.status}:${file.additions}:${file.deletions}`,
    )
    .join("|");
  return `${entry.clientId}:edited-files:${planContentRevision(revision)}`;
}

function planContentRevision(text: string) {
  let hash = 2_166_136_261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return `${text.length}-${(hash >>> 0).toString(36)}`;
}

function scheduleAnimationFrame(callback: FrameRequestCallback) {
  if (typeof requestAnimationFrame === "function") {
    return requestAnimationFrame(callback);
  }

  return window.setTimeout(() => callback(Date.now()), 0);
}

function cancelScheduledAnimationFrame(handle: number) {
  if (typeof cancelAnimationFrame === "function") {
    cancelAnimationFrame(handle);
    return;
  }

  window.clearTimeout(handle);
}

export type TaskChatEntry = {
  clientId: string;
  workspaceId: number;
  chatId: number | null;
  turnIndex: number | null;
  historySlotIndex?: number;
  runId: number | null;
  taskId: number | null;
  prompt: string;
  contextFiles?: ComposerContextFile[];
  executionSettings?: ResolvedRunExecutionSettings;
  submittedAt: string;
  status: RunViewState["status"];
  runView: RunViewState;
  preparedSummary?: PreparedHistoricalSummary;
  historicalActivity?: {
    profileKey: "default";
    threadId: string;
    turnId: string;
    status: "available" | "loading" | "loaded" | "error";
    nextCursor: string | null;
    error: string | null;
  };
};

export type HistoryVisibleRange = {
  startIndex: number;
  endIndex: number;
};

export type HistoryScrollDirection = "backward" | "forward";

export type TranscriptHistoryOpenRequest = {
  requestId: number;
  phase: "loading" | "hydrating" | "complete";
};

type TranscriptScrollMode =
  | "opening-history"
  | "following-live"
  | "manual";

type TranscriptScrollControllerOptions = {
  transcriptRef: RefObject<HTMLElement | null>;
  rowVirtualizer: Virtualizer<HTMLElement, HTMLDivElement>;
  entryCount: number;
  historyOpenRequest: TranscriptHistoryOpenRequest | null;
  onHistoryPositionSettled?: (requestId: number) => void;
  onScrollActivityChange?: (active: boolean) => void;
  onScrollIdle?: (transcript: HTMLElement) => void;
};

function shouldAdjustTranscriptScrollPosition(
  item: VirtualItem,
  _delta: number,
  instance: Virtualizer<HTMLElement, HTMLDivElement>,
) {
  return item.end <= (instance.scrollOffset ?? 0);
}

function scrollTranscriptElement(
  offset: number,
  {
    adjustments = 0,
    behavior = "auto",
  }: { adjustments?: number; behavior?: "auto" | "smooth" | "instant" },
  instance: Virtualizer<HTMLElement, HTMLDivElement>,
) {
  const transcript = instance.scrollElement;
  if (!transcript) {
    return;
  }

  const top = offset + adjustments;
  if (typeof transcript.scrollTo === "function") {
    transcript.scrollTo({
      top,
      behavior: behavior === "smooth" ? "smooth" : "auto",
    });
    return;
  }

  // Older WebKit and the test DOM do not expose Element.scrollTo.
  transcript.scrollTop = top;
}

function useTranscriptScrollController({
  transcriptRef,
  rowVirtualizer,
  entryCount,
  historyOpenRequest,
  onHistoryPositionSettled,
  onScrollActivityChange,
  onScrollIdle,
}: TranscriptScrollControllerOptions) {
  const modeRef = useRef<TranscriptScrollMode>("following-live");
  const entryCountRef = useRef(entryCount);
  const historyRequestRef = useRef(historyOpenRequest);
  const historyRequestIdRef = useRef<number | null>(null);
  const callbacksRef = useRef({
    onHistoryPositionSettled,
    onScrollActivityChange,
    onScrollIdle,
  });
  const followFrameRef = useRef<number | null>(null);
  const settlementFrameRef = useRef<number | null>(null);
  const settlementTimeoutRef = useRef<number | null>(null);
  const scrollIdleTimeoutRef = useRef<number | null>(null);
  const scrollActivityRef = useRef(false);

  entryCountRef.current = entryCount;
  historyRequestRef.current = historyOpenRequest;
  callbacksRef.current = {
    onHistoryPositionSettled,
    onScrollActivityChange,
    onScrollIdle,
  };

  const clearQueuedEnd = useCallback(() => {
    if (followFrameRef.current !== null) {
      cancelScheduledAnimationFrame(followFrameRef.current);
      followFrameRef.current = null;
    }
  }, []);

  const clearSettlement = useCallback(() => {
    if (settlementTimeoutRef.current !== null) {
      window.clearTimeout(settlementTimeoutRef.current);
      settlementTimeoutRef.current = null;
    }
    if (settlementFrameRef.current !== null) {
      cancelScheduledAnimationFrame(settlementFrameRef.current);
      settlementFrameRef.current = null;
    }
  }, []);

  const setScrollActivity = useCallback((active: boolean) => {
    if (scrollActivityRef.current === active) {
      return;
    }
    scrollActivityRef.current = active;
    callbacksRef.current.onScrollActivityChange?.(active);
  }, []);

  const scrollToTranscriptEnd = useCallback(() => {
    if (entryCountRef.current === 0) {
      return;
    }
    rowVirtualizer.scrollToEnd({ behavior: "auto" });
  }, [rowVirtualizer]);

  const queueScrollToTranscriptEnd = useCallback(() => {
    if (followFrameRef.current !== null || modeRef.current === "manual") {
      return;
    }
    followFrameRef.current = scheduleAnimationFrame(() => {
      followFrameRef.current = null;
      if (modeRef.current !== "manual") {
        scrollToTranscriptEnd();
      }
    });
  }, [scrollToTranscriptEnd]);

  const scheduleHistorySettlement = useCallback(() => {
    clearSettlement();
    const request = historyRequestRef.current;
    if (!request || request.phase !== "complete") {
      return;
    }

    settlementTimeoutRef.current = window.setTimeout(() => {
      settlementTimeoutRef.current = null;
      const currentRequest = historyRequestRef.current;
      if (
        !currentRequest ||
        currentRequest.requestId !== request.requestId ||
        currentRequest.phase !== "complete"
      ) {
        return;
      }

      if (modeRef.current === "opening-history") {
        scrollToTranscriptEnd();
      }
      settlementFrameRef.current = scheduleAnimationFrame(() => {
        settlementFrameRef.current = null;
        const settledRequest = historyRequestRef.current;
        if (
          !settledRequest ||
          settledRequest.requestId !== request.requestId ||
          settledRequest.phase !== "complete"
        ) {
          return;
        }
        if (modeRef.current === "opening-history") {
          modeRef.current = "following-live";
        }
        callbacksRef.current.onHistoryPositionSettled?.(request.requestId);
      });
    }, HISTORY_SCROLL_SETTLE_DELAY_MS);
  }, [clearSettlement, scrollToTranscriptEnd]);

  const finishScrollActivity = useCallback(() => {
    scrollIdleTimeoutRef.current = null;
    setScrollActivity(false);
    const transcript = transcriptRef.current;
    if (!transcript) {
      return;
    }
    if (
      !historyRequestRef.current &&
      isScrolledNearBottom(transcript)
    ) {
      modeRef.current = "following-live";
    }
    callbacksRef.current.onScrollIdle?.(transcript);
  }, [setScrollActivity, transcriptRef]);

  const markScrollActivity = useCallback(() => {
    setScrollActivity(true);
    if (scrollIdleTimeoutRef.current !== null) {
      window.clearTimeout(scrollIdleTimeoutRef.current);
    }
    scrollIdleTimeoutRef.current = window.setTimeout(
      finishScrollActivity,
      TRANSCRIPT_SCROLL_IDLE_DELAY_MS,
    );
  }, [finishScrollActivity, setScrollActivity]);

  const registerUserScrollIntent = useCallback(() => {
    modeRef.current = "manual";
    clearQueuedEnd();
    markScrollActivity();
    scheduleHistorySettlement();
  }, [clearQueuedEnd, markScrollActivity, scheduleHistorySettlement]);

  const handleScroll = useCallback(
    (transcript: HTMLElement) => {
      if (scrollActivityRef.current) {
        markScrollActivity();
        return;
      }
      if (
        !historyRequestRef.current &&
        modeRef.current !== "manual" &&
        isScrolledNearBottom(transcript)
      ) {
        modeRef.current = "following-live";
      }
    },
    [markScrollActivity],
  );

  const handleGeometryChange = useCallback(() => {
    if (
      modeRef.current === "opening-history" ||
      modeRef.current === "following-live"
    ) {
      queueScrollToTranscriptEnd();
    }
    scheduleHistorySettlement();
  }, [queueScrollToTranscriptEnd, scheduleHistorySettlement]);

  const handleEntriesChanged = useCallback(
    ({ initialLoad, appended }: { initialLoad: boolean; appended: boolean }) => {
      if (
        !historyRequestRef.current &&
        modeRef.current !== "manual" &&
        (initialLoad || appended)
      ) {
        modeRef.current = "following-live";
      }
      handleGeometryChange();
    },
    [handleGeometryChange],
  );

  useLayoutEffect(() => {
    const request = historyOpenRequest;
    if (!request) {
      if (historyRequestIdRef.current !== null) {
        historyRequestIdRef.current = null;
        clearSettlement();
        if (modeRef.current === "opening-history") {
          modeRef.current = "following-live";
        }
      }
      return;
    }

    if (historyRequestIdRef.current !== request.requestId) {
      historyRequestIdRef.current = request.requestId;
      modeRef.current = "opening-history";
      clearQueuedEnd();
      clearSettlement();
      queueScrollToTranscriptEnd();
    } else if (modeRef.current === "opening-history") {
      queueScrollToTranscriptEnd();
    }
    scheduleHistorySettlement();
  }, [
    clearQueuedEnd,
    clearSettlement,
    historyOpenRequest,
    queueScrollToTranscriptEnd,
    scheduleHistorySettlement,
  ]);

  useEffect(
    () => () => {
      clearQueuedEnd();
      clearSettlement();
      if (scrollIdleTimeoutRef.current !== null) {
        window.clearTimeout(scrollIdleTimeoutRef.current);
      }
      setScrollActivity(false);
    },
    [clearQueuedEnd, clearSettlement, setScrollActivity],
  );

  return useMemo(
    () => ({
      handleEntriesChanged,
      handleGeometryChange,
      handleScroll,
      registerUserScrollIntent,
      isUserScrolling: () => scrollActivityRef.current,
    }),
    [
      handleEntriesChanged,
      handleGeometryChange,
      handleScroll,
      registerUserScrollIntent,
    ],
  );
}

type Props = {
  entries: TaskChatEntry[];
  onResolveRequest: ApprovalResolutionHandler;
  onAnswerUserInput?: (
    entry: TaskChatEntry,
    request: NativeUserInputRequest,
    response: UserInputResponse,
  ) => void;
  onImplementPlan?: (entry: TaskChatEntry) => void;
  onRevisePlan?: (
    entry: TaskChatEntry,
    revision: string,
  ) => boolean | void;
  onCancelPlan?: (entry: TaskChatEntry) => void;
  onOpenFileLink?: (href: string) => boolean;
  onReviewEditedFile?: (
    entry: TaskChatEntry,
    file: RunEditedFile,
  ) => Promise<void> | void;
  onUndoEditedFiles?: (entry: TaskChatEntry) => Promise<void> | void;
  fileUndoDisabled?: boolean;
  editablePromptEntryId?: string | null;
  onEditPrompt?: (entry: TaskChatEntry, prompt: string) => void;
  historyOpenRequest?: TranscriptHistoryOpenRequest | null;
  onHistoryPositionSettled?: (requestId: number) => void;
  historyIndex?: HistoryTranscriptIndex | null;
  historyPageStates?: Record<string, HistoryPageLoadState>;
  onVisibleHistoryRangeChange?: (
    range: HistoryVisibleRange,
    direction: HistoryScrollDirection,
  ) => void;
  onRetryHistoryPage?: (pageId: string) => void;
  onLoadHistoricalActivity?: (entry: TaskChatEntry) => void;
  onScrollActivityChange?: (active: boolean) => void;
};

export function TaskChatTranscript({
  entries,
  onResolveRequest,
  onAnswerUserInput,
  onImplementPlan,
  onRevisePlan,
  onCancelPlan,
  onOpenFileLink,
  onReviewEditedFile,
  onUndoEditedFiles,
  fileUndoDisabled = false,
  editablePromptEntryId = null,
  onEditPrompt,
  historyOpenRequest = null,
  onHistoryPositionSettled,
  historyIndex = null,
  historyPageStates,
  onVisibleHistoryRangeChange,
  onRetryHistoryPage,
  onLoadHistoricalActivity,
  onScrollActivityChange,
}: Props) {
  const callbacksRef = useRef({
    onResolveRequest,
    onAnswerUserInput,
    onImplementPlan,
    onRevisePlan,
    onCancelPlan,
    onOpenFileLink,
    onReviewEditedFile,
    onUndoEditedFiles,
    onEditPrompt,
    onHistoryPositionSettled,
    onVisibleHistoryRangeChange,
    onRetryHistoryPage,
    onLoadHistoricalActivity,
    onScrollActivityChange,
  });
  callbacksRef.current = {
    onResolveRequest,
    onAnswerUserInput,
    onImplementPlan,
    onRevisePlan,
    onCancelPlan,
    onOpenFileLink,
    onReviewEditedFile,
    onUndoEditedFiles,
    onEditPrompt,
    onHistoryPositionSettled,
    onVisibleHistoryRangeChange,
    onRetryHistoryPage,
    onLoadHistoricalActivity,
    onScrollActivityChange,
  };

  const stableResolveRequest = useCallback(
    (request: CodexApprovalRequest, choice: CodexApprovalRequest["choices"][number]) =>
      callbacksRef.current.onResolveRequest(request, choice),
    [],
  );
  const stableOpenFileLink = useCallback(
    (href: string) => callbacksRef.current.onOpenFileLink?.(href) ?? false,
    [],
  );
  const stableReviewEditedFile = useCallback(
    (entry: TaskChatEntry, file: RunEditedFile) =>
      callbacksRef.current.onReviewEditedFile?.(entry, file),
    [],
  );
  const stableUndoEditedFiles = useCallback(
    (entry: TaskChatEntry) =>
      callbacksRef.current.onUndoEditedFiles?.(entry),
    [],
  );
  const stableEditPrompt = useCallback(
    (entry: TaskChatEntry, prompt: string) =>
      callbacksRef.current.onEditPrompt?.(entry, prompt),
    [],
  );
  const stableHistoryPositionSettled = useCallback(
    (requestId: number) =>
      callbacksRef.current.onHistoryPositionSettled?.(requestId),
    [],
  );
  const stableVisibleHistoryRangeChange = useCallback(
    (range: HistoryVisibleRange, direction: HistoryScrollDirection) =>
      callbacksRef.current.onVisibleHistoryRangeChange?.(range, direction),
    [],
  );
  const stableRetryHistoryPage = useCallback(
    (pageId: string) => callbacksRef.current.onRetryHistoryPage?.(pageId),
    [],
  );
  const stableLoadHistoricalActivity = useCallback(
    (entry: TaskChatEntry) =>
      callbacksRef.current.onLoadHistoricalActivity?.(entry),
    [],
  );
  const stableScrollActivityChange = useCallback(
    (active: boolean) =>
      callbacksRef.current.onScrollActivityChange?.(active),
    [],
  );

  return (
    <VirtualizedTaskChatTranscript
      entries={entries}
      onResolveRequest={stableResolveRequest}
      onAnswerUserInput={onAnswerUserInput}
      onImplementPlan={onImplementPlan}
      onRevisePlan={onRevisePlan}
      onCancelPlan={onCancelPlan}
      onOpenFileLink={onOpenFileLink ? stableOpenFileLink : undefined}
      onReviewEditedFile={
        onReviewEditedFile ? stableReviewEditedFile : undefined
      }
      onUndoEditedFiles={
        onUndoEditedFiles ? stableUndoEditedFiles : undefined
      }
      fileUndoDisabled={fileUndoDisabled}
      editablePromptEntryId={editablePromptEntryId}
      onEditPrompt={onEditPrompt ? stableEditPrompt : undefined}
      historyOpenRequest={historyOpenRequest}
      onHistoryPositionSettled={
        onHistoryPositionSettled ? stableHistoryPositionSettled : undefined
      }
      historyIndex={historyIndex}
      historyPageStates={historyPageStates}
      onVisibleHistoryRangeChange={
        onVisibleHistoryRangeChange
          ? stableVisibleHistoryRangeChange
          : undefined
      }
      onRetryHistoryPage={
        onRetryHistoryPage ? stableRetryHistoryPage : undefined
      }
      onLoadHistoricalActivity={
        onLoadHistoricalActivity ? stableLoadHistoricalActivity : undefined
      }
      onScrollActivityChange={
        onScrollActivityChange ? stableScrollActivityChange : undefined
      }
    />
  );
}

const VirtualizedTaskChatTranscript = /* @__PURE__ */ memo(function VirtualizedTaskChatTranscript({
  entries,
  onResolveRequest,
  onAnswerUserInput,
  onImplementPlan,
  onRevisePlan,
  onCancelPlan,
  onOpenFileLink,
  onReviewEditedFile,
  onUndoEditedFiles,
  fileUndoDisabled = false,
  editablePromptEntryId = null,
  onEditPrompt,
  historyOpenRequest = null,
  onHistoryPositionSettled,
  historyIndex = null,
  historyPageStates = {},
  onVisibleHistoryRangeChange,
  onRetryHistoryPage,
  onLoadHistoricalActivity,
  onScrollActivityChange,
}: Props) {
  const transcriptRef = useRef<HTMLElement | null>(null);
  const stableTranscriptWidthRef = useRef(1_024);
  const pendingTranscriptWidthRef = useRef(1_024);
  const transcriptWidthChangingRef = useRef(false);
  const transcriptWidthSettleTimeoutRef = useRef<number | null>(null);
  const pendingRowMeasurementsRef = useRef(
    new Map<string, { height: number; width: number }>(),
  );
  const geometryChangeHandlerRef = useRef<() => void>(() => undefined);
  const visibleRangeFrameRef = useRef<number | null>(null);
  const previousScrollTopRef = useRef(0);
  const pendingScrollDirectionRef = useRef<HistoryScrollDirection | null>(null);
  const previousEntriesRef = useRef({
    count: 0,
    lastId: null as string | null,
    totalSize: 0,
    entries: entries as TaskChatEntry[],
  });
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [editingPrompt, setEditingPrompt] = useState("");

  const loadedEntriesBySlot = useMemo(() => {
    const loaded = new Map<number, TaskChatEntry>();
    entries.forEach((entry, index) => {
      const slotIndex = historyIndex ? entry.historySlotIndex : index;
      if (slotIndex !== undefined && slotIndex >= 0) {
        loaded.set(slotIndex, entry);
      }
    });
    return loaded;
  }, [entries, historyIndex]);
  const entrySlotsById = useMemo(
    () =>
      new Map(
        [...loadedEntriesBySlot.entries()].map(([slotIndex, entry]) => [
          entry.clientId,
          slotIndex,
        ]),
      ),
    [loadedEntriesBySlot],
  );
  const historyHintsBySlot = useMemo(
    () =>
      new Map(
        (historyIndex?.hints ?? []).map((hint) => [hint.slotIndex, hint]),
      ),
    [historyIndex],
  );
  const historyPagesBySlot = useMemo(() => {
    const pages = new Map<number, HistoryPageDescriptor>();
    for (const page of historyIndex?.pages ?? []) {
      for (
        let slotIndex = page.startIndex;
        slotIndex < page.startIndex + page.turnCount;
        slotIndex += 1
      ) {
        pages.set(slotIndex, page);
      }
    }
    return pages;
  }, [historyIndex]);
  const virtualCount = historyIndex?.totalTurns ?? entries.length;
  const entryAt = useCallback(
    (index: number) => loadedEntriesBySlot.get(index),
    [loadedEntriesBySlot],
  );
  const hintAt = useCallback(
    (index: number) => historyHintsBySlot.get(index),
    [historyHintsBySlot],
  );

  const measureTranscriptRow = useCallback(
    (
      element: HTMLDivElement,
      resizeEntry: ResizeObserverEntry | undefined,
      instance: Virtualizer<HTMLElement, HTMLDivElement>,
    ) => {
      const measuredHeight = measureVirtualElement(
        element,
        resizeEntry,
        instance,
      );
      const index = instance.indexFromElement(element);
      const chatEntry = entryAt(index);
      if (!chatEntry) {
        return Math.max(
          measuredHeight,
          estimateHistoryPlaceholderHeight(
            hintAt(index),
            stableTranscriptWidthRef.current,
          ),
        );
      }

      if (transcriptWidthChangingRef.current) {
        pendingRowMeasurementsRef.current.set(chatEntry.clientId, {
          height: measuredHeight,
          width: pendingTranscriptWidthRef.current,
        });
        return (
          instance.itemSizeCache.get(chatEntry.clientId) ??
          getCachedTranscriptRowHeight(
            chatEntry,
            stableTranscriptWidthRef.current,
          ) ??
          estimateTranscriptRowHeight(
            chatEntry,
            stableTranscriptWidthRef.current,
          )
        );
      }

      cacheTranscriptRowHeight(
        chatEntry,
        stableTranscriptWidthRef.current,
        measuredHeight,
      );
      geometryChangeHandlerRef.current();
      return measuredHeight;
    },
    [entryAt, hintAt],
  );

  const rowVirtualizer = useVirtualizer({
    count: virtualCount,
    getScrollElement: () => transcriptRef.current,
    scrollToFn: scrollTranscriptElement,
    estimateSize: (index) => {
      const entry = entryAt(index);
      return entry
        ? estimateTranscriptRowHeight(
            entry,
            stableTranscriptWidthRef.current,
          )
        : estimateHistoryPlaceholderHeight(
            hintAt(index),
            stableTranscriptWidthRef.current,
          );
    },
    measureElement: measureTranscriptRow,
    overscan: TRANSCRIPT_OVERSCAN_ROWS,
    anchorTo: "end",
    followOnAppend: false,
    scrollEndThreshold: AUTO_SCROLL_BOTTOM_THRESHOLD_PX,
    useAnimationFrameWithResizeObserver: true,
    directDomUpdates: true,
    directDomUpdatesMode: "transform",
    getItemKey: useCallback(
      (index: number) =>
        entryAt(index)?.clientId ??
        `history-placeholder:${historyIndex?.chatId ?? "live"}:${index}`,
      [entryAt, historyIndex?.chatId],
    ),
    initialRect: {
      width: 1024,
      height: 720,
    },
  });
  rowVirtualizer.shouldAdjustScrollPositionOnItemSizeChange =
    shouldAdjustTranscriptScrollPosition;

  const virtualItems = rowVirtualizer.getVirtualItems();
  const usingFallbackRows = virtualItems.length === 0;
  const renderedRows =
    !usingFallbackRows
      ? virtualItems
      : buildFallbackTranscriptRows(
          virtualCount,
          entryAt,
          hintAt,
        );
  const totalSize = rowVirtualizer.getTotalSize();

  const scrollController = useTranscriptScrollController({
    transcriptRef,
    rowVirtualizer,
    entryCount: virtualCount,
    historyOpenRequest,
    onHistoryPositionSettled,
    onScrollActivityChange,
  });
  geometryChangeHandlerRef.current = scrollController.handleGeometryChange;

  const reportVisibleHistoryRange = useCallback(
    (direction: HistoryScrollDirection) => {
      if (!historyIndex || !onVisibleHistoryRangeChange) {
        return;
      }
      if (visibleRangeFrameRef.current !== null) {
        cancelScheduledAnimationFrame(visibleRangeFrameRef.current);
      }
      visibleRangeFrameRef.current = scheduleAnimationFrame(() => {
        visibleRangeFrameRef.current = null;
        const virtualIndexes = rowVirtualizer.getVirtualIndexes();
        const fallbackCount = Math.min(
          virtualCount,
          TRANSCRIPT_OVERSCAN_ROWS * 2 + 1,
        );
        const transcript = transcriptRef.current;
        const maxFallbackStart = Math.max(0, virtualCount - fallbackCount);
        const scrollRange = transcript
          ? Math.max(0, transcript.scrollHeight - transcript.clientHeight)
          : 0;
        const fallbackStart = Math.round(
          maxFallbackStart *
            (scrollRange > 0 && transcript ? transcript.scrollTop / scrollRange : 1),
        );
        const indexes =
          virtualIndexes.length > 0
            ? virtualIndexes
            : Array.from(
                { length: fallbackCount },
                (_, offset) => fallbackStart + offset,
              );
        if (indexes.length === 0) return;
        onVisibleHistoryRangeChange(
          {
            startIndex: indexes[0],
            endIndex: indexes[indexes.length - 1],
          },
          direction,
        );
      });
    },
    [historyIndex, onVisibleHistoryRangeChange, rowVirtualizer, virtualCount],
  );

  useLayoutEffect(() => {
    const previous = previousEntriesRef.current;
    const lastId = entryAt(virtualCount - 1)?.clientId ?? null;
    const entryCountIncreased = virtualCount > previous.count;
    const appended = entryCountIncreased && lastId !== previous.lastId;
    const initialLoad = previous.count === 0 && virtualCount > 0;
    const entriesChanged = previous.entries !== entries;
    const totalSizeChanged = previous.totalSize !== totalSize;
    previousEntriesRef.current = {
      count: virtualCount,
      lastId,
      totalSize,
      entries,
    };

    if (initialLoad || appended || entriesChanged || totalSizeChanged) {
      scrollController.handleEntriesChanged({ initialLoad, appended });
    }
  }, [
    entries,
    entryAt,
    scrollController,
    totalSize,
    virtualCount,
  ]);

  useEffect(() => {
    const transcript = transcriptRef.current;
    if (!transcript || typeof ResizeObserver === "undefined") {
      return;
    }

    let previousWidth = stableTranscriptWidthRef.current;
    let previousHeight = transcript.clientHeight;
    const observer = new ResizeObserver(() => {
      const width = transcript.clientWidth;
      const height = transcript.clientHeight;
      const widthChanged = width > 0 && width !== previousWidth;
      const heightChanged = height !== previousHeight;
      if (!widthChanged && !heightChanged) {
        return;
      }
      previousHeight = height;

      if (widthChanged) {
        previousWidth = width;
        pendingTranscriptWidthRef.current = getTranscriptWidthBucket(width);
        transcriptWidthChangingRef.current = true;
        if (transcriptWidthSettleTimeoutRef.current !== null) {
          window.clearTimeout(transcriptWidthSettleTimeoutRef.current);
        }
        transcriptWidthSettleTimeoutRef.current = window.setTimeout(() => {
          transcriptWidthSettleTimeoutRef.current = null;
          stableTranscriptWidthRef.current = pendingTranscriptWidthRef.current;
          transcriptWidthChangingRef.current = false;
          rowVirtualizer.measure();
          for (const [clientId, measurement] of pendingRowMeasurementsRef.current) {
            const index = entrySlotsById.get(clientId);
            const entry = index === undefined ? undefined : entryAt(index);
            if (!entry || index === undefined) {
              continue;
            }
            cacheTranscriptRowHeight(entry, measurement.width, measurement.height);
            rowVirtualizer.resizeItem(index, measurement.height);
          }
          pendingRowMeasurementsRef.current.clear();
          scrollController.handleGeometryChange();
        }, HISTORY_SCROLL_SETTLE_DELAY_MS);
      }
      if (heightChanged) {
        scrollController.handleGeometryChange();
      }
    });
    observer.observe(transcript);
    return () => observer.disconnect();
  }, [entryAt, entrySlotsById, rowVirtualizer, scrollController]);

  useEffect(
    () => () => {
      if (transcriptWidthSettleTimeoutRef.current !== null) {
        window.clearTimeout(transcriptWidthSettleTimeoutRef.current);
      }
      if (visibleRangeFrameRef.current !== null) {
        cancelScheduledAnimationFrame(visibleRangeFrameRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    if (
      editingEntryId !== null &&
      !entries.some((entry) => entry.clientId === editingEntryId)
    ) {
      setEditingEntryId(null);
      setEditingPrompt("");
    }
  }, [editingEntryId, entries]);

  const handleSubmitEdit = useCallback(
    (entry: TaskChatEntry, nextPrompt: string) => {
      if (!nextPrompt || !onEditPrompt) {
        return;
      }
      setEditingEntryId(null);
      setEditingPrompt("");
      onEditPrompt(entry, nextPrompt);
    },
    [onEditPrompt],
  );

  const handleCancelEdit = useCallback(() => {
    setEditingEntryId(null);
    setEditingPrompt("");
  }, []);

  const handleStartEdit = useCallback((entry: TaskChatEntry) => {
    setEditingEntryId(entry.clientId);
    setEditingPrompt(entry.prompt);
  }, []);

  return (
    <section
      className="task-chat-transcript"
      aria-label="Task chat transcript"
      ref={transcriptRef}
      tabIndex={0}
      onKeyDownCapture={(event) => {
        if (
          event.target === event.currentTarget &&
          isTranscriptScrollKey(event.key)
        ) {
          pendingScrollDirectionRef.current = isBackwardTranscriptScrollKey(
            event.key,
          )
            ? "backward"
            : "forward";
          scrollController.registerUserScrollIntent();
        }
      }}
      onPointerDownCapture={(event) => {
        const bounds = event.currentTarget.getBoundingClientRect();
        if (event.clientX >= bounds.right - 20) {
          scrollController.registerUserScrollIntent();
        }
      }}
      onScroll={(event) => {
        const transcript = event.currentTarget;
        const direction: HistoryScrollDirection =
          pendingScrollDirectionRef.current ??
          (transcript.scrollTop < previousScrollTopRef.current
            ? "backward"
            : "forward");
        pendingScrollDirectionRef.current = null;
        previousScrollTopRef.current = transcript.scrollTop;
        scrollController.handleScroll(transcript);
        reportVisibleHistoryRange(direction);
      }}
      onTouchStartCapture={scrollController.registerUserScrollIntent}
      onTouchMoveCapture={scrollController.registerUserScrollIntent}
      onWheelCapture={(event) => {
        pendingScrollDirectionRef.current =
          event.deltaY < 0 ? "backward" : "forward";
        scrollController.registerUserScrollIntent();
      }}
    >
      <div
        className="task-chat-virtual-spacer"
        ref={rowVirtualizer.containerRef}
      >
        {renderedRows.map((virtualItem) => {
          const entry = entryAt(virtualItem.index);
          if (!entry) {
            const hint = hintAt(virtualItem.index);
            const page = historyPagesBySlot.get(virtualItem.index);
            const pageState = page
              ? historyPageStates[page.id] ?? "idle"
              : "idle";

            return (
              <div
                className="task-chat-virtual-row"
                data-index={virtualItem.index}
                key={virtualItem.key}
                ref={rowVirtualizer.measureElement}
                style={
                  usingFallbackRows
                    ? { transform: `translateY(${virtualItem.start}px)` }
                    : undefined
                }
              >
                <HistoryTurnSkeleton
                  estimatedHeight={estimateHistoryPlaceholderHeight(
                    hint,
                    stableTranscriptWidthRef.current,
                  )}
                  page={page}
                  pageState={pageState}
                  onRetryHistoryPage={onRetryHistoryPage}
                />
              </div>
            );
          }

          const editable =
            Boolean(onEditPrompt) &&
            entry.clientId === editablePromptEntryId &&
            !isRunActiveStatus(entry.status);
          const editing = editingEntryId === entry.clientId;

          return (
            <div
              className="task-chat-virtual-row"
              data-index={virtualItem.index}
              key={virtualItem.key}
              ref={rowVirtualizer.measureElement}
              style={
                usingFallbackRows
                  ? { transform: `translateY(${virtualItem.start}px)` }
                  : undefined
              }
            >
              <TaskChatTurn
                editable={editable}
                editing={editing}
                editingPrompt={editingPrompt}
                entry={entry}
                onCancelEdit={handleCancelEdit}
                onEditingPromptChange={setEditingPrompt}
                onOpenFileLink={onOpenFileLink}
                onResolveRequest={onResolveRequest}
                onAnswerUserInput={onAnswerUserInput}
                onImplementPlan={onImplementPlan}
                onRevisePlan={onRevisePlan}
                onCancelPlan={onCancelPlan}
                onReviewEditedFile={onReviewEditedFile}
                onUndoEditedFiles={onUndoEditedFiles}
                fileUndoDisabled={fileUndoDisabled}
                onStartEdit={handleStartEdit}
                onSubmitEdit={handleSubmitEdit}
                onLoadHistoricalActivity={onLoadHistoricalActivity}
              />
            </div>
          );
        })}
      </div>
    </section>
  );
});

function buildFallbackTranscriptRows(
  count: number,
  entryAt: (index: number) => TaskChatEntry | undefined,
  hintAt: (index: number) => HistoryTurnHint | undefined,
) {
  const visibleCount = Math.min(count, TRANSCRIPT_OVERSCAN_ROWS * 2 + 1);
  const startIndex = Math.max(0, count - visibleCount);
  const width = 1_024;
  let start = 0;
  for (let index = 0; index < startIndex; index += 1) {
    const entry = entryAt(index);
    start += entry
      ? estimateTranscriptRowHeight(entry, width)
      : estimateHistoryPlaceholderHeight(hintAt(index), width);
  }

  return Array.from({ length: visibleCount }, (_, offset) => {
    const index = startIndex + offset;
    const row = {
      key: `transcript-fallback-${index}`,
      index,
      start,
    };
    const entry = entryAt(index);
    start += entry
      ? estimateTranscriptRowHeight(entry, width)
      : estimateHistoryPlaceholderHeight(hintAt(index), width);
    return row;
  });
}

const HistoryTurnSkeleton = /* @__PURE__ */ memo(function HistoryTurnSkeleton({
  estimatedHeight,
  page,
  pageState,
  onRetryHistoryPage,
}: {
  estimatedHeight: number;
  page: HistoryPageDescriptor | undefined;
  pageState: HistoryPageLoadState;
  onRetryHistoryPage?: (pageId: string) => void;
}) {
  const canRetry = pageState === "error" && page && onRetryHistoryPage;

  return (
    <div
      className={`history-turn-skeleton state-${pageState}`}
      style={{ minHeight: `${estimatedHeight}px` }}
      aria-hidden={canRetry ? undefined : "true"}
    >
      <div className="history-turn-skeleton-prompt">
        <span />
        <span />
      </div>
      <div className="history-turn-skeleton-response">
        <span />
        <span />
        <span />
      </div>
      {canRetry ? (
        <button
          className="history-turn-skeleton-retry"
          type="button"
          aria-label="Retry loading this part of the chat"
          title="Retry loading"
          onClick={() => onRetryHistoryPage(page.id)}
        >
          <RefreshCw size={15} aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
});

function isTranscriptScrollKey(key: string) {
  return (
    key === "ArrowUp" ||
    key === "ArrowDown" ||
    key === "PageUp" ||
    key === "PageDown" ||
    key === "Home" ||
    key === "End" ||
    key === " "
  );
}

function isBackwardTranscriptScrollKey(key: string) {
  return key === "ArrowUp" || key === "PageUp" || key === "Home";
}

export const TaskChatTurn = memo(function TaskChatTurn({
  entry,
  editable,
  editing,
  editingPrompt,
  onEditingPromptChange,
  onSubmitEdit,
  onCancelEdit,
  onStartEdit,
  onResolveRequest,
  onAnswerUserInput,
  onImplementPlan,
  onRevisePlan,
  onCancelPlan,
  onOpenFileLink,
  onReviewEditedFile,
  onUndoEditedFiles,
  fileUndoDisabled = false,
  onLoadHistoricalActivity,
  planExpanded,
  editedFilesExpanded,
  onPlanDisclosureChange,
  onPendingInteractionPageChange,
}: {
  entry: TaskChatEntry;
  editable: boolean;
  editing: boolean;
  editingPrompt: string;
  onEditingPromptChange: (prompt: string) => void;
  onSubmitEdit: (entry: TaskChatEntry, prompt: string) => void;
  onCancelEdit: () => void;
  onStartEdit: (entry: TaskChatEntry) => void;
  onResolveRequest: ApprovalResolutionHandler;
  onAnswerUserInput?: Props["onAnswerUserInput"];
  onImplementPlan?: Props["onImplementPlan"];
  onRevisePlan?: Props["onRevisePlan"];
  onCancelPlan?: Props["onCancelPlan"];
  onOpenFileLink?: (href: string) => boolean;
  onReviewEditedFile?: Props["onReviewEditedFile"];
  onUndoEditedFiles?: Props["onUndoEditedFiles"];
  fileUndoDisabled?: boolean;
  onLoadHistoricalActivity?: (entry: TaskChatEntry) => void;
  planExpanded?: boolean;
  editedFilesExpanded?: boolean;
  onPlanDisclosureChange?: NativePlanDisclosureChangeHandler;
  onPendingInteractionPageChange?: PendingInteractionPageChangeHandler;
}) {
  return (
    <div className="task-chat-run">
      <div
        className={`submitted-prompt-stack ${editable ? "editable" : ""} ${
          editing ? "editing" : ""
        }`}
      >
        {editing ? (
          <form
            className="submitted-prompt-edit-form"
            onSubmit={(event) => {
              event.preventDefault();
              onSubmitEdit(entry, editingPrompt.trim());
            }}
          >
            <article className="submitted-prompt editing" aria-label="Submitted prompt">
              <textarea
                aria-label="Edit submitted prompt"
                value={editingPrompt}
                onChange={(event) => onEditingPromptChange(event.target.value)}
                autoFocus
              />
            </article>
            <div className="submitted-prompt-edit-actions">
              <button
                type="submit"
                aria-label="Run edited prompt"
                disabled={!editingPrompt.trim()}
              >
                <Check size={15} aria-hidden="true" />
              </button>
              <button
                type="button"
                aria-label="Cancel prompt edit"
                onClick={onCancelEdit}
              >
                <X size={15} aria-hidden="true" />
              </button>
            </div>
          </form>
        ) : (
          <>
            <article
              className="submitted-prompt"
              aria-label="Submitted prompt"
              onCopy={(event) => {
                writeSubmittedPromptClipboard(
                  event,
                  entry.prompt,
                  entry.contextFiles ?? [],
                );
              }}
            >
              <SubmittedPrompt
                prompt={entry.prompt}
                contextFiles={entry.contextFiles ?? EMPTY_CONTEXT_FILES}
                onOpenFileLink={onOpenFileLink}
              />
            </article>
            {editable ? (
              <button
                className="submitted-prompt-edit-button"
                type="button"
                aria-label="Edit prompt"
                title="Edit prompt"
                onClick={() => onStartEdit(entry)}
              >
                <Pencil size={15} aria-hidden="true" />
              </button>
            ) : null}
          </>
        )}
      </div>
      <article
        className={`chat-message assistant-message status-${entry.status}`}
        data-agent-notification-target="response"
        tabIndex={-1}
      >
        <AssistantRunOutput
          entry={entry}
          runView={entry.runView}
          onResolveRequest={onResolveRequest}
          onAnswerUserInput={onAnswerUserInput}
          onImplementPlan={onImplementPlan}
          onRevisePlan={onRevisePlan}
          onCancelPlan={onCancelPlan}
          onOpenFileLink={onOpenFileLink}
          onReviewEditedFile={onReviewEditedFile}
          onUndoEditedFiles={onUndoEditedFiles}
          fileUndoDisabled={fileUndoDisabled}
          onLoadHistoricalActivity={onLoadHistoricalActivity}
          planExpanded={planExpanded}
          editedFilesExpanded={editedFilesExpanded}
          onPlanDisclosureChange={onPlanDisclosureChange}
          onPendingInteractionPageChange={onPendingInteractionPageChange}
        />
      </article>
    </div>
  );
});

function isRunActiveStatus(status: RunViewState["status"]) {
  return status === "connecting" || status === "running";
}

function isScrolledNearBottom(element: HTMLElement) {
  const remainingScroll =
    element.scrollHeight - element.clientHeight - element.scrollTop;
  return remainingScroll <= AUTO_SCROLL_BOTTOM_THRESHOLD_PX;
}

const SubmittedPrompt = memo(function SubmittedPrompt({
  prompt,
  contextFiles,
  onOpenFileLink,
}: {
  prompt: string;
  contextFiles: ComposerContextFile[];
  onOpenFileLink?: (href: string) => boolean;
}) {
  const inlineFiles = contextFiles.filter((file) => file.source === "search");
  const segments = buildSubmittedPromptSegments(prompt, inlineFiles);

  if (!segments.some((segment) => segment.kind === "file")) {
    return <>{prompt}</>;
  }

  return (
    <>
      {segments.map((segment, index) => {
        if (segment.kind === "text") {
          return <span key={`text-${index}`}>{segment.text}</span>;
        }

        return (
          <a
            className="submitted-inline-file"
            href={segment.href}
            key={`${segment.href}-${index}`}
            title={`Preview ${segment.href}`}
            onClick={(event: ReactMouseEvent<HTMLAnchorElement>) => {
              if (onOpenFileLink?.(segment.href)) {
                event.preventDefault();
                event.stopPropagation();
              }
            }}
          >
            <span className="submitted-inline-file-type" aria-hidden="true">
              {contextFileExtensionLabel(segment.file.name)}
            </span>{" "}
            <span className="submitted-inline-file-name">{segment.file.name}</span>
          </a>
        );
      })}
    </>
  );
});

const AssistantRunOutput = memo(function AssistantRunOutput({
  entry,
  runView,
  onResolveRequest,
  onAnswerUserInput,
  onImplementPlan,
  onRevisePlan,
  onCancelPlan,
  onOpenFileLink,
  onReviewEditedFile,
  onUndoEditedFiles,
  fileUndoDisabled = false,
  onLoadHistoricalActivity,
  planExpanded,
  editedFilesExpanded,
  onPlanDisclosureChange,
  onPendingInteractionPageChange,
}: {
  entry: TaskChatEntry;
  runView: RunViewState;
  onResolveRequest: ApprovalResolutionHandler;
  onAnswerUserInput?: Props["onAnswerUserInput"];
  onImplementPlan?: Props["onImplementPlan"];
  onRevisePlan?: Props["onRevisePlan"];
  onCancelPlan?: Props["onCancelPlan"];
  onOpenFileLink?: (href: string) => boolean;
  onReviewEditedFile?: Props["onReviewEditedFile"];
  onUndoEditedFiles?: Props["onUndoEditedFiles"];
  fileUndoDisabled?: boolean;
  onLoadHistoricalActivity?: (entry: TaskChatEntry) => void;
  planExpanded?: boolean;
  editedFilesExpanded?: boolean;
  onPlanDisclosureChange?: NativePlanDisclosureChangeHandler;
  onPendingInteractionPageChange?: PendingInteractionPageChangeHandler;
}) {
  const completed =
    runView.status === "completed" ||
    runView.status === "failed" ||
    runView.status === "interrupted";

  if (completed) {
    const hasTrace =
      buildTimelineItems(runView).length > 0 ||
      entry.historicalActivity !== undefined;

    return (
      <div className="run-output-surface completed">
        {hasTrace ? (
          <RunTraceDropdown
            entry={entry}
            runView={runView}
            onLoadHistoricalActivity={onLoadHistoricalActivity}
          />
        ) : (
          <RunMetrics runView={runView} />
        )}
        <NativePlanCard
          entry={entry}
          onImplementPlan={onImplementPlan}
          onRevisePlan={onRevisePlan}
          onCancelPlan={onCancelPlan}
          expanded={planExpanded}
          onDisclosureChange={onPlanDisclosureChange}
        />
        {runView.finalMessage.trim() ||
        runView.status === "failed" ||
        runView.status === "interrupted" ||
        !runView.nativePlan.completedText ? (
          <RunSummary
            runView={runView}
            preparedSummary={entry.preparedSummary}
            onOpenFileLink={onOpenFileLink}
          />
        ) : null}
        <EditedFilesSummary
          entry={entry}
          expanded={editedFilesExpanded}
          undoDisabled={fileUndoDisabled}
          onDisclosureChange={onPlanDisclosureChange}
          onReviewFile={onReviewEditedFile}
          onUndo={onUndoEditedFiles}
        />
        <RunApprovalRequests
          entry={entry}
          runView={runView}
          onResolveRequest={onResolveRequest}
          onAnswerUserInput={onAnswerUserInput}
          onPendingInteractionPageChange={onPendingInteractionPageChange}
        />
      </div>
    );
  }

  const hasTimeline =
    runView.streamEvents.length > 0 ||
    runView.editedFiles.length > 0 ||
    runView.commands.length > 0;
  const hasPlanPreview = Boolean(
    runView.nativePlan.completedText || runView.nativePlan.previewText,
  );

  return (
    <div className="run-output-surface running" aria-label="Live run output">
      <RunMetrics runView={runView} />
      {hasTimeline ? (
        <RunTimeline runView={runView} />
      ) : hasPlanPreview ? null : runView.status === "connecting" ? (
        <PreparingRunStatus />
      ) : (
        <p className="stream-placeholder">
          <Clock size={15} aria-hidden="true" />
          Waiting for app-server output...
        </p>
      )}
      <NativePlanCard
        entry={entry}
        onImplementPlan={onImplementPlan}
        onRevisePlan={onRevisePlan}
        onCancelPlan={onCancelPlan}
        expanded={planExpanded}
        onDisclosureChange={onPlanDisclosureChange}
      />
      <RunApprovalRequests
        entry={entry}
        runView={runView}
        onResolveRequest={onResolveRequest}
        onAnswerUserInput={onAnswerUserInput}
        onPendingInteractionPageChange={onPendingInteractionPageChange}
      />
    </div>
  );
});

function PreparingRunStatus() {
  return (
    <p className="stream-placeholder stream-preparing" aria-label="Preparing run">
      <span className="stream-loading-dots" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
      Preparing run...
    </p>
  );
}

const EDITED_FILES_COLLAPSED_LIMIT = 3;

type EditedFilesActionState = "idle" | "confirming" | "loading" | "success";

const EditedFilesSummary = memo(function EditedFilesSummary({
  entry,
  expanded,
  undoDisabled,
  onDisclosureChange,
  onReviewFile,
  onUndo,
}: {
  entry: TaskChatEntry;
  expanded?: boolean;
  undoDisabled: boolean;
  onDisclosureChange?: NativePlanDisclosureChangeHandler;
  onReviewFile?: Props["onReviewEditedFile"];
  onUndo?: Props["onUndoEditedFiles"];
}) {
  const files = entry.runView.editedFiles;
  const listId = useId();
  const cardRef = useRef<HTMLElement | null>(null);
  const undoButtonRef = useRef<HTMLButtonElement | null>(null);
  const [localExpanded, setLocalExpanded] = useState(false);
  const [undoState, setUndoState] = useState<EditedFilesActionState>(
    entry.runView.fileChangesReverted ? "success" : "idle",
  );
  const [reviewing, setReviewing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const isExpanded = expanded ?? localExpanded;
  const totals = useMemo(
    () =>
      files.reduce(
        (current, file) => ({
          additions: current.additions + file.additions,
          deletions: current.deletions + file.deletions,
        }),
        { additions: 0, deletions: 0 },
      ),
    [files],
  );

  useEffect(() => {
    if (entry.runView.fileChangesReverted) {
      setUndoState("success");
      setActionError(null);
    }
  }, [entry.runView.fileChangesReverted]);

  if (files.length === 0) {
    return null;
  }

  const visibleFiles = isExpanded
    ? files
    : files.slice(0, EDITED_FILES_COLLAPSED_LIMIT);
  const hiddenFileCount = files.length - visibleFiles.length;
  const runActive = isRunActiveStatus(entry.status);
  const changesReverted =
    entry.runView.fileChangesReverted || undoState === "success";
  const exactUndoUnavailable = !entry.runView.latestDiff.trim();
  const undoUnavailable =
    undoDisabled ||
    runActive ||
    exactUndoUnavailable ||
    changesReverted ||
    !onUndo;
  const actionsBusy = undoState === "loading" || reviewing;

  const setExpanded = (nextExpanded: boolean) => {
    const card = cardRef.current;
    if (card && onDisclosureChange) {
      onDisclosureChange({
        anchorElement: card,
        anchorTop: card.getBoundingClientRect().top,
        expanded: nextExpanded,
        planKey: editedFilesDisclosureKey(entry),
      });
      return;
    }
    setLocalExpanded(nextExpanded);
  };

  const reviewFile = async (file: RunEditedFile) => {
    if (!onReviewFile || actionsBusy || changesReverted) {
      return;
    }
    setReviewing(true);
    setActionError(null);
    try {
      await onReviewFile(entry, file);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setReviewing(false);
    }
  };

  const confirmUndo = async () => {
    if (undoUnavailable || actionsBusy || !onUndo) {
      return;
    }
    setUndoState("loading");
    setActionError(null);
    try {
      await onUndo(entry);
      setUndoState("success");
    } catch (error) {
      setUndoState("idle");
      setActionError(error instanceof Error ? error.message : String(error));
    }
  };

  const undoTitle = changesReverted
    ? "These changes have been undone"
    : runActive || undoDisabled
      ? "Wait for the active agent to finish before undoing changes"
      : exactUndoUnavailable
        ? "The exact turn diff is unavailable for this chat"
        : "Undo these file changes";

  return (
    <section
      className={`edited-files-summary ${
        changesReverted
          ? "is-undone"
          : ""
      }`}
      aria-label={`Edited ${files.length} ${files.length === 1 ? "file" : "files"}`}
      aria-busy={actionsBusy}
      ref={cardRef}
    >
      <header className="edited-files-summary-header">
        <span className="edited-files-summary-icon" aria-hidden="true">
          <FileDiff size={20} />
        </span>
        <span className="edited-files-summary-heading">
          <span className="edited-files-summary-title">
            Edited {files.length} {files.length === 1 ? "file" : "files"}
          </span>
          <span className="edited-files-summary-totals">
            <span className="activity-additions">+{totals.additions}</span>
            <span className="activity-deletions">-{totals.deletions}</span>
          </span>
        </span>
        <span className="edited-files-summary-actions">
          <button
            className="native-plan-icon-action edited-files-action"
            ref={undoButtonRef}
            type="button"
            aria-label={
              undoState === "success" ? "File changes undone" : "Undo file changes"
            }
            data-tooltip={undoTitle}
            disabled={undoUnavailable || actionsBusy}
            onClick={() => {
              setActionError(null);
              setUndoState("confirming");
            }}
          >
            {undoState === "loading" ? (
              <Loader2 className="spin" size={15} aria-hidden="true" />
            ) : (
              <RotateCcw size={15} aria-hidden="true" />
            )}
          </button>
        </span>
      </header>

      {undoState === "confirming" || undoState === "loading" ? (
        <UndoEditedFilesDialog
          busy={undoState === "loading"}
          onCancel={() => {
            setUndoState("idle");
            requestAnimationFrame(() => undoButtonRef.current?.focus());
          }}
          onConfirm={() => void confirmUndo()}
        />
      ) : null}

      <div className="edited-files-summary-list" id={listId}>
        {visibleFiles.map((file) => (
          <div className="edited-files-summary-row" key={file.path}>
            <button
              className="edited-files-path"
              type="button"
              title={file.path}
              aria-label={`Review ${file.path}`}
              disabled={reviewing || changesReverted || !onReviewFile}
              onClick={() => void reviewFile(file)}
            >
              {file.path}
            </button>
            <span className="edited-files-row-stats" aria-label={`${file.additions} additions, ${file.deletions} deletions`}>
              <span className="activity-additions">+{file.additions}</span>
              <span className="activity-deletions">-{file.deletions}</span>
            </span>
          </div>
        ))}
      </div>

      {files.length > EDITED_FILES_COLLAPSED_LIMIT ? (
        <button
          className="edited-files-disclosure"
          type="button"
          aria-controls={listId}
          aria-expanded={isExpanded}
          onClick={() => setExpanded(!isExpanded)}
        >
          {isExpanded ? (
            <>
              Show fewer files <ChevronUp size={15} aria-hidden="true" />
            </>
          ) : (
            <>
              Show {hiddenFileCount} more {hiddenFileCount === 1 ? "file" : "files"}{" "}
              <ChevronDown size={15} aria-hidden="true" />
            </>
          )}
        </button>
      ) : null}

      {actionError ? (
        <p className="edited-files-action-status error" role="alert">
          {actionError}
        </p>
      ) : null}
    </section>
  );
});

function UndoEditedFilesDialog({
  busy,
  onCancel,
  onConfirm,
}: {
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const cancelButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) {
        event.preventDefault();
        onCancel();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [busy, onCancel]);

  useEffect(() => {
    cancelButtonRef.current?.focus({ preventScroll: true });
  }, []);

  return createPortal(
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) {
          onCancel();
        }
      }}
    >
      <section
        className="confirmation-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        aria-busy={busy}
      >
        <div>
          <p className="eyebrow">File changes</p>
          <h2 id={titleId}>Undo changes?</h2>
          <p id={descriptionId}>
            Undo the changes represented by this summary?
          </p>
        </div>
        <div className="confirmation-actions">
          <button
            className="native-plan-icon-action"
            ref={cancelButtonRef}
            type="button"
            aria-label="Keep changes"
            data-tooltip="Keep changes"
            disabled={busy}
            onClick={onCancel}
          >
            <X size={15} aria-hidden="true" />
          </button>
          <button
            className="native-plan-icon-action cancel"
            type="button"
            aria-label={busy ? "Undoing changes" : "Undo changes"}
            data-tooltip={busy ? "Undoing changes" : "Undo changes"}
            disabled={busy}
            onClick={onConfirm}
          >
            {busy ? (
              <Loader2 className="spin" size={15} aria-hidden="true" />
            ) : (
              <RotateCcw size={15} aria-hidden="true" />
            )}
          </button>
        </div>
      </section>
    </div>,
    document.body,
  );
}

const RunTraceDropdown = memo(function RunTraceDropdown({
  entry,
  runView,
  onLoadHistoricalActivity,
}: {
  entry: TaskChatEntry;
  runView: RunViewState;
  onLoadHistoricalActivity?: (entry: TaskChatEntry) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <details
      className="stream-trace"
      onToggle={(event) => {
        const nextOpen = event.currentTarget.open;
        setOpen(nextOpen);
        if (
          nextOpen &&
          entry.historicalActivity?.status === "available"
        ) {
          onLoadHistoricalActivity?.(entry);
        }
      }}
    >
      <summary className="run-live-metrics" aria-label="Run trace">
        <span>
          <Clock size={15} aria-hidden="true" />
          {formatDuration(runView.elapsedMs)}
        </span>
        <span>{formatTokenCount(runView)}</span>
        <ChevronRight className="run-trace-chevron" size={15} aria-hidden="true" />
      </summary>
      {open ? (
        <>
          {entry.historicalActivity?.status === "loading" ? (
            <p className="historical-activity-status">Loading activity...</p>
          ) : null}
          {entry.historicalActivity?.status === "error" ? (
            <div className="historical-activity-status error">
              <span>
                {entry.historicalActivity.error ?? "Activity could not be loaded."}
              </span>
              <button
                type="button"
                onClick={() => onLoadHistoricalActivity?.(entry)}
              >
                Retry
              </button>
            </div>
          ) : null}
          <RunTimeline runView={runView} />
          {entry.historicalActivity?.status === "loaded" &&
          entry.historicalActivity.nextCursor ? (
            <button
              className="historical-activity-more"
              type="button"
              onClick={() => onLoadHistoricalActivity?.(entry)}
            >
              Load older activity
            </button>
          ) : null}
        </>
      ) : null}
    </details>
  );
});

const RunMetrics = memo(function RunMetrics({
  runView,
}: {
  runView: RunViewState;
}) {
  return (
    <div className="run-live-metrics" aria-label="Run metrics">
      <span>
        <Clock size={15} aria-hidden="true" />
        {formatDuration(runView.elapsedMs)}
      </span>
      <span>{formatTokenCount(runView)}</span>
    </div>
  );
});

const RunSummary = memo(function RunSummary({
  runView,
  preparedSummary,
  onOpenFileLink,
}: {
  runView: RunViewState;
  preparedSummary?: PreparedHistoricalSummary;
  onOpenFileLink?: (href: string) => boolean;
}) {
  const markdownComponents = useMemo<Components>(
    () => ({
      a: ({ href, children, node: _node, ...props }) => {
        const previewable = Boolean(
          href && onOpenFileLink && isPreviewableSummaryLink(href),
        );
        const className = [
          props.className,
          previewable ? "markdown-preview-link" : null,
        ]
          .filter(Boolean)
          .join(" ");

        return (
          <a
            {...props}
            className={className || undefined}
            href={href}
            title={previewable ? "Click to preview file" : props.title}
            onClick={(event: ReactMouseEvent<HTMLAnchorElement>) => {
              if (href && onOpenFileLink?.(href)) {
                event.preventDefault();
                event.stopPropagation();
              }
            }}
          >
            {children}
          </a>
        );
      },
    }),
    [onOpenFileLink],
  );

  if (runView.status === "failed" && runView.error) {
    return (
      <div className="run-summary error" aria-label="Run error">
        {runView.error}
      </div>
    );
  }

  if (runView.status === "interrupted") {
    return (
      <div className="run-summary muted" aria-label="Run summary">
        {runView.error ?? "Stopped by user."}
      </div>
    );
  }

  if (!runView.finalMessage.trim()) {
    return (
      <div className="run-summary muted" aria-label="Run summary">
        Completed without a final message.
      </div>
    );
  }

  if (preparedSummary?.kind === "plain") {
    return (
      <div
        className="run-summary markdown-summary historical-summary-plain"
        aria-label="Run summary"
      >
        {preparedSummary.text}
      </div>
    );
  }

  if (preparedSummary?.kind === "html") {
    return (
      <div
        className="run-summary markdown-summary historical-summary-html"
        aria-label="Run summary"
        dangerouslySetInnerHTML={{ __html: preparedSummary.html }}
        onClick={(event) => {
          const target = event.target;
          const anchor =
            target instanceof Element ? target.closest("a[href]") : null;
          const href = anchor?.getAttribute("href");
          if (href && onOpenFileLink?.(href)) {
            event.preventDefault();
            event.stopPropagation();
          }
        }}
      />
    );
  }

  return (
    <div className="run-summary markdown-summary" aria-label="Run summary">
      <ReactMarkdown components={markdownComponents}>
        {runView.finalMessage}
      </ReactMarkdown>
    </div>
  );
});

function buildSubmittedPromptSegments(
  prompt: string,
  files: ComposerContextFile[],
) {
  const candidates = buildSubmittedPromptTokenCandidates(prompt, files);
  const segments: Array<
    | { kind: "text"; text: string }
    | { kind: "file"; file: ComposerContextFile; href: string }
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

    segments.push({ kind: "file", file: match.file, href: match.href });
    cursor += match.token.length;
  }

  return segments;
}

function buildSubmittedPromptTokenCandidates(
  prompt: string,
  files: ComposerContextFile[],
) {
  const candidates = buildInlineFileTokenCandidates(files).map((candidate) => ({
    ...candidate,
    href: contextFileLineReference(candidate.file),
  }));
  const knownTokens = new Set(candidates.map((candidate) => candidate.token));
  const markdownLinkPattern = /\[([^\]\n]+)\]\(([^)\n]+)\)/g;

  for (const match of prompt.matchAll(markdownLinkPattern)) {
    const token = match[0];
    const name = match[1]?.replace(/\\([\\\[\]])/g, "$1").trim();
    const href = match[2]?.trim();
    if (
      !name ||
      !href ||
      knownTokens.has(token) ||
      !isPreviewableSummaryLink(href)
    ) {
      continue;
    }

    knownTokens.add(token);
    candidates.push({
      token,
      href,
      file: {
        path: href,
        name,
        source: "search",
        status: "ready",
      },
    });
  }

  return candidates.sort((left, right) => right.token.length - left.token.length);
}

function buildInlineFileTokenCandidates(files: ComposerContextFile[]) {
  return files
    .filter((file) => file.name.trim().length > 0)
    .flatMap((file) =>
      contextFileInlineReferenceTokens(file).map((token) => ({ file, token })),
    )
    .sort((left, right) => right.token.length - left.token.length);
}

function writeSubmittedPromptClipboard(
  event: ReactClipboardEvent<HTMLElement>,
  prompt: string,
  contextFiles: ComposerContextFile[],
) {
  const inlineFiles = contextFiles.filter((file) => file.source === "search");
  if (inlineFiles.length === 0) {
    return;
  }

  const selectedText = window.getSelection()?.toString() ?? "";
  const copiedPrompt = selectedText.trim().length > 0 ? selectedText : prompt;
  const copiedFiles = findInlineFilesReferencedByText(copiedPrompt, inlineFiles);
  if (copiedFiles.length === 0) {
    return;
  }

  event.preventDefault();
  event.clipboardData.setData("text/plain", copiedPrompt);
  event.clipboardData.setData(
    ORCHESTRATOR_PROMPT_CONTEXT_MIME,
    JSON.stringify({
      version: 1,
      prompt: copiedPrompt,
      files: copiedFiles,
    }),
  );
}

function findInlineFilesReferencedByText(
  text: string,
  files: ComposerContextFile[],
) {
  const seen = new Set<string>();
  const referencedFiles: ComposerContextFile[] = [];

  for (const { file, token } of buildInlineFileTokenCandidates(files)) {
    if (!text.includes(token) || seen.has(file.path)) {
      continue;
    }

    seen.add(file.path);
    referencedFiles.push(file);
  }

  return referencedFiles;
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

const RunTimeline = memo(function RunTimeline({
  runView,
}: {
  runView: RunViewState;
}) {
  const items = buildTimelineItems(runView);

  if (items.length === 0) {
    return null;
  }

  return (
    <div className="stream-event-list" aria-label="App-server stream">
      {items.map((item) => {
        if (item.kind === "commands") {
          return (
            <RunActivityGroups key={item.id}>
              <CommandsGroup commands={item.commands} />
            </RunActivityGroups>
          );
        }

        return <StreamEventRow event={item.event} key={item.event.id} />;
      })}
    </div>
  );
});

function RunActivityGroups({ children }: { children: ReactNode }) {
  return (
    <div className="run-activity-groups" aria-label="Run activity groups">
      {children}
    </div>
  );
}

type TimelineItem =
  | { kind: "event"; event: StreamEvent }
  | { kind: "commands"; id: string; commands: RunCommandActivity[] };

function buildTimelineItems(runView: RunViewState): TimelineItem[] {
  const items: TimelineItem[] = [];
  const renderedCommandIds = new Set<string>();

  for (const event of runView.streamEvents) {
    if (shouldHideCompletedFinalMessageEvent(runView, event)) {
      continue;
    }

    if (event.kind === "file") {
      if (runView.editedFiles.length === 0) {
        items.push({ kind: "event", event });
      }
      continue;
    }

    if (event.kind === "command") {
      const commands = selectCommandsForEvent(
        runView.commands,
        event.activityIds,
        renderedCommandIds,
      );

      if (commands.length > 0) {
        items.push({ kind: "commands", id: `commands-${event.id}`, commands });
        commands.forEach((command) => renderedCommandIds.add(command.id));
      } else if (runView.commands.length === 0) {
        items.push({ kind: "event", event });
      }
      continue;
    }

    items.push({ kind: "event", event });
  }

  const remainingCommands = runView.commands.filter(
    (command) => !renderedCommandIds.has(command.id),
  );
  if (remainingCommands.length > 0) {
    items.push({
      kind: "commands",
      id: "commands-remaining",
      commands: remainingCommands,
    });
  }

  return items;
}

function shouldHideCompletedFinalMessageEvent(
  runView: RunViewState,
  event: StreamEvent,
) {
  if (
    event.kind !== "message" ||
    !(
      runView.status === "completed" ||
      runView.status === "failed" ||
      runView.status === "interrupted"
    )
  ) {
    return false;
  }

  const activityIds = event.activityIds ?? [];
  if (
    activityIds.some((id) => {
      const message = runView.agentMessagesById[id];
      return message?.phase === "final_answer" || id === runView.finalMessageItemId;
    })
  ) {
    return true;
  }

  return (
    activityIds.length === 0 &&
    runView.finalMessage.trim().length > 0 &&
    event.text.trim() === runView.finalMessage.trim()
  );
}

function selectCommandsForEvent(
  commands: RunCommandActivity[],
  activityIds: string[] | undefined,
  renderedCommandIds: Set<string>,
) {
  if (commands.length === 0) {
    return [];
  }

  if (!activityIds || activityIds.length === 0) {
    return renderedCommandIds.size === 0 ? commands : [];
  }

  const activityIdSet = new Set(activityIds);
  return commands.filter(
    (command) =>
      activityIdSet.has(command.id) && !renderedCommandIds.has(command.id),
  );
}

const CommandsGroup = memo(function CommandsGroup({
  commands,
}: {
  commands: RunCommandActivity[];
}) {
  return (
    <details className="run-activity-group command-runs">
      <summary>
        <span className="run-activity-title">
          <Terminal size={15} aria-hidden="true" />
          Ran {commands.length} {commands.length === 1 ? "command" : "commands"}
        </span>
        <ChevronDown size={15} aria-hidden="true" />
      </summary>
      <div className="run-activity-items">
        {commands.map((command) => (
          <div className="run-activity-item command-row" key={command.id}>
            <span>{commandActionLabel(command.status)}</span>
            <span className="activity-command-text">{command.command}</span>
            {command.durationMs !== null ? (
              <span>for {formatDuration(command.durationMs)}</span>
            ) : null}
          </div>
        ))}
      </div>
    </details>
  );
});

function StreamEventRow({ event }: { event: StreamEvent }) {
  if (event.kind === "message") {
    return (
      <div className="stream-message" key={event.id}>
        {event.text}
      </div>
    );
  }

  return (
    <div className={`stream-event ${event.kind}`} key={event.id}>
      {streamEventIcon(event.kind)}
      <span>{event.text}</span>
    </div>
  );
}

function streamEventIcon(kind: StreamEvent["kind"]) {
  switch (kind) {
    case "command":
      return <Terminal size={15} aria-hidden="true" />;
    case "file":
      return <FileText size={15} aria-hidden="true" />;
    case "reasoning":
      return <BrainCircuit size={15} aria-hidden="true" />;
    case "message":
      return <MessageSquare size={15} aria-hidden="true" />;
    default:
      return <Activity size={15} aria-hidden="true" />;
  }
}

const NativePlanMarkdown = memo(function NativePlanMarkdown({
  text,
}: {
  text: string;
}) {
  return (
    <ReactMarkdown remarkPlugins={PLAN_MARKDOWN_PLUGINS}>
      {text}
    </ReactMarkdown>
  );
});

const NativePlanCard = memo(function NativePlanCard({
  entry,
  onImplementPlan,
  onRevisePlan,
  onCancelPlan,
  expanded,
  onDisclosureChange,
}: {
  entry: TaskChatEntry;
  onImplementPlan?: Props["onImplementPlan"];
  onRevisePlan?: Props["onRevisePlan"];
  onCancelPlan?: Props["onCancelPlan"];
  expanded?: boolean;
  onDisclosureChange?: NativePlanDisclosureChangeHandler;
}) {
  const [revising, setRevising] = useState(false);
  const [revision, setRevision] = useState("");
  const [revisionSubmitting, setRevisionSubmitting] = useState(false);
  const revisionSubmissionLockRef = useRef(false);
  const [localDisclosure, setLocalDisclosure] = useState({
    expanded: false,
    planKey: "",
  });
  const cardRef = useRef<HTMLElement | null>(null);
  const contentId = useId();
  const plan = entry.runView.nativePlan;
  const text = plan.completedText || plan.previewText;
  const planKey = nativePlanDisclosureKey(entry);
  const preview = useMemo(() => buildNativePlanPreview(text), [text]);
  useEffect(() => {
    if (plan.reviewState !== "available") return;
    revisionSubmissionLockRef.current = false;
    setRevisionSubmitting(false);
  }, [plan.reviewState, planKey]);
  if (!text) {
    return null;
  }

  const locallyExpanded =
    localDisclosure.planKey === planKey && localDisclosure.expanded;
  const isExpanded = preview.isLong && (expanded ?? locallyExpanded);
  const renderedText = isExpanded ? text : preview.previewText;

  const canReview = plan.reviewState === "available";
  const busy = plan.reviewState === "submitting" || revisionSubmitting;
  const submitRevision = () => {
    const value = revision.trim();
    if (
      !value ||
      busy ||
      revisionSubmissionLockRef.current ||
      !onRevisePlan
    ) {
      return;
    }
    revisionSubmissionLockRef.current = true;
    const accepted = onRevisePlan(entry, value);
    if (accepted === false) {
      revisionSubmissionLockRef.current = false;
      return;
    }
    setRevisionSubmitting(true);
  };
  const heading = canReview
    ? "Plan ready"
    : plan.reviewState === "approved"
      ? "Plan approved"
      : plan.reviewState === "superseded"
        ? "Plan superseded"
        : plan.reviewState === "cancelled"
          ? "Plan cancelled"
          : "Plan";
  const detail = canReview
    ? "Review before implementation"
    : plan.reviewState === "approved"
      ? "Implementation started"
      : plan.reviewState === "superseded"
        ? "A revised plan follows"
        : plan.reviewState === "cancelled"
          ? "No implementation was started"
          : plan.phase === "completed"
            ? "Completed plan"
            : "Drafting";
  return (
    <section
      className="native-plan-card"
      aria-label="Codex plan"
      ref={cardRef}
      data-agent-notification-target="plan"
      data-agent-notification-id={plan.planItemId ?? ""}
      tabIndex={-1}
    >
      <header>
        <div>
          <strong>{heading}</strong>
          <span>{detail}</span>
        </div>
        {plan.mode ? <span className="native-plan-mode">{plan.mode}</span> : null}
      </header>
      <div
        className={`native-plan-markdown markdown-summary${
          preview.isLong && !isExpanded ? " collapsed" : ""
        }`}
        id={contentId}
      >
        <NativePlanMarkdown text={renderedText} />
      </div>
      {preview.isLong ? (
        <button
          type="button"
          className="small native-plan-disclosure"
          aria-controls={contentId}
          aria-expanded={isExpanded}
          onClick={() => {
            const nextExpanded = !isExpanded;
            const anchorElement = cardRef.current;
            if (anchorElement && onDisclosureChange) {
              onDisclosureChange({
                anchorElement,
                anchorTop: anchorElement.getBoundingClientRect().top,
                expanded: nextExpanded,
                planKey,
              });
              return;
            }
            setLocalDisclosure({
              expanded: nextExpanded,
              planKey,
            });
          }}
        >
          {isExpanded ? (
            <ChevronUp size={15} aria-hidden="true" />
          ) : (
            <ChevronDown size={15} aria-hidden="true" />
          )}
          {isExpanded ? "Hide full plan" : "Show full plan"}
        </button>
      ) : null}
      {canReview && !revising ? (
        <div className="native-plan-actions confirmation-actions">
          <button
            type="button"
            className="native-plan-icon-action implement"
            aria-label="Implement plan"
            title="Implement plan"
            disabled={busy || !onImplementPlan}
            onClick={() => onImplementPlan?.(entry)}
          >
            <Check size={15} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="native-plan-icon-action revise"
            aria-label="Revise plan"
            title="Revise plan"
            disabled={busy || !onRevisePlan}
            onClick={() => setRevising(true)}
          >
            <Pencil size={15} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="native-plan-icon-action cancel"
            aria-label="Cancel plan"
            title="Cancel plan"
            disabled={busy || !onCancelPlan}
            onClick={() => onCancelPlan?.(entry)}
          >
            <X size={15} aria-hidden="true" />
          </button>
        </div>
      ) : null}
      {canReview && revising ? (
        <form
          className="native-plan-revision"
          aria-busy={busy}
          onSubmit={(event) => {
            event.preventDefault();
            submitRevision();
          }}
        >
          <label htmlFor={`plan-revision-${entry.clientId}`}>What should change?</label>
          <textarea
            id={`plan-revision-${entry.clientId}`}
            value={revision}
            onChange={(event) => setRevision(event.target.value)}
            onKeyDown={(event) => {
              if (
                event.key !== "Enter" ||
                event.shiftKey ||
                event.nativeEvent.isComposing
              ) {
                return;
              }
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }}
            disabled={busy}
            autoFocus
          />
          <div className="native-plan-actions confirmation-actions">
            <button
              type="submit"
              className="native-plan-icon-action implement"
              aria-label="Send revision"
              data-tooltip="Send revision"
              disabled={!revision.trim() || busy}
            >
              <Check size={15} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="native-plan-icon-action cancel"
              aria-label="Cancel revision"
              data-tooltip="Cancel revision"
              disabled={busy}
              onClick={() => setRevising(false)}
            >
              <X size={15} aria-hidden="true" />
            </button>
          </div>
        </form>
      ) : null}
    </section>
  );
});

type UserInputDraft = {
  values: Record<string, string>;
  otherValues: Record<string, string>;
};

type PendingInteractionPage =
  | {
      kind: "approval";
      key: string;
      request: CodexApprovalRequest;
    }
  | {
      kind: "user-input";
      key: string;
      request: NativeUserInputRequest;
      question: UserInputQuestion;
    }
  | {
      kind: "unsupported";
      key: string;
      request: CodexMessage;
    };

const EMPTY_USER_INPUT_DRAFT: UserInputDraft = {
  values: {},
  otherValues: {},
};

function buildPendingInteractionPages(runView: RunViewState) {
  const approvalByKey = new Map(
    runView.approvalRequests.map((request) => [request.key, request]),
  );
  const serverRequestByKey = new Map(
    runView.serverRequests.map((request) => [requestKey(request), request]),
  );
  const seenApprovals = new Set<string>();
  const seenServerRequests = new Set<string>();
  const pages: PendingInteractionPage[] = [];

  function appendApproval(request: CodexApprovalRequest) {
    if (seenApprovals.has(request.key)) return;
    seenApprovals.add(request.key);
    pages.push({
      kind: "approval",
      key: `approval:${request.key}`,
      request,
    });
  }

  function appendServerRequest(request: CodexMessage) {
    const key = requestKey(request);
    if (seenServerRequests.has(key)) return;
    seenServerRequests.add(key);
    if (isNativeUserInputRequest(request) && request.params.questions.length > 0) {
      request.params.questions.forEach((question, index) => {
        pages.push({
          kind: "user-input",
          key: `question:${key}:${question.id}:${index}`,
          request,
          question,
        });
      });
      return;
    }
    pages.push({
      kind: "unsupported",
      key: `server-request:${key}`,
      request,
    });
  }

  for (const interaction of runView.pendingInteractionOrder ?? []) {
    if (interaction.kind === "approval") {
      const request = approvalByKey.get(interaction.key);
      if (request) appendApproval(request);
      continue;
    }
    const request = serverRequestByKey.get(interaction.key);
    if (request) appendServerRequest(request);
  }
  runView.approvalRequests.forEach(appendApproval);
  runView.serverRequests.forEach(appendServerRequest);
  return pages;
}

function buildUserInputResponse(
  request: NativeUserInputRequest,
  draft: UserInputDraft,
) {
  const answers: UserInputResponse["answers"] = {};
  const unansweredQuestionIds: string[] = [];
  for (const question of request.params.questions) {
    const selected = draft.values[question.id] ?? "";
    const primary =
      selected === "__other__"
        ? draft.otherValues[question.id]?.trim() ?? ""
        : selected.trim();
    if (!primary) unansweredQuestionIds.push(question.id);
    answers[question.id] = { answers: [primary].filter(Boolean) };
  }
  return {
    complete: unansweredQuestionIds.length === 0,
    response: { answers },
    unansweredQuestionIds,
  };
}

const PendingInteractionNavigator = memo(function PendingInteractionNavigator({
  index,
  total,
  onPrevious,
  onNext,
}: {
  index: number;
  total: number;
  onPrevious: () => void;
  onNext: () => void;
}) {
  if (total <= 1) return null;
  return (
    <nav
      className="pending-interaction-navigator"
      aria-label="Pending interactions"
    >
      <button
        type="button"
        className="pending-interaction-nav"
        aria-label="Previous pending interaction"
        title="Previous"
        disabled={index === 0}
        onClick={onPrevious}
      >
        <ChevronLeft size={15} aria-hidden="true" />
      </button>
      <span
        className="pending-interaction-count"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {index + 1} of {total}
      </span>
      <button
        type="button"
        className="pending-interaction-nav"
        aria-label="Next pending interaction"
        title="Next"
        disabled={index === total - 1}
        onClick={onNext}
      >
        <ChevronRight size={15} aria-hidden="true" />
      </button>
    </nav>
  );
});

const UserInputQuestionCard = memo(function UserInputQuestionCard({
  entry,
  request,
  question,
  draft,
  navigator,
  onDraftChange,
  onCommitAnswer,
}: {
  entry: TaskChatEntry;
  request: NativeUserInputRequest;
  question: UserInputQuestion;
  draft: UserInputDraft;
  navigator: ReactNode;
  onDraftChange: (draft: UserInputDraft) => void;
  onCommitAnswer: (draft: UserInputDraft) => void;
}) {
  const state = entry.runView.nativePlan.requestStates[requestKey(request)];
  const busy = state === "submitting";
  const selected = draft.values[question.id] ?? "";

  function updateAnswer(value: string, otherValue?: string) {
    const nextDraft = {
      values: { ...draft.values, [question.id]: value },
      otherValues:
        otherValue === undefined
          ? draft.otherValues
          : { ...draft.otherValues, [question.id]: otherValue },
    };
    onDraftChange(nextDraft);
    return nextDraft;
  }

  return (
    <form
      className={`approval native-user-input${navigator ? " has-navigator" : ""}`}
      data-agent-notification-target="user-input"
      data-agent-notification-id={requestKey(request)}
      tabIndex={-1}
      onSubmit={(event) => event.preventDefault()}
    >
      {navigator}
      <fieldset disabled={busy}>
        <legend>{question.question}</legend>
        {question.options ? (
          <div className="native-user-input-options">
            {question.options.map((option, optionIndex) => {
              const descriptionId = `${requestKey(request)}-${question.id}-${optionIndex}-description`;
              return (
                <label
                  className={`native-user-input-option${
                    selected === option.label ? " selected" : ""
                  }`}
                  data-tooltip={option.description}
                  key={option.label}
                >
                  <input
                    className="native-user-input-control"
                    type="radio"
                    name={`${request.id}-${question.id}`}
                    value={option.label}
                    checked={selected === option.label}
                    aria-label={option.label}
                    aria-describedby={descriptionId}
                    onChange={(event) => {
                      const nextDraft = updateAnswer(event.target.value);
                      onCommitAnswer(nextDraft);
                    }}
                  />
                  <span
                    className="native-user-input-radio"
                    aria-hidden="true"
                  />
                  <span className="native-user-input-option-label">
                    {option.label}
                  </span>
                  <div className="sr-only" id={descriptionId}>
                    {option.description}
                  </div>
                </label>
              );
            })}
            {question.isOther ? (
              <label
                className={`native-user-input-option native-user-input-other-option${
                  selected === "__other__" ? " selected" : ""
                }`}
              >
                <span
                  className="native-user-input-radio native-user-input-other-indicator"
                  aria-hidden="true"
                />
                {question.isSecret ? (
                  <input
                    className="native-user-input-other"
                    type="password"
                    aria-label={`None of the above: ${question.question}`}
                    placeholder="None of the above - type another answer"
                    value={draft.otherValues[question.id] ?? ""}
                    onFocus={() => updateAnswer("__other__")}
                    onChange={(event) =>
                      updateAnswer("__other__", event.target.value)
                    }
                    onKeyDown={(event) => {
                      if (event.key !== "Enter") return;
                      event.preventDefault();
                      onCommitAnswer(
                        updateAnswer("__other__", event.currentTarget.value),
                      );
                    }}
                  />
                ) : (
                  <textarea
                    className="native-user-input-other"
                    aria-label={`None of the above: ${question.question}`}
                    placeholder="None of the above - type your instructions"
                    rows={1}
                    value={draft.otherValues[question.id] ?? ""}
                    onFocus={() => updateAnswer("__other__")}
                    onChange={(event) =>
                      updateAnswer("__other__", event.target.value)
                    }
                    onKeyDown={(event) => {
                      if (event.key !== "Enter" || event.shiftKey) return;
                      event.preventDefault();
                      onCommitAnswer(
                        updateAnswer("__other__", event.currentTarget.value),
                      );
                    }}
                  />
                )}
              </label>
            ) : null}
          </div>
        ) : (
          <input
            type={question.isSecret ? "password" : "text"}
            aria-label={question.question}
            value={selected}
            onChange={(event) => updateAnswer(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              onCommitAnswer(updateAnswer(event.currentTarget.value));
            }}
          />
        )}
      </fieldset>
      {state === "failed" ? (
        <p className="native-user-input-error">
          Could not send that answer. Try again.
        </p>
      ) : null}
    </form>
  );
});

const RunApprovalRequests = memo(function RunApprovalRequests({
  entry,
  runView,
  onResolveRequest,
  onAnswerUserInput,
  onPendingInteractionPageChange,
}: {
  entry: TaskChatEntry;
  runView: RunViewState;
  onResolveRequest: ApprovalResolutionHandler;
  onAnswerUserInput?: Props["onAnswerUserInput"];
  onPendingInteractionPageChange?: PendingInteractionPageChangeHandler;
}) {
  const pages = useMemo(
    () => buildPendingInteractionPages(runView),
    [
      runView.approvalRequests,
      runView.pendingInteractionOrder,
      runView.serverRequests,
    ],
  );
  const [activePageKey, setActivePageKey] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, UserInputDraft>>({});
  const lastPageIndexRef = useRef(0);
  const stackRef = useRef<HTMLDivElement | null>(null);
  const keyedPageIndex = activePageKey
    ? pages.findIndex((page) => page.key === activePageKey)
    : -1;
  const activePageIndex =
    pages.length === 0
      ? -1
      : keyedPageIndex >= 0
        ? keyedPageIndex
        : Math.min(lastPageIndexRef.current, pages.length - 1);
  const activePage = activePageIndex >= 0 ? pages[activePageIndex] : null;

  useEffect(() => {
    if (!activePage) {
      if (activePageKey !== null) setActivePageKey(null);
      lastPageIndexRef.current = 0;
      return;
    }
    lastPageIndexRef.current = activePageIndex;
    if (activePage.key !== activePageKey) setActivePageKey(activePage.key);
  }, [activePage, activePageIndex, activePageKey]);

  useEffect(() => {
    const activeRequestKeys = new Set(
      runView.serverRequests.map((request) => requestKey(request)),
    );
    setDrafts((current) => {
      const next = Object.fromEntries(
        Object.entries(current).filter(([key]) => activeRequestKeys.has(key)),
      );
      return Object.keys(next).length === Object.keys(current).length
        ? current
        : next;
    });
  }, [runView.serverRequests]);

  const selectPage = useCallback(
    (index: number) => {
      const nextIndex = Math.max(0, Math.min(index, pages.length - 1));
      const nextPage = pages[nextIndex];
      if (!nextPage || nextPage.key === activePage?.key) return;
      const anchorElement = stackRef.current;
      if (anchorElement && onPendingInteractionPageChange) {
        onPendingInteractionPageChange({
          anchorElement,
          anchorTop: anchorElement.getBoundingClientRect().top,
        });
      }
      lastPageIndexRef.current = nextIndex;
      setActivePageKey(nextPage.key);
    },
    [activePage?.key, onPendingInteractionPageChange, pages],
  );

  if (!activePage) return null;

  const navigator =
    pages.length > 1 ? (
      <PendingInteractionNavigator
        index={activePageIndex}
        total={pages.length}
        onPrevious={() => selectPage(activePageIndex - 1)}
        onNext={() => selectPage(activePageIndex + 1)}
      />
    ) : null;

  let content: ReactNode;
  if (activePage.kind === "approval") {
    const request = activePage.request;
    content = (
      <ApprovalCard
        key={activePage.key}
        request={request}
        itemResources={
          request.itemId
            ? (runView.approvalResourcesByItemId[request.itemId] ?? [])
            : []
        }
        navigator={navigator}
        onResolveRequest={(pendingRequest, choice) => {
          if (activePageIndex < pages.length - 1) {
            selectPage(activePageIndex + 1);
          }
          onResolveRequest(pendingRequest, choice);
        }}
      />
    );
  } else if (activePage.kind === "user-input") {
    const serverRequestKey = requestKey(activePage.request);
    const draft = drafts[serverRequestKey] ?? EMPTY_USER_INPUT_DRAFT;
    content = (
      <UserInputQuestionCard
        entry={entry}
        request={activePage.request}
        question={activePage.question}
        draft={draft}
        navigator={navigator}
        onDraftChange={(nextDraft) =>
          setDrafts((current) => ({
            ...current,
            [serverRequestKey]: nextDraft,
          }))
        }
        onCommitAnswer={(nextDraft) => {
          const result = buildUserInputResponse(activePage.request, nextDraft);
          if (result.complete && onAnswerUserInput) {
            if (activePageIndex < pages.length - 1) {
              selectPage(activePageIndex + 1);
            }
            onAnswerUserInput(entry, activePage.request, result.response);
            return;
          }
          if (
            result.unansweredQuestionIds.includes(activePage.question.id)
          ) {
            return;
          }
          let nextQuestionIndex = pages.findIndex(
            (page, index) =>
              index > activePageIndex &&
              page.kind === "user-input" &&
              requestKey(page.request) === serverRequestKey &&
              result.unansweredQuestionIds.includes(page.question.id),
          );
          if (nextQuestionIndex < 0) {
            nextQuestionIndex = pages.findIndex(
              (page) =>
                page.kind === "user-input" &&
                requestKey(page.request) === serverRequestKey &&
                result.unansweredQuestionIds.includes(page.question.id),
            );
          }
          if (nextQuestionIndex >= 0) selectPage(nextQuestionIndex);
        }}
      />
    );
  } else {
    content = (
      <article className="approval" key={activePage.key}>
        <header className="approval-header">
          <div>
            <strong>Unsupported native Codex request</strong>
          </div>
          {navigator}
        </header>
        <pre>{JSON.stringify(activePage.request.params ?? {}, null, 2)}</pre>
        <p>Stop the turn to cancel this request safely.</p>
      </article>
    );
  }

  return (
    <div
      className="approval-stack chat-approval-stack"
      aria-label="Pending Codex interactions"
      ref={stackRef}
    >
      {content}
    </div>
  );
});

const ApprovalCard = memo(function ApprovalCard({
  request,
  itemResources,
  navigator,
  onResolveRequest,
}: {
  request: CodexApprovalRequest;
  itemResources: string[];
  navigator?: ReactNode;
  onResolveRequest: ApprovalResolutionHandler;
}) {
  const cardRef = useRef<HTMLElement>(null);
  const busy =
    request.status === "submitting" || request.status === "awaiting-resolution";
  const disabled = busy || request.status === "stale";
  const command = approvalCommand(request);
  const cwd = approvalString(request.params.cwd);
  const reason = approvalString(request.params.reason);
  const network = approvalRecord(request.params.networkApprovalContext);
  const permissionProfile =
    approvalRecord(request.params.additionalPermissions) ??
    approvalRecord(request.params.permissions);
  const fileSystemRequest =
    validateRequestedFileSystemPermissions(permissionProfile);
  const permissionPaths =
    fileSystemRequest.status === "valid"
      ? new Set(fileSystemRequest.entries.map((entry) => entry.path.path))
      : new Set<string>();
  const resources = approvalResources(request, itemResources).filter(
    (resource) => !permissionPaths.has(resource),
  );
  const browserRequest = request.browserRequest;
  const hasContext = Boolean(
    cwd || reason || network || browserRequest || resources.length > 0,
  );
  const statusLabel = approvalStatusLabel(request);

  useEffect(() => {
    if (request.status !== "pending") return;
    cardRef.current?.focus({ preventScroll: true });
  }, [request.key, request.status]);

  return (
    <article
      className={`approval native-approval approval-${request.status}`}
      ref={cardRef}
      tabIndex={-1}
      data-agent-notification-target="approval"
      data-agent-notification-id={request.key}
      aria-labelledby={`${request.key}-title`}
      aria-busy={busy}
    >
      <header className="approval-header">
        <ShieldAlert size={19} aria-hidden="true" />
        <div>
          <strong id={`${request.key}-title`}>
            {approvalTitle(request, fileSystemRequest)}
          </strong>
        </div>
        {navigator}
      </header>

      {command ? (
        <div className="approval-command">
          <span>Command</span>
          <pre className="approval-code-surface">{command}</pre>
        </div>
      ) : null}

      {fileSystemRequest.status === "valid" ? (
        <div className="approval-command approval-filesystem-permissions">
          <span>Requested filesystem access</span>
          <div className="approval-permission-list">
            {fileSystemRequest.entries.map((entry) => (
              <div
                className="approval-permission-entry"
                key={`${entry.access}:${entry.path.path}`}
              >
                <span className="approval-permission-access">
                  {approvalPermissionAccessLabel(entry.access)}
                </span>
                <pre className="approval-code-surface">{entry.path.path}</pre>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {request.error ? (
        <p className="approval-error" role="alert">
          {request.error}
        </p>
      ) : null}

      <div className="approval-decision-row">
        {hasContext ? (
          <dl className="approval-context">
            {cwd ? (
              <>
                <dt>Working directory</dt>
                <dd className="approval-context-code-row">
                  <pre className="approval-code-surface">{cwd}</pre>
                </dd>
              </>
            ) : null}
            {reason ? (
              <>
                <dt>Why approval is required</dt>
                <dd>{reason}</dd>
              </>
            ) : null}
            {network ? (
              <>
                <dt>Network access</dt>
                <dd>{approvalNetworkLabel(network)}</dd>
              </>
            ) : null}
            {browserRequest ? (
              <>
                <dt>Origin</dt>
                <dd className="approval-context-code-row">
                  <pre className="approval-code-surface">
                    {browserRequest.origin}
                  </pre>
                </dd>
                <dt>Browser action</dt>
                <dd>{browserRequest.action}</dd>
              </>
            ) : null}
            {resources.length > 0 ? (
              <>
                <dt>Affected resources</dt>
                <dd className="approval-context-code-row approval-resource-list">
                  {resources.map((resource) => (
                    <pre className="approval-code-surface" key={resource}>
                      {resource}
                    </pre>
                  ))}
                </dd>
              </>
            ) : null}
          </dl>
        ) : null}

        <div className="approval-actions" role="group" aria-label="Approval choices">
          {request.choices.map((choice, index) => {
            const descriptionId = `${request.key}-choice-${index}-description`;
            const description = `${choice.description}${
              choice.broadScope ? " This is broader than one operation." : ""
            }`;
            return (
              <button
                className={`approval-choice approval-choice-${choice.tone}`}
                type="button"
                key={choice.id}
                disabled={disabled}
                aria-label={choice.label}
                aria-describedby={descriptionId}
                data-tooltip={`${choice.label}: ${description}`}
                onClick={() => onResolveRequest(request, choice)}
              >
                <ApprovalChoiceIcon choice={choice} />
                <span className="sr-only" id={descriptionId}>
                  {description}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {statusLabel ? (
        <p className="approval-status" aria-live="polite">
          {statusLabel}
        </p>
      ) : null}
    </article>
  );
});

function ApprovalChoiceIcon({ choice }: { choice: ApprovalChoice }) {
  if (choice.id === "cancel" || choice.id === "abort") {
    return <X size={17} aria-hidden="true" />;
  }
  if (choice.tone === "danger") {
    return <Ban size={17} aria-hidden="true" />;
  }
  if (choice.broadScope) {
    return <ShieldCheck size={17} aria-hidden="true" />;
  }
  return <Check size={17} aria-hidden="true" />;
}

function approvalTitle(
  request: CodexApprovalRequest,
  fileSystemRequest: ReturnType<
    typeof validateRequestedFileSystemPermissions
  >,
) {
  if (
    fileSystemRequest.status === "valid" &&
    fileSystemRequest.entries.some((entry) => entry.access === "write")
  ) {
    return "Codex needs approval to write outside the workspace";
  }
  if (fileSystemRequest.status === "valid") {
    return "Codex needs approval to access files outside the workspace";
  }
  switch (request.kind) {
    case "command":
    case "legacy-command":
      return "Codex needs approval to run a command";
    case "file-change":
    case "legacy-file-change":
      return "Codex needs approval to change files";
    case "permissions":
      return "Codex is requesting additional permissions";
    case "browser":
      return request.browserRequest?.kind === "origin"
        ? "Codex needs approval to open an external website"
        : "Codex needs approval for a browser action";
    default:
      return "Unsupported native Codex request";
  }
}

function approvalStatusLabel(request: CodexApprovalRequest) {
  switch (request.status) {
    case "submitting":
      return "Submitting your decision to Codex…";
    case "awaiting-resolution":
      return "Decision submitted. Waiting for Codex to resolve the native request…";
    case "error":
      return "The decision was not submitted. Choose an available option to retry.";
    case "stale":
      return "This request is no longer connected to the native Codex operation.";
    default:
      return request.choices.length > 0
        ? null
        : "Codex remains blocked. Stop the turn to cancel this unsupported request safely.";
  }
}

function approvalCommand(request: CodexApprovalRequest) {
  const command = request.params.command;
  if (typeof command === "string") return command;
  if (Array.isArray(command) && command.every((item) => typeof item === "string")) {
    return command.join(" ");
  }
  return null;
}

function approvalResources(
  request: CodexApprovalRequest,
  itemResources: string[],
) {
  const resources: string[] = [...itemResources];
  const grantRoot = approvalString(request.params.grantRoot);
  if (grantRoot) resources.push(grantRoot);
  const fileChanges = approvalRecord(request.params.fileChanges);
  if (fileChanges) resources.push(...Object.keys(fileChanges));
  const changes = Array.isArray(request.params.changes) ? request.params.changes : [];
  for (const change of changes) {
    const record = approvalRecord(change);
    const path = approvalString(record?.path);
    if (path) resources.push(path);
  }
  const permissionProfile =
    approvalRecord(request.params.additionalPermissions) ??
    approvalRecord(request.params.permissions);
  const fileSystemRequest =
    validateRequestedFileSystemPermissions(permissionProfile);
  if (fileSystemRequest.status === "valid") {
    resources.push(
      ...fileSystemRequest.entries.map((entry) => entry.path.path),
    );
  }
  return Array.from(new Set(resources));
}

function approvalPermissionAccessLabel(
  access: "read" | "write" | "deny",
) {
  switch (access) {
    case "read":
      return "Read";
    case "write":
      return "Write";
    case "deny":
      return "Deny";
  }
}

function approvalNetworkLabel(network: Record<string, unknown>) {
  const host = approvalString(network.host) ?? "an external host";
  const protocol = approvalString(network.protocol);
  return protocol ? `${protocol}://${host}` : host;
}

function approvalString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function approvalRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function formatDuration(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}hr ${minutes}m ${seconds}s`;
  }

  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }

  return `${seconds}s`;
}

function formatTokenCount(runView: RunViewState) {
  return `${(
    runView.tokenUsage?.turnTokens ?? runView.tokenUsage?.totalTokens ?? 0
  ).toLocaleString()} tokens`;
}

function commandActionLabel(status: RunCommandActivity["status"]) {
  if (status === "failed") {
    return "Failed";
  }
  if (status === "declined") {
    return "Skipped";
  }
  if (status === "running") {
    return "Running";
  }
  if (status === "awaiting-approval") {
    return "Awaiting approval";
  }
  if (status === "pending") {
    return "Preparing";
  }
  return "Ran";
}
