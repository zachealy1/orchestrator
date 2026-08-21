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

  it("uses the timeline gap as the only outer spacing around streamed messages", () => {
    const timeline = rule(".stream-event-list");
    const firstMessageChild = rule(".stream-message > :first-child");
    const lastMessageChild = rule(".stream-message > :last-child");

    expect(timeline).toContain("gap: 18px");
    expect(firstMessageChild).toContain("margin-block-start: 0");
    expect(lastMessageChild).toContain("margin-block-end: 0");
  });

  it("uses normalized Markdown whitespace for live and completed responses", () => {
    const markdown = rule(".markdown-summary");
    const historicalPlain = rule(".historical-summary-plain");
    const error = rule(".run-summary.error");
    const muted = rule(".run-summary.muted");

    expect(markdown).toContain("white-space: normal");
    expect(markdown).toContain("gap: 18px");
    expect(historicalPlain).toContain("white-space: pre-wrap");
    expect(error).toContain("white-space: pre-wrap");
    expect(muted).toContain("white-space: pre-wrap");
  });
});
