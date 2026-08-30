import postcss from "postcss";
import { describe, expect, it } from "vitest";
import { readAppStyles } from "../test/readAppStyles";

const css = readAppStyles();

function ruleFor(selector: string) {
  let result = "";
  postcss.parse(css).walkRules((rule) => {
    if (rule.selector === selector) result = rule.toString();
  });
  return result;
}

describe("settings loading styles", () => {
  it("lays out the preloaded Settings tree without painting or exposing it", () => {
    const preloadRule = ruleFor(
      ".settings-grid.application-view-slot-preloaded",
    );
    expect(preloadRule).toContain("position: fixed");
    expect(preloadRule).toContain("visibility: hidden");
    expect(preloadRule).toContain("pointer-events: none");
    expect(preloadRule).toContain("contain: layout style paint");
    expect(preloadRule).not.toContain("display: none");
  });

  it("removes the previous application view from layout before unmounting", () => {
    expect(ruleFor(".application-view-slot-hidden")).toContain(
      "display: none !important",
    );
  });
});
