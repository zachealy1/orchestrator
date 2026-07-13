import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Virtuoso,
  type ListItem,
  type ListRange,
  type StateSnapshot,
  type VirtuosoHandle,
} from "react-virtuoso";
import type { CodexMessage, HistoricalChatOpenRequest } from "../types";
import {
  cacheTranscriptRowHeight,
  calculateTranscriptDefaultItemHeight,
  estimateTranscriptRowHeight,
  getTranscriptWidthBucket,
} from "../lib/transcriptVirtualization";
import {
  TaskChatTurn,
  type TaskChatEntry,
} from "./TaskChatTranscript";

const TRANSCRIPT_STATE_CACHE_LIMIT = 5;
export const TRANSCRIPT_RENDER_AHEAD_PX = 3_200;
export const TRANSCRIPT_MIN_OVERSCAN_ITEMS = 10;
export const TRANSCRIPT_SCROLL_IDLE_MS = 160;
export const LATEST_TURN_POSITION_RETRY_MS = 80;
export const LATEST_TURN_POSITION_MAX_ATTEMPTS = 6;

const transcriptIncreaseViewportBy = {
  top: TRANSCRIPT_RENDER_AHEAD_PX,
  bottom: TRANSCRIPT_RENDER_AHEAD_PX,
} as const;

type TranscriptViewportMode =
  | "opening"
  | "manual-scrolling"
  | "live-following"
  | "settling";

type PendingTranscriptMeasurement = {
  entry: TaskChatEntry;
  height: number;
};

type StableDefaultItemHeight = {
  key: string;
  height: number;
};

type StableHeightEstimates = {
  key: string;
  heights: number[];
};

type CachedTranscriptState = {
  snapshot: StateSnapshot;
  entryCount: number;
};

const transcriptStateCache = new Map<string, CachedTranscriptState>();

function readCachedTranscriptState(key: string, entryCount: number) {
  const cached = transcriptStateCache.get(key);
  if (!cached || cached.entryCount !== entryCount) {
    return undefined;
  }
  transcriptStateCache.delete(key);
  transcriptStateCache.set(key, cached);
  return cached.snapshot;
}

