import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { consumeCodexRateLimitResetCredit } from "../../codexClient";
import {
  usageAccounts,
  usageLimitsResponse,
} from "../../test/usageLimitsFixture";
import { useCodexUsageLimitsController } from "./useCodexUsageLimitsController";
import type {
  AnalyticsUsageAccount,
  CodexUsageLimitsLoadResult,
  CodexUsageResetOutcome,
} from "./usageLimits";

vi.mock("../../codexClient", () => ({
  consumeCodexRateLimitResetCredit: vi.fn(),
}));
const consume = vi.mocked(consumeCodexRateLimitResetCredit);
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function setup(count: number | null = 2) {
  const load = vi.fn(
    async (
      _account: AnalyticsUsageAccount,
    ): Promise<CodexUsageLimitsLoadResult> => ({
      kind: "ready",
      response: usageLimitsResponse(count),
      planType: "plus",
    }),
  );
  const hook = renderHook(
    ({ accounts }) =>
      useCodexUsageLimitsController({
        accounts,
        preferredAccountId: 1,
        active: true,
        load,
      }),
    { initialProps: { accounts: usageAccounts } },
  );
  return { ...hook, load };
}

beforeEach(() => {
  consume.mockReset();
});

describe("earned usage resets", () => {
  it.each([
    "reset",
    "alreadyRedeemed",
    "nothingToReset",
    "noCredit",
  ] as CodexUsageResetOutcome[])(
    "handles %s and reads authoritative usage afterward",
    async (outcome) => {
      consume.mockResolvedValue({ outcome });
      const { result, load } = setup();
      await waitFor(() =>
        expect(result.current.settingsModel.reset.canReset).toBe(true),
      );
      act(() => result.current.settingsActions.requestReset());
      expect(consume).not.toHaveBeenCalled();
      load.mockResolvedValue({
        kind: "ready",
        response: usageLimitsResponse(1, 0),
        planType: "plus",
      });
      await act(() => result.current.settingsActions.confirmReset());
      expect(consume).toHaveBeenCalledExactlyOnceWith(
        "account:1",
        1,
        expect.stringMatching(/^[0-9a-f-]{36}$/),
      );
      expect(load).toHaveBeenCalledTimes(2);
      expect(result.current.state.snapshot?.buckets[0].remainingPercent).toBe(
        100,
      );
      expect(result.current.settingsModel.reset.confirmation).toBeNull();
      const messages = {
        reset: "Usage reset applied.",
        alreadyRedeemed: "This usage reset was already applied.",
        nothingToReset: "There are no eligible usage limits to reset.",
        noCredit: "No earned usage resets are available for this account.",
      };
      expect(result.current.settingsModel.reset.message).toBe(
        messages[outcome],
      );
    },
  );

  it.each([0, null])(
    "does not permit redemption when availability is %s",
    async (count) => {
      const { result } = setup(count);
      await waitFor(() => expect(result.current.state.status).toBe("ready"));
      act(() => result.current.settingsActions.requestReset());
      expect(result.current.settingsModel.reset.confirmation).toBeNull();
      expect(consume).not.toHaveBeenCalled();
    },
  );

  it("blocks double submissions, cancellation, and another reset during redemption", async () => {
    const request = deferred<{ outcome: "reset" }>();
    consume.mockReturnValue(request.promise);
    const { result } = setup();
    await waitFor(() =>
      expect(result.current.settingsModel.reset.canReset).toBe(true),
    );
    act(() => result.current.settingsActions.requestReset());
    let completion!: Promise<void>;
    act(() => {
      completion = result.current.settingsActions.confirmReset();
      void result.current.settingsActions.confirmReset();
      result.current.settingsActions.cancelReset();
      result.current.settingsActions.requestReset();
    });
    expect(consume).toHaveBeenCalledTimes(1);
    expect(result.current.settingsModel.reset.confirmation?.status).toBe(
      "submitting",
    );
    expect(result.current.settingsModel.reset.canReset).toBe(false);
    await act(async () => {
      request.resolve({ outcome: "reset" });
      await completion;
    });
  });

  it("reuses an uncertain request ID after dismissing and reopening, even if no credits remain", async () => {
    consume
      .mockRejectedValueOnce(new Error("Connection lost"))
      .mockResolvedValue({ outcome: "alreadyRedeemed" });
    const { result, load } = setup();
    await waitFor(() =>
      expect(result.current.settingsModel.reset.canReset).toBe(true),
    );
    act(() => result.current.settingsActions.requestReset());
    await act(() => result.current.settingsActions.confirmReset());
    expect(result.current.settingsModel.reset.confirmation?.error).toContain(
      "Connection lost",
    );
    const key = consume.mock.calls[0][2];
    act(() => result.current.settingsActions.cancelReset());
    load.mockResolvedValue({
      kind: "ready",
      response: usageLimitsResponse(0, 0),
      planType: "plus",
    });
    await act(() => result.current.refreshAccount(1));
    expect(result.current.settingsModel.reset.retrying).toBe(true);
    act(() => result.current.settingsActions.requestReset());
    await act(() => result.current.settingsActions.confirmReset());
    expect(consume.mock.calls[1][2]).toBe(key);
    expect(result.current.settingsModel.reset.canReset).toBe(false);
  });

  it("uses a new request ID for a subsequent completed redemption", async () => {
    consume.mockResolvedValue({ outcome: "reset" });
    const { result } = setup();
    await waitFor(() =>
      expect(result.current.settingsModel.reset.canReset).toBe(true),
    );
    for (let i = 0; i < 2; i += 1) {
      act(() => result.current.settingsActions.requestReset());
      await act(() => result.current.settingsActions.confirmReset());
    }
    expect(consume.mock.calls[0][2]).not.toBe(consume.mock.calls[1][2]);
  });

  it("keeps the confirmation and refreshed result tied to its captured account", async () => {
    consume.mockResolvedValue({ outcome: "reset" });
    const { result, load } = setup();
    await waitFor(() =>
      expect(result.current.settingsModel.reset.canReset).toBe(true),
    );
    act(() => result.current.settingsActions.requestReset());
    load.mockImplementation(async (account) => ({
      kind: "ready",
      response: usageLimitsResponse(account.accountId === 2 ? 0 : 2),
      planType: "plus",
    }));
    act(() => result.current.selectAccount(2));
    await waitFor(() => expect(result.current.state.status).toBe("ready"));
    expect(result.current.settingsModel.reset.canConfirm).toBe(true);
    expect(result.current.settingsModel.reset.canReset).toBe(false);
    await act(() => result.current.settingsActions.confirmReset());
    expect(consume.mock.calls[0].slice(0, 2)).toEqual(["account:1", 1]);
    expect(load).toHaveBeenLastCalledWith(usageAccounts[0]);
    expect(result.current.selectedAccountId).toBe(2);
    expect(result.current.settingsModel.reset.message).toBeNull();
  });

  it.each(["removed", "signed-out", "unsupported"] as const)(
    "invalidates confirmation when the account becomes %s",
    async (status) => {
      const { result, rerender, load } = setup();
      await waitFor(() =>
        expect(result.current.settingsModel.reset.canReset).toBe(true),
      );
      act(() => result.current.settingsActions.requestReset());
      if (status === "removed") rerender({ accounts: [usageAccounts[1]] });
      else {
        load.mockResolvedValue({ kind: status });
        await act(() => result.current.refreshAccount(1));
      }
      await waitFor(() =>
        expect(result.current.settingsModel.reset.confirmation).toBeNull(),
      );
      await act(() => result.current.settingsActions.confirmReset());
      expect(consume).not.toHaveBeenCalled();
    },
  );

  it("retains reset success when refreshing fails and retries only the usage read", async () => {
    consume.mockResolvedValue({ outcome: "reset" });
    const { result, load } = setup();
    await waitFor(() =>
      expect(result.current.settingsModel.reset.canReset).toBe(true),
    );
    act(() => result.current.settingsActions.requestReset());
    load.mockRejectedValueOnce(new Error("Offline"));
    await act(() => result.current.settingsActions.confirmReset());
    expect(result.current.settingsModel.reset.message).toBe(
      "Usage reset applied.",
    );
    expect(result.current.state.stale).toBe(true);
    expect(result.current.settingsModel.reset.canReset).toBe(false);
    await act(() => result.current.refreshAccount(1));
    expect(result.current.state.stale).toBe(false);
    expect(consume).toHaveBeenCalledTimes(1);
  });

  it("handles an older engine without offering a failing redemption again", async () => {
    consume.mockRejectedValue(new Error("Method not found (-32601)"));
    const { result } = setup();
    await waitFor(() =>
      expect(result.current.settingsModel.reset.canReset).toBe(true),
    );
    act(() => result.current.settingsActions.requestReset());
    await act(() => result.current.settingsActions.confirmReset());
    expect(result.current.settingsModel.reset.confirmation).toBeNull();
    expect(result.current.settingsModel.reset.message).toContain(
      "unavailable in this Codex engine",
    );
    expect(result.current.settingsModel.reset.canReset).toBe(false);
    expect(result.current.settingsModel.reset.retrying).toBe(false);
  });

  it("disables redemption while refreshing and while partial live updates await credit availability", async () => {
    const { result, load } = setup();
    await waitFor(() =>
      expect(result.current.settingsModel.reset.canReset).toBe(true),
    );
    const read = deferred<CodexUsageLimitsLoadResult>();
    load.mockReturnValue(read.promise);
    let refresh!: Promise<void>;
    act(() => {
      refresh = result.current.refreshAccount(1);
    });
    expect(result.current.settingsModel.reset.canReset).toBe(false);
    await act(async () => {
      read.resolve({
        kind: "ready",
        response: usageLimitsResponse(2),
        planType: "plus",
      });
      await refresh;
    });
    act(() =>
      result.current.ingestRateLimitUpdate(1, usageLimitsResponse().rateLimits),
    );
    expect(result.current.settingsModel.reset.canReset).toBe(false);
  });
  it("does not leak an in-flight account's completion into its replacement", async () => {
    const request = deferred<{ outcome: "reset" }>();
    consume.mockReturnValue(request.promise);
    const { result, rerender } = setup();
    await waitFor(() =>
      expect(result.current.settingsModel.reset.canReset).toBe(true),
    );
    act(() => result.current.settingsActions.requestReset());
    let completion!: Promise<void>;
    act(() => {
      completion = result.current.settingsActions.confirmReset();
    });
    rerender({ accounts: [usageAccounts[1]] });
    await waitFor(() => expect(result.current.selectedAccountId).toBe(2));
    expect(result.current.settingsModel.reset.confirmation).toBeNull();
    await act(async () => {
      request.resolve({ outcome: "reset" });
      await completion;
    });
    expect(result.current.settingsModel.reset.message).toBeNull();
    expect(result.current.settingsModel.reset.retrying).toBe(false);
  });
});
