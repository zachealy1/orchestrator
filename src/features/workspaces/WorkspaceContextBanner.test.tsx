import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { WorkspaceContextBanner } from "./WorkspaceContextBanner";
import type { Workspace } from "./types";

const workspace: Workspace = {
  id: 7,
  path: "/workspace",
  label: "Workspace",
  default_account_id: null,
  selected_git_repository_path: null,
  last_opened_at: "2026-08-02T10:00:00Z",
  created_at: "2026-08-02T10:00:00Z",
};

function renderBanner(
  surfaceMode: "chat" | "kanban",
  kanbanToolbarHostRef?: (element: HTMLDivElement | null) => void,
) {
  const onSurfaceModeChange = vi.fn();
  render(
    <WorkspaceContextBanner
      workspace={workspace}
      surfaceMode={surfaceMode}
      onSurfaceModeChange={onSurfaceModeChange}
      kanbanToolbarHostRef={kanbanToolbarHostRef}
      repositories={[]}
      repositoryPath={null}
      branch={null}
      branches={[]}
      gitState={{ status: "loaded", snapshot: null, error: null }}
      gitSummary={{
        total: 0,
        modified: 0,
        added: 0,
        deleted: 0,
        untracked: 0,
        conflicted: 0,
        additions: 0,
        deletions: 0,
      }}
      gitAction={{
        label: "Git unavailable",
        disabled: true,
        canCommit: false,
        canPush: false,
        statusLabel: "Git unavailable",
        statusKind: "disabled",
        reason: "No repository",
      }}
      gitActionStatus="idle"
      commitDialogOpen={false}
      contextUsage={null}
      contextWindow={258_400}
      onGitAction={vi.fn()}
      onRepositoryChange={vi.fn()}
      onBranchChange={vi.fn()}
      branchCreationBusy={false}
      onCreateBranch={vi.fn()}
      newChatDisabled={false}
      onNewChat={vi.fn()}
      historyOpen={false}
      historyNotificationCount={0}
      onToggleHistory={vi.fn()}
      browserSession={null}
      onFocusBrowser={vi.fn()}
      onStopBrowser={vi.fn()}
      windowDragRegionsEnabled={false}
    />,
  );
  return onSurfaceModeChange;
}

describe("WorkspaceContextBanner surface switch", () => {
  it("places the compact switcher directly beside the workspace identity", () => {
    renderBanner("chat");

    const leadingGroup = document.querySelector(".workspace-header-leading");
    const switcher = screen.getByRole("radiogroup", { name: "Workspace mode" });
    expect(leadingGroup).toContainElement(switcher);
    expect(leadingGroup).toHaveTextContent("Workspace");
    expect(screen.queryByText("/workspace")).not.toBeInTheDocument();
    expect(
      document.querySelector(".workspace-header-control-rail"),
    ).not.toContainElement(switcher);
  });

  it("provides a toolbar host only while the Kanban surface is visible", () => {
    const hostRef = vi.fn();
    const { unmount } = render(
      <WorkspaceContextBanner
        workspace={workspace}
        surfaceMode="kanban"
        onSurfaceModeChange={vi.fn()}
        kanbanToolbarHostRef={hostRef}
        repositories={[]}
        repositoryPath={null}
        branch={null}
        branches={[]}
        gitState={{ status: "loaded", snapshot: null, error: null }}
        gitSummary={{
          total: 0,
          modified: 0,
          added: 0,
          deleted: 0,
          untracked: 0,
          conflicted: 0,
          additions: 0,
          deletions: 0,
        }}
        gitAction={{
          label: "Git unavailable",
          disabled: true,
          canCommit: false,
          canPush: false,
          statusLabel: "Git unavailable",
          statusKind: "disabled",
          reason: "No repository",
        }}
        gitActionStatus="idle"
        commitDialogOpen={false}
        contextUsage={null}
        contextWindow={258_400}
        onGitAction={vi.fn()}
        onRepositoryChange={vi.fn()}
        onBranchChange={vi.fn()}
        branchCreationBusy={false}
        onCreateBranch={vi.fn()}
        newChatDisabled={false}
        onNewChat={vi.fn()}
        historyOpen={false}
        historyNotificationCount={0}
        onToggleHistory={vi.fn()}
        browserSession={null}
        onFocusBrowser={vi.fn()}
        onStopBrowser={vi.fn()}
        windowDragRegionsEnabled={false}
      />,
    );

    expect(hostRef).toHaveBeenCalledWith(expect.any(HTMLDivElement));
    expect(
      document.querySelector(".workspace-kanban-header-controls"),
    ).toBeInTheDocument();

    unmount();
    expect(hostRef.mock.calls.some(([element]) => element === null)).toBe(true);
  });

  it("shows Kanban scope in board mode and requests chat mode", async () => {
    const user = userEvent.setup();
    const onSurfaceModeChange = renderBanner("kanban");

    expect(screen.getByRole("radio", { name: "Kanban" })).toBeChecked();
    expect(
      screen.queryByText("Card agents run in isolated worktrees"),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Branch")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("New chat")).not.toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: "Chat" }));
    expect(onSurfaceModeChange).toHaveBeenCalledWith("chat");
  });

  it("keeps normal workspace actions in chat mode", () => {
    renderBanner("chat");

    expect(screen.getByRole("radio", { name: "Chat" })).toBeChecked();
    expect(screen.queryByText("Chat")).not.toBeInTheDocument();
    expect(screen.queryByText("Kanban")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Branch")).toBeInTheDocument();
    expect(screen.getByLabelText("New chat")).toBeInTheDocument();
    expect(
      screen.queryByText("Card agents run in isolated worktrees"),
    ).not.toBeInTheDocument();
  });

  it("supports the app's roving keyboard pattern", async () => {
    const user = userEvent.setup();
    const onSurfaceModeChange = renderBanner("chat");
    const chat = screen.getByRole("radio", { name: "Chat" });
    const kanban = screen.getByRole("radio", { name: "Kanban" });

    expect(chat).toHaveAttribute("tabindex", "0");
    expect(kanban).toHaveAttribute("tabindex", "-1");
    chat.focus();
    await user.keyboard("{ArrowRight}");

    expect(onSurfaceModeChange).toHaveBeenCalledWith("kanban");
    await waitFor(() => expect(kanban).toHaveFocus());
  });
});
