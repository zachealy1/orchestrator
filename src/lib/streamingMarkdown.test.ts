import { describe, expect, it } from "vitest";
import { prepareStreamingMarkdown } from "./streamingMarkdown";

describe("prepareStreamingMarkdown", () => {
  it("passes complete markdown through unchanged", () => {
    const markdown = [
      "Updated [favicon.svg](/repo/public/favicon.svg).",
      "",
      "- Added the asset",
      "- Ran `npm test`",
    ].join("\n");

    expect(prepareStreamingMarkdown(markdown)).toBe(markdown);
  });

  it("shows only the label for an unfinished link destination", () => {
    expect(
      prepareStreamingMarkdown(
        "Updated [favicon.svg](</Users/test/Application Support/app/favicon.svg>",
      ),
    ).toBe("Updated favicon.svg");
  });

  it("does not interpret link syntax inside code", () => {
    const markdown = [
      "Use `[label](/unfinished` as the example.",
      "",
      "```md",
      "[label](/unfinished",
      "```",
    ].join("\n");

    expect(prepareStreamingMarkdown(markdown)).toBe(markdown);
  });

  it("temporarily closes unfinished code and emphasis delimiters", () => {
    expect(prepareStreamingMarkdown("Run `npm test")).toBe("Run `npm test`");
    expect(prepareStreamingMarkdown("This is **important")).toBe(
      "This is **important**",
    );
    expect(prepareStreamingMarkdown("This is ~~obsolete")).toBe(
      "This is ~~obsolete~~",
    );
    expect(prepareStreamingMarkdown("```text\nresult")).toBe(
      "```text\nresult\n```",
    );
  });
});
