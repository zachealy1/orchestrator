import { useCallback, useRef, useState } from "react";
import type {
  AnalyticsActivityPoint,
  AnalyticsScope,
  AnalyticsSummary,
} from "./types";

const DEFAULT_ANALYTICS: AnalyticsSummary = {
  run_count: 0,
  completed_count: 0,
  failed_count: 0,
  total_tokens: 0,
  cached_tokens: 0,
  avg_duration_ms: null,
};

export type AnalyticsControllerOptions = {
  loadSummary: (
    scope: number | AnalyticsScope,
  ) => Promise<AnalyticsSummary>;
  loadActivity?: (
    scope: AnalyticsScope,
  ) => Promise<AnalyticsActivityPoint[]>;
};

export function useAnalyticsController({
  loadSummary,
  loadActivity,
}: AnalyticsControllerOptions) {
  const [analytics, setAnalytics] = useState(DEFAULT_ANALYTICS);
  const [activity, setActivity] = useState<AnalyticsActivityPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const requestIdRef = useRef(0);
  const refreshAnalytics = useCallback(
    async (scope: number | AnalyticsScope) => {
      const requestId = ++requestIdRef.current;
      setLoading(true);
      try {
        const [summary, nextActivity] = await Promise.all([
          loadSummary(scope),
          typeof scope === "number" || !loadActivity
            ? Promise.resolve([])
            : loadActivity(scope),
        ]);
        if (requestId === requestIdRef.current) {
          setAnalytics(summary);
          setActivity(nextActivity);
        }
        return summary;
      } finally {
        if (requestId === requestIdRef.current) {
          setLoading(false);
        }
      }
    },
    [loadActivity, loadSummary],
  );

  return { activity, analytics, loading, refreshAnalytics };
}
