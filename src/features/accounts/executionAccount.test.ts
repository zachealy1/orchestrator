import { describe, expect, it } from "vitest";
import type { CodexAccountProfile } from "./types";
import { executionAccountAvailable, selectAvailableExecutionAccount } from "./executionAccount";

const accounts = [1, 2, 3].map((id) => ({
  id, status: id === 3 ? "signed_out" : "signed_in", deleted_at: null,
})) as CodexAccountProfile[];

describe("new-work execution account selection", () => {
  it("retains an available workspace preference ahead of the current account", () => {
    expect(selectAvailableExecutionAccount({ accounts, sharedProfileAvailable: true, preferredAccountId: 2, currentAccountId: 1 })).toBe(2);
    expect(selectAvailableExecutionAccount({ accounts, sharedProfileAvailable: true, preferredAccountId: 0, currentAccountId: 1 })).toBe(0);
  });

  it("inherits the current signed-in account when a saved default is unavailable", () => {
    expect(selectAvailableExecutionAccount({ accounts, sharedProfileAvailable: false, preferredAccountId: 0, currentAccountId: 2 })).toBe(2);
    expect(selectAvailableExecutionAccount({ accounts, sharedProfileAvailable: true, preferredAccountId: 3, currentAccountId: 2 })).toBe(2);
  });

  it("falls back to an available account, never a deleted or signed-out account", () => {
    expect(selectAvailableExecutionAccount({ accounts, sharedProfileAvailable: false, currentAccountId: 99 })).toBe(1);
    expect(selectAvailableExecutionAccount({ accounts: [], sharedProfileAvailable: true })).toBe(0);
    expect(selectAvailableExecutionAccount({ accounts: accounts.map((account) => ({ ...account, deleted_at: "2026-09-06" })), sharedProfileAvailable: false })).toBeNull();
    expect(executionAccountAvailable(null, accounts, false)).toBe(false);
    expect(executionAccountAvailable(3, accounts, false)).toBe(false);
  });
});
