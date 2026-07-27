import Database from "@tauri-apps/plugin-sql";
import { invoke } from "@tauri-apps/api/core";
import type {
  AnalyticsSummary,
  ChatListItem,
  ChatRecord,
  ChatWithRuns,
  CodexAccountProfile,
  CodexAccountStatus,
  ExternalTranscriptSnapshot,
  ExternalThreadHistoryIndex,
  HistoryPageDescriptor,
  PreflightReport,
  HistoryRunSummary,
  HistoryTranscriptIndex,
  HistoryTurnHint,
  PromptQueueItem,
  PromptQueueItemRecord,
  PromptQueueStatus,
  QueuedPromptSnapshot,
  RunListItem,
  RunRecord,
  TaskRecord,
  Workspace,
} from "./types";
import {
  parsePromptQueueItemRecord,
  serializeQueuedPromptSnapshot,
} from "./lib/promptQueue";

const DATABASE_URL = "sqlite:app.db";
const PROMPT_QUEUE_COLUMNS = `
  id, client_message_id, workspace_id, chat_id, position,
  send_now_priority, auto_send_enabled, prompt_text, execution_snapshot_json,
  context_fingerprint_json, conversation_revision, status,
  linked_run_id, linked_turn_id, error, stale_reasons_json,
  created_at, updated_at, accepted_at, completed_at
`;

let database: Promise<Database> | null = null;
function getDatabase() {
  database ??= Database.load(DATABASE_URL);
  return database;
}

async function selectOne<T>(query: string, bindValues: unknown[] = []) {
  const db = await getDatabase();
  const rows = await db.select<T[]>(query, bindValues);
  return rows[0] ?? null;
}

