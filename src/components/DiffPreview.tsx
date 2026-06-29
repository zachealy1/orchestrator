import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import type { ResolvedTheme, WorkspaceGitDiffSection } from "../types";
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

const INITIAL_SCROLL_METRICS: ScrollMetrics = {
  scrollTop: 0,
  scrollHeight: 0,
  clientHeight: 0,
};

export function DiffPreview({ path, sections, resolvedTheme, layout }: Props) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const renderSections = useMemo(
    () =>
      sections.map((section, index) => ({
        id: `${section.kind}-${index}`,
        section,
        rows: buildDiffRows(section.baseContent, section.headContent),
      })),
    [sections],
  );
  const [highlights, setHighlights] = useState<Record<string, SectionHighlight>>(
    {},
  );
  const [scrollMetrics, setScrollMetrics] = useState(INITIAL_SCROLL_METRICS);
  const overviewRows = useMemo(
    () => renderSections.flatMap(({ rows }) => rows),
    [renderSections],
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

  const updateScrollMetrics = useCallback(() => {
    const scrollElement = scrollRef.current;
    if (!scrollElement) {
      return;
    }

    const nextMetrics = {
      scrollTop: scrollElement.scrollTop,
      scrollHeight: scrollElement.scrollHeight,
      clientHeight: scrollElement.clientHeight,
    };

    setScrollMetrics((current) =>
      current.scrollTop === nextMetrics.scrollTop &&
      current.scrollHeight === nextMetrics.scrollHeight &&
      current.clientHeight === nextMetrics.clientHeight
        ? current
        : nextMetrics,
    );
  }, []);

  useEffect(() => {
    let disposed = false;
    setHighlights({});

    void Promise.all(
      renderSections.map(async ({ id, section }) => {
        try {
          const [base, head] = await Promise.all([
            highlightDiffSide(section.baseContent, path, resolvedTheme),
            highlightDiffSide(section.headContent, path, resolvedTheme),
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

      setHighlights(
        Object.fromEntries(
          results.map((result) => [result.id, result.highlight]),
        ),
      );
    });

    return () => {
      disposed = true;
    };
  }, [path, renderSections, resolvedTheme]);

  useEffect(() => {
    const scrollElement = scrollRef.current;
    if (!scrollElement) {
      return;
    }

    updateScrollMetrics();
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
    };
  }, [updateScrollMetrics]);

  useEffect(() => {
    const frameId = window.requestAnimationFrame(updateScrollMetrics);
    return () => window.cancelAnimationFrame(frameId);
  }, [highlights, layout, renderSections, updateScrollMetrics]);

  const jumpToOverviewRatio = useCallback(
    (ratio: number) => {
      const scrollElement = scrollRef.current;
      if (!scrollElement) {
        return;
      }

      scrollToOverviewPosition(scrollElement, ratio);
      updateScrollMetrics();
    },
    [updateScrollMetrics],
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
        scrollElement.scrollHeight - scrollElement.clientHeight,
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

      updateScrollMetrics();
    },
    [updateScrollMetrics],
  );

  return (
    <div className={`diff-preview ${layout}`} aria-label="Full file diff preview">
      <div className="diff-preview-summary">
        {renderSections.map(({ id, section }) => {
          const highlight = highlights[id] ?? {
            base: fallbackHighlight(section.baseContent),
            head: fallbackHighlight(section.headContent),
            fallback: false,
          };

          return (
            <header className="diff-preview-section-header" key={id}>
              <div>
                <strong>{section.title}</strong>
                <span>
                  {section.baseLabel} → {section.headLabel}
                </span>
              </div>
              <div className="diff-preview-badges" aria-label="Diff metadata">
                <span>{labelLanguage(highlight.head.language)}</span>
                {section.baseTruncated || section.headTruncated ? (
                  <span>Truncated</span>
                ) : null}
                {highlight.fallback ? <span>Plain text fallback</span> : null}
              </div>
            </header>
          );
        })}
      </div>
      {layout === "side-by-side" ? <DiffPinnedColumnHeader /> : null}
      <div className="diff-preview-body">
        <div className="diff-preview-scroll" ref={scrollRef}>
          {renderSections.map(({ id, section, rows }) => {
            const highlight = highlights[id] ?? {
              base: fallbackHighlight(section.baseContent),
              head: fallbackHighlight(section.headContent),
              fallback: false,
            };

            return (
              <section className="diff-preview-section" key={id}>
                {layout === "side-by-side" ? (
                  <SideBySideRows
                    rows={rows}
                    baseLines={highlight.base.lines}
                    headLines={highlight.head.lines}
                  />
                ) : (
                  <InlineRows
                    rows={rows}
                    baseLines={highlight.base.lines}
                    headLines={highlight.head.lines}
                  />
                )}
              </section>
            );
          })}
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
}

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

function SideBySideRows({
  rows,
  baseLines,
  headLines,
}: {
  rows: DiffRow[];
  baseLines: DiffToken[][];
  headLines: DiffToken[][];
}) {
  return (
    <div className="diff-preview-grid" role="table" aria-label="Side-by-side diff">
      {rows.map((row) => (
        <div className={`diff-preview-row ${row.kind}`} role="row" key={row.id}>
          <DiffCell
            side="old"
            lineNumber={row.baseLineNumber}
            tokens={tokensForLine(baseLines, row.baseLineNumber, row.baseText)}
          />
          <DiffCell
            side="new"
            lineNumber={row.headLineNumber}
            tokens={tokensForLine(headLines, row.headLineNumber, row.headText)}
          />
        </div>
      ))}
    </div>
  );
}

function InlineRows({
  rows,
  baseLines,
  headLines,
}: {
  rows: DiffRow[];
  baseLines: DiffToken[][];
  headLines: DiffToken[][];
}) {
  return (
    <div className="diff-preview-inline" role="table" aria-label="Inline diff">
      {rows.map((row) => (
        <div className="diff-preview-inline-group" role="rowgroup" key={row.id}>
          {row.kind !== "added" ? (
            <DiffCell
              side={row.kind === "unchanged" ? "context" : "old"}
              lineNumber={row.baseLineNumber}
              tokens={tokensForLine(baseLines, row.baseLineNumber, row.baseText)}
            />
          ) : null}
          {row.kind !== "removed" && row.kind !== "unchanged" ? (
            <DiffCell
              side="new"
              lineNumber={row.headLineNumber}
              tokens={tokensForLine(headLines, row.headLineNumber, row.headText)}
            />
          ) : null}
        </div>
      ))}
    </div>
  );
}

function DiffCell({
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
}

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

function labelLanguage(language: string) {
  return language === "plaintext" ? "Plain text" : language.toUpperCase();
}
