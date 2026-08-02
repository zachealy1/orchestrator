import type {
  WorkspaceGitFileStatus,
  WorkspaceGitOverview,
  WorkspaceGitRepositoryStatus,
  WorkspaceGitStatusSnapshot,
} from "./types";

export type WorkspaceGitStatusState = {
  status: "idle" | "loading" | "loaded" | "error";
  snapshot: WorkspaceGitOverview | null;
  error: string | null;
};

export type WorkspaceGitSummary = {
  total: number;
  modified: number;
  added: number;
  deleted: number;
  untracked: number;
  conflicted: number;
  additions: number;
  deletions: number;
};

export type HeaderGitAction =
  | {
      label: string;
      disabled: false;
      canCommit: boolean;
      canPush: boolean;
      statusLabel: string;
      statusKind: "checking" | "error" | "clean" | "changed" | "ahead";
      reason?: string;
    }
  | {
      label: string;
      disabled: true;
      canCommit: false;
      canPush: false;
      statusLabel: string;
      statusKind: "disabled";
      reason: string;
    };

export function workspaceCacheKey(workspacePath: string, childPath: string) {
  return `${workspacePath}\u0000${childPath}`;
}

export function gitStatusSnapshotKey(snapshot: WorkspaceGitOverview | null) {
  if (!snapshot) return "";

  const files = snapshot.files
    .map((file) =>
      [
        file.relativePath,
        file.oldRelativePath ?? "",
        file.indexStatus,
        file.worktreeStatus,
        file.statusKind,
        file.badge,
      ].join("\u0000"),
    )
    .sort()
    .join("\u0001");

  return [
    snapshot.workspacePath,
    snapshot.repositories
      .map((repository) =>
        [
          repository.repository.rootPath,
          repository.currentBranch ?? "",
          repository.aheadCount ?? 0,
          repository.canPush ? 1 : 0,
          repository.additions ?? 0,
          repository.deletions ?? 0,
        ].join("\u0000"),
      )
      .join("\u0001"),
    snapshot.additions ?? "",
    snapshot.deletions ?? "",
    files,
  ].join("\u0002");
}

export function summarizeWorkspaceGitStatus(
  snapshot: WorkspaceGitOverview | null,
): WorkspaceGitSummary {
  return summarizeWorkspaceGitFiles(
    snapshot?.files ?? [],
    snapshot?.additions,
    snapshot?.deletions,
  );
}

export function normalizeWorkspaceGitOverview(
  workspacePath: string,
  value: WorkspaceGitOverview | WorkspaceGitStatusSnapshot,
): WorkspaceGitOverview {
  const overview = value as WorkspaceGitOverview;
  if (Array.isArray(overview.repositories)) return overview;

  const legacy = value as WorkspaceGitStatusSnapshot;
  const rootPath = legacy.gitRoot;
  const label =
    rootPath.split(/[\\/]/).filter(Boolean).slice(-1)[0] ??
    workspacePath.split(/[\\/]/).filter(Boolean).slice(-1)[0] ??
    "Repository";
  const files = legacy.files.map((file) => ({
    ...file,
    repositoryPath: file.repositoryPath ?? rootPath,
    repositoryRelativePath:
      file.repositoryRelativePath ?? file.relativePath,
  }));
  const repository: WorkspaceGitRepositoryStatus = {
    ...legacy,
    files,
    repository: { rootPath, relativePath: ".", label },
  };
  return {
    workspacePath,
    repositories: [repository],
    additions: legacy.additions ?? 0,
    deletions: legacy.deletions ?? 0,
    changedRepositoryCount: files.length > 0 ? 1 : 0,
    files,
    discoveryTruncated: false,
  };
}

export function preferredWorkspaceGitRepository(
  overview: WorkspaceGitOverview | null,
  preferredPath: string | null | undefined,
) {
  if (!overview || overview.repositories.length === 0) return null;
  return (
    overview.repositories.find(
      (repository) => repository.repository.rootPath === preferredPath,
    ) ?? overview.repositories[0]
  );
}

export function workspaceGitRepositoryDisplayPath(
  repository: WorkspaceGitRepositoryStatus["repository"],
) {
  return repository.relativePath === "."
    ? repository.label
    : repository.relativePath;
}

export function summarizeWorkspaceGitFiles(
  files: WorkspaceGitFileStatus[],
  additions?: number,
  deletions?: number,
): WorkspaceGitSummary {
  const summary: WorkspaceGitSummary = {
    total: files.length,
    modified: 0,
    added: 0,
    deleted: 0,
    untracked: 0,
    conflicted: 0,
    additions: additions ?? 0,
    deletions: deletions ?? 0,
  };

  files.forEach((file) => {
    if (file.statusKind === "modified") summary.modified += 1;
    else if (
      file.statusKind === "added" ||
      file.statusKind === "copied" ||
      file.statusKind === "renamed"
    ) {
      summary.added += 1;
    } else if (file.statusKind === "deleted") summary.deleted += 1;
    else if (file.statusKind === "untracked") summary.untracked += 1;
    else if (file.statusKind === "conflicted") summary.conflicted += 1;
  });

  if (additions === undefined && deletions === undefined) {
    summary.additions = summary.modified + summary.added + summary.untracked;
    summary.deletions = summary.deleted + summary.conflicted;
  }
  return summary;
}

export function filesIncludedInCommitMessage(
  files: WorkspaceGitFileStatus[],
  includeUnstaged: boolean,
) {
  if (includeUnstaged) return files;
  return files.filter(
    (file) =>
      file.indexStatus !== " " &&
      file.indexStatus !== "?" &&
      file.indexStatus !== "",
  );
}

export function gitChangeFingerprint(
  workspacePath: string | null,
  files: WorkspaceGitFileStatus[],
  summary: WorkspaceGitSummary,
  includeUnstaged: boolean,
) {
  return [
    workspacePath ?? "",
    includeUnstaged ? "all" : "staged",
    summary.additions,
    summary.deletions,
    ...files
      .map((file) =>
        [
          file.relativePath,
          file.oldRelativePath ?? "",
          file.indexStatus,
          file.worktreeStatus,
          file.statusKind,
          file.badge,
        ].join(":"),
      )
      .sort(),
  ].join("\u0001");
}

export function formatGitSummaryForStatus(summary: WorkspaceGitSummary) {
  if (summary.total === 0) return "git clean";
  const details = [
    summary.modified > 0 ? `${summary.modified} modified` : null,
    summary.added > 0 ? `${summary.added} added` : null,
    summary.deleted > 0 ? `${summary.deleted} deleted` : null,
    summary.untracked > 0 ? `${summary.untracked} untracked` : null,
    summary.conflicted > 0 ? `${summary.conflicted} conflicted` : null,
  ].filter(Boolean);
  return `${summary.total} changed${details.length > 0 ? ` (${details.join(", ")})` : ""}`;
}
