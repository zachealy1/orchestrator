import { ChevronRight, type LucideIcon } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

export type SettingsDetailStatus = {
  label: string;
  tone: "positive" | "negative" | "neutral" | "pending";
};

export type SettingsStatusAction = {
  label: string;
  ariaLabel?: string;
  icon: LucideIcon;
  onActivate: () => void;
  disabled?: boolean;
  permission?: "required" | "unverified";
};

export type SettingsStatusDetails = {
  title: string;
  description: ReactNode;
  actions?: SettingsStatusAction[];
};

const StatusContext = createContext<{
  openId: string | null;
  toggle: (id: string) => void;
  close: (id: string) => void;
} | null>(null);

/** One panel per Settings visit; account changes invalidate the open panel. */
export function SettingsStatusProvider({
  scope,
  active: enabled = true,
  children,
}: {
  scope: number | null;
  active?: boolean;
  children: ReactNode;
}) {
  const [active, setActive] = useState<{
    id: string;
    scope: number | null;
  } | null>(null);
  const openId = enabled && active?.scope === scope ? active.id : null;
  useEffect(() => {
    setActive(null);
  }, [scope, enabled]);
  const close = useCallback((id: string) => {
    setActive((current) => (current?.id === id ? null : current));
  }, []);
  const toggle = useCallback(
    (id: string) => {
      setActive((current) =>
        current?.id === id && current.scope === scope ? null : { id, scope },
      );
    },
    [scope],
  );
  const value = useMemo(
    () => ({ openId, close, toggle }),
    [openId, close, toggle],
  );
  return (
    <StatusContext.Provider value={value}>{children}</StatusContext.Provider>
  );
}

export function SettingsStatusBadge({ label, tone }: SettingsDetailStatus) {
  return (
    <span
      className={`settings-status-badge ${tone}`}
      role="status"
      aria-label={label}
      aria-live="polite"
    >
      <span className="settings-status-badge-dot" aria-hidden="true" />
      {label}
    </span>
  );
}

