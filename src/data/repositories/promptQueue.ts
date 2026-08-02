import { commands } from "../../generated/tauri";
import type { PromptQueueItem, PromptQueueItemRecord, PromptQueueStatus, QueuedPromptSnapshot } from "../../features/queue/types";
import { parsePromptQueueItemRecord, serializeQueuedPromptSnapshot } from "../../lib/promptQueue";
import type { ChatRepository } from "./chats";
import { FrontendDatabase } from "../database";

const PROMPT_QUEUE_COLUMNS = `
  id, client_message_id, workspace_id, chat_id, position,
  send_now_priority, auto_send_enabled, prompt_text, execution_snapshot_json,
  context_fingerprint_json, conversation_revision, status,
  linked_run_id, linked_turn_id, error, stale_reasons_json,
  created_at, updated_at, accepted_at, completed_at
`;

export function createPromptQueueRepository(database: FrontendDatabase, chatRepository: Pick<ChatRepository, "getChatRecord">) {
  const getDatabase = () => database.get();
  const selectOne = <T>(query: string, bindValues: unknown[] = []) =>
    database.selectOne<T>(query, bindValues);
  const { getChatRecord } = chatRepository;

  async function createChatWithQueuedPrompt(input: {
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
    const result = await commands.createChatWithQueuedPrompt({
      workspaceId: input.workspaceId,
      accountId: input.accountId,
      title: input.title,
      status: input.status,
      generateTitle: input.generateTitle ?? false,
      itemId: input.itemId,
      clientMessageId: input.clientMessageId,
      prompt: input.prompt,
      executionSnapshotJson: serializeQueuedPromptSnapshot(input.snapshot),
      contextFingerprintJson: JSON.stringify(input.snapshot.contextFingerprint),
      conversationRevision:
        input.snapshot.contextFingerprint.conversationRevision,
    });
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


  async function listPromptQueueItems(chatId: number) {
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

  async function listRestoredPromptQueueItems() {
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

  async function holdRestoredPromptQueueItems() {
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

  async function enqueuePromptQueueItem(input: {
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

  async function readPromptQueueItem(itemId: string) {
    const record = await selectOne<PromptQueueItemRecord>(
      `SELECT ${PROMPT_QUEUE_COLUMNS}
       FROM prompt_queue_items
       WHERE id = $1`,
      [itemId],
    );
    if (!record) return null;
    return parsePromptQueueItemRecord(record);
  }

  async function updatePromptQueueItemSnapshot(
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

  async function updatePromptQueueItemContextFingerprint(
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

  async function reorderPromptQueueItems(
    chatId: number,
    orderedItemIds: string[],
  ) {
    return commands.reorderPromptQueueItemsTransaction(chatId, orderedItemIds);
  }

  async function prioritizePromptQueueItem(itemId: string) {
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

  async function claimPromptQueueItem(itemId: string) {
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

  async function markPromptQueueItemSteering(itemId: string) {
    return transitionPromptQueueItem(itemId, ["queued", "scheduled-next"], {
      status: "steering",
      error: null,
    });
  }

  async function reschedulePromptQueueItemAfterSteeringRace(
    itemId: string,
  ) {
    return transitionPromptQueueItem(itemId, ["steering"], {
      status: "scheduled-next",
      error: null,
    });
  }

  async function acceptPromptQueueItem(input: {
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

  async function completePromptQueueItem(itemId: string) {
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

  async function failPromptQueueItem(
    itemId: string,
    error: string,
  ) {
    return transitionPromptQueueItem(
      itemId,
      ["queued", "scheduled-next", "starting", "steering", "active", "stale"],
      { status: "failed", error, clearSendNowPriority: true },
    );
  }

  async function markPromptQueueItemStale(
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

  async function retryPromptQueueItem(
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

  async function setPromptQueueItemAutoSend(
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

  async function removePromptQueueItem(itemId: string) {
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

  async function recoverInterruptedPromptQueueItems() {
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

  async function advanceChatConversationRevision(
    chatId: number,
    options: { queueOwned: boolean },
  ) {
    return commands.advanceChatConversationRevisionTransaction(
      chatId,
      options.queueOwned,
    );
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


  return {
    createChatWithQueuedPrompt,
    listPromptQueueItems,
    listRestoredPromptQueueItems,
    holdRestoredPromptQueueItems,
    enqueuePromptQueueItem,
    readPromptQueueItem,
    updatePromptQueueItemSnapshot,
    updatePromptQueueItemContextFingerprint,
    reorderPromptQueueItems,
    prioritizePromptQueueItem,
    claimPromptQueueItem,
    markPromptQueueItemSteering,
    reschedulePromptQueueItemAfterSteeringRace,
    acceptPromptQueueItem,
    completePromptQueueItem,
    failPromptQueueItem,
    markPromptQueueItemStale,
    retryPromptQueueItem,
    setPromptQueueItemAutoSend,
    removePromptQueueItem,
    recoverInterruptedPromptQueueItems,
    advanceChatConversationRevision,
  };
}

export type PromptQueueRepository = ReturnType<typeof createPromptQueueRepository>;
