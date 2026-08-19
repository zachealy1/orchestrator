import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { workspace, workspaceChatFixture } from "../../test/appRuntimeHarness";
import { WorkspaceHistoryDrawer } from "./WorkspaceHistoryDrawer";

describe("WorkspaceHistoryDrawer unread conversations", () => {
  it("marks every unread chat without treating drawer visibility as a read", () => {
    const firstUnreadChat = workspaceChatFixture({
      id: 401,
      title: "First unread chat",
      latest_activity_at: "2026-08-19T19:40:00Z",
    });
    const readChat = workspaceChatFixture({
      id: 402,
      title: "Read chat",
      latest_activity_at: "2026-08-19T19:39:00Z",
    });
    const secondUnreadChat = workspaceChatFixture({
      id: 403,
      title: "Second unread chat",
      latest_activity_at: "2026-08-19T19:38:00Z",
    });
    const onSelectChat = vi.fn();

    render(
      <WorkspaceHistoryDrawer
        phase="open"
        workspace={{ ...workspace, selected_git_repository_path: null }}
        historyState={{
          status: "loaded",
          chats: [firstUnreadChat, readChat, secondUnreadChat],
          error: null,
        }}
        selectedChatId={readChat.id}
        runningChatActivity={new Map()}
        unreadChatIds={[firstUnreadChat.id, secondUnreadChat.id]}
        onSelectChat={onSelectChat}
        onOpenChatContextMenu={() => undefined}
        onTransitionEnd={() => undefined}
      />,
    );

    const firstUnreadRow = screen.getByRole("button", {
      name: "First unread chat, unread activity",
    });
    const secondUnreadRow = screen.getByRole("button", {
      name: "Second unread chat, unread activity",
    });
    const readRow = screen.getByTitle("Read chat");

    expect(firstUnreadRow.querySelector(".history-run-unread-dot")).not.toBeNull();
    expect(secondUnreadRow.querySelector(".history-run-unread-dot")).not.toBeNull();
    expect(readRow.querySelector(".history-run-unread-dot")).toBeNull();
    expect(onSelectChat).not.toHaveBeenCalled();

    fireEvent.click(secondUnreadRow);
    expect(onSelectChat).toHaveBeenCalledWith(secondUnreadChat);
  });
});
