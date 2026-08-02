import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { CodexModel } from "../codex/types";
import { useAccountController } from "./useAccountController";

function model(overrides: Partial<CodexModel> = {}): CodexModel {
  return {
    id: "gpt-test",
    model: "gpt-test",
    displayName: "GPT Test",
    description: "Test model",
    hidden: false,
    supportedReasoningEfforts: [
      { reasoningEffort: "low", description: "Low" },
      { reasoningEffort: "high", description: "High" },
    ],
    defaultReasoningEffort: "high",
    isDefault: true,
    ...overrides,
  };
}

describe("useAccountController", () => {
  it("keeps event-facing refs synchronized with account state", () => {
    const { result } = renderHook(() => useAccountController());

    act(() => {
      result.current.setSelectedAccountId(42);
      result.current.setPendingLoginId("login-42");
      result.current.setConnectedAccountIds(new Set([42]));
    });

    expect(result.current.selectedAccountIdRef.current).toBe(42);
    expect(result.current.pendingLoginIdRef.current).toBe("login-42");
    expect([...result.current.connectedAccountIdsRef.current]).toEqual([42]);
  });

  it("selects a model default effort and preserves compatible choices", () => {
    const { result, rerender } = renderHook(() => useAccountController());

    act(() => result.current.setModels([model()]));
    expect(result.current.selectedReasoningEffort).toBe("high");

    act(() => result.current.setSelectedReasoningEffort("low"));
    act(() => result.current.setSelectedModelId("gpt-test"));
    rerender();
    expect(result.current.selectedReasoningEffort).toBe("low");

    act(() => {
      result.current.setModels([
        model({
          supportedReasoningEfforts: [
            { reasoningEffort: "medium", description: "Medium" },
          ],
          defaultReasoningEffort: "medium",
        }),
      ]);
    });
    expect(result.current.selectedReasoningEffort).toBe("medium");
  });

  it("closes the account menu on Escape", () => {
    const { result } = renderHook(() => useAccountController());

    act(() => result.current.setAccountMenuOpen(true));
    expect(result.current.accountMenuOpen).toBe(true);

    act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
    expect(result.current.accountMenuOpen).toBe(false);
  });
});
