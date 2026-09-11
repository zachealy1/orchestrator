import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import assert from "node:assert/strict";
import { versionParts } from "./lib.mjs";
import { engineRelease } from "../codex-engine-package.mjs";
import { distribution, validateDistributionVersion, requireSigning, requirePublicationApproval } from "./distribution.mjs";
const enginePin = JSON.parse(await readFile("src-tauri/resources/codex-engine/release.json", "utf8"));
for (const arch of ["aarch64", "x86_64"]) engineRelease(enginePin, `${arch}-apple-darwin`);
const packageJson = JSON.parse(await readFile("package.json", "utf8"));
const lock = JSON.parse(await readFile("package-lock.json", "utf8"));
const tauri = JSON.parse(await readFile("src-tauri/tauri.conf.json", "utf8"));
const cargo = await readFile("src-tauri/Cargo.toml", "utf8");
const nativeLock = await readFile("src-tauri/Cargo.lock", "utf8");
versionParts(packageJson.version);
const profile = distribution(process.env.RELEASE_DISTRIBUTION ?? "notarized");
validateDistributionVersion(profile, packageJson.version);
for (const version of [lock.version, lock.packages[""].version, tauri.version,
  cargo.match(/name = "orchestrator"\nversion = "([^"]+)"/)[1], nativeLock.match(/name = "orchestrator"\nversion = "([^"]+)"/)[1]]) assert.equal(version, packageJson.version);
assert.equal(packageJson.private, true);
assert.equal(packageJson.license, "MIT");
assert.equal(lock.packages[""].license, "MIT");
assert.match(cargo, /^license = "MIT"$/m);
const updater = await readFile("src-tauri/src/app_updates.rs", "utf8");
assert.ok(updater.includes("https://raw.githubusercontent.com/zachealy1/orchestrator/update-feed/beta.json"));
assert.ok(updater.includes('const DOWNLOADS: &str = "https://github.com/zachealy1/orchestrator/releases"'));
assert.equal(tauri.bundle.macOS.minimumSystemVersion, "15.0");
// Fail before an expensive release build if the installer artwork is missing.
assert.ok(tauri.bundle.macOS.dmg?.background, "Installer background must be configured");
await readFile(resolve("src-tauri", tauri.bundle.macOS.dmg.background));
assert.ok(tauri.app.security.csp && !tauri.app.security.csp.includes("'unsafe-eval'"));
assert.ok(!/script-src[^;]*(?:https:|\*)/.test(tauri.app.security.csp));
assert.ok(cargo.includes("autobins = false"));
// The plugin must initialize in unsigned development builds too. The native
// service supplies the embedded release key and refuses checks when it is absent.
assert.equal(typeof tauri.plugins.updater.pubkey, "string");
if (process.argv.includes("--publish") || process.argv.includes("--sign")) {
  requireSigning(profile);
  if (process.argv.includes("--publish")) requirePublicationApproval(profile, process.env.RELEASE_SOURCE_SHA);
}
console.log(`Release configuration ${packageJson.version} (${profile}): valid${process.argv.includes("--sign") || process.argv.includes("--publish") ? " and credentialed" : " (signing credentials not checked)"}.`);
