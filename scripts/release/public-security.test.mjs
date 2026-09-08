import { test } from "node:test";
import assert from "node:assert/strict";
import { inspect } from "node:util";
import { readFileSync, readdirSync } from "node:fs";
import { confidentialRun, parseDedicatedAuth } from "./safe-process.mjs";

test("signing failures never expose synthetic credentials from argv, environment, stdout or stderr", () => {
  const canary = "synthetic-secret-not-a-real-credential";
  let failure;
  try { confidentialRun(process.execPath, ["-e", "console.log(process.argv[1]);console.error(process.env.CANARY);process.exit(1)", canary], { env: { CANARY: canary }, stdio: "inherit" }); }
  catch (error) { failure = error; }
  assert.ok(failure);
  assert.ok(!inspect(failure, { showHidden: true }).includes(canary));
  assert.equal(failure.cause, undefined);
});
test("malformed structured credentials cannot enter JSON parser diagnostics", () => {
  const canary = "synthetic-secret-not-a-real-credential";
  for (const value of [canary, `{"token":"${canary}"`, "null", "[]"]) {
    assert.throws(() => parseDedicatedAuth(value), error => !inspect(error, { showHidden: true }).includes(canary));
  }
});
test("public contributor CI is read-only and never injects release secrets", () => {
  const ci = readFileSync(".github/workflows/ci.yml", "utf8");
  assert.match(ci, /pull_request:/); assert.match(ci, /contents: read/);
  assert.doesNotMatch(ci, /secrets\.|pull_request_target|write-all|contents: write/);
  for (const name of readdirSync(".github/workflows")) {
    const text = readFileSync(`.github/workflows/${name}`, "utf8");
    assert.doesNotMatch(text, /^\s*pull_request_target:|RELEASE_APP_PRIVATE_KEY|private test artifacts/m);
    for (const [, ref] of text.matchAll(/uses: ([^\s]+@[\w.-]+)/g)) assert.match(ref, /@[a-f0-9]{40}$/);
  }
  const release = readFileSync(".github/workflows/public-beta.yml", "utf8");
  assert.match(release, /RELEASE_SOURCE_SHA: \$\{\{ needs.authorize.outputs.sha \}\}/);
  assert.match(release, /environment: public-beta-publishing/);
  assert.match(release, /GH_TOKEN: \$\{\{ github.token \}\}/);
});
