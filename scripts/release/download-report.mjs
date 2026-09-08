import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { downloadSnapshot, dailyDownloadChanges, releases, REPOSITORY } from "./lib.mjs";
const directory = resolve(process.argv[2] ?? "download-metrics");
await mkdir(join(directory, "snapshots"), { recursive: true });
let previous = null;
try { previous = JSON.parse(await readFile(join(directory, "latest.json"), "utf8")); } catch (error) { if (error.code !== "ENOENT") throw error; }
const snapshot = downloadSnapshot(await releases(REPOSITORY), previous);
await writeFile(join(directory, "snapshots", `${snapshot.timestamp.replaceAll(":", "-")}.json`), JSON.stringify(snapshot, null, 2));
await writeFile(join(directory, "latest.json"), JSON.stringify(snapshot, null, 2));
const history = await Promise.all((await readdir(join(directory, "snapshots"))).filter((name) => name.endsWith(".json"))
  .map(async (name) => JSON.parse(await readFile(join(directory, "snapshots", name), "utf8"))));
const days = dailyDownloadChanges(history);
await writeFile(join(directory, "daily.csv"), "observed_utc_date,version,architecture,kind,observed_download_increase\n" + days.map((row) => Object.values(row).join(",")).join("\n") + "\n");
const groups = new Map();
for (const asset of snapshot.assets) {
  const key = `${asset.version}|${asset.architecture}|${asset.kind}`;
  const group = groups.get(key) ?? { version: asset.version, architecture: asset.architecture, kind: asset.kind, downloads: 0, change: 0 };
  group.downloads += asset.downloads; group.change += asset.change; groups.set(key, group);
}
const rows = [...groups.values()].sort((a, b) => `${a.version}${a.architecture}${a.kind}`.localeCompare(`${b.version}${b.architecture}${b.kind}`));
await writeFile(join(directory, "downloads.csv"), "version,architecture,kind,downloads,change_since_previous_snapshot\n" + rows.map((row) => Object.values(row).join(",")).join("\n") + "\n");
await writeFile(join(directory, "README.md"), `# Orchestrator downloads\n\nUpdated ${snapshot.timestamp}. Previous snapshot: ${snapshot.previousTimestamp ?? "none (initial total)"}.\n\nDownloads are not unique users, installations or active users. Retries, CI verification and automation count. Asset IDs preserve removed/replaced asset history. Counter decreases are flagged in snapshots and never shown as negative downloads. Underlying GitHub counters are public; this report is public.\n\n| Version | Architecture | Asset | Downloads | Since previous snapshot |\n|---|---|---|---:|---:|\n${rows.map((row) => `| ${Object.values(row).join(" | ")} |`).join("\n")}\n\n[Totals CSV](downloads.csv) · [Daily changes CSV](daily.csv). Daily changes sum observed increases by UTC snapshot date, including publication-day checks; they are not exact download timestamps. Initial lifetime totals are excluded from daily increases. Timestamped snapshots are in snapshots/. No application identifiers or telemetry are collected.\n`);
