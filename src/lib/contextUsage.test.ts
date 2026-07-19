import { describe, expect, it } from "vitest";
import {
  getContextUsageDisplay,
  parseThreadTokenUsage,
} from "./contextUsage";

describe("context usage", () => {
  it("separates cumulative thread spend from the active model context", () => {
    const usage = parseThreadTokenUsage({
      total: {
        totalTokens: 173_959,
        inputTokens: 171_922,
        cachedInputTokens: 131_968,
        outputTokens: 2_037,
        reasoningOutputTokens: 103,
      },
      last: {
        totalTokens: 18_757,
        inputTokens: 18_651,
        cachedInputTokens: 18_176,
        outputTokens: 106,
        reasoningOutputTokens: 0,
      },
      modelContextWindow: 258_400,
    });

    expect(usage).toMatchObject({
      totalTokens: 173_959,
      contextTokens: 18_757,
      modelContextWindow: 258_400,
    });
    expect(getContextUsageDisplay(usage, 258_400, 258_400)).toMatchObject({
      label: "18,757 / 258,400 (7%)",
      percentage: 7,
    });
  });

  it("uses Codex totals directly without adding cached input a second time", () => {
    const usage = parseThreadTokenUsage({
      total: {
        totalTokens: 10_000,
        inputTokens: 9_000,
        cachedInputTokens: 8_000,
        outputTokens: 1_000,
        reasoningOutputTokens: 250,
      },
      last: {
        totalTokens: 2_000,
        inputTokens: 1_800,
        cachedInputTokens: 1_600,
        outputTokens: 200,
        reasoningOutputTokens: 50,
      },
      modelContextWindow: 100_000,
    });

    expect(usage?.contextTokens).toBe(2_000);
    expect(getContextUsageDisplay(usage, 100_000, 100_000).percentage).toBe(2);
  });

  it("tracks a smaller active context after compaction while cumulative usage grows", () => {
    const before = parseThreadTokenUsage({
      total: { totalTokens: 100_000 },
      last: { totalTokens: 90_000 },
      modelContextWindow: 128_000,
    });
    const after = parseThreadTokenUsage({
      total: { totalTokens: 120_000 },
      last: { totalTokens: 24_000 },
      modelContextWindow: 128_000,
    });

    expect(before?.contextTokens).toBe(90_000);
    expect(after?.totalTokens).toBe(120_000);
    expect(after?.contextTokens).toBe(24_000);
  });

  it("uses the context window reported for each model", () => {
    const usage = parseThreadTokenUsage({
      total: { totalTokens: 40_000 },
      last: { totalTokens: 20_000 },
      modelContextWindow: 64_000,
    });

    expect(getContextUsageDisplay(usage, 258_400, 258_400)).toMatchObject({
      label: "20,000 / 64,000 (31%)",
      percentage: 31,
    });
  });

  it("does not relabel legacy cumulative usage as active context", () => {
    const usage = parseThreadTokenUsage({
      total: { totalTokens: 75_000 },
      modelContextWindow: 128_000,
    });

    expect(usage?.contextTokens).toBeNull();
    expect(getContextUsageDisplay(usage, 128_000, 258_400)).toMatchObject({
      label: "Context unavailable",
      percentage: null,
    });
  });

  it("shows a zero baseline before Codex reports usage", () => {
    expect(getContextUsageDisplay(null, 258_400, 258_400)).toMatchObject({
      label: "0 / 258,400 (0%)",
      percentage: 0,
    });
  });
});
