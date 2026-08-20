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
      "grid-template-columns: var(--code-preview-gutter-width) max-content",
    );
    expect(line).not.toContain("52px");
  });

  it("uses fixed non-wrapping rows with horizontal scrolling", () => {
    const line = rule(".code-preview-line");
    const source = rule(".code-preview-source");

    expect(line).toContain("height: var(--code-preview-row-height)");
    expect(source).toContain("white-space: pre");
    expect(source).toContain("overflow-wrap: normal");
    expect(source).not.toContain("pre-wrap");
  });

  it("avoids deferred diff painting and per-cell seam borders", () => {
    const cell = rule(".diff-preview-cell");
    const divider = rule(".diff-preview-grid.virtualized::after");

    expect(cell).not.toContain("content-visibility");
    expect(cell).not.toContain("contain-intrinsic-size");
    expect(cell).not.toContain("contain:");
    expect(cell).not.toContain("border-bottom");
    expect(divider).toContain("width: 1px");
    expect(divider).toContain("background: var(--color-divider)");
  });

  it("keeps side-by-side diff columns aligned without horizontal scrolling", () => {
    const scroll = rule(".diff-preview-scroll");
    const header = rule(".diff-preview-pinned-column-header");
    const grid = rule(".diff-preview-grid.virtualized");
    const cell = rule(".diff-preview-cell");
    const source = rule(".diff-preview-source");

    expect(scroll).toContain("overflow-x: hidden");
    expect(scroll).toContain("overflow-y: auto");
    expect(header).toContain(
      "grid-template-columns: minmax(0, 1fr) minmax(0, 1fr)",
    );
    expect(grid).toContain("width: 100%");
    expect(grid).toContain("min-width: 0");
    expect(cell).toContain("overflow: hidden");
    expect(cell).toContain("width: 100%");
    expect(source).toContain("overflow: hidden");
    expect(source).toContain("min-width: 0");
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
