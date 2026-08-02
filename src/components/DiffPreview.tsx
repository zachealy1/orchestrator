import {
  useVirtualizer,
  type Virtualizer,
  type VirtualItem,
} from "@tanstack/react-virtual";
import {
  memo,
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import type { ResolvedTheme } from "../shared/types";
import type { WorkspaceGitDiffSection } from "../features/workspaces/types";
import {
  buildDiffOverviewMarkers,
  buildDiffRows,
  calculateOverviewViewport,
  highlightDiffSide,
  scrollToOverviewPosition,
  splitDiffLines,
  type DiffOverviewMarker,
  type DiffOverviewViewport,
  type DiffRow,
  type DiffToken,
  type HighlightedDiffSide,
} from "../lib/diffPreview";
import { useAppServices } from "../runtime/AppServices";

type DiffLayout = "side-by-side" | "inline";

type SectionHighlight = {
  base: HighlightedDiffSide;
  head: HighlightedDiffSide;
  fallback: boolean;
};

type ScrollMetrics = {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
};

type OverviewKeyboardAction = "line-up" | "line-down" | "page-up" | "page-down" | "start" | "end";

type Props = {
  path: string;
  sections: WorkspaceGitDiffSection[];
  resolvedTheme: ResolvedTheme;
  layout: DiffLayout;
};

type VirtualDiffRow = {
  sectionId: string;
  row: DiffRow;
};

type RenderedVirtualRow = Pick<VirtualItem, "key" | "index" | "start">;

const INITIAL_SCROLL_METRICS: ScrollMetrics = {
  scrollTop: 0,
  scrollHeight: 0,
  clientHeight: 0,
};

const VIRTUAL_OVERSCAN = 30;
const SIDE_BY_SIDE_ROW_ESTIMATE_PX = 24;
const INLINE_ROW_ESTIMATE_PX = 44;
const PENDING_SECTION_HIGHLIGHT: SectionHighlight = {
  base: { language: "plaintext", lines: [] },
  head: { language: "plaintext", lines: [] },
  fallback: false,
};

function observeDiffElementOffset<TItemElement extends Element>(
  instance: Virtualizer<HTMLDivElement, TItemElement>,
  callback: (offset: number, isScrolling: boolean) => void,
) {
  const element = instance.scrollElement;
  const targetWindow = instance.targetWindow;
  if (!element || !targetWindow) return;

  let settledTimeoutId: number | null = null;
  let latestOffset = element.scrollTop;
  const handleScroll = () => {
    latestOffset = element.scrollTop;
    if (settledTimeoutId !== null) {
      targetWindow.clearTimeout(settledTimeoutId);
    }
    settledTimeoutId = targetWindow.setTimeout(() => {
      settledTimeoutId = null;
      callback(latestOffset, false);
    }, instance.options.isScrollingResetDelay);
    callback(latestOffset, true);
  };

  element.addEventListener("scroll", handleScroll, { passive: true });
  return () => {
    element.removeEventListener("scroll", handleScroll);
    if (settledTimeoutId !== null) {
      targetWindow.clearTimeout(settledTimeoutId);
    }
  };
}

export const DiffPreview = memo(function DiffPreview({
  path,
  sections,
  resolvedTheme,
  layout,
}: Props) {
  const { codePreview } = useAppServices();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const scrollMetricsFrameRef = useRef<number | null>(null);
  const renderSections = useMemo(
    () =>
      sections.map((section, index) => ({
        id: `${section.kind}-${index}`,
        section,
        rows: buildDiffRows(section.baseContent, section.headContent),
      })),
    [sections],
  );
  const flattenedRows = useMemo(
    () =>
      renderSections.flatMap(({ id, rows }) =>
        rows.map((row) => ({
          sectionId: id,
          row,
        })),
      ),
    [renderSections],
  );
  const [highlights, setHighlights] = useState<Record<string, SectionHighlight>>(
    {},
  );
  const [scrollMetrics, setScrollMetrics] = useState(INITIAL_SCROLL_METRICS);
  const rowEstimate =
    layout === "side-by-side"
      ? SIDE_BY_SIDE_ROW_ESTIMATE_PX
      : INLINE_ROW_ESTIMATE_PX;
  const rowVirtualizer = useVirtualizer({
    count: flattenedRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowEstimate,
    overscan: VIRTUAL_OVERSCAN,
    initialRect: { width: 900, height: 720 },
    observeElementOffset: observeDiffElementOffset,
    getItemKey: (index) => {
      const item = flattenedRows[index];
      return item ? `${item.sectionId}-${item.row.id}` : index;
    },
  });
  const virtualRows: RenderedVirtualRow[] = rowVirtualizer.getVirtualItems();
  const renderedRows =
    virtualRows.length > 0
      ? virtualRows
      : buildFallbackVirtualRows(flattenedRows.length, rowEstimate, "diff");
  const totalSize = rowVirtualizer.getTotalSize();
  const overviewRows = useMemo(
    () => flattenedRows.map(({ row }) => row),
    [flattenedRows],
  );
  const overviewMarkers = useMemo(
    () => buildDiffOverviewMarkers(overviewRows),
    [overviewRows],
  );
  const overviewViewport = useMemo(
    () =>
      calculateOverviewViewport(
        scrollMetrics.scrollTop,
        scrollMetrics.scrollHeight,
        scrollMetrics.clientHeight,
      ),
    [scrollMetrics],
  );

  const readScrollMetrics = useCallback(() => {
    const scrollElement = scrollRef.current;
    if (!scrollElement) {
      return;
    }

    const nextMetrics = readVirtualScrollMetrics(scrollElement, totalSize);

    setScrollMetrics((current) =>
      current.scrollTop === nextMetrics.scrollTop &&
      current.scrollHeight === nextMetrics.scrollHeight &&
      current.clientHeight === nextMetrics.clientHeight
        ? current
        : nextMetrics,
    );
  }, [totalSize]);

  const updateScrollMetrics = useCallback(() => {
    if (scrollMetricsFrameRef.current !== null) {
      return;
    }

    scrollMetricsFrameRef.current = window.requestAnimationFrame(() => {
      scrollMetricsFrameRef.current = null;
      readScrollMetrics();
    });
  }, [readScrollMetrics]);

  useEffect(() => {
    let disposed = false;
    setHighlights({});

    void Promise.all(
      renderSections.map(async ({ id, section }) => {
        try {
          const [base, head] = await Promise.all([
            highlightDiffSide(
              section.baseContent,
              path,
              resolvedTheme,
              codePreview,
            ),
            highlightDiffSide(
              section.headContent,
              path,
              resolvedTheme,
              codePreview,
            ),
          ]);
          return { id, highlight: { base, head, fallback: false } };
        } catch {
          return {
            id,
            highlight: {
              base: fallbackHighlight(section.baseContent),
              head: fallbackHighlight(section.headContent),
              fallback: true,
            },
          };
        }
      }),
    ).then((results) => {
      if (disposed) {
        return;
      }

      startTransition(() => {
        setHighlights(
          Object.fromEntries(
            results.map((result) => [result.id, result.highlight]),
          ),
        );
      });
    });

    return () => {
      disposed = true;
    };
  }, [codePreview, path, renderSections, resolvedTheme]);

  useEffect(() => {
    const scrollElement = scrollRef.current;
    if (!scrollElement) {
      return;
    }

    readScrollMetrics();
    scrollElement.addEventListener("scroll", updateScrollMetrics, {
      passive: true,
    });

    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(updateScrollMetrics);
    resizeObserver?.observe(scrollElement);
    window.addEventListener("resize", updateScrollMetrics);

    return () => {
      scrollElement.removeEventListener("scroll", updateScrollMetrics);
      resizeObserver?.disconnect();
      window.removeEventListener("resize", updateScrollMetrics);
      if (scrollMetricsFrameRef.current !== null) {
        window.cancelAnimationFrame(scrollMetricsFrameRef.current);
        scrollMetricsFrameRef.current = null;
      }
    };
  }, [readScrollMetrics, updateScrollMetrics]);

  useEffect(() => {
    const frameId = window.requestAnimationFrame(readScrollMetrics);
    return () => window.cancelAnimationFrame(frameId);
  }, [flattenedRows.length, highlights, layout, readScrollMetrics, totalSize]);

  const jumpToOverviewRatio = useCallback(
    (ratio: number) => {
      const scrollElement = scrollRef.current;
      if (!scrollElement) {
        return;
      }

      scrollToOverviewPosition(
        scrollElement,
        ratio,
        getVirtualScrollHeight(totalSize, scrollElement.clientHeight),
      );
      readScrollMetrics();
    },
    [readScrollMetrics, totalSize],
  );

  const navigateOverview = useCallback(
    (action: OverviewKeyboardAction) => {
      const scrollElement = scrollRef.current;
      if (!scrollElement) {
        return;
      }

      const lineStep = 42;
      const pageStep = Math.max(scrollElement.clientHeight * 0.85, lineStep);
      const maxScrollTop = Math.max(
        getVirtualScrollHeight(totalSize, scrollElement.clientHeight) -
          scrollElement.clientHeight,
        0,
      );

      if (action === "start") {
        scrollElement.scrollTop = 0;
      } else if (action === "end") {
        scrollElement.scrollTop = maxScrollTop;
      } else {
        const delta =
          action === "line-up"
            ? -lineStep
            : action === "line-down"
              ? lineStep
              : action === "page-up"
                ? -pageStep
                : pageStep;
        scrollElement.scrollTop = Math.min(
          Math.max(scrollElement.scrollTop + delta, 0),
          maxScrollTop,
        );
      }

      readScrollMetrics();
    },
    [readScrollMetrics, totalSize],
  );

  return (
    <div className={`diff-preview ${layout}`} aria-label="Full file diff preview">
      {layout === "side-by-side" ? <DiffPinnedColumnHeader /> : null}
      <div className="diff-preview-body">
        <div className="diff-preview-scroll" ref={scrollRef}>
          {layout === "side-by-side" ? (
            <SideBySideRows
              rows={flattenedRows}
              virtualRows={renderedRows}
              totalSize={totalSize}
              highlights={highlights}
              measureElement={rowVirtualizer.measureElement}
            />
          ) : (
            <InlineRows
              rows={flattenedRows}
              virtualRows={renderedRows}
              totalSize={totalSize}
              highlights={highlights}
              measureElement={rowVirtualizer.measureElement}
            />
          )}
        </div>
        <DiffOverviewRuler
          markers={overviewMarkers}
          viewport={overviewViewport}
          scrollTop={scrollMetrics.scrollTop}
          maxScrollTop={Math.max(
            scrollMetrics.scrollHeight - scrollMetrics.clientHeight,
            0,
          )}
          onJumpToRatio={jumpToOverviewRatio}
          onNavigate={navigateOverview}
        />
      </div>
    </div>
  );
});

function DiffPinnedColumnHeader() {
  return (
    <div
      className="diff-preview-pinned-column-header"
      aria-label="Diff columns"
    >
      <div className="diff-preview-pinned-column-title old">Original</div>
      <div className="diff-preview-pinned-column-title new">Modified</div>
    </div>
  );
}

function DiffOverviewRuler({
  markers,
  viewport,
  scrollTop,
  maxScrollTop,
  onJumpToRatio,
  onNavigate,
}: {
  markers: DiffOverviewMarker[];
  viewport: DiffOverviewViewport;
  scrollTop: number;
  maxScrollTop: number;
  onJumpToRatio: (ratio: number) => void;
  onNavigate: (action: OverviewKeyboardAction) => void;
}) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const activePointerIdRef = useRef<number | null>(null);

  const jumpFromClientY = useCallback(
    (clientY: number) => {
      const track = trackRef.current;
      if (!track) {
        return;
      }

      const rect = track.getBoundingClientRect();
      if (rect.height <= 0) {
        return;
      }

      onJumpToRatio((clientY - rect.top) / rect.height);
    },
    [onJumpToRatio],
  );

  const handlePointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      activePointerIdRef.current = event.pointerId;
      event.currentTarget.setPointerCapture?.(event.pointerId);
      event.preventDefault();
      jumpFromClientY(event.clientY);
    },
    [jumpFromClientY],
  );

  const handlePointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (activePointerIdRef.current !== event.pointerId) {
        return;
      }

      event.preventDefault();
      jumpFromClientY(event.clientY);
    },
    [jumpFromClientY],
  );

  const handlePointerEnd = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (activePointerIdRef.current !== event.pointerId) {
      return;
    }

    event.currentTarget.releasePointerCapture?.(event.pointerId);
    activePointerIdRef.current = null;
  }, []);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      const actionByKey: Partial<Record<string, OverviewKeyboardAction>> = {
        ArrowUp: "line-up",
        ArrowDown: "line-down",
        PageUp: "page-up",
        PageDown: "page-down",
        Home: "start",
        End: "end",
      };
      const action = actionByKey[event.key];
      if (!action) {
        return;
      }

      event.preventDefault();
      onNavigate(action);
    },
    [onNavigate],
  );

  if (!viewport.scrollable) {
    return null;
  }

  return (
    <div
      className="diff-overview-ruler"
      role="scrollbar"
      tabIndex={0}
      aria-label="Diff overview scroller"
      aria-orientation="vertical"
      aria-valuemin={0}
      aria-valuemax={Math.round(maxScrollTop)}
      aria-valuenow={Math.round(scrollTop)}
      onKeyDown={handleKeyDown}
    >
      <div
        className="diff-overview-track"
        ref={trackRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
      >
        {markers.map((marker) => (
          <span
            aria-hidden="true"
            className={`diff-overview-marker ${marker.kind}`}
            key={marker.id}
            style={{
              top: `${marker.topPercent}%`,
              height: `${marker.heightPercent}%`,
            }}
          />
        ))}
        <span
          aria-hidden="true"
          className="diff-overview-thumb"
          style={{
            top: `${viewport.topPercent}%`,
            height: `${viewport.heightPercent}%`,
          }}
        />
      </div>
    </div>
  );
}

