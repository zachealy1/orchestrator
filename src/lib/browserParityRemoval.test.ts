// @ts-expect-error Vitest runs in Node; the app typecheck intentionally omits Node types.
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

declare const process: { cwd(): string };

const root = process.cwd();
const read = (path: string) => readFileSync(`${root}/${path}`, "utf8");

describe("Codex browser parity cleanup", () => {
  it("does not package the legacy extension, native host, or Playwright bridge", () => {
    [
      "browser-extension/manifest.json",
      "browser-extension/service-worker.js",
      "browser-extension/status.html",
      "browser-extension/status.js",
      "src-tauri/resources/browser-extension/manifest.json",
      "src-tauri/resources/browser-extension/service-worker.js",
      "src-tauri/resources/browser-extension/status.html",
      "src-tauri/resources/browser-extension/status.js",
      "src-tauri/resources/playwright/.gitkeep",
      "src-tauri/src/browser_sessions.rs",
      "src-tauri/src/default_browser.rs",
      "scripts/playwright-runtime/orchestrator-browser-backend.mjs",
      "scripts/prepare-browser-extension.mjs",
      "scripts/prepare-playwright-runtime.mjs",
      "scripts/test-browser-extension.mjs",
      "scripts/test-playwright-runtime.mjs",
    ].forEach((path) => expect(existsSync(`${root}/${path}`)).toBe(false));

    const packaging = `${read("package.json")}\n${read("src-tauri/tauri.conf.json")}`;
    expect(packaging).not.toMatch(/browser-extension|playwright-runtime/i);
  });

  it("does not expose custom browser bridge commands or environment overrides", () => {
    const runtimeSurface = [
      "src/generated/tauri.ts",
      "src/codexClient.ts",
      "src-tauri/src/lib.rs",
      "src-tauri/src/main.rs",
      "src-tauri/src/interaction.rs",
      "src/app/ApplicationRuntime.tsx",
    ]
      .map(read)
      .join("\n");

    expect(runtimeSurface).not.toMatch(/browser_session_/);
    expect(runtimeSurface).not.toMatch(/default_browser_/);
    expect(runtimeSurface).not.toMatch(
      /ORCHESTRATOR_(?:BROWSER|PLAYWRIGHT|COMPUTER_USE_PLUGIN_ROOT)/,
    );
  });
});
