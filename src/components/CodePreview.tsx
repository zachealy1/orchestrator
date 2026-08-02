import { useVirtualizer } from "@tanstack/react-virtual";
import {
  memo,
  startTransition,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import type { ResolvedTheme } from "../shared/types";
import {
  codePreviewTheme,
  detectPreviewLanguage,
  type PreviewSemanticToken,
} from "../lib/codePreview";
import { useAppServices } from "../runtime/AppServices";

type Token = {
  content: string;
  color?: string;
  semantic?: PreviewSemanticToken["semantic"];
};

type HighlightedPreview = {
  path: string;
  content: string;
  language: string;
  resolvedTheme: ResolvedTheme;
  lines: Token[][];
};

type Props = {
  path: string;
  content: string;
  resolvedTheme: ResolvedTheme;
  truncated: boolean;
  complete?: boolean;
  version?: string;
  lines?: readonly string[];
  languageOverride?: string;
};

const VIRTUAL_OVERSCAN = 30;
const CODE_ROW_ESTIMATE_PX = 20;
const CODE_VERTICAL_PADDING_PX = 12;
const CODE_GUTTER_HORIZONTAL_PADDING_PX = 24;
const CODE_GUTTER_BORDER_PX = 1;
const MAX_HIGHLIGHT_SOURCE_CHARACTERS = 2_000_000;

type CodePreviewStyle = CSSProperties & {
  "--code-preview-gutter-width": string;
};

type RenderedVirtualRow = {
  key: string | number | bigint;
  index: number;
  start: number;
};

export const CodePreview = memo(function CodePreview({
  path,
  content,
  resolvedTheme,
  truncated,
  complete = true,
  version,
  lines,
  languageOverride,
}: Props) {
  const { codePreviewHighlighting } = useAppServices();
  const scrollRef = useRef<HTMLPreElement | null>(null);
  const language = useMemo(
    () => languageOverride ?? detectPreviewLanguage(path),
    [languageOverride, path],
  );
  const [highlightedPreview, setHighlightedPreview] =
    useState<HighlightedPreview | null>(null);
  const [highlightError, setHighlightError] = useState<string | null>(null);
  const fallbackLines = useMemo(
    () => lines ?? splitPreviewLines(content),
    [content, lines],
  );
  const theme = codePreviewTheme(resolvedTheme);
  const lineNumberDigits = String(fallbackLines.length).length;
  const previewStyle = useMemo<CodePreviewStyle>(
    () => ({
      "--code-preview-gutter-width": `calc(${lineNumberDigits}ch + ${
        CODE_GUTTER_HORIZONTAL_PADDING_PX + CODE_GUTTER_BORDER_PX
      }px)`,
    }),
    [lineNumberDigits],
  );

  useEffect(() => {
    let disposed = false;
    const abortController = new AbortController();
    setHighlightedPreview(null);
    setHighlightError(null);

    if (
      !complete ||
      Boolean(lines) ||
      language === "plaintext" ||
      content.length > MAX_HIGHLIGHT_SOURCE_CHARACTERS
    ) {
      return () => {
        disposed = true;
        abortController.abort();
      };
    }

    void codePreviewHighlighting
      .highlight(
        {
          path,
          content,
          language,
          resolvedTheme,
        },
        abortController.signal,
      )
      .then((lines) => {
        if (disposed) {
          return;
        }

        startTransition(() => {
          setHighlightedPreview({
            path,
            content,
            language,
            resolvedTheme,
            lines,
          });
        });
      })
      .catch((error) => {
        if (disposed) {
          return;
        }

        setHighlightError(error instanceof Error ? error.message : String(error));
      });

    return () => {
      disposed = true;
      abortController.abort();
    };
  }, [
    codePreviewHighlighting,
    complete,
    content,
    language,
    lines,
    path,
    resolvedTheme,
    theme,
  ]);

  const tokenLines =
    highlightedPreview?.path === path &&
    highlightedPreview.content === content &&
    highlightedPreview.language === language &&
    highlightedPreview.resolvedTheme === resolvedTheme
      ? highlightedPreview.lines
      : null;
  const rowVirtualizer = useVirtualizer({
    count: fallbackLines.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => CODE_ROW_ESTIMATE_PX,
    overscan: VIRTUAL_OVERSCAN,
    paddingStart: CODE_VERTICAL_PADDING_PX,
    paddingEnd: CODE_VERTICAL_PADDING_PX,
    initialRect: { width: 800, height: 720 },
    getItemKey: (index) => `${path}-${index}`,
  });
  const rowVirtualizerRef = useRef(rowVirtualizer);
  rowVirtualizerRef.current = rowVirtualizer;

  const scrollResetKey: string | readonly string[] = version ?? lines ?? content;
  const scrollIdentityRef = useRef({ path, scrollResetKey });
  if (
    scrollIdentityRef.current.path !== path ||
    scrollIdentityRef.current.scrollResetKey !== scrollResetKey
  ) {
    scrollIdentityRef.current = { path, scrollResetKey };
  }

  useLayoutEffect(() => {
    const scrollElement = scrollRef.current;
    if (scrollElement) {
      scrollElement.scrollTop = 0;
      scrollElement.scrollLeft = 0;
    }
  }, [path, scrollResetKey]);

  useLayoutEffect(() => {
    rowVirtualizer.measure();
  }, [content, lines, path]);

  useEffect(() => {
    const scrollElement = scrollRef.current;
    if (!scrollElement || typeof ResizeObserver === "undefined") {
      return;
    }

    let measuredWidth = scrollElement.clientWidth;
    let anchorFrame: number | null = null;
    let offsetFrame: number | null = null;
    const cancelAnchorRestore = () => {
      if (anchorFrame !== null) {
        cancelAnimationFrame(anchorFrame);
        anchorFrame = null;
      }
      if (offsetFrame !== null) {
        cancelAnimationFrame(offsetFrame);
        offsetFrame = null;
      }
    };
    const resizeObserver = new ResizeObserver((entries) => {
      const nextWidth = entries[0]?.contentRect.width ?? scrollElement.clientWidth;
      if (Math.abs(nextWidth - measuredWidth) < 0.5) {
        return;
      }

      measuredWidth = nextWidth;
      const virtualizer = rowVirtualizerRef.current;
      const scrollTop = scrollElement.scrollTop;
      const anchor = virtualizer
        .getVirtualItems()
        .find((row) => row.start + row.size > scrollTop);
      const offsetWithinAnchor = anchor ? scrollTop - anchor.start : 0;
      const previewIdentity = scrollIdentityRef.current;
      cancelAnchorRestore();
      virtualizer.measure();

      if (anchor) {
        anchorFrame = requestAnimationFrame(() => {
          anchorFrame = null;
          if (scrollIdentityRef.current !== previewIdentity) {
            return;
          }
          const currentVirtualizer = rowVirtualizerRef.current;
          currentVirtualizer.scrollToIndex(anchor.index, { align: "start" });
          offsetFrame = requestAnimationFrame(() => {
            offsetFrame = null;
            if (scrollIdentityRef.current !== previewIdentity) {
              return;
            }
            const measuredAnchor = currentVirtualizer
              .getVirtualItems()
              .find((row) => row.index === anchor.index);
            if (measuredAnchor) {
              currentVirtualizer.scrollToOffset(
                measuredAnchor.start + offsetWithinAnchor,
              );
            }
          });
        });
      }
    });
    resizeObserver.observe(scrollElement);
    return () => {
      resizeObserver.disconnect();
      cancelAnchorRestore();
    };
  }, []);

  const virtualRows: RenderedVirtualRow[] = rowVirtualizer.getVirtualItems();
  const renderedRows =
    virtualRows.length > 0
      ? virtualRows
      : buildFallbackVirtualRows(
          fallbackLines.length,
          CODE_ROW_ESTIMATE_PX,
          CODE_VERTICAL_PADDING_PX,
          path,
        );
  const totalSize = rowVirtualizer.getTotalSize();

  useLayoutEffect(() => {
    const scrollElement = scrollRef.current;
    if (!scrollElement) {
      return;
    }

    const maximumScrollTop = Math.max(totalSize - scrollElement.clientHeight, 0);
    if (scrollElement.scrollTop > maximumScrollTop) {
      scrollElement.scrollTop = maximumScrollTop;
    }
  }, [totalSize]);

  const hasMeta = !complete || truncated || Boolean(highlightError);

  return (
    <div
      className="code-preview"
      data-language={language}
      data-line-count={fallbackLines.length}
      data-line-number-digits={lineNumberDigits}
      data-complete={complete ? "true" : "false"}
      data-indexed-lines={lines ? "true" : "false"}
      data-shiki-theme={theme}
      style={previewStyle}
    >
      {hasMeta ? (
        <div className="code-preview-meta" aria-label="Preview metadata">
          {!complete ? <span>Loading complete file…</span> : null}
          {truncated ? <span>Truncated</span> : null}
          {highlightError ? <span>Plain text fallback</span> : null}
        </div>
      ) : null}
      <pre
        className="code-preview-code"
        aria-label="Highlighted file preview"
        ref={scrollRef}
      >
        <code
          className="code-preview-virtualizer"
          style={{ height: `${totalSize}px` }}
        >
          {renderedRows.map((virtualRow) => {
            const lineIndex = virtualRow.index;
            return (
              <CodePreviewLine
                key={virtualRow.key}
                line={
                  tokenLines?.[lineIndex] ?? [
                    { content: fallbackLines[lineIndex] ?? "" },
                  ]
                }
                lineIndex={lineIndex}
                measureElement={rowVirtualizer.measureElement}
                virtualStart={virtualRow.start}
              />
            );
          })}
        </code>
      </pre>
    </div>
  );
});

const CodePreviewLine = memo(function CodePreviewLine({
  line,
  lineIndex,
  measureElement,
  virtualStart,
}: {
  line: Token[];
  lineIndex: number;
  measureElement: (node: HTMLSpanElement | null) => void;
  virtualStart: number;
}) {
  return (
    <span
      className="code-preview-line"
      data-index={lineIndex}
      ref={measureElement}
      style={{ transform: `translateY(${virtualStart}px)` }}
    >
      <span className="code-preview-gutter" aria-hidden="true">
        {lineNumber(lineIndex)}
      </span>
      <span className="code-preview-source">
        {line.map((token, tokenIndex) => (
          <span
            className={token.semantic ? `code-preview-token ${token.semantic}` : undefined}
            key={`${lineIndex}-${tokenIndex}`}
            style={
              token.color && !token.semantic
                ? { color: token.color }
                : undefined
            }
          >
            {token.content}
          </span>
        ))}
      </span>
    </span>
  );
});

function splitPreviewLines(content: string) {
  return content.length > 0 ? content.split(/\r\n|\r|\n/) : [""];
}

function buildFallbackVirtualRows(
  count: number,
  rowEstimate: number,
  paddingStart: number,
  keyPrefix: string,
): RenderedVirtualRow[] {
  const visibleCount = Math.min(count, VIRTUAL_OVERSCAN * 2 + 1);
  return Array.from({ length: visibleCount }, (_, index) => ({
    key: `${keyPrefix}-fallback-${index}`,
    index,
    start: paddingStart + index * rowEstimate,
  }));
}

function lineNumber(index: number) {
  return index + 1;
}
