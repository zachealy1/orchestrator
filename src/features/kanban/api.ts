import { invoke } from "@tauri-apps/api/core";

export type KanbanColumnKey = "todo" | "in_progress" | "in_review" | "done";
export type KanbanExecutionStateValue =
  | "idle"
  | "starting"
  | "running"
  | "paused"
  | "waiting_user"
  | "waiting_approval"
  | "blocked"
  | "failed"
  | "stopped"
  | "interrupted"
  | "completed";
export type KanbanReviewStateValue =
  | "none"
  | "awaiting_review"
  | "changes_requested"
  | "approved";

export type KanbanRepositorySelectionRecord = {
  repositoryPath: string;
  relativePath: string;
  label: string;
  includeDirtyChanges: boolean;
};

export type KanbanCardRecord = {
  id: string;
  workspaceId: number;
  chatId: number;
  title: string;
  description: string;
  accountId: number | null;
  accessMode: "ask-for-approval" | "full-access";
  model: string | null;
  reasoningLevel: string | null;
  repositoryScope: "all" | "selected";
  stage: KanbanColumnKey;
  sortPosition: number;
  executionState: KanbanExecutionStateValue;
  reviewState: KanbanReviewStateValue;
  currentAttemptId: string | null;
  stateVersion: number;
  archivedAt: string | null;
  deletedAt: string | null;
  approvedAt: string | null;
  lastError: string | null;
  hasInheritedContext: boolean;
  createdAt: string;
  updatedAt: string;
  repositories: KanbanRepositorySelectionRecord[];
};

export type KanbanColumnRecord = {
  key: KanbanColumnKey;
  position: number;
};

export type KanbanBoardSnapshotRecord = {
  workspaceId: number;
  revision: number;
  preferencesJson: string;
  columns: KanbanColumnRecord[];
  cards: KanbanCardRecord[];
};

export type KanbanAttemptRecord = {
  id: string;
  cardId: string;
  generation: number;
  kind: "start" | "retry" | "resume" | "request_changes";
  status: string;
  prompt: string;
  runId: number | null;
  taskId: number | null;
  threadId: string | null;
  turnId: string | null;
  executionRoot: string | null;
  lastEventSequence: number;
  error: string | null;
  startedAt: string;
  completedAt: string | null;
};

export type KanbanAttemptResult = {
  card: KanbanCardRecord;
  attempt: KanbanAttemptRecord;
};

export type KanbanCardDraft = {
  title: string;
  description: string;
  accountId: number | null;
  accessMode: "ask-for-approval" | "full-access";
  model: string | null;
  reasoningLevel: string | null;
  repositoryScope: "all" | "selected";
  repositories: KanbanRepositorySelectionRecord[];
};

export type KanbanGitRepositoryRequest = {
  repositoryPath: string;
  relativePath?: string;
  includeDirtyChanges?: boolean;
};

export type KanbanGitOperationError = {
  repositoryPath: string | null;
  code: string;
  message: string;
  cleanupRequired: boolean;
};

export type KanbanGitBinding = {
  sourceRepositoryPath: string;
  relativePath: string;
  executionRoot: string;
  sourceBranch: string;
  baseBranch: string;
  baseCommit: string;
  cardBranch: string;
  worktreePath: string;
  status: string;
  error: KanbanGitOperationError | null;
};

export type KanbanGitProvisionResult = {
  cardId: string;
  executionRoot: string;
  repositories: KanbanGitBinding[];
  errors: KanbanGitOperationError[];
  complete: boolean;
  rolledBack: boolean;
};

export type KanbanGitReconcileResult = {
  binding: KanbanGitBinding;
  sourceAvailable: boolean;
  worktreeAvailable: boolean;
  branchAvailable: boolean;
  branchMatches: boolean;
  baseBranchHead: string | null;
  headCommit: string | null;
  targetMoved: boolean;
  hasChanges: boolean;
  hasConflicts: boolean;
};

export type KanbanGitFileStatus = {
  path: string;
  originalPath: string | null;
  indexStatus: string;
  worktreeStatus: string;
  kind: string;
};

export type KanbanGitStatusResult = {
  binding: KanbanGitBinding;
  headCommit: string;
  baseBranchHead: string | null;
  aheadOfBase: number;
  behindBase: number;
  aheadOfTarget: number | null;
  behindTarget: number | null;
  hasChanges: boolean;
  hasConflicts: boolean;
  stagedCount: number;
  unstagedCount: number;
  untrackedCount: number;
  files: KanbanGitFileStatus[];
};

export type KanbanGitDiffResult = {
  binding: KanbanGitBinding;
  baseCommit: string;
  headCommit: string;
  content: string;
  untrackedPaths: string[];
  isEmpty: boolean;
};

export type KanbanGitActionResult = {
  binding: KanbanGitBinding;
  status: string;
  message: string;
  branch: string;
  headCommit: string;
};

