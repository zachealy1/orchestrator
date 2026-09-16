import { sidebarChats } from "./test/appRuntimeHarness";
import { openSidebarChats } from "./test/appRuntimeHarness";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getMocks,
  prepareDefaults,
  prepareSignedInRun,
  renderApp,
  setWindowWidth,
  startMockRun,
  workspace,
  workspaceChatFixture,
  workspaceChatWithRunsFixture,
  workspaceRunFixture,
} from "./test/appRuntimeHarness";

const mocks = getMocks();

describe("Application multi-repository runtime", () => {
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

  it("starts chats from the workspace without selecting a repository or switching a branch", async () => {
    prepareSignedInRun();
    const appPath = `${workspace.path}/app`;
    const docsPath = `${workspace.path}/docs`;
    mocks.listWorkspaceGitStatusMock.mockResolvedValue({
      workspacePath: workspace.path,
      repositories: [
        {
          workspacePath: workspace.path,
          gitRoot: appPath,
          currentBranch: "main",
          files: [],
          repository: {
            rootPath: appPath,
            relativePath: "app",
            label: "app",
          },
        },
        {
          workspacePath: workspace.path,
          gitRoot: docsPath,
          currentBranch: "docs-main",
          files: [],
          repository: {
            rootPath: docsPath,
            relativePath: "docs",
            label: "docs",
          },
        },
      ],
      additions: 0,
      deletions: 0,
      changedRepositoryCount: 0,
      files: [],
      discoveryTruncated: false,
    });
    mocks.inspectPromptQueueContextMock.mockResolvedValue({
      workspacePath: workspace.path,
      repositories: [
        {
          repositoryPath: appPath,
          branch: "main",
          headCommit: "app-head",
          worktreeFingerprint: "clean",
        },
        {
          repositoryPath: docsPath,
          branch: "docs-main",
          headCommit: "docs-head",
          worktreeFingerprint: "clean",
        },
      ],
      files: [],
    });

    const { user } = await renderApp();
    const banner = screen.getByRole("region", { name: "Selected folder" });
    await waitFor(() =>
      expect(within(banner).queryByLabelText("Branch")).not.toBeInTheDocument(),
    );
    await startMockRun(user, "Update the app and its documentation");

    expect(mocks.checkoutGitBranchMock).not.toHaveBeenCalled();
    const runInput = mocks.createRunMock.mock.calls[0]?.[0];
    expect(JSON.parse(runInput.executionSettingsJson)).toMatchObject({
      selectedRepositoryPath: null,
      selectedBranch: null,
    });
    expect(mocks.saveNativeWorkspaceBindingMock).not.toHaveBeenCalled();
    expect(mocks.codexRpcMock).toHaveBeenCalledWith(
      7,
      "thread/start",
      expect.objectContaining({
        cwd: workspace.path,
        runtimeWorkspaceRoots: [workspace.path, appPath, docsPath],
      }),
    );
    const turnStart = mocks.codexRpcMock.mock.calls.find(
      ([, method]) => method === "turn/start",
    );
    expect(turnStart?.[2]).toEqual(
      expect.objectContaining({
        additionalContext: expect.objectContaining({
          "workspace:repositories": expect.objectContaining({
            value: expect.stringContaining("no repository is preselected"),
          }),
        }),
      }),
    );
  });

  it("offers every current repository when continuing an older single-repository chat", async () => {
    const appPath = `${workspace.path}/app`;
    const docsPath = `${workspace.path}/docs`;
    const chat = workspaceChatFixture({ id: 501, title: "Older app task" });
    const run = workspaceRunFixture({
      id: 502,
      chat_id: chat.id,
      execution_settings_json: JSON.stringify({
        selectedRepositoryPath: appPath,
        selectedBranch: "main",
      }),
    });
    mocks.listWorkspaceChatsMock.mockResolvedValue([chat]);
    mocks.getChatWithRunsMock.mockResolvedValue(
      workspaceChatWithRunsFixture(chat, [run]),
    );
    mocks.listWorkspaceGitStatusMock.mockResolvedValue({
      workspacePath: workspace.path,
      repositories: [
        {
          workspacePath: workspace.path,
          gitRoot: appPath,
          currentBranch: "main",
          files: [],
          repository: {
            rootPath: appPath,
            relativePath: "app",
            label: "app",
          },
        },
        {
          workspacePath: workspace.path,
          gitRoot: docsPath,
          currentBranch: "docs-main",
          files: [],
          repository: {
            rootPath: docsPath,
            relativePath: "docs",
            label: "docs",
          },
        },
      ],
      additions: 0,
      deletions: 0,
      changedRepositoryCount: 0,
      files: [],
      discoveryTruncated: false,
    });

    const { user } = await renderApp();
    await openSidebarChats(user);
    const drawer = sidebarChats();
    const row = within(drawer)
      .getByText("Older app task")
      .closest(".history-run-item");
    fireEvent.contextMenu(row as HTMLElement, { clientX: 120, clientY: 140 });
    await user.click(
      screen.getByRole("menuitem", { name: "Continue in new worktree" }),
    );

    const dialog = await screen.findByRole("dialog", {
      name: "Continue in new worktree",
    });
    expect(within(dialog).getByText("app")).toBeInTheDocument();
    expect(within(dialog).getByText("docs")).toBeInTheDocument();
  });
});
