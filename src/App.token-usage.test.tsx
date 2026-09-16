import { screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getMocks, prepareDefaults, prepareSignedInRun, renderApp, setWindowWidth,
  workspaceChatFixture, workspaceChatWithRunsFixture, workspaceRunFixture,
  startMockRun, emitCodexNotification, openSidebarChats, sidebarChats,
} from "./test/appRuntimeHarness";

const mocks = getMocks();

describe("resumed run token usage", () => {
  beforeEach(() => {
    mocks.listeners.clear();
    vi.clearAllMocks();
    vi.useRealTimers();
    localStorage.clear();
    setWindowWidth(1024);
    mocks.virtuosoState = { ranges: [{ startIndex: 0, endIndex: 10 }], scrollTop: 0 };
    prepareDefaults();
    prepareSignedInRun();
  });

  it.each([800_000, null])("renders and saves usage with historical total %s", async (baseline) => {
    const chat = workspaceChatFixture({ title: "Token recovery" });
    const previous = workspaceRunFixture({
      codex_turn_id: "previous-turn",
      latest_total_tokens: baseline,
      latest_cached_input_tokens: baseline,
      latest_run_tokens: baseline,
    });
    mocks.listWorkspaceChatsMock.mockResolvedValue([chat]);
    mocks.getChatWithRunsMock.mockResolvedValue(workspaceChatWithRunsFixture(chat, [previous]));
    const { user } = await renderApp();
    await openSidebarChats(user);
    await user.click(within(sidebarChats()).getByRole("button", { name: /token recovery/i }));
    await screen.findByText("Done.");
    const goalButton = screen.getByRole("button", { name: /goal mode/i });
    if (goalButton.getAttribute("aria-pressed") === "true") await user.click(goalButton);
    await startMockRun(user, "Continue measuring usage");
    expect(screen.getByText("Token usage pending")).toBeInTheDocument();

    for (const [total, last, cached, lastCached] of [[100_000, 100_000, 80_000, 80_000], [250_000, 150_000, 200_000, 120_000]]) {
      await emitCodexNotification({
        method: "thread/tokenUsage/updated",
        params: {
          threadId: "thread-1", turnId: "turn-1",
          tokenUsage: {
            total: { totalTokens: total, cachedInputTokens: cached },
            last: { totalTokens: last, cachedInputTokens: lastCached },
            modelContextWindow: 258_400,
          },
        },
      });
    }
    await waitFor(() => expect(mocks.recordTokenUsageMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ turnTokens: 250_000, turnCachedInputTokens: 200_000 }),
    ));
    await emitCodexNotification({
      method: "turn/completed",
      params: { threadId: "thread-1", turn: { id: "turn-1", status: "completed" } },
    });
    expect(screen.getByText("250,000 tokens")).toBeInTheDocument();
    expect(within(screen.getByLabelText("Task chat transcript")).queryByText("0 tokens")).not.toBeInTheDocument();
  });
});
