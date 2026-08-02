import type { HighlighterCore, ThemedToken } from "shiki/types";
import type { ResolvedTheme } from "../shared/types";
import { BoundedLruCache } from "../shared/cache/BoundedLruCache";

export const CODE_PREVIEW_THEMES = {
  light: "github-light",
  dark: "github-dark",
} as const;

const EXTENSION_LANGUAGE_MAP: Record<string, string> = {
  bash: "bash",
  c: "c",
  cs: "csharp",
  css: "css",
  cts: "typescript",
  diff: "diff",
  go: "go",
  h: "c",
  html: "html",
  java: "java",
  js: "javascript",
  json: "json",
  jsx: "jsx",
  kt: "kotlin",
  kts: "kotlin",
  md: "markdown",
  mjs: "javascript",
  mts: "typescript",
  py: "python",
  rs: "rust",
  sh: "bash",
  sql: "sql",
  swift: "swift",
  toml: "toml",
  ts: "typescript",
  tsx: "tsx",
  txt: "plaintext",
  xml: "xml",
  yaml: "yaml",
  yml: "yaml",
  zsh: "bash",
};

const FILENAME_LANGUAGE_MAP: Record<string, string> = {
  dockerfile: "dockerfile",
  makefile: "makefile",
};

type CodePreviewHighlighter = HighlighterCore;

export type PreviewSemanticToken = ThemedToken & {
  semantic?: "json-key" | "json-value";
};

const PREVIEW_HIGHLIGHT_CACHE_LIMIT = 128;

export class CodePreviewCache {
  #highlighterPromise: Promise<CodePreviewHighlighter> | null = null;
  readonly #highlights = new BoundedLruCache<
    string,
    Promise<PreviewSemanticToken[][]>
  >(PREVIEW_HIGHLIGHT_CACHE_LIMIT);

  loadHighlighter() {
    this.#highlighterPromise ??= createCodeHighlighter();
    return this.#highlighterPromise;
  }

  get(key: string) {
    return this.#highlights.get(key);
  }

  set(key: string, value: Promise<PreviewSemanticToken[][]>) {
    this.#highlights.set(key, value);
  }

  delete(key: string) {
    this.#highlights.delete(key);
  }

  clear() {
    this.#highlights.clear();
    this.#highlighterPromise = null;
  }
}

export function detectPreviewLanguage(path: string) {
  const basename = path.split(/[\\/]/).pop()?.toLowerCase() ?? "";
  if (!basename) {
    return "plaintext";
  }

  const filenameLanguage = FILENAME_LANGUAGE_MAP[basename];
  if (filenameLanguage) {
    return filenameLanguage;
  }

  const extension = basename.includes(".") ? basename.split(".").pop() : null;
  return extension ? EXTENSION_LANGUAGE_MAP[extension] ?? "plaintext" : "plaintext";
}

export function codePreviewTheme(theme: ResolvedTheme) {
  return CODE_PREVIEW_THEMES[theme];
}

export function loadCodeHighlighter(cache: CodePreviewCache) {
  return cache.loadHighlighter();
}

export function previewHighlightCacheKey(input: {
  path: string;
  content: string;
  language: string;
  theme: string;
}) {
  return `${input.path}\u0000${input.language}\u0000${input.theme}\u0000${input.content}`;
}

export async function highlightPreviewContent(input: {
  path: string;
  content: string;
  language: string;
  resolvedTheme: ResolvedTheme;
}, cache: CodePreviewCache) {
  const theme = codePreviewTheme(input.resolvedTheme);
  const cacheKey = previewHighlightCacheKey({
    path: input.path,
    content: input.content,
    language: input.language,
    theme,
  });
  const cached = cache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const highlighted = loadCodeHighlighter(cache)
    .then((highlighter) =>
      highlighter.codeToTokens(input.content, {
        lang: input.language as never,
        theme,
      }),
    )
    .then((result) => applyPreviewSemanticTokenColors(input.language, result.tokens))
    .catch((error) => {
      cache.delete(cacheKey);
      throw error;
    });

  cache.set(cacheKey, highlighted);
  return highlighted;
}

export function applyPreviewSemanticTokenColors(
  language: string,
  tokenLines: ThemedToken[][],
): PreviewSemanticToken[][] {
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

async function createCodeHighlighter(): Promise<CodePreviewHighlighter> {
  const [
    { createHighlighterCore },
    { createJavaScriptRegexEngine },
    githubLight,
    githubDark,
    bash,
    c,
    csharp,
    css,
    diff,
    dockerfile,
    go,
    html,
    java,
    javascript,
    json,
    jsx,
    kotlin,
    makefile,
    markdown,
    python,
    rust,
    sql,
    swift,
    toml,
    tsx,
    typescript,
    xml,
    yaml,
  ] = await Promise.all([
    import("shiki/core"),
    import("shiki/engine/javascript"),
    import("shiki/themes/github-light.mjs"),
    import("shiki/themes/github-dark.mjs"),
    import("shiki/langs/bash.mjs"),
    import("shiki/langs/c.mjs"),
    import("shiki/langs/csharp.mjs"),
    import("shiki/langs/css.mjs"),
    import("shiki/langs/diff.mjs"),
    import("shiki/langs/dockerfile.mjs"),
    import("shiki/langs/go.mjs"),
    import("shiki/langs/html.mjs"),
    import("shiki/langs/java.mjs"),
    import("shiki/langs/javascript.mjs"),
    import("shiki/langs/json.mjs"),
    import("shiki/langs/jsx.mjs"),
    import("shiki/langs/kotlin.mjs"),
    import("shiki/langs/makefile.mjs"),
    import("shiki/langs/markdown.mjs"),
    import("shiki/langs/python.mjs"),
    import("shiki/langs/rust.mjs"),
    import("shiki/langs/sql.mjs"),
    import("shiki/langs/swift.mjs"),
    import("shiki/langs/toml.mjs"),
    import("shiki/langs/tsx.mjs"),
    import("shiki/langs/typescript.mjs"),
    import("shiki/langs/xml.mjs"),
    import("shiki/langs/yaml.mjs"),
  ]);

  return createHighlighterCore({
    themes: [githubLight.default, githubDark.default],
    langs: [
      bash.default,
      c.default,
      csharp.default,
      css.default,
      diff.default,
      dockerfile.default,
      go.default,
      html.default,
      java.default,
      javascript.default,
      json.default,
      jsx.default,
      kotlin.default,
      makefile.default,
      markdown.default,
      python.default,
      rust.default,
      sql.default,
      swift.default,
      toml.default,
      tsx.default,
      typescript.default,
      xml.default,
      yaml.default,
    ],
    engine: createJavaScriptRegexEngine(),
  });
}
