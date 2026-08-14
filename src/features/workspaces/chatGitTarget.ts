import type {
  KanbanGitBinding,
  KanbanGitDiffResult,
  KanbanGitStatusResult,
} from "../kanban/api";
import type {
  WorkspaceGitFileStatus,
  WorkspaceGitOverview,
  WorkspaceGitRepositoryStatus,
  WorkspaceGitStatusKind,
} from "./types";

export type KanbanChatGitRepositoryState =
  | {
      status: "loading";
      binding: KanbanGitBinding;
      repository: null;
      error: null;
    }
  | {
      status: "loaded";
      binding: KanbanGitBinding;
      repository: WorkspaceGitRepositoryStatus;
      error: null;
    }
  | {
      status: "error";
      binding: KanbanGitBinding;
      repository: null;
      error: string;
    };

function pathLabel(binding: KanbanGitBinding) {
  const sourceParts = binding.sourceRepositoryPath.split(/[\\/]/).filter(Boolean);
  return binding.relativePath === "."
    ? sourceParts[sourceParts.length - 1] ?? "Repository"
    : binding.relativePath;
}

function diffStats(content: string) {
  let additions = 0;
  let deletions = 0;
  for (const line of content.split(/\r?\n/)) {
    if (line.startsWith("+") && !line.startsWith("+++")) additions += 1;
    if (line.startsWith("-") && !line.startsWith("---")) deletions += 1;
  }
  return { additions, deletions };
}

function statusBadge(kind: WorkspaceGitStatusKind) {
  if (kind === "added" || kind === "untracked") return "A";
  if (kind === "deleted") return "D";
  if (kind === "renamed") return "R";
  if (kind === "copied") return "C";
  if (kind === "conflicted") return "U";
  return "M";
}

function workspaceRelativePath(binding: KanbanGitBinding, path: string) {
  return binding.relativePath === "." ? path : `${binding.relativePath}/${path}`;
}

export function kanbanStatusToWorkspaceRepository(
  workspacePath: string,
  status: KanbanGitStatusResult,
  diff: KanbanGitDiffResult,
): WorkspaceGitRepositoryStatus {
  const { binding } = status;
  const files: WorkspaceGitFileStatus[] = status.files.map((file) => {
    const statusKind = file.kind as WorkspaceGitStatusKind;
    return {
      path: `${binding.worktreePath}/${file.path}`,
      relativePath: workspaceRelativePath(binding, file.path),
      repositoryPath: binding.sourceRepositoryPath,
      repositoryRelativePath: file.path,
      oldRelativePath: file.originalPath,
      indexStatus: file.indexStatus,
      worktreeStatus: file.worktreeStatus,
      statusKind,
      badge: statusBadge(statusKind),
    };
  });
  const stats = diffStats(diff.content);

  return {
    workspacePath,
    gitRoot: binding.worktreePath,
    currentBranch: binding.cardBranch,
    aheadCount: status.aheadOfBase,
    additions: stats.additions,
    deletions: stats.deletions,
    hasUpstream: status.aheadOfBase > 0,
    hasOrigin: true,
    canPush: status.aheadOfBase > 0,
    files,
    repository: {
      rootPath: binding.sourceRepositoryPath,
      relativePath: binding.relativePath,
      label: pathLabel(binding),
    },
  };
}

export function kanbanRepositoriesToWorkspaceOverview(
  workspacePath: string,
  repositories: KanbanChatGitRepositoryState[],
): WorkspaceGitOverview | null {
  const loaded = repositories.flatMap((state) =>
    state.status === "loaded" ? [state.repository] : [],
  );
  if (loaded.length === 0) return null;

  const files = loaded.flatMap((repository) => repository.files);
  return {
    workspacePath,
    repositories: loaded,
    additions: loaded.reduce(
      (total, repository) => total + (repository.additions ?? 0),
      0,
    ),
    deletions: loaded.reduce(
      (total, repository) => total + (repository.deletions ?? 0),
      0,
    ),
    changedRepositoryCount: loaded.filter(
      (repository) => repository.files.length > 0 || (repository.aheadCount ?? 0) > 0,
    ).length,
    files,
    discoveryTruncated: false,
  };
}
