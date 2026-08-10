// @ts-expect-error Vitest runs in Node; the app typecheck intentionally omits Node types.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

declare const process: { cwd(): string };

const css = readFileSync(
  `${process.cwd()}/src/features/kanban/kanban.css`,
  "utf8",
);

function rule(selector: string) {
  const exactStart = css.lastIndexOf(`\n${selector} {`);
  const selectorStart = exactStart >= 0 ? exactStart + 1 : css.indexOf(selector);
  if (selectorStart < 0) throw new Error(`Missing CSS rule: ${selector}`);
  const blockStart = css.indexOf("{", selectorStart);
  const blockEnd = css.indexOf("}", blockStart);
  return css.slice(selectorStart, blockEnd + 1);
}

describe("Kanban local review styles", () => {
  it("uses opaque shared application surfaces for the drawer and diff", () => {
    expect(rule(".kanban-local-review-drawer")).toContain(
      "background: var(--color-component-background)",
    );
    expect(rule(".kanban-local-review-diff")).toContain(
      "background: var(--color-component-background)",
    );
    expect(css).not.toContain("background: var(--color-surface);");
    expect(css).not.toContain("background: var(--color-component);");
  });
});
