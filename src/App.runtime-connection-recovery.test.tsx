import { act, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getMocks,
  prepareDefaults,
  prepareKanbanRun,
  prepareSignedInRun,
  renderApp,
  setWindowWidth,
  signedInAccount,
} from "./test/appRuntimeHarness";

const mocks = getMocks();

describe("Application runtime Codex connection recovery", () => {
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

  it("recovers an unresponsive managed profile before creating run records", async () => {
    prepareSignedInRun();
    let accountReadCount = 0;
    mocks.readCodexAccountMock.mockImplementation(async () => {
      accountReadCount += 1;
      if (accountReadCount === 2) {
        throw new Error("Timed out waiting for Codex response to account/read");
      }
      return {
        account: {
          type: "chatgpt",
          email: signedInAccount.email,
          planType: signedInAccount.plan_type,
        },
        requiresOpenaiAuth: true,
      };
    });

    const { user } = await renderApp();
    await screen.findByLabelText("Codex account");
    const connectCallsBeforeRun = mocks.connectCodexMock.mock.calls.filter(
      ([accountId]) => accountId === 7,
    ).length;
    await user.type(screen.getByLabelText("Prompt"), "Build snake");
    await user.click(screen.getByRole("button", { name: /run codex/i }));

    await waitFor(() =>
      expect(mocks.codexRpcMock).toHaveBeenCalledWith(
        7,
        "turn/start",
        expect.any(Object),
      ),
    );
    expect(accountReadCount).toBeGreaterThanOrEqual(3);
    expect(mocks.stopCodexMock).toHaveBeenCalledOnce();
    expect(mocks.stopCodexMock).toHaveBeenCalledWith(7);
    expect(
      mocks.connectCodexMock.mock.calls.filter(([accountId]) => accountId === 7),
    ).toHaveLength(connectCallsBeforeRun + 1);
    expect(mocks.createChatMock).toHaveBeenCalledTimes(1);
    expect(mocks.createTaskMock).toHaveBeenCalledTimes(1);
    expect(mocks.createRunMock).toHaveBeenCalledTimes(1);
    expect(mocks.createTaskMock).toHaveBeenCalledWith(
      expect.objectContaining({
        chatId: 401,
        turnIndex: 1,
        originalPrompt: "Build snake",
      }),
    );
    expect(screen.getByLabelText("Submitted prompt")).toHaveTextContent(
      "Build snake",
    );
    expect(screen.queryByLabelText("Run error")).not.toBeInTheDocument();
  });

  it("bounds managed-profile recovery to one restart", async () => {
    prepareSignedInRun();
    let accountReadCount = 0;
    mocks.readCodexAccountMock.mockImplementation(async () => {
      accountReadCount += 1;
      if (accountReadCount === 1) {
        return {
          account: {
            type: "chatgpt",
            email: signedInAccount.email,
            planType: signedInAccount.plan_type,
          },
          requiresOpenaiAuth: true,
        };
      }
      throw new Error("Timed out waiting for Codex response to account/read");
    });

    const { user } = await renderApp();
    await screen.findByLabelText("Codex account");
    const connectCallsBeforeRun = mocks.connectCodexMock.mock.calls.filter(
      ([accountId]) => accountId === 7,
    ).length;
    await user.type(screen.getByLabelText("Prompt"), "Build snake");
    await user.click(screen.getByRole("button", { name: /run codex/i }));

    expect(await screen.findByLabelText("Run error")).toHaveTextContent(
      "Codex did not respond after Orchestrator restarted its app-server",
    );
    expect(mocks.stopCodexMock).toHaveBeenCalledOnce();
    expect(
      mocks.connectCodexMock.mock.calls.filter(([accountId]) => accountId === 7),
    ).toHaveLength(connectCallsBeforeRun + 1);
    expect(accountReadCount).toBe(3);
    expect(mocks.createTaskMock).not.toHaveBeenCalled();
    expect(mocks.createRunMock).not.toHaveBeenCalled();
    expect(
      mocks.codexRpcMock.mock.calls.some(
        ([, method]) => method === "thread/start" || method === "turn/start",
      ),
    ).toBe(false);
  });

  it("preserves authentication and reconnects after an app-server process exit", async () => {
    prepareSignedInRun();

    const { user } = await renderApp();
    await screen.findByLabelText("Codex account");
    const connectCallsBeforeExit = mocks.connectCodexMock.mock.calls.filter(
      ([accountId]) => accountId === 7,
    ).length;
    await act(async () => {
      mocks.listeners.get("codex:process")?.({
        payload: {
          accountId: 7,
          profileKey: "account:7",
          status: "exited",
          message: "Codex app-server stdout closed",
        },
      });
      await Promise.resolve();
    });

    expect(screen.getByLabelText("Codex account")).toBeInTheDocument();
    expect(screen.queryByLabelText("Sign in to Codex")).not.toBeInTheDocument();
    await user.type(screen.getByLabelText("Prompt"), "Reconnect and run");
    await user.click(screen.getByRole("button", { name: /run codex/i }));

    await waitFor(() =>
      expect(mocks.codexRpcMock).toHaveBeenCalledWith(
        7,
        "turn/start",
        expect.any(Object),
      ),
    );
    expect(
      mocks.connectCodexMock.mock.calls.filter(([accountId]) => accountId === 7),
    ).toHaveLength(connectCallsBeforeExit + 1);
  });

  it("keeps a Kanban attempt active while its unresponsive profile restarts", async () => {
    prepareKanbanRun();
    const defaultRpc =
      mocks.codexDefaultProfileRpcMock.getMockImplementation();
    let timeoutNextAccountRead = false;
    mocks.codexDefaultProfileRpcMock.mockImplementation(
      async (method: string, params?: Record<string, unknown>) => {
        if (
          timeoutNextAccountRead &&
          method === "account/read" &&
          params?.refreshToken === true
        ) {
          timeoutNextAccountRead = false;
          throw new Error(
            "Timed out waiting for Codex response to account/read",
          );
        }
        return defaultRpc?.(method, params);
      },
    );

    const { user } = await renderApp();
    await user.click(await screen.findByRole("radio", { name: "Kanban" }));
    timeoutNextAccountRead = true;
    mocks.stopDefaultCodexProfileMock.mockImplementationOnce(async () => {
      mocks.listeners.get("codex:process")?.({
        payload: {
          accountId: 0,
          profileKey: "default",
          status: "stopped",
          message: "Codex app-server stopped",
        },
      });
      await Promise.resolve();
    });

    await user.click(
      screen.getByRole("button", { name: "Start test Kanban agent" }),
    );

    await waitFor(() =>
      expect(mocks.updateKanbanAttemptMock).toHaveBeenCalledWith(
        expect.objectContaining({ status: "running" }),
      ),
    );
    expect(mocks.stopDefaultCodexProfileMock).toHaveBeenCalledOnce();
    expect(
      mocks.updateKanbanAttemptMock.mock.calls.some(
        ([input]) =>
          input.status === "interrupted" || input.status === "failed",
      ),
    ).toBe(false);
    expect(mocks.createTaskMock).toHaveBeenCalledTimes(1);
    expect(mocks.createRunMock).toHaveBeenCalledTimes(1);
  });
});
