import { commands } from "../../generated/tauri";
import type { ChatListItem, PriorityChatListItem, ChatWithRuns, ExternalTranscriptSnapshot, HistoryRunSummary } from "../../features/conversations/types";
import type { RunListItem } from "../../features/runs/types";
import { isSubagentLifecycleStatus, type SubagentInstruction, type SubagentInstructionKind, type SubagentLifecycleStatus, type SubagentRecord } from "../../lib/subagents";
import { FrontendDatabase } from "../database";

export function createTranscriptRepository(database: FrontendDatabase) {
  const getDatabase = () => database.get();
  const selectOne = <T>(query: string, bindValues: unknown[] = []) =>
    database.selectOne<T>(query, bindValues);

  async function queryChatList<T extends ChatListItem>(
    predicate: string, bindings: unknown[], ending: string,
    prefix = "", extraJoin = "", extraColumns = "",
  ): Promise<T[]> {
    const db = await getDatabase();
    return db.select<T[]>(
      `${prefix} SELECT chats.id, chats.workspace_id, chats.account_id, chats.title,
        chats.codex_thread_id, chats.status, chats.created_at, chats.updated_at,
        chats.deleted_at, chats.surface, chats.origin, chats.profile_key, chats.external_thread_id,
        chats.source_kind, chats.sync_status, chats.external_cwd,
        chats.external_created_at, chats.external_updated_at, chats.last_synced_at,
        chats.native_thread_updated_at, chats.native_last_synced_at,
        chats.native_sync_status,
        chats.native_workspace_binding_json,
        chats.native_workspace_binding_status,
        chats.native_workspace_binding_error,
        chats.native_workspace_binding_updated_at,
        chats.collaboration_mode, chats.saved_default_collaboration_mode_json,
        chats.title_generation_state, chats.title_fallback,
        chats.title_manually_edited, chats.title_generation_started_at,
        chats.conversation_revision, chats.continued_from_chat_id,
        chats.continuation_kind, chats.continuation_snapshot_json,
        chats.continuation_settings_json, chats.continuation_turn_count,
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
          WHEN chats.profile_key = 'default' AND chats.codex_thread_id IS NOT NULL
            THEN MAX(
              COALESCE(MAX(external_snapshot.turn_count), 0),
              COALESCE(chats.continuation_turn_count, 0) + COUNT(runs.id)
            )
          ELSE COALESCE(chats.continuation_turn_count, 0) + COUNT(runs.id)
        END AS turn_count,
        COALESCE(SUM(latest_tokens.run_tokens), 0) AS total_tokens,
        COALESCE(SUM(runs.duration_ms), 0) AS duration_ms,
        latest_run.model AS latest_model ${extraColumns}
       FROM chats ${extraJoin}
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
       WHERE ${predicate}
         AND chats.deleted_at IS NULL
         AND (
           chats.surface = 'chat'
           OR (
             chats.surface = 'kanban'
             AND EXISTS (
               SELECT 1
               FROM runs accepted_runs
               WHERE accepted_runs.chat_id = chats.id
                 AND accepted_runs.deleted_at IS NULL
                 AND accepted_runs.codex_turn_id IS NOT NULL
             )
           )
         )
       GROUP BY chats.id
       ${ending}`, bindings,
    );
  }

  function listWorkspaceChats(workspaceId: number) {
    return queryChatList<ChatListItem>("chats.workspace_id = $1", [workspaceId],
      "ORDER BY julianday(latest_activity_at) DESC, chats.id DESC LIMIT 50");
  }

  function listSidebarWorkspaceChats(workspaceId: number, limit = 50, offset = 0) {
    return queryChatList<ChatListItem>("chats.workspace_id = $1", [workspaceId, limit, offset],
      "ORDER BY julianday(latest_activity_at) DESC, chats.id DESC LIMIT $2 OFFSET $3");
  }

  function listPriorityChats(now: string): Promise<PriorityChatListItem[]> {
    return queryChatList<PriorityChatListItem>(
      `EXISTS (SELECT 1 FROM workspaces WHERE workspaces.id = chats.workspace_id AND workspaces.deleted_at IS NULL)
       AND finished.position = 1
       AND julianday(finished.completed_at) > julianday($1) - 1
       AND julianday(finished.completed_at) <= julianday($1)
       AND NOT EXISTS (SELECT 1 FROM activity active
         WHERE active.chat_id = chats.id
           AND active.status IN ('starting', 'connecting', 'running', 'inProgress', 'in_progress'))`,
      [now],
      "ORDER BY julianday(finished.completed_at) DESC, chats.id DESC",
      `WITH activity AS (
         SELECT chat_id, id AS sequence, status, completed_at
         FROM runs WHERE deleted_at IS NULL
         UNION ALL
         SELECT turns.chat_id, turns.slot_index AS sequence, turns.status, turns.completed_at
         FROM external_chat_turn_summaries turns
         JOIN external_chat_transcript_snapshots snapshots
           ON snapshots.chat_id = turns.chat_id AND snapshots.source_version = turns.source_version
         WHERE NOT EXISTS (SELECT 1 FROM runs local
           WHERE local.chat_id = turns.chat_id AND local.deleted_at IS NULL
             AND local.codex_turn_id = turns.external_turn_id)
       ), finished AS (
         SELECT chat_id, completed_at,
           CASE WHEN status IN ('interrupted', 'cancelled', 'canceled') THEN 'cancelled'
                WHEN status IN ('failed', 'error') THEN 'failed' ELSE 'completed' END AS status,
           ROW_NUMBER() OVER (PARTITION BY chat_id ORDER BY julianday(completed_at) DESC, sequence DESC) AS position
         FROM activity
         WHERE status IN ('completed', 'failed', 'error', 'interrupted', 'cancelled', 'canceled')
           AND completed_at IS NOT NULL
       )`,
      "JOIN finished ON finished.chat_id = chats.id",
      ", strftime('%Y-%m-%dT%H:%M:%fZ', finished.completed_at) AS latest_finished_at, finished.status AS latest_finished_status",
    );
  }

  async function getChatWithRuns(chatId: number): Promise<ChatWithRuns> {
    const chat = await selectOne<ChatListItem>(
      `SELECT chats.id, chats.workspace_id, chats.account_id, chats.title,
        chats.codex_thread_id, chats.status, chats.created_at, chats.updated_at,
        chats.deleted_at, chats.surface, chats.origin, chats.profile_key, chats.external_thread_id,
        chats.source_kind, chats.sync_status, chats.external_cwd,
        chats.external_created_at, chats.external_updated_at, chats.last_synced_at,
        chats.native_thread_updated_at, chats.native_last_synced_at,
        chats.native_sync_status,
        chats.native_workspace_binding_json,
        chats.native_workspace_binding_status,
        chats.native_workspace_binding_error,
        chats.native_workspace_binding_updated_at,
        chats.collaboration_mode, chats.saved_default_collaboration_mode_json,
        chats.title_generation_state, chats.title_fallback,
        chats.title_manually_edited, chats.title_generation_started_at,
        chats.conversation_revision, chats.continued_from_chat_id,
        chats.continuation_kind, chats.continuation_snapshot_json,
        chats.continuation_settings_json, chats.continuation_turn_count,
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
          WHEN chats.profile_key = 'default' AND chats.codex_thread_id IS NOT NULL
            THEN MAX(
              COALESCE(MAX(external_snapshot.turn_count), 0),
              COALESCE(chats.continuation_turn_count, 0) + COUNT(runs.id)
            )
          ELSE COALESCE(chats.continuation_turn_count, 0) + COUNT(runs.id)
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

  async function listLocalChatTranscript(chatId: number) {
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
        (
          SELECT json_group_array(json(ordered_image_events.payload_json))
          FROM (
            SELECT image_events.payload_json
            FROM run_events image_events
            WHERE image_events.run_id = runs.id
              AND image_events.method IN ('item/started', 'item/completed')
              AND json_extract(image_events.payload_json, '$.params.item.type') = 'imageGeneration'
            ORDER BY image_events.sequence
          ) ordered_image_events
        ) AS generated_image_events_json,
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

  type RunSubagentRow = {
    id: string;
    run_id: number;
    workspace_id: number;
    chat_id: number | null;
    owner_client_id: string | null;
    profile_key: string;
    account_id: number;
    root_thread_id: string;
    parent_thread_id: string;
    parent_turn_id: string | null;
    child_thread_id: string;
    child_turn_id: string | null;
    spawn_item_id: string | null;
    task_prompt: string;
    hierarchy_depth: number;
    status: string;
    status_before_attention: string | null;
    agent_status: string | null;
    needs_attention: number;
    error: string | null;
    final_result: string | null;
    started_at: string;
    updated_at: string;
    completed_at: string | null;
  };

  function parseRunSubagentRow(row: RunSubagentRow): SubagentRecord {
    const status: SubagentLifecycleStatus = isSubagentLifecycleStatus(row.status)
      ? row.status
      : row.completed_at
        ? "failed"
        : "waiting";
    const statusBeforeAttention = isSubagentLifecycleStatus(
      row.status_before_attention,
    )
      ? row.status_before_attention
      : null;
    return {
      id: row.id,
      ownerClientId: row.owner_client_id,
      workspaceId: row.workspace_id,
      chatId: row.chat_id,
      runId: row.run_id,
      parentTurnId: row.parent_turn_id,
      profileKey: row.profile_key,
      accountId: row.account_id,
      rootThreadId: row.root_thread_id,
      parentThreadId: row.parent_thread_id,
      childThreadId: row.child_thread_id,
      childTurnId: row.child_turn_id,
      spawnItemId: row.spawn_item_id,
      task: row.task_prompt,
      depth: row.hierarchy_depth,
      status,
      statusBeforeAttention,
      agentStatus: row.agent_status,
      needsAttention: row.needs_attention === 1,
      error: row.error,
      finalResult: row.final_result,
      startedAt: row.started_at,
      updatedAt: row.updated_at,
      completedAt: row.completed_at,
    };
  }

  async function upsertRunSubagent(record: SubagentRecord) {
    if (
      record.runId === null ||
      record.childThreadId === record.rootThreadId
    ) {
      return record;
    }
    const db = await getDatabase();
    await db.execute(
      `INSERT INTO run_subagents (
         id, run_id, profile_key, account_id, root_thread_id, parent_thread_id,
         parent_turn_id, child_thread_id, child_turn_id, spawn_item_id,
         task_prompt, hierarchy_depth, status, status_before_attention,
         agent_status, needs_attention, error, final_result, started_at,
         updated_at, completed_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
         $15, $16, $17, $18, $19, $20, $21
       )
       ON CONFLICT(run_id, child_thread_id) DO UPDATE SET
         parent_thread_id = excluded.parent_thread_id,
         parent_turn_id = COALESCE(excluded.parent_turn_id, run_subagents.parent_turn_id),
         child_turn_id = excluded.child_turn_id,
         spawn_item_id = COALESCE(excluded.spawn_item_id, run_subagents.spawn_item_id),
         task_prompt = CASE
           WHEN excluded.task_prompt = '' THEN run_subagents.task_prompt
           ELSE excluded.task_prompt
         END,
         hierarchy_depth = excluded.hierarchy_depth,
         status = excluded.status,
         status_before_attention = excluded.status_before_attention,
         agent_status = excluded.agent_status,
         needs_attention = excluded.needs_attention,
         error = excluded.error,
         final_result = COALESCE(excluded.final_result, run_subagents.final_result),
         updated_at = excluded.updated_at,
         completed_at = excluded.completed_at`,
      [
        record.id,
        record.runId,
        record.profileKey,
        record.accountId,
        record.rootThreadId,
        record.parentThreadId,
        record.parentTurnId,
        record.childThreadId,
        record.childTurnId,
        record.spawnItemId,
        record.task,
        record.depth,
        record.status,
        record.statusBeforeAttention,
        record.agentStatus,
        record.needsAttention ? 1 : 0,
        record.error,
        record.finalResult,
        record.startedAt,
        record.updatedAt,
        record.completedAt,
      ],
    );
    return record;
  }

  async function listChatSubagents(chatId: number) {
    const db = await getDatabase();
    const rows = await db.select<RunSubagentRow[]>(
      `SELECT subagents.id, subagents.run_id, runs.workspace_id, runs.chat_id,
         runs.client_user_message_id AS owner_client_id,
         subagents.profile_key, subagents.account_id,
         subagents.root_thread_id, subagents.parent_thread_id,
         subagents.parent_turn_id, subagents.child_thread_id,
         subagents.child_turn_id, subagents.spawn_item_id,
         subagents.task_prompt, subagents.hierarchy_depth,
         subagents.status, subagents.status_before_attention,
         subagents.agent_status, subagents.needs_attention,
         subagents.error, subagents.final_result, subagents.started_at,
         subagents.updated_at, subagents.completed_at
       FROM run_subagents subagents
       JOIN runs ON runs.id = subagents.run_id
       WHERE runs.chat_id = $1
         AND runs.deleted_at IS NULL
         AND subagents.child_thread_id <> subagents.root_thread_id
       ORDER BY subagents.updated_at DESC, subagents.id`,
      [chatId],
    );
    return rows.map(parseRunSubagentRow);
  }

  type RunSubagentInstructionRow = {
    id: string;
    subagent_id: string;
    instruction_kind: string;
    instruction_text: string;
    created_at: string;
  };

  function parseRunSubagentInstructionRow(
    row: RunSubagentInstructionRow,
  ): SubagentInstruction {
    const kind: SubagentInstructionKind = ["spawn", "followup", "steer"].includes(
      row.instruction_kind,
    )
      ? (row.instruction_kind as SubagentInstructionKind)
      : "followup";
    return {
      id: row.id,
      subagentId: row.subagent_id,
      kind,
      text: row.instruction_text,
      createdAt: row.created_at,
    };
  }

  async function upsertRunSubagentInstruction(
    instruction: SubagentInstruction,
  ) {
    const db = await getDatabase();
    await db.execute(
      `INSERT INTO run_subagent_instructions (
         id, subagent_id, run_id, instruction_kind, instruction_text, created_at
       )
       SELECT $1, $2, run_id, $3, $4, $5
       FROM run_subagents
       WHERE id = $2
       ON CONFLICT(id) DO UPDATE SET
         instruction_kind = excluded.instruction_kind,
         instruction_text = excluded.instruction_text`,
      [
        instruction.id,
        instruction.subagentId,
        instruction.kind,
        instruction.text,
        instruction.createdAt,
      ],
    );
    return instruction;
  }

  async function listRunSubagentInstructions(subagentId: string) {
    const db = await getDatabase();
    const rows = await db.select<RunSubagentInstructionRow[]>(
      `SELECT id, subagent_id, instruction_kind, instruction_text, created_at
       FROM run_subagent_instructions
       WHERE subagent_id = $1
       ORDER BY julianday(created_at), id`,
      [subagentId],
    );
    return rows.map(parseRunSubagentInstructionRow);
  }

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

  type CachedExternalTranscriptSnapshot = ExternalTranscriptSnapshot & {
    chatId: number;
    syncedAt: string;
  };

  async function readExternalTranscriptSnapshot(
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

  async function activateExternalTranscriptSnapshot(
    chatId: number,
    snapshot: ExternalTranscriptSnapshot,
  ) {
    await commands.activateExternalTranscriptSnapshotTransaction(chatId, snapshot);
  }

  async function softDeleteChat(chatId: number) {
    await commands.softDeleteChatTransaction(chatId);
  }


  return {
    listWorkspaceChats,
    listSidebarWorkspaceChats,
    listPriorityChats,
    getChatWithRuns,
    listLocalChatTranscript,
    upsertRunSubagent,
    listChatSubagents,
    upsertRunSubagentInstruction,
    listRunSubagentInstructions,
    readExternalTranscriptSnapshot,
    activateExternalTranscriptSnapshot,
    softDeleteChat,
  };
}

export type TranscriptRepository = ReturnType<typeof createTranscriptRepository>;
