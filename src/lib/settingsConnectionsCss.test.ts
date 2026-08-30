import postcss from "postcss";
import { describe, expect, it } from "vitest";
import { readAppStyles } from "../test/readAppStyles";

const css = readAppStyles();

describe("settings connection styles", () => {
  it("anchors Computer Use remediation to a labeled status popover", () => {
    const root = postcss.parse(css);
    let triggerRule = "";
    let triggerInteractionRule = "";
    let panelRule = "";
    let actionRule = "";
    let permissionRule = "";
    let unverifiedPermissionRule = "";
    let actionInteractionRule = "";
    let interactionColorRule = "";

    root.walkRules((candidate) => {
      if (candidate.selector === "button.settings-status-popover-trigger") {
        triggerRule = candidate.toString();
      }
      if (
        candidate.selector.includes(
          "button.settings-status-popover-trigger:hover",
        ) &&
        candidate.selector.includes(
          "button.settings-status-popover-trigger[aria-expanded=\"true\"]",
        )
      ) {
        triggerInteractionRule = candidate.toString();
      }
      if (candidate.selector === ".settings-status-popover-panel") {
        panelRule = candidate.toString();
      }
      if (candidate.selector === "button.settings-status-popover-action") {
        actionRule = candidate.toString();
      }
      if (candidate.selector === "button.settings-status-popover-permission") {
        permissionRule = candidate.toString();
      }
      if (
        candidate.selector.includes(
          ".settings-status-popover-permission-state.unverified",
        ) &&
        candidate.selector.includes(
          ".settings-status-popover-permission-state-dot",
        )
      ) {
        unverifiedPermissionRule = candidate.toString();
      }
      if (
        candidate.selector.includes(
          "button.settings-status-popover-action:hover",
        ) &&
        candidate.selector.includes(
          "button.settings-status-popover-action:focus-visible",
        )
      ) {
        actionInteractionRule = candidate.toString();
      }
      if (
        candidate.selector.includes("settings-status-popover") &&
        (candidate.selector.includes(":hover") ||
          candidate.selector.includes(":focus-visible")) &&
        candidate.nodes.some(
          (node) => node.type === "decl" && node.prop === "color",
        )
      ) {
        interactionColorRule = candidate.toString();
      }
    });

    expect(triggerRule).not.toContain("width: 36px");
    expect(triggerRule).not.toContain("height: 36px");
    expect(triggerRule).not.toContain("place-items: center");
    expect(triggerInteractionRule).toContain(
      "background: var(--color-button-active)",
    );
    expect(triggerInteractionRule).not.toContain("color:");

    expect(panelRule).toContain("position: absolute");
    expect(panelRule).toContain("right: 0");
    expect(panelRule).toContain("border: 0");
    expect(panelRule).toContain("border-radius: 8px");
    expect(panelRule).toContain("background: var(--color-background)");
    expect(panelRule).toContain("box-shadow: 0 18px 48px");

    expect(actionRule).toContain("border-radius: 6px");
    expect(actionRule).toContain("background: transparent");
    expect(permissionRule).toContain(
      "grid-template-columns: 20px minmax(0, 1fr) auto 16px",
    );
    expect(permissionRule).toContain("min-height: 44px");
    expect(permissionRule).toContain("border-radius: 6px");
    expect(unverifiedPermissionRule).toContain(
      "background: var(--color-icon-muted)",
    );
    expect(actionInteractionRule).toContain(
      "background: var(--color-button-active)",
    );
    expect(interactionColorRule).toBe("");
  });

  it("keeps status-card icons distinct from the shared hover highlight", () => {
    const root = postcss.parse(css);
    let interactionRule = "";
    let iconRule = "";
    let interactiveIconRule = "";

    root.walkRules((candidate) => {
      if (
        candidate.selector.includes("button.settings-status-card:hover") &&
        candidate.selector.includes("button.settings-status-card:focus-visible")
      ) {
        interactionRule = candidate.toString();
      }
      if (candidate.selector === ".settings-status-card-icon") {
        iconRule = candidate.toString();
      }
      if (
        candidate.selector.includes("settings-status-card") &&
        candidate.selector.includes("settings-status-card-icon") &&
        (candidate.selector.includes(":hover") ||
          candidate.selector.includes(":focus-visible"))
      ) {
        interactiveIconRule = candidate.toString();
      }
    });

    expect(interactionRule).toContain("background: var(--color-button-active)");
    expect(iconRule).toContain("background: var(--color-surface-soft)");
    expect(iconRule).toContain("color: var(--color-icon)");
    expect(interactiveIconRule).toBe("");
  });

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

    expect(rules.get(".settings-overview-rows")).toContain("padding: 0");
    expect(rules.get(".settings-overview-rows")).not.toContain("18px");
    expect(rules.get(".settings-overview-row")).toContain(
      "padding: var(--settings-option-padding-block)\n    var(--settings-option-padding-inline)",
    );
    expect(rules.get(".settings-panel .setting-list")).toContain("padding: 0");
    expect(rules.get(".settings-panel .setting-list")).not.toContain("18px");
    expect(rules.get(".settings-panel .setting-row")).toContain(
      "padding: var(--settings-option-padding-block)\n    var(--settings-option-padding-inline)",
    );
    expect(rules.get(".settings-subsection-heading")).toContain(
      "padding: var(--settings-option-padding-block)\n    var(--settings-option-padding-inline)",
    );
    expect(rules.get(".managed-account-row")).toContain(
      "padding: 8px var(--settings-option-padding-inline)",
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
      ".settings-subsection-heading",
      ".settings-subsection-heading > div",
      ".codex-accounts-heading",
      ".account-management",
      ".account-management > .muted",
      ".managed-account-row",
      ".managed-account-row > .account-mini-avatar",
      ".managed-account-row > div:nth-child(2)",
      ".managed-account-row > .button-row",
      ".managed-account-row input",
      ".managed-account-row > div:nth-child(2) > span",
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
      ".settings-subsection-heading",
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

    expect(rules.get(".managed-account-row")).toContain("min-height: 60px");
    expect(rules.get(".managed-account-row")).toContain(
      "gap: var(--settings-option-column-gap)",
    );
    expect(rules.get(".managed-account-row")).toContain(
      "padding: 8px var(--settings-option-padding-inline)",
    );

    for (const selector of [
      ".settings-overview-row > div:nth-child(2)",
      ".settings-panel .setting-row > div",
      ".settings-subsection-heading > div",
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

    expect(rules.get(".codex-accounts-heading")).toContain("border-bottom: 0");
    expect(rules.get(".account-management")).toContain(
      "margin: 0 var(--settings-option-padding-inline)\n    var(--settings-option-padding-inline)",
    );
    expect(rules.get(".account-management")).toContain(
      "border: 1px solid var(--color-divider)",
    );
    expect(rules.get(".account-management")).toContain("border-radius: 6px");
    expect(rules.get(".account-management")).not.toContain("padding:");
    expect(rules.get(".account-management > .muted")).toContain(
      "min-height: var(--settings-option-min-height)",
    );
    expect(rules.get(".managed-account-row input")).toContain(
      "border: 1px solid transparent",
    );
    expect(rules.get(".managed-account-row input")).toContain(
      "padding: 2px 6px",
    );
    expect(rules.get(".managed-account-row input")).toContain(
      "font-size: 0.9rem",
    );
    expect(rules.get(".managed-account-row")).toContain(
      "grid-template-columns: 40px minmax(0, 1fr) auto",
    );
    expect(rules.get(".managed-account-row > .account-mini-avatar")).toContain(
      "width: 40px",
    );
    expect(rules.get(".managed-account-row > .account-mini-avatar")).toContain(
      "height: 40px",
    );
    expect(rules.get(".managed-account-row > .account-mini-avatar")).toContain(
      "font-size: 0.95rem",
    );
    expect(
      rules.get(".managed-account-row > div:nth-child(2) > span"),
    ).toContain("font-size: 0.78rem");
    expect(
      rules.get(".managed-account-row > div:nth-child(2) > span"),
    ).toContain("padding-inline: 7px");
    expect(rules.get(".managed-account-row > div:nth-child(2)")).toContain(
      "align-content: center",
    );
    expect(rules.get(".managed-account-row > div:nth-child(2)")).toContain(
      "align-self: stretch",
    );
    expect(rules.get(".managed-account-row > div:nth-child(2)")).toContain(
      "row-gap: 0",
    );
  });

  it("matches the Accounts heading typography to standard settings options", () => {
    const root = postcss.parse(css);
    const rules = new Map<string, string>();
    const selectors = new Set([
      ".settings-overview-row strong",
      ".settings-overview-row > div:nth-child(2) > span",
      ".codex-accounts-heading strong",
      ".codex-accounts-heading span",
    ]);

    root.walkRules((candidate) => {
      if (selectors.has(candidate.selector)) {
        rules.set(candidate.selector, candidate.toString());
      }
    });

    expect(rules.get(".codex-accounts-heading strong")).toContain(
      "font-size: 0.9rem",
    );
    expect(rules.get(".settings-overview-row strong")).toContain(
      "font-size: 0.9rem",
    );
    expect(rules.get(".codex-accounts-heading span")).toContain(
      "font-size: 0.78rem",
    );
    expect(
      rules.get(".settings-overview-row > div:nth-child(2) > span"),
    ).toContain("font-size: 0.78rem");
  });

  it("keeps managed account label focus neutral", () => {
    const root = postcss.parse(css);
    let focusRule = "";

    root.walkRules((candidate) => {
      if (
        candidate.selector.includes(".managed-account-row input:focus") &&
        candidate.selector.includes(
          ".managed-account-row input:focus-visible",
        )
      ) {
        focusRule = candidate.toString();
      }
    });

    expect(focusRule).toContain("border-color: var(--line)");
    expect(focusRule).toContain("background: var(--panel)");
    expect(focusRule).toContain("box-shadow: none");
    expect(focusRule).toContain("outline: none");
    expect(focusRule).not.toContain("var(--color-primary)");
    expect(focusRule).not.toContain("var(--primary-rgb)");
  });

  it("isolates settings layout and avoids scroll-time shadow and hover repaints", () => {
    const root = postcss.parse(css);
    const rules = new Map<string, string>();
    const selectors = new Set([
      ".settings-overview-panel",
      ".settings-panel",
      "button.settings-connection-row",
      "button.settings-navigation-row",
    ]);

    root.walkRules((candidate) => {
      if (selectors.has(candidate.selector)) {
        rules.set(candidate.selector, candidate.toString());
      }
    });

    for (const selector of [".settings-overview-panel", ".settings-panel"]) {
      expect(rules.get(selector)).toContain("contain: layout style");
      expect(rules.get(selector)).toContain("box-shadow: none");
    }
    for (const selector of [
      "button.settings-connection-row",
      "button.settings-navigation-row",
    ]) {
      expect(rules.get(selector)).toContain("transition: none");
      expect(rules.get(selector)).toContain("transform: none");
    }
  });

  it("floats Browser action feedback with the shared status-banner treatment", () => {
    const root = postcss.parse(css);
    const rules = new Map<string, string>();
    const selectors = new Set([
      ".settings-screen-status-anchor",
      ".settings-screen-status-anchor .floating-header-status-bubble",
      ".browser-data-clear-dialog",
    ]);

    root.walkRules((candidate) => {
      if (selectors.has(candidate.selector)) {
        rules.set(candidate.selector, candidate.toString());
      }
    });

    const anchor = rules.get(".settings-screen-status-anchor");
    expect(anchor).toContain("position: fixed");
    expect(anchor).toContain("top: 0");
    expect(anchor).toContain("left: calc(var(--app-rail-width) + 22px)");
    expect(anchor).toContain("right: 22px");
    const banner = rules.get(
      ".settings-screen-status-anchor .floating-header-status-bubble",
    );
    expect(banner).toContain("width: min(760px, calc(100% - 64px))");
    expect(banner).toContain("pointer-events: auto");
    expect(banner).toContain("transform: translateX(-50%)");
    expect(css).not.toContain(".settings-action-banner");
    expect(rules.get(".browser-data-clear-dialog")).toContain(
      "width: min(460px, 100%)",
    );
  });
});
