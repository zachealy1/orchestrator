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

describe("context usage CSS", () => {
  it("keeps the meter width independent of token count and fill percentage", () => {
    const meter = rule(".workspace-context-meter");

    expect(meter).toContain("--context-meter-width: 188px");
    expect(meter).toContain("width: var(--context-meter-width)");
    expect(meter).toContain("min-width: var(--context-meter-width)");
    expect(meter).toContain("max-width: var(--context-meter-width)");
    expect(meter).toContain("flex: 0 0 var(--context-meter-width)");
  });
});
