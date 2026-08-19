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

describe("history drawer animation CSS", () => {
  it("uses one animated content width for transcript and composer geometry", () => {
    const workspace = rule(".codex-workspace");
    const workspaceBody = rule(".codex-workspace-body");
    const reservedBody = rule(".codex-workspace-body.history-space-reserved");
    const chatRun = rule(".task-chat-run");
    const composer = rule(".composer-panel");
    const drawer = rule(".workspace-history-drawer");

    expect(css).toContain("@property --history-active-drawer-width");
    expect(css).toContain("@property --history-chat-content-max-width");
    expect(workspace).toContain("container-type: inline-size");
    expect(workspaceBody).toContain("--history-transition-duration: 200ms");
    expect(workspaceBody).toContain(
      "--history-transition-easing: cubic-bezier(0.2, 0, 0, 1)",
    );
    expect(drawer).toContain(
      "transform var(--history-transition-duration) var(--history-transition-easing)",
    );
    expect(drawer).toContain(
      "opacity var(--history-transition-duration) var(--history-transition-easing)",
    );
    expect(workspaceBody).toContain(
      "grid-template-columns: minmax(0, 1fr) var(--history-active-drawer-width)",
    );
    expect(workspaceBody).toContain(
      "--history-active-drawer-width var(--history-transition-duration)",
    );
    expect(workspaceBody).toContain(
      "--history-chat-content-max-width var(--history-transition-duration)",
    );
    expect(reservedBody).toContain(
      "--history-active-drawer-width: var(--history-drawer-width)",
    );
    expect(chatRun).toContain(
      "max-width: var(--history-chat-content-max-width, 1040px)",
    );
    expect(composer).toContain(
      "max-width: var(--history-chat-content-max-width, 1040px)",
    );
    expect(chatRun).not.toContain("width: min(1040px, 100%)");
    expect(css).not.toContain("history-input-animating");
    expect(css).not.toContain("history-input-contracted");
  });

  it("keeps drawer motion transform-based with no independent composer animation", () => {
    const drawer = rule(".workspace-history-drawer");
    const composer = rule(".composer-panel");

    expect(drawer).toContain("position: absolute");
    expect(drawer.match(/transition:[\s\S]*?;/)?.[0]).not.toContain("width");
    expect(composer).not.toContain("transition:");
    expect(rule(".task-hero.has-chat .composer-panel")).not.toMatch(
      /\n\s+(?:max-)?width:/,
    );
  });

  it("avoids independently scaled paint layers while transcript width changes", () => {
    expect(rule(".task-hero")).toContain("contain: layout");
    expect(rule(".task-hero")).not.toContain("contain: layout paint");
    expect(rule(".task-chat-virtuoso-row")).toContain(
      "contain: layout style",
    );
    expect(rule(".task-chat-virtuoso-row")).not.toContain("paint");
  });

  it("clips and insets the virtualized scrollbar around the rounded chat corners", () => {
    const frame = rule(".task-chat-scroll-frame");
    expect(frame).toContain("overflow: hidden");
    expect(frame).toContain("border-radius: var(--radius)");
    expect(rule(".task-chat-transcript.virtuoso-transcript")).toContain(
      "--chat-scrollbar-corner-inset: 12px",
    );
    expect(rule(".task-chat-transcript.virtuoso-transcript")).toContain(
      "scroll-padding-block: var(--chat-scrollbar-corner-inset)",
    );
    expect(
      rule(".task-chat-transcript.virtuoso-transcript::-webkit-scrollbar-track"),
    ).toContain("margin-block: var(--chat-scrollbar-corner-inset)");
  });

  it("keeps the first transcript message clear of the workspace header", () => {
    const spacer = rule(".task-chat-transcript-top-spacer");

    expect(spacer).toContain("height: 16px");
    expect(spacer).toContain("min-height: 16px");
    expect(spacer).toContain("pointer-events: none");
  });

  it("uses the header notification color without resizing unread rows", () => {
    const indicators = rule(".history-run-indicators");
    const unreadDot = rule(".history-run-list span.history-run-unread-dot");

    expect(indicators).toContain("display: inline-flex");
    expect(indicators).toContain("flex: 0 0 auto");
    expect(unreadDot).toContain("width: 7px");
    expect(unreadDot).toContain("height: 7px");
    expect(unreadDot).toContain("background: var(--color-primary)");
  });

  it("balances completed-response spacing above and below the review card", () => {
    const chatLayout = rule(".task-hero.has-chat");
    const composer = rule(".task-hero.has-chat .composer-panel");
    const response = rule(".run-output-surface");
    const row = rule(".task-chat-virtuoso-row");
    const spacer = rule(".task-chat-transcript-bottom-spacer");

    expect(chatLayout).toContain("--task-chat-section-gap: 18px");
    expect(response).toContain("gap: var(--task-chat-section-gap, 18px)");
    expect(row).toContain("var(--task-chat-section-gap, 18px)");
    expect(composer).toContain("margin-top: calc(-1 * var(--radius))");
    expect(spacer).toContain("height: var(--radius)");
    expect(spacer).toContain("min-height: var(--radius)");
  });
});
