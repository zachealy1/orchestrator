import { useCallback, useRef } from "react";

export function waitForNextPaint() {
  return new Promise<void>((resolve) => {
    const scheduleFrame =
      typeof requestAnimationFrame === "function"
        ? requestAnimationFrame
        : (callback: FrameRequestCallback) => {
            setTimeout(() => callback(performance.now()), 0);
            return 0;
          };
    scheduleFrame(() => setTimeout(resolve, 0));
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
  let cancelled = false;
  let frameId: number | null = null;
  let timeoutId: number | null = null;
  const runCallback = () => {
    timeoutId = null;
    if (!cancelled) callback();
  };
  if (typeof window === "undefined") {
    timeoutId = setTimeout(runCallback, 0) as unknown as number;
  } else {
    frameId = window.requestAnimationFrame(() => {
      frameId = null;
      timeoutId = window.setTimeout(runCallback, 0);
    });
  }
  return () => {
    cancelled = true;
    if (typeof window !== "undefined" && frameId !== null) {
      window.cancelAnimationFrame(frameId);
    }
    if (timeoutId !== null) clearTimeout(timeoutId);
  };
}
