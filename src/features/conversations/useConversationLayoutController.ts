import { useCallback, useEffect, useRef, useState } from "react";
import {
  captureTranscriptViewportAnchor,
  restoreTranscriptViewportAnchor,
  type TranscriptViewportAnchor,
} from "../../lib/transcriptScrollAnchor";

const TRANSCRIPT_COMMIT_IDLE_MS = 150;
const TRANSCRIPT_RESIZE_IDLE_MS = 120;
const TRANSCRIPT_RESIZE_WAIT_LIMIT_MS = 500;

export type ConversationInspectorTarget = {
  conversationKey: string;
  subagentId: string;
};

export type ConversationLayoutController = {
  inspectorTarget: ConversationInspectorTarget | null;
  taskViewportElement: HTMLElement | null;
  taskViewportWidth: number;
  taskViewportStable: boolean;
  setTaskViewportElement: (element: HTMLElement | null) => void;
  openInspector: (target: ConversationInspectorTarget) => void;
  closeInspector: () => void;
  handleTranscriptScrollActivityChange: (active: boolean) => void;
  deferStableTranscriptCommit: (commit: () => void) => void;
  markTranscriptViewportUnstable: () => void;
  waitForTranscriptViewportStable: () => Promise<void>;
  cancelPendingTranscriptCommit: () => void;
  resetTranscriptInteraction: () => void;
  isTranscriptScrolling: () => boolean;
  isTranscriptViewportStable: () => boolean;
  inspectorTargetRef: React.MutableRefObject<ConversationInspectorTarget | null>;
};

