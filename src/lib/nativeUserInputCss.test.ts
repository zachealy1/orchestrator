import { readAppStyles } from "../test/readAppStyles";
import { describe, expect, it } from "vitest";


const css = readAppStyles();

function rule(selector: string) {
  const exactStart = css.indexOf(`\n${selector} {`);
  const selectorStart = exactStart >= 0 ? exactStart + 1 : css.indexOf(selector);
  if (selectorStart < 0) throw new Error(`Missing CSS rule: ${selector}`);
  const blockStart = css.indexOf("{", selectorStart);
  const blockEnd = css.indexOf("}", blockStart);
  return css.slice(selectorStart, blockEnd + 1);
}

describe("native user input CSS", () => {
  it("uses the shared composer-button surface for selected answers", () => {
    const selected = rule(
      ".native-user-input-options > .native-user-input-option.selected",
    );

    expect(selected).toContain("background: var(--color-component-background)");
    expect(selected).not.toContain("var(--color-button-active)");
    expect(selected).not.toContain("var(--color-primary)");
  });

  it("uses one regular-weight visual contract for every answer", () => {
    const label = rule(".native-user-input-option-label");
    const other = rule(".native-user-input-other");
    const indicator = rule(".native-user-input-radio");
    const selectedIndicator = rule(
      ".native-user-input-option.selected .native-user-input-radio",
    );
    const selectedDot = rule(
      ".native-user-input-option.selected .native-user-input-radio::after",
    );

    expect(label).toContain("font-weight: 400");
    expect(other).toContain("font-weight: 400");
    expect(other).toContain("padding: 2px 0 0");
    expect(indicator).toContain("width: 13px");
    expect(indicator).toContain("height: 13px");
    expect(indicator).toContain("border: 2px solid var(--color-icon-muted)");
    expect(indicator).toContain(
      "background: var(--color-component-background)",
    );
    expect(selectedIndicator).toContain("border-color: var(--color-icon-muted)");
    expect(selectedDot).toContain("background: var(--color-icon-muted)");
    expect(selectedIndicator).not.toContain("var(--color-primary)");
    expect(selectedDot).not.toContain("var(--color-primary)");
  });

  it("keeps the native radio focus target within its visible option", () => {
    const control = rule(".native-user-input-control");

    expect(control).toContain("position: absolute");
    expect(control).toContain("inset: 0");
    expect(control).toContain("width: 100%");
    expect(control).toContain("height: 100%");
    expect(control).toContain("opacity: 0");
  });

  it("anchors a borderless primary interaction navigator in the card header", () => {
    const position = rule(
      ".native-user-input > .pending-interaction-navigator",
    );
    const button = rule("button.pending-interaction-nav");
    const hover = rule(
      "button.pending-interaction-nav:hover:not(:disabled),\nbutton.pending-interaction-nav:focus-visible",
    );

    expect(position).toContain("position: absolute");
    expect(position).toContain("top: 12px");
    expect(position).toContain("right: 12px");
    expect(button).toContain("border: 0");
    expect(button).toContain("background: transparent");
    expect(button).toContain("color: var(--color-primary)");
    expect(hover).toContain("background: var(--color-button-active)");
    expect(hover).not.toContain("color:");
  });
});
