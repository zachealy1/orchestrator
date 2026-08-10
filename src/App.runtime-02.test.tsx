import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, beforeEach, expect, it, vi } from "vitest";
import {
  getMocks,
  workspace,
  signedInAccount,
  workspaceRunFixture,
  workspaceChatFixture,
  workspaceChatWithRunsFixture,
  externalTurnFixture,
  externalTranscriptSnapshotFixture,
  prepareDefaults,
  renderApp,
  prepareSignedInRun,
  startMockRun,
  emitCodexNotification,
  setWindowWidth,
} from "./test/appRuntimeHarness";
import { persistRunningGitOperation } from "./lib/gitOperations";
import { createQueuedPromptSnapshot } from "./lib/promptQueue";
import { createRunExecutionSettings } from "./lib/runExecutionSettings";
import type { PromptQueueItem } from "./features/queue/types";

const mocks = getMocks();

describe("Application runtime scenarios 2", () => {
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

  it("keeps background Git progress scoped to its workspace", async () => {
      const otherWorkspace = {
        ...workspace,
        id: 2,
        path: "/repo/other",
        label: "other",
      };
      let resolvePush:
        | ((value: { message: string; branch: string }) => void)
        | null = null;
      mocks.listWorkspacesMock.mockResolvedValue([workspace, otherWorkspace]);
      mocks.listWorkspaceGitStatusMock.mockImplementation(
        async (workspacePath: string) => ({
          workspacePath,
          gitRoot: workspacePath,
          currentBranch: "main",
          aheadCount: workspacePath === workspace.path ? 1 : 0,
          hasUpstream: true,
          hasOrigin: true,
          canPush: workspacePath === workspace.path,
          files: [],
        }),
      );
      mocks.pushWorkspaceBranchMock.mockImplementation(
        () =>
          new Promise<{ message: string; branch: string }>((resolve) => {
            resolvePush = resolve;
          }),
      );

      const { user } = await renderApp();
      let banner = screen.getByRole("region", { name: "Selected folder" });
      await user.click(
        await within(banner).findByRole("button", { name: /commit or push/i }),
      );
      await user.click(
        within(screen.getByRole("dialog", { name: "Commit or push" })).getByRole(
          "button",
          { name: /^push$/i },
        ),
      );
      expect(
        within(banner).getByRole("button", { name: /commit or push/i }),
      ).toHaveAttribute("aria-busy", "true");

      const workspaceNav = screen.getByRole("navigation", { name: "Workspaces" });
      await user.click(
        within(workspaceNav).getByRole("button", { name: "other" }),
      );
      banner = screen.getByRole("region", { name: "Selected folder" });
      expect(within(banner).getByText("other")).toBeInTheDocument();
      expect(
        within(banner).getByRole("button", { name: /commit or push/i }),
      ).toHaveAttribute("aria-busy", "false");

      await user.click(
        within(workspaceNav).getByRole("button", { name: "orchestrator" }),
      );
      banner = screen.getByRole("region", { name: "Selected folder" });
      expect(
        within(banner).getByRole("button", { name: /commit or push/i }),
      ).toHaveAttribute("aria-busy", "true");

      await act(async () => {
        resolvePush?.({ message: "Pushed main", branch: "main" });
        await Promise.resolve();
      });
      await waitFor(() =>
        expect(
          within(banner).getByRole("button", { name: /commit or push/i }),
        ).toHaveAttribute("aria-busy", "false"),
      );
    });

  it("recovers an interrupted Git operation without retrying it after restart", async () => {
      persistRunningGitOperation(
        {
          workspaceId: workspace.id,
          workspacePath: workspace.path,
          workspaceLabel: workspace.label,
          repositoryPath: workspace.path,
          repositoryLabel: workspace.label,
          kind: "commit-and-push",
          commitMessage: "Do not retain this message",
          includeUnstaged: true,
          changeKey: "old-change",
        },
        "pushing",
      );

      const { user } = await renderApp();
      const banner = screen.getByRole("region", { name: "Selected folder" });
      expect(
        within(banner).getByRole("button", { name: /commit or push/i }),
      ).toHaveAttribute("aria-busy", "false");
      const review = await screen.findByRole("button", {
        name: "Open Git actions",
      });
      expect(review).toHaveTextContent(
        "Review the current Git status before starting another commit or push.",
      );
      expect(mocks.commitWorkspaceChangesMock).not.toHaveBeenCalled();
      expect(mocks.pushWorkspaceBranchMock).not.toHaveBeenCalled();

      await user.click(review);
      expect(
        screen.getByRole("dialog", { name: "Commit or push" }),
      ).toBeInTheDocument();
    });

  it("rejects broad AI commit messages that only describe changed areas", async () => {
      prepareSignedInRun();
      mocks.generateWorkspaceCommitMessageMock.mockResolvedValue({
        message: "Refine Tauri bridge and app styling",
        source: "codex",
      });
      mocks.listWorkspaceGitStatusMock.mockResolvedValue({
        workspacePath: workspace.path,
        gitRoot: workspace.path,
        currentBranch: "main",
        aheadCount: 0,
        hasUpstream: true,
        hasOrigin: true,
        canPush: true,
        additions: 8,
        deletions: 3,
        files: [
          {
            path: "/repo/orchestrator/src/App.css",
            relativePath: "src/App.css",
            oldRelativePath: null,
            indexStatus: " ",
            worktreeStatus: "M",
            statusKind: "modified",
            badge: "M",
          },
          {
            path: "/repo/orchestrator/src-tauri/src/lib.rs",
            relativePath: "src-tauri/src/lib.rs",
            oldRelativePath: null,
            indexStatus: " ",
            worktreeStatus: "M",
            statusKind: "modified",
            badge: "M",
          },
        ],
      });

      const { user } = await renderApp();
      const banner = screen.getByRole("region", { name: "Selected folder" });
      await user.click(
        await within(banner).findByRole("button", { name: /commit or push/i }),
      );

      const dialog = screen.getByRole("dialog", { name: "Commit or push" });
      await user.click(within(dialog).getByRole("button", { name: /^commit$/i }));

      await waitFor(() =>
        expect(mocks.generateWorkspaceCommitMessageMock).toHaveBeenCalled(),
      );
      expect(mocks.commitWorkspaceChangesMock).not.toHaveBeenCalled();
      expect(
        screen.queryByRole("dialog", { name: "Commit or push" }),
      ).not.toBeInTheDocument();
      expect(
        await screen.findByRole("button", { name: "Open Git actions" }),
      ).toHaveTextContent(
        "Could not generate a commit message. Enter a message manually or try again.",
      );
    });

  it("fails closed when Codex repeats a commit message for different changes", async () => {
      prepareSignedInRun();
      mocks.generateWorkspaceCommitMessageMock.mockResolvedValue({
        message: "Improve commit dialog staging controls",
        source: "codex",
      });

      let currentStatus = {
        workspacePath: workspace.path,
        gitRoot: workspace.path,
        currentBranch: "main",
        aheadCount: 0,
        hasUpstream: true,
        hasOrigin: true,
        canPush: true,
        additions: 18,
        deletions: 4,
        files: [
          {
            path: "/repo/orchestrator/src/App.tsx",
            relativePath: "src/App.tsx",
            oldRelativePath: null,
            indexStatus: " ",
            worktreeStatus: "M",
            statusKind: "modified" as const,
            badge: "M",
          },
          {
            path: "/repo/orchestrator/src-tauri/src/lib.rs",
            relativePath: "src-tauri/src/lib.rs",
            oldRelativePath: null,
            indexStatus: " ",
            worktreeStatus: "M",
            statusKind: "modified" as const,
            badge: "M",
          },
        ],
      };
      const nextStatus = {
        ...currentStatus,
        additions: 9,
        deletions: 2,
        files: [
          {
            path: "/repo/orchestrator/src/components/FilePreviewDrawer.tsx",
            relativePath: "src/components/FilePreviewDrawer.tsx",
            oldRelativePath: null,
            indexStatus: " ",
            worktreeStatus: "M",
            statusKind: "modified" as const,
            badge: "M",
          },
          {
            path: "/repo/orchestrator/src/components/CodePreview.tsx",
            relativePath: "src/components/CodePreview.tsx",
            oldRelativePath: null,
            indexStatus: " ",
            worktreeStatus: "M",
            statusKind: "modified" as const,
            badge: "M",
          },
        ],
      };
      mocks.listWorkspaceGitStatusMock.mockImplementation(async () => currentStatus);
      mocks.commitWorkspaceChangesMock.mockImplementation(async () => {
        currentStatus = nextStatus;
        return {
          message: "Committed workspace changes",
          branch: "main",
        };
      });

      const { user } = await renderApp();
      const banner = screen.getByRole("region", { name: "Selected folder" });

      await user.click(
        await within(banner).findByRole("button", { name: /commit or push/i }),
      );
      let dialog = screen.getByRole("dialog", { name: "Commit or push" });
      await user.click(within(dialog).getByRole("button", { name: /^commit$/i }));

      await waitFor(() =>
        expect(mocks.commitWorkspaceChangesMock).toHaveBeenNthCalledWith(
          1,
          workspace.path,
          "Improve commit dialog staging controls",
          true,
          workspace.path,
        ),
      );
      await waitFor(() =>
        expect(screen.queryByRole("dialog", { name: "Commit or push" })).toBeNull(),
      );

      await user.click(
        await within(banner).findByRole("button", { name: /commit or push/i }),
      );
      dialog = screen.getByRole("dialog", { name: "Commit or push" });
      await user.click(within(dialog).getByRole("button", { name: /^commit$/i }));

      await waitFor(() =>
        expect(mocks.generateWorkspaceCommitMessageMock).toHaveBeenCalledTimes(2),
      );
      expect(mocks.commitWorkspaceChangesMock).toHaveBeenCalledTimes(1);
    });

  it("commits and pushes from the commit or push dialog", async () => {
      mocks.listWorkspaceGitStatusMock.mockResolvedValue({
        workspacePath: workspace.path,
        gitRoot: workspace.path,
        currentBranch: "main",
        aheadCount: 0,
        hasUpstream: true,
        hasOrigin: true,
        canPush: true,
        additions: 10,
        deletions: 2,
        files: [
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
      const banner = screen.getByRole("region", { name: "Selected folder" });
      await user.click(
        await within(banner).findByRole("button", { name: /commit or push/i }),
      );

      const dialog = screen.getByRole("dialog", { name: "Commit or push" });
      expect(within(dialog).getByText("+10")).toBeInTheDocument();
      expect(within(dialog).getByText("-2")).toBeInTheDocument();
      await user.type(
        within(dialog).getByLabelText(/commit message/i),
        "Commit workspace changes",
      );
      await user.click(
        within(dialog).getByRole("button", { name: /^commit and push$/i }),
      );

      await waitFor(() =>
        expect(mocks.commitWorkspaceChangesMock).toHaveBeenCalledWith(
          workspace.path,
          "Commit workspace changes",
          true,
          workspace.path,
        ),
      );
      await waitFor(() =>
        expect(mocks.pushWorkspaceBranchMock).toHaveBeenCalledWith(
          workspace.path,
          workspace.path,
        ),
      );
    });

  it("pushes the current branch from the selected folder banner when clean and ahead", async () => {
      mocks.listWorkspaceGitStatusMock.mockResolvedValue({
        workspacePath: workspace.path,
        gitRoot: workspace.path,
        currentBranch: "main",
        aheadCount: 2,
        hasUpstream: true,
        hasOrigin: true,
        canPush: true,
        files: [],
      });

      const { user } = await renderApp();
      const banner = screen.getByRole("region", { name: "Selected folder" });
      await user.click(
        await within(banner).findByRole("button", { name: /commit or push/i }),
      );
      const dialog = screen.getByRole("dialog", { name: "Commit or push" });
      expect(within(dialog).getByText("2 ahead")).toBeInTheDocument();
      await user.click(within(dialog).getByRole("button", { name: /^push$/i }));

      await waitFor(() =>
        expect(mocks.pushWorkspaceBranchMock).toHaveBeenCalledWith(
          workspace.path,
          workspace.path,
        ),
      );
    });

  it("opens the commit or push menu even when the workspace has no git action", async () => {
      const { user } = await renderApp();
      const banner = screen.getByRole("region", { name: "Selected folder" });
      await user.click(
        await within(banner).findByRole("button", { name: /commit or push/i }),
      );

      const dialog = screen.getByRole("dialog", { name: "Commit or push" });
      expect(within(dialog).getByText("No changes")).toBeInTheDocument();
      expect(within(dialog).getByRole("button", { name: /^commit$/i })).toBeDisabled();
      expect(within(dialog).getByRole("button", { name: /^push$/i })).toBeDisabled();
    });

  it("closes the commit or push dialog from the backdrop without running git actions", async () => {
      const { user } = await renderApp();
      const banner = screen.getByRole("region", { name: "Selected folder" });
      await user.click(
        await within(banner).findByRole("button", { name: /commit or push/i }),
      );

      const dialog = screen.getByRole("dialog", { name: "Commit or push" });
      fireEvent.mouseDown(dialog.parentElement as HTMLElement);

      expect(screen.queryByRole("dialog", { name: "Commit or push" })).not.toBeInTheDocument();
      expect(mocks.commitWorkspaceChangesMock).not.toHaveBeenCalled();
      expect(mocks.pushWorkspaceBranchMock).not.toHaveBeenCalled();
    });

  it("shows live context usage in the selected folder banner", async () => {
      prepareSignedInRun();

      const { user } = await renderApp();
      const banner = screen.getByRole("region", { name: "Selected folder" });
      const emptyMeter = within(banner).getByRole("meter", { name: "Context usage" });
      expect(within(emptyMeter).getByText("0 / 258,400")).toBeInTheDocument();
      expect(within(emptyMeter).getByText("0%")).toBeInTheDocument();
      expect(emptyMeter).toHaveAttribute("aria-valuenow", "0");
      expect(emptyMeter).toHaveAttribute("aria-valuetext", "0 / 258,400 (0%)");
      expect(within(banner).queryByText("Context loading")).not.toBeInTheDocument();

      await startMockRun(user, "Measure context");
      await emitCodexNotification({
        method: "thread/tokenUsage/updated",
        params: {
          threadId: "thread-1",
          turnId: "turn-1",
          tokenUsage: {
            total: {
              totalTokens: 1280,
              inputTokens: 1000,
              cachedInputTokens: 100,
              outputTokens: 200,
              reasoningOutputTokens: 80,
            },
            last: {
              totalTokens: 640,
              inputTokens: 560,
              cachedInputTokens: 100,
              outputTokens: 80,
              reasoningOutputTokens: 20,
            },
            modelContextWindow: 128000,
          },
        },
      });

      expect(within(banner).getByText("640 / 128,000")).toBeInTheDocument();
      expect(within(banner).getByText("1%")).toBeInTheDocument();
      const meter = within(banner).getByRole("meter", { name: "Context usage" });
      expect(meter).toHaveAttribute("aria-valuenow", "1");
      expect(meter).toHaveAttribute("aria-valuetext", "640 / 128,000 (1%)");
      await waitFor(() =>
        expect(mocks.recordTokenUsageMock).toHaveBeenCalledWith(
          expect.objectContaining({
            totalTokens: 1280,
            turnTokens: 1280,
            contextTokens: 640,
            modelContextWindow: 128000,
          }),
        ),
      );
    });

  it("opens workspace chat history without extra drawer controls", async () => {
      const activeChat = workspaceChatFixture({
        id: 401,
        title: "Fix the app header",
      });
      mocks.listWorkspaceChatsMock.mockResolvedValue([activeChat]);

      const { user } = await renderApp();
      const banner = screen.getByRole("region", { name: "Selected folder" });
      const historyButton = within(banner).getByRole("button", {
        name: /open chat history/i,
      });
      const composer = screen.getByLabelText("Task composer");
      expect(historyButton).toHaveTextContent("");
      expect(historyButton).toHaveAttribute("title", "Open history");
      await user.click(historyButton);

      const drawer = await screen.findByRole("complementary", {
        name: "Workspace chat history",
      });
      expect(historyButton).toHaveAttribute("aria-label", "Close chat history");
      expect(historyButton).toHaveAttribute("aria-pressed", "true");
      const layout = drawer.closest(".codex-workspace-body");
      expect(layout).toHaveClass("history-open");
      const taskChat = within(layout as HTMLElement).getByLabelText("Task chat");
      expect(taskChat).toBeInTheDocument();
      expect(taskChat).toHaveClass("task-hero");
      expect(drawer.previousElementSibling).toBe(taskChat);
      expect(drawer).toHaveClass("workspace-history-drawer", "opening");
      expect(drawer.parentElement).toHaveClass("codex-workspace-body");
      expect(drawer.parentElement).toHaveClass("history-space-reserved");
      expect(drawer.parentElement).toHaveAttribute(
        "data-history-transition-phase",
        "opening",
      );
      expect(screen.getByLabelText("Task composer")).toBe(composer);
      expect(within(drawer).queryByRole("tab")).not.toBeInTheDocument();
      expect(
        within(drawer).queryByRole("button", { name: /close chat history/i }),
      ).not.toBeInTheDocument();

      expect(within(drawer).getAllByText("Fix the app header").length).toBeGreaterThan(0);
      expect(within(drawer).queryByText("Header fixed.")).not.toBeInTheDocument();
      expect(
        within(drawer).queryByRole("article", { name: /selected chat/i }),
      ).not.toBeInTheDocument();
      expect(mocks.codexDefaultProfileRpcMock).not.toHaveBeenCalledWith(
        "thread/list",
        expect.anything(),
      );

      fireEvent.transitionEnd(drawer, { propertyName: "transform" });
      expect(drawer).toHaveClass("open");
      expect(drawer.parentElement).toHaveClass("history-space-reserved");
      expect(drawer.parentElement).toHaveAttribute(
        "data-history-transition-phase",
        "open",
      );
      expect(screen.getByLabelText("Task composer")).toBe(composer);
      await waitFor(() =>
        expect(mocks.codexDefaultProfileRpcMock).toHaveBeenCalledWith(
          "thread/list",
          expect.objectContaining({ cwd: workspace.path }),
        ),
      );

      await user.click(historyButton);
      const closedDrawer = document.querySelector(".workspace-history-drawer");
      expect(closedDrawer).toBeInTheDocument();
      expect(closedDrawer).toHaveAttribute("aria-hidden", "true");
      expect(closedDrawer).toHaveAttribute("inert");
      await waitFor(() => expect(closedDrawer).toHaveClass("closing"));
      expect(closedDrawer?.parentElement).not.toHaveClass(
        "history-space-reserved",
      );
      expect(closedDrawer?.parentElement).toHaveAttribute(
        "data-history-transition-phase",
        "closing",
      );
      expect(screen.getByLabelText("Task composer")).toBe(composer);
      expect(historyButton).toHaveAttribute("aria-label", "Open chat history");
      expect(historyButton).toHaveAttribute("aria-pressed", "false");

      fireEvent.transitionEnd(closedDrawer as HTMLElement, {
        propertyName: "transform",
      });
      expect(closedDrawer).toHaveClass("closed");
      expect(closedDrawer?.parentElement).not.toHaveClass("history-space-reserved");
    });

  it("moves the most recently started running chat to the top of history", async () => {
      prepareSignedInRun();
      const completedChat = workspaceChatFixture({
        id: 401,
        title: "Earlier completed chat",
        status: "completed",
        latest_activity_at: "2020-07-23T08:21:00.000Z",
      });
      const runningChat = workspaceChatFixture({
        id: 402,
        title: "Build Snake Web App",
        status: "running",
        latest_activity_at: "2019-07-23 11:01:00",
      });
      mocks.createChatMock.mockResolvedValue({
        ...runningChat,
        codex_thread_id: null,
      });
      mocks.listWorkspaceChatsMock.mockResolvedValue([
        completedChat,
        runningChat,
      ]);

      const { user } = await renderApp();
      await startMockRun(user, "Build Snake Web App");

      const banner = screen.getByRole("region", { name: "Selected folder" });
      await user.click(
        within(banner).getByRole("button", { name: /open chat history/i }),
      );
      const drawer = await screen.findByRole("complementary", {
        name: "Workspace chat history",
      });
      const rows = drawer.querySelectorAll<HTMLElement>(".history-run-item");

      expect(rows).toHaveLength(2);
      expect(rows[0]).toHaveTextContent("Build Snake Web App");
      expect(within(rows[0] as HTMLElement).getByLabelText("Agent running"))
        .toBeInTheDocument();
      expect(rows[1]).toHaveTextContent("Earlier completed chat");
    });

  it("coordinates drawer and composer phases without remounting the prompt", async () => {
      mocks.listWorkspaceChatsMock.mockResolvedValue([]);
      const { user } = await renderApp();
      const prompt = screen.getByLabelText("Prompt");
      await user.type(prompt, "Keep this draft");
      const banner = screen.getByRole("region", { name: "Selected folder" });
      const historyButton = within(banner).getByRole("button", {
        name: /open chat history/i,
      });

      await user.click(historyButton);
      const drawer = screen.getByRole("complementary", {
        name: "Workspace chat history",
      });
      const layout = drawer.closest<HTMLElement>(".codex-workspace-body");
      expect(layout).not.toBeNull();

      await waitFor(() =>
        expect(layout).toHaveAttribute("data-history-transition-phase", "opening"),
      );
      expect(layout).toHaveClass("history-space-reserved");
      expect(screen.getByLabelText("Prompt")).toBe(prompt);
      expect(prompt).toHaveValue("Keep this draft");

      fireEvent.transitionEnd(drawer, { propertyName: "transform" });
      await waitFor(() =>
        expect(layout).toHaveAttribute("data-history-transition-phase", "open"),
      );
      expect(layout).toHaveClass("history-space-reserved");

      await user.click(historyButton);
      await waitFor(() =>
        expect(layout).toHaveAttribute("data-history-transition-phase", "closing"),
      );
      expect(layout).not.toHaveClass("history-space-reserved");

      fireEvent.transitionEnd(drawer, { propertyName: "transform" });
      await waitFor(() =>
        expect(layout).toHaveAttribute("data-history-transition-phase", "closed"),
      );
      expect(screen.getByLabelText("Prompt")).toBe(prompt);
      expect(prompt).toHaveValue("Keep this draft");
    });

  it("reverses rapid drawer toggles without remounting or losing the prompt", async () => {
      mocks.listWorkspaceChatsMock.mockResolvedValue([]);
      const { user } = await renderApp();
      const prompt = screen.getByLabelText("Prompt");
      await user.type(prompt, "Keep this draft through reversal");
      const promptTextarea = prompt as HTMLTextAreaElement;
      promptTextarea.setSelectionRange(9, 9);
      const banner = screen.getByRole("region", { name: "Selected folder" });
      const historyButton = within(banner).getByRole("button", {
        name: /open chat history/i,
      });

      await user.click(historyButton);
      const drawer = screen.getByRole("complementary", {
        name: "Workspace chat history",
      });
      const layout = drawer.closest<HTMLElement>(".codex-workspace-body");
      expect(layout).toHaveAttribute("data-history-transition-phase", "opening");
      expect(layout).toHaveClass("history-space-reserved");

      await user.click(historyButton);
      expect(layout).toHaveAttribute("data-history-transition-phase", "closing");
      expect(layout).not.toHaveClass("history-space-reserved");

      await user.click(historyButton);
      expect(layout).toHaveAttribute("data-history-transition-phase", "opening");
      expect(layout).toHaveClass("history-space-reserved");

      fireEvent.transitionEnd(drawer, { propertyName: "transform" });
      expect(layout).toHaveAttribute("data-history-transition-phase", "open");
      expect(screen.getByLabelText("Prompt")).toBe(prompt);
      expect(prompt).toHaveValue("Keep this draft through reversal");
      expect(promptTextarea.selectionStart).toBe(9);
      expect(promptTextarea.selectionEnd).toBe(9);
      await waitFor(() =>
        expect(mocks.codexDefaultProfileRpcMock).toHaveBeenCalledWith(
          "thread/list",
          expect.objectContaining({ cwd: workspace.path }),
        ),
      );
    });

  it("settles the shared drawer transition immediately for reduced motion", async () => {
      const matchMediaSpy = vi
        .spyOn(window, "matchMedia")
        .mockImplementation((query: string) => ({
          matches: query === "(prefers-reduced-motion: reduce)",
          media: query,
          onchange: null,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          addListener: vi.fn(),
          removeListener: vi.fn(),
          dispatchEvent: vi.fn(() => false),
        }));
      mocks.listWorkspaceChatsMock.mockResolvedValue([]);

      const { user } = await renderApp();
      const historyButton = within(
        screen.getByRole("region", { name: "Selected folder" }),
      ).getByRole("button", { name: /open chat history/i });
      await user.click(historyButton);

      const drawer = screen.getByRole("complementary", {
        name: "Workspace chat history",
      });
      await waitFor(() => expect(drawer).toHaveClass("open"));
      expect(drawer.parentElement).toHaveAttribute(
        "data-history-transition-phase",
        "open",
      );

      await user.click(historyButton);
      await waitFor(() => expect(drawer).toHaveClass("closed"));
      expect(drawer.parentElement).toHaveAttribute(
        "data-history-transition-phase",
        "closed",
      );
      matchMediaSpy.mockRestore();
    });

  it("waits for transcript momentum to settle before resizing the chat viewport", async () => {
      const historicalChat = workspaceChatFixture({
        id: 405,
        title: "Scroll-safe history chat",
      });
      mocks.listWorkspaceChatsMock.mockResolvedValue([historicalChat]);
      mocks.listLocalChatTranscriptMock.mockResolvedValue([
        workspaceRunFixture({
          id: 305,
          chat_id: historicalChat.id,
          original_prompt: "Keep scrolling smooth",
          final_message: "The transcript is ready.",
        }),
      ]);
      const { user } = await renderApp();
      const banner = screen.getByRole("region", { name: "Selected folder" });
      const historyButton = within(banner).getByRole("button", {
        name: /open chat history/i,
      });

      await user.click(historyButton);
      const drawer = screen.getByRole("complementary", {
        name: "Workspace chat history",
      });
      await user.click(
        await within(drawer).findByRole("button", {
          name: /scroll-safe history chat/i,
        }),
      );
      expect(await screen.findByText("The transcript is ready.")).toBeInTheDocument();

      const transcript = screen.getByLabelText("Task chat transcript");
      const layout = transcript.closest<HTMLElement>(".codex-workspace-body");
      expect(layout).toHaveAttribute("data-history-transition-phase", "closed");
      fireEvent.wheel(transcript, { deltaY: -120 });
      await user.click(historyButton);

      expect(layout).toHaveAttribute("data-history-transition-phase", "closed");
      await waitFor(
        () =>
          expect(layout).toHaveAttribute(
            "data-history-transition-phase",
            "opening",
          ),
        { timeout: 1_000 },
      );
    });

  it("opens a clicked chat history row in the chat window and closes the drawer", async () => {
      const historicalChat = workspaceChatFixture({
        id: 401,
        title: "Fix the app header",
      });
      const historicalRun = workspaceRunFixture({
        id: 301,
        chat_id: historicalChat.id,
        original_prompt: "Fix the app header",
        final_message: "Header fixed.",
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
        name: /fix the app header/i,
      });
      expect(row).toHaveClass("history-run-item");

      await user.hover(row);
      row.focus();
      expect(row).toHaveFocus();
      await user.click(row);

      await waitFor(() => expect(drawer).toHaveClass("closed"));
      expect(drawer).toHaveAttribute("aria-hidden", "true");
      const submittedPrompt = await screen.findByLabelText("Submitted prompt");
      const transcript = screen.getByLabelText("Task chat transcript");
      expect(submittedPrompt).toHaveTextContent("Fix the app header");
      expect(within(transcript).getByText("Header fixed.")).toBeInTheDocument();
      expect(within(transcript).getByText("1m 0s")).toBeInTheDocument();
      expect(within(transcript).getByText("640 tokens")).toBeInTheDocument();
    });

  it("uses a Kanban chat's isolated worktree branch in the header", async () => {
      const historicalChat = workspaceChatFixture({
        id: 402,
        title: "Add Batman file",
      });
      const historicalRun = workspaceRunFixture({
        id: 302,
        chat_id: historicalChat.id,
        original_prompt: "Add batman.txt",
        final_message:
          "Added [batman.txt](/repo/.codex-kanban/card-batman/orchestrator/batman.txt).",
      });
      mocks.listWorkspaceChatsMock.mockResolvedValue([historicalChat]);
      mocks.getChatWithRunsMock.mockResolvedValue(
        workspaceChatWithRunsFixture(historicalChat, [historicalRun]),
      );
      mocks.getKanbanCardForChatMock.mockResolvedValue({
        id: "card-batman",
        hasStartedTurn: true,
      });
      mocks.loadKanbanGitBindingsMock.mockResolvedValue([
        {
          sourceRepositoryPath: workspace.path,
          relativePath: ".",
          executionRoot: "/repo/.codex-kanban/card-batman",
          sourceBranch: "main",
          baseBranch: "main",
          baseCommit: "0123456789abcdef",
          cardBranch: "codex/add-batman-file",
          worktreePath: "/repo/.codex-kanban/card-batman/orchestrator",
          status: "ready",
          error: null,
        },
      ]);
      mocks.readWorkspaceFilePreviewMock.mockResolvedValue({
        path: "/repo/.codex-kanban/card-batman/orchestrator/batman.txt",
        relativePath: "batman.txt",
        content: "I am Batman.",
        truncated: false,
        isBinary: false,
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
        within(drawer).getByRole("button", { name: /add batman file/i }),
      );

      const branchSelect = within(banner).getByRole("combobox", {
        name: "Branch",
      });
      await waitFor(() =>
        expect(branchSelect).toHaveTextContent("codex/add-batman-file"),
      );
      await user.click(branchSelect);
      expect(
        screen.getByRole("option", { name: "codex/add-batman-file" }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("option", { name: "Create branch..." }),
      ).not.toBeInTheDocument();
      expect(mocks.checkoutGitBranchMock).not.toHaveBeenCalled();

      await user.keyboard("{Escape}");
      await user.click(
        await screen.findByRole("link", { name: "batman.txt" }),
      );
      await waitFor(() =>
        expect(mocks.readWorkspaceFilePreviewMock).toHaveBeenCalledWith(
          "/repo/.codex-kanban/card-batman/orchestrator",
          "/repo/.codex-kanban/card-batman/orchestrator/batman.txt",
        ),
      );
    });

  it("restores a held queue item after restart and keeps the chat queue paused", async () => {
      const historicalChat = workspaceChatFixture({
        id: 409,
        title: "Persisted prompt queue",
      });
      const historicalRun = workspaceRunFixture({
        id: 309,
        chat_id: historicalChat.id,
        original_prompt: "Initial completed work",
        final_message: "Initial work complete.",
      });
      const executionSettings = createRunExecutionSettings({
        accountId: signedInAccount.id,
        profileKey: `account:${signedInAccount.id}`,
        selectedBranch: "main",
        mode: "run",
        intent: "normal",
        accessMode: "ask-for-approval",
        computerUseEnabled: true,
        model: "gpt-5.6",
        reasoningEffort: "medium",
        useOss: false,
        ossProvider: "ollama",
        contextFiles: [],
        selectedSkills: [],
        goalMode: false,
      });
      const snapshot = createQueuedPromptSnapshot({
        prompt: "Keep this prompt held",
        executionSettings,
        contextFingerprint: {
          version: 2,
          workspacePath: workspace.path,
          repositories: [
            {
              repositoryPath: workspace.path,
              branch: "main",
              headCommit: "abc123",
              worktreeFingerprint: "clean",
            },
          ],
          profileKey: `account:${signedInAccount.id}`,
          threadId: historicalChat.codex_thread_id,
          conversationRevision: historicalChat.conversation_revision,
          files: [],
        },
      });
      const heldItem: PromptQueueItem = {
        id: "restored-held-queue-item",
        clientMessageId: "restored-held-message",
        workspaceId: workspace.id,
        chatId: historicalChat.id,
        position: 0,
        sendNowPriority: null,
        autoSendEnabled: false,
        prompt: snapshot.prompt,
        snapshot,
        status: "queued",
        linkedRunId: null,
        linkedTurnId: null,
        error: null,
        staleReasons: [],
        createdAt: "2026-07-26T10:00:00Z",
        updatedAt: "2026-07-26T10:00:00Z",
        acceptedAt: null,
        completedAt: null,
      };
      mocks.listRestoredPromptQueueItemsMock.mockResolvedValue([heldItem]);
      mocks.promptQueueItems.set(heldItem.id, heldItem);
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
        within(drawer).getByRole("button", {
          name: /persisted prompt queue/i,
        }),
      );

      expect(await screen.findByText("Queued")).toBeInTheDocument();
      expect(screen.queryByText("Queue paused")).not.toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: /^Queued/ }));
      expect(screen.getAllByText("Held").length).toBeGreaterThan(0);
      const restore = screen.getByRole("button", {
        name: "Restore automatic sending",
      });
      expect(
        mocks.codexRpcMock.mock.calls.some(([, method]) => method === "turn/start"),
      ).toBe(false);
      await user.click(restore);
      await waitFor(() =>
        expect(mocks.setPromptQueueItemAutoSendMock).toHaveBeenCalledWith(
          heldItem.id,
          true,
        ),
      );
    });

  it("opens another history chat while the current plan awaits review", async () => {
      prepareSignedInRun();
      const historicalChat = workspaceChatFixture({
        id: 402,
        title: "Previously completed chat",
        codex_thread_id: "thread-history",
      });
      const historicalRun = workspaceRunFixture({
        id: 302,
        chat_id: historicalChat.id,
        original_prompt: "Previously completed chat",
        final_message: "Historical response loaded.",
      });
      mocks.listWorkspaceChatsMock.mockResolvedValue([historicalChat]);
      mocks.getChatWithRunsMock.mockResolvedValue(
        workspaceChatWithRunsFixture(historicalChat, [historicalRun]),
      );

      const { user } = await renderApp();
      await startMockRun(user, "Prepare a plan before switching chats");
      await emitCodexNotification({
        method: "item/completed",
        params: {
          threadId: "thread-1",
          turnId: "turn-1",
          item: {
            type: "agentMessage",
            id: "pending-plan-message",
            phase: "final_answer",
            text: "<proposed_plan>\n# Pending plan\n\n- Review this later.\n</proposed_plan>",
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
      expect(await screen.findByLabelText("Codex plan")).toBeInTheDocument();

      const banner = screen.getByRole("region", { name: "Selected folder" });
      await user.click(
        within(banner).getByRole("button", { name: /open chat history/i }),
      );
      const drawer = await screen.findByRole("complementary", {
        name: "Workspace chat history",
      });
      await user.click(
        within(drawer).getByRole("button", { name: /previously completed chat/i }),
      );

      await waitFor(() => expect(drawer).toHaveClass("closed"));
      expect(await screen.findByText("Historical response loaded.")).toBeInTheDocument();
    });

  it("opens and focuses a historical response from a pending native notification", async () => {
      const historicalChat = workspaceChatFixture({
        id: 412,
        title: "Notification target chat",
      });
      const historicalRun = workspaceRunFixture({
        id: 312,
        chat_id: historicalChat.id,
        original_prompt: "Notification target chat",
        final_message: "Opened from a native notification.",
      });
      mocks.listWorkspaceChatsMock.mockResolvedValue([historicalChat]);
      mocks.getChatWithRunsMock.mockResolvedValue(
        workspaceChatWithRunsFixture(historicalChat, [historicalRun]),
      );
      mocks.takePendingAgentNotificationActivationMock.mockResolvedValue({
        eventKey: "response-completed:account:7:thread-1:turn-1:312",
        kind: "response-completed",
        workspaceId: workspace.id,
        chatId: historicalChat.id,
        runId: historicalRun.id,
        entryClientId: null,
        requestId: null,
        planItemId: null,
        accountId: 7,
        profileKey: "account:7",
        threadId: "thread-1",
        turnId: "turn-1",
      });

      await renderApp();

      expect(
        await screen.findByText("Opened from a native notification."),
      ).toBeInTheDocument();
      await waitFor(() =>
        expect(
          document.querySelector<HTMLElement>(
            '[data-agent-notification-target="response"]',
          ),
        ).toHaveFocus(),
      );
    });

  it("atomically switches workspaces and opens the chat targeted by a notification", async () => {
      const otherWorkspace = {
        ...workspace,
        id: 2,
        path: "/repo/mobile-client",
        label: "mobile-client",
      };
      const historicalChat = {
        ...workspaceChatFixture({
          id: 413,
          title: "Mobile notification target",
          codex_thread_id: "thread-mobile",
        }),
        workspace_id: otherWorkspace.id,
      };
      const historicalRun = {
        ...workspaceRunFixture({
          id: 313,
          chat_id: historicalChat.id,
          original_prompt: "Mobile notification target",
          final_message: "Opened in the other workspace.",
        }),
        workspace_id: otherWorkspace.id,
        codex_thread_id: "thread-mobile",
        codex_turn_id: "turn-mobile",
      };
      mocks.listWorkspacesMock.mockResolvedValue([workspace, otherWorkspace]);
      mocks.listWorkspaceChatsMock.mockImplementation(async (workspaceId: number) =>
        workspaceId === otherWorkspace.id ? [historicalChat] : [],
      );
      mocks.listLocalChatTranscriptMock.mockResolvedValue([historicalRun]);
      mocks.takePendingAgentNotificationActivationMock.mockResolvedValue({
        eventKey: "response-completed:account:7:thread-mobile:turn-mobile:313",
        kind: "response-completed",
        workspaceId: otherWorkspace.id,
        chatId: historicalChat.id,
        runId: historicalRun.id,
        entryClientId: null,
        requestId: null,
        planItemId: null,
        accountId: 7,
        profileKey: "account:7",
        threadId: "thread-mobile",
        turnId: "turn-mobile",
      });

      await renderApp();

      expect(
        await screen.findByText("Opened in the other workspace."),
      ).toBeInTheDocument();
      const banner = screen.getByRole("region", { name: "Selected folder" });
      expect(within(banner).getByText("mobile-client")).toBeInTheDocument();
      await waitFor(() =>
        expect(
          document.querySelector<HTMLElement>(
            '[data-agent-notification-target="response"]',
          ),
        ).toHaveFocus(),
      );
    });

  it("allows a notification activation to retry after history loading fails", async () => {
      const historicalChat = workspaceChatFixture({
        id: 414,
        title: "Retry notification target",
      });
      const historicalRun = workspaceRunFixture({
        id: 314,
        chat_id: historicalChat.id,
        original_prompt: "Retry notification target",
        final_message: "Opened after retrying the notification.",
      });
      const target = {
        eventKey: "response-completed:account:7:thread-1:turn-1:314",
        kind: "response-completed" as const,
        workspaceId: workspace.id,
        chatId: historicalChat.id,
        runId: historicalRun.id,
        entryClientId: null,
        requestId: null,
        planItemId: null,
        accountId: 7,
        profileKey: "account:7" as const,
        threadId: "thread-1",
        turnId: "turn-1",
      };
      mocks.listWorkspaceChatsMock
        .mockRejectedValueOnce(new Error("Database temporarily unavailable"))
        .mockResolvedValue([historicalChat]);
      mocks.listLocalChatTranscriptMock.mockResolvedValue([historicalRun]);

      await renderApp();
      await act(async () => {
        mocks.listeners.get("orchestrator:agent-notification-activated")?.({
          payload: target,
        });
        await Promise.resolve();
      });
      await waitFor(() =>
        expect(mocks.listWorkspaceChatsMock).toHaveBeenCalledTimes(1),
      );
      await act(async () => {
        await new Promise((resolve) => window.setTimeout(resolve, 0));
        mocks.listeners.get("orchestrator:agent-notification-activated")?.({
          payload: target,
        });
        await Promise.resolve();
      });

      expect(
        await screen.findByText("Opened after retrying the notification."),
      ).toBeInTheDocument();
      expect(mocks.listWorkspaceChatsMock).toHaveBeenCalledTimes(2);
      await waitFor(() =>
        expect(
          document.querySelector<HTMLElement>(
            '[data-agent-notification-target="response"]',
          ),
        ).toHaveFocus(),
      );
    });

  it("loads a complete local transcript once and performs no history reads while scrolling", async () => {
      const historicalChat = workspaceChatFixture({
        id: 451,
        title: "Large history chat",
        turn_count: 65,
      });
      const historicalRuns = Array.from({ length: 65 }, (_, index) =>
        workspaceRunFixture({
          id: 500 + index,
          chat_id: historicalChat.id,
          turn_index: index + 1,
          original_prompt: `Prompt ${index + 1}`,
          final_message: `Result ${index + 1}.`,
        }),
      );
      mocks.listWorkspaceChatsMock.mockResolvedValue([historicalChat]);
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
        within(drawer).getByRole("button", { name: /large history chat/i }),
      );

      expect(drawer).toHaveClass("closing");
      expect(screen.getByLabelText("Loading chat")).toHaveTextContent(
        "Loading Large history chat",
      );
      expect(await screen.findByText("Result 65.")).toBeInTheDocument();
      expect(screen.queryByText("Result 1.")).not.toBeInTheDocument();
      expect(mocks.listLocalChatTranscriptMock).toHaveBeenCalledTimes(1);
      expect(mocks.listLocalChatTranscriptMock).toHaveBeenCalledWith(451);

      const transcript = screen.getByLabelText("Task chat transcript");
      fireEvent.wheel(transcript, { deltaY: -120 });
      fireEvent.scroll(transcript);
      expect(mocks.listLocalChatTranscriptMock).toHaveBeenCalledTimes(1);
      expect(mocks.listChatRunsPageMock).not.toHaveBeenCalled();
      expect(screen.queryByText("Loading older messages...")).not.toBeInTheDocument();

      const promptInput = screen.getByLabelText("Prompt") as HTMLTextAreaElement;
      await user.type(promptInput, "Draft while the large chat stays mounted");
      promptInput.setSelectionRange(12, 12);
      expect(promptInput).toHaveValue("Draft while the large chat stays mounted");

      const firstTranscriptRow = transcript.querySelector(
        "[data-transcript-entry-id]",
      );
      const transcriptRows = Array.from(
        transcript.querySelectorAll<HTMLElement>("[data-transcript-entry-id]"),
      );
      let transcriptRowShift = 0;
      Object.defineProperties(transcript, {
        clientHeight: { configurable: true, value: 500 },
        scrollHeight: { configurable: true, value: 4_000 },
      });
      transcript.getBoundingClientRect = () =>
        ({ top: 100, bottom: 600 } as DOMRect);
      transcriptRows.forEach((row, index) => {
        row.getBoundingClientRect = () => {
          const top =
            80 +
            index * 120 +
            transcriptRowShift -
            (transcript.scrollTop - 640);
          return { top, bottom: top + 100 } as DOMRect;
        };
      });
      transcript.scrollTop = 640;
      await user.click(
        within(banner).getByRole("button", { name: /open chat history/i }),
      );
      const reopenedDrawer = await screen.findByRole("complementary", {
        name: "Workspace chat history",
      });
      expect(reopenedDrawer).toHaveClass("opening");
      expect(screen.getByLabelText("Task chat transcript")).toBe(transcript);
      expect(
        transcript.querySelector("[data-transcript-entry-id]"),
      ).toBe(firstTranscriptRow);
      expect(screen.getByLabelText("Prompt")).toBe(promptInput);
      expect(promptInput).toHaveValue("Draft while the large chat stays mounted");
      expect(promptInput.selectionStart).toBe(12);
      expect(promptInput.selectionEnd).toBe(12);
      expect(transcript.scrollTop).toBe(640);

      transcriptRowShift = -60;
      fireEvent.transitionEnd(reopenedDrawer, { propertyName: "transform" });
      await waitFor(() => expect(transcript.scrollTop).toBe(580));
      transcriptRowShift = -90;
      await waitFor(() => expect(transcript.scrollTop).toBe(550));
      fireEvent.wheel(transcript, { deltaY: -120 });
      fireEvent.scroll(transcript);
      await user.click(
        within(banner).getByRole("button", { name: /close chat history/i }),
      );
      expect(reopenedDrawer).toHaveClass("open");
      expect(screen.getByLabelText("Task chat transcript")).toBe(transcript);
      expect(transcript.scrollTop).toBe(550);
      expect(reopenedDrawer.parentElement).toHaveClass("history-space-reserved");
      await waitFor(() => expect(reopenedDrawer).toHaveClass("closing"));
      expect(reopenedDrawer.parentElement).not.toHaveClass(
        "history-space-reserved",
      );
      transcriptRowShift = 0;
      fireEvent.transitionEnd(reopenedDrawer, { propertyName: "transform" });
      await waitFor(() => expect(reopenedDrawer).toHaveClass("closed"));
      expect(reopenedDrawer.parentElement).not.toHaveClass(
        "history-space-reserved",
      );
      expect(transcript.scrollTop).toBe(640);
    });

  it("reopens the same historical chat at its latest turn instead of restoring the top", async () => {
      const historicalChat = workspaceChatFixture({
        id: 455,
        title: "Reselected history chat",
        turn_count: 2,
      });
      const historicalRuns = [
        workspaceRunFixture({
          id: 610,
          chat_id: historicalChat.id,
          turn_index: 1,
          original_prompt: "First prompt",
          final_message: "First result.",
        }),
        workspaceRunFixture({
          id: 611,
          chat_id: historicalChat.id,
          turn_index: 2,
          original_prompt: "Latest prompt",
          final_message: "Latest result.",
        }),
      ];
      mocks.listWorkspaceChatsMock.mockResolvedValue([historicalChat]);
      mocks.listLocalChatTranscriptMock.mockResolvedValue(historicalRuns);

      const { user } = await renderApp();
      const banner = screen.getByRole("region", { name: "Selected folder" });
      const historyButton = within(banner).getByRole("button", {
        name: /open chat history/i,
      });
      await user.click(historyButton);
      let drawer = await screen.findByRole("complementary", {
        name: "Workspace chat history",
      });
      await user.click(
        within(drawer).getByRole("button", { name: /reselected history chat/i }),
      );
      expect(await screen.findByText("Latest result.")).toBeInTheDocument();

      await user.click(historyButton);
      drawer = await screen.findByRole("complementary", {
        name: "Workspace chat history",
      });
      await user.click(
        within(drawer).getByRole("button", { name: /reselected history chat/i }),
      );
      expect(await screen.findByText("Latest result.")).toBeInTheDocument();

      await waitFor(() => {
        const visibleLayer = document.querySelector<HTMLElement>(
          ".task-chat-transcript-layer.is-visible",
        );
        expect(visibleLayer).not.toBeNull();
        const transcript = within(visibleLayer as HTMLElement).getByRole(
          "region",
          { name: "Task chat transcript" },
        );
        expect(transcript).toHaveClass("virtuoso-transcript");
        expect(
          transcript.querySelectorAll(".task-chat-virtuoso-row"),
        ).toHaveLength(2);
      });
    });

  it("publishes an uncached external transcript once after its full snapshot is ready", async () => {
      const historicalChat = {
        ...workspaceChatFixture({
        id: 452,
        title: "External history chat",
        codex_thread_id: "external-thread-large",
        origin: "codex_external",
        profile_key: "default",
        external_thread_id: "external-thread-large",
        source_kind: "vscode",
        turn_count: 65,
        }),
        account_id: null,
        account_label: null,
        account_email: null,
        external_updated_at: "2026-06-30T10:30:00Z",
      };
      let resolveSnapshot:
        | ((snapshot: ReturnType<typeof externalTranscriptSnapshotFixture>) => void)
        | null = null;
      const snapshotPromise = new Promise<
        ReturnType<typeof externalTranscriptSnapshotFixture>
      >(
        (resolve) => {
          resolveSnapshot = resolve;
        },
      );
      mocks.listWorkspaceChatsMock.mockResolvedValue([historicalChat]);
      mocks.codexDefaultProfileRpcMock.mockImplementation(async (method: string) => {
        if (method === "thread/list") return { threads: [] };
        if (method === "thread/turns/list") {
          return {
            data: Array.from({ length: 20 }, (_, index) =>
              externalTurnFixture(65 - index),
            ),
          };
        }
        return {};
      });
      mocks.syncDefaultProfileThreadTranscriptMock.mockReturnValue(snapshotPromise);

      const { user } = await renderApp();
      const banner = screen.getByRole("region", { name: "Selected folder" });
      await user.click(
        within(banner).getByRole("button", { name: /open chat history/i }),
      );
      const drawer = await screen.findByRole("complementary", {
        name: "Workspace chat history",
      });
      await user.click(
        within(drawer).getByRole("button", { name: /external history chat/i }),
      );
      expect(screen.getByLabelText("Loading chat")).toHaveTextContent(
        "Loading External history chat",
      );
      expect(screen.queryByText("External result 65.")).not.toBeInTheDocument();
      expect(screen.queryByText("External result 1.")).not.toBeInTheDocument();

      await act(async () => {
        resolveSnapshot?.(externalTranscriptSnapshotFixture(65));
        await Promise.resolve();
      });
      await waitFor(() =>
        expect(mocks.activateExternalTranscriptSnapshotMock).toHaveBeenCalled(),
      );
      expect(await screen.findByText("External result 65.")).toBeInTheDocument();
      expect(screen.queryByText("External result 1.")).not.toBeInTheDocument();
      expect(
        screen
          .getByRole("region", { name: "Task chat transcript" })
          .querySelectorAll(".task-chat-virtuoso-row"),
      ).toHaveLength(24);
      expect(mocks.syncDefaultProfileThreadTranscriptMock).toHaveBeenCalledTimes(1);
      expect(mocks.codexDefaultProfileRpcMock).not.toHaveBeenCalledWith(
        "thread/turns/list",
        expect.anything(),
      );
      expect(mocks.listChatRunsPageMock).not.toHaveBeenCalled();
    });

  it("defers complete transcript hydration until drawer resizing has settled", async () => {
      let notifyTaskResize: ((width: number) => void) | null = null;
      vi.stubGlobal(
        "ResizeObserver",
        class {
          private callback: ResizeObserverCallback;

          constructor(callback: ResizeObserverCallback) {
            this.callback = callback;
          }

          observe(element: Element) {
            if (element.classList.contains("task-hero")) {
              notifyTaskResize = (width: number) => {
                this.callback(
                  [{ contentRect: { width } } as ResizeObserverEntry],
                  this as unknown as ResizeObserver,
                );
              };
            }
          }

          unobserve() {}

          disconnect() {}
        },
      );

      try {
        const historicalChat = {
          ...workspaceChatFixture({
            id: 462,
            title: "Resize-safe external chat",
            codex_thread_id: "external-thread-resize",
            origin: "codex_external",
            profile_key: "default",
            external_thread_id: "external-thread-resize",
            source_kind: "vscode",
            turn_count: 65,
          }),
          account_id: null,
          account_label: null,
          account_email: null,
          external_updated_at: "2026-06-30T10:30:00Z",
        };
        let resolveSnapshot:
          | ((snapshot: ReturnType<typeof externalTranscriptSnapshotFixture>) => void)
          | null = null;
        mocks.listWorkspaceChatsMock.mockResolvedValue([historicalChat]);
        mocks.codexDefaultProfileRpcMock.mockImplementation(async (method: string) => {
          if (method === "thread/list") return { threads: [] };
          if (method === "thread/turns/list") {
            return {
              data: Array.from({ length: 20 }, (_, index) =>
                externalTurnFixture(65 - index),
              ),
            };
          }
          return {};
        });
        mocks.syncDefaultProfileThreadTranscriptMock.mockReturnValue(
          new Promise((resolve) => {
            resolveSnapshot = resolve;
          }),
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
          within(drawer).getByRole("button", { name: /resize-safe external chat/i }),
        );

        const triggerResize = notifyTaskResize as ((width: number) => void) | null;
        expect(triggerResize).not.toBeNull();
        if (!triggerResize) {
          throw new Error("Task viewport ResizeObserver was not attached.");
        }
        act(() => triggerResize(900));
        expect(screen.getByLabelText("Loading chat")).toHaveTextContent(
          "Loading Resize-safe external chat",
        );

        act(() => {
          resolveSnapshot?.(externalTranscriptSnapshotFixture(65));
        });
        act(() => triggerResize(880));
        await act(async () => {
          await new Promise((resolve) => window.setTimeout(resolve, 80));
        });
        act(() => triggerResize(860));
        await act(async () => {
          await new Promise((resolve) => window.setTimeout(resolve, 80));
        });
        act(() => triggerResize(840));
        await act(async () => {
          await new Promise((resolve) => window.setTimeout(resolve, 100));
        });
        expect(screen.queryByText("External result 65.")).not.toBeInTheDocument();
        expect(screen.queryByText("External result 1.")).not.toBeInTheDocument();

        act(() => triggerResize(820));
        expect(await screen.findByText("External result 65.")).toBeInTheDocument();
        expect(screen.queryByText("External result 1.")).not.toBeInTheDocument();
      } finally {
        vi.unstubAllGlobals();
      }
    });

  it("opens a current external transcript snapshot without an app-server history request", async () => {
      const historicalChat = {
        ...workspaceChatFixture({
          id: 453,
          title: "Cached external chat",
          codex_thread_id: "external-thread-large",
          origin: "codex_external",
          profile_key: "default",
          external_thread_id: "external-thread-large",
          source_kind: "vscode",
          turn_count: 3,
        }),
        account_id: null,
        account_label: null,
        account_email: null,
        external_updated_at: "2026-06-30T10:30:00Z",
      };
      const cachedSnapshot = {
        ...externalTranscriptSnapshotFixture(3),
        requestId: "cached",
        chatId: historicalChat.id,
        syncedAt: "2026-06-30T10:31:00Z",
      };
      mocks.listWorkspaceChatsMock.mockResolvedValue([historicalChat]);
      mocks.readExternalTranscriptSnapshotMock.mockImplementation(
        async (_chatId: number, sourceVersion?: string) =>
          sourceVersion === historicalChat.external_updated_at ? cachedSnapshot : null,
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
        within(drawer).getByRole("button", { name: /cached external chat/i }),
      );

      expect(await screen.findByText("External result 3.")).toBeInTheDocument();
      expect(screen.getByText("External result 1.")).toBeInTheDocument();
      expect(mocks.syncDefaultProfileThreadTranscriptMock).not.toHaveBeenCalled();
      expect(mocks.activateExternalTranscriptSnapshotMock).not.toHaveBeenCalled();
      expect(mocks.codexDefaultProfileRpcMock).not.toHaveBeenCalledWith(
        "thread/turns/list",
        expect.anything(),
      );
    });

  it("keeps a stale cached transcript visible when its background refresh fails", async () => {
      const historicalChat = {
        ...workspaceChatFixture({
          id: 454,
          title: "Stale external chat",
          codex_thread_id: "external-thread-large",
          origin: "codex_external",
          profile_key: "default",
          external_thread_id: "external-thread-large",
          source_kind: "vscode",
          turn_count: 3,
        }),
        account_id: null,
        account_label: null,
        account_email: null,
        external_updated_at: "2026-06-30T11:30:00Z",
      };
      const staleSnapshot = {
        ...externalTranscriptSnapshotFixture(3),
        requestId: "cached",
        chatId: historicalChat.id,
        sourceVersion: "2026-06-30T10:30:00Z",
        syncedAt: "2026-06-30T10:31:00Z",
      };
      mocks.listWorkspaceChatsMock.mockResolvedValue([historicalChat]);
      mocks.readExternalTranscriptSnapshotMock.mockImplementation(
        async (_chatId: number, sourceVersion?: string) =>
          sourceVersion ? null : staleSnapshot,
      );
      mocks.syncDefaultProfileThreadTranscriptMock.mockRejectedValue(
        new Error("History sync unavailable"),
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
        within(drawer).getByRole("button", { name: /stale external chat/i }),
      );

      expect(await screen.findByText("External result 3.")).toBeInTheDocument();
      await waitFor(() =>
        expect(mocks.syncDefaultProfileThreadTranscriptMock).toHaveBeenCalledTimes(1),
      );
      expect(screen.getByText("External result 1.")).toBeInTheDocument();
      expect(mocks.activateExternalTranscriptSnapshotMock).not.toHaveBeenCalled();
      expect(mocks.codexDefaultProfileRpcMock).not.toHaveBeenCalledWith(
        "thread/turns/list",
        expect.anything(),
      );
    });

  it("ignores a stale history load after another chat is selected", async () => {
      const firstChat = workspaceChatFixture({ id: 461, title: "Slow chat" });
      const secondChat = workspaceChatFixture({ id: 462, title: "Fast chat" });
      let resolveSlowChat: ((runs: ReturnType<typeof workspaceRunFixture>[]) => void) | null =
        null;
      const slowChatRuns = new Promise<ReturnType<typeof workspaceRunFixture>[]>(
        (resolve) => {
          resolveSlowChat = resolve;
        },
      );
      mocks.listWorkspaceChatsMock.mockResolvedValue([firstChat, secondChat]);
      mocks.listLocalChatTranscriptMock.mockImplementation(async (chatId: number) => {
        if (chatId === firstChat.id) {
          return slowChatRuns;
        }
        return [
          workspaceRunFixture({
            id: 602,
            chat_id: secondChat.id,
            original_prompt: "Fast chat prompt",
            final_message: "Fast chat result.",
          }),
        ];
      });

      const { user } = await renderApp();
      const banner = screen.getByRole("region", { name: "Selected folder" });
      const historyButton = within(banner).getByRole("button", {
        name: /open chat history/i,
      });
      await user.click(historyButton);
      let drawer = await screen.findByRole("complementary", {
        name: "Workspace chat history",
      });
      await user.click(within(drawer).getByRole("button", { name: /slow chat/i }));
      await waitFor(() =>
        expect(mocks.listLocalChatTranscriptMock).toHaveBeenCalledWith(461),
      );

      await user.click(historyButton);
      drawer = await screen.findByRole("complementary", {
        name: "Workspace chat history",
      });
      await user.click(within(drawer).getByRole("button", { name: /fast chat/i }));
      expect(await screen.findByText("Fast chat result.")).toBeInTheDocument();

      await act(async () => {
        resolveSlowChat?.([
          workspaceRunFixture({
            id: 601,
            chat_id: firstChat.id,
            original_prompt: "Slow chat prompt",
            final_message: "Slow chat result.",
          }),
        ]);
        await Promise.resolve();
      });

      expect(screen.getByText("Fast chat result.")).toBeInTheDocument();
      expect(screen.queryByText("Slow chat result.")).not.toBeInTheDocument();
    });

  it("removes the previous transcript immediately while another chat loads", async () => {
      const firstChat = workspaceChatFixture({ id: 463, title: "First chat" });
      const secondChat = workspaceChatFixture({ id: 464, title: "Second chat" });
      const thirdChat = workspaceChatFixture({ id: 465, title: "Third chat" });
      let resolveSecondChat:
        | ((runs: ReturnType<typeof workspaceRunFixture>[]) => void)
        | null = null;
      const secondChatRuns = new Promise<ReturnType<typeof workspaceRunFixture>[]>(
        (resolve) => {
          resolveSecondChat = resolve;
        },
      );
      mocks.listWorkspaceChatsMock.mockResolvedValue([
        firstChat,
        secondChat,
        thirdChat,
      ]);
      mocks.listLocalChatTranscriptMock.mockImplementation(async (chatId: number) => {
        if (chatId === secondChat.id) return secondChatRuns;
        return [
          workspaceRunFixture({
            id: chatId + 1_000,
            chat_id: chatId,
            original_prompt: `${chatId} prompt`,
            final_message:
              chatId === firstChat.id
                ? "First conversation result."
                : "Third conversation result.",
          }),
        ];
      });

      const { user } = await renderApp();
      const banner = screen.getByRole("region", { name: "Selected folder" });
      const historyButton = within(banner).getByRole("button", {
        name: /open chat history/i,
      });

      await user.click(historyButton);
      let drawer = await screen.findByRole("complementary", {
        name: "Workspace chat history",
      });
      await user.click(
        within(drawer).getByRole("button", { name: /first chat/i }),
      );
      expect(await screen.findByText("First conversation result.")).toBeInTheDocument();

      await user.click(historyButton);
      drawer = await screen.findByRole("complementary", {
        name: "Workspace chat history",
      });
      const firstRow = within(drawer).getByRole("button", { name: /first chat/i });
      const secondRow = within(drawer).getByRole("button", {
        name: /second chat/i,
      });
      await user.click(secondRow);

      expect(secondRow).toHaveAttribute("aria-pressed", "true");
      expect(firstRow).toHaveAttribute("aria-pressed", "false");
      expect(screen.getByLabelText("Loading chat")).toHaveTextContent(
        "Loading Second chat",
      );
      expect(screen.queryByText("First conversation result.")).not.toBeInTheDocument();
      expect(
        document.querySelector(".task-chat-transcript-switcher.is-suspended"),
      ).toBeNull();

      await user.click(historyButton);
      drawer = await screen.findByRole("complementary", {
        name: "Workspace chat history",
      });
      await user.click(
        within(drawer).getByRole("button", { name: /third chat/i }),
      );
      expect(await screen.findByText("Third conversation result.")).toBeInTheDocument();

      await act(async () => {
        resolveSecondChat?.([
          workspaceRunFixture({
            id: 1_464,
            chat_id: secondChat.id,
            original_prompt: "Second prompt",
            final_message: "Second conversation result.",
          }),
        ]);
        await Promise.resolve();
      });

      expect(screen.getByText("Third conversation result.")).toBeInTheDocument();
      expect(screen.queryByText("Second conversation result.")).not.toBeInTheDocument();
    });
});
