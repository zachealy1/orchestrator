import { execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { github, REPOSITORY } from "./lib.mjs";
import { prepareRepositoryReports } from "./repository-report.mjs";

async function storeReports() {
  const repo = await github(`repos/${REPOSITORY}`);
  if (repo.id !== 1361268700 || repo.full_name !== REPOSITORY) throw new Error("Unexpected metrics repository identity");
  const git = (...args) => execFileSync("git", args, { encoding: "utf8" });
  if (!/^(?:git@github\.com:|https:\/\/github\.com\/)zachealy1\/orchestrator(?:\.git)?\s*$/.test(git("remote", "get-url", "origin"))) {
    throw new Error("Refusing to write metrics to an unexpected repository remote");
  }
  const temporary = await mkdtemp(join(tmpdir(), "orchestrator-download-report-"));
  const directory = join(temporary, "metrics");
  try {
    const exists = git("ls-remote", "--heads", "origin", "download-metrics").trim();
    if (exists) { git("fetch", "origin", "download-metrics"); git("worktree", "add", "--detach", directory, "FETCH_HEAD"); }
    else {
      git("worktree", "add", "--detach", directory, "HEAD");
      // Orphan branch contains only reports, not a copy of the source tree.
      git("-C", directory, "switch", "--orphan", "codex/download-metrics-initial");
    }
    const result = await prepareRepositoryReports(directory);
    // Publish valid failure/gap reports too, before failing the workflow visibly.
    if (result.paths.length) git("-C", directory, "add", "--", ...result.paths);
    if (git("-C", directory, "diff", "--cached", "--name-only").trim()) {
      git("-C", directory, "-c", "user.name=Orchestrator report bot", "-c", "user.email=release-bot@users.noreply.github.com", "commit", "-m", "chore(metrics): snapshot downloads and clone history");
      git("-C", directory, "push", "origin", "HEAD:refs/heads/download-metrics");
    }
    if (result.failures.length) {
      console.error(`Repository metrics collection incomplete (${result.failures.join(", ")}); available reports and clone gaps were saved.`);
      process.exitCode = 1;
    }
  } finally {
    try { git("worktree", "remove", "--force", directory); } catch { /* workspace may not exist */ }
    await rm(temporary, { recursive: true, force: true });
  }
}

try { await storeReports(); }
catch { console.error("Repository metrics run failed. Check workflow permissions, connectivity and the metrics branch; no history was force-overwritten."); process.exitCode = 1; }
