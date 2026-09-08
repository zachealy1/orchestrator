import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, mkdir, writeFile, chmod } from "node:fs/promises";
import { execFileSync, spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { inspect } from "node:util";
import { collectCloneTraffic, normalizeCloneTraffic, mergeCloneHistory, summarizeClones, renderCloneReport, cloneDayStatus } from "./clone-metrics.mjs";
import { writeCloneReport } from "./clone-report.mjs";
import { prepareRepositoryReports } from "./repository-report.mjs";

const timestamp = (day, hour = "04") => `${day}T${hour}:41:00.000Z`;
const response = (...rows) => ({ count: rows.reduce((n, r) => n + r[1], 0), uniques: Math.max(0, ...rows.map((r) => r[2])),
  clones: rows.map(([day, count, uniques]) => ({ timestamp: `${day}T00:00:00Z`, count, uniques })) });
const ok = (value) => async () => ({ ok: true, json: async () => value });
const success = (day, ...rows) => ({ timestamp: timestamp(day), status: "success", error: null, days: normalizeCloneTraffic(response(...rows), timestamp(day)) });
const failure = (day) => ({ timestamp: timestamp(day), status: "failed", error: "network_error", days: [] });
const row = (history, day) => history.days.find((value) => value.date === day);
async function directory(t) {
  const result = await mkdtemp(join(tmpdir(), "orchestrator-clones-test-"));
  t.after(() => rm(result, { recursive: true, force: true }));
  return result;
}

test("daily observations replace overlaps, ignore duplicate/older snapshots and accept corrections down", () => {
  const first = mergeCloneHistory(null, success("2026-09-08", ["2026-09-07", 5, 3], ["2026-09-08", 2, 1]));
  const latest = success("2026-09-09", ["2026-09-07", 4, 2], ["2026-09-08", 8, 4], ["2026-09-09", 0, 0]);
  const next = mergeCloneHistory(first, latest);
  assert.equal(summarizeClones(next).cumulativeClones, 12);
  assert.equal(row(next, "2026-09-07").clones, 4);
  assert.deepEqual(mergeCloneHistory(next, latest), next);
  assert.deepEqual(mergeCloneHistory(next, first.lastAttempt), next);
  assert.equal(cloneDayStatus(row(first, "2026-09-08")), "partial");
  assert.equal(cloneDayStatus(row(next, "2026-09-08")), "reported");
});

test("explicit zeroes are observations, omitted rows and collection failures remain gaps", () => {
  const first = mergeCloneHistory(null, success("2026-09-08", ["2026-09-07", 0, 0]));
  assert.equal(row(first, "2026-09-07").clones, 0);
  assert.equal(row(first, "2026-09-06").clones, null);
  const next = mergeCloneHistory(first, failure("2026-09-09"));
  assert.equal(row(next, "2026-09-07").clones, 0);
  assert.equal(row(next, "2026-09-09").clones, null);
  assert.equal(next.lastSuccessfulCollectionAt, timestamp("2026-09-08"));
  const report = renderCloneReport(next);
  assert.match(report.dailyCsv, /2026-09-07,0,0,reported/);
  assert.match(report.dailyCsv, /2026-09-09,,,gap,/);
  assert.match(report.markdown, /Collection failed/);
  assert.match(report.markdown, /total is incomplete/);
  const empty = mergeCloneHistory(null, failure("2026-09-08"));
  assert.equal(summarizeClones(empty).cumulativeClones, null);
  assert.match(renderCloneReport(empty).markdown, /No clone counts available/);
  assert.doesNotMatch(renderCloneReport(empty).markdown, /\*\*0 observed clones/);
  assert.match(renderCloneReport(empty).monthlyCsv, /2026-09,,0,8,0/);
});

test("a reported boundary day is retained without inventing an extra missing day", () => {
  const history = mergeCloneHistory(null, success("2026-09-08", ["2026-08-25", 1, 1]));
  assert.equal(history.coverageStartedOn, "2026-08-25");
  assert.equal(history.days.length, 15);
  const absent = mergeCloneHistory(null, success("2026-09-08"));
  assert.equal(absent.coverageStartedOn, "2026-08-26");
  assert.equal(absent.days.length, 14);
});

test("history survives the rolling window, backfills recoverable gaps and keeps expired gaps", () => {
  let history = mergeCloneHistory(null, success("2026-08-31", ["2026-08-30", 7, 2]));
  history = mergeCloneHistory(history, failure("2026-09-20"));
  assert.equal(row(history, "2026-08-30").clones, 7);
  assert.equal(row(history, "2026-09-01").clones, null);
  history = mergeCloneHistory(history, success("2026-09-21", ["2026-09-10", 4, 2], ["2026-09-20", 3, 1]));
  assert.equal(row(history, "2026-09-10").clones, 4);
  assert.equal(row(history, "2026-09-01").clones, null);
  const summary = summarizeClones(history);
  assert.equal(summary.cumulativeClones, 14);
  assert.deepEqual(summary.months.map((value) => [value.month, value.observedClones]), [["2026-08", 7], ["2026-09", 7]]);
  assert.ok(summary.missingDays > 0);
  assert.ok(summary.months.every((value) => !("uniqueCloners" in value)));
  assert.match(renderCloneReport(history).markdown, /Daily unique cloners are not summed/);
});

test("old partial days stay partial without a post-day observation; dates are UTC", () => {
  const first = mergeCloneHistory(null, success("2026-12-31", ["2026-12-31", 1, 1]));
  const next = mergeCloneHistory(first, failure("2027-01-02"));
  assert.equal(cloneDayStatus(row(next, "2026-12-31")), "partial");
  assert.equal(summarizeClones(next).partialDays, 1);
  const final = mergeCloneHistory(next, success("2027-01-03", ["2026-12-31", 3, 2], ["2027-01-01", 2, 1]));
  assert.equal(cloneDayStatus(row(final, "2026-12-31")), "reported");
  assert.deepEqual(summarizeClones(final).months.map((m) => m.observedClones), [3, 2]);
});

test("malformed API data is rejected without exposing its contents", async () => {
  const canary = "synthetic-secret-not-real";
  const values = [null, { count: 0, uniques: 0 }, response(["2026-09-07", -1, 0]), response(["2026-09-07", "2", 1]),
    response(["2026-09-07", 1, 2]), response(["2026-09-07", 2, 1], ["2026-09-07", 2, 1]),
    response(["2026-09-09", 1, 1]), response(["2026-08-20", 1, 1]), response(["2026-02-30", 1, 1]),
    response(["2026-09-07", Number.MAX_SAFE_INTEGER + 1, 0]), { count: canary, uniques: 1, clones: [] }];
  for (const value of values) {
    const result = await collectCloneTraffic({ token: canary, now: timestamp("2026-09-08"), fetcher: ok(value) });
    assert.equal(result.error, "invalid_response");
    assert.ok(!inspect(result).includes(canary));
  }
  const result = await collectCloneTraffic({ token: canary, now: timestamp("2026-09-08"), fetcher: async () => ({ ok: true, json: async () => { throw new Error(canary); } }) });
  assert.equal(result.error, "invalid_response");
  assert.ok(!inspect(result).includes(canary));
});

test("auth, permission, rate-limit and network failures use safe codes and no response body", async () => {
  const canary = "synthetic-secret-not-real";
  for (const [status, headers, expected] of [[401, {}, "authentication"], [403, {}, "permission"], [404, {}, "permission"],
    [429, {}, "rate_limited"], [403, { "x-ratelimit-remaining": "0" }, "rate_limited"], [403, { "retry-after": "60" }, "rate_limited"], [500, {}, "api_error"]]) {
    const result = await collectCloneTraffic({ token: canary, now: timestamp("2026-09-08"), fetcher: async () => ({ ok: false, status, headers: new Headers(headers), json: () => { throw new Error(canary); } }) });
    assert.equal(result.error, expected);
    assert.ok(!inspect(result).includes(canary));
  }
  assert.equal((await collectCloneTraffic({ token: canary, fetcher: async () => { throw new Error(canary); } })).error, "network_error");
  const missing = await collectCloneTraffic({ token: "", fetcher: () => assert.fail("No request without a configured credential") });
  assert.equal(missing.error, "missing_credentials");
});

test("request uses the fixed repository, daily UTC data, a timeout and no credential-bearing redirects", async () => {
  const result = await collectCloneTraffic({ token: "test-token", now: timestamp("2026-09-08"), fetcher: async (url, options) => {
    assert.equal(url, "https://api.github.com/repos/zachealy1/orchestrator/traffic/clones?per=day");
    assert.equal(options.headers.Authorization, "Bearer test-token");
    assert.equal(options.redirect, "error");
    assert.ok(options.signal instanceof AbortSignal);
    return { ok: true, json: async () => ({ ...response(["2026-09-07", 1, 1]), ignored: "private-payload-field" }) };
  } });
  assert.equal(result.status, "success");
  assert.ok(!JSON.stringify(result).includes("private-payload-field"));
});

test("CSV/JSON persist across process-like reloads, duplicate retries and failure/recovery", async (t) => {
  const target = await directory(t);
  const options = { token: "test-token", now: timestamp("2026-09-08"), fetcher: ok(response(["2026-09-07", 5, 2])) };
  await writeCloneReport(target, options);
  await writeCloneReport(target, options);
  assert.equal((await readdir(join(target, "clones/collections"))).length, 1);
  assert.equal((await writeCloneReport(target, { token: "", now: timestamp("2026-09-09") })).ok, false);
  const failed = JSON.parse(await readFile(join(target, "clones/history.json"), "utf8"));
  assert.equal(row(failed, "2026-09-07").clones, 5);
  assert.equal(row(failed, "2026-09-09").clones, null);
  await writeCloneReport(target, { ...options, now: timestamp("2026-09-10"), fetcher: ok(response(["2026-09-07", 6, 2], ["2026-09-09", 4, 3])) });
  const saved = JSON.parse(await readFile(join(target, "clones/history.json"), "utf8"));
  assert.equal(summarizeClones(saved).cumulativeClones, 10);
  assert.equal((await readdir(join(target, "clones/collections"))).length, 3);
  assert.match(await readFile(join(target, "clones/daily.csv"), "utf8"), /2026-09-09,4,3,reported/);
  assert.doesNotMatch(await readFile(join(target, "clones/monthly.csv"), "utf8"), /unique/);
});

test("corrupt existing history fails closed without rewriting it or echoing its content", async (t) => {
  const target = await directory(t), canary = "synthetic-secret-not-real";
  await mkdir(join(target, "clones"));
  const path = join(target, "clones/history.json");
  for (const content of [canary, JSON.stringify({ schemaVersion: 99, private: canary })]) {
    await writeFile(path, content);
    await assert.rejects(writeCloneReport(target), (error) => !inspect(error).includes(canary));
    assert.equal(await readFile(path, "utf8"), content);
  }
});

test("different outcomes cannot overwrite the same timestamped collection record", async (t) => {
  const target = await directory(t), now = timestamp("2026-09-08");
  await writeCloneReport(target, { token: "test", now, fetcher: ok(response(["2026-09-07", 5, 2])) });
  const before = await readFile(join(target, "clones/history.json"), "utf8");
  await assert.rejects(writeCloneReport(target, { token: "", now }), /Conflicting clone collection/);
  assert.equal(await readFile(join(target, "clones/history.json"), "utf8"), before);
});

test("clone failure reports are publishable without losing download files", async (t) => {
  const target = await directory(t);
  const result = await prepareRepositoryReports(target, { token: "", download: async () => { await writeFile(join(target, "README.md"), "download report"); } });
  assert.deepEqual(result.failures, ["clone_missing_credentials"]);
  assert.ok(result.paths.includes("clones/history.json"));
  assert.ok(result.paths.includes("downloads.csv"));
  assert.equal(await readFile(join(target, "README.md"), "utf8"), "download report");
});

test("download failures do not block clone reports; failures expose no subprocess secrets", async (t) => {
  const target = await directory(t), canary = "synthetic-secret-not-real";
  const result = await prepareRepositoryReports(target, { token: "", download: () => { throw new Error(canary); } });
  assert.deepEqual(result.failures, ["download_collection", "clone_missing_credentials"]);
  assert.ok(result.paths.includes("clones/history.json"));
  assert.ok(!result.paths.includes("latest.json"));
  assert.match(await readFile(join(target, "README.md"), "utf8"), /clones\/README.md/);
  assert.ok(!inspect(result).includes(canary));
  const corrupt = await prepareRepositoryReports(target, { download: () => {}, clones: () => { throw new Error(canary); } });
  assert.deepEqual(corrupt.failures, ["clone_report_generation"]);
  assert.ok(!corrupt.paths.some((path) => path.startsWith("clones/")));
});

test("workflow stays trusted/main-only, shares the writer lock and does not gate failure persistence", async () => {
  const workflow = await readFile(".github/workflows/download-report.yml", "utf8");
  assert.match(workflow, /cron: '41 4 \* \* \*'/);
  assert.match(workflow, /group: orchestrator-download-metrics/);
  assert.match(workflow, /cancel-in-progress: false/);
  assert.match(workflow, /github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /head_repository\.full_name == 'zachealy1\/orchestrator'/);
  assert.match(workflow, /ref: main/);
  assert.match(workflow, /REPO_TRAFFIC_TOKEN: \$\{\{ secrets\.REPO_TRAFFIC_TOKEN \}\}/);
  assert.doesNotMatch(workflow, /pull_request:|pull_request_target:|continue-on-error|if:.*REPO_TRAFFIC_TOKEN/);
  const store = await readFile("scripts/release/store-download-report.mjs", "utf8");
  assert.match(store, /repo\.id !== 1361268700/);
  assert.match(store, /"push", "origin", "HEAD:refs\/heads\/download-metrics"/);
  assert.ok(store.indexOf('"push", "origin"') < store.indexOf("if (result.failures.length)"));
  assert.doesNotMatch(store, /push[^\n]*(?:--force|refs\/heads\/main)/);
});

test("store CLI publishes failure history to an isolated local remote before exiting unsuccessfully", async (t) => {
  const base = await directory(t), repository = join(base, "repo"), remote = join(base, "remote.git"), bin = join(base, "bin");
  await mkdir(repository); await mkdir(bin);
  const realGit = execFileSync("which", ["git"], { encoding: "utf8" }).trim();
  const git = (...args) => execFileSync(realGit, args, { cwd: repository, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  git("init", "--bare", "--initial-branch=main", remote);
  git("init", "--initial-branch=main");
  git("config", "user.name", "Metrics Test"); git("config", "user.email", "test@example.invalid");
  git("remote", "add", "origin", remote);
  await writeFile(join(repository, "README.md"), "source stays unchanged\n");
  git("add", "README.md"); git("commit", "-m", "test source"); git("push", "origin", "main");
  const main = git("rev-parse", "main").trim();
  git("switch", "--orphan", "download-metrics");
  await writeFile(join(repository, "keep.txt"), "existing metrics history\n");
  git("add", "keep.txt"); git("commit", "-m", "existing metrics"); git("push", "origin", "download-metrics");
  git("switch", "main");
  // Production origin validation is retained. This test-only shim maps its check
  // to an isolated bare repository; all git operations still execute real git.
  await writeFile(join(bin, "git"), `#!${process.execPath}\nconst {spawnSync}=require('node:child_process');\nconst args=process.argv.slice(2);\nif(args.join(' ')==='remote get-url origin') { console.log('https://github.com/zachealy1/orchestrator.git'); } else { const result=spawnSync(${JSON.stringify(realGit)},args,{stdio:'inherit'});process.exit(result.status??1); }\n`);
  await chmod(join(bin, "git"), 0o755);
  const preload = join(base, "mock-github.mjs");
  await writeFile(preload, `globalThis.fetch=async(url)=>{if(url.endsWith('/traffic/clones?per=day'))return {ok:false,status:403,headers:new Headers(),json:async()=>{throw new Error(process.env.REPO_TRAFFIC_TOKEN)}};return {ok:true,status:200,json:async()=>url.includes('/releases?')?[]:{id:1361268700,full_name:'zachealy1/orchestrator'}}};\n`);
  const canary = "synthetic-traffic-secret-not-real";
  const result = spawnSync(process.execPath, ["--import", pathToFileURL(preload).href, resolve("scripts/release/store-download-report.mjs")], {
    cwd: repository, encoding: "utf8", env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, REPO_TRAFFIC_TOKEN: canary,
      GH_TOKEN: "synthetic-download-token", NODE_OPTIONS: `--import=${pathToFileURL(preload).href}` }, timeout: 20_000,
  });
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /clone_permission/);
  assert.ok(!(result.stdout + result.stderr).includes(canary));
  assert.equal(git("--git-dir", remote, "rev-parse", "refs/heads/main").trim(), main);
  assert.equal(git("--git-dir", remote, "show", "download-metrics:keep.txt"), "existing metrics history\n");
  const history = JSON.parse(git("--git-dir", remote, "show", "download-metrics:clones/history.json"));
  assert.equal(history.lastAttempt.error, "permission");
  assert.ok(history.days.every((value) => value.clones === null));
  assert.match(git("--git-dir", remote, "show", "download-metrics:README.md"), /clones\/README.md/);
  assert.ok(!git("worktree", "list").includes("orchestrator-download-report-"));
});
