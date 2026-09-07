import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, beforeEach, expect, it, vi } from "vitest";
import {
  appServices,
  getMocks,
  workspace,
  signedInAccount,
  signedInAccount2,
  defaultCodexModel,
  workspaceRunFixture,
  workspaceChatFixture,
  workspaceChatWithRunsFixture,
  externalTranscriptSnapshotFixture,
  prepareDefaults,
  renderApp,
  createContextFileDataTransfer,
  composerInputZone,
  holdNextAnimationFrames,
  prepareSignedInRun,
  startMockRun,
  emitCodexNotification,
  emitCodexServerRequest,
  setWindowWidth,
} from "./test/appRuntimeHarness";
import { ASK_FOR_APPROVAL_PERMISSION_PROFILE } from "./lib/codexAccess";
import {
  GENERATED_IMAGE_HANDLING_POLICY,
  PLAN_MODE_OUTPUT_POLICY,
} from "./lib/nativePlanMode";

const mocks = getMocks();

describe("Application runtime scenarios 3", () => {
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

  it("opens a multi-turn chat history row in the chat window", async () => {
      const historicalChat = workspaceChatFixture({
        id: 405,
        title: "Fix the app header",
        turn_count: 2,
        total_tokens: 2560,
        duration_ms: 90000,
      });
      const firstRun = workspaceRunFixture({
        id: 305,
        chat_id: historicalChat.id,
        turn_index: 1,
        original_prompt: "Fix the app header",
        final_message: "Header fixed.",
      });
      const secondRun = workspaceRunFixture({
        id: 306,
        chat_id: historicalChat.id,
        turn_index: 2,
        original_prompt: "Add the history button",
        final_message: "History button added. https://example.com/history",
      });
      mocks.listWorkspaceChatsMock.mockResolvedValue([historicalChat]);
      mocks.getChatWithRunsMock.mockResolvedValue(
        workspaceChatWithRunsFixture(historicalChat, [firstRun, secondRun]),
      );

      const { user } = await renderApp();
      const banner = screen.getByRole("region", { name: "Selected folder" });
      await user.click(
        within(banner).getByRole("button", { name: /open chat history/i }),
      );
      const drawer = await screen.findByRole("complementary", {
        name: "Workspace chat history",
      });

      expect(within(drawer).getByText(/2 turns/)).toBeInTheDocument();
      await user.click(within(drawer).getByRole("button", { name: /fix the app header/i }));

      const historyLink = await screen.findByRole("link", {
        name: "https://example.com/history",
      });
      const transcript = screen.getByLabelText("Task chat transcript");
      expect(within(transcript).getAllByLabelText("Submitted prompt")).toHaveLength(2);
      expect(transcript).toHaveTextContent("Fix the app header");
      expect(transcript).toHaveTextContent("Header fixed.");
      expect(transcript).toHaveTextContent("Add the history button");
      expect(transcript).toHaveTextContent("History button added.");
      await user.click(historyLink);
      expect(mocks.openUrlMock).toHaveBeenCalledOnce();
      expect(mocks.openUrlMock).toHaveBeenCalledWith(
        "https://example.com/history",
      );

      mocks.openUrlMock.mockRejectedValueOnce(new Error("browser unavailable"));
      await user.click(historyLink);
      await screen.findByText("Could not open link");
      await screen.findByText("browser unavailable");
      expect(mocks.openUrlMock).toHaveBeenCalledTimes(2);
    });

  it("opens persisted shared-chat turns without waiting for native synchronization", async () => {
      const sharedChat = {
        ...workspaceChatFixture({
          id: 406,
          title: "Shared task awaiting input",
          codex_thread_id: "shared-thread-pending",
          profile_key: "default",
          status: "running",
          turn_count: 1,
        }),
        account_id: null,
        account_label: null,
        account_email: null,
      };
      const localRun = workspaceRunFixture({
        id: 307,
        chat_id: sharedChat.id,
        codex_thread_id: "shared-thread-pending",
        codex_turn_id: "shared-turn-pending",
        original_prompt: "Choose the deployment target",
        final_message: "Waiting for your deployment choice.",
      });
      mocks.listWorkspaceChatsMock.mockResolvedValue([sharedChat]);
      mocks.getChatWithRunsMock.mockResolvedValue({
        chat: sharedChat,
        runs: [localRun],
      });
      mocks.syncDefaultProfileThreadTranscriptMock.mockReturnValue(
        new Promise(() => undefined),
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
          name: /shared task awaiting input/i,
        }),
      );

      expect(
        await screen.findByText("Waiting for your deployment choice."),
      ).toBeInTheDocument();
      expect(screen.queryByLabelText("Loading chat")).not.toBeInTheDocument();
      await waitFor(() =>
        expect(mocks.syncDefaultProfileThreadTranscriptMock).toHaveBeenCalledTimes(1),
      );
    });

  it("syncs, opens, and continues an external Codex chat through the default profile", async () => {
      const externalChat = {
        ...workspaceChatFixture({
          id: 501,
          title: "External VS Code task",
          codex_thread_id: "external-thread-1",
          origin: "codex_external",
          profile_key: "default",
          external_thread_id: "external-thread-1",
          source_kind: "vscode",
        }),
        account_id: null,
        account_label: null,
        account_email: null,
        turn_count: 1,
        total_tokens: 340,
      };
      mocks.listWorkspaceChatsMock.mockResolvedValue([externalChat]);
      mocks.syncDefaultProfileThreadTranscriptMock.mockResolvedValue({
        requestId: "transcript-sync-external-thread-1",
        threadId: "external-thread-1",
        sourceVersion: externalChat.external_updated_at ?? externalChat.updated_at,
        totalTurns: 1,
        turns: [
          {
            slotIndex: 0,
            turnId: "external-turn-1",
            prompt: "Prompt from VS Code",
            finalMessage: "Answer from the Codex extension.",
            error: null,
            status: "completed",
            startedAt: "2026-07-07T10:00:00Z",
            completedAt: "2026-07-07T10:02:00Z",
            durationMs: 120_000,
            totalTokens: 340,
            modelContextWindow: 128_000,
          },
        ],
      });
      mocks.codexDefaultProfileRpcMock.mockImplementation(async (method: string) => {
        if (method === "account/read") {
          return {
            account: {
              type: "chatgpt",
              email: "shared@example.com",
              planType: "pro",
            },
            requiresOpenaiAuth: false,
          };
        }
        if (method === "thread/list") {
          return {
            threads: [
              {
                id: "external-thread-1",
                preview: "External VS Code task",
                cwd: workspace.path,
                threadSource: "vscode",
                status: "completed",
                createdAt: "2026-07-07T10:00:00Z",
                updatedAt: "2026-07-07T10:02:00Z",
              },
            ],
          };
        }
        if (method === "thread/turns/list") {
          return {
            data: [
              {
                id: "external-turn-1",
                status: "completed",
                createdAt: "2026-07-07T10:00:00Z",
                completedAt: "2026-07-07T10:02:00Z",
                items: [
                  { type: "userMessage", text: "Prompt from VS Code" },
                  {
                    type: "agentMessage",
                    phase: "final_answer",
                    text: "Answer from the Codex extension.",
                  },
                ],
              },
            ],
            nextCursor: null,
          };
        }
        if (method === "turn/start") {
          return { turn: { id: "external-turn-2" } };
        }
        return {};
      });

      const { user } = await renderApp();
      const banner = screen.getByRole("region", { name: "Selected folder" });
      await user.click(
        within(banner).getByRole("button", { name: /open chat history/i }),
      );

      await waitFor(() =>
        expect(mocks.upsertExternalCodexChatsMock).toHaveBeenCalledWith([
          expect.objectContaining({
            externalThreadId: "external-thread-1",
            profileKey: "default",
            sourceKind: "vscode",
          }),
        ]),
      );
      const drawer = await screen.findByRole("complementary", {
        name: "Workspace chat history",
      });
      const row = within(drawer).getByRole("button", {
        name: /external vs code task/i,
      });
      expect(row).toHaveTextContent("VS Code");
      await user.click(row);

      const submittedPrompt = await screen.findByLabelText("Submitted prompt");
      const transcript = screen.getByLabelText("Task chat transcript");
      expect(submittedPrompt).toHaveTextContent("Prompt from VS Code");
      expect(transcript).toHaveTextContent("Answer from the Codex extension.");
      expect(mocks.syncDefaultProfileThreadTranscriptMock).toHaveBeenCalledWith(
        expect.objectContaining({
          threadId: "external-thread-1",
          pageSize: 20,
        }),
      );
      expect(
        mocks.codexDefaultProfileRpcMock.mock.calls.some(
          ([method]) => method === "thread/read",
        ),
      ).toBe(false);

      expect(mocks.loadDefaultProfileTurnActivityMock).not.toHaveBeenCalled();
      mocks.loadDefaultProfileTurnActivityMock.mockResolvedValueOnce({
        commands: [
          {
            id: "command-1",
            command: "npm test -- --run",
            status: "completed",
            durationMs: 1200,
          },
        ],
        editedFiles: [],
        nextCursor: null,
      });
      await user.click(within(transcript).getByLabelText("Run trace"));
      await waitFor(() =>
        expect(mocks.loadDefaultProfileTurnActivityMock).toHaveBeenCalledWith({
          threadId: "external-thread-1",
          turnId: "external-turn-1",
          cursor: null,
          limit: 50,
        }),
      );
      expect(await within(transcript).findByText("Ran 1 command")).toBeInTheDocument();

      await user.type(screen.getByLabelText("Prompt"), "Continue external thread");
      await user.click(screen.getByRole("button", { name: /run codex/i }));
      await waitFor(() =>
        expect(mocks.codexDefaultProfileRpcMock).toHaveBeenCalledWith(
          "turn/start",
          expect.objectContaining({
            threadId: "external-thread-1",
            approvalPolicy: "untrusted",
            approvalsReviewer: "user",
            permissions: ASK_FOR_APPROVAL_PERMISSION_PROFILE,
          }),
        ),
      );
      expect(mocks.codexDefaultProfileRpcMock).toHaveBeenCalledWith(
        "thread/resume",
        expect.objectContaining({
          threadId: "external-thread-1",
          cwd: workspace.path,
          approvalPolicy: "untrusted",
          approvalsReviewer: "user",
          config: {},
        }),
      );
      expect(
        mocks.codexRpcMock.mock.calls.some((call) => call[1] === "turn/start"),
      ).toBe(false);
      expect(mocks.createRunMock).toHaveBeenCalledWith(
        expect.objectContaining({
          accountId: null,
          accountLabel: "Codex default profile",
          chatId: 501,
          turnIndex: 2,
        }),
      );
    });

  it("starts new shared chats as persistent default-profile Codex threads", async () => {
      const sharedWorkspace = {
        ...workspace,
        default_account_id: null,
        default_profile_key: "default",
      };
      mocks.listWorkspacesMock.mockResolvedValue([sharedWorkspace]);
      mocks.createChatMock.mockResolvedValue({
        ...workspaceChatFixture({
          id: 511,
          title: "Share a new task",
          status: "starting",
        }),
        account_id: null,
        profile_key: "default",
        codex_thread_id: null,
      });
      let sharedThreadCwd = sharedWorkspace.path;
      mocks.codexDefaultProfileRpcMock.mockImplementation(
        async (method: string, params?: Record<string, unknown>) => {
          if (method === "account/read") {
            return {
              account: {
                type: "chatgpt",
                email: "shared@example.com",
                planType: "pro",
              },
              requiresOpenaiAuth: false,
            };
          }
          if (method === "model/list") {
            return { data: [defaultCodexModel], nextCursor: null };
          }
          if (method === "thread/list") {
            return { threads: [] };
          }
          if (method === "thread/start") {
            sharedThreadCwd = String(params?.cwd ?? sharedWorkspace.path);
            const environment = Array.isArray(params?.environments)
              ? (params.environments[0] as
                  | {
                      cwd?: string;
                      runtimeWorkspaceRoots?: string[];
                    }
                  | undefined)
              : undefined;
            return {
              thread: { id: "shared-thread-1", cwd: sharedThreadCwd },
              cwd: environment?.cwd ?? sharedThreadCwd,
              runtimeWorkspaceRoots:
                environment?.runtimeWorkspaceRoots ??
                (Array.isArray(params?.runtimeWorkspaceRoots)
                  ? params.runtimeWorkspaceRoots
                  : []),
            };
          }
          if (method === "thread/read") {
            return {
              thread: {
                id: params?.threadId,
                cwd: sharedThreadCwd,
              },
            };
          }
          if (method === "fs/getMetadata") {
            return { isDirectory: true };
          }
          if (method === "command/exec") {
            return {
              exitCode: 0,
              stdout: `${String(params?.cwd ?? sharedWorkspace.path)}\n`,
              stderr: "",
            };
          }
          if (method === "turn/start") {
            return { turn: { id: "shared-turn-1" } };
          }
          return {};
        },
      );

      const { user } = await renderApp();
      await user.type(screen.getByLabelText("Prompt"), "Share this task with Codex");
      await user.click(screen.getByRole("button", { name: /run codex/i }));

      await waitFor(() =>
        expect(mocks.codexDefaultProfileRpcMock).toHaveBeenCalledWith(
          "thread/start",
          expect.objectContaining({
            cwd: sharedWorkspace.path,
            ephemeral: false,
            threadSource: "orchestrator",
          }),
        ),
      );
      const verificationIndex = mocks.codexDefaultProfileRpcMock.mock.calls.findIndex(
        ([method, params]) =>
          method === "thread/read" && params?.threadId === "shared-thread-1",
      );
      const titleIndex = mocks.codexDefaultProfileRpcMock.mock.calls.findIndex(
        ([method]) => method === "thread/name/set",
      );
      const turnIndex = mocks.codexDefaultProfileRpcMock.mock.calls.findIndex(
        ([method]) => method === "turn/start",
      );
      expect(verificationIndex).toBeGreaterThanOrEqual(0);
      expect(titleIndex).toBeGreaterThan(verificationIndex);
      expect(turnIndex).toBeGreaterThan(titleIndex);
      expect(
        mocks.codexDefaultProfileRpcMock.mock.calls.some(([method]) =>
          ["project/list", "project/create", "thread/metadata/update"].includes(
            method,
          ),
        ),
      ).toBe(false);
      expect(mocks.codexDefaultProfileRpcMock).toHaveBeenCalledWith(
        "turn/start",
        expect.objectContaining({ threadId: "shared-thread-1" }),
      );
      expect(mocks.createChatMock).toHaveBeenCalledWith(
        expect.objectContaining({ accountId: null }),
      );
      expect(mocks.createChatWithQueuedPromptMock).toHaveBeenCalledWith(
        expect.objectContaining({
          accountId: null,
          snapshot: expect.objectContaining({
            executionSettings: expect.objectContaining({ profileKey: "default" }),
          }),
        }),
      );
    });

  it("fails shared-profile run setup cleanly when account/read returns malformed auth", async () => {
      const sharedWorkspace = {
        ...workspace,
        default_account_id: null,
        default_profile_key: "default",
      };
      mocks.listWorkspacesMock.mockResolvedValue([sharedWorkspace]);
      mocks.codexDefaultProfileRpcMock.mockImplementation(
        async (method: string, params?: Record<string, unknown>) => {
          if (method === "account/read") {
            if (params?.refreshToken === false) {
              return {
                account: {
                  type: "chatgpt",
                  email: "shared@example.com",
                  planType: "pro",
                },
                requiresOpenaiAuth: false,
              };
            }
            return undefined;
          }
          if (method === "model/list") {
            return { data: [defaultCodexModel], nextCursor: null };
          }
          if (method === "thread/list") {
            return { threads: [] };
          }
          if (method === "thread/start") {
            return { thread: { id: "shared-thread-1" } };
          }
          if (method === "thread/name/set") {
            return {};
          }
          if (method === "thread/read") {
            return {
              thread: {
                id: params?.threadId,
                cwd: sharedWorkspace.path,
              },
            };
          }
          if (method === "command/exec") {
            return {
              exitCode: 0,
              stdout: `${String(params?.cwd ?? sharedWorkspace.path)}\n`,
              stderr: "",
            };
          }
          if (method === "turn/start") {
            return { turn: { id: "shared-turn-1" } };
          }
          return {};
        },
      );

      const { user } = await renderApp();
      await user.type(screen.getByLabelText("Prompt"), "Share this task with Codex");
      await user.click(screen.getByRole("button", { name: /run codex/i }));

      expect(screen.getByLabelText("Preparing run")).toHaveTextContent(
        "Preparing run...",
      );
      expect(
        await screen.findByLabelText("Run error"),
      ).toHaveTextContent(
        "Sign in to the Codex app account before starting this shared chat.",
      );
      expect(
        mocks.codexDefaultProfileRpcMock.mock.calls.some(
          ([method]) => method === "account/read",
        ),
      ).toBe(true);
      expect(
        mocks.codexDefaultProfileRpcMock.mock.calls.some(
          ([method]) => method === "thread/start" || method === "turn/start",
        ),
      ).toBe(false);
      expect(mocks.createRunMock).not.toHaveBeenCalled();
    });

  it("adopts an external chat into a managed account without losing imported turns", async () => {
      prepareSignedInRun();
      mocks.codexDefaultProfileRpcMock.mockImplementation(
        async (method: string, params?: Record<string, unknown>) => {
          if (method === "account/read") {
            return {
              account: {
                type: "chatgpt",
                email: signedInAccount.email,
                planType: signedInAccount.plan_type,
              },
              requiresOpenaiAuth: false,
            };
          }
          if (method === "model/list") {
            return { data: [defaultCodexModel], nextCursor: null };
          }
          if (method === "thread/list") {
            return { threads: [] };
          }
          if (method === "thread/start") {
            return { thread: { id: "thread-1" } };
          }
          if (method === "thread/name/set") {
            return {};
          }
          if (method === "thread/read") {
            return {
              thread: {
                id: params?.threadId,
                cwd: workspace.path,
              },
            };
          }
          if (method === "turn/start") {
            return { turn: { id: "turn-1" } };
          }
          return {};
        },
      );
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
      mocks.listCodexModelsMock.mockResolvedValue([defaultCodexModel]);
      const sourceVersion = "2026-07-07T10:02:00Z";
      const externalChat = {
        ...workspaceChatFixture({
          id: 502,
          title: "Imported browser task",
          codex_thread_id: "external-thread-2",
          origin: "codex_external",
          profile_key: "default",
          external_thread_id: "external-thread-2",
          source_kind: "vscode",
          turn_count: 1,
        }),
        account_id: null,
        account_label: null,
        account_email: null,
        sync_status: "synced",
        external_updated_at: sourceVersion,
      };
      const externalSnapshot = {
        ...externalTranscriptSnapshotFixture(1),
        threadId: "external-thread-2",
        sourceVersion,
        turns: [
          {
            ...externalTranscriptSnapshotFixture(1).turns[0],
            prompt: "Build the imported browser shell",
            finalMessage: "Created the imported browser shell.",
          },
        ],
      };
      mocks.listWorkspaceChatsMock.mockResolvedValue([externalChat]);
      mocks.getChatWithRunsMock.mockResolvedValue({
        chat: externalChat,
        runs: [],
      });
      mocks.readExternalTranscriptSnapshotMock.mockResolvedValue(
        externalSnapshot,
      );
      mocks.codexRpcMock.mockImplementation(
        async (accountId: number, method: string) => {
          if (method === "thread/start") {
            expect(accountId).toBe(8);
            return { thread: { id: "managed-thread-2" } };
          }
          if (method === "turn/start") {
            return { turn: { id: "managed-turn-1" } };
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
        within(drawer).getByRole("button", { name: /imported browser task/i }),
      );
      await screen.findByText("Created the imported browser shell.");

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
      await user.type(screen.getByLabelText("Prompt"), "Add session restore");
      await user.keyboard("{Enter}");

      await waitFor(() =>
        expect(mocks.activateChatAccountHandoffMock).toHaveBeenCalledWith({
          chatId: 502,
          expectedProfileKey: "default",
          expectedThreadId: "external-thread-2",
          accountId: 8,
          profileKey: "account:8",
          codexThreadId: "managed-thread-2",
          status: "running",
        }),
      );
      expect(mocks.syncDefaultProfileThreadTranscriptMock).not.toHaveBeenCalled();
      expect(
        mocks.codexDefaultProfileRpcMock.mock.calls.some(
          ([method]) => method === "thread/resume" || method === "turn/start",
        ),
      ).toBe(false);
      const handoffTurn = mocks.codexRpcMock.mock.calls.find(
        ([accountId, method]) => accountId === 8 && method === "turn/start",
      );
      expect(
        (
          handoffTurn?.[2] as {
            additionalContext?: Record<string, { value?: string }>;
          }
        )?.additionalContext?.["chat:previous-turns"]?.value,
      ).toContain("Created the imported browser shell.");
    });

  it("renders an external proposed-plan envelope as a read-only native Plan", async () => {
      const markdown = "# External plan\n\n## Steps\n- Inspect the workspace.";
      const externalChat = {
        ...workspaceChatFixture({
          id: 511,
          title: "External proposed plan",
          codex_thread_id: "external-plan-thread",
          origin: "codex_external",
          profile_key: "default",
          external_thread_id: "external-plan-thread",
          source_kind: "vscode",
        }),
        account_id: null,
        account_label: null,
        account_email: null,
      };
      mocks.listWorkspaceChatsMock.mockResolvedValue([externalChat]);
      mocks.syncDefaultProfileThreadTranscriptMock.mockResolvedValue({
        requestId: "transcript-sync-external-plan",
        threadId: "external-plan-thread",
        sourceVersion: externalChat.external_updated_at ?? externalChat.updated_at,
        totalTurns: 1,
        turns: [
          {
            slotIndex: 0,
            turnId: "external-plan-turn",
            prompt: "Create a plan",
            finalMessage: `<proposed_plan>\n${markdown}\n</proposed_plan>`,
            error: null,
            status: "completed",
            startedAt: "2026-07-07T10:00:00Z",
            completedAt: "2026-07-07T10:01:00Z",
            durationMs: 60_000,
            totalTokens: 340,
            modelContextWindow: 128_000,
          },
        ],
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
        within(drawer).getByRole("button", { name: /external proposed plan/i }),
      );

      const plan = await screen.findByLabelText("Codex plan");
      expect(
        within(plan).getByRole("heading", { name: "External plan" }),
      ).toBeInTheDocument();
      expect(within(plan).getByText("Completed plan")).toBeInTheDocument();
      expect(
        within(plan).queryByRole("button", { name: "Accept plan" }),
      ).not.toBeInTheDocument();
      expect(screen.queryByText(/<proposed_plan>/)).not.toBeInTheDocument();
    });

  it("shows upgrade guidance instead of falling back to unbounded external history", async () => {
      const externalChat = {
        ...workspaceChatFixture({
          id: 502,
          title: "Unsupported external history",
          codex_thread_id: "external-thread-unsupported",
          origin: "codex_external",
          profile_key: "default",
          external_thread_id: "external-thread-unsupported",
          source_kind: "vscode",
        }),
        account_id: null,
        account_label: null,
        account_email: null,
      };
      mocks.listWorkspaceChatsMock.mockResolvedValue([externalChat]);
      mocks.syncDefaultProfileThreadTranscriptMock.mockRejectedValue(
        new Error("method not found"),
      );
      mocks.codexDefaultProfileRpcMock.mockImplementation(async (method: string) => {
        if (method === "thread/list") {
          return { threads: [] };
        }
        if (method === "thread/turns/list") {
          throw new Error("method not found");
        }
        return {};
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
        within(drawer).getByRole("button", { name: /unsupported external history/i }),
      );

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Paged Codex history is unavailable. Update Codex and try again.",
      );
      expect(
        mocks.codexDefaultProfileRpcMock.mock.calls.some(
          ([method]) => method === "thread/read",
        ),
      ).toBe(false);
    });

  it("opens a chat history row with keyboard activation", async () => {
      const historicalChat = workspaceChatFixture({
        id: 402,
        title: "Keyboard open chat",
      });
      const historicalRun = workspaceRunFixture({
        id: 302,
        chat_id: historicalChat.id,
        original_prompt: "Keyboard open chat",
        final_message: "Opened from keyboard.",
      });
      mocks.listWorkspaceChatsMock.mockResolvedValue([historicalChat]);
      mocks.getChatWithRunsMock.mockResolvedValue(
        workspaceChatWithRunsFixture(historicalChat, [historicalRun]),
      );

      const { user } = await renderApp();
      const banner = screen.getByRole("region", { name: "Selected folder" });
      await user.click(
        within(banner).getByRole("button", { name: /open chat history/i }),
      );
      const drawer = await screen.findByRole("complementary", {
        name: "Workspace chat history",
      });
      const row = within(drawer).getByRole("button", {
        name: /keyboard open chat/i,
      });

      row.focus();
      await user.keyboard("{Enter}");

      await waitFor(() => expect(drawer).toHaveClass("closed"));
      expect(await screen.findByText("Opened from keyboard.")).toBeInTheDocument();
    });

  it("removes a chat from history through the row context menu", async () => {
      const activeChat = workspaceChatFixture({
        id: 401,
        title: "Fix the app header",
      });
      // Background reconciliation may refresh history before the user deletes
      // anything. Model persisted state, not an assumed number of list reads.
      mocks.listWorkspaceChatsMock.mockResolvedValue([activeChat]);
      mocks.softDeleteChatMock.mockImplementation(async () => {
        mocks.listWorkspaceChatsMock.mockResolvedValue([]);
      });

      const { user } = await renderApp();
      const banner = screen.getByRole("region", { name: "Selected folder" });
      await user.click(
        within(banner).getByRole("button", { name: /open chat history/i }),
      );
      const drawer = await screen.findByRole("complementary", {
        name: "Workspace chat history",
      });
      const row = within(drawer)
        .getByText("Fix the app header")
        .closest(".history-run-item");
      expect(row).toBeInstanceOf(HTMLElement);

      fireEvent.contextMenu(row as HTMLElement, { clientX: 120, clientY: 140 });
      expect(screen.queryByLabelText("Task chat transcript")).not.toBeInTheDocument();
      expect(
        screen.getByRole("menu", { name: /fix the app header chat actions/i }),
      ).toHaveClass("workspace-context-menu");
      expect(
        screen.getByRole("menu", { name: /fix the app header chat actions/i })
          .parentElement,
      ).toBe(document.body);
      expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual([
        "Rename chat",
        "Continue in new chat",
        "Continue in new worktree",
        "Continue in Codex",
        "Remove chat",
      ]);
      fireEvent.keyDown(window, { key: "Escape" });
      await waitFor(() =>
        expect(
          screen.queryByRole("menu", { name: /fix the app header chat actions/i }),
        ).not.toBeInTheDocument(),
      );

      fireEvent.contextMenu(row as HTMLElement, {
        clientX: window.innerWidth - 1,
        clientY: window.innerHeight - 1,
      });
      expect(
        screen.getByRole("menu", { name: /fix the app header chat actions/i }),
      ).toHaveStyle({
        left: `${window.innerWidth - 248 - 8}px`,
        top: `${window.innerHeight - 190 - 8}px`,
      });
      fireEvent.keyDown(window, { key: "Escape" });

      fireEvent.contextMenu(row as HTMLElement, { clientX: 120, clientY: 140 });
      fireEvent.pointerDown(document.body);
      await waitFor(() =>
        expect(
          screen.queryByRole("menu", { name: /fix the app header chat actions/i }),
        ).not.toBeInTheDocument(),
      );

      fireEvent.contextMenu(row as HTMLElement, { clientX: 120, clientY: 140 });
      const removeMenuItem = screen.getByRole("menuitem", { name: /remove chat/i });
      expect(removeMenuItem).toHaveClass("workspace-context-menu-item", "danger");
      await user.click(removeMenuItem);

      const dialog = screen.getByRole("dialog", { name: "Remove chat?" });
      expect(
        within(dialog).getByText(/not permanently deleted/i),
      ).toBeInTheDocument();
      await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
      expect(mocks.softDeleteChatMock).not.toHaveBeenCalled();
      expect(screen.queryByRole("dialog", { name: "Remove chat?" })).not.toBeInTheDocument();

      fireEvent.contextMenu(row as HTMLElement, { clientX: 120, clientY: 140 });
      await user.click(screen.getByRole("menuitem", { name: /remove chat/i }));
      await user.click(
        within(screen.getByRole("dialog", { name: "Remove chat?" })).getByRole(
          "button",
          { name: "Remove chat" },
        ),
      );

      await waitFor(() => expect(mocks.softDeleteChatMock).toHaveBeenCalledWith(401));
      await waitFor(() =>
        expect(within(drawer).queryByText("Fix the app header")).not.toBeInTheDocument(),
      );
    });

  it("continues a shared task through a workspace-scoped Codex Desktop handoff", async () => {
    const sharedChat = workspaceChatFixture({
      id: 402,
      title: "Shared desktop task",
      codex_thread_id: "01a01afb-ee70-7372-8e68-b7128ad9c194",
      profile_key: "default",
    });
    mocks.listWorkspaceChatsMock.mockResolvedValue([sharedChat]);
    mocks.getChatRecordMock.mockResolvedValue(sharedChat);
    mocks.codexDefaultProfileRpcMock.mockImplementation(
      async (method: string, params?: Record<string, unknown>) => {
        if (method === "thread/resume") {
          return { thread: { id: params?.threadId, cwd: params?.cwd } };
        }
        if (method === "thread/read") {
          return {
            thread: {
              id: params?.threadId,
              cwd: workspace.path,
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
    const row = within(drawer)
      .getByText("Shared desktop task")
      .closest(".history-run-item");
    expect(row).toBeInstanceOf(HTMLElement);

    fireEvent.contextMenu(row as HTMLElement, { clientX: 120, clientY: 140 });
    await user.click(
      screen.getByRole("menuitem", { name: "Continue in Codex" }),
    );

    await waitFor(() =>
      expect(mocks.codexDefaultProfileRpcMock).toHaveBeenCalledWith(
        "thread/read",
        {
          threadId: sharedChat.codex_thread_id,
          includeTurns: false,
        },
      ),
    );
    expect(mocks.codexDefaultProfileRpcMock).toHaveBeenCalledWith(
      "thread/name/set",
      {
        threadId: sharedChat.codex_thread_id,
        name: sharedChat.title,
      },
    );
    expect(
      mocks.codexDefaultProfileRpcMock.mock.calls.some(
        ([method, params]) => method === "thread/resume" && "cwd" in (params ?? {}),
      ),
    ).toBe(false);
    expect(mocks.saveNativeWorkspaceBindingMock).toHaveBeenCalledWith(
      expect.objectContaining({
        chatId: sharedChat.id,
        status: "ready",
        binding: expect.objectContaining({
          sourceWorkspacePath: workspace.path,
          sourceRootAssociation: "source-root",
        }),
      }),
    );
    expect(mocks.activateSharedNativeWorkspaceBindingMock).not.toHaveBeenCalled();
    expect(
      mocks.codexDefaultProfileRpcMock.mock.calls.some(([method]) =>
        ["project/list", "project/create", "thread/fork", "thread/metadata/update"].includes(
          method,
        ),
      ),
    ).toBe(false);
  });

  it("renames the chat targeted by the history context menu", async () => {
      const chat = workspaceChatFixture({
        id: 405,
        title: "Original title",
      });
      mocks.listWorkspaceChatsMock.mockResolvedValue([chat]);
      mocks.renameChatMock.mockImplementationOnce(async (_chatId, title) => {
        mocks.listWorkspaceChatsMock.mockResolvedValue([{ ...chat, title }]);
      });

      const { user } = await renderApp();
      const banner = screen.getByRole("region", { name: "Selected folder" });
      await user.click(
        within(banner).getByRole("button", { name: /open chat history/i }),
      );
      const drawer = await screen.findByRole("complementary", {
        name: "Workspace chat history",
      });
      const row = within(drawer)
        .getByText("Original title")
        .closest(".history-run-item");

      fireEvent.contextMenu(row as HTMLElement, { clientX: 120, clientY: 140 });
      await user.click(screen.getByRole("menuitem", { name: "Rename chat" }));
      const dialog = screen.getByRole("dialog", { name: "Rename chat" });
      const input = within(dialog).getByRole("textbox", { name: "Title" });
      await user.clear(input);
      await user.type(input, "Focused continuation work");
      await user.click(
        within(dialog).getByRole("button", { name: "Save chat title" }),
      );

      await waitFor(() =>
        expect(mocks.renameChatMock).toHaveBeenCalledWith(
          405,
          "Focused continuation work",
        ),
      );
      expect(within(drawer).getByText("Focused continuation work")).toBeInTheDocument();
    });

  it("switches to another history chat while a run remains active", async () => {
      prepareSignedInRun();
      const historicalChat = workspaceChatFixture({
        id: 403,
        title: "Old chat",
      });
      const historicalRun = workspaceRunFixture({
        id: 303,
        chat_id: historicalChat.id,
        original_prompt: "Old chat",
        final_message: "Old result.",
      });
      mocks.listWorkspaceChatsMock.mockResolvedValue([historicalChat]);
      mocks.getChatWithRunsMock.mockResolvedValue(
        workspaceChatWithRunsFixture(historicalChat, [historicalRun]),
      );

      const { user } = await renderApp();
      await user.type(screen.getByLabelText("Prompt"), "Current active run");
      await user.keyboard("{Enter}");

      const transcript = await screen.findByLabelText("Task chat transcript");
      expect(within(transcript).getByLabelText("Submitted prompt")).toHaveTextContent(
        "Current active run",
      );
      const banner = screen.getByRole("region", { name: "Selected folder" });
      await user.click(
        within(banner).getByRole("button", { name: /open chat history/i }),
      );
      const drawer = await screen.findByRole("complementary", {
        name: "Workspace chat history",
      });
      const row = within(drawer).getByRole("button", { name: /old chat/i });
      expect(row).not.toHaveAttribute("aria-disabled");

      await user.click(row);

      expect(await screen.findByText("Old result.")).toBeInTheDocument();
      expect(screen.queryByText("Current active run")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: /run codex/i })).toBeInTheDocument();
    });

  it("surfaces a routed approval below the header outside the composer", async () => {
      prepareSignedInRun();
      const historicalChat = workspaceChatFixture({
        id: 403,
        title: "Old chat",
      });
      const historicalRun = workspaceRunFixture({
        id: 303,
        chat_id: historicalChat.id,
        original_prompt: "Old chat",
        final_message: "Old result.",
      });
      mocks.listWorkspaceChatsMock.mockResolvedValue([historicalChat]);
      mocks.getChatWithRunsMock.mockResolvedValue(
        workspaceChatWithRunsFixture(historicalChat, [historicalRun]),
      );

      const { user } = await renderApp();
      await startMockRun(user, "Current active run");
      const banner = screen.getByRole("region", { name: "Selected folder" });
      await user.click(
        within(banner).getByRole("button", { name: /open chat history/i }),
      );
      await user.click(
        within(
          await screen.findByRole("complementary", {
            name: "Workspace chat history",
          }),
        ).getByRole("button", { name: /old chat/i }),
      );

      await emitCodexServerRequest(
        {
          id: 13,
          method: "item/commandExecution/requestApproval",
          params: {
            threadId: "thread-1",
            turnId: "turn-1",
            command: "npm run release",
            availableDecisions: ["accept", "cancel"],
          },
        },
        { requestToken: "server-request-7-1-13" },
      );

      const openApprovalChat = screen.getByRole("button", {
        name: "Open chat awaiting approval",
      });
      await user.click(screen.getByRole("button", { name: "Analytics" }));
      expect(
        screen.getByRole("button", { name: "Open chat awaiting approval" }),
      ).toBe(openApprovalChat);
      expect(
        openApprovalChat.closest(".floating-header-status-bubble"),
      ).not.toBeNull();
      expect(openApprovalChat.closest(".composer-panel")).toBeNull();
      expect(openApprovalChat.closest(".application-status-anchor")).not.toBeNull();
      expect(openApprovalChat.closest(".task-hero")).toBeNull();
      await user.click(openApprovalChat);

      const approvalCard = await screen.findByRole("article", {
        name: "Codex needs approval to run a command",
      });
      expect(screen.getByLabelText("Submitted prompt")).toHaveTextContent(
        "Current active run",
      );
      await waitFor(() => expect(approvalCard).toHaveFocus());
      expect(
        screen.queryByRole("button", {
          name: "Open chat awaiting approval",
        }),
      ).not.toBeInTheDocument();

      await user.click(
        within(approvalCard).getByRole("button", { name: "Approve once" }),
      );
      await waitFor(() =>
        expect(mocks.resolveCodexServerRequestMock).toHaveBeenCalledWith(
          7,
          13,
          "server-request-7-1-13",
          expect.any(Object),
        ),
      );
    });

  it("removes a cross-chat approval notice when its turn completes", async () => {
      prepareSignedInRun();
      const historicalChat = workspaceChatFixture({
        id: 403,
        title: "Old chat",
      });
      const historicalRun = workspaceRunFixture({
        id: 303,
        chat_id: historicalChat.id,
        original_prompt: "Old chat",
        final_message: "Old result.",
      });
      mocks.listWorkspaceChatsMock.mockResolvedValue([historicalChat]);
      mocks.getChatWithRunsMock.mockResolvedValue(
        workspaceChatWithRunsFixture(historicalChat, [historicalRun]),
      );

      const { user } = await renderApp();
      await startMockRun(user, "Current active run");
      const banner = screen.getByRole("region", { name: "Selected folder" });
      await user.click(
        within(banner).getByRole("button", { name: /open chat history/i }),
      );
      await user.click(
        within(
          await screen.findByRole("complementary", {
            name: "Workspace chat history",
          }),
        ).getByRole("button", { name: /old chat/i }),
      );
      await emitCodexServerRequest({
        id: 14,
        method: "item/commandExecution/requestApproval",
        params: {
          threadId: "thread-1",
          turnId: "turn-1",
          command: "npm run release",
          availableDecisions: ["accept", "cancel"],
        },
      });
      expect(
        screen.getByRole("button", {
          name: "Open chat awaiting approval",
        }),
      ).toBeInTheDocument();

      await emitCodexNotification({
        method: "turn/completed",
        params: {
          threadId: "thread-1",
          turn: {
            id: "turn-1",
            status: "failed",
            durationMs: 1_000,
            error: "Turn ended before approval.",
          },
        },
      });

      await waitFor(() =>
        expect(
          screen.queryByRole("button", {
            name: "Open chat awaiting approval",
          }),
        ).not.toBeInTheDocument(),
      );
    });

  it("scopes active agents to their chats across workspace switches", async () => {
      const mobileWorkspace = {
        ...workspace,
        id: 2,
        path: "/repo/mobile-client",
        label: "mobile-client",
      };
      const chatsByWorkspace = new Map<
        number,
        Omit<ReturnType<typeof workspaceChatFixture>, "codex_thread_id"> & {
          codex_thread_id: string | null;
        }
      >();
      let threadSequence = 0;
      let taskSequence = 100;
      let runSequence = 200;

      prepareSignedInRun();
      mocks.listWorkspacesMock.mockResolvedValue([workspace, mobileWorkspace]);
      mocks.createChatMock.mockImplementation(async (input: { workspaceId: number; title: string }) => {
        const id = 400 + input.workspaceId;
        const chat = {
          ...workspaceChatFixture({
            id,
            title: input.title,
            status: "running",
            turn_count: 1,
          }),
          workspace_id: input.workspaceId,
          codex_thread_id: null,
        };
        chatsByWorkspace.set(input.workspaceId, chat);
        return chat;
      });
      mocks.listWorkspaceChatsMock.mockImplementation(async (workspaceId: number) => {
        const chat = chatsByWorkspace.get(workspaceId);
        return chat ? [chat] : [];
      });
      mocks.createTaskMock.mockImplementation(async () => ({ id: ++taskSequence }));
      mocks.createRunMock.mockImplementation(async () => ({ id: ++runSequence }));
      mocks.codexRpcMock.mockImplementation(
        async (_accountId: number, method: string, params: Record<string, unknown>) => {
          if (method === "thread/start") {
            threadSequence += 1;
            return { thread: { id: `thread-${threadSequence}` } };
          }
          if (method === "turn/start") {
            return { turn: { id: `turn-${String(params.threadId)}` } };
          }
          return {};
        },
      );

      const { user } = await renderApp();
      await startMockRun(user, "Run in orchestrator");

      const firstBanner = screen.getByRole("region", { name: "Selected folder" });
      await user.click(
        within(firstBanner).getByRole("button", { name: /open chat history/i }),
      );
      const firstDrawer = await screen.findByRole("complementary", {
        name: "Workspace chat history",
      });
      expect(within(firstDrawer).getByLabelText("Agent running")).toBeInTheDocument();
      await user.click(
        within(firstBanner).getByRole("button", { name: /close chat history/i }),
      );

      const workspaceNav = screen.getByRole("navigation", { name: "Workspaces" });
      await user.click(
        within(workspaceNav).getByRole("button", { name: "mobile-client" }),
      );

      expect(screen.getByRole("button", { name: /run codex/i })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /stop codex/i })).not.toBeInTheDocument();
      expect(
        screen.queryByRole("article", { name: "Submitted prompt" }),
      ).not.toBeInTheDocument();

      await startMockRun(user, "Run in mobile client");
      await waitFor(() =>
        expect(
          mocks.codexRpcMock.mock.calls.filter(([, method]) => method === "thread/start"),
        ).toHaveLength(2),
      );

      await emitCodexNotification({
        method: "turn/completed",
        params: {
          threadId: "thread-1",
          turnId: "turn-thread-1",
          turn: { id: "turn-thread-1", status: "completed", durationMs: 1_000 },
        },
      });

      await user.click(
        within(workspaceNav).getByRole("button", { name: "orchestrator" }),
      );
      expect(await screen.findByLabelText("1 completed chat")).toBeInTheDocument();
      await waitFor(() =>
        expect(
          within(screen.getByLabelText("Task chat transcript")).getByLabelText(
            "Submitted prompt",
          ),
        ).toHaveTextContent("Run in orchestrator"),
      );
      expect(screen.queryByText("Run in mobile client")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: /run codex/i })).toBeInTheDocument();

      const unreadBanner = screen.getByRole("region", { name: "Selected folder" });
      await user.click(
        within(unreadBanner).getByRole("button", { name: /open chat history/i }),
      );
      const unreadDrawer = await screen.findByRole("complementary", {
        name: "Workspace chat history",
      });
      const unreadChat = within(unreadDrawer).getByRole("button", {
        name: /run in orchestrator, unread activity/i,
      });
      expect(unreadChat.querySelector(".history-run-unread-dot")).not.toBeNull();
      expect(screen.getByLabelText("1 completed chat")).toBeInTheDocument();

      await user.click(unreadChat);
      await waitFor(() =>
        expect(screen.queryByLabelText("1 completed chat")).not.toBeInTheDocument(),
      );

      await user.click(
        within(workspaceNav).getByRole("button", { name: "mobile-client" }),
      );
      await waitFor(() =>
        expect(
          within(screen.getByLabelText("Task chat transcript")).getByLabelText(
            "Submitted prompt",
          ),
        ).toHaveTextContent("Run in mobile client"),
      );
      expect(screen.getByRole("button", { name: /stop codex/i })).toBeInTheDocument();
    });

  it("restores composer drafts, context files, and skills per workspace", async () => {
      const mobileWorkspace = {
        ...workspace,
        id: 2,
        path: "/repo/mobile-client",
        label: "mobile-client",
      };
      prepareSignedInRun();
      mocks.listWorkspacesMock.mockResolvedValue([workspace, mobileWorkspace]);
      mocks.listCodexSkillsMock.mockResolvedValue([
        {
          id: "docs",
          name: "Docs",
          description: "Use repository documentation",
        },
      ]);

      const { user } = await renderApp();
      const workspaceNav = screen.getByRole("navigation", { name: "Workspaces" });
      const prompt = screen.getByLabelText("Prompt");
      await user.type(prompt, "Draft for orchestrator");
      const composer = composerInputZone();
      const dataTransfer = createContextFileDataTransfer([
        {
          path: "/repo/orchestrator/README.md",
          name: "README.md",
          source: "explorer",
          status: "ready",
        },
      ]);
      fireEvent.drop(composer, { dataTransfer });
      await user.type(prompt, " /docs");
      await user.click(await screen.findByRole("option", { name: /docs/i }));

      await user.click(
        within(workspaceNav).getByRole("button", { name: "mobile-client" }),
      );
      expect(screen.getByLabelText("Prompt")).toHaveValue("");
      expect(screen.queryByLabelText("Selected context files")).not.toBeInTheDocument();
      expect(screen.queryByLabelText("Selected skills")).not.toBeInTheDocument();

      await user.type(screen.getByLabelText("Prompt"), "Draft for mobile");
      await user.click(
        within(workspaceNav).getByRole("button", { name: "orchestrator" }),
      );

      expect(
        (screen.getByLabelText("Prompt") as HTMLTextAreaElement).value,
      ).toContain("Draft for orchestrator");
      expect(
        within(screen.getByLabelText("Selected context files")).getByText(
          "README.md",
        ),
      ).toBeInTheDocument();
      expect(
        within(screen.getByLabelText("Selected skills")).getByText("Docs"),
      ).toBeInTheDocument();

      await user.click(
        within(workspaceNav).getByRole("button", { name: "mobile-client" }),
      );
      expect(screen.getByLabelText("Prompt")).toHaveValue("Draft for mobile");
    });

  it("promotes an optimistic chat while its workspace is in the background", async () => {
      const mobileWorkspace = {
        ...workspace,
        id: 2,
        path: "/repo/mobile-client",
        label: "mobile-client",
      };
      let resolveCreateChat:
        | ((chat: ReturnType<typeof workspaceChatFixture>) => void)
        | null = null;
      prepareSignedInRun();
      mocks.listWorkspacesMock.mockResolvedValue([workspace, mobileWorkspace]);
      mocks.createChatMock.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveCreateChat = resolve;
          }),
      );

      const { user } = await renderApp();
      await user.type(screen.getByLabelText("Prompt"), "Background setup");
      await user.keyboard("{Enter}");
      await waitFor(() => expect(mocks.createChatMock).toHaveBeenCalledTimes(1));

      const workspaceNav = screen.getByRole("navigation", { name: "Workspaces" });
      await user.click(
        within(workspaceNav).getByRole("button", { name: "mobile-client" }),
      );
      expect(screen.queryByText("Background setup")).not.toBeInTheDocument();

      await act(async () => {
        resolveCreateChat?.(
          workspaceChatFixture({
            id: 407,
            title: "Background setup",
            status: "starting",
          }),
        );
        await Promise.resolve();
      });
      await waitFor(() =>
        expect(mocks.codexRpcMock).toHaveBeenCalledWith(
          7,
          "turn/start",
          expect.any(Object),
        ),
      );

      await user.click(
        within(workspaceNav).getByRole("button", { name: "orchestrator" }),
      );
      const transcript = await screen.findByLabelText("Task chat transcript");
      expect(
        within(transcript).getByLabelText("Submitted prompt"),
      ).toHaveTextContent("Background setup");
      expect(screen.getByRole("button", { name: /stop codex/i })).toBeInTheDocument();
    });

  it("restores a historical chat and keeps an explicit new chat empty", async () => {
      const mobileWorkspace = {
        ...workspace,
        id: 2,
        path: "/repo/mobile-client",
        label: "mobile-client",
      };
      const historicalChat = workspaceChatFixture({
        id: 406,
        title: "Remembered history",
      });
      const historicalRun = workspaceRunFixture({
        id: 306,
        chat_id: historicalChat.id,
        original_prompt: "Remember this prompt",
        final_message: "Remembered result.",
      });
      mocks.listWorkspacesMock.mockResolvedValue([workspace, mobileWorkspace]);
      mocks.listWorkspaceChatsMock.mockImplementation(async (workspaceId: number) =>
        workspaceId === workspace.id ? [historicalChat] : [],
      );
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
        within(drawer).getByRole("button", { name: /remembered history/i }),
      );
      expect(await screen.findByText("Remembered result.")).toBeInTheDocument();

      const workspaceNav = screen.getByRole("navigation", { name: "Workspaces" });
      await user.click(
        within(workspaceNav).getByRole("button", { name: "mobile-client" }),
      );
      await user.click(
        within(workspaceNav).getByRole("button", { name: "orchestrator" }),
      );
      expect(screen.getByText("Remembered result.")).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: /new chat/i }));
      expect(screen.queryByText("Remembered result.")).not.toBeInTheDocument();
      await user.click(
        within(workspaceNav).getByRole("button", { name: "mobile-client" }),
      );
      await user.click(
        within(workspaceNav).getByRole("button", { name: "orchestrator" }),
      );
      expect(screen.queryByText("Remembered result.")).not.toBeInTheDocument();
      expect(
        screen.queryByRole("article", { name: "Submitted prompt" }),
      ).not.toBeInTheDocument();
    });

  it("keeps the remembered chat viewport mounted while switching workspaces", async () => {
      const mobileWorkspace = {
        ...workspace,
        id: 2,
        path: "/repo/mobile-client",
        label: "mobile-client",
      };
      const historicalChat = workspaceChatFixture({
        id: 416,
        title: "ExpressJS App Scaffolding Plan",
      });
      const historicalRuns = Array.from({ length: 18 }, (_, index) =>
        workspaceRunFixture({
          id: 316 + index,
          task_id: 116 + index,
          chat_id: historicalChat.id,
          turn_index: index + 1,
          original_prompt: `Prompt ${index + 1}`,
          final_message: `Result ${index + 1}.`,
        }),
      );
      mocks.listWorkspacesMock.mockResolvedValue([workspace, mobileWorkspace]);
      mocks.listWorkspaceChatsMock.mockImplementation(async (workspaceId: number) =>
        workspaceId === workspace.id ? [historicalChat] : [],
      );
      mocks.getChatWithRunsMock.mockResolvedValue(
        workspaceChatWithRunsFixture(historicalChat, historicalRuns),
      );
      mocks.listLocalChatTranscriptMock.mockResolvedValue(historicalRuns);

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
          name: /expressjs app scaffolding plan/i,
        }),
      );
      expect(await screen.findByText("Result 18.")).toBeInTheDocument();
      const transcriptBeforeSwitch = screen.getByLabelText(
        "Task chat transcript",
      );

      mocks.virtuosoState = {
        ranges: [{ startIndex: 7, endIndex: 13 }],
        scrollTop: 1_842,
      };
      const workspaceNav = screen.getByRole("navigation", { name: "Workspaces" });
      await user.click(
        within(workspaceNav).getByRole("button", { name: "mobile-client" }),
      );
      const suspendedTranscript = document.querySelector<HTMLElement>(
        ".task-chat-transcript-switcher.is-suspended",
      );
      expect(suspendedTranscript).not.toBeNull();
      expect(suspendedTranscript).toHaveTextContent("Result 18.");

      // Clearing the fallback cache must not force the retained viewport to remount.
      appServices.transcriptStates.clear();
      await user.click(
        within(workspaceNav).getByRole("button", { name: "orchestrator" }),
      );

      expect(await screen.findByLabelText("Task chat transcript")).toBe(
        transcriptBeforeSwitch,
      );
      expect(screen.getByText("Result 18.")).toBeInTheDocument();
    });

  it("keeps a selected history chat visible when submitting a follow-up prompt", async () => {
      prepareSignedInRun();
      const historicalChat = workspaceChatFixture({
        id: 404,
        title: "Old selected chat",
      });
      const historicalRun = workspaceRunFixture({
        id: 304,
        chat_id: historicalChat.id,
        original_prompt: "Old selected chat",
        final_message: "Old selected result.",
      });
      mocks.listWorkspaceChatsMock.mockResolvedValue([historicalChat]);
      mocks.getChatWithRunsMock.mockResolvedValue(
        workspaceChatWithRunsFixture(historicalChat, [historicalRun]),
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
        within(drawer).getByRole("button", { name: /old selected chat/i }),
      );
      expect(await screen.findByText("Old selected result.")).toBeInTheDocument();
      const transcriptBeforeSubmission = screen.getByLabelText(
        "Task chat transcript",
      );

      const animationFrames = holdNextAnimationFrames();
      try {
        await user.type(screen.getByLabelText("Prompt"), "Start fresh work");
        await user.keyboard("{Enter}");

        const transcript = screen.getByLabelText("Task chat transcript");
        expect(transcript).toBe(transcriptBeforeSubmission);
        expect(transcript).toHaveTextContent("Start fresh work");
        expect(transcript).toHaveTextContent("Old selected result.");
      } finally {
        animationFrames.restore();
      }
    });

  it("clears a stale Goal Mode objective before continuing a historical chat normally", async () => {
      prepareSignedInRun();
      const historicalChat = workspaceChatFixture({
        id: 404,
        title: "ExpressJS App Scaffolding Plan",
        codex_thread_id: "thread-1",
      });
      const historicalRun = workspaceRunFixture({
        id: 304,
        chat_id: historicalChat.id,
        original_prompt: "Scaffold the ExpressJS app",
        final_message: "Prepared the app.",
      });
      mocks.listWorkspaceChatsMock.mockResolvedValue([historicalChat]);
      mocks.getChatWithRunsMock.mockResolvedValue(
        workspaceChatWithRunsFixture(historicalChat, [historicalRun]),
      );

      const { user } = await renderApp();
      const banner = screen.getByRole("region", { name: "Selected folder" });
      await user.click(
        within(banner).getByRole("button", { name: /open chat history/i }),
      );
      await user.click(
        within(
          await screen.findByRole("complementary", {
            name: "Workspace chat history",
          }),
        ).getByRole("button", { name: /expressjs app scaffolding plan/i }),
      );
      await screen.findByText("Prepared the app.");

      await user.type(screen.getByLabelText("Prompt"), "Report the working directory");
      await user.keyboard("{Enter}");

      await waitFor(() =>
        expect(mocks.codexRpcMock).toHaveBeenCalledWith(
          7,
          "thread/goal/clear",
          { threadId: "thread-1" },
        ),
      );
      await waitFor(() =>
        expect(
          mocks.codexRpcMock.mock.calls.some(([, method]) => method === "turn/start"),
        ).toBe(true),
      );
      const methods = mocks.codexRpcMock.mock.calls.map(([, method]) => method);
      expect(methods.indexOf("thread/resume")).toBeLessThan(
        methods.indexOf("thread/goal/clear"),
      );
      expect(methods.indexOf("thread/goal/clear")).toBeLessThan(
        methods.indexOf("turn/start"),
      );
    });

  it("starts a fresh Codex thread when a restored history thread is no longer available", async () => {
      prepareSignedInRun();
      const historicalChat = workspaceChatFixture({
        id: 405,
        title: "Restarted chat",
        codex_thread_id: "stale-thread",
      });
      const historicalRun = workspaceRunFixture({
        id: 305,
        chat_id: historicalChat.id,
        original_prompt: "Restarted chat",
        final_message: "Older result.",
      });
      mocks.listWorkspaceChatsMock.mockResolvedValue([historicalChat]);
      mocks.getChatWithRunsMock.mockResolvedValue(
        workspaceChatWithRunsFixture(historicalChat, [historicalRun]),
      );
      mocks.codexRpcMock.mockImplementation(
        async (_accountId: number, method: string, params?: unknown) => {
          if (method === "thread/start") {
            return { thread: { id: "fresh-thread" } };
          }
          if (method === "turn/start") {
            const threadId =
              params && typeof params === "object" && "threadId" in params
                ? (params as { threadId?: string }).threadId
                : null;
            if (threadId === "stale-thread") {
              throw new Error(
                JSON.stringify({
                  code: -32600,
                  message: "thread not found: stale-thread",
                }),
              );
            }
            return { turn: { id: "fresh-turn" } };
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
      await user.click(within(drawer).getByRole("button", { name: /restarted chat/i }));

      await user.type(screen.getByLabelText("Prompt"), "Continue after restart");
      await user.keyboard("{Enter}");

      await waitFor(() =>
        expect(mocks.codexRpcMock).toHaveBeenCalledWith(
          7,
          "turn/start",
          expect.objectContaining({ threadId: "fresh-thread" }),
        ),
      );
      expect(mocks.codexRpcMock).toHaveBeenCalledWith(
        7,
        "turn/start",
        expect.objectContaining({ threadId: "stale-thread" }),
      );
      expect(mocks.codexRpcMock).toHaveBeenCalledWith(
        7,
        "thread/start",
        expect.objectContaining({ cwd: workspace.path }),
      );
      expect(mocks.updateChatMock).toHaveBeenCalledWith(405, {
        codexThreadId: "fresh-thread",
        status: "running",
      });
      expect(mocks.updateRunMock).toHaveBeenCalledWith(
        202,
        expect.objectContaining({ codexThreadId: "fresh-thread" }),
      );
      expect(screen.queryByText(/thread not found/i)).not.toBeInTheDocument();
    });

  it("renders an empty selected folder banner when no workspace is selected", async () => {
      mocks.listWorkspacesMock.mockResolvedValue([]);

      await renderApp();

      const banner = screen.getByRole("region", { name: "Selected folder" });
      expect(within(banner).getByText("No folder selected")).toBeInTheDocument();
      expect(
        within(banner).getByText("Add or choose a workspace to start a task."),
      ).toBeInTheDocument();
    });

  it("keeps goal mode and plan mode mutually exclusive", async () => {
      const { user } = await renderApp();

      const goalModeButton = screen.getByRole("button", { name: /goal mode/i });
      const planModeButton = screen.getByRole("button", { name: /plan mode/i });

      await user.click(goalModeButton);
      expect(goalModeButton).toHaveAttribute("aria-pressed", "true");
      expect(planModeButton).toHaveAttribute("aria-pressed", "false");

      await user.click(planModeButton);
      expect(planModeButton).toHaveAttribute("aria-pressed", "true");
      expect(goalModeButton).toHaveAttribute("aria-pressed", "false");
    });

  it("uses native Plan collaboration mode and implements the completed plan on the same thread", async () => {
      prepareSignedInRun();
      mocks.listCodexModelsMock.mockResolvedValue([defaultCodexModel]);
      let turnNumber = 0;
      mocks.codexRpcMock.mockImplementation(
        async (_accountId: number, method: string) => {
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
            return { thread: { id: "thread-plan" } };
          }
          if (method === "turn/start") {
            turnNumber += 1;
            return { turn: { id: `turn-${turnNumber}` } };
          }
          return {};
        },
      );

      const { user } = await renderApp();
      const planModeButton = screen.getByRole("button", { name: /plan mode/i });
      await user.click(planModeButton);
      expect(planModeButton).toHaveAttribute("aria-pressed", "true");
      await user.type(screen.getByLabelText("Prompt"), "Design native planning");
      await user.click(screen.getByRole("button", { name: /run codex/i }));
      expect(planModeButton).toHaveAttribute("aria-pressed", "false");

      await waitFor(() =>
        expect(mocks.codexRpcMock).toHaveBeenCalledWith(
          7,
          "turn/start",
          expect.objectContaining({
            threadId: "thread-plan",
            collaborationMode: expect.objectContaining({
              mode: "plan",
              settings: expect.objectContaining({
                reasoning_effort: "medium",
                developer_instructions: `${GENERATED_IMAGE_HANDLING_POLICY}\n\n${PLAN_MODE_OUTPUT_POLICY}`,
              }),
            }),
            approvalPolicy: "never",
            permissions: ":read-only",
            clientUserMessageId: expect.any(String),
          }),
        ),
      );
      expect(mocks.createRunMock).toHaveBeenCalledWith(
        expect.objectContaining({
          sandbox: "read-only",
          approvalPolicy: "never",
        }),
      );
      const planningCall = mocks.codexRpcMock.mock.calls.find(
        (call) => call[1] === "turn/start",
      );
      expect(planningCall?.[2]).toEqual(
        expect.objectContaining({
          input: [
            expect.objectContaining({
              text: expect.not.stringContaining("Do not edit files yet"),
            }),
          ],
        }),
      );

      await emitCodexServerRequest({
        id: "question-1",
        method: "item/tool/requestUserInput",
        params: {
          threadId: "thread-plan",
          turnId: "turn-1",
          itemId: "question-item-1",
          autoResolutionMs: null,
          questions: [
            {
              id: "scope",
              header: "Scope",
              question: "Choose the implementation scope",
              isOther: false,
              isSecret: false,
              options: [
                { label: "Focused", description: "Keep the change small" },
                { label: "Broad", description: "Include adjacent cleanup" },
              ],
            },
          ],
        },
      });
      await user.click(screen.getByRole("radio", { name: /Focused/ }));
      await waitFor(() =>
        expect(mocks.resolveCodexServerRequestMock).toHaveBeenCalledWith(
          7,
          "question-1",
          "server-request-7-1-9",
          { answers: { scope: { answers: ["Focused"] } } },
        ),
      );
      await emitCodexServerRequest(
        {
          id: "question-auto",
          method: "item/tool/requestUserInput",
          params: {
            threadId: "thread-plan",
            turnId: "turn-1",
            itemId: "question-item-auto",
            autoResolutionMs: 5,
            questions: [
              {
                id: "optional",
                header: "Optional",
                question: "This may auto-resolve",
                isOther: false,
                isSecret: false,
                options: null,
              },
            ],
          },
        },
        { requestToken: "server-request-7-1-question-auto" },
      );
      await waitFor(() =>
        expect(mocks.resolveCodexServerRequestMock).toHaveBeenCalledWith(
          7,
          "question-auto",
          "server-request-7-1-question-auto",
          { answers: {} },
        ),
      );

      await emitCodexNotification({
        method: "item/plan/delta",
        params: {
          threadId: "thread-plan",
          turnId: "turn-1",
          itemId: "plan-item-1",
          delta: "Draft preview",
        },
      });
      await emitCodexNotification({
        method: "item/completed",
        params: {
          threadId: "thread-plan",
          turnId: "turn-1",
          item: {
            type: "plan",
            id: "plan-item-1",
            text: "# Native plan\n\n1. Apply the change",
          },
        },
      });
      expect(
        screen.queryByRole("button", { name: "Accept plan" }),
      ).not.toBeInTheDocument();

      await emitCodexNotification({
        method: "turn/completed",
        params: {
          threadId: "thread-plan",
          turnId: "turn-1",
          turn: { id: "turn-1", status: "completed", durationMs: 100 },
        },
      });

      const implement = await screen.findByRole("button", {
        name: "Accept plan",
      });
      expect(screen.getByRole("combobox", { name: "Run account" })).toBeEnabled();
      expect(screen.getByRole("combobox", { name: "Agent" })).toBeDisabled();
      await user.click(implement);
      const implementationDialog = await screen.findByRole("dialog", {
        name: "Confirm implementation settings",
      });
      expect(
        within(implementationDialog).queryByText("Plan implementation"),
      ).not.toBeInTheDocument();
      expect(
        within(implementationDialog).getByRole("combobox", {
          name: "Implementation account",
        }),
      ).toHaveTextContent("dev@example.com");
      expect(
        within(implementationDialog).getByRole("combobox", {
          name: "Implementation model",
        }),
      ).toHaveTextContent("GPT-5.5");
      await user.click(
        within(implementationDialog).getByRole("button", {
          name: "Implement plan",
        }),
      );

      await waitFor(() => {
        const turnCalls = mocks.codexRpcMock.mock.calls.filter(
          (call) => call[1] === "turn/start",
        );
        expect(turnCalls).toHaveLength(2);
        expect(turnCalls[1][2]).toEqual(
          expect.objectContaining({
            threadId: "thread-plan",
            collaborationMode: expect.objectContaining({ mode: "default" }),
            approvalPolicy: "untrusted",
            permissions: ASK_FOR_APPROVAL_PERMISSION_PROFILE,
            input: [
              expect.objectContaining({
                text: expect.stringContaining(
                  "If `update_plan` is available in this session",
                ),
              }),
            ],
          }),
        );
      });
      expect(mocks.codexRpcMock).toHaveBeenCalledWith(
        7,
        "thread/settings/update",
        expect.objectContaining({
          threadId: "thread-plan",
          collaborationMode: expect.objectContaining({ mode: "default" }),
        }),
      );
    });

});
