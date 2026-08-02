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
});
