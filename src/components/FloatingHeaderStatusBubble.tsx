import {
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  ShieldCheck,
} from "lucide-react";
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

export const FLOATING_STATUS_NOTICE_TIMEOUT_MS = 60_000;

export type FloatingStatusNotice = {
  id: string;
  revisionKey: string;
  tone: "approval" | "warning" | "success";
  title: string;
  detail: string;
  actionLabel?: string;
  timeoutMs: number | null;
};

type Props = {
  notices: FloatingStatusNotice[];
  anchorElement: HTMLElement | null;
  active: boolean;
  onActivate?: (noticeId: string) => void;
};

type NoticeTimer = {
  revisionKey: string;
  timeoutMs: number;
  remainingMs: number;
  startedAtMs: number | null;
  timeoutId: number | null;
  dismissed: boolean;
};

type NoticeInteraction = {
  hovered: boolean;
  focused: boolean;
};

const EXIT_DURATION_MS = 160;

export const FloatingHeaderStatusBubble = memo(
  function FloatingHeaderStatusBubble({
    notices,
    anchorElement,
    active,
    onActivate,
  }: Props) {
    const timersRef = useRef(new Map<string, NoticeTimer>());
    const interactionsRef = useRef(new Map<string, NoticeInteraction>());
    const lastVisibleNoticesRef = useRef<FloatingStatusNotice[]>([]);
    const [timerRevision, setTimerRevision] = useState(0);
    const [interactionRevision, setInteractionRevision] = useState(0);
    const [documentVisible, setDocumentVisible] = useState(
      () => document.visibilityState !== "hidden",
    );
    const [bubbleMounted, setBubbleMounted] = useState(false);
    const [bubbleVisible, setBubbleVisible] = useState(false);

    useLayoutEffect(() => {
      const currentIds = new Set(notices.map((notice) => notice.id));
      let changed = false;

      for (const [noticeId, timer] of timersRef.current) {
        if (currentIds.has(noticeId)) continue;
        if (timer.timeoutId !== null) window.clearTimeout(timer.timeoutId);
        timersRef.current.delete(noticeId);
        interactionsRef.current.delete(noticeId);
        changed = true;
      }

      for (const notice of notices) {
        if (notice.timeoutMs === null) {
          const existing = timersRef.current.get(notice.id);
          if (existing?.timeoutId !== null && existing?.timeoutId !== undefined) {
            window.clearTimeout(existing.timeoutId);
          }
          if (existing) {
            timersRef.current.delete(notice.id);
            changed = true;
          }
          continue;
        }
        const existing = timersRef.current.get(notice.id);
        if (
          !existing ||
          existing.revisionKey !== notice.revisionKey ||
          existing.timeoutMs !== notice.timeoutMs
        ) {
          if (existing?.timeoutId !== null && existing?.timeoutId !== undefined) {
            window.clearTimeout(existing.timeoutId);
          }
          timersRef.current.set(notice.id, {
            revisionKey: notice.revisionKey,
            timeoutMs: notice.timeoutMs,
            remainingMs: notice.timeoutMs,
            startedAtMs: null,
            timeoutId: null,
            dismissed: false,
          });
          changed = true;
        }
      }

      if (changed) setTimerRevision((current) => current + 1);
    }, [notices]);

    useEffect(() => {
      const onVisibilityChange = () => {
        setDocumentVisible(document.visibilityState !== "hidden");
      };
      document.addEventListener("visibilitychange", onVisibilityChange);
      return () => {
        document.removeEventListener("visibilitychange", onVisibilityChange);
      };
    }, []);

    useEffect(() => {
      const canRun = active && Boolean(anchorElement) && documentVisible;
      if (canRun) {
        const now = Date.now();
        for (const notice of notices) {
          const timer = timersRef.current.get(notice.id);
          const interaction = interactionsRef.current.get(notice.id);
          if (
            !timer ||
            timer.dismissed ||
            timer.timeoutId !== null ||
            interaction?.hovered ||
            interaction?.focused
          ) {
            continue;
          }
          timer.startedAtMs = now;
          timer.timeoutId = window.setTimeout(() => {
            timer.timeoutId = null;
            timer.startedAtMs = null;
            timer.remainingMs = 0;
            timer.dismissed = true;
            setTimerRevision((current) => current + 1);
          }, timer.remainingMs);
        }
      }

      return () => {
        const now = Date.now();
        for (const timer of timersRef.current.values()) {
          if (timer.timeoutId === null || timer.startedAtMs === null) continue;
          window.clearTimeout(timer.timeoutId);
          timer.timeoutId = null;
          timer.remainingMs = Math.max(
            0,
            timer.remainingMs - (now - timer.startedAtMs),
          );
          timer.startedAtMs = null;
        }
      };
    }, [
      active,
      anchorElement,
      documentVisible,
      interactionRevision,
      notices,
      timerRevision,
    ]);

    useEffect(
      () => () => {
        for (const timer of timersRef.current.values()) {
          if (timer.timeoutId !== null) window.clearTimeout(timer.timeoutId);
        }
      },
      [],
    );

    const setInteraction = useCallback(
      (
        noticeId: string,
        kind: keyof NoticeInteraction,
        interacting: boolean,
      ) => {
        const current = interactionsRef.current.get(noticeId) ?? {
          hovered: false,
          focused: false,
        };
        if (current[kind] === interacting) return;
        interactionsRef.current.set(noticeId, {
          ...current,
          [kind]: interacting,
        });
        setInteractionRevision((revision) => revision + 1);
      },
      [],
    );

    const visibleNotices = notices.filter((notice) => {
      const timer = timersRef.current.get(notice.id);
      return notice.timeoutMs === null || !timer?.dismissed;
    });
    if (visibleNotices.length > 0) {
      lastVisibleNoticesRef.current = visibleNotices;
    }
    const shouldShow =
      active && Boolean(anchorElement) && visibleNotices.length > 0;

    useEffect(() => {
      if (shouldShow) {
        setBubbleMounted(true);
        const frameId = window.requestAnimationFrame(() => {
          setBubbleVisible(true);
        });
        return () => window.cancelAnimationFrame(frameId);
      }

      setBubbleVisible(false);
      const timeoutId = window.setTimeout(
        () => setBubbleMounted(false),
        EXIT_DURATION_MS,
      );
      return () => window.clearTimeout(timeoutId);
    }, [shouldShow]);

    if (!anchorElement || !bubbleMounted) return null;

    const renderedNotices =
      visibleNotices.length > 0
        ? visibleNotices
        : lastVisibleNoticesRef.current;

    return createPortal(
      <aside
        className="floating-header-status-bubble"
        data-visible={bubbleVisible ? "true" : "false"}
        aria-label="Workspace status"
        aria-hidden={!shouldShow}
        data-tauri-drag-region="false"
      >
        {renderedNotices.map((notice) => (
          <FloatingStatusRow
            key={`${notice.id}:${notice.revisionKey}`}
            notice={notice}
            onActivate={onActivate}
            onHoverChange={(hovered) =>
              setInteraction(notice.id, "hovered", hovered)
            }
            onFocusChange={(focused) =>
              setInteraction(notice.id, "focused", focused)
            }
          />
        ))}
      </aside>,
      anchorElement,
    );
  },
);

