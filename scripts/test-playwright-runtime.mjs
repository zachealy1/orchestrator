#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const architecture = process.arch === "arm64" ? "arm64" : "x64";
const runtimeRoot = path.join(repositoryRoot, "src-tauri", "resources", "playwright", `darwin-${architecture}`);
const manifest = JSON.parse(fs.readFileSync(path.join(runtimeRoot, "runtime.json"), "utf8"));

if (manifest.version !== 3 || !manifest.nodeExecutable || !manifest.browserBackendScript) {
  throw new Error("The prepared runtime does not contain the external-browser host.");
}
if ("chromiumExecutable" in manifest || "playwrightVersion" in manifest) {
  throw new Error("The browser host manifest still references a bundled browser.");
}
if (fs.existsSync(path.join(runtimeRoot, "browsers"))) {
  throw new Error("A browser executable directory was bundled unexpectedly.");
}

const check = spawnSync(path.join(runtimeRoot, manifest.nodeExecutable), ["--check", path.join(runtimeRoot, manifest.browserBackendScript)], { encoding: "utf8" });
if (check.status !== 0) throw new Error(check.stderr || "Browser host syntax check failed.");
process.stdout.write("Bundled external-browser host smoke test passed without a browser executable.\n");
