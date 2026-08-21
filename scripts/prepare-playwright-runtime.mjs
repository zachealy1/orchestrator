#!/usr/bin/env node

import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const NODE_VERSION = "22.17.0";
const NODE_CHECKSUMS = {
  arm64: "615dda58b5fb41fad2be43940b6398ca56554cbe05800953afadc724729cb09e",
  x64: "c39c8ec3cdadedfcc75de0cb3305df95ae2aecebc5db8d68a9b67bd74616d2ad",
};

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");
const runtimeSource = path.join(scriptDirectory, "playwright-runtime");
const architecture = targetArchitecture();
const destination = path.join(
  repositoryRoot,
  "src-tauri",
  "resources",
  "playwright",
  `darwin-${architecture}`,
);
const manifestPath = path.join(destination, "runtime.json");
const runtimePackage = JSON.parse(
  fs.readFileSync(path.join(runtimeSource, "package.json"), "utf8"),
);
const sourceFingerprint = fingerprint([
  fileURLToPath(import.meta.url),
  path.join(runtimeSource, "package-lock.json"),
  path.join(runtimeSource, "orchestrator-browser-backend.mjs"),
]);

if (process.platform !== "darwin") {
  throw new Error("The bundled Playwright runtime currently targets macOS only.");
}
if (architecture !== process.arch) {
  throw new Error(
    `Build darwin-${architecture} on matching hardware. Current Node architecture is ${process.arch}.`,
  );
}
if (runtimeIsCurrent(manifestPath, sourceFingerprint)) {
  process.stdout.write(`Playwright runtime is ready at ${destination}\n`);
  process.exit(0);
}

const preservedBrowsers = preserveMatchingBrowsers(
  destination,
  architecture,
  runtimePackage.dependencies.playwright,
);
fs.rmSync(destination, { recursive: true, force: true });
fs.mkdirSync(destination, { recursive: true, mode: 0o755 });

run("npm", ["ci", "--omit=dev", "--ignore-scripts"], runtimeSource);

const hostDestination = path.join(destination, "host");
fs.mkdirSync(hostDestination, { recursive: true });
fs.copyFileSync(
  path.join(runtimeSource, "orchestrator-browser-backend.mjs"),
  path.join(hostDestination, "orchestrator-browser-backend.mjs"),
);
fs.cpSync(path.join(runtimeSource, "node_modules"), path.join(hostDestination, "node_modules"), {
  recursive: true,
});

const nodeBinary = installPinnedNode(destination, architecture);
const browsersPath = path.join(destination, "browsers");
if (preservedBrowsers) {
  fs.renameSync(preservedBrowsers, browsersPath);
  fs.rmSync(path.dirname(preservedBrowsers), { recursive: true, force: true });
} else {
  fs.mkdirSync(browsersPath, { recursive: true });
}
let chromiumExecutable = probeChromium(nodeBinary, hostDestination, browsersPath);
if (!chromiumExecutable || !fs.existsSync(chromiumExecutable)) {
  run(
    nodeBinary,
    [
      path.join(hostDestination, "node_modules", "playwright", "cli.js"),
      "install",
      "chromium",
      "--no-shell",
    ],
    destination,
    { PLAYWRIGHT_BROWSERS_PATH: browsersPath },
  );
  chromiumExecutable = probeChromium(
    nodeBinary,
    hostDestination,
    browsersPath,
  );
}
if (!fs.existsSync(chromiumExecutable)) {
  throw new Error(`Bundled Chromium executable was not found: ${chromiumExecutable}`);
}

fs.writeFileSync(
  manifestPath,
  JSON.stringify(
    {
      version: 2,
      platform: process.platform,
      architecture,
      nodeVersion: NODE_VERSION,
      playwrightVersion: runtimePackage.dependencies.playwright,
      sourceFingerprint,
      nodeExecutable: relative(destination, nodeBinary),
      browserBackendScript: "host/orchestrator-browser-backend.mjs",
      chromiumExecutable: relative(destination, chromiumExecutable),
    },
    null,
    2,
  ),
);
process.stdout.write(`Prepared Playwright runtime at ${destination}\n`);

