import postcss from "postcss";
import { describe, expect, it } from "vitest";
import { readAppStyles } from "../test/readAppStyles";

const css = readAppStyles();

function rule(selector: string) {
  let source = "";
  postcss.parse(css).walkRules((candidate) => {
    if (candidate.selector === selector) source = candidate.toString();
  });
  if (!source) throw new Error(`Missing CSS rule: ${selector}`);
  return source;
}

describe("settings search styles", () => {
  it("uses a neutral focus treatment instead of the primary blue highlight", () => {
    const focus = rule(".settings-search:focus-within");

    expect(focus).toContain("border-color: var(--color-text-secondary)");
    expect(focus).toContain(
      "box-shadow: 0 0 0 3px rgb(var(--text-secondary-rgb) / 0.16)",
    );
    expect(focus).not.toContain("var(--color-primary)");
    expect(focus).not.toContain("var(--dropdown-focus-ring)");
  });
});
