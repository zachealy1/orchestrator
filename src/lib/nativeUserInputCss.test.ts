// @ts-expect-error Vitest runs in Node; the app typecheck intentionally omits Node types.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

declare const process: { cwd(): string };

const css = readFileSync(`${process.cwd()}/src/App.css`, "utf8");

function rule(selector: string) {
  const selectorStart = css.indexOf(selector);
  if (selectorStart < 0) throw new Error(`Missing CSS rule: ${selector}`);
  const blockStart = css.indexOf("{", selectorStart);
  const blockEnd = css.indexOf("}", blockStart);
  return css.slice(selectorStart, blockEnd + 1);
}

describe("native user input CSS", () => {
  it("uses the shared secondary button surface for selected answers", () => {
    const selected = rule(
      ".native-user-input-options > .native-user-input-option.selected",
    );

    expect(selected).toContain("background: var(--color-button-secondary)");
    expect(selected).not.toContain("var(--color-button-active)");
    expect(selected).not.toContain("var(--color-primary)");
  });
});
