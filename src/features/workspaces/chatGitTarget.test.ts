import { describe, expect, it } from "vitest";
import type {
  KanbanGitBinding,
  KanbanGitDiffResult,
  KanbanGitStatusResult,
} from "../kanban/api";
import {
  kanbanRepositoriesToWorkspaceOverview,
  kanbanStatusToWorkspaceRepository,
} from "./chatGitTarget";

const binding: KanbanGitBinding = {
  sourceRepositoryPath: "/repo/app",
  relativePath: ".",
  executionRoot: "/cards/card-1",
  sourceBranch: "main",
  baseBranch: "main",
  baseCommit: "base",
  cardBranch: "codex/add-batman-file",
  worktreePath: "/cards/card-1/app",
  status: "ready",
  error: null,
};

const status: KanbanGitStatusResult = {
  binding,
  headCommit: "head",
  baseBranchHead: "base",
  aheadOfBase: 1,
  behindBase: 0,
  aheadOfTarget: 1,
  behindTarget: 0,
  hasChanges: true,
  hasConflicts: false,
  stagedCount: 0,
  unstagedCount: 0,
  untrackedCount: 1,
  files: [
    {
      path: "batman.txt",
      originalPath: null,
      indexStatus: "?",
      worktreeStatus: "?",
      kind: "untracked",
    },
  ],
};

const diff: KanbanGitDiffResult = {
  binding,
  baseCommit: "base",
  headCommit: "head",
  content: [
    "diff --git a/batman.txt b/batman.txt",
    "--- /dev/null",
    "+++ b/batman.txt",
    "+I am Batman.",
    "",
  ].join("\n"),
  untrackedPaths: ["batman.txt"],
  isEmpty: false,
};

describe("chat Git target mapping", () => {
  it("projects an isolated Kanban worktree into the shared Git UI model", () => {
    const repository = kanbanStatusToWorkspaceRepository(
      "/repo",
      status,
      diff,
    );

    expect(repository.currentBranch).toBe("codex/add-batman-file");
    expect(repository.gitRoot).toBe("/cards/card-1/app");
    expect(repository.repository.rootPath).toBe("/repo/app");
    expect(repository.additions).toBe(1);
    expect(repository.deletions).toBe(0);
    expect(repository.files[0]).toMatchObject({
      path: "/cards/card-1/app/batman.txt",
      repositoryPath: "/repo/app",
      repositoryRelativePath: "batman.txt",
      statusKind: "untracked",
    });
  });

  it("builds an overview only from successfully loaded card repositories", () => {
    const repository = kanbanStatusToWorkspaceRepository(
      "/repo",
      status,
      diff,
    );
    const overview = kanbanRepositoriesToWorkspaceOverview("/repo", [
      { status: "loaded", binding, repository, error: null },
      {
        status: "error",
        binding: { ...binding, sourceRepositoryPath: "/repo/other" },
        repository: null,
        error: "missing",
      },
    ]);

    expect(overview?.repositories).toHaveLength(1);
    expect(overview?.changedRepositoryCount).toBe(1);
    expect(overview?.additions).toBe(1);
  });
});