export type KanbanGitMergeResult = {
  binding: KanbanGitBinding;
  status: string;
  mergeKind: string | null;
  targetBranch: string;
  targetHead: string;
  conflictPaths: string[];
  message: string;
};

export type KanbanGitCleanupResult = {
  binding: KanbanGitBinding;
  status: string;
  worktreeRemoved: boolean;
  branchDeleted: boolean;
  executionRootRemoved: boolean;
  errors: KanbanGitOperationError[];
};

export function createKanbanId(prefix: string) {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return `${prefix}-${uuid}`;
  return `${prefix}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 12)}`;
}

export function loadKanbanBoard(
  workspaceId: number,
  options: { includeArchived?: boolean } = {},
) {
  return invoke<KanbanBoardSnapshotRecord>("kanban_board_snapshot", {
    workspaceId,
    includeArchived: options.includeArchived ?? false,
  });
}

export function createKanbanCard(
  workspaceId: number,
  draft: KanbanCardDraft,
  ids: { cardId?: string; operationId?: string } = {},
) {
  return invoke<KanbanCardRecord>("kanban_create_card", {
    request: {
      id: ids.cardId ?? createKanbanId("card"),
      workspaceId,
      ...draft,
      operationId: ids.operationId ?? createKanbanId("op"),
    },
  });
}

export function updateKanbanCard(
  card: Pick<KanbanCardRecord, "id" | "stateVersion">,
  draft: KanbanCardDraft,
  operationId = createKanbanId("op"),
) {
  return invoke<KanbanCardRecord>("kanban_update_card", {
    request: {
      cardId: card.id,
      expectedVersion: card.stateVersion,
      ...draft,
      operationId,
    },
  });
}

export function moveKanbanCard(input: {
  card: Pick<KanbanCardRecord, "id" | "stateVersion">;
  targetStage: KanbanColumnKey;
  beforeCardId?: string | null;
  afterCardId?: string | null;
  operationId?: string;
}) {
  return invoke<KanbanCardRecord>("kanban_move_card", {
    request: {
      cardId: input.card.id,
      expectedVersion: input.card.stateVersion,
      targetStage: input.targetStage,
      beforeCardId: input.beforeCardId ?? null,
      afterCardId: input.afterCardId ?? null,
      operationId: input.operationId ?? createKanbanId("op"),
    },
  });
}

export function claimKanbanAttempt(input: {
  card: Pick<KanbanCardRecord, "id" | "stateVersion">;
  kind: KanbanAttemptRecord["kind"];
  prompt: string;
  configSnapshot: unknown;
  attemptId?: string;
  operationId?: string;
}) {
  const attemptId = input.attemptId ?? createKanbanId("attempt");
  return invoke<KanbanAttemptResult>("kanban_claim_attempt", {
    request: {
      cardId: input.card.id,
      attemptId,
      expectedVersion: input.card.stateVersion,
      kind: input.kind,
      prompt: input.prompt,
      configSnapshotJson: JSON.stringify(input.configSnapshot),
      operationId: input.operationId ?? createKanbanId("op"),
    },
  });
}

export function updateKanbanAttempt(input: {
  cardId: string;
  attemptId: string;
  generation: number;
  sequence: number;
  status: string;
  runId?: number | null;
  taskId?: number | null;
  threadId?: string | null;
  turnId?: string | null;
  executionRoot?: string | null;
  error?: string | null;
  operationId?: string;
}) {
  return invoke<KanbanAttemptResult>("kanban_update_attempt", {
    request: {
      ...input,
      runId: input.runId ?? null,
      taskId: input.taskId ?? null,
      threadId: input.threadId ?? null,
      turnId: input.turnId ?? null,
      executionRoot: input.executionRoot ?? null,
      error: input.error ?? null,
      operationId: input.operationId ?? createKanbanId("op"),
    },
  });
}

export function approveKanbanCard(
  card: Pick<KanbanCardRecord, "id" | "stateVersion">,
  operationId = createKanbanId("op"),
) {
  return invoke<KanbanCardRecord>("kanban_approve_card", {
    request: {
      cardId: card.id,
      expectedVersion: card.stateVersion,
      operationId,
    },
  });
}

export function reopenKanbanCard(
  card: Pick<KanbanCardRecord, "id" | "stateVersion">,
  operationId = createKanbanId("op"),
) {
  return invoke<KanbanCardRecord>("kanban_reopen_card", {
    request: {
      cardId: card.id,
      expectedVersion: card.stateVersion,
      operationId,
    },
  });
}

export function stopInactiveKanbanCard(
  card: Pick<KanbanCardRecord, "id" | "stateVersion">,
  operationId = createKanbanId("op"),
) {
  return invoke<KanbanCardRecord>("kanban_stop_inactive_card", {
    request: {
      cardId: card.id,
      expectedVersion: card.stateVersion,
      operationId,
    },
  });
}

