import { act, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getMocks,
  prepareDefaults,
  prepareKanbanRun,
  renderApp,
  setWindowWidth,
  signedInAccount,
  workspace,
  workspaceChatFixture,
} from "./test/appRuntimeHarness";

const mocks = getMocks();

describe("Kanban background account reconciliation", () => {
  beforeEach(() => {
    mocks.listeners.clear();
    vi.clearAllMocks();
    vi.useRealTimers();
    localStorage.clear();
    setWindowWidth(1024);
    document.documentElement.removeAttribute("data-theme");
    mocks.virtuosoState = { ranges: [{ startIndex: 0, endIndex: 0 }], scrollTop: 0 };
    prepareDefaults();
  });

  it.each([signedInAccount.id, null])(
    "does not migrate an added-account conversation during shared discovery (card account %s)",
    async (cardAccountId) => {
      prepareKanbanRun();
      const chat = workspaceChatFixture({
        id: 777,
        title: "Keep the captured account",
        profile_key: `account:${signedInAccount.id}`,
        codex_thread_id: "managed-thread",
      });
      mocks.listWorkspaceChatsMock.mockResolvedValue([chat]);
      mocks.getChatRecordMock.mockResolvedValue(chat);
      mocks.loadKanbanBoardMock.mockResolvedValue({
        workspaceId: workspace.id, revision: 1, columns: [], preferencesJson: "{}",
        cards: [{
          id: "managed-card", chatId: chat.id, workspaceId: workspace.id,
          accountId: cardAccountId, hasStartedTurn: true, deletedAt: null,
        }],
      });
      const { user } = await renderApp();
      await waitFor(() => expect(mocks.loadKanbanBoardMock).toHaveBeenCalled());
      await user.click(screen.getByRole("radio", { name: "Kanban" }));
      await user.click(screen.getByRole("radio", { name: "Chat" }));
      await act(async () => { await Promise.resolve(); });
      expect(mocks.loadKanbanGitBindingsMock).not.toHaveBeenCalled();
      expect(mocks.activateSharedNativeWorkspaceBindingMock).not.toHaveBeenCalled();
      expect(mocks.activateChatAccountHandoffMock).not.toHaveBeenCalled();
      expect(mocks.codexDefaultProfileRpcMock.mock.calls.some(([method]) =>
        method === "thread/start" || method === "thread/resume",
      )).toBe(false);
    },
  );
});
