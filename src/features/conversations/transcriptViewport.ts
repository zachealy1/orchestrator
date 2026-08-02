import type { StateSnapshot } from "react-virtuoso";

export type InitialTranscriptPosition =
  | { kind: "default" }
  | { kind: "latest" }
  | {
      kind: "restore";
      snapshot: StateSnapshot;
      location: { index: number; align: "start"; offset: number };
    };

export function createRestoredTranscriptPosition(
  snapshot: StateSnapshot,
  fallbackHeights: number[],
): Extract<InitialTranscriptPosition, { kind: "restore" }> {
  const heightEstimates = [...fallbackHeights];
  for (const range of snapshot.ranges) {
    if (!Number.isFinite(range.size) || range.size <= 0) continue;
    const startIndex = Math.max(0, Math.floor(range.startIndex));
    const endIndex = Math.min(
      heightEstimates.length - 1,
      Number.isFinite(range.endIndex)
        ? Math.floor(range.endIndex)
        : heightEstimates.length - 1,
    );
    for (let index = startIndex; index <= endIndex; index += 1) {
      heightEstimates[index] = range.size;
    }
  }

  const scrollTop = Math.max(0, snapshot.scrollTop);
  let itemTop = 0;
  let index = 0;
  for (; index < heightEstimates.length - 1; index += 1) {
    const itemBottom = itemTop + heightEstimates[index];
    if (scrollTop < itemBottom) break;
    itemTop = itemBottom;
  }

  return {
    kind: "restore",
    snapshot,
    location: {
      index,
      align: "start",
      offset: Math.max(0, scrollTop - itemTop),
    },
  };
}

export function isTranscriptScrollKey(key: string) {
  return [
    "ArrowUp",
    "ArrowDown",
    "PageUp",
    "PageDown",
    "Home",
    "End",
    " ",
  ].includes(key);
}

export function isEditableScrollTarget(target: EventTarget | null) {
  return (
    target instanceof Element &&
    Boolean(target.closest("input, textarea, select, [contenteditable='true']"))
  );
}

export function monotonicNow() {
  return typeof performance === "undefined" ? Date.now() : performance.now();
}

export function latestTranscriptRowIsVisible(
  scroller: HTMLElement,
  finalEntryId: string,
  bottomThreshold: number,
) {
  const finalRow = Array.from(
    scroller.querySelectorAll<HTMLElement>("[data-transcript-entry-id]"),
  ).find(
    (candidate) => candidate.dataset.transcriptEntryId === finalEntryId,
  );
  if (!finalRow) return false;

  const viewport = scroller.getBoundingClientRect();
  if (viewport.width <= 0 || viewport.height <= 0) return true;
  const bounds = finalRow.getBoundingClientRect();
  const bottomGap =
    scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
  return (
    bounds.bottom > viewport.top &&
    bounds.top < viewport.bottom &&
    bottomGap <= bottomThreshold
  );
}
