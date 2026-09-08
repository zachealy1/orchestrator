import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { versionParts, requireEnvironment } from "./lib.mjs";
const packageJson = JSON.parse(await readFile("package.json", "utf8"));
const lock = JSON.parse(await readFile("package-lock.json", "utf8"));
const tauri = JSON.parse(await readFile("src-tauri/tauri.conf.json", "utf8"));
const cargo = await readFile("src-tauri/Cargo.toml", "utf8");
const nativeLock = await readFile("src-tauri/Cargo.lock", "utf8");
versionParts(packageJson.version);
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
assert.ok(tauri.app.security.csp && !tauri.app.security.csp.includes("'unsafe-eval'"));
assert.ok(!/script-src[^;]*(?:https:|\*)/.test(tauri.app.security.csp));
assert.ok(cargo.includes("autobins = false"));
// The plugin must initialize in unsigned development builds too. The native
// service supplies the embedded release key and refuses checks when it is absent.
assert.equal(typeof tauri.plugins.updater.pubkey, "string");
if (process.argv.includes("--publish") || process.argv.includes("--sign")) {
  requireEnvironment(["ORCHESTRATOR_UPDATER_PUBLIC_KEY", "TAURI_SIGNING_PRIVATE_KEY", "TAURI_SIGNING_PRIVATE_KEY_PASSWORD", "APPLE_CERTIFICATE", "APPLE_CERTIFICATE_PASSWORD", "APPLE_SIGNING_IDENTITY", "APPLE_ID", "APPLE_PASSWORD", "APPLE_TEAM_ID"]);
  if (!process.env.APPLE_SIGNING_IDENTITY.startsWith("Developer ID Application:")) throw new Error("A Developer ID Application signing identity is required");
  if (process.argv.includes("--publish") && process.env.BETA_REHEARSAL_APPROVED !== "true") throw new Error("Clean-Mac beta rehearsal has not been approved. Publication is blocked.");
}
console.log(`Release configuration ${packageJson.version}: valid${process.argv.includes("--publish") ? " and credentialed" : " (signing credentials not checked)"}.`);
