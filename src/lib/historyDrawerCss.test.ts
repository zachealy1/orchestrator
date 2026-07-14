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

describe("history drawer animation CSS", () => {
  it("uses one duration and easing source for the drawer and composer", () => {
    const workspaceBody = rule(".codex-workspace-body");
    const drawer = rule(".workspace-history-drawer");
    const composerAnimation = rule(
      ".codex-workspace-body.history-input-animating .composer-panel",
    );

    expect(workspaceBody).toContain("--history-transition-duration: 200ms");
    expect(workspaceBody).toContain(
      "--history-transition-easing: cubic-bezier(0.2, 0, 0, 1)",
    );
    expect(drawer).toContain(
      "transform var(--history-transition-duration) var(--history-transition-easing)",
    );
    expect(composerAnimation).toContain(
      "width var(--history-transition-duration) var(--history-transition-easing)",
    );
    expect(composerAnimation).toContain(
      "transform var(--history-transition-duration) var(--history-transition-easing)",
    );
  });

  it("keeps drawer motion compositor-only and ordinary window resizing unanimated", () => {
    const drawer = rule(".workspace-history-drawer");
    const composer = rule(".composer-panel");

    expect(drawer).toContain("position: absolute");
    expect(drawer.match(/transition:[\s\S]*?;/)?.[0]).not.toContain("width");
    expect(composer).not.toContain("transition:");
  });

  it("insets the native scrollbar track beyond the rounded chat corners", () => {
    expect(rule(".task-chat-transcript.native-transcript")).toContain(
      "--chat-scrollbar-corner-inset: calc(var(--radius) + 4px)",
    );
    expect(
      rule(".task-chat-transcript.native-transcript::-webkit-scrollbar-track"),
    ).toContain("margin-block: var(--chat-scrollbar-corner-inset)");
  });
});
