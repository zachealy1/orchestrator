import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useAnalyticsController } from "./useAnalyticsController";

describe("useAnalyticsController", () => {
  it("loads workspace analytics through its repository adapter", async () => {
    const loadSummary = vi.fn(async () => ({
      run_count: 2,
      completed_count: 1,
      failed_count: 1,
      total_tokens: 10,
      cached_tokens: 3,
      avg_duration_ms: 500,
    }));
    const { result } = renderHook(() =>
      useAnalyticsController({ loadSummary }),
    );

    await act(() => result.current.refreshAnalytics(7));

    expect(loadSummary).toHaveBeenCalledWith(7);
    expect(result.current.analytics.run_count).toBe(2);
  });

  it("loads aggregate and activity data for a filtered scope", async () => {
    const loadSummary = vi.fn(async () => ({
      run_count: 3,
      completed_count: 3,
      failed_count: 0,
      total_tokens: 120,
      cached_tokens: 40,
      avg_duration_ms: 900,
    }));
    const loadActivity = vi.fn(async () => [
      {
        date: "2026-08-20",
        completed_count: 3,
        failed_count: 0,
        total_tokens: 120,
      },
    ]);
    const scope = { workspaceIds: [2, 4], range: "30d" as const };
    const { result } = renderHook(() =>
      useAnalyticsController({ loadActivity, loadSummary }),
    );

    await act(() => result.current.refreshAnalytics(scope));

    expect(loadSummary).toHaveBeenCalledWith(scope);
    expect(loadActivity).toHaveBeenCalledWith(scope);
    expect(result.current.activity).toHaveLength(1);
    expect(result.current.loading).toBe(false);
  });
});
