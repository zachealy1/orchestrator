import { useVirtualizer, type VirtualItem } from "@tanstack/react-virtual";
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import type { WorkspaceGitDiffSection } from "../features/workspaces/types";
import {
  buildDiffOverviewMarkers,
  calculateOverviewViewport,
  scrollToOverviewPosition,
  type DiffOverviewMarker,
  type DiffOverviewViewport,
  type DiffRow,
} from "../lib/diffPreview";
import { usePreviewOverscan } from "../lib/fixedRowVirtualization";
import {
  diffDocumentIdentity,
  preparePlaintextDiffDocument,
  type PreparedDiffDocument,
  type PreparedDiffSection,
  type PreparedPreviewToken,
  type PrepareDiffDocumentInput,
} from "../lib/previewDocuments";
import {
  recordPreviewDiagnostic,
  recordPreviewGeometry,
} from "../lib/previewDiagnostics";
import { useAppServices } from "../runtime/AppServices";
import type { ResolvedTheme } from "../shared/types";

type DiffLayout = "side-by-side" | "inline";
type ScrollMetrics = {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
};
type OverviewKeyboardAction =
  | "line-up"
  | "line-down"
  | "page-up"
  | "page-down"
  | "start"
  | "end";
type Props = {
  path: string;
  sections: WorkspaceGitDiffSection[];
  resolvedTheme: ResolvedTheme;
  layout: DiffLayout;
};
type PreparedSemanticRow = {
  id: string;
  section: PreparedDiffSection;
  row: DiffRow;
};
type PreparedInlineRow = {
  id: string;
  kind: DiffRow["kind"];
  side: "old" | "new" | "context";
  lineNumber: number | null;
  tokens: PreparedPreviewToken[];
  overviewRow: DiffRow;
};
type RenderedVirtualRow = Pick<VirtualItem, "key" | "index" | "start">;

const INITIAL_SCROLL_METRICS: ScrollMetrics = {
  scrollTop: 0,
  scrollHeight: 0,
  clientHeight: 0,
};
const DIFF_ROW_HEIGHT_PX = 24;

