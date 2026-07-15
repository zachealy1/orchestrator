// @ts-expect-error Vitest runs in Node; the app typecheck intentionally omits Node types.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

declare const process: { cwd(): string };

const css = readFileSync(`${process.cwd()}/src/App.css`, "utf8");

function rule(selector: string) {
  const exactStart = css.indexOf(`\n${selector} {`);
  const selectorStart = exactStart >= 0 ? exactStart + 1 : css.indexOf(selector);
  if (selectorStart < 0) throw new Error(`Missing CSS rule: ${selector}`);
  const blockStart = css.indexOf("{", selectorStart);
  const blockEnd = css.indexOf("}", blockStart);
  return css.slice(selectorStart, blockEnd + 1);
}

describe("high-speed transcript scrolling CSS", () => {
  it("represents the full height of tall scroll-seek rows", () => {
    const placeholder = rule(".task-chat-scroll-seek-row");
    const continuation = rule(".task-chat-scroll-seek-row::before");

    expect(placeholder).toContain("contain: strict");
    expect(continuation).toContain("bottom: 18px");
    expect(continuation).toContain("repeating-linear-gradient");
    expect(continuation).toContain("var(--color-surface-soft)");
  });

  it("provides a compositor-safe fallback behind virtual rows", () => {
    const fallback = rule(
      ".task-chat-transcript.virtuoso-transcript.is-scroll-active",
    );
    const realRow = rule(".task-chat-virtuoso-row");

    expect(fallback).toContain("background-color: var(--color-background)");
    expect(fallback).toContain("repeating-linear-gradient");
    expect(fallback).toContain("var(--color-surface-soft)");
    expect(realRow).toContain("background: var(--color-background)");
  });
});
