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
  it("does not apply a focus highlight to the wrapper or input", () => {
    const input = rule(".settings-search input");

    expect(css).not.toMatch(/\.settings-search:focus-within\s*\{/);
    expect(input).toContain("border: 0");
    expect(input).toContain("box-shadow: none");
    expect(input).toContain("outline: none");
  });
});
