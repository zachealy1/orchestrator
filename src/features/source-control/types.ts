import type { KanbanGitBinding } from "../kanban/api";
import type { Workspace, WorkspaceGitFileStatus } from "../workspaces/types";
import type { GitOperationKind, WorkspaceGitOperationRequest } from "../../lib/gitOperations";

export type ChatGitTarget = {
  workspaceId: number;
  workspacePath: string;
  repositoryPath: string;
  repositoryLabel: string;
  branch: string | null;
} & ({ kind: "workspace" } | {
  kind: "kanban-card"; chatId: number; cardId: string;
  worktreePath: string; binding: KanbanGitBinding;
});

export type GitOperationOutcome = { ok: boolean; commitCompleted: boolean; error?: string };
export type ChangeGroup = "staged" | "unstaged" | "untracked" | "conflicts";
export type ChangeSelection = { group: ChangeGroup; path: string };

export function groupChanges(files: WorkspaceGitFileStatus[]) {
  const groups: Record<ChangeGroup, WorkspaceGitFileStatus[]> = { staged: [], unstaged: [], untracked: [], conflicts: [] };
  for (const file of files) {
    if (file.statusKind === "conflicted") groups.conflicts.push(file);
    else if (file.statusKind === "untracked") groups.untracked.push(file);
    else {
      if (file.indexStatus.trim() && file.indexStatus !== "?") groups.staged.push(file);
      if (file.worktreeStatus.trim() && file.worktreeStatus !== "?") groups.unstaged.push(file);
    }
  }
  return groups;
}

export function gitTargetKey(target: ChatGitTarget | null) {
  return target ? JSON.stringify([target.workspacePath, target.repositoryPath,
    target.kind === "kanban-card" ? [target.worktreePath, target.binding.executionRoot, target.binding.cardBranch] : null]) : "";
}

export function gitOperationRequest(workspace: Workspace, target: ChatGitTarget,
  kind: GitOperationKind = "commit", message = ""): WorkspaceGitOperationRequest {
  return {
    workspaceId: workspace.id, workspacePath: workspace.path, workspaceLabel: workspace.label,
    repositoryPath: target.repositoryPath, repositoryLabel: target.repositoryLabel,
    kind, commitMessage: kind === "push" ? null : message, includeUnstaged: false, changeKey: null,
    target: target.kind === "kanban-card"
      ? { kind: "kanban-card", chatId: target.chatId, cardId: target.cardId, binding: target.binding }
      : { kind: "workspace", branch: target.branch },
  };
}
