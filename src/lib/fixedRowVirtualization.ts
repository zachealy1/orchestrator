import { useEffect, useState, type RefObject } from "react";

export const DEFAULT_PREVIEW_VIEWPORT_HEIGHT = 720;

export function previewOverscanRows(viewportHeight: number, rowHeight: number) {
  return Math.max(Math.ceil(viewportHeight / rowHeight) * 2, 1);
}

export function usePreviewOverscan(
  scrollRef: RefObject<HTMLElement | null>,
  rowHeight: number,
  documentIdentity?: string | null,
) {
  const [overscan, setOverscan] = useState(() =>
    previewOverscanRows(DEFAULT_PREVIEW_VIEWPORT_HEIGHT, rowHeight),
  );

  useEffect(() => {
    const scrollElement = scrollRef.current;
    if (!scrollElement || typeof ResizeObserver === "undefined") {
      return;
    }

    const update = (height: number) => {
      const next = previewOverscanRows(height, rowHeight);
      setOverscan((current) => (current === next ? current : next));
    };
    update(scrollElement.clientHeight || DEFAULT_PREVIEW_VIEWPORT_HEIGHT);
    const observer = new ResizeObserver((entries) => {
      update(entries[0]?.contentRect.height ?? scrollElement.clientHeight);
    });
    observer.observe(scrollElement);
    return () => observer.disconnect();
  }, [documentIdentity, rowHeight, scrollRef]);

  return overscan;
}
