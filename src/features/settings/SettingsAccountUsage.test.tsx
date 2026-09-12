import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SettingsAccountUsage } from "./SettingsAccountUsage";
import {
  emptySettingsUsage,
  settingsUsageActions,
} from "../../test/settingsUsageFixture";
import {
  usageAccounts,
  usageLimitsResponse,
} from "../../test/usageLimitsFixture";
import { normalizeCodexUsageLimits } from "../analytics/usageLimits";

describe("Settings usage availability", () => {
  it.each([0, null])(
    "distinguishes unavailable reset data from zero resets (%s)",
    (count) => {
      render(
        <SettingsAccountUsage
          active
          actions={settingsUsageActions()}
          model={{
            ...emptySettingsUsage,
            accounts: usageAccounts,
            selectedAccountId: 1,
            state: {
              status: "ready",
              refreshing: false,
              stale: false,
              error: null,
              snapshot: normalizeCodexUsageLimits(
                usageLimitsResponse(count),
                "plus",
              ),
            },
          }}
        />,
      );
      expect(
        screen.getByText(
          count === 0
            ? "0 earned resets available"
            : "Earned reset availability is unavailable.",
        ),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Use 1 reset" }),
      ).toBeDisabled();
    },
  );
  it("offers a usage refresh alongside a successful reset whose follow-up read failed", () => {
    render(
      <SettingsAccountUsage
        active
        actions={settingsUsageActions()}
        model={{
          ...emptySettingsUsage,
          accounts: usageAccounts,
          selectedAccountId: 1,
          reset: {
            ...emptySettingsUsage.reset,
            message: "Usage reset applied.",
          },
          state: {
            status: "ready",
            refreshing: false,
            stale: true,
            error: "Offline",
            snapshot: normalizeCodexUsageLimits(usageLimitsResponse(2), "plus"),
          },
        }}
      />,
    );
    expect(screen.getByText("Usage reset applied.")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Refresh failed — retry" }),
    ).toBeEnabled();
    expect(screen.getByRole("button", { name: "Use 1 reset" })).toBeDisabled();
  });
  it("shows sign-in guidance without a loading claim when there are no accounts", () => {
    render(
      <SettingsAccountUsage
        active
        model={emptySettingsUsage}
        actions={settingsUsageActions()}
      />,
    );
    const panel = screen.getByRole("region", { name: "Account usage" });
    expect(
      within(panel).getByText("Sign in to view earned resets."),
    ).toBeInTheDocument();
    expect(
      within(panel).queryByText("Loading available resets…"),
    ).not.toBeInTheDocument();
  });
});
