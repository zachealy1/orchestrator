// @ts-expect-error Vitest runs in Node; the app typecheck intentionally omits Node types.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

declare const process: { cwd(): string };

const css = readFileSync(
  `${process.cwd()}/src/features/kanban/kanban.css`,
  "utf8",
);
const shellCss = readFileSync(
  `${process.cwd()}/src/styles/shell-and-header.css`,
  "utf8",
);

function sourceRule(source: string, selector: string) {
  const exactStart = source.lastIndexOf(`\n${selector} {`);
  const selectorStart =
    exactStart >= 0 ? exactStart + 1 : source.indexOf(selector);
  if (selectorStart < 0) throw new Error(`Missing CSS rule: ${selector}`);
  const blockStart = source.indexOf("{", selectorStart);
  const blockEnd = source.indexOf("}", blockStart);
  return source.slice(selectorStart, blockEnd + 1);
}

function rule(selector: string) {
  return sourceRule(css, selector);
}

describe("Kanban local review styles", () => {
  it("keeps the persistent GitHub warning in the workspace flow", () => {
    expect(rule(".kanban-workspace-alert")).toContain("margin: 14px 16px 0");
    expect(rule(".kanban-board-columns")).toContain(
      "padding: 14px 16px 24px",
    );
  });

  it("floats transient status notices without reserving board space", () => {
    const anchor = rule(".kanban-floating-status-anchor");
    const bubble = rule(
      ".kanban-floating-status-anchor .floating-header-status-bubble",
    );

    expect(anchor).toContain("position: relative");
    expect(anchor).toContain("height: 0");
    expect(anchor).toContain("flex: 0 0 0");
    expect(anchor).toContain("pointer-events: none");
    expect(bubble).toContain("top: 24px");
    expect(bubble).toContain("left: 50%");
    expect(bubble).toContain("width: min(760px, calc(100% - 64px))");
    expect(bubble).toContain("max-width: calc(100% - 32px)");
    expect(bubble).toContain("transform: translateX(-50%)");
    expect(bubble).toContain("pointer-events: auto");
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
    expect(errorRule).toContain("width: 100%");
    expect(errorRule).toContain("box-sizing: border-box");
    expect(errorRule).toContain("grid-template-columns: auto minmax(0, 1fr)");
    expect(errorRule).toContain("align-items: start");
  });

  it("limits transition descriptions without shortening error rows", () => {
    expect(
      rule(
        ".kanban-transition-dialog.is-stop-and-move > #kanban-transition-description",
      ),
    ).toContain("max-width: 620px");
    expect(
      rule(
        ".kanban-transition-dialog.is-no-changes > #kanban-transition-description",
      ),
    ).toContain("max-width: 620px");
    expect(css).not.toContain(
      ".kanban-transition-dialog.is-stop-and-move > p {",
    );
    expect(css).not.toContain(
      ".kanban-transition-dialog.is-no-changes > p {",
    );
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

  it("keeps card status and mode inline while truncating narrow content", () => {
    const board = rule(".kanban-board");
    const card = rule(".kanban-card-tile");
    const topline = rule(".kanban-card-topline");
    const badges = rule(".kanban-card-badges");
    const narrowBadges = sourceRule(css, "  .kanban-card-badges");
    const stateBadge = rule(".kanban-state-badge");
    const modeBadge = rule(".kanban-mode-badge");
    const actions = rule(".kanban-card-top-actions");
    const content = rule(".kanban-card-content");
    const stateLabel = rule(".kanban-state-label,");
    const footer = rule(".kanban-card-footer");
    const branch = rule(".kanban-branch-label");
    const branchText = rule(".kanban-branch-text");
    const changedFiles = rule(".kanban-changed-file-count");

    expect(board).toContain("container-name: kanban-board");
    expect(board).toContain("container-type: inline-size");
    expect(card).toContain("container-name: kanban-card");
    expect(card).toContain("container-type: inline-size");
    expect(card).toContain("overflow: hidden");
    expect(card).toContain("align-content: start");
    expect(topline).toContain("display: grid");
    expect(topline).toContain(
      "grid-template-columns: minmax(0, 1fr) auto",
    );
    expect(topline).toContain("align-items: center");
    expect(actions).toContain("align-self: center");
    expect(badges).toContain("width: 100%");
    expect(badges).toContain("min-width: 0");
    expect(badges).toContain("flex-wrap: nowrap");
    expect(narrowBadges).toContain("display: flex");
    expect(narrowBadges).toContain("flex-wrap: nowrap");
    expect(narrowBadges).not.toContain("grid-template-columns");
    expect(stateBadge).toContain("flex: 0 1 auto");
    expect(modeBadge).toContain("flex: 0 0 auto");
    expect(actions).toContain("align-self: center");
    expect(content).toContain("min-width: 0");
    expect(content).toContain("overflow: hidden");
    expect(content).toContain("align-content: start");
    expect(stateLabel).toContain("overflow: hidden");
    expect(stateLabel).toContain("text-overflow: ellipsis");
    expect(footer).toContain("flex-wrap: wrap");
    expect(branch).toContain("flex: 1 1 90px");
    expect(branch).toContain("max-width: 100%");
    expect(branchText).toContain("overflow: hidden");
    expect(branchText).toContain("text-overflow: ellipsis");
    expect(changedFiles).toContain("flex: 0 0 auto");
    expect(changedFiles).toContain("max-width: 100%");
    expect(changedFiles).toContain("text-overflow: ellipsis");
    expect(css).toContain("@container kanban-board (max-width: 920px)");
    expect(css).toContain("@container kanban-board (max-width: 620px)");
    expect(css).toContain("@container kanban-card (max-width: 280px)");
    expect(css).toContain("@container kanban-card (max-width: 220px)");
    expect(css).toContain(
      ".kanban-card-metadata > .kanban-card-metadata-account {",
    );
    expect(css).toContain(
      ".kanban-card-metadata > .kanban-card-metadata-reasoning {",
    );
    expect(css).not.toContain(".kanban-card-footer > :last-child");
  });

  it("keeps ticket content compact with a uniform vertical rhythm", () => {
    const card = rule(".kanban-card-tile");
    const cardRows = rule(".kanban-card-topline,");
    const badges = rule(".kanban-card-badges");
    const content = rule(".kanban-card-content");
    const title = rule(".kanban-card-content strong");
    const description = rule(".kanban-card-description");
    const metadata = rule(".kanban-card-metadata");
    const metadataItem = rule(".kanban-card-metadata > span");
    const footer = rule(".kanban-card-footer");
    const pullRequests = rule(".kanban-pr-status-list");

    expect(card).toContain("--kanban-card-vertical-gap: 3px");
    expect(card).toContain("row-gap: var(--kanban-card-vertical-gap)");
    expect(card).toContain("padding: 8px 10px");
    expect(cardRows).toContain("row-gap: var(--kanban-card-vertical-gap)");
    expect(badges).toContain("row-gap: var(--kanban-card-vertical-gap)");
    expect(content).toContain("row-gap: var(--kanban-card-vertical-gap)");
    expect(title).toContain("line-height: 1.3");
    expect(description).toContain("display: -webkit-box");
    expect(description).toContain("overflow: hidden");
    expect(description).toContain("line-height: 1.35");
    expect(description).toContain("line-clamp: 3");
    expect(description).toContain("-webkit-line-clamp: 3");
    expect(metadata).toContain("row-gap: var(--kanban-card-vertical-gap)");
    expect(metadataItem).toContain("padding: 1px 6px");
    expect(footer).toContain("padding-top: 0");
    expect(pullRequests).toContain("row-gap: var(--kanban-card-vertical-gap)");
    expect(pullRequests).toContain("padding-top: 0");
  });

  it("keeps grouped cards in one scroll viewport above the composer", () => {
    const groups = rule(".kanban-board-groups");
    const clearance = rule(".kanban-composer-scroll-clearance");
    const nestedBoard = rule(".kanban-board-group .kanban-board");
    const mount = sourceRule(shellCss, ".kanban-workspace-mount");
    const composer = sourceRule(shellCss, ".kanban-composer-shell");

    expect(groups).toContain("height: 0");
    expect(groups).toContain("flex: 1 1 0");
    expect(groups).toContain("overflow-x: hidden");
    expect(groups).toContain("overflow-y: auto");
    expect(groups).toContain("overscroll-behavior-y: contain");
    expect(groups).toContain(
      "scroll-padding-bottom: calc(var(--kanban-composer-clearance, 220px) + 16px)",
    );
    expect(groups).toContain("scrollbar-gutter: stable");
    expect(clearance).toContain(
      "min-height: calc(var(--kanban-composer-clearance, 220px) + 16px)",
    );
    expect(clearance).toContain(
      "flex: 0 0 calc(var(--kanban-composer-clearance, 220px) + 16px)",
    );
    expect(clearance).toContain("pointer-events: none");
    expect(nestedBoard).toContain("overflow: visible");
    expect(nestedBoard).toContain("scrollbar-gutter: auto");
    expect(mount).toContain("position: relative");
    expect(mount).toContain("overflow: hidden");
    expect(composer).toContain("position: absolute");
    expect(composer).toContain("bottom: 0");
    expect(composer).toContain("border: 0");
    expect(composer).toContain("pointer-events: none");
    expect(composer).toContain("background: transparent");
    expect(composer).not.toContain("z-index");
    expect(composer).not.toContain("border-top");
    expect(sourceRule(shellCss, ".kanban-composer-shell > .composer-panel")).toContain(
      "pointer-events: auto",
    );
  });
});
