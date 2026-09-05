import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  emitCodexNotification,
  getMocks,
  prepareDefaults,
  renderApp,
  setWindowWidth,
  signedInAccount,
} from "./test/appRuntimeHarness";

const mocks = getMocks();

describe("Application usage limits", () => {
  beforeEach(() => {
    mocks.listeners.clear();
    vi.clearAllMocks();
    vi.useRealTimers();
    localStorage.clear();
    setWindowWidth(1024);
    document.documentElement.removeAttribute("data-theme");
    mocks.virtuosoState = {
      ranges: [{ startIndex: 0, endIndex: 0 }],
      scrollTop: 0,
    };
    prepareDefaults();
  });

  it("loads account usage limits in Analytics and applies live rate-limit updates", async () => {
    mocks.listCodexAccountsMock.mockResolvedValue([signedInAccount]);
    mocks.readCodexAccountMock.mockResolvedValue({
      account: {
        type: "chatgpt",
        email: signedInAccount.email,
        planType: "prolite",
      },
      requiresOpenaiAuth: true,
    });
    mocks.readCodexRateLimitsMock.mockResolvedValue({
      rateLimits: {
        limitId: "codex",
        limitName: null,
        primary: {
          usedPercent: 25,
          windowDurationMins: 10_080,
          resetsAt: 1_800_000_000,
        },
        secondary: null,
        credits: {
          hasCredits: false,
          unlimited: false,
          balance: "0",
        },
        individualLimit: null,
        spendControlReached: false,
        planType: "prolite",
        rateLimitReachedType: null,
      },
      rateLimitsByLimitId: null,
      rateLimitResetCredits: null,
    });

    const { user } = await renderApp();
    await user.click(screen.getByRole("button", { name: "Analytics" }));

    expect(await screen.findByText("Weekly usage limit")).toBeInTheDocument();
    expect(screen.getByText("75% remaining")).toBeInTheDocument();
    expect(screen.queryByText("Monthly usage limit")).not.toBeInTheDocument();
    expect(mocks.readCodexRateLimitsMock).toHaveBeenCalledWith(
      `account:${signedInAccount.id}`,
      signedInAccount.id,
    );

    mocks.readCodexRateLimitsMock.mockResolvedValue({
      rateLimits: {
        limitId: "codex",
        limitName: null,
        primary: {
          usedPercent: 20,
          windowDurationMins: 10_080,
          resetsAt: 1_800_000_100,
        },
        secondary: null,
        credits: null,
        individualLimit: null,
        spendControlReached: false,
        planType: "prolite",
        rateLimitReachedType: null,
      },
      rateLimitsByLimitId: null,
      rateLimitResetCredits: null,
    });
    await emitCodexNotification({
      method: "account/rateLimits/updated",
      params: {
        rateLimits: {
          limitId: "codex",
          primary: {
            usedPercent: 20,
            windowDurationMins: 10_080,
            resetsAt: 1_800_000_100,
          },
        },
      },
    });

    expect(await screen.findByText("80% remaining")).toBeInTheDocument();
  });
});
