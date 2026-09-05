// @ts-expect-error Vitest runs in Node; the app typecheck intentionally omits Node types.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

declare const process: { cwd(): string };

const root = process.cwd();
const appCss = readFileSync(`${root}/src/App.css`, "utf8");
const css = readFileSync(
  `${root}/src/styles/application-shortcuts.css`,
  "utf8",
);

function rule(selector: string) {
  const start = css.indexOf(selector);
  if (start < 0) throw new Error(`Missing CSS rule: ${selector}`);
  const end = css.indexOf("}", css.indexOf("{", start));
  return css.slice(start, end + 1);
}

describe("application shortcut styles", () => {
  it("loads the shortcut overlay stylesheet through the application entrypoint", () => {
    expect(appCss).toContain('@import "./styles/application-shortcuts.css";');
  });

  it("keeps command hover styling flat and aligned with existing dropdowns", () => {
    const hover = rule("button.application-command-option:hover,");
    expect(hover).toContain("background: var(--dropdown-bg-hover)");
    expect(hover).toContain("transform: none");
    expect(hover).toContain("box-shadow: none");
  });

  it("honors reduced-motion preferences for both overlays", () => {
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain("transition: none !important");
  });
});