function workspaceLabel(path: string) {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

export async function listWorkspaces() {
  const db = await getDatabase();
  return db.select<Workspace[]>(
    `SELECT id, path, label, default_account_id, last_opened_at, created_at
     FROM workspaces
     WHERE deleted_at IS NULL
     ORDER BY last_opened_at DESC`,
  );
}

export async function upsertWorkspace(path: string) {
  const db = await getDatabase();
  const label = workspaceLabel(path);

  await db.execute(
    `INSERT INTO workspaces (path, label, last_opened_at)
     VALUES ($1, $2, CURRENT_TIMESTAMP)
     ON CONFLICT(path) DO UPDATE SET
       label = excluded.label,
       last_opened_at = CURRENT_TIMESTAMP,
       deleted_at = NULL`,
    [path, label],
  );

  const workspace = await selectOne<Workspace>(
    `SELECT id, path, label, default_account_id, last_opened_at, created_at
     FROM workspaces
     WHERE path = $1 AND deleted_at IS NULL`,
    [path],
  );

  if (!workspace) {
    throw new Error("Workspace was not saved");
  }

  return workspace;
}

export async function softDeleteWorkspace(workspaceId: number) {
  const db = await getDatabase();
  await db.execute(
    "DELETE FROM prompt_queue_items WHERE workspace_id = $1",
    [workspaceId],
  );
  await db.execute(
    `UPDATE workspaces
     SET default_account_id = NULL,
         deleted_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [workspaceId],
  );
}

export async function listCodexAccounts() {
  const db = await getDatabase();
  return db.select<CodexAccountProfile[]>(
    `SELECT id, label, email, plan_type, status, last_error, last_used_at,
      created_at, updated_at, deleted_at
     FROM codex_accounts
     WHERE deleted_at IS NULL
     ORDER BY COALESCE(last_used_at, created_at) DESC, id DESC`,
  );
}

export async function listDuplicateProfilesPendingCleanup() {
  const db = await getDatabase();
  const rows = await db.select<Array<{ id: number }>>(
    `SELECT id
     FROM codex_accounts
     WHERE deleted_at IS NOT NULL
       AND last_error = 'Duplicate account consolidated'`,
  );
  return rows.map((row) => row.id);
}

export async function completeDuplicateProfileCleanup(accountId: number) {
  const db = await getDatabase();
  await db.execute(
    `UPDATE codex_accounts
     SET last_error = NULL, updated_at = CURRENT_TIMESTAMP
     WHERE id = $1
       AND deleted_at IS NOT NULL
       AND last_error = 'Duplicate account consolidated'`,
    [accountId],
  );
}

export async function createCodexAccount(label = "New Codex account") {
  const db = await getDatabase();
  const result = await db.execute(
    `INSERT INTO codex_accounts (label, status)
     VALUES ($1, 'pending')`,
    [label],
  );
  const account = await selectOne<CodexAccountProfile>(
    `SELECT id, label, email, plan_type, status, last_error, last_used_at,
      created_at, updated_at, deleted_at
     FROM codex_accounts WHERE id = $1`,
    [result.lastInsertId],
  );
  if (!account) {
    throw new Error("Codex account profile was not created");
  }
  return account;
}

export async function updateCodexAccount(
  accountId: number,
  fields: Partial<{
    label: string;
    email: string | null;
    planType: string | null;
    status: CodexAccountStatus;
    lastError: string | null;
    touchLastUsed: boolean;
  }>,
) {
  const db = await getDatabase();
  const assignments: string[] = [];
  const values: unknown[] = [];
  const add = (column: string, value: unknown) => {
    assignments.push(`${column} = $${assignments.length + 1}`);
    values.push(value);
  };

  if ("label" in fields) add("label", fields.label);
  if ("email" in fields) add("email", fields.email);
  if ("planType" in fields) add("plan_type", fields.planType);
  if ("status" in fields) add("status", fields.status);
  if ("lastError" in fields) add("last_error", fields.lastError);
  if (fields.touchLastUsed) assignments.push("last_used_at = CURRENT_TIMESTAMP");
  assignments.push("updated_at = CURRENT_TIMESTAMP");
  values.push(accountId);

  await db.execute(
    `UPDATE codex_accounts SET ${assignments.join(", ")}
     WHERE id = $${values.length} AND deleted_at IS NULL`,
    values,
  );
}

export async function renameCodexAccount(accountId: number, label: string) {
  await updateCodexAccount(accountId, { label: label.trim() });
}

export async function setWorkspaceDefaultAccount(
  workspaceId: number,
  accountId: number | null,
) {
  const db = await getDatabase();
  await db.execute(
    "UPDATE workspaces SET default_account_id = $1 WHERE id = $2",
    [accountId, workspaceId],
  );
}

export async function softDeleteCodexAccount(accountId: number) {
  const db = await getDatabase();
  await db.execute(
    "UPDATE workspaces SET default_account_id = NULL WHERE default_account_id = $1",
    [accountId],
  );
  await db.execute(
    `UPDATE codex_accounts
     SET status = 'signed_out', deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [accountId],
  );
}

export async function createChat(input: {
  workspaceId: number;
  accountId: number | null;
  title: string;
  status: string;
  generateTitle?: boolean;
}) {
  const db = await getDatabase();
  const profileKey = input.accountId === null ? null : `account:${input.accountId}`;
  const fallbackTitle = input.title.trim() || "Untitled conversation";
  const title = input.generateTitle ? "Generating title..." : fallbackTitle;
  const result = await db.execute(
    `INSERT INTO chats (
       workspace_id, account_id, title, status, origin, profile_key,
       title_generation_state, title_fallback
     )
     VALUES ($1, $2, $3, $4, 'orchestrator', $5, $6, $7)`,
    [
      input.workspaceId,
      input.accountId,
      title,
      input.status,
      profileKey,
      input.generateTitle ? "pending" : "complete",
      input.generateTitle ? fallbackTitle : null,
    ],
  );

  const chat = await selectOne<ChatRecord>(
    `SELECT id, workspace_id, account_id, title, codex_thread_id, status,
      origin, profile_key, external_thread_id, source_kind, sync_status,
      external_cwd, external_created_at, external_updated_at, last_synced_at,
      title_generation_state, title_fallback, title_manually_edited,
      title_generation_started_at, conversation_revision,
      created_at, updated_at, deleted_at
     FROM chats WHERE id = $1`,
    [result.lastInsertId],
  );

  if (!chat) {
    throw new Error("Chat was not created");
  }

  return chat;
}

export async function createChatWithQueuedPrompt(input: {
  workspaceId: number;
  accountId: number | null;
  title: string;
  status: string;
  generateTitle?: boolean;
  itemId: string;
  clientMessageId: string;
  prompt: string;
  snapshot: QueuedPromptSnapshot;
}) {
  const result = await invoke<{ chatId: number }>(
    "create_chat_with_queued_prompt",
    {
      request: {
        workspaceId: input.workspaceId,
        accountId: input.accountId,
        title: input.title,
        status: input.status,
        generateTitle: input.generateTitle ?? false,
        itemId: input.itemId,
        clientMessageId: input.clientMessageId,
        prompt: input.prompt,
        executionSnapshotJson: serializeQueuedPromptSnapshot(input.snapshot),
        contextFingerprintJson: JSON.stringify(
          input.snapshot.contextFingerprint,
        ),
        conversationRevision:
          input.snapshot.contextFingerprint.conversationRevision,
      },
    },
  );
  const chatId = Number(result.chatId);
  if (!Number.isSafeInteger(chatId) || chatId <= 0) {
    throw new Error("Chat was not created");
  }

  const [chat, itemRecord] = await Promise.all([
    getChatRecord(chatId),
    selectOne<PromptQueueItemRecord>(
      `SELECT ${PROMPT_QUEUE_COLUMNS}
       FROM prompt_queue_items
       WHERE id = $1`,
      [input.itemId],
    ),
  ]);
  const item = itemRecord ? parsePromptQueueItemRecord(itemRecord) : null;
  if (!chat || !item) {
    throw new Error("The queued conversation could not be read.");
  }
  return { chat, item };
}

export async function getChatRecord(chatId: number) {
  return selectOne<ChatRecord>(
    `SELECT id, workspace_id, account_id, title, codex_thread_id, status,
      origin, profile_key, external_thread_id, source_kind, sync_status,
      external_cwd, external_created_at, external_updated_at, last_synced_at,
      collaboration_mode, saved_default_collaboration_mode_json,
      title_generation_state, title_fallback, title_manually_edited,
      title_generation_started_at, conversation_revision,
      created_at, updated_at, deleted_at
     FROM chats
     WHERE id = $1 AND deleted_at IS NULL`,
    [chatId],
  );
}

export async function getNextChatTurnIndex(chatId: number) {
  const row = await selectOne<{ next_turn_index: number }>(
    `SELECT COALESCE(MAX(turn_index), 0) + 1 AS next_turn_index
     FROM (
       SELECT turn_index FROM runs
       WHERE chat_id = $1 AND deleted_at IS NULL
       UNION ALL
       SELECT turn_index FROM tasks
       WHERE chat_id = $1
     )`,
    [chatId],
  );
  return Math.max(1, Number(row?.next_turn_index ?? 1));
}

export async function chatHasPendingPlanReview(chatId: number) {
  const row = await selectOne<{ has_pending_review: number }>(
    `SELECT EXISTS(
       SELECT 1
       FROM runs
       WHERE chat_id = $1
         AND deleted_at IS NULL
         AND plan_review_state = 'available'
     ) AS has_pending_review`,
    [chatId],
  );
  return Number(row?.has_pending_review ?? 0) === 1;
}

export async function listPromptQueueItems(chatId: number) {
  const db = await getDatabase();
  const rows = await db.select<PromptQueueItemRecord[]>(
    `SELECT ${PROMPT_QUEUE_COLUMNS}
     FROM prompt_queue_items
     WHERE chat_id = $1
       AND status NOT IN ('skipped', 'completed')
     ORDER BY position, created_at`,
    [chatId],
  );
  return rows
    .map(parsePromptQueueItemRecord)
    .filter((item): item is PromptQueueItem => item !== null);
}

export async function listRestoredPromptQueueItems() {
  const db = await getDatabase();
  const rows = await db.select<PromptQueueItemRecord[]>(
    `SELECT ${PROMPT_QUEUE_COLUMNS}
     FROM prompt_queue_items
     WHERE status NOT IN ('skipped', 'completed')
     ORDER BY workspace_id, chat_id, position, created_at`,
  );
  return rows
    .map(parsePromptQueueItemRecord)
    .filter((item): item is PromptQueueItem => item !== null);
}

export async function holdRestoredPromptQueueItems() {
  const db = await getDatabase();
  await db.execute(
    `UPDATE prompt_queue_items
     SET auto_send_enabled = 0,
         send_now_priority = NULL,
         status = CASE
           WHEN status = 'scheduled-next' THEN 'queued'
           ELSE status
         END,
         updated_at = CURRENT_TIMESTAMP
     WHERE status NOT IN ('skipped', 'completed')
       AND (
         auto_send_enabled != 0
         OR send_now_priority IS NOT NULL
         OR status = 'scheduled-next'
       )`,
  );
  return listRestoredPromptQueueItems();
}

export async function enqueuePromptQueueItem(input: {
  id: string;
  clientMessageId: string;
  workspaceId: number;
  chatId: number;
  prompt: string;
  snapshot: QueuedPromptSnapshot;
}) {
  const db = await getDatabase();
  const snapshotJson = serializeQueuedPromptSnapshot(input.snapshot);
  const result = await db.execute(
    `INSERT INTO prompt_queue_items (
       id, client_message_id, workspace_id, chat_id, position,
       prompt_text, execution_snapshot_json, context_fingerprint_json,
       conversation_revision, status
     )
     SELECT
       $1, $2, $3, $4,
       COALESCE(MAX(position) + 1, 0),
       $5, $6, $7, $8, 'queued'
     FROM prompt_queue_items
     WHERE chat_id = $4`,
    [
      input.id,
      input.clientMessageId,
      input.workspaceId,
      input.chatId,
      input.prompt,
      snapshotJson,
      JSON.stringify(input.snapshot.contextFingerprint),
      input.snapshot.contextFingerprint.conversationRevision,
    ],
  );
  if (result.rowsAffected !== 1) {
    throw new Error("Prompt was not added to the queue.");
  }
  return readPromptQueueItem(input.id);
}

export async function readPromptQueueItem(itemId: string) {
  const record = await selectOne<PromptQueueItemRecord>(
    `SELECT ${PROMPT_QUEUE_COLUMNS}
     FROM prompt_queue_items
     WHERE id = $1`,
    [itemId],
  );
  if (!record) return null;
  return parsePromptQueueItemRecord(record);
}

export async function updatePromptQueueItemSnapshot(
  itemId: string,
  snapshot: QueuedPromptSnapshot,
) {
  const db = await getDatabase();
  const result = await db.execute(
    `UPDATE prompt_queue_items
     SET prompt_text = $1,
         execution_snapshot_json = $2,
         context_fingerprint_json = $3,
         conversation_revision = $4,
         status = 'queued',
         error = NULL,
         stale_reasons_json = NULL,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $5
       AND status NOT IN ('starting', 'steering', 'active', 'completed', 'skipped')`,
    [
      snapshot.prompt,
      serializeQueuedPromptSnapshot(snapshot),
      JSON.stringify(snapshot.contextFingerprint),
      snapshot.contextFingerprint.conversationRevision,
      itemId,
    ],
  );
  return result.rowsAffected === 1 ? readPromptQueueItem(itemId) : null;
}

export async function updatePromptQueueItemContextFingerprint(
  itemId: string,
  snapshot: QueuedPromptSnapshot,
) {
  const db = await getDatabase();
  const result = await db.execute(
    `UPDATE prompt_queue_items
     SET execution_snapshot_json = $1,
         context_fingerprint_json = $2,
         conversation_revision = $3,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $4
       AND status IN ('queued', 'scheduled-next')`,
    [
      serializeQueuedPromptSnapshot(snapshot),
      JSON.stringify(snapshot.contextFingerprint),
      snapshot.contextFingerprint.conversationRevision,
      itemId,
    ],
  );
  return result.rowsAffected === 1 ? readPromptQueueItem(itemId) : null;
}

export async function reorderPromptQueueItems(
  chatId: number,
  orderedItemIds: string[],
) {
  if (orderedItemIds.length === 0) return true;
  const uniqueIds = [...new Set(orderedItemIds)];
  if (uniqueIds.length !== orderedItemIds.length) return false;

  const db = await getDatabase();
  const cases = uniqueIds
    .map((_, index) => `WHEN $${index + 2} THEN ${index}`)
    .join(" ");
  const placeholders = uniqueIds
    .map((_, index) => `$${index + 2}`)
    .join(", ");
  const counts = await selectOne<{
    total_count: number;
    mutable_count: number;
  }>(
    `SELECT
       COUNT(*) AS total_count,
       SUM(
         CASE
           WHEN status NOT IN ('starting', 'steering', 'active', 'completed', 'skipped')
           THEN 1
           ELSE 0
         END
       ) AS mutable_count
     FROM prompt_queue_items
     WHERE chat_id = $1
       AND id IN (${placeholders})`,
    [chatId, ...uniqueIds],
  );
  if (Number(counts?.total_count ?? 0) !== uniqueIds.length) return false;
  const mutableCount = Number(counts?.mutable_count ?? 0);
  if (mutableCount === 0) return true;
  const result = await db.execute(
    `UPDATE prompt_queue_items
     SET position = CASE id ${cases} ELSE position END,
         updated_at = CURRENT_TIMESTAMP
     WHERE chat_id = $1
       AND id IN (${placeholders})
       AND status NOT IN ('starting', 'steering', 'active', 'completed', 'skipped')`,
    [chatId, ...uniqueIds],
  );
  return result.rowsAffected === mutableCount;
}

export async function prioritizePromptQueueItem(itemId: string) {
  const db = await getDatabase();
  const result = await db.execute(
    `UPDATE prompt_queue_items
     SET send_now_priority = (
           SELECT COALESCE(MAX(existing.send_now_priority), 0) + 1
           FROM prompt_queue_items existing
           WHERE existing.chat_id = prompt_queue_items.chat_id
         ),
         status = 'scheduled-next',
         error = NULL,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1
       AND status IN ('queued', 'failed', 'stale', 'scheduled-next')`,
    [itemId],
  );
  return result.rowsAffected === 1 ? readPromptQueueItem(itemId) : null;
}

export async function claimPromptQueueItem(itemId: string) {
  const db = await getDatabase();
  const result = await db.execute(
    `UPDATE prompt_queue_items
     SET status = 'starting',
         error = NULL,
         stale_reasons_json = NULL,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1
       AND status IN ('queued', 'scheduled-next')`,
    [itemId],
  );
  return result.rowsAffected === 1 ? readPromptQueueItem(itemId) : null;
}

export async function markPromptQueueItemSteering(itemId: string) {
  return transitionPromptQueueItem(itemId, ["queued", "scheduled-next"], {
    status: "steering",
    error: null,
  });
}

export async function reschedulePromptQueueItemAfterSteeringRace(
  itemId: string,
) {
  return transitionPromptQueueItem(itemId, ["steering"], {
    status: "scheduled-next",
    error: null,
  });
}

export async function acceptPromptQueueItem(input: {
  itemId: string;
  runId: number;
  turnId: string;
}) {
  const db = await getDatabase();
  const result = await db.execute(
    `UPDATE prompt_queue_items
     SET status = 'active',
         linked_run_id = $1,
         linked_turn_id = $2,
         error = NULL,
         accepted_at = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $3
       AND status IN ('starting', 'steering')`,
    [input.runId, input.turnId, input.itemId],
  );
  return result.rowsAffected === 1 ? readPromptQueueItem(input.itemId) : null;
}

export async function completePromptQueueItem(itemId: string) {
  return transitionPromptQueueItem(
    itemId,
    ["active", "steering"],
    {
      status: "completed",
      error: null,
      completedAt: true,
    },
  );
}

export async function failPromptQueueItem(
  itemId: string,
  error: string,
) {
  return transitionPromptQueueItem(
    itemId,
    ["queued", "scheduled-next", "starting", "steering", "active", "stale"],
    { status: "failed", error, clearSendNowPriority: true },
  );
}

export async function markPromptQueueItemStale(
  itemId: string,
  reasons: string[],
) {
  const db = await getDatabase();
  const result = await db.execute(
    `UPDATE prompt_queue_items
     SET status = 'stale',
         error = NULL,
         stale_reasons_json = $1,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $2
       AND status IN ('queued', 'scheduled-next', 'failed')`,
    [JSON.stringify(reasons), itemId],
  );
  return result.rowsAffected === 1 ? readPromptQueueItem(itemId) : null;
}

export async function retryPromptQueueItem(
  itemId: string,
  options: { autoSendEnabled?: boolean } = {},
) {
  return transitionPromptQueueItem(
    itemId,
    ["failed", "stale"],
    {
      status: "queued",
      error: null,
      clearStaleReasons: true,
      autoSendEnabled: options.autoSendEnabled ?? true,
    },
  );
}

export async function setPromptQueueItemAutoSend(
  itemId: string,
  enabled: boolean,
) {
  const db = await getDatabase();
  const result = await db.execute(
    `UPDATE prompt_queue_items
     SET auto_send_enabled = $1,
         send_now_priority = CASE
           WHEN $1 = 0 THEN NULL
           ELSE send_now_priority
         END,
         status = CASE
           WHEN $1 = 0 AND status = 'scheduled-next' THEN 'queued'
           ELSE status
         END,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $2
       AND status IN ('queued', 'scheduled-next', 'failed', 'stale')`,
    [enabled ? 1 : 0, itemId],
  );
  return result.rowsAffected === 1 ? readPromptQueueItem(itemId) : null;
}

export async function removePromptQueueItem(itemId: string) {
  const db = await getDatabase();
  const result = await db.execute(
    `DELETE FROM prompt_queue_items
     WHERE id = $1
       AND linked_run_id IS NULL
       AND status NOT IN ('starting', 'steering', 'active')`,
    [itemId],
  );
  return result.rowsAffected === 1;
}

export async function recoverInterruptedPromptQueueItems() {
  const db = await getDatabase();
  const result = await db.execute(
    `UPDATE prompt_queue_items
     SET status = 'failed',
         error = CASE status
           WHEN 'steering' THEN 'The app closed before delivery could be confirmed.'
           WHEN 'active' THEN 'The queued run was interrupted when the app closed.'
           ELSE 'The app closed before Codex accepted this prompt.'
         END,
         send_now_priority = NULL,
         updated_at = CURRENT_TIMESTAMP
     WHERE status IN ('starting', 'steering', 'active')`,
  );
  return result.rowsAffected;
}

export async function advanceChatConversationRevision(
  chatId: number,
  options: { queueOwned: boolean },
) {
  const db = await getDatabase();
  await db.execute(
    `UPDATE chats
     SET conversation_revision = conversation_revision + 1,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [chatId],
  );
  const row = await selectOne<{ conversation_revision: number }>(
    `SELECT conversation_revision FROM chats WHERE id = $1`,
    [chatId],
  );
  const revision = row?.conversation_revision ?? 0;
  if (options.queueOwned) {
    await db.execute(
      `UPDATE prompt_queue_items
       SET conversation_revision = $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE chat_id = $2
         AND status IN ('queued', 'scheduled-next')`,
      [revision, chatId],
    );
  }
  return revision;
}

async function transitionPromptQueueItem(
  itemId: string,
  currentStatuses: PromptQueueStatus[],
  update: {
    status: PromptQueueStatus;
    error: string | null;
    clearStaleReasons?: boolean;
    clearSendNowPriority?: boolean;
    completedAt?: boolean;
    autoSendEnabled?: boolean;
  },
) {
  const db = await getDatabase();
  const result = await db.execute(
    `UPDATE prompt_queue_items
     SET status = $1,
         error = $2,
         stale_reasons_json = CASE WHEN $3 = 1 THEN NULL ELSE stale_reasons_json END,
         completed_at = CASE WHEN $4 = 1 THEN CURRENT_TIMESTAMP ELSE completed_at END,
         send_now_priority = CASE WHEN $5 = 1 THEN NULL ELSE send_now_priority END,
         auto_send_enabled = CASE
           WHEN $6 IS NULL THEN auto_send_enabled
           ELSE $6
         END,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $7
       AND status IN (${currentStatuses
         .map((_, index) => `$${index + 8}`)
         .join(", ")})`,
    [
      update.status,
      update.error,
      update.clearStaleReasons ? 1 : 0,
      update.completedAt ? 1 : 0,
      update.clearSendNowPriority ? 1 : 0,
      update.autoSendEnabled === undefined
        ? null
        : update.autoSendEnabled
          ? 1
          : 0,
      itemId,
      ...currentStatuses,
    ],
  );
  return result.rowsAffected === 1 ? readPromptQueueItem(itemId) : null;
}

export async function recoverInterruptedChatTitleGenerations() {
  const db = await getDatabase();
  await db.execute(
    `UPDATE chats
     SET title = COALESCE(NULLIF(TRIM(title_fallback), ''), title),
         title_generation_state = 'failed',
         title_generation_started_at = NULL
     WHERE origin = 'orchestrator'
       AND deleted_at IS NULL
       AND title_manually_edited = 0
       AND title_generation_state IN ('pending', 'generating')`,
  );
}

export async function recoverAbandonedRuns() {
  const db = await getDatabase();

  const recoveredRuns = await db.execute(
    `UPDATE runs
     SET status = 'interrupted'
     WHERE status IN ('starting', 'connecting', 'running')
       AND completed_at IS NULL`,
  );
  const recoveredTasks = await db.execute(
    `UPDATE tasks
     SET status = 'interrupted'
     WHERE status IN ('starting', 'connecting', 'running')`,
  );
  const recoveredChats = await db.execute(
    `UPDATE chats
     SET status = 'interrupted'
     WHERE origin = 'orchestrator'
       AND deleted_at IS NULL
       AND status IN ('starting', 'connecting', 'running')`,
  );

  return {
    runs: recoveredRuns.rowsAffected,
    tasks: recoveredTasks.rowsAffected,
    chats: recoveredChats.rowsAffected,
  };
}

export async function claimChatTitleGeneration(chatId: number) {
  const db = await getDatabase();
  const result = await db.execute(
    `UPDATE chats
     SET title_generation_state = 'generating',
         title_generation_started_at = CURRENT_TIMESTAMP
     WHERE id = $1
       AND deleted_at IS NULL
       AND origin = 'orchestrator'
       AND title_manually_edited = 0
       AND title_generation_state = 'pending'`,
    [chatId],
  );
  return result.rowsAffected === 1;
}

export async function completeChatTitleGeneration(
  chatId: number,
  title: string,
) {
  const trimmedTitle = title.trim();
  if (!trimmedTitle) return false;

  const db = await getDatabase();
  const result = await db.execute(
    `UPDATE chats
     SET title = $1,
         title_generation_state = 'complete',
         title_generation_started_at = NULL
     WHERE id = $2
       AND deleted_at IS NULL
       AND title_manually_edited = 0
       AND title_generation_state = 'generating'`,
    [trimmedTitle, chatId],
  );
  return result.rowsAffected === 1;
}

export async function failChatTitleGeneration(chatId: number) {
  const db = await getDatabase();
  const result = await db.execute(
    `UPDATE chats
     SET title = COALESCE(NULLIF(TRIM(title_fallback), ''), title),
         title_generation_state = 'failed',
         title_generation_started_at = NULL
     WHERE id = $1
       AND deleted_at IS NULL
       AND title_manually_edited = 0
       AND title_generation_state IN ('pending', 'generating')`,
    [chatId],
  );
  return result.rowsAffected === 1;
}

export async function renameChat(chatId: number, title: string) {
  const trimmedTitle = title.trim();
  if (!trimmedTitle) {
    throw new Error("Chat title cannot be empty");
  }
  const db = await getDatabase();
  await db.execute(
    `UPDATE chats
     SET title = $1,
         title_manually_edited = 1,
         title_generation_state = 'complete',
         title_generation_started_at = NULL,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $2 AND deleted_at IS NULL`,
    [trimmedTitle, chatId],
  );
}

export type ExternalCodexChatInput = {
  workspaceId: number;
  profileKey: "default";
  externalThreadId: string;
  title: string;
  status: string;
  sourceKind: string | null;
  cwd: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export async function upsertExternalCodexChats(chats: ExternalCodexChatInput[]) {
  if (chats.length === 0) {
    return;
  }

  const db = await getDatabase();
  for (const chat of chats) {
    const existing = await selectOne<{
      id: number;
      account_id: number | null;
      profile_key: string | null;
      sync_status: string | null;
      deleted_at: string | null;
      external_created_at: string | null;
      external_updated_at: string | null;
    }>(
      `SELECT id, account_id, profile_key, sync_status, deleted_at,
        external_created_at, external_updated_at
       FROM chats
       WHERE origin = 'codex_external'
         AND external_thread_id = $1
       LIMIT 1`,
      [chat.externalThreadId],
    );

    const title = chat.title.trim() || "Untitled Codex chat";
    const createdAt =
      chat.createdAt ?? existing?.external_created_at ?? new Date().toISOString();
    const updatedAt =
      chat.updatedAt ?? existing?.external_updated_at ?? createdAt;
    if (existing) {
      const adopted =
        existing.sync_status === "adopted" ||
        existing.account_id !== null ||
        existing.profile_key !== chat.profileKey;
      if (adopted) {
        continue;
      }
      await db.execute(
        `UPDATE chats
         SET workspace_id = $1,
             title = $2,
             codex_thread_id = $3,
             status = $4,
             source_kind = $5,
             sync_status = 'synced',
             external_cwd = $6,
             external_created_at = $7,
             external_updated_at = $8,
             updated_at = $8,
             conversation_revision = conversation_revision + CASE
               WHEN COALESCE(external_updated_at, '') <> COALESCE($8, '')
               THEN 1
               ELSE 0
             END,
             last_synced_at = CURRENT_TIMESTAMP
         WHERE id = $9`,
        [
          chat.workspaceId,
          title,
          chat.externalThreadId,
          chat.status,
          chat.sourceKind,
          chat.cwd,
          createdAt,
          updatedAt,
          existing.id,
        ],
      );
      if (
        chat.updatedAt !== null &&
        chat.updatedAt !== existing.external_updated_at
      ) {
        await db.execute(
          `DELETE FROM external_chat_history_indexes
           WHERE chat_id = $1 AND source_version <> $2`,
          [existing.id, updatedAt],
        );
      }
      continue;
    }

    await db.execute(
      `INSERT INTO chats (
         workspace_id, account_id, title, codex_thread_id, status, origin,
         profile_key, external_thread_id, source_kind, sync_status,
         external_cwd, external_created_at, external_updated_at,
         created_at, updated_at, last_synced_at
       )
       VALUES ($1, NULL, $2, $3, $4, 'codex_external',
         $5, $3, $6, 'synced',
         $7, $8, $9,
         $8, $9, CURRENT_TIMESTAMP)`,
      [
        chat.workspaceId,
        title,
        chat.externalThreadId,
        chat.status,
        chat.profileKey,
        chat.sourceKind,
        chat.cwd,
        createdAt,
        updatedAt,
      ],
    );
  }
}

export async function updateChat(
  chatId: number,
  fields: Partial<{
    title: string;
    codexThreadId: string | null;
    status: string;
    collaborationMode: "plan" | "default" | null;
    savedDefaultCollaborationModeJson: string | null;
  }>,
) {
  const db = await getDatabase();
  const assignments: string[] = [];
  const values: unknown[] = [];
  const add = (column: string, value: unknown) => {
    assignments.push(`${column} = $${assignments.length + 1}`);
    values.push(value);
  };

  if ("title" in fields) add("title", fields.title);
  if ("codexThreadId" in fields) add("codex_thread_id", fields.codexThreadId);
  if ("status" in fields) add("status", fields.status);
  if ("collaborationMode" in fields) add("collaboration_mode", fields.collaborationMode);
  if ("savedDefaultCollaborationModeJson" in fields) {
    add("saved_default_collaboration_mode_json", fields.savedDefaultCollaborationModeJson);
  }
  assignments.push("updated_at = CURRENT_TIMESTAMP");

  values.push(chatId);
  await db.execute(
    `UPDATE chats SET ${assignments.join(", ")}
     WHERE id = $${values.length} AND deleted_at IS NULL`,
    values,
  );
}

export async function activateChatAccountHandoff(input: {
  chatId: number;
  expectedProfileKey: string | null;
  expectedThreadId: string | null;
  accountId: number;
  profileKey: string;
  codexThreadId: string;
  status: string;
}) {
  const db = await getDatabase();
  const result = await db.execute(
    `UPDATE chats
     SET account_id = $1,
         profile_key = $2,
         codex_thread_id = $3,
         status = $4,
         sync_status = CASE
           WHEN origin = 'codex_external' THEN 'adopted'
           ELSE sync_status
         END,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $5
       AND profile_key IS $6
       AND codex_thread_id IS $7
       AND deleted_at IS NULL`,
    [
      input.accountId,
      input.profileKey,
      input.codexThreadId,
      input.status,
      input.chatId,
      input.expectedProfileKey,
      input.expectedThreadId,
    ],
  );
  return result.rowsAffected === 1;
}

export async function createTask(input: {
  workspaceId: number;
  chatId?: number | null;
  turnIndex?: number | null;
  originalPrompt: string;
  improvedPrompt: string;
  routeRecommendation: string;
  budgetTokens: number;
}) {
  const db = await getDatabase();
  const result = await db.execute(
    `INSERT INTO tasks (
      workspace_id, chat_id, turn_index, original_prompt, improved_prompt,
      route_recommendation, budget_tokens, status
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'created')`,
    [
      input.workspaceId,
      input.chatId ?? null,
      input.turnIndex ?? null,
      input.originalPrompt,
      input.improvedPrompt,
      input.routeRecommendation,
      input.budgetTokens,
    ],
  );

  const task = await selectOne<TaskRecord>(
    `SELECT id, workspace_id, chat_id, turn_index,
      original_prompt, improved_prompt, route_recommendation,
      budget_tokens, status, created_at
     FROM tasks WHERE id = $1`,
    [result.lastInsertId],
  );

  if (!task) {
    throw new Error("Task was not created");
  }

  return task;
}

export async function updateTaskStatus(taskId: number, status: string) {
  const db = await getDatabase();
  await db.execute("UPDATE tasks SET status = $1 WHERE id = $2", [status, taskId]);
}

export async function savePreflightReport(
  workspaceId: number,
  taskId: number | null,
  report: PreflightReport,
) {
  const db = await getDatabase();

  if (taskId !== null) {
    await db.execute("DELETE FROM preflight_results WHERE task_id = $1", [taskId]);
    await db.execute("DELETE FROM recommendations WHERE task_id = $1", [taskId]);
  }

  for (const check of report.checks) {
    await db.execute(
      `INSERT INTO preflight_results (
        task_id, workspace_id, check_id, label, status, message, detail
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        taskId,
        workspaceId,
        check.id,
        check.label,
        check.status,
        check.message,
        check.detail,
      ],
    );
  }

  for (const recommendation of report.recommendations) {
    await db.execute(
      `INSERT INTO recommendations (task_id, workspace_id, kind, title, body)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        taskId,
        workspaceId,
        recommendation.kind,
        recommendation.title,
        recommendation.body,
      ],
    );
  }
}

export async function createRun(input: {
  taskId: number;
  workspaceId: number;
  chatId?: number | null;
  turnIndex?: number | null;
  accountId: number | null;
  accountLabel: string;
  accountEmail?: string | null;
  status: string;
  sandbox: string;
  approvalPolicy: string;
  model?: string | null;
  modelProvider?: string | null;
  collaborationMode?: "plan" | "default" | null;
  runIntent?: "normal" | "plan" | "plan-revision" | "plan-implementation";
  clientUserMessageId?: string | null;
  executionSettingsJson?: string | null;
}) {
  const db = await getDatabase();
  const result = await db.execute(
    `INSERT INTO runs (
      task_id, workspace_id, chat_id, turn_index,
      account_id, account_label, account_email,
      status, sandbox, approval_policy, model, model_provider,
      collaboration_mode, run_intent, client_user_message_id,
      execution_settings_json
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
    )`,
    [
      input.taskId,
      input.workspaceId,
      input.chatId ?? null,
      input.turnIndex ?? null,
      input.accountId,
      input.accountLabel,
      input.accountEmail ?? null,
      input.status,
      input.sandbox,
      input.approvalPolicy,
      input.model ?? null,
      input.modelProvider ?? null,
      input.collaborationMode ?? null,
      input.runIntent ?? "normal",
      input.clientUserMessageId ?? null,
      input.executionSettingsJson ?? null,
    ],
  );

  const run = await selectOne<RunRecord>(
    `SELECT id, task_id, workspace_id, chat_id, turn_index,
      account_id, account_label, account_email,
      codex_thread_id, codex_turn_id, model, model_provider,
      sandbox, approval_policy, status, started_at, completed_at, duration_ms,
      final_message, error, collaboration_mode, run_intent,
      client_user_message_id, completed_plan_item_id, completed_plan_text,
      plan_review_state, execution_settings_json, web_preview_json
     FROM runs WHERE id = $1`,
    [result.lastInsertId],
  );

  if (!run) {
    throw new Error("Run was not created");
  }

  return run;
}

export async function updateRun(
  runId: number,
  fields: Partial<{
    codexThreadId: string | null;
    codexTurnId: string | null;
    model: string | null;
    modelProvider: string | null;
    status: string;
    completedAt: string | null;
    durationMs: number | null;
    finalMessage: string | null;
    error: string | null;
    collaborationMode: "plan" | "default" | null;
    runIntent: "normal" | "plan" | "plan-revision" | "plan-implementation";
    completedPlanItemId: string | null;
    completedPlanText: string | null;
    planReviewState: "none" | "available" | "superseded" | "approved" | "cancelled";
    webPreviewJson: string | null;
  }>,
) {
  const db = await getDatabase();
  const assignments: string[] = [];
  const values: unknown[] = [];

  const add = (column: string, value: unknown) => {
    assignments.push(`${column} = $${assignments.length + 1}`);
    values.push(value);
  };

  if ("codexThreadId" in fields) add("codex_thread_id", fields.codexThreadId);
  if ("codexTurnId" in fields) add("codex_turn_id", fields.codexTurnId);
  if ("model" in fields) add("model", fields.model);
  if ("modelProvider" in fields) add("model_provider", fields.modelProvider);
  if ("status" in fields) add("status", fields.status);
  if ("completedAt" in fields) add("completed_at", fields.completedAt);
  if ("durationMs" in fields) add("duration_ms", fields.durationMs);
  if ("finalMessage" in fields) add("final_message", fields.finalMessage);
  if ("error" in fields) add("error", fields.error);
  if ("collaborationMode" in fields) add("collaboration_mode", fields.collaborationMode);
  if ("runIntent" in fields) add("run_intent", fields.runIntent);
  if ("completedPlanItemId" in fields) {
    add("completed_plan_item_id", fields.completedPlanItemId);
  }
  if ("completedPlanText" in fields) add("completed_plan_text", fields.completedPlanText);
  if ("planReviewState" in fields) add("plan_review_state", fields.planReviewState);
  if ("webPreviewJson" in fields) add("web_preview_json", fields.webPreviewJson);

  if (assignments.length === 0) {
    return;
  }

  values.push(runId);
  await db.execute(
    `UPDATE runs SET ${assignments.join(", ")} WHERE id = $${values.length}`,
    values,
  );
}

export async function softDeleteRun(runId: number) {
  const db = await getDatabase();
  await db.execute(
    "UPDATE runs SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1",
    [runId],
  );
}

export type RunEventInput = {
  runId: number;
  sequence: number;
  eventType: "notification" | "server-request" | "process" | "client-action";
  method: string | null;
  payload: unknown;
};

const RUN_EVENT_INSERT_BATCH_SIZE = 100;

export async function appendRunEvents(inputs: RunEventInput[]) {
  if (inputs.length === 0) return;

  const db = await getDatabase();
  for (let start = 0; start < inputs.length; start += RUN_EVENT_INSERT_BATCH_SIZE) {
    const batch = inputs.slice(start, start + RUN_EVENT_INSERT_BATCH_SIZE);
    const values: unknown[] = [];
    const placeholders = batch.map((input) => {
      const offset = values.length;
      values.push(
        input.runId,
        input.sequence,
        input.eventType,
        input.method,
        JSON.stringify(input.payload),
      );
      return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5})`;
    });

    await db.execute(
      `INSERT INTO run_events (run_id, sequence, event_type, method, payload_json)
       VALUES ${placeholders.join(", ")}`,
      values,
    );
  }
}

