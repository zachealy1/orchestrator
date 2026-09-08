import { mkdtemp, writeFile, rm, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { requireEnvironment } from "./lib.mjs";
import { parseDedicatedAuth } from "./safe-process.mjs";
requireEnvironment(["RELEASE_TEST_CODEX_AUTH_JSON", "RELEASE_TEST_MODEL", "CODEX_BIN"]);
const binary = resolve(process.env.CODEX_BIN);
if (binary.includes("ChatGPT.app") || binary.includes("/Applications/Codex.app")) throw new Error("Release tests must use the candidate's standalone engine");
const isolated = await mkdtemp(join(tmpdir(), "orchestrator-release-smoke-"));
try {
  await mkdir(join(isolated, "generated_images"));
  const auth = parseDedicatedAuth(process.env.RELEASE_TEST_CODEX_AUTH_JSON);
  await writeFile(join(isolated, "auth.json"), JSON.stringify(auth), { mode: 0o600 });
  await writeFile(join(isolated, "config.toml"), `model = ${JSON.stringify(process.env.RELEASE_TEST_MODEL)}\n`);
  const env = { ...process.env, CODEX_BIN: binary, CODEX_HOME: isolated,
    RUN_CODEX_LIVE_PLAN_TEST: "1", RUN_CODEX_LIVE_GOAL_ENVIRONMENT_TEST: "1" };
  // Do not leave credentials in subprocess environment or print raw protocol/transcripts to CI logs.
  delete env.RELEASE_TEST_CODEX_AUTH_JSON; delete env.GH_TOKEN; delete env.GITHUB_TOKEN;
  for (const script of ["scripts/live-native-plan-mode.mjs", "scripts/live-native-goal-environment.mjs"]) {
    const result = spawnSync(process.execPath, [script], { env, encoding: "utf8", timeout: 15 * 60_000, maxBuffer: 10 * 1024 * 1024 });
    if (result.status !== 0) throw new Error(`Dedicated-account smoke test failed: ${script}. Inspect using the dedicated test account; private transcripts were not uploaded.`);
    if (/Skipped\./.test(result.stdout)) throw new Error("Required integration smoke test was skipped");
    console.log(`${script}: passed`);
  }
} finally { await rm(isolated, { recursive: true, force: true }); }
