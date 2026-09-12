import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { describe, beforeEach, expect, it, vi } from "vitest";
import {
  getMocks,
  workspace,
  signedInAccount,
  defaultCodexModel,
  prepareDefaults,
  renderApp,
  pointerTapFile,
  prepareSignedInRun,
  startMockRun,
  emitCodexNotification,
  emitCodexServerRequest,
  holdNextAnimationFrames,
  setWindowWidth,
  updatePromptQueueFixture,
} from "./test/appRuntimeHarness";

const mocks = getMocks();

describe("Application runtime scenarios 8", () => {
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

  it("keeps the current Goal state when a pause request fails", async () => {
      prepareSignedInRun();
      mocks.codexRpcMock.mockImplementation(
        async (_accountId: number, method: string) => {
          if (method === "thread/start") {
            return { thread: { id: "thread-1" } };
          }
          if (method === "turn/start") {
            return { turn: { id: "turn-1" } };
          }
          if (method === "thread/goal/set") {
            throw new Error("Goal service unavailable");
          }
          return {};
        },
      );

      const { user } = await renderApp();
      await user.click(screen.getByRole("button", { name: /goal mode/i }));
      await startMockRun(user, "Finish the workspace migration");

      const composer = screen.getByLabelText("Task composer");
      await user.click(
        within(composer).getByRole("button", { name: "Pause goal" }),
      );

      await screen.findByText(
        "Could not pause goal: Goal service unavailable",
      );
      expect(
        within(composer).getByRole("button", { name: "Pause goal" }),
      ).toBeEnabled();
      expect(within(composer).getByLabelText("Goal progress")).toHaveTextContent(
        "In progress",
      );
      expect(
        screen.getByRole("button", { name: /stop codex/i }),
      ).toBeInTheDocument();
    });

  it("does not manually interrupt a Goal turn when pausing between turns", async () => {
      prepareSignedInRun();
      mocks.codexRpcMock.mockImplementation(
        async (_accountId: number, method: string, params: any) => {
          if (method === "thread/start") {
            return { thread: { id: "thread-1" } };
          }
          if (method === "turn/start") {
            return { turn: { id: "turn-1" } };
          }
          if (method === "thread/goal/set") {
            return {
              goal: {
                threadId: params.threadId,
                objective: "Finish the workspace migration",
                status: params.status,
                timeUsedSeconds: 42,
              },
            };
          }
          return {};
        },
      );

      const { user } = await renderApp();
      await user.click(screen.getByRole("button", { name: /goal mode/i }));
      await startMockRun(user, "Finish the workspace migration");
      await emitCodexNotification({
        method: "turn/completed",
        params: {
          threadId: "thread-1",
          turn: {
            id: "turn-1",
            status: "completed",
            durationMs: 4_000,
          },
        },
      });

      await user.click(screen.getByRole("button", { name: "Pause goal" }));

      await waitFor(() =>
        expect(
          screen.getByRole("button", { name: "Resume goal" }),
        ).toBeInTheDocument(),
      );
      expect(
        mocks.codexRpcMock.mock.calls.filter(
          ([, method]) => method === "turn/interrupt",
        ),
      ).toHaveLength(0);
      expect(
        screen.getByRole("button", { name: /stop codex/i }),
      ).toBeInTheDocument();
    });

  it("does not issue a stale turn interruption after native Goal pause", async () => {
      prepareSignedInRun();
      mocks.codexRpcMock.mockImplementation(
        async (_accountId: number, method: string, params: any) => {
          if (method === "thread/start") {
            return { thread: { id: "thread-1" } };
          }
          if (method === "turn/start") {
            return { turn: { id: "turn-1" } };
          }
          if (method === "thread/goal/set") {
            return {
              goal: {
                threadId: params.threadId,
                objective: "Finish the workspace migration",
                status: params.status,
                timeUsedSeconds: 42,
              },
            };
          }
          if (method === "turn/interrupt") {
            throw new Error(
              JSON.stringify({
                code: -32600,
                message:
                  "expected active turn id 019f9fc5-25dd-76a1-b223-b439ce5af283, got turn-1",
              }),
            );
          }
          return {};
        },
      );

      const { user } = await renderApp();
      await user.click(screen.getByRole("button", { name: /goal mode/i }));
      await startMockRun(user, "Finish the workspace migration");
      await user.click(screen.getByRole("button", { name: "Pause goal" }));

      await waitFor(() =>
        expect(
          screen.getByRole("button", { name: "Resume goal" }),
        ).toBeInTheDocument(),
      );
      expect(
        mocks.codexRpcMock.mock.calls.filter(
          ([, method]) => method === "turn/interrupt",
        ),
      ).toHaveLength(0);
      expect(
        screen.queryByText(/Could not pause goal/i),
      ).not.toBeInTheDocument();
    });

  it("removes pending approval controls when the App Server disconnects", async () => {
      prepareSignedInRun();

      const { user } = await renderApp();
      await startMockRun(user, "Run a guarded command");
      await emitCodexServerRequest({
        id: 9,
        method: "item/commandExecution/requestApproval",
        params: {
          threadId: "thread-1",
          turnId: "turn-1",
          command: "npm test",
          availableDecisions: ["accept", "cancel"],
        },
      });
      expect(
        screen.getByText("Codex needs approval to run a command"),
      ).toBeInTheDocument();

      await act(async () => {
        mocks.listeners.get("codex:process")?.({
          payload: {
            accountId: 7,
            profileKey: "account:7",
            status: "exited",
            message: "Codex app-server stdout closed",
          },
        });
      });

      expect(
        screen.queryByText("Codex needs approval to run a command"),
      ).not.toBeInTheDocument();
      expect(mocks.resolveCodexServerRequestMock).not.toHaveBeenCalled();
      expect(mocks.removeAgentNotificationMock).toHaveBeenCalledWith(
        expect.stringContaining("approval-required:account:7"),
      );
    });

  it("steers mismatched queued settings and full file context into a busy active turn", async () => {
    prepareSignedInRun();
    const queuedPrompt = "Steer with the queued settings and context";
    const selectedSkill = {
      id: "docs",
      path: "/skills/docs/SKILL.md",
      name: "Docs",
      description: "Use repository documentation",
    };
    const queuedModel = {
      ...defaultCodexModel,
      id: "gpt-queued",
      model: "gpt-queued",
      displayName: "Queued model",
      defaultReasoningEffort: "high",
      isDefault: false,
    };
    mocks.listCodexModelsMock.mockResolvedValue([
      defaultCodexModel,
      queuedModel,
    ]);
    mocks.listCodexSkillsMock.mockResolvedValue([selectedSkill]);
    const documentPath = `${workspace.path}/README.md`;
    const missingPath = `${workspace.path}/missing.txt`;
    const imagePath = `${workspace.path}/reference.png`;
    mocks.openDialogMock.mockResolvedValue([
      documentPath,
      missingPath,
      imagePath,
    ]);
    mocks.readCodexFileMock.mockImplementation(
      async (_accountId: number, path: string) => {
        if (path === missingPath) throw new Error("File is unavailable");
        return "file contents";
      },
    );

    const { user } = await renderApp();
    await startMockRun(user, "Start with the active settings");
    await emitCodexServerRequest({
      id: 9,
      method: "item/commandExecution/requestApproval",
      params: {
        threadId: "thread-1",
        turnId: "turn-1",
        itemId: "command-1",
        command: "npm test",
        cwd: workspace.path,
        availableDecisions: ["accept", "decline", "cancel"],
      },
    });

    const confirmFullAccess = vi.spyOn(window, "confirm").mockReturnValue(true);
    await user.click(screen.getByRole("button", { name: "Plan mode" }));
    await user.click(screen.getByRole("combobox", { name: "Agent" }));
    await user.click(
      screen.getByRole("option", { name: queuedModel.displayName }),
    );
    await user.click(screen.getByRole("combobox", { name: "Access" }));
    await user.click(screen.getByRole("option", { name: "Full access" }));
    expect(confirmFullAccess).toHaveBeenCalled();
    confirmFullAccess.mockRestore();
    await user.click(screen.getByRole("button", { name: "Add files" }));
    await user.type(screen.getByLabelText("Prompt"), `${queuedPrompt} /docs`);
    await user.click(await screen.findByRole("option", { name: /docs/i }));
    await user.click(
      screen.getByRole("button", { name: "Add prompt to queue" }),
    );
    await user.click(screen.getByRole("button", { name: /^Queue/ }));
    await user.click(
      screen.getByRole("button", { name: "Send queued prompt now" }),
    );

    await waitFor(() =>
      expect(mocks.codexRpcMock).toHaveBeenCalledWith(
        signedInAccount.id,
        "turn/steer",
        expect.objectContaining({
          threadId: "thread-1",
          expectedTurnId: "turn-1",
          input: [
            {
              type: "text",
              text: queuedPrompt,
              text_elements: [],
            },
            {
              type: "localImage",
              path: imagePath,
              detail: "auto",
            },
            { type: "skill", name: selectedSkill.name, path: selectedSkill.path },
          ],
          additionalContext: {
            [`file:${documentPath}`]: {
              kind: "untrusted",
              value: `File: ${documentPath}\n\nfile contents`,
            },
          },
        }),
      ),
    );
    expect(mocks.readCodexFileMock).toHaveBeenCalledWith(
      signedInAccount.id,
      documentPath,
    );
    expect(
      mocks.codexRpcMock.mock.calls.filter(
        ([, method]) => method === "turn/start",
      ),
    ).toHaveLength(1);
    expect(mocks.appendRunEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ method: "turn/steer" }),
    );
    expect(mocks.completePromptQueueItemMock).toHaveBeenCalledTimes(1);
    expect(
      await screen.findByRole("alert", {
        name: "Prompt sent with skipped context",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Skipped context file: missing\.txt/),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Additional submitted prompt")).toHaveTextContent(
      queuedPrompt,
    );
    expect(screen.getByLabelText("Submitted image")).toBeInTheDocument();
    expect(
      screen.getByText("Codex needs approval to run a command"),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /stop codex/i }));
  });

  it.each([
    { activeMode: "Plan", buttonName: "Plan mode" },
    { activeMode: "Goal", buttonName: "Goal mode" },
  ])("steers an active $activeMode turn", async ({ activeMode, buttonName }) => {
    prepareSignedInRun();
    mocks.listCodexModelsMock.mockResolvedValue([defaultCodexModel]);
    mocks.codexRpcMock.mockImplementation(
      async (_accountId: number, method: string) => {
        if (method === "collaborationMode/list") {
          return {
            data: [
              { name: "Plan", mode: "plan", reasoning_effort: "medium" },
              { name: "Default", mode: "default", reasoning_effort: null },
            ],
          };
        }
        if (method === "thread/start") {
          return { thread: { id: "thread-1" } };
        }
        if (method === "turn/start") {
          return { turn: { id: "turn-1" } };
        }
        return {};
      },
    );

    const { user } = await renderApp();
    await user.click(screen.getByRole("button", { name: buttonName }));
    await startMockRun(user, `Start the active ${activeMode} turn`);
    if (activeMode === "Goal") {
      await user.click(screen.getByRole("button", { name: "Goal mode" }));
    }
    await user.type(
      screen.getByLabelText("Prompt"),
      `Steer the active ${activeMode} turn`,
    );
    await user.click(
      screen.getByRole("button", { name: "Add prompt to queue" }),
    );
    await user.click(screen.getByRole("button", { name: /^Queue/ }));
    await user.click(
      screen.getByRole("button", { name: "Send queued prompt now" }),
    );

    await waitFor(() =>
      expect(mocks.codexRpcMock).toHaveBeenCalledWith(
        signedInAccount.id,
        "turn/steer",
        expect.objectContaining({
          threadId: "thread-1",
          expectedTurnId: "turn-1",
          input: [
            {
              type: "text",
              text: `Steer the active ${activeMode} turn`,
              text_elements: [],
            },
          ],
        }),
      ),
    );
    await user.click(screen.getByRole("button", { name: /stop codex/i }));
  });

  it.each(["accepted", "rejected", "turn completed"])(
    "anchors steering before the RPC resolves: %s",
    async (outcome) => {
      prepareSignedInRun();
      const { user } = await renderApp();
      await startMockRun(user, "Start the active task");
      await user.type(screen.getByLabelText("Prompt"), "Steer at this point");
      await user.click(screen.getByRole("button", { name: "Add prompt to queue" }));
      await user.click(screen.getByRole("button", { name: /^Queue/ }));
      let resolveSteer!: (value: unknown) => void;
      let rejectSteer!: (error: Error) => void;
      mocks.codexRpcMock.mockImplementationOnce(() => new Promise((resolve, reject) => {
        resolveSteer = resolve;
        rejectSteer = reject;
      }));
      const frames = holdNextAnimationFrames();
      try {
        await emitCodexNotification({
          method: "item/reasoning/textDelta",
          params: { threadId: "thread-1", turnId: "turn-1", delta: "Before dispatch" },
        });
        expect(screen.queryByText("Before dispatch")).not.toBeInTheDocument();
        await user.click(screen.getByRole("button", { name: "Send queued prompt now" }));
        const pending = await screen.findByLabelText("Additional submitted prompt");
        expect(pending).toHaveAttribute("aria-busy", "true");
        expect(screen.getByText("Before dispatch").compareDocumentPosition(pending) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      } finally {
        await frames.flush();
        frames.restore();
      }
      await emitCodexNotification({
        method: "item/reasoning/textDelta",
        params: { threadId: "thread-1", turnId: "turn-1", delta: "During delivery" },
      });
      const during = await screen.findByText("During delivery");
      expect(screen.getByLabelText("Additional submitted prompt").compareDocumentPosition(during) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      if (outcome === "accepted") {
        // Completion can arrive before the steer acknowledgement.
        await emitCodexNotification({
          method: "turn/completed",
          params: { threadId: "thread-1", turnId: "turn-1", turn: { id: "turn-1", status: "completed", durationMs: 100 } },
        });
        await act(async () => resolveSteer({}));
        await waitFor(() => expect(screen.getByLabelText("Additional submitted prompt")).toHaveAttribute("aria-busy", "false"));
        expect(screen.getAllByLabelText("Additional submitted prompt")).toHaveLength(1);
        expect(screen.getByLabelText("Additional submitted prompt")).toBeVisible();
        expect(screen.getByLabelText("Activity 1")).toBeVisible();
        expect(screen.getByLabelText("Activity 2")).toBeVisible();
      } else {
        const message = outcome === "rejected" ? "Steering rejected" : "turn is not active because it completed";
        await act(async () => rejectSteer(new Error(message)));
        await waitFor(() => expect(screen.queryByLabelText("Additional submitted prompt")).not.toBeInTheDocument());
        expect(screen.getByText("Before dispatch")).toBeVisible();
        expect(screen.getByText("During delivery")).toBeVisible();
        if (outcome === "rejected") {
          expect(mocks.failPromptQueueItemMock).toHaveBeenCalledWith(expect.any(String), message);
        } else {
          expect(mocks.reschedulePromptQueueItemAfterSteeringRaceMock).toHaveBeenCalledTimes(1);
        }
        await user.click(screen.getByRole("button", { name: /stop codex/i }));
      }
    },
  );

  it("keeps a rejected steering prompt failed and retryable", async () => {
    prepareSignedInRun();

    const { user } = await renderApp();
    await startMockRun(user, "Start the active task");
    await user.type(
      screen.getByLabelText("Prompt"),
      "Keep this prompt available after a steering failure",
    );
    await user.click(
      screen.getByRole("button", { name: "Add prompt to queue" }),
    );
    await user.click(screen.getByRole("button", { name: /^Queue/ }));
    mocks.codexRpcMock.mockRejectedValueOnce(new Error("Steering rejected"));
    await user.click(
      screen.getByRole("button", { name: "Send queued prompt now" }),
    );

    const steeringFailure = await screen.findByRole("alert", {
      name: "Couldn’t send queued prompt",
    });
    expect(
      within(steeringFailure).getByText("Steering rejected"),
    ).toBeInTheDocument();
    expect(mocks.failPromptQueueItemMock).toHaveBeenCalledWith(
      expect.any(String),
      "Steering rejected",
    );
    expect(
      screen.getByRole("button", { name: "Retry queued prompt" }),
    ).toBeInTheDocument();
    expect(mocks.completePromptQueueItemMock).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /stop codex/i }));
  });

  it("locks repeated send-now clicks to one steering delivery", async () => {
    prepareSignedInRun();

    const { user } = await renderApp();
    await startMockRun(user, "Start the active task");
    await user.type(
      screen.getByLabelText("Prompt"),
      "Deliver this queued prompt once",
    );
    await user.click(
      screen.getByRole("button", { name: "Add prompt to queue" }),
    );
    const queuedItemId = mocks.enqueuePromptQueueItemMock.mock.calls[0][0].id;
    await user.click(screen.getByRole("button", { name: /^Queue/ }));

    let resolvePrioritize!: (item: any) => void;
    mocks.prioritizePromptQueueItemMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolvePrioritize = resolve;
        }),
    );
    const sendNow = screen.getByRole("button", {
      name: "Send queued prompt now",
    });
    act(() => {
      fireEvent.click(sendNow);
      fireEvent.click(sendNow);
    });

    expect(mocks.prioritizePromptQueueItemMock).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolvePrioritize(
        updatePromptQueueFixture(queuedItemId, {
          status: "scheduled-next",
          sendNowPriority: 1,
        }),
      );
    });
    await waitFor(() =>
      expect(
        mocks.codexRpcMock.mock.calls.filter(
          ([, method]) => method === "turn/steer",
        ),
      ).toHaveLength(1),
    );

    await user.click(screen.getByRole("button", { name: /stop codex/i }));
  });

  it("prioritizes the queued prompt for the next run without a live turn", async () => {
    prepareSignedInRun();

    const { user } = await renderApp();
    await startMockRun(user, "Start the active task");
    await user.type(
      screen.getByLabelText("Prompt"),
      "Run this prompt after the active turn",
    );
    await user.click(
      screen.getByRole("button", { name: "Add prompt to queue" }),
    );
    await user.click(screen.getByRole("button", { name: /^Queue/ }));
    await user.click(
      screen.getByRole("button", { name: "Skip automatic sending" }),
    );
    expect(await screen.findByText("Held")).toBeInTheDocument();

    await emitCodexNotification({
      method: "turn/completed",
      params: {
        threadId: "thread-1",
        turnId: "turn-1",
        turn: { id: "turn-1", status: "completed", durationMs: 100 },
      },
    });
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: /stop codex/i }),
      ).not.toBeInTheDocument(),
    );
    await user.click(
      screen.getByRole("button", { name: "Send queued prompt now" }),
    );

    expect(
      await screen.findByRole("status", { name: "Prompt moved to front" }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(
        mocks.codexRpcMock.mock.calls.filter(
          ([, method]) => method === "turn/start",
        ),
      ).toHaveLength(2),
    );
    expect(
      mocks.codexRpcMock.mock.calls.filter(
        ([, method]) => method === "turn/steer",
      ),
    ).toHaveLength(0);

    expect(mocks.codexRpcMock.mock.calls.filter(([, method]) => method === "turn/start")[1][2].input[0].text).toBe("Run this prompt after the active turn");
    await user.click(screen.getByRole("button", { name: /stop codex/i }));
  });

  it("marks completed chat runs and persists the final assistant message", async () => {
      prepareSignedInRun();
      mocks.readAgentNotificationPermissionStatusMock.mockResolvedValue("allowed");

      const { user } = await renderApp();
      await startMockRun(user, "Finish the task");
      window.dispatchEvent(new Event("blur"));

      await emitCodexNotification({
        method: "item/agentMessage/delta",
        params: { itemId: "commentary-1", delta: "I will inspect the repo first." },
      });
      await emitCodexNotification({
        method: "item/completed",
        params: {
          item: {
            type: "agentMessage",
            id: "commentary-1",
            text: "I will inspect the repo first.",
            phase: "commentary",
          },
        },
      });
      await emitCodexNotification({
        method: "item/agentMessage/delta",
        params: { itemId: "final-1", delta: "Done." },
      });
      await emitCodexNotification({
        method: "item/completed",
        params: {
          item: {
            type: "agentMessage",
            id: "final-1",
            text: "Done.",
            phase: "final_answer",
          },
        },
      });
      await emitCodexNotification({
        method: "turn/completed",
        params: { turn: { status: "completed", durationMs: 1234 } },
      });

      await waitFor(() =>
        expect(mocks.updateRunMock).toHaveBeenCalledWith(
          202,
          expect.objectContaining({
            status: "completed",
            durationMs: 1234,
            finalMessage: "Done.",
          }),
        ),
      );
      expect(within(screen.getByLabelText("Run summary")).getByText("Done.")).toBeInTheDocument();
      expect(
        within(screen.getByLabelText("Run summary")).queryByText(
          "I will inspect the repo first.",
        ),
      ).not.toBeInTheDocument();
      expect(screen.queryByText("completed")).not.toBeInTheDocument();
      await waitFor(() =>
        expect(mocks.sendAgentNotificationMock).toHaveBeenCalledWith(
          expect.objectContaining({
            title: "Response complete",
            body: "Finish the task is ready to review.",
            target: expect.objectContaining({
              kind: "response-completed",
              workspaceId: workspace.id,
              chatId: 401,
              runId: 202,
              turnId: "turn-1",
            }),
          }),
        ),
      );
    });

  it("refreshes git status and the empty workspace explorer after a run creates the first file", async () => {
      prepareSignedInRun();
      const generatedEntry = {
        name: "index.html",
        path: "/repo/orchestrator/index.html",
        relativePath: "index.html",
        kind: "file" as const,
      };
      let fileCreated = false;
      mocks.listWorkspaceDirectoryMock.mockImplementation(async () =>
        fileCreated ? [generatedEntry] : [],
      );
      mocks.listWorkspaceGitStatusMock.mockImplementation(async () => ({
        workspacePath: workspace.path,
        gitRoot: workspace.path,
        currentBranch: "main",
        aheadCount: 0,
        hasUpstream: true,
        hasOrigin: true,
        canPush: false,
        files: fileCreated
          ? [
              {
                path: generatedEntry.path,
                relativePath: generatedEntry.relativePath,
                oldRelativePath: null,
                indexStatus: "?",
                worktreeStatus: "?",
                statusKind: "untracked",
                badge: "U",
              },
            ]
          : [],
      }));

      const { user } = await renderApp();
      await user.click(screen.getByRole("button", { name: "Files" }));
      const workspaceNav = screen.getByRole("navigation", { name: "Workspaces" });
      await user.click(
        within(workspaceNav).getByRole("button", { name: "Expand orchestrator" }),
      );
      expect(await within(workspaceNav).findByText("Empty folder")).toBeInTheDocument();
      const directoryCallsBeforeCompletion =
        mocks.listWorkspaceDirectoryMock.mock.calls.length;
      const gitCallsBeforeCompletion = mocks.listWorkspaceGitStatusMock.mock.calls.length;

      await startMockRun(user, "Create the starter app");
      fileCreated = true;
      await emitCodexNotification({
        method: "turn/completed",
        params: { turn: { status: "completed", durationMs: 1234 } },
      });

      await waitFor(() =>
        expect(mocks.listWorkspaceDirectoryMock.mock.calls.length).toBeGreaterThan(
          directoryCallsBeforeCompletion,
        ),
      );
      await waitFor(() =>
        expect(mocks.listWorkspaceGitStatusMock.mock.calls.length).toBeGreaterThan(
          gitCallsBeforeCompletion,
        ),
      );
      expect(await within(workspaceNav).findByTitle("index.html")).toBeInTheDocument();
      expect(within(workspaceNav).getByLabelText("untracked file")).toHaveTextContent(
        "U",
      );
      expect(
        within(
          screen.getByRole("region", { name: "Selected folder" }),
        ).getByLabelText(/1 changed \(1 untracked\)/i),
      ).toBeInTheDocument();
    });

  it("keeps a fresh post-run directory listing when an older empty request resolves later", async () => {
      prepareSignedInRun();
      const generatedEntry = {
        name: "main.ts",
        path: "/repo/orchestrator/main.ts",
        relativePath: "main.ts",
        kind: "file" as const,
      };
      let resolveStaleDirectory: ((entries: typeof generatedEntry[]) => void) | null =
        null;
      mocks.listWorkspaceDirectoryMock
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              resolveStaleDirectory = resolve;
            }),
        )
        .mockResolvedValue([generatedEntry]);

      const { user } = await renderApp();
      await user.click(screen.getByRole("button", { name: "Files" }));
      const workspaceNav = screen.getByRole("navigation", { name: "Workspaces" });
      await user.click(
        within(workspaceNav).getByRole("button", { name: "Expand orchestrator" }),
      );
      await waitFor(() => expect(mocks.listWorkspaceDirectoryMock).toHaveBeenCalledTimes(1));

      await startMockRun(user, "Create main.ts");
      await emitCodexNotification({
        method: "turn/completed",
        params: { turn: { status: "completed", durationMs: 1234 } },
      });

      await waitFor(() => expect(mocks.listWorkspaceDirectoryMock).toHaveBeenCalledTimes(2));
      expect(await within(workspaceNav).findByTitle("main.ts")).toBeInTheDocument();

      await act(async () => {
        resolveStaleDirectory?.([]);
        await Promise.resolve();
      });
      expect(within(workspaceNav).getByTitle("main.ts")).toBeInTheDocument();
    });

  it("runs a fresh git status request after an in-flight pre-completion snapshot", async () => {
      prepareSignedInRun();
      let resolveStaleGitStatus: ((snapshot: unknown) => void) | null = null;
      const cleanStatus = {
        workspacePath: workspace.path,
        gitRoot: workspace.path,
        currentBranch: "main",
        aheadCount: 0,
        hasUpstream: true,
        hasOrigin: true,
        canPush: false,
        files: [],
      };
      const changedStatus = {
        ...cleanStatus,
        files: [
          {
            path: "/repo/orchestrator/app.js",
            relativePath: "app.js",
            oldRelativePath: null,
            indexStatus: "?",
            worktreeStatus: "?",
            statusKind: "untracked",
            badge: "U",
          },
        ],
      };
      mocks.listWorkspaceGitStatusMock
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              resolveStaleGitStatus = resolve;
            }),
        )
        .mockResolvedValue(changedStatus);

      const { user } = await renderApp();
      await waitFor(() => expect(mocks.listWorkspaceGitStatusMock).toHaveBeenCalledTimes(1));
      await startMockRun(user, "Create app.js");
      await emitCodexNotification({
        method: "turn/completed",
        params: { turn: { status: "completed", durationMs: 1234 } },
      });

      await act(async () => {
        resolveStaleGitStatus?.(cleanStatus);
        await Promise.resolve();
      });

      await waitFor(() => expect(mocks.listWorkspaceGitStatusMock).toHaveBeenCalledTimes(2));
      expect(
        await within(
          screen.getByRole("region", { name: "Selected folder" }),
        ).findByLabelText(/1 changed \(1 untracked\)/i),
      ).toBeInTheDocument();
    });

  it("opens completed summary file links in the app preview drawer", async () => {
      prepareSignedInRun();
      mocks.readWorkspaceFilePreviewMock.mockResolvedValue({
        path: "/repo/orchestrator/hello-world.txt",
        relativePath: "hello-world.txt",
        content: "hello world",
        truncated: false,
        isBinary: false,
      });

      const { user } = await renderApp();
      await startMockRun(user, "Update hello-world");

      await emitCodexNotification({
        method: "item/agentMessage/delta",
        params: {
          itemId: "final-1",
          delta: "Updated [hello-world.txt](http://localhost:1420/repo/orchestrator/hello-world.txt).",
        },
      });
      await emitCodexNotification({
        method: "item/completed",
        params: {
          item: {
            type: "agentMessage",
            id: "final-1",
            text: "Updated [hello-world.txt](http://localhost:1420/repo/orchestrator/hello-world.txt).",
            phase: "final_answer",
          },
        },
      });
      await emitCodexNotification({
        method: "turn/completed",
        params: { turn: { status: "completed", durationMs: 1234 } },
      });

      await user.click(
        within(screen.getByLabelText("Run summary")).getByRole("link", {
          name: "hello-world.txt",
        }),
      );

      await waitFor(() =>
        expect(mocks.readWorkspaceFilePreviewMock).toHaveBeenCalledWith(
          workspace.path,
          "/repo/orchestrator/hello-world.txt",
        ),
      );
      expect(screen.getByRole("complementary", { name: "File preview" })).toHaveTextContent(
        "hello world",
      );
    });

  it("strips line references from completed summary file links before previewing", async () => {
      prepareSignedInRun();
      mocks.readWorkspaceFilePreviewMock.mockResolvedValue({
        path: "/repo/orchestrator/hello-world.txt",
        relativePath: "hello-world.txt",
        content: "hello world\npoat",
        truncated: false,
        isBinary: false,
      });

      const { user } = await renderApp();
      await startMockRun(user, "Update hello-world");

      await emitCodexNotification({
        method: "item/agentMessage/delta",
        params: {
          itemId: "final-1",
          delta:
            "Updated [hello-world.txt](http://localhost:1420/repo/orchestrator/hello-world.txt:8).",
        },
      });
      await emitCodexNotification({
        method: "item/completed",
        params: {
          item: {
            type: "agentMessage",
            id: "final-1",
            text:
              "Updated [hello-world.txt](http://localhost:1420/repo/orchestrator/hello-world.txt:8).",
            phase: "final_answer",
          },
        },
      });
      await emitCodexNotification({
        method: "turn/completed",
        params: { turn: { status: "completed", durationMs: 1234 } },
      });

      await user.click(
        within(screen.getByLabelText("Run summary")).getByRole("link", {
          name: "hello-world.txt",
        }),
      );

      await waitFor(() =>
        expect(mocks.readWorkspaceFilePreviewMock).toHaveBeenCalledWith(
          workspace.path,
          "/repo/orchestrator/hello-world.txt",
        ),
      );
      expect(screen.getByRole("complementary", { name: "File preview" })).toHaveTextContent(
        "poat",
      );
    });

  it("opens fresh file contents from completed summary links after a run changes a cached file", async () => {
      prepareSignedInRun();
      const fileEntry = {
        name: "hello-world.txt",
        path: "/repo/orchestrator/hello-world.txt",
        relativePath: "hello-world.txt",
        kind: "file" as const,
      };
      mocks.listWorkspaceDirectoryMock.mockResolvedValue([fileEntry]);
      mocks.readWorkspaceFilePreviewMock
        .mockResolvedValueOnce({
          path: fileEntry.path,
          relativePath: fileEntry.relativePath,
          content: "hello\nhello world\n",
          truncated: false,
          isBinary: false,
        })
        .mockResolvedValue({
          path: fileEntry.path,
          relativePath: fileEntry.relativePath,
          content: "hello\nhello world\npoat\n",
          truncated: false,
          isBinary: false,
        });

      const { user } = await renderApp();
      await user.click(screen.getByRole("button", { name: "Files" }));
      const workspaceNav = screen.getByRole("navigation", {
        name: "Workspaces",
      });
      await user.click(
        within(workspaceNav).getByRole("button", { name: "Expand orchestrator" }),
      );
      pointerTapFile(
        await within(workspaceNav).findByRole("button", { name: "hello-world.txt" }),
      );
      expect(await screen.findByText("hello world")).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Close file preview" }));

      await startMockRun(user, "Add poat");

      await emitCodexNotification({
        method: "item/agentMessage/delta",
        params: {
          itemId: "final-1",
          delta:
            "Added poat to [hello-world.txt](http://localhost:1420/repo/orchestrator/hello-world.txt).",
        },
      });
      await emitCodexNotification({
        method: "item/completed",
        params: {
          item: {
            type: "agentMessage",
            id: "final-1",
            text:
              "Added poat to [hello-world.txt](http://localhost:1420/repo/orchestrator/hello-world.txt).",
            phase: "final_answer",
          },
        },
      });
      await emitCodexNotification({
        method: "turn/completed",
        params: { turn: { status: "completed", durationMs: 1234 } },
      });

      await user.click(
        within(screen.getByLabelText("Run summary")).getByRole("link", {
          name: "hello-world.txt",
        }),
      );

      await waitFor(() =>
        expect(mocks.readWorkspaceFilePreviewMock).toHaveBeenCalledTimes(2),
      );
      expect(screen.getByRole("complementary", { name: "File preview" })).toHaveTextContent(
        "poat",
      );
    });

  it("sends selected slash skills as native inputs beside the authored request", async () => {
      mocks.listCodexAccountsMock.mockResolvedValue([signedInAccount]);
      mocks.readCodexAccountMock.mockResolvedValue({
        account: {
          type: "chatgpt",
          email: signedInAccount.email,
          planType: signedInAccount.plan_type,
        },
        requiresOpenaiAuth: true,
      });
      mocks.listCodexSkillsMock.mockResolvedValue([
        {
          id: "browser:control-in-app-browser",
          path: "/skills/browser/SKILL.md",
          name: "browser:control-in-app-browser",
          description: "Control the in-app browser",
        },
        {
          id: "docs",
      path: "/skills/docs/SKILL.md",
          name: "Docs",
          description: "Use repository documentation",
        },
      ]);
      mocks.codexRpcMock.mockImplementation(
        async (_accountId: number, method: string) => {
          if (method === "thread/start") {
            return { thread: { id: "thread-1" } };
          }
          if (method === "turn/start") {
            return { turn: { id: "turn-1" } };
          }
          return {};
        },
      );

      const { user } = await renderApp();
      const promptInput = screen.getByLabelText("Prompt");
      await user.type(promptInput, "Fix the docs /docs");
      await user.click(await screen.findByRole("option", { name: /docs/i }));
      expect(screen.getByText("Docs")).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: /run codex/i }));

      await waitFor(() => expect(mocks.codexRpcMock).toHaveBeenCalledWith(
        7, "turn/start", expect.objectContaining({ input: [
          { type: "text", text: "Fix the docs", text_elements: [] },
          { type: "skill", name: "Docs", path: "/skills/docs/SKILL.md" },
        ] }),
      ));
    });

  it("detects a reachable structured command preview and opens it in the default browser", async () => {
      prepareSignedInRun();
      const { user } = await renderApp();
      await startMockRun(user, "Start the local preview");

      await emitCodexNotification({
        method: "item/started",
        params: {
          threadId: "thread-1",
          turnId: "turn-1",
          item: {
            id: "command-preview",
            type: "commandExecution",
            command: "npm run dev",
          },
        },
      });
      await emitCodexNotification({
        method: "item/commandExecution/outputDelta",
        params: {
          threadId: "thread-1",
          turnId: "turn-1",
          itemId: "command-preview",
          delta: "  Local: http://localhost:5173/\n",
        },
      });

      await waitFor(() =>
        expect(mocks.updateRunMock).toHaveBeenCalledWith(202, {
          webPreviewJson: expect.stringContaining("http://localhost:5173/"),
        }),
      );
      expect(
        screen.queryByRole("button", {
          name: "Open web preview in browser",
        }),
      ).not.toBeInTheDocument();

      await emitCodexNotification({
        method: "turn/completed",
        params: {
          threadId: "thread-1",
          turnId: "turn-1",
          turn: { id: "turn-1", status: "completed", durationMs: 100 },
        },
      });

      const openPreview = await screen.findByRole("button", {
        name: "Open web preview in browser",
      });

      await user.click(openPreview);
      await waitFor(() =>
        expect(mocks.openUrlMock).toHaveBeenCalledWith(
          "http://localhost:5173/",
        ),
      );
      expect(mocks.openUrlMock).toHaveBeenCalledTimes(1);
    });

  it("detects a port-only ready message from npm start output", async () => {
      prepareSignedInRun();
      const { user } = await renderApp();
      await startMockRun(user, "Start the app");

      await emitCodexNotification({
        method: "item/started",
        params: {
          threadId: "thread-1",
          turnId: "turn-1",
          item: {
            id: "command-npm-start",
            type: "commandExecution",
            command: "/bin/zsh -lc 'npm start'",
          },
        },
      });
      await emitCodexNotification({
        method: "item/commandExecution/outputDelta",
        params: {
          threadId: "thread-1",
          turnId: "turn-1",
          itemId: "command-npm-start",
          delta:
            "\r\n> snake-test@1.0.0 start\r\n> node src/server.js\r\n\r\n",
        },
      });
      await emitCodexNotification({
        method: "item/commandExecution/outputDelta",
        params: {
          threadId: "thread-1",
          turnId: "turn-1",
          itemId: "command-npm-start",
          delta: "Server listening on port 3000\r\n",
        },
      });

      await waitFor(() =>
        expect(mocks.probeLocalWebPreviewMock).toHaveBeenCalledWith(
          "http://localhost:3000/",
        ),
      );
      await waitFor(() =>
        expect(mocks.updateRunMock).toHaveBeenCalledWith(202, {
          webPreviewJson: expect.stringContaining("http://localhost:3000/"),
        }),
      );
      expect(
        screen.queryByRole("button", {
          name: "Open web preview in browser",
        }),
      ).not.toBeInTheDocument();

      await emitCodexNotification({
        method: "turn/completed",
        params: {
          threadId: "thread-1",
          turnId: "turn-1",
          turn: { id: "turn-1", status: "completed", durationMs: 100 },
        },
      });

      expect(
        await screen.findByRole("button", {
          name: "Open web preview in browser",
        }),
      ).toBeInTheDocument();
    });

  it("keeps probing the latest server candidate after the turn completes", async () => {
      prepareSignedInRun();
      mocks.probeLocalWebPreviewMock
        .mockResolvedValueOnce({
          normalizedUrl: "http://localhost:4173/",
          reachable: false,
        })
        .mockResolvedValue({
          normalizedUrl: "http://localhost:4173/",
          reachable: true,
        });
      const { user } = await renderApp();
      await startMockRun(user, "Start a slower preview");

      await emitCodexNotification({
        method: "item/started",
        params: {
          threadId: "thread-1",
          turnId: "turn-1",
          item: {
            id: "command-slow-preview",
            type: "commandExecution",
            command: "vite --port 4173",
          },
        },
      });
      await waitFor(() =>
        expect(mocks.probeLocalWebPreviewMock).toHaveBeenCalledTimes(1),
      );
      await emitCodexNotification({
        method: "turn/completed",
        params: {
          threadId: "thread-1",
          turnId: "turn-1",
          turn: { id: "turn-1", status: "completed", durationMs: 100 },
        },
      });

      expect(
        await screen.findByRole("button", {
          name: "Open web preview in browser",
        }),
      ).toBeInTheDocument();
      expect(mocks.probeLocalWebPreviewMock).toHaveBeenCalledTimes(2);
    });

  it("blocks unauthenticated runs before thread/start", async () => {
      const { user } = await renderApp();

      await user.type(screen.getByLabelText("Prompt"), "Fix the Codex auth flow");
      await waitFor(() =>
        expect(screen.getByRole("button", { name: /run codex/i })).toBeEnabled(),
      );

      await user.click(screen.getByRole("button", { name: /run codex/i }));

      expect(mocks.runPreflightMock).not.toHaveBeenCalled();
      expect(mocks.createTaskMock).not.toHaveBeenCalled();
      expect(mocks.codexRpcMock).not.toHaveBeenCalled();
    });
});
