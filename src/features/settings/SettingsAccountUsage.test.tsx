import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SettingsAccountUsage } from "./SettingsAccountUsage";
import {
  emptySettingsUsage,
  settingsUsageActions,
} from "../../test/settingsUsageFixture";
import {
  usageAccounts,
  usageLimitsResponse,
  usageResetCredit,
} from "../../test/usageLimitsFixture";
import { normalizeCodexUsageLimits } from "../analytics/usageLimits";

describe("Settings usage availability", () => {
  function readyModel() {
    const response = usageLimitsResponse(2);
    response.rateLimitResetCredits!.credits = [
      usageResetCredit({ id: "later", expiresAt: 1_900_086_400 }),
      usageResetCredit({ id: "sooner" }),
    ];
    return {
      ...emptySettingsUsage,
      accounts: usageAccounts,
      selectedAccountId: 1,
      reset: { ...emptySettingsUsage.reset, canReset: true },
      state: { status: "ready" as const, refreshing: false, stale: false, error: null,
        snapshot: normalizeCodexUsageLimits(response, "plus") },
    };
  }

  it("shows each reset's expiry and sends the chosen row's ID through an icon-only action", () => {
    const actions = settingsUsageActions();
    render(<SettingsAccountUsage active model={readyModel()} actions={actions} />);
    const rows = within(screen.getByRole("list", { name: "Earned usage resets" })).getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    const expectedExpiry = new Date(1_900_000_000 * 1000).toLocaleString(undefined, {
      day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZoneName: "short",
    });
    expect(rows[0]).toHaveTextContent(`Expires ${expectedExpiry}`);
    expect(within(rows[1]).getByText(/^Expires /).textContent).not.toBe(within(rows[0]).getByText(/^Expires /).textContent);
    const buttons = screen.getAllByRole("button", { name: /^Use reset:/ });
    for (const button of buttons) {
      expect(button.textContent).toBe("");
      expect(button.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
      expect(button).toHaveAttribute("data-tooltip", "Use reset");
    }
    fireEvent.click(buttons[1]);
    expect(actions.requestReset).toHaveBeenCalledExactlyOnceWith("later");
  });

  it("keeps rows visible during refresh and spins only the refresh button", () => {
    const model = readyModel();
    model.state.refreshing = true;
    model.reset.canReset = false;
    const view = render(<SettingsAccountUsage active model={model} actions={settingsUsageActions()} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.queryByText("Refreshing")).not.toBeInTheDocument();
    expect(view.container.querySelector(".analytics-usage-refreshing")).toBeNull();
    expect(view.container.querySelectorAll(".spin")).toHaveLength(1);
    const refresh = screen.getByRole("button", { name: "Refresh account usage" });
    expect(refresh.querySelector("svg")).toHaveClass("spin");
    expect(refresh).toBeDisabled();
    expect(refresh).toHaveAttribute("aria-busy", "true");
    screen.getAllByRole("button", { name: /^Use reset:/ }).forEach((button) => expect(button).toBeDisabled());
  });

  it("does not invent entries or expiry dates when details are absent or capped", () => {
    const model = readyModel();
    model.state.snapshot.raw.rateLimitResetCredits!.availableCount = 5;
    model.state.snapshot.raw.rateLimitResetCredits!.credits![0].expiresAt = null;
    render(<SettingsAccountUsage active model={model} actions={settingsUsageActions()} />);
    expect(screen.getByText("5 earned resets available")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByText("Expiry not provided")).toBeInTheDocument();
    expect(screen.getByText("Expiry dates are unavailable for the remaining resets.")).toBeInTheDocument();
  });

  it("offers an icon-only retry even when the uncertain credit disappears from the refreshed list", () => {
    const model = readyModel();
    model.reset = { ...model.reset, retrying: true, retryCredit: usageResetCredit({ id: "missing" }) };
    const actions = settingsUsageActions();
    render(<SettingsAccountUsage active model={model} actions={actions} />);
    const retry = screen.getByRole("button", { name: "Retry reset" });
    expect(retry).toBeEnabled();
    expect(retry.textContent).toBe("");
    fireEvent.click(retry);
    expect(actions.requestReset).toHaveBeenCalledExactlyOnceWith();
    screen.getAllByRole("button", { name: /^Use reset:/ }).forEach((button) => expect(button).toBeDisabled());
  });
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
        screen.queryByRole("button", { name: /Use reset/ }),
      ).not.toBeInTheDocument();
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
    expect(screen.getByRole("button", { name: "Use reset" })).toBeDisabled();
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