const SideBySideRows = memo(function SideBySideRows({
  rows,
  virtualRows,
  totalSize,
  highlights,
  measureElement,
}: {
  rows: VirtualDiffRow[];
  virtualRows: RenderedVirtualRow[];
  totalSize: number;
  highlights: Record<string, SectionHighlight>;
  measureElement: (node: HTMLDivElement | null) => void;
}) {
  return (
    <div
      className="diff-preview-grid virtualized"
      role="table"
      aria-label="Side-by-side diff"
      style={{ height: `${totalSize}px` }}
    >
      {virtualRows.map((virtualRow) => {
        const item = rows[virtualRow.index];
        if (!item) {
          return null;
        }
        const row = item.row;
        const highlight = highlights[item.sectionId] ?? PENDING_SECTION_HIGHLIGHT;

        return (
          <div
            className={`diff-preview-row ${row.kind}`}
            role="row"
            key={virtualRow.key}
            data-index={virtualRow.index}
            ref={measureElement}
            style={{ transform: `translateY(${virtualRow.start}px)` }}
          >
            <DiffCell
              side="old"
              lineNumber={row.baseLineNumber}
              tokens={tokensForLine(
                highlight.base.lines,
                row.baseLineNumber,
                row.baseText,
              )}
            />
            <DiffCell
              side="new"
              lineNumber={row.headLineNumber}
              tokens={tokensForLine(
                highlight.head.lines,
                row.headLineNumber,
                row.headText,
              )}
            />
          </div>
        );
      })}
    </div>
  );
});

