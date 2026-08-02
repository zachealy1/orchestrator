import { act, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  emitCodexNotification,
  getMocks,
  prepareDefaults,
  prepareKanbanRun,
  renderApp,
  setWindowWidth,
} from "./test/appRuntimeHarness";

const mocks = getMocks();

describe("Application runtime scenarios 9", () => {
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

  it("keeps a Kanban run active when its pause interrupt is rejected", async () => {
    prepareKanbanRun();
    mocks.codexRpcMock.mockImplementation(
      async (_accountId: number, method: string, params: any) => {
        if (method === "thread/start") {
          return { thread: { id: "thread-kanban" } };
        }
        if (method === "thread/goal/set") {
          return {
            goal: {
              threadId: params.threadId,
              objective: params.objective,
              status: "active",
              timeUsedSeconds: 0,
            },
          };
        }
        if (method === "turn/start") {
          return { turn: { id: "turn-kanban" } };
        }
        if (method === "turn/interrupt") {
          throw new Error("Interrupt service unavailable");
        }
        return {};
      },
    );

    const { user } = await renderApp();
    await user.click(await screen.findByRole("radio", { name: "Kanban" }));
    await user.click(
      screen.getByRole("button", { name: "Start test Kanban agent" }),
    );

    await waitFor(() =>
      expect(mocks.updateKanbanAttemptMock).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "running",
          sequence: 1,
          turnId: "turn-kanban",
        }),
      ),
    );
    await user.click(
      screen.getByRole("button", { name: "Pause test Kanban agent" }),
    );

    await waitFor(() =>
      expect(screen.getByLabelText("Kanban test result")).toHaveTextContent(
        "The card turn could not be paused.",
      ),
    );
    expect(mocks.codexRpcMock).toHaveBeenCalledWith(7, "turn/interrupt", {
      threadId: "thread-kanban",
      turnId: "turn-kanban",
    });
    expect(
      mocks.updateKanbanAttemptMock.mock.calls.map(([input]) => ({
        status: input.status,
        sequence: input.sequence,
      })),
    ).toEqual([
      { status: "running", sequence: 1 },
      { status: "pause_requested", sequence: 2 },
      { status: "running", sequence: 3 },
    ]);
    expect(mocks.updateKanbanAttemptMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ status: "paused" }),
    );
    expect(mocks.updateRunMock).not.toHaveBeenCalledWith(
      202,
      expect.objectContaining({ status: "interrupted" }),
    );
    expect(mocks.updateTaskStatusMock).not.toHaveBeenCalledWith(
      101,
      "interrupted",
    );
    expect(mocks.codexRpcMock).not.toHaveBeenCalledWith(
      7,
      "thread/goal/clear",
      expect.any(Object),
    );
  });

  it("interrupts a Kanban turn that starts after pause won the setup race", async () => {
    prepareKanbanRun();
    let resolveTurnStart!: (value: { turn: { id: string } }) => void;
    mocks.codexRpcMock.mockImplementation(
      async (_accountId: number, method: string, params: any) => {
        if (method === "thread/start") {
          return { thread: { id: "thread-kanban-race" } };
        }
        if (method === "thread/goal/set") {
          return {
            goal: {
              threadId: params.threadId,
              objective: params.objective,
              status: "active",
              timeUsedSeconds: 0,
            },
          };
        }
        if (method === "turn/start") {
          return new Promise<{ turn: { id: string } }>((resolve) => {
            resolveTurnStart = resolve;
          });
        }
        return {};
      },
    );

    const { user } = await renderApp();
    await user.click(await screen.findByRole("radio", { name: "Kanban" }));
    await user.click(
      screen.getByRole("button", { name: "Start test Kanban agent" }),
    );
    await waitFor(() =>
      expect(
        mocks.codexRpcMock.mock.calls.some(
          ([, method]) => method === "turn/start",
        ),
      ).toBe(true),
    );

    await user.click(
      screen.getByRole("button", { name: "Pause test Kanban agent" }),
    );
    await waitFor(() =>
      expect(mocks.updateKanbanAttemptMock).toHaveBeenCalledWith(
        expect.objectContaining({ status: "pause_requested", sequence: 1 }),
      ),
    );
    expect(mocks.updateKanbanAttemptMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ status: "paused" }),
    );
    expect(
      mocks.codexRpcMock.mock.calls.some(
        ([, method]) => method === "turn/interrupt",
      ),
    ).toBe(false);

    await act(async () => {
      resolveTurnStart({ turn: { id: "turn-kanban-race" } });
      await Promise.resolve();
    });

    await waitFor(() =>
      expect(mocks.codexRpcMock).toHaveBeenCalledWith(7, "turn/interrupt", {
        threadId: "thread-kanban-race",
        turnId: "turn-kanban-race",
      }),
    );
    await waitFor(() =>
      expect(mocks.updateKanbanAttemptMock).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "paused",
          sequence: 2,
          threadId: "thread-kanban-race",
          turnId: "turn-kanban-race",
        }),
      ),
    );
    expect(screen.getByLabelText("Kanban test result")).toHaveTextContent(
      "paused",
    );
    expect(mocks.updateRunMock).toHaveBeenCalledWith(
      202,
      expect.objectContaining({ status: "interrupted" }),
    );
    expect(mocks.updateTaskStatusMock).toHaveBeenCalledWith(101, "interrupted");
  });

  it("retries terminal Kanban persistence before completing the run record", async () => {
    prepareKanbanRun();

    const { user } = await renderApp();
    await user.click(await screen.findByRole("radio", { name: "Kanban" }));
    await user.click(
      screen.getByRole("button", { name: "Start test Kanban agent" }),
    );
    await waitFor(() =>
      expect(mocks.updateKanbanAttemptMock).toHaveBeenCalledWith(
        expect.objectContaining({ status: "running", sequence: 1 }),
      ),
    );

    let completionAttempts = 0;
    mocks.updateKanbanAttemptMock.mockImplementation(async (input) => {
      if (input.status === "completed" && completionAttempts++ === 0) {
        throw new Error("Temporary Kanban database contention");
      }
      return undefined;
    });
    await emitCodexNotification({
      method: "thread/goal/updated",
      params: {
        threadId: "thread-1",
        goal: {
          threadId: "thread-1",
          objective: "Exercise Kanban pause semantics",
          status: "complete",
          timeUsedSeconds: 1,
        },
      },
    });
    await emitCodexNotification({
      method: "turn/completed",
      params: {
        threadId: "thread-1",
        turn: {
          id: "turn-1",
          status: "completed",
          durationMs: 250,
        },
      },
    });

    await waitFor(() => {
      const terminalCalls = mocks.updateKanbanAttemptMock.mock.calls.filter(
        ([input]) => input.status === "completed",
      );
      expect(terminalCalls).toHaveLength(2);
      expect(terminalCalls[0][0]).toEqual(
        expect.objectContaining({ sequence: 2 }),
      );
      expect(terminalCalls[1][0]).toEqual(
        expect.objectContaining({
          sequence: 2,
          operationId: terminalCalls[0][0].operationId,
        }),
      );
      expect(mocks.updateRunMock).toHaveBeenCalledWith(
        202,
        expect.objectContaining({ status: "completed" }),
      );
    });

    let secondTerminalCallIndex = -1;
    mocks.updateKanbanAttemptMock.mock.calls.forEach(([input], index) => {
      if (input.status === "completed") secondTerminalCallIndex = index;
    });
    const completedRunCallIndex = mocks.updateRunMock.mock.calls.findIndex(
      ([runId, update]) => runId === 202 && update.status === "completed",
    );
    expect(
      mocks.updateKanbanAttemptMock.mock.invocationCallOrder[
        secondTerminalCallIndex
      ],
    ).toBeLessThan(
      mocks.updateRunMock.mock.invocationCallOrder[completedRunCallIndex],
    );
  });

  it("terminalizes a root protocol error as a failed Kanban attempt", async () => {
    prepareKanbanRun();

    const { user } = await renderApp();
    await user.click(await screen.findByRole("radio", { name: "Kanban" }));
    await user.click(
      screen.getByRole("button", { name: "Start test Kanban agent" }),
    );
    await waitFor(() =>
      expect(mocks.updateKanbanAttemptMock).toHaveBeenCalledWith(
        expect.objectContaining({ status: "running", sequence: 1 }),
      ),
    );

    await emitCodexNotification({
      method: "error",
      params: {
        threadId: "thread-1",
        turnId: "turn-1",
        error: { message: "Root protocol stream failed" },
      },
    });

    await waitFor(() =>
      expect(mocks.updateKanbanAttemptMock).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "failed",
          sequence: 2,
          error: "Root protocol stream failed",
        }),
      ),
    );
    expect(mocks.updateRunMock).toHaveBeenCalledWith(
      202,
      expect.objectContaining({ status: "failed" }),
    );
    expect(mocks.updateTaskStatusMock).toHaveBeenCalledWith(101, "failed");
  });

  it("terminalizes an unexpected root interruption when no Goal can continue", async () => {
    prepareKanbanRun();

    const { user } = await renderApp();
    await user.click(await screen.findByRole("radio", { name: "Kanban" }));
    await user.click(
      screen.getByRole("button", { name: "Start test Kanban agent" }),
    );
    await waitFor(() =>
      expect(mocks.updateKanbanAttemptMock).toHaveBeenCalledWith(
        expect.objectContaining({ status: "running", sequence: 1 }),
      ),
    );

    await emitCodexNotification({
      method: "thread/goal/cleared",
      params: { threadId: "thread-1" },
    });
    await emitCodexNotification({
      method: "turn/interrupted",
      params: {
        threadId: "thread-1",
        turn: { id: "turn-1" },
      },
    });

    await waitFor(() =>
      expect(mocks.updateKanbanAttemptMock).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "interrupted",
          sequence: 2,
        }),
      ),
    );
    expect(mocks.updateRunMock).toHaveBeenCalledWith(
      202,
      expect.objectContaining({ status: "interrupted" }),
    );
    expect(mocks.updateTaskStatusMock).toHaveBeenCalledWith(101, "interrupted");
  });

  it("waits for interrupted Kanban persistence when the App Server exits", async () => {
    prepareKanbanRun();

    const { user } = await renderApp();
    await user.click(await screen.findByRole("radio", { name: "Kanban" }));
    await user.click(
      screen.getByRole("button", { name: "Start test Kanban agent" }),
    );
    await waitFor(() =>
      expect(mocks.updateKanbanAttemptMock).toHaveBeenCalledWith(
        expect.objectContaining({ status: "running", sequence: 1 }),
      ),
    );

    let resolveInterruptedPersistence!: () => void;
    mocks.updateKanbanAttemptMock.mockImplementation(
      (input) =>
        input.status === "interrupted"
          ? new Promise<void>((resolve) => {
              resolveInterruptedPersistence = resolve;
            })
          : Promise.resolve(undefined),
    );
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
    await waitFor(() =>
      expect(mocks.updateKanbanAttemptMock).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "interrupted",
          sequence: 2,
          error: "Codex app-server stdout closed",
        }),
      ),
    );
    expect(mocks.updateRunMock).not.toHaveBeenCalledWith(
      202,
      expect.objectContaining({ status: "interrupted" }),
    );

    await act(async () => {
      resolveInterruptedPersistence();
      await Promise.resolve();
    });
    await waitFor(() =>
      expect(mocks.updateRunMock).toHaveBeenCalledWith(
        202,
        expect.objectContaining({ status: "interrupted" }),
      ),
    );
    expect(mocks.updateTaskStatusMock).toHaveBeenCalledWith(101, "interrupted");
  });

  it("does not restore a Kanban run when its failed pause races process exit", async () => {
    prepareKanbanRun();
    let rejectInterrupt!: (error: Error) => void;
    mocks.codexRpcMock.mockImplementation(
      async (_accountId: number, method: string) => {
        if (method === "thread/start") {
          return { thread: { id: "thread-kanban-process-race" } };
        }
        if (method === "turn/start") {
          return { turn: { id: "turn-kanban-process-race" } };
        }
        if (method === "turn/interrupt") {
          return new Promise((_resolve, reject) => {
            rejectInterrupt = reject;
          });
        }
        return {};
      },
    );

    const { user } = await renderApp();
    await user.click(await screen.findByRole("radio", { name: "Kanban" }));
    await user.click(
      screen.getByRole("button", { name: "Start test Kanban agent" }),
    );
    await waitFor(() =>
      expect(mocks.updateKanbanAttemptMock).toHaveBeenCalledWith(
        expect.objectContaining({ status: "running", sequence: 1 }),
      ),
    );

    await user.click(
      screen.getByRole("button", { name: "Pause test Kanban agent" }),
    );
    await waitFor(() =>
      expect(mocks.codexRpcMock).toHaveBeenCalledWith(
        7,
        "turn/interrupt",
        expect.any(Object),
      ),
    );
    await act(async () => {
      mocks.listeners.get("codex:process")?.({
        payload: {
          accountId: 7,
          profileKey: "account:7",
          status: "exited",
          message: "Codex app-server exited during pause",
        },
      });
      await Promise.resolve();
    });
    await waitFor(() =>
      expect(mocks.updateKanbanAttemptMock).toHaveBeenCalledWith(
        expect.objectContaining({ status: "interrupted", sequence: 3 }),
      ),
    );
    await act(async () => {
      rejectInterrupt(new Error("Connection closed"));
      await Promise.resolve();
    });

    await waitFor(() =>
      expect(screen.getByLabelText("Kanban test result")).toHaveTextContent(
        "paused",
      ),
    );
    expect(
      mocks.updateKanbanAttemptMock.mock.calls
        .map(([input]) => input.status)
        .filter((status) => status === "running"),
    ).toEqual(["running"]);
  });

  it("retries newly provisioned binding persistence with the latest card version", async () => {
    prepareKanbanRun();
    const binding = {
      sourceRepositoryPath: "/repo/orchestrator",
      relativePath: ".",
      executionRoot: "/repo/.codex-kanban/card-run-control-test",
      sourceBranch: "main",
      baseBranch: "main",
      baseCommit: "0123456789abcdef",
      cardBranch: "codex/kanban-run-control-test",
      worktreePath: "/repo/.codex-kanban/card-run-control-test/orchestrator",
      status: "ready",
      error: null,
    };
    mocks.loadKanbanGitBindingsMock.mockResolvedValue([]);
    mocks.provisionKanbanGitMock.mockResolvedValue({
      cardId: "card-run-control-test",
      executionRoot: binding.executionRoot,
      repositories: [binding],
      errors: [],
      complete: true,
      rolledBack: false,
    });
    mocks.saveKanbanGitBindingsMock
      .mockRejectedValueOnce(new Error("The card version changed"))
      .mockResolvedValueOnce([binding]);
    mocks.loadKanbanBoardMock.mockImplementation(async () => {
      const claimed = await mocks.claimKanbanAttemptMock.mock.results[0].value;
      return {
        workspaceId: 1,
        revision: 3,
        preferencesJson: "{}",
        columns: [],
        cards: [{ ...claimed.card, stateVersion: 3 }],
      };
    });

    const { user } = await renderApp();
    await user.click(await screen.findByRole("radio", { name: "Kanban" }));
    await user.click(
      screen.getByRole("button", { name: "Start test Kanban agent" }),
    );

    await waitFor(() =>
      expect(mocks.saveKanbanGitBindingsMock).toHaveBeenCalledTimes(2),
    );
    expect(mocks.saveKanbanGitBindingsMock.mock.calls[0][0]).toEqual(
      expect.objectContaining({ stateVersion: 2 }),
    );
    expect(mocks.saveKanbanGitBindingsMock.mock.calls[1][0]).toEqual(
      expect.objectContaining({ stateVersion: 3 }),
    );
    expect(mocks.cleanupKanbanGitMock).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(mocks.updateKanbanAttemptMock).toHaveBeenCalledWith(
        expect.objectContaining({ status: "running" }),
      ),
    );
  });

  it("persists and accepts a reconciled target-moved binding", async () => {
    prepareKanbanRun();
    mocks.reconcileKanbanGitMock.mockImplementation(async (binding) => ({
      binding: { ...binding, status: "targetMoved" },
      sourceAvailable: true,
      worktreeAvailable: true,
      branchAvailable: true,
      branchMatches: true,
      baseBranchHead: "fedcba9876543210",
      headCommit: binding.baseCommit,
      targetMoved: true,
      hasChanges: false,
      hasConflicts: false,
    }));

    const { user } = await renderApp();
    await user.click(await screen.findByRole("radio", { name: "Kanban" }));
    await user.click(
      screen.getByRole("button", { name: "Start test Kanban agent" }),
    );

    await waitFor(() =>
      expect(mocks.saveKanbanGitBindingsMock).toHaveBeenCalledWith(
        expect.objectContaining({ stateVersion: 2 }),
        [expect.objectContaining({ status: "targetMoved" })],
      ),
    );
    await waitFor(() =>
      expect(mocks.updateKanbanAttemptMock).toHaveBeenCalledWith(
        expect.objectContaining({ status: "running" }),
      ),
    );
    expect(mocks.cleanupKanbanGitMock).not.toHaveBeenCalled();
  });

  it("cleans only newly provisioned artifacts when binding persistence cannot recover", async () => {
    prepareKanbanRun();
    const binding = {
      sourceRepositoryPath: "/repo/orchestrator",
      relativePath: ".",
      executionRoot: "/repo/.codex-kanban/card-run-control-test",
      sourceBranch: "main",
      baseBranch: "main",
      baseCommit: "0123456789abcdef",
      cardBranch: "codex/kanban-run-control-test",
      worktreePath: "/repo/.codex-kanban/card-run-control-test/orchestrator",
      status: "ready",
      error: null,
    };
    mocks.loadKanbanGitBindingsMock.mockResolvedValue([]);
    mocks.provisionKanbanGitMock.mockResolvedValue({
      cardId: "card-run-control-test",
      executionRoot: binding.executionRoot,
      repositories: [binding],
      errors: [],
      complete: true,
      rolledBack: false,
    });
    mocks.saveKanbanGitBindingsMock.mockRejectedValue(
      new Error("Kanban binding storage unavailable"),
    );
    mocks.loadKanbanBoardMock.mockImplementation(async () => {
      const claimed = await mocks.claimKanbanAttemptMock.mock.results[0].value;
      return {
        workspaceId: 1,
        revision: 3,
        preferencesJson: "{}",
        columns: [],
        cards: [{ ...claimed.card, stateVersion: 3 }],
      };
    });

    const { user } = await renderApp();
    await user.click(await screen.findByRole("radio", { name: "Kanban" }));
    await user.click(
      screen.getByRole("button", { name: "Start test Kanban agent" }),
    );

    await waitFor(() =>
      expect(screen.getByLabelText("Kanban test result")).toHaveTextContent(
        "The card worktrees could not be saved",
      ),
    );
    expect(mocks.cleanupKanbanGitMock).toHaveBeenCalledTimes(1);
    expect(mocks.cleanupKanbanGitMock).toHaveBeenCalledWith({
      binding,
      deleteBranch: true,
      force: true,
    });
    expect(mocks.updateKanbanAttemptMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "failed",
        sequence: 1,
        executionRoot: binding.executionRoot,
      }),
    );
  });
});
