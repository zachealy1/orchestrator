#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptsDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptsDirectory, "..");
const sourceDirectory = path.join(repositoryRoot, "browser-extension");
const packagedDirectory = path.join(
  repositoryRoot,
  "src-tauri",
  "resources",
  "browser-extension",
);
const manifest = JSON.parse(
  fs.readFileSync(path.join(sourceDirectory, "manifest.json"), "utf8"),
);
const serviceWorker = fs.readFileSync(
  path.join(sourceDirectory, "service-worker.js"),
  "utf8",
);

assert.equal(manifest.manifest_version, 3);
assert.deepEqual(
  [...manifest.permissions].sort(),
  ["debugger", "nativeMessaging", "scripting", "storage", "tabGroups", "tabs"].sort(),
);
assert.equal(manifest.host_permissions, undefined);
assert.match(manifest.key, /^[A-Za-z0-9+/=]+$/u);
assert.match(serviceWorker, /chrome\.runtime\.onStartup\.addListener\(connectNative\)/u);
assert.match(serviceWorker, /url: "about:blank"/u);
assert.doesNotMatch(serviceWorker, /chrome\.tabs\.query\(\{\s*active:\s*true/u);
assert.doesNotMatch(serviceWorker, /Runtime\.evaluate/u);
for (const action of [
  "browser-backend-tabs",
  "browser-backend-user-tabs",
  "browser-backend-create-tab",
  "browser-backend-claim-tab",
  "browser-backend-attach",
  "browser-backend-detach",
  "browser-backend-cdp",
  "browser-backend-events",
  "browser-backend-allow-download",
  "pause-session",
  "mark-tab",
  "turn-ended",
]) {
  assert.match(serviceWorker, new RegExp(`case "${action}"`, "u"));
}
assert.match(serviceWorker, /tab\.groupId !== groupId/u);
assert.match(serviceWorker, /outside this Orchestrator chat group/u);
assert.doesNotMatch(serviceWorker, /case "(?:inspect-action|tool)"/u);
assert.match(serviceWorker, /Browser\.setDownloadBehavior/u);
assert.match(serviceWorker, /rememberCreatedTab\(sessionToken, controlled\.id\)/u);
assert.match(serviceWorker, /restoreClaimedTab/u);
assert.match(serviceWorker, /forgetClosedTab/u);
assert.match(serviceWorker, /pauseAllSessions/u);
assert.match(serviceWorker, /marks\.has\(tabId\)/u);
assert.match(serviceWorker, /downloadPath: request\.downloadDir/u);
assert.match(serviceWorker, /behavior: "deny"/u);
assert.match(serviceWorker, /password\|passcode\|credential/u);
assert.deepEqual(
  fs.readdirSync(packagedDirectory).sort(),
  fs.readdirSync(sourceDirectory).sort(),
);

process.stdout.write("Browser extension contract checks passed.\n");
