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

describe("workspace surface switcher styles", () => {
  it("keeps both segment icons on fixed even-pixel geometry", () => {
    const buttonRule = ruleFor(".workspace-surface-toggle button");
    const iconRule = ruleFor(".workspace-surface-toggle button > svg");

    expect(buttonRule).toContain("width: 34px");
    expect(buttonRule).toContain("flex: 0 0 34px");
    expect(buttonRule).toContain("line-height: 0");
    expect(buttonRule).toContain("transition: none");
    expect(iconRule).toContain("width: 16px");
    expect(iconRule).toContain("height: 16px");
    expect(iconRule).toContain("flex: 0 0 16px");
  });
});
