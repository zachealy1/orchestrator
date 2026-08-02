import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type TransitionEvent as ReactTransitionEvent,
} from "react";
import {
  historyDrawerReservesSpace,
  historyDrawerTargetsOpen,
  type HistoryDrawerPhase,
} from "../../lib/historyDrawerTransition";
import {
  captureTranscriptViewportAnchor,
  restoreTranscriptViewportAnchor,
  type TranscriptViewportAnchor,
} from "../../lib/transcriptScrollAnchor";

const TRANSCRIPT_COMMIT_IDLE_MS = 150;
const TRANSCRIPT_RESIZE_IDLE_MS = 120;
const TRANSCRIPT_RESIZE_WAIT_LIMIT_MS = 500;
const DRAWER_TRANSITION_FALLBACK_MS = 240;

export type ConversationInspectorTarget = {
  conversationKey: string;
  subagentId: string;
};

export type ConversationLayoutController = {
  drawerPhase: HistoryDrawerPhase;
  drawerOpen: boolean;
  drawerSpaceReserved: boolean;
  inspectorTarget: ConversationInspectorTarget | null;
  taskViewportElement: HTMLElement | null;
  taskViewportWidth: number;
  taskViewportStable: boolean;
  setTaskViewportElement: (element: HTMLElement | null) => void;
  openDrawer: () => void;
  closeDrawer: () => void;
  toggleDrawer: () => void;
  waitForDrawerClosed: () => Promise<void>;
  handleDrawerTransitionEnd: (
    event: ReactTransitionEvent<HTMLElement>,
  ) => void;
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
  getDrawerPhase: () => HistoryDrawerPhase;
  inspectorTargetRef: React.MutableRefObject<ConversationInspectorTarget | null>;
};

