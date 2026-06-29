import type { HighlighterCore } from "shiki/types";
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

let highlighterPromise: Promise<CodePreviewHighlighter> | null = null;

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
