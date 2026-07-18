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

describe("native plan CSS", () => {
  it("uses the shared panel treatment", () => {
    const card = rule(".native-plan-card");

    expect(card).toContain("border: 1px solid var(--color-divider)");
    expect(card).toContain("border-radius: var(--radius)");
    expect(card).toContain("background: var(--color-component-background)");
    expect(card).not.toContain("color-mix");
  });

  it("clips only the preview and never creates nested plan scrolling", () => {
    const preview = rule(".native-plan-markdown.collapsed");
    const markdown = rule(".native-plan-markdown");
    const code = rule(".native-plan-markdown pre");
    const table = rule(".native-plan-markdown table");

    expect(preview).toContain("max-block-size: 320px");
    expect(preview).toContain("overflow: clip");
    expect(preview).not.toContain("overflow: auto");
    expect(markdown).not.toContain("overflow: auto");
    expect(code).toContain("white-space: pre-wrap");
    expect(code).toContain("overflow: visible");
    expect(table).toContain("table-layout: fixed");
  });
});
