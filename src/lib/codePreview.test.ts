import { describe, expect, it } from "vitest";
import {
  applyPreviewSemanticTokenColors,
  clearPreviewHighlightCache,
  codePreviewTheme,
  detectPreviewLanguage,
  highlightPreviewContent,
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
    clearPreviewHighlightCache();

    const input = {
      path: "/repo/src/App.ts",
      content: "export const value = 1;",
      language: "typescript",
      resolvedTheme: "dark" as const,
    };

    const first = await highlightPreviewContent(input);
    const second = await highlightPreviewContent(input);

    expect(second).toBe(first);
  });
});
