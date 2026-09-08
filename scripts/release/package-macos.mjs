import { mkdtemp, readFile, writeFile, readdir, copyFile, mkdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import { confidentialRun } from "./safe-process.mjs";
import { sha256, ARCHES } from "./lib.mjs";
const run = confidentialRun;
if (process.platform !== "darwin" || process.env.CI !== "true") throw new Error("Signed public packaging runs only on the dedicated macOS release runner");
run(process.execPath, ["scripts/release/check-config.mjs", "--sign"]);
const arch = process.arch === "arm64" ? "aarch64" : "x86_64";
if (!ARCHES.includes(arch)) throw new Error("Unsupported architecture");
const target = `${arch}-apple-darwin`;
const staging = await mkdtemp(join(tmpdir(), "orchestrator-signing-"));
const keychain = join(staging, "release.keychain-db"), password = randomBytes(32).toString("hex");
const certificate = join(staging, "developer-id.p12");
const originalKeychains = run("security", ["list-keychains", "-d", "user"], { encoding: "utf8" }).match(/"([^"]+)"/g)?.map((s) => s.slice(1, -1)) ?? [];
try {
  await writeFile(certificate, Buffer.from(process.env.APPLE_CERTIFICATE, "base64"), { mode: 0o600 });
  const quiet = { stdio: "pipe" };
  run("security", ["create-keychain", "-p", password, keychain], quiet);
  run("security", ["set-keychain-settings", "-lut", "21600", keychain], quiet);
  run("security", ["unlock-keychain", "-p", password, keychain], quiet);
  run("security", ["import", certificate, "-k", keychain, "-P", process.env.APPLE_CERTIFICATE_PASSWORD, "-T", "/usr/bin/codesign"], quiet);
  run("security", ["set-key-partition-list", "-S", "apple-tool:,apple:,codesign:", "-s", "-k", password, keychain], quiet);
  run("security", ["list-keychains", "-d", "user", "-s", keychain, ...originalKeychains], quiet);
  run("npx", ["tauri", "build", "--target", target, "--bundles", "app,dmg", "--config", JSON.stringify({ bundle: {
    createUpdaterArtifacts: true, macOS: { signingIdentity: process.env.APPLE_SIGNING_IDENTITY },
  } })]);
  const bundleRoot = resolve("src-tauri/target", target, "release/bundle");
  const app = join(bundleRoot, "macos/Orchestrator.app");
  run("codesign", ["--verify", "--deep", "--strict", "--verbose=2", app]);
  run("spctl", ["--assess", "--type", "execute", "--verbose=4", app]);
  run("xcrun", ["stapler", "validate", app]);
  const dmgName = (await readdir(join(bundleRoot, "dmg"))).find((name) => name.endsWith(".dmg"));
  if (!dmgName) throw new Error("Installer was not produced");
  const dmg = join(bundleRoot, "dmg", dmgName);
  run("xcrun", ["notarytool", "submit", dmg, "--apple-id", process.env.APPLE_ID, "--password", process.env.APPLE_PASSWORD, "--team-id", process.env.APPLE_TEAM_ID, "--wait"], quiet);
  run("xcrun", ["stapler", "staple", dmg]); run("xcrun", ["stapler", "validate", dmg]);
  run("spctl", ["--assess", "--type", "open", "--context", "context:primary-signature", "--verbose=4", dmg]);
  const output = resolve("release-artifacts"); await mkdir(output, { recursive: true });
  const sources = [[dmg, `Orchestrator_${arch}.dmg`],
    [join(bundleRoot, "macos/Orchestrator.app.tar.gz"), `Orchestrator_${arch}.app.tar.gz`],
    [join(bundleRoot, "macos/Orchestrator.app.tar.gz.sig"), `Orchestrator_${arch}.app.tar.gz.sig`]];
  for (const [source, name] of sources) await copyFile(source, join(output, name));
  run(process.execPath, ["scripts/release/verify-package.mjs", output, arch]);
  const hashes = await Promise.all(sources.map(async ([, name]) => `${sha256(await readFile(join(output, name)))}  ${name}`));
  await writeFile(join(output, `SHA256SUMS-${arch}.txt`), `${hashes.join("\n")}\n`);
} finally {
  try { run("security", ["list-keychains", "-d", "user", "-s", ...originalKeychains]); }
  finally {
    try { run("security", ["delete-keychain", keychain]); } catch { /* may not have been created */ }
    await rm(staging, { recursive: true, force: true });
  }
}
