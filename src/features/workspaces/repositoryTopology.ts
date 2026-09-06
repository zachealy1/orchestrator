import type {
  WorkspaceGitOverview,
  WorkspaceGitRepositoryStatus,
} from "./types";

export type WorkspaceRepositoryTopology =
  | { kind: "unavailable"; repositories: [] }
  | {
      kind: "single";
      repositories: [WorkspaceGitRepositoryStatus];
      repository: WorkspaceGitRepositoryStatus;
    }
  | {
      kind: "multi";
      repositories: WorkspaceGitRepositoryStatus[];
    };

export type WorkspaceRunRepositoryContext = {
  selectedRepositoryPath: string | null;
  selectedBranch: string | null;
  repositories: WorkspaceGitRepositoryStatus[];
  multiRepository: boolean;
};

export function workspaceRepositoryTopology(
  overview: WorkspaceGitOverview | null | undefined,
): WorkspaceRepositoryTopology {
  const repositories = overview?.repositories ?? [];
  if (repositories.length === 0) {
    return { kind: "unavailable", repositories: [] };
  }
  if (repositories.length === 1) {
    const repository = repositories[0]!;
    return { kind: "single", repositories: [repository], repository };
  }
  return { kind: "multi", repositories };
}

export function workspaceRunRepositoryContext(input: {
  overview: WorkspaceGitOverview | null | undefined;
  selectedBranch: string | null;
}): WorkspaceRunRepositoryContext {
  const topology = workspaceRepositoryTopology(input.overview);
  if (topology.kind !== "single") {
    return {
      selectedRepositoryPath: null,
      selectedBranch: null,
      repositories: topology.repositories,
      multiRepository: topology.kind === "multi",
    };
  }
  return {
    selectedRepositoryPath: topology.repository.repository.rootPath,
    selectedBranch:
      input.selectedBranch ?? topology.repository.currentBranch ?? null,
    repositories: topology.repositories,
    multiRepository: false,
  };
}

export function formatWorkspaceRepositoryContext(
  repositories: Array<{
    repository: Pick<WorkspaceGitRepositoryStatus["repository"], "label" | "relativePath">;
  }>,
) {
  if (repositories.length <= 1) return null;
  return [
    "This workspace contains multiple Git repositories. Inspect the task and choose the repository or combination of repositories required; no repository is preselected.",
    ...repositories.map((repository) => {
      const relativePath = repository.repository.relativePath || ".";
      return `- ${repository.repository.label}: ${relativePath}`;
    }),
  ].join("\n");
}

export function formatRepositoryPathContext(input: {
  workspacePath: string;
  repositoryPaths: string[];
}) {
  if (input.repositoryPaths.length <= 1) return null;
  const workspacePrefix = `${input.workspacePath.replace(/[\\/]+$/, "")}/`;
  return [
    "This workspace contains multiple Git repositories. Inspect the task and choose the repository or combination of repositories required; no repository is preselected.",
    ...input.repositoryPaths.map((path) => {
      const relativePath = path.startsWith(workspacePrefix)
        ? path.slice(workspacePrefix.length)
        : path;
      const pathSegments = relativePath.split(/[\\/]/).filter(Boolean);
      const label = pathSegments[pathSegments.length - 1] ?? relativePath;
      return `- ${label}: ${relativePath || "."}`;
    }),
  ].join("\n");
}