const InlineRows = memo(function InlineRows({
  rows,
  virtualRows,
  totalSize,
  highlights,
  measureElement,
}: {
  rows: VirtualDiffRow[];
  virtualRows: RenderedVirtualRow[];
  totalSize: number;
  highlights: Record<string, SectionHighlight>;
  measureElement: (node: HTMLDivElement | null) => void;
}) {
  return (
    <div
      className="diff-preview-inline virtualized"
      role="table"
      aria-label="Inline diff"
      style={{ height: `${totalSize}px` }}
    >
      {virtualRows.map((virtualRow) => {
        const item = rows[virtualRow.index];
        if (!item) {
          return null;
        }
        const row = item.row;
        const highlight = highlights[item.sectionId] ?? PENDING_SECTION_HIGHLIGHT;

        return (
          <div
            className="diff-preview-inline-group"
            role="rowgroup"
            key={virtualRow.key}
            data-index={virtualRow.index}
            ref={measureElement}
            style={{ transform: `translateY(${virtualRow.start}px)` }}
          >
            {row.kind !== "added" ? (
              <DiffCell
                side={row.kind === "unchanged" ? "context" : "old"}
                lineNumber={row.baseLineNumber}
                tokens={tokensForLine(
                  highlight.base.lines,
                  row.baseLineNumber,
                  row.baseText,
                )}
              />
            ) : null}
            {row.kind !== "removed" && row.kind !== "unchanged" ? (
              <DiffCell
                side="new"
                lineNumber={row.headLineNumber}
                tokens={tokensForLine(
                  highlight.head.lines,
                  row.headLineNumber,
                  row.headText,
                )}
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
});

const DiffCell = memo(function DiffCell({
  side,
  lineNumber,
  tokens,
}: {
  side: "old" | "new" | "context";
  lineNumber: number | null;
  tokens: DiffToken[];
}) {
  return (
    <div className={`diff-preview-cell ${side}`}>
      <span className="diff-preview-gutter" aria-hidden="true">
        {lineNumber ?? ""}
      </span>
      <code className="diff-preview-source">
        {tokens.map((token, index) => (
          <span
            className={token.semantic ? `code-preview-token ${token.semantic}` : undefined}
            key={`${index}-${token.content}`}
            style={
              token.color && !token.semantic
                ? { color: token.color }
                : undefined
            }
          >
            {token.content}
          </span>
        ))}
      </code>
    </div>
  );
});

function tokensForLine(
  lines: DiffToken[][],
  lineNumber: number | null,
  fallbackText: string,
) {
  if (lineNumber === null) {
    return fallbackText ? [{ content: fallbackText }] : [{ content: "" }];
  }
  return lines[lineNumber - 1] ?? [{ content: fallbackText }];
}

function fallbackHighlight(content: string): HighlightedDiffSide {
  return {
    language: "plaintext",
    lines: splitDiffLines(content).map((line) => [{ content: line }]),
  };
}

function readVirtualScrollMetrics(
  scrollElement: HTMLElement,
  totalSize: number,
): ScrollMetrics {
  const clientHeight = scrollElement.clientHeight;
  const scrollHeight = getVirtualScrollHeight(totalSize, clientHeight);
  const scrollTop = clampScrollTop(
    scrollElement.scrollTop,
    scrollHeight,
    clientHeight,
  );

  if (scrollElement.scrollTop !== scrollTop) {
    scrollElement.scrollTop = scrollTop;
  }

  return {
    scrollTop,
    scrollHeight,
    clientHeight,
  };
}

function getVirtualScrollHeight(totalSize: number, clientHeight: number) {
  return Math.max(totalSize, clientHeight);
}

function clampScrollTop(
  scrollTop: number,
  scrollHeight: number,
  clientHeight: number,
) {
  const maxScrollTop = Math.max(scrollHeight - clientHeight, 0);
  return Math.min(Math.max(scrollTop, 0), maxScrollTop);
}

function buildFallbackVirtualRows(
  count: number,
  rowEstimate: number,
  keyPrefix: string,
): RenderedVirtualRow[] {
  const visibleCount = Math.min(count, VIRTUAL_OVERSCAN * 2 + 1);
  return Array.from({ length: visibleCount }, (_, index) => ({
    key: `${keyPrefix}-fallback-${index}`,
    index,
    start: index * rowEstimate,
  }));
}
