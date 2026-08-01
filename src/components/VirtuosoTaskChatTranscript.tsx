import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { ArrowDown } from "lucide-react";
import {
  Virtuoso,
  type ListRange,
  type StateSnapshot,
  type VirtuosoHandle,
} from "react-virtuoso";
import type { HistoricalChatOpenRequest } from "../types";
import type { ApprovalResolutionHandler } from "../lib/codexApprovals";
import type { RunEditedFile } from "../lib/codexEventReducer";
import type { RunWebPreview } from "../lib/webPreview";
import {
  requestKey,
  type NativeUserInputRequest,
  type UserInputResponse,
} from "../lib/nativePlanMode";
import {
  calculateTranscriptDefaultItemHeight,
  calculateTranscriptOverscanItemCount,
  estimateTranscriptRowHeight,
  getTranscriptWidthBucket,
} from "../lib/transcriptVirtualization";
import {
  TaskChatTurn,
  editedFilesDisclosureKey,
  nativePlanDisclosureKey,
  type NativePlanDisclosureChangeHandler,
  type PendingInteractionPageChangeHandler,
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
export const COMPLETION_FOLLOW_MAX_ATTEMPTS = 4;
const INITIAL_POSITION_READY_MAX_FRAMES = 180;
const INITIAL_POSITION_OFFSET_TOLERANCE_PX = 2;

const transcriptIncreaseViewportBy = {
  top: TRANSCRIPT_RENDER_AHEAD_PX,
  bottom: TRANSCRIPT_RENDER_AHEAD_PX,
} as const;

function TranscriptTopSpacer() {
  return <div className="task-chat-transcript-top-spacer" aria-hidden="true" />;
}

function TranscriptBottomSpacer() {
  return (
    <div className="task-chat-transcript-bottom-spacer" aria-hidden="true" />
  );
}

const transcriptComponents = {
  Header: TranscriptTopSpacer,
  Footer: TranscriptBottomSpacer,
};

type StableDefaultItemHeight = {
  key: string;
  height: number;
};

type StableHeightEstimates = {
  key: string;
  heights: number[];
};

type LiveTailInteractionRevision = {
  entryId: string | null;
  revision: number;
  seenKeys: Set<string>;
};

type CachedTranscriptState = {
  snapshot: StateSnapshot;
  entryCount: number;
};

type InitialTranscriptPosition =
  | { kind: "default" }
  | { kind: "latest" }
  | {
      kind: "restore";
      snapshot: StateSnapshot;
      location: { index: number; align: "start"; offset: number };
    };

type TranscriptCacheMetadata = Omit<
  TranscriptViewportSnapshot,
  "snapshot" | "workspaceId"
> & {
  cacheKey: string;
  workspaceId: number | null;
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

function createRestoredTranscriptPosition(
  snapshot: StateSnapshot,
  fallbackHeights: number[],
): Extract<InitialTranscriptPosition, { kind: "restore" }> {
  const heightEstimates = [...fallbackHeights];
  for (const range of snapshot.ranges) {
    if (!Number.isFinite(range.size) || range.size <= 0) continue;
    const startIndex = Math.max(0, Math.floor(range.startIndex));
    const endIndex = Math.min(
      heightEstimates.length - 1,
      Number.isFinite(range.endIndex)
        ? Math.floor(range.endIndex)
        : heightEstimates.length - 1,
    );
    for (let index = startIndex; index <= endIndex; index += 1) {
      heightEstimates[index] = range.size;
    }
  }

  const scrollTop = Math.max(0, snapshot.scrollTop);
  let itemTop = 0;
  let index = 0;
  for (; index < heightEstimates.length - 1; index += 1) {
    const itemBottom = itemTop + heightEstimates[index];
    if (scrollTop < itemBottom) break;
    itemTop = itemBottom;
  }

  return {
    kind: "restore",
    snapshot,
    location: {
      index,
      align: "start",
      offset: Math.max(0, scrollTop - itemTop),
    },
  };
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
  restoredViewportSnapshot?: TranscriptViewportSnapshot | null;
  onViewportSnapshotChange?: (
    snapshot: TranscriptViewportSnapshot,
  ) => void;
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
  onRevisePlan?: (
    entry: TaskChatEntry,
    revision: string,
  ) => boolean | void;
  onCancelPlan?: (entry: TaskChatEntry) => void;
  onOpenFileLink?: (href: string) => boolean;
  onOpenWebPreview?: (
    entry: TaskChatEntry,
    preview: RunWebPreview,
  ) => Promise<void> | void;
  onReviewEditedFile?: (
    entry: TaskChatEntry,
    file: RunEditedFile,
  ) => Promise<void> | void;
  onUndoEditedFiles?: (entry: TaskChatEntry) => Promise<void> | void;
  fileUndoDisabled?: boolean;
  editablePromptEntryId?: string | null;
  onEditPrompt?: (entry: TaskChatEntry, prompt: string) => void;
  onLoadHistoricalActivity?: (entry: TaskChatEntry) => void;
  onScrollActivityChange?: (active: boolean) => void;
  notificationFocusRequest?: TranscriptNotificationFocusRequest | null;
  onNotificationFocusApplied?: (
    request: TranscriptNotificationFocusRequest,
    found: boolean,
  ) => void;
};

type VirtuosoTaskChatTranscriptInstanceProps =
  VirtuosoTaskChatTranscriptProps & {
    onInitialPositionReady?: () => void;
    preparing?: boolean;
  };

export type TranscriptViewportSnapshot = {
  workspaceId: number;
  transcriptIdentity: string;
  transcriptVersion: string;
  viewportWidthBucket: number;
  entryCount: number;
  snapshot: StateSnapshot;
};

export type VirtuosoTaskChatTranscriptHandle = {
  captureViewportState: () => void;
  stabilizeForSubmission: () => void;
  settleAfterSubmission: () => void;
};

export type TranscriptNotificationFocusRequest = {
  requestId: number;
  kind: "response" | "approval" | "user-input" | "plan";
  entryClientId?: string | null;
  runId?: number | null;
  turnId?: string | null;
  targetId?: string | null;
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
  onOpenWebPreview,
  onReviewEditedFile,
  onUndoEditedFiles,
  fileUndoDisabled,
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
  onAnswerUserInput?: VirtuosoTaskChatTranscriptProps["onAnswerUserInput"];
  onImplementPlan?: VirtuosoTaskChatTranscriptProps["onImplementPlan"];
  onRevisePlan?: VirtuosoTaskChatTranscriptProps["onRevisePlan"];
  onCancelPlan?: VirtuosoTaskChatTranscriptProps["onCancelPlan"];
  onOpenFileLink?: (href: string) => boolean;
  onOpenWebPreview?: VirtuosoTaskChatTranscriptProps["onOpenWebPreview"];
  onReviewEditedFile?: VirtuosoTaskChatTranscriptProps["onReviewEditedFile"];
  onUndoEditedFiles?: VirtuosoTaskChatTranscriptProps["onUndoEditedFiles"];
  fileUndoDisabled: boolean;
  onLoadHistoricalActivity?: (entry: TaskChatEntry) => void;
  planExpanded: boolean;
  editedFilesExpanded: boolean;
  onPlanDisclosureChange: NativePlanDisclosureChangeHandler;
  onPendingInteractionPageChange: PendingInteractionPageChangeHandler;
}) {
  return (
    <div
      className="task-chat-virtuoso-row"
      data-transcript-entry-id={entry.clientId}
      tabIndex={-1}
    >
      <TaskChatTurn
        editable={editable}
        editing={editing}
        editingPrompt={editing ? editingPrompt : ""}
        entry={entry}
        onCancelEdit={onCancelEdit}
        onEditingPromptChange={onEditingPromptChange}
        onOpenFileLink={onOpenFileLink}
        onOpenWebPreview={onOpenWebPreview}
        onResolveRequest={onResolveRequest}
        onAnswerUserInput={onAnswerUserInput}
        onImplementPlan={onImplementPlan}
        onRevisePlan={onRevisePlan}
        onCancelPlan={onCancelPlan}
        onReviewEditedFile={onReviewEditedFile}
        onUndoEditedFiles={onUndoEditedFiles}
        fileUndoDisabled={fileUndoDisabled}
        onStartEdit={onStartEdit}
        onSubmitEdit={onSubmitEdit}
        onLoadHistoricalActivity={onLoadHistoricalActivity}
        planExpanded={planExpanded}
        editedFilesExpanded={editedFilesExpanded}
        onPlanDisclosureChange={onPlanDisclosureChange}
        onPendingInteractionPageChange={onPendingInteractionPageChange}
      />
    </div>
  );
});

