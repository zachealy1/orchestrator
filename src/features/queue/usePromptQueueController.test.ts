import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { usePromptQueueController } from "./usePromptQueueController";

const renderController = () =>
  renderHook(() => usePromptQueueController({ listItems: async () => [] }));

describe("usePromptQueueController", () => {
  it("keeps chat queues and edit state synchronized for dispatch handlers", () => {
    const { result } = renderController();

    act(() => result.current.setPromptQueuesByChat({ 9: [] }));
    expect(result.current.promptQueuesByChatRef.current[9]).toEqual([]);

    act(() => result.current.setPromptQueueActionPendingItemId("queue-1"));
    expect(result.current.promptQueueActionPendingItemId).toBe("queue-1");
  });

  it("owns queue locks and pause state per controller instance", () => {
    const first = renderController();
    const second = renderController();

    first.result.current.promptQueueClaimLocksRef.current.add(4);
    first.result.current.pausedPromptQueueChatIdsRef.current.add(4);

    expect(second.result.current.promptQueueClaimLocksRef.current.has(4)).toBe(
      false,
    );
    expect(second.result.current.pausedPromptQueueChatIdsRef.current.has(4)).toBe(
      false,
    );
  });

  it("clears outstanding dispatch timers on disposal", () => {
    vi.useFakeTimers();
    const { result, unmount } = renderController();
    const callback = vi.fn();
    const timer = window.setTimeout(callback, 1_000);
    result.current.promptQueueDispatchTimersRef.current.set(2, timer);

    unmount();
    vi.runAllTimers();

    expect(callback).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