function FloatingStatusRow({
  notice,
  onActivate,
  onHoverChange,
  onFocusChange,
}: {
  notice: FloatingStatusNotice;
  onActivate?: (noticeId: string) => void;
  onHoverChange: (hovered: boolean) => void;
  onFocusChange: (focused: boolean) => void;
}) {
  const actionable = Boolean(notice.actionLabel && onActivate);
  const content = (
    <>
      {notice.tone === "approval" ? (
        <ShieldCheck size={15} aria-hidden="true" />
      ) : notice.tone === "success" ? (
        <CheckCircle2 size={15} aria-hidden="true" />
      ) : (
        <CircleAlert size={15} aria-hidden="true" />
      )}
      <strong>{notice.title}</strong>
      <span className="composer-status-detail">{notice.detail}</span>
      {actionable ? (
        <ChevronRight
          className="composer-status-chevron"
          size={15}
          aria-hidden="true"
        />
      ) : null}
    </>
  );

  return (
    <div
      className="composer-status-notice"
      data-tone={notice.tone}
      role={notice.tone === "success" ? "status" : "alert"}
      onMouseEnter={() => onHoverChange(true)}
      onMouseLeave={() => onHoverChange(false)}
      onFocusCapture={() => onFocusChange(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          onFocusChange(false);
        }
      }}
    >
      {actionable ? (
        <button
          className="composer-status-action"
          type="button"
          aria-label={notice.actionLabel}
          title={notice.actionLabel}
          onClick={() => onActivate?.(notice.id)}
        >
          {content}
        </button>
      ) : (
        <div className="composer-status-content">{content}</div>
      )}
    </div>
  );
}
