import { screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getMocks,
  prepareDefaults,
  renderApp,
  setWindowWidth,
  workspaceChatFixture,
  workspaceChatWithRunsFixture,
  workspaceRunFixture,
} from "./test/appRuntimeHarness";

const mocks = getMocks();

describe("Kanban chat diff preview", () => {
  beforeEach(() => {
    mocks.listeners.clear();
    vi.clearAllMocks();
    vi.useRealTimers();
    localStorage.clear();
    setWindowWidth(1024);
    prepareDefaults();
  });

  it("loads a historical card edit from its isolated worktree and base commit", async () => {
    const chat = workspaceChatFixture({ id: 402, title: "Update game" });
    const run = workspaceRunFixture({
      id: 302,
      chat_id: chat.id,
      original_prompt: "Update game",
      final_message: "Updated the game.",
      latest_diff: [
        "diff --git a/01-space-invaders-test/src/game.ts b/01-space-invaders-test/src/game.ts",
        "--- a/01-space-invaders-test/src/game.ts",
        "+++ b/01-space-invaders-test/src/game.ts",
        "@@ -1 +1 @@",
        "-before",
        "+updated",
        "",
      ].join("\n"),
    });
    const binding = {
      sourceRepositoryPath: "/repo/orchestrator/01-space-invaders-test",
      relativePath: "01-space-invaders-test",
      executionRoot: "/cards/card-game",
      sourceBranch: "main",
      baseBranch: "main",
      baseCommit: "0123456789abcdef",
      cardBranch: "codex/update-game",
      worktreePath: "/cards/card-game/01-space-invaders-test",
      status: "ready",
      error: null,
    };
    mocks.listWorkspaceChatsMock.mockResolvedValue([chat]);
    mocks.getChatWithRunsMock.mockResolvedValue(
      workspaceChatWithRunsFixture(chat, [run]),
    );
    mocks.getKanbanCardForChatMock.mockResolvedValue({
      id: "card-game",
      hasStartedTurn: true,
    });
    mocks.loadKanbanGitBindingsMock.mockResolvedValue([binding]);
    mocks.loadPersistedRunActivityMock.mockResolvedValue({
      commands: [], toolActivities: [], nextCursor: null,
      editedFiles: [{
        path: `${binding.worktreePath}/src/game.ts`, name: "game.ts",
        additions: 0, deletions: 0, status: "modified",
      }],
    });
    mocks.readKanbanGitFileDiffMock.mockResolvedValue({
      path: `${binding.worktreePath}/src/game.ts`,
      relativePath: "src/game.ts",
      sections: [
        {
          kind: "unstaged",
          title: "Card changes",
          baseLabel: "main:src/game.ts",
          headLabel: "codex/update-game:src/game.ts",
          baseContent: "before\n",
          headContent: "updated\n",
          baseTruncated: false,
          headTruncated: false,
          content: "@@ -1 +1 @@\n-before\n+updated\n",
          isBinary: false,
        },
      ],
    });

    const { user } = await renderApp();
    const header = screen.getByRole("region", { name: "Selected folder" });
    await user.click(
      within(header).getByRole("button", { name: /open chat history/i }),
    );
    const drawer = await screen.findByRole("complementary", {
      name: "Workspace chat history",
    });
    await user.click(
      within(drawer).getByRole("button", { name: /update game/i }),
    );
    await user.click(
      await screen.findByRole(
        "button",
        { name: "Review 01-space-invaders-test/src/game.ts" },
        { timeout: 3_000 },
      ),
    );

    await waitFor(() =>
      expect(mocks.readKanbanGitFileDiffMock).toHaveBeenCalledWith(
        expect.objectContaining({
          baseCommit: binding.baseCommit,
          cardBranch: binding.cardBranch,
          worktreePath: binding.worktreePath,
        }),
        "src/game.ts",
      ),
    );
    expect(mocks.readWorkspaceGitDiffMock).not.toHaveBeenCalled();
    const previewDrawer = screen.getByRole("complementary", {
      name: "File preview",
    });
    await waitFor(() => expect(previewDrawer).toHaveTextContent("before"));
    expect(previewDrawer).toHaveTextContent("updated");
    expect(previewDrawer).not.toHaveTextContent(
      "No diff available for this file.",
    );
    await user.click(screen.getByLabelText("Run trace"));
    await waitFor(() => expect(mocks.loadPersistedRunActivityMock).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByText("Loading activity…")).not.toBeInTheDocument());
    expect(screen.getAllByRole("button", { name: "Review 01-space-invaders-test/src/game.ts" })).toHaveLength(1);
    expect(screen.queryByRole("button", { name: `Review ${binding.worktreePath}/src/game.ts` })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Task chat transcript")).toHaveTextContent("Edited 1 file");
  });

  it("undoes a card chat patch in its isolated nested repository", async () => {
    const chat = workspaceChatFixture({ id: 403, title: "Animate controls" });
    const latestDiff = [
      "diff --git a/01-space-invaders-test/src/game.ts b/01-space-invaders-test/src/game.ts",
      "--- a/01-space-invaders-test/src/game.ts",
      "+++ b/01-space-invaders-test/src/game.ts",
      "@@ -1 +1 @@",
      "-before",
      "+updated",
      "",
    ].join("\n");
    const run = workspaceRunFixture({
      id: 303,
      chat_id: chat.id,
      original_prompt: "Animate controls",
      final_message: "Animated the controls.",
      latest_diff: latestDiff,
    });
    const binding = {
      sourceRepositoryPath: "/repo/orchestrator/01-space-invaders-test",
      relativePath: "01-space-invaders-test",
      executionRoot: "/cards/card-game",
      sourceBranch: "main",
      baseBranch: "main",
      baseCommit: "0123456789abcdef",
      cardBranch: "codex/animate-controls",
      worktreePath: "/cards/card-game/01-space-invaders-test",
      status: "ready",
      error: null,
    };
    mocks.listWorkspaceChatsMock.mockResolvedValue([chat]);
    mocks.getChatWithRunsMock.mockResolvedValue(
      workspaceChatWithRunsFixture(chat, [run]),
    );
    mocks.getKanbanCardForChatMock.mockResolvedValue({
      id: "card-game",
      hasStartedTurn: true,
    });
    mocks.loadKanbanGitBindingsMock.mockResolvedValue([binding]);

    const { user } = await renderApp();
    const header = screen.getByRole("region", { name: "Selected folder" });
    await user.click(
      within(header).getByRole("button", { name: /open chat history/i }),
    );
    const drawer = await screen.findByRole("complementary", {
      name: "Workspace chat history",
    });
    await user.click(
      within(drawer).getByRole("button", { name: /animate controls/i }),
    );

    const summary = await screen.findByLabelText("Edited 1 file");
    const undoButton = within(summary).getByRole("button", {
      name: "Undo file changes",
    });
    await waitFor(() => expect(undoButton).toBeEnabled());
    await user.click(undoButton);
    await user.click(
      within(screen.getByRole("dialog", { name: "Undo changes?" })).getByRole(
        "button",
        { name: "Undo changes" },
      ),
    );

    await waitFor(() =>
      expect(mocks.undoWorkspaceGitDiffMock).toHaveBeenCalledWith(
        binding.worktreePath,
        latestDiff,
        2,
      ),
    );
    expect(
      within(summary).getByRole("button", { name: "File changes undone" }),
    ).toBeDisabled();
  });
});
