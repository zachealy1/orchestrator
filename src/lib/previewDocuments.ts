import {
  CodePreviewCache,
  detectPreviewLanguage,
  highlightPreviewContent,
  previewContentFingerprint,
  type PreviewSemanticToken,
} from "./codePreview";
import {
  buildDiffRows,
  buildDiffRowsFromUnifiedDiff,
  splitDiffLines,
  type DiffRow,
} from "./diffPreview";
import { recordPreviewDiagnostic } from "./previewDiagnostics";

export const PREVIEW_HIGHLIGHT_MAX_CHARACTERS = 2_000_000;

export type PreparedPreviewToken = {
  content: string;
  lightColor?: string;
  darkColor?: string;
  semantic?: PreviewSemanticToken["semantic"];
};

export type PreviewHighlightingMode = "highlighted" | "plaintext";

export type PreparedSourceDocument = {
  kind: "source";
  identity: string;
  path: string;
  version?: string;
  language: string;
  highlightingMode: PreviewHighlightingMode;
  truncated: boolean;
  sourceCharacters: number;
  lines: PreparedPreviewToken[][];
};

export type PreparedDiffSection = {
  id: string;
  rows: DiffRow[];
  baseLines: PreparedPreviewToken[][];
  headLines: PreparedPreviewToken[][];
  truncated: boolean;
};

export type PreparedDiffDocument = {
  kind: "diff";
  identity: string;
  path: string;
  language: string;
  highlightingMode: PreviewHighlightingMode;
  truncated: boolean;
  sourceCharacters: number;
  sections: PreparedDiffSection[];
};

export type PrepareSourceDocumentInput = {
  path: string;
  content: string;
  language: string;
  truncated: boolean;
  version?: string;
};

export type PrepareDiffSectionInput = {
  id: string;
  baseContent: string;
  headContent: string;
  diffContent: string;
  baseTruncated: boolean;
  headTruncated: boolean;
};

export type PrepareDiffDocumentInput = {
  path: string;
  sections: PrepareDiffSectionInput[];
};

export function sourceDocumentIdentity(input: PrepareSourceDocumentInput) {
  return [
    "source",
    input.path,
    input.version ?? "",
    input.language,
    input.truncated ? "truncated" : "complete",
    previewContentFingerprint(input.content),
  ].join("\u0000");
}

export function diffDocumentIdentity(input: PrepareDiffDocumentInput) {
  return [
    "diff",
    input.path,
    ...input.sections.flatMap((section) => [
      section.id,
      section.baseTruncated ? "base-truncated" : "base-complete",
      section.headTruncated ? "head-truncated" : "head-complete",
      previewContentFingerprint(section.baseContent),
      previewContentFingerprint(section.headContent),
      previewContentFingerprint(section.diffContent),
    ]),
  ].join("\u0000");
}

export function preparePlaintextSourceDocument(
  input: PrepareSourceDocumentInput,
  sourceLines?: readonly string[],
): PreparedSourceDocument {
  const lines = sourceLines ?? splitSourceLines(input.content);
  return {
    kind: "source",
    identity: sourceDocumentIdentity(input),
    path: input.path,
    version: input.version,
    language: input.language,
    highlightingMode: "plaintext",
    truncated: input.truncated,
    sourceCharacters:
      sourceLines?.reduce((total, line) => total + line.length, 0) ??
      input.content.length,
    lines: lines.map(plaintextTokenLine),
  };
}

export async function prepareSourceDocument(
  input: PrepareSourceDocumentInput,
  cache: CodePreviewCache,
): Promise<PreparedSourceDocument> {
  const identity = sourceDocumentIdentity(input);
  if (
    input.language === "plaintext" ||
    input.content.length > PREVIEW_HIGHLIGHT_MAX_CHARACTERS
  ) {
    return preparePlaintextSourceDocument(input);
  }

  recordPreviewDiagnostic({ identity, stage: "tokenization-started" });

  const lines = await prepareDualThemeLines(
    input.path,
    input.content,
    input.language,
    cache,
  );
  recordPreviewDiagnostic({
    identity,
    stage: "tokenization-completed",
    rowCount: lines.length,
  });
  return {
    kind: "source",
    identity,
    path: input.path,
    version: input.version,
    language: input.language,
    highlightingMode: "highlighted",
    truncated: input.truncated,
    sourceCharacters: input.content.length,
    lines,
  };
}

