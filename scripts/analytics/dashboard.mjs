// Saved SQL uses installation IDs directly, never PostHog person merging.
export const today = "toDate(now(), 'UTC')";
export function countQuery(days) {
  if (![1, 7, 30].includes(days)) throw new Error("Unsupported activity window");
  return `SELECT uniqExact(distinct_id) AS active_installations
FROM events
WHERE event = 'active_day'
  AND properties.environment = 'production'
  AND properties.active_date >= toString(${today} - INTERVAL ${days - 1} DAY)
  AND properties.active_date <= toString(${today})`;
}

export const historyQuery = `SELECT toDate(properties.active_date) AS day,
       uniqExact(distinct_id) AS active_installations
FROM events
WHERE event = 'active_day'
  AND properties.environment = 'production'
  AND properties.active_date >= toString(${today} - INTERVAL 29 DAY)
  AND properties.active_date <= toString(${today})
GROUP BY day
ORDER BY day`;

export const dashboard = {
  name: "Orchestrator installation activity",
  description: "Distinct production installation IDs. UTC calendar days; today's figures are partial. WAU includes today and the previous 6 days; MAU includes today and the previous 29 days. Offline and opted-out installations may be missing.",
};
export const insights = [
  ...[[1, "DAU"], [7, "WAU"], [30, "MAU"]].map(([days, metric]) => ({
    name: `${metric} — active installations (${days} UTC day${days === 1 ? "" : "s"}, today partial)`,
    description: dashboard.description,
    saved: true,
    query: { kind: "DataVisualizationNode", display: "BoldNumber", source: { kind: "HogQLQuery", query: countQuery(days) } },
  })),
  {
    name: "Daily active installations — 30 UTC days (today partial)",
    description: "One distinct installation per UTC activity date. Missing dates have zero received events; delayed offline events can revise historical counts.",
    saved: true,
    query: { kind: "DataVisualizationNode", display: "ActionsLineGraph", source: { kind: "HogQLQuery", query: historyQuery } },
  },
];
