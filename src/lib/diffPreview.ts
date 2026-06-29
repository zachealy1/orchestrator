import { diffLines } from "diff";
import type { ResolvedTheme } from "../types";
import {
  detectPreviewLanguage,
  highlightPreviewContent,
  type PreviewSemanticToken,
} from "./codePreview";

export type DiffRowKind = "unchanged" | "changed" | "added" | "removed";

export type DiffRow = {
  id: string;
  kind: DiffRowKind;
  baseLineNumber: number | null;
  headLineNumber: number | null;
  baseText: string;
  headText: string;
};

export type DiffToken = {
  content: string;
  color?: string;
  semantic?: PreviewSemanticToken["semantic"];
};

export type HighlightedDiffSide = {
  language: string;
  lines: DiffToken[][];
};

export type DiffOverviewMarker = {
  id: string;
  kind: Exclude<DiffRowKind, "unchanged">;
  rowIndex: number;
  topPercent: number;
  heightPercent: number;
};

export type DiffOverviewViewport = {
  topPercent: number;
  heightPercent: number;
  scrollable: boolean;
};

export function buildDiffRows(baseContent: string, headContent: string) {
  const changes = diffLines(baseContent ?? "", headContent ?? "");
  const rows: DiffRow[] = [];
  let baseLineNumber = 1;
  let headLineNumber = 1;

  for (let index = 0; index < changes.length; index += 1) {
    const change = changes[index];
    if (!change.added && !change.removed) {
      for (const line of splitDiffLines(change.value)) {
        rows.push({
          id: `u-${baseLineNumber}-${headLineNumber}`,
          kind: "unchanged",
          baseLineNumber,
          headLineNumber,
          baseText: line,
          headText: line,
        });
        baseLineNumber += 1;
        headLineNumber += 1;
      }
      continue;
    }

    if (change.removed) {
      const next = changes[index + 1];
      if (next?.added) {
        const paired = pairChangedLineBlocks(
          splitDiffLines(change.value),
          splitDiffLines(next.value),
        );
        for (const pair of paired) {
          const hasBase = pair.baseText !== null;
          const hasHead = pair.headText !== null;
          rows.push({
            id: `c-${baseLineNumber}-${headLineNumber}-${rows.length}`,
            kind: hasBase && hasHead ? "changed" : hasBase ? "removed" : "added",
            baseLineNumber: hasBase ? baseLineNumber : null,
            headLineNumber: hasHead ? headLineNumber : null,
            baseText: pair.baseText ?? "",
            headText: pair.headText ?? "",
          });
          if (hasBase) {
            baseLineNumber += 1;
          }
          if (hasHead) {
            headLineNumber += 1;
          }
        }
        index += 1;
        continue;
      }

      for (const line of splitDiffLines(change.value)) {
        rows.push({
          id: `r-${baseLineNumber}-${rows.length}`,
          kind: "removed",
          baseLineNumber,
          headLineNumber: null,
          baseText: line,
          headText: "",
        });
        baseLineNumber += 1;
      }
      continue;
    }

    if (change.added) {
      for (const line of splitDiffLines(change.value)) {
        rows.push({
          id: `a-${headLineNumber}-${rows.length}`,
          kind: "added",
          baseLineNumber: null,
          headLineNumber,
          baseText: "",
          headText: line,
        });
        headLineNumber += 1;
      }
    }
  }

  return rows.length > 0
    ? rows
    : [
        {
          id: "empty",
          kind: "unchanged" as const,
          baseLineNumber: null,
          headLineNumber: null,
          baseText: "",
          headText: "",
        },
      ];
}

export function buildDiffOverviewMarkers(rows: DiffRow[]): DiffOverviewMarker[] {
  const rowCount = Math.max(rows.length, 1);
  const markerHeight = 100 / rowCount;

  return rows.flatMap((row, index) =>
    row.kind === "unchanged"
      ? []
      : [
          {
            id: `${row.id}-overview`,
            kind: row.kind,
            rowIndex: index,
            topPercent: (index / rowCount) * 100,
            heightPercent: markerHeight,
          },
        ],
  );
}

export function calculateOverviewViewport(
  scrollTop: number,
  scrollHeight: number,
  clientHeight: number,
): DiffOverviewViewport {
  if (clientHeight <= 0 || scrollHeight <= clientHeight) {
    return {
      topPercent: 0,
      heightPercent: 100,
      scrollable: false,
    };
  }

  const heightPercent = clamp((clientHeight / scrollHeight) * 100, 4, 100);
  const maxScrollTop = Math.max(scrollHeight - clientHeight, 1);
  const maxTopPercent = 100 - heightPercent;

  return {
    topPercent: clamp((scrollTop / maxScrollTop) * maxTopPercent, 0, maxTopPercent),
    heightPercent,
    scrollable: true,
  };
}

export function scrollToOverviewPosition(
  container: Pick<HTMLElement, "clientHeight" | "scrollHeight" | "scrollTop">,
  ratio: number,
  scrollHeight = container.scrollHeight,
) {
  const maxScrollTop = Math.max(scrollHeight - container.clientHeight, 0);
  const nextScrollTop = clamp(ratio, 0, 1) * maxScrollTop;
  container.scrollTop = nextScrollTop;
  return nextScrollTop;
}

export function pairChangedLineBlocks(baseLines: string[], headLines: string[]) {
  const count = Math.max(baseLines.length, headLines.length);
  return Array.from({ length: count }, (_, index) => ({
    baseText: baseLines[index] ?? null,
    headText: headLines[index] ?? null,
  }));
}

export async function highlightDiffSide(
  content: string,
  path: string,
  resolvedTheme: ResolvedTheme,
): Promise<HighlightedDiffSide> {
  const language = detectPreviewLanguage(path);
  if (language === "plaintext") {
    return { language, lines: splitDiffLines(content).map(textToTokenLine) };
  }

  const lines = await highlightPreviewContent({
    path,
    content,
    language,
    resolvedTheme,
  });

  return {
    language,
    lines: lines.map((line) =>
      line.length > 0
        ? line.map((token) => ({
            content: token.content,
            color: token.color,
            semantic: token.semantic,
          }))
        : [{ content: "" }],
    ),
  };
}

export function splitDiffLines(content: string) {
  if (!content) {
    return [];
  }

  const lines = content.split(/\r\n|\r|\n/);
  if (/\r\n|\r|\n/.test(content.slice(-1))) {
    lines.pop();
  }
  return lines;
}

function textToTokenLine(content: string) {
  return [{ content }];
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
