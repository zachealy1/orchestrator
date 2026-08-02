import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Workspace } from "../../types";
import type {
  KanbanBoardSnapshotRecord,
  KanbanCardRecord,
  KanbanGitBinding,
  KanbanGitCleanupResult,
  KanbanGitStatusResult,
} from "./api";
import { KanbanWorkspace } from "./KanbanWorkspace";

const apiMocks = vi.hoisted(() => ({
  approveKanbanCard: vi.fn(),
  archiveKanbanCard: vi.fn(),
  cleanupKanbanGit: vi.fn(),
  commitKanbanGit: vi.fn(),
  createKanbanCard: vi.fn(),
  deleteKanbanCard: vi.fn(),
  loadKanbanBoard: vi.fn(),
  loadKanbanGitBindings: vi.fn(),
  mergeKanbanGit: vi.fn(),
  moveKanbanCard: vi.fn(),
  pushKanbanGit: vi.fn(),
  readKanbanGitDiff: vi.fn(),
  readKanbanGitStatus: vi.fn(),
  reconcileKanbanGit: vi.fn(),
  reopenKanbanCard: vi.fn(),
  saveKanbanGitBindings: vi.fn(),
  saveKanbanInheritedContext: vi.fn(),
  saveKanbanPreferences: vi.fn(),
  updateKanbanCard: vi.fn(),
}));
const dbMocks = vi.hoisted(() => ({
  listLocalChatTranscript: vi.fn(),
}));

vi.mock("./api", () => apiMocks);
vi.mock("../../db", () => dbMocks);

const workspace: Workspace = {
  id: 1,
  path: "/workspace",
  label: "Workspace",
  default_account_id: null,
  selected_git_repository_path: null,
  last_opened_at: "2026-08-02T10:00:00Z",
  created_at: "2026-08-02T10:00:00Z",
};

function card(overrides: Partial<KanbanCardRecord> = {}): KanbanCardRecord {
  return {
    id: "card-1",
    workspaceId: workspace.id,
    chatId: 11,
    title: "Controller card",
    description: "Exercise the Kanban controller",
    accountId: null,
    accessMode: "ask-for-approval",
    model: null,
    reasoningLevel: null,
    repositoryScope: "selected",
    stage: "in_review",
    sortPosition: 1024,
    executionState: "completed",
    reviewState: "awaiting_review",
    currentAttemptId: "attempt-1",
    stateVersion: 4,
    archivedAt: null,
    deletedAt: null,
    approvedAt: null,
    lastError: null,
    hasInheritedContext: false,
    createdAt: "2026-08-02T10:00:00Z",
    updatedAt: "2026-08-02T10:01:00Z",
    repositories: [
      {
        repositoryPath: "/workspace/repo",
        relativePath: "repo",
        label: "repo",
        includeDirtyChanges: false,
      },
    ],
    ...overrides,
  };
}

function binding(overrides: Partial<KanbanGitBinding> = {}): KanbanGitBinding {
  return {
    sourceRepositoryPath: "/workspace/repo",
    relativePath: "repo",
    executionRoot: "/workspace/.codex/card-1",
    sourceBranch: "main",
    baseBranch: "main",
    baseCommit: "base-commit",
    cardBranch: "codex/card-1",
    worktreePath: "/workspace/.codex/card-1/repo",
    status: "ready",
    error: null,
    ...overrides,
  };
}

function snapshot(
  cards: KanbanCardRecord[],
  revision = 1,
): KanbanBoardSnapshotRecord {
  return {
    workspaceId: workspace.id,
    revision,
    preferencesJson: JSON.stringify({
      search: "",
      filters: {},
      groupBy: "none",
      columnOrder: ["todo", "in_progress", "in_review", "done"],
    }),
    columns: [
      { key: "todo", position: 0 },
      { key: "in_progress", position: 1 },
      { key: "in_review", position: 2 },
      { key: "done", position: 3 },
    ],
    cards,
  };
}

function status(
  gitBinding: KanbanGitBinding,
  overrides: Partial<KanbanGitStatusResult> = {},
): KanbanGitStatusResult {
  return {
    binding: gitBinding,
    headCommit: "head-commit",
    baseBranchHead: "base-commit",
    aheadOfBase: 0,
    behindBase: 0,
    aheadOfTarget: 0,
    behindTarget: 0,
    hasChanges: true,
    hasConflicts: false,
    stagedCount: 0,
    unstagedCount: 1,
    untrackedCount: 0,
    files: [
      {
        path: "src/controller.ts",
        originalPath: null,
        indexStatus: " ",
        worktreeStatus: "M",
        kind: "modified",
      },
    ],
    ...overrides,
  };
}

