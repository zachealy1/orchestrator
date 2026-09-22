import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  emitCodexNotification,
  getMocks,
  openSidebarChats,
  prepareDefaults,
  prepareSignedInRun,
  renderApp,
  startMockRun,
  workspace,
  workspaceChatFixture,
  workspaceChatWithRunsFixture,
  workspaceRunFixture,
} from "./test/appRuntimeHarness";
import {
  readSidebarPreferences,
  SIDEBAR_STORAGE_KEY,
} from "./features/workspaces/sidebarPreferences";

const mocks = getMocks();
beforeEach(() => {
  mocks.listeners.clear();
  vi.clearAllMocks();
  localStorage.clear();
  prepareDefaults();
});

describe("unified application sidebar", () => {
  it("restores file expansion and allows retrying an unavailable workspace", async () => {
    localStorage.setItem(
      SIDEBAR_STORAGE_KEY,
      JSON.stringify({
        mode: "files",
        files: [workspace.id],
        directories: [workspace.path + "/src"],
      }),
    );
    mocks.listWorkspaceDirectoryMock.mockImplementation(async (_root, path) => {
      if (path === workspace.path) throw new Error("Folder unavailable");
      return [];
    });
    const { user } = await renderApp();
    expect(await screen.findByText("Folder unavailable")).toBeVisible();
    mocks.listWorkspaceDirectoryMock.mockImplementation(async (_root, path) =>
      path === workspace.path
        ? [
            {
              name: "src",
              path: workspace.path + "/src",
              relativePath: "src",
              kind: "directory",
            },
          ]
        : [],
    );
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(
      await screen.findByRole("button", { name: "Collapse src" }),
    ).toBeVisible();
    expect(await screen.findByText("Empty folder")).toBeVisible();
  });

  it("preserves the composer and independent expansions across all modes without rendering a history drawer", async () => {
    const { user } = await renderApp();
    const prompt = screen.getByLabelText("Prompt");
    await user.type(prompt, "Keep this draft");
    await openSidebarChats(user);
    expect(
      screen.getByRole("button", { name: "Collapse orchestrator" }),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Files" }));
    expect(
      screen.getByRole("button", { name: "Expand orchestrator" }),
    ).toBeVisible();
    await user.click(
      screen.getByRole("button", { name: "Expand orchestrator" }),
    );
    await user.click(screen.getByRole("button", { name: "Priority" }));
    expect(
      await screen.findByText("No chats finished in the last 24 hours."),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Chats" }));
    expect(
      screen.getByRole("button", { name: "Collapse orchestrator" }),
    ).toBeVisible();
    expect(screen.getByLabelText("Prompt")).toBe(prompt);
    expect(prompt).toHaveValue("Keep this draft");
    expect(readSidebarPreferences()).toMatchObject({
      mode: "chats",
      chats: [workspace.id],
      files: [workspace.id],
    });
    expect(
      screen.queryByRole("button", { name: /open chat history/i }),
    ).not.toBeInTheDocument();
    expect(document.querySelector(".workspace-history-drawer")).toBeNull();
    for (const label of ["Analytics", "Settings", "Plugins"])
      expect(screen.getByRole("button", { name: label })).toBeVisible();
  });

  it("expands two chat workspaces independently and opens a chat in its owning workspace", async () => {
    const other = { ...workspace, id: 2, path: "/second", label: "Second" };
    const firstChat = workspaceChatFixture({
      id: 401,
      title: "First workspace chat",
    });
    const secondChat = workspaceChatFixture({
      id: 402,
      workspace_id: 2,
      title: "Second workspace chat",
    });
    mocks.listWorkspacesMock.mockResolvedValue([workspace, other]);
    mocks.listWorkspaceChatsMock.mockImplementation(async (id) =>
      id === 1 ? [firstChat] : [secondChat],
    );
    mocks.listLocalChatTranscriptMock.mockResolvedValue([
      {
        ...workspaceRunFixture({
          chat_id: 402,
          original_prompt: "Second workspace prompt",
          final_message: "Second workspace result",
        }),
        workspace_id: 2,
      },
    ]);
    const { user } = await renderApp();
    await openSidebarChats(user);
    await user.click(screen.getByRole("button", { name: "Expand Second" }));
    expect(await screen.findByRole("button", { name: /^First workspace chat/ })).toBeVisible();
    await user.click(await screen.findByRole("button", { name: /^Second workspace chat/ }));
    expect(await screen.findByText("Second workspace result")).toBeVisible();
    expect(screen.getByRole("button", { name: "Second" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(
      screen.getByRole("button", { name: "Collapse orchestrator" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Collapse Second" }),
    ).toBeVisible();
  });

  it("retains revealed chat counts across mode switches and workspace collapse", async () => {
    mocks.listWorkspaceChatsMock.mockResolvedValue(Array.from({ length: 11 }, (_, index) =>
      workspaceChatFixture({ id: index + 1, title: `History chat ${index + 1}` }),
    ));
    const { user } = await renderApp();
    await openSidebarChats(user);
    const rows = () => screen.getAllByRole("button", { name: /^History chat/ });
    await waitFor(() => expect(rows()).toHaveLength(5));
    await user.click(screen.getByRole("button", { name: "Show more" }));
    await waitFor(() => expect(rows()).toHaveLength(10));
    await user.click(screen.getByRole("button", { name: "Files" }));
    await user.click(screen.getByRole("button", { name: "Chats" }));
    await waitFor(() => expect(rows()).toHaveLength(10));
    await user.click(screen.getByRole("button", { name: "Collapse orchestrator" }));
    expect(screen.queryByRole("button", { name: /^History chat/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Expand orchestrator" }));
    await waitFor(() => expect(rows()).toHaveLength(10));
    await user.click(screen.getByRole("button", { name: "Show more" }));
    await waitFor(() => expect(rows()).toHaveLength(11));
    expect(screen.queryByRole("button", { name: "Show more" })).not.toBeInTheDocument();
  });

  it("opens a dated Priority row in its owning workspace", async () => {
    const other = { ...workspace, id: 2, path: "/second", label: "Second" };
    const chat = workspaceChatFixture({ id: 402, workspace_id: 2, title: "Priority in second workspace" });
    mocks.listWorkspacesMock.mockResolvedValue([workspace, other]);
    mocks.listPriorityChatsMock.mockResolvedValue([{
      ...chat, latest_finished_at: new Date().toISOString(), latest_finished_status: "completed",
    }]);
    mocks.getChatWithRunsMock.mockResolvedValue(workspaceChatWithRunsFixture(chat));
    mocks.listLocalChatTranscriptMock.mockResolvedValue([{
      ...workspaceRunFixture({ chat_id: 402, original_prompt: "Second workspace prompt", final_message: "Second workspace result" }),
      workspace_id: 2,
    }]);
    const { user } = await renderApp();
    await user.click(screen.getByRole("button", { name: "Priority" }));
    const row = await screen.findByRole("button", { name: "Second · Priority in second workspace" });
    expect(screen.getByRole("heading", { name: "Today" })).toBeVisible();
    await user.click(row);
    expect(await screen.findByText("Second workspace result")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Chats" }));
    expect(screen.getByRole("button", { name: "Second" })).toHaveAttribute("aria-current", "page");
  });

  it("keeps read chats in Priority, hides a live rerun and restores it after finishing", async () => {
    prepareSignedInRun();
    const chat = workspaceChatFixture({ title: "Priority conversation" });
    const finished = {
      ...chat,
      latest_finished_at: new Date().toISOString(),
      latest_finished_status: "completed",
    };
    mocks.listWorkspaceChatsMock.mockResolvedValue([chat]);
    mocks.listPriorityChatsMock.mockResolvedValue([finished]);
    mocks.getChatWithRunsMock.mockResolvedValue(
      workspaceChatWithRunsFixture(chat),
    );
    const { user } = await renderApp();
    await user.click(screen.getByRole("button", { name: "Priority" }));
    await user.click(await screen.findByRole("button", { name: /^orchestrator · Priority conversation/ }));
    expect(await screen.findByLabelText("Submitted prompt")).toBeVisible();
    expect(screen.getByRole("button", { name: /^orchestrator · Priority conversation/ })).toBeVisible();
    await startMockRun(user, "Run it again");
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: /^orchestrator · Priority conversation/ }),
      ).not.toBeInTheDocument(),
    );
    await emitCodexNotification({
      method: "turn/completed",
      params: {
        threadId: "thread-1",
        turnId: "turn-1",
        turn: { id: "turn-1", status: "completed", durationMs: 1000 },
      },
    });
    expect(await screen.findByRole("button", { name: /^orchestrator · Priority conversation/ })).toBeVisible();
    const calls = mocks.listPriorityChatsMock.mock.calls.length;
    fireEvent(window, new Event("focus"));
    await waitFor(() =>
      expect(mocks.listPriorityChatsMock.mock.calls.length).toBeGreaterThan(
        calls,
      ),
    );
    expect(
      within(screen.getByRole("navigation", { name: "Priority" })).getByRole(
        "button", { name: /^orchestrator · Priority conversation/ },
      ),
    ).toBeVisible();
  });
});
