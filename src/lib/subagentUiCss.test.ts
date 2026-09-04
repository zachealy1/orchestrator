import { readAppStyles } from "../test/readAppStyles";
import { describe, expect, it } from "vitest";


const css = readAppStyles();

describe("subagent UI styles", () => {
  it("uses the specific app-surface hover rule instead of the global blue button hover", () => {
    expect(css).toContain(
      "button.subagent-status-item:hover:not(:disabled),\nbutton.subagent-status-item:focus-visible",
    );
    expect(css).toMatch(
      /button\.subagent-status-item:hover:not\(:disabled\),[\s\S]*?background: var\(--color-surface-soft\);/,
    );
  });

  it("uses the standard chat surfaces and no duplicated task panel", () => {
    expect(css).not.toContain(".subagent-inspector-task");
    expect(css).not.toContain(".subagent-task-prompt");
    expect(css).not.toContain(".subagent-transcript-message");
    expect(css).toContain(".submitted-prompt {");
    expect(css).toContain(".subagent-transcript-notice {");
    expect(css).toContain(".subagent-transcript-turn .run-summary");
    expect(css).toContain(".subagent-transcript-turn .stream-message");
  });
});
