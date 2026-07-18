import {
  measureElement as measureVirtualElement,
  useVirtualizer,
  type VirtualItem,
  type Virtualizer,
} from "@tanstack/react-virtual";
import {
  Activity,
  BrainCircuit,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Clock,
  FileText,
  MessageSquare,
  Pencil,
  RefreshCw,
  ShieldAlert,
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
import type {
  ApprovalResolutionHandler,
  CodexApprovalRequest,
} from "../lib/codexApprovals";
import {
  isNativeUserInputRequest,
  requestKey,
  type NativeUserInputRequest,
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
  type ComposerContextFile,
  type HistoryPageLoadState,
  type HistoryPageDescriptor,
  type HistoryTranscriptIndex,
  type HistoryTurnHint,
  type PreparedHistoricalSummary,
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
  previewIsPlainText: boolean;
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

function markdownNodePlainText(node: PositionedMarkdownNode): string {
  if (typeof node.value === "string") return node.value;
  return (node.children ?? [])
    .map(markdownNodePlainText)
    .filter(Boolean)
    .join(" ");
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
      return { isLong: false, previewIsPlainText: false, previewText: text };
    }

    const selected = content.slice(0, PLAN_PREVIEW_BLOCK_LIMIT);
    const boundary = selected.reduce(
      (furthest, node) => Math.max(furthest, markdownNodeEndOffset(node)),
      0,
    );
    if (boundary > PLAN_PREVIEW_CHARACTER_LIMIT) {
      const plainText = selected
        .map(markdownNodePlainText)
        .filter(Boolean)
        .join("\n\n")
        .trim();
      return {
        isLong: true,
        previewIsPlainText: true,
        previewText: `${plainText.slice(0, PLAN_PREVIEW_CHARACTER_LIMIT).trimEnd()}…`,
      };
    }
    const definitionText = definitions
      .filter((node) => (node.position?.start.offset ?? 0) >= boundary)
      .map((node) => markdownNodeSource(text, node))
      .filter(Boolean)
      .join("\n\n");
    const preview = text.slice(0, boundary || text.length).trimEnd();
    return {
      isLong: true,
      previewIsPlainText: false,
      previewText: definitionText
        ? `${preview}\n\n${definitionText}`
        : preview,
    };
  } catch {
    return {
      isLong: text.length > PLAN_PREVIEW_CHARACTER_LIMIT || lineCount > PLAN_PREVIEW_LINE_LIMIT,
      previewIsPlainText: false,
      previewText: text,
    };
  }
}

