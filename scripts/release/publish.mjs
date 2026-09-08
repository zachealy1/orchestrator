import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { ARCHES, REPOSITORY, github, manifest, sha256, requireEnvironment, compareVersions, releases } from "./lib.mjs";

async function optional(api, path) {
  try { return await api(path); }
  catch (error) { if (error.message.includes("(404)")) return null; throw error; }
}

// Publish the exact tested commit. A concurrent writer cannot overwrite the feed:
// the final non-forced ref update must fast-forward from the revision read here.
export async function publish({ version, sourceSha, files, notes, api = github, listReleases = releases, fetcher = fetch, token = process.env.GH_TOKEN }) {
  if (!/^[a-f0-9]{40}$/.test(sourceSha ?? "")) throw new Error("An exact tested source SHA is required");
  const next = manifest(version, files);
  const prefix = `repos/${REPOSITORY}`;
  const comparison = await api(`${prefix}/compare/${sourceSha}...main`);
  if (!["ahead", "identical"].includes(comparison.status)) throw new Error("Release source must be an ancestor of main");
  const pkg = await api(`${prefix}/contents/package.json?ref=${sourceSha}`);
  if (JSON.parse(Buffer.from(pkg.content, "base64")).version !== version) throw new Error("Release version differs from tested source");
  const feed = await optional(api, `${prefix}/git/ref/heads/update-feed`);
  let feedCommit;
  if (feed) {
    feedCommit = await api(`${prefix}/git/commits/${feed.object.sha}`);
    const previous = await api(`${prefix}/contents/beta.json?ref=${feed.object.sha}`);
    const value = JSON.parse(Buffer.from(previous.content, "base64"));
    if (compareVersions(version, value.version) <= 0) throw new Error("Refusing a non-increasing update feed version");
  }
  const tagName = `v${version}`;
  const tag = await optional(api, `${prefix}/git/ref/tags/${tagName}`);
  if (tag) {
    let object = tag.object;
    for (let depth = 0; object.type === "tag" && depth < 8; depth++) object = (await api(`${prefix}/git/tags/${object.sha}`)).object;
    if (object.type !== "commit" || object.sha !== sourceSha) throw new Error("Release tag conflicts with tested source");
  }
  const existing = await listReleases(REPOSITORY);
  if (existing.some((r) => r.tag_name === tagName && !r.draft)) throw new Error("Published releases are immutable. Create a new version.");
  if (!tag) await api(`${prefix}/git/refs`, { method: "POST", body: { ref: `refs/tags/${tagName}`, sha: sourceSha } });
  let release = existing.find((r) => r.tag_name === tagName && r.draft);
  release ??= await api(`${prefix}/releases`, { method: "POST", body: {
    tag_name: tagName, name: `Orchestrator ${version}`, target_commitish: sourceSha,
    draft: true, prerelease: version.includes("-"), body: notes,
  } });
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

export async function readArtifacts(root) {
  const files = [];
  for (const arch of ARCHES) {
    const name = `SHA256SUMS-${arch}.txt`, checksums = await readFile(join(root, name), "utf8");
    for (const suffix of ["dmg", "app.tar.gz", "app.tar.gz.sig"]) {
      const assetName = `Orchestrator_${arch}.${suffix}`, bytes = await readFile(join(root, assetName)), digest = sha256(bytes);
      if (!checksums.split("\n").includes(`${digest}  ${assetName}`)) throw new Error(`Checksum mismatch for ${assetName}`);
      files.push({ name: assetName, bytes, digest, verified: true, ...(suffix.endsWith("sig") ? { text: bytes.toString() } : {}) });
    }
    files.push({ name, bytes: Buffer.from(checksums), digest: sha256(checksums) });
  }
  return files;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  requireEnvironment(["GH_TOKEN", "RELEASE_VERSION", "RELEASE_SOURCE_SHA"]);
  await publish({ version: process.env.RELEASE_VERSION, sourceSha: process.env.RELEASE_SOURCE_SHA,
    files: await readArtifacts(process.argv[2] ?? "release-artifacts"), notes: await readFile("docs/public/RELEASE-NOTES.md", "utf8") });
  console.log("Verified complete release published; update feed advanced atomically.");
}
