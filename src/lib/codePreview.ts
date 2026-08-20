import type { HighlighterCore, ThemedToken } from "shiki/types";
import type { ResolvedTheme } from "../shared/types";
import { recordPreviewDiagnostic } from "./previewDiagnostics";

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

export class CodePreviewCache {
  #highlighterPromise: Promise<CodePreviewHighlighter> | null = null;
  readonly #languagePromises = new Map<string, Promise<void>>();
  readonly #highlights: BoundedPreviewHighlightCache<
    Promise<PreviewSemanticToken[][]>
  >;

  constructor(
    maxEntries = PREVIEW_HIGHLIGHT_CACHE_MAX_ENTRIES,
    maxSourceCharacters = PREVIEW_HIGHLIGHT_CACHE_MAX_SOURCE_CHARACTERS,
  ) {
    this.#highlights = new BoundedPreviewHighlightCache(
      maxEntries,
      maxSourceCharacters,
    );
  }

  loadHighlighter(language?: string) {
    this.#highlighterPromise ??= createCodeHighlighter();
    if (!language || language === "plaintext") {
      return this.#highlighterPromise;
    }

    let languagePromise = this.#languagePromises.get(language);
    if (!languagePromise) {
      const diagnosticIdentity = `grammar:${language}`;
      recordPreviewDiagnostic({
        identity: diagnosticIdentity,
        stage: "grammar-loading",
      });
      languagePromise = this.#highlighterPromise
        .then(async (highlighter) => {
          const languageDefinition = await loadPreviewLanguage(language);
          if (!languageDefinition) {
            throw new Error(`Unsupported preview language: ${language}`);
          }
          await highlighter.loadLanguage(languageDefinition as never);
          recordPreviewDiagnostic({
            identity: diagnosticIdentity,
            stage: "grammar-ready",
          });
        })
        .catch((error) => {
          this.#languagePromises.delete(language);
          throw error;
        });
      this.#languagePromises.set(language, languagePromise);
    }

    return languagePromise.then(
      () => this.#highlighterPromise as Promise<CodePreviewHighlighter>,
    );
  }

  get(key: string) {
    return this.#highlights.get(key);
  }

  set(
    key: string,
    value: Promise<PreviewSemanticToken[][]>,
    sourceCharacters: number,
  ) {
    this.#highlights.set(key, value, sourceCharacters);
  }

  deleteIfValue(key: string, value: Promise<PreviewSemanticToken[][]>) {
    return this.#highlights.deleteIfValue(key, value);
  }

  clear() {
    this.#highlights.clear();
    this.#languagePromises.clear();
    this.#highlighterPromise = null;
  }

  getStats() {
    return this.#highlights.getStats();
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

export function loadCodeHighlighter(cache: CodePreviewCache, language?: string) {
  return cache.loadHighlighter(language);
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

export async function highlightPreviewContent(
  input: CodePreviewHighlightInput,
  cache: CodePreviewCache,
) {
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

  const highlighted = loadCodeHighlighter(cache, input.language)
    .then((highlighter) =>
      highlighter.codeToTokens(input.content, {
        lang: input.language as never,
        theme,
      }),
    )
    .then((result) => applyPreviewSemanticTokenColors(input.language, result.tokens))
    .catch((error) => {
      cache.deleteIfValue(cacheKey, highlighted);
      throw error;
    });

  cache.set(cacheKey, highlighted, input.content.length);
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
  ] = await Promise.all([
    import("shiki/core"),
    import("shiki/engine/javascript"),
    import("shiki/themes/github-light.mjs"),
    import("shiki/themes/github-dark.mjs"),
  ]);

  return createHighlighterCore({
    themes: [githubLight.default, githubDark.default],
    langs: [],
    engine: createJavaScriptRegexEngine(),
  });
}

async function loadPreviewLanguage(language: string) {
  switch (language) {
    case "bash": return (await import("shiki/langs/bash.mjs")).default;
    case "c": return (await import("shiki/langs/c.mjs")).default;
    case "csharp": return (await import("shiki/langs/csharp.mjs")).default;
    case "css": return (await import("shiki/langs/css.mjs")).default;
    case "diff": return (await import("shiki/langs/diff.mjs")).default;
    case "dockerfile": return (await import("shiki/langs/dockerfile.mjs")).default;
    case "go": return (await import("shiki/langs/go.mjs")).default;
    case "html": return (await import("shiki/langs/html.mjs")).default;
    case "java": return (await import("shiki/langs/java.mjs")).default;
    case "javascript": return (await import("shiki/langs/javascript.mjs")).default;
    case "json": return (await import("shiki/langs/json.mjs")).default;
    case "jsx": return (await import("shiki/langs/jsx.mjs")).default;
    case "kotlin": return (await import("shiki/langs/kotlin.mjs")).default;
    case "makefile": return (await import("shiki/langs/makefile.mjs")).default;
    case "markdown": return (await import("shiki/langs/markdown.mjs")).default;
    case "python": return (await import("shiki/langs/python.mjs")).default;
    case "rust": return (await import("shiki/langs/rust.mjs")).default;
    case "sql": return (await import("shiki/langs/sql.mjs")).default;
    case "swift": return (await import("shiki/langs/swift.mjs")).default;
    case "toml": return (await import("shiki/langs/toml.mjs")).default;
    case "tsx": return (await import("shiki/langs/tsx.mjs")).default;
    case "typescript": return (await import("shiki/langs/typescript.mjs")).default;
    case "xml": return (await import("shiki/langs/xml.mjs")).default;
    case "yaml": return (await import("shiki/langs/yaml.mjs")).default;
    default: return null;
  }
}
