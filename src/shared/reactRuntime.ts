import { useCallback, useRef } from "react";

export function waitForNextPaint() {
  return new Promise<void>((resolve) => {
    scheduleAfterNextPaint(resolve);
  });
}

export function useStableEvent<T extends (...args: never[]) => unknown>(callback: T): T {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;
  return useCallback(
    ((...args: Parameters<T>) => callbackRef.current(...args)) as T,
    [],
  );
}

export function markPerformance(name: string) {
  if (typeof performance !== "undefined" && typeof performance.mark === "function") {
    performance.mark(name);
  }
}

export function scheduleAfterNextPaint(callback: () => void) {
  return schedulePaintCallback(callback, true);
}

export function scheduleNextVisualFrame(callback: () => void) {
  return schedulePaintCallback(callback, false);
}

function schedulePaintCallback(callback: () => void, afterPaint: boolean) {
  let settled = false;
  let frameId: number | null = null;
  let afterPaintTimer: ReturnType<typeof setTimeout> | null = null;
  let fallbackTimer: ReturnType<typeof setTimeout> | null = null;
  const cleanUp = () => {
    if (typeof window !== "undefined" && frameId !== null) {
      window.cancelAnimationFrame(frameId);
    }
    if (afterPaintTimer !== null) clearTimeout(afterPaintTimer);
    if (fallbackTimer !== null) clearTimeout(fallbackTimer);
  };
  const runCallback = () => {
    if (settled) return;
    settled = true;
    cleanUp();
    callback();
  };
  // WKWebView can suspend frames when its window is occluded. Paint is a
  // courtesy to the optimistic UI, never a prerequisite for task execution.
  fallbackTimer = setTimeout(runCallback, 100);
  if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
    frameId = window.requestAnimationFrame(() => {
      frameId = null;
      if (settled) return;
      if (afterPaint) afterPaintTimer = setTimeout(runCallback, 0);
      else runCallback();
    });
  } else {
    afterPaintTimer = setTimeout(runCallback, 0);
  }
  return () => {
    settled = true;
    cleanUp();
  };
}
