import { usageLimitsResponse } from "./test/usageLimitsFixture";
import { screen, waitFor, within } from "@testing-library/react";
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

    const usagePanel = within(screen.getByRole("article", { name: "Usage limits" }));
    expect(await usagePanel.findByText("Weekly usage limit")).toBeInTheDocument();
    expect(usagePanel.getByText("75% remaining")).toBeInTheDocument();
    expect(usagePanel.queryByText("Monthly usage limit")).not.toBeInTheDocument();
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

    expect(await usagePanel.findByText("80% remaining")).toBeInTheDocument();
  });
  it("shows usage beneath Accounts, finds resets through search, and shares redemption results with Analytics", async () => {
    mocks.listCodexAccountsMock.mockResolvedValue([signedInAccount]);
    mocks.readCodexAccountMock.mockResolvedValue({ account: { type: "chatgpt", email: signedInAccount.email, planType: "plus" }, requiresOpenaiAuth: true });
    mocks.readCodexRateLimitsMock.mockResolvedValue(usageLimitsResponse(2));
    mocks.consumeCodexRateLimitResetCreditMock.mockImplementation(async () => {
      mocks.readCodexRateLimitsMock.mockResolvedValue(usageLimitsResponse(1, 0));
      return { outcome: "reset" };
    });
    const { user } = await renderApp();
    await user.click(screen.getByRole("button", { name: "Settings" }));
    const panel = await screen.findByRole("region", { name: "Account usage" });
    expect(document.getElementById("settings-accounts")!.compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(await within(panel).findByText("2 earned resets available")).toBeInTheDocument();
    await user.type(screen.getByRole("searchbox", { name: "Search settings" }), "resets");
    expect(panel).toBeInTheDocument();
    await user.click(within(panel).getByRole("button", { name: "Use 1 reset" }));
    const dialog = screen.getByRole("dialog", { name: "Use one usage reset?" });
    expect(dialog).toHaveTextContent(signedInAccount.label);
    expect(mocks.consumeCodexRateLimitResetCreditMock).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole("button", { name: "Use 1 reset" }));
    expect(await screen.findByText("Usage reset applied.")).toBeInTheDocument();
    await waitFor(() => expect(within(panel).getByText("1 earned reset available")).toBeInTheDocument());
    expect(mocks.consumeCodexRateLimitResetCreditMock).toHaveBeenCalledExactlyOnceWith(`account:${signedInAccount.id}`, signedInAccount.id, expect.any(String));
    expect(within(panel).getByText("100% remaining")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Analytics" }));
    expect(await within(screen.getByRole("article", { name: "Usage limits" })).findByText("100% remaining")).toBeInTheDocument();
  });

});
