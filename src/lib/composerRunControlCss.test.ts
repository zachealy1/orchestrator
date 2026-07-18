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

function lastRule(selector: string) {
  const selectorStart = css.lastIndexOf(`\n${selector} {`);
  if (selectorStart < 0) throw new Error(`Missing CSS rule: ${selector}`);
  const blockStart = css.indexOf("{", selectorStart);
  const blockEnd = css.indexOf("}", blockStart);
  return css.slice(selectorStart + 1, blockEnd + 1);
}

describe("composer active-run control CSS", () => {
  it("keeps the stop control flat while Codex is running", () => {
    const stopControl = rule(".send-button.stop");

    expect(stopControl).toContain("box-shadow: none");
    expect(stopControl.match(/transition:[\s\S]*?;/)?.[0]).not.toContain(
      "box-shadow",
    );
    expect(stopControl).not.toContain("animation:");
  });

  it("uses declarative mirrored textarea sizing without a height transition", () => {
    const promptField = rule(".prompt-field");
    const sharedPromptSizing = rule(
      ".prompt-autosize-mirror,\n.prompt-field textarea",
    );
    const promptMirror = lastRule(".prompt-autosize-mirror");
    const promptTextarea = lastRule(".prompt-field textarea");

    expect(promptField).toContain("display: grid");
    expect(promptMirror).toContain("visibility: hidden");
    expect(sharedPromptSizing).toContain("grid-area: 1 / 1");
    expect(promptTextarea).toContain("height: 100%");
    expect(promptTextarea).toContain("overflow-y: auto");
    expect(promptTextarea).not.toContain("field-sizing:");
    expect(promptTextarea).not.toContain("transition:");
  });
});
