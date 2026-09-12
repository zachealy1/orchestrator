import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { distribution, requireSigning, requirePublicationApproval, validateAppSignature, validatePackageReceipt, packagingConfig } from "./distribution.mjs";
import { readArtifacts } from "./publish.mjs";
import { sha256 } from "./lib.mjs";
import { stagingTarget, validateStagingRelease, stageCommunity } from "./stage-community.mjs";
import { COMMUNITY_NOTICE } from "./distribution.mjs";

const sourceSha = "a".repeat(40), version = "0.2.0-beta.1";
const keys = { ORCHESTRATOR_UPDATER_PUBLIC_KEY: "public", TAURI_SIGNING_PRIVATE_KEY: "private", TAURI_SIGNING_PRIVATE_KEY_PASSWORD: "password" };
test("community signing needs independent update keys, never Apple credentials", () => {
  assert.equal(distribution(), "notarized");
  for (const profile of ["", "unsigned", "Community"]) assert.throws(() => distribution(profile));
  assert.doesNotThrow(() => requireSigning("community", keys));
  assert.throws(() => requireSigning("notarized", keys), /APPLE/);
  for (const key of Object.keys(keys)) assert.throws(() => requireSigning("community", { ...keys, [key]: "" }), /missing/);
});
test("community dispatch requires an exact source while notarized publication retains rehearsal approval", () => {
  assert.doesNotThrow(() => requirePublicationApproval("community", sourceSha, {}));
  for (const invalid of ["release", "main", "", undefined]) {
    assert.throws(() => requirePublicationApproval("community", invalid, {}));
  }
  assert.throws(() => requirePublicationApproval("notarized", sourceSha, { COMMUNITY_BETA_APPROVED_SHA: sourceSha }));
  assert.doesNotThrow(() => requirePublicationApproval("notarized", sourceSha, { BETA_REHEARSAL_APPROVED: "true" }));
});
test("packaging receives the public verification key but never serializes secrets into Tauri configuration", () => {
  const config = packagingConfig("community", keys);
  assert.equal(config.plugins.updater.pubkey, keys.ORCHESTRATOR_UPDATER_PUBLIC_KEY);
  assert.equal(config.bundle.macOS.signingIdentity, "-");
  assert.equal(config.bundle.macOS.hardenedRuntime, true);
  assert.equal(config.bundle.createUpdaterArtifacts, true);
  for (const secret of [keys.TAURI_SIGNING_PRIVATE_KEY, keys.TAURI_SIGNING_PRIVATE_KEY_PASSWORD]) assert.ok(!JSON.stringify(config).includes(secret));
});
test("both signing profiles require hardened runtime and their actual identity", () => {
  const adhoc = "CodeDirectory v=20500 size=42 flags=0x10002(adhoc,runtime) hashes=4\nSignature=adhoc\n";
  const apple = "CodeDirectory v=20500 flags=0x10000(runtime)\nAuthority=Developer ID Application: Example\n";
  validateAppSignature("community", adhoc); validateAppSignature("notarized", apple);
  assert.throws(() => validateAppSignature("notarized", adhoc));
  assert.throws(() => validateAppSignature("community", apple));
  assert.throws(() => validateAppSignature("community", "Signature=adhoc\n"));
});
test("receipts bind version, source, architecture, trust profile and every artifact byte", async () => {
  const root = await mkdtemp(join(tmpdir(), "community-receipts-"));
  try {
    for (const arch of ["aarch64", "x86_64"]) {
      const assets = [];
      for (const suffix of ["dmg", "app.tar.gz", "app.tar.gz.sig"]) {
        const name = `Orchestrator_${arch}.${suffix}`, bytes = Buffer.from(name);
        await writeFile(join(root, name), bytes); assets.push({ name, digest: sha256(bytes) });
      }
      const receipt = { schemaVersion: 1, sourceSha, version, architecture: arch, distribution: "community", notarized: false,
        updaterSignatureVerified: true, behavioralTesting: "not-performed", artifacts: Object.fromEntries(assets.map(asset => [asset.name, asset.digest])) };
      const options = { profile: "community", version, sourceSha, arch, assets };
      validatePackageReceipt(receipt, options);
      for (const changed of [{ sourceSha: "b".repeat(40) }, { version: "0.2.0-beta.2" }, { architecture: "wrong" },
        { distribution: "notarized" }, { notarized: true }, { updaterSignatureVerified: false },
        { behavioralTesting: undefined }, { behavioralTesting: "passed" }, { artifacts: {} }]) {
        assert.throws(() => validatePackageReceipt({ ...receipt, ...changed }, options));
      }
      const name = `verification-${arch}.json`, bytes = JSON.stringify(receipt);
      await writeFile(join(root, name), bytes); assets.push({ name, digest: sha256(bytes) });
      await writeFile(join(root, `SHA256SUMS-${arch}.txt`), assets.map(asset => `${asset.digest}  ${asset.name}`).join("\n") + "\n");
    }
    const options = { profile: "community", version, sourceSha };
    assert.equal((await readArtifacts(root, options)).length, 10);
    await assert.rejects(readArtifacts(root, { ...options, profile: "notarized" }));
    await assert.rejects(readArtifacts(root, { ...options, sourceSha: "b".repeat(40) }));
    await writeFile(join(root, "Orchestrator_x86_64.dmg"), "damaged");
    await assert.rejects(readArtifacts(root, options), /Checksum/);
    await rm(join(root, "verification-aarch64.json"));
    await assert.rejects(readArtifacts(root, options));
  } finally { await rm(root, { recursive: true, force: true }); }
});
test("staging cannot target another repo, a contributor branch or a published release", () => {
  const env = { GITHUB_REPOSITORY: "zachealy1/orchestrator", GITHUB_REF: "refs/heads/main", RELEASE_SOURCE_SHA: sourceSha, STAGING_TAG: "community-build-123-1" };
  const target = stagingTarget(env);
  for (const changed of [{ GITHUB_REPOSITORY: "someone/fork" }, { GITHUB_REF: "refs/pull/1/merge" }, { GITHUB_REF: "refs/heads/release" }, { RELEASE_SOURCE_SHA: "release" }, { STAGING_TAG: "v0.2.0-beta.1" }]) {
    assert.throws(() => stagingTarget({ ...env, ...changed }));
  }
  const release = { draft: true, tag_name: target.tag, target_commitish: sourceSha, body: COMMUNITY_NOTICE };
  validateStagingRelease(release, target);
  for (const changed of [{ draft: false }, { target_commitish: "main" }, { body: "Unrelated draft" }, { tag_name: "another-tag" }]) {
    assert.throws(() => validateStagingRelease({ ...release, ...changed }, target));
  }
});
test("the free workflow requires manual release dispatch, both packages and isolated secrets", async () => {
  const workflow = await readFile(".github/workflows/community-beta.yml", "utf8");
  assert.doesNotMatch(workflow, /APPLE_|upload-artifact|download-artifact|pull_request:|pull_request_target:|secrets: inherit/);
  for (const expected of ["workflow_dispatch:", "macos-15-intel", "TAURI_SIGNING_PRIVATE_KEY", "environment: public-beta-signing", "environment: public-beta-publishing", "group: orchestrator-publication", 'test "$GITHUB_REF" = refs/heads/main', 'git merge-base --is-ancestor "$REF" origin/main']) assert.ok(workflow.includes(expected));
  assert.match(workflow, /needs: \[authorize, package\]/);
  assert.match(workflow, /RELEASE_SOURCE_SHA: \$\{\{ needs.authorize.outputs.sha \}\}/);
});

test("draft staging uses the CLI's draft-aware lookup and never publishes or overwrites assets", async () => {
  const env = { GITHUB_REPOSITORY: "zachealy1/orchestrator", GITHUB_REF: "refs/heads/main", RELEASE_SOURCE_SHA: sourceSha, STAGING_TAG: "community-build-123-1" };
  const calls = [], run = (bin, args) => {
    assert.equal(bin, "gh"); calls.push(args);
    if (args[1] === "create") return "";
    assert.equal(args[1], "view");
    return JSON.stringify({ isDraft: true, tagName: env.STAGING_TAG, targetCommitish: sourceSha, body: COMMUNITY_NOTICE, assets: [] });
  };
  await stageCommunity("prepare", env, run);
  assert.equal(calls.length, 2);
  assert.ok(calls[0].includes("--draft")); assert.ok(calls[0].includes(sourceSha));
  assert.ok(calls.every(args => !args.includes("--clobber") && !args.includes("edit") && !args.includes("api")));
  const count = calls.length;
  await assert.rejects(stageCommunity("publish", env, run));
  assert.equal(calls.length, count);
});
