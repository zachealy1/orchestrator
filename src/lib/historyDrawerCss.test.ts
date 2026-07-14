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

describe("history drawer animation CSS", () => {
  it("uses one animated drawer width for workspace and composer geometry", () => {
    const workspace = rule(".codex-workspace");
    const workspaceBody = rule(".codex-workspace-body");
    const reservedBody = rule(".codex-workspace-body.history-space-reserved");
    const composer = rule(".composer-panel");
    const drawer = rule(".workspace-history-drawer");

    expect(css).toContain("@property --history-active-drawer-width");
    expect(css).toContain("@property --history-composer-max-width");
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
      "--history-composer-max-width var(--history-transition-duration)",
    );
    expect(reservedBody).toContain(
      "--history-active-drawer-width: var(--history-drawer-width)",
    );
    expect(composer).toContain(
      "max-width: var(--history-composer-max-width, 1040px)",
    );
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

  it("clips and insets the native scrollbar around the rounded chat corners", () => {
    const frame = rule(".task-chat-scroll-frame");
    expect(frame).toContain("overflow: hidden");
    expect(frame).toContain("border-radius: var(--radius)");
    expect(rule(".task-chat-transcript.native-transcript")).toContain(
      "--chat-scrollbar-corner-inset: 12px",
    );
    expect(rule(".task-chat-transcript.native-transcript")).toContain(
      "scroll-padding-block: var(--chat-scrollbar-corner-inset)",
    );
    expect(
      rule(".task-chat-transcript.native-transcript::-webkit-scrollbar-track"),
    ).toContain("margin-block: var(--chat-scrollbar-corner-inset)");
  });
});
