import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type {
  Workspace,
  WorkspaceGitFileStatus,
} from "./types";
import {
  WorkspaceSidebar,
  type WorkspaceSidebarActions,
  type WorkspaceSidebarModel,
} from "./WorkspaceSidebar";

const workspace: Workspace = {
  id: 1,
  path: "/workspace/app",
  label: "app",
  default_account_id: null,
  selected_git_repository_path: null,
  last_opened_at: "2026-08-02T00:00:00.000Z",
  created_at: "2026-08-02T00:00:00.000Z",
};

function actions(): WorkspaceSidebarActions {
  return {
    addWorkspace: vi.fn(),
    toggleWorkspace: vi.fn(),
    selectWorkspace: vi.fn(),
    handleWorkspaceKeyDown: vi.fn(),
    openWorkspaceContextMenu: vi.fn(),
    requestWorkspaceDelete: vi.fn(),
    toggleDirectory: vi.fn(),
    startFileDrag: vi.fn(),
    updateFileDrag: vi.fn(),
    finishFileDrag: vi.fn(),
    cancelFileDrag: vi.fn(),
    shouldSuppressFileClick: () => false,
    openFile: vi.fn(),
  };
}

function model(
  overrides: Partial<WorkspaceSidebarModel> = {},
): WorkspaceSidebarModel {
  return {
    workspaces: [workspace],
    selectedWorkspaceId: 1,
    taskViewActive: true,
    runIsActive: false,
    expandedWorkspaceIds: new Set(),
    expandedDirectoryPaths: new Set(),
    directoryStates: {},
    gitStatusByWorkspaceId: new Map(),
    dirtyDirectoryPathsByWorkspaceId: new Map(),
    contextMenu: null,
    contextMenuRef: { current: null },
    ...overrides,
  };
}

describe("WorkspaceSidebar", () => {
  it("selects an inactive workspace and toggles an active one", () => {
    const handlers = actions();
    const { rerender } = render(
      <WorkspaceSidebar
        model={model({ selectedWorkspaceId: null })}
        actions={handlers}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "app" }));
    expect(handlers.selectWorkspace).toHaveBeenCalledWith(1);

    rerender(<WorkspaceSidebar model={model()} actions={handlers} />);
    fireEvent.click(screen.getByRole("button", { name: "app" }));
    expect(handlers.toggleWorkspace).toHaveBeenCalledWith(workspace);
  });

  it("renders merged Git files and opens them through the feature action", () => {
    const handlers = actions();
    const status: WorkspaceGitFileStatus = {
      path: "/workspace/app/new.ts",
      relativePath: "new.ts",
      repositoryPath: "/workspace/app",
      repositoryRelativePath: "new.ts",
      oldRelativePath: null,
      indexStatus: "?",
      worktreeStatus: "?",
      statusKind: "untracked",
      badge: "U",
    };
    render(
      <WorkspaceSidebar
        model={model({
          expandedWorkspaceIds: new Set([1]),
          directoryStates: {
            "/workspace/app": {
              status: "loaded",
              entries: [],
              error: null,
            },
          },
          gitStatusByWorkspaceId: new Map([[1, new Map([["new.ts", status]])]]),
          dirtyDirectoryPathsByWorkspaceId: new Map([[1, new Set([""])]]),
        })}
        actions={handlers}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /new\.ts/i }));
    expect(handlers.openFile).toHaveBeenCalledWith(
      workspace,
      expect.objectContaining({ relativePath: "new.ts" }),
    );
  });
});
