import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, beforeEach, expect, it, vi } from "vitest";
import {
  WorkspaceRunFixture,
  getMocks,
  workspace,
  signedInAccount,
  signedInAccount2,
  defaultCodexModel,
  preflight,
  workspaceRunFixture,
  workspaceChatFixture,
  workspaceChatWithRunsFixture,
  prepareDefaults,
  renderApp,
  createContextFileDataTransfer,
  mockElementRect,
  composerInputZone,
  emitNativeContextFileDrop,
  startPointerDragFileIntoTaskSurface,
  finishPointerDragFileIntoTaskSurface,
  pointerDragFileIntoTaskSurface,
  prepareSignedInRun,
  startMockRun,
  emitCodexNotification,
  setWindowWidth,
} from "./test/appRuntimeHarness";

const mocks = getMocks();

describe("Application runtime scenarios 4", () => {
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

  it("confirms captured Plan settings and applies changes only to implementation", async () => {
      prepareSignedInRun();
      mocks.listCodexAccountsMock.mockResolvedValue([
        signedInAccount,
        signedInAccount2,
      ]);
      mocks.readCodexAccountMock.mockImplementation(async (accountId: number) => ({
        account: {
          type: "chatgpt",
          email:
            accountId === signedInAccount2.id
              ? signedInAccount2.email
              : signedInAccount.email,
          planType:
            accountId === signedInAccount2.id
              ? signedInAccount2.plan_type
              : signedInAccount.plan_type,
        },
        requiresOpenaiAuth: true,
      }));
      const equivalentTargetModel = {
        ...defaultCodexModel,
        id: "target-gpt-5.5",
        displayName: "GPT-5.5 Target",
        isDefault: true,
      };
      const implementationModel = {
        ...defaultCodexModel,
        id: "o4-implementation",
        model: "o4-implementation",
        displayName: "O4 Implementation",
        supportedReasoningEfforts: [
          { reasoningEffort: "low", description: "Faster reasoning" },
          { reasoningEffort: "high", description: "Deeper reasoning" },
        ],
        defaultReasoningEffort: "high",
        isDefault: false,
      };
      mocks.listCodexModelsMock.mockImplementation(async (accountId: number) =>
        accountId === signedInAccount2.id
          ? [equivalentTargetModel, implementationModel]
          : [defaultCodexModel],
      );
      const planChat = workspaceChatFixture({
        id: 430,
        title: "Implement configurable plan",
        codex_thread_id: "thread-plan-account-7",
      });
      const planRun = workspaceRunFixture({
        id: 330,
        chat_id: planChat.id,
        codex_thread_id: "thread-plan-account-7",
        collaboration_mode: "plan",
        run_intent: "plan",
        original_prompt: "Plan the configurable implementation",
        final_message: "",
        completed_plan_item_id: "plan-settings-item",
        completed_plan_text: "# Plan\n\nImplement the selected approach.",
        plan_review_state: "available",
        execution_settings_json: JSON.stringify({
          version: 1,
          accountId: signedInAccount.id,
          profileKey: "account:7",
          selectedBranch: "main",
          mode: "plan",
          intent: "plan",
          accessMode: "ask-for-approval",
          computerUseEnabled: true,
          model: defaultCodexModel.model,
          reasoningEffort: "medium",
          useOss: false,
          ossProvider: "ollama",
          contextFiles: [],
          selectedSkills: [],
          goalMode: false,
        }),
      });
      mocks.listWorkspaceChatsMock.mockResolvedValue([planChat]);
      mocks.getChatWithRunsMock.mockResolvedValue(
        workspaceChatWithRunsFixture(planChat, [planRun]),
      );
      mocks.codexRpcMock.mockImplementation(
        async (accountId: number, method: string) => {
          if (method === "collaborationMode/list") {
            return {
              data: [
                {
                  name: "Plan",
                  mode: "plan",
                  model: null,
                  reasoning_effort: "medium",
                },
                {
                  name: "Default",
                  mode: "default",
                  model: null,
                  reasoning_effort: null,
                },
              ],
            };
          }
          if (method === "thread/start") {
            expect(accountId).toBe(signedInAccount2.id);
            return { thread: { id: "thread-plan-account-8" } };
          }
          if (method === "turn/start") {
            expect(accountId).toBe(signedInAccount2.id);
            return { turn: { id: "turn-plan-account-8" } };
          }
          return {};
        },
      );

      const { user } = await renderApp();
      const banner = screen.getByRole("region", { name: "Selected folder" });
      await user.click(
        within(banner).getByRole("button", { name: /open chat history/i }),
      );
      const drawer = await screen.findByRole("complementary", {
        name: "Workspace chat history",
      });
      await user.click(
        within(drawer).getByRole("button", {
          name: /implement configurable plan/i,
        }),
      );

      await user.click(screen.getByRole("combobox", { name: "Run account" }));
      await user.click(
        screen.getByRole("option", { name: "personal@example.com" }),
      );
      const handoffDialog = await screen.findByRole("dialog", {
        name: "Switch account for this chat?",
      });
      await user.click(
        within(handoffDialog).getByRole("button", { name: "Switch account" }),
      );
      await waitFor(() =>
        expect(
          screen.getByRole("combobox", { name: "Run account" }),
        ).toHaveTextContent("personal@example.com"),
      );

      await user.click(
        await screen.findByRole("button", { name: "Implement plan" }),
      );
      const dialog = await screen.findByRole("dialog", {
        name: "Confirm implementation settings",
      });
      expect(
        within(dialog).getByRole("combobox", {
          name: "Implementation account",
        }),
      ).toHaveTextContent("dev@example.com");
      expect(
        within(dialog).getByRole("combobox", {
          name: "Implementation model",
        }),
      ).toHaveTextContent("GPT-5.5");
      expect(
        within(dialog).getByRole("combobox", {
          name: "Implementation reasoning",
        }),
      ).toHaveTextContent("Medium");

      await user.click(
        within(dialog).getByRole("combobox", {
          name: "Implementation account",
        }),
      );
      await user.click(
        screen.getByRole("option", { name: "personal@example.com" }),
      );
      await waitFor(() =>
        expect(
          within(dialog).getByRole("combobox", {
            name: "Implementation model",
          }),
        ).toHaveTextContent("GPT-5.5 Target"),
      );
      expect(mocks.readCodexAccountMock).toHaveBeenCalledWith(
        signedInAccount2.id,
        { refreshToken: true },
      );

      await user.click(
        within(dialog).getByRole("combobox", {
          name: "Implementation model",
        }),
      );
      await user.click(
        screen.getByRole("option", { name: "O4 Implementation" }),
      );
      expect(
        within(dialog).getByRole("combobox", {
          name: "Implementation reasoning",
        }),
      ).toHaveTextContent("High");
      await user.click(
        within(dialog).getByRole("combobox", {
          name: "Implementation reasoning",
        }),
      );
      await user.click(screen.getByRole("option", { name: "Low" }));
      await user.click(
        within(dialog).getByRole("button", { name: "Implement plan" }),
      );

      await waitFor(() =>
        expect(mocks.codexRpcMock).toHaveBeenCalledWith(
          signedInAccount2.id,
          "turn/start",
          expect.objectContaining({
            threadId: "thread-plan-account-8",
            model: "o4-implementation",
            effort: "low",
          }),
        ),
      );
      expect(mocks.activateChatAccountHandoffMock).toHaveBeenCalledWith({
        chatId: planChat.id,
        expectedProfileKey: "account:7",
        expectedThreadId: "thread-plan-account-7",
        accountId: signedInAccount2.id,
        profileKey: "account:8",
        codexThreadId: "thread-plan-account-8",
        status: "running",
      });
      expect(screen.getByRole("combobox", { name: "Agent" })).toHaveTextContent(
        "GPT-5.5",
      );
      expect(
        screen.getByRole("combobox", { name: "Reasoning" }),
      ).toHaveTextContent("Medium");
      expect(mocks.createRunMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          accountId: signedInAccount2.id,
          model: "o4-implementation",
          executionSettingsJson: expect.stringContaining(
            '"reasoningEffort":"low"',
          ),
        }),
      );
    });

  it("cancels Plan implementation settings while models load and ignores stale results", async () => {
      prepareSignedInRun();
      let resolveImplementationModels!: (models: typeof defaultCodexModel[]) => void;
      mocks.listCodexModelsMock
        .mockResolvedValueOnce([defaultCodexModel])
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              resolveImplementationModels = resolve;
            }),
        );
      const planChat = workspaceChatFixture({
        id: 431,
        title: "Cancel implementation settings",
        codex_thread_id: "thread-plan-cancel",
      });
      const planRun = workspaceRunFixture({
        id: 331,
        chat_id: planChat.id,
        codex_thread_id: "thread-plan-cancel",
        collaboration_mode: "plan",
        run_intent: "plan",
        original_prompt: "Plan a cancellable implementation",
        final_message: "",
        completed_plan_item_id: "plan-cancel-item",
        completed_plan_text: "# Plan\n\nKeep the review state available.",
        plan_review_state: "available",
      });
      mocks.listWorkspaceChatsMock.mockResolvedValue([planChat]);
      mocks.getChatWithRunsMock.mockResolvedValue(
        workspaceChatWithRunsFixture(planChat, [planRun]),
      );

      const { user } = await renderApp();
      const banner = screen.getByRole("region", { name: "Selected folder" });
      await user.click(
        within(banner).getByRole("button", { name: /open chat history/i }),
      );
      const drawer = await screen.findByRole("complementary", {
        name: "Workspace chat history",
      });
      await user.click(
        within(drawer).getByRole("button", {
          name: /cancel implementation settings/i,
        }),
      );

      const implement = await screen.findByRole("button", {
        name: "Implement plan",
      });
      await user.click(implement);
      const dialog = await screen.findByRole("dialog", {
        name: "Confirm implementation settings",
      });
      const cancel = within(dialog).getByRole("button", {
        name: "Cancel implementation",
      });
      expect(cancel).toBeEnabled();
      await waitFor(() => expect(cancel).toHaveFocus());
      await user.tab();
      expect(cancel).toHaveFocus();
      await user.click(cancel);
      expect(
        screen.queryByRole("dialog", {
          name: "Confirm implementation settings",
        }),
      ).not.toBeInTheDocument();

      await act(async () => {
        resolveImplementationModels([defaultCodexModel]);
        await Promise.resolve();
      });
      expect(
        screen.queryByRole("dialog", {
          name: "Confirm implementation settings",
        }),
      ).not.toBeInTheDocument();
      await waitFor(() => expect(implement).toHaveFocus());
      expect(mocks.codexRpcMock).not.toHaveBeenCalledWith(
        7,
        "turn/start",
        expect.any(Object),
      );
    });

  it("promotes and persists a proposed-plan final answer as a native Plan", async () => {
      prepareSignedInRun();
      mocks.readAgentNotificationPermissionStatusMock.mockResolvedValue("allowed");
      const markdown = [
        "# Add greeting text",
        "",
        "## Key Changes",
        "- Update `hello-world.txt`.",
        "",
        "```text",
        "Hello hello hello",
        "```",
      ].join("\n");
      const { user } = await renderApp();
      await startMockRun(user, "Make a plan for the greeting");
      window.dispatchEvent(new Event("blur"));

      await emitCodexNotification({
        method: "item/completed",
        params: {
          threadId: "thread-1",
          turnId: "turn-1",
          item: {
            type: "agentMessage",
            id: "proposed-plan-message",
            phase: "final_answer",
            text: `<proposed_plan>\n${markdown}\n</proposed_plan>`,
          },
        },
      });
      await emitCodexNotification({
        method: "turn/completed",
        params: {
          threadId: "thread-1",
          turnId: "turn-1",
          turn: { id: "turn-1", status: "completed", durationMs: 100 },
        },
      });

      const plan = await screen.findByLabelText("Codex plan");
      expect(
        within(plan).getByRole("heading", { name: "Add greeting text" }),
      ).toBeInTheDocument();
      expect(within(plan).getByText("Hello hello hello")).toBeInTheDocument();
      expect(
        within(plan).getByRole("button", { name: "Implement plan" }),
      ).toBeInTheDocument();
      expect(screen.queryByText(/<proposed_plan>/)).not.toBeInTheDocument();
      expect(screen.queryByLabelText("Run summary")).not.toBeInTheDocument();
      await waitFor(() =>
        expect(mocks.updateRunMock).toHaveBeenCalledWith(
          202,
          expect.objectContaining({
            finalMessage: "",
            collaborationMode: "plan",
            runIntent: "plan",
            completedPlanItemId: "proposed-plan-message",
            completedPlanText: markdown,
            planReviewState: "available",
          }),
        ),
      );
      await waitFor(() =>
        expect(mocks.sendAgentNotificationMock).toHaveBeenCalledWith(
          expect.objectContaining({
            title: "Plan ready",
            body: "Make a plan for the greeting has a plan ready to review.",
            target: expect.objectContaining({
              kind: "plan-ready",
              planItemId: "proposed-plan-message",
              runId: 202,
            }),
          }),
        ),
      );
      expect(
        mocks.sendAgentNotificationMock.mock.calls.some(
          ([request]) => request.title === "Response complete",
        ),
      ).toBe(false);
    });

  it("fails and pauses a queued Plan when native Plan presets are unavailable", async () => {
      prepareSignedInRun();
      mocks.codexRpcMock.mockImplementation(
        async (_accountId: number, method: string) => {
          if (method === "collaborationMode/list") {
            return { data: [{ name: "Default", mode: "default" }] };
          }
          return {};
        },
      );

      const { user } = await renderApp();
      await user.click(screen.getByRole("button", { name: /plan mode/i }));
      await user.type(screen.getByLabelText("Prompt"), "Plan unsupported work");
      await user.click(screen.getByRole("button", { name: /run codex/i }));

      await waitFor(() =>
        expect(mocks.failPromptQueueItemMock).toHaveBeenCalledWith(
          expect.any(String),
          expect.stringMatching(/Plan/i),
        ),
      );
      expect(screen.getByLabelText("Prompt")).toHaveValue("");
      expect(screen.queryByText("Queue paused")).not.toBeInTheDocument();
      expect(screen.getByText("Queued")).toBeInTheDocument();
      expect(mocks.createChatMock).toHaveBeenCalledTimes(1);
      expect(
        mocks.codexRpcMock.mock.calls.some((call) => call[1] === "turn/start"),
      ).toBe(false);
    });

  it("reconstructs and reconciles a persisted completed Plan when history reopens", async () => {
      prepareSignedInRun();
      const defaultMode = {
        mode: "default",
        settings: {
          model: "gpt-5.5",
          reasoning_effort: "high",
          developer_instructions: null,
        },
      };
      const chat = {
        ...workspaceChatFixture({ title: "Persisted native plan" }),
        collaboration_mode: "plan",
        saved_default_collaboration_mode_json: JSON.stringify(defaultMode),
      };
      const run = {
        ...workspaceRunFixture({
          chat_id: chat.id,
          original_prompt: "Plan persisted work",
          final_message: null,
        }),
        collaboration_mode: "plan",
        run_intent: "plan",
        client_user_message_id: "client-message-1",
        completed_plan_item_id: "plan-item-1",
        completed_plan_text: "# Persisted plan\n\n1. Reconcile it",
        plan_review_state: "available",
      } satisfies WorkspaceRunFixture;
      mocks.listWorkspaceChatsMock.mockResolvedValue([chat]);
      mocks.getChatWithRunsMock.mockResolvedValue(
        workspaceChatWithRunsFixture(chat, [run]),
      );
      mocks.listLocalChatTranscriptMock.mockResolvedValue([run]);
      mocks.codexRpcMock.mockImplementation(
        async (_accountId: number, method: string) => {
          if (method === "collaborationMode/list") {
            return {
              data: [
                { name: "Plan", mode: "plan", reasoning_effort: "medium" },
                { name: "Default", mode: "default" },
              ],
            };
          }
          if (method === "thread/read") {
            return {
              thread: {
                id: "thread-1",
                turns: [
                  {
                    id: "turn-1",
                    status: "completed",
                    items: [
                      {
                        type: "plan",
                        id: "plan-item-1",
                        text: "# Persisted plan\n\n1. Reconcile it",
                      },
                    ],
                  },
                ],
              },
            };
          }
          return {};
        },
      );

      const { user } = await renderApp();
      const banner = screen.getByRole("region", { name: "Selected folder" });
      await user.click(
        within(banner).getByRole("button", { name: /open chat history/i }),
      );
      const drawer = await screen.findByRole("complementary", {
        name: "Workspace chat history",
      });
      await user.click(
        within(drawer).getByRole("button", { name: /persisted native plan/i }),
      );

      expect(
        await screen.findByRole("button", { name: "Implement plan" }),
      ).toBeInTheDocument();
      await waitFor(() =>
        expect(mocks.codexRpcMock).toHaveBeenCalledWith(
          7,
          "thread/read",
          { threadId: "thread-1", includeTurns: true },
        ),
      );
      expect(mocks.codexRpcMock).not.toHaveBeenCalledWith(
        7,
        "thread/resume",
        expect.anything(),
      );

      const newChatButton = within(banner).getByRole("button", {
        name: /new chat/i,
      });
      expect(newChatButton).toBeEnabled();
      await user.click(newChatButton);

      expect(screen.queryByLabelText("Task chat transcript")).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Implement plan" }),
      ).not.toBeInTheDocument();
    });

  it("reconstructs a legacy proposed-plan envelope as a native Plan", async () => {
      prepareSignedInRun();
      const markdown = [
        "# Add `Hello hello hello` To `hello-world.txt`",
        "",
        "## Summary",
        "Add the requested line without unrelated changes.",
        "",
        "## Test Plan",
        "- Run `git status --short`.",
      ].join("\n");
      const chat = workspaceChatFixture({
        id: 436,
        title: "Make a plan for adding the greeting",
      });
      const run = {
        ...workspaceRunFixture({
          id: 336,
          chat_id: chat.id,
          original_prompt: "Make a plan for adding the greeting",
          final_message: `<proposed_plan>\n${markdown}\n</proposed_plan>`,
        }),
        collaboration_mode: "default",
        run_intent: "normal",
        client_user_message_id: "legacy-proposed-plan-message",
        completed_plan_item_id: null,
        completed_plan_text: null,
        plan_review_state: "none",
      } satisfies WorkspaceRunFixture;
      mocks.listWorkspaceChatsMock.mockResolvedValue([chat]);
      mocks.getChatWithRunsMock.mockResolvedValue(
        workspaceChatWithRunsFixture(chat, [run]),
      );
      mocks.listLocalChatTranscriptMock.mockResolvedValue([run]);

      const { user } = await renderApp();
      const banner = screen.getByRole("region", { name: "Selected folder" });
      await user.click(
        within(banner).getByRole("button", { name: /open chat history/i }),
      );
      const drawer = await screen.findByRole("complementary", {
        name: "Workspace chat history",
      });
      await user.click(
        within(drawer).getByRole("button", {
          name: /make a plan for adding the greeting/i,
        }),
      );

      const plan = await screen.findByLabelText("Codex plan");
      expect(
        within(plan).getByRole("heading", {
          name: "Add Hello hello hello To hello-world.txt",
        }),
      ).toBeInTheDocument();
      expect(within(plan).getByText("Summary")).toBeInTheDocument();
      expect(
        within(plan).getByRole("button", { name: "Implement plan" }),
      ).toBeInTheDocument();
      expect(screen.queryByText(/<proposed_plan>/)).not.toBeInTheDocument();
      expect(screen.queryByLabelText("Run summary")).not.toBeInTheDocument();
    });

  it("auto-refreshes git status when files change outside Orchestrator", async () => {
      const readmeEntry = {
        name: "README.md",
        path: "/repo/orchestrator/README.md",
        relativePath: "README.md",
        kind: "file" as const,
      };
      const externalFilePath = "/repo/orchestrator/external.md";
      const cleanStatus = {
        workspacePath: workspace.path,
        gitRoot: workspace.path,
        files: [],
      };
      const modifiedStatus = {
        workspacePath: workspace.path,
        gitRoot: workspace.path,
        additions: 1,
        deletions: 0,
        files: [
          {
            path: readmeEntry.path,
            relativePath: readmeEntry.relativePath,
            oldRelativePath: null,
            indexStatus: " ",
            worktreeStatus: "M",
            statusKind: "modified",
            badge: "M",
          },
          {
            path: externalFilePath,
            relativePath: "external.md",
            oldRelativePath: null,
            indexStatus: "?",
            worktreeStatus: "?",
            statusKind: "untracked",
            badge: "U",
          },
        ],
      };

      mocks.listWorkspaceDirectoryMock.mockResolvedValue([readmeEntry]);
      mocks.listWorkspaceGitStatusMock
        .mockResolvedValueOnce(cleanStatus)
        .mockResolvedValueOnce(modifiedStatus)
        .mockResolvedValue(modifiedStatus);

      const { user } = await renderApp();
      const workspaceNav = screen.getByRole("navigation", {
        name: "Workspaces",
      });

      await user.click(
        within(workspaceNav).getByRole("button", { name: "Expand orchestrator" }),
      );

      expect(await within(workspaceNav).findByTitle("README.md")).toBeInTheDocument();
      expect(within(workspaceNav).queryByLabelText("modified file")).not.toBeInTheDocument();
      expect(within(workspaceNav).queryByTitle("external.md")).not.toBeInTheDocument();
      const banner = screen.getByRole("region", { name: "Selected folder" });
      expect(await within(banner).findByText("Clean")).toBeInTheDocument();

      await waitFor(
        () => {
          expect(mocks.listWorkspaceGitStatusMock.mock.calls.length).toBeGreaterThanOrEqual(
            2,
          );
          expect(
            within(workspaceNav).getByLabelText("modified file"),
          ).toHaveTextContent("M");
        },
        { timeout: 4500 },
      );
      expect(within(workspaceNav).getByTitle("external.md")).toBeInTheDocument();
      expect(within(workspaceNav).getByLabelText("untracked file")).toHaveTextContent("U");
      const changeSummary = within(banner).getByLabelText(
        "2 changed (1 modified, 1 untracked); 1 addition, 0 deletions",
      );
      expect(changeSummary).toHaveClass("git-summary");
      expect(within(changeSummary).getByText("+1")).toBeInTheDocument();
      expect(within(changeSummary).getByText("-0")).toBeInTheDocument();
    });

  it("refreshes expanded directories when files are deleted outside Orchestrator", async () => {
      const helloEntry = {
        name: "hello.txt",
        path: "/repo/orchestrator/hello.txt",
        relativePath: "hello.txt",
        kind: "file" as const,
      };
      let directoryRequestCount = 0;

      mocks.listWorkspaceDirectoryMock.mockImplementation(async () => {
        directoryRequestCount += 1;
        return directoryRequestCount === 1 ? [helloEntry] : [];
      });
      mocks.listWorkspaceGitStatusMock.mockResolvedValue({
        workspacePath: workspace.path,
        gitRoot: workspace.path,
        files: [],
      });

      const { user } = await renderApp();
      const workspaceNav = screen.getByRole("navigation", {
        name: "Workspaces",
      });

      await user.click(
        within(workspaceNav).getByRole("button", { name: "Expand orchestrator" }),
      );
      expect(await within(workspaceNav).findByTitle("hello.txt")).toBeInTheDocument();

      await waitFor(
        () =>
          expect(mocks.listWorkspaceDirectoryMock.mock.calls.length).toBeGreaterThanOrEqual(
            2,
          ),
        { timeout: 4500 },
      );
      await waitFor(() =>
        expect(within(workspaceNav).queryByTitle("hello.txt")).not.toBeInTheDocument(),
      );
    });

  it("marks changed files and parent folders in the workspace explorer", async () => {
      mocks.listWorkspaceDirectoryMock.mockResolvedValue([
        {
          name: "src",
          path: "/repo/orchestrator/src",
          relativePath: "src",
          kind: "directory",
        },
        {
          name: "README.md",
          path: "/repo/orchestrator/README.md",
          relativePath: "README.md",
          kind: "file",
        },
      ]);
      mocks.listWorkspaceGitStatusMock.mockResolvedValue({
        workspacePath: workspace.path,
        gitRoot: workspace.path,
        files: [
          {
            path: "/repo/orchestrator/README.md",
            relativePath: "README.md",
            oldRelativePath: null,
            indexStatus: " ",
            worktreeStatus: "M",
            statusKind: "modified",
            badge: "M",
          },
          {
            path: "/repo/orchestrator/src/App.tsx",
            relativePath: "src/App.tsx",
            oldRelativePath: null,
            indexStatus: " ",
            worktreeStatus: "M",
            statusKind: "modified",
            badge: "M",
          },
        ],
      });

      const { user } = await renderApp();
      const workspaceNav = screen.getByRole("navigation", {
        name: "Workspaces",
      });

      await user.click(
        within(workspaceNav).getByRole("button", { name: "Expand orchestrator" }),
      );

      expect(await within(workspaceNav).findByTitle("README.md")).toBeInTheDocument();
      expect(within(workspaceNav).getAllByLabelText("modified file")).toHaveLength(1);
      expect(within(workspaceNav).getAllByLabelText("Contains changes")).toHaveLength(2);
    });

  it("hides files deleted outside Orchestrator from the workspace explorer", async () => {
      mocks.listWorkspaceDirectoryMock.mockImplementation(
        async (_workspacePath: string, directoryPath: string) => {
          if (directoryPath === workspace.path) {
            return [
              {
                name: "src",
                path: "/repo/orchestrator/src",
                relativePath: "src",
                kind: "directory",
              },
            ];
          }

          if (directoryPath === "/repo/orchestrator/src") {
            return [
              {
                name: "old.ts",
                path: "/repo/orchestrator/src/old.ts",
                relativePath: "src/old.ts",
                kind: "file",
              },
            ];
          }

          return [];
        },
      );
      mocks.listWorkspaceGitStatusMock.mockResolvedValue({
        workspacePath: workspace.path,
        gitRoot: workspace.path,
        files: [
          {
            path: "/repo/orchestrator/src/old.ts",
            relativePath: "src/old.ts",
            oldRelativePath: null,
            indexStatus: " ",
            worktreeStatus: "D",
            statusKind: "deleted",
            badge: "D",
          },
        ],
      });
      const { user } = await renderApp();
      const workspaceNav = screen.getByRole("navigation", {
        name: "Workspaces",
      });

      await user.click(
        within(workspaceNav).getByRole("button", { name: "Expand orchestrator" }),
      );
      await user.click(await within(workspaceNav).findByRole("button", { name: "Expand src" }));
      expect(within(workspaceNav).queryByTitle("src/old.ts")).not.toBeInTheDocument();
      expect(mocks.readWorkspaceGitDiffMock).not.toHaveBeenCalled();
      expect(mocks.readWorkspaceFilePreviewMock).not.toHaveBeenCalledWith(
        workspace.path,
        "/repo/orchestrator/src/old.ts",
      );
    });

  it("opens changed files in preview mode and loads diff from the drawer toggle", async () => {
      const readmeEntry = {
        name: "README.md",
        path: "/repo/orchestrator/README.md",
        relativePath: "README.md",
        kind: "file" as const,
      };
      mocks.listWorkspaceDirectoryMock.mockResolvedValue([readmeEntry]);
      mocks.listWorkspaceGitStatusMock.mockResolvedValue({
        workspacePath: workspace.path,
        gitRoot: workspace.path,
        files: [
          {
            path: readmeEntry.path,
            relativePath: readmeEntry.relativePath,
            oldRelativePath: null,
            indexStatus: " ",
            worktreeStatus: "M",
            statusKind: "modified",
            badge: "M",
          },
        ],
      });
      mocks.readWorkspaceFilePreviewMock.mockResolvedValue({
        path: readmeEntry.path,
        relativePath: readmeEntry.relativePath,
        content: "# Orchestrator",
        truncated: false,
        isBinary: false,
      });
      mocks.readWorkspaceGitDiffMock.mockResolvedValue({
        path: readmeEntry.path,
        relativePath: readmeEntry.relativePath,
        sections: [
          {
            kind: "unstaged",
            title: "Working tree changes",
            baseLabel: "Index:README.md",
            headLabel: "Working tree:README.md",
            baseContent: "A\nOld\nZ\n",
            headContent: "A\nNew\nZ\n",
            baseTruncated: false,
            headTruncated: false,
            content:
              "diff --git a/README.md b/README.md\n@@ -1,3 +1,3 @@\n A\n-Old\n+New\n Z\n",
            isBinary: false,
          },
        ],
      });

      const { user } = await renderApp();
      const workspaceNav = screen.getByRole("navigation", {
        name: "Workspaces",
      });

      await user.click(
        within(workspaceNav).getByRole("button", { name: "Expand orchestrator" }),
      );
      await user.click(await within(workspaceNav).findByTitle("README.md"));

      expect(await screen.findByText("# Orchestrator")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Preview" })).toHaveClass("active");

      await user.click(screen.getByRole("button", { name: "Diff" }));

      await waitFor(() =>
        expect(mocks.readWorkspaceGitDiffMock).toHaveBeenCalledWith(
          workspace.path,
          readmeEntry.path,
          workspace.path,
        ),
      );
      expect(screen.getByRole("button", { name: "Diff" })).toHaveClass("active");
      const previewDrawer = screen.getByRole("complementary", { name: "File preview" });
      expect(previewDrawer).toHaveTextContent("A");
      expect(previewDrawer).toHaveTextContent("Old");
      expect(previewDrawer).toHaveTextContent("New");
      expect(previewDrawer).toHaveTextContent("Z");

      await user.click(screen.getByRole("button", { name: "Preview" }));
      await user.click(screen.getByRole("button", { name: "Diff" }));
      expect(mocks.readWorkspaceGitDiffMock).toHaveBeenCalledTimes(1);
    });

  it("shows binary and truncated file preview states", async () => {
      const binaryEntry = {
        name: "image.png",
        path: "/repo/orchestrator/image.png",
        relativePath: "image.png",
        kind: "file" as const,
      };
      const largeEntry = {
        name: "large.ts",
        path: "/repo/orchestrator/large.ts",
        relativePath: "large.ts",
        kind: "file" as const,
      };
      mocks.listWorkspaceDirectoryMock.mockResolvedValue([binaryEntry, largeEntry]);
      mocks.readWorkspaceFilePreviewMock.mockImplementation(
        async (_workspacePath: string, filePath: string) => {
          if (filePath === binaryEntry.path) {
            return {
              path: binaryEntry.path,
              relativePath: binaryEntry.relativePath,
              content: "",
              truncated: false,
              isBinary: true,
            };
          }

          return {
            path: largeEntry.path,
            relativePath: largeEntry.relativePath,
            content: "const value = 1;",
            truncated: true,
            isBinary: false,
          };
        },
      );

      const { user } = await renderApp();
      const workspaceNav = screen.getByRole("navigation", {
        name: "Workspaces",
      });

      await user.click(
        within(workspaceNav).getByRole("button", { name: "Expand orchestrator" }),
      );
      await user.click(await within(workspaceNav).findByRole("button", { name: "image.png" }));

      expect(await screen.findByText("Binary or unsupported file preview.")).toBeInTheDocument();
      expect(
        screen.queryByLabelText("Highlighted file preview"),
      ).not.toBeInTheDocument();

      await user.click(within(workspaceNav).getByRole("button", { name: "large.ts" }));

      expect(await screen.findByText("Preview truncated to 512 KB.")).toBeInTheDocument();
      expect(await screen.findByText("Truncated")).toBeInTheDocument();
      expect(screen.getByLabelText("Highlighted file preview")).toHaveTextContent(
        "const value = 1;",
      );
    });

  it("resizes the file preview drawer horizontally", async () => {
      setWindowWidth(1200);
      const readmeEntry = {
        name: "README.md",
        path: "/repo/orchestrator/README.md",
        relativePath: "README.md",
        kind: "file" as const,
      };
      mocks.listWorkspaceDirectoryMock.mockResolvedValue([readmeEntry]);
      mocks.readWorkspaceFilePreviewMock.mockResolvedValue({
        path: readmeEntry.path,
        relativePath: readmeEntry.relativePath,
        content: "# Orchestrator",
        truncated: false,
        isBinary: false,
      });

      const { user } = await renderApp();
      const workspaceNav = screen.getByRole("navigation", {
        name: "Workspaces",
      });

      await user.click(
        within(workspaceNav).getByRole("button", { name: "Expand orchestrator" }),
      );
      await user.click(await within(workspaceNav).findByRole("button", { name: "README.md" }));

      const drawer = screen.getByRole("complementary", { name: "File preview" });
      const handle = screen.getByRole("separator", { name: "Resize file preview" });
      expect(drawer).toHaveStyle({ width: "520px" });

      fireEvent.pointerDown(handle, { clientX: 680 });
      await waitFor(() => expect(drawer).toHaveClass("resizing"));
      fireEvent.pointerMove(window, { clientX: 480 });
      await waitFor(() => expect(drawer).toHaveStyle({ width: "720px" }));

      fireEvent.pointerUp(window);
      fireEvent.keyDown(handle, { key: "ArrowRight" });
      expect(drawer).toHaveStyle({ width: "680px" });
    });

  it("toggles workspace expansion from the workspace label", async () => {
      mocks.listWorkspaceDirectoryMock.mockResolvedValue([
        {
          name: "src",
          path: "/repo/orchestrator/src",
          relativePath: "src",
          kind: "directory",
        },
      ]);

      const { user } = await renderApp();
      const primaryNav = screen.getByRole("navigation", {
        name: "Primary",
      });
      const workspaceNav = screen.getByRole("navigation", {
        name: "Workspaces",
      });
      const workspaceButton = within(workspaceNav).getByRole("button", {
        name: "orchestrator",
      });

      await user.click(workspaceButton);

      await waitFor(() =>
        expect(mocks.listWorkspaceDirectoryMock).toHaveBeenCalledWith(
          workspace.path,
          workspace.path,
        ),
      );
      expect(workspaceButton).toHaveAttribute("aria-current", "page");
      expect(await within(workspaceNav).findByRole("button", { name: "src" })).toBeInTheDocument();

      await user.click(within(primaryNav).getByRole("button", { name: "Settings" }));
      expect(workspaceButton).not.toHaveAttribute("aria-current");
      expect(within(workspaceNav).getByRole("button", { name: "src" })).toBeInTheDocument();

      await user.click(workspaceButton);
      expect(screen.getByLabelText("Task composer")).toBeInTheDocument();
      expect(workspaceButton).toHaveAttribute("aria-current", "page");
      expect(within(workspaceNav).getByRole("button", { name: "src" })).toBeInTheDocument();

      await user.click(workspaceButton);

      expect(within(workspaceNav).queryByRole("button", { name: "src" })).not.toBeInTheDocument();

      await user.click(workspaceButton);
      expect(await within(workspaceNav).findByRole("button", { name: "src" })).toBeInTheDocument();
      expect(mocks.listWorkspaceDirectoryMock).toHaveBeenCalledTimes(2);
    });

  it("shows nested loading state while expanding directories", async () => {
      let resolveNestedDirectory: (entries: unknown[]) => void = () => undefined;
      const nestedDirectory = new Promise<unknown[]>((resolve) => {
        resolveNestedDirectory = resolve;
      });
      mocks.listWorkspaceDirectoryMock.mockImplementation(
        async (_workspacePath: string, directoryPath: string) => {
          if (directoryPath === "/repo/orchestrator/src") {
            return nestedDirectory;
          }

          return [
            {
              name: "src",
              path: "/repo/orchestrator/src",
              relativePath: "src",
              kind: "directory",
            },
          ];
        },
      );

      const { user } = await renderApp();
      const workspaceNav = screen.getByRole("navigation", {
        name: "Workspaces",
      });

      await user.click(
        within(workspaceNav).getByRole("button", { name: "Expand orchestrator" }),
      );
      await user.click(await within(workspaceNav).findByRole("button", { name: "Expand src" }));

      expect(within(workspaceNav).getByText("Loading")).toBeInTheDocument();

      resolveNestedDirectory([
        {
          name: "App.tsx",
          path: "/repo/orchestrator/src/App.tsx",
          relativePath: "src/App.tsx",
          kind: "file",
        },
      ]);
      expect(await within(workspaceNav).findByRole("button", { name: "App.tsx" })).toBeInTheDocument();
    });

  it("adds explorer files to context through composer drop and dedupes repeats", async () => {
      await renderApp();
      const composer = composerInputZone();
      const dataTransfer = createContextFileDataTransfer([
        {
          path: "/repo/orchestrator/README.md",
          name: "README.md",
          source: "explorer",
          status: "ready",
        },
      ]);

      fireEvent.dragOver(composer, { dataTransfer });
      fireEvent.drop(composer, { dataTransfer });
      fireEvent.drop(composer, { dataTransfer });

      const contextList = await screen.findByLabelText("Selected context files");
      expect(within(contextList).getAllByText("README.md")).toHaveLength(1);
    });

  it("accepts native Finder drops only inside the input and restores prompt focus", async () => {
      const { user } = await renderApp();
      const zone = composerInputZone();
      const composer = screen.getByLabelText("Task composer");
      const prompt = screen.getByLabelText("Prompt") as HTMLTextAreaElement;
      mockElementRect(zone, {
        left: 100,
        right: 700,
        top: 200,
        bottom: 500,
        width: 600,
        height: 300,
      });
      await user.type(prompt, "Draft prompt");
      prompt.setSelectionRange(2, 7, "forward");

      await emitNativeContextFileDrop({
        type: "drop",
        paths: ["/Users/example/Desktop/outside.txt"],
        clientX: 20,
        clientY: 20,
      });
      expect(mocks.inspectDroppedContextPathsMock).not.toHaveBeenCalled();

      await emitNativeContextFileDrop({
        type: "enter",
        paths: ["/Users/example/Desktop/reference.png"],
        clientX: 400,
        clientY: 300,
      });
      expect(composer).toHaveClass("drop-target-active");

      await emitNativeContextFileDrop({
        type: "drop",
        paths: ["/Users/example/Desktop/reference.png"],
        clientX: 400,
        clientY: 300,
      });

      await waitFor(() =>
        expect(mocks.inspectDroppedContextPathsMock).toHaveBeenCalledWith([
          "/Users/example/Desktop/reference.png",
        ]),
      );
      const contextList = await screen.findByLabelText("Selected context files");
      expect(within(contextList).getByTitle("/Users/example/Desktop/reference.png"))
        .toBeInTheDocument();
      await waitFor(() => expect(prompt).toHaveFocus());
      expect(prompt.selectionStart).toBe(2);
      expect(prompt.selectionEnd).toBe(7);
      expect(composer).not.toHaveClass("drop-target-active");
    });

  it("deduplicates native and HTML drops by canonical path", async () => {
      await renderApp();
      const zone = composerInputZone();
      mockElementRect(zone, {
        left: 100,
        right: 700,
        top: 200,
        bottom: 500,
        width: 600,
        height: 300,
      });
      fireEvent.drop(zone, {
        dataTransfer: createContextFileDataTransfer([
          {
            path: "/Users/example/Desktop/notes.txt",
            name: "notes.txt",
            source: "explorer",
            status: "ready",
          },
        ]),
      });
      mocks.inspectDroppedContextPathsMock.mockResolvedValueOnce({
        files: [
          {
            path: "/Users/example/Desktop/notes-link.txt",
            canonicalPath: "/Users/example/Desktop/notes.txt",
            name: "notes-link.txt",
          },
        ],
        rejected: [],
      });

      await emitNativeContextFileDrop({
        type: "drop",
        paths: ["/Users/example/Desktop/notes-link.txt"],
        clientX: 400,
        clientY: 300,
      });

      await waitFor(() =>
        expect(mocks.inspectDroppedContextPathsMock).toHaveBeenCalledWith([
          "/Users/example/Desktop/notes-link.txt",
        ]),
      );
      const contextList = screen.getByLabelText("Selected context files");
      expect(within(contextList).getAllByText("notes.txt")).toHaveLength(1);
      expect(within(contextList).queryByText("notes-link.txt")).not.toBeInTheDocument();
    });

  it("routes an inspected native drop back to its originating workspace", async () => {
      const mobileWorkspace = {
        ...workspace,
        id: 2,
        path: "/repo/mobile-client",
        label: "mobile-client",
      };
      mocks.listWorkspacesMock.mockResolvedValue([workspace, mobileWorkspace]);
      let resolveInspection!: (value: {
        files: Array<{
          path: string;
          canonicalPath: string;
          name: string;
        }>;
        rejected: [];
      }) => void;
      mocks.inspectDroppedContextPathsMock.mockReturnValue(
        new Promise((resolve) => {
          resolveInspection = resolve;
        }),
      );

      const { user } = await renderApp();
      const zone = composerInputZone();
      mockElementRect(zone, {
        left: 100,
        right: 700,
        top: 200,
        bottom: 500,
        width: 600,
        height: 300,
      });
      await emitNativeContextFileDrop({
        type: "drop",
        paths: ["/Users/example/Desktop/notes.txt"],
        clientX: 400,
        clientY: 300,
      });
      await waitFor(() =>
        expect(mocks.inspectDroppedContextPathsMock).toHaveBeenCalledOnce(),
      );

      const workspaceNav = screen.getByRole("navigation", { name: "Workspaces" });
      await user.click(
        within(workspaceNav).getByRole("button", { name: "mobile-client" }),
      );
      await act(async () => {
        resolveInspection({
          files: [
            {
              path: "/Users/example/Desktop/notes.txt",
              canonicalPath: "/Users/example/Desktop/notes.txt",
              name: "notes.txt",
            },
          ],
          rejected: [],
        });
        await Promise.resolve();
      });
      expect(screen.queryByLabelText("Selected context files")).not.toBeInTheDocument();

      await user.click(
        within(workspaceNav).getByRole("button", { name: "orchestrator" }),
      );
      expect(
        within(await screen.findByLabelText("Selected context files")).getByText(
          "notes.txt",
        ),
      ).toBeInTheDocument();
    });

  it("moves submitted images into the message and sends them as native image input", async () => {
      prepareSignedInRun();
      const imagePath = `${workspace.path}/screenshot.png`;
      let resolvePreflight!: (value: typeof preflight) => void;
      mocks.runPreflightMock.mockReturnValue(
        new Promise((resolve) => {
          resolvePreflight = resolve;
        }),
      );
      mocks.openDialogMock.mockResolvedValue(imagePath);

      const { user } = await renderApp();
      await user.click(screen.getByRole("button", { name: "Add files" }));
      await waitFor(() =>
        expect(mocks.prepareImageAttachmentMock).toHaveBeenCalledWith(imagePath),
      );
      await user.type(screen.getByLabelText("Prompt"), "Review this screenshot");
      await user.click(screen.getByRole("button", { name: /run codex/i }));

      expect(screen.getByLabelText("Prompt")).toHaveValue("");
      expect(screen.queryByLabelText("Selected context files")).not.toBeInTheDocument();
      const submittedImages = screen.getByLabelText("Submitted image");
      expect(within(submittedImages).getByRole("img", { name: "screenshot.png" }))
        .toBeInTheDocument();
      expect(within(submittedImages).queryByText("screenshot.png"))
        .not.toBeInTheDocument();
      expect(within(submittedImages).queryByText("Preparing image"))
        .not.toBeInTheDocument();
      expect(
        submittedImages.querySelector(".submitted-image-preparing-spinner"),
      ).toBeNull();
      await waitFor(() => expect(mocks.runPreflightMock).toHaveBeenCalledTimes(1));
      expect(
        mocks.codexRpcMock.mock.calls.some(([, method]) => method === "turn/start"),
      ).toBe(false);

      await act(async () => {
        resolvePreflight(preflight);
        await Promise.resolve();
      });

      await waitFor(() =>
        expect(
          mocks.codexRpcMock.mock.calls.some(([, method]) => method === "turn/start"),
        ).toBe(true),
      );
      const turnStart = mocks.codexRpcMock.mock.calls.find(
        ([, method]) => method === "turn/start",
      )?.[2];
      expect(turnStart).toEqual(
        expect.objectContaining({
          input: [
            expect.objectContaining({
              type: "text",
            }),
            {
              type: "localImage",
              path: imagePath,
              detail: "auto",
            },
          ],
          additionalContext: null,
        }),
      );
      expect(mocks.readCodexFileMock).not.toHaveBeenCalledWith(7, imagePath);
      expect(
        JSON.parse(mocks.createRunMock.mock.calls[0]?.[0].executionSettingsJson),
      ).toEqual(
        expect.objectContaining({
          contextFiles: [
            expect.objectContaining({
              path: imagePath,
              mediaKind: "image",
              mimeType: "image/png",
              width: 640,
              height: 480,
            }),
          ],
        }),
      );
    });

  it("retains images in a failed queue item when preparation fails before turn start", async () => {
      prepareSignedInRun();
      const imagePath = `${workspace.path}/broken.png`;
      mocks.openDialogMock.mockResolvedValue(imagePath);
      mocks.prepareImageAttachmentMock.mockRejectedValue(
        new Error("Selected image could not be decoded"),
      );

      const { user } = await renderApp();
      await user.click(screen.getByRole("button", { name: "Add files" }));
      await user.type(screen.getByLabelText("Prompt"), "Inspect this image");
      await user.click(screen.getByRole("button", { name: /run codex/i }));

      await waitFor(() =>
        expect(mocks.failPromptQueueItemMock).toHaveBeenCalledWith(
          expect.any(String),
          "Unable to prepare broken.png: Selected image could not be decoded",
        ),
      );
      expect(screen.getByLabelText("Prompt")).toHaveValue("");
      expect(screen.queryByText("Queue paused")).not.toBeInTheDocument();
      expect(screen.getByText("Queued")).toBeInTheDocument();
      expect(screen.getByText("Image not sent")).toBeInTheDocument();
      expect(mocks.createTaskMock).not.toHaveBeenCalled();
      expect(
        mocks.codexRpcMock.mock.calls.some(([, method]) => method === "turn/start"),
      ).toBe(false);
    });

  it("adds files dragged from the workspace explorer into the task chat surface", async () => {
      mocks.listWorkspaceDirectoryMock.mockResolvedValue([
        {
          name: "README.md",
          path: "/repo/orchestrator/README.md",
          relativePath: "README.md",
          kind: "file",
        },
      ]);

      const { user } = await renderApp();
      const workspaceNav = screen.getByRole("navigation", {
        name: "Workspaces",
      });
      await user.click(
        within(workspaceNav).getByRole("button", { name: "Expand orchestrator" }),
      );

      const readmeButton = await within(workspaceNav).findByRole("button", {
        name: "README.md",
      });
      const composer = screen.getByLabelText("Task composer");
      mockElementRect(composerInputZone());
      startPointerDragFileIntoTaskSurface(readmeButton);

      const dragPreview = screen.getByLabelText("Dragging README.md");
      expect(dragPreview).toHaveTextContent("README.md");
      expect(dragPreview).toHaveTextContent("Drop to add");
      expect(composer).toHaveClass("drop-target-active");

      finishPointerDragFileIntoTaskSurface(readmeButton);

      const contextList = await screen.findByLabelText("Selected context files");
      expect(within(contextList).getByText("README.md")).toBeInTheDocument();
      expect(screen.queryByLabelText("Dragging README.md")).not.toBeInTheDocument();
      expect(composer).not.toHaveClass("drop-target-active");
    });

  it("dedupes repeated pointer drags from the workspace explorer", async () => {
      mocks.listWorkspaceDirectoryMock.mockResolvedValue([
        {
          name: "hello.txt",
          path: "/repo/orchestrator/hello.txt",
          relativePath: "hello.txt",
          kind: "file",
        },
      ]);

      const { user } = await renderApp();
      const workspaceNav = screen.getByRole("navigation", {
        name: "Workspaces",
      });
      await user.click(
        within(workspaceNav).getByRole("button", { name: "Expand orchestrator" }),
      );

      const fileButton = await within(workspaceNav).findByRole("button", {
        name: "hello.txt",
      });
      mockElementRect(composerInputZone());

      pointerDragFileIntoTaskSurface(fileButton);
      pointerDragFileIntoTaskSurface(fileButton);

      const contextList = await screen.findByLabelText("Selected context files");
      expect(within(contextList).getAllByText("hello.txt")).toHaveLength(1);
    });

  it("indexes workspace files for @ mentions and adds the selected file to context", async () => {
      mocks.listWorkspaceDirectoryMock.mockImplementation(
        async (_workspacePath: string, directoryPath: string) => {
          if (directoryPath === workspace.path) {
            return [
              {
                name: "src",
                path: `${workspace.path}/src`,
                relativePath: "src",
                kind: "directory",
              },
              {
                name: "README.md",
                path: `${workspace.path}/README.md`,
                relativePath: "README.md",
                kind: "file",
              },
            ];
          }

          if (directoryPath === `${workspace.path}/src`) {
            return [
              {
                name: "App.tsx",
                path: `${workspace.path}/src/App.tsx`,
                relativePath: "src/App.tsx",
                kind: "file",
              },
            ];
          }

          return [];
        },
      );

      const { user } = await renderApp();
      const promptInput = screen.getByLabelText("Prompt");

      await user.type(promptInput, "@app");
      const option = await screen.findByRole("option", { name: /app\.tsx/i });
      await user.click(option);

      await waitFor(() =>
        expect(mocks.listWorkspaceDirectoryMock).toHaveBeenCalledWith(
          workspace.path,
          workspace.path,
        ),
      );
      expect(mocks.listWorkspaceDirectoryMock).toHaveBeenCalledWith(
        workspace.path,
        `${workspace.path}/src`,
      );
      expect(promptInput).toHaveValue("TSX App.tsx ");
      expect(screen.queryByLabelText("Selected context files")).not.toBeInTheDocument();

      const secondPromptInput = screen.getByLabelText("Prompt");
      await user.click(secondPromptInput);
      await user.type(secondPromptInput, "@app");
      await user.click(await screen.findByRole("option", { name: /app\.tsx/i }));
      expect(secondPromptInput).toHaveValue("TSX App.tsx TSX App.tsx ");
      expect(screen.queryByLabelText("Selected context files")).not.toBeInTheDocument();
    });

  it("submits @ file references as Markdown without changing their visual token", async () => {
      prepareSignedInRun();
      mocks.listWorkspaceDirectoryMock.mockResolvedValue([
        {
          name: "App.tsx",
          path: `${workspace.path}/src/App.tsx`,
          relativePath: "src/App.tsx",
          kind: "file",
        },
      ]);

      const { user } = await renderApp();
      const promptInput = screen.getByLabelText("Prompt");
      await user.type(promptInput, "Update @app");
      await user.click(await screen.findByRole("option", { name: /app\.tsx/i }));

      expect(promptInput).toHaveValue("Update TSX App.tsx ");
      await user.click(screen.getByRole("button", { name: /run codex/i }));

      const markdownPrompt =
        "Update [App.tsx](/repo/orchestrator/src/App.tsx:1)";
      await waitFor(() =>
        expect(mocks.createTaskMock).toHaveBeenCalledWith(
          expect.objectContaining({ originalPrompt: markdownPrompt }),
        ),
      );
      expect(mocks.runPreflightMock).toHaveBeenCalledWith(
        expect.objectContaining({ prompt: markdownPrompt }),
      );

      const submittedPrompt = within(
        screen.getByLabelText("Task chat transcript"),
      ).getByLabelText("Submitted prompt");
      const fileLink = within(submittedPrompt).getByRole("link", {
        name: "App.tsx",
      });
      expect(within(fileLink).getByText("TSX")).toBeInTheDocument();
      expect(fileLink).toHaveAttribute(
        "href",
        "/repo/orchestrator/src/App.tsx:1",
      );
    });
});
