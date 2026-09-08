import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
// Self-contained: do not execute imports from an unvalidated candidate.
function compareVersions(a, b) {
  const parse = (v) => { assert.match(v, /^\d+\.\d+\.\d+(?:-beta\.\d+)?$/); return v.split(/[.\-]/).filter((x) => x !== "beta").map(Number); };
  const left = parse(a), right = parse(b);
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const x = left[i] ?? Infinity, y = right[i] ?? Infinity;
    if (x !== y) return x > y ? 1 : -1;
  }
  return 0;
}
const base = process.argv[2];
if (!/^[a-f0-9]{40}$/.test(base ?? "")) throw new Error("A fixed trusted base commit is required");
const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
const pinPath = "src-tauri/resources/codex-engine/release.json";
const allowed = [pinPath, "package.json", "package-lock.json", "src-tauri/tauri.conf.json", "src-tauri/Cargo.toml", "src-tauri/Cargo.lock"];
const changed = git("diff", "--name-only", base, "HEAD").split("\n");
assert.ok(changed.every((file) => allowed.includes(file)), "Candidate contains non-engine changes");
for (const file of allowed) {
  const before = git("show", `${base}:${file}`), after = await readFile(file, "utf8");
  if (file === pinPath) {
    const old = JSON.parse(before), next = JSON.parse(after);
    assert.ok(compareVersions(next.version, old.version) > 0);
    assert.deepEqual(Object.keys(next.archives).sort(), Object.keys(old.archives).sort());
    assert.ok(Object.values(next.archives).every((hash) => /^[a-f0-9]{64}$/.test(hash)));
    assert.deepEqual({ ...next, version: old.version, archives: old.archives }, old);
  } else if (file.endsWith(".json")) {
    const old = JSON.parse(before), next = JSON.parse(after);
    assert.ok(compareVersions(next.version, old.version) > 0);
    next.version = old.version;
    if (next.packages?.[""]) next.packages[""].version = old.packages[""].version;
    assert.deepEqual(next, old, `Unexpected changes in ${file}`);
  } else {
    const normalize = (value) => value.replace(/(name = "orchestrator"\nversion = ")[^"]+("\n)/, "$1VERSION$2").trim();
    assert.equal(normalize(after), normalize(before), `Unexpected changes in ${file}`);
  }
}
console.log("Engine-only candidate scope verified.");
