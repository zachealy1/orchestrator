import { describe, expect, it } from "vitest";
import postcss from "postcss";
import { readAppStyles } from "../test/readAppStyles";

const css = readAppStyles();

function rule(selector: string) {
  let source = "";
  postcss.parse(css).walkRules((candidate) => {
    if (candidate.selector === selector) source = candidate.toString();
  });
  if (!source) throw new Error(`Missing CSS rule: ${selector}`);
  return source;
}

describe("settings connection row styles", () => {
  it("uses the shared application hover color and accessible focus treatment", () => {
    const resting = rule("button.settings-connection-row");
    const interactive = rule(
      "button.settings-connection-row:hover:not(:disabled),\nbutton.settings-connection-row:focus-visible",
    );
    const focus = rule("button.settings-connection-row:focus-visible");
    const active = rule(
      "button.settings-connection-row:active:not(:disabled)",
    );

    expect(resting).toContain("background: transparent");
    expect(resting).toContain(
      "grid-template-columns: 34px minmax(0, 1fr) auto",
    );
    expect(resting).toContain("border-radius: 0");
    expect(interactive).toContain("background: var(--color-button-active)");
    expect(interactive).toContain("box-shadow: none");
    expect(interactive).toContain("transform: none");
    expect(focus).toContain("outline: 2px solid var(--color-primary)");
    expect(focus).toContain("outline-offset: -2px");
    expect(active).toContain("transform: none");
    expect(css).not.toContain("settings-manage-button");
  });
});
