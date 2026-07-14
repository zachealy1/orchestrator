const TRANSCRIPT_BOTTOM_THRESHOLD_PX = 48;

export type TranscriptViewportAnchor = {
  scroller: HTMLElement;
  entryId: string | null;
  offset: number;
  atBottom: boolean;
};

function maxScrollTop(scroller: HTMLElement) {
  return Math.max(0, scroller.scrollHeight - scroller.clientHeight);
}

export function findFirstVisibleTranscriptRow(
  rows: ArrayLike<HTMLElement>,
  viewportTop: number,
) {
  let lower = 0;
  let upper = rows.length - 1;
  let match: HTMLElement | null = null;

  while (lower <= upper) {
    const index = Math.floor((lower + upper) / 2);
    const row = rows[index];
    if (row.getBoundingClientRect().bottom > viewportTop + 1) {
      match = row;
      upper = index - 1;
    } else {
      lower = index + 1;
    }
  }

  return match;
}

export function captureTranscriptViewportAnchor(
  scroller: HTMLElement | null,
): TranscriptViewportAnchor | null {
  if (!scroller?.isConnected) return null;

  const viewportTop = scroller.getBoundingClientRect().top;
  const maximumScrollTop = maxScrollTop(scroller);
  const anchorRow = findFirstVisibleTranscriptRow(
    scroller.querySelectorAll<HTMLElement>("[data-transcript-entry-id]"),
    viewportTop,
  );

  return {
    scroller,
    entryId: anchorRow?.dataset.transcriptEntryId ?? null,
    offset: anchorRow
      ? anchorRow.getBoundingClientRect().top - viewportTop
      : 0,
    atBottom:
      scroller.scrollTop <= maximumScrollTop + 1 &&
      maximumScrollTop - scroller.scrollTop <= TRANSCRIPT_BOTTOM_THRESHOLD_PX,
  };
}

export function restoreTranscriptViewportAnchor(
  anchor: TranscriptViewportAnchor | null,
) {
  if (!anchor?.scroller.isConnected) return;

  const { scroller } = anchor;
  if (anchor.atBottom) {
    scroller.scrollTop = maxScrollTop(scroller);
    return;
  }
  if (!anchor.entryId) return;

  const anchorRow = Array.from(
    scroller.querySelectorAll<HTMLElement>("[data-transcript-entry-id]"),
  ).find((row) => row.dataset.transcriptEntryId === anchor.entryId);
  if (!anchorRow) return;

  const viewportTop = scroller.getBoundingClientRect().top;
  const currentOffset = anchorRow.getBoundingClientRect().top - viewportTop;
  scroller.scrollTop = Math.max(
    0,
    Math.min(
      maxScrollTop(scroller),
      scroller.scrollTop + currentOffset - anchor.offset,
    ),
  );
}
