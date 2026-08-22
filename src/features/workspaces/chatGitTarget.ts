import {
  readKanbanGitDiff,
  readKanbanGitStatus,
  type KanbanGitBinding,
  type KanbanGitDiffResult,
  type KanbanGitStatusResult,
} from "../kanban/api";
import type {
  WorkspaceGitFileStatus,
  WorkspaceGitOverview,
  WorkspaceGitRepositoryStatus,
  WorkspaceGitStatusKind,
  WorkspaceTreeEntry,
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

export type KanbanChatFileTarget = {
  binding: KanbanGitBinding;
  repositoryRelativePath: string;
};

export type KanbanChatUndoTarget = {
  binding: KanbanGitBinding;
  pathStrip: number;
};

type KanbanChatEditedFile = {
  name: string;
  status: "added" | "modified" | "deleted" | "renamed" | "copied" | "unknown";
};

export type KanbanChatFilePreviewTarget = KanbanChatFileTarget & {
  file: WorkspaceTreeEntry;
  gitStatus: WorkspaceGitFileStatus | null;
  diffCacheKey: string;
};

function normalizeFileTargetPath(path: string) {
  let value = path.trim();
  if (!value) return null;

  if (/^[a-z][a-z\d+.-]*:/i.test(value)) {
    try {
      const url = new URL(value);
      if (url.protocol !== "file:") return null;
      value = decodeURIComponent(url.pathname);
    } catch {
      return null;
    }
  } else {
    try {
      value = decodeURIComponent(value.split("#", 1)[0].split("?", 1)[0]);
    } catch {
      value = value.split("#", 1)[0].split("?", 1)[0];
    }
  }

  value = value.replace(/\\/g, "/").replace(/:\d+(?::\d+)?$/, "");
  return value.replace(/^\.\//, "").replace(/\/+$/, "") || null;
}

function relativeChildPath(path: string, root: string) {
  const normalizedRoot = root.replace(/\\/g, "/").replace(/\/+$/, "");
  if (path === normalizedRoot) return "";
  return path.startsWith(`${normalizedRoot}/`)
    ? path.slice(normalizedRoot.length + 1)
    : null;
}

function validRepositoryRelativePath(path: string) {
  const normalized = path.replace(/^\/+/, "").replace(/^\.\//, "");
  if (
    !normalized ||
    normalized === "." ||
    normalized.split("/").some((segment) => segment === "..")
  ) {
    return null;
  }
  return normalized;
}

/** Resolves transcript paths without guessing between repositories in multi-repo cards. */
export function resolveKanbanChatFileTarget(
  bindings: KanbanGitBinding[],
  path: string,
): KanbanChatFileTarget | null {
  const normalizedPath = normalizeFileTargetPath(path);
  if (!normalizedPath || bindings.length === 0) return null;

  const absoluteCandidates = bindings
    .flatMap((binding) =>
      [binding.worktreePath, binding.sourceRepositoryPath].map((root) => ({
        binding,
        root: root.replace(/\\/g, "/").replace(/\/+$/, ""),
      })),
    )
    .sort((left, right) => right.root.length - left.root.length);
  for (const { binding, root } of absoluteCandidates) {
    const direct = relativeChildPath(normalizedPath, root);
    const repositoryRelativePath =
      direct === null ? null : validRepositoryRelativePath(direct);
    if (repositoryRelativePath) return { binding, repositoryRelativePath };
  }

  const relativePath = normalizedPath.replace(/^\/+/, "");
  const prefixedCandidates = bindings
    .filter((binding) => binding.relativePath !== ".")
    .map((binding) => ({
      binding,
      repositoryPrefix: binding.relativePath
        .replace(/\\/g, "/")
        .replace(/^\/+|\/+$/g, ""),
    }))
    .sort(
      (left, right) =>
        right.repositoryPrefix.length - left.repositoryPrefix.length,
    );
  for (const { binding, repositoryPrefix } of prefixedCandidates) {
    if (!repositoryPrefix || !relativePath.startsWith(`${repositoryPrefix}/`)) {
      continue;
    }
    const repositoryRelativePath = validRepositoryRelativePath(
      relativePath.slice(repositoryPrefix.length + 1),
    );
    if (repositoryRelativePath) return { binding, repositoryRelativePath };
  }

  if (bindings.length !== 1) return null;
  const repositoryRelativePath = validRepositoryRelativePath(relativePath);
  return repositoryRelativePath
    ? { binding: bindings[0], repositoryRelativePath }
    : null;
}

/** Resolves a saved turn diff to one isolated card repository. */
export function resolveKanbanChatUndoTarget(
  bindings: KanbanGitBinding[],
  editedFiles: Array<{ path: string }>,
): KanbanChatUndoTarget | null {
  if (editedFiles.length === 0) return null;

  const targets = editedFiles.map((file) =>
    resolveKanbanChatFileTarget(bindings, file.path),
  );
  const first = targets[0];
  if (
    !first ||
    targets.some(
      (target) =>
        !target || target.binding.worktreePath !== first.binding.worktreePath,
    )
  ) {
    return null;
  }

  const executionRelativePath = relativeChildPath(
    first.binding.worktreePath.replace(/\\/g, "/").replace(/\/+$/, ""),
    first.binding.executionRoot.replace(/\\/g, "/").replace(/\/+$/, ""),
  );
  if (executionRelativePath === null) return null;
  const prefixDepth = executionRelativePath
    .split("/")
    .filter((segment) => segment && segment !== ".").length;

  return {
    binding: first.binding,
    // Git's normal `a/` or `b/` prefix is the first stripped component.
    pathStrip: prefixDepth + 1,
  };
}

function editedFileStatusKind(
  editedFile: KanbanChatEditedFile | undefined,
): WorkspaceGitStatusKind | null {
  if (!editedFile) return null;
  return editedFile.status === "unknown" ? "modified" : editedFile.status;
}

export function createKanbanChatFilePreviewTarget(
  bindings: KanbanGitBinding[],
  path: string,
  editedFile?: KanbanChatEditedFile,
): KanbanChatFilePreviewTarget | null {
  const target = resolveKanbanChatFileTarget(bindings, path);
  if (!target) return null;

  const { binding, repositoryRelativePath } = target;
  const worktreeRoot = binding.worktreePath.replace(/\/+$/, "");
  const filePath = `${worktreeRoot}/${repositoryRelativePath}`;
  const statusKind = editedFileStatusKind(editedFile);
  const pathParts = repositoryRelativePath.split("/").filter(Boolean);
  const gitStatus = statusKind
    ? {
        path: filePath,
        relativePath: repositoryRelativePath,
        repositoryPath: binding.sourceRepositoryPath,
        repositoryRelativePath,
        oldRelativePath: null,
        indexStatus: " ",
        worktreeStatus: " ",
        statusKind,
        badge: statusBadge(statusKind),
      }
    : null;

  return {
    binding,
    repositoryRelativePath,
    file: {
      name:
        editedFile?.name ??
        pathParts[pathParts.length - 1] ??
        repositoryRelativePath,
      path: filePath,
      relativePath: repositoryRelativePath,
      kind: "file",
      gitGhost: statusKind === "deleted",
    },
    gitStatus,
    diffCacheKey: [
      "kanban-card",
      binding.worktreePath,
      binding.baseCommit,
      repositoryRelativePath,
    ].join("\u0000"),
  };
}

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

export async function refreshKanbanChatRepositories(
  workspacePath: string,
  repositories: KanbanChatGitRepositoryState[],
  readers: {
    readStatus: (binding: KanbanGitBinding) => Promise<KanbanGitStatusResult>;
    readDiff: (binding: KanbanGitBinding) => Promise<KanbanGitDiffResult>;
  } = {
    readStatus: readKanbanGitStatus,
    readDiff: readKanbanGitDiff,
  },
) {
  return Promise.all(
    repositories.map(
      async (candidate): Promise<KanbanChatGitRepositoryState> => {
        try {
          const [status, diff] = await Promise.all([
            readers.readStatus(candidate.binding),
            readers.readDiff(candidate.binding),
          ]);
          return {
            status: "loaded",
            binding: status.binding,
            repository: kanbanStatusToWorkspaceRepository(
              workspacePath,
              status,
              diff,
            ),
            error: null,
          };
        } catch (error) {
          return {
            status: "error",
            binding: candidate.binding,
            repository: null,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      },
    ),
  );
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
