import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Virtuoso,
  type Components as VirtuosoComponents,
  type ContextProp,
  type ListItem,
  type ScrollSeekConfiguration,
  type ScrollSeekPlaceholderProps,
  type StateSnapshot,
  type VirtuosoHandle,
} from "react-virtuoso";
import type { CodexMessage } from "../types";
import {
  cacheTranscriptRowHeight,
  calculateTranscriptDefaultItemHeight,
  getTranscriptWidthBucket,
} from "../lib/transcriptVirtualization";
import {
  TaskChatTurn,
  type TaskChatEntry,
} from "./TaskChatTranscript";

const TRANSCRIPT_STATE_CACHE_LIMIT = 5;
// Keep enough measured rows around the viewport for WebKit trackpad flings.
// Pixel overscan alone is not reliable for tall, variable-height Markdown turns.
export const TRANSCRIPT_FAST_SCROLL_BUFFER = {
  viewportPixels: 1_600,
  minimumItems: 12,
  renderChunkPixels: 1_000,
} as const;
export const TRANSCRIPT_FAST_SCROLL_SEEK = {
  enterVelocity: 600,
  exitVelocity: 30,
  rangeJumpItems: 6,
} as const;

const transcriptIncreaseViewportBy = {
  top: TRANSCRIPT_FAST_SCROLL_BUFFER.viewportPixels,
  bottom: TRANSCRIPT_FAST_SCROLL_BUFFER.viewportPixels,
} as const;
const transcriptMinimumOverscan = {
  top: TRANSCRIPT_FAST_SCROLL_BUFFER.minimumItems,
  bottom: TRANSCRIPT_FAST_SCROLL_BUFFER.minimumItems,
} as const;
const transcriptRenderChunk = {
  main: TRANSCRIPT_FAST_SCROLL_BUFFER.renderChunkPixels,
  reverse: TRANSCRIPT_FAST_SCROLL_BUFFER.renderChunkPixels,
} as const;
type TranscriptScrollSeekContext = {
  entriesByAbsoluteIndex: Map<number, TaskChatEntry>;
  entries: TaskChatEntry[];
};

type TranscriptViewportMode =
  | "opening"
  | "manual-scrolling"
  | "fast-seeking"
  | "live-following"
  | "settling";

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

function getScrollSeekEntry(
  index: number,
  { entries, entriesByAbsoluteIndex }: TranscriptScrollSeekContext,
) {
  return entriesByAbsoluteIndex.get(index) ?? entries[index];
}

const TranscriptScrollSeekPreview = memo(function TranscriptScrollSeekPreview({
  context,
  height,
  index,
  type,
}: ScrollSeekPlaceholderProps & ContextProp<TranscriptScrollSeekContext>) {
  const entry = type === "item" ? getScrollSeekEntry(index, context) : undefined;
  const summary =
    entry?.runView.finalMessage.trim() || entry?.runView.error?.trim() || "";

  return (
    <div
      aria-hidden="true"
      className="task-chat-virtuoso-row task-chat-scroll-seek-row"
      style={{ height }}
    >
      {entry ? (
        <div className="task-chat-run task-chat-scroll-seek-preview">
          <div className="submitted-prompt-stack">
            <article className="submitted-prompt task-chat-scroll-seek-prompt">
              {entry.prompt}
            </article>
          </div>
          {summary ? (
            <article className="chat-message assistant-message">
              <div className="run-summary task-chat-scroll-seek-summary">
                {summary}
              </div>
            </article>
          ) : null}
        </div>
      ) : null}
    </div>
  );
});

const transcriptVirtuosoComponents: VirtuosoComponents<
  TaskChatEntry,
  TranscriptScrollSeekContext
> = {
  ScrollSeekPlaceholder: TranscriptScrollSeekPreview,
};

