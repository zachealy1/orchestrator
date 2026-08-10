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
    const drawer = rule(".kanban-local-review-drawer");

    expect(drawer).toContain(
      "background: var(--color-component-background)",
    );
    expect(rule(".kanban-local-review-diff")).toContain(
      "background: var(--color-component-background)",
    );
    expect(css).not.toContain("background: var(--color-surface);");
    expect(css).not.toContain("background: var(--color-component);");
  });

  it("owns the full viewport edge like the file preview drawer", () => {
    const drawer = rule(".kanban-local-review-drawer");

    expect(drawer).toContain("position: fixed");
    expect(drawer).toContain("top: 0");
    expect(drawer).toContain("right: 0");
    expect(drawer).toContain("bottom: 0");
    expect(drawer).toContain("z-index: 40");
    expect(drawer).toContain("width: 520px");
    expect(drawer).toContain("max-width: calc(100vw - 360px)");
  });

  it("uses explorer-style file rows and the shared diff preview surface", () => {
    const fileRow = rule(".kanban-local-review-files button");

    expect(fileRow).toContain("grid-template-columns: 20px 16px minmax(0, 1fr)");
    expect(fileRow).toContain("border-radius: 4px");
    expect(rule(".kanban-local-review-diff")).toContain("display: flex");
    expect(css).toContain(".kanban-local-review-diff > .diff-preview");
    expect(css).not.toContain(".kanban-local-review-diff-line {");
  });
});
