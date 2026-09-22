import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getMocks, prepareDefaults, prepareSignedInRun, renderApp, workspace, openSidebarChats, sidebarChats, workspaceChatFixture, workspaceChatWithRunsFixture } from "./test/appRuntimeHarness";
import { sourceControlApi } from "./features/source-control/api";
import type { WorkspaceGitRepositoryStatus } from "./features/workspaces/types";

const mocks = getMocks();
const originalPlatform = window.navigator.platform;
afterEach(() => Object.defineProperty(window.navigator, "platform", { configurable: true, value: originalPlatform }));
const repository: WorkspaceGitRepositoryStatus = {
  repository: { rootPath: workspace.path, relativePath: ".", label: workspace.label },
  workspacePath: workspace.path, gitRoot: workspace.path, currentBranch: "main", aheadCount: 0,
  hasUpstream: true, hasOrigin: true, canPush: false, additions: 1, deletions: 1,
  files: [{ path: workspace.path + "/app.ts", relativePath: "app.ts", repositoryPath: workspace.path,
    repositoryRelativePath: "app.ts", oldRelativePath: null, indexStatus: "M", worktreeStatus: "M", statusKind: "modified", badge: "M" }],
};
beforeEach(() => {
  mocks.listeners.clear(); vi.clearAllMocks(); localStorage.clear(); prepareDefaults(); prepareSignedInRun();
  Object.defineProperty(window.navigator, "platform", { configurable: true, value: "MacIntel" });
  mocks.listWorkspaceGitStatusMock.mockResolvedValue({ workspacePath: workspace.path, repositories: [repository], additions: 1, deletions: 1, changedRepositoryCount: 1, files: repository.files, unavailableRepositories: [] });
  vi.spyOn(sourceControlApi, "status").mockResolvedValue({ repository, remotes: ["origin"], upstream: "origin/main" });
  vi.spyOn(sourceControlApi, "history").mockResolvedValue({ commits: [], cursor: null });
  vi.spyOn(sourceControlApi, "stage").mockResolvedValue();
});

describe("Git workspace integration", () => {
  it("preserves composer and commit drafts across global navigation, and uses staged-only commit execution", async () => {
    const { user } = await renderApp();
    await user.type(screen.getByLabelText("Prompt"), "Preserve the conversation draft");
    await user.click(screen.getByRole("button", { name: "Source control" }));
    expect(await screen.findByLabelText("Commit message")).toBeVisible();
    await waitFor(() => expect(screen.getByRole("region", { name: "Staged files" })).toBeVisible());
    expect(screen.getByRole("region", { name: "Unstaged files" })).toBeVisible();
    expect(screen.queryByRole("navigation", { name: "Chats" })).not.toBeInTheDocument();
    await user.type(screen.getByLabelText("Commit message"), "Update staged application code");
    // This is available before the commit creates the first ahead commit.
    expect(screen.getByRole("button", { name: "Commit and Push" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Analytics" }));
    await user.click(screen.getByRole("button", { name: "Source control" }));
    expect(screen.getByLabelText("Commit message")).toHaveValue("Update staged application code");
    await waitFor(() => expect(screen.getByRole("button", { name: "Commit" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "Commit" }));
    await waitFor(() => expect(mocks.commitWorkspaceChangesMock).toHaveBeenCalledWith(workspace.path, "Update staged application code", false, workspace.path));
    await waitFor(() => expect(screen.getByLabelText("Commit message")).toHaveValue(""));
    await user.click(screen.getByRole("button", { name: "Chats" }));
    expect(screen.getByLabelText("Prompt")).toHaveValue("Preserve the conversation draft");
  });

  it("toggles sidebar visibility with Cmd+B and explicit shortcuts reopen it without changing Kanban", async () => {
    const { user } = await renderApp();
    const key = (code: string, value: string) => fireEvent.keyDown(window, { code, key: value, metaKey: true });
    key("Digit4", "4"); key("KeyB", "b");
    expect(document.querySelector("#workspace-sidebar")).not.toBeVisible();
    await user.click(screen.getByRole("button", { name: "Source control" }));
    key("Digit2", "2");
    expect(screen.getByRole("navigation", { name: "Files" })).toBeVisible();
    expect(within(screen.getByRole("region", { name: "Selected folder" })).getByRole("radio", { name: "Kanban" })).toHaveAttribute("aria-checked", "true");
    await user.click(screen.getByRole("button", { name: "Files" }));
    expect(document.querySelector("#workspace-sidebar")).not.toBeVisible();
    key("Digit2", "2"); expect(screen.getByRole("navigation", { name: "Files" })).toBeVisible();
  });

  it("opens Source control from the command palette and dismisses Account with focus return", async () => {
    const { user } = await renderApp();
    const account = screen.getByLabelText("Codex account");
    await user.click(account); expect(await screen.findByRole("dialog", { name: "Account" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Report a bug" })).toBeVisible();
    await user.keyboard("{Escape}"); expect(account).toHaveFocus();
    await user.click(account); await user.click(screen.getByRole("button", { name: "Analytics" }));
    expect(screen.queryByRole("dialog", { name: "Account" })).not.toBeInTheDocument();
    fireEvent.keyDown(window, { code: "KeyK", key: "k", metaKey: true });
    await user.type(screen.getByRole("combobox", { name: "Search commands" }), "source control");
    await user.keyboard("{Enter}"); expect(await screen.findByLabelText("Commit message")).toBeVisible();
  });

  it("retries an unavailable card worktree without reading or mutating the workspace checkout", async () => {
    const chat = workspaceChatFixture({ id: 402, title: "Isolated card" });
    const binding = { sourceRepositoryPath: workspace.path, relativePath: ".", executionRoot: "/cards/card-402",
      sourceBranch: "main", baseBranch: "main", baseCommit: "a".repeat(40), cardBranch: "codex/isolated-card",
      worktreePath: "/cards/card-402/repository", status: "ready", error: null };
    mocks.listWorkspaceChatsMock.mockResolvedValue([chat]);
    mocks.getChatWithRunsMock.mockResolvedValue(workspaceChatWithRunsFixture(chat, []));
    mocks.getKanbanCardForChatMock.mockResolvedValue({ id: "card-402", hasStartedTurn: true });
    mocks.loadKanbanGitBindingsMock.mockResolvedValue([binding]);
    mocks.readKanbanGitStatusMock.mockRejectedValueOnce(new Error("The selected card worktree is temporarily unavailable"));
    const { user } = await renderApp();
    await openSidebarChats(user);
    await user.click(within(sidebarChats()).getByRole("button", { name: /isolated card/i }));
    await waitFor(() => expect(mocks.readKanbanGitStatusMock).toHaveBeenCalled());
    await user.click(screen.getByRole("button", { name: "Source control" }));
    const view = screen.getByRole("region", { name: "Source control" });
    expect(await within(view).findByRole("alert")).toHaveTextContent("temporarily unavailable");
    expect(within(view).getByText(binding.worktreePath)).toBeVisible();
    expect(sourceControlApi.status).not.toHaveBeenCalled();
    expect(sourceControlApi.stage).not.toHaveBeenCalled();
    expect(within(view).getByRole("button", { name: "Fetch" })).toBeDisabled();
    await user.click(within(view).getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(sourceControlApi.status).toHaveBeenCalledWith(expect.objectContaining({ kind: "kanban-card", worktreePath: binding.worktreePath })));
    expect(within(view).queryByRole("alert")).not.toBeInTheDocument();
    expect(within(view).getByText("Card worktree · branch locked")).toBeVisible();
  });
});
