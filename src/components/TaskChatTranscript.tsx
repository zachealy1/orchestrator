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
  Clock,
  FileText,
  MessageSquare,
  Pencil,
  Terminal,
  X,
} from "lucide-react";
import {
  memo,
  useCallback,
  useEffect,
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
import type {
  RunCommandActivity,
  RunEditedFile,
  RunViewState,
  StreamEvent,
} from "../lib/codexEventReducer";
import { contextFileExtensionLabel } from "../lib/contextFiles";
import {
  cacheTranscriptRowHeight,
  estimateTranscriptRowHeight,
  getCachedTranscriptRowHeight,
  getTranscriptWidthBucket,
} from "../lib/transcriptVirtualization";
import {
  ORCHESTRATOR_PROMPT_CONTEXT_MIME,
  type CodexMessage,
  type ComposerContextFile,
} from "../types";

const AUTO_SCROLL_BOTTOM_THRESHOLD_PX = 48;
const HISTORY_OLDER_TURNS_THRESHOLD_PX = 240;
const HISTORY_SCROLL_SETTLE_DELAY_MS = 120;
const TRANSCRIPT_SCROLL_IDLE_DELAY_MS = 120;
const TRANSCRIPT_OVERSCAN_ROWS = 6;
const EMPTY_CONTEXT_FILES: ComposerContextFile[] = [];

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
  runId: number | null;
  taskId: number | null;
  prompt: string;
  contextFiles?: ComposerContextFile[];
  submittedAt: string;
  status: RunViewState["status"];
  runView: RunViewState;
  historicalActivity?: {
    profileKey: "default";
    threadId: string;
    turnId: string;
    status: "available" | "loading" | "loaded" | "error";
    nextCursor: string | null;
    error: string | null;
  };
};

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
  onResolveRequest: (request: CodexMessage, approved: boolean) => void;
  onOpenFileLink?: (href: string) => boolean;
  editablePromptEntryId?: string | null;
  onEditPrompt?: (entry: TaskChatEntry, prompt: string) => void;
  historyOpenRequest?: TranscriptHistoryOpenRequest | null;
  onHistoryPositionSettled?: (requestId: number) => void;
  hasOlderTurns?: boolean;
  olderTurnsStatus?: "idle" | "loading" | "error";
  olderTurnsError?: string | null;
  onLoadOlderTurns?: () => void;
  onLoadHistoricalActivity?: (entry: TaskChatEntry) => void;
  onScrollActivityChange?: (active: boolean) => void;
};

