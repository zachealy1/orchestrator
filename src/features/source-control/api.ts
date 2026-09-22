import { commands } from "../../generated/tauri";
import type { GitHistoryCursor, SourceControlTarget } from "../../generated/tauri";
import { readWorkspaceGitDiff } from "../../codexClient";
import { readKanbanGitFileDiff } from "../kanban/api";
import type { WorkspaceGitDiff, WorkspaceGitRepositoryStatus } from "../workspaces/types";
import type { ChatGitTarget } from "./types";

export type { GitHistoryCommit, GitHistoryCursor, GitHistoryPage, GitCommitDetails, GitCommitFile } from "../../generated/tauri";
export type SourceControlStatus = { repository: WorkspaceGitRepositoryStatus; remotes: string[]; upstream: string | null };

function nativeTarget(target: ChatGitTarget): SourceControlTarget {
  return { workspacePath: target.workspacePath, repositoryPath: target.repositoryPath,
    binding: target.kind === "kanban-card" ? target.binding : null };
}

export const sourceControlApi = {
  status: (target: ChatGitTarget) => commands.sourceControlStatus(nativeTarget(target)) as Promise<SourceControlStatus>,
  stage: async (target: ChatGitTarget, paths: string[] | null, stage: boolean) => { await commands.sourceControlStage(nativeTarget(target), paths, stage); },
  history: (target: ChatGitTarget, cursor: GitHistoryCursor | null = null) => commands.sourceControlHistory(nativeTarget(target), cursor),
  commit: (target: ChatGitTarget, sha: string) => commands.sourceControlCommit(nativeTarget(target), sha),
  commitDiff: (target: ChatGitTarget, sha: string, path: string) => commands.sourceControlCommitDiff(nativeTarget(target), sha, path) as Promise<WorkspaceGitDiff>,
  workingDiff: (target: ChatGitTarget, path: string) => target.kind === "kanban-card"
    ? readKanbanGitFileDiff(target.binding, path)
    : readWorkspaceGitDiff(target.workspacePath, `${target.repositoryPath}/${path}`, target.repositoryPath),
  remote: (target: ChatGitTarget, action: "fetch" | "pull") => commands.sourceControlRemote(nativeTarget(target), action),
};
