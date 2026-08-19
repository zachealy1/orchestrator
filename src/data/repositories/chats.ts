import { commands } from "../../generated/tauri";
import type {
  ChatContinuationSnapshot,
  ChatRecord,
} from "../../features/conversations/types";
import type { KanbanGitBinding } from "../../features/kanban/api";
import { FrontendDatabase } from "../database";

export function createChatRepository(database: FrontendDatabase) {
  const getDatabase = () => database.get();
  const selectOne = <T>(query: string, bindValues: unknown[] = []) =>
    database.selectOne<T>(query, bindValues);
  const parseBindingError = (value: string | null) => {
    if (!value) return null;
    try {
      const parsed = JSON.parse(value) as KanbanGitBinding["error"];
      return parsed &&
        typeof parsed.code === "string" &&
        typeof parsed.message === "string"
        ? parsed
        : null;
    } catch {
      return null;
    }
  };

  async function createChat(input: {
    workspaceId: number;
    accountId: number | null;
    title: string;
    status: string;
    generateTitle?: boolean;
    surface?: "chat" | "kanban";
    continuedFromChatId?: number | null;
    continuationKind?: "chat" | "worktree" | null;
    continuationSnapshot?: ChatContinuationSnapshot | null;
    continuationSettingsJson?: string | null;
    profileKey?: string | null;
  }) {
    const db = await getDatabase();
    const profileKey =
      input.profileKey ??
      (input.accountId === null ? "default" : `account:${input.accountId}`);
    const fallbackTitle = input.title.trim() || "Untitled conversation";
    const title = input.generateTitle ? "Generating title..." : fallbackTitle;
    const result = await db.execute(
      `INSERT INTO chats (
         workspace_id, account_id, title, status, surface, origin, profile_key,
         title_generation_state, title_fallback, continued_from_chat_id,
         continuation_kind, continuation_snapshot_json,
         continuation_settings_json, continuation_turn_count
       )
       VALUES ($1, $2, $3, $4, $5, 'orchestrator', $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        input.workspaceId,
        input.accountId,
        title,
        input.status,
        input.surface ?? "chat",
        profileKey,
        input.generateTitle ? "pending" : "complete",
        input.generateTitle ? fallbackTitle : null,
        input.continuedFromChatId ?? null,
        input.continuationKind ?? null,
        input.continuationSnapshot
          ? JSON.stringify(input.continuationSnapshot)
          : null,
        input.continuationSettingsJson ?? null,
        input.continuationSnapshot?.turns.length ?? 0,
      ],
    );

    const chat = await selectOne<ChatRecord>(
      `SELECT id, workspace_id, account_id, title, codex_thread_id, status, surface,
        origin, profile_key, external_thread_id, source_kind, sync_status,
        external_cwd, external_created_at, external_updated_at, last_synced_at,
        native_thread_updated_at, native_last_synced_at, native_sync_status,
        title_generation_state, title_fallback, title_manually_edited,
        title_generation_started_at, conversation_revision,
        continued_from_chat_id, continuation_kind, continuation_snapshot_json,
        continuation_settings_json, continuation_turn_count,
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
      `SELECT id, workspace_id, account_id, title, codex_thread_id, status, surface,
        origin, profile_key, external_thread_id, source_kind, sync_status,
        external_cwd, external_created_at, external_updated_at, last_synced_at,
        native_thread_updated_at, native_last_synced_at, native_sync_status,
        collaboration_mode, saved_default_collaboration_mode_json,
        title_generation_state, title_fallback, title_manually_edited,
        title_generation_started_at, conversation_revision,
        continued_from_chat_id, continuation_kind, continuation_snapshot_json,
        continuation_settings_json, continuation_turn_count,
        created_at, updated_at, deleted_at
       FROM chats
       WHERE id = $1 AND deleted_at IS NULL`,
      [chatId],
    );
  }

  async function getSharedChatByThreadId(threadId: string) {
    return selectOne<ChatRecord>(
      `SELECT id, workspace_id, account_id, title, codex_thread_id, status, surface,
        origin, profile_key, external_thread_id, source_kind, sync_status,
        external_cwd, external_created_at, external_updated_at, last_synced_at,
        native_thread_updated_at, native_last_synced_at, native_sync_status,
        collaboration_mode, saved_default_collaboration_mode_json,
        title_generation_state, title_fallback, title_manually_edited,
        title_generation_started_at, conversation_revision,
        continued_from_chat_id, continuation_kind, continuation_snapshot_json,
        continuation_settings_json, continuation_turn_count,
        created_at, updated_at, deleted_at
       FROM chats
       WHERE profile_key = 'default'
         AND codex_thread_id = $1
         AND deleted_at IS NULL
       LIMIT 1`,
      [threadId],
    );
  }

  async function getNextChatTurnIndex(chatId: number) {
    const row = await selectOne<{ next_turn_index: number }>(
      `SELECT MAX(
         COALESCE((SELECT continuation_turn_count FROM chats WHERE id = $1), 0),
         COALESCE(MAX(turn_index), 0)
       ) + 1 AS next_turn_index
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

  async function saveChatWorktreeBindings(
    chatId: number,
    bindings: KanbanGitBinding[],
  ) {
    const db = await getDatabase();
    await db.execute("DELETE FROM chat_worktree_bindings WHERE chat_id = $1", [
      chatId,
    ]);
    try {
      for (const binding of bindings) {
        await db.execute(
          `INSERT INTO chat_worktree_bindings (
             chat_id, source_repository_path, relative_path, execution_root,
             source_branch, base_branch, base_commit, continuation_branch,
             worktree_path, status, error_json
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [
            chatId,
            binding.sourceRepositoryPath,
            binding.relativePath,
            binding.executionRoot,
            binding.sourceBranch,
            binding.baseBranch,
            binding.baseCommit,
            binding.cardBranch,
            binding.worktreePath,
            binding.status,
            binding.error ? JSON.stringify(binding.error) : null,
          ],
        );
      }
    } catch (error) {
      await db
        .execute("DELETE FROM chat_worktree_bindings WHERE chat_id = $1", [
          chatId,
        ])
        .catch(() => undefined);
      throw error;
    }
  }

  async function listChatWorktreeBindings(chatId: number) {
    const db = await getDatabase();
    const rows = await db.select<Array<{
      source_repository_path: string;
      relative_path: string;
      execution_root: string;
      source_branch: string;
      base_branch: string;
      base_commit: string;
      continuation_branch: string;
      worktree_path: string;
      status: string;
      error_json: string | null;
    }>>(
      `SELECT source_repository_path, relative_path, execution_root,
        source_branch, base_branch, base_commit, continuation_branch,
        worktree_path, status, error_json
       FROM chat_worktree_bindings
       WHERE chat_id = $1
       ORDER BY relative_path, source_repository_path`,
      [chatId],
    );
    return rows.map((row): KanbanGitBinding => ({
      sourceRepositoryPath: row.source_repository_path,
      relativePath: row.relative_path,
      executionRoot: row.execution_root,
      sourceBranch: row.source_branch,
      baseBranch: row.base_branch,
      baseCommit: row.base_commit,
      cardBranch: row.continuation_branch,
      worktreePath: row.worktree_path,
      status: row.status,
      error: parseBindingError(row.error_json),
    }));
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

  type SharedNativeThreadInput = {
    threadId: string;
    title: string;
    status: string;
    updatedAt: string | null;
  };

  async function reconcileSharedNativeThreads(
    workspaceId: number,
    threads: SharedNativeThreadInput[],
  ) {
    if (threads.length === 0) return [] as string[];
    const db = await getDatabase();
    const matched: string[] = [];
    for (const thread of threads) {
      const result = await db.execute(
        `UPDATE chats
         SET title = CASE
               WHEN title_manually_edited = 0 THEN $1
               ELSE title
             END,
             native_thread_updated_at = $2,
             native_last_synced_at = CURRENT_TIMESTAMP,
             native_sync_status = 'synced'
         WHERE workspace_id = $3
           AND profile_key = 'default'
           AND codex_thread_id = $4
           AND deleted_at IS NULL`,
        [thread.title, thread.updatedAt, workspaceId, thread.threadId],
      );
      if (result.rowsAffected > 0) matched.push(thread.threadId);
    }
    return matched;
  }

  async function markSharedNativeThreadUnavailable(chatId: number) {
    const db = await getDatabase();
    await db.execute(
      `UPDATE chats
       SET native_sync_status = 'unavailable',
           native_last_synced_at = CURRENT_TIMESTAMP
       WHERE id = $1
         AND profile_key = 'default'
         AND deleted_at IS NULL`,
      [chatId],
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
      accountId: number | null;
      profileKey: string | null;
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
    if ("accountId" in fields) add("account_id", fields.accountId);
    if ("profileKey" in fields) add("profile_key", fields.profileKey);
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
    accountId: number | null;
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
           native_sync_status = CASE
             WHEN $2 = 'default' THEN 'synced'
             ELSE NULL
           END,
           native_last_synced_at = CASE
             WHEN $2 = 'default' THEN CURRENT_TIMESTAMP
             ELSE NULL
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
    getSharedChatByThreadId,
    getNextChatTurnIndex,
    chatHasPendingPlanReview,
    recoverInterruptedChatTitleGenerations,
    recoverAbandonedRuns,
    claimChatTitleGeneration,
    completeChatTitleGeneration,
    failChatTitleGeneration,
    renameChat,
    reconcileSharedNativeThreads,
    markSharedNativeThreadUnavailable,
    saveChatWorktreeBindings,
    listChatWorktreeBindings,
    upsertExternalCodexChats,
    updateChat,
    activateChatAccountHandoff,
  };
}

export type ChatRepository = ReturnType<typeof createChatRepository>;
