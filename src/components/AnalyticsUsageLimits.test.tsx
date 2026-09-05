import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type {
  AnalyticsUsageAccount,
  CodexUsageLimitsAccountState,
} from "../features/analytics/usageLimits";
import { AnalyticsUsageLimits } from "./AnalyticsUsageLimits";

const accounts: AnalyticsUsageAccount[] = [
  {
    accountId: 0,
    profileKey: "default",
    label: "Codex app account (shared)",
    planType: "prolite",
  },
  {
    accountId: 7,
    profileKey: "account:7",
    label: "Work account",
    planType: "enterprise",
  },
];

function readyState(
  overrides: Partial<CodexUsageLimitsAccountState["snapshot"]> = {},
): CodexUsageLimitsAccountState {
  return {
    status: "ready",
    refreshing: false,
    stale: false,
    error: null,
    snapshot: {
      planType: "prolite",
      managedPlan: false,
      hasIndividualLimit: false,
      buckets: [
        {
          id: "weekly",
          label: "Weekly usage limit",
          periodLabel: "Weekly usage limit",
          limitId: null,
          limitName: null,
          period: "weekly",
          usedPercent: 35,
          remainingPercent: 65,
          windowDurationMins: 10_080,
          resetsAt: 1_800_000_000,
          usedCredits: null,
          limitCredits: null,
          reached: false,
        },
      ],
      credits: { hasCredits: true, unlimited: false, balance: "250" },
      rateLimitReachedType: null,
      fetchedAt: 123,
      raw: {
        rateLimits: {
          limitId: null,
          limitName: null,
          primary: null,
          secondary: null,
          credits: null,
          individualLimit: null,
          spendControlReached: null,
          planType: "prolite",
          rateLimitReachedType: null,
        },
        rateLimitsByLimitId: null,
        rateLimitResetCredits: null,
      },
      ...overrides,
    },
  };
}

describe("AnalyticsUsageLimits", () => {
  it("renders plan-aware limits, progress semantics, credits, and account selection", async () => {
    const user = userEvent.setup();
    const onAccountChange = vi.fn();
    render(
      <AnalyticsUsageLimits
        accounts={accounts}
        selectedAccountId={0}
        state={readyState()}
        onAccountChange={onAccountChange}
        onRetry={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", { name: "Usage limits" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "General usage limits" })).toBeInTheDocument();
    expect(screen.getByText("Weekly usage limit")).toBeInTheDocument();
    expect(screen.getByText("65% remaining")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("value", "35");
    expect(screen.getByText("250 credits available")).toBeInTheDocument();

    const accountSelector = screen.getByRole("combobox", {
      name: "Usage account",
    });
    vi.spyOn(accountSelector, "getBoundingClientRect").mockReturnValue({
      x: 20,
      y: 20,
      top: 20,
      right: 320,
      bottom: 62,
      left: 20,
      width: 300,
      height: 42,
      toJSON: () => ({}),
    });
    await user.click(accountSelector);
    expect(
      screen.getByRole("listbox", { name: "Usage account options" }),
    ).toHaveStyle({ width: "300px" });
    await user.click(screen.getByRole("option", { name: "Work account" }));
    expect(onAccountChange).toHaveBeenCalledWith(7);
  });

  it("renders exact monthly credit usage and the reached state", () => {
    render(
      <AnalyticsUsageLimits
        accounts={accounts}
        selectedAccountId={7}
        state={readyState({
          planType: "enterprise",
          managedPlan: true,
          hasIndividualLimit: true,
          rateLimitReachedType: "workspace_member_usage_limit_reached",
          buckets: [
            {
              id: "monthly",
              label: "Monthly usage limit",
              periodLabel: "Monthly usage limit",
              limitId: "codex",
              limitName: null,
              period: "monthly",
              usedPercent: 100,
              remainingPercent: 0,
              windowDurationMins: 43_200,
              resetsAt: 1_800_000_000,
              usedCredits: "1000",
              limitCredits: "1000",
              reached: true,
            },
          ],
        })}
        onAccountChange={vi.fn()}
        onRetry={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", { name: "Plan limits" })).toBeInTheDocument();
    expect(screen.getByText(/1,000 of 1,000 credits used/)).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("usage limit has been reached");
  });

  it("offers an inline retry while retaining stale data", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(
      <AnalyticsUsageLimits
        accounts={accounts}
        selectedAccountId={0}
        state={{ ...readyState(), stale: true, error: "Offline" }}
        onAccountChange={vi.fn()}
        onRetry={onRetry}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Refresh failed/ }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
