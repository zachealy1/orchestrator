import { describe, expect, it } from "vitest";
import postcss from "postcss";
import { readAppStyles } from "../test/readAppStyles";

const css = readAppStyles();

describe("button hover foreground styles", () => {
  it("does not replace a button's resting foreground on hover or focus", () => {
    const offenders: string[] = [];
    postcss.parse(css).walkRules((rule) => {
      const isButtonInteraction =
        /:hover|:focus-visible/.test(rule.selector) &&
        /button|action|handle|close|latest/.test(rule.selector);
      if (
        isButtonInteraction &&
        rule.nodes.some(
          (node) => node.type === "decl" && node.prop === "color",
        )
      ) {
        offenders.push(rule.selector);
      }
    });

    expect(offenders).toEqual([]);
  });

  it("keeps semantic icon colors on their resting action classes", () => {
    expect(css).toMatch(
      /button\.native-plan-icon-action\.implement\s*\{[^}]*color: var\(--color-primary\);/,
    );
    expect(css).toMatch(
      /button\.native-plan-icon-action\.cancel\s*\{[^}]*color: var\(--color-error\);/,
    );
  });
});