export function nativePlanDisclosureKey(entry: TaskChatEntry) {
  const plan = entry.runView.nativePlan;
  return [
    entry.clientId,
    plan.planItemId ?? "plan",
    plan.completedTurnId ?? "draft",
  ].join(":");
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
  onRevisePlan?: (entry: TaskChatEntry, revision: string) => void;
  onCancelPlan?: (entry: TaskChatEntry) => void;
  onOpenFileLink?: (href: string) => boolean;
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
  onLoadHistoricalActivity,
  planExpanded,
  onPlanDisclosureChange,
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
  onLoadHistoricalActivity?: (entry: TaskChatEntry) => void;
  planExpanded?: boolean;
  onPlanDisclosureChange?: NativePlanDisclosureChangeHandler;
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
      <article className={`chat-message assistant-message status-${entry.status}`}>
        <AssistantRunOutput
          entry={entry}
          runView={entry.runView}
          onResolveRequest={onResolveRequest}
          onAnswerUserInput={onAnswerUserInput}
          onImplementPlan={onImplementPlan}
          onRevisePlan={onRevisePlan}
          onCancelPlan={onCancelPlan}
          onOpenFileLink={onOpenFileLink}
          onLoadHistoricalActivity={onLoadHistoricalActivity}
          planExpanded={planExpanded}
          onPlanDisclosureChange={onPlanDisclosureChange}
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
  onLoadHistoricalActivity,
  planExpanded,
  onPlanDisclosureChange,
}: {
  entry: TaskChatEntry;
  runView: RunViewState;
  onResolveRequest: ApprovalResolutionHandler;
  onAnswerUserInput?: Props["onAnswerUserInput"];
  onImplementPlan?: Props["onImplementPlan"];
  onRevisePlan?: Props["onRevisePlan"];
  onCancelPlan?: Props["onCancelPlan"];
  onOpenFileLink?: (href: string) => boolean;
  onLoadHistoricalActivity?: (entry: TaskChatEntry) => void;
  planExpanded?: boolean;
  onPlanDisclosureChange?: NativePlanDisclosureChangeHandler;
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
        <RunApprovalRequests
          entry={entry}
          runView={runView}
          onResolveRequest={onResolveRequest}
          onAnswerUserInput={onAnswerUserInput}
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
      <NativePlanCard
        entry={entry}
        onImplementPlan={onImplementPlan}
        onRevisePlan={onRevisePlan}
        onCancelPlan={onCancelPlan}
        expanded={planExpanded}
        onDisclosureChange={onPlanDisclosureChange}
      />
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
      <RunApprovalRequests
        entry={entry}
        runView={runView}
        onResolveRequest={onResolveRequest}
        onAnswerUserInput={onAnswerUserInput}
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
        if (item.kind === "files") {
          return (
            <RunActivityGroups key={item.id}>
              <EditedFilesGroup files={item.files} />
            </RunActivityGroups>
          );
        }

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
  | { kind: "files"; id: string; files: RunEditedFile[] }
  | { kind: "commands"; id: string; commands: RunCommandActivity[] };

function buildTimelineItems(runView: RunViewState): TimelineItem[] {
  const items: TimelineItem[] = [];
  const renderedFilePaths = new Set<string>();
  const renderedCommandIds = new Set<string>();

  for (const event of runView.streamEvents) {
    if (shouldHideCompletedFinalMessageEvent(runView, event)) {
      continue;
    }

    if (event.kind === "file") {
      const files = selectFilesForEvent(
        runView.editedFiles,
        event.activityIds,
        renderedFilePaths,
      );

      if (files.length > 0) {
        items.push({ kind: "files", id: `files-${event.id}`, files });
        files.forEach((file) => renderedFilePaths.add(file.path));
      } else if (runView.editedFiles.length === 0) {
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

  const remainingFiles = runView.editedFiles.filter(
    (file) => !renderedFilePaths.has(file.path),
  );
  if (remainingFiles.length > 0) {
    items.push({ kind: "files", id: "files-remaining", files: remainingFiles });
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

function selectFilesForEvent(
  files: RunEditedFile[],
  activityIds: string[] | undefined,
  renderedFilePaths: Set<string>,
) {
  if (files.length === 0) {
    return [];
  }

  if (!activityIds || activityIds.length === 0) {
    return renderedFilePaths.size === 0 ? files : [];
  }

  const activityIdSet = new Set(activityIds);
  return files.filter(
    (file) => activityIdSet.has(file.path) && !renderedFilePaths.has(file.path),
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

const EditedFilesGroup = memo(function EditedFilesGroup({
  files,
}: {
  files: RunEditedFile[];
}) {
  return (
    <details className="run-activity-group edited-files">
      <summary>
        <span className="run-activity-title">
          <Pencil size={15} aria-hidden="true" />
          Edited {files.length} {files.length === 1 ? "file" : "files"}
        </span>
        <ChevronDown size={15} aria-hidden="true" />
      </summary>
      <div className="run-activity-items">
        {files.map((file) => (
          <div className="run-activity-item edited-file-row" key={file.path}>
            <span>{fileActionLabel(file.status)}</span>
            <span className="activity-file-name" title={file.path}>
              {file.name}
            </span>
            <span className="activity-additions">+{file.additions}</span>
            <span className="activity-deletions">-{file.deletions}</span>
          </div>
        ))}
      </div>
    </details>
  );
});

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
  if (!text) {
    return null;
  }

  const locallyExpanded =
    localDisclosure.planKey === planKey && localDisclosure.expanded;
  const isExpanded = preview.isLong && (expanded ?? locallyExpanded);
  const renderedText = isExpanded ? text : preview.previewText;

  const canReview = plan.reviewState === "available";
  const busy = plan.reviewState === "submitting";
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
          : "Drafting";
  return (
    <section
      className="native-plan-card"
      aria-label="Codex plan"
      ref={cardRef}
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
        {!isExpanded && preview.previewIsPlainText ? (
          <p>{renderedText}</p>
        ) : (
          <NativePlanMarkdown text={renderedText} />
        )}
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
        <div className="native-plan-actions">
          <button
            type="button"
            className="small"
            disabled={busy || !onImplementPlan}
            onClick={() => onImplementPlan?.(entry)}
          >
            <Check size={15} aria-hidden="true" />
            Implement plan
          </button>
          <button
            type="button"
            className="small"
            disabled={busy || !onRevisePlan}
            onClick={() => setRevising(true)}
          >
            <Pencil size={15} aria-hidden="true" />
            Revise
          </button>
          <button
            type="button"
            className="small danger"
            disabled={busy || !onCancelPlan}
            onClick={() => onCancelPlan?.(entry)}
          >
            <X size={15} aria-hidden="true" />
            Cancel
          </button>
        </div>
      ) : null}
      {canReview && revising ? (
        <form
          className="native-plan-revision"
          onSubmit={(event) => {
            event.preventDefault();
            const value = revision.trim();
            if (value) onRevisePlan?.(entry, value);
          }}
        >
          <label htmlFor={`plan-revision-${entry.clientId}`}>What should change?</label>
          <textarea
            id={`plan-revision-${entry.clientId}`}
            value={revision}
            onChange={(event) => setRevision(event.target.value)}
            autoFocus
          />
          <div className="native-plan-actions">
            <button type="submit" className="small" disabled={!revision.trim() || busy}>
              Send revision
            </button>
            <button type="button" className="small" onClick={() => setRevising(false)}>
              Back
            </button>
          </div>
        </form>
      ) : null}
    </section>
  );
});

const UserInputRequestCard = memo(function UserInputRequestCard({
  entry,
  request,
  onAnswerUserInput,
}: {
  entry: TaskChatEntry;
  request: NativeUserInputRequest;
  onAnswerUserInput?: Props["onAnswerUserInput"];
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [otherValues, setOtherValues] = useState<Record<string, string>>({});
  const state = entry.runView.nativePlan.requestStates[requestKey(request)];
  const busy = state === "submitting";

  return (
    <form
      className="approval native-user-input"
      onSubmit={(event) => {
        event.preventDefault();
        const answers: UserInputResponse["answers"] = {};
        request.params.questions.forEach((question) => {
          const selected = values[question.id] ?? "";
          const primary = selected === "__other__"
            ? otherValues[question.id]?.trim() ?? ""
            : selected.trim();
          const note = notes[question.id]?.trim() ?? "";
          answers[question.id] = {
            answers: [primary, note].filter(Boolean),
          };
        });
        onAnswerUserInput?.(entry, request, { answers });
      }}
    >
      <div className="native-user-input-heading">
        <strong>Codex needs your input</strong>
        {request.params.autoResolutionMs ? (
          <span>Auto-continues if unanswered</span>
        ) : null}
      </div>
      {request.params.questions.map((question) => {
        const selected = values[question.id] ?? "";
        return (
          <fieldset key={question.id} disabled={busy}>
            <legend>{question.header}</legend>
            <p>{question.question}</p>
            {question.options ? (
              <div className="native-user-input-options">
                {question.options.map((option) => (
                  <label key={option.label}>
                    <input
                      type="radio"
                      name={`${request.id}-${question.id}`}
                      value={option.label}
                      checked={selected === option.label}
                      onChange={(event) =>
                        setValues((current) => ({
                          ...current,
                          [question.id]: event.target.value,
                        }))
                      }
                    />
                    <span>
                      <strong>{option.label}</strong>
                      <small>{option.description}</small>
                    </span>
                  </label>
                ))}
                {question.isOther ? (
                  <label>
                    <input
                      type="radio"
                      name={`${request.id}-${question.id}`}
                      value="__other__"
                      checked={selected === "__other__"}
                      onChange={(event) =>
                        setValues((current) => ({
                          ...current,
                          [question.id]: event.target.value,
                        }))
                      }
                    />
                    <span><strong>None of the above</strong></span>
                  </label>
                ) : null}
              </div>
            ) : (
              <input
                type={question.isSecret ? "password" : "text"}
                aria-label={question.header}
                value={selected}
                onChange={(event) =>
                  setValues((current) => ({
                    ...current,
                    [question.id]: event.target.value,
                  }))
                }
              />
            )}
            {selected === "__other__" ? (
              <input
                type={question.isSecret ? "password" : "text"}
                aria-label={`${question.header} other answer`}
                placeholder="Enter another answer"
                value={otherValues[question.id] ?? ""}
                onChange={(event) =>
                  setOtherValues((current) => ({
                    ...current,
                    [question.id]: event.target.value,
                  }))
                }
              />
            ) : null}
            <input
              type="text"
              aria-label={`${question.header} note`}
              placeholder="Add a note (optional)"
              value={notes[question.id] ?? ""}
              onChange={(event) =>
                setNotes((current) => ({
                  ...current,
                  [question.id]: event.target.value,
                }))
              }
            />
          </fieldset>
        );
      })}
      {state === "failed" ? <p className="native-user-input-error">Could not send that answer. Try again.</p> : null}
      <div className="approval-actions">
        <button className="small" type="submit" disabled={busy || !onAnswerUserInput}>
          <Check size={15} aria-hidden="true" />
          {busy ? "Sending…" : "Continue"}
        </button>
      </div>
    </form>
  );
});

const RunApprovalRequests = memo(function RunApprovalRequests({
  entry,
  runView,
  onResolveRequest,
  onAnswerUserInput,
}: {
  entry: TaskChatEntry;
  runView: RunViewState;
  onResolveRequest: ApprovalResolutionHandler;
  onAnswerUserInput?: Props["onAnswerUserInput"];
}) {
  if (runView.approvalRequests.length === 0 && runView.serverRequests.length === 0) {
    return null;
  }

  return (
    <div className="approval-stack chat-approval-stack" aria-label="Pending Codex approvals">
      {runView.approvalRequests.map((request) => (
        <ApprovalCard
          key={request.key}
          request={request}
          itemResources={
            request.itemId
              ? (runView.approvalResourcesByItemId[request.itemId] ?? [])
              : []
          }
          onResolveRequest={onResolveRequest}
        />
      ))}
      {runView.serverRequests.map((request) =>
        isNativeUserInputRequest(request) ? (
          <UserInputRequestCard
            entry={entry}
            request={request}
            onAnswerUserInput={onAnswerUserInput}
            key={String(request.id)}
          />
        ) : (
          <article className="approval" key={String(request.id)}>
            <div>
              <strong>Unsupported native Codex request</strong>
              <pre>{JSON.stringify(request.params ?? {}, null, 2)}</pre>
            </div>
            <p>Stop the turn to cancel this request safely.</p>
          </article>
        ),
      )}
    </div>
  );
});

const ApprovalCard = memo(function ApprovalCard({
  request,
  itemResources,
  onResolveRequest,
}: {
  request: CodexApprovalRequest;
  itemResources: string[];
  onResolveRequest: ApprovalResolutionHandler;
}) {
  const cardRef = useRef<HTMLElement>(null);
  const busy =
    request.status === "submitting" || request.status === "awaiting-resolution";
  const disabled = busy || request.status === "stale";
  const command = approvalCommand(request);
  const cwd = approvalString(request.params.cwd);
  const reason = approvalString(request.params.reason);
  const environmentId = approvalString(request.params.environmentId);
  const network = approvalRecord(request.params.networkApprovalContext);
  const permissions =
    approvalRecord(request.params.additionalPermissions) ??
    approvalRecord(request.params.permissions);
  const resources = approvalResources(request, itemResources);

  useEffect(() => {
    if (request.status !== "pending") return;
    cardRef.current?.focus({ preventScroll: true });
  }, [request.key, request.status]);

  return (
    <article
      className={`approval native-approval approval-${request.status}`}
      ref={cardRef}
      tabIndex={-1}
      aria-labelledby={`${request.key}-title`}
      aria-busy={busy}
    >
      <header className="approval-header">
        <ShieldAlert size={19} aria-hidden="true" />
        <div>
          <strong id={`${request.key}-title`}>{approvalTitle(request)}</strong>
          <span>{interactionModeLabel(request.interactionMode)}</span>
        </div>
      </header>

      {command ? (
        <div className="approval-command">
          <span>Command</span>
          <pre>{command}</pre>
        </div>
      ) : null}

      <dl className="approval-context">
        {cwd ? (
          <>
            <dt>Working directory</dt>
            <dd>{cwd}</dd>
          </>
        ) : null}
        {environmentId ? (
          <>
            <dt>Environment</dt>
            <dd>{environmentId}</dd>
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
        {resources.length > 0 ? (
          <>
            <dt>Affected resources</dt>
            <dd>{resources.join(", ")}</dd>
          </>
        ) : null}
      </dl>

      {permissions ? (
        <details className="approval-permissions" open>
          <summary>Requested permission scope</summary>
          <pre>{JSON.stringify(permissions, null, 2)}</pre>
        </details>
      ) : null}

      {request.error ? (
        <p className="approval-error" role="alert">
          {request.error}
        </p>
      ) : null}

      <div className="approval-actions" role="group" aria-label="Approval choices">
        {request.choices.map((choice, index) => {
          const descriptionId = `${request.key}-choice-${index}-description`;
          return (
            <button
              className={`approval-choice approval-choice-${choice.tone}`}
              type="button"
              key={choice.id}
              disabled={disabled}
              aria-describedby={descriptionId}
              onClick={() => onResolveRequest(request, choice)}
            >
              <span>{choice.label}</span>
              <small id={descriptionId}>
                {choice.description}
                {choice.broadScope ? " This is broader than one operation." : ""}
              </small>
            </button>
          );
        })}
      </div>

      <p className="approval-status" aria-live="polite">
        {approvalStatusLabel(request)}
      </p>
    </article>
  );
});

function approvalTitle(request: CodexApprovalRequest) {
  switch (request.kind) {
    case "command":
    case "legacy-command":
      return "Codex needs approval to run a command";
    case "file-change":
    case "legacy-file-change":
      return "Codex needs approval to change files";
    case "permissions":
      return "Codex is requesting additional permissions";
    default:
      return "Unsupported native Codex request";
  }
}

function interactionModeLabel(mode: CodexApprovalRequest["interactionMode"]) {
  switch (mode) {
    case "plan":
      return "Plan Mode";
    case "goal":
      return "Goal Mode";
    case "goal-plan":
      return "Goal and Plan Mode";
    default:
      return "Normal chat";
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
        ? "Codex is blocked until you choose one of the native options."
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
  return Array.from(new Set(resources));
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
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }

  return `${seconds}s`;
}

function formatTokenCount(runView: RunViewState) {
  return `${(runView.tokenUsage?.totalTokens ?? 0).toLocaleString()} tokens`;
}

function fileActionLabel(status: RunEditedFile["status"]) {
  switch (status) {
    case "added":
      return "Added";
    case "deleted":
      return "Deleted";
    case "renamed":
      return "Renamed";
    case "copied":
      return "Copied";
    default:
      return "Edited";
  }
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
