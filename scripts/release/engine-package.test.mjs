import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { engineRelease, engineComponents, engineDigest, verifyRuntimeFiles } from "../codex-engine-package.mjs";
import { engineAssets } from "./lib.mjs";

const pin = JSON.parse(fs.readFileSync(new URL("../../src-tauri/resources/codex-engine/release.json", import.meta.url), "utf8"));

test("both architectures pin the engine and Code Mode host from the same release", () => {
  for (const target of ["aarch64-apple-darwin", "x86_64-apple-darwin"]) {
    const release = engineRelease(pin, target);
    assert.equal(engineComponents(release).length, 2);
    assert.throws(() => engineRelease({ ...pin, codeModeHostArchives: {} }, target), /Incomplete/);
  }
});

test("packaged runtime rejects missing, corrupted, non-executable, symlinked and legacy hosts", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "orchestrator-runtime-package-test-"));
  try {
    const release = engineRelease(pin, "aarch64-apple-darwin");
    const record = { release };
    for (const component of engineComponents(release)) {
      const file = path.join(root, component.name);
      fs.writeFileSync(file, `#!/bin/sh\n# ${component.name}\n`, { mode: 0o755 });
      record[component.hashKey] = engineDigest(file);
    }
    const metadata = path.join(root, "runtime.json"), host = path.join(root, "codex-code-mode-host");
    fs.writeFileSync(metadata, JSON.stringify(record));
    assert.deepEqual(verifyRuntimeFiles(root, release), record);
    const bytes = fs.readFileSync(host);
    fs.unlinkSync(host);
    assert.throws(() => verifyRuntimeFiles(root, release));
    fs.symlinkSync(path.join(root, "codex"), host);
    assert.throws(() => verifyRuntimeFiles(root, release), /regular/);
    fs.unlinkSync(host);
    fs.writeFileSync(host, "corrupt", { mode: 0o755 });
    assert.throws(() => verifyRuntimeFiles(root, release), /integrity/);
    fs.writeFileSync(host, bytes);
    fs.chmodSync(host, 0o644);
    assert.throws(() => verifyRuntimeFiles(root, release));
    fs.chmodSync(host, 0o755);
    delete record.codeModeHostSha256;
    fs.writeFileSync(metadata, JSON.stringify(record));
    assert.throws(() => verifyRuntimeFiles(root, release), /integrity/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("upgrades require verified host assets for both architectures and reject replacements", () => {
  const tag_name = "rust-v0.154.0";
  const assets = ["codex", "codex-code-mode-host"].flatMap((component) => ["aarch64", "x86_64"].map((arch) => {
    const name = `${component}-${arch}-apple-darwin.tar.gz`;
    return { name, size: 100, digest: `sha256:${"a".repeat(64)}`, browser_download_url: `https://github.com/openai/codex/releases/download/${tag_name}/${name}` };
  }));
  assert.equal(Object.keys(engineAssets({ tag_name, assets }, "codex-code-mode-host")).length, 2);
  assert.throws(() => engineAssets({ tag_name, assets: assets.slice(0, 3) }, "codex-code-mode-host"));
  assert.throws(() => engineAssets({ tag_name, assets: [...assets, assets[3]] }, "codex-code-mode-host"));
  assets[3].browser_download_url = "https://example.com/untrusted.tar.gz";
  assert.throws(() => engineAssets({ tag_name, assets }, "codex-code-mode-host"), /Untrusted/);
});
