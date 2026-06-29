import { useEffect, useMemo, useState } from "react";
import type { ThemedToken, TokensResult } from "shiki/types";
import type { ResolvedTheme } from "../types";
import {
  codePreviewTheme,
  detectPreviewLanguage,
  loadCodeHighlighter,
} from "../lib/codePreview";

type Token = {
  content: string;
  color?: string;
  semantic?: "json-key" | "json-value";
};

type Props = {
  path: string;
  content: string;
  resolvedTheme: ResolvedTheme;
  truncated: boolean;
};

export function CodePreview({ path, content, resolvedTheme, truncated }: Props) {
  const language = useMemo(() => detectPreviewLanguage(path), [path]);
  const [tokenLines, setTokenLines] = useState<Token[][] | null>(null);
  const [highlightError, setHighlightError] = useState<string | null>(null);
  const fallbackLines = useMemo(() => splitPreviewLines(content), [content]);
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

    void loadCodeHighlighter()
      .then((highlighter) =>
        highlighter.codeToTokens(content, {
          lang: language as never,
          theme,
        }),
      )
      .then((result: TokensResult) => {
        if (disposed) {
          return;
        }

        setTokenLines(
          applySemanticTokenColors(language, result.tokens).map((line) =>
            line.length > 0
              ? line.map((token) => ({
                  content: token.content,
                  color: token.color,
                  semantic: token.semantic,
                }))
              : [{ content: "" }],
          ),
        );
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
  }, [content, language, theme]);

  const lines: Token[][] =
    tokenLines ??
    fallbackLines.map((line) => [
      {
        content: line,
      },
    ]);

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
      <pre className="code-preview-code" aria-label="Highlighted file preview">
        <code>
          {lines.map((line, lineIndex) => (
            <span className="code-preview-line" key={`${lineIndex}-${lineNumber(lineIndex)}`}>
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
          ))}
        </code>
      </pre>
    </div>
  );
}

function splitPreviewLines(content: string) {
  return content.length > 0 ? content.split(/\r\n|\r|\n/) : [""];
}

function lineNumber(index: number) {
  return index + 1;
}

function labelLanguage(language: string) {
  return language === "plaintext" ? "Plain text" : language.toUpperCase();
}

function applySemanticTokenColors(
  language: string,
  tokenLines: ThemedToken[][],
): Array<Array<ThemedToken & { semantic?: Token["semantic"] }>> {
  if (language !== "json") {
    return tokenLines.map((line) =>
      line.map((token) => ({ ...token, semantic: undefined })),
    );
  }

  const flatTokens = tokenLines.flatMap((line, lineIndex) =>
    line.map((token, tokenIndex) => ({ lineIndex, tokenIndex, token })),
  );

  const nextSignificantToken = (index: number) => {
    for (let nextIndex = index + 1; nextIndex < flatTokens.length; nextIndex += 1) {
      const candidate = flatTokens[nextIndex].token.content.trim();
      if (candidate) {
        return candidate;
      }
    }
    return null;
  };

  return tokenLines.map((line, lineIndex) =>
    line.map((token, tokenIndex) => {
      const flatIndex = flatTokens.findIndex(
        (entry) => entry.lineIndex === lineIndex && entry.tokenIndex === tokenIndex,
      );
      const content = token.content.trim();
      const nextToken = flatIndex >= 0 ? nextSignificantToken(flatIndex) : null;
      const isKey = isJsonStringToken(content) && nextToken?.startsWith(":");
      const isValue = !isKey && isJsonValueToken(content);

      return {
        ...token,
        semantic: isKey ? "json-key" : isValue ? "json-value" : undefined,
      };
    }),
  );
}

function isJsonStringToken(content: string) {
  return /^"(?:\\.|[^"\\])*"$/.test(content);
}

function isJsonValueToken(content: string) {
  return (
    isJsonStringToken(content) ||
    /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(content) ||
    /^(?:true|false|null)$/.test(content)
  );
}
