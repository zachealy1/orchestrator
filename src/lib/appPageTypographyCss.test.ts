import postcss from "postcss";
import { describe, expect, it } from "vitest";
import { readAppStyles } from "../test/readAppStyles";

const css = readAppStyles();

describe("primary page typography", () => {
  it("shares one title treatment across settings, analytics, and plugins", () => {
    const root = postcss.parse(css);
    let pageTitleRule = "";

    root.walkRules((rule) => {
      if (
        rule.selector.includes(".settings-page-header h1") &&
        rule.selector.includes(".plugins-page-header h1") &&
        rule.selector.includes(".analytics-page-heading h1")
      ) {
        pageTitleRule = rule.toString();
      }
    });

    expect(pageTitleRule).toContain("font-family: inherit");
    expect(pageTitleRule).toContain(
      "font-size: clamp(1.8rem, 2.2vw, 2.35rem)",
    );
    expect(pageTitleRule).toContain("font-style: normal");
    expect(pageTitleRule).toContain("font-weight: 700");
    expect(pageTitleRule).toContain("line-height: 1.05");
    expect(pageTitleRule).toContain("letter-spacing: -0.025em");
  });

  it("does not retain page-specific title-size overrides", () => {
    expect(css).not.toContain("font-size: 1.82rem");
  });
});
