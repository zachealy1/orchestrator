import { describe, expect, it } from "vitest";
import {
  findSubmittedPromptWebLinks,
  normalizeExternalTranscriptUrl,
} from "./transcriptLinks";

describe("transcript links", () => {
  it("finds HTTP links without including trailing punctuation", () => {
    expect(
      findSubmittedPromptWebLinks(
        "Open https://example.com/a_(b)?mode=test#result, then https://openai.com.",
      ),
    ).toEqual([
      {
        start: 5,
        end: 47,
        href: "https://example.com/a_(b)?mode=test#result",
        label: "https://example.com/a_(b)?mode=test#result",
      },
      {
        start: 54,
        end: 72,
        href: "https://openai.com/",
        label: "https://openai.com",
      },
    ]);
  });

  it("supports explicit Markdown links while ignoring links in code", () => {
    const prompt = [
      "[Open docs](https://example.com/docs)",
      "`https://example.com/inline`",
      "```",
      "https://example.com/fenced",
      "```",
    ].join("\n");

    expect(findSubmittedPromptWebLinks(prompt)).toEqual([
      {
        start: 0,
        end: 37,
        href: "https://example.com/docs",
        label: "Open docs",
      },
    ]);
  });

  it("rejects malformed and unsupported external URLs", () => {
    expect(normalizeExternalTranscriptUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeExternalTranscriptUrl("file:///tmp/example.txt")).toBeNull();
    expect(normalizeExternalTranscriptUrl("not a URL")).toBeNull();
    expect(normalizeExternalTranscriptUrl("https://example.com/path?q=1#two")).toBe(
      "https://example.com/path?q=1#two",
    );
  });
});
