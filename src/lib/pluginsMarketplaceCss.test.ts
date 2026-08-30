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

  it("uses application surfaces for cards and tonal hover feedback", () => {
    expect(ruleFor(".plugin-card")).toContain(
      "background: var(--color-component-background)",
    );
    expect(ruleFor(".plugin-card")).toContain(
      "border: 1px solid var(--color-divider)",
    );
    expect(ruleFor(".plugin-card:hover")).toContain(
      "background: var(--color-button-active)",
    );
  });

  it("removes the legacy split list presentation", () => {
    expect(css).not.toContain(".plugins-layout");
    expect(css).not.toContain(".plugins-list");
    expect(css).not.toContain("button.plugin-list-row");
    expect(css).not.toContain(".plugins-marketplace-controls");
    expect(css).not.toContain(".plugins-browser-toolbar select");
  });
});
