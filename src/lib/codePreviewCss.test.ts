import { describe, expect, it } from "vitest";
import { readAppStyles } from "../test/readAppStyles";

const css = readAppStyles();

function rule(selector: string) {
  const exactStart = css.indexOf(`\n${selector} {`);
  const selectorStart = exactStart >= 0 ? exactStart + 1 : css.indexOf(selector);
  if (selectorStart < 0) throw new Error(`Missing CSS rule: ${selector}`);
  const blockStart = css.indexOf("{", selectorStart);
  const blockEnd = css.indexOf("}", blockStart);
  return css.slice(selectorStart, blockEnd + 1);
}

describe("code preview gutter CSS", () => {
  it("derives the gutter track from the file line count instead of a fixed width", () => {
    const line = rule(".code-preview-line");

    expect(line).toContain(
      "grid-template-columns: var(--code-preview-gutter-width) minmax(0, 1fr)",
    );
    expect(line).not.toContain("52px");
  });

  it("keeps all line-number digits on one unclipped, consistently aligned line", () => {
    const gutter = rule(".code-preview-gutter");

    expect(gutter).toContain("white-space: nowrap");
    expect(gutter).toContain("overflow-wrap: normal");
    expect(gutter).toContain("word-break: normal");
    expect(gutter).toContain("text-align: right");
    expect(gutter).toContain("font-variant-numeric: tabular-nums");
    expect(gutter).not.toContain("overflow: hidden");
    expect(gutter).not.toContain("text-overflow:");
  });
});
