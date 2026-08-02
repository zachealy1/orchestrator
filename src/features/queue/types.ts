import type { CodexProfileKey } from "../codex/types";
import type { RunExecutionSettings } from "../runs/types";
import type {
  ComposerContextFile,
  SelectedComposerSkill,
} from "../composer/types";

export type PromptQueueStatus =
  | "queued"
  | "scheduled-next"
  | "starting"
  | "steering"
  | "active"
  | "failed"
  | "stale"
  | "skipped"
  | "completed";

export type PromptQueueContextFileFingerprint = {
  path: string;
  canonicalPath: string | null;
  size: number | null;
  modifiedAtMs: number | null;
  available: boolean;
};

export type PromptQueueRepositoryFingerprint = {
  repositoryPath: string | null;
  branch: string | null;
  headCommit: string | null;
  worktreeFingerprint: string | null;
};

export type PromptQueueContextFingerprint = {
  version: 2;
  workspacePath: string;
  repositories: PromptQueueRepositoryFingerprint[];
  profileKey: CodexProfileKey;
  threadId: string | null;
  conversationRevision: number;
  files: PromptQueueContextFileFingerprint[];
};

export type PromptQueueContextInspection = Pick<
  PromptQueueContextFingerprint,
  "workspacePath" | "repositories" | "files"
>;

export type QueuedPromptSnapshot = {
  version: 1;
  prompt: string;
  executionSettings: RunExecutionSettings;
  contextFingerprint: PromptQueueContextFingerprint;
};

export type PromptQueueItemRecord = {
  id: string;
  client_message_id: string;
  workspace_id: number;
  chat_id: number;
  position: number;
  send_now_priority: number | null;
  auto_send_enabled: number;
  prompt_text: string;
  execution_snapshot_json: string;
  context_fingerprint_json: string;
  conversation_revision: number;
  status: PromptQueueStatus;
  linked_run_id: number | null;
  linked_turn_id: string | null;
  error: string | null;
  stale_reasons_json: string | null;
  created_at: string;
  updated_at: string;
  accepted_at: string | null;
  completed_at: string | null;
};

export type PromptQueueItem = {
  id: string;
  clientMessageId: string;
  workspaceId: number;
  chatId: number;
  position: number;
  sendNowPriority: number | null;
  autoSendEnabled: boolean;
  prompt: string;
  snapshot: QueuedPromptSnapshot;
  status: PromptQueueStatus;
  linkedRunId: number | null;
  linkedTurnId: string | null;
  error: string | null;
  staleReasons: string[];
  createdAt: string;
  updatedAt: string;
  acceptedAt: string | null;
  completedAt: string | null;
};

export type PromptQueueComposerEditState = {
  item: PromptQueueItem;
  previousComposer: {
    prompt: string;
    contextFiles: ComposerContextFile[];
    selectedSkills: SelectedComposerSkill[];
    selectedModelId: string | null;
    selectedReasoningEffort: string | null;
    goalMode: boolean;
    planMode: boolean;
  };
  status: "editing" | "saving";
  error: string | null;
};

export type PromptQueuePauseReason =
  | "restart"
  | "failure"
  | "stale"
  | "workflow"
  | "manual";
