import { beforeEach, describe, expect, it, vi } from "vitest";

const commandMocks = vi.hoisted(() => ({
  kanbanClaimAttempt: vi.fn(),
  kanbanGitCleanup: vi.fn(),
  kanbanGitCommit: vi.fn(),
  kanbanGitProvision: vi.fn(),
  kanbanRejectPlan: vi.fn(),
  kanbanSaveGitBindings: vi.fn(),
  kanbanUpdateAttempt: vi.fn(),
  kanbanWorkspaceBootstrap: vi.fn(),
}));

vi.mock("../../generated/tauri", () => ({
  commands: commandMocks,
}));

import {
  claimKanbanAttempt,
  cleanupKanbanGit,
  commitKanbanGit,
  loadKanbanWorkspaceBootstrap,
  provisionKanbanGit,
  rejectKanbanPlan,
  saveKanbanGitBindings,
  updateKanbanAttempt,
  type KanbanGitBinding,
} from "./api";

const binding: KanbanGitBinding = {
  sourceRepositoryPath: "/repo",
  relativePath: ".",
  executionRoot: "/app/cards/card-1/root",
  sourceBranch: "main",
  baseBranch: "main",
  baseCommit: "abc123",
  cardBranch: "codex/kanban-card-1",
  worktreePath: "/app/cards/card-1/root",
  status: "ready",
  error: null,
};

describe("Kanban native API", () => {
  beforeEach(() => {
    Object.values(commandMocks).forEach((command) => {
      command.mockReset();
      command.mockResolvedValue(null);
    });
  });

  it("loads active cards and persisted bindings through one bootstrap command", async () => {
    await loadKanbanWorkspaceBootstrap(7);
    await loadKanbanWorkspaceBootstrap(7, { includeArchived: true });

    expect(commandMocks.kanbanWorkspaceBootstrap).toHaveBeenNthCalledWith(
      1,
      7,
      false,
    );
    expect(commandMocks.kanbanWorkspaceBootstrap).toHaveBeenNthCalledWith(
      2,
      7,
      true,
    );
  });

  it("passes dirty-change consent per repository during provisioning", async () => {
    await provisionKanbanGit({
      cardId: "card-1",
      cardSlug: "Ship safely",
      repositories: [
        { repositoryPath: "/repo", relativePath: ".", baseBranch: "release" },
        {
          repositoryPath: "/repo/nested",
          relativePath: "nested",
          includeDirtyChanges: true,
        },
      ],
    });

    expect(commandMocks.kanbanGitProvision).toHaveBeenCalledWith({
      cardId: "card-1",
      cardSlug: "Ship safely",
      repositories: [
        {
          repositoryPath: "/repo",
          relativePath: ".",
          baseBranch: "release",
          includeDirtyChanges: false,
        },
        {
          repositoryPath: "/repo/nested",
          relativePath: "nested",
          baseBranch: null,
          includeDirtyChanges: true,
        },
      ],
    });
  });

  it("sends complete persisted bindings to guarded Git commands", async () => {
    await commitKanbanGit({ binding, message: "Implement Kanban", stageAll: true });
    await cleanupKanbanGit({ binding, deleteBranch: true, force: false });

    expect(commandMocks.kanbanGitCommit).toHaveBeenCalledWith({
      binding,
      message: "Implement Kanban",
      stageAll: true,
    });
    expect(commandMocks.kanbanGitCleanup).toHaveBeenCalledWith({
      binding,
      deleteBranch: true,
      force: false,
    });
  });

  it("claims an attempt with card CAS and an immutable config snapshot", async () => {
    await claimKanbanAttempt({
      card: { id: "card-1", stateVersion: 4 },
      kind: "start",
      prompt: "Implement the card",
      configSnapshot: { model: "gpt-5.6", repositories: ["/repo"] },
      attemptId: "attempt-1",
      operationId: "operation-1",
    });

    expect(commandMocks.kanbanClaimAttempt).toHaveBeenCalledWith({
      cardId: "card-1",
      attemptId: "attempt-1",
      expectedVersion: 4,
      kind: "start",
      prompt: "Implement the card",
      configSnapshotJson: JSON.stringify({
        model: "gpt-5.6",
        repositories: ["/repo"],
      }),
      executionSettingsJson: null,
      operationId: "operation-1",
    });
  });

  it("attaches implementation settings to an accepted Plan attempt", async () => {
    await claimKanbanAttempt({
      card: { id: "card-1", stateVersion: 5 },
      kind: "implement_plan",
      prompt: "Implement the approved plan",
      configSnapshot: { model: "gpt-5.6" },
      executionSettingsJson: '{"mode":"run","intent":"plan-implementation"}',
      attemptId: "attempt-implementation",
      operationId: "operation-implementation",
    });

    expect(commandMocks.kanbanClaimAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "implement_plan",
        executionSettingsJson:
          '{"mode":"run","intent":"plan-implementation"}',
      }),
    );
  });

  it("persists attempt events with a monotonic sequence", async () => {
    await updateKanbanAttempt({
      cardId: "card-1",
      attemptId: "attempt-1",
      generation: 2,
      sequence: 7,
      status: "waiting_approval",
      operationId: "operation-2",
    });

    expect(commandMocks.kanbanUpdateAttempt).toHaveBeenCalledWith({
      cardId: "card-1",
      attemptId: "attempt-1",
      generation: 2,
      sequence: 7,
      status: "waiting_approval",
      runId: null,
      taskId: null,
      threadId: null,
      turnId: null,
      executionRoot: null,
      error: null,
      completedPlan: null,
      operationId: "operation-2",
    });
  });

  it("persists the completed plan with the terminal attempt event", async () => {
    await updateKanbanAttempt({
      cardId: "card-1",
      attemptId: "attempt-1",
      generation: 2,
      sequence: 8,
      status: "completed",
      completedPlan: {
        itemId: "plan-item-1",
        text: "# Implementation plan\n\nShip it.",
      },
      operationId: "operation-plan",
    });

    expect(commandMocks.kanbanUpdateAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        completedPlan: {
          itemId: "plan-item-1",
          text: "# Implementation plan\n\nShip it.",
        },
        operationId: "operation-plan",
      }),
    );
  });

  it("sends a guarded, idempotent plan rejection", async () => {
    const card = {
      id: "card-1",
      stateVersion: 5,
      currentAttemptId: "attempt-1",
    };

    await rejectKanbanPlan(card, "operation-reject");

    expect(commandMocks.kanbanRejectPlan).toHaveBeenCalledWith({
      cardId: "card-1",
      attemptId: "attempt-1",
      expectedVersion: 5,
      operationId: "operation-reject",
    });
  });

  it("replaces Git bindings with card CAS and operation identity", async () => {
    await saveKanbanGitBindings(
      { id: "card-1", stateVersion: 9 },
      [binding],
      "operation-3",
    );

    expect(commandMocks.kanbanSaveGitBindings).toHaveBeenCalledWith({
      cardId: "card-1",
      expectedVersion: 9,
      operationId: "operation-3",
      bindings: [binding],
      repositoryConfiguration: null,
    });
  });
});
