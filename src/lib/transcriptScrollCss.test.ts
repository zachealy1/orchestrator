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

describe("high-speed transcript scrolling CSS", () => {
  it("keeps prepared rows as the only visible fast-scroll content", () => {
    const transcript = rule(".task-chat-transcript.virtuoso-transcript");
    const realRow = rule(".task-chat-virtuoso-row");

    expect(css).not.toContain("task-chat-scroll-seek");
    expect(css).not.toContain(
      ".task-chat-transcript.virtuoso-transcript.is-scroll-active",
    );
    expect(transcript).toContain("overflow-anchor: none");
    expect(transcript).toContain("-webkit-overflow-scrolling: touch");
    expect(realRow).toContain("background: var(--color-background)");
  });
});
