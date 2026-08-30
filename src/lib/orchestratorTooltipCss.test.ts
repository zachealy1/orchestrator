import { describe, expect, it } from "vitest";
import { readAppStyles } from "../test/readAppStyles";

const css = readAppStyles();

function rule(selector: string) {
  const exactStart = css.indexOf(`\n${selector} {`);
  const selectorStart = exactStart >= 0 ? exactStart + 1 : css.indexOf(selector);
  if (selectorStart < 0) throw new Error(`Missing CSS rule: ${selector}`);
  const blockStart = css.indexOf("{", selectorStart);
  const blockEnd = css.indexOf("}", blockStart);
  return css.slice(selectorStart, blockEnd + 1);
}

describe("Orchestrator tooltip styling", () => {
  it("matches the shared floating tooltip design and motion", () => {
    const tooltip = rule(".orchestrator-tooltip");
    const below = rule('.orchestrator-tooltip[data-placement="below"]');
    const visible = rule('.orchestrator-tooltip[data-visible="true"]');

    expect(tooltip).toContain("position: fixed");
    expect(tooltip).toContain("z-index: 1300");
    expect(tooltip).toContain("border-radius: 8px");
    expect(tooltip).toContain(
      "background: var(--color-component-background)",
    );
    expect(tooltip).toContain("color: var(--color-text)");
    expect(tooltip).toContain("font-size: 0.82rem");
    expect(tooltip).toContain("padding: 9px 12px");
    expect(tooltip).toContain("pointer-events: none");
    expect(tooltip).toContain("transform: translateY(4px)");
    expect(tooltip).toContain("opacity 120ms ease");
    expect(below).toContain("transform: translateY(-4px)");
    expect(visible).toContain("opacity: 1");
    expect(visible).toContain("transform: translateY(0)");
  });

  it("does not retain button-specific tooltip pseudo-elements", () => {
    expect(css).not.toContain(
      "button.native-plan-icon-action[data-tooltip]::after",
    );
    expect(css).not.toContain(
      "button.edited-files-action[data-tooltip]::after",
    );
    expect(css).not.toContain(".approval-choice::after");
    expect(css).not.toContain(".prompt-queue-portal-tooltip");
  });
});
