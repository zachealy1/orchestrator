import { act, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  emitCodexNotification,
  emitCodexServerRequest,
  getMocks,
  prepareDefaults,
  prepareKanbanRun,
  prepareSignedInRun,
  signedInAccount,
  renderApp,
  setWindowWidth,
  workspace,
  workspaceChatFixture,
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
    prepareSignedInRun();
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
          accountId: signedInAccount.id,
          executionSettingsJson: expect.stringContaining(
            `"profileKey":"account:${signedInAccount.id}"`,
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
        environments: [
          expect.objectContaining({
            environmentId: "local",
            cwd: "/repo/.codex-kanban/card-run-control-test",
          }),
        ],
      }),
    );
    expect(
      mocks.codexDefaultProfileRpcMock.mock.calls.find(
        ([method]) => method === "thread/start",
      )?.[1],
    ).toEqual(
      expect.objectContaining({
        environments: [
          expect.objectContaining({
            environmentId: "local",
            cwd: "/repo/.codex-kanban/card-run-control-test",
          }),
        ],
      }),
    );
    expect(
      mocks.codexDefaultProfileRpcMock.mock.calls.some(
        ([method]) => method === "turn/start",
      ),
    ).toBe(false);
    const environmentProbeIndex =
      mocks.codexDefaultProfileRpcMock.mock.calls.findIndex(
        ([method]) => method === "command/exec",
      );
    const goalSetIndex = mocks.codexDefaultProfileRpcMock.mock.calls.findIndex(
      ([method, params]) =>
        method === "thread/goal/set" &&
        params?.threadId === "thread-kanban-question",
    );
    expect(environmentProbeIndex).toBeGreaterThanOrEqual(0);
    expect(environmentProbeIndex).toBeLessThan(goalSetIndex);
    const sourceRootVerificationIndex =
      mocks.codexDefaultProfileRpcMock.mock.calls.findIndex(
        ([method, params]) =>
          method === "thread/read" &&
          params?.includeTurns === false &&
          params?.threadId === "thread-kanban-question",
      );
    expect(goalSetIndex).toBeGreaterThanOrEqual(0);
    expect(sourceRootVerificationIndex).toBeGreaterThanOrEqual(0);
    expect(sourceRootVerificationIndex).toBeLessThan(goalSetIndex);

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

  it("starts a shared Goal card from the native goal-created turn", async () => {
    prepareKanbanRun();
    mocks.codexRpcMock.mockImplementation(
      async (_accountId: number, method: string, params: any) => {
        if (method === "thread/start") {
          return {
            thread: { id: "thread-kanban-goal-access" },
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
        "thread/goal/set",
        expect.objectContaining({ status: "active" }),
      ),
    );
    await emitCodexNotification(
      {
        method: "turn/started",
        params: {
          threadId: "thread-kanban-goal-access",
          turn: { id: "turn-kanban-goal-access", status: "inProgress" },
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
    const threadStartIndex =
      mocks.codexDefaultProfileRpcMock.mock.calls.findIndex(
        ([method]) => method === "thread/start",
      );
    const goalSetIndex = mocks.codexDefaultProfileRpcMock.mock.calls.findIndex(
      ([method]) => method === "thread/goal/set",
    );
    expect(threadStartIndex).toBeGreaterThanOrEqual(0);
    expect(goalSetIndex).toBeGreaterThan(threadStartIndex);
    expect(
      mocks.codexDefaultProfileRpcMock.mock.calls[threadStartIndex]?.[1],
    ).toEqual(
      expect.objectContaining({
        cwd: "/repo/orchestrator",
        runtimeWorkspaceRoots: [
          "/repo/.codex-kanban/card-run-control-test",
          "/repo/.codex-kanban/card-run-control-test/orchestrator",
        ],
        permissions: ASK_FOR_APPROVAL_PERMISSION_PROFILE,
        environments: [
          {
            environmentId: "local",
            cwd: "/repo/.codex-kanban/card-run-control-test",
            runtimeWorkspaceRoots: [
              "/repo/.codex-kanban/card-run-control-test",
              "/repo/.codex-kanban/card-run-control-test/orchestrator",
            ],
          },
        ],
      }),
    );
    expect(
      mocks.codexDefaultProfileRpcMock.mock.calls.some(
        ([method]) => method === "turn/start",
      ),
    ).toBe(false);
    expect(screen.getByLabelText("Kanban test result")).toHaveTextContent(
      "started",
    );
  });

  it("replaces an unverified Goal thread only after its native retry turn starts", async () => {
    prepareKanbanRun();
    const executionRoot = "/repo/.codex-kanban/card-run-control-test";
    const worktreePath = `${executionRoot}/orchestrator`;
    const oldThreadId = "thread-unverified-goal";
    const chat = {
      ...workspaceChatFixture({
        id: 777,
        codex_thread_id: oldThreadId,
        profile_key: "default",
        status: "failed",
      }),
      native_workspace_binding_status: "ready" as const,
      native_workspace_binding_json: JSON.stringify({
        version: 5,
        kind: "kanban",
        sourceWorkspacePath: workspace.path,
        executionDirectory: executionRoot,
        runtimeWorkspaceRoots: [executionRoot, worktreePath],
        pendingContinuationContext: null,
        sourceRootAssociation: "source-root",
        verifiedEnvironmentThreadId: oldThreadId,
      }),
    };
    mocks.getChatRecordMock.mockResolvedValue(chat);

    const { user } = await renderApp();
    await user.click(await screen.findByRole("radio", { name: "Kanban" }));
    await user.click(
      screen.getByRole("button", { name: "Start test Kanban agent" }),
    );

    await waitFor(() =>
      expect(mocks.activateSharedNativeWorkspaceBindingMock).toHaveBeenCalledWith(
        expect.objectContaining({
          chatId: chat.id,
          expectedProfileKey: "default",
          expectedThreadId: oldThreadId,
          codexThreadId: "thread-1",
          status: "running",
          binding: expect.objectContaining({
            version: 6,
            verifiedEnvironmentThreadId: "thread-1",
          }),
        }),
      ),
    );
    expect(
      mocks.codexDefaultProfileRpcMock.mock.calls.some(
        ([method]) => method === "turn/start",
      ),
    ).toBe(false);
    await waitFor(() =>
      expect(mocks.codexDefaultProfileRpcMock).toHaveBeenCalledWith(
        "thread/archive",
        { threadId: oldThreadId },
      ),
    );
  });

  it("fails Goal setup before activation when Codex changes the source cwd", async () => {
    prepareKanbanRun();
    mocks.codexRpcMock.mockImplementation(
      async (_accountId: number, method: string, params?: Record<string, any>) =>
        method === "thread/start"
          ? {
              thread: {
                id: "thread-bad-environment",
                cwd: "/repo/another-workspace",
              },
              cwd: "/repo/another-workspace",
              runtimeWorkspaceRoots: params?.runtimeWorkspaceRoots ?? [],
              approvalPolicy: params?.approvalPolicy,
              activePermissionProfile: { id: params?.permissions },
            }
          : {},
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
          error: expect.stringContaining(
            "did not retain the source workspace",
          ),
        }),
      ),
    );
    expect(
      mocks.codexDefaultProfileRpcMock.mock.calls.some(
        ([method]) => method === "thread/goal/set",
      ),
    ).toBe(false);
    expect(
      mocks.codexDefaultProfileRpcMock.mock.calls.some(
        ([method]) => method === "turn/start",
      ),
    ).toBe(false);
    await waitFor(() =>
      expect(mocks.codexDefaultProfileRpcMock).toHaveBeenCalledWith(
        "thread/archive",
        { threadId: "thread-bad-environment" },
      ),
    );
    expect(mocks.saveNativeWorkspaceBindingMock).not.toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.stringContaining(
          "task changed before its Codex workspace association completed",
        ),
      }),
    );
  });

  it("surfaces sticky-environment protocol rejection without activating Goal Mode", async () => {
    prepareKanbanRun();
    const defaultRpc =
      mocks.codexDefaultProfileRpcMock.getMockImplementation();
    mocks.codexDefaultProfileRpcMock.mockImplementation(
      async (method: string, params?: Record<string, any>) => {
        if (method === "thread/start") {
          throw new Error(
            "Codex rejected the sticky environments configuration.",
          );
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
          error: expect.stringContaining(
            "rejected the sticky environments configuration",
          ),
        }),
      ),
    );
    expect(
      mocks.codexDefaultProfileRpcMock.mock.calls.some(
        ([method]) => method === "thread/goal/set",
      ),
    ).toBe(false);
    expect(
      mocks.codexDefaultProfileRpcMock.mock.calls.some(
        ([method]) => method === "turn/start",
      ),
    ).toBe(false);
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
    await new Promise((resolve) => window.setTimeout(resolve, 250));
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
    prepareKanbanRun({ autoStartGoalTurn: false });
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
          ([, method]) => method === "thread/goal/set",
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

    await emitCodexNotification(
      {
        method: "turn/started",
        params: {
          threadId: "thread-kanban-race",
          turn: { id: "turn-kanban-race", status: "inProgress" },
        },
      },
      { accountId: 0, profileKey: "default" },
    );

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

  it("completes a Kanban run after its source target advances", async () => {
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

    mocks.readKanbanGitStatusMock.mockClear();
    mocks.readKanbanGitStatusMock.mockImplementation(async (binding) => ({
      binding,
      headCommit: binding.baseCommit,
      baseBranchHead: "40ee50b",
      aheadOfBase: 0,
      behindBase: 0,
      aheadOfTarget: 0,
      behindTarget: 1,
      hasChanges: false,
      hasConflicts: false,
      stagedCount: 0,
      unstagedCount: 0,
      untrackedCount: 0,
      files: [],
    }));

    await emitCodexNotification({
      method: "item/started",
      params: {
        threadId: "thread-1",
        turnId: "turn-1",
        item: {
          id: "command-in-card-worktree",
          type: "commandExecution",
          command: "npm test",
          cwd: "/repo/.codex-kanban/card-run-control-test/orchestrator",
        },
      },
    }, { accountId: 0, profileKey: "default" });
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

    await waitFor(() =>
      expect(mocks.updateKanbanAttemptMock).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "completed",
          sequence: 2,
          error: null,
        }),
      ),
    );
    expect(mocks.readKanbanGitStatusMock).toHaveBeenCalled();
    expect(mocks.updateKanbanAttemptMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ status: "blocked" }),
    );
    expect(mocks.updateRunMock).toHaveBeenCalledWith(
      202,
      expect.objectContaining({ status: "completed", error: null }),
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

  it("waits for a card title before provisioning and starts with the refreshed title", async () => {
    prepareKanbanRun();
    const initialAttempt = await mocks.claimKanbanAttemptMock.getMockImplementation()!();
    const bindings = await mocks.loadKanbanGitBindingsMock();
    let currentCard = { ...initialAttempt.card, title: "Generating title...", stateVersion: 1, executionState: "idle", currentAttemptId: null };
    let chat = { ...workspaceChatFixture({ id: currentCard.chatId, title: currentCard.title }), title_generation_state: "pending" };
    mocks.getChatRecordMock.mockImplementation(async () => chat);
    mocks.loadKanbanGitBindingsMock.mockResolvedValue([]);
    mocks.loadKanbanBoardMock.mockImplementation(async () => ({
      workspaceId: 1, revision: 1, preferencesJson: "{}", columns: [], cards: [currentCard],
    }));
    let settle!: (value: { title: string }) => void;
    mocks.generateChatTitleMock.mockImplementation(() => new Promise((resolve) => { settle = resolve; }));
    mocks.completeChatTitleGenerationMock.mockImplementation(async (_id, title) => {
      chat = { ...chat, title, title_generation_state: "complete" };
      currentCard = { ...currentCard, title };
      return true;
    });
    mocks.claimKanbanAttemptMock.mockImplementation(async () => ({
      ...initialAttempt, card: { ...currentCard, stateVersion: 2, executionState: "starting" },
    }));
    mocks.provisionKanbanGitMock.mockResolvedValue({
      cardId: currentCard.id, executionRoot: bindings[0].executionRoot,
      repositories: bindings, errors: [], complete: true, rolledBack: false,
    });
    mocks.saveKanbanGitBindingsMock.mockImplementation(async (_card, savedBindings) => {
      mocks.loadKanbanGitBindingsMock.mockResolvedValue(savedBindings);
      return savedBindings;
    });
    const { user } = await renderApp();
    await user.click(await screen.findByRole("radio", { name: "Kanban" }));
    await user.click(screen.getByRole("button", { name: "Start test Kanban agent" }));
    await waitFor(() => expect(mocks.generateChatTitleMock).toHaveBeenCalledOnce());
    expect(screen.getByRole("status", { name: "Waiting for title…" })).toBeInTheDocument();
    expect(mocks.claimKanbanAttemptMock).not.toHaveBeenCalled();
    expect(mocks.provisionKanbanGitMock).not.toHaveBeenCalled();
    await act(async () => { settle({ title: "Fix readable branch names" }); });
    await waitFor(() => expect(mocks.provisionKanbanGitMock).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ cardSlug: "Fix readable branch names" }),
    ));
    await waitFor(() => expect(screen.queryByText("Waiting for title…")).not.toBeInTheDocument());
    await waitFor(() => expect(mocks.updateKanbanAttemptMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: "running" }),
    ));
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
      .mockImplementationOnce(async () => {
        mocks.loadKanbanGitBindingsMock.mockResolvedValue([binding]);
        return [binding];
      });
    const initialAttempt = await mocks.claimKanbanAttemptMock.getMockImplementation()!();
    mocks.loadKanbanBoardMock.mockImplementation(async () => {
      if (mocks.claimKanbanAttemptMock.mock.results.length === 0) {
        return {
          workspaceId: 1,
          revision: 0,
          preferencesJson: "{}",
          columns: [],
          cards: [{ ...initialAttempt.card, stateVersion: 1, executionState: "idle", currentAttemptId: null }],
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
    const initialAttempt = await mocks.claimKanbanAttemptMock.getMockImplementation()!();
    mocks.loadKanbanBoardMock.mockImplementation(async () => {
      if (mocks.claimKanbanAttemptMock.mock.results.length === 0) {
        return {
          workspaceId: 1,
          revision: 0,
          preferencesJson: "{}",
          columns: [],
          cards: [{ ...initialAttempt.card, stateVersion: 1, executionState: "idle", currentAttemptId: null }],
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
