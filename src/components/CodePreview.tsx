import { useVirtualizer } from "@tanstack/react-virtual";
import { memo, startTransition, useEffect, useMemo, useRef, useState } from "react";
import type { ResolvedTheme } from "../types";
import {
  codePreviewTheme,
  detectPreviewLanguage,
  highlightPreviewContent,
  type PreviewSemanticToken,
} from "../lib/codePreview";

type Token = {
  content: string;
  color?: string;
  semantic?: PreviewSemanticToken["semantic"];
};

type Props = {
  path: string;
  content: string;
  resolvedTheme: ResolvedTheme;
  truncated: boolean;
  languageOverride?: string;
};

const VIRTUAL_OVERSCAN = 30;
const CODE_ROW_ESTIMATE_PX = 24;
const CODE_VERTICAL_PADDING_PX = 12;

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
  languageOverride,
}: Props) {
  const scrollRef = useRef<HTMLPreElement | null>(null);
  const language = useMemo(
    () => languageOverride ?? detectPreviewLanguage(path),
    [languageOverride, path],
  );
  const [tokenLines, setTokenLines] = useState<Token[][] | null>(null);
  const [highlightError, setHighlightError] = useState<string | null>(null);
  const fallbackLines = useMemo(() => splitPreviewLines(content), [content]);
  const fallbackTokenLines = useMemo(
    () =>
      fallbackLines.map((line) => [
        {
          content: line,
        },
      ]),
    [fallbackLines],
  );
  const theme = codePreviewTheme(resolvedTheme);

  useEffect(() => {
    let disposed = false;
    setTokenLines(null);
    setHighlightError(null);

    if (language === "plaintext") {
      return () => {
        disposed = true;
      };
    }

    void highlightPreviewContent({
      path,
      content,
      language,
      resolvedTheme,
    })
      .then((lines) => {
        if (disposed) {
          return;
        }

        startTransition(() => {
          setTokenLines(
            lines.map((line) =>
              line.length > 0
                ? line.map((token) => ({
                    content: token.content,
                    color: token.color,
                    semantic: token.semantic,
                  }))
                : [{ content: "" }],
            ),
          );
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
    };
  }, [content, language, path, resolvedTheme, theme]);

  const lines: Token[][] = tokenLines ?? fallbackTokenLines;
  const rowVirtualizer = useVirtualizer({
    count: lines.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => CODE_ROW_ESTIMATE_PX,
    overscan: VIRTUAL_OVERSCAN,
    paddingStart: CODE_VERTICAL_PADDING_PX,
    paddingEnd: CODE_VERTICAL_PADDING_PX,
    initialRect: { width: 800, height: 720 },
    getItemKey: (index) => `${path}-${index}`,
  });
  const virtualRows: RenderedVirtualRow[] = rowVirtualizer.getVirtualItems();
  const renderedRows =
    virtualRows.length > 0
      ? virtualRows
      : buildFallbackVirtualRows(
          lines.length,
          CODE_ROW_ESTIMATE_PX,
          CODE_VERTICAL_PADDING_PX,
          path,
        );
  const totalSize = Math.max(
    rowVirtualizer.getTotalSize(),
    lines.length * CODE_ROW_ESTIMATE_PX + CODE_VERTICAL_PADDING_PX * 2,
  );

  return (
    <div
      className="code-preview"
      data-language={language}
      data-shiki-theme={theme}
    >
      <div className="code-preview-meta" aria-label="Preview metadata">
        <span>{labelLanguage(language)}</span>
        {truncated ? <span>Truncated</span> : null}
        {highlightError ? <span>Plain text fallback</span> : null}
      </div>
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
                line={lines[lineIndex] ?? [{ content: "" }]}
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

function labelLanguage(language: string) {
  return language === "plaintext" ? "Plain text" : language.toUpperCase();
}
