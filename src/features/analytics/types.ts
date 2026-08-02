export type AnalyticsSummary = {
  run_count: number;
  completed_count: number;
  failed_count: number;
  total_tokens: number;
  cached_tokens: number;
  avg_duration_ms: number | null;
};
