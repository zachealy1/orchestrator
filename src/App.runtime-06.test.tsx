import { act, screen, waitFor, within } from "@testing-library/react";
import { describe, beforeEach, expect, it, vi } from "vitest";
import {
  WorkspaceRunFixture,
  getMocks,
  workspace,
  signedInAccount,
  defaultCodexModel,
  workspaceRunFixture,
  workspaceChatFixture,
  workspaceChatWithRunsFixture,
  promptQueueItemFixture,
  prepareDefaults,
  renderApp,
  holdNextAnimationFrames,
  prepareSignedInRun,
  prepareKanbanRun,
  startMockRun,
  emitCodexNotification,
  setWindowWidth,
  PromptQueueItem,
} from "./test/appRuntimeHarness";
const mocks = getMocks();

describe("Application runtime scenarios 6", () => {
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

  it("edits and reruns only the latest submitted prompt on a fresh thread", async () => {
      prepareSignedInRun();
      mocks.createTaskMock
        .mockResolvedValueOnce({ id: 101 })
        .mockResolvedValueOnce({ id: 102 });
      mocks.createRunMock
        .mockResolvedValueOnce({ id: 202 })
        .mockResolvedValueOnce({ id: 203 });

      const { user } = await renderApp();
      await startMockRun(user, "Original prompt");
      await emitCodexNotification({
        method: "item/agentMessage/delta",
        params: { itemId: "final-1", delta: "Original result." },
      });
      await emitCodexNotification({
        method: "item/completed",
        params: {
          item: {
            type: "agentMessage",
            id: "final-1",
            text: "Original result.",
            phase: "final_answer",
          },
        },
      });
      await emitCodexNotification({
        method: "turn/completed",
        params: { turn: { status: "completed", durationMs: 1000 } },
      });

      await user.click(await screen.findByRole("button", { name: "Edit prompt" }));
      await user.clear(screen.getByLabelText("Edit submitted prompt"));
      await user.type(screen.getByLabelText("Edit submitted prompt"), "Edited prompt");
      await user.click(screen.getByRole("button", { name: "Run edited prompt" }));

      await waitFor(() => expect(mocks.createTaskMock).toHaveBeenCalledTimes(2));
      await waitFor(() => expect(mocks.createRunMock).toHaveBeenCalledTimes(2));
      expect(mocks.softDeleteRunMock).toHaveBeenCalledWith(202);
      expect(mocks.createTaskMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          chatId: 401,
          turnIndex: 1,
          originalPrompt: "Edited prompt",
        }),
      );
      expect(mocks.createRunMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ chatId: 401, turnIndex: 1 }),
      );
      expect(
        mocks.codexRpcMock.mock.calls.filter((call) => call[1] === "thread/start"),
      ).toHaveLength(2);
      const transcript = screen.getByLabelText("Task chat transcript");
      expect(within(transcript).getByLabelText("Submitted prompt")).toHaveTextContent(
        "Edited prompt",
      );
      expect(
        within(transcript).queryByText("Original prompt"),
      ).not.toBeInTheDocument();
    });

  it("reruns an edited prompt with its original execution settings", async () => {
      prepareSignedInRun();
      const originalModel = {
        id: "gpt-original",
        model: "gpt-original",
        displayName: "Original model",
        description: "Original model",
        hidden: false,
        supportedReasoningEfforts: [
          { reasoningEffort: "low", description: "Low" },
          { reasoningEffort: "high", description: "High" },
        ],
        defaultReasoningEffort: "high",
        isDefault: true,
      };
      const currentModel = {
        id: "gpt-current",
        model: "gpt-current",
        displayName: "Current model",
        description: "Current model",
        hidden: false,
        supportedReasoningEfforts: [
          { reasoningEffort: "medium", description: "Medium" },
        ],
        defaultReasoningEffort: "medium",
        isDefault: false,
      };
      mocks.listCodexModelsMock.mockResolvedValue([originalModel, currentModel]);
      mocks.listCodexSkillsMock.mockResolvedValue([
        {
          id: "browser:control-in-app-browser",
          name: "browser:control-in-app-browser",
          description: "Control the in-app browser",
        },
        {
          id: "docs",
          name: "Docs",
          description: "Use repository documentation",
        },
      ]);
      const imagePath = `${workspace.path}/reference.png`;
      mocks.openDialogMock.mockResolvedValue([
        `${workspace.path}/README.md`,
        imagePath,
      ]);
      const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);

      const { user } = await renderApp();
      await user.click(await screen.findByRole("combobox", { name: "Reasoning" }));
      await user.click(screen.getByRole("option", { name: "Low" }));
      await user.click(screen.getByRole("button", { name: "Add files" }));
      await user.click(screen.getByRole("button", { name: "Goal mode" }));
      const promptInput = screen.getByLabelText("Prompt");
      await user.type(promptInput, "Fix docs /docs");
      await user.click(await screen.findByRole("option", { name: /docs/i }));
      await user.click(screen.getByRole("button", { name: /run codex/i }));
      await waitFor(() => expect(mocks.setThreadGoalMock).toHaveBeenCalledTimes(1));
      await emitCodexNotification({
        method: "turn/started",
        params: {
          threadId: "thread-1",
          turn: { id: "turn-1", status: "inProgress" },
        },
      });

      await waitFor(() => expect(mocks.createRunMock).toHaveBeenCalledTimes(1));
      const firstSettings = JSON.parse(
        mocks.createRunMock.mock.calls[0]?.[0].executionSettingsJson,
      );
      expect(firstSettings).toEqual(
        expect.objectContaining({
          version: 6,
          accountId: 7,
          profileKey: "account:7",
          selectedRepositoryPath: workspace.path,
          selectedBranch: "main",
          mode: "run",
          intent: "normal",
          accessMode: "ask-for-approval",
          computerUseEnabled: false,
          model: "gpt-original",
          reasoningEffort: "low",
          goalMode: true,
          contextFiles: [
            expect.objectContaining({
              path: `${workspace.path}/README.md`,
              source: "picker",
            }),
            expect.objectContaining({
              path: imagePath,
              source: "picker",
              mediaKind: "image",
              mimeType: "image/png",
            }),
          ],
          selectedSkills: [
            expect.objectContaining({ id: "docs", name: "Docs" }),
          ],
        }),
      );

      await emitCodexNotification({
        method: "turn/completed",
        params: { turn: { status: "completed", durationMs: 1000 } },
      });
      await emitCodexNotification({
        method: "thread/goal/updated",
        params: {
          threadId: "thread-1",
          goal: {
            threadId: "thread-1",
            objective: "Fix docs /docs",
            status: "complete",
            timeUsedSeconds: 1,
          },
        },
      });
      mocks.readCodexFileMock.mockResolvedValue("updated file contents");
      await user.click(screen.getByRole("button", { name: "Goal mode" }));
      await user.click(screen.getByRole("combobox", { name: "Agent" }));
      await user.click(screen.getByRole("option", { name: "Current model" }));
      await user.click(screen.getByRole("combobox", { name: "Access" }));
      await user.click(screen.getByRole("option", { name: "Full access" }));

      await user.click(await screen.findByRole("button", { name: "Edit prompt" }));
      await user.clear(screen.getByLabelText("Edit submitted prompt"));
      await user.type(
        screen.getByLabelText("Edit submitted prompt"),
        "Fix docs more carefully",
      );
      await user.click(screen.getByRole("button", { name: "Run edited prompt" }));
      await waitFor(() => expect(mocks.setThreadGoalMock).toHaveBeenCalledTimes(2));
      await emitCodexNotification({
        method: "turn/started",
        params: {
          threadId: "thread-1",
          turn: { id: "turn-2", status: "inProgress" },
        },
      });

      await waitFor(() => expect(mocks.createRunMock).toHaveBeenCalledTimes(2));
      const secondSettings = JSON.parse(
        mocks.createRunMock.mock.calls[1]?.[0].executionSettingsJson,
      );
      expect(secondSettings).toEqual(firstSettings);
      expect(mocks.createRunMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          sandbox: "workspace-write",
          approvalPolicy: "untrusted",
          model: "gpt-original",
        }),
      );
      expect(mocks.setThreadGoalMock).toHaveBeenCalledTimes(2);
      expect(mocks.readCodexFileMock).toHaveBeenCalledWith(
        7,
        `${workspace.path}/README.md`,
      );
      expect(
        mocks.codexRpcMock.mock.calls.filter(([, method]) => method === "turn/start"),
      ).toHaveLength(0);
      expect(mocks.setThreadGoalMock).toHaveBeenLastCalledWith(
        7,
        "thread-1",
        "Fix docs more carefully",
      );
      expect(mocks.readCodexFileMock).not.toHaveBeenCalledWith(7, imagePath);
      expect(screen.getByRole("combobox", { name: "Agent" })).toHaveTextContent(
        "Current model",
      );
      expect(screen.getByRole("combobox", { name: "Access" })).toHaveTextContent(
        "Full access",
      );
      expect(screen.getByRole("button", { name: "Goal mode" })).toHaveAttribute(
        "aria-pressed",
        "false",
      );
      expect(confirm).toHaveBeenCalledTimes(1);
    });

  it("reruns an Orchestrator-owned shared Kanban prompt in its worktree", async () => {
      prepareKanbanRun();
      const executionRoot = "/repo/.codex-kanban/card-shared-edit";
      const worktreePath = `${executionRoot}/orchestrator`;
      const cardBranch = "codex/shared-edit";
      const sharedChat = {
        ...workspaceChatFixture({
          id: 777,
          title: "Shared Kanban edit",
          codex_thread_id: "thread-shared-edit",
          profile_key: "default",
        }),
        account_id: null,
        account_label: null,
        account_email: null,
        surface: "kanban" as const,
        native_workspace_binding_status: "ready" as const,
        native_workspace_binding_json: JSON.stringify({
          version: 6,
          kind: "kanban",
          sourceWorkspacePath: workspace.path,
          executionDirectory: executionRoot,
          runtimeWorkspaceRoots: [executionRoot, worktreePath],
          pendingContinuationContext: null,
          sourceRootAssociation: "source-root",
          verifiedEnvironmentThreadId: "thread-shared-edit",
        }),
      };
      const sharedRun = workspaceRunFixture({
        id: 309,
        chat_id: sharedChat.id,
        account_id: null,
        account_label: "Codex default profile",
        account_email: null,
        codex_thread_id: "thread-shared-edit",
        original_prompt: "Original shared prompt",
        final_message: "The original run was blocked.",
        execution_settings_json: JSON.stringify({
          version: 3,
          accountId: 0,
          profileKey: "default",
          selectedRepositoryPath: worktreePath,
          selectedBranch: cardBranch,
          mode: "run",
          intent: "normal",
          accessMode: "ask-for-approval",
          computerUseEnabled: false,
          browserExecutionTarget: "isolated",
          model: defaultCodexModel.model,
          reasoningEffort: "medium",
          contextFiles: [],
          selectedSkills: [],
          goalMode: false,
        }),
      });
      mocks.listWorkspaceChatsMock.mockResolvedValue([sharedChat]);
      mocks.getChatWithRunsMock.mockResolvedValue({
        chat: sharedChat,
        runs: [sharedRun],
      });
      mocks.listLocalChatTranscriptMock.mockResolvedValue([sharedRun]);
      mocks.getChatRecordMock.mockResolvedValue(sharedChat);
      const sharedCard = {
        id: "card-shared-edit",
        workspaceId: workspace.id,
        chatId: sharedChat.id,
        title: sharedChat.title,
        description: "Original shared prompt",
        accountId: null,
        accessMode: "ask-for-approval" as const,
        model: defaultCodexModel.model,
        reasoningLevel: "medium",
        executionSettingsJson: sharedRun.execution_settings_json,
        repositoryScope: "selected" as const,
        stage: "in_progress" as const,
        sortPosition: 1_000,
        executionState: "failed" as const,
        reviewState: "none" as const,
        reviewChannel: null,
        currentAttemptId: "attempt-failed-edit",
        stateVersion: 5,
        archivedAt: null,
        deletedAt: null,
        approvedAt: null,
        lastError: "Previous setup failed",
        hasInheritedContext: false,
        hasStartedTurn: true,
        createdAt: "2026-06-30T09:00:00Z",
        updatedAt: "2026-06-30T09:01:00Z",
        repositories: [
          {
            repositoryPath: workspace.path,
            relativePath: ".",
            label: workspace.label,
            includeDirtyChanges: false,
          },
        ],
        pullRequests: [],
      };
      mocks.getKanbanCardForChatMock.mockResolvedValue(sharedCard);
      mocks.claimKanbanAttemptMock.mockResolvedValue({
        card: {
          ...sharedCard,
          executionState: "starting",
          currentAttemptId: "attempt-shared-edit-retry",
          stateVersion: 6,
        },
        attempt: {
          id: "attempt-shared-edit-retry",
          cardId: sharedCard.id,
          generation: 6,
          kind: "retry",
          status: "starting",
          prompt: "Edited shared prompt",
          runId: null,
          taskId: null,
          threadId: null,
          turnId: null,
          executionRoot: null,
          lastEventSequence: 0,
          error: null,
          startedAt: "2026-06-30T09:02:00Z",
          completedAt: null,
        },
      });
      mocks.loadKanbanGitBindingsMock.mockResolvedValue([
        {
          sourceRepositoryPath: workspace.path,
          relativePath: ".",
          executionRoot,
          sourceBranch: "main",
          baseBranch: "main",
          baseCommit: "0123456789abcdef",
          cardBranch,
          worktreePath,
          status: "ready",
          error: null,
        },
      ]);
      mocks.listGitBranchesMock.mockResolvedValue({
        branches: [cardBranch],
        currentBranch: cardBranch,
      });

      const { user } = await renderApp();
      const banner = screen.getByRole("region", { name: "Selected folder" });
      await user.click(
        within(banner).getByRole("button", { name: /open chat history/i }),
      );
      const drawer = await screen.findByRole("complementary", {
        name: "Workspace chat history",
      });
      await user.click(
        within(drawer).getByRole("button", { name: /shared kanban edit/i }),
      );
      await user.click(await screen.findByRole("button", { name: "Edit prompt" }));
      await user.clear(screen.getByLabelText("Edit submitted prompt"));
      await user.type(
        screen.getByLabelText("Edit submitted prompt"),
        "Edited shared prompt",
      );
      await user.click(screen.getByRole("button", { name: "Run edited prompt" }));

      await waitFor(() =>
        expect(mocks.claimKanbanAttemptMock).toHaveBeenCalledWith(
          expect.objectContaining({
            card: sharedCard,
            kind: "retry",
            prompt: "Edited shared prompt",
          }),
        ),
      );

      await waitFor(() =>
        expect(mocks.codexDefaultProfileRpcMock).toHaveBeenCalledWith(
          "turn/start",
          expect.objectContaining({
            cwd: executionRoot,
          }),
        ),
      );
      expect(
        mocks.codexDefaultProfileRpcMock.mock.calls.find(
          ([method]) => method === "turn/start",
        )?.[1],
      ).toEqual(
        expect.objectContaining({
          runtimeWorkspaceRoots: [executionRoot, worktreePath],
          environments: [
            expect.objectContaining({
              environmentId: "local",
              cwd: executionRoot,
              runtimeWorkspaceRoots: [executionRoot, worktreePath],
            }),
          ],
        }),
      );
      expect(screen.queryByText(/default external Codex profile/i)).not.toBeInTheDocument();
      expect(mocks.createRunMock).toHaveBeenCalledWith(
        expect.objectContaining({ accountId: null, chatId: sharedChat.id }),
      );
      await waitFor(() =>
        expect(mocks.updateRunMock).toHaveBeenCalledWith(
          expect.any(Number),
          expect.objectContaining({
            codexTurnId: "turn-1",
            status: "running",
          }),
        ),
      );
      await waitFor(() =>
        expect(
          screen
            .getAllByLabelText("Submitted prompt")
            .some((prompt) => prompt.textContent?.includes("Edited shared prompt")),
        ).toBe(true),
      );
      expect(mocks.updateKanbanAttemptMock).toHaveBeenCalledWith(
        expect.objectContaining({
          cardId: sharedCard.id,
          attemptId: "attempt-shared-edit-retry",
          generation: 6,
          status: "running",
          turnId: "turn-1",
        }),
      );

      await emitCodexNotification(
        {
          method: "item/agentMessage/delta",
          params: {
            threadId: "thread-1",
            turnId: "turn-1",
            itemId: "shared-edit-message",
            delta: "Implemented the edited shared prompt.",
          },
        },
        { accountId: 0, profileKey: "default" },
      );
      expect(
        await screen.findByText("Implemented the edited shared prompt."),
      ).toBeInTheDocument();

      await emitCodexNotification(
        {
          method: "turn/completed",
          params: {
            threadId: "thread-1",
            turn: {
              id: "turn-1",
              status: "completed",
              durationMs: 1000,
            },
          },
        },
        { accountId: 0, profileKey: "default" },
      );
      await waitFor(() =>
        expect(mocks.updateRunMock).toHaveBeenCalledWith(
          expect.any(Number),
          expect.objectContaining({ status: "completed" }),
        ),
      );
      await waitFor(() =>
        expect(mocks.updateKanbanAttemptMock).toHaveBeenCalledWith(
          expect.objectContaining({
            cardId: sharedCard.id,
            attemptId: "attempt-shared-edit-retry",
            generation: 6,
            status: "completed",
          }),
        ),
      );
      await waitFor(() =>
        expect(mocks.codexDefaultProfileRpcMock).toHaveBeenCalledWith(
          "thread/read",
          expect.objectContaining({
            threadId: "thread-1",
          }),
        ),
      );
      await waitFor(() =>
        expect(mocks.saveNativeWorkspaceBindingMock).toHaveBeenCalledWith(
          expect.objectContaining({
            chatId: sharedChat.id,
            status: "ready",
            binding: expect.objectContaining({
              sourceRootAssociation: "source-root",
            }),
          }),
        ),
      );
    });

  it("requires Full access confirmation again before replacing an edited turn", async () => {
      prepareSignedInRun();
      const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);

      const { user } = await renderApp();
      await user.click(screen.getByRole("combobox", { name: "Access" }));
      await user.click(screen.getByRole("option", { name: "Full access" }));
      await startMockRun(user, "Original full-access prompt");
      await emitCodexNotification({
        method: "turn/completed",
        params: { turn: { status: "completed", durationMs: 1000 } },
      });

      confirm.mockReturnValue(false);
      await user.click(await screen.findByRole("button", { name: "Edit prompt" }));
      await user.clear(screen.getByLabelText("Edit submitted prompt"));
      await user.type(screen.getByLabelText("Edit submitted prompt"), "Edited prompt");
      await user.click(screen.getByRole("button", { name: "Run edited prompt" }));

      await waitFor(() => expect(confirm).toHaveBeenCalledTimes(2));
      expect(mocks.createRunMock).toHaveBeenCalledTimes(1);
      expect(screen.getByLabelText("Submitted prompt")).toHaveTextContent(
        "Original full-access prompt",
      );
    });

  it("preserves Plan Mode when rerunning an edited prompt after the toggle resets", async () => {
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
      await user.click(screen.getByRole("button", { name: "Plan mode" }));
      await startMockRun(user, "Plan the original change");
      expect(screen.getByRole("button", { name: "Plan mode" })).toHaveAttribute(
        "aria-pressed",
        "false",
      );
      await emitCodexNotification({
        method: "turn/completed",
        params: { turn: { status: "completed", durationMs: 1000 } },
      });

      await user.click(await screen.findByRole("button", { name: "Edit prompt" }));
      await user.clear(screen.getByLabelText("Edit submitted prompt"));
      await user.type(
        screen.getByLabelText("Edit submitted prompt"),
        "Plan the corrected change",
      );
      await user.click(screen.getByRole("button", { name: "Run edited prompt" }));

      await waitFor(() => expect(mocks.createRunMock).toHaveBeenCalledTimes(2));
      const settings = JSON.parse(
        mocks.createRunMock.mock.calls[1]?.[0].executionSettingsJson,
      );
      expect(settings).toEqual(
        expect.objectContaining({
          mode: "plan",
          intent: "plan",
          goalMode: false,
        }),
      );
      const turnStarts = mocks.codexRpcMock.mock.calls.filter(
        ([, method]) => method === "turn/start",
      );
      expect(turnStarts[1]?.[2]).toEqual(
        expect.objectContaining({
          collaborationMode: expect.objectContaining({ mode: "plan" }),
        }),
      );
      expect(screen.getByRole("button", { name: "Plan mode" })).toHaveAttribute(
        "aria-pressed",
        "false",
      );
    });

  it("loads persisted execution settings before editing a historical prompt", async () => {
      prepareSignedInRun();
      const originalModel = {
        id: "gpt-original",
        model: "gpt-original",
        displayName: "Original model",
        description: "Original model",
        hidden: false,
        supportedReasoningEfforts: [
          { reasoningEffort: "high", description: "High" },
        ],
        defaultReasoningEffort: "high",
        isDefault: true,
      };
      mocks.listCodexModelsMock.mockResolvedValue([originalModel]);
      const historicalChat = workspaceChatFixture({
        id: 408,
        title: "Persist original settings",
      });
      const historicalImagePath = `${workspace.path}/reference.png`;
      const persistedSettings = {
        version: 1,
        accountId: 7,
        profileKey: "account:7",
        selectedBranch: "main",
        mode: "run",
        intent: "normal",
        accessMode: "ask-for-approval",
        computerUseEnabled: false,
        model: "gpt-original",
        reasoningEffort: "high",
        contextFiles: [
          {
            path: `${workspace.path}/README.md`,
            name: "README.md",
            relativePath: "README.md",
            source: "picker",
            status: "ready",
          },
          {
            path: historicalImagePath,
            canonicalPath: historicalImagePath,
            name: "reference.png",
            source: "picker",
            mediaKind: "image",
            mimeType: "image/png",
            width: 640,
            height: 480,
            status: "ready",
            error: null,
          },
        ],
        selectedSkills: [
          {
            id: "docs",
            name: "Docs",
            description: "Use repository documentation",
          },
        ],
        goalMode: false,
      };
      const historicalRun = {
        ...workspaceRunFixture({
          id: 308,
          chat_id: historicalChat.id,
          original_prompt: "Persist original settings",
          final_message: "Original response.",
        }),
        run_intent: "normal",
        collaboration_mode: "default",
        completed_plan_item_id: null,
        completed_plan_text: null,
        plan_review_state: "none",
        execution_settings_json: JSON.stringify(persistedSettings),
      } satisfies WorkspaceRunFixture;
      mocks.listWorkspaceChatsMock.mockResolvedValue([historicalChat]);
      mocks.getChatWithRunsMock.mockResolvedValue(
        workspaceChatWithRunsFixture(historicalChat, [historicalRun]),
      );
      mocks.listLocalChatTranscriptMock.mockResolvedValue([historicalRun]);

      const { user } = await renderApp();
      const banner = screen.getByRole("region", { name: "Selected folder" });
      await user.click(
        within(banner).getByRole("button", { name: /open chat history/i }),
      );
      const drawer = await screen.findByRole("complementary", {
        name: "Workspace chat history",
      });
      await user.click(
        within(drawer).getByRole("button", { name: /persist original settings/i }),
      );
      expect(
        await screen.findByRole("img", { name: "reference.png" }),
      ).toBeInTheDocument();
      await user.click(await screen.findByRole("button", { name: "Edit prompt" }));
      await user.click(screen.getByRole("button", { name: "Run edited prompt" }));

      await waitFor(() => expect(mocks.createRunMock).toHaveBeenCalledTimes(1));
      const rerunSettings = JSON.parse(
        mocks.createRunMock.mock.calls[0]?.[0].executionSettingsJson,
      );
      expect(rerunSettings).toEqual(expect.objectContaining({
        version: 6,
        selectedRepositoryPath: workspace.path,
        computerUseEnabled: false,
        model: persistedSettings.model,
      }));
      expect(rerunSettings).not.toHaveProperty("browserExecutionTarget");
      expect(mocks.readCodexFileMock).toHaveBeenCalledWith(
        7,
        `${workspace.path}/README.md`,
      );
      expect(mocks.readCodexFileMock).not.toHaveBeenCalledWith(
        7,
        historicalImagePath,
      );
      expect(
        mocks.codexRpcMock.mock.calls.find(([, method]) => method === "turn/start")
          ?.[2],
      ).toEqual(
        expect.objectContaining({
          model: "gpt-original",
          effort: "high",
          input: [
            expect.objectContaining({
              text: expect.stringContaining("Docs: Use repository documentation"),
            }),
            {
              type: "localImage",
              path: historicalImagePath,
              detail: "auto",
            },
          ],
        }),
      );
    });

  it("keeps the original turn visible when its saved model is unavailable", async () => {
      prepareSignedInRun();
      const unavailableModel = {
        id: "removed-model",
        model: "removed-model",
        displayName: "Removed model",
        description: "Removed model",
        hidden: false,
        supportedReasoningEfforts: [
          { reasoningEffort: "high", description: "High" },
        ],
        defaultReasoningEffort: "high",
        isDefault: true,
      };
      mocks.listCodexModelsMock.mockResolvedValue([unavailableModel]);

      const { user } = await renderApp();
      expect(
        await screen.findByRole("combobox", { name: "Agent" }),
      ).toHaveTextContent("Removed model");
      await startMockRun(user, "Keep this prompt visible");
      await emitCodexNotification({
        method: "turn/completed",
        params: { turn: { status: "completed", durationMs: 1000 } },
      });
      mocks.listCodexModelsMock.mockResolvedValue([]);

      await user.click(await screen.findByRole("button", { name: "Edit prompt" }));
      await user.clear(screen.getByLabelText("Edit submitted prompt"));
      await user.type(screen.getByLabelText("Edit submitted prompt"), "Do not replace");
      await user.click(screen.getByRole("button", { name: "Run edited prompt" }));

      expect(
        await screen.findByText(
          "The original model removed-model is no longer available.",
        ),
      ).toBeInTheDocument();
      expect(mocks.createRunMock).toHaveBeenCalledTimes(1);
      expect(screen.getByLabelText("Submitted prompt")).toHaveTextContent(
        "Keep this prompt visible",
      );
    });

  it("reconstructs malformed legacy settings without changing composer defaults", async () => {
      prepareSignedInRun();
      const historicalChat = workspaceChatFixture({
        id: 409,
        title: "Legacy settings",
        turn_count: 1,
      });
      const historicalRun = {
        ...workspaceRunFixture({
          id: 309,
          chat_id: historicalChat.id,
          original_prompt: "Legacy prompt",
          final_message: "Legacy response.",
        }),
        model: null,
        model_provider: null,
        execution_settings_json: "{invalid",
      };
      mocks.listWorkspaceChatsMock.mockResolvedValue([historicalChat]);
      mocks.getChatWithRunsMock.mockResolvedValue(
        workspaceChatWithRunsFixture(historicalChat, [historicalRun]),
      );
      mocks.listLocalChatTranscriptMock.mockResolvedValue([historicalRun]);

      const { user } = await renderApp();
      const banner = screen.getByRole("region", { name: "Selected folder" });
      await user.click(
        within(banner).getByRole("button", { name: /open chat history/i }),
      );
      const drawer = await screen.findByRole("complementary", {
        name: "Workspace chat history",
      });
      await user.click(
        within(drawer).getByRole("button", { name: /legacy settings/i }),
      );
      await user.click(await screen.findByRole("button", { name: "Edit prompt" }));
      await user.click(screen.getByRole("button", { name: "Run edited prompt" }));

      await waitFor(() => expect(mocks.createRunMock).toHaveBeenCalledTimes(1));
      expect(
        screen.queryByText(/predates saved execution settings/i),
      ).not.toBeInTheDocument();
      expect(
        JSON.parse(mocks.createRunMock.mock.calls[0]?.[0].executionSettingsJson),
      ).toEqual(
        expect.objectContaining({
          accountId: 7,
          profileKey: "account:7",
          mode: "run",
          accessMode: "ask-for-approval",
          computerUseEnabled: false,
          model: null,
          reasoningEffort: null,
          contextFiles: [],
          selectedSkills: [],
          goalMode: false,
        }),
      );
      expect(screen.getByRole("combobox", { name: "Access" })).toHaveTextContent(
        "Ask for approval",
      );
    });

  it("retries an edited prompt after account/read times out before chat creation", async () => {
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
      await user.type(screen.getByLabelText("Prompt"), "Build snake");
      await user.click(screen.getByRole("button", { name: /run codex/i }));

      expect(
        await screen.findByText(
          "Timed out waiting for Codex response to account/read",
        ),
      ).toBeInTheDocument();
      expect(mocks.createChatMock).toHaveBeenCalledTimes(1);
      expect(screen.getByLabelText("Codex account")).toBeInTheDocument();
      expect(screen.queryByLabelText("Sign in to Codex")).not.toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Edit prompt" }));
      expect(screen.getByLabelText("Edit submitted prompt")).toHaveValue(
        "Build snake",
      );
      await user.click(screen.getByRole("button", { name: "Run edited prompt" }));

      await waitFor(() =>
        expect(mocks.codexRpcMock).toHaveBeenCalledWith(
          7,
          "turn/start",
          expect.any(Object),
        ),
      );
      expect(mocks.createChatMock).toHaveBeenCalledTimes(1);
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
    });

  it("blocks managed-account run setup when account/read returns malformed auth", async () => {
      prepareSignedInRun();
      mocks.readCodexAccountMock.mockImplementation(async () => ({}));

      const { user } = await renderApp();
      await user.type(screen.getByLabelText("Prompt"), "Run with bad account data");
      await user.click(screen.getByRole("button", { name: /run codex/i }));

      expect(mocks.createChatMock).not.toHaveBeenCalled();
      expect(mocks.createRunMock).not.toHaveBeenCalled();
      expect(
        mocks.codexRpcMock.mock.calls.some(
          ([, method]) =>
            method === "thread/start" || method === "turn/start",
        ),
      ).toBe(false);
      expect(screen.getByLabelText("Prompt")).toHaveValue(
        "Run with bad account data",
      );
      expect(screen.queryByLabelText("Preparing run")).not.toBeInTheDocument();
  });

  it("starts a fresh Codex thread after New chat is clicked", async () => {
      prepareSignedInRun();
      mocks.createChatMock
        .mockResolvedValueOnce({
          id: 401,
          workspace_id: workspace.id,
          account_id: 7,
          title: "First prompt",
          codex_thread_id: null,
          status: "starting",
          created_at: "2026-06-30T09:00:00Z",
          updated_at: "2026-06-30T09:00:00Z",
          deleted_at: null,
        })
        .mockResolvedValueOnce({
          id: 402,
          workspace_id: workspace.id,
          account_id: 7,
          title: "Second prompt",
          codex_thread_id: null,
          status: "starting",
          created_at: "2026-06-30T09:02:00Z",
          updated_at: "2026-06-30T09:02:00Z",
          deleted_at: null,
        });

      const { user } = await renderApp();
      await startMockRun(user, "First prompt");
      await emitCodexNotification({
        method: "turn/completed",
        params: { turn: { status: "completed", durationMs: 1000 } },
      });

      await user.click(screen.getByRole("button", { name: /new chat/i }));
      expect(screen.queryByLabelText("Task chat transcript")).not.toBeInTheDocument();
      await user.type(screen.getByLabelText("Prompt"), "Second prompt");
      await user.click(screen.getByRole("button", { name: /run codex/i }));
      await waitFor(() =>
        expect(
          mocks.codexRpcMock.mock.calls.filter((call) => call[1] === "thread/start"),
        ).toHaveLength(2),
      );
      expect(mocks.createChatMock).toHaveBeenCalledTimes(2);
      expect(mocks.createRunMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ chatId: 402, turnIndex: 1 }),
      );
    });

  it("shows the submitted prompt immediately while run setup is pending", async () => {
      prepareSignedInRun();
      let resolveCreateTask!: (value: { id: number }) => void;
      mocks.createTaskMock.mockReturnValueOnce(
        new Promise((resolve) => {
          resolveCreateTask = resolve;
        }),
      );

      const { user } = await renderApp();
      const animationFrames = holdNextAnimationFrames();
      await user.type(screen.getByLabelText("Prompt"), "Fix slow submission");
      try {
        await user.keyboard("{Enter}");

        expect(screen.getByLabelText("Prompt")).toHaveValue("");
        const transcript = await screen.findByLabelText("Task chat transcript");
        expect(within(transcript).getByLabelText("Submitted prompt")).toHaveTextContent(
          "Fix slow submission",
        );
        expect(screen.getByLabelText("Preparing run")).toHaveTextContent(
          "Preparing run...",
        );
        expect(screen.queryByRole("button", { name: /run codex/i })).not.toBeInTheDocument();
        expect(screen.getByRole("button", { name: /stop codex/i })).toBeEnabled();
        expect(mocks.runPreflightMock).not.toHaveBeenCalled();
        expect(mocks.createTaskMock).not.toHaveBeenCalled();
        expect(
          mocks.codexRpcMock.mock.calls.some(([, method]) =>
            ["thread/start", "turn/start"].includes(method),
          ),
        ).toBe(false);

        await animationFrames.flush();
        await waitFor(() => expect(mocks.createTaskMock).toHaveBeenCalledTimes(1));

        await act(async () => {
          resolveCreateTask({ id: 101 });
        });
        await waitFor(() =>
          expect(mocks.codexRpcMock).toHaveBeenCalledWith(
            7,
            "turn/start",
            expect.any(Object),
          ),
        );
        expect(screen.getAllByLabelText("Submitted prompt")).toHaveLength(1);
      } finally {
        animationFrames.restore();
      }
    });

  it("stops an optimistic run before deferred setup starts", async () => {
      prepareSignedInRun();

      const { user } = await renderApp();
      const animationFrames = holdNextAnimationFrames();
      await user.type(screen.getByLabelText("Prompt"), "Stop while preparing");
      try {
        await user.keyboard("{Enter}");

        expect(mocks.runPreflightMock).not.toHaveBeenCalled();
        expect(mocks.createTaskMock).not.toHaveBeenCalled();

        await user.click(screen.getByRole("button", { name: /stop codex/i }));

        expect(screen.getByLabelText("Prompt")).toHaveValue("");
        expect(
          within(screen.getByLabelText("Run summary")).getByText("Stopped by user."),
        ).toBeInTheDocument();
        expect(screen.queryByText("Queue paused")).not.toBeInTheDocument();
        expect(screen.getByText("Queued")).toBeInTheDocument();
        expect(mocks.stopCodexMock).not.toHaveBeenCalled();
        expect(mocks.runPreflightMock).not.toHaveBeenCalled();
        expect(mocks.createTaskMock).not.toHaveBeenCalled();
        expect(mocks.createRunMock).not.toHaveBeenCalled();
        expect(
          mocks.codexRpcMock.mock.calls.some(([, method]) =>
            ["thread/start", "turn/start"].includes(method),
          ),
        ).toBe(false);

        await animationFrames.flush();
        expect(mocks.runPreflightMock).not.toHaveBeenCalled();
        expect(mocks.createTaskMock).not.toHaveBeenCalled();
        expect(
          mocks.codexRpcMock.mock.calls.some(([, method]) =>
            ["thread/start", "turn/start"].includes(method),
          ),
        ).toBe(false);
      } finally {
        animationFrames.restore();
      }
    });

  it("marks the queued item failed when setup fails before a run is created", async () => {
      prepareSignedInRun();
      let rejectPreflight!: (error: Error) => void;
      mocks.runPreflightMock.mockReturnValueOnce(
        new Promise((_resolve, reject) => {
          rejectPreflight = reject;
        }),
      );

      const { user } = await renderApp();
      const promptInput = screen.getByLabelText("Prompt");
      await user.type(promptInput, "Try a failing setup");
      await user.keyboard("{Enter}");

      expect(promptInput).toHaveValue("");
      expect(screen.getByLabelText("Preparing run")).toHaveTextContent(
        "Preparing run...",
      );
      await waitFor(() => expect(mocks.runPreflightMock).toHaveBeenCalledTimes(1));
      await act(async () => {
        rejectPreflight(new Error("Preflight failed"));
      });
      expect(await screen.findByText("Preflight failed")).toBeInTheDocument();
      expect(screen.getByLabelText("Prompt")).toHaveValue("");
      expect(screen.queryByText("Queue paused")).not.toBeInTheDocument();
      expect(screen.getByText("Queued")).toBeInTheDocument();
      expect(mocks.failPromptQueueItemMock).toHaveBeenCalledWith(
        expect.any(String),
        "Preflight failed",
      );
      expect(mocks.createTaskMock).not.toHaveBeenCalled();
      expect(mocks.createRunMock).not.toHaveBeenCalled();
      expect(
        mocks.codexRpcMock.mock.calls.some(([, method]) =>
          ["thread/start", "turn/start"].includes(method),
        ),
      ).toBe(false);
    });

  it("ignores duplicate Enter submissions while optimistic setup is active", async () => {
      prepareSignedInRun();
      let resolveCreateTask!: (value: { id: number }) => void;
      mocks.createTaskMock.mockReturnValueOnce(
        new Promise((resolve) => {
          resolveCreateTask = resolve;
        }),
      );

      const { user } = await renderApp();
      await user.type(screen.getByLabelText("Prompt"), "Run only once");
      await user.keyboard("{Enter}{Enter}");

      await screen.findByLabelText("Task chat transcript");
      await waitFor(() => expect(mocks.createTaskMock).toHaveBeenCalledTimes(1));
      expect(screen.getAllByLabelText("Submitted prompt")).toHaveLength(1);

      await act(async () => {
        resolveCreateTask({ id: 101 });
      });
      await waitFor(() =>
        expect(mocks.codexRpcMock).toHaveBeenCalledWith(
          7,
          "turn/start",
          expect.any(Object),
        ),
      );
    });

  it("serializes distinct single-Enter queue submissions while a prior enqueue is pending", async () => {
      prepareSignedInRun();

      const { user } = await renderApp();
      await startMockRun(user, "Start the active task");

      let firstEnqueueInput: any;
      let resolveFirstEnqueue!: (item: PromptQueueItem) => void;
      mocks.enqueuePromptQueueItemMock.mockImplementationOnce(
        (input) =>
          new Promise<PromptQueueItem>((resolve) => {
            firstEnqueueInput = input;
            resolveFirstEnqueue = resolve;
          }),
      );

      const promptInput = screen.getByLabelText("Prompt");
      await user.type(promptInput, "Queue the first follow-up");
      await user.keyboard("{Enter}");
      await waitFor(() =>
        expect(mocks.enqueuePromptQueueItemMock).toHaveBeenCalledTimes(1),
      );

      await user.clear(promptInput);
      await user.type(promptInput, "Queue the second follow-up");
      await user.keyboard("{Enter}");
      expect(mocks.enqueuePromptQueueItemMock).toHaveBeenCalledTimes(1);

      await act(async () => {
        const firstItem = promptQueueItemFixture(firstEnqueueInput);
        mocks.promptQueueItems.set(firstItem.id, firstItem);
        resolveFirstEnqueue(firstItem);
        await Promise.resolve();
      });

      await waitFor(() =>
        expect(mocks.enqueuePromptQueueItemMock).toHaveBeenCalledTimes(2),
      );
      expect(
        mocks.enqueuePromptQueueItemMock.mock.calls.map(([input]) => input.prompt),
      ).toEqual([
        "Queue the first follow-up",
        "Queue the second follow-up",
      ]);
      await waitFor(() => expect(promptInput).toHaveValue(""));

      await user.click(screen.getByRole("button", { name: /^Queue/ }));
      expect(screen.getByText("Queue the first follow-up")).toBeInTheDocument();
      expect(screen.getByText("Queue the second follow-up")).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: /stop codex/i }));
    });

  it("edits a queued prompt in the composer without changing its queue position", async () => {
      prepareSignedInRun();
      const queuedCodexModel = {
        ...defaultCodexModel,
        id: "gpt-5.5-max",
        model: "gpt-5.5-max",
        displayName: "GPT-5.5 Max",
        supportedReasoningEfforts: [
          {
            reasoningEffort: "high",
            description: "Deeper reasoning",
          },
        ],
        defaultReasoningEffort: "high",
        isDefault: false,
      };
      mocks.listCodexModelsMock.mockResolvedValue([
        defaultCodexModel,
        queuedCodexModel,
      ]);

      const { user } = await renderApp();
      await startMockRun(user, "Start the active task");

      const promptInput = screen.getByLabelText("Prompt");
      await user.click(screen.getByRole("button", { name: "Plan mode" }));
      await user.click(screen.getByRole("combobox", { name: "Agent" }));
      await user.click(
        screen.getByRole("option", { name: queuedCodexModel.displayName }),
      );
      await waitFor(() =>
        expect(screen.getByRole("combobox", { name: "Reasoning" })).toHaveTextContent(
          "High",
        ),
      );
      await user.type(promptInput, "Original queued follow-up");
      await user.keyboard("{Enter}");
      await waitFor(() =>
        expect(mocks.enqueuePromptQueueItemMock).toHaveBeenCalledTimes(1),
      );
      await waitFor(() => expect(promptInput).toHaveValue(""));
      const queuedItemId =
        mocks.enqueuePromptQueueItemMock.mock.calls[0][0].id;
      const originalQueuePosition =
        mocks.promptQueueItems.get(queuedItemId)?.position;

      await user.click(screen.getByRole("combobox", { name: "Agent" }));
      await user.click(
        screen.getByRole("option", { name: defaultCodexModel.displayName }),
      );
      await user.click(screen.getByRole("combobox", { name: "Reasoning" }));
      await user.click(screen.getByRole("option", { name: "Medium" }));
      await waitFor(() =>
        expect(screen.getByRole("combobox", { name: "Reasoning" })).toHaveTextContent(
          "Medium",
        ),
      );
      await user.type(promptInput, "Keep this unrelated draft");
      await user.click(screen.getByRole("button", { name: /^Queue/ }));
      const originalQueuedActions = screen.getByRole("toolbar", {
        name: /Actions for queued prompt: Original queued follow-up/i,
      });
      await user.click(
        within(originalQueuedActions).getByRole("button", {
          name: "Edit queued prompt",
        }),
      );

      expect(
        screen.queryByRole("dialog", { name: /edit queued prompt/i }),
      ).not.toBeInTheDocument();
      expect(screen.queryByText("Editing queued prompt")).not.toBeInTheDocument();
      expect(promptInput).toHaveValue("Original queued follow-up");
      expect(screen.getByRole("button", { name: "Plan mode" })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      expect(screen.getByRole("button", { name: "Goal mode" })).toHaveAttribute(
        "aria-pressed",
        "false",
      );
      expect(screen.getByRole("combobox", { name: "Agent" })).toHaveTextContent(
        queuedCodexModel.displayName,
      );
      expect(
        screen.getByRole("combobox", { name: "Reasoning" }),
      ).toHaveTextContent("High");
      await waitFor(() => expect(promptInput).toHaveFocus());

      await user.click(screen.getByRole("button", { name: "Goal mode" }));
      await user.click(screen.getByRole("combobox", { name: "Agent" }));
      await user.click(
        screen.getByRole("option", { name: defaultCodexModel.displayName }),
      );
      await user.click(screen.getByRole("combobox", { name: "Reasoning" }));
      await user.click(screen.getByRole("option", { name: "Medium" }));
      await waitFor(() =>
        expect(screen.getByRole("combobox", { name: "Reasoning" })).toHaveTextContent(
          "Medium",
        ),
      );
      await user.clear(promptInput);
      await user.type(promptInput, "Refined queued follow-up");
      await user.keyboard("{Enter}");

      await waitFor(() =>
        expect(mocks.updatePromptQueueItemSnapshotMock).toHaveBeenCalledWith(
          queuedItemId,
          expect.objectContaining({
            prompt: "Refined queued follow-up",
            executionSettings: expect.objectContaining({
              mode: "run",
              intent: "normal",
              goalMode: true,
              model: defaultCodexModel.model,
              reasoningEffort: "medium",
            }),
          }),
        ),
      );
      expect(mocks.enqueuePromptQueueItemMock).toHaveBeenCalledTimes(1);
      expect(mocks.promptQueueItems.get(queuedItemId)).toEqual(
        expect.objectContaining({
          prompt: "Refined queued follow-up",
          position: originalQueuePosition,
        }),
      );
      await waitFor(() =>
        expect(promptInput).toHaveValue("Keep this unrelated draft"),
      );
      expect(screen.getByRole("button", { name: "Goal mode" })).toHaveAttribute(
        "aria-pressed",
        "false",
      );
      expect(screen.getByRole("button", { name: "Plan mode" })).toHaveAttribute(
        "aria-pressed",
        "false",
      );
      expect(screen.getByRole("combobox", { name: "Agent" })).toHaveTextContent(
        defaultCodexModel.displayName,
      );
      expect(
        screen.getByRole("combobox", { name: "Reasoning" }),
      ).toHaveTextContent("Medium");

      await user.click(screen.getByRole("button", { name: /^Queue/ }));
      const refinedQueuedActions = screen.getByRole("toolbar", {
        name: /Actions for queued prompt: Refined queued follow-up/i,
      });
      await user.click(
        within(refinedQueuedActions).getByRole("button", {
          name: "Edit queued prompt",
        }),
      );
      expect(screen.getByRole("button", { name: "Goal mode" })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      expect(screen.getByRole("combobox", { name: "Agent" })).toHaveTextContent(
        defaultCodexModel.displayName,
      );
      expect(
        screen.getByRole("combobox", { name: "Reasoning" }),
      ).toHaveTextContent("Medium");
      await user.click(screen.getByRole("button", { name: "Goal mode" }));
      expect(screen.getByRole("button", { name: "Goal mode" })).toHaveAttribute(
        "aria-pressed",
        "false",
      );
      expect(screen.getByRole("button", { name: "Plan mode" })).toHaveAttribute(
        "aria-pressed",
        "false",
      );
      await user.click(screen.getByRole("button", { name: "Plan mode" }));
      await user.click(screen.getByRole("combobox", { name: "Agent" }));
      await user.click(
        screen.getByRole("option", { name: queuedCodexModel.displayName }),
      );
      await user.clear(promptInput);
      await user.type(promptInput, "Do not save this edit");
      await user.keyboard("{Escape}");

      expect(mocks.updatePromptQueueItemSnapshotMock).toHaveBeenCalledTimes(1);
      expect(mocks.promptQueueItems.get(queuedItemId)?.prompt).toBe(
        "Refined queued follow-up",
      );
      expect(
        mocks.promptQueueItems.get(queuedItemId)?.snapshot.executionSettings,
      ).toEqual(
        expect.objectContaining({
          mode: "run",
          intent: "normal",
          goalMode: true,
          model: defaultCodexModel.model,
          reasoningEffort: "medium",
        }),
      );
      expect(promptInput).toHaveValue("Keep this unrelated draft");
      expect(screen.getByRole("button", { name: "Goal mode" })).toHaveAttribute(
        "aria-pressed",
        "false",
      );
      expect(screen.getByRole("button", { name: "Plan mode" })).toHaveAttribute(
        "aria-pressed",
        "false",
      );
      expect(screen.getByRole("combobox", { name: "Agent" })).toHaveTextContent(
        defaultCodexModel.displayName,
      );
      expect(
        screen.getByRole("combobox", { name: "Reasoning" }),
      ).toHaveTextContent("Medium");
    });

  it("steers a compatible queued normal prompt into the active turn", async () => {
      prepareSignedInRun();

      const { user } = await renderApp();
      await startMockRun(user, "Start the active task");

      await user.type(
        screen.getByLabelText("Prompt"),
        "Add this detail to the active task",
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
          7,
          "turn/steer",
          expect.objectContaining({
            threadId: "thread-1",
            expectedTurnId: "turn-1",
            input: [
              {
                type: "text",
                text: "Add this detail to the active task",
                text_elements: [],
              },
            ],
          }),
        ),
      );
      expect(mocks.appendRunEventMock).toHaveBeenCalledWith(
        expect.objectContaining({
          runId: 202,
          eventType: "client-action",
          method: "turn/steer",
        }),
      );
      expect(mocks.completePromptQueueItemMock).toHaveBeenCalledTimes(1);
      expect(screen.getByLabelText("Task chat transcript")).toHaveTextContent(
        "Add this detail to the active task",
      );

      await user.click(screen.getByRole("button", { name: /stop codex/i }));
    });

  it("automatically uses current context when a queued prompt becomes stale", async () => {
      prepareSignedInRun();
      let inspectionCount = 0;
      mocks.inspectPromptQueueContextMock.mockImplementation(
        async (workspacePath: string, paths: string[]) => {
          inspectionCount += 1;
          const changed = inspectionCount > 1;
          return {
            workspacePath,
            repositories: [
              {
                repositoryPath: workspacePath,
                branch: "main",
                headCommit: changed
                  ? "fedcba9876543210"
                  : "0123456789abcdef",
                worktreeFingerprint: changed ? "modified" : "clean",
              },
            ],
            files: paths.map((path) => ({
              path,
              canonicalPath: path,
              size: 128,
              modifiedAtMs: 1_750_000_000_000,
              available: true,
            })),
          };
        },
      );

      const { user } = await renderApp();
      await user.type(
        screen.getByLabelText("Prompt"),
        "Run with whichever context is current",
      );
      await user.keyboard("{Enter}");

      await waitFor(() =>
        expect(
          mocks.updatePromptQueueItemContextFingerprintMock,
        ).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            contextFingerprint: expect.objectContaining({
              repositories: [
                expect.objectContaining({
                  repositoryPath: workspace.path,
                  headCommit: "fedcba9876543210",
                  worktreeFingerprint: "modified",
                }),
              ],
            }),
          }),
        ),
      );
      expect(
        screen.queryByRole("dialog", { name: /review changed context/i }),
      ).not.toBeInTheDocument();
      await waitFor(() => expect(mocks.runPreflightMock).toHaveBeenCalled());
    });

  it("automatically refreshes current context before steering a queued prompt", async () => {
      prepareSignedInRun();

      const { user } = await renderApp();
      await startMockRun(user, "Start the active task");
      await user.type(
        screen.getByLabelText("Prompt"),
        "Steer using the latest workspace state",
      );
      await user.click(
        screen.getByRole("button", { name: "Add prompt to queue" }),
      );

      mocks.inspectPromptQueueContextMock.mockImplementation(
        async (workspacePath: string, paths: string[]) => ({
          workspacePath,
          repositories: [
            {
              repositoryPath: workspacePath,
              branch: "main",
              headCommit: "new-head-after-queueing",
              worktreeFingerprint: "modified-after-queueing",
            },
          ],
          files: paths.map((path) => ({
            path,
            canonicalPath: path,
            size: 128,
            modifiedAtMs: 1_750_000_000_000,
            available: true,
          })),
        }),
      );
      await user.click(screen.getByRole("button", { name: /^Queue/ }));
      await user.click(
        screen.getByRole("button", { name: "Send queued prompt now" }),
      );

      await waitFor(() =>
        expect(
          mocks.updatePromptQueueItemContextFingerprintMock,
        ).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            contextFingerprint: expect.objectContaining({
              repositories: [
                expect.objectContaining({
                  repositoryPath: workspace.path,
                  headCommit: "new-head-after-queueing",
                  worktreeFingerprint: "modified-after-queueing",
                }),
              ],
            }),
          }),
        ),
      );
      expect(
        screen.queryByRole("dialog", { name: /review changed context/i }),
      ).not.toBeInTheDocument();
      await waitFor(() =>
        expect(mocks.codexRpcMock).toHaveBeenCalledWith(
          7,
          "turn/steer",
          expect.objectContaining({
            input: [
              {
                type: "text",
                text: "Steer using the latest workspace state",
                text_elements: [],
              },
            ],
          }),
        ),
      );

      await user.click(screen.getByRole("button", { name: /stop codex/i }));
    });

  it("schedules a steering prompt next when the active turn finishes first", async () => {
      prepareSignedInRun();

      const { user } = await renderApp();
      await startMockRun(user, "Start the active task");
      await user.type(
        screen.getByLabelText("Prompt"),
        "Run this after the completion race",
      );
      await user.click(
        screen.getByRole("button", { name: "Add prompt to queue" }),
      );
      await user.click(screen.getByRole("button", { name: /^Queue/ }));
      mocks.codexRpcMock.mockRejectedValueOnce(
        new Error("turn is not active because it completed"),
      );
      await user.click(
        screen.getByRole("button", { name: "Send queued prompt now" }),
      );

      await waitFor(() =>
        expect(
          mocks.reschedulePromptQueueItemAfterSteeringRaceMock,
        ).toHaveBeenCalledTimes(1),
      );
      expect(screen.getByText("Next")).toBeInTheDocument();
      expect(mocks.failPromptQueueItemMock).not.toHaveBeenCalled();

      await user.click(screen.getByRole("button", { name: /stop codex/i }));
    });

  it("queues an Enter retry while terminal failure persistence is pending", async () => {
      prepareSignedInRun();
      let resolveFailedRunPersistence!: () => void;
      let failedPersistenceCalls = 0;
      let turnStartCalls = 0;
      mocks.createTaskMock
        .mockResolvedValueOnce({ id: 101 })
        .mockResolvedValueOnce({ id: 102 });
      mocks.createRunMock
        .mockResolvedValueOnce({ id: 202 })
        .mockResolvedValueOnce({ id: 203 });
      mocks.updateRunMock.mockImplementation(async (_runId, updates) => {
        if (updates.status === "failed" && failedPersistenceCalls === 0) {
          failedPersistenceCalls += 1;
          await new Promise<void>((resolve) => {
            resolveFailedRunPersistence = resolve;
          });
        }
      });
      mocks.codexRpcMock.mockImplementation(
        async (_accountId: number, method: string) => {
          if (method === "thread/start") {
            return { thread: { id: "thread-1" } };
          }
          if (method === "turn/start") {
            turnStartCalls += 1;
            if (turnStartCalls === 1) {
              throw new Error("First turn failed");
            }
            return { turn: { id: "turn-2" } };
          }
          return {};
        },
      );

      const { user } = await renderApp();
      await user.type(screen.getByLabelText("Prompt"), "Run the first attempt");
      await user.keyboard("{Enter}");

      await waitFor(() =>
        expect(mocks.updateRunMock).toHaveBeenCalledWith(
          202,
          expect.objectContaining({ status: "failed" }),
        ),
      );

      await user.type(screen.getByLabelText("Prompt"), "Run the retry");
      expect(screen.getByRole("button", { name: /run codex/i })).toBeEnabled();
      await user.keyboard("{Enter}");

      expect(screen.getByLabelText("Prompt")).toHaveValue("");
      expect(screen.getAllByLabelText("Submitted prompt")).toHaveLength(1);
      expect(turnStartCalls).toBe(1);

      await act(async () => {
        resolveFailedRunPersistence();
        await Promise.resolve();
      });
      await waitFor(() =>
        expect(screen.getByText("Queued")).toBeInTheDocument(),
      );
      expect(screen.queryByText("Queue paused")).not.toBeInTheDocument();
      expect(turnStartCalls).toBe(1);

      await user.click(
        screen.getByRole("button", { name: /^Queued/ }),
      );
      const failedActions = screen.getByRole("toolbar", {
        name: /Actions for queued prompt: Run the first attempt/i,
      });
      await user.click(
        within(failedActions).getByRole("button", {
          name: "Skip automatic sending",
        }),
      );
      await waitFor(() => expect(turnStartCalls).toBe(2));
      const submittedPrompts = screen.getAllByLabelText("Submitted prompt");
      expect(submittedPrompts).toHaveLength(2);
      expect(submittedPrompts[1]).toHaveTextContent("Run the retry");
      await user.click(screen.getByRole("button", { name: /stop codex/i }));
    });

  it("stops an active Codex run from the composer stop button", async () => {
      prepareSignedInRun();

      const { user } = await renderApp();
      await startMockRun(user, "Stop the live run");

      const stopButton = screen.getByRole("button", { name: /stop codex/i });
      expect(stopButton).toBeEnabled();
      await user.click(stopButton);

      await waitFor(() =>
        expect(mocks.codexRpcMock).toHaveBeenCalledWith(7, "turn/interrupt", {
          threadId: "thread-1",
          turnId: "turn-1",
        }),
      );
      await waitFor(() =>
        expect(mocks.updateRunMock).toHaveBeenCalledWith(
          202,
          expect.objectContaining({
            status: "interrupted",
            error: "Stopped by user.",
          }),
        ),
      );
      expect(mocks.updateTaskStatusMock).toHaveBeenCalledWith(101, "interrupted");
      expect(screen.queryByRole("button", { name: /stop codex/i })).not.toBeInTheDocument();
    });

  it("streams Codex output into the task chat transcript", async () => {
      prepareSignedInRun();

      const { user } = await renderApp();
      await startMockRun(user, "Fix the streaming output");

      const promptInput = screen.getByLabelText("Prompt") as HTMLTextAreaElement;
      await user.type(promptInput, "Prepare the follow-up while Codex streams");
      promptInput.setSelectionRange(11, 11);

      await emitCodexNotification({
        method: "item/agentMessage/delta",
        params: { delta: "Updated the auth flow." },
      });

      const transcript = screen.getByLabelText("Task chat transcript");
      expect(transcript).toBeInTheDocument();
      expect(within(transcript).getByLabelText("Submitted prompt")).toHaveTextContent(
        "Fix the streaming output",
      );
      await waitFor(() =>
        expect(
          within(transcript).getByText("Updated the auth flow."),
        ).toBeInTheDocument(),
      );
      expect(screen.getByLabelText("Prompt")).toBe(promptInput);
      expect(promptInput).toHaveValue("Prepare the follow-up while Codex streams");
      expect(promptInput.selectionStart).toBe(11);
      expect(promptInput.selectionEnd).toBe(11);
    });

  it("shows native multi-step progress without disturbing composer focus", async () => {
      prepareSignedInRun();

      const { user } = await renderApp();
      await startMockRun(user, "Implement the planned workspace changes");
      const promptInput = screen.getByLabelText("Prompt") as HTMLTextAreaElement;
      await user.type(promptInput, "Keep this follow-up draft");
      promptInput.setSelectionRange(9, 9);

      await emitCodexNotification({
        method: "turn/plan/updated",
        params: {
          threadId: "thread-1",
          turnId: "turn-1",
          plan: [
            { step: "Inspect the repository", status: "completed" },
            { step: "Implement the change", status: "in_progress" },
            { step: "Run verification", status: "pending" },
          ],
        },
      });

      const composer = screen.getByLabelText("Task composer");
      const progress = await within(composer).findByRole("status");
      expect(progress).toHaveTextContent("Step 2 / 3");
      expect(progress).toHaveTextContent("Implement the change");
      expect(promptInput).toHaveFocus();
      expect(promptInput.selectionStart).toBe(9);

      await emitCodexNotification({
        method: "thread/status/changed",
        params: {
          threadId: "thread-1",
          status: {
            type: "active",
            activeFlags: ["waitingOnApproval"],
          },
        },
      });
      expect(within(composer).getByRole("status")).toHaveTextContent(
        "Waiting for approval",
      );

      await emitCodexNotification({
        method: "turn/plan/updated",
        params: {
          threadId: "thread-1",
          turnId: "turn-1",
          plan: [
            { step: "Inspect the repository", status: "completed" },
            { step: "Implement the change", status: "completed" },
            { step: "Run verification", status: "completed" },
          ],
        },
      });
      expect(within(composer).queryByRole("status")).not.toBeInTheDocument();
      expect(promptInput).toHaveFocus();
      expect(promptInput).toHaveValue("Keep this follow-up draft");
    });

  it("replays plan progress received before the turn identity is bound", async () => {
      prepareSignedInRun();
      let resolveTurnStart!: (value: { turn: { id: string } }) => void;
      const turnStart = new Promise<{ turn: { id: string } }>((resolve) => {
        resolveTurnStart = resolve;
      });
      mocks.codexRpcMock.mockImplementation(
        async (_accountId: number, method: string) => {
          if (method === "thread/start") {
            return { thread: { id: "thread-early-progress" } };
          }
          if (method === "turn/start") {
            return turnStart;
          }
          return {};
        },
      );

      const { user } = await renderApp();
      await startMockRun(user, "Implement the approved plan");

      await emitCodexNotification({
        method: "turn/plan/updated",
        params: {
          threadId: "thread-early-progress",
          turnId: "turn-early-progress",
          plan: [
            { step: "Inspect the repository", status: "completed" },
            { step: "Implement the change", status: "inProgress" },
            { step: "Run verification", status: "pending" },
          ],
        },
      });

      await act(async () => {
        resolveTurnStart({ turn: { id: "turn-early-progress" } });
        await turnStart;
      });

      const composer = screen.getByLabelText("Task composer");
      const progress = await within(composer).findByRole("status");
      expect(progress).toHaveTextContent("Step 2 / 3");
      expect(progress).toHaveTextContent("Implement the change");
    });

  it("opens edited files in the diff drawer and undoes their exact saved patch", async () => {
      prepareSignedInRun();
      mocks.readWorkspaceGitDiffMock.mockResolvedValue({
        path: "/repo/orchestrator/README.md",
        relativePath: "README.md",
        sections: [],
      });

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

      expect(screen.queryByLabelText("Edited 1 file")).not.toBeInTheDocument();

      await emitCodexNotification({
        method: "turn/completed",
        params: { turn: { status: "completed", durationMs: 1234 } },
      });

      const summary = await screen.findByLabelText("Edited 1 file");
      await user.click(
        within(summary).getByRole("button", { name: "Review README.md" }),
      );

      await waitFor(() =>
        expect(mocks.readWorkspaceGitDiffMock).toHaveBeenCalledWith(
          workspace.path,
          "/repo/orchestrator/README.md",
          workspace.path,
        ),
      );
      const diffDrawer = screen.getByRole("complementary", {
        name: "File preview",
      });
      expect(
        within(diffDrawer).getByRole("heading", { name: "README.md" }),
      ).toBeInTheDocument();
      expect(within(diffDrawer).queryByText("Git diff")).not.toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Close file preview" }));

      await waitFor(() =>
        expect(within(screen.getByLabelText("Edited 1 file")).getByRole("button", {
          name: "Undo file changes",
        })).toBeEnabled(),
      );

      const completedSummary = screen.getByLabelText("Edited 1 file");
      await user.click(
        within(completedSummary).getByRole("button", {
          name: "Undo file changes",
        }),
      );
      await user.click(
        within(
          screen.getByRole("dialog", { name: "Undo changes?" }),
        ).getByRole("button", { name: "Undo changes" }),
      );

      await waitFor(() =>
        expect(mocks.undoWorkspaceGitDiffMock).toHaveBeenCalledWith(
          workspace.path,
          diff,
        ),
      );
      expect(within(completedSummary).queryByText("Changes undone.")).toBeNull();
      expect(
        within(completedSummary).getByRole("button", {
          name: "File changes undone",
        }),
      ).toBeDisabled();
    });
});