const VirtuosoTaskChatTranscriptImpl = forwardRef<
  VirtuosoTaskChatTranscriptHandle,
  VirtuosoTaskChatTranscriptInstanceProps
>(function VirtuosoTaskChatTranscript({
    entries,
    transcriptIdentity,
    transcriptVersion,
    restoredViewportSnapshot = null,
    onViewportSnapshotChange,
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
    onOpenWebPreview,
    onReviewEditedFile,
    onUndoEditedFiles,
    fileUndoDisabled = false,
    editablePromptEntryId = null,
    onEditPrompt,
    onLoadHistoricalActivity,
    onScrollActivityChange,
    notificationFocusRequest = null,
    onNotificationFocusApplied,
    onInitialPositionReady,
    preparing = false,
  }, forwardedRef) {
    const virtuosoRef = useRef<VirtuosoHandle | null>(null);
    const scrollerRef = useRef<HTMLElement | null>(null);
    const detachScrollerListenersRef = useRef<(() => void) | null>(null);
    const activeLatestRequestRef = useRef<HistoricalChatOpenRequest | null>(
      openAtLatestRequest,
    );
    const latestPositionFrameRef = useRef<number | null>(null);
    const latestPositionRetryTimerRef = useRef<number | null>(null);
    const liveFollowFrameRef = useRef<number | null>(null);
    const completionFollowFrameRef = useRef<number | null>(null);
    const completionFollowRetryTimerRef = useRef<number | null>(null);
    const planAnchorFrameRef = useRef<number | null>(null);
    const planAnchorSettleFrameRef = useRef<number | null>(null);
    const interactionAnchorFrameRef = useRef<number | null>(null);
    const submissionAnchorFrameRef = useRef<number | null>(null);
    const submissionAnchorRef = useRef<
      | { mode: "follow" }
      | { mode: "preserve"; element: HTMLElement; top: number }
      | null
    >(null);
    const suppressInteractionFollowRef = useRef(false);
    const notificationFocusTimerRef = useRef<number | null>(null);
    const initialPositionFrameRef = useRef<number | null>(null);
    const initialPositionAttemptCountRef = useRef(0);
    const initialPositionReadyRef = useRef(false);
    const latestPositionAttemptCountRef = useRef(0);
    const latestTurnVisibleRef = useRef(false);
    const atBottomRef = useRef(false);
    const bottomStateKnownRef = useRef(false);
    const liveFollowEnabledRef = useRef(liveFollow);
    const liveFollowIntentRef = useRef(liveFollow);
    const previousLiveFollowRef = useRef(liveFollow);
    const completionFollowPendingRef = useRef(false);
    const completionFollowAttemptCountRef = useRef(0);
    const viewportStableRef = useRef(viewportStable);
    const virtuosoScrollingRef = useRef(false);
    const userScrollActiveRef = useRef(false);
    const scrollbarPointerActiveRef = useRef(false);
    const scrollIdleCheckRef = useRef<number | null>(null);
    const lastUserScrollEventAtRef = useRef(0);
    const lastTouchYRef = useRef<number | null>(null);
    const reportedActivityRef = useRef(false);
    const stableDefaultItemHeightRef = useRef<StableDefaultItemHeight | null>(
      null,
    );
    const stableHeightEstimatesRef = useRef<StableHeightEstimates | null>(null);
    const initialPositionRef = useRef<InitialTranscriptPosition | null>(null);
    const liveTailInteractionRevisionRef =
      useRef<LiveTailInteractionRevision>({
        entryId: null,
        revision: 0,
        seenKeys: new Set(),
      });
    const cacheMetadataRef = useRef<TranscriptCacheMetadata>({
      cacheKey: "",
      workspaceId: entries[0]?.workspaceId ?? null,
      transcriptIdentity,
      transcriptVersion,
      viewportWidthBucket: getTranscriptWidthBucket(viewportWidth),
      entryCount: entries.length,
    });
    const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
    const [editingPrompt, setEditingPrompt] = useState("");
    const [showJumpToLatest, setShowJumpToLatest] = useState(false);
    const [expandedPlanKeys, setExpandedPlanKeys] = useState<Set<string>>(
      () => new Set(),
    );
    liveFollowEnabledRef.current = liveFollow;
    viewportStableRef.current = viewportStable;

    const viewportWidthBucket = getTranscriptWidthBucket(viewportWidth);
    const geometryScope = `${transcriptIdentity}:${transcriptVersion}`;
    const cacheKey = `${geometryScope}:${viewportWidthBucket}`;
    cacheMetadataRef.current = {
      cacheKey,
      workspaceId: entries[0]?.workspaceId ?? null,
      transcriptIdentity,
      transcriptVersion,
      viewportWidthBucket,
      entryCount: entries.length,
    };

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
    const liveTailEntry = entries[entries.length - 1];
    const liveTailRunView = liveTailEntry?.runView;
    const liveTailInteractionRevision = useMemo(() => {
      const entryId = liveTailEntry?.clientId ?? null;
      const interactionKeys = liveTailRunView
        ? [
            ...liveTailRunView.approvalRequests.map(
              (request) => `approval:${request.key}`,
            ),
            ...liveTailRunView.serverRequests.map(
              (request) => `server-request:${requestKey(request)}`,
            ),
            ...Object.entries(
              liveTailRunView.approvalResourcesByItemId,
            ).flatMap(([itemId, resources]) =>
              resources.map(
                (_resource, index) => `approval-resource:${itemId}:${index}`,
              ),
            ),
          ]
        : [];
      let revision = liveTailInteractionRevisionRef.current;
      if (revision.entryId !== entryId) {
        revision = {
          entryId,
          revision: revision.revision + 1,
          seenKeys: new Set(interactionKeys),
        };
        liveTailInteractionRevisionRef.current = revision;
        return revision.revision;
      }

      const hasNewInteraction = interactionKeys.some(
        (key) => !revision.seenKeys.has(key),
      );
      if (hasNewInteraction) {
        interactionKeys.forEach((key) => revision.seenKeys.add(key));
        revision = { ...revision, revision: revision.revision + 1 };
        liveTailInteractionRevisionRef.current = revision;
      }
      return revision.revision;
    }, [
      liveTailEntry?.clientId,
      liveTailRunView?.approvalRequests,
      liveTailRunView?.approvalResourcesByItemId,
      liveTailRunView?.serverRequests,
    ]);
    // Local interaction state and resolved questions must not be mistaken for
    // new transcript output. Interaction revision advances only when Codex adds
    // a request or resource, never when the user selects or resolves one.
    const liveTailContentRevision = useMemo(
      () => Symbol("live-tail-content"),
      [
        liveTailEntry?.clientId,
        liveTailRunView?.streamEvents,
        liveTailRunView?.editedFiles,
        liveTailRunView?.commands,
        liveTailRunView?.finalMessage,
        liveTailRunView?.error,
        liveTailInteractionRevision,
        liveTailRunView?.nativePlan.previewText,
        liveTailRunView?.nativePlan.completedText,
        liveTailRunView?.nativePlan.reviewState,
      ],
    );

    if (initialPositionRef.current === null) {
      if (
        openAtLatestRequest?.transcriptVersion === transcriptVersion &&
        entries.length > 0
      ) {
        initialPositionRef.current = { kind: "latest" };
      } else {
        let snapshot: StateSnapshot | undefined;
        if (
          restoredViewportSnapshot &&
          restoredViewportSnapshot.transcriptIdentity === transcriptIdentity &&
          restoredViewportSnapshot.transcriptVersion === transcriptVersion &&
          restoredViewportSnapshot.viewportWidthBucket === viewportWidthBucket &&
          restoredViewportSnapshot.entryCount === entries.length
        ) {
          snapshot = restoredViewportSnapshot.snapshot;
        } else {
          snapshot = readCachedTranscriptState(cacheKey, entries.length);
        }
        initialPositionRef.current = snapshot
          ? createRestoredTranscriptPosition(snapshot, heightEstimates)
          : { kind: "default" };
      }
    }
    const initialPosition = initialPositionRef.current;
    const initialPositionProps =
      initialPosition.kind === "latest"
        ? {
            initialTopMostItemIndex: {
              index: "LAST" as const,
              align: "end" as const,
            },
          }
        : initialPosition.kind === "restore"
          ? { restoreStateFrom: initialPosition.snapshot }
          : { initialItemCount: Math.min(entries.length, 20) };

    const clearInitialPositionSchedule = useCallback(() => {
      if (initialPositionFrameRef.current === null) return;
      window.cancelAnimationFrame(initialPositionFrameRef.current);
      initialPositionFrameRef.current = null;
    }, []);
    const reportInitialPositionReady = useCallback(() => {
      if (initialPositionReadyRef.current) return;
      initialPositionReadyRef.current = true;
      clearInitialPositionSchedule();
      onInitialPositionReady?.();
    }, [clearInitialPositionSchedule, onInitialPositionReady]);
    const initialPositionIsReady = useCallback(() => {
      const scroller = scrollerRef.current;
      if (!scroller || entries.length === 0) return false;
      if (initialPosition.kind === "latest") {
        return latestTurnVisibleRef.current && atBottomRef.current;
      }

      const viewport = scroller.getBoundingClientRect();
      const rows = Array.from(
        scroller.querySelectorAll<HTMLElement>("[data-transcript-entry-id]"),
      );
      if (viewport.width <= 0 || viewport.height <= 0) {
        return rows.length > 0;
      }
      if (initialPosition.kind === "restore") {
        const targetEntry = entries[initialPosition.location.index];
        if (!targetEntry) return false;
        const row = rows.find(
          (candidate) =>
            candidate.dataset.transcriptEntryId === targetEntry.clientId,
        );
        if (!row) return false;
        const bounds = row.getBoundingClientRect();
        const expectedOffset = -initialPosition.location.offset;
        return (
          bounds.bottom > viewport.top &&
          bounds.top < viewport.bottom &&
          Math.abs(bounds.top - viewport.top - expectedOffset) <=
            INITIAL_POSITION_OFFSET_TOLERANCE_PX
        );
      }

      return rows.some((row) => {
        const bounds = row.getBoundingClientRect();
        return bounds.bottom > viewport.top && bounds.top < viewport.bottom;
      });
    }, [entries, initialPosition]);
    const queueInitialPositionCheck = useCallback(() => {
      if (
        initialPositionReadyRef.current ||
        initialPositionFrameRef.current !== null ||
        !viewportStableRef.current
      ) {
        return;
      }

      const check = () => {
        initialPositionFrameRef.current = null;
        if (initialPositionReadyRef.current) return;
        if (initialPositionIsReady()) {
          reportInitialPositionReady();
          return;
        }
        initialPositionAttemptCountRef.current += 1;
        if (
          initialPositionAttemptCountRef.current <
          INITIAL_POSITION_READY_MAX_FRAMES
        ) {
          initialPositionFrameRef.current = window.requestAnimationFrame(check);
        }
      };
      initialPositionFrameRef.current = window.requestAnimationFrame(check);
    }, [initialPositionIsReady, reportInitialPositionReady]);

    useEffect(() => {
      queueInitialPositionCheck();
      return clearInitialPositionSchedule;
    }, [
      clearInitialPositionSchedule,
      queueInitialPositionCheck,
      viewportStable,
    ]);

    const publishViewportSnapshot = useCallback(
      (metadata: TranscriptCacheMetadata, snapshot: StateSnapshot) => {
        writeCachedTranscriptState(
          metadata.cacheKey,
          metadata.entryCount,
          snapshot,
        );
        if (metadata.workspaceId === null) return;
        onViewportSnapshotChange?.({
          workspaceId: metadata.workspaceId,
          transcriptIdentity: metadata.transcriptIdentity,
          transcriptVersion: metadata.transcriptVersion,
          viewportWidthBucket: metadata.viewportWidthBucket,
          entryCount: metadata.entryCount,
          snapshot,
        });
      },
      [onViewportSnapshotChange],
    );
    const captureViewportState = useCallback(() => {
      const handle = virtuosoRef.current;
      if (!handle) return;
      const metadata = { ...cacheMetadataRef.current };
      handle.getState((snapshot) => {
        publishViewportSnapshot(metadata, snapshot);
      });
    }, [publishViewportSnapshot]);
    const clearSubmissionAnchorSchedule = useCallback(() => {
      if (submissionAnchorFrameRef.current !== null) {
        window.cancelAnimationFrame(submissionAnchorFrameRef.current);
        submissionAnchorFrameRef.current = null;
      }
    }, []);
    const cancelSubmissionAnchor = useCallback(() => {
      clearSubmissionAnchorSchedule();
      submissionAnchorRef.current = null;
      suppressInteractionFollowRef.current = false;
    }, [clearSubmissionAnchorSchedule]);
    const stabilizeForSubmission = useCallback(() => {
      cancelSubmissionAnchor();
      const shouldFollow = liveFollowIntentRef.current;
      if (shouldFollow) {
        submissionAnchorRef.current = { mode: "follow" };
        return;
      }

      const scroller = scrollerRef.current;
      if (!scroller) {
        submissionAnchorRef.current = null;
        return;
      }
      const viewport = scroller.getBoundingClientRect();
      const anchor = Array.from(
        scroller.querySelectorAll<HTMLElement>(
          "[data-transcript-entry-id]",
        ),
      ).find((row) => {
        const bounds = row.getBoundingClientRect();
        return bounds.bottom > viewport.top && bounds.top < viewport.bottom;
      });
      submissionAnchorRef.current = anchor
        ? {
            mode: "preserve",
            element: anchor,
            top: anchor.getBoundingClientRect().top,
          }
        : null;
      suppressInteractionFollowRef.current =
        submissionAnchorRef.current?.mode === "preserve";
    }, [cancelSubmissionAnchor]);
    const settleAfterSubmission = useCallback(() => {
      clearSubmissionAnchorSchedule();
      const anchor = submissionAnchorRef.current;
      if (!anchor) return;

      const settle = () => {
        submissionAnchorFrameRef.current = null;
        const current = submissionAnchorRef.current;
        if (!current) {
          suppressInteractionFollowRef.current = false;
          return;
        }
        if (current.mode === "follow") {
          if (entries.length > 0) {
            virtuosoRef.current?.scrollToIndex({
              index: "LAST",
              align: "end",
              behavior: "auto",
            });
          }
        } else if (current.element.isConnected) {
          const offset =
            current.element.getBoundingClientRect().top - current.top;
          if (Math.abs(offset) >= 0.5) {
            virtuosoRef.current?.scrollBy({
              top: offset,
              behavior: "auto",
            });
          }
        }

        submissionAnchorRef.current = null;
        suppressInteractionFollowRef.current = false;
      };

      submissionAnchorFrameRef.current =
        window.requestAnimationFrame(settle);
    }, [clearSubmissionAnchorSchedule, entries.length]);
    useImperativeHandle(
      forwardedRef,
      () => ({
        captureViewportState,
        stabilizeForSubmission,
        settleAfterSubmission,
      }),
      [
        captureViewportState,
        settleAfterSubmission,
        stabilizeForSubmission,
      ],
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

    const clearLiveFollowSchedule = useCallback(() => {
      if (liveFollowFrameRef.current === null) return;
      window.cancelAnimationFrame(liveFollowFrameRef.current);
      liveFollowFrameRef.current = null;
    }, []);

    const clearCompletionFollowSchedule = useCallback((cancelPending = true) => {
      if (completionFollowFrameRef.current !== null) {
        window.cancelAnimationFrame(completionFollowFrameRef.current);
        completionFollowFrameRef.current = null;
      }
      if (completionFollowRetryTimerRef.current !== null) {
        window.clearTimeout(completionFollowRetryTimerRef.current);
        completionFollowRetryTimerRef.current = null;
      }
      if (cancelPending) {
        completionFollowPendingRef.current = false;
        completionFollowAttemptCountRef.current = 0;
      }
    }, []);

    const scrollToLatest = useCallback(() => {
      if (entries.length === 0) return;
      virtuosoRef.current?.scrollToIndex({
        index: "LAST",
        align: "end",
        behavior: "auto",
      });
    }, [entries.length]);

    const queueLiveFollow = useCallback(() => {
      if (liveFollowFrameRef.current !== null) return;
      liveFollowFrameRef.current = window.requestAnimationFrame(() => {
        liveFollowFrameRef.current = null;
        if (
          !liveFollowEnabledRef.current ||
          !liveFollowIntentRef.current ||
          userScrollActiveRef.current
        ) {
          return;
        }
        scrollToLatest();
      });
    }, [scrollToLatest]);

    const queueCompletionFollow = useCallback(() => {
      if (
        !completionFollowPendingRef.current ||
        completionFollowFrameRef.current !== null ||
        completionFollowRetryTimerRef.current !== null
      ) {
        return;
      }

      const followCompletedTail = () => {
        completionFollowFrameRef.current = null;
        if (
          !completionFollowPendingRef.current ||
          !liveFollowIntentRef.current
        ) {
          clearCompletionFollowSchedule();
          return;
        }
        if (userScrollActiveRef.current) return;
        if (!viewportStableRef.current) return;

        scrollToLatest();
        completionFollowAttemptCountRef.current += 1;
        if (
          completionFollowAttemptCountRef.current >=
          COMPLETION_FOLLOW_MAX_ATTEMPTS
        ) {
          completionFollowPendingRef.current = false;
          return;
        }

        completionFollowRetryTimerRef.current = window.setTimeout(() => {
          completionFollowRetryTimerRef.current = null;
          completionFollowFrameRef.current = window.requestAnimationFrame(
            followCompletedTail,
          );
        }, LATEST_TURN_POSITION_RETRY_MS);
      };

      completionFollowFrameRef.current = window.requestAnimationFrame(
        followCompletedTail,
      );
    }, [clearCompletionFollowSchedule, scrollToLatest]);

    const disableLiveFollow = useCallback(() => {
      bottomStateKnownRef.current = true;
      atBottomRef.current = false;
      liveFollowIntentRef.current = false;
      clearLiveFollowSchedule();
      clearCompletionFollowSchedule();
      if (liveFollowEnabledRef.current) setShowJumpToLatest(true);
    }, [clearCompletionFollowSchedule, clearLiveFollowSchedule]);

    const enableLiveFollow = useCallback(() => {
      liveFollowIntentRef.current = true;
      setShowJumpToLatest(false);
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

    const clearInteractionAnchorCorrection = useCallback(() => {
      if (interactionAnchorFrameRef.current !== null) {
        window.cancelAnimationFrame(interactionAnchorFrameRef.current);
        interactionAnchorFrameRef.current = null;
      }
      suppressInteractionFollowRef.current = false;
    }, []);

    const handlePendingInteractionPageChange =
      useCallback<PendingInteractionPageChangeHandler>(
        ({ anchorElement, anchorTop }) => {
          clearInteractionAnchorCorrection();
          suppressInteractionFollowRef.current = true;

          let remainingFrames = 3;
          const preserveAnchor = () => {
            interactionAnchorFrameRef.current = null;
            if (!anchorElement.isConnected) {
              suppressInteractionFollowRef.current = false;
              return;
            }

            const offset =
              anchorElement.getBoundingClientRect().top - anchorTop;
            if (Math.abs(offset) >= 0.5) {
              virtuosoRef.current?.scrollBy({
                top: offset,
                behavior: "auto",
              });
            }

            remainingFrames -= 1;
            if (remainingFrames > 0) {
              interactionAnchorFrameRef.current =
                window.requestAnimationFrame(preserveAnchor);
              return;
            }
            suppressInteractionFollowRef.current = false;
          };

          interactionAnchorFrameRef.current =
            window.requestAnimationFrame(preserveAnchor);
        },
        [clearInteractionAnchorCorrection],
      );

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
      captureViewportState();
      if (
        completionFollowPendingRef.current &&
        liveFollowIntentRef.current
      ) {
        queueCompletionFollow();
      }
      if (
        liveFollowEnabledRef.current &&
        liveFollowIntentRef.current
      ) {
        queueLiveFollow();
      }
    }, [
      captureViewportState,
      clearScrollIdleCheck,
      queueCompletionFollow,
      queueLiveFollow,
      reportScrollActivity,
    ]);

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
      captureViewportState();
      return true;
    }, [
      captureViewportState,
      clearLatestPositionSchedule,
      onOpenAtLatestApplied,
    ]);

    const cancelLatestPosition = useCallback(() => {
      const request = activeLatestRequestRef.current;
      if (!request) return;
      activeLatestRequestRef.current = null;
      clearLatestPositionSchedule();
      onOpenAtLatestCancelled?.(request);
    }, [clearLatestPositionSchedule, onOpenAtLatestCancelled]);

    const markUserScrollActivity = useCallback(
      (movesAwayFromLatest = false) => {
        cancelSubmissionAnchor();
        clearInteractionAnchorCorrection();
        if (movesAwayFromLatest) disableLiveFollow();
        lastUserScrollEventAtRef.current = monotonicNow();
        if (!userScrollActiveRef.current) {
          userScrollActiveRef.current = true;
          cancelLatestPosition();
        }
        reportScrollActivity();
        scheduleScrollIdleCheck();
      },
      [
        cancelSubmissionAnchor,
        cancelLatestPosition,
        clearInteractionAnchorCorrection,
        disableLiveFollow,
        reportScrollActivity,
        scheduleScrollIdleCheck,
      ],
    );

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

        const handleWheel = (event: WheelEvent) =>
          markUserScrollActivity(event.deltaY < 0);
        const handleTouchStart = (event: TouchEvent) => {
          lastTouchYRef.current = event.touches[0]?.clientY ?? null;
          markUserScrollActivity();
        };
        const handleTouchMove = (event: TouchEvent) => {
          const nextY = event.touches[0]?.clientY ?? null;
          const previousY = lastTouchYRef.current;
          lastTouchYRef.current = nextY;
          markUserScrollActivity(
            previousY !== null && nextY !== null && nextY > previousY,
          );
        };
        const handleTouchEnd = () => {
          lastTouchYRef.current = null;
          markUserScrollActivity();
        };
        const handleTouchCancel = () => {
          lastTouchYRef.current = null;
          lastUserScrollEventAtRef.current = monotonicNow();
          scheduleScrollIdleCheck();
        };
        const handleKeyDown = (event: KeyboardEvent) => {
          if (
            isTranscriptScrollKey(event.key) &&
            !isEditableScrollTarget(event.target)
          ) {
            const movesAwayFromLatest =
              event.key === "ArrowUp" ||
              event.key === "PageUp" ||
              event.key === "Home" ||
              (event.key === " " && event.shiftKey);
            markUserScrollActivity(movesAwayFromLatest);
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
            markUserScrollActivity(true);
          }
        };
        const handlePointerMove = () => {
          if (scrollbarPointerActiveRef.current) markUserScrollActivity(true);
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
        nextScroller.addEventListener("touchstart", handleTouchStart, {
          passive: true,
        });
        nextScroller.addEventListener("touchmove", handleTouchMove, {
          passive: true,
        });
        nextScroller.addEventListener("touchend", handleTouchEnd, {
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
          nextScroller.removeEventListener("touchstart", handleTouchStart);
          nextScroller.removeEventListener("touchmove", handleTouchMove);
          nextScroller.removeEventListener("touchend", handleTouchEnd);
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
      if (!liveFollow) {
        if (
          previousLiveFollowRef.current &&
          liveFollowIntentRef.current
        ) {
          clearCompletionFollowSchedule(false);
          completionFollowPendingRef.current = true;
          completionFollowAttemptCountRef.current = 0;
        }
        previousLiveFollowRef.current = false;
        clearLiveFollowSchedule();
        setShowJumpToLatest(!liveFollowIntentRef.current);
        if (completionFollowPendingRef.current && viewportStable) {
          queueCompletionFollow();
        }
        return;
      }

      clearCompletionFollowSchedule();
      if (!previousLiveFollowRef.current) {
        const shouldFollow =
          bottomStateKnownRef.current
            ? atBottomRef.current
            : liveFollowIntentRef.current;
        liveFollowIntentRef.current = shouldFollow;
        setShowJumpToLatest(!shouldFollow);
      }
      previousLiveFollowRef.current = true;

      if (liveFollowIntentRef.current && viewportStable) {
        queueLiveFollow();
      }
    }, [
      clearCompletionFollowSchedule,
      clearLiveFollowSchedule,
      liveTailContentRevision,
      liveFollow,
      queueCompletionFollow,
      queueLiveFollow,
      viewportStable,
    ]);

    useEffect(() => {
      if (notificationFocusTimerRef.current !== null) {
        window.clearTimeout(notificationFocusTimerRef.current);
        notificationFocusTimerRef.current = null;
      }
      if (!notificationFocusRequest || openAtLatestRequest || entries.length === 0) {
        return;
      }

      const entryIndex = entries.findIndex((entry) => {
        if (
          notificationFocusRequest.entryClientId &&
          entry.clientId === notificationFocusRequest.entryClientId
        ) {
          return true;
        }
        if (
          notificationFocusRequest.runId !== null &&
          notificationFocusRequest.runId !== undefined &&
          entry.runId === notificationFocusRequest.runId
        ) {
          return true;
        }
        return Boolean(
          notificationFocusRequest.turnId &&
            entry.runView.turnId === notificationFocusRequest.turnId,
        );
      });
      if (entryIndex < 0) {
        onNotificationFocusApplied?.(notificationFocusRequest, false);
        return;
      }

      let disposed = false;
      let attempts = 0;
      const focusTarget = () => {
        if (disposed) return;
        attempts += 1;
        virtuosoRef.current?.scrollToIndex({
          index: firstItemIndex + entryIndex,
          align: "center",
          behavior: "auto",
        });

        window.requestAnimationFrame(() => {
          if (disposed) return;
          const rows = Array.from(
            scrollerRef.current?.querySelectorAll<HTMLElement>(
              "[data-transcript-entry-id]",
            ) ?? [],
          );
          const row = rows.find(
            (candidate) =>
              candidate.dataset.transcriptEntryId === entries[entryIndex]?.clientId,
          );
          let target: HTMLElement | null = row ?? null;
          if (row && notificationFocusRequest.kind !== "response") {
            const candidates = Array.from(
              row.querySelectorAll<HTMLElement>(
                `[data-agent-notification-target="${notificationFocusRequest.kind}"]`,
              ),
            );
            target =
              candidates.find(
                (candidate) =>
                  !notificationFocusRequest.targetId ||
                  candidate.dataset.agentNotificationId ===
                    notificationFocusRequest.targetId,
              ) ?? null;
          } else if (row) {
            target =
              row.querySelector<HTMLElement>(
                '[data-agent-notification-target="response"]',
              ) ?? row;
          }

          if (target) {
            target.focus({ preventScroll: true });
            onNotificationFocusApplied?.(notificationFocusRequest, true);
            return;
          }
          if (attempts >= 8) {
            onNotificationFocusApplied?.(notificationFocusRequest, false);
            return;
          }
          notificationFocusTimerRef.current = window.setTimeout(
            focusTarget,
            LATEST_TURN_POSITION_RETRY_MS,
          );
        });
      };
      focusTarget();

      return () => {
        disposed = true;
        if (notificationFocusTimerRef.current !== null) {
          window.clearTimeout(notificationFocusTimerRef.current);
          notificationFocusTimerRef.current = null;
        }
      };
    }, [
      entries,
      firstItemIndex,
      notificationFocusRequest,
      onNotificationFocusApplied,
      openAtLatestRequest,
    ]);

    useEffect(() => {
      clearLatestPositionSchedule();
      activeLatestRequestRef.current = openAtLatestRequest;
      latestPositionAttemptCountRef.current = 0;
      latestTurnVisibleRef.current = false;

      if (
        !openAtLatestRequest ||
        openAtLatestRequest.transcriptVersion !== transcriptVersion ||
        entries.length === 0 ||
        !viewportStable
      ) {
        return;
      }
      atBottomRef.current = false;
      bottomStateKnownRef.current = false;

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
        clearLiveFollowSchedule();
        clearCompletionFollowSchedule();
        clearPlanAnchorCorrection();
        clearInteractionAnchorCorrection();
        cancelSubmissionAnchor();
        clearScrollIdleCheck();
        if (notificationFocusTimerRef.current !== null) {
          window.clearTimeout(notificationFocusTimerRef.current);
          notificationFocusTimerRef.current = null;
        }
        if (reportedActivityRef.current) onScrollActivityChange?.(false);
        const metadata = { ...cacheMetadataRef.current };
        handle?.getState((snapshot) => {
          publishViewportSnapshot(metadata, snapshot);
        });
      };
    }, [
      clearLatestPositionSchedule,
      clearLiveFollowSchedule,
      clearCompletionFollowSchedule,
      clearInteractionAnchorCorrection,
      clearPlanAnchorCorrection,
      cancelSubmissionAnchor,
      clearScrollIdleCheck,
      onScrollActivityChange,
      publishViewportSnapshot,
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
        bottomStateKnownRef.current = true;
        atBottomRef.current = atBottom;
        if (atBottom) {
          enableLiveFollow();
        } else if (
          liveFollowEnabledRef.current &&
          !liveFollowIntentRef.current
        ) {
          setShowJumpToLatest(true);
        }
        confirmLatestPosition();
      },
      [confirmLatestPosition, enableLiveFollow],
    );

    const handleIsScrolling = useCallback(
      (active: boolean) => {
        virtuosoScrollingRef.current = active;
        reportScrollActivity();
        if (!active && !userScrollActiveRef.current) {
          captureViewportState();
        }
      },
      [captureViewportState, reportScrollActivity],
    );

    const handleJumpToLatest = useCallback(() => {
      enableLiveFollow();
      scrollToLatest();
    }, [enableLiveFollow, scrollToLatest]);

    // Virtuoso propagates geometry and data through separate internal streams.
    // During transcript replacement, geometry can briefly arrive first.
    const resolveItemEntry = useCallback(
      (index: number, entry: TaskChatEntry | undefined) =>
        entry ??
        entries[index] ??
        entries[index - firstItemIndex],
      [entries, firstItemIndex],
    );

    const computeItemKey = useCallback(
      (index: number, entry: TaskChatEntry | undefined) =>
        resolveItemEntry(index, entry)?.clientId ??
        `${transcriptIdentity}:pending:${index}`,
      [resolveItemEntry, transcriptIdentity],
    );

    const itemContent = useCallback(
      (index: number, providedEntry: TaskChatEntry | undefined) => {
        const entry = resolveItemEntry(index, providedEntry);
        if (!entry) return null;
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
            onOpenWebPreview={onOpenWebPreview}
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
            planExpanded={expandedPlanKeys.has(nativePlanDisclosureKey(entry))}
            editedFilesExpanded={expandedPlanKeys.has(
              editedFilesDisclosureKey(entry),
            )}
            onPlanDisclosureChange={handlePlanDisclosureChange}
            onPendingInteractionPageChange={
              handlePendingInteractionPageChange
            }
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
        handlePendingInteractionPageChange,
        onAnswerUserInput,
        onCancelPlan,
        onReviewEditedFile,
        onUndoEditedFiles,
        fileUndoDisabled,
        onEditPrompt,
        onImplementPlan,
        onLoadHistoricalActivity,
        onOpenFileLink,
        onOpenWebPreview,
        onResolveRequest,
        onRevisePlan,
        resolveItemEntry,
        expandedPlanKeys,
      ],
    );

    return (
      <div className="task-chat-scroll-frame">
        <Virtuoso
          className="task-chat-transcript virtuoso-transcript task-chat-virtuoso"
          role={preparing ? undefined : "region"}
          aria-label={preparing ? undefined : "Task chat transcript"}
          tabIndex={preparing ? -1 : 0}
          ref={virtuosoRef}
          data={entries}
          firstItemIndex={firstItemIndex}
          {...initialPositionProps}
          computeItemKey={computeItemKey}
          defaultItemHeight={defaultItemHeight}
          heightEstimates={heightEstimates}
          increaseViewportBy={transcriptIncreaseViewportBy}
          components={transcriptComponents}
          minOverscanItemCount={{
            top: overscanItemCount,
            bottom: overscanItemCount,
          }}
          scrollerRef={handleScrollerRef}
          alignToBottom
          atBottomThreshold={TRANSCRIPT_BOTTOM_THRESHOLD_PX}
          followOutput={() =>
            liveFollow &&
            liveFollowIntentRef.current &&
            !suppressInteractionFollowRef.current
              ? "auto"
              : false
          }
          atBottomStateChange={handleAtBottomStateChange}
          rangeChanged={handleRangeChanged}
          isScrolling={handleIsScrolling}
          itemContent={itemContent}
        />
        {showJumpToLatest ? (
          <button
            aria-label="Jump to latest message"
            className="task-chat-jump-latest"
            onClick={handleJumpToLatest}
            title="Jump to latest message"
            type="button"
          >
            <ArrowDown size={17} aria-hidden="true" />
          </button>
        ) : null}
      </div>
    );
  },
);

