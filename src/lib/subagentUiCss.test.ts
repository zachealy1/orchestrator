// @ts-expect-error Vitest runs in Node; the app typecheck intentionally omits Node types.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

declare const process: { cwd(): string };

const css = readFileSync(`${process.cwd()}/src/App.css`, "utf8");

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
    expect(css).not.toContain(".subagent-transcript-message");
    expect(css).toContain(".subagent-transcript-turn .run-summary");
    expect(css).toContain(".subagent-transcript-turn .stream-message");
  });
});
