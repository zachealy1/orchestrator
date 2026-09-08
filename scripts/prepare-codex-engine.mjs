#!/usr/bin/env node
// Pin an official release at build time; never package an engine taken from another installed app.
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { engineRelease, engineComponents, engineDigest, verifyRuntimeFiles } from "./codex-engine-package.mjs";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pinned = JSON.parse(fs.readFileSync(path.join(root, "src-tauri/resources/codex-engine/release.json"), "utf8"));
const triple = process.env.TAURI_ENV_TARGET_TRIPLE ?? process.env.CARGO_BUILD_TARGET ?? "";
const architecture = triple.startsWith("x86_64-") ? "x64" : triple.startsWith("aarch64-") ? "arm64" : process.arch;
if (process.platform !== "darwin" || !["arm64", "x64"].includes(architecture) || architecture !== process.arch) {
  throw new Error("Build the Codex engine package on a matching Apple silicon or Intel Mac.");
}
const target = `${architecture === "arm64" ? "aarch64" : "x86_64"}-apple-darwin`;
const release = engineRelease(pinned, target);
const destination = path.join(root, "src-tauri/resources/codex-engine", `darwin-${architecture}`);
const binary = path.join(destination, "codex");
const digest = (file) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const verify = (file) => run("cargo", ["run", "--quiet", "--manifest-path", "src-tauri/Cargo.toml", "--features", "dev-tools", "--bin", "verify-codex-engine", "--", file, release.version]);
let current = false;
try {
  verifyRuntimeFiles(destination, release);
  current = true;
} catch { /* Prepare a missing or incomplete package. */ }
if (current) {
  verify(binary); // Recheck when Orchestrator's required protocol changes, even for the same release.
  process.stdout.write(`Codex ${release.version} is ready.\n`);
} else {
  const cache = path.join(os.homedir(), ".cache/orchestrator/codex-engine");
  fs.mkdirSync(cache, { recursive: true });
  const staging = fs.mkdtempSync(path.join(path.dirname(destination), ".prepare-"));
  try {
    const record = { release };
    for (const component of engineComponents(release)) {
      const entry = `${component.name}-${target}`;
      const archive = path.join(cache, `${release.version}-${component.name === "codex" ? target : entry}.tar.gz`);
      if (fs.existsSync(archive) && digest(archive) !== component.archiveHash) fs.rmSync(archive);
      if (!fs.existsSync(archive)) {
        const temporary = `${archive}.${process.pid}.tmp`;
        try {
          run("/usr/bin/curl", ["--disable", "--fail", "--location", "--proto", "=https", "--proto-redir", "=https", "--max-time", "180", "--max-filesize", "314572800", "--output", temporary,
            `https://github.com/openai/codex/releases/download/rust-v${release.version}/${entry}.tar.gz`]);
          if (digest(temporary) !== component.archiveHash) throw new Error("Codex download checksum mismatch.");
          fs.renameSync(temporary, archive);
        } finally { fs.rmSync(temporary, { force: true }); }
      }
      const listing = spawnSync("/usr/bin/tar", ["-tzf", archive], { encoding: "utf8" });
      if (listing.status !== 0 || listing.stdout.trim() !== entry) throw new Error("Unexpected Codex archive layout.");
      run("/usr/bin/tar", ["-xzf", archive, "-C", staging, entry]);
      const source = path.join(staging, entry), output = path.join(staging, component.name);
      if (!fs.lstatSync(source).isFile()) throw new Error("Codex archive did not contain a regular executable.");
      fs.renameSync(source, output);
      fs.chmodSync(output, 0o755);
      record[component.hashKey] = engineDigest(output);
    }
    verify(path.join(staging, "codex"));
    fs.writeFileSync(path.join(staging, "runtime.json"), JSON.stringify(record, null, 2));
    verifyRuntimeFiles(staging, release);
    const previous = `${destination}.previous-${process.pid}`;
    const hadPrevious = fs.existsSync(destination);
    if (hadPrevious) fs.renameSync(destination, previous);
    try { fs.renameSync(staging, destination); }
    catch (error) { if (hadPrevious) fs.renameSync(previous, destination); throw error; }
    if (hadPrevious) fs.rmSync(previous, { recursive: true });
  } finally { fs.rmSync(staging, { recursive: true, force: true }); }
  process.stdout.write(`Packaged Codex ${release.version} for ${architecture}.\n`);
}
function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit" });
  if (result.status !== 0) throw new Error(`${command} failed with status ${result.status}.`);
}
