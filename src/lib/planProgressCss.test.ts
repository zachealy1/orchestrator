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

describe("plan progress CSS", () => {
  it("uses only the filled track without an active progress marker", () => {
    expect(css).not.toContain(".plan-progress-marker");
    expect(css).not.toContain("@keyframes plan-progress-pulse");
  });

  it("uses the shared borderless tooltip treatment", () => {
    const tooltip = rule(".plan-progress-tooltip");

    expect(tooltip).toContain("border: 0");
    expect(tooltip).toContain("border-radius: 7px");
    expect(tooltip).toContain(
      "background: var(--color-component-background)",
    );
    expect(tooltip).toContain(
      "box-shadow: 0 12px 32px rgb(var(--shadow-rgb) / 0.24)",
    );
  });
});
