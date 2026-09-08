import { execFileSync } from "node:child_process";
import { access, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { writeCloneReport } from "./clone-report.mjs";

const downloadPaths = ["README.md", "downloads.csv", "daily.csv", "latest.json", "snapshots"];
const clonePaths = ["clones/README.md", "clones/daily.csv", "clones/monthly.csv", "clones/history.json", "clones/collections"];

function downloadReport(directory) {
  // The traffic credential is not needed by the download collector or its errors.
  const { REPO_TRAFFIC_TOKEN: _trafficToken, ...env } = process.env;
  execFileSync(process.execPath, [fileURLToPath(new URL("./download-report.mjs", import.meta.url)), directory], { env, stdio: "pipe" });
}

export async function prepareRepositoryReports(directory, {
  download = downloadReport, clones = writeCloneReport, token = process.env.REPO_TRAFFIC_TOKEN,
} = {}) {
  const paths = [], failures = [];
  try { await download(directory); paths.push(...downloadPaths); }
  catch { failures.push("download_collection"); }
  // A failed download request must not prevent clone collection, or vice versa.
  try {
    const result = await clones(directory, { token });
    paths.push(...clonePaths);
    if (!result.ok) failures.push(`clone_${result.error}`);
  } catch { failures.push("clone_report_generation"); }
  if (!paths.includes("README.md") && paths.includes("clones/README.md")) {
    try { await access(join(directory, "README.md")); }
    catch (error) {
      if (error.code !== "ENOENT") throw error;
      await writeFile(join(directory, "README.md"), "# Orchestrator repository metrics\n\nDownload collection has not yet succeeded. [Repository clone history](clones/README.md).\n");
      paths.push("README.md");
    }
  }
  return { paths, failures };
}
