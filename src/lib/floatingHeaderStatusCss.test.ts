// @ts-expect-error Vitest runs in Node; the app typecheck intentionally omits Node types.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

declare const process: { cwd(): string };

const css = readFileSync(`${process.cwd()}/src/App.css`, "utf8");

function rule(selector: string) {
  const exactStart = css.indexOf(`\n${selector} {`);
  const selectorStart = exactStart >= 0 ? exactStart + 1 : css.indexOf(selector);
  if (selectorStart < 0) throw new Error(`Missing CSS rule: ${selector}`);
  const blockStart = css.indexOf("{", selectorStart);
  const blockEnd = css.indexOf("}", blockStart);
  return css.slice(selectorStart, blockEnd + 1);
}

describe("floating header status CSS", () => {
  it("floats below the header without affecting task layout", () => {
    const bubble = rule(".floating-header-status-bubble");

    expect(bubble).toContain("position: absolute");
    expect(bubble).toContain("top: 12px");
    expect(bubble).toContain(
      "max-width: var(--history-chat-content-max-width, 1040px)",
    );
    expect(bubble).toContain("border: 1px solid var(--color-divider)");
    expect(bubble).toContain("border-radius: var(--radius)");
  });

  it("uses an opacity-only entrance and exit transition", () => {
    const bubble = rule(".floating-header-status-bubble");
    const hiddenBubble = rule(
      '.floating-header-status-bubble[data-visible="false"]',
    );

    expect(bubble).toContain("transition: opacity 160ms ease");
    expect(hiddenBubble).toContain("opacity: 0");
    expect(hiddenBubble).toContain("pointer-events: none");
  });
});
