import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { workspaceChatFixture } from "../../test/appRuntimeHarness";
import type { Workspace, WorkspaceGitFileStatus } from "./types";
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
    setMode: vi.fn(),
    selectChat: vi.fn(),
    openChatContextMenu: vi.fn(),
    loadChats: vi.fn(),
    retryPriority: vi.fn(),
    addWorkspace: vi.fn(),
    toggleWorkspace: vi.fn(),
    selectWorkspace: vi.fn(),
    handleWorkspaceKeyDown: vi.fn(),
    openWorkspaceContextMenu: vi.fn(),
    requestWorkspaceDelete: vi.fn(),
    toggleDirectory: vi.fn(),
    retryDirectory: vi.fn(),
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
    mode: "files",
    histories: {},
    priority: { status: "loaded", chats: [], error: null },
    selectedChatId: null,
    runningChatActivity: new Map(),
    unreadChats: {},
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

describe("sidebar modes", () => {
  it("shows workspace-specific chat rows, unread/running state and row actions", () => {
    const handlers = actions();
    const chat = workspaceChatFixture({
      id: 101,
      workspace_id: 1,
      title: "First chat",
    });
    render(
      <WorkspaceSidebar
        model={model({
          mode: "chats",
          expandedWorkspaceIds: new Set([1]),
          selectedChatId: 101,
          histories: {
            1: { status: "loaded", chats: [chat], error: null, hasMore: true },
          },
          runningChatActivity: new Map([[101, chat.latest_activity_at]]),
          unreadChats: { 1: [101] },
        })}
        actions={handlers}
      />,
    );
    const row = screen.getByRole("button", {
      name: "First chat, unread activity, agent running",
    });
    expect(row).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(row);
    expect(handlers.selectChat).toHaveBeenCalledWith(chat);
    fireEvent.keyDown(row, { key: "F10", shiftKey: true });
    expect(handlers.openChatContextMenu).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(handlers.loadChats).toHaveBeenCalledWith(workspace, true);
    fireEvent.click(screen.getByRole("button", { name: "Files" }));
    expect(handlers.setMode).toHaveBeenCalledWith("files");
    expect(handlers.openFile).not.toHaveBeenCalled();
  });

  it("shows flat Priority metadata, retains read chats and hides live reruns", () => {
    const chats = [101, 102].map((id) => ({
      ...workspaceChatFixture({ id, workspace_id: 1, title: `Chat ${id}` }),
      latest_finished_at: "2026-09-12T12:00:00Z",
      latest_finished_status: "failed" as const,
    }));
    render(
      <WorkspaceSidebar
        model={model({
          mode: "priority",
          priority: { status: "loaded", chats, error: null },
          runningChatActivity: new Map([[102, "2026-09-12T12:01:00Z"]]),
        })}
        actions={actions()}
      />,
    );
    expect(screen.getByTitle("Chat 101")).toBeVisible();
    expect(screen.queryByTitle("Chat 102")).not.toBeInTheDocument();
    expect(screen.getByText("app · failed")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Expand app" }),
    ).not.toBeInTheDocument();
    expect(
      within(screen.getByRole("group", { name: "Sidebar mode" })).getAllByRole(
        "button",
      ),
    ).toHaveLength(3);
  });

  it("restores each mode's scroll position and exposes retry actions", () => {
    const handlers = actions();
    const { rerender } = render(
      <WorkspaceSidebar model={model({ mode: "chats" })} actions={handlers} />,
    );
    const nav = screen.getByRole("navigation", { name: "Workspaces" });
    fireEvent.scroll(nav, { target: { scrollTop: 120 } });
    rerender(
      <WorkspaceSidebar model={model({ mode: "files" })} actions={handlers} />,
    );
    expect(nav.scrollTop).toBe(0);
    fireEvent.scroll(nav, { target: { scrollTop: 40 } });
    rerender(
      <WorkspaceSidebar
        model={model({
          mode: "chats",
          expandedWorkspaceIds: new Set([1]),
          histories: {
            1: {
              status: "error",
              chats: [],
              hasMore: false,
              error: "Unavailable",
            },
          },
        })}
        actions={handlers}
      />,
    );
    expect(nav.scrollTop).toBe(120);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(handlers.loadChats).toHaveBeenCalledWith(workspace);
  });
});
