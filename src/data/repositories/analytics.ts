import type {
  AnalyticsActivityPoint,
  AnalyticsDateRange,
  AnalyticsScope,
  AnalyticsSummary,
} from "../../features/analytics/types";
import { FrontendDatabase } from "../database";

const EMPTY_SUMMARY: AnalyticsSummary = {
  run_count: 0,
  completed_count: 0,
  failed_count: 0,
  total_tokens: 0,
  cached_tokens: 0,
  avg_duration_ms: null,
};

function normalizeScope(scope: number | AnalyticsScope): AnalyticsScope {
  return typeof scope === "number"
    ? { workspaceIds: [scope], range: "all" }
    : scope;
}

function analyticsWhereClause(scope: AnalyticsScope) {
  const workspacePlaceholders = scope.workspaceIds.map(
    (_, index) => `$${index + 1}`,
  );
  const dateFilter: Record<AnalyticsDateRange, string | null> = {
    "7d": "-7 days",
    "30d": "-30 days",
    "90d": "-90 days",
    all: null,
  };
  const modifier = dateFilter[scope.range];

  return {
    sql: `runs.workspace_id IN (${workspacePlaceholders.join(", ")})
      AND runs.deleted_at IS NULL${
        modifier
          ? `\n      AND runs.started_at >= datetime('now', '${modifier}')`
          : ""
      }`,
    bindValues: scope.workspaceIds,
  };
}

export function createAnalyticsRepository(database: FrontendDatabase) {
  const selectOne = <T>(query: string, bindValues: unknown[] = []) =>
    database.selectOne<T>(query, bindValues);

  async function getAnalyticsSummary(scopeInput: number | AnalyticsScope) {
    const scope = normalizeScope(scopeInput);
    if (scope.workspaceIds.length === 0) {
      return EMPTY_SUMMARY;
    }
    const where = analyticsWhereClause(scope);
    const summary = await selectOne<AnalyticsSummary>(
      `SELECT
        COUNT(runs.id) AS run_count,
        COALESCE(SUM(CASE WHEN runs.status = 'completed' THEN 1 ELSE 0 END), 0) AS completed_count,
        COALESCE(SUM(CASE WHEN runs.status = 'failed' THEN 1 ELSE 0 END), 0) AS failed_count,
        COALESCE(SUM(latest_tokens.run_tokens), 0) AS total_tokens,
        COALESCE(SUM(latest_tokens.run_cached_input_tokens), 0) AS cached_tokens,
        AVG(runs.duration_ms) AS avg_duration_ms
       FROM runs
       LEFT JOIN (
         SELECT run_id, MAX(id) AS max_id
         FROM token_usage_snapshots
         GROUP BY run_id
       ) latest ON latest.run_id = runs.id
       LEFT JOIN token_usage_snapshots latest_tokens ON latest_tokens.id = latest.max_id
       WHERE ${where.sql}`,
      where.bindValues,
    );

    return summary ?? EMPTY_SUMMARY;
  }

  async function getAnalyticsActivity(scope: AnalyticsScope) {
    if (scope.workspaceIds.length === 0) {
      return [];
    }
    const where = analyticsWhereClause(scope);
    const databaseConnection = await database.get();
    return databaseConnection.select<AnalyticsActivityPoint[]>(
      `SELECT
        date(runs.started_at) AS date,
        COALESCE(SUM(CASE WHEN runs.status = 'completed' THEN 1 ELSE 0 END), 0) AS completed_count,
        COALESCE(SUM(CASE WHEN runs.status = 'failed' THEN 1 ELSE 0 END), 0) AS failed_count,
        COALESCE(SUM(latest_tokens.run_tokens), 0) AS total_tokens
       FROM runs
       LEFT JOIN (
         SELECT run_id, MAX(id) AS max_id
         FROM token_usage_snapshots
         GROUP BY run_id
       ) latest ON latest.run_id = runs.id
       LEFT JOIN token_usage_snapshots latest_tokens ON latest_tokens.id = latest.max_id
       WHERE ${where.sql}
       GROUP BY date(runs.started_at)
       ORDER BY date(runs.started_at) ASC`,
      where.bindValues,
    );
  }

  return {
    getAnalyticsActivity,
    getAnalyticsSummary,
  };
}

export type AnalyticsRepository = ReturnType<typeof createAnalyticsRepository>;
