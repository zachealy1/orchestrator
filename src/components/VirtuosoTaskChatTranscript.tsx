import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Virtuoso,
  type ListRange,
  type StateSnapshot,
  type VirtuosoHandle,
} from "react-virtuoso";
import type { HistoricalChatOpenRequest } from "../types";
import type { ApprovalResolutionHandler } from "../lib/codexApprovals";
import type {
  NativeUserInputRequest,
  UserInputResponse,
} from "../lib/nativePlanMode";
import {
  calculateTranscriptDefaultItemHeight,
  calculateTranscriptOverscanItemCount,
  estimateTranscriptRowHeight,
  getTranscriptWidthBucket,
} from "../lib/transcriptVirtualization";
import {
  TaskChatTurn,
  nativePlanDisclosureKey,
  type NativePlanDisclosureChangeHandler,
  type TaskChatEntry,
} from "./TaskChatTranscript";

const TRANSCRIPT_STATE_CACHE_LIMIT = 5;
const TRANSCRIPT_BOTTOM_THRESHOLD_PX = 48;
const CHAT_SCROLLBAR_CORNER_INSET_PX = 12;
export const TRANSCRIPT_RENDER_AHEAD_PX = 3_200;
export const TRANSCRIPT_MIN_OVERSCAN_ITEMS = 8;
export const TRANSCRIPT_SCROLL_IDLE_MS = 280;
export const LATEST_TURN_POSITION_RETRY_MS = 80;
export const LATEST_TURN_POSITION_MAX_ATTEMPTS = 8;

const transcriptIncreaseViewportBy = {
  top: TRANSCRIPT_RENDER_AHEAD_PX,
  bottom: TRANSCRIPT_RENDER_AHEAD_PX,
} as const;

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
  if (!cached || cached.entryCount !== entryCount) return undefined;
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

function monotonicNow() {
  return typeof performance === "undefined" ? Date.now() : performance.now();
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
  onLoadHistoricalActivity?: (entry: TaskChatEntry) => void;
  onScrollActivityChange?: (active: boolean) => void;
};

