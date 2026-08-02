import type { HighlighterCore, ThemedToken } from "shiki/types";
import type { ResolvedTheme } from "../types";

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

export type CodePreviewHighlightInput = {
  path: string;
  content: string;
  language: string;
  resolvedTheme: ResolvedTheme;
};

type PreviewHighlightCacheEntry<T> = {
  sourceCharacters: number;
  value: T;
};

export const PREVIEW_HIGHLIGHT_CACHE_MAX_ENTRIES = 8;
export const PREVIEW_HIGHLIGHT_CACHE_MAX_SOURCE_CHARACTERS = 2_000_000;

export class BoundedPreviewHighlightCache<T> {
  private readonly entries = new Map<string, PreviewHighlightCacheEntry<T>>();
  private sourceCharacters = 0;

  constructor(
    private readonly maxEntries = PREVIEW_HIGHLIGHT_CACHE_MAX_ENTRIES,
    private readonly maxSourceCharacters =
      PREVIEW_HIGHLIGHT_CACHE_MAX_SOURCE_CHARACTERS,
  ) {}

  get(key: string) {
    const entry = this.entries.get(key);
    if (!entry) {
      return undefined;
    }

    // Refresh insertion order so eviction behaves as a small LRU cache.
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }

  set(key: string, value: T, sourceCharacters: number) {
    const existing = this.entries.get(key);
    if (existing) {
      this.entries.delete(key);
      this.sourceCharacters -= existing.sourceCharacters;
    }

    if (
      this.maxEntries <= 0 ||
      this.maxSourceCharacters <= 0 ||
      sourceCharacters > this.maxSourceCharacters
    ) {
      return;
    }

    const entry = {
      sourceCharacters: Math.max(0, sourceCharacters),
      value,
    };
    this.entries.set(key, entry);
    this.sourceCharacters += entry.sourceCharacters;
    this.evictOverflow();
  }

  deleteIfValue(key: string, value: T) {
    const entry = this.entries.get(key);
    if (!entry || entry.value !== value) {
      return false;
    }

    this.entries.delete(key);
    this.sourceCharacters -= entry.sourceCharacters;
    return true;
  }

  clear() {
    this.entries.clear();
    this.sourceCharacters = 0;
  }

  getStats() {
    return {
      entries: this.entries.size,
      sourceCharacters: this.sourceCharacters,
    };
  }

  private evictOverflow() {
    while (
      this.entries.size > this.maxEntries ||
      this.sourceCharacters > this.maxSourceCharacters
    ) {
      const oldestKey = this.entries.keys().next().value;
      if (oldestKey === undefined) {
        break;
      }
      const oldest = this.entries.get(oldestKey);
      this.entries.delete(oldestKey);
      this.sourceCharacters -= oldest?.sourceCharacters ?? 0;
    }
  }
}

let highlighterPromise: Promise<CodePreviewHighlighter> | null = null;
const previewHighlightCache = new BoundedPreviewHighlightCache<
  Promise<PreviewSemanticToken[][]>
>();

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

export function loadCodeHighlighter() {
  highlighterPromise ??= createCodeHighlighter();
  return highlighterPromise;
}

export function previewHighlightCacheKey(input: {
  path: string;
  content: string;
  language: string;
  theme: string;
}) {
  return `${input.path}\u0000${input.language}\u0000${input.theme}\u0000${previewContentFingerprint(input.content)}`;
}

export function previewContentFingerprint(content: string) {
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;

  for (let index = 0; index < content.length; index += 1) {
    const codeUnit = content.charCodeAt(index);
    first = Math.imul(first ^ codeUnit, 0x01000193);
    second = Math.imul(second ^ (codeUnit + index), 0x85ebca6b);
    second ^= second >>> 13;
  }

  return `${content.length.toString(36)}-${(first >>> 0).toString(36)}-${(
    second >>> 0
  ).toString(36)}`;
}

export function clearPreviewHighlightCache() {
  previewHighlightCache.clear();
}

export function getPreviewHighlightCacheStats() {
  return previewHighlightCache.getStats();
}

export async function highlightPreviewContent(input: CodePreviewHighlightInput) {
  const theme = codePreviewTheme(input.resolvedTheme);
  const cacheKey = previewHighlightCacheKey({
    path: input.path,
    content: input.content,
    language: input.language,
    theme,
  });
  const cached = previewHighlightCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const highlighted = loadCodeHighlighter()
    .then((highlighter) =>
      highlighter.codeToTokens(input.content, {
        lang: input.language as never,
        theme,
      }),
    )
    .then((result) => applyPreviewSemanticTokenColors(input.language, result.tokens))
    .catch((error) => {
      previewHighlightCache.deleteIfValue(cacheKey, highlighted);
      throw error;
    });

  previewHighlightCache.set(cacheKey, highlighted, input.content.length);
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

  const flatTokens = tokenLines.flat();
  const nextSignificantTokens: Array<string | null> = Array.from(
    { length: flatTokens.length },
    () => null,
  );
  let nextSignificantToken: string | null = null;
  for (let index = flatTokens.length - 1; index >= 0; index -= 1) {
    nextSignificantTokens[index] = nextSignificantToken;
    const content = flatTokens[index].content.trim();
    if (content) {
      nextSignificantToken = content;
    }
  }

  let flatIndex = 0;

  return tokenLines.map((line) =>
    line.map((token) => {
      const content = token.content.trim();
      const nextToken = nextSignificantTokens[flatIndex] ?? null;
      flatIndex += 1;
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
