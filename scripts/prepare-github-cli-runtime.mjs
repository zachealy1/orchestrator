#!/usr/bin/env node

import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const GH_VERSION = "2.96.0";
const CHECKSUMS = {
  arm64: "f23a0c37d963aacc3bed703ccbd59b41c5ca22101fab7f00eb2b7cad23aba463",
  x64: "4bd449df9ad639391bc62b8032546f0fe9edcd8526e06682a4f88abd8c5d163c",
};

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");
const architecture = targetArchitecture();
const archiveArchitecture = architecture === "x64" ? "amd64" : architecture;
const archiveName = `gh_${GH_VERSION}_macOS_${archiveArchitecture}.zip`;
const destination = path.join(
  repositoryRoot,
  "src-tauri",
  "resources",
  "github-cli",
  `darwin-${architecture}`,
);
const manifestPath = path.join(destination, "runtime.json");
const executablePath = path.join(destination, "bin", "gh");

if (process.platform !== "darwin") {
  throw new Error("The bundled GitHub CLI runtime currently targets macOS only.");
}
if (architecture !== process.arch) {
  throw new Error(
    `Build darwin-${architecture} on matching hardware. Current Node architecture is ${process.arch}.`,
  );
}
if (runtimeIsCurrent()) {
  process.stdout.write(`GitHub CLI runtime is ready at ${destination}\n`);
  process.exit(0);
}

const cacheDirectory = path.join(os.homedir(), ".cache", "orchestrator", "github-cli");
const archivePath = path.join(cacheDirectory, archiveName);
fs.mkdirSync(cacheDirectory, { recursive: true });
if (!fs.existsSync(archivePath)) {
  run("curl", [
    "-fL",
    "--retry",
    "3",
    `https://github.com/cli/cli/releases/download/v${GH_VERSION}/${archiveName}`,
    "-o",
    archivePath,
  ]);
}

const checksum = createHash("sha256")
  .update(fs.readFileSync(archivePath))
  .digest("hex");
if (checksum !== CHECKSUMS[architecture]) {
  fs.rmSync(archivePath, { force: true });
  throw new Error(`Checksum verification failed for ${archiveName}.`);
}

const extractionRoot = fs.mkdtempSync(path.join(os.tmpdir(), "orchestrator-gh-"));
try {
  run("unzip", ["-q", archivePath, "-d", extractionRoot]);
  const source = path.join(
    extractionRoot,
    `gh_${GH_VERSION}_macOS_${archiveArchitecture}`,
    "bin",
    "gh",
  );
  if (!fs.existsSync(source)) {
    throw new Error(`GitHub CLI archive did not contain ${source}.`);
  }
  fs.rmSync(destination, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(executablePath), { recursive: true, mode: 0o755 });
  fs.copyFileSync(source, executablePath);
  fs.chmodSync(executablePath, 0o755);
  const executableSha256 = createHash("sha256")
    .update(fs.readFileSync(executablePath))
    .digest("hex");
  fs.writeFileSync(
    manifestPath,
    JSON.stringify(
      {
        version: 1,
        platform: process.platform,
        architecture,
        ghVersion: GH_VERSION,
        archiveSha256: CHECKSUMS[architecture],
        executableSha256,
        executable: "bin/gh",
      },
      null,
      2,
    ),
  );
} finally {
  fs.rmSync(extractionRoot, { recursive: true, force: true });
}

process.stdout.write(`Prepared GitHub CLI runtime at ${destination}\n`);

function targetArchitecture() {
  const triple =
    process.env.TAURI_ENV_TARGET_TRIPLE ?? process.env.CARGO_BUILD_TARGET ?? "";
  if (triple.startsWith("aarch64-")) return "arm64";
  if (triple.startsWith("x86_64-")) return "x64";
  return process.arch;
}

function runtimeIsCurrent() {
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    return (
      manifest.version === 1 &&
      manifest.architecture === architecture &&
      manifest.ghVersion === GH_VERSION &&
      manifest.archiveSha256 === CHECKSUMS[architecture] &&
      manifest.executable === "bin/gh" &&
      fs.existsSync(executablePath) &&
      manifest.executableSha256 ===
        createHash("sha256").update(fs.readFileSync(executablePath)).digest("hex")
    );
  } catch {
    return false;
  }
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    stdio: "inherit",
    env: process.env,
  });
  if (result.status !== 0) {
    throw new Error(`${command} exited with status ${result.status ?? "unknown"}.`);
  }
}
