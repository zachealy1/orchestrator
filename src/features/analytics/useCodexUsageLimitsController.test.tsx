import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type {
  AnalyticsUsageAccount,
  CodexAccountRateLimitsResponse,
  CodexUsageLimitsLoadResult,
} from "./usageLimits";
import { useCodexUsageLimitsController } from "./useCodexUsageLimitsController";

const accounts: AnalyticsUsageAccount[] = [
  {
    accountId: 1,
    profileKey: "account:1",
    label: "One",
    planType: "plus",
  },
  {
    accountId: 2,
    profileKey: "account:2",
    label: "Two",
    planType: "prolite",
  },
];

function rateLimits(usedPercent: number): CodexAccountRateLimitsResponse {
  return {
    rateLimits: {
      limitId: "codex",
      limitName: null,
      primary: {
        usedPercent,
        windowDurationMins: 10_080,
        resetsAt: 1_800_000_000,
      },
      secondary: null,
      credits: null,
      individualLimit: null,
      spendControlReached: false,
      planType: null,
      rateLimitReachedType: null,
    },
    rateLimitsByLimitId: null,
    rateLimitResetCredits: null,
  };
}

function Harness({
  availableAccounts,
  preferredAccountId,
  load,
}: {
  availableAccounts: AnalyticsUsageAccount[];
  preferredAccountId: number | null;
  load: (
    account: AnalyticsUsageAccount,
  ) => Promise<CodexUsageLimitsLoadResult>;
}) {
  const controller = useCodexUsageLimitsController({
    accounts: availableAccounts,
    preferredAccountId,
    active: true,
    load,
  });
  return (
    <div>
      <span data-testid="selected">{controller.selectedAccountId ?? "none"}</span>
      <span data-testid="remaining">
        {controller.state.snapshot?.buckets[0]?.remainingPercent ?? "none"}
      </span>
      <button type="button" onClick={() => controller.selectAccount(1)}>
        Select one
      </button>
      <button
        type="button"
        onClick={() =>
          controller.ingestRateLimitUpdate(1, {
            limitId: "codex",
            primary: {
              usedPercent: 60,
              windowDurationMins: 10_080,
              resetsAt: 1_800_000_100,
            },
          })
        }
      >
        Update one
      </button>
    </div>
  );
}

describe("useCodexUsageLimitsController", () => {
  it("defaults to the app account, preserves an explicit choice, and falls back when removed", async () => {
    const user = userEvent.setup();
    const load = vi.fn(async (account: AnalyticsUsageAccount) => ({
      kind: "ready" as const,
      response: rateLimits(account.accountId * 10),
      planType: account.planType,
    }));
    const view = render(
      <Harness
        availableAccounts={accounts}
        preferredAccountId={2}
        load={load}
      />,
    );

    await waitFor(() => expect(screen.getByTestId("selected")).toHaveTextContent("2"));
    await waitFor(() => expect(load).toHaveBeenCalledWith(accounts[1]));

    await user.click(screen.getByRole("button", { name: "Select one" }));
    await waitFor(() => expect(screen.getByTestId("selected")).toHaveTextContent("1"));
    view.rerender(
      <Harness
        availableAccounts={accounts}
        preferredAccountId={2}
        load={load}
      />,
    );
    expect(screen.getByTestId("selected")).toHaveTextContent("1");

    await user.click(screen.getByRole("button", { name: "Update one" }));
    expect(screen.getByTestId("remaining")).toHaveTextContent("40");

    view.rerender(
      <Harness
        availableAccounts={[accounts[1]]}
        preferredAccountId={2}
        load={load}
      />,
    );
    await waitFor(() => expect(screen.getByTestId("selected")).toHaveTextContent("2"));
  });

  it("tracks the app account until the Analytics selection is explicit", async () => {
    const load = vi.fn(async (account: AnalyticsUsageAccount) => ({
      kind: "ready" as const,
      response: rateLimits(account.accountId * 10),
      planType: account.planType,
    }));
    const view = render(
      <Harness
        availableAccounts={accounts}
        preferredAccountId={1}
        load={load}
      />,
    );

    await waitFor(() =>
      expect(screen.getByTestId("selected")).toHaveTextContent("1"),
    );
    view.rerender(
      <Harness
        availableAccounts={accounts}
        preferredAccountId={2}
        load={load}
      />,
    );
    await waitFor(() =>
      expect(screen.getByTestId("selected")).toHaveTextContent("2"),
    );
  });
});
