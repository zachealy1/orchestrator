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

describe("primary navigation styles", () => {
  it("applies hover colour only to inactive page buttons", () => {
    expect(
      ruleFor(".primary-nav button:not(.active):hover:not(:disabled)"),
    ).toContain("background: var(--panel-strong)");
    expect(
      ruleFor(
        ".primary-nav button.active,\n.primary-nav button.active:hover:not(:disabled)",
      ),
    ).toContain("background: var(--color-button-active)");
    expect(ruleFor(".primary-nav button:hover:not(:disabled)")).toBe("");
  });
});
