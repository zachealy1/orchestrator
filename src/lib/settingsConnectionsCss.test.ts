import postcss from "postcss";
import { describe, expect, it } from "vitest";
import { readAppStyles } from "../test/readAppStyles";

const css = readAppStyles();

describe("settings connection styles", () => {
  it("uses the shared square-edged application highlight for selectable rows", () => {
    expect(css).not.toContain(".settings-manage-button");

    const root = postcss.parse(css);
    let rowRule = "";
    let interactionRule = "";
    let interactiveTextColorRule = "";
    root.walkRules((candidate) => {
      if (candidate.selector === "button.settings-connection-row") {
        rowRule = candidate.toString();
      }
      if (
        candidate.selector.includes("button.settings-connection-row:hover") &&
        candidate.selector.includes("button.settings-connection-row:focus-visible") &&
        candidate.nodes.some(
          (node) => node.type === "decl" && node.prop === "background",
        )
      ) {
        interactionRule = candidate.toString();
      }
      if (
        candidate.selector.includes("settings-connection-row") &&
        candidate.selector.includes("settings-connection-value") &&
        (candidate.selector.includes(":hover") ||
          candidate.selector.includes(":focus-visible")) &&
        candidate.nodes.some(
          (node) => node.type === "decl" && node.prop === "color",
        )
      ) {
        interactiveTextColorRule = candidate.toString();
      }
    });

    expect(rowRule).toContain("border-radius: 0");
    expect(rowRule).toContain("background: transparent");
    expect(interactionRule).toContain("background: var(--color-button-active)");
    expect(interactionRule).not.toContain("border-radius");
    expect(interactiveTextColorRule).toBe("");
  });

  it("shares the selectable-row and compact utility-action treatment", () => {
    const root = postcss.parse(css);
    let navigationRule = "";
    let navigationInteractionRule = "";
    let navigationIndicatorRule = "";
    let iconActionRule = "";
    let interactiveIconColorRule = "";
    root.walkRules((candidate) => {
      if (candidate.selector === "button.settings-navigation-row") {
        navigationRule = candidate.toString();
      }
      if (
        candidate.selector.includes("button.settings-navigation-row:hover") &&
        candidate.selector.includes("button.settings-navigation-row:focus-visible") &&
        candidate.nodes.some(
          (node) => node.type === "decl" && node.prop === "background",
        )
      ) {
        navigationInteractionRule = candidate.toString();
      }
      if (candidate.selector === ".settings-icon-action") {
        iconActionRule = candidate.toString();
      }
      if (candidate.selector === ".settings-navigation-row-indicator") {
        navigationIndicatorRule = candidate.toString();
      }
      if (
        (candidate.selector.includes("settings-connection-row:hover") ||
          candidate.selector.includes("settings-navigation-row:hover")) &&
        candidate.nodes.some(
          (node) => node.type === "decl" && node.prop === "color",
        ) &&
        (candidate.selector.includes("> svg") ||
          candidate.selector.includes("settings-navigation-row-indicator"))
      ) {
        interactiveIconColorRule = candidate.toString();
      }
    });

    expect(navigationRule).toContain("border-radius: 0");
    expect(navigationRule).toContain("background: transparent");
    expect(navigationInteractionRule).toContain(
      "background: var(--color-button-active)",
    );
    expect(iconActionRule).toContain("width: 34px");
    expect(iconActionRule).toContain("height: 34px");
    expect(iconActionRule).toContain("place-items: center");
    expect(iconActionRule).toContain("background: transparent");
    expect(navigationIndicatorRule).toContain("width: 34px");
    expect(navigationIndicatorRule).toContain("height: 34px");
    expect(navigationIndicatorRule).toContain("padding: 9px");
    expect(interactiveIconColorRule).toBe("");
  });

  it("extends settings highlights and section breaks to the panel edges", () => {
    const root = postcss.parse(css);
    const rules = new Map<string, string>();
    const selectors = new Set([
      ".settings-overview-rows",
      ".settings-overview-row",
      ".settings-panel .setting-list",
      ".settings-panel .setting-row",
      ".settings-subsection-heading",
      ".managed-account-row",
    ]);

    root.walkRules((candidate) => {
      if (selectors.has(candidate.selector)) {
        rules.set(candidate.selector, candidate.toString());
      }
    });

    expect(rules.get(".settings-overview-rows")).toContain(
      "padding: 0 0 18px",
    );
    expect(rules.get(".settings-overview-row")).toContain(
      "padding: 12px 20px",
    );
    expect(rules.get(".settings-panel .setting-list")).toContain(
      "padding: 0 0 18px",
    );
    expect(rules.get(".settings-panel .setting-row")).toContain(
      "padding: 14px 20px",
    );
    expect(rules.get(".settings-subsection-heading")).toContain(
      "padding: 18px 20px 9px",
    );
    expect(rules.get(".managed-account-row")).toContain(
      "padding: 12px 20px",
    );
  });
});