function writeCachedTranscriptState(
  key: string,
  entryCount: number,
  snapshot: StateSnapshot,
) {
  transcriptStateCache.delete(key);
  transcriptStateCache.set(key, { entryCount, snapshot });
  while (transcriptStateCache.size > TRANSCRIPT_STATE_CACHE_LIMIT) {
    const oldest = transcriptStateCache.keys().next().value;
    if (typeof oldest !== "string") break;
    transcriptStateCache.delete(oldest);
  }
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

function isEditableScrollTarget(target: EventTarget | null) {
  return (
    target instanceof Element &&
    Boolean(target.closest("input, textarea, select, [contenteditable='true']"))
  );
}

export type VirtuosoTaskChatTranscriptProps = {
  entries: TaskChatEntry[];
  transcriptIdentity: string;
  transcriptVersion: string;
  viewportWidth?: number;
  viewportStable?: boolean;
  firstItemIndex: number;
  openAtLatestRequest: HistoricalChatOpenRequest | null;
  liveFollow: boolean;
  onOpenAtLatestApplied?: (request: HistoricalChatOpenRequest) => void;
  onOpenAtLatestCancelled?: (request: HistoricalChatOpenRequest) => void;
  onResolveRequest: (request: CodexMessage, approved: boolean) => void;
  onOpenFileLink?: (href: string) => boolean;
  editablePromptEntryId?: string | null;
  onEditPrompt?: (entry: TaskChatEntry, prompt: string) => void;
  onLoadHistoricalActivity?: (entry: TaskChatEntry) => void;
  onScrollActivityChange?: (active: boolean) => void;
};

export const VirtuosoTaskChatTranscript = memo(
  function VirtuosoTaskChatTranscript({
    entries,
    transcriptIdentity,
    transcriptVersion,
    viewportWidth = 1_024,
    viewportStable = true,
    firstItemIndex,
    openAtLatestRequest,
    liveFollow,
    onOpenAtLatestApplied,
    onOpenAtLatestCancelled,
    onResolveRequest,
    onOpenFileLink,
    editablePromptEntryId = null,
    onEditPrompt,
    onLoadHistoricalActivity,
    onScrollActivityChange,
  }: VirtuosoTaskChatTranscriptProps) {
    const virtuosoRef = useRef<VirtuosoHandle | null>(null);
    const hostRef = useRef<HTMLElement | null>(null);
    const scrollerRef = useRef<HTMLElement | null>(null);
    const detachScrollerListenersRef = useRef<(() => void) | null>(null);
    const viewportModeRef = useRef<TranscriptViewportMode>(
      openAtLatestRequest === null ? "settling" : "opening",
    );
    const activeLatestRequestRef = useRef<HistoricalChatOpenRequest | null>(
      openAtLatestRequest,
    );
    const latestPositionFrameRef = useRef<number | null>(null);
    const latestPositionRetryTimerRef = useRef<number | null>(null);
    const latestPositionAttemptCountRef = useRef(0);
    const latestTurnVisibleRef = useRef(false);
    const atBottomRef = useRef(false);
    const scrollingRef = useRef(false);
    const userScrollActiveRef = useRef(false);
    const scrollbarPointerActiveRef = useRef(false);
    const scrollIdleTimerRef = useRef<number | null>(null);
    const reportedActivityRef = useRef(false);
    const pendingMeasurementsRef = useRef(
      new Map<string, PendingTranscriptMeasurement>(),
    );
    const stableDefaultItemHeightRef = useRef<StableDefaultItemHeight | null>(
      null,
    );
    const stableHeightEstimatesRef = useRef<StableHeightEstimates | null>(null);
    const cacheMetadataRef = useRef({
      cacheKey: "",
      entryCount: entries.length,
    });
    const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
    const [editingPrompt, setEditingPrompt] = useState("");
    const suppressRestoreOnMountRef = useRef(openAtLatestRequest !== null);
    const viewportWidthBucket = getTranscriptWidthBucket(viewportWidth);
    const geometryScope = `${transcriptIdentity}:${transcriptVersion}`;
    const cacheKey = `${transcriptIdentity}:${transcriptVersion}:${viewportWidthBucket}`;
    cacheMetadataRef.current = { cacheKey, entryCount: entries.length };
    const defaultHeightKey = `${geometryScope}:${viewportWidthBucket}`;
    if (stableDefaultItemHeightRef.current?.key !== defaultHeightKey) {
      stableDefaultItemHeightRef.current = {
        key: defaultHeightKey,
        height: calculateTranscriptDefaultItemHeight(
          entries,
          viewportWidthBucket,
          geometryScope,
        ),
      };
    }
    const defaultItemHeight = stableDefaultItemHeightRef.current.height;
    const heightEstimateKey = [
      geometryScope,
      viewportWidthBucket,
      entries.length,
      entries[0]?.clientId ?? "empty",
      entries[entries.length - 1]?.clientId ?? "empty",
    ].join(":");
    if (stableHeightEstimatesRef.current?.key !== heightEstimateKey) {
      stableHeightEstimatesRef.current = {
        key: heightEstimateKey,
        heights: entries.map((entry) =>
          estimateTranscriptRowHeight(entry, viewportWidthBucket, geometryScope),
        ),
      };
    }
    const heightEstimates = stableHeightEstimatesRef.current.heights;
    const clearLatestPositionSchedule = useCallback(() => {
      if (latestPositionFrameRef.current !== null) {
        window.cancelAnimationFrame(latestPositionFrameRef.current);
        latestPositionFrameRef.current = null;
      }
      if (latestPositionRetryTimerRef.current !== null) {
        window.clearTimeout(latestPositionRetryTimerRef.current);
        latestPositionRetryTimerRef.current = null;
      }
    }, []);
    const confirmLatestPosition = useCallback(() => {
      const request = activeLatestRequestRef.current;
      if (
        !request ||
        userScrollActiveRef.current ||
        !latestTurnVisibleRef.current ||
        !atBottomRef.current
      ) {
        return false;
      }

      activeLatestRequestRef.current = null;
      clearLatestPositionSchedule();
      viewportModeRef.current = "settling";
      onOpenAtLatestApplied?.(request);
      return true;
    }, [clearLatestPositionSchedule, onOpenAtLatestApplied]);
    const cancelLatestPosition = useCallback(() => {
      const request = activeLatestRequestRef.current;
      if (!request) return;
      activeLatestRequestRef.current = null;
      clearLatestPositionSchedule();
      onOpenAtLatestCancelled?.(request);
    }, [clearLatestPositionSchedule, onOpenAtLatestCancelled]);
    const reportViewportActivity = useCallback(() => {
      const active = scrollingRef.current || userScrollActiveRef.current;
      if (reportedActivityRef.current === active) return;
      reportedActivityRef.current = active;
      onScrollActivityChange?.(active);
    }, [onScrollActivityChange]);
    const flushPendingMeasurements = useCallback(() => {
      if (scrollingRef.current || userScrollActiveRef.current) return;
      pendingMeasurementsRef.current.forEach(({ entry, height }) => {
        cacheTranscriptRowHeight(
          entry,
          viewportWidthBucket,
          height,
          geometryScope,
        );
      });
      pendingMeasurementsRef.current.clear();
    }, [geometryScope, viewportWidthBucket]);
    const finishUserScrollActivity = useCallback(() => {
      scrollIdleTimerRef.current = null;
      userScrollActiveRef.current = false;
      if (viewportModeRef.current === "manual-scrolling") {
        viewportModeRef.current = liveFollow ? "live-following" : "settling";
      }
      flushPendingMeasurements();
      reportViewportActivity();
    }, [flushPendingMeasurements, liveFollow, reportViewportActivity]);
    const markUserScrollActivity = useCallback(() => {
      cancelLatestPosition();
      viewportModeRef.current = "manual-scrolling";
      userScrollActiveRef.current = true;
      if (scrollIdleTimerRef.current !== null) {
        window.clearTimeout(scrollIdleTimerRef.current);
      }
      scrollIdleTimerRef.current = window.setTimeout(
        finishUserScrollActivity,
        TRANSCRIPT_SCROLL_IDLE_MS,
      );
      reportViewportActivity();
    }, [cancelLatestPosition, finishUserScrollActivity, reportViewportActivity]);
    const handleScrollerRef = useCallback(
      (element: HTMLElement | Window | null) => {
        detachScrollerListenersRef.current?.();
        detachScrollerListenersRef.current = null;
        const nextScroller = element instanceof HTMLElement ? element : null;
        scrollerRef.current = nextScroller;
        if (!nextScroller) return;

        const onWheel = () => markUserScrollActivity();
        const onTouch = () => markUserScrollActivity();
        const onKeyDown = (event: KeyboardEvent) => {
          if (
            isTranscriptScrollKey(event.key) &&
            !isEditableScrollTarget(event.target)
          ) {
            markUserScrollActivity();
          }
        };
        const onPointerDown = (event: PointerEvent) => {
          const bounds = nextScroller.getBoundingClientRect();
          const scrollbarHitWidth = Math.max(
            14,
            nextScroller.offsetWidth - nextScroller.clientWidth,
          );
          if (event.clientX >= bounds.right - scrollbarHitWidth) {
            scrollbarPointerActiveRef.current = true;
            markUserScrollActivity();
          }
        };
        const onPointerMove = () => {
          if (scrollbarPointerActiveRef.current) {
            markUserScrollActivity();
          }
        };
        const onPointerUp = () => {
          if (scrollbarPointerActiveRef.current) {
            markUserScrollActivity();
          }
          scrollbarPointerActiveRef.current = false;
        };
        const onScroll = () => {
          if (userScrollActiveRef.current) {
            markUserScrollActivity();
          }
        };

        nextScroller.addEventListener("wheel", onWheel, { passive: true });
        nextScroller.addEventListener("touchstart", onTouch, { passive: true });
        nextScroller.addEventListener("touchmove", onTouch, { passive: true });
        nextScroller.addEventListener("keydown", onKeyDown);
        nextScroller.addEventListener("pointerdown", onPointerDown);
        nextScroller.addEventListener("scroll", onScroll, { passive: true });
        window.addEventListener("pointermove", onPointerMove, { passive: true });
        window.addEventListener("pointerup", onPointerUp, { passive: true });

        detachScrollerListenersRef.current = () => {
          nextScroller.removeEventListener("wheel", onWheel);
          nextScroller.removeEventListener("touchstart", onTouch);
          nextScroller.removeEventListener("touchmove", onTouch);
          nextScroller.removeEventListener("keydown", onKeyDown);
          nextScroller.removeEventListener("pointerdown", onPointerDown);
          nextScroller.removeEventListener("scroll", onScroll);
          window.removeEventListener("pointermove", onPointerMove);
          window.removeEventListener("pointerup", onPointerUp);
        };
      },
      [markUserScrollActivity],
    );
    const restoredState = useMemo(
      () =>
        suppressRestoreOnMountRef.current
          ? undefined
          : readCachedTranscriptState(cacheKey, entries.length),
      // State restoration is intentionally read only when a transcript identity mounts.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [cacheKey],
    );

    useEffect(() => {
      clearLatestPositionSchedule();
      activeLatestRequestRef.current = openAtLatestRequest;
      latestPositionAttemptCountRef.current = 0;
      latestTurnVisibleRef.current = false;
      atBottomRef.current = false;

      if (
        !openAtLatestRequest ||
        openAtLatestRequest.transcriptVersion !== transcriptVersion ||
        entries.length === 0 ||
        !viewportStable
      ) {
        if (!openAtLatestRequest) {
          viewportModeRef.current = liveFollow ? "live-following" : "settling";
        }
        return;
      }

      viewportModeRef.current = "opening";
      let disposed = false;
      const attemptPositioning = () => {
        latestPositionFrameRef.current = null;
        if (
          disposed ||
          activeLatestRequestRef.current?.requestId !==
            openAtLatestRequest.requestId ||
          userScrollActiveRef.current
        ) {
          return;
        }

        latestPositionAttemptCountRef.current += 1;
        virtuosoRef.current?.scrollToIndex({
          index: "LAST",
          align: "end",
          behavior: "auto",
        });
        if (
          !confirmLatestPosition() &&
          latestPositionAttemptCountRef.current <
            LATEST_TURN_POSITION_MAX_ATTEMPTS
        ) {
          latestPositionRetryTimerRef.current = window.setTimeout(() => {
            latestPositionRetryTimerRef.current = null;
            latestPositionFrameRef.current = window.requestAnimationFrame(
              attemptPositioning,
            );
          }, LATEST_TURN_POSITION_RETRY_MS);
        }
      };

      latestPositionFrameRef.current = window.requestAnimationFrame(
        attemptPositioning,
      );
      return () => {
        disposed = true;
        clearLatestPositionSchedule();
      };
    }, [
      clearLatestPositionSchedule,
      confirmLatestPosition,
      entries.length,
      liveFollow,
      openAtLatestRequest,
      transcriptVersion,
      viewportStable,
    ]);

    useEffect(() => {
      const handle = virtuosoRef.current;
      return () => {
        detachScrollerListenersRef.current?.();
        detachScrollerListenersRef.current = null;
        if (scrollIdleTimerRef.current !== null) {
          window.clearTimeout(scrollIdleTimerRef.current);
          scrollIdleTimerRef.current = null;
        }
        clearLatestPositionSchedule();
        if (reportedActivityRef.current) {
          onScrollActivityChange?.(false);
        }
        handle?.getState((snapshot) => {
          const metadata = cacheMetadataRef.current;
          writeCachedTranscriptState(
            metadata.cacheKey,
            metadata.entryCount,
            snapshot,
          );
        });
      };
    }, [clearLatestPositionSchedule, onScrollActivityChange]);

    useEffect(() => {
      pendingMeasurementsRef.current.clear();
    }, [geometryScope, viewportWidthBucket]);

    useEffect(() => {
      if (
        editingEntryId !== null &&
        !entries.some((entry) => entry.clientId === editingEntryId)
      ) {
        setEditingEntryId(null);
        setEditingPrompt("");
      }
    }, [editingEntryId, entries]);

    const handleStartEdit = useCallback((entry: TaskChatEntry) => {
      setEditingEntryId(entry.clientId);
      setEditingPrompt(entry.prompt);
    }, []);

    const handleCancelEdit = useCallback(() => {
      setEditingEntryId(null);
      setEditingPrompt("");
    }, []);

    const handleSubmitEdit = useCallback(
      (entry: TaskChatEntry, nextPrompt: string) => {
        if (!nextPrompt || !onEditPrompt) return;
        setEditingEntryId(null);
        setEditingPrompt("");
        onEditPrompt(entry, nextPrompt);
      },
      [onEditPrompt],
    );

    const handleItemsRendered = useCallback(
      (items: ListItem<TaskChatEntry>[]) => {
        if (!viewportStable) return;
        items.forEach((item) => {
          if (item.data && item.size > 0) {
            if (scrollingRef.current || userScrollActiveRef.current) {
              pendingMeasurementsRef.current.set(item.data.clientId, {
                entry: item.data,
                height: item.size,
              });
            } else {
              cacheTranscriptRowHeight(
                item.data,
                viewportWidthBucket,
                item.size,
                geometryScope,
              );
            }
          }
        });
      },
      [geometryScope, viewportStable, viewportWidthBucket],
    );

    const handleRangeChanged = useCallback(
      (range: ListRange) => {
        const latestIndex = firstItemIndex + entries.length - 1;
        latestTurnVisibleRef.current =
          entries.length > 0 && range.endIndex >= latestIndex;
        confirmLatestPosition();
      },
      [confirmLatestPosition, entries.length, firstItemIndex],
    );

    const handleAtBottomStateChange = useCallback(
      (atBottom: boolean) => {
        atBottomRef.current = atBottom;
        confirmLatestPosition();
      },
      [confirmLatestPosition],
    );

    const handleIsScrolling = useCallback(
      (active: boolean) => {
        scrollingRef.current = active;
        if (active) {
          if (userScrollActiveRef.current) {
            viewportModeRef.current = "manual-scrolling";
          }
        } else if (viewportModeRef.current !== "opening") {
          viewportModeRef.current = userScrollActiveRef.current
            ? "manual-scrolling"
            : liveFollow
              ? "live-following"
              : "settling";
          flushPendingMeasurements();
        }
        reportViewportActivity();
      },
      [flushPendingMeasurements, liveFollow, reportViewportActivity],
    );

    const itemContent = useCallback(
      (_index: number, entry: TaskChatEntry) => {
        const editable =
          Boolean(onEditPrompt) &&
          entry.clientId === editablePromptEntryId &&
          entry.status !== "connecting" &&
          entry.status !== "running";
        return (
          <div className="task-chat-virtuoso-row">
            <TaskChatTurn
              editable={editable}
              editing={editingEntryId === entry.clientId}
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
      },
      [
        editablePromptEntryId,
        editingEntryId,
        editingPrompt,
        handleCancelEdit,
        handleStartEdit,
        handleSubmitEdit,
        onEditPrompt,
        onLoadHistoricalActivity,
        onOpenFileLink,
        onResolveRequest,
      ],
    );

    return (
      <section
        className="task-chat-transcript virtuoso-transcript"
        aria-label="Task chat transcript"
        ref={hostRef}
      >
        <Virtuoso
          className="task-chat-virtuoso"
          ref={virtuosoRef}
          data={entries}
          firstItemIndex={firstItemIndex}
          computeItemKey={(_index, entry) => entry.clientId}
          defaultItemHeight={defaultItemHeight}
          heightEstimates={heightEstimates}
          increaseViewportBy={transcriptIncreaseViewportBy}
          minOverscanItemCount={{
            top: TRANSCRIPT_MIN_OVERSCAN_ITEMS,
            bottom: TRANSCRIPT_MIN_OVERSCAN_ITEMS,
          }}
          scrollerRef={handleScrollerRef}
          initialTopMostItemIndex={
            suppressRestoreOnMountRef.current
              ? { index: "LAST", align: "end" }
              : undefined
          }
          restoreStateFrom={restoredState}
          alignToBottom
          atBottomThreshold={48}
          followOutput={(isAtBottom) =>
            liveFollow && isAtBottom ? "auto" : false
          }
          atBottomStateChange={handleAtBottomStateChange}
          rangeChanged={handleRangeChanged}
          isScrolling={handleIsScrolling}
          itemsRendered={handleItemsRendered}
          itemContent={itemContent}
        />
      </section>
    );
  },
);

export function clearTranscriptStateCache() {
  transcriptStateCache.clear();
}
