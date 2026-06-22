import { describe, expect, it } from "vitest";
import { cacheSavingsPercent, summarizeTokenUsage } from "./analytics";

describe("analytics", () => {
  it("aggregates token usage snapshots", () => {
    expect(
      summarizeTokenUsage([
        {
          totalTokens: 100,
          inputTokens: 70,
          cachedInputTokens: 40,
          outputTokens: 20,
          reasoningOutputTokens: 10,
          modelContextWindow: 128000,
        },
        {
          totalTokens: 50,
          inputTokens: 30,
          cachedInputTokens: 10,
          outputTokens: 15,
          reasoningOutputTokens: 5,
          modelContextWindow: 128000,
        },
      ]),
    ).toEqual({
      totalTokens: 150,
      inputTokens: 100,
      cachedInputTokens: 50,
      outputTokens: 35,
      reasoningOutputTokens: 15,
    });
  });

  it("calculates cache savings percent", () => {
    expect(
      cacheSavingsPercent({
        run_count: 2,
        completed_count: 1,
        failed_count: 1,
        total_tokens: 200,
        cached_tokens: 50,
        avg_duration_ms: 1000,
      }),
    ).toBe(25);
  });
});
