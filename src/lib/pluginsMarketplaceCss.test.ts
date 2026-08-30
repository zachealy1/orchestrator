import postcss from "postcss";
import { describe, expect, it } from "vitest";
import { readAppStyles } from "../test/readAppStyles";

const css = readAppStyles();

function rulesFor(selector: string) {
  const results: string[] = [];
  postcss.parse(css).walkRules((rule) => {
    if (rule.selector === selector) results.push(rule.toString());
  });
  return results;
}

function ruleFor(selector: string) {
  return rulesFor(selector)[0] ?? "";
}

describe("plugin marketplace styles", () => {
  it("uses the browse-first featured and three-column catalog grids", () => {
    expect(ruleFor(".plugins-browser-toolbar")).toContain(
      "grid-template-columns: minmax(0, 1fr) auto",
    );
    expect(ruleFor(".plugins-search")).toContain("width: 100%");
    expect(ruleFor(".plugins-featured-grid")).toContain(
      "grid-template-columns: repeat(2, minmax(0, 1fr))",
    );
    expect(rulesFor(".plugins-card-grid")).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          "grid-template-columns: repeat(3, minmax(0, 1fr))",
        ),
      ]),
    );
  });

  it("keeps the compact view switcher beside the search field", () => {
    expect(ruleFor(".plugins-browser-toolbar")).toContain(
      "--plugins-toolbar-control-height: 44px",
    );
    expect(ruleFor(".plugins-search")).toContain(
      "height: var(--plugins-toolbar-control-height)",
    );
    expect(ruleFor(".plugins-browse-tabs")).toContain("width: max-content");
    expect(ruleFor(".plugins-browse-tabs")).toContain("align-self: center");
    expect(ruleFor(".plugins-browse-tabs")).toContain(
      "height: var(--plugins-toolbar-control-height)",
    );
    expect(ruleFor(".plugins-browse-tabs button")).toContain("height: 100%");
    expect(ruleFor(".plugins-browse-tabs button")).toContain("padding: 0 10px");
    expect(ruleFor(".plugins-browse-tabs button span")).toContain(
      "height: 16px",
    );
    expect(ruleFor(".plugins-catalog-panel[hidden]")).toBe("");
  });

  it("uses application surfaces for cards and tonal hover feedback", () => {
    expect(ruleFor(".plugin-card")).toContain(
      "background: var(--color-component-background)",
    );
    expect(ruleFor(".plugin-card")).toContain(
      "border: 1px solid var(--color-divider)",
    );
    expect(ruleFor(".plugin-card")).not.toContain("contain:");
    expect(ruleFor(".plugin-card")).not.toContain("overflow: hidden");
    expect(ruleFor(".plugin-card")).not.toContain("box-shadow");
    expect(ruleFor(".plugin-card")).not.toContain("filter:");
    expect(ruleFor(".plugin-card")).not.toContain("will-change");
    expect(ruleFor(".plugin-card::before")).toBe("");
    expect(ruleFor(".plugin-card:hover::before")).toBe("");
    expect(ruleFor(".plugin-card:hover")).toContain(
      "background: var(--color-surface-soft)",
    );
    expect(ruleFor(".plugin-card:hover")).toContain(
      "border-color: var(--color-divider)",
    );
    expect(ruleFor(".plugin-logo")).toContain(
      "background: var(--color-surface-muted)",
    );
    expect(ruleFor(".plugin-logo")).toContain(
      "box-shadow: inset 0 0 0 1px var(--color-divider)",
    );
    expect(ruleFor(".plugin-logo")).toContain("color: var(--color-icon)");
    expect(ruleFor(".plugin-card:hover .plugin-logo")).toBe("");
    expect(ruleFor(".plugin-card")).toContain("transition: none");
    expect(ruleFor(".plugin-card:focus-visible")).toContain(
      "outline: 2px solid var(--color-primary)",
    );
  });

  it("uses the shared floating banner treatment for plugin feedback", () => {
    expect(ruleFor(".plugins-screen-status-anchor")).toContain(
      "position: fixed",
    );
    expect(ruleFor(".plugins-screen-status-anchor")).toContain(
      "pointer-events: none",
    );
    expect(
      ruleFor(
        ".plugins-screen-status-anchor .floating-header-status-bubble",
      ),
    ).toContain("width: min(760px, calc(100% - 64px))");
    expect(ruleFor(".plugins-notice")).toBe("");
    expect(ruleFor(".plugins-error")).toBe("");
    expect(ruleFor(".plugin-overview-feedback")).toBe("");
  });

  it("removes the Plugins DOM instead of fixing a hidden catalog onscreen", () => {
    expect(
      ruleFor(".plugins-view-stack.application-view-slot-preloaded"),
    ).toBe("");
    expect(ruleFor(".plugins-view-stack[hidden]")).toContain("display: none");
  });

  it("uses compact cards without capability labels or wrapping install actions", () => {
    expect(ruleFor(".plugin-card")).toContain("min-height: 146px");
    expect(ruleFor(".plugin-card-heading")).toContain(
      "grid-template-columns: 48px minmax(0, 1fr)",
    );
    expect(ruleFor(".plugin-card")).not.toContain("position:");
    expect(ruleFor(".plugin-logo")).not.toContain("position:");
    expect(ruleFor(".plugin-card-main,\n.plugin-card-footer")).toBe("");
    expect(ruleFor(".plugin-card-select-target")).toBe("");
    expect(ruleFor(".plugin-logo img")).toContain("grid-area: 1 / 1");
    expect(ruleFor(".plugin-card-footer")).toContain("min-height: 49px");
    expect(ruleFor(".plugin-card-footer")).toContain("flex: 0 0 auto");
    expect(ruleFor(".plugin-card-footer")).toContain("flex-wrap: nowrap");
    expect(ruleFor(".plugin-card-metadata")).toContain("overflow: hidden");
    expect(ruleFor(".plugin-card-status")).toContain("text-overflow: ellipsis");
    expect(ruleFor(".plugin-card-tags")).toBe("");
    expect(ruleFor(".plugin-card-capability-count")).toBe("");
    expect(ruleFor(".plugin-card-install-button")).toContain("width: 32px");
    expect(ruleFor(".plugin-card-install-button")).toContain("padding: 0");
    expect(ruleFor(".plugin-card-install-button")).toContain(
      "background: var(--color-button-primary)",
    );
    expect(ruleFor(".plugin-card-install-button")).toContain(
      "color: var(--color-button-primary-text)",
    );
    expect(ruleFor(".plugin-card-install-button:hover:not(:disabled)")).toContain(
      "background: var(--color-primary)",
    );
    expect(css).not.toContain(".plugin-card-actions .link-button");
    expect(css).not.toContain(".plugin-card-details-button");
    expect(ruleFor(".plugins-pagination button")).toContain("width: 28px");
    expect(ruleFor(".plugins-pagination button")).toContain("transition: none");
  });

  it("uses a responsive full-page overview instead of a details modal", () => {
    expect(ruleFor(".plugins-catalog-page,\n.plugin-overview-page")).toContain(
      "display: grid",
    );
    expect(ruleFor(".plugin-overview-header")).toContain(
      "background: var(--color-component-background)",
    );
    expect(ruleFor(".plugin-overview-layout")).toContain(
      "grid-template-columns: minmax(0, 1fr) minmax(280px, 0.34fr)",
    );
    expect(ruleFor(".plugin-overview-panel")).toContain(
      "border: 1px solid var(--color-divider)",
    );
    expect(ruleFor(".plugin-overview-main")).toContain("padding: 0");
    expect(
      ruleFor(".plugin-overview-main-section + .plugin-overview-main-section"),
    ).toContain("border-top: 1px solid var(--color-divider)");
    expect(ruleFor(".plugin-component-summary")).toContain(
      "grid-template-columns: repeat(4, minmax(0, 1fr))",
    );
    expect(ruleFor(".plugin-component-summary > div")).toContain(
      "min-height: 112px",
    );
    expect(ruleFor(".plugin-overview-back")).toContain(
      "background: transparent",
    );
    expect(
      ruleFor(".plugin-overview-management-actions > button.danger"),
    ).toContain("border: 1px solid var(--color-error)");
    expect(ruleFor(".plugins-catalog-page[hidden]")).toContain("display: none");
    expect(css).not.toContain(".plugin-details-dialog");
    expect(css).not.toContain(".plugin-details-close");
  });

  it("removes the legacy split list presentation", () => {
    expect(css).not.toContain(".plugins-layout");
    expect(css).not.toContain(".plugins-list");
    expect(css).not.toContain("button.plugin-list-row");
    expect(css).not.toContain(".plugins-marketplace-controls");
    expect(css).not.toContain(".plugins-browser-toolbar select");
  });
});
