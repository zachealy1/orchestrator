import { execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { github, REPOSITORY } from "./lib.mjs";
const repo = await github(`repos/${REPOSITORY}`);
if (repo.id !== 1361268700 || repo.full_name !== REPOSITORY) throw new Error("Unexpected download-report repository identity");
const script = resolve("scripts/release/download-report.mjs");
const temporary = await mkdtemp(join(tmpdir(), "orchestrator-download-report-"));
const directory = join(temporary, "metrics");
const git = (...args) => execFileSync("git", args, { encoding: "utf8" });
if (!/^(?:git@github\.com:|https:\/\/github\.com\/)zachealy1\/orchestrator(?:\.git)?\s*$/.test(git("remote", "get-url", "origin"))) {
  throw new Error("Refusing to write metrics to an unexpected repository remote");
}
try {
  const exists = git("ls-remote", "--heads", "origin", "download-metrics").trim();
  if (exists) { git("fetch", "origin", "download-metrics"); git("worktree", "add", "--detach", directory, "FETCH_HEAD"); }
  else {
    git("worktree", "add", "--detach", directory, "HEAD");
    // Orphan branch contains only reports, not a copy of the source tree.
    git("-C", directory, "switch", "--orphan", "codex/download-metrics-initial");
  }
  execFileSync(process.execPath, [script, directory], { stdio: "inherit" });
  git("-C", directory, "add", "README.md", "downloads.csv", "daily.csv", "latest.json", "snapshots");
  if (git("-C", directory, "diff", "--cached", "--name-only").trim()) {
    git("-C", directory, "-c", "user.name=Orchestrator report bot", "-c", "user.email=release-bot@users.noreply.github.com", "commit", "-m", "chore(metrics): snapshot release downloads");
    git("-C", directory, "push", "origin", "HEAD:refs/heads/download-metrics");
  }
} finally {
  try { git("worktree", "remove", "--force", directory); } catch { /* workspace may not exist */ }
  await rm(temporary, { recursive: true, force: true });
}
