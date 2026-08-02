import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { AgentNotificationPreferences } from "../../lib/agentNotifications";
import { useNotificationController } from "./useNotificationController";

vi.mock("../../codexClient", () => ({
  readAgentNotificationPermissionStatus: () => new Promise(() => undefined),
}));

const preferences: AgentNotificationPreferences = {
  responseCompleted: true,
  approvalRequired: true,
  planReady: true,
  externalAction: true,
  userInputRequired: true,
};

describe("useNotificationController", () => {
  it("keeps notification policy refs synchronized", () => {
    const { result } = renderHook(() =>
      useNotificationController(preferences),
    );

    act(() => {
      result.current.setAgentNotificationPermission("allowed");
      result.current.setAgentNotificationPreferences({
        ...preferences,
        planReady: false,
      });
    });

    expect(result.current.agentNotificationPermissionRef.current).toBe(
      "allowed",
    );
    expect(result.current.agentNotificationPreferencesRef.current.planReady).toBe(
      false,
    );
  });

  it("owns deduplication state per app instance", () => {
    const first = renderHook(() => useNotificationController(preferences));
    const second = renderHook(() => useNotificationController(preferences));

    first.result.current.handledNotificationActivationKeysRef.current.add(
      "event-1",
    );

    expect(
      second.result.current.handledNotificationActivationKeysRef.current.has(
        "event-1",
      ),
    ).toBe(false);
  });

  it("clears user-input auto-resolution timers on disposal", () => {
    vi.useFakeTimers();
    const { result, unmount } = renderHook(() =>
      useNotificationController(preferences),
    );
    const callback = vi.fn();
    const timer = window.setTimeout(callback, 1_000);
    result.current.userInputAutoResolutionTimersRef.current.set(
      "question-1",
      timer,
    );

    unmount();
    vi.runAllTimers();

    expect(callback).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
