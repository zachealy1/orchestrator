import postcss from "postcss";
import { describe, expect, it } from "vitest";
import { readAppStyles } from "../test/readAppStyles";

const css = readAppStyles();

describe("settings connection styles", () => {
  it("uses square selectable rows with the shared application hover token", () => {
    expect(css).not.toContain(".settings-manage-button");

    const root = postcss.parse(css);
    let rowRule = "";
    let interactionRule = "";
    root.walkRules((candidate) => {
      if (candidate.selector === "button.settings-connection-row") {
        rowRule = candidate.toString();
      }
      if (
        candidate.selector.includes("button.settings-connection-row:hover") &&
        candidate.selector.includes("button.settings-connection-row:focus-visible")
      ) {
        interactionRule = candidate.toString();
      }
    });

    expect(rowRule).toContain("border-radius: 0");
    expect(rowRule).toContain("background: transparent");
    expect(interactionRule).toContain("background: var(--color-button-active)");
    expect(interactionRule).not.toContain("border-radius");
  });

  it("shares the selectable-row and compact utility-action treatment", () => {
    const root = postcss.parse(css);
    let navigationRule = "";
    let navigationInteractionRule = "";
    let iconActionRule = "";
    root.walkRules((candidate) => {
      if (candidate.selector === "button.settings-navigation-row") {
        navigationRule = candidate.toString();
      }
      if (
        candidate.selector.includes("button.settings-navigation-row:hover") &&
        candidate.selector.includes("button.settings-navigation-row:focus-visible")
      ) {
        navigationInteractionRule = candidate.toString();
      }
      if (candidate.selector === ".settings-icon-action") {
        iconActionRule = candidate.toString();
      }
    });

    expect(navigationRule).toContain("border-radius: 0");
    expect(navigationRule).toContain("background: transparent");
    expect(navigationInteractionRule).toContain(
      "background: var(--color-button-active)",
    );
    expect(iconActionRule).toContain("width: 34px");
    expect(iconActionRule).toContain("background: transparent");
  });
});
