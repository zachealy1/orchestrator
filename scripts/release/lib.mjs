import { createHash } from "node:crypto";
export const REPOSITORY = "zachealy1/orchestrator";
export const ARCHES = ["aarch64", "x86_64"];
export const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
export function versionParts(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-beta\.(\d+))?$/.exec(version);
  if (!match) throw new Error(`Unsupported release version: ${version}`);
  return match.slice(1).map((part, index) => part === undefined && index === 3 ? Infinity : Number(part));
}
export function compareVersions(a, b) {
  const left = versionParts(a), right = versionParts(b);
  for (let i = 0; i < left.length; i++) if (left[i] !== right[i]) return left[i] > right[i] ? 1 : -1;
  return 0;
}
export function nextAppVersion(current) {
  const [major, minor, patch, beta] = versionParts(current);
  return Number.isFinite(beta) ? `${major}.${minor}.${patch}-beta.${beta + 1}` : `${major}.${minor}.${patch + 1}`;
}
export function stableCandidate(releases, pinned) {
  return releases.filter((release) => !release.draft && !release.prerelease && /^rust-v\d+\.\d+\.\d+$/.test(release.tag_name))
    .map((release) => ({ ...release, version: release.tag_name.slice(6) }))
    .filter((release) => compareVersions(release.version, pinned) > 0)
    .sort((a, b) => compareVersions(b.version, a.version))[0] ?? null;
}
export function engineAssets(release, component = "codex") {
  if (!["codex", "codex-code-mode-host"].includes(component)) throw new Error("Unknown engine component");
  return Object.fromEntries(ARCHES.map((arch) => {
    const target = `${arch}-apple-darwin`;
    const matches = release.assets.filter((a) => a.name === `${component}-${target}.tar.gz`);
    const asset = matches.length === 1 ? matches[0] : null;
    if (!asset || !/^sha256:[a-f0-9]{64}$/.test(asset.digest ?? "") || asset.size <= 0 || asset.size > 300 * 1024 * 1024) {
      throw new Error(`Missing verified upstream asset or integrity metadata: ${component}-${target}`);
    }
    const expected = `https://github.com/openai/codex/releases/download/${release.tag_name}/${asset.name}`;
    if (asset.browser_download_url !== expected) throw new Error("Untrusted upstream asset location");
    return [target, { ...asset, hash: asset.digest.slice(7) }];
  }));
}
export function assetKind(name) {
  const match = /^Orchestrator_(aarch64|x86_64)\.(dmg|app\.tar\.gz)$/.exec(name);
  return match ? { architecture: match[1], kind: match[2] === "dmg" ? "installer" : "update" } : null;
}
export function downloadSnapshot(releases, previous = null, timestamp = new Date().toISOString()) {
  const old = new Map((previous?.assets ?? []).map((asset) => [asset.id, asset]));
  const assets = releases.filter((r) => !r.draft).flatMap((release) => release.assets.flatMap((asset) => {
    const kind = assetKind(asset.name); if (!kind) return [];
    if (!Number.isSafeInteger(asset.download_count) || asset.download_count < 0) throw new Error("Invalid GitHub download count");
    const prior = old.get(asset.id);
    return [{ id: asset.id, version: release.tag_name, ...kind, downloads: asset.download_count,
      change: prior ? Math.max(0, asset.download_count - prior.downloads) : asset.download_count,
      counterReset: Boolean(prior && asset.download_count < prior.downloads), missing: false }];
  }));
  const ids = new Set(assets.map((a) => a.id));
  // Keep removed/replaced asset totals rather than subtracting them from historical downloads.
  for (const prior of old.values()) if (!ids.has(prior.id)) assets.push({ ...prior, change: 0, missing: true });
  return { timestamp, previousTimestamp: previous?.timestamp ?? null, assets };
}
export function manifest(version, assets) {
  versionParts(version);
  const platforms = {};
  for (const arch of ARCHES) {
    const update = assets.find((a) => a.name === `Orchestrator_${arch}.app.tar.gz`);
    const installer = assets.find((a) => a.name === `Orchestrator_${arch}.dmg`);
    const signature = assets.find((a) => a.name === `Orchestrator_${arch}.app.tar.gz.sig`);
    if (!update?.verified || !installer?.verified || !signature?.text?.trim()) throw new Error(`Incomplete verified release: ${arch}`);
    platforms[`darwin-${arch}`] = { url: `https://github.com/${REPOSITORY}/releases/download/v${version}/${update.name}`, signature: signature.text.trim() };
  }
  return { version, notes: `Orchestrator ${version}. See the release notes before installing.`, pub_date: new Date().toISOString(), platforms };
}
export function dailyDownloadChanges(snapshots) {
  const groups = new Map();
  const seen = new Set();
  for (const snapshot of snapshots) {
    if (seen.has(snapshot.timestamp)) continue;
    seen.add(snapshot.timestamp);
    // An initial lifetime total is not a day's new downloads.
    if (!snapshot.previousTimestamp) continue;
    for (const asset of snapshot.assets) {
      const date = snapshot.timestamp.slice(0, 10);
      const key = `${date}|${asset.version}|${asset.architecture}|${asset.kind}`;
      const row = groups.get(key) ?? { date, version: asset.version, architecture: asset.architecture, kind: asset.kind, change: 0 };
      row.change += asset.change;
      groups.set(key, row);
    }
  }
  return [...groups.values()].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}
export function requireEnvironment(names, env = process.env) {
  const missing = names.filter((name) => !env[name]?.trim());
  if (missing.length) throw new Error(`Required release configuration missing: ${missing.join(", ")}. Publication is blocked.`);
}
export async function github(path, { method = "GET", body, token = process.env.GH_TOKEN, headers = {} } = {}) {
  const response = await fetch(`https://api.github.com/${path}`, { method, headers: {
    Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers,
  }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  if (!response.ok) throw new Error(`GitHub request failed (${response.status}): ${method} ${path.split("?")[0]}`);
  return response.status === 204 ? null : response.json();
}
export async function releases(repository) {
  const result = [];
  for (let page = 1; ; page++) {
    const values = await github(`repos/${repository}/releases?per_page=100&page=${page}`);
    result.push(...values); if (values.length < 100) return result;
  }
}
