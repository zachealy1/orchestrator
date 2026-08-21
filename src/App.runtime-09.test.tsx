import { act, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  emitCodexNotification,
  emitCodexServerRequest,
  getMocks,
  prepareDefaults,
  prepareKanbanRun,
  renderApp,
  setWindowWidth,
} from "./test/appRuntimeHarness";
import { ASK_FOR_APPROVAL_PERMISSION_PROFILE } from "./lib/codexAccess";

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

  it("retains the mounted Kanban surface while switching through Chat", async () => {
    const { user } = await renderApp();
    await user.click(await screen.findByRole("radio", { name: "Kanban" }));
    const mountedBoard = await screen.findByRole("region", {
      name: "Kanban run-control test harness",
    });

    await user.click(screen.getByRole("radio", { name: "Chat" }));
    expect(document.body.contains(mountedBoard)).toBe(true);
    expect(mountedBoard.closest(".kanban-workspace-mount")).toHaveClass(
      "is-suspended",
    );

    await user.click(screen.getByRole("radio", { name: "Kanban" }));
    expect(
      await screen.findByRole("region", {
        name: "Kanban run-control test harness",
      }),
    ).toBe(mountedBoard);
  });

  it("persists a Kanban card while the shared Codex profile is unavailable", async () => {
    const { user } = await renderApp();
    await user.click(await screen.findByRole("radio", { name: "Kanban" }));

    await user.type(
      screen.getByLabelText("Prompt"),
      "Add responsive arcade controls",
    );
    const createButton = screen.getByRole("button", {
      name: "Create Kanban card",
    });
    expect(createButton).toBeEnabled();

    await user.click(createButton);

    await waitFor(() =>
      expect(mocks.createKanbanCardMock).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          description: "Add responsive arcade controls",
          accountId: null,
          executionSettingsJson: expect.stringContaining(
            '"profileKey":"default"',
          ),
        }),
      ),
    );
    expect(
      mocks.codexDefaultProfileRpcMock.mock.calls.some(
        ([method]) => method === "turn/start",
      ),
    ).toBe(false);
  });

  it("opens a Kanban conversation while its turn awaits user input", async () => {
    prepareKanbanRun();
    mocks.codexRpcMock.mockImplementation(
      async (_accountId: number, method: string) => {
        if (method === "thread/start") {
          return { thread: { id: "thread-kanban-question" } };
        }
        if (method === "turn/start") {
          return { turn: { id: "turn-kanban-question" } };
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
          turnId: "turn-kanban-question",
        }),
      ),
    );
    expect(mocks.codexDefaultProfileRpcMock).toHaveBeenCalledWith(
      "thread/start",
      expect.objectContaining({
        cwd: "/repo/orchestrator",
      }),
    );
    expect(mocks.codexDefaultProfileRpcMock).toHaveBeenCalledWith(
      "turn/start",
      expect.objectContaining({
        cwd: "/repo/.codex-kanban/card-run-control-test",
      }),
    );
    expect(
      mocks.codexDefaultProfileRpcMock.mock.calls.find(
        ([method]) => method === "thread/start",
      )?.[1],
    ).not.toHaveProperty("environments");
    expect(
      mocks.codexDefaultProfileRpcMock.mock.calls.find(
        ([method]) => method === "turn/start",
      )?.[1],
    ).not.toHaveProperty("environments");
    const environmentProbeIndex =
      mocks.codexDefaultProfileRpcMock.mock.calls.findIndex(
        ([method]) => method === "command/exec",
      );
    const turnStartIndex = mocks.codexDefaultProfileRpcMock.mock.calls.findIndex(
      ([method, params]) =>
        method === "turn/start" &&
        params?.threadId === "thread-kanban-question",
    );
    expect(environmentProbeIndex).toBeGreaterThanOrEqual(0);
    expect(environmentProbeIndex).toBeLessThan(turnStartIndex);
    const sourceRootVerificationIndex =
      mocks.codexDefaultProfileRpcMock.mock.calls.findIndex(
        ([method, params]) =>
          method === "thread/read" &&
          params?.includeTurns === false &&
          params?.threadId === "thread-kanban-question",
      );
    expect(turnStartIndex).toBeGreaterThanOrEqual(0);
    expect(sourceRootVerificationIndex).toBeGreaterThanOrEqual(0);
    expect(sourceRootVerificationIndex).toBeLessThan(turnStartIndex);

    await emitCodexServerRequest({
      id: "kanban-input-1",
      method: "item/tool/requestUserInput",
      params: {
        threadId: "thread-kanban-question",
        turnId: "turn-kanban-question",
        itemId: "question-item-1",
        questions: [
          {
            id: "scope",
            header: "Scope",
            question: "Which deployment scope should be used?",
            isOther: false,
            isSecret: false,
            options: [
              {
                label: "Focused",
                description: "Deploy only the changed service.",
              },
            ],
          },
        ],
      },
    }, { accountId: 0, profileKey: "default" });

    await user.click(
      screen.getByRole("button", { name: "Open test Kanban conversation" }),
    );

    expect(await screen.findByText("Which deployment scope should be used?"))
      .toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Chat" })).toBeChecked();
    expect(screen.queryByText("Loading conversation")).not.toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen
          .getByText("Which deployment scope should be used?")
          .closest('[data-agent-notification-target="user-input"]'),
      ).toHaveFocus(),
    );
  });

  it("starts a shared Goal card after the turn replaces the thread bootstrap profile", async () => {
    prepareKanbanRun();
    mocks.codexRpcMock.mockImplementation(
      async (_accountId: number, method: string, params: any) => {
        if (method === "thread/start") {
          return {
            thread: { id: "thread-kanban-goal-access" },
            approvalPolicy: "untrusted",
            activePermissionProfile: { id: ":danger-full-access" },
          };
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
          return { turn: { id: "turn-kanban-goal-access" } };
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
      expect(mocks.codexDefaultProfileRpcMock).toHaveBeenCalledWith(
        "turn/start",
        expect.objectContaining({
          permissions: ASK_FOR_APPROVAL_PERMISSION_PROFILE,
        }),
      ),
    );
    await emitCodexNotification(
      {
        method: "thread/settings/updated",
        params: {
          threadId: "thread-kanban-goal-access",
          threadSettings: {
            approvalPolicy: "untrusted",
            activePermissionProfile: {
              id: ASK_FOR_APPROVAL_PERMISSION_PROFILE,
            },
          },
        },
      },
      { accountId: 0, profileKey: "default" },
    );

    await waitFor(() =>
      expect(mocks.updateKanbanAttemptMock).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "running",
          turnId: "turn-kanban-goal-access",
        }),
      ),
    );
    expect(screen.getByLabelText("Kanban test result")).toHaveTextContent(
      "started",
    );
  });

  it("fails Kanban setup before turn/start when the worktree is unavailable", async () => {
    prepareKanbanRun();
    const defaultRpc =
      mocks.codexDefaultProfileRpcMock.getMockImplementation();
    mocks.codexDefaultProfileRpcMock.mockImplementation(
      async (method: string, params?: Record<string, any>) => {
        if (method === "fs/getMetadata") {
          return { isDirectory: false, isFile: false, isSymlink: false };
        }
        return defaultRpc?.(method, params);
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
          status: "failed",
          error: expect.stringContaining("isolated worktree is unavailable"),
        }),
      ),
    );
    expect(
      mocks.codexDefaultProfileRpcMock.mock.calls.some(
        ([method]) => method === "turn/start",
      ),
    ).toBe(false);
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
    expect(mocks.codexRpcMock).toHaveBeenCalledWith(0, "turn/interrupt", {
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
      expect(mocks.codexRpcMock).toHaveBeenCalledWith(0, "turn/interrupt", {
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

  it("keeps a no-tool Kanban result blocked instead of sending it to review", async () => {
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
    }, { accountId: 0, profileKey: "default" });
    await emitCodexNotification({
      method: "item/completed",
      params: {
        item: {
          type: "agentMessage",
          id: "blocked-final",
          phase: "final_answer",
          text: "I'm blocked because this session has no filesystem or terminal access to the selected repository.",
        },
      },
    }, { accountId: 0, profileKey: "default" });
    await emitCodexNotification({
      method: "turn/completed",
      params: {
        threadId: "thread-1",
        turn: { id: "turn-1", status: "completed", durationMs: 250 },
      },
    }, { accountId: 0, profileKey: "default" });

    await waitFor(() =>
      expect(mocks.updateKanbanAttemptMock).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "blocked",
          sequence: 2,
          error: expect.stringContaining("no implementation was performed"),
        }),
      ),
    );
    expect(mocks.updateKanbanAttemptMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ status: "completed" }),
    );
    expect(mocks.updateRunMock).toHaveBeenCalledWith(
      202,
      expect.objectContaining({
        status: "failed",
        error: expect.stringContaining("no implementation was performed"),
      }),
    );
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
    }, { accountId: 0, profileKey: "default" });
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
    }, { accountId: 0, profileKey: "default" });

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
    }, { accountId: 0, profileKey: "default" });

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
    }, { accountId: 0, profileKey: "default" });
    await emitCodexNotification({
      method: "turn/interrupted",
      params: {
        threadId: "thread-1",
        turn: { id: "turn-1" },
      },
    }, { accountId: 0, profileKey: "default" });

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
          accountId: 0,
          profileKey: "default",
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
        0,
        "turn/interrupt",
        expect.any(Object),
      ),
    );
    await act(async () => {
      mocks.listeners.get("codex:process")?.({
        payload: {
          accountId: 0,
          profileKey: "default",
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
      if (mocks.claimKanbanAttemptMock.mock.results.length === 0) {
        return {
          workspaceId: 1,
          revision: 0,
          preferencesJson: "{}",
          columns: [],
          cards: [],
        };
      }
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
      if (mocks.claimKanbanAttemptMock.mock.results.length === 0) {
        return {
          workspaceId: 1,
          revision: 0,
          preferencesJson: "{}",
          columns: [],
          cards: [],
        };
      }
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
