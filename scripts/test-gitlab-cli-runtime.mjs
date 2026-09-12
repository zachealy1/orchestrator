#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
const directory = path.resolve("src-tauri/resources/gitlab-cli", `darwin-${process.arch === "arm64" ? "arm64" : "x64"}`);
const manifest = JSON.parse(fs.readFileSync(path.join(directory, "runtime.json"), "utf8"));
assert.equal(manifest.glabVersion, "1.117.0");
assert.equal(manifest.executable, "bin/glab");
const executable = path.join(directory, manifest.executable);
assert.equal(createHash("sha256").update(fs.readFileSync(executable)).digest("hex"), manifest.executableSha256);
const isolated = fs.mkdtempSync(path.join(os.tmpdir(), "orchestrator-glab-smoke-"));
const env = { PATH: "/usr/bin:/bin", GLAB_CONFIG_DIR: isolated, GITLAB_HOST: "gitlab.com", GLAB_CHECK_UPDATE: "false", NO_COLOR: "1" };
try {
  const version = spawnSync(executable, ["--version"], { encoding: "utf8", env, cwd: isolated, timeout: 10000 });
  assert.equal(version.status, 0);
  assert.ok(version.stdout.startsWith(`glab ${manifest.glabVersion}`), "Pinned CLI version must match");
  const status = spawnSync(executable, ["auth", "status", "--hostname", "gitlab.com"], { encoding: "utf8", env, cwd: isolated, timeout: 10000 });
  assert.notEqual(status.status, 0, "Empty app configuration must not pick up terminal authentication");
  for (const args of [["auth", "login", "--help"], ["api", "--help"], ["config", "get", "--help"]]) {
    assert.equal(spawnSync(executable, args, { env, cwd: isolated, timeout: 10000 }).status, 0);
  }
} finally { fs.rmSync(isolated, { recursive: true, force: true }); }
console.log(`Bundled GitLab CLI ${manifest.glabVersion} passed version, integrity, and isolated configuration checks.`);
