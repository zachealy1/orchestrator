import { describe, expect, it } from "vitest";
import {
  filesIncludedInCommitMessage,
  formatGitSummaryForStatus,
  gitStatusSnapshotKey,
  normalizeWorkspaceGitOverview,
  preferredWorkspaceGitRepository,
  summarizeWorkspaceGitFiles,
  workspaceGitRepositoryDisplayPath,
} from "./gitModel";
import type {
  WorkspaceGitFileStatus,
  WorkspaceGitOverview,
  WorkspaceGitRepositoryStatus,
  WorkspaceGitStatusSnapshot,
} from "./types";

function file(
  relativePath: string,
  overrides: Partial<WorkspaceGitFileStatus> = {},
): WorkspaceGitFileStatus {
  return {
    path: `/workspace/${relativePath}`,
    relativePath,
    repositoryPath: "/workspace",
    repositoryRelativePath: relativePath,
    oldRelativePath: null,
    indexStatus: " ",
    worktreeStatus: "M",
    statusKind: "modified",
    badge: "M",
    ...overrides,
  };
}

function repository(
  rootPath: string,
  relativePath: string,
  files: WorkspaceGitFileStatus[] = [],
): WorkspaceGitRepositoryStatus {
  return {
    workspacePath: "/workspace",
    gitRoot: rootPath,
    currentBranch: "main",
    aheadCount: 0,
    additions: 0,
    deletions: 0,
    hasUpstream: true,
    hasOrigin: true,
    canPush: false,
    files,
    repository: {
      rootPath,
      relativePath,
      label: rootPath.split("/").slice(-1)[0] ?? "Repository",
    },
  };
}

describe("gitModel", () => {
  it("normalizes the legacy single-repository status shape", () => {
    const legacy: WorkspaceGitStatusSnapshot = {
      workspacePath: "/workspace",
      gitRoot: "/workspace",
      currentBranch: "main",
      additions: 4,
      deletions: 2,
      files: [
        {
          ...file("src/App.tsx"),
          repositoryPath: "",
          repositoryRelativePath: "",
        },
      ],
    };

    const overview = normalizeWorkspaceGitOverview("/workspace", legacy);

    expect(overview.repositories).toHaveLength(1);
    expect(overview.repositories[0].repository).toEqual({
      rootPath: "/workspace",
      relativePath: ".",
      label: "workspace",
    });
    expect(overview.files[0]).toMatchObject({
      repositoryPath: "",
      repositoryRelativePath: "",
    });
    expect(overview.changedRepositoryCount).toBe(1);
  });

  it("selects an explicitly preferred repository and formats its path", () => {
    const first = repository("/workspace/api", "api");
    const second = repository("/workspace/web", "packages/web");
    const overview: WorkspaceGitOverview = {
      workspacePath: "/workspace",
      repositories: [first, second],
      additions: 0,
      deletions: 0,
      changedRepositoryCount: 0,
      files: [],
      discoveryTruncated: false,
    };

    expect(
      preferredWorkspaceGitRepository(overview, "/workspace/web"),
    ).toBe(second);
    expect(preferredWorkspaceGitRepository(overview, "/missing")).toBe(first);
    expect(workspaceGitRepositoryDisplayPath(second.repository)).toBe(
      "packages/web",
    );
  });

  it("summarizes statuses and selects only staged files when requested", () => {
    const files = [
      file("staged.ts", { indexStatus: "M", worktreeStatus: " " }),
      file("unstaged.ts"),
      file("new.ts", {
        indexStatus: "?",
        worktreeStatus: "?",
        statusKind: "untracked",
        badge: "U",
      }),
      file("deleted.ts", {
        worktreeStatus: "D",
        statusKind: "deleted",
        badge: "D",
      }),
    ];

    const summary = summarizeWorkspaceGitFiles(files);

    expect(summary).toMatchObject({
      total: 4,
      modified: 2,
      deleted: 1,
      untracked: 1,
      additions: 3,
      deletions: 1,
    });
    expect(filesIncludedInCommitMessage(files, false)).toEqual([files[0]]);
    expect(formatGitSummaryForStatus(summary)).toContain("4 changed");
  });

  it("produces a stable key regardless of file ordering", () => {
    const first = file("a.ts");
    const second = file("b.ts", { statusKind: "added", badge: "A" });
    const repo = repository("/workspace", ".", [first, second]);
    const overview: WorkspaceGitOverview = {
      workspacePath: "/workspace",
      repositories: [repo],
      additions: 2,
      deletions: 0,
      changedRepositoryCount: 1,
      files: [first, second],
      discoveryTruncated: false,
    };

    expect(gitStatusSnapshotKey(overview)).toBe(
      gitStatusSnapshotKey({ ...overview, files: [second, first] }),
    );
  });
});