export type VirtuosoTaskChatTranscriptProps = {
  entries: TaskChatEntry[];
  transcriptIdentity: string;
  transcriptVersion: string;
  viewportWidth?: number;
  viewportStable?: boolean;
  firstItemIndex: number;
  openAtLatestRequestId: number | null;
  liveFollow: boolean;
  onOpenAtLatestApplied?: (requestId: number) => void;
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
    openAtLatestRequestId,
    liveFollow,
    onOpenAtLatestApplied,
    onResolveRequest,
    onOpenFileLink,
    editablePromptEntryId = null,
    onEditPrompt,
    onLoadHistoricalActivity,
    onScrollActivityChange,
  }: VirtuosoTaskChatTranscriptProps) {
    const virtuosoRef = useRef<VirtuosoHandle | null>(null);
    const hostRef = useRef<HTMLElement | null>(null);
    const viewportModeRef = useRef<TranscriptViewportMode>(
      openAtLatestRequestId === null ? "settling" : "opening",
    );
    const scrollingRef = useRef(false);
    const fastSeekingRef = useRef(false);
    const reportedActivityRef = useRef(false);
    const lastSeekRangeStartRef = useRef<number | null>(null);
    const cacheMetadataRef = useRef({
      cacheKey: "",
      entryCount: entries.length,
    });
    const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
    const [editingPrompt, setEditingPrompt] = useState("");
    const [openAtLatestOnMount] = useState(openAtLatestRequestId !== null);
    const viewportWidthBucket = getTranscriptWidthBucket(viewportWidth);
    const geometryScope = `${transcriptIdentity}:${transcriptVersion}`;
    const cacheKey = `${transcriptIdentity}:${transcriptVersion}:${viewportWidthBucket}`;
    cacheMetadataRef.current = { cacheKey, entryCount: entries.length };
    const defaultItemHeight = useMemo(
      () =>
        calculateTranscriptDefaultItemHeight(
          entries,
          viewportWidthBucket,
          geometryScope,
        ),
      [entries, geometryScope, viewportWidthBucket],
    );
    const scrollSeekContext = useMemo<TranscriptScrollSeekContext>(
      () => ({
        entries,
        entriesByAbsoluteIndex: new Map(
          entries.map((entry, offset) => [firstItemIndex + offset, entry]),
        ),
      }),
      [entries, firstItemIndex],
    );
    const reportViewportActivity = useCallback(() => {
      const active = scrollingRef.current || fastSeekingRef.current;
      if (reportedActivityRef.current === active) return;
      reportedActivityRef.current = active;
      onScrollActivityChange?.(active);
    }, [onScrollActivityChange]);
    const scrollSeekConfiguration = useMemo<ScrollSeekConfiguration>(
      () => ({
        enter: (velocity, range) => {
          const previousStart = lastSeekRangeStartRef.current;
          lastSeekRangeStartRef.current = range.startIndex;
          const jumped =
            previousStart !== null &&
            Math.abs(range.startIndex - previousStart) >=
              TRANSCRIPT_FAST_SCROLL_SEEK.rangeJumpItems;
          const shouldSeek =
            Math.abs(velocity) >= TRANSCRIPT_FAST_SCROLL_SEEK.enterVelocity ||
            jumped;
          if (shouldSeek) {
            viewportModeRef.current = "fast-seeking";
            fastSeekingRef.current = true;
            reportViewportActivity();
          }
          return shouldSeek;
        },
        exit: (velocity) => {
          const shouldExit =
            Math.abs(velocity) <= TRANSCRIPT_FAST_SCROLL_SEEK.exitVelocity;
          if (shouldExit) {
            viewportModeRef.current = "settling";
            fastSeekingRef.current = false;
            reportViewportActivity();
          }
          return shouldExit;
        },
      }),
      [reportViewportActivity],
    );
    const restoredState = useMemo(
      () =>
        openAtLatestOnMount
          ? undefined
          : readCachedTranscriptState(cacheKey, entries.length),
      // State restoration is intentionally read only when a transcript identity mounts.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [cacheKey, openAtLatestOnMount],
    );

    useEffect(() => {
      if (openAtLatestRequestId === null || !onOpenAtLatestApplied) return;
      const frame = window.requestAnimationFrame(() => {
        viewportModeRef.current = "settling";
        onOpenAtLatestApplied(openAtLatestRequestId);
      });
      return () => window.cancelAnimationFrame(frame);
    }, [onOpenAtLatestApplied, openAtLatestRequestId]);

    useEffect(() => {
      const handle = virtuosoRef.current;
      return () => {
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
    }, [onScrollActivityChange]);

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
        if (!fastSeekingRef.current && items[0]) {
          lastSeekRangeStartRef.current = items[0].index;
        }
        items.forEach((item) => {
          if (item.data && item.size > 0) {
            cacheTranscriptRowHeight(
              item.data,
              viewportWidthBucket,
              item.size,
              geometryScope,
            );
          }
        });
      },
      [geometryScope, viewportStable, viewportWidthBucket],
    );

    const handleIsScrolling = useCallback(
      (active: boolean) => {
        scrollingRef.current = active;
        if (active) {
          if (viewportModeRef.current !== "fast-seeking") {
            viewportModeRef.current = "manual-scrolling";
          }
        } else if (viewportModeRef.current !== "opening") {
          viewportModeRef.current = liveFollow
            ? "live-following"
            : "settling";
        }
        reportViewportActivity();
      },
      [liveFollow, reportViewportActivity],
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
          context={scrollSeekContext}
          components={transcriptVirtuosoComponents}
          firstItemIndex={firstItemIndex}
          computeItemKey={(_index, entry) => entry.clientId}
          defaultItemHeight={defaultItemHeight}
          increaseViewportBy={transcriptIncreaseViewportBy}
          minOverscanItemCount={transcriptMinimumOverscan}
          overscan={transcriptRenderChunk}
          scrollSeekConfiguration={scrollSeekConfiguration}
          initialTopMostItemIndex={
            openAtLatestOnMount
              ? { index: "LAST", align: "end" }
              : undefined
          }
          restoreStateFrom={restoredState}
          alignToBottom
          atBottomThreshold={48}
          followOutput={(isAtBottom) =>
            liveFollow && isAtBottom ? "auto" : false
          }
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
