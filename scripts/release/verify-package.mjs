import { mkdtemp, readdir, readFile, readlink, rm } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import { engineRelease, verifyRuntimeFiles } from "../codex-engine-package.mjs";
import { distribution, validateAppSignature } from "./distribution.mjs";
import { confidentialRun } from "./safe-process.mjs";
import { sha256 } from "./lib.mjs";
const profile = distribution(process.env.RELEASE_DISTRIBUTION ?? "notarized");
const [directory, arch] = process.argv.slice(2);
assert.ok(["aarch64", "x86_64"].includes(arch));
const staging = await mkdtemp(join(tmpdir(), "orchestrator-package-audit-"));
const run = (bin, args) => confidentialRun(bin, args, { encoding: "utf8" });
async function inspectApp(app) {
  const version = JSON.parse(await readFile("package.json", "utf8")).version;
  for (const [key, expected] of Object.entries({ CFBundleIdentifier: "com.zachealy.orchestrator", CFBundleShortVersionString: version, CFBundleVersion: version, LSMinimumSystemVersion: "15.0" })) {
    assert.equal(run("/usr/libexec/PlistBuddy", ["-c", `Print :${key}`, join(app, "Contents/Info.plist")]).trim(), expected);
  }
  run("codesign", ["--verify", "--deep", "--strict", app]);
  const signature = spawnSync("codesign", ["--display", "--verbose=4", app], { encoding: "utf8" });
  if (signature.status !== 0) throw new Error("Cannot inspect the packaged app signature");
  validateAppSignature(profile, signature.stderr);
  if (profile === "notarized") {
    // Notarized distribution retains Gatekeeper and stapling verification on the actual copy.
    run("spctl", ["--assess", "--type", "execute", app]); run("xcrun", ["stapler", "validate", app]);
  }
  const executable = join(app, "Contents/MacOS/orchestrator");
  assert.equal(run("lipo", ["-archs", executable]).trim(), arch === "aarch64" ? "arm64" : "x86_64");
  const binaries = await readdir(join(app, "Contents/MacOS")); assert.deepEqual(binaries, ["orchestrator"]);
  const runtime = join(app, "Contents/Resources/resources");
  const suffix = arch === "aarch64" ? "arm64" : "x64";
  const pin = JSON.parse(await readFile("src-tauri/resources/codex-engine/release.json", "utf8"));
  const engineDirectory = join(runtime, `codex-engine/darwin-${suffix}`);
  verifyRuntimeFiles(engineDirectory, engineRelease(pin, `${arch}-apple-darwin`));
  for (const name of ["codex", "codex-code-mode-host"]) {
    assert.equal(run("lipo", ["-archs", join(engineDirectory, name)]).trim(), arch === "aarch64" ? "arm64" : "x86_64");
  }
  const ghDirectory = join(runtime, `github-cli/darwin-${suffix}`);
  const ghBinary = join(ghDirectory, "bin/gh");
  const ghManifest = JSON.parse(await readFile(join(ghDirectory, "runtime.json"), "utf8"));
  assert.equal(ghManifest.architecture, suffix);
  assert.equal(ghManifest.executable, "bin/gh");
  assert.equal(ghManifest.executableSha256, sha256(await readFile(ghBinary)));
  assert.equal(run("lipo", ["-archs", ghBinary]).trim(), arch === "aarch64" ? "arm64" : "x86_64");
  if (profile === "notarized") {
    run("cargo", ["run", "--quiet", "--manifest-path", "src-tauri/Cargo.toml", "--features", "dev-tools", "--bin", "verify-codex-engine", "--", join(engineDirectory, "codex"), pin.version]);
    assert.ok(run(ghBinary, ["--version"]).startsWith("gh version "));
  }
  await readFile(join(runtime, "codex-engine/LICENSE")); await readFile(join(runtime, "github-cli/LICENSE"));
  await readFile(join(runtime, "notices/THIRD-PARTY-NOTICES.txt"));
  const mainBytes = await readFile(executable);
  if (!process.env.ORCHESTRATOR_UPDATER_PUBLIC_KEY || !mainBytes.includes(Buffer.from(process.env.ORCHESTRATOR_UPDATER_PUBLIC_KEY.trim()))) throw new Error("The release verification key is not embedded in the application");
  for (const name of ["TAURI_SIGNING_PRIVATE_KEY", "APPLE_CERTIFICATE", "APPLE_PASSWORD"]) {
    const secret = process.env[name];
    if (secret?.length > 16 && mainBytes.includes(Buffer.from(secret))) throw new Error(`A release secret was embedded in the application: ${name}`);
  }
  async function scan(path) {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      assert.ok(!/(?:generate-bindings|verify-codex-engine|\.log$|auth\.json|\.p12$|\.key$)/.test(entry.name), `Private/development resource: ${entry.name}`);
      if (entry.isDirectory()) await scan(join(path, entry.name));
    }
  }
  await scan(app);
}
try {
  const archive = resolve(directory, `Orchestrator_${arch}.app.tar.gz`);
  run("cargo", ["run", "--quiet", "--manifest-path", "src-tauri/Cargo.toml", "--features", "dev-tools", "--bin", "verify-update-signature", "--", archive, `${archive}.sig`]);
  const entries = run("tar", ["-tzf", archive]).split("\n").filter(Boolean);
  assert.ok(entries.every((entry) => !entry.startsWith("/") && !entry.split("/").includes("..")));
  run("tar", ["-xzf", archive, "-C", staging]);
  await inspectApp(join(staging, "Orchestrator.app"));
  const mount = join(staging, "installer");
  run("hdiutil", ["attach", resolve(directory, `Orchestrator_${arch}.dmg`), "-readonly", "-nobrowse", "-mountpoint", mount]);
  try {
    assert.equal(await readlink(join(mount, "Applications")), "/Applications", "Installer Applications shortcut must target /Applications");
    const config = JSON.parse(await readFile("src-tauri/tauri.conf.json", "utf8"));
    const background = config.bundle.macOS.dmg.background;
    assert.ok(background, "Installer background must be configured");
    assert.equal(
      sha256(await readFile(join(mount, ".background", basename(background)))),
      sha256(await readFile(resolve("src-tauri", background))),
      "Installer background must match the configured artwork",
    );
    await inspectApp(join(mount, "Orchestrator.app"));
  }
  finally { run("hdiutil", ["detach", mount]); }
  console.log(`Both distributed ${arch} packages passed ${profile === "community" ? "ad-hoc signing (NOT Apple notarization)" : "signing and notarization"}, updater-signature, installer artwork/shortcut and resource checks.`);
} finally { await rm(staging, { recursive: true, force: true }); }
