export type AnalyticsSummary = {
  run_count: number;
  completed_count: number;
  failed_count: number;
  total_tokens: number;
  cached_tokens: number;
  avg_duration_ms: number | null;
};

export type AnalyticsDateRange = "7d" | "30d" | "90d" | "all";

export type AnalyticsScope = {
  workspaceIds: number[];
  range: AnalyticsDateRange;
};

export type AnalyticsActivityPoint = {
  date: string;
  completed_count: number;
  failed_count: number;
  total_tokens: number;
};
