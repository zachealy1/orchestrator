import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

const TOOLTIP_GAP_PX = 8;
const TOOLTIP_VIEWPORT_GUTTER_PX = 8;
const TOOLTIP_POINTER_DELAY_MS = 180;
const TOOLTIP_EXIT_MS = 120;

type TooltipPlacement = "above" | "below";

type ActiveTooltip = {
  trigger: HTMLButtonElement;
  label: string;
};

type TooltipPosition = {
  left: number;
  top: number;
  placement: TooltipPlacement;
};

function tooltipTrigger(target: EventTarget | null) {
  if (!(target instanceof Element)) return null;
  const trigger = target.closest<HTMLButtonElement>("button[data-tooltip]");
  const label = trigger?.dataset.tooltip?.trim();
  if (!trigger || !label) return null;
  return trigger;
}

function relatedTargetIsInside(
  trigger: HTMLButtonElement,
  relatedTarget: EventTarget | null,
) {
  return relatedTarget instanceof Node && trigger.contains(relatedTarget);
}

function preferredPlacement(trigger: HTMLButtonElement): TooltipPlacement | null {
  const placement = trigger.dataset.tooltipPlacement;
  return placement === "above" || placement === "below" ? placement : null;
}

export function OrchestratorTooltipLayer() {
  const tooltipId = useId();
  const tooltipRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<ActiveTooltip | null>(null);
  const hoveredTriggerRef = useRef<HTMLButtonElement | null>(null);
  const focusedTriggerRef = useRef<HTMLButtonElement | null>(null);
  const suppressedTriggerRef = useRef<HTMLButtonElement | null>(null);
  const showTimerRef = useRef<number | null>(null);
  const hideTimerRef = useRef<number | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const [active, setActive] = useState<ActiveTooltip | null>(null);
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState<TooltipPosition>({
    left: -10_000,
    top: -10_000,
    placement: "above",
  });

  const clearShowTimer = useCallback(() => {
    if (showTimerRef.current === null) return;
    window.clearTimeout(showTimerRef.current);
    showTimerRef.current = null;
  }, []);

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current === null) return;
    window.clearTimeout(hideTimerRef.current);
    hideTimerRef.current = null;
  }, []);

  const show = useCallback(
    (trigger: HTMLButtonElement, immediate: boolean) => {
      if (suppressedTriggerRef.current === trigger) return;
      clearShowTimer();
      clearHideTimer();
      if (activeRef.current && activeRef.current.trigger !== trigger) {
        setVisible(false);
      }

      const activate = () => {
        const label = trigger.dataset.tooltip?.trim();
        if (!label || !trigger.isConnected) return;
        const next = { trigger, label };
        activeRef.current = next;
        setActive(next);
        setVisible(false);
        setPosition({ left: -10_000, top: -10_000, placement: "above" });
        if (animationFrameRef.current !== null) {
          window.cancelAnimationFrame(animationFrameRef.current);
        }
        animationFrameRef.current = window.requestAnimationFrame(() => {
          animationFrameRef.current = null;
          if (activeRef.current?.trigger === trigger) setVisible(true);
        });
      };

      if (immediate || activeRef.current?.trigger === trigger) {
        activate();
      } else {
        showTimerRef.current = window.setTimeout(() => {
          showTimerRef.current = null;
          activate();
        }, TOOLTIP_POINTER_DELAY_MS);
      }
    },
    [clearHideTimer, clearShowTimer],
  );

  const hide = useCallback(
    (force = false) => {
      clearShowTimer();
      const current = activeRef.current?.trigger;
      if (
        !force &&
        current &&
        (hoveredTriggerRef.current === current ||
          focusedTriggerRef.current === current)
      ) {
        return;
      }
      clearHideTimer();
      setVisible(false);
      hideTimerRef.current = window.setTimeout(() => {
        hideTimerRef.current = null;
        activeRef.current = null;
        setActive(null);
      }, TOOLTIP_EXIT_MS);
    },
    [clearHideTimer, clearShowTimer],
  );

  const dismiss = useCallback(() => {
    hoveredTriggerRef.current = null;
    focusedTriggerRef.current = null;
    suppressedTriggerRef.current = null;
    hide(true);
  }, [hide]);

  const updatePosition = useCallback(() => {
    const current = activeRef.current;
    const tooltip = tooltipRef.current;
    if (!current || !tooltip || !current.trigger.isConnected) return;

    const triggerBounds = current.trigger.getBoundingClientRect();
    const tooltipBounds = tooltip.getBoundingClientRect();
    const viewportWidth = document.documentElement.clientWidth;
    const viewportHeight = document.documentElement.clientHeight;
    const requestedPlacement = preferredPlacement(current.trigger);
    const fitsAbove =
      triggerBounds.top >= tooltipBounds.height + TOOLTIP_GAP_PX;
    const fitsBelow =
      viewportHeight - triggerBounds.bottom >=
      tooltipBounds.height + TOOLTIP_GAP_PX;
    const placement =
      requestedPlacement === "above" && fitsAbove
        ? "above"
        : requestedPlacement === "below" && fitsBelow
          ? "below"
          : fitsAbove || !fitsBelow
            ? "above"
            : "below";
    const unclampedLeft =
      triggerBounds.left + triggerBounds.width / 2 - tooltipBounds.width / 2;
    const maxLeft = Math.max(
      TOOLTIP_VIEWPORT_GUTTER_PX,
      viewportWidth - tooltipBounds.width - TOOLTIP_VIEWPORT_GUTTER_PX,
    );
    const left = Math.min(
      Math.max(unclampedLeft, TOOLTIP_VIEWPORT_GUTTER_PX),
      maxLeft,
    );
    const unclampedTop =
      placement === "above"
        ? triggerBounds.top - tooltipBounds.height - TOOLTIP_GAP_PX
        : triggerBounds.bottom + TOOLTIP_GAP_PX;
    const maxTop = Math.max(
      TOOLTIP_VIEWPORT_GUTTER_PX,
      viewportHeight - tooltipBounds.height - TOOLTIP_VIEWPORT_GUTTER_PX,
    );
    const top = Math.min(
      Math.max(unclampedTop, TOOLTIP_VIEWPORT_GUTTER_PX),
      maxTop,
    );

    setPosition({ left, top, placement });
  }, []);

  useLayoutEffect(() => {
    if (active) updatePosition();
  }, [active, updatePosition]);

  useEffect(() => {
    if (!active) return;
    const previousDescription = active.trigger.getAttribute("aria-describedby");
    const descriptions = new Set(
      previousDescription?.split(/\s+/).filter(Boolean) ?? [],
    );
    descriptions.add(tooltipId);
    active.trigger.setAttribute("aria-describedby", [...descriptions].join(" "));
    return () => {
      if (previousDescription) {
        active.trigger.setAttribute("aria-describedby", previousDescription);
      } else {
        active.trigger.removeAttribute("aria-describedby");
      }
    };
  }, [active, tooltipId]);

  useEffect(() => {
    const handlePointerOver = (event: PointerEvent) => {
      const trigger = tooltipTrigger(event.target);
      if (!trigger || relatedTargetIsInside(trigger, event.relatedTarget)) return;
      hoveredTriggerRef.current = trigger;
      show(trigger, false);
    };
    const handlePointerOut = (event: PointerEvent) => {
      const trigger = tooltipTrigger(event.target);
      if (!trigger || relatedTargetIsInside(trigger, event.relatedTarget)) return;
      if (hoveredTriggerRef.current === trigger) hoveredTriggerRef.current = null;
      if (suppressedTriggerRef.current === trigger) {
        suppressedTriggerRef.current = null;
      }
      hide();
    };
    const handleFocusIn = (event: FocusEvent) => {
      const trigger = tooltipTrigger(event.target);
      if (!trigger) return;
      focusedTriggerRef.current = trigger;
      show(trigger, true);
    };
    const handleFocusOut = (event: FocusEvent) => {
      const trigger = tooltipTrigger(event.target);
      if (!trigger || relatedTargetIsInside(trigger, event.relatedTarget)) return;
      if (focusedTriggerRef.current === trigger) focusedTriggerRef.current = null;
      if (suppressedTriggerRef.current === trigger) {
        suppressedTriggerRef.current = null;
      }
      hide();
    };
    const handlePointerDown = (event: PointerEvent) => {
      const trigger = tooltipTrigger(event.target);
      suppressedTriggerRef.current = trigger;
      hoveredTriggerRef.current = null;
      focusedTriggerRef.current = null;
      hide(true);
    };
    const handleClick = (event: MouseEvent) => {
      const trigger = tooltipTrigger(event.target);
      suppressedTriggerRef.current = trigger;
      hide(true);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") dismiss();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") dismiss();
    };

    document.addEventListener("pointerover", handlePointerOver);
    document.addEventListener("pointerout", handlePointerOut);
    document.addEventListener("focusin", handleFocusIn);
    document.addEventListener("focusout", handleFocusOut);
    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("click", handleClick, true);
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("blur", dismiss);
    window.addEventListener("pagehide", dismiss);
    return () => {
      document.removeEventListener("pointerover", handlePointerOver);
      document.removeEventListener("pointerout", handlePointerOut);
      document.removeEventListener("focusin", handleFocusIn);
      document.removeEventListener("focusout", handleFocusOut);
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("click", handleClick, true);
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("blur", dismiss);
      window.removeEventListener("pagehide", dismiss);
      clearShowTimer();
      clearHideTimer();
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [clearHideTimer, clearShowTimer, dismiss, hide, show]);

  useEffect(() => {
    if (!active) return;
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [active, updatePosition]);

  if (!active || typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={tooltipRef}
      id={tooltipId}
      className="orchestrator-tooltip"
      data-placement={position.placement}
      data-visible={visible ? "true" : "false"}
      role="tooltip"
      style={{ left: position.left, top: position.top }}
    >
      {active.label}
    </div>,
    document.body,
  );
}
