import type { AnalyticsSummary } from "../../features/analytics/types";
import { FrontendDatabase } from "../database";

export function createAnalyticsRepository(database: FrontendDatabase) {
  const selectOne = <T>(query: string, bindValues: unknown[] = []) =>
    database.selectOne<T>(query, bindValues);

  async function getAnalyticsSummary(workspaceId: number) {
    const summary = await selectOne<AnalyticsSummary>(
      `SELECT
        COUNT(runs.id) AS run_count,
        SUM(CASE WHEN runs.status = 'completed' THEN 1 ELSE 0 END) AS completed_count,
        SUM(CASE WHEN runs.status = 'failed' THEN 1 ELSE 0 END) AS failed_count,
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
       WHERE runs.workspace_id = $1
         AND runs.deleted_at IS NULL`,
      [workspaceId],
    );
  
    return (
      summary ?? {
        run_count: 0,
        completed_count: 0,
        failed_count: 0,
        total_tokens: 0,
        cached_tokens: 0,
        avg_duration_ms: null,
      }
    );
  }

  return {
    getAnalyticsSummary,
  };
}

export type AnalyticsRepository = ReturnType<typeof createAnalyticsRepository>;
