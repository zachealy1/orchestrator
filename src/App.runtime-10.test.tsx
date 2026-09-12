import { sidebarChats } from "./test/appRuntimeHarness";
import { openSidebarChats } from "./test/appRuntimeHarness";
import { screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  appServices,
  getMocks,
  prepareDefaults,
  renderApp,
  setWindowWidth,
  workspace,
  workspaceChatFixture,
  workspaceChatWithRunsFixture,
  workspaceRunFixture,
} from "./test/appRuntimeHarness";

const mocks = getMocks();

describe("Application runtime scenarios 10", () => {
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

  it("opens the exact history chat selected on every drawer click", async () => {
    const chats = [
      workspaceChatFixture({ id: 411, title: "Alpha conversation" }),
      workspaceChatFixture({ id: 412, title: "Beta conversation" }),
      workspaceChatFixture({ id: 413, title: "Gamma conversation" }),
    ];
    mocks.listWorkspaceChatsMock.mockResolvedValue(chats);
    mocks.listLocalChatTranscriptMock.mockImplementation(
      async (chatId: number) => [
        workspaceRunFixture({
          id: chatId + 1_000,
          chat_id: chatId,
          original_prompt: `Prompt for chat ${chatId}`,
          final_message: `Result for chat ${chatId}.`,
        }),
      ],
    );

    const { user } = await renderApp();

    const selectChat = async (title: string, chatId: number) => {
      await openSidebarChats(user);
      const drawer = sidebarChats();
      await user.click(
        within(drawer).getByRole("button", {
          name: new RegExp(title, "i"),
        }),
      );

      await waitFor(() => {
        const visibleLayer = document.querySelector<HTMLElement>(
          ".task-chat-transcript-layer.is-visible",
        );
        expect(visibleLayer).not.toBeNull();
        expect(
          within(visibleLayer as HTMLElement).getByText(
            `Result for chat ${chatId}.`,
          ),
        ).toBeInTheDocument();
      });

      await openSidebarChats(user);
      const reopenedDrawer = sidebarChats();
      expect(
        within(reopenedDrawer).getByRole("button", {
          name: new RegExp(title, "i"),
        }),
      ).toHaveAttribute("aria-pressed", "true");
      await openSidebarChats(user);
    };

    await selectChat("Alpha conversation", 411);
    await selectChat("Gamma conversation", 413);
    await selectChat("Beta conversation", 412);
    await selectChat("Alpha conversation", 411);

    await user.click(screen.getByRole("button", { name: /new chat/i }));
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();

    await selectChat("Gamma conversation", 413);
    expect(mocks.listLocalChatTranscriptMock).toHaveBeenCalledWith(411);
    expect(mocks.listLocalChatTranscriptMock).toHaveBeenCalledWith(412);
    expect(mocks.listLocalChatTranscriptMock).toHaveBeenCalledWith(413);
  });

  it("keeps the remembered chat viewport mounted while switching workspaces", async () => {
    const mobileWorkspace = {
      ...workspace,
      id: 2,
      path: "/repo/mobile-client",
      label: "mobile-client",
    };
    const historicalChat = workspaceChatFixture({
      id: 416,
      title: "ExpressJS App Scaffolding Plan",
    });
    const historicalRuns = Array.from({ length: 18 }, (_, index) =>
      workspaceRunFixture({
        id: 316 + index,
        task_id: 116 + index,
        chat_id: historicalChat.id,
        turn_index: index + 1,
        original_prompt: `Prompt ${index + 1}`,
        final_message: `Result ${index + 1}.`,
      }),
    );
    mocks.listWorkspacesMock.mockResolvedValue([workspace, mobileWorkspace]);
    mocks.listWorkspaceChatsMock.mockImplementation(
      async (workspaceId: number) =>
        workspaceId === workspace.id ? [historicalChat] : [],
    );
    mocks.getChatWithRunsMock.mockResolvedValue(
      workspaceChatWithRunsFixture(historicalChat, historicalRuns),
    );
    mocks.listLocalChatTranscriptMock.mockResolvedValue(historicalRuns);

    const { user } = await renderApp();
    await openSidebarChats(user);
    const drawer = sidebarChats();
    await user.click(
      within(drawer).getByRole("button", {
        name: /expressjs app scaffolding plan/i,
      }),
    );
    expect(await screen.findByText("Result 18.")).toBeInTheDocument();
    const transcriptBeforeSwitch = screen.getByLabelText(
      "Task chat transcript",
    );

    mocks.virtuosoState = {
      ranges: [{ startIndex: 7, endIndex: 13 }],
      scrollTop: 1_842,
    };
    const workspaceNav = screen.getByRole("navigation", {
      name: "Workspaces",
    });
    await user.click(
      within(workspaceNav).getByRole("button", { name: "mobile-client" }),
    );
    const suspendedTranscript = document.querySelector<HTMLElement>(
      ".task-chat-transcript-switcher.is-suspended",
    );
    expect(suspendedTranscript).not.toBeNull();
    expect(suspendedTranscript).toHaveTextContent("Result 18.");

    // The retained DOM owns this transition; clearing the bounded fallback
    // cache must not force the viewport to remount.
    appServices.transcriptStates.clear();
    await user.click(
      within(workspaceNav).getByRole("button", { name: "orchestrator" }),
    );

    expect(await screen.findByLabelText("Task chat transcript")).toBe(
      transcriptBeforeSwitch,
    );
    expect(screen.getByText("Result 18.")).toBeInTheDocument();
  });
});
