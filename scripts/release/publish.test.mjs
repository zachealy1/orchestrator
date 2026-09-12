import { test } from "node:test";
import assert from "node:assert/strict";
import { publish, manualArtifacts } from "./publish.mjs";
import { REPOSITORY, sha256 } from "./lib.mjs";

const sourceSha = "a".repeat(40), version = "0.2.0-beta.1";
const files = ["aarch64", "x86_64"].flatMap(arch => ["dmg", "app.tar.gz", "app.tar.gz.sig"].map(suffix => {
  const name = `Orchestrator_${arch}.${suffix}`, bytes = Buffer.from(name);
  return { name, bytes, digest: sha256(bytes), verified: true, text: "signature" };
}));
function harness(options = {}) {
  const calls = [], prefix = `repos/${REPOSITORY}`;
  const artifacts = options.files ?? files;
  let tag = options.conflictingTag ? "b".repeat(40) : options.existingTag ? sourceSha : null;
  const release = { id: 1, tag_name: `v${version}`, draft: true,
    upload_url: `https://uploads.github.com/${prefix}/releases/1/assets{?name,label}`,
    assets: artifacts.map((f, i) => ({ id: i + 1, name: f.name, digest: `sha256:${options.differentAsset && i === 0 ? "0".repeat(64) : f.digest}` })) };
  const api = async (path, request = {}) => {
    calls.push({ path, ...request });
    if (path.includes("/compare/")) return { status: options.diverged ? "diverged" : "ahead" };
    if (path.includes("/contents/package.json")) return { content: Buffer.from(JSON.stringify({ version: options.wrongVersion ? "0.1.0" : version })).toString("base64") };
    if (path.includes("/check-runs")) return { check_runs: [{ name: "checks", app: { slug: "github-actions" }, head_sha: sourceSha, status: "completed", conclusion: options.failedChecks ? "failure" : "success" }] };
    if (path.endsWith("/git/ref/heads/update-feed")) { if (!options.feedVersion) throw new Error("(404)"); return { object: { sha: "old-feed" } }; }
    if (path.endsWith("/git/commits/old-feed")) return { tree: { sha: "old-tree" } };
    if (path.includes("/contents/beta.json")) return { content: Buffer.from(JSON.stringify({ version: options.feedVersion, ...(options.feedProfile ? { distribution: options.feedProfile } : {}) })).toString("base64") };
    if (path.endsWith(`/git/ref/tags/v${version}`)) { if (!tag) throw new Error("(404)"); return { object: { type: "commit", sha: tag } }; }
    if (path.endsWith("/git/refs") && request.body?.ref.startsWith("refs/tags/")) { tag = request.body.sha; return {}; }
    if (path.endsWith("/releases")) return release;
    if (path.endsWith("/releases/1")) return {};
    if (path.endsWith("/git/trees")) return { sha: "new-tree" };
    if (path.endsWith("/git/commits")) return { sha: "new-feed" };
    if (path.endsWith("/git/refs/heads/update-feed") || path.endsWith("/git/refs")) {
      if (options.concurrent) throw new Error("GitHub request failed (422): non-fast-forward"); return {};
    }
    throw new Error(`Unexpected test path ${path}`);
  };
  const fetcher = async url => {
    const index = Number(url.split("/").at(-1)) - 1;
    return { ok: !options.partialFailure || index < 3, arrayBuffer: async () => artifacts[index].bytes };
  };
  return { calls, run: overrides => publish({ version, sourceSha, files, notes: "Notes", api, fetcher, approval: { BETA_REHEARSAL_APPROVED: "true" },
    listReleases: async () => options.published ? [{ ...release, draft: false }] : [], ...overrides }) };
}
test("first release tags the tested SHA and creates only a complete orphan feed", async () => {
  const h = harness(); await h.run();
  assert.equal(h.calls.find(c => c.path.endsWith("/releases")).body.target_commitish, sourceSha);
  assert.deepEqual(h.calls.find(c => c.body?.ref?.startsWith("refs/tags/")).body, { ref: `refs/tags/v${version}`, sha: sourceSha });
  assert.deepEqual(h.calls.find(c => c.path.endsWith("/git/commits")).body.parents, []);
  assert.deepEqual(h.calls.at(-1).body, { ref: "refs/heads/update-feed", sha: "new-feed" });
  const tree = h.calls.find(c => c.path.endsWith("/git/trees")).body.tree;
  assert.equal(tree[0].path, "beta.json");
  assert.ok(Object.values(JSON.parse(tree[0].content).platforms).every(p => p.url.startsWith(`https://github.com/${REPOSITORY}/releases/`)));
  assert.ok(!h.calls.some(c => c.method && /heads\/main|branch=main/.test(c.path)));
});

const installer = files[0];
const verifiedManual = [installer, { name: "verification-aarch64.json", bytes: Buffer.from(JSON.stringify({
  sourceSha, version, architecture: "aarch64", distribution: "community", artifacts: { [installer.name]: installer.digest },
})) }];
const manualFiles = manualArtifacts(verifiedManual, { version, sourceSha });
const manualOptions = { profile: "community", delivery: "manual", approval: { MANUAL_BETA_APPROVED_SHA: sourceSha }, files: manualFiles };

