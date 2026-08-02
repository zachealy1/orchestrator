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

  it("centers a text-only disclosure and aligns shared plan actions", () => {
    const disclosure = rule("button.native-plan-disclosure");
    const disclosureHover = rule(
      "button.native-plan-disclosure:hover:not(:disabled),",
    );
    const actions = rule(".native-plan-actions");

    expect(disclosure).toContain("justify-self: center");
    expect(disclosure).toContain("background: transparent");
    expect(disclosure).toContain("color: var(--color-text-secondary)");
    expect(disclosureHover).toContain("background: transparent");
    expect(disclosureHover).toContain("color: var(--color-text)");
    expect(actions).toContain("align-items: center");
  });

  it("separates nested plan blocks without overflow-prone padding", () => {
    const markdown = rule(".native-plan-markdown");
    const nestedBlocks = rule(
      ".native-plan-markdown.markdown-summary li > :where(p, ul, ol, blockquote, pre) +",
    );

    expect(markdown).toContain("line-height: 1.55");
    expect(nestedBlocks).toContain("margin-top: 14px");
    expect(nestedBlocks).toContain("padding-top: 0");
  });

  it("keeps revision focus neutral and uses borderless icon tooltips", () => {
    const revisionFocus = rule(".native-plan-revision textarea:focus,");
    const icon = rule("button.native-plan-icon-action");
    const tooltip = rule(
      "button.native-plan-icon-action[data-tooltip]::after",
    );
    const editedFilesTooltip = rule(
      "button.edited-files-action[data-tooltip]::after",
    );

    expect(revisionFocus).toContain("border-color: var(--color-divider)");
    expect(revisionFocus).toContain("box-shadow: none");
    expect(revisionFocus).not.toContain("var(--color-primary)");
    expect(icon).toContain("width: 30px");
    expect(icon).toContain("height: 30px");
    expect(icon).toContain("border: 0");
    expect(tooltip).toContain("border: 0");
    expect(tooltip).toContain("content: attr(data-tooltip)");
    expect(editedFilesTooltip).toContain("top: calc(100% + 8px)");
    expect(editedFilesTooltip).toContain("bottom: auto");
  });
});
