import {
  parseRunExecutionSettingsValue,
} from "./runExecutionSettings";
import type { PromptQueueContextFileFingerprint, PromptQueueContextFingerprint, PromptQueueContextInspection, PromptQueueItem, PromptQueueItemRecord, PromptQueueStatus, QueuedPromptSnapshot } from "../features/queue/types";

export const PROMPT_QUEUE_SNAPSHOT_VERSION = 1;
export const PROMPT_QUEUE_MAX_ITEMS = 50;
export const PROMPT_QUEUE_MAX_PROMPT_CHARACTERS = 100_000;
export const PROMPT_QUEUE_MAX_ATTACHMENTS = 20;

const ACTIVE_QUEUE_STATUSES = new Set<PromptQueueStatus>([
  "queued",
  "scheduled-next",
  "starting",
  "steering",
  "active",
  "failed",
  "stale",
]);

export function createPromptQueueItemId() {
  return `queue-${crypto.randomUUID()}`;
}

export function createQueuedPromptSnapshot(
  input: Omit<QueuedPromptSnapshot, "version">,
): QueuedPromptSnapshot {
  return {
    version: PROMPT_QUEUE_SNAPSHOT_VERSION,
    prompt: input.prompt,
    executionSettings: {
      ...input.executionSettings,
      contextFiles: input.executionSettings.contextFiles.map((file) => ({
        ...file,
      })),
      selectedSkills: input.executionSettings.selectedSkills.map((skill) => ({
        ...skill,
      })),
    },
    contextFingerprint: {
      ...input.contextFingerprint,
      repositories: input.contextFingerprint.repositories.map((repository) => ({
        ...repository,
      })),
      files: input.contextFingerprint.files.map((file) => ({ ...file })),
    },
  };
}

export function serializeQueuedPromptSnapshot(snapshot: QueuedPromptSnapshot) {
  return JSON.stringify(snapshot);
}

export function parseQueuedPromptSnapshot(
  value: string | null | undefined,
): QueuedPromptSnapshot | null {
  if (!value) return null;
  try {
    return readQueuedPromptSnapshot(JSON.parse(value) as unknown);
  } catch {
    return null;
  }
}

export function parsePromptQueueItemRecord(
  record: PromptQueueItemRecord,
): PromptQueueItem | null {
  const snapshot = parseQueuedPromptSnapshot(record.execution_snapshot_json);
  const contextFingerprint = parsePromptQueueContextFingerprint(
    record.context_fingerprint_json,
  );
  if (
    !snapshot ||
    !contextFingerprint ||
    !isPromptQueueStatus(record.status) ||
    ![0, 1].includes(Number(record.auto_send_enabled))
  ) {
    return null;
  }

  const staleReasons = parseStringArray(record.stale_reasons_json) ?? [];
  return {
    id: record.id,
    clientMessageId: record.client_message_id,
    workspaceId: record.workspace_id,
    chatId: record.chat_id,
    position: record.position,
    sendNowPriority: record.send_now_priority,
    autoSendEnabled: Number(record.auto_send_enabled) === 1,
    prompt: record.prompt_text,
    snapshot: {
      ...snapshot,
      contextFingerprint: {
        ...contextFingerprint,
        conversationRevision: record.conversation_revision,
      },
    },
    status: record.status,
    linkedRunId: record.linked_run_id,
    linkedTurnId: record.linked_turn_id,
    error: record.error,
    staleReasons,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
    acceptedAt: record.accepted_at,
    completedAt: record.completed_at,
  };
}

export function isPromptQueueItemPending(item: PromptQueueItem) {
  return ACTIVE_QUEUE_STATUSES.has(item.status);
}

export function isPromptQueueItemAutoDispatchEligible(
  item: PromptQueueItem,
) {
  return item.sendNowPriority !== null || item.autoSendEnabled;
}

export function isPromptQueueItemMutable(item: PromptQueueItem) {
  return !["starting", "steering", "active"].includes(item.status);
}

export function comparePromptQueueDispatchOrder(
  left: PromptQueueItem,
  right: PromptQueueItem,
) {
  if (
    left.sendNowPriority !== null ||
    right.sendNowPriority !== null
  ) {
    if (left.sendNowPriority === null) return 1;
    if (right.sendNowPriority === null) return -1;
    if (left.sendNowPriority !== right.sendNowPriority) {
      return left.sendNowPriority - right.sendNowPriority;
    }
  }
  if (left.position !== right.position) {
    return left.position - right.position;
  }
  return left.createdAt.localeCompare(right.createdAt);
}

export function comparePromptQueueDisplayOrder(
  left: PromptQueueItem,
  right: PromptQueueItem,
) {
  if (left.position !== right.position) {
    return left.position - right.position;
  }
  return left.createdAt.localeCompare(right.createdAt);
}

export function rebaselinePromptQueueContextFingerprint(input: {
  expected: PromptQueueContextFingerprint;
  inspection: PromptQueueContextInspection;
  executionProfileKey: PromptQueueContextFingerprint["profileKey"];
  currentProfileKey: PromptQueueContextFingerprint["profileKey"];
  currentThreadId: string | null;
  conversationRevision: number;
}): PromptQueueContextFingerprint {
  const followsCurrentThread =
    input.executionProfileKey === input.currentProfileKey;
  return {
    ...input.expected,
    version: 2,
    workspacePath: input.inspection.workspacePath,
    repositories: input.inspection.repositories.map((repository) => ({
      ...repository,
    })),
    profileKey: followsCurrentThread
      ? input.currentProfileKey
      : input.expected.profileKey,
    threadId: followsCurrentThread
      ? input.currentThreadId
      : input.expected.threadId,
    conversationRevision: input.conversationRevision,
    files: input.inspection.files.map((file) => ({ ...file })),
  };
}

