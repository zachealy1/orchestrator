import type { AnalyticsSummary } from "../features/analytics/types";
import type { TokenUsage } from "./codexEventReducer";

export function summarizeTokenUsage(usages: TokenUsage[]) {
  return usages.reduce(
    (summary, usage) => ({
      totalTokens: summary.totalTokens + usage.totalTokens,
      inputTokens: summary.inputTokens + usage.inputTokens,
      cachedInputTokens: summary.cachedInputTokens + usage.cachedInputTokens,
      outputTokens: summary.outputTokens + usage.outputTokens,
      reasoningOutputTokens:
        summary.reasoningOutputTokens + usage.reasoningOutputTokens,
    }),
    {
      totalTokens: 0,
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 0,
      reasoningOutputTokens: 0,
    },
  );
}

export function cacheSavingsPercent(summary: AnalyticsSummary) {
  if (summary.total_tokens === 0) {
    return 0;
  }

  return Math.round((summary.cached_tokens / summary.total_tokens) * 100);
}
