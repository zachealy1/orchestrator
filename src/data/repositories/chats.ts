import { commands } from "../../generated/tauri";
import type { ChatRecord } from "../../features/conversations/types";
import { FrontendDatabase } from "../database";

export function createChatRepository(database: FrontendDatabase) {
  const getDatabase = () => database.get();
  const selectOne = <T>(query: string, bindValues: unknown[] = []) =>
    database.selectOne<T>(query, bindValues);

  async function createChat(input: {
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
  
  
  async function getChatRecord(chatId: number) {
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
  
  async function getNextChatTurnIndex(chatId: number) {
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
  
  async function chatHasPendingPlanReview(chatId: number) {
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
  
  
  async function recoverInterruptedChatTitleGenerations() {
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
  
  async function recoverAbandonedRuns() {
    return commands.recoverAbandonedRunsTransaction();
  }
  
  async function claimChatTitleGeneration(chatId: number) {
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
  
  async function completeChatTitleGeneration(
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
  
  async function failChatTitleGeneration(chatId: number) {
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
  
  async function renameChat(chatId: number, title: string) {
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
  
  type ExternalCodexChatInput = {
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
  
  async function upsertExternalCodexChats(chats: ExternalCodexChatInput[]) {
    if (chats.length === 0) return;
    await commands.upsertExternalCodexChatsTransaction(chats);
  }
  
  async function updateChat(
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
  
  async function activateChatAccountHandoff(input: {
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
  

  return {
    createChat,
    getChatRecord,
    getNextChatTurnIndex,
    chatHasPendingPlanReview,
    recoverInterruptedChatTitleGenerations,
    recoverAbandonedRuns,
    claimChatTitleGeneration,
    completeChatTitleGeneration,
    failChatTitleGeneration,
    renameChat,
    upsertExternalCodexChats,
    updateChat,
    activateChatAccountHandoff,
  };
}

export type ChatRepository = ReturnType<typeof createChatRepository>;
