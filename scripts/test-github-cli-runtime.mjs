#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const architecture = process.arch === "arm64" ? "arm64" : "x64";
const root = path.join(
  repositoryRoot,
  "src-tauri",
  "resources",
  "github-cli",
  `darwin-${architecture}`,
);
const manifest = JSON.parse(fs.readFileSync(path.join(root, "runtime.json"), "utf8"));
const executable = path.join(root, manifest.executable);
const result = spawnSync(executable, ["--version"], {
  encoding: "utf8",
  env: { PATH: "/usr/bin:/bin" },
});

if (result.status !== 0) {
  throw new Error(result.stderr || "The bundled GitHub CLI could not be executed.");
}
if (!result.stdout.startsWith(`gh version ${manifest.ghVersion} `)) {
  throw new Error(`Unexpected GitHub CLI version: ${result.stdout.trim()}`);
}

const isolatedConfig = fs.mkdtempSync(
  path.join(os.tmpdir(), "orchestrator-gh-smoke-"),
);
try {
  const auth = spawnSync(
    executable,
    ["auth", "status", "--active", "--hostname", "github.com", "--json", "hosts"],
    {
      encoding: "utf8",
      env: {
        PATH: "/usr/bin:/bin",
        GH_CONFIG_DIR: isolatedConfig,
        GH_PROMPT_DISABLED: "1",
        GH_PAGER: "cat",
        NO_COLOR: "1",
      },
    },
  );
  const status = JSON.parse(auth.stdout);
  if (!status.hosts || Object.keys(status.hosts).length !== 0) {
    throw new Error("The bundled GitHub CLI consulted credentials outside its isolated config.");
  }
} finally {
  fs.rmSync(isolatedConfig, { recursive: true, force: true });
}

process.stdout.write(`Bundled GitHub CLI ${manifest.ghVersion} is executable.\n`);