export async function appendRunEvent(input: RunEventInput) {
  await appendRunEvents([input]);
}

export async function recordTokenUsage(input: {
  runId: number;
  threadId: string | null;
  turnId: string | null;
  totalTokens: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningOutputTokens: number;
  turnTokens: number | null;
  turnCachedInputTokens: number | null;
  contextTokens: number | null;
  modelContextWindow: number | null;
}) {
  const db = await getDatabase();
  await db.execute(
    `INSERT INTO token_usage_snapshots (
      run_id, thread_id, turn_id, total_tokens, input_tokens, cached_input_tokens,
      output_tokens, reasoning_output_tokens, run_tokens, run_cached_input_tokens,
      context_tokens, model_context_window
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [
      input.runId,
      input.threadId,
      input.turnId,
      input.totalTokens,
      input.inputTokens,
      input.cachedInputTokens,
      input.outputTokens,
      input.reasoningOutputTokens,
      input.turnTokens,
      input.turnCachedInputTokens,
      input.contextTokens,
      input.modelContextWindow,
    ],
  );
}

export async function listWorkspaceRuns(workspaceId: number) {
  const db = await getDatabase();
  return db.select<RunListItem[]>(
    `SELECT runs.id, runs.task_id, runs.workspace_id, runs.chat_id, runs.turn_index,
      runs.codex_thread_id, runs.codex_turn_id,
      runs.account_id, runs.account_label, runs.account_email, runs.model, runs.model_provider,
      runs.sandbox, runs.approval_policy, runs.status,
      runs.started_at, runs.completed_at, runs.duration_ms, runs.final_message, runs.error,
      runs.collaboration_mode, runs.run_intent, runs.client_user_message_id,
      runs.completed_plan_item_id, runs.completed_plan_text, runs.plan_review_state,
      runs.execution_settings_json, runs.web_preview_json,
      tasks.original_prompt, tasks.improved_prompt, tasks.route_recommendation, tasks.budget_tokens,
      latest_tokens.total_tokens AS latest_total_tokens,
      latest_tokens.cached_input_tokens AS latest_cached_input_tokens,
      latest_tokens.run_tokens AS latest_run_tokens,
      latest_tokens.run_cached_input_tokens AS latest_run_cached_input_tokens,
      latest_tokens.context_tokens AS latest_context_tokens,
      latest_tokens.model_context_window AS latest_model_context_window
     FROM runs
     JOIN tasks ON tasks.id = runs.task_id
     LEFT JOIN (
       SELECT run_id, MAX(id) AS max_id
       FROM token_usage_snapshots
       GROUP BY run_id
     ) latest ON latest.run_id = runs.id
     LEFT JOIN token_usage_snapshots latest_tokens ON latest_tokens.id = latest.max_id
     WHERE runs.workspace_id = $1
       AND runs.deleted_at IS NULL
     ORDER BY runs.started_at DESC
     LIMIT 50`,
    [workspaceId],
  );
}

export async function listWorkspaceChats(workspaceId: number) {
  const db = await getDatabase();
  return db.select<ChatListItem[]>(
    `SELECT chats.id, chats.workspace_id, chats.account_id, chats.title,
      chats.codex_thread_id, chats.status, chats.created_at, chats.updated_at,
      chats.deleted_at, chats.origin, chats.profile_key, chats.external_thread_id,
      chats.source_kind, chats.sync_status, chats.external_cwd,
      chats.external_created_at, chats.external_updated_at, chats.last_synced_at,
      chats.collaboration_mode, chats.saved_default_collaboration_mode_json,
      chats.title_generation_state, chats.title_fallback,
      chats.title_manually_edited, chats.title_generation_started_at,
      chats.conversation_revision,
      latest_run.account_label,
      latest_run.account_email,
      MAX(
        COALESCE(
          MAX(
            CASE
              WHEN runs.id IS NULL THEN NULL
              ELSE strftime(
                '%Y-%m-%dT%H:%M:%fZ',
                COALESCE(runs.completed_at, runs.started_at)
              )
            END
          ),
          chats.updated_at
        ),
        COALESCE(chats.external_updated_at, chats.updated_at)
      ) AS latest_activity_at,
      CASE
        WHEN chats.origin = 'codex_external'
          THEN COALESCE(MAX(external_snapshot.turn_count), 0) + COUNT(runs.id)
        ELSE COUNT(runs.id)
      END AS turn_count,
      COALESCE(SUM(latest_tokens.run_tokens), 0) AS total_tokens,
      COALESCE(SUM(runs.duration_ms), 0) AS duration_ms,
      latest_run.model AS latest_model
     FROM chats
     LEFT JOIN runs ON runs.chat_id = chats.id AND runs.deleted_at IS NULL
     LEFT JOIN external_chat_transcript_snapshots external_snapshot
       ON external_snapshot.chat_id = chats.id
     LEFT JOIN (
       SELECT run_id, MAX(id) AS max_id
       FROM token_usage_snapshots
       GROUP BY run_id
     ) latest ON latest.run_id = runs.id
     LEFT JOIN token_usage_snapshots latest_tokens ON latest_tokens.id = latest.max_id
     LEFT JOIN runs latest_run ON latest_run.id = (
       SELECT inner_runs.id
       FROM runs inner_runs
       WHERE inner_runs.chat_id = chats.id
         AND inner_runs.deleted_at IS NULL
       ORDER BY COALESCE(inner_runs.turn_index, inner_runs.id) DESC,
         inner_runs.started_at DESC
       LIMIT 1
     )
     WHERE chats.workspace_id = $1
       AND chats.deleted_at IS NULL
     GROUP BY chats.id
     ORDER BY julianday(latest_activity_at) DESC, chats.id DESC
     LIMIT 50`,
    [workspaceId],
  );
}

export async function getChatWithRuns(chatId: number): Promise<ChatWithRuns> {
  const chat = await selectOne<ChatListItem>(
    `SELECT chats.id, chats.workspace_id, chats.account_id, chats.title,
      chats.codex_thread_id, chats.status, chats.created_at, chats.updated_at,
      chats.deleted_at, chats.origin, chats.profile_key, chats.external_thread_id,
      chats.source_kind, chats.sync_status, chats.external_cwd,
      chats.external_created_at, chats.external_updated_at, chats.last_synced_at,
      chats.collaboration_mode, chats.saved_default_collaboration_mode_json,
      chats.title_generation_state, chats.title_fallback,
      chats.title_manually_edited, chats.title_generation_started_at,
      chats.conversation_revision,
      latest_run.account_label,
      latest_run.account_email,
      MAX(
        COALESCE(
          MAX(
            CASE
              WHEN runs.id IS NULL THEN NULL
              ELSE strftime(
                '%Y-%m-%dT%H:%M:%fZ',
                COALESCE(runs.completed_at, runs.started_at)
              )
            END
          ),
          chats.updated_at
        ),
        COALESCE(chats.external_updated_at, chats.updated_at)
      ) AS latest_activity_at,
      CASE
        WHEN chats.origin = 'codex_external'
          THEN COALESCE(MAX(external_snapshot.turn_count), 0) + COUNT(runs.id)
        ELSE COUNT(runs.id)
      END AS turn_count,
      COALESCE(SUM(latest_tokens.run_tokens), 0) AS total_tokens,
      COALESCE(SUM(runs.duration_ms), 0) AS duration_ms,
      latest_run.model AS latest_model
     FROM chats
     LEFT JOIN runs ON runs.chat_id = chats.id AND runs.deleted_at IS NULL
     LEFT JOIN external_chat_transcript_snapshots external_snapshot
       ON external_snapshot.chat_id = chats.id
     LEFT JOIN (
       SELECT run_id, MAX(id) AS max_id
       FROM token_usage_snapshots
       GROUP BY run_id
     ) latest ON latest.run_id = runs.id
     LEFT JOIN token_usage_snapshots latest_tokens ON latest_tokens.id = latest.max_id
     LEFT JOIN runs latest_run ON latest_run.id = (
       SELECT inner_runs.id
       FROM runs inner_runs
       WHERE inner_runs.chat_id = chats.id
         AND inner_runs.deleted_at IS NULL
       ORDER BY COALESCE(inner_runs.turn_index, inner_runs.id) DESC,
         inner_runs.started_at DESC
       LIMIT 1
     )
     WHERE chats.id = $1
       AND chats.deleted_at IS NULL
     GROUP BY chats.id`,
    [chatId],
  );

  if (!chat) {
    throw new Error("Chat was not found");
  }

  const db = await getDatabase();
  const runs = await db.select<RunListItem[]>(
    `SELECT runs.id, runs.task_id, runs.workspace_id, runs.chat_id, runs.turn_index,
      runs.codex_thread_id, runs.codex_turn_id,
      runs.account_id, runs.account_label, runs.account_email, runs.model, runs.model_provider,
      runs.sandbox, runs.approval_policy, runs.status,
      runs.started_at, runs.completed_at, runs.duration_ms, runs.final_message, runs.error,
      runs.collaboration_mode, runs.run_intent, runs.client_user_message_id,
      runs.completed_plan_item_id, runs.completed_plan_text, runs.plan_review_state,
      runs.execution_settings_json, runs.web_preview_json,
      tasks.original_prompt, tasks.improved_prompt, tasks.route_recommendation, tasks.budget_tokens,
      latest_tokens.total_tokens AS latest_total_tokens,
      latest_tokens.cached_input_tokens AS latest_cached_input_tokens,
      latest_tokens.run_tokens AS latest_run_tokens,
      latest_tokens.run_cached_input_tokens AS latest_run_cached_input_tokens,
      latest_tokens.context_tokens AS latest_context_tokens,
      latest_tokens.model_context_window AS latest_model_context_window
     FROM runs
     JOIN tasks ON tasks.id = runs.task_id
     LEFT JOIN (
       SELECT run_id, MAX(id) AS max_id
       FROM token_usage_snapshots
       GROUP BY run_id
     ) latest ON latest.run_id = runs.id
     LEFT JOIN token_usage_snapshots latest_tokens ON latest_tokens.id = latest.max_id
     WHERE runs.chat_id = $1
       AND runs.deleted_at IS NULL
     ORDER BY COALESCE(runs.turn_index, runs.id), runs.started_at`,
    [chatId],
  );

  return { chat, runs };
}

export async function listChatRunsPage(
  chatId: number,
  offset: number,
  limit: number,
) {
  const db = await getDatabase();
  return db.select<HistoryRunSummary[]>(
    `SELECT runs.id, runs.task_id, runs.workspace_id, runs.chat_id, runs.turn_index,
      runs.codex_thread_id, runs.codex_turn_id,
      runs.account_id, runs.model, runs.model_provider,
      runs.sandbox, runs.approval_policy, runs.status,
      runs.started_at, runs.completed_at, runs.duration_ms, runs.final_message, runs.error,
      runs.collaboration_mode, runs.run_intent, runs.client_user_message_id,
      runs.completed_plan_item_id, runs.completed_plan_text, runs.plan_review_state,
      runs.execution_settings_json, runs.web_preview_json,
      tasks.original_prompt,
      (
        SELECT json_extract(diff_events.payload_json, '$.params.diff')
        FROM run_events diff_events
        WHERE diff_events.run_id = runs.id
          AND diff_events.method = 'turn/diff/updated'
        ORDER BY diff_events.sequence DESC
        LIMIT 1
      ) AS latest_diff,
      latest_tokens.total_tokens AS latest_total_tokens,
      latest_tokens.cached_input_tokens AS latest_cached_input_tokens,
      latest_tokens.run_tokens AS latest_run_tokens,
      latest_tokens.run_cached_input_tokens AS latest_run_cached_input_tokens,
      latest_tokens.context_tokens AS latest_context_tokens,
      latest_tokens.model_context_window AS latest_model_context_window
     FROM runs
     JOIN tasks ON tasks.id = runs.task_id
     LEFT JOIN (
       SELECT run_id, MAX(id) AS max_id
       FROM token_usage_snapshots
       GROUP BY run_id
     ) latest ON latest.run_id = runs.id
     LEFT JOIN token_usage_snapshots latest_tokens ON latest_tokens.id = latest.max_id
     WHERE runs.chat_id = $1
       AND runs.deleted_at IS NULL
     ORDER BY COALESCE(runs.turn_index, runs.id), runs.started_at
     LIMIT $2 OFFSET $3`,
    [chatId, limit, offset],
  );
}

export async function listLocalChatTranscript(chatId: number) {
  const db = await getDatabase();
  return db.select<HistoryRunSummary[]>(
    `SELECT runs.id, runs.task_id, runs.workspace_id, runs.chat_id, runs.turn_index,
      runs.codex_thread_id, runs.codex_turn_id,
      runs.account_id, runs.model, runs.model_provider,
      runs.sandbox, runs.approval_policy, runs.status,
      runs.started_at, runs.completed_at, runs.duration_ms, runs.final_message, runs.error,
      runs.collaboration_mode, runs.run_intent, runs.client_user_message_id,
      runs.completed_plan_item_id, runs.completed_plan_text, runs.plan_review_state,
      runs.execution_settings_json, runs.web_preview_json,
      tasks.original_prompt,
      (
        SELECT json_extract(diff_events.payload_json, '$.params.diff')
        FROM run_events diff_events
        WHERE diff_events.run_id = runs.id
          AND diff_events.method = 'turn/diff/updated'
        ORDER BY diff_events.sequence DESC
        LIMIT 1
      ) AS latest_diff,
      latest_tokens.total_tokens AS latest_total_tokens,
      latest_tokens.cached_input_tokens AS latest_cached_input_tokens,
      latest_tokens.run_tokens AS latest_run_tokens,
      latest_tokens.run_cached_input_tokens AS latest_run_cached_input_tokens,
      latest_tokens.context_tokens AS latest_context_tokens,
      latest_tokens.model_context_window AS latest_model_context_window
     FROM runs
     JOIN tasks ON tasks.id = runs.task_id
     LEFT JOIN (
       SELECT run_id, MAX(id) AS max_id
       FROM token_usage_snapshots
       GROUP BY run_id
     ) latest ON latest.run_id = runs.id
     LEFT JOIN token_usage_snapshots latest_tokens ON latest_tokens.id = latest.max_id
     WHERE runs.chat_id = $1
       AND runs.deleted_at IS NULL
     ORDER BY COALESCE(runs.turn_index, runs.id), runs.started_at`,
    [chatId],
  );
}

type LocalHistoryTurnIndexRow = {
  turn_id: string | null;
  prompt_characters: number;
  response_characters: number;
  prompt_lines: number;
  response_lines: number;
};

type ExternalHistoryIndexRow = {
  chat_id: number;
  thread_id: string;
  source_version: string;
  page_size: number;
  total_turns: number;
  pages_json: string;
  hints_json: string;
};

type ExternalTranscriptSnapshotRow = {
  chat_id: number;
  thread_id: string;
  source_version: string;
  turn_count: number;
  synced_at: string;
};

type ExternalTranscriptTurnRow = {
  slot_index: number;
  external_turn_id: string | null;
  prompt: string;
  final_message: string;
  error: string | null;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  duration_ms: number | null;
  total_tokens: number | null;
  model_context_window: number | null;
};

export type CachedExternalTranscriptSnapshot = ExternalTranscriptSnapshot & {
  chatId: number;
  syncedAt: string;
};

export async function readExternalTranscriptSnapshot(
  chatId: number,
  sourceVersion?: string,
): Promise<CachedExternalTranscriptSnapshot | null> {
  const versionFilter = sourceVersion ? "AND snapshots.source_version = $2" : "";
  const snapshot = await selectOne<ExternalTranscriptSnapshotRow>(
    `SELECT snapshots.chat_id,
      COALESCE(chats.external_thread_id, chats.codex_thread_id, '') AS thread_id,
      snapshots.source_version, snapshots.turn_count, snapshots.synced_at
     FROM external_chat_transcript_snapshots snapshots
     JOIN chats ON chats.id = snapshots.chat_id
     WHERE snapshots.chat_id = $1 ${versionFilter}`,
    sourceVersion ? [chatId, sourceVersion] : [chatId],
  );
  if (!snapshot || !snapshot.thread_id) {
    return null;
  }

  const db = await getDatabase();
  const rows = await db.select<ExternalTranscriptTurnRow[]>(
    `SELECT slot_index, external_turn_id, prompt, final_message, error, status,
      started_at, completed_at, duration_ms, total_tokens, model_context_window
     FROM external_chat_turn_summaries
     WHERE chat_id = $1 AND source_version = $2
     ORDER BY slot_index`,
    [chatId, snapshot.source_version],
  );
  if (rows.length !== Number(snapshot.turn_count)) {
    return null;
  }

  return {
    requestId: "cached",
    chatId: snapshot.chat_id,
    threadId: snapshot.thread_id,
    sourceVersion: snapshot.source_version,
    totalTurns: rows.length,
    syncedAt: snapshot.synced_at,
    turns: rows.map((row) => ({
      slotIndex: Number(row.slot_index),
      turnId: row.external_turn_id,
      prompt: row.prompt,
      finalMessage: row.final_message,
      error: row.error,
      status: row.status,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      durationMs: row.duration_ms === null ? null : Number(row.duration_ms),
      totalTokens: row.total_tokens === null ? null : Number(row.total_tokens),
      modelContextWindow:
        row.model_context_window === null ? null : Number(row.model_context_window),
    })),
  };
}

export async function activateExternalTranscriptSnapshot(
  chatId: number,
  snapshot: ExternalTranscriptSnapshot,
) {
  if (snapshot.turns.length !== snapshot.totalTurns) {
    throw new Error("External transcript snapshot is incomplete");
  }

  const db = await getDatabase();
  const active = await selectOne<{ source_version: string }>(
    `SELECT source_version
     FROM external_chat_transcript_snapshots
     WHERE chat_id = $1`,
    [chatId],
  );
  if (active?.source_version === snapshot.sourceVersion) {
    return;
  }

  await db.execute(
    `DELETE FROM external_chat_turn_summaries
     WHERE chat_id = $1 AND source_version = $2`,
    [chatId, snapshot.sourceVersion],
  );

  const batchSize = 40;
  for (let offset = 0; offset < snapshot.turns.length; offset += batchSize) {
    const batch = snapshot.turns.slice(offset, offset + batchSize);
    const values: unknown[] = [];
    const placeholders = batch.map((turn) => {
      const start = values.length + 1;
      values.push(
        chatId,
        snapshot.sourceVersion,
        turn.slotIndex,
        turn.turnId,
        turn.prompt,
        turn.finalMessage,
        turn.error,
        turn.status,
        turn.startedAt,
        turn.completedAt,
        turn.durationMs,
        turn.totalTokens,
        turn.modelContextWindow,
      );
      return `(${Array.from({ length: 13 }, (_, index) => `$${start + index}`).join(", ")})`;
    });
    await db.execute(
      `INSERT INTO external_chat_turn_summaries (
         chat_id, source_version, slot_index, external_turn_id,
         prompt, final_message, error, status, started_at, completed_at,
         duration_ms, total_tokens, model_context_window
       ) VALUES ${placeholders.join(", ")}`,
      values,
    );
  }

  const count = await selectOne<{ count: number }>(
    `SELECT COUNT(*) AS count
     FROM external_chat_turn_summaries
     WHERE chat_id = $1 AND source_version = $2`,
    [chatId, snapshot.sourceVersion],
  );
  if (Number(count?.count ?? 0) !== snapshot.totalTurns) {
    throw new Error("External transcript snapshot could not be verified");
  }

  await db.execute(
    `INSERT INTO external_chat_transcript_snapshots (
       chat_id, source_version, turn_count, synced_at
     ) VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
     ON CONFLICT(chat_id) DO UPDATE SET
       source_version = excluded.source_version,
       turn_count = excluded.turn_count,
       synced_at = CURRENT_TIMESTAMP`,
    [chatId, snapshot.sourceVersion, snapshot.totalTurns],
  );
  await db.execute(
    `DELETE FROM external_chat_turn_summaries
     WHERE chat_id = $1 AND source_version <> $2`,
    [chatId, snapshot.sourceVersion],
  );
}

export async function deleteExternalTranscriptSnapshots(chatId: number) {
  const db = await getDatabase();
  await db.execute(
    "DELETE FROM external_chat_transcript_snapshots WHERE chat_id = $1",
    [chatId],
  );
  await db.execute(
    "DELETE FROM external_chat_turn_summaries WHERE chat_id = $1",
    [chatId],
  );
}

export async function buildLocalChatHistoryIndex(
  chat: ChatListItem,
  pageSize = 20,
): Promise<HistoryTranscriptIndex> {
  const db = await getDatabase();
  const rows = await db.select<LocalHistoryTurnIndexRow[]>(
    `SELECT runs.codex_turn_id AS turn_id,
      LENGTH(tasks.original_prompt) AS prompt_characters,
      LENGTH(COALESCE(runs.final_message, runs.error, '')) AS response_characters,
      CASE
        WHEN LENGTH(tasks.original_prompt) = 0 THEN 0
        ELSE 1 + LENGTH(tasks.original_prompt)
          - LENGTH(REPLACE(tasks.original_prompt, CHAR(10), ''))
      END AS prompt_lines,
      CASE
        WHEN LENGTH(COALESCE(runs.final_message, runs.error, '')) = 0 THEN 0
        ELSE 1 + LENGTH(COALESCE(runs.final_message, runs.error, ''))
          - LENGTH(REPLACE(COALESCE(runs.final_message, runs.error, ''), CHAR(10), ''))
      END AS response_lines
     FROM runs
     JOIN tasks ON tasks.id = runs.task_id
     WHERE runs.chat_id = $1
       AND runs.deleted_at IS NULL
     ORDER BY COALESCE(runs.turn_index, runs.id), runs.started_at`,
    [chat.id],
  );
  const safePageSize = Math.max(1, Math.floor(pageSize));
  const hints: HistoryTurnHint[] = rows.map((row, slotIndex) => ({
    slotIndex,
    turnId: row.turn_id,
    promptCharacters: Number(row.prompt_characters) || 0,
    responseCharacters: Number(row.response_characters) || 0,
    promptLines: Number(row.prompt_lines) || 0,
    responseLines: Number(row.response_lines) || 0,
  }));
  const pages = buildLocalHistoryPages(chat.id, rows.length, safePageSize);

  return {
    chatId: chat.id,
    threadId: chat.codex_thread_id,
    sourceVersion: chat.updated_at,
    totalTurns: rows.length,
    pageSize: safePageSize,
    pages,
    hints,
  };
}

export async function readExternalChatHistoryIndex(
  chatId: number,
  sourceVersion: string,
): Promise<HistoryTranscriptIndex | null> {
  const row = await selectOne<ExternalHistoryIndexRow>(
    `SELECT chat_id, thread_id, source_version, page_size, total_turns,
      pages_json, hints_json
     FROM external_chat_history_indexes
     WHERE chat_id = $1 AND source_version = $2`,
    [chatId, sourceVersion],
  );
  if (!row) {
    return null;
  }

  try {
    const pages = JSON.parse(row.pages_json) as HistoryPageDescriptor[];
    const hints = JSON.parse(row.hints_json) as HistoryTurnHint[];
    if (!Array.isArray(pages) || !Array.isArray(hints)) {
      return null;
    }
    return {
      chatId: row.chat_id,
      threadId: row.thread_id,
      sourceVersion: row.source_version,
      totalTurns: Number(row.total_turns) || 0,
      pageSize: Number(row.page_size) || 20,
      pages,
      hints,
    };
  } catch {
    return null;
  }
}

export async function saveExternalChatHistoryIndex(
  chatId: number,
  index: ExternalThreadHistoryIndex,
) {
  const db = await getDatabase();
  await db.execute(
    `INSERT INTO external_chat_history_indexes (
       chat_id, thread_id, source_version, page_size, total_turns,
       pages_json, hints_json, indexed_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
     ON CONFLICT(chat_id) DO UPDATE SET
       thread_id = excluded.thread_id,
       source_version = excluded.source_version,
       page_size = excluded.page_size,
       total_turns = excluded.total_turns,
       pages_json = excluded.pages_json,
       hints_json = excluded.hints_json,
       indexed_at = CURRENT_TIMESTAMP`,
    [
      chatId,
      index.threadId,
      index.sourceVersion,
      index.pageSize,
      index.totalTurns,
      JSON.stringify(index.pages),
      JSON.stringify(index.hints),
    ],
  );
}

function buildLocalHistoryPages(
  chatId: number,
  totalTurns: number,
  pageSize: number,
) {
  const pages: HistoryPageDescriptor[] = [];
  for (let startIndex = 0; startIndex < totalTurns; startIndex += pageSize) {
    const pageIndex = pages.length;
    pages.push({
      id: `local:${chatId}:${pageIndex}`,
      pageIndex,
      startIndex,
      turnCount: Math.min(pageSize, totalTurns - startIndex),
      cursor: null,
      localOffset: startIndex,
    });
  }
  return pages;
}

export async function softDeleteChat(chatId: number) {
  const db = await getDatabase();
  await db.execute(
    "DELETE FROM prompt_queue_items WHERE chat_id = $1",
    [chatId],
  );
  await db.execute(
    "DELETE FROM external_chat_history_indexes WHERE chat_id = $1",
    [chatId],
  );
  await db.execute(
    "DELETE FROM external_chat_transcript_snapshots WHERE chat_id = $1",
    [chatId],
  );
  await db.execute(
    "DELETE FROM external_chat_turn_summaries WHERE chat_id = $1",
    [chatId],
  );
  await db.execute(
    "UPDATE chats SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1",
    [chatId],
  );
  await db.execute(
    "UPDATE runs SET deleted_at = CURRENT_TIMESTAMP WHERE chat_id = $1",
    [chatId],
  );
}

export async function getAnalyticsSummary(workspaceId: number) {
  const summary = await selectOne<AnalyticsSummary>(
    `SELECT
      COUNT(runs.id) AS run_count,
      SUM(CASE WHEN runs.status = 'completed' THEN 1 ELSE 0 END) AS completed_count,
      SUM(CASE WHEN runs.status = 'failed' THEN 1 ELSE 0 END) AS failed_count,
      COALESCE(SUM(latest_tokens.run_tokens), 0) AS total_tokens,
      COALESCE(SUM(latest_tokens.run_cached_input_tokens), 0) AS cached_tokens,
      AVG(runs.duration_ms) AS avg_duration_ms
     FROM runs
     LEFT JOIN (
       SELECT run_id, MAX(id) AS max_id
       FROM token_usage_snapshots
       GROUP BY run_id
     ) latest ON latest.run_id = runs.id
     LEFT JOIN token_usage_snapshots latest_tokens ON latest_tokens.id = latest.max_id
     WHERE runs.workspace_id = $1
       AND runs.deleted_at IS NULL`,
    [workspaceId],
  );

  return (
    summary ?? {
      run_count: 0,
      completed_count: 0,
      failed_count: 0,
      total_tokens: 0,
      cached_tokens: 0,
      avg_duration_ms: null,
    }
  );
}
