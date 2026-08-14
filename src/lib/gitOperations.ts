import type { KanbanGitBinding } from "../features/kanban/api";

export type GitOperationKind = "commit" | "push" | "commit-and-push";

export type GitOperationPhase = "generating" | "committing" | "pushing";

export type WorkspaceGitOperationRequest = {
  workspaceId: number;
  workspacePath: string;
  workspaceLabel: string;
  repositoryPath: string;
  repositoryLabel: string;
  kind: GitOperationKind;
  commitMessage: string | null;
  includeUnstaged: boolean;
  changeKey: string | null;
  target:
    | { kind: "workspace"; branch: string | null }
    | {
        kind: "kanban-card";
        chatId: number;
        cardId: string;
        binding: KanbanGitBinding;
      };
};

export type WorkspaceGitOperationState = {
  id: number;
  request: WorkspaceGitOperationRequest;
  phase: GitOperationPhase;
  status: "running" | "succeeded" | "failed";
  title: string;
  detail: string;
  retryRequest: WorkspaceGitOperationRequest | null;
};

export const GIT_OPERATION_RECOVERY_STORAGE_KEY =
  "orchestrator.git-operations.v3";

export function gitOperationRunningCopy(
  kind: GitOperationKind,
  phase: GitOperationPhase,
) {
  if (phase === "generating") {
    return {
      title: "Generating commit message",
      detail: "Creating an intent-driven commit message...",
    };
  }
  if (phase === "pushing") {
    return kind === "commit-and-push"
      ? {
          title: "Commit complete",
          detail: "Pushing the current branch...",
        }
      : {
          title: "Pushing branch",
          detail: "Sending the current branch to its remote...",
        };
  }
  return {
    title: "Committing changes",
    detail: "Creating the Git commit...",
  };
}

export function gitOperationSuccessCopy(kind: GitOperationKind) {
  if (kind === "commit") {
    return {
      title: "Commit complete",
      detail: "Workspace changes were committed successfully.",
    };
  }
  if (kind === "push") {
    return {
      title: "Push complete",
      detail: "The current branch was pushed successfully.",
    };
  }
  return {
    title: "Commit and push complete",
    detail: "Workspace changes were committed and pushed successfully.",
  };
}

export function gitOperationFailureCopy(
  phase: GitOperationPhase,
  error: unknown,
  commitCompleted = false,
) {
  const action =
    phase === "generating"
      ? "Commit message generation"
      : phase === "pushing"
        ? "Push"
        : "Commit";
  const raw = compactGitError(error);
  let detail: string;

  if (
    /non-fast-forward|rejected|fetch first|failed to push some refs/i.test(raw)
  ) {
    detail =
      "Push was rejected. Pull or resolve the remote changes, then try again.";
  } else if (
    /authentication|permission denied|could not read username|terminal prompts disabled|publickey/i.test(
      raw,
    )
  ) {
    detail =
      "Git authentication failed. Sign in or update your credentials, then try again.";
  } else if (/conflict|unmerged|needs merge/i.test(raw)) {
    detail =
      "Git has unresolved conflicts. Resolve them, then try again.";
  } else if (/timed? out|timeout/i.test(raw)) {
    detail = `${action} timed out. Check your connection and try again.`;
  } else if (/cancelled|canceled|aborted|interrupted/i.test(raw)) {
    detail = `${action} was cancelled. Try again when ready.`;
  } else {
    detail = `${action} failed. ${raw || "Check the repository and try again."}`;
  }

  if (commitCompleted && phase === "pushing") {
    detail = `The commit succeeded, but the push failed. ${detail.replace(
      /^Push failed\.\s*/i,
      "",
    )}`;
  }

  return {
    title: `${action} failed`,
    detail,
  };
}

export function gitOperationRetryLabel(
  request: WorkspaceGitOperationRequest | null,
) {
  if (!request) return "Open Git actions";
  if (request.kind === "push") return "Retry push";
  if (request.kind === "commit-and-push") return "Retry commit and push";
  return "Retry commit";
}

export function persistRunningGitOperation(
  request: WorkspaceGitOperationRequest,
  phase: GitOperationPhase,
  storage: Pick<Storage, "getItem" | "setItem"> = localStorage,
) {
  try {
    const current = readRecoveryMarkers(storage);
    current[String(request.workspaceId)] = {
      request: {
        ...request,
        commitMessage: null,
        changeKey: null,
      },
      phase,
    };
    storage.setItem(
      GIT_OPERATION_RECOVERY_STORAGE_KEY,
      JSON.stringify(current),
    );
  } catch {
    // Recovery metadata must never block a Git operation.
  }
}