export function TaskChatTranscript({
  entries,
  onResolveRequest,
  onOpenFileLink,
  editablePromptEntryId = null,
  onEditPrompt,
  historyOpenRequest = null,
  onHistoryPositionSettled,
  hasOlderTurns = false,
  olderTurnsStatus = "idle",
  olderTurnsError = null,
  onLoadOlderTurns,
  onLoadHistoricalActivity,
  onScrollActivityChange,
}: Props) {
  const callbacksRef = useRef({
    onResolveRequest,
    onOpenFileLink,
    onEditPrompt,
    onHistoryPositionSettled,
    onLoadOlderTurns,
    onLoadHistoricalActivity,
    onScrollActivityChange,
  });
  callbacksRef.current = {
    onResolveRequest,
    onOpenFileLink,
    onEditPrompt,
    onHistoryPositionSettled,
    onLoadOlderTurns,
    onLoadHistoricalActivity,
    onScrollActivityChange,
  };

  const stableResolveRequest = useCallback(
    (request: CodexMessage, approved: boolean) =>
      callbacksRef.current.onResolveRequest(request, approved),
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
  const stableLoadOlderTurns = useCallback(
    () => callbacksRef.current.onLoadOlderTurns?.(),
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
      onOpenFileLink={onOpenFileLink ? stableOpenFileLink : undefined}
      editablePromptEntryId={editablePromptEntryId}
      onEditPrompt={onEditPrompt ? stableEditPrompt : undefined}
      historyOpenRequest={historyOpenRequest}
      onHistoryPositionSettled={
        onHistoryPositionSettled ? stableHistoryPositionSettled : undefined
      }
      hasOlderTurns={hasOlderTurns}
      olderTurnsStatus={olderTurnsStatus}
      olderTurnsError={olderTurnsError}
      onLoadOlderTurns={onLoadOlderTurns ? stableLoadOlderTurns : undefined}
      onLoadHistoricalActivity={
        onLoadHistoricalActivity ? stableLoadHistoricalActivity : undefined
      }
      onScrollActivityChange={
        onScrollActivityChange ? stableScrollActivityChange : undefined
      }
    />
  );
}

const VirtualizedTaskChatTranscript = memo(function VirtualizedTaskChatTranscript({
  entries,
  onResolveRequest,
  onOpenFileLink,
  editablePromptEntryId = null,
  onEditPrompt,
  historyOpenRequest = null,
  onHistoryPositionSettled,
  hasOlderTurns = false,
  olderTurnsStatus = "idle",
  olderTurnsError = null,
  onLoadOlderTurns,
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
  const previousEntriesRef = useRef({
    count: 0,
    lastId: null as string | null,
    totalSize: 0,
    entries: entries as TaskChatEntry[],
  });
  const olderRequestPendingRef = useRef(false);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [editingPrompt, setEditingPrompt] = useState("");

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
      const chatEntry = entries[index];
      if (!chatEntry) {
        return measuredHeight;
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
    [entries],
  );

  const rowVirtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => transcriptRef.current,
    scrollToFn: scrollTranscriptElement,
    estimateSize: (index) => {
      const entry = entries[index];
      return entry
        ? estimateTranscriptRowHeight(
            entry,
            stableTranscriptWidthRef.current,
          )
        : 180;
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
      (index: number) => entries[index]?.clientId ?? index,
      [entries],
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
      : buildFallbackTranscriptRows(entries);
  const totalSize = rowVirtualizer.getTotalSize();

  const requestOlderTurns = useCallback((retry = false) => {
    if (
      !hasOlderTurns ||
      olderRequestPendingRef.current ||
      (!retry && olderTurnsStatus !== "idle") ||
      (retry && olderTurnsStatus === "loading") ||
      !onLoadOlderTurns
    ) {
      return;
    }

    olderRequestPendingRef.current = true;
    onLoadOlderTurns();
  }, [hasOlderTurns, olderTurnsStatus, onLoadOlderTurns]);

  const handleScrollIdle = useCallback(
    (transcript: HTMLElement) => {
      if (transcript.scrollTop <= HISTORY_OLDER_TURNS_THRESHOLD_PX) {
        requestOlderTurns();
      }
    },
    [requestOlderTurns],
  );

  const scrollController = useTranscriptScrollController({
    transcriptRef,
    rowVirtualizer,
    entryCount: entries.length,
    historyOpenRequest,
    onHistoryPositionSettled,
    onScrollActivityChange,
    onScrollIdle: handleScrollIdle,
  });
  geometryChangeHandlerRef.current = scrollController.handleGeometryChange;

  useEffect(() => {
    if (olderTurnsStatus !== "loading") {
      olderRequestPendingRef.current = false;
    }
  }, [entries.length, olderTurnsStatus]);

  useLayoutEffect(() => {
    const previous = previousEntriesRef.current;
    const lastId = entries[entries.length - 1]?.clientId ?? null;
    const entryCountIncreased = entries.length > previous.count;
    const appended = entryCountIncreased && lastId !== previous.lastId;
    const initialLoad = previous.count === 0 && entries.length > 0;
    const entriesChanged = previous.entries !== entries;
    const totalSizeChanged = previous.totalSize !== totalSize;
    previousEntriesRef.current = {
      count: entries.length,
      lastId,
      totalSize,
      entries,
    };

    if (initialLoad || appended || entriesChanged || totalSizeChanged) {
      scrollController.handleEntriesChanged({ initialLoad, appended });
    }
  }, [
    entries,
    scrollController,
    totalSize,
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
            const index = entries.findIndex((entry) => entry.clientId === clientId);
            const entry = entries[index];
            if (!entry || index < 0) {
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
  }, [entries, rowVirtualizer, scrollController]);

  useEffect(
    () => () => {
      if (transcriptWidthSettleTimeoutRef.current !== null) {
        window.clearTimeout(transcriptWidthSettleTimeoutRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    if (!hasOlderTurns || olderTurnsStatus !== "idle") {
      return;
    }
    const frame = scheduleAnimationFrame(() => {
      const transcript = transcriptRef.current;
      if (
        transcript &&
        transcript.scrollTop <= HISTORY_OLDER_TURNS_THRESHOLD_PX &&
        transcript.scrollHeight <= transcript.clientHeight + 1 &&
        !scrollController.isUserScrolling()
      ) {
        requestOlderTurns();
      }
    });
    return () => cancelScheduledAnimationFrame(frame);
  }, [hasOlderTurns, olderTurnsStatus, requestOlderTurns, scrollController]);

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
          scrollController.registerUserScrollIntent();
        }
      }}
      onPointerDownCapture={(event) => {
        const bounds = event.currentTarget.getBoundingClientRect();
        if (event.clientX >= bounds.right - 20) {
          scrollController.registerUserScrollIntent();
        }
      }}
      onScroll={(event) => scrollController.handleScroll(event.currentTarget)}
      onTouchStartCapture={scrollController.registerUserScrollIntent}
      onTouchMoveCapture={scrollController.registerUserScrollIntent}
      onWheelCapture={scrollController.registerUserScrollIntent}
    >
      {olderTurnsStatus === "loading" ? (
        <div className="history-older-turns-status" role="status">
          Loading older messages...
        </div>
      ) : olderTurnsStatus === "error" ? (
        <div className="history-older-turns-status error" role="alert">
          <span>{olderTurnsError ?? "Older messages could not be loaded."}</span>
          <button type="button" onClick={() => requestOlderTurns(true)}>
            Retry
          </button>
        </div>
      ) : null}
      <div
        className="task-chat-virtual-spacer"
        ref={rowVirtualizer.containerRef}
      >
        {renderedRows.map((virtualItem) => {
          const entry = entries[virtualItem.index];
          if (!entry) {
            return null;
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

function buildFallbackTranscriptRows(entries: TaskChatEntry[]) {
  const visibleCount = Math.min(entries.length, TRANSCRIPT_OVERSCAN_ROWS * 2 + 1);
  const startIndex = Math.max(0, entries.length - visibleCount);
  const width = 1_024;
  let start = entries
    .slice(0, startIndex)
    .reduce(
      (total, entry) => total + estimateTranscriptRowHeight(entry, width),
      0,
    );

  return Array.from({ length: visibleCount }, (_, offset) => {
    const index = startIndex + offset;
    const row = {
      key: `transcript-fallback-${index}`,
      index,
      start,
    };
    start += estimateTranscriptRowHeight(entries[index], width);
    return row;
  });
}

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

const TaskChatTurn = memo(function TaskChatTurn({
  entry,
  editable,
  editing,
  editingPrompt,
  onEditingPromptChange,
  onSubmitEdit,
  onCancelEdit,
  onStartEdit,
  onResolveRequest,
  onOpenFileLink,
  onLoadHistoricalActivity,
}: {
  entry: TaskChatEntry;
  editable: boolean;
  editing: boolean;
  editingPrompt: string;
  onEditingPromptChange: (prompt: string) => void;
  onSubmitEdit: (entry: TaskChatEntry, prompt: string) => void;
  onCancelEdit: () => void;
  onStartEdit: (entry: TaskChatEntry) => void;
  onResolveRequest: (request: CodexMessage, approved: boolean) => void;
  onOpenFileLink?: (href: string) => boolean;
  onLoadHistoricalActivity?: (entry: TaskChatEntry) => void;
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
          onOpenFileLink={onOpenFileLink}
          onLoadHistoricalActivity={onLoadHistoricalActivity}
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

  if (inlineFiles.length === 0) {
    return <>{prompt}</>;
  }

  return (
    <>
      {buildSubmittedPromptSegments(prompt, inlineFiles).map((segment, index) => {
        if (segment.kind === "text") {
          return <span key={`text-${index}`}>{segment.text}</span>;
        }

        return (
          <a
            className="submitted-inline-file"
            href={segment.file.path}
            key={`${segment.file.path}-${index}`}
            title={`Preview ${segment.file.path}`}
            onClick={(event: ReactMouseEvent<HTMLAnchorElement>) => {
              if (onOpenFileLink?.(segment.file.path)) {
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
  onOpenFileLink,
  onLoadHistoricalActivity,
}: {
  entry: TaskChatEntry;
  runView: RunViewState;
  onResolveRequest: (request: CodexMessage, approved: boolean) => void;
  onOpenFileLink?: (href: string) => boolean;
  onLoadHistoricalActivity?: (entry: TaskChatEntry) => void;
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
        <RunSummary runView={runView} onOpenFileLink={onOpenFileLink} />
        <RunApprovalRequests
          runView={runView}
          onResolveRequest={onResolveRequest}
        />
      </div>
    );
  }

  const hasTimeline =
    runView.streamEvents.length > 0 ||
    runView.editedFiles.length > 0 ||
    runView.commands.length > 0;

  return (
    <div className="run-output-surface running" aria-label="Live run output">
      <RunMetrics runView={runView} />
      {hasTimeline ? (
        <RunTimeline runView={runView} />
      ) : runView.status === "connecting" ? (
        <PreparingRunStatus />
      ) : (
        <p className="stream-placeholder">
          <Clock size={15} aria-hidden="true" />
          Waiting for app-server output...
        </p>
      )}
      <RunApprovalRequests runView={runView} onResolveRequest={onResolveRequest} />
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

function RunTraceDropdown({
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
}

function RunMetrics({ runView }: { runView: RunViewState }) {
  return (
    <div className="run-live-metrics" aria-label="Run metrics">
      <span>
        <Clock size={15} aria-hidden="true" />
        {formatDuration(runView.elapsedMs)}
      </span>
      <span>{formatTokenCount(runView)}</span>
    </div>
  );
}

const RunSummary = memo(function RunSummary({
  runView,
  onOpenFileLink,
}: {
  runView: RunViewState;
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

  return (
    <div className="run-summary markdown-summary" aria-label="Run summary">
      <ReactMarkdown components={markdownComponents}>
        {runView.finalMessage}
      </ReactMarkdown>
    </div>
  );
});

function isPreviewableSummaryLink(href: string) {
  const value = href.trim();
  if (!value || value.startsWith("#")) {
    return false;
  }

  if (value.startsWith("/") || value.startsWith("./") || value.startsWith("../")) {
    return true;
  }

  try {
    const url = new URL(value);
    return (
      url.protocol === "file:" ||
      ((url.protocol === "http:" || url.protocol === "https:") &&
        (url.hostname === "localhost" ||
          url.hostname === "127.0.0.1" ||
          url.hostname === "::1"))
    );
  } catch {
    return !/^[a-z][a-z\d+.-]*:/i.test(value);
  }
}

function buildSubmittedPromptSegments(
  prompt: string,
  files: ComposerContextFile[],
) {
  const candidates = buildInlineFileTokenCandidates(files);
  const segments: Array<
    | { kind: "text"; text: string }
    | { kind: "file"; file: ComposerContextFile }
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

    segments.push({ kind: "file", file: match.file });
    cursor += match.token.length;
  }

  return segments;
}

function buildInlineFileTokenCandidates(files: ComposerContextFile[]) {
  return files
    .filter((file) => file.name.trim().length > 0)
    .flatMap((file) => [
      { file, token: `${contextFileExtensionLabel(file.name)} ${file.name}` },
      { file, token: file.name },
    ])
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

function RunTimeline({ runView }: { runView: RunViewState }) {
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
}

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

function EditedFilesGroup({ files }: { files: RunEditedFile[] }) {
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
}

function CommandsGroup({ commands }: { commands: RunCommandActivity[] }) {
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
}

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

function RunApprovalRequests({
  runView,
  onResolveRequest,
}: {
  runView: RunViewState;
  onResolveRequest: (request: CodexMessage, approved: boolean) => void;
}) {
  if (runView.serverRequests.length === 0) {
    return null;
  }

  return (
    <div className="approval-stack chat-approval-stack">
      {runView.serverRequests.map((request) => (
        <article className="approval" key={String(request.id)}>
          <div>
            <strong>{request.method}</strong>
            <pre>{JSON.stringify(request.params ?? {}, null, 2)}</pre>
          </div>
          <div className="approval-actions">
            <button
              className="small"
              type="button"
              onClick={() => onResolveRequest(request, true)}
            >
              <Check size={15} />
              Approve
            </button>
            <button
              className="small danger"
              type="button"
              onClick={() => onResolveRequest(request, false)}
            >
              <X size={15} />
              Deny
            </button>
          </div>
        </article>
      ))}
    </div>
  );
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
  if (status === "running") {
    return "Running";
  }
  return "Ran";
}