export function archiveKanbanCard(
  card: Pick<KanbanCardRecord, "id" | "stateVersion">,
  archived: boolean,
  operationId = createKanbanId("op"),
) {
  return invoke<KanbanCardRecord>("kanban_archive_card", {
    request: {
      cardId: card.id,
      expectedVersion: card.stateVersion,
      archived,
      operationId,
    },
  });
}

export function deleteKanbanCard(
  card: Pick<KanbanCardRecord, "id" | "stateVersion">,
  operationId = createKanbanId("op"),
) {
  return invoke<void>("kanban_delete_card", {
    request: {
      cardId: card.id,
      expectedVersion: card.stateVersion,
      operationId,
    },
  });
}

export function saveKanbanPreferences(input: {
  workspaceId: number;
  expectedRevision: number;
  preferences: unknown;
  columnOrder: KanbanColumnKey[];
  operationId?: string;
}) {
  return invoke<KanbanBoardSnapshotRecord>("kanban_update_preferences", {
    request: {
      workspaceId: input.workspaceId,
      expectedRevision: input.expectedRevision,
      preferencesJson: JSON.stringify(input.preferences),
      columnOrder: input.columnOrder,
      operationId: input.operationId ?? createKanbanId("op"),
    },
  });
}

export function recoverInterruptedKanbanAttempts() {
  return invoke<number>("kanban_recover_interrupted");
}

export function provisionKanbanGit(input: {
  cardId: string;
  cardSlug?: string | null;
  repositories: KanbanGitRepositoryRequest[];
  includeDirty?: boolean;
}) {
  return invoke<KanbanGitProvisionResult>("kanban_git_provision", {
    request: {
      cardId: input.cardId,
      cardSlug: input.cardSlug ?? null,
      repositories: input.repositories.map((repository) => ({
        repositoryPath: repository.repositoryPath,
        relativePath: repository.relativePath ?? null,
        includeDirtyChanges:
          repository.includeDirtyChanges ?? input.includeDirty ?? false,
      })),
    },
  });
}

export function reconcileKanbanGit(binding: KanbanGitBinding) {
  return invoke<KanbanGitReconcileResult>("kanban_git_reconcile", {
    request: { binding },
  });
}

export function readKanbanGitStatus(binding: KanbanGitBinding) {
  return invoke<KanbanGitStatusResult>("kanban_git_status", {
    request: { binding },
  });
}

export function readKanbanGitDiff(
  binding: KanbanGitBinding,
  includeBinary = true,
) {
  return invoke<KanbanGitDiffResult>("kanban_git_diff", {
    request: { binding, includeBinary },
  });
}

export function commitKanbanGit(input: {
  binding: KanbanGitBinding;
  message: string;
  stageAll?: boolean;
}) {
  return invoke<KanbanGitActionResult>("kanban_git_commit", {
    request: {
      binding: input.binding,
      message: input.message,
      stageAll: input.stageAll ?? true,
    },
  });
}

export function pushKanbanGit(binding: KanbanGitBinding) {
  return invoke<KanbanGitActionResult>("kanban_git_push", {
    request: { binding },
  });
}

export function mergeKanbanGit(
  binding: KanbanGitBinding,
  message?: string | null,
) {
  return invoke<KanbanGitMergeResult>("kanban_git_merge", {
    request: { binding, message: message ?? null },
  });
}

export function cleanupKanbanGit(input: {
  binding: KanbanGitBinding;
  deleteBranch?: boolean;
  force?: boolean;
}) {
  return invoke<KanbanGitCleanupResult>("kanban_git_cleanup", {
    request: {
      binding: input.binding,
      deleteBranch: input.deleteBranch ?? false,
      force: input.force ?? false,
    },
  });
}

export function saveKanbanGitBindings(
  card: Pick<KanbanCardRecord, "id" | "stateVersion">,
  bindings: KanbanGitBinding[],
  operationId = createKanbanId("op"),
) {
  return invoke<KanbanGitBinding[]>("kanban_save_git_bindings", {
    request: {
      cardId: card.id,
      expectedVersion: card.stateVersion,
      operationId,
      bindings,
    },
  });
}

export function loadKanbanGitBindings(cardId: string) {
  return invoke<KanbanGitBinding[]>("kanban_list_git_bindings", { cardId });
}

export function saveKanbanInheritedContext(input: {
  card: Pick<KanbanCardRecord, "id" | "stateVersion">;
  sourceCardId: string;
  context: string;
  operationId?: string;
}) {
  return invoke<void>("kanban_set_inherited_context", {
    request: {
      cardId: input.card.id,
      sourceCardId: input.sourceCardId,
      context: input.context,
      expectedVersion: input.card.stateVersion,
      operationId: input.operationId ?? createKanbanId("op"),
    },
  });
}

export function loadKanbanInheritedContext(cardId: string) {
  return invoke<string | null>("kanban_get_inherited_context", { cardId });
}
