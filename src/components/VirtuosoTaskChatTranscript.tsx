import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { CodexMessage, HistoricalChatOpenRequest } from "../types";
import { getTranscriptWidthBucket } from "../lib/transcriptVirtualization";
import { TaskChatTurn, type TaskChatEntry } from "./TaskChatTranscript";

const TRANSCRIPT_STATE_CACHE_LIMIT = 5;
const TRANSCRIPT_BOTTOM_THRESHOLD_PX = 48;
const SCROLL_POSITION_EPSILON_PX = 2;
export const TRANSCRIPT_SCROLL_IDLE_MS = 280;
export const LATEST_TURN_POSITION_RETRY_MS = 80;
export const LATEST_TURN_POSITION_MAX_ATTEMPTS = 8;

type CachedTranscriptState = {
  anchorEntryId: string | null;
  anchorOffset: number;
  atBottom: boolean;
};

const transcriptStateCache = new Map<string, CachedTranscriptState>();

function readCachedTranscriptState(key: string) {
  const cached = transcriptStateCache.get(key);
  if (!cached) return undefined;
  transcriptStateCache.delete(key);
  transcriptStateCache.set(key, cached);
  return cached;
}

function writeCachedTranscriptState(key: string, state: CachedTranscriptState) {
  transcriptStateCache.delete(key);
  transcriptStateCache.set(key, state);
  while (transcriptStateCache.size > TRANSCRIPT_STATE_CACHE_LIMIT) {
    const oldest = transcriptStateCache.keys().next().value;
    if (typeof oldest !== "string") break;
    transcriptStateCache.delete(oldest);
  }
}

function maxScrollTop(element: HTMLElement) {
  return Math.max(0, element.scrollHeight - element.clientHeight);
}

function isNearTranscriptBottom(element: HTMLElement) {
  return maxScrollTop(element) - element.scrollTop <= TRANSCRIPT_BOTTOM_THRESHOLD_PX;
}

function scrollTranscriptTo(element: HTMLElement, top: number) {
  if (typeof element.scrollTo === "function") {
    element.scrollTo({ top, behavior: "auto" });
    return;
  }

  // JSDOM and older embedded WebKit builds do not expose Element.scrollTo.
  element.scrollTop = top;
}

