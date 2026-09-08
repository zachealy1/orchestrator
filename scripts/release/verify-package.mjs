import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
const [directory, arch] = process.argv.slice(2);
assert.ok(["aarch64", "x86_64"].includes(arch));
const staging = await mkdtemp(join(tmpdir(), "orchestrator-package-audit-"));
const run = (bin, args) => execFileSync(bin, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
async function inspectApp(app) {
  const version = JSON.parse(await readFile("package.json", "utf8")).version;
  for (const [key, expected] of Object.entries({ CFBundleIdentifier: "com.zachealy.orchestrator", CFBundleShortVersionString: version, CFBundleVersion: version, LSMinimumSystemVersion: "15.0" })) {
    assert.equal(run("/usr/libexec/PlistBuddy", ["-c", `Print :${key}`, join(app, "Contents/Info.plist")]).trim(), expected);
  }
  run("codesign", ["--verify", "--deep", "--strict", app]);
  // Gatekeeper and stapling validate the actual redistributed copy, not an intermediate path.
  run("spctl", ["--assess", "--type", "execute", app]); run("xcrun", ["stapler", "validate", app]);
  const executable = join(app, "Contents/MacOS/orchestrator");
  assert.equal(run("lipo", ["-archs", executable]).trim(), arch === "aarch64" ? "arm64" : "x86_64");
  const binaries = await readdir(join(app, "Contents/MacOS")); assert.deepEqual(binaries, ["orchestrator"]);
  const runtime = join(app, "Contents/Resources/resources");
  const suffix = arch === "aarch64" ? "arm64" : "x64";
  const pin = JSON.parse(await readFile("src-tauri/resources/codex-engine/release.json", "utf8"));
  assert.ok(run(join(runtime, `codex-engine/darwin-${suffix}/codex`), ["--version"]).includes(pin.version));
  assert.ok(run(join(runtime, `github-cli/darwin-${suffix}/bin/gh`), ["--version"]).startsWith("gh version "));
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
  try { await inspectApp(join(mount, "Orchestrator.app")); }
  finally { run("hdiutil", ["detach", mount]); }
  console.log(`Both distributed ${arch} packages passed signing, notarization and resource checks.`);
} finally { await rm(staging, { recursive: true, force: true }); }