test("manual beta publishes only Apple Silicon installer assets and never accesses the update feed", async () => {
  const h = harness({ files: manualFiles }); await h.run(manualOptions);
  assert.ok(h.calls.some(c => c.body?.draft === false));
  assert.match(h.calls.find(c => c.path.endsWith("/releases")).body.body, /Manual installation and updates only/);
  assert.ok(h.calls.every(c => !/update-feed|beta\.json|git\/trees|git\/commits/.test(c.path)));
  assert.deepEqual(manualFiles.map(file => file.name).sort(), ["Orchestrator_aarch64.dmg", "SHA256SUMS.txt", "verification-aarch64.json"]);
  assert.ok(!manualFiles.at(-1).bytes.toString().includes(".app.tar.gz"));
  assert.equal(JSON.parse(manualFiles[1].bytes).updaterFeedPublished, false);
});

test("manual approval cannot relax updater gates or authorize another source, architecture or failed checks", async () => {
  for (const overrides of [{ delivery: "updater" }, { delivery: "unknown" }, { profile: "notarized" },
    { approval: {} }, { approval: { MANUAL_BETA_APPROVED_SHA: "b".repeat(40) } }, { files },
    { files: [...manualFiles, installer] }, { files: manualFiles.map(file => ({ ...file, digest: "0".repeat(64) })) }]) {
    const h = harness({ files: manualFiles }); await assert.rejects(h.run({ ...manualOptions, ...overrides }));
    assert.equal(h.calls.filter(c => c.method).length, 0);
  }
  const h = harness({ files: manualFiles, failedChecks: true }); await assert.rejects(h.run(manualOptions), /source checks/);
  assert.equal(h.calls.filter(c => c.method).length, 0);
  assert.throws(() => manualArtifacts(verifiedManual, { version, sourceSha: "b".repeat(40) }));
});
test("incomplete packages and invalid source/version/tag/feed fail before public mutations", async () => {
  for (const options of [{ conflictingTag: true }, { wrongVersion: true }, { diverged: true }, { feedVersion: version }, { feedVersion: "0.2.0" }, { published: true }]) {
    const h = harness(options); await assert.rejects(h.run()); assert.equal(h.calls.filter(c => c.method).length, 0);
  }
  const h = harness(); await assert.rejects(h.run({ files: files.slice(0, 3) })); await assert.rejects(h.run({ sourceSha: "main" }));
  assert.equal(h.calls.length, 0);
});
test("partial uploads and replacement assets never advance or expose a release", async () => {
  for (const options of [{ partialFailure: true }, { differentAsset: true }]) {
    const h = harness(options); await assert.rejects(h.run());
    assert.ok(!h.calls.some(c => c.body?.draft === false || c.path.endsWith("/git/trees")));
  }
});
test("a newer feed is committed against its original parent without force", async () => {
  const h = harness({ feedVersion: "0.1.0", existingTag: true }); await h.run();
  assert.deepEqual(h.calls.at(-1).body, { sha: "new-feed", force: false });
  assert.deepEqual(h.calls.find(c => c.path.endsWith("/git/commits")).body.parents, ["old-feed"]);
});
test("concurrent feed changes fail without retrying or overwriting the competing feed", async () => {
  const h = harness({ feedVersion: "0.1.0", concurrent: true }); await assert.rejects(h.run(), /non-fast-forward/);
  assert.equal(h.calls.filter(c => c.path.endsWith("/git/refs/heads/update-feed")).length, 1);
  assert.equal(h.calls.at(-1).body.force, false);
});

test("community publication is beta-only, bound to main ancestry and visibly non-notarized", async () => {
  const h = harness();
  await h.run({ profile: "community", approval: {} });
  assert.ok(h.calls.some(c => c.path.endsWith(`/compare/${sourceSha}...main`)));
  assert.match(h.calls.find(c => c.path.endsWith("/releases")).body.body, /not notarized by Apple/);
  assert.match(h.calls.find(c => c.path.endsWith("/releases")).body.body, /package integrity checks/);
  const feed = JSON.parse(h.calls.find(c => c.path.endsWith("/git/trees")).body.tree[0].content);
  assert.equal(feed.distribution, "community"); assert.match(feed.notes, /not notarized by Apple/);
  for (const overrides of [{ sourceSha: "release" }, { version: "0.2.0" }]) {
    const blocked = harness(); await assert.rejects(blocked.run({ profile: "community", ...overrides }));
    assert.equal(blocked.calls.length, 0);
  }
  const diverged = harness({ diverged: true });
  await assert.rejects(diverged.run({ profile: "community", approval: {} }), /ancestor of main/);
  assert.equal(diverged.calls.filter(c => c.method).length, 0);
});

test("community updates cannot replace an existing notarized or legacy feed", async () => {
  for (const feedProfile of [undefined, "notarized", "unknown"]) {
    const h = harness({ feedVersion: "0.1.0", feedProfile });
    await assert.rejects(h.run({ profile: "community", approval: { COMMUNITY_BETA_APPROVED_SHA: sourceSha } }));
    assert.equal(h.calls.filter(c => c.method).length, 0);
  }
  const h = harness({ feedVersion: "0.1.0", feedProfile: "community" });
  await h.run({ profile: "community", approval: { COMMUNITY_BETA_APPROVED_SHA: sourceSha } });
});
