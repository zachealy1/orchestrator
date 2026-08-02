import { render, screen } from "@testing-library/react";
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

function renderBanner(surfaceMode: "chat" | "kanban") {
  const onSurfaceModeChange = vi.fn();
  render(
    <WorkspaceContextBanner
      workspace={workspace}
      surfaceMode={surfaceMode}
      onSurfaceModeChange={onSurfaceModeChange}
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
  it("shows Kanban scope in board mode and requests chat mode", async () => {
    const user = userEvent.setup();
    const onSurfaceModeChange = renderBanner("kanban");

    expect(screen.getByRole("radio", { name: "Kanban" })).toBeChecked();
    expect(
      screen.getByText("Card agents run in isolated worktrees"),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Branch")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("New chat")).not.toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: "Chat" }));
    expect(onSurfaceModeChange).toHaveBeenCalledWith("chat");
  });

  it("keeps normal workspace actions in chat mode", () => {
    renderBanner("chat");

    expect(screen.getByRole("radio", { name: "Chat" })).toBeChecked();
    expect(screen.getByLabelText("Branch")).toBeInTheDocument();
    expect(screen.getByLabelText("New chat")).toBeInTheDocument();
    expect(
      screen.queryByText("Card agents run in isolated worktrees"),
    ).not.toBeInTheDocument();
  });
});
