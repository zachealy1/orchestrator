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

function nthRule(selector: string, occurrence: number) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matches = [...css.matchAll(new RegExp(`${escapedSelector}\\s*\\{[^}]*\\}`, "g"))];
  const match = matches[occurrence]?.[0];
  if (!match) throw new Error(`Missing CSS rule: ${selector}`);
  return match;
}

describe("composer active-run control CSS", () => {
  it("keeps the send control flat without a glow", () => {
    const sendControl = rule(".send-button");

    expect(sendControl).toContain("box-shadow: none");
    expect(sendControl.match(/transition:[\s\S]*?;/)?.[0]).not.toContain(
      "box-shadow",
    );
  });

  it("keeps the stop control flat while Codex is running", () => {
    const stopControl = rule(".send-button.stop");

    expect(stopControl).toContain("box-shadow: none");
    expect(stopControl.match(/transition:[\s\S]*?;/)?.[0]).not.toContain(
      "box-shadow",
    );
    expect(stopControl).not.toContain("animation:");
  });

  it("uses native textarea sizing with a declarative mirror fallback", () => {
    const promptField = rule(".prompt-field");
    const sharedPromptSizing = rule(
      ".prompt-autosize-mirror,\n.prompt-field textarea",
    );
    const fallbackPromptMirror = rule(".prompt-autosize-mirror");
    const fallbackPromptTextarea = nthRule(".prompt-field textarea", 1);
    const nativePromptMirror = nthRule(".prompt-autosize-mirror", 1);
    const nativePromptTextarea = nthRule(".prompt-field textarea", 2);

    expect(promptField).toContain("display: grid");
    expect(fallbackPromptMirror).toContain("visibility: hidden");
    expect(sharedPromptSizing).toContain("grid-area: 1 / 1");
    expect(fallbackPromptTextarea).toContain("height: 100%");
    expect(fallbackPromptTextarea).toContain("overflow-y: auto");
    expect(nativePromptMirror).toContain("display: none");
    expect(nativePromptTextarea).toContain("field-sizing: content");
    expect(nativePromptTextarea).toContain("height: auto");
    expect(nativePromptTextarea).not.toContain("transition:");
  });
});
