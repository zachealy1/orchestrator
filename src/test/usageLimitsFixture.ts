import type {
  AnalyticsUsageAccount,
  CodexAccountRateLimitsResponse,
} from "../features/analytics/usageLimits";

export const usageAccounts: AnalyticsUsageAccount[] = [
  {
    accountId: 1,
    profileKey: "account:1",
    label: "Personal",
    planType: "plus",
  },
  { accountId: 2, profileKey: "account:2", label: "Work", planType: "pro" },
];
export function usageLimitsResponse(
  availableCount: number | null = 2,
  usedPercent = 100,
): CodexAccountRateLimitsResponse {
  return {
    rateLimits: {
      limitId: "codex",
      limitName: null,
      primary: {
        usedPercent,
        windowDurationMins: 300,
        resetsAt: 1_900_000_000,
      },
      secondary: null,
      credits: null,
      individualLimit: null,
      spendControlReached: false,
      planType: "plus",
      rateLimitReachedType: null,
    },
    rateLimitsByLimitId: null,
    rateLimitResetCredits: availableCount === null ? null : { availableCount },
  };
}
