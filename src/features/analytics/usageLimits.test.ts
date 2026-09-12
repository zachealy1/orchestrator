import { describe, expect, it } from "vitest";
import {
  classifyUsageLimitPeriod,
  mergeCodexRateLimitUpdate,
  normalizeCodexUsageLimits,
  readCodexAccountRateLimitsResponse,
  readCodexRateLimitResetCredits,
  type CodexAccountRateLimitsResponse,
  type CodexRateLimitSnapshot,
} from "./usageLimits";

function snapshot(
  overrides: Partial<CodexRateLimitSnapshot> = {},
): CodexRateLimitSnapshot {
  return {
    limitId: null,
    limitName: null,
    primary: null,
    secondary: null,
    credits: null,
    individualLimit: null,
    spendControlReached: null,
    planType: null,
    rateLimitReachedType: null,
    ...overrides,
  };
}

describe("Codex usage-limit normalization", () => {
  it("places the authoritative individual monthly limit first and removes its rolling duplicate", () => {
    const defaultLimit = snapshot({
      limitId: null,
      planType: "enterprise",
      primary: {
        usedPercent: 38,
        windowDurationMins: 43_200,
        resetsAt: 1_800_000_000,
      },
      secondary: {
        usedPercent: 42,
        windowDurationMins: 10_080,
        resetsAt: 1_700_000_000,
      },
      individualLimit: {
        limit: "1000",
        used: "400",
        remainingPercent: 60,
        resetsAt: 1_800_000_000,
      },
    });
    const response: CodexAccountRateLimitsResponse = {
      rateLimits: defaultLimit,
      rateLimitsByLimitId: {
        codex: { ...defaultLimit, limitId: "codex" },
      },
      rateLimitResetCredits: null,
    };

    const normalized = normalizeCodexUsageLimits(response, null, 123);

    expect(normalized.managedPlan).toBe(true);
    expect(normalized.buckets).toHaveLength(2);
    expect(normalized.buckets[0]).toMatchObject({
      period: "monthly",
      usedCredits: "400",
      limitCredits: "1000",
      remainingPercent: 60,
    });
    expect(normalized.buckets[1]).toMatchObject({
      period: "weekly",
      remainingPercent: 58,
    });
  });

  it("shows the real weekly window for Pro Lite without fabricating a monthly limit", () => {
    const response: CodexAccountRateLimitsResponse = {
      rateLimits: snapshot({
        planType: "prolite",
        primary: {
          usedPercent: 22,
          windowDurationMins: 10_080,
          resetsAt: 1_800_000_000,
        },
      }),
      rateLimitsByLimitId: null,
      rateLimitResetCredits: null,
    };

    expect(normalizeCodexUsageLimits(response).buckets).toEqual([
      expect.objectContaining({
        label: "Weekly usage limit",
        period: "weekly",
        remainingPercent: 78,
      }),
    ]);
  });

  it("retains named windows and clamps malformed percentages for rendering", () => {
    const response: CodexAccountRateLimitsResponse = {
      rateLimits: snapshot(),
      rateLimitsByLimitId: {
        reviews: snapshot({
          limitId: "reviews",
          limitName: "Code reviews",
          primary: {
            usedPercent: 140,
            windowDurationMins: 300,
            resetsAt: null,
          },
        }),
      },
      rateLimitResetCredits: null,
    };

    expect(normalizeCodexUsageLimits(response).buckets[0]).toMatchObject({
      label: "Code reviews · 5-hour usage limit",
      usedPercent: 100,
      remainingPercent: 0,
      reached: true,
    });
  });

  it("parses protocol responses and merges sparse non-null notifications", () => {
    const parsed = readCodexAccountRateLimitsResponse({
      rateLimits: {
        limitId: "codex",
        planType: "plus",
        primary: {
          usedPercent: 25,
          windowDurationMins: 300,
          resetsAt: 1_700_000_000,
        },
      },
      rateLimitsByLimitId: null,
    });
    expect(parsed).not.toBeNull();

    const merged = mergeCodexRateLimitUpdate(
      parsed,
      snapshot({
        limitId: "codex",
        primary: {
          usedPercent: 50,
          windowDurationMins: 300,
          resetsAt: 1_700_000_100,
        },
      }),
    );
    expect(merged.rateLimits).toMatchObject({
      planType: "plus",
      primary: { usedPercent: 50 },
    });
  });

  it("classifies supported Codex windows by duration", () => {
    expect(classifyUsageLimitPeriod(300)).toBe("five-hour");
    expect(classifyUsageLimitPeriod(1_440)).toBe("daily");
    expect(classifyUsageLimitPeriod(10_080)).toBe("weekly");
    expect(classifyUsageLimitPeriod(43_200)).toBe("monthly");
    expect(classifyUsageLimitPeriod(90)).toBe("generic");
  });
});

describe("earned reset credit availability", () => {
  it.each([null, undefined, {}, { availableCount: -1 }, { availableCount: 1.5 }, { availableCount: "2" }, { availableCount: Infinity }])("treats absent or invalid availability as unknown: %j", (value) => {
    expect(readCodexRateLimitResetCredits(value)).toBeNull();
  });
  it.each([null, [], [{ id: "one" }]])("uses the authoritative count regardless of detail rows: %j", (credits) => {
    expect(readCodexRateLimitResetCredits({ availableCount: 3, credits })).toEqual({ availableCount: 3 });
  });
  it("preserves zero and integrates availability with rate-limit parsing and notifications", () => {
    expect(readCodexRateLimitResetCredits({ availableCount: 0 })).toEqual({ availableCount: 0 });
    const response = readCodexAccountRateLimitsResponse({ rateLimits: snapshot(), rateLimitResetCredits: { availableCount: 2, credits: null } });
    expect(response?.rateLimitResetCredits?.availableCount).toBe(2);
    expect(mergeCodexRateLimitUpdate(response, snapshot()).rateLimitResetCredits?.availableCount).toBe(2);
  });
});
