import postcss from "postcss";
import { describe, expect, it } from "vitest";
import { readAppStyles } from "../test/readAppStyles";

const css = readAppStyles();

describe("analytics dropdown styles", () => {
  it("uses neutral trigger states without a blue focus ring", () => {
    const root = postcss.parse(css);
    let workspaceTriggerState = "";
    let workspaceTriggerHover = "";
    let dateTriggerState = "";
    let dateTriggerHover = "";
    let dateButtonState = "";

    root.walkRules((candidate) => {
      if (
        candidate.selector.includes("button.analytics-filter-trigger:focus-visible") &&
        candidate.selector.includes(
          ".analytics-workspace-filter.open button.analytics-filter-trigger",
        )
      ) {
        workspaceTriggerState = candidate.toString();
      }
      if (
        candidate.selector ===
        "button.analytics-filter-trigger:hover:not(:disabled)"
      ) {
        workspaceTriggerHover = candidate.toString();
      }
      if (
        candidate.selector.includes(".analytics-date-select.open") &&
        candidate.selector.includes(".analytics-date-select:focus-within")
      ) {
        dateTriggerState = candidate.toString();
      }
      if (
        candidate.selector === ".analytics-date-select:hover:not(.disabled)"
      ) {
        dateTriggerHover = candidate.toString();
      }
      if (
        candidate.selector.includes(
          ".analytics-date-select button.composer-select-trigger:active",
        ) &&
        candidate.selector.includes(
          ".analytics-date-select.open button.composer-select-trigger",
        )
      ) {
        dateButtonState = candidate.toString();
      }
    });

    for (const rule of [workspaceTriggerState, dateTriggerState]) {
      expect(rule).toContain("background: var(--color-component-background)");
      expect(rule).toContain("box-shadow: none");
      expect(rule).not.toContain("var(--dropdown-focus-ring)");
      expect(rule).not.toContain("var(--color-button-active)");
    }
    expect(dateButtonState).toContain("background: transparent");
    expect(dateButtonState).toContain("box-shadow: none");
    expect(dateButtonState).not.toContain("var(--color-button-active)");
    for (const rule of [workspaceTriggerHover, dateTriggerHover]) {
      expect(rule).toContain("background: var(--color-button-active)");
      expect(rule).toContain("box-shadow: none");
      expect(rule).not.toContain("var(--dropdown-focus-ring)");
    }
  });

  it("uses blue selected-option indicators", () => {
    const root = postcss.parse(css);
    let workspaceSelection = "";
    let dateSelection = "";

    root.walkRules((candidate) => {
      if (
        candidate.selector ===
        '.analytics-workspace-menu > button[aria-checked="true"] .analytics-filter-check'
      ) {
        workspaceSelection = candidate.toString();
      }
      if (
        candidate.selector ===
        '.analytics-date-menu button.composer-select-option[aria-selected="true"] > svg'
      ) {
        dateSelection = candidate.toString();
      }
    });

    expect(workspaceSelection).toContain(
      "border-color: var(--color-primary)",
    );
    expect(workspaceSelection).toContain("background: var(--color-primary)");
    expect(workspaceSelection).toContain(
      "color: var(--color-button-primary-text)",
    );
    expect(dateSelection).toContain("color: var(--accent-2)");
  });

  it("keeps usage-account options the same width as their trigger", () => {
    const root = postcss.parse(css);
    let usageAccountMenu = "";

    root.walkRules((candidate) => {
      if (candidate.selector === ".analytics-usage-account-menu") {
        usageAccountMenu = candidate.toString();
      }
    });

    expect(usageAccountMenu).toContain("min-width: 0");
    expect(usageAccountMenu).not.toContain("320px");
  });
});
