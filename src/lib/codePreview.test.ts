import { describe, expect, it } from "vitest";
import { codePreviewTheme, detectPreviewLanguage } from "./codePreview";

describe("codePreview", () => {
  it("detects preview languages from common file extensions", () => {
    expect(detectPreviewLanguage("/repo/src/App.tsx")).toBe("tsx");
    expect(detectPreviewLanguage("/repo/src/main.rs")).toBe("rust");
    expect(detectPreviewLanguage("/repo/package.json")).toBe("json");
    expect(detectPreviewLanguage("/repo/README.md")).toBe("markdown");
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
});
