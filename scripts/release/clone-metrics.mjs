import { REPOSITORY } from "./lib.mjs";

const DAY = 86_400_000;
export const CLONE_ERRORS = Object.freeze({
  missing_credentials: "REPO_TRAFFIC_TOKEN is not configured.",
  authentication: "The traffic credential was rejected; check its expiry.",
  permission: "Traffic access was denied; check repository Administration: read permission.",
  rate_limited: "GitHub rate-limited the request; retry later.",
  api_error: "GitHub could not provide clone traffic.",
  network_error: "The traffic request failed or timed out.",
  invalid_response: "GitHub returned invalid clone traffic; previous observations were retained.",
});

function instant(value) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) {
    throw new Error("Invalid clone-history timestamp");
  }
  return value;
}
function date(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Invalid clone-history date");
  instant(`${value}T00:00:00.000Z`);
  return value;
}
const dayOf = (timestamp) => instant(timestamp).slice(0, 10);
const shift = (day, offset) => new Date(Date.parse(`${date(day)}T00:00:00.000Z`) + offset * DAY).toISOString().slice(0, 10);
const count = (value) => Number.isSafeInteger(value) && value >= 0;

// Only explicitly returned daily rows are observations. Missing dates are not zeroes.
export function normalizeCloneTraffic(value, timestamp) {
  // Allow the boundary day: GitHub's documented example includes 15 UTC buckets.
  const today = dayOf(timestamp), first = shift(today, -14);
  if (!value || !count(value.count) || !count(value.uniques) || value.uniques > value.count || !Array.isArray(value.clones) || value.clones.length > 15) {
    throw new Error("Invalid clone traffic");
  }
  const seen = new Set();
  return value.clones.map((row) => {
    if (!row || typeof row.timestamp !== "string" || !/^\d{4}-\d{2}-\d{2}T00:00:00(?:\.000)?Z$/.test(row.timestamp)) throw new Error("Invalid clone traffic");
    const day = date(row.timestamp.slice(0, 10));
    if (day < first || day > today || seen.has(day) || !count(row.count) || !count(row.uniques) || row.uniques > row.count) throw new Error("Invalid clone traffic");
    seen.add(day);
    return { date: day, clones: row.count, uniqueCloners: row.uniques };
  }).sort((a, b) => a.date.localeCompare(b.date));
}