export function clearRunningGitOperation(
  workspaceId: number,
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem"> = localStorage,
) {
  try {
    const current = readRecoveryMarkers(storage);
    delete current[String(workspaceId)];
    if (Object.keys(current).length === 0) {
      storage.removeItem(GIT_OPERATION_RECOVERY_STORAGE_KEY);
      return;
    }
    storage.setItem(
      GIT_OPERATION_RECOVERY_STORAGE_KEY,
      JSON.stringify(current),
    );
  } catch {
    // The refreshed Git status remains the authoritative recovery path.
  }
}

export function restoreInterruptedGitOperations(
  storage: Pick<Storage, "getItem"> = localStorage,
) {
  const markers = readRecoveryMarkers(storage);
  return Object.values(markers).reduce<
    Record<number, WorkspaceGitOperationState | undefined>
  >((restored, marker) => {
    const { request, phase } = marker;
    restored[request.workspaceId] = {
      id: -request.workspaceId,
      request,
      phase,
      status: "failed",
      title: "Git operation interrupted",
      detail:
        "Review the current Git status before starting another commit or push.",
      retryRequest: null,
    };
    return restored;
  }, {});
}

function compactGitError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const normalized = message.replace(/\s+/g, " ").trim();
  if (normalized.length <= 140) return normalized;
  return `${normalized.slice(0, 137).trimEnd()}...`;
}

type GitOperationRecoveryMarker = {
  request: WorkspaceGitOperationRequest;
  phase: GitOperationPhase;
};

function readRecoveryMarkers(
  storage: Pick<Storage, "getItem">,
): Record<string, GitOperationRecoveryMarker> {
  try {
    const parsed = JSON.parse(
      storage.getItem(GIT_OPERATION_RECOVERY_STORAGE_KEY) ?? "{}",
    ) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    const markers: Record<string, GitOperationRecoveryMarker> = {};
    Object.entries(parsed).forEach(([key, value]) => {
      if (!isRecoveryMarker(value)) return;
      markers[key] = value;
    });
    return markers;
  } catch {
    return {};
  }
}

function isRecoveryMarker(value: unknown): value is GitOperationRecoveryMarker {
  if (!value || typeof value !== "object") return false;
  const marker = value as Partial<GitOperationRecoveryMarker>;
  const request = marker.request as
    | Partial<WorkspaceGitOperationRequest>
    | undefined;
  const target = request?.target as
    | Partial<WorkspaceGitOperationRequest["target"]>
    | undefined;
  const validTarget =
    (target?.kind === "workspace" &&
      (target.branch === null || typeof target.branch === "string")) ||
    (target?.kind === "kanban-card" &&
      Number.isInteger(target.chatId) &&
      typeof target.cardId === "string" &&
      target.cardId.length > 0 &&
      isPersistedKanbanBinding(target.binding));
  return (
    (marker.phase === "generating" ||
      marker.phase === "committing" ||
      marker.phase === "pushing") &&
    Boolean(request) &&
    Number.isInteger(request?.workspaceId) &&
    typeof request?.workspacePath === "string" &&
    request.workspacePath.length > 0 &&
    typeof request.workspaceLabel === "string" &&
    typeof request.repositoryPath === "string" &&
    request.repositoryPath.length > 0 &&
    typeof request.repositoryLabel === "string" &&
    (request.kind === "commit" ||
      request.kind === "push" ||
      request.kind === "commit-and-push") &&
    (request.commitMessage === null ||
      typeof request.commitMessage === "string") &&
    typeof request.includeUnstaged === "boolean" &&
    (request.changeKey === null || typeof request.changeKey === "string") &&
    validTarget
  );
}

function isPersistedKanbanBinding(value: unknown): value is KanbanGitBinding {
  if (!value || typeof value !== "object") return false;
  const binding = value as Partial<KanbanGitBinding>;
  return (
    typeof binding.sourceRepositoryPath === "string" &&
    binding.sourceRepositoryPath.length > 0 &&
    typeof binding.relativePath === "string" &&
    typeof binding.executionRoot === "string" &&
    binding.executionRoot.length > 0 &&
    typeof binding.sourceBranch === "string" &&
    typeof binding.baseBranch === "string" &&
    typeof binding.baseCommit === "string" &&
    typeof binding.cardBranch === "string" &&
    binding.cardBranch.length > 0 &&
    typeof binding.worktreePath === "string" &&
    binding.worktreePath.length > 0 &&
    typeof binding.status === "string"
  );
}
