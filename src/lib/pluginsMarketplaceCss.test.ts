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
  });

  it("uses application surfaces for cards and tonal hover feedback", () => {
    expect(ruleFor(".plugin-card")).toContain(
      "background: var(--color-component-background)",
    );
    expect(ruleFor(".plugin-card")).toContain(
      "border: 1px solid var(--color-divider)",
    );
    expect(ruleFor(".plugin-card")).toContain(
      "contain: layout style paint",
    );
    expect(ruleFor(".plugin-card:hover")).toContain(
      "background: var(--color-button-active)",
    );
    expect(ruleFor(".plugin-card:hover")).toContain(
      "border-color: var(--color-divider)",
    );
  });

  it("uses the compact capability-led card structure", () => {
    expect(ruleFor(".plugin-card")).toContain("min-height: 146px");
    expect(ruleFor(".plugin-card-heading")).toContain(
      "grid-template-columns: 48px minmax(0, 1fr)",
    );
    expect(ruleFor(".plugin-card-select-target")).toContain("inset: 0");
    expect(ruleFor(".plugin-card-select-target")).toContain("width: 100%");
    expect(ruleFor(".plugin-card-select-target:focus-visible:not(:disabled)")).toContain(
      "outline: 2px solid var(--color-primary)",
    );
    expect(ruleFor(".plugin-card-footer")).toContain("min-height: 48px");
    expect(ruleFor(".plugin-card-tags span")).toContain(
      "border: 1px solid var(--color-divider)",
    );
    expect(css).not.toContain(".plugin-card-actions .link-button");
    expect(css).not.toContain(".plugin-card-details-button");
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