const VirtualTranscriptRow = memo(function VirtualTranscriptRow({
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
  onAnswerUserInput?: VirtuosoTaskChatTranscriptProps["onAnswerUserInput"];
  onImplementPlan?: VirtuosoTaskChatTranscriptProps["onImplementPlan"];
  onRevisePlan?: VirtuosoTaskChatTranscriptProps["onRevisePlan"];
  onCancelPlan?: VirtuosoTaskChatTranscriptProps["onCancelPlan"];
  onOpenFileLink?: (href: string) => boolean;
  onLoadHistoricalActivity?: (entry: TaskChatEntry) => void;
  planExpanded: boolean;
  onPlanDisclosureChange: NativePlanDisclosureChangeHandler;
}) {
  return (
    <div
      className="task-chat-virtuoso-row"
      data-transcript-entry-id={entry.clientId}
    >
      <TaskChatTurn
        editable={editable}
        editing={editing}
        editingPrompt={editing ? editingPrompt : ""}
        entry={entry}
        onCancelEdit={onCancelEdit}
        onEditingPromptChange={onEditingPromptChange}
        onOpenFileLink={onOpenFileLink}
        onResolveRequest={onResolveRequest}
        onAnswerUserInput={onAnswerUserInput}
        onImplementPlan={onImplementPlan}
        onRevisePlan={onRevisePlan}
        onCancelPlan={onCancelPlan}
        onStartEdit={onStartEdit}
        onSubmitEdit={onSubmitEdit}
        onLoadHistoricalActivity={onLoadHistoricalActivity}
        planExpanded={planExpanded}
        onPlanDisclosureChange={onPlanDisclosureChange}
      />
    </div>
  );
});

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
    onAnswerUserInput,
    onImplementPlan,
    onRevisePlan,
    onCancelPlan,
    onOpenFileLink,
    editablePromptEntryId = null,
    onEditPrompt,
    onLoadHistoricalActivity,
    onScrollActivityChange,
  }: VirtuosoTaskChatTranscriptProps) {
    const virtuosoRef = useRef<VirtuosoHandle | null>(null);
    const scrollerRef = useRef<HTMLElement | null>(null);
    const detachScrollerListenersRef = useRef<(() => void) | null>(null);
    const activeLatestRequestRef = useRef<HistoricalChatOpenRequest | null>(
      openAtLatestRequest,
    );
    const latestPositionFrameRef = useRef<number | null>(null);
    const latestPositionRetryTimerRef = useRef<number | null>(null);
    const planAnchorFrameRef = useRef<number | null>(null);
    const planAnchorSettleFrameRef = useRef<number | null>(null);
    const latestPositionAttemptCountRef = useRef(0);
    const latestTurnVisibleRef = useRef(false);
    const atBottomRef = useRef(false);
    const virtuosoScrollingRef = useRef(false);
    const userScrollActiveRef = useRef(false);
    const scrollbarPointerActiveRef = useRef(false);
    const scrollIdleCheckRef = useRef<number | null>(null);
    const lastUserScrollEventAtRef = useRef(0);
    const reportedActivityRef = useRef(false);
    const stableDefaultItemHeightRef = useRef<StableDefaultItemHeight | null>(
      null,
    );
    const stableHeightEstimatesRef = useRef<StableHeightEstimates | null>(null);
    const cacheMetadataRef = useRef({
      cacheKey: "",
      entryCount: entries.length,
    });
    const suppressRestoreOnMountRef = useRef(openAtLatestRequest !== null);
    const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
    const [editingPrompt, setEditingPrompt] = useState("");
    const [expandedPlanKeys, setExpandedPlanKeys] = useState<Set<string>>(
      () => new Set(),
    );

    const viewportWidthBucket = getTranscriptWidthBucket(viewportWidth);
    const geometryScope = `${transcriptIdentity}:${transcriptVersion}`;
    const cacheKey = `${geometryScope}:${viewportWidthBucket}`;
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
    const overscanItemCount = useMemo(
      () =>
        calculateTranscriptOverscanItemCount(
          heightEstimates,
          TRANSCRIPT_RENDER_AHEAD_PX,
          TRANSCRIPT_MIN_OVERSCAN_ITEMS,
        ),
      [heightEstimates],
    );

    const restoredState = useMemo(
      () =>
        suppressRestoreOnMountRef.current
          ? undefined
          : readCachedTranscriptState(cacheKey, entries.length),
      // Restoration is intentionally read only when this transcript mounts.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [cacheKey],
    );

    const validPlanKeys = useMemo(
      () => new Set(entries.map((entry) => nativePlanDisclosureKey(entry))),
      [entries],
    );

    useEffect(() => {
      setExpandedPlanKeys((current) => {
        if ([...current].every((key) => validPlanKeys.has(key))) {
          return current;
        }
        return new Set([...current].filter((key) => validPlanKeys.has(key)));
      });
    }, [validPlanKeys]);

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

    const clearPlanAnchorCorrection = useCallback(() => {
      if (planAnchorFrameRef.current !== null) {
        window.cancelAnimationFrame(planAnchorFrameRef.current);
        planAnchorFrameRef.current = null;
      }
      if (planAnchorSettleFrameRef.current !== null) {
        window.cancelAnimationFrame(planAnchorSettleFrameRef.current);
        planAnchorSettleFrameRef.current = null;
      }
    }, []);

    const handlePlanDisclosureChange = useCallback<NativePlanDisclosureChangeHandler>(
      ({ anchorElement, anchorTop, expanded, planKey }) => {
        setExpandedPlanKeys((current) => {
          const next = new Set(current);
          if (expanded) next.add(planKey);
          else next.delete(planKey);
          return next;
        });

        clearPlanAnchorCorrection();
        planAnchorFrameRef.current = window.requestAnimationFrame(() => {
          planAnchorFrameRef.current = null;
          planAnchorSettleFrameRef.current = window.requestAnimationFrame(() => {
            planAnchorSettleFrameRef.current = null;
            if (
              userScrollActiveRef.current ||
              !anchorElement.isConnected
            ) {
              return;
            }
            const offset = anchorElement.getBoundingClientRect().top - anchorTop;
            if (Math.abs(offset) < 0.5) return;
            virtuosoRef.current?.scrollBy({
              top: offset,
              behavior: "auto",
            });
          });
        });
      },
      [clearPlanAnchorCorrection],
    );

    const clearScrollIdleCheck = useCallback(() => {
      if (scrollIdleCheckRef.current !== null) {
        window.clearTimeout(scrollIdleCheckRef.current);
        scrollIdleCheckRef.current = null;
      }
    }, []);

    const reportScrollActivity = useCallback(() => {
      const visualScrollActive =
        virtuosoScrollingRef.current || userScrollActiveRef.current;
      scrollerRef.current?.classList.toggle(
        "is-scroll-active",
        visualScrollActive,
      );

      const userScrollActive = userScrollActiveRef.current;
      if (reportedActivityRef.current === userScrollActive) return;
      reportedActivityRef.current = userScrollActive;
      onScrollActivityChange?.(userScrollActive);
    }, [onScrollActivityChange]);

    const finishUserScrollActivity = useCallback(() => {
      if (scrollbarPointerActiveRef.current) return;
      clearScrollIdleCheck();
      userScrollActiveRef.current = false;
      reportScrollActivity();
    }, [clearScrollIdleCheck, reportScrollActivity]);

    const scheduleScrollIdleCheck = useCallback(() => {
      if (scrollIdleCheckRef.current !== null) return;
      const checkForIdle = () => {
        scrollIdleCheckRef.current = null;
        if (!userScrollActiveRef.current) return;
        const elapsed = monotonicNow() - lastUserScrollEventAtRef.current;
        if (
          scrollbarPointerActiveRef.current ||
          elapsed < TRANSCRIPT_SCROLL_IDLE_MS
        ) {
          scrollIdleCheckRef.current = window.setTimeout(
            checkForIdle,
            Math.max(16, TRANSCRIPT_SCROLL_IDLE_MS - elapsed),
          );
          return;
        }
        finishUserScrollActivity();
      };
      scrollIdleCheckRef.current = window.setTimeout(
        checkForIdle,
        TRANSCRIPT_SCROLL_IDLE_MS,
      );
    }, [finishUserScrollActivity]);

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

    const markUserScrollActivity = useCallback(() => {
      lastUserScrollEventAtRef.current = monotonicNow();
      if (!userScrollActiveRef.current) {
        userScrollActiveRef.current = true;
        cancelLatestPosition();
      }
      reportScrollActivity();
      scheduleScrollIdleCheck();
    }, [cancelLatestPosition, reportScrollActivity, scheduleScrollIdleCheck]);

    const handleScrollerRef = useCallback(
      (element: HTMLElement | Window | null) => {
        detachScrollerListenersRef.current?.();
        detachScrollerListenersRef.current = null;
        const nextScroller = element instanceof HTMLElement ? element : null;
        scrollerRef.current = nextScroller;
        if (!nextScroller) return;
        nextScroller.classList.toggle(
          "is-scroll-active",
          reportedActivityRef.current,
        );

        const handleWheel = () => markUserScrollActivity();
        const handleTouch = () => markUserScrollActivity();
        const handleTouchCancel = () => {
          lastUserScrollEventAtRef.current = monotonicNow();
          scheduleScrollIdleCheck();
        };
        const handleKeyDown = (event: KeyboardEvent) => {
          if (
            isTranscriptScrollKey(event.key) &&
            !isEditableScrollTarget(event.target)
          ) {
            markUserScrollActivity();
          }
        };
        const handlePointerDown = (event: PointerEvent) => {
          const bounds = nextScroller.getBoundingClientRect();
          const scrollbarHitWidth = Math.max(
            14,
            nextScroller.offsetWidth - nextScroller.clientWidth,
          );
          const cornerInset = Number.parseFloat(
            window
              .getComputedStyle(nextScroller)
              .getPropertyValue("--chat-scrollbar-corner-inset"),
          );
          const effectiveCornerInset = Number.isFinite(cornerInset)
            ? cornerInset
            : CHAT_SCROLLBAR_CORNER_INSET_PX;
          if (
            event.clientX >= bounds.right - scrollbarHitWidth &&
            event.clientY >= bounds.top + effectiveCornerInset &&
            event.clientY <= bounds.bottom - effectiveCornerInset
          ) {
            scrollbarPointerActiveRef.current = true;
            markUserScrollActivity();
          }
        };
        const handlePointerMove = () => {
          if (scrollbarPointerActiveRef.current) markUserScrollActivity();
        };
        const handlePointerRelease = () => {
          if (!scrollbarPointerActiveRef.current) return;
          scrollbarPointerActiveRef.current = false;
          lastUserScrollEventAtRef.current = monotonicNow();
          scheduleScrollIdleCheck();
        };
        const handleWindowBlur = () => {
          scrollbarPointerActiveRef.current = false;
          virtuosoScrollingRef.current = false;
          finishUserScrollActivity();
        };
        const handleScroll = () => {
          if (userScrollActiveRef.current) {
            lastUserScrollEventAtRef.current = monotonicNow();
            scheduleScrollIdleCheck();
          }
        };
        const handleScrollEnd = () => {
          if (userScrollActiveRef.current && !scrollbarPointerActiveRef.current) {
            lastUserScrollEventAtRef.current = monotonicNow();
            scheduleScrollIdleCheck();
          }
        };

        nextScroller.addEventListener("wheel", handleWheel, { passive: true });
        nextScroller.addEventListener("touchstart", handleTouch, {
          passive: true,
        });
        nextScroller.addEventListener("touchmove", handleTouch, {
          passive: true,
        });
        nextScroller.addEventListener("touchend", handleTouch, {
          passive: true,
        });
        nextScroller.addEventListener("touchcancel", handleTouchCancel, {
          passive: true,
        });
        nextScroller.addEventListener("keydown", handleKeyDown);
        nextScroller.addEventListener("pointerdown", handlePointerDown);
        nextScroller.addEventListener("scroll", handleScroll, { passive: true });
        nextScroller.addEventListener("scrollend", handleScrollEnd);
        window.addEventListener("pointermove", handlePointerMove, {
          passive: true,
        });
        window.addEventListener("pointerup", handlePointerRelease, {
          passive: true,
        });
        window.addEventListener("pointercancel", handlePointerRelease, {
          passive: true,
        });
        window.addEventListener("blur", handleWindowBlur);

        detachScrollerListenersRef.current = () => {
          nextScroller.removeEventListener("wheel", handleWheel);
          nextScroller.removeEventListener("touchstart", handleTouch);
          nextScroller.removeEventListener("touchmove", handleTouch);
          nextScroller.removeEventListener("touchend", handleTouch);
          nextScroller.removeEventListener("touchcancel", handleTouchCancel);
          nextScroller.removeEventListener("keydown", handleKeyDown);
          nextScroller.removeEventListener("pointerdown", handlePointerDown);
          nextScroller.removeEventListener("scroll", handleScroll);
          nextScroller.removeEventListener("scrollend", handleScrollEnd);
          window.removeEventListener("pointermove", handlePointerMove);
          window.removeEventListener("pointerup", handlePointerRelease);
          window.removeEventListener("pointercancel", handlePointerRelease);
          window.removeEventListener("blur", handleWindowBlur);
        };
      },
      [finishUserScrollActivity, markUserScrollActivity, scheduleScrollIdleCheck],
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
        return;
      }

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
      openAtLatestRequest,
      transcriptVersion,
      viewportStable,
    ]);

    useEffect(() => {
      if (
        editingEntryId !== null &&
        !entries.some((entry) => entry.clientId === editingEntryId)
      ) {
        setEditingEntryId(null);
        setEditingPrompt("");
      }
    }, [editingEntryId, entries]);

    useEffect(() => {
      const handle = virtuosoRef.current;
      return () => {
        detachScrollerListenersRef.current?.();
        detachScrollerListenersRef.current = null;
        clearLatestPositionSchedule();
        clearPlanAnchorCorrection();
        clearScrollIdleCheck();
        if (reportedActivityRef.current) onScrollActivityChange?.(false);
        handle?.getState((snapshot) => {
          const metadata = cacheMetadataRef.current;
          writeCachedTranscriptState(
            metadata.cacheKey,
            metadata.entryCount,
            snapshot,
          );
        });
      };
    }, [
      clearLatestPositionSchedule,
      clearPlanAnchorCorrection,
      clearScrollIdleCheck,
      onScrollActivityChange,
    ]);

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
        virtuosoScrollingRef.current = active;
        reportScrollActivity();
      },
      [reportScrollActivity],
    );

    const itemContent = useCallback(
      (_index: number, entry: TaskChatEntry) => {
        const editable =
          Boolean(onEditPrompt) &&
          entry.clientId === editablePromptEntryId &&
          entry.status !== "connecting" &&
          entry.status !== "running";
        return (
          <VirtualTranscriptRow
            editable={editable}
            editing={editingEntryId === entry.clientId}
            editingPrompt={
              editingEntryId === entry.clientId ? editingPrompt : ""
            }
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
            planExpanded={expandedPlanKeys.has(nativePlanDisclosureKey(entry))}
            onPlanDisclosureChange={handlePlanDisclosureChange}
          />
        );
      },
      [
        editablePromptEntryId,
        editingEntryId,
        editingPrompt,
        handleCancelEdit,
        handleStartEdit,
        handleSubmitEdit,
        handlePlanDisclosureChange,
        onAnswerUserInput,
        onCancelPlan,
        onEditPrompt,
        onImplementPlan,
        onLoadHistoricalActivity,
        onOpenFileLink,
        onResolveRequest,
        onRevisePlan,
        expandedPlanKeys,
      ],
    );

    return (
      <div className="task-chat-scroll-frame">
        <Virtuoso
          className="task-chat-transcript virtuoso-transcript task-chat-virtuoso"
          role="region"
          aria-label="Task chat transcript"
          tabIndex={0}
          ref={virtuosoRef}
          data={entries}
          firstItemIndex={firstItemIndex}
          initialItemCount={Math.min(entries.length, 20)}
          computeItemKey={(_index, entry) => entry.clientId}
          defaultItemHeight={defaultItemHeight}
          heightEstimates={heightEstimates}
          increaseViewportBy={transcriptIncreaseViewportBy}
          minOverscanItemCount={{
            top: overscanItemCount,
            bottom: overscanItemCount,
          }}
          scrollerRef={handleScrollerRef}
          initialTopMostItemIndex={
            suppressRestoreOnMountRef.current
              ? { index: "LAST", align: "end" }
              : undefined
          }
          restoreStateFrom={restoredState}
          alignToBottom
          atBottomThreshold={TRANSCRIPT_BOTTOM_THRESHOLD_PX}
          followOutput={(isAtBottom) =>
            liveFollow && isAtBottom ? "auto" : false
          }
          atBottomStateChange={handleAtBottomStateChange}
          rangeChanged={handleRangeChanged}
          isScrolling={handleIsScrolling}
          itemContent={itemContent}
        />
      </div>
    );
  },
);

export function clearTranscriptStateCache() {
  transcriptStateCache.clear();
}
