import { act, screen, waitFor, within } from "@testing-library/react";
import { describe, beforeEach, expect, it, vi } from "vitest";
import {
  getMocks,
  workspace,
  signedInAccount,
  prepareDefaults,
  renderApp,
  pointerTapFile,
  prepareSignedInRun,
  startMockRun,
  emitCodexNotification,
  emitCodexServerRequest,
  setWindowWidth,
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

  it("adds selected slash skills to the next run prompt", async () => {
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
          id: "docs",
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

      await waitFor(() =>
        expect(mocks.codexRpcMock).toHaveBeenCalledWith(
          7,
          "turn/start",
          expect.objectContaining({
            input: [
              expect.objectContaining({
                text: expect.stringContaining("Use these Codex skills"),
              }),
            ],
          }),
        ),
      );
      expect(mocks.codexRpcMock).toHaveBeenCalledWith(
        7,
        "turn/start",
        expect.objectContaining({
          input: [
            expect.objectContaining({
              text: expect.stringContaining("Docs: Use repository documentation"),
            }),
          ],
        }),
      );
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
