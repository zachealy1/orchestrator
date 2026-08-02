import { readAppStyles } from "../test/readAppStyles";
import { describe, expect, it } from "vitest";


const css = readAppStyles();

function rule(selector: string) {
  const selectorStart = css.indexOf(`\n${selector} {`);
  if (selectorStart < 0) throw new Error(`Missing CSS rule: ${selector}`);
  const blockStart = css.indexOf("{", selectorStart);
  const blockEnd = css.indexOf("}", blockStart);
  return css.slice(selectorStart, blockEnd + 1);
}

describe("activity diff-stat CSS", () => {
  it("uses the same addition and deletion colors as the workspace header", () => {
    expect(rule(".activity-additions")).toContain(
      "color: var(--color-diff-addition)",
    );
    expect(rule(".activity-deletions")).toContain("color: var(--color-error)");
    expect(rule(".workspace-context-change-stat.additions")).toContain(
      "color: var(--color-diff-addition)",
    );
    expect(rule(".workspace-context-change-stat.deletions")).toContain(
      "color: var(--color-error)",
    );
  });
});
