import { describe, expect, it } from "vitest";
import {
  applyPreviewSemanticTokenColors,
  BoundedPreviewHighlightCache,
  CodePreviewCache,
  codePreviewTheme,
  detectPreviewLanguage,
  highlightPreviewContent,
  previewContentFingerprint,
  previewHighlightCacheKey,
} from "./codePreview";

describe("codePreview", () => {
  it("detects preview languages from common file extensions", () => {
    expect(detectPreviewLanguage("/repo/src/App.tsx")).toBe("tsx");
    expect(detectPreviewLanguage("/repo/src/main.rs")).toBe("rust");
    expect(detectPreviewLanguage("/repo/package.json")).toBe("json");
    expect(detectPreviewLanguage("/repo/README.md")).toBe("markdown");
    expect(detectPreviewLanguage("/repo/changes.diff")).toBe("diff");
    expect(detectPreviewLanguage("/repo/Dockerfile")).toBe("dockerfile");
    expect(detectPreviewLanguage("/repo/Makefile")).toBe("makefile");
  });

  it("falls back to plaintext for unknown or intentionally unsupported files", () => {
    expect(detectPreviewLanguage("/repo/src/native.cpp")).toBe("plaintext");
    expect(detectPreviewLanguage("/repo/scripts/release.rb")).toBe("plaintext");
    expect(detectPreviewLanguage("/repo/notes.unknown")).toBe("plaintext");
    expect(detectPreviewLanguage("/repo/LICENSE")).toBe("plaintext");
  });

  it("maps app themes to Shiki themes", () => {
    expect(codePreviewTheme("light")).toBe("github-light");
    expect(codePreviewTheme("dark")).toBe("github-dark");
  });

  it("uses compact content fingerprints instead of source text in cache keys", () => {
    const content = "export const uniquelyNamedPreviewValue = 42;";
    const key = previewHighlightCacheKey({
      path: "/repo/src/App.ts",
      content,
      language: "typescript",
      theme: "github-dark",
    });

    expect(key).not.toContain(content);
    expect(previewContentFingerprint(content)).toBe(
      previewContentFingerprint(content),
    );
    expect(previewContentFingerprint(`${content}\n`)).not.toBe(
      previewContentFingerprint(content),
    );
  });

  it("bounds preview highlight cache entries and source characters with LRU eviction", () => {
    const cache = new BoundedPreviewHighlightCache<number>(2, 6);
    cache.set("first", 1, 3);
    cache.set("second", 2, 3);
    expect(cache.get("first")).toBe(1);

    cache.set("third", 3, 3);

    expect(cache.get("second")).toBeUndefined();
    expect(cache.get("first")).toBe(1);
    expect(cache.get("third")).toBe(3);
    expect(cache.getStats()).toEqual({ entries: 2, sourceCharacters: 6 });

    cache.set("oversized", 4, 7);
    expect(cache.get("oversized")).toBeUndefined();
    expect(cache.getStats()).toEqual({ entries: 2, sourceCharacters: 6 });
  });

  it("applies shared semantic token colors for JSON previews and diffs", () => {
    const lines = applyPreviewSemanticTokenColors("json", [
      [
        { content: "\"name\"", color: "#005cc5", offset: 0 },
        { content: ": ", color: "#24292e", offset: 6 },
        { content: "\"orchestrator\"", color: "#032f62", offset: 8 },
      ],
      [
        { content: "\"enabled\"", color: "#005cc5", offset: 0 },
        { content: ": ", color: "#24292e", offset: 9 },
        { content: "true", color: "#005cc5", offset: 11 },
      ],
    ]);

    expect(lines[0][0].semantic).toBe("json-key");
    expect(lines[0][2].semantic).toBe("json-value");
    expect(lines[1][0].semantic).toBe("json-key");
    expect(lines[1][2].semantic).toBe("json-value");
  });

  it("reuses cached highlighted token lines for identical requests", async () => {
    const cache = new CodePreviewCache();

    const input = {
      path: "/repo/src/App.ts",
      content: "export const value = 1;",
      language: "typescript",
      resolvedTheme: "dark" as const,
    };

    const first = await highlightPreviewContent(input, cache);
    const second = await highlightPreviewContent(input, cache);

    expect(second).toBe(first);
  });
});
