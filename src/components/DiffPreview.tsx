import { useEffect, useMemo, useState } from "react";
import type { ResolvedTheme, WorkspaceGitDiffSection } from "../types";
import {
  buildDiffRows,
  highlightDiffSide,
  splitDiffLines,
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

type Props = {
  path: string;
  sections: WorkspaceGitDiffSection[];
  resolvedTheme: ResolvedTheme;
  layout: DiffLayout;
};

export function DiffPreview({ path, sections, resolvedTheme, layout }: Props) {
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

  return (
    <div className={`diff-preview ${layout}`} aria-label="Full file diff preview">
      {renderSections.map(({ id, section, rows }) => {
        const highlight = highlights[id] ?? {
          base: fallbackHighlight(section.baseContent),
          head: fallbackHighlight(section.headContent),
          fallback: false,
        };

        return (
          <section className="diff-preview-section" key={id}>
            <header className="diff-preview-section-header">
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
      <div className="diff-preview-column-title old" role="columnheader">
        Original
      </div>
      <div className="diff-preview-column-title new" role="columnheader">
        Modified
      </div>
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
