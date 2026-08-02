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

describe("plan progress CSS", () => {
  it("uses one compact, vertically centered row system for Goal, Step, and Queue", () => {
    const stack = rule(".composer-status-stack");
    const progressRow = rule(".composer-strip-row");
    const progressContent = rule(".composer-strip-content");
    const primary = rule(".composer-strip-primary");
    const end = rule(".composer-strip-end");

    expect(stack).toContain("--composer-strip-row-height: 39px");
    expect(stack).toContain("--composer-strip-row-padding: 4px 8px");
    expect(stack).toContain("--composer-strip-gap: 8px");
    expect(progressRow).toContain(
      "height: var(--composer-strip-row-height)",
    );
    expect(progressRow).toContain(
      "min-height: var(--composer-strip-row-height)",
    );
    expect(progressRow).toContain("display: flex");
    expect(progressRow).toContain("align-items: center");
    expect(progressRow).toContain("padding: var(--composer-strip-row-padding)");
    expect(progressContent).toContain("display: grid");
    expect(progressContent).toContain("minmax(0, 1fr)");
    expect(progressContent).toContain("gap: var(--composer-strip-gap)");
    expect(progressContent).toContain("justify-content: stretch");
    expect(primary).toContain("display: flex");
    expect(primary).toContain("min-width: 0");
    expect(primary).toContain("text-align: left");
    expect(end).toContain("justify-self: end");
  });

  it("uses shared typography and truncation rules across strip rows", () => {
    const title = rule(".composer-strip-title");
    const meta = rule(".composer-strip-meta");
    const description = rule(".composer-strip-description");
    const state = rule(".composer-strip-state");

    expect(title).toContain("font-size: 0.78rem");
    expect(title).toContain("font-weight: 700");
    expect(meta).toContain("font-size: 0.72rem");
    expect(meta).toContain("font-weight: 400");
    expect(description).toContain("font-size: 0.76rem");
    expect(description).toContain("font-weight: 400");
    expect(description).toContain("text-overflow: ellipsis");
    expect(description).toContain("white-space: nowrap");
    expect(state).toContain("font-size: 0.72rem");
    expect(state).toContain("font-weight: 650");
    expect(state).toContain("text-overflow: ellipsis");
    expect(css).not.toContain(
      ".composer-strip-content-button:focus-visible .composer-strip-description",
    );
  });

  it("uses shared icon, control, status-tone, and narrow-layout rules", () => {
    const stack = rule(".composer-status-stack");
    const icon = rule(".composer-strip-icon");
    const controls = rule("button.native-plan-icon-action");

    expect(stack).toContain("--composer-strip-icon-size: 15px");
    expect(stack).toContain("--composer-strip-control-size: 30px");
    expect(icon).toContain("width: var(--composer-strip-icon-size)");
    expect(icon).toContain("height: var(--composer-strip-icon-size)");
    expect(controls).toContain("width: 30px");
    expect(controls).toContain("height: 30px");
    expect(css).toContain(
      '.composer-strip-row[data-tone="attention"] .composer-strip-state',
    );
    expect(css).toContain(
      '.composer-strip-row[data-tone="danger"] .composer-strip-state',
    );
    expect(css).not.toMatch(
      /@container composer-strip \(max-width: 720px\)[\s\S]*?\.composer-strip-description \{\s*display: none;/,
    );
    expect(css).not.toMatch(
      /@container composer-strip \(max-width: 720px\)[\s\S]*?--composer-strip-row-padding:/,
    );
    expect(css).not.toMatch(
      /@container composer-strip \(max-width: 720px\)[\s\S]*?--composer-strip-gap:/,
    );
  });

  it("uses only the filled track without an active progress marker", () => {
    expect(css).not.toContain(".plan-progress-marker");
    expect(css).not.toContain("@keyframes plan-progress-pulse");
  });

  it("uses the shared borderless tooltip treatment", () => {
    const tooltip = rule(".plan-progress-tooltip");

    expect(tooltip).toContain("border: 0");
    expect(tooltip).toContain("border-radius: 7px");
    expect(tooltip).toContain(
      "background: var(--color-component-background)",
    );
    expect(tooltip).toContain(
      "box-shadow: 0 12px 32px rgb(var(--shadow-rgb) / 0.24)",
    );
  });
});
