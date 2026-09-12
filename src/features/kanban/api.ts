import { commands } from "../../generated/tauri";
import type { WorkspaceGitDiff } from "../workspaces/types";
import type { KanbanPullRequestRecord } from "../github/api";

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
  executionSettingsJson?: string | null;
  repositoryScope: "all" | "selected";
  stage: KanbanColumnKey;
  sortPosition: number;
  executionState: KanbanExecutionStateValue;
  reviewState: KanbanReviewStateValue;
  reviewChannel?: "github" | "local" | null;
  currentAttemptId: string | null;
  stateVersion: number;
  archivedAt: string | null;
  deletedAt: string | null;
  approvedAt: string | null;
  lastError: string | null;
  hasInheritedContext: boolean;
  hasStartedTurn: boolean;
  createdAt: string;
  updatedAt: string;
  repositories: KanbanRepositorySelectionRecord[];
  pullRequests?: KanbanPullRequestRecord[];
};

export type KanbanLocalReviewRepository = {
  sourceRepositoryPath: string;
  relativePath: string;
  baseBranch: string;
  cardBranch: string;
  status: string;
  error: string | null;
  additions: number;
  deletions: number;
  files: string[];
  diff: string;
  isEmpty: boolean;
};

export type KanbanLocalReview = {
  cardId: string;
  title: string;
  objective: string;
  summary: string | null;
  reviewChannel: string;
  canPublishGithub: boolean;
  repositories: KanbanLocalReviewRepository[];
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

export type KanbanCardGitBindingsRecord = {
  cardId: string;
  bindings: KanbanGitBinding[];
};

export type KanbanWorkspaceBootstrapRecord = {
  snapshot: KanbanBoardSnapshotRecord;
  bindings: KanbanCardGitBindingsRecord[];
};

export type KanbanAttemptRecord = {
  id: string;
  cardId: string;
  generation: number;
  kind: "start" | "retry" | "resume" | "request_changes" | "implement_plan";
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

export type CompletedKanbanPlan = {
  itemId: string;
  text: string;
};

export type KanbanCardDraft = {
  title: string;
  description: string;
  accountId: number | null;
  accessMode: "ask-for-approval" | "full-access";
  model: string | null;
  reasoningLevel: string | null;
  executionSettingsJson?: string | null;
  repositoryScope: "all" | "selected";
  repositories: KanbanRepositorySelectionRecord[];
  generateTitle?: boolean;
  titleFallback?: string | null;
};

export type KanbanGitRepositoryRequest = {
  baseBranch?: string | null;
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
  /** Legacy compatibility field for bindings persisted by older builds. */
  sourceStatusFingerprint?: string | null;
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

export type KanbanRepositoryConfiguration = {
  repositoryScope: "all" | "selected";
  repositories: KanbanRepositorySelectionRecord[];
  executionSettingsJson: string | null;
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
  return commands.kanbanBoardSnapshot(
    workspaceId,
    options.includeArchived ?? false,
  ) as Promise<KanbanBoardSnapshotRecord>;
}

export function loadKanbanWorkspaceBootstrap(
  workspaceId: number,
  options: { includeArchived?: boolean } = {},
) {
  return commands.kanbanWorkspaceBootstrap(
    workspaceId,
    options.includeArchived ?? false,
  ) as Promise<KanbanWorkspaceBootstrapRecord>;
}

export function getKanbanCardForChat(chatId: number) {
  return commands.kanbanCardForChat(chatId) as Promise<KanbanCardRecord | null>;
}

export function createKanbanCard(
  workspaceId: number,
  draft: KanbanCardDraft,
  ids: { cardId?: string; operationId?: string } = {},
) {
  return commands.kanbanCreateCard({
    id: ids.cardId ?? createKanbanId("card"),
    workspaceId,
    ...draft,
    executionSettingsJson: draft.executionSettingsJson ?? null,
    generateTitle: draft.generateTitle ?? false,
    titleFallback: draft.titleFallback ?? null,
    operationId: ids.operationId ?? createKanbanId("op"),
  }) as Promise<KanbanCardRecord>;
}

export function updateKanbanCard(
  card: Pick<KanbanCardRecord, "id" | "stateVersion">,
  draft: KanbanCardDraft,
  operationId = createKanbanId("op"),
) {
  return commands.kanbanUpdateCard({
    cardId: card.id,
    expectedVersion: card.stateVersion,
    ...draft,
    executionSettingsJson: draft.executionSettingsJson ?? null,
    operationId,
  }) as Promise<KanbanCardRecord>;
}

export function moveKanbanCard(input: {
  card: Pick<KanbanCardRecord, "id" | "stateVersion">;
  targetStage: KanbanColumnKey;
  beforeCardId?: string | null;
  afterCardId?: string | null;
  operationId?: string;
}) {
  return commands.kanbanMoveCard({
    cardId: input.card.id,
    expectedVersion: input.card.stateVersion,
    targetStage: input.targetStage,
    beforeCardId: input.beforeCardId ?? null,
    afterCardId: input.afterCardId ?? null,
    operationId: input.operationId ?? createKanbanId("op"),
  }) as Promise<KanbanCardRecord>;
}

export function claimKanbanAttempt(input: {
  card: Pick<KanbanCardRecord, "id" | "stateVersion">;
  kind: KanbanAttemptRecord["kind"];
  prompt: string;
  configSnapshot: unknown;
  executionSettingsJson?: string | null;
  attemptId?: string;
  operationId?: string;
}) {
  const attemptId = input.attemptId ?? createKanbanId("attempt");
  return commands.kanbanClaimAttempt({
    cardId: input.card.id,
    attemptId,
    expectedVersion: input.card.stateVersion,
    kind: input.kind,
    prompt: input.prompt,
    configSnapshotJson: JSON.stringify(input.configSnapshot),
    executionSettingsJson: input.executionSettingsJson ?? null,
    operationId: input.operationId ?? createKanbanId("op"),
  }) as Promise<KanbanAttemptResult>;
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
  completedPlan?: CompletedKanbanPlan | null;
  operationId?: string;
}) {
  return commands.kanbanUpdateAttempt({
    ...input,
    runId: input.runId ?? null,
    taskId: input.taskId ?? null,
    threadId: input.threadId ?? null,
    turnId: input.turnId ?? null,
    executionRoot: input.executionRoot ?? null,
    error: input.error ?? null,
    completedPlan: input.completedPlan ?? null,
    operationId: input.operationId ?? createKanbanId("op"),
  }) as Promise<KanbanAttemptResult>;
}

export function rejectKanbanPlan(
  card: Pick<KanbanCardRecord, "id" | "stateVersion" | "currentAttemptId">,
  operationId = createKanbanId("op"),
) {
  if (!card.currentAttemptId) {
    return Promise.reject(new Error("This Plan card has no completed attempt."));
  }
  return commands.kanbanRejectPlan({
    cardId: card.id,
    attemptId: card.currentAttemptId,
    expectedVersion: card.stateVersion,
    operationId,
  }) as Promise<KanbanCardRecord>;
}

export function approveKanbanCard(
  card: Pick<KanbanCardRecord, "id" | "stateVersion">,
  operationId = createKanbanId("op"),
) {
  return commands.kanbanApproveCard({
    cardId: card.id,
    expectedVersion: card.stateVersion,
    operationId,
  }) as Promise<KanbanCardRecord>;
}

export function reopenKanbanCard(
  card: Pick<KanbanCardRecord, "id" | "stateVersion">,
  operationId = createKanbanId("op"),
) {
  return commands.kanbanReopenCard({
    cardId: card.id,
    expectedVersion: card.stateVersion,
    operationId,
  }) as Promise<KanbanCardRecord>;
}

export function stopInactiveKanbanCard(
  card: Pick<KanbanCardRecord, "id" | "stateVersion">,
  operationId = createKanbanId("op"),
) {
  return commands.kanbanStopInactiveCard({
    cardId: card.id,
    expectedVersion: card.stateVersion,
    operationId,
  }) as Promise<KanbanCardRecord>;
}

export function archiveKanbanCard(
  card: Pick<KanbanCardRecord, "id" | "stateVersion">,
  archived: boolean,
  operationId = createKanbanId("op"),
) {
  return commands.kanbanArchiveCard({
    cardId: card.id,
    expectedVersion: card.stateVersion,
    archived,
    operationId,
  }) as Promise<KanbanCardRecord>;
}

export function deleteKanbanCard(
  card: Pick<KanbanCardRecord, "id" | "stateVersion">,
  operationId = createKanbanId("op"),
) {
  return commands.kanbanDeleteCard({
    cardId: card.id,
    expectedVersion: card.stateVersion,
    operationId,
  });
}

export function saveKanbanPreferences(input: {
  workspaceId: number;
  expectedRevision: number;
  preferences: unknown;
  columnOrder: KanbanColumnKey[];
  operationId?: string;
}) {
  return commands.kanbanUpdatePreferences({
    workspaceId: input.workspaceId,
    expectedRevision: input.expectedRevision,
    preferencesJson: JSON.stringify(input.preferences),
    columnOrder: input.columnOrder,
    operationId: input.operationId ?? createKanbanId("op"),
  }) as Promise<KanbanBoardSnapshotRecord>;
}

export function recoverInterruptedKanbanAttempts() {
  return commands.kanbanRecoverInterrupted();
}

export function provisionKanbanGit(input: {
  cardId: string;
  cardSlug?: string | null;
  repositories: KanbanGitRepositoryRequest[];
  includeDirty?: boolean;
}) {
  return commands.kanbanGitProvision({
    cardId: input.cardId,
    cardSlug: input.cardSlug ?? null,
    repositories: input.repositories.map((repository) => ({
      repositoryPath: repository.repositoryPath,
      relativePath: repository.relativePath ?? null,
      baseBranch: repository.baseBranch ?? null,
      includeDirtyChanges:
        repository.includeDirtyChanges ?? input.includeDirty ?? false,
    })),
  }) as Promise<KanbanGitProvisionResult>;
}

export function expandKanbanGit(input: {
  cardId: string;
  cardSlug?: string | null;
  existingBindings: KanbanGitBinding[];
  repositories: KanbanGitRepositoryRequest[];
}) {
  return commands.kanbanGitExpand({
    cardId: input.cardId,
    cardSlug: input.cardSlug ?? null,
    existingBindings: input.existingBindings,
    repositories: input.repositories.map((repository) => ({
      repositoryPath: repository.repositoryPath,
      relativePath: repository.relativePath ?? null,
      baseBranch: repository.baseBranch ?? null,
      includeDirtyChanges: repository.includeDirtyChanges ?? false,
    })),
  }) as Promise<KanbanGitProvisionResult>;
}

export function reconcileKanbanGit(binding: KanbanGitBinding) {
  return commands.kanbanGitReconcile({ binding }) as Promise<KanbanGitReconcileResult>;
}

export function readKanbanGitStatus(binding: KanbanGitBinding) {
  return commands.kanbanGitStatus({ binding }) as Promise<KanbanGitStatusResult>;
}

export function readKanbanGitDiff(
  binding: KanbanGitBinding,
  includeBinary = true,
) {
  return commands.kanbanGitDiff({ binding, includeBinary }) as Promise<KanbanGitDiffResult>;
}

export function readKanbanGitFileDiff(
  binding: KanbanGitBinding,
  filePath: string,
) {
  return commands.kanbanGitFileDiff({ binding, filePath }) as Promise<WorkspaceGitDiff>;
}

export function commitKanbanGit(input: {
  binding: KanbanGitBinding;
  message: string;
  stageAll?: boolean;
}) {
  return commands.kanbanGitCommit({
    binding: input.binding,
    message: input.message,
    stageAll: input.stageAll ?? true,
  }) as Promise<KanbanGitActionResult>;
}

export function pushKanbanGit(binding: KanbanGitBinding) {
  return commands.kanbanGitPush({ binding }) as Promise<KanbanGitActionResult>;
}

export function mergeKanbanGit(
  binding: KanbanGitBinding,
  message?: string | null,
) {
  return commands.kanbanGitMerge({
    binding,
    message: message ?? null,
  }) as Promise<KanbanGitMergeResult>;
}

export function cleanupKanbanGit(input: {
  binding: KanbanGitBinding;
  deleteBranch?: boolean;
  force?: boolean;
}) {
  return commands.kanbanGitCleanup({
    binding: input.binding,
    deleteBranch: input.deleteBranch ?? false,
    force: input.force ?? false,
  }) as Promise<KanbanGitCleanupResult>;
}

export function saveKanbanGitBindings(
  card: Pick<KanbanCardRecord, "id" | "stateVersion">,
  bindings: KanbanGitBinding[],
  operationId = createKanbanId("op"),
  repositoryConfiguration: KanbanRepositoryConfiguration | null = null,
) {
  return commands.kanbanSaveGitBindings({
    cardId: card.id,
    expectedVersion: card.stateVersion,
    operationId,
    bindings,
    repositoryConfiguration,
  }) as Promise<KanbanGitBinding[]>;
}

export function loadKanbanGitBindings(cardId: string) {
  return commands.kanbanListGitBindings(cardId) as Promise<KanbanGitBinding[]>;
}

export function loadKanbanLocalReview(cardId: string) {
  return commands.kanbanLocalReview(cardId) as Promise<KanbanLocalReview>;
}

export function useKanbanLocalReview(cardId: string) {
  return commands.kanbanUseLocalReview(cardId) as Promise<KanbanLocalReview>;
}

export function approveKanbanLocalReview(
  cardId: string,
  operationId = createKanbanId("op"),
) {
  return commands.kanbanApproveLocalReview({
    cardId,
    operationId,
  }) as Promise<KanbanLocalReview>;
}

export function completeKanbanLocalReviewWithoutChanges(cardId: string) {
  return commands.kanbanCompleteLocalReviewWithoutChanges(cardId) as Promise<KanbanCardRecord>;
}

export function saveKanbanInheritedContext(input: {
  card: Pick<KanbanCardRecord, "id" | "stateVersion">;
  sourceCardId: string;
  context: string;
  operationId?: string;
}) {
  return commands.kanbanSetInheritedContext({
    cardId: input.card.id,
    sourceCardId: input.sourceCardId,
    context: input.context,
    expectedVersion: input.card.stateVersion,
    operationId: input.operationId ?? createKanbanId("op"),
  });
}

export function loadKanbanInheritedContext(cardId: string) {
  return commands.kanbanGetInheritedContext(cardId);
}