function scrollToTranscriptEnd(element: HTMLElement) {
  scrollTranscriptTo(element, maxScrollTop(element));
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

function captureTranscriptState(element: HTMLElement): CachedTranscriptState {
  const viewportTop = element.getBoundingClientRect().top;
  const rows = Array.from(
    element.querySelectorAll<HTMLElement>("[data-transcript-entry-id]"),
  );
  const anchor = rows.find((row) => row.getBoundingClientRect().bottom > viewportTop + 1);

  return {
    anchorEntryId: anchor?.dataset.transcriptEntryId ?? null,
    anchorOffset: anchor ? anchor.getBoundingClientRect().top - viewportTop : 0,
    atBottom: isNearTranscriptBottom(element),
  };
}

function restoreTranscriptState(
  element: HTMLElement,
  state: CachedTranscriptState,
) {
  if (state.atBottom) {
    scrollToTranscriptEnd(element);
    return;
  }
  if (!state.anchorEntryId) return;
  const row = Array.from(
    element.querySelectorAll<HTMLElement>("[data-transcript-entry-id]"),
  ).find((candidate) => candidate.dataset.transcriptEntryId === state.anchorEntryId);
  if (!row) return;
  const viewportTop = element.getBoundingClientRect().top;
  const rowTop = row.getBoundingClientRect().top;
  scrollTranscriptTo(
    element,
    Math.max(0, element.scrollTop + rowTop - viewportTop - state.anchorOffset),
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
  onResolveRequest: (request: CodexMessage, approved: boolean) => void;
  onOpenFileLink?: (href: string) => boolean;
  editablePromptEntryId?: string | null;
  onEditPrompt?: (entry: TaskChatEntry, prompt: string) => void;
  onLoadHistoricalActivity?: (entry: TaskChatEntry) => void;
  onScrollActivityChange?: (active: boolean) => void;
};

const NativeTranscriptRow = memo(function NativeTranscriptRow({
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
    <div
      className="task-chat-native-row"
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
        onStartEdit={onStartEdit}
        onSubmitEdit={onSubmitEdit}
        onLoadHistoricalActivity={onLoadHistoricalActivity}
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
    const scrollerRef = useRef<HTMLElement | null>(null);
    const latestRequestRef = useRef<HistoricalChatOpenRequest | null>(
      openAtLatestRequest,
    );
    const latestPositionFrameRef = useRef<number | null>(null);
    const latestPositionTimerRef = useRef<number | null>(null);
    const latestPositionAttemptRef = useRef(0);
    const userScrollActiveRef = useRef(false);
    const scrollbarPointerActiveRef = useRef(false);
    const scrollIdleCheckRef = useRef<number | null>(null);
    const lastUserScrollEventAtRef = useRef(0);
    const atBottomRef = useRef(true);
    const reportedActivityRef = useRef(false);
    const initialRestoreAppliedRef = useRef(false);
    const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
    const [editingPrompt, setEditingPrompt] = useState("");

    const viewportWidthBucket = getTranscriptWidthBucket(viewportWidth);
    const cacheKey = `${transcriptIdentity}:${transcriptVersion}:${viewportWidthBucket}`;
    const cacheMetadataRef = useRef(cacheKey);
    cacheMetadataRef.current = cacheKey;
    const suppressRestoreOnMountRef = useRef(openAtLatestRequest !== null);
    const restoredStateRef = useRef<CachedTranscriptState | undefined>(
      suppressRestoreOnMountRef.current
        ? undefined
        : readCachedTranscriptState(cacheKey),
    );

    const clearLatestPositionSchedule = useCallback(() => {
      if (latestPositionFrameRef.current !== null) {
        window.cancelAnimationFrame(latestPositionFrameRef.current);
        latestPositionFrameRef.current = null;
      }
      if (latestPositionTimerRef.current !== null) {
        window.clearTimeout(latestPositionTimerRef.current);
        latestPositionTimerRef.current = null;
      }
    }, []);

    const clearScrollIdleCheck = useCallback(() => {
      if (scrollIdleCheckRef.current !== null) {
        window.clearTimeout(scrollIdleCheckRef.current);
        scrollIdleCheckRef.current = null;
      }
    }, []);

    const reportScrollActivity = useCallback(
      (active: boolean) => {
        if (reportedActivityRef.current === active) return;
        reportedActivityRef.current = active;
        onScrollActivityChange?.(active);
      },
      [onScrollActivityChange],
    );

    const finishUserScrollActivity = useCallback(() => {
      if (!userScrollActiveRef.current || scrollbarPointerActiveRef.current) return;
      clearScrollIdleCheck();
      userScrollActiveRef.current = false;
      reportScrollActivity(false);
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

    const cancelLatestPosition = useCallback(() => {
      const request = latestRequestRef.current;
      if (!request) return;
      latestRequestRef.current = null;
      clearLatestPositionSchedule();
      onOpenAtLatestCancelled?.(request);
    }, [clearLatestPositionSchedule, onOpenAtLatestCancelled]);

    const markUserScrollActivity = useCallback(() => {
      lastUserScrollEventAtRef.current = monotonicNow();
      if (!userScrollActiveRef.current) {
        userScrollActiveRef.current = true;
        cancelLatestPosition();
        reportScrollActivity(true);
      }
      scheduleScrollIdleCheck();
    }, [cancelLatestPosition, reportScrollActivity, scheduleScrollIdleCheck]);

    const confirmLatestPosition = useCallback(() => {
      const request = latestRequestRef.current;
      const scroller = scrollerRef.current;
      if (!request || !scroller || userScrollActiveRef.current) return false;
      if (
        Math.abs(maxScrollTop(scroller) - scroller.scrollTop) >
        SCROLL_POSITION_EPSILON_PX
      ) {
        return false;
      }
      latestRequestRef.current = null;
      clearLatestPositionSchedule();
      atBottomRef.current = true;
      onOpenAtLatestApplied?.(request);
      return true;
    }, [clearLatestPositionSchedule, onOpenAtLatestApplied]);

    const applyLatestPosition = useCallback(() => {
      const request = latestRequestRef.current;
      const scroller = scrollerRef.current;
      if (!request || !scroller || userScrollActiveRef.current) return;
      latestPositionAttemptRef.current += 1;
      scrollToTranscriptEnd(scroller);
      if (confirmLatestPosition()) return;
      if (latestPositionAttemptRef.current >= LATEST_TURN_POSITION_MAX_ATTEMPTS) {
        return;
      }
      latestPositionTimerRef.current = window.setTimeout(() => {
        latestPositionTimerRef.current = null;
        latestPositionFrameRef.current = window.requestAnimationFrame(() => {
          latestPositionFrameRef.current = null;
          applyLatestPosition();
        });
      }, LATEST_TURN_POSITION_RETRY_MS);
    }, [confirmLatestPosition]);

    useLayoutEffect(() => {
      clearLatestPositionSchedule();
      latestRequestRef.current = openAtLatestRequest;
      latestPositionAttemptRef.current = 0;
      const scroller = scrollerRef.current;
      if (!scroller || entries.length === 0 || !viewportStable) return;

      if (
        openAtLatestRequest &&
        openAtLatestRequest.transcriptVersion === transcriptVersion
      ) {
        scrollToTranscriptEnd(scroller);
        latestPositionFrameRef.current = window.requestAnimationFrame(() => {
          latestPositionFrameRef.current = null;
          if (!confirmLatestPosition()) applyLatestPosition();
        });
        return;
      }

      if (!initialRestoreAppliedRef.current) {
        initialRestoreAppliedRef.current = true;
        const restoredState = restoredStateRef.current;
        if (restoredState) {
          restoreTranscriptState(scroller, restoredState);
          atBottomRef.current = restoredState.atBottom;
        } else if (liveFollow) {
          scrollToTranscriptEnd(scroller);
          atBottomRef.current = true;
        }
      }
    }, [
      applyLatestPosition,
      clearLatestPositionSchedule,
      confirmLatestPosition,
      entries.length,
      liveFollow,
      openAtLatestRequest,
      transcriptVersion,
      viewportStable,
    ]);

    useLayoutEffect(() => {
      const scroller = scrollerRef.current;
      if (
        scroller &&
        liveFollow &&
        atBottomRef.current &&
        !userScrollActiveRef.current
      ) {
        scrollToTranscriptEnd(scroller);
      }
    }, [entries, liveFollow]);

    useEffect(() => {
      const scroller = scrollerRef.current;
      if (!scroller) return;

      const handleScroll = () => {
        atBottomRef.current = isNearTranscriptBottom(scroller);
        if (userScrollActiveRef.current) {
          lastUserScrollEventAtRef.current = monotonicNow();
          scheduleScrollIdleCheck();
        }
        confirmLatestPosition();
      };
      const handleWheel = () => markUserScrollActivity();
      const handleTouch = () => markUserScrollActivity();
      const handleKeyDown = (event: KeyboardEvent) => {
        if (
          isTranscriptScrollKey(event.key) &&
          !isEditableScrollTarget(event.target)
        ) {
          markUserScrollActivity();
        }
      };
      const handlePointerDown = (event: PointerEvent) => {
        const bounds = scroller.getBoundingClientRect();
        const scrollbarHitWidth = Math.max(
          14,
          scroller.offsetWidth - scroller.clientWidth,
        );
        if (event.clientX >= bounds.right - scrollbarHitWidth) {
          scrollbarPointerActiveRef.current = true;
          markUserScrollActivity();
        }
      };
      const handlePointerMove = () => {
        if (scrollbarPointerActiveRef.current) markUserScrollActivity();
      };
      const handlePointerUp = () => {
        if (!scrollbarPointerActiveRef.current) return;
        scrollbarPointerActiveRef.current = false;
        lastUserScrollEventAtRef.current = monotonicNow();
        scheduleScrollIdleCheck();
      };
      const handleScrollEnd = () => {
        if (userScrollActiveRef.current && !scrollbarPointerActiveRef.current) {
          finishUserScrollActivity();
        }
      };

      scroller.addEventListener("scroll", handleScroll, { passive: true });
      scroller.addEventListener("scrollend", handleScrollEnd);
      scroller.addEventListener("wheel", handleWheel, { passive: true });
      scroller.addEventListener("touchstart", handleTouch, { passive: true });
      scroller.addEventListener("touchmove", handleTouch, { passive: true });
      scroller.addEventListener("touchend", handleTouch, { passive: true });
      scroller.addEventListener("keydown", handleKeyDown);
      scroller.addEventListener("pointerdown", handlePointerDown);
      window.addEventListener("pointermove", handlePointerMove, { passive: true });
      window.addEventListener("pointerup", handlePointerUp, { passive: true });

      return () => {
        scroller.removeEventListener("scroll", handleScroll);
        scroller.removeEventListener("scrollend", handleScrollEnd);
        scroller.removeEventListener("wheel", handleWheel);
        scroller.removeEventListener("touchstart", handleTouch);
        scroller.removeEventListener("touchmove", handleTouch);
        scroller.removeEventListener("touchend", handleTouch);
        scroller.removeEventListener("keydown", handleKeyDown);
        scroller.removeEventListener("pointerdown", handlePointerDown);
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", handlePointerUp);
      };
    }, [
      confirmLatestPosition,
      finishUserScrollActivity,
      markUserScrollActivity,
      scheduleScrollIdleCheck,
    ]);

    useEffect(() => {
      const scroller = scrollerRef.current;
      if (!scroller || typeof ResizeObserver === "undefined") return;
      const observer = new ResizeObserver(() => {
        if (
          liveFollow &&
          atBottomRef.current &&
          !userScrollActiveRef.current
        ) {
          scrollToTranscriptEnd(scroller);
        }
      });
      const content = scroller.firstElementChild;
      if (content) observer.observe(content);
      observer.observe(scroller);
      return () => observer.disconnect();
    }, [liveFollow]);

    useLayoutEffect(
      () => () => {
        const scroller = scrollerRef.current;
        if (scroller) {
          writeCachedTranscriptState(
            cacheMetadataRef.current,
            captureTranscriptState(scroller),
          );
        }
        clearLatestPositionSchedule();
        clearScrollIdleCheck();
        if (reportedActivityRef.current) onScrollActivityChange?.(false);
      },
      [
        clearLatestPositionSchedule,
        clearScrollIdleCheck,
        onScrollActivityChange,
      ],
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

    const rows = useMemo(
      () =>
        entries.map((entry) => {
          const editable =
            Boolean(onEditPrompt) &&
            entry.clientId === editablePromptEntryId &&
            entry.status !== "connecting" &&
            entry.status !== "running";
          return (
            <NativeTranscriptRow
              key={entry.clientId}
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
              onStartEdit={handleStartEdit}
              onSubmitEdit={handleSubmitEdit}
              onLoadHistoricalActivity={onLoadHistoricalActivity}
            />
          );
        }),
      [
        editablePromptEntryId,
        editingEntryId,
        editingPrompt,
        entries,
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
        className="task-chat-transcript native-transcript"
        aria-label="Task chat transcript"
        ref={scrollerRef}
        tabIndex={0}
      >
        <div className="task-chat-native-list">{rows}</div>
      </section>
    );
  },
);

export function clearTranscriptStateCache() {
  transcriptStateCache.clear();
}
