export type KanbanColumnId =
  | "todo"
  | "in-progress"
  | "in-review"
  | "done"
  | (string & {});

export type KanbanExecutionState =
  | "idle"
  | "starting"
  | "running"
  | "pause-requested"
  | "paused"
  | "waiting-for-input"
  | "waiting-for-approval"
  | "blocked"
  | "failed"
  | "stopping"
  | "stopped"
  | "interrupted"
  | "completed"
  | "completed-awaiting-review";

export type KanbanAccessMode = "ask-for-approval" | "full-access";
export type KanbanSubmissionMode = "normal" | "plan" | "goal";

export type KanbanCardAction =
  | "start"
  | "pause"
  | "resume"
  | "stop"
  | "retry"
  | "edit"
  | "duplicate"
  | "archive"
  | "delete"
  | "commit"
  | "commit-and-push"
  | "merge"
  | "request-changes"
  | "approve"
  | "open-pull-request"
  | "retry-publication"
  | "review-locally"
  | "complete-without-pr"
  | "review-changes";

export type KanbanRepository = {
  id: string;
  label: string;
  path: string;
};

export type KanbanBranchBinding = {
  repositoryId: string;
  repositoryLabel: string;
  branch: string;
  targetBranch?: string | null;
  worktreePath?: string | null;
  status?: "ready" | "dirty" | "conflicted" | "merged" | "missing";
};

export type KanbanCard = {
  id: string;
  chatId: number;
  hasStartedTurn: boolean;
  title: string;
  description: string;
  columnId: KanbanColumnId;
  position: number;
  repositoryScope: "all" | "selected";
  repositories: KanbanRepository[];
  accountId: string | null;
  accountLabel: string;
  accessMode: KanbanAccessMode;
  model: string;
  modelLabel: string;
  reasoningLevel: string;
  reasoningLevelLabel?: string;
  submissionMode?: KanbanSubmissionMode;
  contextFiles?: import("../../composer/types").ComposerContextFile[];
  includeDirtyChanges?: boolean;
  executionState: KanbanExecutionState;
  branches?: KanbanBranchBinding[];
  availableActions?: KanbanCardAction[];
  changedFileCount?: number;
  hasUnreadActivity?: boolean;
  archivedAt?: string | null;
  lastActivityAt?: string | null;
  pullRequests?: import("../../reviews/api").KanbanPullRequestRecord[];
  reviewChannel?: "github" | "gitlab" | "mixed" | "local" | null;
};

export type KanbanColumn = {
  id: KanbanColumnId;
  title: string;
  description?: string;
  position: number;
  cards: KanbanCard[];
};

export type KanbanMoveRequest = {
  cardId: string;
  fromColumnId: KanbanColumnId;
  toColumnId: KanbanColumnId;
  toIndex: number;
  requiresStop: boolean;
};

export type KanbanCardDraft = {
  title: string;
  description: string;
  repositoryScope: "all" | "selected";
  repositoryIds: string[];
  accountId: string | null;
  accessMode: KanbanAccessMode;
  model: string;
  reasoningLevel: string;
  submissionMode: KanbanSubmissionMode;
  contextFiles: import("../../composer/types").ComposerContextFile[];
  includeDirtyChanges: boolean;
  includeConversationHistory: boolean;
};

export type KanbanSelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

export type KanbanFilterOption = KanbanSelectOption & {
  count?: number;
};

export type KanbanFilterGroup = {
  id: string;
  label: string;
  options: KanbanFilterOption[];
};

export type KanbanFilterSelection = Record<string, string[]>;

export type KanbanGroupBy =
  | "none"
  | "repository"
  | "account"
  | "access-mode"
  | "model"
  | "reasoning-level"
  | "execution-state";

export type KanbanTransitionKind =
  | "stop"
  | "stop-and-move"
  | "approve-done"
  | "approve-local"
  | "complete-without-pr"
  | "request-changes"
  | "archive"
  | "delete"
  | "discard-uncommitted";

export type KanbanCleanupOption = {
  id: string;
  label: string;
  description: string;
  selected: boolean;
  disabled?: boolean;
  destructive?: boolean;
};
