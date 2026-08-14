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
  it("spaces workspace warnings evenly between the header and swim lanes", () => {
    expect(rule(".kanban-workspace-alert")).toContain("margin: 14px 16px 0");
    expect(rule(".kanban-board-columns")).toContain(
      "padding: 14px 16px 24px",
    );
  });

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
    expect(drawer).toContain("width: clamp(760px, 72vw, 1120px)");
    expect(drawer).toContain("max-width: calc(100vw - 72px)");
  });

  it("uses explorer-style file rows and the shared diff preview surface", () => {
    const fileRow = rule(".kanban-local-review-files .workspace-tree-row");

    expect(fileRow).toContain("min-height: 30px");
    expect(fileRow).toContain("var(--depth, 0) * 12px");
    expect(fileRow).toContain("border-radius: 0");
    expect(rule(".kanban-local-review-explorer-root")).toContain(
      "border-radius: 0",
    );
    expect(rule(".kanban-local-review-diff")).toContain("display: flex");
    expect(css).toContain(".kanban-local-review-diff > .diff-preview");
    expect(css).not.toContain(".kanban-local-review-diff-line {");
  });

  it("keeps the diff layout switch clear of the surrounding dividers", () => {
    const toggleButton = rule(".kanban-local-review-layout-toggle button");

    expect(toggleButton).toContain("height: 26px");
    expect(toggleButton).toContain("min-height: 0");
  });

  it("uses neutral hover styling for local review icon controls", () => {
    const hoverRule = rule(
      ".kanban-local-review-drawer .kanban-icon-button:hover:not(:disabled),",
    );

    expect(hoverRule).toContain("background: var(--color-surface-muted)");
    expect(hoverRule).not.toContain("color:");
    expect(hoverRule).not.toContain("var(--color-button-active)");
  });

  it("aligns transition errors with their warning icon", () => {
    const errorRule = rule(".kanban-transition-dialog .kanban-form-error");

    expect(errorRule).toContain("display: grid");
    expect(errorRule).toContain("grid-template-columns: auto minmax(0, 1fr)");
    expect(errorRule).toContain("align-items: start");
  });

  it("uses a flat archive summary and borderless icon-only actions", () => {
    const summary = rule(".kanban-archive-transition-card");
    const actions = rule(
      ".kanban-transition-dialog footer button.native-plan-icon-action",
    );

    expect(summary).toContain("border-width: 1px 0");
    expect(summary).toContain("border-radius: 0");
    expect(summary).toContain("background: transparent");
    expect(actions).toContain("width: 30px");
    expect(actions).toContain("height: 30px");
    expect(actions).toContain("border: 0");
  });

  it("aligns archived empty-state icons and labels in one row", () => {
    const emptyState = rule(".kanban-archive-column-empty");

    expect(emptyState).toContain("display: flex");
    expect(emptyState).toContain("align-items: center");
    expect(emptyState).toContain("justify-content: center");
  });
});