export async function prepareDiffDocument(
  input: PrepareDiffDocumentInput,
  cache: CodePreviewCache,
): Promise<PreparedDiffDocument> {
  const identity = diffDocumentIdentity(input);
  const language = detectPreviewLanguage(input.path);
  const sourceCharacters = input.sections.reduce(
    (total, section) =>
      total + section.baseContent.length + section.headContent.length,
    0,
  );
  const useHighlighting =
    language !== "plaintext" &&
    sourceCharacters <= PREVIEW_HIGHLIGHT_MAX_CHARACTERS &&
    input.sections.every(
      (section) => !section.baseTruncated && !section.headTruncated,
    );
  recordPreviewDiagnostic({ identity, stage: "tokenization-started" });

  const sections = await Promise.all(
    input.sections.map(async (section) => {
      const useExactHunks =
        (section.baseTruncated || section.headTruncated) &&
        section.diffContent.length > 0;
      const [baseLines, headLines] = useHighlighting
        ? await Promise.all([
            prepareDualThemeLines(
              input.path,
              section.baseContent,
              language,
              cache,
            ),
            prepareDualThemeLines(
              input.path,
              section.headContent,
              language,
              cache,
            ),
          ])
        : useExactHunks
          ? [[], []]
          : [
            splitDiffLines(section.baseContent).map(plaintextTokenLine),
            splitDiffLines(section.headContent).map(plaintextTokenLine),
          ];

      return {
        id: section.id,
        rows: useExactHunks
          ? buildDiffRowsFromUnifiedDiff(section.diffContent)
          : buildDiffRows(section.baseContent, section.headContent),
        baseLines,
        headLines,
        truncated: section.baseTruncated || section.headTruncated,
      };
    }),
  );
  recordPreviewDiagnostic({
    identity,
    stage: "tokenization-completed",
    rowCount: sections.reduce(
      (total, section) => total + section.rows.length,
      0,
    ),
  });

  return {
    kind: "diff",
    identity,
    path: input.path,
    language,
    highlightingMode: useHighlighting ? "highlighted" : "plaintext",
    truncated: sections.some((section) => section.truncated),
    sourceCharacters,
    sections,
  };
}

export function preparePlaintextDiffDocument(
  input: PrepareDiffDocumentInput,
): PreparedDiffDocument {
  const sections = input.sections.map((section) => {
    const useExactHunks =
      (section.baseTruncated || section.headTruncated) &&
      section.diffContent.length > 0;
    return {
      id: section.id,
      rows: useExactHunks
        ? buildDiffRowsFromUnifiedDiff(section.diffContent)
        : buildDiffRows(section.baseContent, section.headContent),
      baseLines: useExactHunks
        ? []
        : splitDiffLines(section.baseContent).map(plaintextTokenLine),
      headLines: useExactHunks
        ? []
        : splitDiffLines(section.headContent).map(plaintextTokenLine),
      truncated: section.baseTruncated || section.headTruncated,
    };
  });
  return {
    kind: "diff",
    identity: diffDocumentIdentity(input),
    path: input.path,
    language: detectPreviewLanguage(input.path),
    highlightingMode: "plaintext",
    truncated: sections.some((section) => section.truncated),
    sourceCharacters: input.sections.reduce(
      (total, section) =>
        total + section.baseContent.length + section.headContent.length,
      0,
    ),
    sections,
  };
}

export function splitSourceLines(content: string) {
  return content.length > 0 ? content.split(/\r\n|\r|\n/) : [""];
}

async function prepareDualThemeLines(
  path: string,
  content: string,
  language: string,
  cache: CodePreviewCache,
) {
  const [lightLines, darkLines] = await Promise.all([
    highlightPreviewContent(
      { path, content, language, resolvedTheme: "light" },
      cache,
    ),
    highlightPreviewContent(
      { path, content, language, resolvedTheme: "dark" },
      cache,
    ),
  ]);
  const sourceLines = splitSourceLines(content);
  return sourceLines.map((sourceLine, index) =>
    mergeThemeTokenLine(
      sourceLine,
      lightLines[index] ?? [],
      darkLines[index] ?? [],
    ),
  );
}

export function mergeThemeTokenLine(
  sourceLine: string,
  lightTokens: PreviewSemanticToken[],
  darkTokens: PreviewSemanticToken[],
): PreparedPreviewToken[] {
  if (!sourceLine) {
    return [{ content: "" }];
  }

  const lightRanges = tokenRanges(lightTokens);
  const darkRanges = tokenRanges(darkTokens);
  const boundaries = new Set<number>([0, sourceLine.length]);
  for (const range of [...lightRanges, ...darkRanges]) {
    boundaries.add(Math.min(range.start, sourceLine.length));
    boundaries.add(Math.min(range.end, sourceLine.length));
  }
  const sortedBoundaries = [...boundaries].sort((left, right) => left - right);

  return sortedBoundaries.slice(0, -1).flatMap((start, index) => {
    const end = sortedBoundaries[index + 1];
    if (end <= start) {
      return [];
    }
    const light = lightRanges.find(
      (range) => range.start <= start && range.end > start,
    );
    const dark = darkRanges.find(
      (range) => range.start <= start && range.end > start,
    );
    return [{
      content: sourceLine.slice(start, end),
      lightColor: light?.token.color,
      darkColor: dark?.token.color,
      semantic: light?.token.semantic ?? dark?.token.semantic,
    }];
  });
}

function tokenRanges(tokens: PreviewSemanticToken[]) {
  let offset = 0;
  return tokens.map((token) => {
    const start = offset;
    offset += token.content.length;
    return { start, end: offset, token };
  });
}

function plaintextTokenLine(content: string): PreparedPreviewToken[] {
  return [{ content }];
}
