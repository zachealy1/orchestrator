import { type ReactNode, useLayoutEffect, useRef } from "react";

export type KanbanComposerOverlayProps = {
  children: ReactNode;
};

const SCROLLABLE_OVERFLOW = /^(auto|scroll|overlay)$/;

function canConsumeVerticalWheel(element: HTMLElement, deltaY: number) {
  if (element.scrollHeight <= element.clientHeight) return false;
  if (!SCROLLABLE_OVERFLOW.test(getComputedStyle(element).overflowY)) {
    return false;
  }
  if (deltaY < 0) return element.scrollTop > 0;
  if (deltaY > 0) {
    return element.scrollTop + element.clientHeight < element.scrollHeight - 1;
  }
  return false;
}

function descendantCanConsumeWheel(
  target: EventTarget | null,
  shell: HTMLElement,
  deltaY: number,
) {
  let element = target instanceof HTMLElement ? target : null;
  while (element && element !== shell) {
    if (canConsumeVerticalWheel(element, deltaY)) return true;
    element = element.parentElement;
  }
  return false;
}

function wheelDeltaInPixels(event: WheelEvent, scrollRegion: HTMLElement) {
  if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) return event.deltaY * 16;
  if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
    return event.deltaY * scrollRegion.clientHeight;
  }
  return event.deltaY;
}

export function KanbanComposerOverlay({
  children,
}: KanbanComposerOverlayProps) {
  const shellRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const shell = shellRef.current;
    const mount = shell?.parentElement;
    if (!shell || !mount) return;

    let animationFrame: number | null = null;
    const updateClearance = () => {
      if (animationFrame !== null) cancelAnimationFrame(animationFrame);
      animationFrame = requestAnimationFrame(() => {
        animationFrame = null;
        const height = Math.ceil(shell.getBoundingClientRect().height);
        mount.style.setProperty("--kanban-composer-clearance", `${height}px`);
      });
    };

    updateClearance();
    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(updateClearance);
    resizeObserver?.observe(shell);
    window.addEventListener("resize", updateClearance);

    return () => {
      if (animationFrame !== null) cancelAnimationFrame(animationFrame);
      resizeObserver?.disconnect();
      window.removeEventListener("resize", updateClearance);
      mount.style.removeProperty("--kanban-composer-clearance");
    };
  }, []);

  useLayoutEffect(() => {
    const shell = shellRef.current;
    const mount = shell?.parentElement;
    if (!shell || !mount) return;

    const handleWheel = (event: WheelEvent) => {
      if (
        event.defaultPrevented ||
        Math.abs(event.deltaY) <= Math.abs(event.deltaX)
      ) {
        return;
      }
      if (descendantCanConsumeWheel(event.target, shell, event.deltaY)) return;

      const scrollRegion = mount.querySelector<HTMLElement>(
        ".kanban-board-groups, .kanban-archive-board, .kanban-board",
      );
      if (!scrollRegion) return;

      const deltaY = wheelDeltaInPixels(event, scrollRegion);
      const maximumScrollTop = Math.max(
        0,
        scrollRegion.scrollHeight - scrollRegion.clientHeight,
      );
      const nextScrollTop = Math.min(
        maximumScrollTop,
        Math.max(0, scrollRegion.scrollTop + deltaY),
      );
      if (nextScrollTop === scrollRegion.scrollTop) return;

      scrollRegion.scrollTop = nextScrollTop;
      event.preventDefault();
    };

    shell.addEventListener("wheel", handleWheel, { passive: false });
    return () => shell.removeEventListener("wheel", handleWheel);
  }, []);

  return (
    <div ref={shellRef} className="kanban-composer-shell">
      {children}
    </div>
  );
}
