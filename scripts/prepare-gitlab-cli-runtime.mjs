#!/usr/bin/env node

import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const GLAB_VERSION = "1.117.0";
const CHECKSUMS = {
  arm64: "9fef4b1f302a5eebe615531d0e5e842ba79cb34df41580bdc0f399a465d8ad15",
  x64: "9136d10c7f4399cb9ee206c75dbeddeb83062c7faafd80f4c5ce9afe88c63a31",
};

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");
const architecture = targetArchitecture();
const archiveArchitecture = architecture === "x64" ? "amd64" : architecture;
const archiveName = `glab_${GLAB_VERSION}_darwin_${archiveArchitecture}.tar.gz`;
const destination = path.join(
  repositoryRoot,
  "src-tauri",
  "resources",
  "gitlab-cli",
  `darwin-${architecture}`,
);
const manifestPath = path.join(destination, "runtime.json");
const executablePath = path.join(destination, "bin", "glab");

if (process.platform !== "darwin") {
  throw new Error("The bundled GitLab CLI runtime currently targets macOS only.");
}
if (architecture !== process.arch) {
  throw new Error(
    `Build darwin-${architecture} on matching hardware. Current Node architecture is ${process.arch}.`,
  );
}
if (runtimeIsCurrent()) {
  process.stdout.write(`GitLab CLI runtime is ready at ${destination}\n`);
  process.exit(0);
}

const cacheDirectory = path.join(os.homedir(), ".cache", "orchestrator", "gitlab-cli");
const archivePath = path.join(cacheDirectory, archiveName);
fs.mkdirSync(cacheDirectory, { recursive: true });
if (!fs.existsSync(archivePath)) {
  run("curl", [
    "-fL",
    "--retry",
    "3",
    `https://gitlab.com/api/v4/projects/gitlab-org%2Fcli/packages/generic/glab/${GLAB_VERSION}/${archiveName}`,
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

const extractionRoot = fs.mkdtempSync(path.join(os.tmpdir(), "orchestrator-glab-"));
try {
  run("tar", ["-xzf", archivePath, "-C", extractionRoot]);
  const source = path.join(
    extractionRoot,
    "bin",
    "glab",
  );
  if (!fs.existsSync(source)) {
    throw new Error(`GitLab CLI archive did not contain ${source}.`);
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
        glabVersion: GLAB_VERSION,
        archiveSha256: CHECKSUMS[architecture],
        executableSha256,
        executable: "bin/glab",
      },
      null,
      2,
    ),
  );
} finally {
  fs.rmSync(extractionRoot, { recursive: true, force: true });
}

process.stdout.write(`Prepared GitLab CLI runtime at ${destination}\n`);

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
      manifest.glabVersion === GLAB_VERSION &&
      manifest.archiveSha256 === CHECKSUMS[architecture] &&
      manifest.executable === "bin/glab" &&
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
