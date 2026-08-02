import { beforeEach, describe, expect, it, vi } from "vitest";

const commandMocks = vi.hoisted(() => ({
  kanbanClaimAttempt: vi.fn(),
  kanbanGitCleanup: vi.fn(),
  kanbanGitCommit: vi.fn(),
  kanbanGitProvision: vi.fn(),
  kanbanSaveGitBindings: vi.fn(),
  kanbanUpdateAttempt: vi.fn(),
}));

vi.mock("../../generated/tauri", () => ({
  commands: commandMocks,
}));

import {
  claimKanbanAttempt,
  cleanupKanbanGit,
  commitKanbanGit,
  provisionKanbanGit,
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

  it("passes dirty-change consent per repository during provisioning", async () => {
    await provisionKanbanGit({
      cardId: "card-1",
      cardSlug: "Ship safely",
      repositories: [
        { repositoryPath: "/repo", relativePath: "." },
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
          includeDirtyChanges: false,
        },
        {
          repositoryPath: "/repo/nested",
          relativePath: "nested",
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
      operationId: "operation-1",
    });
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
      operationId: "operation-2",
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
    });
  });
});
