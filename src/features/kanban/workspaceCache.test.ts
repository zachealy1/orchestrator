import { beforeEach, describe, expect, it } from "vitest";
import type { KanbanBoardSnapshotRecord, KanbanGitBinding } from "./api";
import {
  clearKanbanWorkspaceCaches,
  readKanbanWorkspaceCache,
  readReconciledKanbanBinding,
  writeKanbanWorkspaceCache,
  writeReconciledKanbanBinding,
} from "./workspaceCache";

function snapshot(workspaceId: number): KanbanBoardSnapshotRecord {
  return {
    workspaceId,
    revision: 1,
    preferencesJson: "{}",
    columns: [],
    cards: [],
  };
}

function binding(status = "provisioned"): KanbanGitBinding {
  return {
    sourceRepositoryPath: "/workspace/repo",
    relativePath: "repo",
    executionRoot: "/cards/card-1",
    sourceBranch: "main",
    baseBranch: "main",
    baseCommit: "base",
    cardBranch: "codex/card-1",
    worktreePath: "/cards/card-1/repo",
    status,
    error: null,
  };
}

describe("Kanban workspace cache", () => {
  beforeEach(clearKanbanWorkspaceCaches);

  it("retains only the four most recently used workspaces", () => {
    for (let workspaceId = 1; workspaceId <= 5; workspaceId += 1) {
      writeKanbanWorkspaceCache(workspaceId, {
        snapshot: snapshot(workspaceId),
        bindingsByCard: {},
        includesArchived: false,
        scrollTop: workspaceId * 10,
      });
    }

    expect(readKanbanWorkspaceCache(1)).toBeNull();
    expect(readKanbanWorkspaceCache(5)?.scrollTop).toBe(50);
  });

  it("reuses a reconciled binding only for the same persisted fingerprint", () => {
    const stored = binding();
    const reconciled = binding("ready");
    writeReconciledKanbanBinding(stored, reconciled, 1_000);

    expect(readReconciledKanbanBinding(stored, 1_001)).toEqual(reconciled);
    expect(readReconciledKanbanBinding(binding("changed"), 1_001)).toBeNull();
    expect(readReconciledKanbanBinding(stored, 11_000)).toBeNull();
  });
});