export async function collectCloneTraffic({ token, now = new Date().toISOString(), fetcher = fetch } = {}) {
  instant(now);
  const failure = (error) => ({ timestamp: now, status: "failed", error, days: [] });
  if (typeof token !== "string" || !token.trim()) return failure("missing_credentials");
  let response;
  try {
    response = await fetcher(`https://api.github.com/repos/${REPOSITORY}/traffic/clones?per=day`, {
      headers: { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(30_000), redirect: "error",
    });
  } catch { return failure("network_error"); }
  if (!response.ok) {
    if (response.status === 429 || response.status === 403 && (response.headers?.get("x-ratelimit-remaining") === "0" || response.headers?.get("retry-after"))) return failure("rate_limited");
    return failure(response.status === 401 ? "authentication" : [403, 404].includes(response.status) ? "permission" : "api_error");
  }
  try {
    return { timestamp: now, status: "success", error: null, days: normalizeCloneTraffic(await response.json(), now) };
  } catch { return failure("invalid_response"); }
}

function validateAttempt(attempt) {
  instant(attempt?.timestamp);
  if (!["success", "failed"].includes(attempt.status) || !Array.isArray(attempt.days)) throw new Error("Invalid clone collection");
  if (attempt.status === "failed") {
    if (!Object.hasOwn(CLONE_ERRORS, attempt.error) || attempt.days.length) throw new Error("Invalid clone collection failure");
  } else {
    if (attempt.error !== null) throw new Error("Invalid clone collection success");
    normalizeCloneTraffic({ count: Number.MAX_SAFE_INTEGER, uniques: 0, clones: attempt.days.map((row) => ({ timestamp: `${row.date}T00:00:00Z`, count: row.clones, uniques: row.uniqueCloners })) }, attempt.timestamp);
  }
}

export function validateCloneHistory(history) {
  if (!history || history.schemaVersion !== 1 || history.repository !== REPOSITORY || !Array.isArray(history.days)) throw new Error("Invalid clone history; refusing to replace it");
  instant(history.collectionStartedAt); instant(history.updatedAt); date(history.coverageStartedOn);
  validateAttempt(history.lastAttempt);
  if (history.lastSuccessfulCollectionAt !== null) instant(history.lastSuccessfulCollectionAt);
  if (history.updatedAt !== history.lastAttempt.timestamp || history.collectionStartedAt > history.updatedAt || history.coverageStartedOn > dayOf(history.collectionStartedAt) || history.lastSuccessfulCollectionAt > history.updatedAt) throw new Error("Invalid clone-history interval");
  let expected = history.coverageStartedOn;
  for (const row of history.days) {
    if (row.date !== expected) throw new Error("Invalid clone-history sequence");
    if (row.clones === null) {
      if (row.uniqueCloners !== null || row.lastObservedAt !== null) throw new Error("Invalid clone-history gap");
    } else {
      if (!count(row.clones) || !count(row.uniqueCloners) || row.uniqueCloners > row.clones || dayOf(row.lastObservedAt) < row.date || row.lastObservedAt > history.updatedAt) throw new Error("Invalid clone-history observation");
    }
    expected = shift(expected, 1);
  }
  if (expected !== shift(dayOf(history.updatedAt), 1)) throw new Error("Incomplete clone-history interval");
  return history;
}

export function mergeCloneHistory(previous, attempt) {
  validateAttempt(attempt);
  if (previous) validateCloneHistory(previous);
  const lastAttempt = previous && previous.updatedAt >= attempt.timestamp ? previous.lastAttempt : attempt;
  const collectionStartedAt = previous && previous.collectionStartedAt < attempt.timestamp ? previous.collectionStartedAt : attempt.timestamp;
  const first = [shift(dayOf(attempt.timestamp), -13), ...attempt.days.map((row) => row.date)].sort()[0];
  const coverageStartedOn = previous && previous.coverageStartedOn < first ? previous.coverageStartedOn : first;
  const days = new Map((previous?.days ?? []).map((row) => [row.date, { ...row }]));
  for (const row of attempt.days) {
    const existing = days.get(row.date);
    // Newer authoritative rows replace overlapping observations, even after a correction down.
    if (!existing?.lastObservedAt || existing.lastObservedAt < attempt.timestamp) days.set(row.date, { ...row, lastObservedAt: attempt.timestamp });
  }
  for (let day = coverageStartedOn; day <= dayOf(lastAttempt.timestamp); day = shift(day, 1)) {
    if (!days.has(day)) days.set(day, { date: day, clones: null, uniqueCloners: null, lastObservedAt: null });
  }
  const successes = [previous?.lastSuccessfulCollectionAt, attempt.status === "success" ? attempt.timestamp : null].filter(Boolean).sort();
  return validateCloneHistory({ schemaVersion: 1, repository: REPOSITORY, collectionStartedAt, coverageStartedOn,
    updatedAt: lastAttempt.timestamp, lastSuccessfulCollectionAt: successes.at(-1) ?? null,
    lastAttempt, days: [...days.values()].sort((a, b) => a.date.localeCompare(b.date)) });
}

export const cloneDayStatus = (row) => row.clones === null ? "gap" : dayOf(row.lastObservedAt) === row.date ? "partial" : "reported";
export function summarizeClones(history) {
  validateCloneHistory(history);
  const months = new Map();
  let cumulativeClones = 0, missingDays = 0, partialDays = 0;
  for (const row of history.days) {
    const month = row.date.slice(0, 7);
    const totals = months.get(month) ?? { month, observedClones: 0, reportedDays: 0, missingDays: 0, partialDays: 0 };
    const status = cloneDayStatus(row);
    if (status === "gap") { totals.missingDays++; missingDays++; }
    else {
      totals.observedClones += row.clones; cumulativeClones += row.clones; totals.reportedDays++;
      if (status === "partial") { totals.partialDays++; partialDays++; }
    }
    if (!Number.isSafeInteger(cumulativeClones)) throw new Error("Clone total exceeds safe integer range");
    months.set(month, totals);
  }
  return { cumulativeClones: history.days.length > missingDays ? cumulativeClones : null, missingDays, partialDays,
    months: [...months.values()].map((row) => ({ ...row, observedClones: row.reportedDays ? row.observedClones : null })) };
}

export function renderCloneReport(history) {
  const summary = summarizeClones(history);
  const dailyCsv = "utc_date,clones,unique_cloners,status,last_observed_at\n" + history.days.map((row) => [row.date, row.clones ?? "", row.uniqueCloners ?? "", cloneDayStatus(row), row.lastObservedAt ?? ""].join(",")).join("\n") + "\n";
  const monthlyCsv = "utc_month,observed_clones,reported_days,missing_days,partial_days\n" + summary.months.map((row) => [row.month, row.observedClones ?? "", row.reportedDays, row.missingDays, row.partialDays].join(",")).join("\n") + "\n";
  const health = history.lastAttempt.status === "failed" ? `**Collection failed:** ${CLONE_ERRORS[history.lastAttempt.error]}` : "Collection succeeded.";
  const markdown = `# Orchestrator clone history

${health}

Last attempt: ${history.updatedAt}. Last successful collection: ${history.lastSuccessfulCollectionAt ?? "none"}.
Collection began ${history.collectionStartedAt}; retained daily coverage begins ${history.coverageStartedOn}, including the initial available backfill.
All dates use UTC. This static report is current only through its last attempt; check the workflow if that timestamp stops advancing.

## Observed totals

**${summary.cumulativeClones ?? "No clone counts available"}${summary.cumulativeClones === null ? "" : " observed clones"}** across the retained history. Missing days: **${summary.missingDays}**. Partial days: **${summary.partialDays}**.
${summary.missingDays || summary.partialDays ? "This total is incomplete: missing and partial days are not assumed to be zero." : "All days in the recorded interval have a post-day observation."}

These are repository clone operations, not downloads, installations, unique people or active users. Daily unique cloners are not summed across dates. No cloner identities or application-user telemetry are collected. These aggregate reports are public.

## Monthly activity

Totals cover recorded days only, not necessarily an entire calendar month.

| UTC month | Observed clones | Reported days | Missing days | Partial days |
|---|---:|---:|---:|---:|
${summary.months.map((row) => `| ${row.month} | ${row.observedClones ?? "—"} | ${row.reportedDays} | ${row.missingDays} | ${row.partialDays} |`).join("\n")}

## Daily activity (latest 30 days)

| UTC date | Clones | Unique cloners | Status |
|---|---:|---:|---|
${history.days.slice(-30).reverse().map((row) => `| ${row.date} | ${row.clones ?? "—"} | ${row.uniqueCloners ?? "—"} | ${cloneDayStatus(row)} |`).join("\n")}

A gap means no daily count was received, not zero clones. Partial means the latest observation was made during that UTC day. Failed checks retain previously observed counts. Later successful checks can recover gaps within GitHub's rolling 14-day window; older gaps remain unknown. Corrections replace the same dated row instead of adding overlapping totals.

[Daily CSV](daily.csv) · [Monthly CSV](monthly.csv) · [Full history JSON](history.json) · [Collection attempts](collections/) · [Release downloads](../README.md)
`;
  return { dailyCsv, monthlyCsv, markdown };
}