export function useConversationLayoutController(): ConversationLayoutController {
  const [inspectorTarget, setInspectorTarget] =
    useState<ConversationInspectorTarget | null>(null);
  const [taskViewportElement, setTaskViewportElement] =
    useState<HTMLElement | null>(null);
  const [taskViewportWidth, setTaskViewportWidth] = useState(1_024);
  const [taskViewportStable, setTaskViewportStable] = useState(true);

  const inspectorTargetRef = useRef<ConversationInspectorTarget | null>(null);
  const transcriptScrollActiveRef = useRef(false);
  const pendingTranscriptCommitRef = useRef<(() => void) | null>(null);
  const transcriptCommitIdleTimerRef = useRef<number | null>(null);
  const transcriptViewportStableRef = useRef(true);
  const transcriptViewportWidthRef = useRef(1_024);
  const pendingTranscriptViewportWidthRef = useRef<number | null>(null);
  const transcriptViewportResizeTimerRef = useRef<number | null>(null);
  const transcriptViewportWaitersRef = useRef(new Set<() => void>());
  const inspectorAnchorRef = useRef<TranscriptViewportAnchor | null>(null);
  const inspectorAnchorRestoreFrameRef = useRef<number | null>(null);
  const inspectorAnchorReleaseTimerRef = useRef<number | null>(null);
  const captureInspectorAnchor = useCallback(() => {
    const scroller = taskViewportElement?.querySelector<HTMLElement>(
      ".task-chat-transcript.virtuoso-transcript, .task-chat-transcript.native-transcript",
    );
    return captureTranscriptViewportAnchor(scroller ?? null);
  }, [taskViewportElement]);

  const cancelInspectorAnchorSchedule = useCallback(() => {
    if (inspectorAnchorRestoreFrameRef.current !== null) {
      window.cancelAnimationFrame(inspectorAnchorRestoreFrameRef.current);
      inspectorAnchorRestoreFrameRef.current = null;
    }
    if (inspectorAnchorReleaseTimerRef.current !== null) {
      window.clearTimeout(inspectorAnchorReleaseTimerRef.current);
      inspectorAnchorReleaseTimerRef.current = null;
    }
  }, []);

  const scheduleInspectorAnchorRestore = useCallback(() => {
    if (
      !inspectorAnchorRef.current ||
      transcriptScrollActiveRef.current ||
      inspectorAnchorRestoreFrameRef.current !== null
    ) {
      return;
    }
    inspectorAnchorRestoreFrameRef.current = window.requestAnimationFrame(() => {
      inspectorAnchorRestoreFrameRef.current = null;
      if (!transcriptScrollActiveRef.current) {
        restoreTranscriptViewportAnchor(inspectorAnchorRef.current);
      }
    });
  }, []);

  const releaseInspectorAnchorAfterResize = useCallback(() => {
    if (inspectorAnchorReleaseTimerRef.current !== null) {
      window.clearTimeout(inspectorAnchorReleaseTimerRef.current);
    }
    inspectorAnchorReleaseTimerRef.current = window.setTimeout(() => {
      inspectorAnchorReleaseTimerRef.current = null;
      const anchor = inspectorAnchorRef.current;
      if (!anchor || transcriptScrollActiveRef.current) return;
      if (inspectorAnchorRestoreFrameRef.current !== null) {
        window.cancelAnimationFrame(inspectorAnchorRestoreFrameRef.current);
      }
      inspectorAnchorRestoreFrameRef.current = window.requestAnimationFrame(() => {
        inspectorAnchorRestoreFrameRef.current = null;
        if (transcriptScrollActiveRef.current) return;
        restoreTranscriptViewportAnchor(anchor);
        if (inspectorAnchorRef.current === anchor) inspectorAnchorRef.current = null;
      });
    }, TRANSCRIPT_RESIZE_IDLE_MS + 32);
  }, []);

  const closeInspector = useCallback(() => {
    if (!inspectorTargetRef.current) return;
    cancelInspectorAnchorSchedule();
    inspectorAnchorRef.current = captureInspectorAnchor();
    inspectorTargetRef.current = null;
    setInspectorTarget(null);
    scheduleInspectorAnchorRestore();
    releaseInspectorAnchorAfterResize();
  }, [cancelInspectorAnchorSchedule, captureInspectorAnchor, releaseInspectorAnchorAfterResize, scheduleInspectorAnchorRestore]);

  const openInspector = useCallback(
    (target: ConversationInspectorTarget) => {
      cancelInspectorAnchorSchedule();
      inspectorAnchorRef.current = captureInspectorAnchor();
      inspectorTargetRef.current = target;
      setInspectorTarget(target);
      scheduleInspectorAnchorRestore();
      releaseInspectorAnchorAfterResize();
    },
    [cancelInspectorAnchorSchedule, captureInspectorAnchor, releaseInspectorAnchorAfterResize, scheduleInspectorAnchorRestore],
  );

  const schedulePendingTranscriptCommit = useCallback(() => {
    if (
      !pendingTranscriptCommitRef.current ||
      transcriptScrollActiveRef.current ||
      !transcriptViewportStableRef.current
    ) {
      return;
    }
    if (transcriptCommitIdleTimerRef.current !== null) {
      window.clearTimeout(transcriptCommitIdleTimerRef.current);
    }
    transcriptCommitIdleTimerRef.current = window.setTimeout(() => {
      transcriptCommitIdleTimerRef.current = null;
      if (transcriptScrollActiveRef.current || !transcriptViewportStableRef.current) {
        return;
      }
      const commit = pendingTranscriptCommitRef.current;
      pendingTranscriptCommitRef.current = null;
      commit?.();
    }, TRANSCRIPT_COMMIT_IDLE_MS);
  }, []);

  const settleTranscriptViewportWidth = useCallback(
    (width: number) => {
      pendingTranscriptViewportWidthRef.current = null;
      transcriptViewportWidthRef.current = width;
      transcriptViewportStableRef.current = true;
      setTaskViewportStable(true);
      setTaskViewportWidth(width);
      scheduleInspectorAnchorRestore();
      releaseInspectorAnchorAfterResize();
      transcriptViewportWaitersRef.current.forEach((resolve) => resolve());
      transcriptViewportWaitersRef.current.clear();
      schedulePendingTranscriptCommit();
    },
    [releaseInspectorAnchorAfterResize, scheduleInspectorAnchorRestore, schedulePendingTranscriptCommit],
  );

  const handleTranscriptScrollActivityChange = useCallback(
    (active: boolean) => {
      transcriptScrollActiveRef.current = active;
      if (active) {
        cancelInspectorAnchorSchedule();
        inspectorAnchorRef.current = null;
        if (transcriptCommitIdleTimerRef.current !== null) {
          window.clearTimeout(transcriptCommitIdleTimerRef.current);
          transcriptCommitIdleTimerRef.current = null;
        }
        return;
      }
      const pendingWidth = pendingTranscriptViewportWidthRef.current;
      if (pendingWidth !== null) settleTranscriptViewportWidth(pendingWidth);
      schedulePendingTranscriptCommit();
    },
    [cancelInspectorAnchorSchedule, schedulePendingTranscriptCommit, settleTranscriptViewportWidth],
  );

  const deferStableTranscriptCommit = useCallback(
    (commit: () => void) => {
      pendingTranscriptCommitRef.current = commit;
      schedulePendingTranscriptCommit();
    },
    [schedulePendingTranscriptCommit],
  );

  const markTranscriptViewportUnstable = useCallback(() => {
    if (!taskViewportElement || typeof ResizeObserver === "undefined") return;
    transcriptViewportStableRef.current = false;
    setTaskViewportStable(false);
    if (transcriptCommitIdleTimerRef.current !== null) {
      window.clearTimeout(transcriptCommitIdleTimerRef.current);
      transcriptCommitIdleTimerRef.current = null;
    }
    if (transcriptViewportResizeTimerRef.current !== null) {
      window.clearTimeout(transcriptViewportResizeTimerRef.current);
    }
    transcriptViewportResizeTimerRef.current = window.setTimeout(() => {
      transcriptViewportResizeTimerRef.current = null;
      const width = taskViewportElement.getBoundingClientRect().width;
      if (width > 0) pendingTranscriptViewportWidthRef.current = width;
      if (transcriptScrollActiveRef.current) return;
      if (width > 0) settleTranscriptViewportWidth(width);
      else {
        transcriptViewportStableRef.current = true;
        setTaskViewportStable(true);
        transcriptViewportWaitersRef.current.forEach((resolve) => resolve());
        transcriptViewportWaitersRef.current.clear();
        schedulePendingTranscriptCommit();
      }
    }, TRANSCRIPT_RESIZE_WAIT_LIMIT_MS);
  }, [schedulePendingTranscriptCommit, settleTranscriptViewportWidth, taskViewportElement]);

  const waitForTranscriptViewportStable = useCallback(async () => {
    if (transcriptViewportStableRef.current) return;
    await new Promise<void>((resolve) => {
      let settled = false;
      let timeoutId: number | null = null;
      const finish = () => {
        if (settled) return;
        settled = true;
        transcriptViewportWaitersRef.current.delete(finish);
        if (timeoutId !== null) window.clearTimeout(timeoutId);
        resolve();
      };
      transcriptViewportWaitersRef.current.add(finish);
      timeoutId = window.setTimeout(() => {
        const width = taskViewportElement?.getBoundingClientRect().width ?? transcriptViewportWidthRef.current;
        if (width > 0) settleTranscriptViewportWidth(width);
        else {
          transcriptViewportStableRef.current = true;
          setTaskViewportStable(true);
          transcriptViewportWaitersRef.current.forEach((waiter) => waiter());
          transcriptViewportWaitersRef.current.clear();
          schedulePendingTranscriptCommit();
        }
        finish();
      }, TRANSCRIPT_RESIZE_WAIT_LIMIT_MS);
    });
  }, [schedulePendingTranscriptCommit, settleTranscriptViewportWidth, taskViewportElement]);

  const cancelPendingTranscriptCommit = useCallback(() => {
    pendingTranscriptCommitRef.current = null;
    if (transcriptCommitIdleTimerRef.current !== null) {
      window.clearTimeout(transcriptCommitIdleTimerRef.current);
      transcriptCommitIdleTimerRef.current = null;
    }
  }, []);

  const resetTranscriptInteraction = useCallback(() => {
    cancelPendingTranscriptCommit();
    transcriptScrollActiveRef.current = false;
  }, [cancelPendingTranscriptCommit]);

  useEffect(() => {
    if (!taskViewportElement) return;
    const initialWidth = taskViewportElement.getBoundingClientRect().width;
    if (initialWidth > 0) {
      transcriptViewportWidthRef.current = initialWidth;
      setTaskViewportWidth(initialWidth);
    }
    transcriptViewportStableRef.current = true;
    setTaskViewportStable(true);
    if (typeof ResizeObserver === "undefined") return;

    let latestWidth = transcriptViewportWidthRef.current;
    const observer = new ResizeObserver((entries) => {
      const nextWidth = entries[0]?.contentRect.width ?? taskViewportElement.getBoundingClientRect().width;
      if (nextWidth <= 0 || Math.abs(nextWidth - latestWidth) < 0.5) return;
      latestWidth = nextWidth;
      transcriptViewportStableRef.current = false;
      setTaskViewportStable(false);
      scheduleInspectorAnchorRestore();
      releaseInspectorAnchorAfterResize();
      if (transcriptCommitIdleTimerRef.current !== null) {
        window.clearTimeout(transcriptCommitIdleTimerRef.current);
        transcriptCommitIdleTimerRef.current = null;
      }
      if (transcriptViewportResizeTimerRef.current !== null) {
        window.clearTimeout(transcriptViewportResizeTimerRef.current);
      }
      transcriptViewportResizeTimerRef.current = window.setTimeout(() => {
        transcriptViewportResizeTimerRef.current = null;
        pendingTranscriptViewportWidthRef.current = latestWidth;
        if (!transcriptScrollActiveRef.current) settleTranscriptViewportWidth(latestWidth);
      }, TRANSCRIPT_RESIZE_IDLE_MS);
    });
    observer.observe(taskViewportElement);
    return () => {
      observer.disconnect();
      if (transcriptViewportResizeTimerRef.current !== null) {
        window.clearTimeout(transcriptViewportResizeTimerRef.current);
        transcriptViewportResizeTimerRef.current = null;
      }
      transcriptViewportStableRef.current = true;
      pendingTranscriptViewportWidthRef.current = null;
      setTaskViewportStable(true);
      transcriptViewportWaitersRef.current.forEach((resolve) => resolve());
      transcriptViewportWaitersRef.current.clear();
    };
  }, [releaseInspectorAnchorAfterResize, scheduleInspectorAnchorRestore, settleTranscriptViewportWidth, taskViewportElement]);

  useEffect(
    () => () => {
      cancelPendingTranscriptCommit();
      if (transcriptViewportResizeTimerRef.current !== null) {
        window.clearTimeout(transcriptViewportResizeTimerRef.current);
      }
      cancelInspectorAnchorSchedule();
      inspectorAnchorRef.current = null;
      transcriptViewportWaitersRef.current.forEach((resolve) => resolve());
      transcriptViewportWaitersRef.current.clear();
    },
    [cancelInspectorAnchorSchedule, cancelPendingTranscriptCommit],
  );

  return {
    inspectorTarget,
    taskViewportElement,
    taskViewportWidth,
    taskViewportStable,
    setTaskViewportElement,
    openInspector,
    closeInspector,
    handleTranscriptScrollActivityChange,
    deferStableTranscriptCommit,
    markTranscriptViewportUnstable,
    waitForTranscriptViewportStable,
    cancelPendingTranscriptCommit,
    resetTranscriptInteraction,
    isTranscriptScrolling: () => transcriptScrollActiveRef.current,
    isTranscriptViewportStable: () => transcriptViewportStableRef.current,
    inspectorTargetRef,
  };
}
