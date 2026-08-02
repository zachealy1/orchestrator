import { useCallback, useState } from "react";
import type { AnalyticsSummary } from "./types";

const DEFAULT_ANALYTICS: AnalyticsSummary = {
  run_count: 0,
  completed_count: 0,
  failed_count: 0,
  total_tokens: 0,
  cached_tokens: 0,
  avg_duration_ms: null,
};

export type AnalyticsControllerOptions = {
  loadSummary: (workspaceId: number) => Promise<AnalyticsSummary>;
};

export function useAnalyticsController({
  loadSummary,
}: AnalyticsControllerOptions) {
  const [analytics, setAnalytics] = useState(DEFAULT_ANALYTICS);
  const refreshAnalytics = useCallback(
    async (workspaceId: number) => {
      const summary = await loadSummary(workspaceId);
      setAnalytics(summary);
      return summary;
    },
    [loadSummary],
  );

  return { analytics, refreshAnalytics };
}
