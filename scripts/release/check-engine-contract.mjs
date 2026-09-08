import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { sha256 } from "./lib.mjs";
import { contract } from "./protocol-contract.mjs";
import assert from "node:assert/strict";
const base = process.argv[2];
if (!/^[a-f0-9]{40}$/.test(base ?? "")) throw new Error("Expected a trusted baseline SHA");
const pinPath = "src-tauri/resources/codex-engine/release.json";
const old = JSON.parse(execFileSync("git", ["show", `${base}:${pinPath}`], { encoding: "utf8" }));
const current = JSON.parse(await readFile(pinPath, "utf8"));
const arch = process.arch === "arm64" ? "aarch64" : "x86_64", target = `${arch}-apple-darwin`;
const binary = resolve(`src-tauri/resources/codex-engine/darwin-${process.arch}/codex`);
const next = await contract(binary);
const temporary = await mkdtemp(join(tmpdir(), "orchestrator-baseline-engine-"));
try {
  let baseline = next;
  if (old.version !== current.version) {
    const response = await fetch(`https://github.com/openai/codex/releases/download/rust-v${old.version}/codex-${target}.tar.gz`);
    if (!response.ok) throw new Error("Cannot download baseline engine for protocol comparison");
    const bytes = Buffer.from(await response.arrayBuffer());
    if (sha256(bytes) !== old.archives[target]) throw new Error("Baseline engine integrity check failed");
    const archive = join(temporary, "baseline.tar.gz"); await writeFile(archive, bytes);
    execFileSync("tar", ["-xzf", archive, "-C", temporary, `codex-${target}`]);
    baseline = await contract(join(temporary, `codex-${target}`));
  }
  assert.deepEqual(next, baseline, "Consumed Codex protocol changed. Manual review is required; do not alter tests automatically.");
  console.log(`Verified ${Object.keys(next).length} used protocol contracts against Codex ${old.version}.`);
} finally { await rm(temporary, { recursive: true, force: true }); }