export function SettingsStatusPopover({
  status,
  details,
}: {
  status: SettingsDetailStatus;
  details?: SettingsStatusDetails | null;
}) {
  const controller = useContext(StatusContext);
  if (!controller)
    throw new Error("SettingsStatusPopover needs SettingsStatusProvider");
  const { openId, close, toggle } = controller;
  const id = useId();
  const titleId = `${id}-title`;
  const descriptionId = `${id}-description`;
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const interactive = Boolean(details);
  const open = openId === id && interactive;

  useEffect(() => {
    if (!interactive) close(id);
  }, [close, id, interactive]);
  useEffect(() => () => close(id), [close, id]);

  const restoreFocus = () =>
    (triggerRef.current ?? rootRef.current)?.focus({ preventScroll: true });

  useLayoutEffect(() => {
    if (!open) return;
    const panel = panelRef.current!;
    const trigger = triggerRef.current!;
    const scroll = panel.querySelector<HTMLDivElement>(
      ".settings-status-popover-scroll",
    )!;
    const position = () => {
      const anchor = trigger.getBoundingClientRect();
      const viewport = window.visualViewport;
      const leftEdge = viewport?.offsetLeft ?? 0;
      const topEdge = viewport?.offsetTop ?? 0;
      const width = viewport?.width ?? window.innerWidth;
      const height = viewport?.height ?? window.innerHeight;
      if (
        anchor.height > 0 &&
        (anchor.bottom < topEdge || anchor.top > topEdge + height)
      ) {
        close(id);
        return;
      }
      const margin = 12;
      const gap = 12;
      panel.style.width = `${Math.min(380, Math.max(0, width - margin * 2))}px`;
      const below = Math.max(
        0,
        topEdge + height - anchor.bottom - gap - margin,
      );
      const above = Math.max(0, anchor.top - topEdge - gap - margin);
      const contentHeight =
        panel.querySelector(".settings-status-popover-scroll")?.scrollHeight ??
        panel.scrollHeight;
      const useAbove = contentHeight > below && above > below;
      panel.style.maxHeight = `${useAbove ? above : below}px`;
      const panelWidth = panel.getBoundingClientRect().width;
      const left = Math.max(
        leftEdge + margin,
        Math.min(
          anchor.right - panelWidth,
          leftEdge + width - panelWidth - margin,
        ),
      );
      panel.style.left = `${left}px`;
      panel.style.top = `${useAbove ? anchor.top - gap - panel.getBoundingClientRect().height : anchor.bottom + gap}px`;
      panel.dataset.placement = useAbove ? "above" : "below";
      panel.style.setProperty(
        "--status-arrow-left",
        `${Math.max(12, Math.min(panelWidth - 22, anchor.right - left - 22))}px`,
      );
    };
    position();
    scroll.focus({ preventScroll: true });
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(position);
    observer?.observe(panel);
    observer?.observe(trigger);
    for (const content of scroll.children) observer?.observe(content);
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    window.visualViewport?.addEventListener("resize", position);
    window.visualViewport?.addEventListener("scroll", position);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
      window.visualViewport?.removeEventListener("resize", position);
      window.visualViewport?.removeEventListener("scroll", position);
      // Preserve focus when the warning resolves, but never steal focus from
      // search, another status trigger, or the destination of an outside click.
      if (panel.contains(document.activeElement)) restoreFocus();
    };
  }, [close, id, open]);

  useEffect(() => {
    if (!open) return;
    const contains = (target: EventTarget | null) =>
      target instanceof Node &&
      (rootRef.current?.contains(target) || panelRef.current?.contains(target));
    const handlePointerDown = (event: PointerEvent) => {
      if (!contains(event.target)) {
        if (panelRef.current?.contains(document.activeElement)) restoreFocus();
        close(id);
      }
    };
    const handleFocus = (event: FocusEvent) => {
      if (!contains(event.target)) close(id);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close(id);
        restoreFocus();
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("focusin", handleFocus);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("focusin", handleFocus);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [close, id, open]);

  return (
    <div className="settings-status-popover" ref={rootRef} tabIndex={-1}>
      <span
        className={
          interactive
            ? `sr-only ${status.tone}`
            : `settings-status-badge ${status.tone}`
        }
        role="status"
        aria-label={status.label}
        aria-live="polite"
        aria-atomic="true"
      >
        {!interactive && (
          <span className="settings-status-badge-dot" aria-hidden="true" />
        )}
        {status.label}
      </span>
      {details && (
        <button
          className={`settings-status-badge settings-status-popover-trigger ${status.tone}`}
          type="button"
          ref={triggerRef}
          aria-label={`${details.title}. Show details`}
          aria-expanded={open}
          aria-controls={open ? id : undefined}
          aria-haspopup="dialog"
          onClick={() => toggle(id)}
        >
          <span className="settings-status-badge-dot" aria-hidden="true" />
          {status.label}
        </button>
      )}
      {open &&
        details &&
        createPortal(
          <div
            className="settings-status-popover-panel"
            ref={panelRef}
            onKeyDown={(event) => {
              if (event.key !== "Tab") return;
              const buttons = Array.from(
                event.currentTarget.querySelectorAll<HTMLButtonElement>(
                  "button:not(:disabled)",
                ),
              );
              const active = document.activeElement;
              if (
                event.shiftKey &&
                (active === event.currentTarget.firstElementChild ||
                  active === buttons[0])
              ) {
                event.preventDefault();
                close(id);
                restoreFocus();
              } else if (
                !event.shiftKey &&
                (buttons.length === 0 || active === buttons[buttons.length - 1])
              ) {
                // Portals sit at the end of the DOM. Continue from the badge's
                // position in Settings instead of jumping to the document end.
                const controls = Array.from(
                  document.querySelectorAll<HTMLElement>(
                    "button, a[href], input, select, textarea, [tabindex]",
                  ),
                ).filter((element) => {
                  if (
                    element.tabIndex < 0 ||
                    element.matches(":disabled") ||
                    element.closest(
                      '[hidden], [inert], [aria-hidden="true"]',
                    ) ||
                    panelRef.current?.contains(element)
                  )
                    return false;
                  for (
                    let parent: HTMLElement | null = element;
                    parent;
                    parent = parent.parentElement
                  ) {
                    const style = window.getComputedStyle(parent);
                    if (
                      style.display === "none" ||
                      style.visibility === "hidden"
                    )
                      return false;
                  }
                  return true;
                });
                const next =
                  controls[controls.indexOf(triggerRef.current!) + 1];
                close(id);
                if (next) {
                  event.preventDefault();
                  next.focus({ preventScroll: true });
                } else {
                  restoreFocus();
                }
              }
            }}
          >
            <div
              className="settings-status-popover-scroll"
              id={id}
              role="dialog"
              aria-modal="false"
              aria-labelledby={titleId}
              aria-describedby={descriptionId}
              tabIndex={-1}
            >
              <div className="settings-status-popover-copy">
                <strong id={titleId}>{details.title}</strong>
                <span id={descriptionId}>{details.description}</span>
              </div>
              {Boolean(details.actions?.length) && (
                <div className="settings-status-popover-actions">
                  {details.actions?.map(
                    ({ icon: Icon, ...action }, index, all) => (
                      <div key={action.ariaLabel ?? action.label}>
                        {index > 0 &&
                          all[index - 1].permission &&
                          !action.permission && (
                            <div className="settings-status-popover-separator" />
                          )}
                        <button
                          className={
                            action.permission
                              ? "settings-status-popover-permission"
                              : "settings-status-popover-action"
                          }
                          type="button"
                          aria-label={action.ariaLabel}
                          disabled={action.disabled}
                          onClick={() => {
                            close(id);
                            restoreFocus();
                            action.onActivate();
                          }}
                        >
                          <Icon
                            size={action.permission ? 18 : 16}
                            aria-hidden="true"
                          />
                          <span
                            className={
                              action.permission
                                ? "settings-status-popover-permission-label"
                                : undefined
                            }
                          >
                            {action.label}
                          </span>
                          {action.permission && (
                            <>
                              <span
                                className={`settings-status-popover-permission-state ${action.permission}`}
                              >
                                <span
                                  className="settings-status-popover-permission-state-dot"
                                  aria-hidden="true"
                                />
                                {action.permission === "required"
                                  ? "Required"
                                  : "Not verified"}
                              </span>
                              <ChevronRight size={16} aria-hidden="true" />
                            </>
                          )}
                        </button>
                      </div>
                    ),
                  )}
                </div>
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
