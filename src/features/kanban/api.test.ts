import { beforeEach, describe, expect, it, vi } from "vitest";

const invokeMock = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
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
    invokeMock.mockReset();
    invokeMock.mockResolvedValue(null);
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

    expect(invokeMock).toHaveBeenCalledWith("kanban_git_provision", {
      request: {
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
      },
    });
  });

  it("sends complete persisted bindings to guarded Git commands", async () => {
    await commitKanbanGit({ binding, message: "Implement Kanban", stageAll: true });
    await cleanupKanbanGit({ binding, deleteBranch: true, force: false });

    expect(invokeMock).toHaveBeenNthCalledWith(1, "kanban_git_commit", {
      request: { binding, message: "Implement Kanban", stageAll: true },
    });
    expect(invokeMock).toHaveBeenNthCalledWith(2, "kanban_git_cleanup", {
      request: { binding, deleteBranch: true, force: false },
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

    expect(invokeMock).toHaveBeenCalledWith("kanban_claim_attempt", {
      request: {
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
      },
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

    expect(invokeMock).toHaveBeenCalledWith("kanban_update_attempt", {
      request: {
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
      },
    });
  });

  it("replaces Git bindings with card CAS and operation identity", async () => {
    await saveKanbanGitBindings(
      { id: "card-1", stateVersion: 9 },
      [binding],
      "operation-3",
    );

    expect(invokeMock).toHaveBeenCalledWith("kanban_save_git_bindings", {
      request: {
        cardId: "card-1",
        expectedVersion: 9,
        operationId: "operation-3",
        bindings: [binding],
      },
    });
  });
});
