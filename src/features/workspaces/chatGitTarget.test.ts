import { describe, expect, it } from "vitest";
import type {
  KanbanGitBinding,
  KanbanGitDiffResult,
  KanbanGitStatusResult,
} from "../kanban/api";
import {
  createKanbanChatFilePreviewTarget,
  kanbanRepositoriesToWorkspaceOverview,
  kanbanStatusToWorkspaceRepository,
  refreshKanbanChatRepositories,
  resolveKanbanChatFileTarget,
  resolveKanbanChatUndoTarget,
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
  it("resolves workspace-prefixed transcript paths into the card worktree", () => {
    const nestedBinding = {
      ...binding,
      sourceRepositoryPath: "/repo/space-invaders-test",
      relativePath: "01-space-invaders-test",
      worktreePath: "/cards/card-1/01-space-invaders-test",
    };

    expect(
      resolveKanbanChatFileTarget(
        [nestedBinding],
        "01-space-invaders-test/src/game.ts:42",
      ),
    ).toEqual({
      binding: nestedBinding,
      repositoryRelativePath: "src/game.ts",
    });
    expect(
      resolveKanbanChatFileTarget(
        [nestedBinding],
        "file:///cards/card-1/01-space-invaders-test/src/game.ts#L42",
      ),
    ).toEqual({
      binding: nestedBinding,
      repositoryRelativePath: "src/game.ts",
    });
  });

  it("does not guess a bare path when a card spans multiple repositories", () => {
    expect(
      resolveKanbanChatFileTarget(
        [
          { ...binding, relativePath: "app" },
          {
            ...binding,
            sourceRepositoryPath: "/repo/api",
            relativePath: "api",
            worktreePath: "/cards/card-1/api",
          },
        ],
        "src/index.ts",
      ),
    ).toBeNull();
  });

  it("prefers the most specific repository for nested absolute paths", () => {
    const nestedBinding = {
      ...binding,
      sourceRepositoryPath: "/repo/app/packages/game",
      relativePath: "packages/game",
      worktreePath: "/cards/card-1/game",
    };
    expect(
      resolveKanbanChatFileTarget(
        [binding, nestedBinding],
        "/repo/app/packages/game/src/main.ts",
      ),
    ).toEqual({
      binding: nestedBinding,
      repositoryRelativePath: "src/main.ts",
    });
  });

  it.each([
    ["added", "A", false],
    ["modified", "M", false],
    ["renamed", "R", false],
    ["deleted", "D", true],
  ] as const)(
    "projects %s transcript edits into the isolated file preview",
    (status, badge, gitGhost) => {
      const target = createKanbanChatFilePreviewTarget(
        [binding],
        "src/game.ts",
        { name: "game.ts", status },
      );

      expect(target).toMatchObject({
        repositoryRelativePath: "src/game.ts",
        file: {
          path: "/cards/card-1/app/src/game.ts",
          relativePath: "src/game.ts",
          gitGhost,
        },
        gitStatus: { statusKind: status, badge },
      });
      expect(target?.diffCacheKey).toContain(binding.baseCommit);
    },
  );

  it("routes a card turn undo to its nested Git worktree", () => {
    const target = resolveKanbanChatUndoTarget([binding], [
      { path: "/cards/card-1/app/src/game.ts" },
      { path: "app/src/input.ts" },
    ]);

    expect(target).toEqual({ binding, pathStrip: 2 });
  });

  it("does not combine an undo across separate card repositories", () => {
    const otherBinding: KanbanGitBinding = {
      ...binding,
      sourceRepositoryPath: "/repo/other",
      relativePath: "other",
      worktreePath: "/cards/card-1/other",
    };

    expect(
      resolveKanbanChatUndoTarget([binding, otherBinding], [
        { path: "/cards/card-1/app/src/game.ts" },
        { path: "/cards/card-1/other/src/api.ts" },
      ]),
    ).toBeNull();
  });

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

  it("reloads an isolated card repository after its turn changes files", async () => {
    const repositories = await refreshKanbanChatRepositories(
      "/repo",
      [{ status: "loading", binding, repository: null, error: null }],
      {
        readStatus: async () => status,
        readDiff: async () => diff,
      },
    );

    expect(repositories[0]).toMatchObject({
      status: "loaded",
      repository: {
        currentBranch: "codex/add-batman-file",
        aheadCount: 1,
        additions: 1,
        files: [{ repositoryRelativePath: "batman.txt" }],
      },
    });
  });
});
