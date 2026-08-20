// @ts-expect-error Vitest runs in Node; the app typecheck intentionally omits Node types.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

declare const process: { cwd(): string };

const tauriConfig = JSON.parse(
  readFileSync(`${process.cwd()}/src-tauri/tauri.conf.json`, "utf8"),
) as {
  app: { windows: Array<{ width: number; minWidth: number }> };
};
const primitiveCss = readFileSync(
  `${process.cwd()}/src/styles/tokens-and-primitives.css`,
  "utf8",
);
const shellCss = readFileSync(
  `${process.cwd()}/src/styles/shell-and-header.css`,
  "utf8",
);
const kanbanCss = readFileSync(
  `${process.cwd()}/src/features/kanban/kanban.css`,
  "utf8",
);

function numericMatch(source: string, pattern: RegExp, label: string) {
  const match = source.match(pattern);
  if (!match?.[1]) throw new Error(`Missing ${label}`);
  return Number(match[1]);
}

describe("application minimum width", () => {
  it("keeps the native window wide enough for four Kanban lanes", () => {
    const window = tauriConfig.app.windows[0];
    if (!window) throw new Error("Missing main Tauri window configuration");

    const cssMinimum = numericMatch(
      primitiveCss,
      /body\s*\{[^}]*min-width:\s*(\d+)px/s,
      "body minimum width",
    );
    const railWidth = numericMatch(
      shellCss,
      /\.app-shell\s*\{[^}]*grid-template-columns:\s*(\d+)px/s,
      "app rail width",
    );
    const laneBreakpoint = numericMatch(
      kanbanCss,
      /@container kanban-board \(max-width:\s*(\d+)px\)/,
      "Kanban lane breakpoint",
    );

    expect(window.width).toBeGreaterThanOrEqual(window.minWidth);
    expect(cssMinimum).toBe(window.minWidth);
    expect(window.minWidth - railWidth).toBeGreaterThan(laneBreakpoint);
  });
});
