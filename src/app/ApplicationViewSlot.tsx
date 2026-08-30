import {
  memo,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { scheduleAfterNextPaint } from "../shared/reactRuntime";

type IdleWindow = Window & {
  requestIdleCallback?: (
    callback: () => void,
    options?: { timeout: number },
  ) => number;
  cancelIdleCallback?: (handle: number) => void;
};

export function scheduleApplicationViewPreload(callback: () => void) {
  let cancelled = false;
  const runCallback = () => {
    if (!cancelled) callback();
  };

  if (typeof window === "undefined") {
    const timeoutId = setTimeout(runCallback, 0);
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }

  const idleWindow = window as IdleWindow;
  if (typeof idleWindow.requestIdleCallback === "function") {
    const idleId = idleWindow.requestIdleCallback(runCallback, {
      timeout: 1200,
    });
    return () => {
      cancelled = true;
      idleWindow.cancelIdleCallback?.(idleId);
    };
  }

  let timeoutId: number | null = null;
  const cancelPaint = scheduleAfterNextPaint(() => {
    timeoutId = window.setTimeout(runCallback, 700);
  });
  return () => {
    cancelled = true;
    cancelPaint();
    if (timeoutId !== null) window.clearTimeout(timeoutId);
  };
}

export const DeferredViewSlot = memo(function DeferredViewSlot({
  active,
  className,
  dragRegion,
  children,
}: {
  active: boolean;
  className: string;
  dragRegion?: string;
  children: ReactNode;
}) {
  const [mounted, setMounted] = useState(active);
  const renderedChildrenRef = useRef(children);
  if (active) renderedChildrenRef.current = children;

  useEffect(() => {
    if (active) {
      setMounted(true);
      return;
    }
    if (!mounted) return;
    return scheduleAfterNextPaint(() => setMounted(false));
  }, [active, mounted]);

  if (!active && !mounted) return null;

  return (
    <div
      className={`${className}${active ? "" : " application-view-slot-hidden"}`}
      data-tauri-drag-region={dragRegion}
      aria-hidden={!active}
    >
      {renderedChildrenRef.current}
    </div>
  );
});

export const PreloadedViewSlot = memo(function PreloadedViewSlot({
  active,
  className,
  dragRegion,
  children,
}: {
  active: boolean;
  className: string;
  dragRegion?: string;
  children: ReactNode;
}) {
  const [preloaded, setPreloaded] = useState(active);
  const wasActiveRef = useRef(active);

  useEffect(() => {
    if (active) {
      wasActiveRef.current = true;
      setPreloaded(true);
      return;
    }

    if (wasActiveRef.current) {
      wasActiveRef.current = false;
      setPreloaded(false);
      return;
    }

    if (!preloaded) {
      return scheduleApplicationViewPreload(() => setPreloaded(true));
    }
  }, [active, preloaded]);

  if (!active && !preloaded) return null;

  return (
    <div
      className={`${className}${
        active ? "" : " application-view-slot-preloaded"
      }`}
      data-tauri-drag-region={dragRegion}
      aria-hidden={!active}
    >
      {children}
    </div>
  );
});

export const PersistentPreloadedViewSlot = memo(
  function PersistentPreloadedViewSlot({
    active,
    className,
    dragRegion,
    children,
  }: {
    active: boolean;
    className: string;
    dragRegion?: string;
    children: ReactNode;
  }) {
    const [mounted, setMounted] = useState(active);
    const slotRef = useRef<HTMLDivElement | null>(null);
    const wasActiveRef = useRef(active);
    const scrollTopRef = useRef(0);

    useEffect(() => {
      if (active) {
        setMounted(true);
        return;
      }
      if (!mounted) {
        return scheduleApplicationViewPreload(() => setMounted(true));
      }
    }, [active, mounted]);

    useLayoutEffect(() => {
      if (!mounted) return;
      const scrollContainer = slotRef.current?.closest<HTMLElement>(".main");
      if (active && !wasActiveRef.current && scrollContainer) {
        scrollContainer.scrollTop = scrollTopRef.current;
      } else if (!active && wasActiveRef.current && scrollContainer) {
        scrollTopRef.current = scrollContainer.scrollTop;
      }
      wasActiveRef.current = active;
    }, [active, mounted]);

    if (!mounted) return null;

    return (
      <div
        ref={slotRef}
        className={`${className}${
          active ? "" : " application-view-slot-preloaded"
        }`}
        data-tauri-drag-region={dragRegion}
        aria-hidden={!active}
      >
        {children}
      </div>
    );
  },
);
