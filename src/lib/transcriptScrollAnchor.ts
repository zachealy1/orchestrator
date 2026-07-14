const TRANSCRIPT_BOTTOM_THRESHOLD_PX = 48;

export type TranscriptViewportAnchor = {
  scroller: HTMLElement;
  entryId: string | null;
  offset: number;
  atBottom: boolean;
};

function maximumScrollTop(element: HTMLElement) {
  return Math.max(0, element.scrollHeight - element.clientHeight);
}

function scrollTo(element: HTMLElement, top: number) {
  const clampedTop = Math.min(maximumScrollTop(element), Math.max(0, top));
  if (typeof element.scrollTo === "function") {
    element.scrollTo({ top: clampedTop, behavior: "auto" });
    return;
  }
  element.scrollTop = clampedTop;
}

export function captureTranscriptViewportAnchor(
  taskViewport: HTMLElement | null,
): TranscriptViewportAnchor | null {
  const scroller = taskViewport?.querySelector<HTMLElement>(
    ".task-chat-transcript.native-transcript",
  );
  if (!scroller) return null;

  const maxScrollTop = maximumScrollTop(scroller);
  const atBottom =
    scroller.scrollTop <= maxScrollTop + 1 &&
    maxScrollTop - scroller.scrollTop <= TRANSCRIPT_BOTTOM_THRESHOLD_PX;
  const viewportTop = scroller.getBoundingClientRect().top;
  const rows = Array.from(
    scroller.querySelectorAll<HTMLElement>("[data-transcript-entry-id]"),
  );
  const anchor = rows.find(
    (row) => row.getBoundingClientRect().bottom > viewportTop + 1,
  );

  return {
    scroller,
    entryId: anchor?.dataset.transcriptEntryId ?? null,
    offset: anchor ? anchor.getBoundingClientRect().top - viewportTop : 0,
    atBottom,
  };
}

export function restoreTranscriptViewportAnchor(
  anchor: TranscriptViewportAnchor | null,
) {
  if (!anchor || !anchor.scroller.isConnected) return;

  if (anchor.atBottom) {
    scrollTo(anchor.scroller, maximumScrollTop(anchor.scroller));
    return;
  }
  if (!anchor.entryId) return;

  const row = Array.from(
    anchor.scroller.querySelectorAll<HTMLElement>("[data-transcript-entry-id]"),
  ).find((candidate) => candidate.dataset.transcriptEntryId === anchor.entryId);
  if (!row) return;

  const viewportTop = anchor.scroller.getBoundingClientRect().top;
  const rowTop = row.getBoundingClientRect().top;
  scrollTo(
    anchor.scroller,
    anchor.scroller.scrollTop + rowTop - viewportTop - anchor.offset,
  );
}
