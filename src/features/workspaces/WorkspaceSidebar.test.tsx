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
    priority: { status: "loaded", chats: [], error: null, now: Date.now() },
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
    fireEvent.click(screen.getByRole("button", { name: "Show more" }));
    expect(handlers.loadChats).toHaveBeenCalledWith(workspace, true);
    expect(screen.queryByRole("button", { name: "Files" })).not.toBeInTheDocument();
    expect(handlers.openFile).not.toHaveBeenCalled();
  });

  it("shows grouped Priority metadata, retains read chats and hides live reruns", () => {
    const chats = [101, 102].map((id) => ({
      ...workspaceChatFixture({ id, workspace_id: 1, title: `Chat ${id}` }),
      latest_finished_at: "2026-09-12T12:00:00Z",
      latest_finished_status: "failed" as const,
    }));
    render(
      <WorkspaceSidebar
        model={model({
          mode: "priority",
          priority: { status: "loaded", chats, error: null, now: Date.parse("2026-09-12T12:00:00Z") },
          runningChatActivity: new Map([[102, "2026-09-12T12:01:00Z"]]),
        })}
        actions={actions()}
      />,
    );
    const row = screen.getByRole("button", { name: "app · Chat 101" });
    expect(row).toBeVisible();
    expect(screen.getByRole("heading", { name: "Today" })).toBeVisible();
    expect(within(row).getByText("app")).toBeVisible();
    expect(screen.queryByRole("button", { name: "app · Chat 102" })).not.toBeInTheDocument();
    expect(row).toHaveAccessibleDescription(
      `app · failed · ${new Date(chats[0].latest_finished_at).toLocaleString()}`,
    );
    expect(row).toHaveAttribute(
      "data-tooltip",
      `Chat 101 · app · failed · ${new Date(chats[0].latest_finished_at).toLocaleString()}`,
    );
    expect(
      screen.queryByRole("button", { name: "Expand app" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Sidebar mode" })).not.toBeInTheDocument();
  });

  it("disables Show more while loading, retains rows on failure and hides it when exhausted", () => {
    const handlers = actions();
    const chat = workspaceChatFixture({ title: "Retained chat" });
    const history = { status: "loading" as const, chats: [chat], error: null, hasMore: true };
    const data = model({ mode: "chats", expandedWorkspaceIds: new Set([1]), histories: { 1: history } });
    const { rerender } = render(<WorkspaceSidebar model={data} actions={handlers} />);
    expect(screen.getByRole("button", { name: "Show more" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Retained chat" })).toBeVisible();
    rerender(<WorkspaceSidebar model={{ ...data, histories: { 1: { ...history, status: "error", error: "Offline" } } }} actions={handlers} />);
    expect(screen.getByRole("button", { name: "Retained chat" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(handlers.loadChats).toHaveBeenCalledWith(workspace);
    rerender(<WorkspaceSidebar model={{ ...data, histories: { 1: { ...history, status: "loaded", hasMore: false } } }} actions={handlers} />);
    expect(screen.queryByRole("button", { name: "Show more" })).not.toBeInTheDocument();
  });

  it("distinguishes duplicate titles by inline workspace and preserves full labels and row actions", () => {
    const handlers = actions();
    const longLabel = "A workspace with a deliberately long name";
    const title = "A deliberately long shared conversation title";
    const chats = [1, 2].map((id) => ({
      ...workspaceChatFixture({ id, workspace_id: id, title }),
      latest_finished_at: new Date(2026, 8, 17, 10).toISOString(),
      latest_finished_status: "completed" as const,
    }));
    render(<WorkspaceSidebar model={model({
      mode: "priority", selectedChatId: 2, unreadChats: { 2: [2] },
      workspaces: [workspace, { ...workspace, id: 2, label: longLabel }],
      priority: { status: "loaded", chats, error: null, now: new Date(2026, 8, 17, 12).getTime() },
    })} actions={handlers} />);
    expect(screen.getByRole("button", { name: `app · ${title}` })).toBeVisible();
    const row = screen.getByRole("button", { name: `${longLabel} · ${title}, unread activity` });
    expect(within(row).getByText(longLabel)).toBeVisible();
    expect(row).toHaveAttribute("aria-pressed", "true");
    expect(row.getAttribute("data-tooltip")).toContain(`${title} · ${longLabel}`);
    expect(row.getAttribute("aria-description")).toContain(longLabel);
    fireEvent.click(row);
    expect(handlers.selectChat).toHaveBeenCalledWith(chats[1]);
    fireEvent.keyDown(row, { key: "F10", shiftKey: true });
    expect(handlers.openChatContextMenu).toHaveBeenCalledWith(chats[1], expect.anything());
    fireEvent.contextMenu(row);
    expect(handlers.openChatContextMenu).toHaveBeenCalledTimes(2);
  });

  it("restores each mode's scroll position and exposes retry actions", () => {
    const handlers = actions();
    const { rerender } = render(
      <WorkspaceSidebar model={model({ mode: "chats" })} actions={handlers} />,
    );
    const nav = screen.getByRole("navigation", { name: "Chats" });
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