function renderWorkspace() {
  const props = {
    onOpenConversation: vi.fn(),
    onLaunch: vi.fn().mockResolvedValue(undefined),
    onPause: vi.fn().mockResolvedValue(undefined),
    onStop: vi.fn().mockResolvedValue(undefined),
  };

  render(
    <KanbanWorkspace
      workspace={workspace}
      repositories={[]}
      accounts={[]}
      models={[]}
      defaultAccountId={null}
      defaultAccessMode="ask-for-approval"
      defaultModel={null}
      defaultReasoningLevel={null}
      refreshToken={0}
      {...props}
    />,
  );

  return props;
}

async function confirmDeleteWithWorktreeCleanup(
  user: ReturnType<typeof userEvent.setup>,
) {
  const tile = await screen.findByRole("article", { name: /Controller card/ });
  await user.click(within(tile).getByLabelText("Actions for Controller card"));
  await user.click(within(tile).getByRole("menuitem", { name: "Delete card" }));

  const dialog = await screen.findByRole("alertdialog", {
    name: "Delete this card?",
  });
  await user.click(
    within(dialog).getByRole("checkbox", {
      name: /Remove isolated worktrees/,
    }),
  );
  await user.click(within(dialog).getByRole("button", { name: "Delete card" }));
  return dialog;
}

beforeEach(() => {
  vi.resetAllMocks();
  dbMocks.listLocalChatTranscript.mockResolvedValue([]);
  const initialCard = card();
  const initialBinding = binding();
  const initialSnapshot = snapshot([initialCard]);

  apiMocks.loadKanbanBoard.mockResolvedValue(initialSnapshot);
  apiMocks.loadKanbanGitBindings.mockResolvedValue([initialBinding]);
  apiMocks.reconcileKanbanGit.mockImplementation(
    async (gitBinding: KanbanGitBinding) => ({
      binding: gitBinding,
      sourceAvailable: true,
      worktreeAvailable: true,
      branchAvailable: true,
      branchMatches: true,
      baseBranchHead: gitBinding.baseCommit,
      headCommit: gitBinding.baseCommit,
      targetMoved: false,
      hasChanges: false,
      hasConflicts: false,
    }),
  );
  apiMocks.saveKanbanGitBindings.mockResolvedValue([initialBinding]);
  apiMocks.deleteKanbanCard.mockResolvedValue(undefined);
  apiMocks.readKanbanGitStatus.mockResolvedValue(status(initialBinding));
  apiMocks.readKanbanGitDiff.mockResolvedValue({
    binding: initialBinding,
    baseCommit: "base-commit",
    headCommit: "head-commit",
    content: "diff --git a/src/controller.ts b/src/controller.ts",
    untrackedPaths: [],
    isEmpty: false,
  });
  apiMocks.saveKanbanPreferences.mockResolvedValue(initialSnapshot);
});

