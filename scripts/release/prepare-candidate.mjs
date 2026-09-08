import { readFile, writeFile, appendFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { stableCandidate, engineAssets, nextAppVersion, github, releases, sha256, REPOSITORY, requireEnvironment } from "./lib.mjs";
requireEnvironment(["GH_TOKEN"]);
const pinPath = "src-tauri/resources/codex-engine/release.json";
const currentPin = JSON.parse(await readFile(pinPath, "utf8"));
const candidate = stableCandidate(await releases("openai/codex"), currentPin.version);
if (!candidate) process.exit(0);
const branch = `codex/engine-upgrade-${candidate.version}`;
const previous = await github(`repos/${REPOSITORY}/pulls?state=all&head=zachealy1:${encodeURIComponent(branch)}`);
if (previous.length) { console.log("Candidate was already processed; use the sanitized tracking issue for recovery."); process.exit(0); }
const artifacts = engineAssets(candidate);
const hosts = engineAssets(candidate, "codex-code-mode-host");
for (const asset of [...Object.values(artifacts), ...Object.values(hosts)]) {
  const response = await fetch(asset.browser_download_url);
  if (!response.ok) throw new Error("Upstream engine download failed");
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length !== asset.size || sha256(bytes) !== asset.hash) throw new Error("Upstream engine integrity verification failed");
}
const packageJson = JSON.parse(await readFile("package.json", "utf8"));
const oldVersion = packageJson.version, version = nextAppVersion(oldVersion);
await writeFile(pinPath, `${JSON.stringify({ ...currentPin, version: candidate.version,
  archives: Object.fromEntries(Object.entries(artifacts).map(([target, asset]) => [target, asset.hash])),
  codeModeHostArchives: Object.fromEntries(Object.entries(hosts).map(([target, asset]) => [target, asset.hash])),
}, null, 2)}\n`);
for (const file of ["package.json", "package-lock.json", "src-tauri/tauri.conf.json"]) {
  const data = JSON.parse(await readFile(file, "utf8")); data.version = version;
  if (data.packages?.[""]) data.packages[""].version = version;
  await writeFile(file, `${JSON.stringify(data, null, 2)}\n`);
}
for (const file of ["src-tauri/Cargo.toml", "src-tauri/Cargo.lock"]) {
  const content = await readFile(file, "utf8");
  const updated = content.replace(new RegExp(`(name = "orchestrator"\\nversion = ")${oldVersion.replaceAll(".", "\\.")}("\\n)`), `$1${version}$2`);
  if (updated === content) throw new Error(`Cannot synchronize version in ${file}`);
  await writeFile(file, updated);
}
const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
git("switch", "-c", branch);
git("add", pinPath, "package.json", "package-lock.json", "src-tauri/tauri.conf.json", "src-tauri/Cargo.toml", "src-tauri/Cargo.lock");
git("-c", "user.name=Orchestrator release bot", "-c", "user.email=release-bot@users.noreply.github.com", "commit", "-m", `chore(engine): bundle Codex ${candidate.version}`);
git("push", "origin", branch);
const pr = await github(`repos/${REPOSITORY}/pulls`, { method: "POST", body: {
  title: `chore(engine): bundle Codex ${candidate.version}`, head: branch, base: "main",
  body: "Automated engine-only candidate. Publication requires strict scope, protocol, integration, security, signing and both-architecture checks. No behavior or test changes are permitted.",
} });
if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `sha=${git("rev-parse", "HEAD")}\npr=${pr.number}\nversion=${version}\nengine=${candidate.version}\n`);