export function useConversationLayoutController(): ConversationLayoutController {
  const [drawerPhase, setDrawerPhase] =
    useState<HistoryDrawerPhase>("closed");
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
  const drawerPhaseRef = useRef<HistoryDrawerPhase>("closed");
  const drawerClosedWaitersRef = useRef(new Set<() => void>());
  const drawerAnchorRef = useRef<TranscriptViewportAnchor | null>(null);
  const drawerAnchorRestoreFrameRef = useRef<number | null>(null);
  const drawerAnchorReleaseTimerRef = useRef<number | null>(null);
  const pendingDrawerOpenRef = useRef(false);
  const pendingDrawerCloseRef = useRef(false);

  const updateDrawerPhase = useCallback((phase: HistoryDrawerPhase) => {
    drawerPhaseRef.current = phase;
    setDrawerPhase(phase);
  }, []);

  const captureDrawerAnchor = useCallback(() => {
    const scroller = taskViewportElement?.querySelector<HTMLElement>(
      ".task-chat-transcript.virtuoso-transcript, .task-chat-transcript.native-transcript",
    );
    return captureTranscriptViewportAnchor(scroller ?? null);
  }, [taskViewportElement]);

  const cancelDrawerAnchorSchedule = useCallback(() => {
    if (drawerAnchorRestoreFrameRef.current !== null) {
      window.cancelAnimationFrame(drawerAnchorRestoreFrameRef.current);
      drawerAnchorRestoreFrameRef.current = null;
    }
    if (drawerAnchorReleaseTimerRef.current !== null) {
      window.clearTimeout(drawerAnchorReleaseTimerRef.current);
      drawerAnchorReleaseTimerRef.current = null;
    }
  }, []);

  const scheduleDrawerAnchorRestore = useCallback(() => {
    if (
      !drawerAnchorRef.current ||
      transcriptScrollActiveRef.current ||
      drawerAnchorRestoreFrameRef.current !== null
    ) {
      return;
    }
    drawerAnchorRestoreFrameRef.current = window.requestAnimationFrame(() => {
      drawerAnchorRestoreFrameRef.current = null;
      if (!transcriptScrollActiveRef.current) {
        restoreTranscriptViewportAnchor(drawerAnchorRef.current);
      }
    });
  }, []);

  const releaseDrawerAnchorAfterResize = useCallback(() => {
    if (drawerAnchorReleaseTimerRef.current !== null) {
      window.clearTimeout(drawerAnchorReleaseTimerRef.current);
    }
    drawerAnchorReleaseTimerRef.current = window.setTimeout(() => {
      drawerAnchorReleaseTimerRef.current = null;
      const anchor = drawerAnchorRef.current;
      if (!anchor || transcriptScrollActiveRef.current) return;
      if (drawerAnchorRestoreFrameRef.current !== null) {
        window.cancelAnimationFrame(drawerAnchorRestoreFrameRef.current);
      }
      drawerAnchorRestoreFrameRef.current = window.requestAnimationFrame(() => {
        drawerAnchorRestoreFrameRef.current = null;
        if (transcriptScrollActiveRef.current) return;
        restoreTranscriptViewportAnchor(anchor);
        if (drawerAnchorRef.current === anchor) drawerAnchorRef.current = null;
      });
    }, TRANSCRIPT_RESIZE_IDLE_MS + 32);
  }, []);

  const finalizeDrawerOpen = useCallback(() => {
    if (drawerPhaseRef.current !== "opening") return;
    if (!transcriptScrollActiveRef.current) {
      restoreTranscriptViewportAnchor(drawerAnchorRef.current);
    }
    scheduleDrawerAnchorRestore();
    releaseDrawerAnchorAfterResize();
    updateDrawerPhase("open");
  }, [releaseDrawerAnchorAfterResize, scheduleDrawerAnchorRestore, updateDrawerPhase]);

  const finalizeDrawerClose = useCallback(() => {
    if (drawerPhaseRef.current !== "closing") return;
    pendingDrawerCloseRef.current = false;
    if (!transcriptScrollActiveRef.current) {
      restoreTranscriptViewportAnchor(drawerAnchorRef.current);
    }
    scheduleDrawerAnchorRestore();
    releaseDrawerAnchorAfterResize();
    updateDrawerPhase("closed");
  }, [releaseDrawerAnchorAfterResize, scheduleDrawerAnchorRestore, updateDrawerPhase]);

  const completeDrawerTransition = useCallback(
    (phase: "opening" | "closing") => {
      if (drawerPhaseRef.current !== phase) return;
      if (phase === "opening") finalizeDrawerOpen();
      else finalizeDrawerClose();
    },
    [finalizeDrawerClose, finalizeDrawerOpen],
  );

  const beginDrawerOpen = useCallback(() => {
    if (drawerPhaseRef.current === "opening" || drawerPhaseRef.current === "open") {
      return;
    }
    pendingDrawerOpenRef.current = false;
    pendingDrawerCloseRef.current = false;
    cancelDrawerAnchorSchedule();
    drawerAnchorRef.current = captureDrawerAnchor();
    updateDrawerPhase("opening");
  }, [cancelDrawerAnchorSchedule, captureDrawerAnchor, updateDrawerPhase]);

  const openDrawer = useCallback(() => {
    if (transcriptScrollActiveRef.current) {
      pendingDrawerOpenRef.current = true;
      return;
    }
    beginDrawerOpen();
  }, [beginDrawerOpen]);

  const beginDrawerClose = useCallback(() => {
    if (drawerPhaseRef.current === "closed" || drawerPhaseRef.current === "closing") {
      return;
    }
    pendingDrawerOpenRef.current = false;
    pendingDrawerCloseRef.current = false;
    cancelDrawerAnchorSchedule();
    drawerAnchorRef.current = captureDrawerAnchor();
    updateDrawerPhase("closing");
  }, [cancelDrawerAnchorSchedule, captureDrawerAnchor, updateDrawerPhase]);

  const closeDrawer = useCallback(() => {
    pendingDrawerOpenRef.current = false;
    if (drawerPhaseRef.current === "closed" || drawerPhaseRef.current === "closing") {
      return;
    }
    if (transcriptScrollActiveRef.current) {
      pendingDrawerCloseRef.current = true;
      return;
    }
    beginDrawerClose();
  }, [beginDrawerClose]);

  const closeInspector = useCallback(() => {
    if (!inspectorTargetRef.current) return;
    cancelDrawerAnchorSchedule();
    drawerAnchorRef.current = captureDrawerAnchor();
    inspectorTargetRef.current = null;
    setInspectorTarget(null);
    scheduleDrawerAnchorRestore();
    releaseDrawerAnchorAfterResize();
  }, [cancelDrawerAnchorSchedule, captureDrawerAnchor, releaseDrawerAnchorAfterResize, scheduleDrawerAnchorRestore]);

  const openInspector = useCallback(
    (target: ConversationInspectorTarget) => {
      cancelDrawerAnchorSchedule();
      drawerAnchorRef.current = captureDrawerAnchor();
      pendingDrawerOpenRef.current = false;
      pendingDrawerCloseRef.current = false;
      updateDrawerPhase("closed");
      inspectorTargetRef.current = target;
      setInspectorTarget(target);
      scheduleDrawerAnchorRestore();
      releaseDrawerAnchorAfterResize();
    },
    [cancelDrawerAnchorSchedule, captureDrawerAnchor, releaseDrawerAnchorAfterResize, scheduleDrawerAnchorRestore, updateDrawerPhase],
  );

  const toggleDrawer = useCallback(() => {
    if (inspectorTargetRef.current) {
      cancelDrawerAnchorSchedule();
      drawerAnchorRef.current = captureDrawerAnchor();
      inspectorTargetRef.current = null;
      setInspectorTarget(null);
      beginDrawerOpen();
      scheduleDrawerAnchorRestore();
      releaseDrawerAnchorAfterResize();
      return;
    }
    if (drawerPhaseRef.current === "open" || drawerPhaseRef.current === "opening") {
      closeDrawer();
    } else {
      openDrawer();
    }
  }, [beginDrawerOpen, cancelDrawerAnchorSchedule, captureDrawerAnchor, closeDrawer, openDrawer, releaseDrawerAnchorAfterResize, scheduleDrawerAnchorRestore]);

  const waitForDrawerClosed = useCallback(() => {
    if (
      drawerPhaseRef.current === "closed" &&
      !pendingDrawerOpenRef.current &&
      !pendingDrawerCloseRef.current
    ) {
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      let settled = false;
      let timeoutId: number | null = null;
      const finish = () => {
        if (settled) return;
        settled = true;
        drawerClosedWaitersRef.current.delete(finish);
        if (timeoutId !== null) window.clearTimeout(timeoutId);
        resolve();
      };
      drawerClosedWaitersRef.current.add(finish);
      timeoutId = window.setTimeout(finish, DRAWER_TRANSITION_FALLBACK_MS + 100);
    });
  }, []);

  const handleDrawerTransitionEnd = useCallback(
    (event: ReactTransitionEvent<HTMLElement>) => {
      if (event.currentTarget !== event.target || event.propertyName !== "transform") {
        return;
      }
      const phase = drawerPhaseRef.current;
      if (phase === "opening" || phase === "closing") {
        completeDrawerTransition(phase);
      }
    },
    [completeDrawerTransition],
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
      scheduleDrawerAnchorRestore();
      releaseDrawerAnchorAfterResize();
      transcriptViewportWaitersRef.current.forEach((resolve) => resolve());
      transcriptViewportWaitersRef.current.clear();
      schedulePendingTranscriptCommit();
    },
    [releaseDrawerAnchorAfterResize, scheduleDrawerAnchorRestore, schedulePendingTranscriptCommit],
  );

  const handleTranscriptScrollActivityChange = useCallback(
    (active: boolean) => {
      transcriptScrollActiveRef.current = active;
      if (active) {
        cancelDrawerAnchorSchedule();
        drawerAnchorRef.current = null;
        if (transcriptCommitIdleTimerRef.current !== null) {
          window.clearTimeout(transcriptCommitIdleTimerRef.current);
          transcriptCommitIdleTimerRef.current = null;
        }
        return;
      }
      const pendingWidth = pendingTranscriptViewportWidthRef.current;
      if (pendingWidth !== null) settleTranscriptViewportWidth(pendingWidth);
      if (pendingDrawerCloseRef.current) beginDrawerClose();
      else if (pendingDrawerOpenRef.current) beginDrawerOpen();
      schedulePendingTranscriptCommit();
    },
    [beginDrawerClose, beginDrawerOpen, cancelDrawerAnchorSchedule, schedulePendingTranscriptCommit, settleTranscriptViewportWidth],
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
    if (drawerPhase !== "opening" && drawerPhase !== "closing") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      const frame = window.requestAnimationFrame(() => completeDrawerTransition(drawerPhase));
      return () => window.cancelAnimationFrame(frame);
    }
    const timer = window.setTimeout(
      () => completeDrawerTransition(drawerPhase),
      DRAWER_TRANSITION_FALLBACK_MS,
    );
    return () => window.clearTimeout(timer);
  }, [completeDrawerTransition, drawerPhase]);

  useEffect(() => {
    if (drawerPhase !== "closed") return;
    drawerClosedWaitersRef.current.forEach((resolve) => resolve());
    drawerClosedWaitersRef.current.clear();
  }, [drawerPhase]);

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
      scheduleDrawerAnchorRestore();
      releaseDrawerAnchorAfterResize();
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
  }, [releaseDrawerAnchorAfterResize, scheduleDrawerAnchorRestore, settleTranscriptViewportWidth, taskViewportElement]);

  useEffect(
    () => () => {
      cancelPendingTranscriptCommit();
      if (transcriptViewportResizeTimerRef.current !== null) {
        window.clearTimeout(transcriptViewportResizeTimerRef.current);
      }
      pendingDrawerOpenRef.current = false;
      pendingDrawerCloseRef.current = false;
      cancelDrawerAnchorSchedule();
      drawerAnchorRef.current = null;
      transcriptViewportWaitersRef.current.forEach((resolve) => resolve());
      transcriptViewportWaitersRef.current.clear();
      drawerClosedWaitersRef.current.forEach((resolve) => resolve());
      drawerClosedWaitersRef.current.clear();
    },
    [cancelDrawerAnchorSchedule, cancelPendingTranscriptCommit],
  );

  return {
    drawerPhase,
    drawerOpen: historyDrawerTargetsOpen(drawerPhase),
    drawerSpaceReserved: historyDrawerReservesSpace(drawerPhase),
    inspectorTarget,
    taskViewportElement,
    taskViewportWidth,
    taskViewportStable,
    setTaskViewportElement,
    openDrawer,
    closeDrawer,
    toggleDrawer,
    waitForDrawerClosed,
    handleDrawerTransitionEnd,
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
    getDrawerPhase: () => drawerPhaseRef.current,
    inspectorTargetRef,
  };
}