describe("KanbanWorkspace controller", () => {
  it.each(["blocked", "partial"] as const)(
    "persists a fulfilled %s cleanup result and keeps the card",
    async (cleanupStatus) => {
      const user = userEvent.setup();
      const persisted = card();
      const originalBinding = binding();
      const partialBinding = binding({
        status: "cleanupRequired",
        error: {
          repositoryPath: "/workspace/repo",
          code: "cleanup_incomplete",
          message: "The worktree still contains local changes.",
          cleanupRequired: true,
        },
      });
      const cleanupResult: KanbanGitCleanupResult = {
        binding: partialBinding,
        status: cleanupStatus,
        worktreeRemoved: false,
        branchDeleted: false,
        executionRootRemoved: false,
        errors: [partialBinding.error!],
      };

      apiMocks.loadKanbanBoard.mockResolvedValue(snapshot([persisted]));
      apiMocks.loadKanbanGitBindings.mockResolvedValue([originalBinding]);
      apiMocks.cleanupKanbanGit.mockResolvedValue(cleanupResult);
      apiMocks.saveKanbanGitBindings.mockResolvedValue([partialBinding]);

      renderWorkspace();
      const dialog = await confirmDeleteWithWorktreeCleanup(user);

      await waitFor(() => {
        expect(apiMocks.saveKanbanGitBindings).toHaveBeenCalledWith(
          expect.objectContaining({ id: persisted.id, stateVersion: 4 }),
          [partialBinding],
        );
      });
      expect(apiMocks.deleteKanbanCard).not.toHaveBeenCalled();
      expect(
        within(dialog).getByRole("alert", {
          name: "",
        }),
      ).toHaveTextContent(/cleanup is incomplete.*card was kept for retry/i);
      expect(screen.getByRole("article", { name: /Controller card/ })).toBeInTheDocument();
    },
  );

  it("deletes after persisting a complete cleanup and reloading the refreshed card version", async () => {
    const user = userEvent.setup();
    const originalCard = card({ stateVersion: 4 });
    const refreshedCard = card({
      stateVersion: 5,
      updatedAt: "2026-08-02T10:02:00Z",
    });
    const originalBinding = binding();
    const cleanedBinding = binding({ status: "cleaned" });

    apiMocks.loadKanbanBoard
      .mockResolvedValueOnce(snapshot([originalCard], 1))
      .mockResolvedValueOnce(snapshot([refreshedCard], 2))
      .mockResolvedValueOnce(snapshot([], 3));
    apiMocks.loadKanbanGitBindings.mockResolvedValue([originalBinding]);
    apiMocks.cleanupKanbanGit.mockResolvedValue({
      binding: cleanedBinding,
      status: "cleaned",
      worktreeRemoved: true,
      branchDeleted: false,
      executionRootRemoved: true,
      errors: [],
    } satisfies KanbanGitCleanupResult);
    apiMocks.saveKanbanGitBindings.mockResolvedValue([cleanedBinding]);

    renderWorkspace();
    await confirmDeleteWithWorktreeCleanup(user);

    await waitFor(() => expect(apiMocks.deleteKanbanCard).toHaveBeenCalledTimes(1));
    expect(apiMocks.saveKanbanGitBindings).toHaveBeenCalledWith(
      expect.objectContaining({ id: originalCard.id, stateVersion: 4 }),
      [cleanedBinding],
    );
    expect(apiMocks.deleteKanbanCard).toHaveBeenCalledWith(
      expect.objectContaining({ id: refreshedCard.id, stateVersion: 5 }),
    );
    expect(apiMocks.saveKanbanGitBindings.mock.invocationCallOrder[0]).toBeLessThan(
      apiMocks.deleteKanbanCard.mock.invocationCallOrder[0],
    );
  });

  it("disables review and Git actions outside their valid lifecycle", async () => {
    const user = userEvent.setup();
    const runningCard = card({
      stage: "in_progress",
      executionState: "running",
      reviewState: "none",
    });
    const gitBinding = binding();

    apiMocks.loadKanbanBoard.mockResolvedValue(snapshot([runningCard]));
    apiMocks.loadKanbanGitBindings.mockResolvedValue([gitBinding]);
    apiMocks.readKanbanGitStatus.mockResolvedValue(status(gitBinding));

    const callbacks = renderWorkspace();
    await user.click(
      await screen.findByRole("button", { name: /^Controller card/ }),
    );
    await user.click(screen.getByRole("tab", { name: /Review/ }));

    await waitFor(() => expect(apiMocks.readKanbanGitStatus).toHaveBeenCalled());

    expect(screen.getByRole("button", { name: "Commit" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Commit and push" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Merge branch" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Request changes" })).toBeDisabled();
    expect(callbacks.onLaunch).not.toHaveBeenCalled();
  });

  it("requires confirmation before stopping an active card", async () => {
    const user = userEvent.setup();
    const runningCard = card({
      stage: "in_progress",
      executionState: "running",
      reviewState: "none",
    });
    apiMocks.loadKanbanBoard.mockResolvedValue(snapshot([runningCard]));
    apiMocks.loadKanbanGitBindings.mockResolvedValue([binding()]);

    const callbacks = renderWorkspace();
    await user.click(
      await screen.findByRole("button", { name: /^Controller card/ }),
    );
    await user.click(screen.getByRole("button", { name: "Stop" }));

    expect(callbacks.onStop).not.toHaveBeenCalled();
    const dialog = screen.getByRole("alertdialog", {
      name: "Stop this agent?",
    });
    await user.click(within(dialog).getByRole("button", { name: "Stop agent" }));
    await waitFor(() => expect(callbacks.onStop).toHaveBeenCalledTimes(1));
  });
});
