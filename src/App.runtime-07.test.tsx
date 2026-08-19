import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, beforeEach, expect, it, vi } from "vitest";
import {
  getMocks,
  workspace,
  prepareDefaults,
  renderApp,
  prepareSignedInRun,
  startMockRun,
  emitCodexNotification,
  emitCodexServerRequest,
  setWindowWidth,
} from "./test/appRuntimeHarness";

const mocks = getMocks();

describe("Application runtime scenarios 7", () => {
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

  it("allows undo after completion while terminal run housekeeping is pending", async () => {
      prepareSignedInRun();
      let releaseCompletionEvent!: () => void;
      const pendingCompletionEvent = new Promise<void>((resolve) => {
        releaseCompletionEvent = resolve;
      });
      mocks.appendRunEventMock.mockImplementation(
        async (input: { method?: string }) => {
          if (input.method === "turn/completed") {
            await pendingCompletionEvent;
          }
        },
      );

      const { user } = await renderApp();
      await startMockRun(user, "Update the readme");
      const diff = [
        "diff --git a/README.md b/README.md",
        "--- a/README.md",
        "+++ b/README.md",
        "@@ -1 +1 @@",
        "-Old",
        "+New",
      ].join("\n");

      await emitCodexNotification({
        method: "turn/diff/updated",
        params: { diff },
      });
      await emitCodexNotification({
        method: "turn/completed",
        params: { turn: { status: "completed", durationMs: 1234 } },
      });

      const summary = await screen.findByLabelText("Edited 1 file");
      const undoButton = within(summary).getByRole("button", {
        name: "Undo file changes",
      });
      expect(undoButton).toBeEnabled();
      await user.click(undoButton);
      await user.click(
        within(screen.getByRole("dialog", { name: "Undo changes?" })).getByRole(
          "button",
          { name: "Undo changes" },
        ),
      );

      await waitFor(() =>
        expect(mocks.undoWorkspaceGitDiffMock).toHaveBeenCalledWith(
          workspace.path,
          diff,
        ),
      );

      await act(async () => {
        releaseCompletionEvent();
        await pendingCompletionEvent;
      });
    });

  it("coalesces bursty app-server deltas without disturbing active typing", async () => {
      prepareSignedInRun();

      const { user } = await renderApp();
      await startMockRun(user, "Stream a large response");
      const promptInput = screen.getByLabelText("Prompt") as HTMLTextAreaElement;
      await user.type(promptInput, "Keep this follow-up responsive");
      promptInput.focus();
      promptInput.setSelectionRange(9, 9);

      await act(async () => {
        const listener = mocks.listeners.get("codex:notification");
        for (let index = 0; index < 120; index += 1) {
          listener?.({
            payload: {
              accountId: 7,
              message: {
                method: "item/agentMessage/delta",
                params: { itemId: "commentary-1", delta: "x" },
              },
            },
          });
        }
      });

      await waitFor(() =>
        expect(
          within(screen.getByLabelText("Task chat transcript")).getByText(
            "x".repeat(120),
          ),
        ).toBeInTheDocument(),
      );
      await waitFor(() =>
        expect(
          mocks.appendRunEventsMock.mock.calls.flatMap(([events]) => events),
        ).toHaveLength(120),
      );

      expect(mocks.appendRunEventsMock.mock.calls.length).toBeLessThanOrEqual(3);
      expect(screen.getByLabelText("Prompt")).toBe(promptInput);
      expect(promptInput).toHaveValue("Keep this follow-up responsive");
      expect(promptInput).toHaveFocus();
      expect(promptInput.selectionStart).toBe(9);
      expect(promptInput.selectionEnd).toBe(9);
    });

  it("keeps ordinary prompt typing off the native bridge and database path", async () => {
      prepareSignedInRun();
      const { user } = await renderApp();
      const before = {
        rpc: mocks.codexRpcMock.mock.calls.length,
        createTask: mocks.createTaskMock.mock.calls.length,
        createRun: mocks.createRunMock.mock.calls.length,
        appendOne: mocks.appendRunEventMock.mock.calls.length,
        appendBatch: mocks.appendRunEventsMock.mock.calls.length,
        tokenWrites: mocks.recordTokenUsageMock.mock.calls.length,
      };

      await user.type(
        screen.getByLabelText("Prompt"),
        "Typing stays entirely inside the composer until the user submits it.",
      );

      expect(mocks.codexRpcMock).toHaveBeenCalledTimes(before.rpc);
      expect(mocks.createTaskMock).toHaveBeenCalledTimes(before.createTask);
      expect(mocks.createRunMock).toHaveBeenCalledTimes(before.createRun);
      expect(mocks.appendRunEventMock).toHaveBeenCalledTimes(before.appendOne);
      expect(mocks.appendRunEventsMock).toHaveBeenCalledTimes(before.appendBatch);
      expect(mocks.recordTokenUsageMock).toHaveBeenCalledTimes(before.tokenWrites);
    });

  it("renders approval requests inline and resolves them from the chat", async () => {
      prepareSignedInRun();
      mocks.readAgentNotificationPermissionStatusMock.mockResolvedValue("allowed");

      const { user } = await renderApp();
      await startMockRun(user, "Run the tests");
      window.dispatchEvent(new Event("blur"));

      await emitCodexServerRequest({
        id: 9,
        method: "item/commandExecution/requestApproval",
        params: {
          threadId: "thread-1",
          turnId: "turn-1",
          itemId: "command-1",
          command: "npm test",
          cwd: "/repo/orchestrator",
          environmentId: "local",
          reason: "Tests require access outside the current sandbox.",
          availableDecisions: ["accept", "decline", "cancel"],
        },
      });

      const approval = screen
        .getByText("Codex needs approval to run a command")
        .closest("article")!;
      expect(approval).toBeInTheDocument();
      expect(within(approval).getByText(/npm test/)).toBeInTheDocument();
      const workingDirectory = within(approval).getByText("/repo/orchestrator");
      expect(workingDirectory.tagName).toBe("PRE");
      expect(workingDirectory).toHaveClass("approval-code-surface");
      expect(workingDirectory.parentElement).toHaveClass(
        "approval-context-code-row",
      );
      expect(within(approval).queryByText("Environment")).not.toBeInTheDocument();
      expect(within(approval).queryByText("local")).not.toBeInTheDocument();
      await waitFor(() =>
        expect(mocks.sendAgentNotificationMock).toHaveBeenCalledWith(
          expect.objectContaining({
            title: "Approval required",
            body: expect.not.stringContaining("npm test"),
            target: expect.objectContaining({
              kind: "approval-required",
              workspaceId: workspace.id,
              chatId: 401,
              runId: 202,
              requestId: expect.any(String),
            }),
          }),
        ),
      );
      const approvalEventKey = mocks.sendAgentNotificationMock.mock.calls[0][0]
        .target.eventKey;

      await user.click(screen.getByRole("button", { name: /approve once/i }));
      await waitFor(() =>
        expect(mocks.resolveCodexServerRequestMock).toHaveBeenCalledWith(
          7,
          9,
          "server-request-7-1-9",
          { decision: "accept" },
        ),
      );
      await waitFor(() =>
        expect(mocks.removeAgentNotificationMock).toHaveBeenCalledWith(
          approvalEventKey,
        ),
      );
      expect(screen.getByText(/waiting for codex to resolve/i)).toBeInTheDocument();

      await emitCodexNotification({
        method: "serverRequest/resolved",
        params: { threadId: "thread-1", requestId: 9 },
      });
      expect(
        screen.queryByText("Codex needs approval to run a command"),
      ).not.toBeInTheDocument();
    });

  it("routes child turns into the subagent inspector without completing the parent run", async () => {
      prepareSignedInRun();
      mocks.readProjectedSubagentThreadMock.mockResolvedValue({
        threadId: "child-thread-1",
        status: "active",
        activeTurnId: "child-turn-1",
        turns: [
          {
            id: "child-turn-1",
            status: "running",
            startedAt: "2026-07-29T10:00:00.000Z",
            completedAt: null,
            items: [
              {
                id: "child-user-1",
                kind: "user",
                text: "Inspect the integration tests",
              },
              {
                id: "child-assistant-1",
                kind: "assistant",
                text: "Reviewing the existing coverage.",
                phase: "commentary",
              },
            ],
          },
        ],
      });

      const { user } = await renderApp();
      await startMockRun(user, "Coordinate the implementation");

      await emitCodexNotification({
        method: "item/started",
        params: {
          threadId: "thread-1",
          turnId: "turn-1",
          item: {
            type: "collabAgentToolCall",
            id: "spawn-child-1",
            tool: "spawnAgent",
            status: "inProgress",
            senderThreadId: "thread-1",
            receiverThreadIds: ["child-thread-1"],
            prompt: "Inspect the integration tests",
            agentsStates: {
              "child-thread-1": {
                status: "running",
                message: null,
              },
            },
          },
        },
      });
      await emitCodexNotification({
        method: "turn/started",
        params: {
          threadId: "child-thread-1",
          turn: {
            id: "child-turn-1",
            status: "inProgress",
          },
        },
      });

      const subagents = await screen.findByRole("button", {
        name: /Subagents, 1 active · 0 completed/i,
      });
      await user.click(subagents);
      await user.click(
        screen.getByRole("button", {
          name: /Inspect the integration tests.*Open inspector/i,
        }),
      );

      expect(
        await screen.findByText("Reviewing the existing coverage."),
      ).toBeInTheDocument();
      expect(mocks.readProjectedSubagentThreadMock).toHaveBeenCalledWith(
        expect.objectContaining({
          accountId: 7,
          profileKey: "account:7",
          threadId: "child-thread-1",
        }),
      );

      const instruction = screen.getByRole("textbox", {
        name: "Send instruction to subagent",
      });
      await user.type(instruction, "Check the failure path{enter}");
      await waitFor(() =>
        expect(mocks.codexRpcMock).toHaveBeenCalledWith(
          7,
          "turn/steer",
          expect.objectContaining({
            threadId: "child-thread-1",
            expectedTurnId: "child-turn-1",
            input: [{ type: "text", text: "Check the failure path" }],
          }),
        ),
      );

      await emitCodexNotification({
        method: "turn/completed",
        params: {
          threadId: "child-thread-1",
          turn: {
            id: "child-turn-1",
            status: "completed",
          },
        },
      });

      await emitCodexNotification({
        method: "item/completed",
        params: {
          threadId: "child-thread-1",
          turnId: "child-turn-1",
          item: {
            type: "collabAgentToolCall",
            id: "child-reports-to-parent",
            tool: "sendInput",
            status: "completed",
            senderThreadId: "child-thread-1",
            receiverThreadIds: ["thread-1"],
            agentsStates: {
              "thread-1": {
                status: "running",
                message: null,
              },
            },
          },
        },
      });

      await waitFor(() =>
        expect(
          screen.getByRole("button", { name: /Subagents/i }),
        ).toHaveTextContent("0 active · 1 completed"),
      );
      expect(
        screen.getByRole("button", { name: /stop codex/i }),
      ).toBeInTheDocument();
      expect(mocks.upsertRunSubagentMock).toHaveBeenCalledWith(
        expect.objectContaining({
          runId: 202,
          childThreadId: "child-thread-1",
          status: "completed",
        }),
      );
      expect(mocks.upsertRunSubagentMock).not.toHaveBeenCalledWith(
        expect.objectContaining({
          childThreadId: "thread-1",
        }),
      );
    });

  it("renders exact outside-workspace permissions and grants them for one turn only", async () => {
      prepareSignedInRun();
      const { user } = await renderApp();
      await startMockRun(user, "Install the project dependencies");

      await emitCodexServerRequest({
        id: 9,
        method: "item/permissions/requestApproval",
        params: {
          threadId: "thread-1",
          turnId: "turn-1",
          itemId: "permissions-1",
          permissions: {
            fileSystem: {
              entries: [
                {
                  access: "write",
                  path: { type: "path", path: "/Users/example/.npm" },
                },
              ],
            },
          },
        },
      });

      const approval = screen
        .getByText("Codex needs approval to write outside the workspace")
        .closest("article")!;
      expect(within(approval).getByText("Write")).toBeInTheDocument();
      expect(within(approval).getByText("/Users/example/.npm")).toHaveClass(
        "approval-code-surface",
      );
      expect(
        within(approval).queryByText("Requested permission scope"),
      ).not.toBeInTheDocument();
      expect(
        within(approval).queryByRole("button", { name: /session/i }),
      ).not.toBeInTheDocument();

      await user.click(
        within(approval).getByRole("button", {
          name: "Allow for this turn",
        }),
      );
      expect(mocks.resolveCodexServerRequestMock).toHaveBeenCalledWith(
        7,
        9,
        "server-request-7-1-9",
        {
          permissions: {
            fileSystem: {
              entries: [
                {
                  access: "write",
                  path: { type: "path", path: "/Users/example/.npm" },
                },
              ],
            },
          },
          scope: "turn",
        },
      );
    });

  it("fails closed when Codex requests a broad filesystem permission", async () => {
      prepareSignedInRun();
      const { user } = await renderApp();
      await startMockRun(user, "Install the project dependencies");

      await emitCodexServerRequest({
        id: 9,
        method: "item/permissions/requestApproval",
        params: {
          threadId: "thread-1",
          turnId: "turn-1",
          permissions: {
            fileSystem: {
              entries: [
                {
                  access: "write",
                  path: {
                    type: "glob_pattern",
                    pattern: "/Users/example/**",
                  },
                },
              ],
            },
          },
        },
      });

      expect(await screen.findByRole("alert")).toHaveTextContent(
        /exact, absolute, non-root paths/i,
      );
      expect(
        screen.queryByRole("button", { name: "Allow for this turn" }),
      ).not.toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Deny access" }));
      expect(mocks.resolveCodexServerRequestMock).toHaveBeenCalledWith(
        7,
        9,
        "server-request-7-1-9",
        { permissions: {}, scope: "turn" },
      );
    });

  it("notifies for a Codex question outside the visible chat and focuses it on activation", async () => {
      prepareSignedInRun();
      mocks.readAgentNotificationPermissionStatusMock.mockResolvedValue("allowed");

      const { user } = await renderApp();
      await startMockRun(user, "Design the Snake controls");
      window.dispatchEvent(new Event("focus"));
      await user.click(screen.getByRole("button", { name: "Analytics" }));

      await emitCodexServerRequest({
        id: "question-notification-1",
        method: "item/tool/requestUserInput",
        params: {
          threadId: "thread-1",
          turnId: "turn-1",
          itemId: "question-item-1",
          autoResolutionMs: null,
          questions: [
            {
              id: "controls",
              header: "Controls",
              question: "Which controls should the game support?",
              isOther: false,
              isSecret: false,
              options: [
                {
                  label: "Keyboard",
                  description: "Support keyboard controls.",
                },
                {
                  label: "Keyboard and touch",
                  description: "Support keyboard and touch controls.",
                },
              ],
            },
          ],
        },
      });

      await waitFor(() =>
        expect(mocks.sendAgentNotificationMock).toHaveBeenCalledWith(
          expect.objectContaining({
            title: "Input required",
            body: "Design the Snake controls needs your answer before Codex can continue.",
            target: expect.objectContaining({
              kind: "user-input-required",
              workspaceId: workspace.id,
              chatId: 401,
              runId: 202,
              requestId: "question-notification-1",
            }),
          }),
        ),
      );
      await emitCodexServerRequest({
        id: "question-notification-1",
        method: "item/tool/requestUserInput",
        params: {
          threadId: "thread-1",
          turnId: "turn-1",
          itemId: "question-item-1",
          autoResolutionMs: null,
          questions: [
            {
              id: "controls",
              header: "Controls",
              question: "Which controls should the game support?",
              isOther: false,
              isSecret: false,
              options: [
                {
                  label: "Keyboard",
                  description: "Support keyboard controls.",
                },
              ],
            },
          ],
        },
      });
      expect(
        mocks.sendAgentNotificationMock.mock.calls.filter(
          ([request]) => request.target.kind === "user-input-required",
        ),
      ).toHaveLength(1);
      const notification = mocks.sendAgentNotificationMock.mock.calls.find(
        ([request]) => request.target.kind === "user-input-required",
      )?.[0];
      expect(notification).toBeDefined();

      await act(async () => {
        mocks.listeners.get("orchestrator:agent-notification-activated")?.({
          payload: notification.target,
        });
        await Promise.resolve();
      });

      const question = await screen.findByText(
        "Which controls should the game support?",
      );
      const questionCard = question.closest(
        '[data-agent-notification-target="user-input"]',
      );
      expect(questionCard).toHaveAttribute(
        "data-agent-notification-id",
        "question-notification-1",
      );
      await waitFor(() => expect(questionCard).toHaveFocus());

      await user.click(screen.getByRole("radio", { name: "Keyboard" }));
      await waitFor(() =>
        expect(mocks.removeAgentNotificationMock).toHaveBeenCalledWith(
          notification.target.eventKey,
        ),
      );
    });

  it("returns to a running chat in another workspace when its notification is activated", async () => {
      const otherWorkspace = {
        ...workspace,
        id: 2,
        path: "/repo/mobile-client",
        label: "mobile-client",
      };
      prepareSignedInRun();
      mocks.listWorkspacesMock.mockResolvedValue([workspace, otherWorkspace]);
      mocks.readAgentNotificationPermissionStatusMock.mockResolvedValue("allowed");

      const { user } = await renderApp();
      await startMockRun(user, "Wait for project input");
      const workspaceNav = screen.getByRole("navigation", { name: "Workspaces" });
      await user.click(
        within(workspaceNav).getByRole("button", { name: "mobile-client" }),
      );
      const otherWorkspaceBanner = screen.getByRole("region", {
        name: "Selected folder",
      });
      await user.click(
        within(otherWorkspaceBanner).getByRole("button", {
          name: /open chat history/i,
        }),
      );
      const drawer = await screen.findByRole("complementary", {
        name: "Workspace chat history",
      });

      await emitCodexServerRequest({
        id: "cross-workspace-question",
        method: "item/tool/requestUserInput",
        params: {
          threadId: "thread-1",
          turnId: "turn-1",
          itemId: "cross-workspace-question-item",
          autoResolutionMs: null,
          questions: [
            {
              id: "framework",
              header: "Framework",
              question: "Which framework should Codex use?",
              isOther: false,
              isSecret: false,
              options: [
                {
                  label: "React",
                  description: "Use React.",
                },
              ],
            },
          ],
        },
      });
      await waitFor(() =>
        expect(mocks.sendAgentNotificationMock).toHaveBeenCalledWith(
          expect.objectContaining({
            target: expect.objectContaining({
              kind: "user-input-required",
              workspaceId: workspace.id,
              chatId: 401,
            }),
          }),
        ),
      );
      const target = mocks.sendAgentNotificationMock.mock.calls.find(
        ([request]) => request.target.kind === "user-input-required",
      )?.[0].target;
      expect(target).toBeDefined();
      if (!target) {
        throw new Error("Expected a user-input notification target.");
      }

      await act(async () => {
        mocks.listeners.get("orchestrator:agent-notification-activated")?.({
          payload: target,
        });
        await Promise.resolve();
      });

      const banner = screen.getByRole("region", { name: "Selected folder" });
      await waitFor(() =>
        expect(within(banner).getByText("orchestrator")).toBeInTheDocument(),
      );
      await waitFor(() => expect(drawer).toHaveClass("closed"));
      const question = await screen.findByText(
        "Which framework should Codex use?",
      );
      const questionCard = question.closest(
        '[data-agent-notification-target="user-input"]',
      );
      await waitFor(() => expect(questionCard).toHaveFocus());
      expect(screen.getByRole("button", { name: /stop codex/i })).toBeInTheDocument();
    });

  it("suppresses a Codex question notification when the question is already visible", async () => {
      prepareSignedInRun();
      mocks.readAgentNotificationPermissionStatusMock.mockResolvedValue("allowed");

      const { user } = await renderApp();
      await startMockRun(user, "Choose an implementation");
      window.dispatchEvent(new Event("focus"));

      await emitCodexServerRequest({
        id: "visible-question",
        method: "item/tool/requestUserInput",
        params: {
          threadId: "thread-1",
          turnId: "turn-1",
          itemId: "visible-question-item",
          autoResolutionMs: null,
          questions: [
            {
              id: "shape",
              header: "Shape",
              question: "Which implementation should Codex use?",
              isOther: false,
              isSecret: false,
              options: [
                {
                  label: "Static",
                  description: "Use static HTML and JavaScript.",
                },
              ],
            },
          ],
        },
      });

      expect(
        await screen.findByText("Which implementation should Codex use?"),
      ).toBeInTheDocument();
      await act(async () => {
        await new Promise((resolve) => window.setTimeout(resolve, 40));
      });
      expect(
        mocks.sendAgentNotificationMock.mock.calls.some(
          ([request]) => request.target.kind === "user-input-required",
        ),
      ).toBe(false);
    });

  it("removes a question notification when Codex resolves the request", async () => {
      prepareSignedInRun();
      mocks.readAgentNotificationPermissionStatusMock.mockResolvedValue("allowed");

      const { user } = await renderApp();
      await startMockRun(user, "Collect project requirements");
      window.dispatchEvent(new Event("blur"));
      await emitCodexServerRequest({
        id: "resolved-question",
        method: "item/tool/requestUserInput",
        params: {
          threadId: "thread-1",
          turnId: "turn-1",
          itemId: "resolved-question-item",
          autoResolutionMs: null,
          questions: [
            {
              id: "scope",
              header: "Scope",
              question: "Which scope should Codex use?",
              isOther: false,
              isSecret: false,
              options: null,
            },
          ],
        },
      });

      await waitFor(() =>
        expect(mocks.sendAgentNotificationMock).toHaveBeenCalledWith(
          expect.objectContaining({
            target: expect.objectContaining({
              kind: "user-input-required",
              requestId: "resolved-question",
            }),
          }),
        ),
      );
      const eventKey = mocks.sendAgentNotificationMock.mock.calls.find(
        ([request]) => request.target.kind === "user-input-required",
      )?.[0].target.eventKey;

      await emitCodexNotification({
        method: "serverRequest/resolved",
        params: { threadId: "thread-1", requestId: "resolved-question" },
      });

      await waitFor(() =>
        expect(mocks.removeAgentNotificationMock).toHaveBeenCalledWith(eventKey),
      );
      expect(
        screen.queryByText("Which scope should Codex use?"),
      ).not.toBeInTheDocument();
    });

  it("submits a native approval at most once during rapid clicks", async () => {
      prepareSignedInRun();
      let finishSubmission!: () => void;
      mocks.resolveCodexServerRequestMock.mockReturnValueOnce(
        new Promise<void>((resolve) => {
          finishSubmission = resolve;
        }),
      );

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

      const approve = screen.getByRole("button", { name: /approve once/i });
      fireEvent.click(approve);
      fireEvent.click(approve);
      expect(mocks.resolveCodexServerRequestMock).toHaveBeenCalledTimes(1);
      expect(approve).toBeDisabled();

      await act(async () => finishSubmission());
      expect(screen.getByText(/waiting for codex to resolve/i)).toBeInTheDocument();
    });

  it("keeps a failed approval visible and retries with the exact selected decision", async () => {
      prepareSignedInRun();
      mocks.resolveCodexServerRequestMock
        .mockRejectedValueOnce(new Error("native stdin closed"))
        .mockResolvedValueOnce(undefined);

      const { user } = await renderApp();
      await startMockRun(user, "Run a guarded command");
      await emitCodexServerRequest({
        id: 9,
        method: "item/commandExecution/requestApproval",
        params: {
          threadId: "thread-1",
          turnId: "turn-1",
          command: "npm test",
          availableDecisions: ["accept", "decline", "cancel"],
        },
      });

      await user.click(screen.getByRole("button", { name: /approve once/i }));
      expect(await screen.findByRole("alert")).toHaveTextContent(
        "native stdin closed",
      );
      await user.click(screen.getByRole("button", { name: /reject/i }));

      expect(mocks.resolveCodexServerRequestMock).toHaveBeenNthCalledWith(
        2,
        7,
        9,
        "server-request-7-1-9",
        { decision: "decline" },
      );
    });

  it("passes session and command-rule choices through without translating them", async () => {
      prepareSignedInRun();
      const ruleDecision = {
        acceptWithExecpolicyAmendment: {
          execpolicy_amendment: ["npm", "test"],
        },
      };

      const { user } = await renderApp();
      await startMockRun(user, "Run guarded commands");
      await emitCodexServerRequest({
        id: 9,
        method: "item/commandExecution/requestApproval",
        params: {
          threadId: "thread-1",
          turnId: "turn-1",
          command: "npm test",
          availableDecisions: ["acceptForSession", ruleDecision, "cancel"],
        },
      });

      await user.click(
        screen.getByRole("button", { name: /approve for session/i }),
      );
      expect(mocks.resolveCodexServerRequestMock).toHaveBeenLastCalledWith(
        7,
        9,
        "server-request-7-1-9",
        { decision: "acceptForSession" },
      );
      await emitCodexNotification({
        method: "serverRequest/resolved",
        params: { threadId: "thread-1", requestId: 9 },
      });

      await emitCodexServerRequest(
        {
          id: 10,
          method: "item/commandExecution/requestApproval",
          params: {
            threadId: "thread-1",
            turnId: "turn-1",
            command: "npm test -- --run",
            availableDecisions: [ruleDecision, "cancel"],
          },
        },
        { requestToken: "server-request-7-1-10" },
      );
      await user.click(
        screen.getByRole("button", { name: /approve command rule/i }),
      );
      expect(mocks.resolveCodexServerRequestMock).toHaveBeenLastCalledWith(
        7,
        10,
        "server-request-7-1-10",
        { decision: ruleDecision },
      );
    });

  it("deduplicates approval replays and safely rejects requests from untracked runs", async () => {
      prepareSignedInRun();
      mocks.readAgentNotificationPermissionStatusMock.mockResolvedValue("allowed");
      let finishNotificationDelivery!: () => void;
      mocks.sendAgentNotificationMock.mockReturnValueOnce(
        new Promise((resolve) => {
          finishNotificationDelivery = () =>
            resolve({
              delivered: true,
              notificationId: "notification-approval-9",
              permissionStatus: "allowed",
            });
        }),
      );

      const { user } = await renderApp();
      await startMockRun(user, "Run guarded commands");
      window.dispatchEvent(new Event("blur"));
      const request = {
        id: 9,
        method: "item/commandExecution/requestApproval",
        params: {
          threadId: "thread-1",
          turnId: "turn-1",
          command: "npm test",
          availableDecisions: ["accept", "cancel"],
        },
      };
      await emitCodexServerRequest(request);
      await emitCodexServerRequest(request);
      expect(
        screen.getAllByText("Codex needs approval to run a command"),
      ).toHaveLength(1);
      expect(mocks.sendAgentNotificationMock).toHaveBeenCalledTimes(1);
      await act(async () => finishNotificationDelivery());

      await emitCodexServerRequest(
        {
          ...request,
          id: 10,
          params: { ...request.params, threadId: "thread-other" },
        },
        { requestToken: "server-request-7-1-10" },
      );
      expect(
        screen.queryByRole("button", {
          name: "Open chat awaiting approval",
        }),
      ).not.toBeInTheDocument();

      await emitCodexServerRequest(
        { ...request, id: 11 },
        { requestToken: null },
      );
      expect(screen.getByText(/without a one-shot request token/i)).toBeInTheDocument();
      expect(
        mocks.resolveCodexServerRequestMock.mock.calls.some(
          ([, requestId]) => requestId === 11,
        ),
      ).toBe(false);
    });

  it("denies an orphaned approval so a later prompt can start normally", async () => {
      prepareSignedInRun();
      const { user } = await renderApp();

      await emitCodexServerRequest(
        {
          id: 12,
          method: "item/commandExecution/requestApproval",
          params: {
            threadId: "thread-from-completed-chat",
            turnId: "turn-from-completed-chat",
            command: "npm test",
            availableDecisions: ["accept", "cancel"],
          },
        },
        { requestToken: "server-request-orphan-12" },
      );

      expect(
        screen.queryByRole("button", {
          name: "Open chat awaiting approval",
        }),
      ).not.toBeInTheDocument();
      expect(screen.queryByText("Approval needed")).not.toBeInTheDocument();
      expect(mocks.sendAgentNotificationMock).not.toHaveBeenCalled();
      await waitFor(() =>
        expect(mocks.resolveCodexServerRequestMock).toHaveBeenCalledWith(
          7,
          12,
          "server-request-orphan-12",
          { decision: "cancel" },
        ),
      );
      await emitCodexServerRequest(
        {
          id: 12,
          method: "item/commandExecution/requestApproval",
          params: {
            threadId: "thread-from-completed-chat",
            turnId: "turn-from-completed-chat",
            command: "npm test",
            availableDecisions: ["accept", "cancel"],
          },
        },
        { requestToken: "server-request-orphan-12" },
      );
      expect(mocks.resolveCodexServerRequestMock).toHaveBeenCalledTimes(1);

      await startMockRun(user, "Start after stale approval");
      expect(
        mocks.codexRpcMock.mock.calls.some(([, method]) => method === "turn/start"),
      ).toBe(true);
    });

  it("routes an approval that arrives before turn/start returns", async () => {
      prepareSignedInRun();
      let finishTurnStart!: (value: { turn: { id: string } }) => void;
      const pendingTurnStart = new Promise<{ turn: { id: string } }>(
        (resolve) => {
          finishTurnStart = resolve;
        },
      );
      mocks.codexRpcMock.mockImplementation(
        async (_accountId: number, method: string) => {
          if (method === "thread/start") {
            return { thread: { id: "thread-1" } };
          }
          if (method === "turn/start") {
            return pendingTurnStart;
          }
          return {};
        },
      );

      const { user } = await renderApp();
      await user.type(screen.getByLabelText("Prompt"), "Run guarded setup");
      await user.click(screen.getByRole("button", { name: /run codex/i }));
      await waitFor(() =>
        expect(
          mocks.codexRpcMock.mock.calls.some(
            ([, method]) => method === "turn/start",
          ),
        ).toBe(true),
      );

      await emitCodexServerRequest(
        {
          id: 15,
          method: "item/commandExecution/requestApproval",
          params: {
            threadId: "thread-1",
            turnId: "turn-delayed",
            command: "npm test",
            availableDecisions: ["accept", "cancel"],
          },
        },
        { requestToken: "server-request-before-turn-start" },
      );
      expect(
        mocks.resolveCodexServerRequestMock.mock.calls.some(
          ([, requestId]) => requestId === 15,
        ),
      ).toBe(false);

      await act(async () => {
        finishTurnStart({ turn: { id: "turn-delayed" } });
        await pendingTurnStart;
      });
      const approvalCard = await screen.findByRole("article", {
        name: "Codex needs approval to run a command",
      });
      await user.click(
        within(approvalCard).getByRole("button", {
          name: "Cancel operation",
        }),
      );
      await waitFor(() =>
        expect(mocks.resolveCodexServerRequestMock).toHaveBeenCalledWith(
          7,
          15,
          "server-request-before-turn-start",
          { decision: "cancel" },
        ),
      );
    });

  it("clears an approval when Codex resolves it without thread metadata", async () => {
      prepareSignedInRun();

      const { user } = await renderApp();
      await startMockRun(user, "Run a guarded command");
      await emitCodexServerRequest(
        {
          id: 12,
          method: "item/commandExecution/requestApproval",
          params: {
            threadId: "thread-1",
            turnId: "turn-1",
            command: "npm test",
            availableDecisions: ["accept", "cancel"],
          },
        },
        { requestToken: "server-request-7-1-12" },
      );
      expect(
        screen.getByRole("article", {
          name: "Codex needs approval to run a command",
        }),
      ).toBeInTheDocument();

      await emitCodexNotification({
        method: "serverRequest/resolved",
        params: { requestId: "12" },
      });
      await waitFor(() =>
        expect(
          screen.queryByRole("article", {
            name: "Codex needs approval to run a command",
          }),
        ).not.toBeInTheDocument(),
      );
      expect(
        screen.queryByRole("button", {
          name: "Open chat awaiting approval",
        }),
      ).not.toBeInTheDocument();
    });

  it("shows lifecycle file paths without interaction mode metadata", async () => {
      prepareSignedInRun();
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
      await user.click(screen.getByRole("button", { name: /plan mode/i }));
      await startMockRun(user, "Plan a guarded edit");
      await emitCodexNotification({
        method: "item/started",
        params: {
          item: {
            id: "file-change-1",
            type: "fileChange",
            changes: [
              { path: "/repo/orchestrator/src/App.tsx", kind: "update", diff: "" },
              { path: "/repo/orchestrator/src/App.css", kind: "update", diff: "" },
            ],
          },
        },
      });
      await emitCodexServerRequest({
        id: 9,
        method: "item/fileChange/requestApproval",
        params: {
          threadId: "thread-1",
          turnId: "turn-1",
          itemId: "file-change-1",
          reason: "The edit is outside the current write scope.",
        },
      });

      const approval = screen
        .getByText("Codex needs approval to change files")
        .closest("article")!;
      expect(within(approval).queryByText("Plan Mode")).not.toBeInTheDocument();
      for (const resource of [
        "/repo/orchestrator/src/App.tsx",
        "/repo/orchestrator/src/App.css",
      ]) {
        const resourceSurface = within(approval).getByText(resource);
        expect(resourceSurface.tagName).toBe("PRE");
        expect(resourceSurface).toHaveClass("approval-code-surface");
        expect(resourceSurface.parentElement).toHaveClass(
          "approval-resource-list",
        );
      }
      const decisionRow = approval.querySelector(".approval-decision-row")!;
      expect(decisionRow).toContainElement(
        within(approval).getByText("Affected resources").closest("dl"),
      );
      expect(decisionRow).toContainElement(
        within(approval).getByRole("group", { name: "Approval choices" }),
      );
      expect(
        within(approval).queryByText(
          "Codex is blocked until you choose one of the native options.",
        ),
      ).not.toBeInTheDocument();
      for (const label of [
        "Approve once",
        "Approve files for session",
        "Reject changes",
        "Cancel operation",
      ]) {
        const action = within(approval).getByRole("button", { name: label });
        expect(action).toHaveAttribute(
          "data-tooltip",
          expect.stringContaining(`${label}:`),
        );
        expect(action.querySelector("svg")).toBeInTheDocument();
      }
    });

  it("keeps Goal Mode on the same native approval path", async () => {
      prepareSignedInRun();

      const { user } = await renderApp();
      await user.click(screen.getByRole("button", { name: /goal mode/i }));
      await startMockRun(user, "Run a goal command");
      expect(mocks.prepareBrowserSessionMock).toHaveBeenCalledTimes(1);

      await emitCodexNotification({
        method: "turn/completed",
        params: {
          threadId: "thread-1",
          turn: {
            id: "turn-1",
            status: "completed",
            durationMs: 1_000,
          },
        },
      });
      expect(
        screen.getByRole("button", { name: /stop codex/i }),
      ).toBeInTheDocument();

      await emitCodexNotification({
        method: "turn/started",
        params: {
          threadId: "thread-1",
          turn: { id: "turn-goal-continuation" },
        },
      });
      await emitCodexServerRequest({
        id: 9,
        method: "item/commandExecution/requestApproval",
        params: {
          threadId: "thread-1",
          turnId: "turn-goal-continuation",
          command: "npm test",
          availableDecisions: ["accept", "cancel"],
        },
      });

      const approval = screen
        .getByText("Codex needs approval to run a command")
        .closest("article")!;
      expect(within(approval).queryByText("Goal Mode")).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", {
          name: "Open chat awaiting approval",
        }),
      ).not.toBeInTheDocument();
      expect(mocks.resolveCodexServerRequestMock).not.toHaveBeenCalled();

      await emitCodexNotification({
        method: "turn/completed",
        params: {
          threadId: "thread-1",
          turn: {
            id: "turn-goal-continuation",
            status: "completed",
            durationMs: 2_000,
          },
        },
      });
      expect(
        screen.getByRole("button", { name: /stop codex/i }),
      ).toBeInTheDocument();

      await emitCodexNotification({
        method: "thread/goal/updated",
        params: {
          threadId: "thread-1",
          goal: {
            threadId: "thread-1",
            objective: "Run a goal command",
            status: "complete",
            timeUsedSeconds: 3,
          },
        },
      });

      await waitFor(() =>
        expect(
          screen.getByRole("button", { name: /run codex/i }),
        ).toBeInTheDocument(),
      );
      expect(mocks.updateRunMock).toHaveBeenCalledWith(
        202,
        expect.objectContaining({ status: "completed" }),
      );
    });

  it("shows native Goal progress and pauses or resumes without ending the run", async () => {
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
                timeUsedSeconds: 3_723,
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
        method: "thread/goal/updated",
        params: {
          threadId: "thread-1",
          goal: {
            threadId: "thread-1",
            objective: "Finish the workspace migration",
            status: "active",
            timeUsedSeconds: 3_723,
          },
        },
      });
      await emitCodexNotification({
        method: "turn/plan/updated",
        params: {
          threadId: "thread-1",
          turnId: "turn-1",
          plan: [
            { step: "Inspect the repository", status: "in_progress" },
            { step: "Complete the migration", status: "pending" },
          ],
        },
      });

      const composer = screen.getByLabelText("Task composer");
      const goalProgress = within(composer).getByLabelText("Goal progress");
      const planProgress = within(composer).getByRole("status");
      expect(goalProgress).toHaveTextContent("Finish the workspace migration");
      expect(goalProgress).toHaveTextContent("1hr 2m 3s");
      expect(
        goalProgress.compareDocumentPosition(planProgress) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).not.toBe(0);

      await user.click(
        within(goalProgress).getByRole("button", { name: "Pause goal" }),
      );
      await waitFor(() =>
        expect(mocks.codexRpcMock).toHaveBeenCalledWith(
          7,
          "thread/goal/set",
          { threadId: "thread-1", status: "paused" },
        ),
      );
      expect(
        mocks.codexRpcMock.mock.calls.filter(
          ([, method]) => method === "turn/interrupt",
        ),
      ).toHaveLength(0);
      expect(
        within(composer).getByRole("button", { name: "Resume goal" }),
      ).toBeInTheDocument();

      await emitCodexNotification({
        method: "turn/interrupted",
        params: {
          threadId: "thread-1",
          turn: {
            id: "turn-1",
          },
        },
      });
      expect(screen.getByRole("button", { name: /stop codex/i })).toBeInTheDocument();
      expect(within(composer).getByLabelText("Goal progress")).toHaveTextContent(
        "Paused",
      );

      await user.click(
        within(composer).getByRole("button", { name: "Resume goal" }),
      );
      await waitFor(() =>
        expect(mocks.codexRpcMock).toHaveBeenCalledWith(
          7,
          "thread/goal/set",
          { threadId: "thread-1", status: "active" },
        ),
      );
      expect(
        within(composer).getByRole("button", { name: "Pause goal" }),
      ).toBeInTheDocument();

      await emitCodexNotification({
        method: "thread/goal/updated",
        params: {
          threadId: "thread-1",
          goal: {
            threadId: "thread-1",
            objective: "Finish the workspace migration",
            status: "complete",
            timeUsedSeconds: 3_725,
          },
        },
      });
      await waitFor(() =>
        expect(
          screen.getByRole("button", { name: /run codex/i }),
        ).toBeInTheDocument(),
      );
      expect(
        within(composer).queryByLabelText("Goal progress"),
      ).not.toBeInTheDocument();
    });

  it("stops a Goal with Codex's current active turn when the cached turn is stale", async () => {
      prepareSignedInRun();
      const activeTurnId = "019f9fc5-25dd-76a1-b223-b439ce5af283";
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
          if (method === "turn/interrupt" && params.turnId === "turn-1") {
            throw new Error(
              JSON.stringify({
                code: -32600,
                message: `expected active turn id ${activeTurnId}, got turn-1`,
              }),
            );
          }
          return {};
        },
      );

      const { user } = await renderApp();
      const goalMode = screen.getByRole("button", { name: "Goal mode" });
      await user.click(goalMode);
      await startMockRun(user, "Finish the workspace migration");

      await user.click(screen.getByRole("button", { name: "Stop goal" }));

      await waitFor(() =>
        expect(mocks.codexRpcMock).toHaveBeenCalledWith(
          7,
          "thread/goal/clear",
          { threadId: "thread-1" },
        ),
      );
      await waitFor(() =>
        expect(screen.getByText("Queued")).toBeInTheDocument(),
      );
      expect(screen.queryByText("Queue paused")).not.toBeInTheDocument();
      expect(mocks.codexRpcMock).toHaveBeenCalledWith(
        7,
        "turn/interrupt",
        { threadId: "thread-1", turnId: "turn-1" },
      );
      expect(mocks.codexRpcMock).toHaveBeenCalledWith(
        7,
        "turn/interrupt",
        { threadId: "thread-1", turnId: activeTurnId },
      );
      expect(screen.queryByLabelText("Goal progress")).not.toBeInTheDocument();
      expect(goalMode).toHaveAttribute("aria-pressed", "false");
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

  it("stops a Goal and moves its objective into the focused composer for editing", async () => {
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
      await user.click(screen.getByRole("button", { name: "Goal mode" }));
      await startMockRun(user, "Finish the workspace migration");
      await user.click(screen.getByRole("button", { name: "Edit goal" }));

      const prompt = screen.getByLabelText("Prompt");
      await waitFor(() =>
        expect(prompt).toHaveValue("Finish the workspace migration"),
      );
      await waitFor(() => expect(prompt).toHaveFocus());
      expect((prompt as HTMLTextAreaElement).selectionStart).toBe(0);
      expect((prompt as HTMLTextAreaElement).selectionEnd).toBe(
        "Finish the workspace migration".length,
      );
      expect(screen.getByRole("button", { name: "Goal mode" })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      expect(screen.queryByLabelText("Goal progress")).not.toBeInTheDocument();
    });

  it("confirms before replacing an unsent draft while editing a Goal", async () => {
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
      await user.click(screen.getByRole("button", { name: "Goal mode" }));
      await startMockRun(user, "Finish the workspace migration");
      const prompt = screen.getByLabelText("Prompt");
      await user.type(prompt, "Keep this draft");
      await user.click(screen.getByRole("button", { name: "Edit goal" }));

      const dialog = screen.getByRole("dialog", {
        name: "Replace draft and edit goal?",
      });
      expect(prompt).toHaveValue("Keep this draft");
      expect(screen.getByLabelText("Goal progress")).toBeInTheDocument();
      const keepGoal = within(dialog).getByRole("button", {
        name: "Keep current goal",
      });
      const stopAndEdit = within(dialog).getByRole("button", {
        name: "Stop and edit goal",
      });
      expect(keepGoal).toHaveAttribute("data-tooltip", "Keep current goal");
      expect(stopAndEdit).toHaveAttribute("data-tooltip", "Stop and edit goal");
      expect(keepGoal).not.toHaveAttribute("title");
      expect(stopAndEdit).not.toHaveAttribute("title");
      expect(mocks.codexRpcMock).not.toHaveBeenCalledWith(
        7,
        "thread/goal/clear",
        expect.anything(),
      );

      await user.click(keepGoal);
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(prompt).toHaveValue("Keep this draft");
      expect(screen.getByLabelText("Goal progress")).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Edit goal" }));
      await user.click(
        within(
          screen.getByRole("dialog", {
            name: "Replace draft and edit goal?",
          }),
        ).getByRole("button", { name: "Stop and edit goal" }),
      );
      await waitFor(() =>
        expect(prompt).toHaveValue("Finish the workspace migration"),
      );
    });

  it("keeps a Goal and composer draft unchanged when Goal clearing fails", async () => {
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
          if (method === "thread/goal/clear") {
            throw new Error("Goal service unavailable");
          }
          return {};
        },
      );

      const { user } = await renderApp();
      await user.click(screen.getByRole("button", { name: "Goal mode" }));
      await startMockRun(user, "Finish the workspace migration");
      await user.click(screen.getByRole("button", { name: "Edit goal" }));

      await screen.findByText(
        "Could not prepare the goal for editing: Goal service unavailable",
      );
      expect(screen.getByLabelText("Prompt")).toHaveValue("");
      expect(screen.getByLabelText("Goal progress")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Edit goal" })).toBeEnabled();
      expect(screen.getByRole("button", { name: "Goal mode" })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      expect(mocks.codexRpcMock).not.toHaveBeenCalledWith(
        7,
        "turn/interrupt",
        expect.anything(),
      );
    });
});
