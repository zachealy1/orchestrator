import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { collectCloneTraffic, mergeCloneHistory, renderCloneReport, validateCloneHistory } from "./clone-metrics.mjs";

export async function writeCloneReport(directory, options = {}) {
  const target = join(directory, "clones");
  let previous = null;
  try { previous = validateCloneHistory(JSON.parse(await readFile(join(target, "history.json"), "utf8"))); }
  catch (error) { if (error.code !== "ENOENT") throw new Error("Invalid existing clone history; refusing to overwrite it"); }
  const attempt = await collectCloneTraffic(options);
  const history = mergeCloneHistory(previous, attempt);
  const report = renderCloneReport(history);
  await mkdir(join(target, "collections"), { recursive: true });
  const json = (value) => JSON.stringify(value, null, 2) + "\n";
  const snapshot = join(target, "collections", `${attempt.timestamp.replaceAll(":", "-")}.json`);
  try { await writeFile(snapshot, json(attempt), { flag: "wx" }); }
  catch (error) {
    if (error.code !== "EEXIST" || await readFile(snapshot, "utf8") !== json(attempt)) throw new Error("Conflicting clone collection; refusing to replace its snapshot");
  }
  await writeFile(join(target, "history.json"), json(history));
  await writeFile(join(target, "daily.csv"), report.dailyCsv);
  await writeFile(join(target, "monthly.csv"), report.monthlyCsv);
  await writeFile(join(target, "README.md"), report.markdown);
  return { ok: attempt.status === "success", error: attempt.error };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const result = await writeCloneReport(resolve(process.argv[2] ?? "download-metrics"), { token: process.env.REPO_TRAFFIC_TOKEN });
    if (!result.ok) { console.error(`Clone collection failed (${result.error}); gap report saved.`); process.exitCode = 1; }
  } catch { console.error("Clone report generation failed; no report should be published from this attempt."); process.exitCode = 1; }
}
