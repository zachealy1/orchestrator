import postcss from "postcss";
import { describe, expect, it } from "vitest";
import { readAppStyles } from "../test/readAppStyles";

const css = readAppStyles();

describe("settings connection styles", () => {
  it("keeps connection rows static and limits interaction styling to Manage", () => {
    expect(css).not.toMatch(/button\.settings-connection-row:(?:hover|focus-visible)/);

    const root = postcss.parse(css);
    let manageRule = "";
    root.walkRules((candidate) => {
      if (candidate.selector === ".settings-manage-button") {
        manageRule = candidate.toString();
      }
    });

    expect(manageRule).toContain("background: transparent");
    expect(manageRule).toContain("color: var(--color-primary)");
  });
});
