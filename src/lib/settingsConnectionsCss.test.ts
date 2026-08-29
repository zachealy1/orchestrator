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
      "padding: var(--settings-option-padding-block)\n    var(--settings-option-padding-inline)",
    );
    expect(rules.get(".settings-panel .setting-list")).toContain(
      "padding: 0 0 18px",
    );
    expect(rules.get(".settings-panel .setting-row")).toContain(
      "padding: var(--settings-option-padding-block)\n    var(--settings-option-padding-inline)",
    );
    expect(rules.get(".settings-subsection-heading")).toContain(
      "padding: 18px 20px 9px",
    );
    expect(rules.get(".managed-account-row")).toContain(
      "padding: var(--settings-option-padding-block)\n    var(--settings-option-padding-inline)",
    );
  });

  it("uses one spacing contract for every settings option row", () => {
    const root = postcss.parse(css);
    const rules = new Map<string, string>();
    const selectors = new Set([
      ".settings-grid",
      ".settings-overview-row",
      ".settings-overview-row > div:nth-child(2)",
      ".settings-panel .setting-row",
      ".settings-panel .setting-row > div",
      ".settings-panel .setting-row > .button-row",
      ".account-management",
      ".account-management > .muted",
      ".account-management > button.secondary",
      ".managed-account-row",
      ".managed-account-row > div:nth-child(2)",
      ".managed-account-row > .button-row",
    ]);

    root.walkRules((candidate) => {
      if (selectors.has(candidate.selector)) {
        rules.set(candidate.selector, candidate.toString());
      }
    });

    const contract = rules.get(".settings-grid");
    expect(contract).toContain("--settings-option-min-height: 72px");
    expect(contract).toContain("--settings-option-padding-block: 14px");
    expect(contract).toContain("--settings-option-padding-inline: 20px");
    expect(contract).toContain("--settings-option-column-gap: 12px");
    expect(contract).toContain("--settings-option-copy-gap: 4px");
    expect(contract).toContain("--settings-option-action-gap: 8px");

    for (const selector of [
      ".settings-overview-row",
      ".settings-panel .setting-row",
      ".managed-account-row",
    ]) {
      expect(rules.get(selector)).toContain(
        "min-height: var(--settings-option-min-height)",
      );
      expect(rules.get(selector)).toContain(
        "gap: var(--settings-option-column-gap)",
      );
      expect(rules.get(selector)).toContain(
        "padding: var(--settings-option-padding-block)\n    var(--settings-option-padding-inline)",
      );
    }

    for (const selector of [
      ".settings-overview-row > div:nth-child(2)",
      ".settings-panel .setting-row > div",
      ".managed-account-row > div:nth-child(2)",
    ]) {
      expect(rules.get(selector)).toContain(
        "gap: var(--settings-option-copy-gap)",
      );
    }

    for (const selector of [
      ".settings-panel .setting-row > .button-row",
      ".managed-account-row > .button-row",
    ]) {
      expect(rules.get(selector)).toContain(
        "gap: var(--settings-option-action-gap)",
      );
    }

    expect(rules.get(".account-management")).toContain(
      "padding: 0 0 var(--settings-option-padding-block)",
    );
    expect(rules.get(".account-management > .muted")).toContain(
      "min-height: var(--settings-option-min-height)",
    );
    expect(rules.get(".account-management > button.secondary")).toContain(
      "margin: var(--settings-option-padding-block)\n    var(--settings-option-padding-inline) 0",
    );
  });
});
