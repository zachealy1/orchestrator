import { describe, expect, it } from "vitest";
import {
  fallbackChatTitle,
  sanitizeGeneratedChatTitle,
} from "./chatTitles";

describe("conversation titles", () => {
  it("creates a bounded fallback from a long prompt", () => {
    expect(
      fallbackChatTitle(
        "Implement AI-generated conversation titles for the workspace history drawer without blocking prompt submission",
      ),
    ).toBe("Implement AI-generated conversation titles for the workspace");
  });

  it("removes code blocks and URLs from fallback titles", () => {
    expect(
      fallbackChatTitle(
        "Fix the OAuth callback at https://example.com/callback\n```ts\nconst secret = true\n```",
      ),
    ).toBe("Fix the OAuth callback");
  });

  it("sanitizes model output while preserving technical names", () => {
    expect(
      sanitizeGeneratedChatTitle(
        'Title: **Stabilize OAuth PKCE Callback Flow.**',
      ),
    ).toBe("Stabilize OAuth PKCE Callback Flow");
  });

  it("limits generated titles to seven words", () => {
    expect(
      sanitizeGeneratedChatTitle(
        "Improve Large Historical Chat Loading And Scrolling Performance Today",
      ),
    ).toBe("Improve Large Historical Chat Loading And Scrolling");
  });

  it("rejects generic or unusable generated titles", () => {
    expect(sanitizeGeneratedChatTitle("New Chat")).toBeNull();
    expect(sanitizeGeneratedChatTitle("Question")).toBeNull();
    expect(sanitizeGeneratedChatTitle("🚀")).toBeNull();
  });
});
