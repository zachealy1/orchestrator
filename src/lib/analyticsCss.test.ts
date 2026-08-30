import postcss from "postcss";
import { describe, expect, it } from "vitest";
import { readAppStyles } from "../test/readAppStyles";

const css = readAppStyles();

describe("analytics dropdown styles", () => {
  it("uses neutral trigger states without a blue focus ring", () => {
    const root = postcss.parse(css);
    let workspaceTriggerState = "";
    let dateTriggerState = "";
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
        candidate.selector.includes(".analytics-date-select.open") &&
        candidate.selector.includes(".analytics-date-select:focus-within")
      ) {
        dateTriggerState = candidate.toString();
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
  });

  it("uses neutral selected-option indicators", () => {
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

    expect(workspaceSelection).toContain("border-color: var(--line-strong)");
    expect(workspaceSelection).toContain(
      "background: var(--color-surface-muted)",
    );
    expect(workspaceSelection).not.toContain("var(--color-primary)");
    expect(dateSelection).toContain("color: var(--color-icon-muted)");
    expect(dateSelection).not.toContain("var(--accent-2)");
  });
});