export const DiffPreview = memo(function DiffPreview({
  path,
  sections,
  resolvedTheme,
  layout,
}: Props) {
  const { codePreviewHighlighting } = useAppServices();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const scrollMetricsFrameRef = useRef<number | null>(null);
  const preparationInput = useMemo<PrepareDiffDocumentInput>(
    () => ({
      path,
      sections: sections.map((section, index) => ({
        id: `${section.kind}-${index}`,
        baseContent: section.baseContent,
        headContent: section.headContent,
        diffContent: section.content,
        baseTruncated: section.baseTruncated,
        headTruncated: section.headTruncated,
      })),
    }),
    [path, sections],
  );
  const preparationIdentity = useMemo(
    () => diffDocumentIdentity(preparationInput),
    [preparationInput],
  );
  const [prepared, setPrepared] = useState<PreparedDiffDocument | null>(null);
  const [preparationError, setPreparationError] = useState<string | null>(null);
  const [scrollMetrics, setScrollMetrics] = useState(INITIAL_SCROLL_METRICS);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setPreparationError(null);
    setPrepared((current) =>
      current?.identity === preparationIdentity ? current : null,
    );
    void codePreviewHighlighting
      .prepareDiff(preparationInput, controller.signal)
      .then((document) => {
        if (active) setPrepared(document);
      })
      .catch((error) => {
        if (!active) return;
        if (error instanceof Error && error.name === "AbortError") {
          return;
        }
        setPreparationError(error instanceof Error ? error.message : String(error));
        setPrepared(preparePlaintextDiffDocument(preparationInput));
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [
    codePreviewHighlighting,
    preparationIdentity,
    preparationInput,
  ]);

  const document =
    prepared?.identity === preparationIdentity ? prepared : null;
  const semanticRows = useMemo<PreparedSemanticRow[]>(
    () =>
      document?.sections.flatMap((section) =>
        section.rows.map((row) => ({
          id: `${section.id}-${row.id}`,
          section,
          row,
        })),
      ) ?? [],
    [document],
  );
  const inlineRows = useMemo(
    () => semanticRows.flatMap(flattenInlineRow),
    [semanticRows],
  );
  const displayRows = layout === "side-by-side" ? semanticRows : inlineRows;
  const overscan = usePreviewOverscan(
    scrollRef,
    DIFF_ROW_HEIGHT_PX,
    document?.identity,
  );
  const rowVirtualizer = useVirtualizer({
    count: displayRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => DIFF_ROW_HEIGHT_PX,
    overscan,
    initialRect: { width: 900, height: 720 },
    getItemKey: (index) => displayRows[index]?.id ?? index,
  });
  const virtualRows: RenderedVirtualRow[] = rowVirtualizer.getVirtualItems();
  const renderedRows =
    virtualRows.length > 0
      ? virtualRows
      : buildFallbackVirtualRows(
          displayRows.length,
          overscan,
          DIFF_ROW_HEIGHT_PX,
          "diff",
        );
  const totalSize = rowVirtualizer.getTotalSize();
  const overviewRows = useMemo(
    () =>
      layout === "side-by-side"
        ? semanticRows.map(({ row }) => row)
        : inlineRows.map(({ overviewRow }) => overviewRow),
    [inlineRows, layout, semanticRows],
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

  useLayoutEffect(() => {
    const scrollElement = scrollRef.current;
    if (scrollElement) {
      scrollElement.scrollTop = 0;
      scrollElement.scrollLeft = 0;
    }
  }, [preparationIdentity, layout]);

  useEffect(() => {
    if (!document) return;
    const frame = window.requestAnimationFrame(() => {
      recordPreviewDiagnostic({
        identity: document.identity,
        stage: "stable-paint",
        rowCount: displayRows.length,
      });
      const scrollElement = scrollRef.current;
      if (scrollElement) {
        recordPreviewGeometry(
          document.identity,
          scrollElement,
          layout === "side-by-side"
            ? ".diff-preview-row"
            : ".diff-preview-inline-row",
        );
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [displayRows.length, document]);

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
  }, [document, readScrollMetrics, updateScrollMetrics]);

  useEffect(() => {
    const frameId = window.requestAnimationFrame(readScrollMetrics);
    return () => window.cancelAnimationFrame(frameId);
  }, [displayRows.length, layout, readScrollMetrics, totalSize]);

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
      const pageStep = Math.max(
        scrollElement.clientHeight * 0.85,
        DIFF_ROW_HEIGHT_PX,
      );
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
            ? -DIFF_ROW_HEIGHT_PX
            : action === "line-down"
              ? DIFF_ROW_HEIGHT_PX
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
    <div
      className={`diff-preview ${layout}${overviewViewport.scrollable ? " overview-visible" : ""}`}
      aria-label="Full file diff preview"
      data-render-mode={document?.highlightingMode ?? "preparing"}
      data-row-height={DIFF_ROW_HEIGHT_PX}
    >
      {layout === "side-by-side" ? <DiffPinnedColumnHeader /> : null}
      {document?.truncated || preparationError ? (
        <div className="code-preview-meta" aria-label="Diff metadata">
          {document?.truncated ? <span>Truncated diff preview</span> : null}
          {preparationError ? <span>Plain text fallback</span> : null}
        </div>
      ) : null}
      {!document ? (
        <div className="code-preview-preparing" role="status">
          Preparing diff preview…
        </div>
      ) : (
        <div className="diff-preview-body">
          <div className="diff-preview-scroll" ref={scrollRef}>
            {layout === "side-by-side" ? (
              <SideBySideRows
                rows={semanticRows}
                virtualRows={renderedRows}
                totalSize={totalSize}
                resolvedTheme={resolvedTheme}
              />
            ) : (
              <InlineRows
                rows={inlineRows}
                virtualRows={renderedRows}
                totalSize={totalSize}
                resolvedTheme={resolvedTheme}
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
      )}
    </div>
  );
});

function DiffPinnedColumnHeader() {
  return (
    <div className="diff-preview-pinned-column-header" aria-label="Diff columns">
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
      if (!track) return;
      const rect = track.getBoundingClientRect();
      if (rect.height > 0) onJumpToRatio((clientY - rect.top) / rect.height);
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
      if (activePointerIdRef.current !== event.pointerId) return;
      event.preventDefault();
      jumpFromClientY(event.clientY);
    },
    [jumpFromClientY],
  );
  const handlePointerEnd = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (activePointerIdRef.current !== event.pointerId) return;
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
      if (!action) return;
      event.preventDefault();
      onNavigate(action);
    },
    [onNavigate],
  );
  if (!viewport.scrollable) return null;
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
  resolvedTheme,
}: {
  rows: PreparedSemanticRow[];
  virtualRows: RenderedVirtualRow[];
  totalSize: number;
  resolvedTheme: ResolvedTheme;
}) {
  return (
    <div
      className="diff-preview-grid virtualized"
      role="table"
      aria-label="Side-by-side diff"
      style={{ height: `${totalSize}px`, width: "100%" }}
    >
      {virtualRows.map((virtualRow) => {
        const item = rows[virtualRow.index];
        if (!item) return null;
        return (
          <div
            className={`diff-preview-row ${item.row.kind}`}
            role="row"
            key={virtualRow.key}
            data-index={virtualRow.index}
            style={{
              height: `${DIFF_ROW_HEIGHT_PX}px`,
              transform: `translate3d(0, ${Math.round(virtualRow.start)}px, 0)`,
            }}
          >
            <DiffCell
              side="old"
              lineNumber={item.row.baseLineNumber}
              tokens={tokensForLine(
                item.section.baseLines,
                item.row.baseLineNumber,
                item.row.baseText,
              )}
              resolvedTheme={resolvedTheme}
            />
            <DiffCell
              side="new"
              lineNumber={item.row.headLineNumber}
              tokens={tokensForLine(
                item.section.headLines,
                item.row.headLineNumber,
                item.row.headText,
              )}
              resolvedTheme={resolvedTheme}
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
  resolvedTheme,
}: {
  rows: PreparedInlineRow[];
  virtualRows: RenderedVirtualRow[];
  totalSize: number;
  resolvedTheme: ResolvedTheme;
}) {
  return (
    <div
      className="diff-preview-inline virtualized"
      role="table"
      aria-label="Inline diff"
      style={{ height: `${totalSize}px`, width: "100%" }}
    >
      {virtualRows.map((virtualRow) => {
        const item = rows[virtualRow.index];
        if (!item) return null;
        return (
          <div
            className={`diff-preview-inline-row ${item.kind}`}
            role="row"
            key={virtualRow.key}
            data-index={virtualRow.index}
            style={{
              height: `${DIFF_ROW_HEIGHT_PX}px`,
              transform: `translate3d(0, ${Math.round(virtualRow.start)}px, 0)`,
            }}
          >
            <DiffCell
              side={item.side}
              lineNumber={item.lineNumber}
              tokens={item.tokens}
              resolvedTheme={resolvedTheme}
            />
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
  resolvedTheme,
}: {
  side: "old" | "new" | "context";
  lineNumber: number | null;
  tokens: PreparedPreviewToken[];
  resolvedTheme: ResolvedTheme;
}) {
  return (
    <div className={`diff-preview-cell ${side}`}>
      <span className="diff-preview-gutter" aria-hidden="true">
        {lineNumber ?? ""}
      </span>
      <code className="diff-preview-source">
        {tokens.map((token, index) => (
          <span
            className={
              token.semantic
                ? `code-preview-token ${token.semantic}`
                : undefined
            }
            key={`${index}-${token.content}`}
            style={
              !token.semantic
                ? {
                    color:
                      resolvedTheme === "light"
                        ? token.lightColor
                        : token.darkColor,
                  }
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

function flattenInlineRow(item: PreparedSemanticRow): PreparedInlineRow[] {
  const { row, section } = item;
  if (row.kind === "unchanged") {
    return [{
      id: `${item.id}-context`,
      kind: row.kind,
      side: "context",
      lineNumber: row.baseLineNumber,
      tokens: tokensForLine(section.baseLines, row.baseLineNumber, row.baseText),
      overviewRow: row,
    }];
  }
  const result: PreparedInlineRow[] = [];
  if (row.kind !== "added") {
    result.push({
      id: `${item.id}-old`,
      kind: row.kind,
      side: "old",
      lineNumber: row.baseLineNumber,
      tokens: tokensForLine(section.baseLines, row.baseLineNumber, row.baseText),
      overviewRow: row,
    });
  }
  if (row.kind !== "removed") {
    result.push({
      id: `${item.id}-new`,
      kind: row.kind,
      side: "new",
      lineNumber: row.headLineNumber,
      tokens: tokensForLine(section.headLines, row.headLineNumber, row.headText),
      overviewRow: row,
    });
  }
  return result;
}

function tokensForLine(
  lines: PreparedPreviewToken[][],
  lineNumber: number | null,
  fallbackText: string,
) {
  if (lineNumber === null) {
    return [{ content: fallbackText }];
  }
  return lines[lineNumber - 1] ?? [{ content: fallbackText }];
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
  return { scrollTop, scrollHeight, clientHeight };
}

function getVirtualScrollHeight(totalSize: number, clientHeight: number) {
  return Math.max(totalSize, clientHeight);
}

function clampScrollTop(
  scrollTop: number,
  scrollHeight: number,
  clientHeight: number,
) {
  return Math.min(
    Math.max(scrollTop, 0),
    Math.max(scrollHeight - clientHeight, 0),
  );
}

function buildFallbackVirtualRows(
  count: number,
  overscan: number,
  rowHeight: number,
  keyPrefix: string,
): RenderedVirtualRow[] {
  const visibleCount = Math.min(count, overscan + 1);
  return Array.from({ length: visibleCount }, (_, index) => ({
    key: `${keyPrefix}-fallback-${index}`,
    index,
    start: index * rowHeight,
  }));
}
