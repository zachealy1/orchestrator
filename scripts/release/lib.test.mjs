import { test } from "node:test";
import assert from "node:assert/strict";
import { stableCandidate, nextAppVersion, compareVersions, engineAssets, manifest, downloadSnapshot, dailyDownloadChanges, requireEnvironment } from "./lib.mjs";
test("only newer stable upstream releases are selected", () => {
  const candidates = [
    { tag_name: "rust-v0.153.4" }, { tag_name: "rust-v0.154.0-alpha.1" },
    { tag_name: "rust-v0.155.0", prerelease: true }, { tag_name: "rust-v0.156.0", draft: true },
    { tag_name: "rust-v0.154.0" },
  ];
  assert.equal(stableCandidate(candidates, "0.153.4").version, "0.154.0");
  assert.equal(stableCandidate(candidates, "0.154.0"), null);
  assert.equal(nextAppVersion("0.2.0-beta.9"), "0.2.0-beta.10");
  assert.equal(nextAppVersion("0.2.0"), "0.2.1");
  assert.ok(compareVersions("0.2.0", "0.2.0-beta.10") > 0);
});
test("missing upstream hashes and incomplete architectures fail closed", () => {
  assert.throws(() => engineAssets({ assets: [], tag_name: "rust-v0.154.0" }));
  assert.throws(() => manifest("0.2.0-beta.1", []));
  assert.throws(() => requireEnvironment(["DEDICATED_TEST_AUTH"], {}), /Publication is blocked/);
});
test("a manifest needs both verified installers, update packages and signatures", () => {
  const assets = ["aarch64", "x86_64"].flatMap((arch) => [
    { name: `Orchestrator_${arch}.dmg`, verified: true },
    { name: `Orchestrator_${arch}.app.tar.gz`, verified: true },
    { name: `Orchestrator_${arch}.app.tar.gz.sig`, text: "signed" },
  ]);
  assert.equal(Object.keys(manifest("0.2.0-beta.1", assets).platforms).length, 2);
  assets[0].verified = false; assert.throws(() => manifest("0.2.0-beta.1", assets));
});
test("asset IDs preserve deleted/replaced counts without negative deltas or counting signatures", () => {
  const release = (assets) => [{ tag_name: "v0.2.0-beta.1", assets }];
  const old = downloadSnapshot(release([{ id: 1, name: "Orchestrator_aarch64.dmg", download_count: 10 }]));
  const next = downloadSnapshot(release([
    { id: 2, name: "Orchestrator_aarch64.dmg", download_count: 3 },
    { id: 3, name: "Orchestrator_aarch64.app.tar.gz", download_count: 7 },
    { id: 4, name: "Orchestrator_aarch64.app.tar.gz.sig", download_count: 100 },
  ]), old);
  assert.equal(next.assets.reduce((sum, a) => sum + a.downloads, 0), 20);
  assert.equal(next.assets.find((a) => a.id === 1).missing, true);
  assert.equal(next.assets.reduce((sum, a) => sum + a.change, 0), 10);
  const reset = downloadSnapshot(release([{ id: 1, name: "Orchestrator_aarch64.dmg", download_count: 4 }]), old);
  assert.equal(reset.assets[0].change, 0); assert.equal(reset.assets[0].counterReset, true);
});
test("daily changes combine intraday checks without counting initial lifetime totals", () => {
  const snapshot = (timestamp, previousTimestamp, change) => ({ timestamp, previousTimestamp,
    assets: [{ version: "v0.2.0-beta.1", architecture: "aarch64", kind: "installer", change }] });
  const days = dailyDownloadChanges([
    snapshot("2026-09-07T00:00:00Z", null, 100),
    snapshot("2026-09-08T04:00:00Z", "2026-09-07T00:00:00Z", 4),
    snapshot("2026-09-08T10:00:00Z", "2026-09-08T04:00:00Z", 3),
  ]);
  assert.equal(days.length, 1); assert.equal(days[0].change, 7); assert.equal(days[0].date, "2026-09-08");
  const duplicate = snapshot("2026-09-08T10:00:00Z", "2026-09-08T04:00:00Z", 3);
  assert.equal(dailyDownloadChanges([duplicate, duplicate])[0].change, 3);
});