export function queuePromptPreview(prompt: string, limit = 96) {
  const normalized = prompt.replace(/\s+/g, " ").trim();
  if (normalized.length <= limit) return normalized;
  return `${normalized.slice(0, Math.max(1, limit - 1)).trimEnd()}…`;
}

export function validatePromptQueueDraft(input: {
  prompt: string;
  attachmentCount: number;
  currentQueueSize: number;
}) {
  const prompt = input.prompt.trim();
  if (!prompt) return "Write a prompt before adding it to the queue.";
  if (prompt.length > PROMPT_QUEUE_MAX_PROMPT_CHARACTERS) {
    return `Queued prompts are limited to ${PROMPT_QUEUE_MAX_PROMPT_CHARACTERS.toLocaleString()} characters.`;
  }
  if (input.attachmentCount > PROMPT_QUEUE_MAX_ATTACHMENTS) {
    return `Queued prompts can include at most ${PROMPT_QUEUE_MAX_ATTACHMENTS} attachments.`;
  }
  if (input.currentQueueSize >= PROMPT_QUEUE_MAX_ITEMS) {
    return `This chat already has the maximum of ${PROMPT_QUEUE_MAX_ITEMS} queued prompts.`;
  }
  return null;
}

function readQueuedPromptSnapshot(value: unknown): QueuedPromptSnapshot | null {
  if (
    !isRecord(value) ||
    value.version !== PROMPT_QUEUE_SNAPSHOT_VERSION ||
    typeof value.prompt !== "string"
  ) {
    return null;
  }
  const executionSettings = parseRunExecutionSettingsValue(
    value.executionSettings,
  );
  const contextFingerprint = readPromptQueueContextFingerprint(
    value.contextFingerprint,
  );
  if (!executionSettings || !contextFingerprint) return null;
  return createQueuedPromptSnapshot({
    prompt: value.prompt,
    executionSettings,
    contextFingerprint,
  });
}

export function parsePromptQueueContextFingerprint(
  value: string | null | undefined,
) {
  if (!value) return null;
  try {
    return readPromptQueueContextFingerprint(JSON.parse(value) as unknown);
  } catch {
    return null;
  }
}

function readPromptQueueContextFingerprint(
  value: unknown,
): PromptQueueContextFingerprint | null {
  if (
    !isRecord(value) ||
    (value.version !== 1 && value.version !== 2) ||
    typeof value.workspacePath !== "string" ||
    !isProfileKey(value.profileKey) ||
    !isOptionalString(value.threadId) ||
    !Number.isSafeInteger(value.conversationRevision) ||
    Number(value.conversationRevision) < 0 ||
    !Array.isArray(value.files)
  ) {
    return null;
  }
  const rawRepositories = value.repositories;
  const repositories =
    value.version === 1
      ? !isOptionalString(value.branch) ||
        !isOptionalString(value.headCommit) ||
        !isOptionalString(value.worktreeFingerprint)
        ? null
        : [
            {
              repositoryPath: null,
              branch: value.branch,
              headCommit: value.headCommit,
              worktreeFingerprint: value.worktreeFingerprint,
            },
          ]
      : Array.isArray(rawRepositories)
        ? rawRepositories
            .map(readRepositoryFingerprint)
            .filter((repository) => repository !== null)
        : null;
  if (
    repositories === null ||
    (value.version === 2 &&
      Array.isArray(rawRepositories) &&
      repositories.length !== rawRepositories.length)
  ) {
    return null;
  }
  const files = value.files
    .map(readContextFileFingerprint)
    .filter(
      (file): file is PromptQueueContextFileFingerprint => file !== null,
    );
  if (files.length !== value.files.length) return null;
  return {
    version: 2,
    workspacePath: value.workspacePath,
    repositories,
    profileKey: value.profileKey,
    threadId: value.threadId,
    conversationRevision: Number(value.conversationRevision),
    files,
  };
}

function readRepositoryFingerprint(value: unknown) {
  if (
    !isRecord(value) ||
    !isOptionalString(value.repositoryPath) ||
    !isOptionalString(value.branch) ||
    !isOptionalString(value.headCommit) ||
    !isOptionalString(value.worktreeFingerprint)
  ) {
    return null;
  }
  return {
    repositoryPath: value.repositoryPath,
    branch: value.branch,
    headCommit: value.headCommit,
    worktreeFingerprint: value.worktreeFingerprint,
  };
}

function readContextFileFingerprint(
  value: unknown,
): PromptQueueContextFileFingerprint | null {
  if (
    !isRecord(value) ||
    typeof value.path !== "string" ||
    !isOptionalString(value.canonicalPath) ||
    !isOptionalNumber(value.size) ||
    !isOptionalNumber(value.modifiedAtMs) ||
    typeof value.available !== "boolean"
  ) {
    return null;
  }
  return {
    path: value.path,
    canonicalPath: value.canonicalPath,
    size: value.size,
    modifiedAtMs: value.modifiedAtMs,
    available: value.available,
  };
}

function parseStringArray(value: string | null | undefined) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) &&
      parsed.every((entry) => typeof entry === "string")
      ? parsed
      : null;
  } catch {
    return null;
  }
}

function isPromptQueueStatus(value: unknown): value is PromptQueueStatus {
  return (
    value === "queued" ||
    value === "scheduled-next" ||
    value === "starting" ||
    value === "steering" ||
    value === "active" ||
    value === "failed" ||
    value === "stale" ||
    value === "skipped" ||
    value === "completed"
  );
}

function isProfileKey(value: unknown): value is PromptQueueContextFingerprint["profileKey"] {
  return value === "default" || (
    typeof value === "string" && /^account:\d+$/.test(value)
  );
}

function isOptionalString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isOptionalNumber(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isFinite(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