const MemoizedVirtuosoTaskChatTranscript = memo(
  VirtuosoTaskChatTranscriptImpl,
);

const VirtuosoTaskChatTranscriptHost = forwardRef<
  VirtuosoTaskChatTranscriptHandle,
  VirtuosoTaskChatTranscriptProps
>(function VirtuosoTaskChatTranscriptHost(props, forwardedRef) {
  const [displayedIdentity, setDisplayedIdentity] = useState(
    props.transcriptIdentity,
  );
  const displayedPropsRef = useRef(props);
  const incomingPropsRef = useRef(props);
  const visibleTranscriptRef = useRef<VirtuosoTaskChatTranscriptHandle | null>(
    null,
  );
  const incomingTranscriptRef = useRef<VirtuosoTaskChatTranscriptHandle | null>(
    null,
  );
  const switching = displayedIdentity !== props.transcriptIdentity;

  incomingPropsRef.current = props;
  if (!switching) displayedPropsRef.current = props;

  useImperativeHandle(
    forwardedRef,
    () => ({
      captureViewportState: () =>
        visibleTranscriptRef.current?.captureViewportState(),
      stabilizeForSubmission: () =>
        visibleTranscriptRef.current?.stabilizeForSubmission(),
      settleAfterSubmission: () =>
        visibleTranscriptRef.current?.settleAfterSubmission(),
    }),
    [],
  );

  const showIncomingTranscript = useCallback((identity: string) => {
    if (incomingPropsRef.current.transcriptIdentity !== identity) return;
    setDisplayedIdentity(identity);
  }, []);

  const layers = switching
    ? [
        {
          identity: displayedIdentity,
          props: displayedPropsRef.current,
          preparing: false,
        },
        {
          identity: props.transcriptIdentity,
          props,
          preparing: true,
        },
      ]
    : [
        {
          identity: props.transcriptIdentity,
          props,
          preparing: false,
        },
      ];

  return (
    <div className="task-chat-transcript-switcher">
      {layers.map((layer) => (
        <div
          aria-hidden={layer.preparing || undefined}
          className={`task-chat-transcript-layer${
            layer.preparing ? " is-preparing" : " is-visible"
          }`}
          inert={layer.preparing || undefined}
          key={layer.identity}
        >
          <MemoizedVirtuosoTaskChatTranscript
            {...layer.props}
            preparing={layer.preparing}
            ref={
              layer.preparing
                ? incomingTranscriptRef
                : visibleTranscriptRef
            }
            onInitialPositionReady={
              layer.preparing
                ? () => showIncomingTranscript(layer.identity)
                : undefined
            }
          />
        </div>
      ))}
    </div>
  );
});

export const VirtuosoTaskChatTranscript = memo(
  VirtuosoTaskChatTranscriptHost,
);

export function clearTranscriptStateCache() {
  transcriptStateCache.clear();
}
