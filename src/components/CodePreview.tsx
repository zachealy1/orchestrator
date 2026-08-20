import { useVirtualizer } from "@tanstack/react-virtual";
import {
  memo,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  codePreviewTheme,
  detectPreviewLanguage,
} from "../lib/codePreview";
import { usePreviewOverscan } from "../lib/fixedRowVirtualization";
import {
  PREVIEW_HIGHLIGHT_MAX_CHARACTERS,
  preparePlaintextSourceDocument,
  sourceDocumentIdentity,
  type PreparedPreviewToken,
  type PreparedSourceDocument,
} from "../lib/previewDocuments";
import {
  recordPreviewDiagnostic,
  recordPreviewGeometry,
} from "../lib/previewDiagnostics";
import { useAppServices } from "../runtime/AppServices";
import type { ResolvedTheme } from "../shared/types";

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

const CODE_ROW_HEIGHT_PX = 20;
const CODE_VERTICAL_PADDING_PX = 12;
const CODE_GUTTER_HORIZONTAL_PADDING_PX = 24;
const CODE_GUTTER_BORDER_PX = 1;

type CodePreviewStyle = CSSProperties & {
  "--code-preview-gutter-width": string;
  "--code-preview-row-height": string;
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
  const preparationInput = useMemo(
    () => ({ path, content, language, truncated, version }),
    [content, language, path, truncated, version],
  );
  const preparationIdentity = useMemo(
    () => sourceDocumentIdentity(preparationInput),
    [preparationInput],
  );
  const immediateDocument = useMemo(() => {
    if (!complete) {
      return null;
    }
    if (
      lines ||
      language === "plaintext" ||
      content.length > PREVIEW_HIGHLIGHT_MAX_CHARACTERS
    ) {
      return preparePlaintextSourceDocument(preparationInput, lines);
    }
    return null;
  }, [complete, content.length, language, lines, preparationInput]);
  const [prepared, setPrepared] = useState<PreparedSourceDocument | null>(
    immediateDocument,
  );
  const [preparationError, setPreparationError] = useState<string | null>(null);

  useEffect(() => {
    const abortController = new AbortController();
    let active = true;
    setPreparationError(null);
    if (!complete || immediateDocument) {
      setPrepared(immediateDocument);
      return () => abortController.abort();
    }

    setPrepared((current) =>
      current?.identity === preparationIdentity ? current : null,
    );
    void codePreviewHighlighting
      .prepareSource(preparationInput, abortController.signal)
      .then((document) => {
        if (active) setPrepared(document);
      })
      .catch((error) => {
        if (!active) return;
        if (error instanceof Error && error.name === "AbortError") {
          return;
        }
        setPreparationError(error instanceof Error ? error.message : String(error));
        setPrepared(preparePlaintextSourceDocument(preparationInput));
      });
    return () => {
      active = false;
      abortController.abort();
    };
  }, [
    codePreviewHighlighting,
    complete,
    immediateDocument,
    preparationIdentity,
    preparationInput,
  ]);

  const document =
    prepared?.identity === preparationIdentity ? prepared : immediateDocument;
  const rowCount = document?.lines.length ?? 0;
  const overscan = usePreviewOverscan(
    scrollRef,
    CODE_ROW_HEIGHT_PX,
    document?.identity,
  );
  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => CODE_ROW_HEIGHT_PX,
    overscan,
    paddingStart: CODE_VERTICAL_PADDING_PX,
    paddingEnd: CODE_VERTICAL_PADDING_PX,
    initialRect: { width: 800, height: 720 },
    getItemKey: (index) => `${preparationIdentity}-${index}`,
  });
  const virtualRows: RenderedVirtualRow[] = rowVirtualizer.getVirtualItems();
  const renderedRows =
    virtualRows.length > 0
      ? virtualRows
      : buildFallbackVirtualRows(
          rowCount,
          overscan,
          CODE_ROW_HEIGHT_PX,
          CODE_VERTICAL_PADDING_PX,
          path,
        );
  const totalSize = rowVirtualizer.getTotalSize();
  const lineNumberDigits = String(Math.max(rowCount, 1)).length;
  const contentWidth = useMemo(
    () =>
      Math.max(
        1,
        document?.lines.reduce(
          (maximum, line) =>
            Math.max(
              maximum,
              line.reduce((length, token) => length + token.content.length, 0),
            ),
          0,
        ) ?? 0,
      ) * 8 +
      lineNumberDigits * 8 +
      CODE_GUTTER_HORIZONTAL_PADDING_PX +
      40,
    [document, lineNumberDigits],
  );
  const previewStyle = useMemo<CodePreviewStyle>(
    () => ({
      "--code-preview-gutter-width": `calc(${lineNumberDigits}ch + ${
        CODE_GUTTER_HORIZONTAL_PADDING_PX + CODE_GUTTER_BORDER_PX
      }px)`,
      "--code-preview-row-height": `${CODE_ROW_HEIGHT_PX}px`,
    }),
    [lineNumberDigits],
  );

  useLayoutEffect(() => {
    const scrollElement = scrollRef.current;
    if (scrollElement) {
      scrollElement.scrollTop = 0;
      scrollElement.scrollLeft = 0;
    }
  }, [preparationIdentity]);

  useEffect(() => {
    if (!document) return;
    const frame = window.requestAnimationFrame(() => {
      recordPreviewDiagnostic({
        identity: document.identity,
        stage: "stable-paint",
        rowCount: document.lines.length,
      });
      const scrollElement = scrollRef.current;
      if (scrollElement) {
        recordPreviewGeometry(
          document.identity,
          scrollElement,
          ".code-preview-line",
        );
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [document]);

  const theme = codePreviewTheme(resolvedTheme);
  const hasMeta = truncated || Boolean(preparationError);

  return (
    <div
      className="code-preview"
      data-language={language}
      data-line-count={rowCount}
      data-line-number-digits={lineNumberDigits}
      data-complete={complete ? "true" : "false"}
      data-indexed-lines={lines ? "true" : "false"}
      data-render-mode={document?.highlightingMode ?? "preparing"}
      data-shiki-theme={theme}
      style={previewStyle}
    >
      {hasMeta ? (
        <div className="code-preview-meta" aria-label="Preview metadata">
          {truncated ? <span>Truncated preview</span> : null}
          {preparationError ? <span>Plain text fallback</span> : null}
        </div>
      ) : null}
      {!complete || !document ? (
        <div className="code-preview-preparing" role="status">
          Preparing file preview…
        </div>
      ) : (
        <pre
          className="code-preview-code"
          aria-label="Highlighted file preview"
          ref={scrollRef}
        >
          <code
            className="code-preview-virtualizer"
            style={{ height: `${totalSize}px`, width: `${contentWidth}px` }}
          >
            {renderedRows.map((virtualRow) => (
              <CodePreviewLine
                key={virtualRow.key}
                line={document.lines[virtualRow.index] ?? [{ content: "" }]}
                lineIndex={virtualRow.index}
                resolvedTheme={resolvedTheme}
                virtualStart={Math.round(virtualRow.start)}
              />
            ))}
          </code>
        </pre>
      )}
    </div>
  );
});

const CodePreviewLine = memo(function CodePreviewLine({
  line,
  lineIndex,
  resolvedTheme,
  virtualStart,
}: {
  line: PreparedPreviewToken[];
  lineIndex: number;
  resolvedTheme: ResolvedTheme;
  virtualStart: number;
}) {
  return (
    <span
      className="code-preview-line"
      data-index={lineIndex}
      style={{ transform: `translate3d(0, ${virtualStart}px, 0)` }}
    >
      <span className="code-preview-gutter" aria-hidden="true">
        {lineIndex + 1}
      </span>
      <span className="code-preview-source">
        {line.map((token, tokenIndex) => (
          <span
            className={
              token.semantic
                ? `code-preview-token ${token.semantic}`
                : undefined
            }
            key={`${lineIndex}-${tokenIndex}`}
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
      </span>
    </span>
  );
});

function buildFallbackVirtualRows(
  count: number,
  overscan: number,
  rowHeight: number,
  paddingStart: number,
  keyPrefix: string,
): RenderedVirtualRow[] {
  const visibleCount = Math.min(count, overscan + 1);
  return Array.from({ length: visibleCount }, (_, index) => ({
    key: `${keyPrefix}-fallback-${index}`,
    index,
    start: paddingStart + index * rowHeight,
  }));
}
