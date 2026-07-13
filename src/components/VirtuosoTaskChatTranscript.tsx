import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Virtuoso,
  type StateSnapshot,
  type VirtuosoHandle,
} from "react-virtuoso";
import type { CodexMessage } from "../types";
import {
  TaskChatTurn,
  type TaskChatEntry,
} from "./TaskChatTranscript";

const TRANSCRIPT_STATE_CACHE_LIMIT = 5;
const TRANSCRIPT_WIDTH_BUCKET_SIZE = 32;
const TRANSCRIPT_DEFAULT_ITEM_HEIGHT = 360;

type CachedTranscriptState = {
  snapshot: StateSnapshot;
  entryCount: number;
};

const transcriptStateCache = new Map<string, CachedTranscriptState>();

function widthBucket(width: number) {
  return Math.max(
    TRANSCRIPT_WIDTH_BUCKET_SIZE,
    Math.round(width / TRANSCRIPT_WIDTH_BUCKET_SIZE) *
      TRANSCRIPT_WIDTH_BUCKET_SIZE,
  );
}

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

export type VirtuosoTaskChatTranscriptProps = {
  entries: TaskChatEntry[];
  transcriptIdentity: string;
  transcriptVersion: string;
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
    const entryCountRef = useRef(entries.length);
    entryCountRef.current = entries.length;
    const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
    const [editingPrompt, setEditingPrompt] = useState("");
    const [openAtLatestOnMount] = useState(openAtLatestRequestId !== null);
    const initialWidthBucket = useMemo(
      () => widthBucket(typeof window === "undefined" ? 1_024 : window.innerWidth),
      [],
    );
    const cacheKey = `${transcriptIdentity}:${transcriptVersion}:${initialWidthBucket}`;
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
        onOpenAtLatestApplied(openAtLatestRequestId);
      });
      return () => window.cancelAnimationFrame(frame);
    }, [onOpenAtLatestApplied, openAtLatestRequestId]);

    useEffect(() => {
      const handle = virtuosoRef.current;
      return () => {
        handle?.getState((snapshot) => {
          writeCachedTranscriptState(cacheKey, entryCountRef.current, snapshot);
        });
      };
    }, [cacheKey]);

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
          defaultItemHeight={TRANSCRIPT_DEFAULT_ITEM_HEIGHT}
          increaseViewportBy={{ top: 480, bottom: 480 }}
          minOverscanItemCount={{ top: 2, bottom: 2 }}
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
          isScrolling={onScrollActivityChange}
          itemContent={itemContent}
        />
      </section>
    );
  },
);

export function clearTranscriptStateCache() {
  transcriptStateCache.clear();
}