function targetArchitecture() {
  const triple =
    process.env.TAURI_ENV_TARGET_TRIPLE ??
    process.env.CARGO_BUILD_TARGET ??
    "";
  if (triple.startsWith("aarch64-")) return "arm64";
  if (triple.startsWith("x86_64-")) return "x64";
  return process.arch;
}

function fingerprint(files) {
  const hash = createHash("sha256");
  for (const file of files) {
    hash.update(fs.readFileSync(file));
  }
  hash.update(NODE_VERSION);
  return hash.digest("hex");
}

function runtimeIsCurrent(file, expectedFingerprint) {
  try {
    const manifest = JSON.parse(fs.readFileSync(file, "utf8"));
    return (
      manifest.sourceFingerprint === expectedFingerprint &&
      fs.existsSync(path.join(path.dirname(file), manifest.nodeExecutable)) &&
      manifest.version === 2 &&
      fs.existsSync(path.join(path.dirname(file), manifest.browserBackendScript)) &&
      fs.existsSync(path.join(path.dirname(file), manifest.chromiumExecutable))
    );
  } catch {
    return false;
  }
}

function preserveMatchingBrowsers(root, arch, playwrightVersion) {
  try {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(root, "runtime.json"), "utf8"),
    );
    const source = path.join(root, "browsers");
    if (
      manifest.architecture !== arch ||
      manifest.playwrightVersion !== playwrightVersion ||
      !fs.existsSync(source) ||
      !fs.existsSync(path.join(root, manifest.chromiumExecutable))
    ) {
      return null;
    }
    const temporaryRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "orchestrator-playwright-browsers-"),
    );
    const preserved = path.join(temporaryRoot, "browsers");
    fs.renameSync(source, preserved);
    return preserved;
  } catch {
    return null;
  }
}

function probeChromium(nodeBinary, mcpRoot, browsersPath) {
  const executableProbe = spawnSync(
    nodeBinary,
    [
      "--input-type=module",
      "--eval",
      "import { chromium } from 'playwright'; process.stdout.write(chromium.executablePath());",
    ],
    {
      cwd: mcpRoot,
      encoding: "utf8",
      env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: browsersPath },
    },
  );
  return executableProbe.status === 0 ? executableProbe.stdout.trim() : null;
}

function installPinnedNode(root, arch) {
  const archiveName = `node-v${NODE_VERSION}-darwin-${arch}.tar.gz`;
  const cacheDirectory = path.join(os.homedir(), ".cache", "orchestrator", "node");
  const archivePath = path.join(cacheDirectory, archiveName);
  fs.mkdirSync(cacheDirectory, { recursive: true });
  if (!fs.existsSync(archivePath)) {
    run("curl", [
      "-fL",
      "--retry",
      "3",
      `https://nodejs.org/dist/v${NODE_VERSION}/${archiveName}`,
      "-o",
      archivePath,
    ]);
  }
  const actual = createHash("sha256")
    .update(fs.readFileSync(archivePath))
    .digest("hex");
  if (actual !== NODE_CHECKSUMS[arch]) {
    fs.rmSync(archivePath, { force: true });
    throw new Error(`Checksum verification failed for ${archiveName}.`);
  }
  const extractRoot = fs.mkdtempSync(path.join(os.tmpdir(), "orchestrator-node-"));
  try {
    run("tar", ["-xzf", archivePath, "-C", extractRoot]);
    const source = path.join(
      extractRoot,
      `node-v${NODE_VERSION}-darwin-${arch}`,
      "bin",
      "node",
    );
    const destinationPath = path.join(root, "bin", "node");
    fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
    fs.copyFileSync(source, destinationPath);
    fs.chmodSync(destinationPath, 0o755);
    return destinationPath;
  } finally {
    fs.rmSync(extractRoot, { recursive: true, force: true });
  }
}

function run(command, args, cwd = repositoryRoot, extraEnvironment = {}) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
    env: { ...process.env, ...extraEnvironment },
  });
  if (result.status !== 0) {
    throw new Error(`${command} exited with status ${result.status ?? "unknown"}.`);
  }
}

function relative(root, target) {
  return path.relative(root, target).split(path.sep).join("/");
}
