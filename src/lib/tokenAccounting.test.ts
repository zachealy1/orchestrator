import { describe, expect, it } from "vitest";
import { applyCodexMessage, emptyRunView } from "./codexEventReducer";

function report(total: number, last: number, cached: number, lastCached: number) {
  return {
    method: "thread/tokenUsage/updated",
    params: {
      threadId: "resumed-thread",
      turnId: "current-turn",
      tokenUsage: {
        total: { totalTokens: total, cachedInputTokens: cached },
        last: { totalTokens: last, cachedInputTokens: lastCached },
        modelContextWindow: 128_000,
      },
    },
  };
}

function resumed(total: number | null, cached: number | null) {
  return {
    ...emptyRunView,
    tokenUsageStartTotal: total,
    tokenUsageStartCachedInput: cached,
  };
}

describe("per-run token accounting", () => {
  it.each([500, 50, null])("detects a reset even with baseline %s", (baseline) => {
    let state = applyCodexMessage(resumed(baseline, baseline), report(100, 100, 80, 80));
    expect(state.tokenUsageStartTotal).toBe(0);
    expect(state.tokenUsage?.turnTokens).toBe(100);
    state = applyCodexMessage(state, report(250, 150, 200, 120));
    state = applyCodexMessage(state, report(800, 550, 700, 500));
    expect(state.tokenUsage?.turnTokens).toBe(800);
    expect(state.tokenUsage?.turnCachedInputTokens).toBe(700);
    expect(state.tokenUsage?.contextTokens).toBe(550);
  });

  it("recovers an unloaded history baseline from the first request", () => {
    let state = applyCodexMessage(resumed(null, null), report(600, 100, 450, 50));
    expect(state.tokenUsageStartTotal).toBe(500);
    expect(state.tokenUsage?.turnTokens).toBe(100);
    state = applyCodexMessage(state, report(850, 250, 650, 200));
    expect(state.tokenUsage?.turnTokens).toBe(350);
    expect(state.tokenUsage?.turnCachedInputTokens).toBe(250);
  });

  it("keeps known baselines for counters that continue across turns", () => {
    const state = applyCodexMessage(resumed(500, 400), report(600, 100, 450, 50));
    expect(state.tokenUsage?.turnTokens).toBe(100);
    expect(state.tokenUsage?.turnCachedInputTokens).toBe(50);
  });

  it("counts all reports for a fresh thread, even if the first notification is delayed", () => {
    const state = applyCodexMessage(emptyRunView, report(600, 100, 450, 50));
    expect(state.tokenUsage?.turnTokens).toBe(600);
  });

  it("does not count duplicate reports or automatic goal continuations twice", () => {
    let state = applyCodexMessage(resumed(null, null), report(100, 100, 80, 80));
    state = applyCodexMessage(state, report(100, 100, 80, 80));
    state = applyCodexMessage(state, { method: "turn/started", params: { turn: { id: "next-goal-turn" } } });
    state = applyCodexMessage(state, report(250, 150, 200, 120));
    expect(state.tokenUsage?.turnTokens).toBe(250);
  });

  it("preserves unknown usage when no baseline or last request was reported", () => {
    const state = applyCodexMessage(resumed(null, null), {
      method: "thread/tokenUsage/updated",
      params: { tokenUsage: { total: { totalTokens: 600 } } },
    });
    expect(state.tokenUsage?.turnTokens).toBeNull();
  });

  it("ignores malformed notifications before the first usable report", () => {
    let state = applyCodexMessage(resumed(500, 400), {
      method: "thread/tokenUsage/updated", params: { tokenUsage: {} },
    });
    state = applyCodexMessage(state, report(100, 100, 80, 80));
    expect(state.tokenUsage?.turnTokens).toBe(100);
  });
});
