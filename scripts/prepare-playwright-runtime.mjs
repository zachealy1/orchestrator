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
const sourceFingerprint = fingerprint([
  fileURLToPath(import.meta.url),
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

fs.rmSync(destination, { recursive: true, force: true });
fs.mkdirSync(destination, { recursive: true, mode: 0o755 });

const hostDestination = path.join(destination, "host");
fs.mkdirSync(hostDestination, { recursive: true });
fs.copyFileSync(
  path.join(runtimeSource, "orchestrator-browser-backend.mjs"),
  path.join(hostDestination, "orchestrator-browser-backend.mjs"),
);
const nodeBinary = installPinnedNode(destination, architecture);

fs.writeFileSync(
  manifestPath,
  JSON.stringify(
    {
      version: 3,
      platform: process.platform,
      architecture,
      nodeVersion: NODE_VERSION,
      sourceFingerprint,
      nodeExecutable: relative(destination, nodeBinary),
      browserBackendScript: "host/orchestrator-browser-backend.mjs",
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
      manifest.version === 3 &&
      fs.existsSync(path.join(path.dirname(file), manifest.browserBackendScript))
    );
  } catch {
    return false;
  }
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
