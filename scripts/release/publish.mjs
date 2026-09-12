import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { ARCHES, REPOSITORY, github, manifest, sha256, requireEnvironment, compareVersions, releases } from "./lib.mjs";
import { distribution, distributionNotes, validateDistributionVersion, validatePackageReceipt, requirePublicationApproval } from "./distribution.mjs";

async function optional(api, path) {
  try { return await api(path); }
  catch (error) { if (error.message.includes("(404)")) return null; throw error; }
}

// Publish the exact selected commit. A concurrent writer cannot overwrite the feed:
// the final non-forced ref update must fast-forward from the revision read here.
export async function publish({ version, sourceSha, files, notes, profile = "notarized", delivery = "updater", approval = process.env, api = github, listReleases = releases, fetcher = fetch, token = process.env.GH_TOKEN }) {
  if (!/^[a-f0-9]{40}$/.test(sourceSha ?? "")) throw new Error("An exact selected source SHA is required");
  validateDistributionVersion(profile, version);
  if (!["manual", "updater"].includes(delivery)) throw new Error("Unknown delivery mode");
  const manual = delivery === "manual";
  if (manual) {
    if (profile !== "community" || approval.MANUAL_BETA_APPROVED_SHA !== sourceSha) throw new Error("Manual Apple Silicon beta requires maintainer approval of the exact source SHA");
    const names = files.map(file => file.name).sort();
    if (JSON.stringify(names) !== JSON.stringify(["Orchestrator_aarch64.dmg", "SHA256SUMS.txt", "verification-aarch64.json"])
      || files.some(file => file.digest !== sha256(file.bytes))) throw new Error("Manual beta permits only the verified Apple Silicon installer, receipt and checksums");
  } else requirePublicationApproval(profile, sourceSha, approval);
  const next = manual ? null : { ...manifest(version, files), distribution: profile, notes: distributionNotes(profile, `Orchestrator ${version}. See the release notes before installing.`) };
  const releaseNotes = manual
    ? `Experimental community beta — Apple Silicon only; not notarized by Apple. Manual installation and updates only. No update feed is published by this release.\n\n${notes}`
    : distributionNotes(profile, notes);
  const prefix = `repos/${REPOSITORY}`;
  const sourceBranch = "main";
  const comparison = await api(`${prefix}/compare/${sourceSha}...${sourceBranch}`);
  if (!["ahead", "identical"].includes(comparison.status)) throw new Error(`Release source must be an ancestor of ${sourceBranch}`);
  const pkg = await api(`${prefix}/contents/package.json?ref=${sourceSha}`);
  if (JSON.parse(Buffer.from(pkg.content, "base64")).version !== version) throw new Error("Release version differs from selected source");
  if (manual) {
    const checks = await api(`${prefix}/commits/${sourceSha}/check-runs?check_name=checks&filter=latest`);
    if (!checks.check_runs?.some(check => check.name === "checks" && check.app?.slug === "github-actions" && check.head_sha === sourceSha && check.status === "completed" && check.conclusion === "success")) throw new Error("Required source checks have not passed for this exact source SHA");
  }
  const feed = manual ? null : await optional(api, `${prefix}/git/ref/heads/update-feed`);
  let feedCommit;
  if (feed) {
    feedCommit = await api(`${prefix}/git/commits/${feed.object.sha}`);
    const previous = await api(`${prefix}/contents/beta.json?ref=${feed.object.sha}`);
    const value = JSON.parse(Buffer.from(previous.content, "base64"));
    if (compareVersions(version, value.version) <= 0) throw new Error("Refusing a non-increasing update feed version");
    // Older feeds had only notarized packages. Never silently lower existing users' trust level.
    if (profile === "community" && distribution(value.distribution ?? "notarized") !== "community") throw new Error("Refusing to replace a notarized update feed with non-notarized packages");
  }
  const tagName = `v${version}`;
  const tag = await optional(api, `${prefix}/git/ref/tags/${tagName}`);
  if (tag) {
    let object = tag.object;
    for (let depth = 0; object.type === "tag" && depth < 8; depth++) object = (await api(`${prefix}/git/tags/${object.sha}`)).object;
    if (object.type !== "commit" || object.sha !== sourceSha) throw new Error("Release tag conflicts with selected source");
  }
  const existing = await listReleases(REPOSITORY);
  if (existing.some((r) => r.tag_name === tagName && !r.draft)) throw new Error("Published releases are immutable. Create a new version.");
  if (manual && existing.some(r => !r.draft && /^v\d+\.\d+\.\d+(?:-beta\.\d+)?$/.test(r.tag_name) && compareVersions(version, r.tag_name.slice(1)) <= 0)) throw new Error("Manual release version must increase");
  if (!tag) await api(`${prefix}/git/refs`, { method: "POST", body: { ref: `refs/tags/${tagName}`, sha: sourceSha } });
  let release = existing.find((r) => r.tag_name === tagName && r.draft);
  release ??= await api(`${prefix}/releases`, { method: "POST", body: {
    tag_name: tagName, name: `Orchestrator ${version}`, target_commitish: sourceSha,
    draft: true, prerelease: version.includes("-"), body: releaseNotes,
  } });
  if (release.body !== undefined && !release.body.includes(releaseNotes)) throw new Error("Existing draft release notes differ from the requested distribution; review the draft before retrying");
  if (release.assets.some(asset => !files.some(file => file.name === asset.name))) throw new Error("Draft contains unexpected assets; review before publication");
  const expectedUpload = `https://uploads.github.com/${prefix}/releases/${release.id}/assets`;
  if (release.upload_url.replace(/\{.*$/, "") !== expectedUpload) throw new Error("Unexpected upload destination");
  const headers = { Authorization: `Bearer ${token}`, "X-GitHub-Api-Version": "2022-11-28" };
  for (const file of files) {
    let asset = release.assets.find((a) => a.name === file.name);
    if (!asset) {
      const response = await fetcher(`${expectedUpload}?name=${encodeURIComponent(file.name)}`, {
        method: "POST", headers: { ...headers, "Content-Type": "application/octet-stream" }, body: file.bytes,
      });
      if (!response.ok) throw new Error(`Asset upload failed (${response.status}); previous feed is unchanged`);
      asset = await response.json();
    }
    if (asset.digest && asset.digest !== `sha256:${file.digest}`) throw new Error("Existing draft asset differs; replacement is forbidden");
    const response = await fetcher(`https://api.github.com/${prefix}/releases/assets/${asset.id}`, {
      headers: { ...headers, Accept: "application/octet-stream" },
    });
    if (!response.ok || sha256(Buffer.from(await response.arrayBuffer())) !== file.digest) throw new Error("Uploaded artifact verification failed");
  }
  const checkedTag = await api(`${prefix}/git/ref/tags/${tagName}`);
  if (checkedTag.object.sha !== (tag?.object.sha ?? sourceSha)) throw new Error("Release tag changed during publication");
  await api(`${prefix}/releases/${release.id}`, { method: "PATCH", body: { draft: false } });
  if (manual) return; // Never read, create or advance the updater feed in this mode.
  const tree = await api(`${prefix}/git/trees`, { method: "POST", body: {
    ...(feedCommit ? { base_tree: feedCommit.tree.sha } : {}),
    tree: [{ path: "beta.json", mode: "100644", type: "blob", content: JSON.stringify(next, null, 2) + "\n" }],
  } });
  const commit = await api(`${prefix}/git/commits`, { method: "POST", body: {
    message: `Release Orchestrator ${version}`, tree: tree.sha, parents: feed ? [feed.object.sha] : [],
  } });
  await api(`${prefix}/git/${feed ? "refs/heads/update-feed" : "refs"}`, {
    method: feed ? "PATCH" : "POST", body: feed ? { sha: commit.sha, force: false } : { ref: "refs/heads/update-feed", sha: commit.sha },
  });
}

export function manualArtifacts(verified, { version, sourceSha }) {
  const installer = verified.find(file => file.name === "Orchestrator_aarch64.dmg");
  const originalReceipt = verified.find(file => file.name === "verification-aarch64.json");
  if (!installer?.verified || !originalReceipt) throw new Error("Verified Apple Silicon package is required");
  const receipt = JSON.parse(originalReceipt.bytes);
  if (receipt.sourceSha !== sourceSha || receipt.version !== version || receipt.distribution !== "community" || receipt.architecture !== "aarch64" || receipt.artifacts?.[installer.name] !== sha256(installer.bytes)) throw new Error("Manual installer differs from the package receipt");
  const bytes = Buffer.from(JSON.stringify({ schemaVersion: 1, sourceSha, version, architecture: "aarch64", distribution: "community",
    delivery: "manual", notarized: false, updaterFeedPublished: false, manualTesting: "maintainer-reported; clean-Mac and two-version update matrix not claimed",
    artifacts: { [installer.name]: installer.digest } }, null, 2) + "\n");
  const files = [installer, { name: "verification-aarch64.json", bytes, digest: sha256(bytes) }];
  const checksums = Buffer.from(files.map(file => `${file.digest}  ${file.name}`).join("\n") + "\n");
  return [...files, { name: "SHA256SUMS.txt", bytes: checksums, digest: sha256(checksums) }];
}

export async function readArtifacts(root, { profile = "notarized", version, sourceSha, arches = ARCHES } = {}) {
  const files = [];
  for (const arch of arches) {
    if (!ARCHES.includes(arch)) throw new Error("Unsupported package architecture");
    const packaged = [];
    const name = `SHA256SUMS-${arch}.txt`, checksums = await readFile(join(root, name), "utf8");
    for (const suffix of ["dmg", "app.tar.gz", "app.tar.gz.sig"]) {
      const assetName = `Orchestrator_${arch}.${suffix}`, bytes = await readFile(join(root, assetName)), digest = sha256(bytes);
      if (!checksums.split("\n").includes(`${digest}  ${assetName}`)) throw new Error(`Checksum mismatch for ${assetName}`);
      packaged.push({ name: assetName, bytes, digest, verified: true, ...(suffix.endsWith("sig") ? { text: bytes.toString() } : {}) });
    }
    const receiptName = `verification-${arch}.json`, receiptBytes = await readFile(join(root, receiptName)), receiptDigest = sha256(receiptBytes);
    if (!checksums.split("\n").includes(`${receiptDigest}  ${receiptName}`)) throw new Error("Package verification receipt checksum mismatch");
    validatePackageReceipt(JSON.parse(receiptBytes), { profile, version, sourceSha, arch, assets: packaged });
    files.push(...packaged, { name: receiptName, bytes: receiptBytes, digest: receiptDigest });
    files.push({ name, bytes: Buffer.from(checksums), digest: sha256(checksums) });
  }
  return files;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  requireEnvironment(["GH_TOKEN", "RELEASE_VERSION", "RELEASE_SOURCE_SHA"]);
  const profile = distribution(process.env.RELEASE_DISTRIBUTION ?? "notarized");
  const delivery = process.env.RELEASE_DELIVERY ?? "updater";
  const options = { profile, version: process.env.RELEASE_VERSION, sourceSha: process.env.RELEASE_SOURCE_SHA };
  const verified = await readArtifacts(process.argv[2] ?? "release-artifacts", { ...options, ...(delivery === "manual" ? { arches: ["aarch64"] } : {}) });
  await publish({ version: process.env.RELEASE_VERSION, sourceSha: process.env.RELEASE_SOURCE_SHA,
    profile, delivery, files: delivery === "manual" ? manualArtifacts(verified, options) : verified, notes: await readFile("docs/public/RELEASE-NOTES.md", "utf8") });
  console.log(delivery === "manual" ? "Verified Apple Silicon manual beta published; updater feed untouched." : "Verified complete release published; update feed advanced atomically.");
}
