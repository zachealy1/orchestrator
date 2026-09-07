#!/usr/bin/env node
// Pin an official release at build time; never package an engine taken from another installed app.
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pinned = JSON.parse(fs.readFileSync(path.join(root, "src-tauri/resources/codex-engine/release.json"), "utf8"));
const triple = process.env.TAURI_ENV_TARGET_TRIPLE ?? process.env.CARGO_BUILD_TARGET ?? "";
const architecture = triple.startsWith("x86_64-") ? "x64" : triple.startsWith("aarch64-") ? "arm64" : process.arch;
if (process.platform !== "darwin" || !["arm64", "x64"].includes(architecture) || architecture !== process.arch) {
  throw new Error("Build the Codex engine package on a matching Apple silicon or Intel Mac.");
}
const target = `${architecture === "arm64" ? "aarch64" : "x86_64"}-apple-darwin`;
const release = { version: pinned.version, target, archiveSha256: pinned.archives[target] };
const destination = path.join(root, "src-tauri/resources/codex-engine", `darwin-${architecture}`);
const binary = path.join(destination, "codex");
const digest = (file) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const verify = (file) => run("cargo", ["run", "--quiet", "--manifest-path", "src-tauri/Cargo.toml", "--bin", "verify-codex-engine", "--", file, release.version]);
let current = false;
try {
  const record = JSON.parse(fs.readFileSync(path.join(destination, "runtime.json"), "utf8"));
  current = JSON.stringify(record.release) === JSON.stringify(release) && record.executableSha256 === digest(binary);
} catch { /* Prepare a missing or incomplete package. */ }
if (current) {
  verify(binary); // Recheck when Orchestrator's required protocol changes, even for the same release.
  process.stdout.write(`Codex ${release.version} is ready.\n`);
} else {
  const cache = path.join(os.homedir(), ".cache/orchestrator/codex-engine");
  fs.mkdirSync(cache, { recursive: true });
  const archive = path.join(cache, `${release.version}-${target}.tar.gz`);
  if (fs.existsSync(archive) && digest(archive) !== release.archiveSha256) fs.rmSync(archive);
  if (!fs.existsSync(archive)) {
    const temporary = `${archive}.${process.pid}.tmp`;
    try {
      run("/usr/bin/curl", ["--disable", "--fail", "--location", "--proto", "=https", "--proto-redir", "=https", "--max-time", "180", "--max-filesize", "314572800", "--output", temporary,
        `https://github.com/openai/codex/releases/download/rust-v${release.version}/codex-${target}.tar.gz`]);
      if (digest(temporary) !== release.archiveSha256) throw new Error("Codex download checksum mismatch.");
      fs.renameSync(temporary, archive);
    } finally { fs.rmSync(temporary, { force: true }); }
  }
  const staging = fs.mkdtempSync(path.join(path.dirname(destination), ".prepare-"));
  try {
    const listing = spawnSync("/usr/bin/tar", ["-tzf", archive], { encoding: "utf8" });
    if (listing.status !== 0 || listing.stdout.trim() !== `codex-${target}`) throw new Error("Unexpected Codex archive layout.");
    run("/usr/bin/tar", ["-xzf", archive, "-C", staging, `codex-${target}`]);
    const source = path.join(staging, `codex-${target}`);
    if (!fs.lstatSync(source).isFile()) throw new Error("Codex archive did not contain a regular executable.");
    fs.renameSync(source, path.join(staging, "codex"));
    fs.chmodSync(path.join(staging, "codex"), 0o755);
    verify(path.join(staging, "codex"));
    fs.writeFileSync(path.join(staging, "runtime.json"), JSON.stringify({ release, executableSha256: digest(path.join(staging, "codex")) }, null, 2));
    fs.rmSync(destination, { recursive: true, force: true });
    fs.renameSync(staging, destination);
  } finally { fs.rmSync(staging, { recursive: true, force: true }); }
  process.stdout.write(`Packaged Codex ${release.version} for ${architecture}.\n`);
}
function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit" });
  if (result.status !== 0) throw new Error(`${command} failed with status ${result.status}.`);
}
