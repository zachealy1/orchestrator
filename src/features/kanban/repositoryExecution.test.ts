import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  KanbanBoardSnapshotRecord,
  KanbanCardRecord,
  KanbanGitBinding,
} from "./api";
import {
  createKanbanRepositoryExecutionPreparer,
  type KanbanRepositoryExecutionDependencies,
} from "./repositoryExecution";

function card(overrides: Partial<KanbanCardRecord> = {}): KanbanCardRecord {
  return {
    id: "card-1",
    workspaceId: 7,
    chatId: 11,
    title: "Safe repository setup",
    description: "Prepare isolated worktrees",
    accountId: 1,
    accessMode: "ask-for-approval",
    model: null,
    reasoningLevel: null,
    repositoryScope: "selected",
    stage: "in_progress",
    sortPosition: 1_024,
    executionState: "starting",
    reviewState: "none",
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
    executionRoot: "/cards/card-1/root",
    sourceBranch: "main",
    baseBranch: "main",
    baseCommit: "base",
    cardBranch: "codex/card-1",
    worktreePath: "/cards/card-1/root/repo",
    status: "ready",
    error: null,
    ...overrides,
  };
}

function board(cards: KanbanCardRecord[]): KanbanBoardSnapshotRecord {
  return {
    workspaceId: 7,
    revision: 2,
    preferencesJson: "{}",
    columns: [],
    cards,
  };
}

const mocks = {
  loadBindings: vi.fn(),
  reconcileBinding: vi.fn(),
  saveBindings: vi.fn(),
  provision: vi.fn(),
  loadBoard: vi.fn(),
  cleanupBinding: vi.fn(),
};

const prepare = createKanbanRepositoryExecutionPreparer(
  mocks as unknown as KanbanRepositoryExecutionDependencies,
);

describe("Kanban repository execution preparation", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("reconciles and persists changed existing bindings", async () => {
    const original = binding();
    const reconciled = binding({ status: "targetMoved" });
    const claimedCard = card({ stateVersion: 5 });
    mocks.loadBindings.mockResolvedValue([original]);
    mocks.reconcileBinding.mockResolvedValue({ binding: reconciled });
    mocks.saveBindings.mockResolvedValue([reconciled]);

    await expect(
      prepare({ card: card(), claimedCard }),
    ).resolves.toEqual({
      executionRoot: reconciled.executionRoot,
      bindings: [reconciled],
    });
    expect(mocks.saveBindings).toHaveBeenCalledWith(claimedCard, [reconciled]);
    expect(mocks.provision).not.toHaveBeenCalled();
  });

  it("rejects reconciled bindings that require repair", async () => {
    const unsafe = binding({
      status: "cleanup_required",
      error: {
        repositoryPath: "/workspace/repo",
        code: "cleanup_required",
        message: "Remove the stale worktree first.",
        cleanupRequired: true,
      },
    });
    mocks.loadBindings.mockResolvedValue([unsafe]);
    mocks.reconcileBinding.mockResolvedValue({ binding: unsafe });

    await expect(
      prepare({ card: card(), claimedCard: card({ stateVersion: 5 }) }),
    ).rejects.toThrow("Remove the stale worktree first.");
    expect(mocks.provision).not.toHaveBeenCalled();
  });

  it("provisions new bindings and retries persistence with the latest card", async () => {
    const provisionedBinding = binding();
    const claimedCard = card({ stateVersion: 5 });
    const latestCard = card({ stateVersion: 6 });
    mocks.loadBindings.mockResolvedValue([]);
    mocks.provision.mockResolvedValue({
      cardId: "card-1",
      executionRoot: provisionedBinding.executionRoot,
      repositories: [provisionedBinding],
      errors: [],
      complete: true,
      rolledBack: false,
    });
    mocks.saveBindings
      .mockRejectedValueOnce(new Error("stale version"))
      .mockResolvedValueOnce([provisionedBinding]);
    mocks.loadBoard.mockResolvedValue(board([latestCard]));

    await expect(
      prepare({ card: card(), claimedCard }),
    ).resolves.toEqual({
      executionRoot: provisionedBinding.executionRoot,
      bindings: [provisionedBinding],
    });
    expect(mocks.saveBindings).toHaveBeenNthCalledWith(
      1,
      claimedCard,
      [provisionedBinding],
    );
    expect(mocks.saveBindings).toHaveBeenNthCalledWith(
      2,
      latestCard,
      [provisionedBinding],
    );
  });

  it("cleans newly provisioned artifacts after persistent save failure", async () => {
    const provisionedBinding = binding();
    mocks.loadBindings.mockResolvedValue([]);
    mocks.provision.mockResolvedValue({
      cardId: "card-1",
      executionRoot: provisionedBinding.executionRoot,
      repositories: [provisionedBinding],
      errors: [],
      complete: true,
      rolledBack: false,
    });
    mocks.saveBindings.mockRejectedValue(new Error("database unavailable"));
    mocks.loadBoard.mockResolvedValue(board([card({ stateVersion: 6 })]));
    mocks.cleanupBinding.mockResolvedValue({
      binding: provisionedBinding,
      status: "cleaned",
      worktreeRemoved: true,
      branchDeleted: true,
      executionRootRemoved: true,
      errors: [],
    });

    await expect(
      prepare({ card: card(), claimedCard: card({ stateVersion: 5 }) }),
    ).rejects.toThrow("The card worktrees could not be saved: database unavailable");
    expect(mocks.cleanupBinding).toHaveBeenCalledWith({
      binding: provisionedBinding,
      deleteBranch: true,
      force: true,
    });
  });
});
