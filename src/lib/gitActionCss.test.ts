// @ts-expect-error Vitest runs in Node; the app typecheck intentionally omits Node types.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

declare const process: { cwd(): string };

const css = readFileSync(`${process.cwd()}/src/App.css`, "utf8");

function rule(selector: string) {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`Missing CSS rule: ${selector}`);
  const end = css.indexOf("}", start);
  return css.slice(start, end + 1);
}

describe("Git action repository selector styles", () => {
  it("keeps the inline selector unframed until hover or focus", () => {
    const selector = rule(".composer-select.git-action-repository-select");
    const chevron = rule(
      ".composer-select.git-action-repository-select .select-chevron",
    );
    const interactive = rule(
      ".composer-select.git-action-repository-select:hover:not(.disabled),\n.composer-select.git-action-repository-select:focus-within,\n.composer-select.git-action-repository-select.open",
    );

    expect(selector).toContain("border: 1px solid transparent");
    expect(selector).toContain("background: transparent");
    expect(selector).not.toContain("margin:");
    expect(chevron).toContain("opacity: 0");
    expect(interactive).toContain("border-color: var(--color-divider)");
    expect(interactive).toContain(
      "background: var(--color-component-background)",
    );
  });
});
