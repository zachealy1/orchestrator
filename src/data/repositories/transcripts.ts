import { commands } from "../../generated/tauri";
import type { ChatListItem, ChatWithRuns, ExternalTranscriptSnapshot, ExternalThreadHistoryIndex, HistoryPageDescriptor, HistoryRunSummary, HistoryTranscriptIndex, HistoryTurnHint } from "../../features/conversations/types";
import type { RunListItem } from "../../features/runs/types";
import { isSubagentLifecycleStatus, type SubagentInstruction, type SubagentInstructionKind, type SubagentLifecycleStatus, type SubagentRecord } from "../../lib/subagents";
import { FrontendDatabase } from "../database";

export function createTranscriptRepository(database: FrontendDatabase) {
  const getDatabase = () => database.get();
  const selectOne = <T>(query: string, bindValues: unknown[] = []) =>
    database.selectOne<T>(query, bindValues);

  async function listWorkspaceChats(workspaceId: number) {
    const db = await getDatabase();
    return db.select<ChatListItem[]>(
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
       WHERE chats.workspace_id = $1
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
       ORDER BY julianday(latest_activity_at) DESC, chats.id DESC
       LIMIT 50`,
      [workspaceId],
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

  async function listChatRunsPage(
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
       ORDER BY COALESCE(runs.turn_index, runs.id), runs.started_at
       LIMIT $2 OFFSET $3`,
      [chatId, limit, offset],
    );
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

  async function deleteExternalTranscriptSnapshots(chatId: number) {
    await commands.deleteExternalTranscriptSnapshotsTransaction(chatId);
  }

  async function buildLocalChatHistoryIndex(
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

  async function readExternalChatHistoryIndex(
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

  async function saveExternalChatHistoryIndex(
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

  async function softDeleteChat(chatId: number) {
    await commands.softDeleteChatTransaction(chatId);
  }


  return {
    listWorkspaceChats,
    getChatWithRuns,
    listChatRunsPage,
    listLocalChatTranscript,
    upsertRunSubagent,
    listChatSubagents,
    upsertRunSubagentInstruction,
    listRunSubagentInstructions,
    readExternalTranscriptSnapshot,
    activateExternalTranscriptSnapshot,
    deleteExternalTranscriptSnapshots,
    buildLocalChatHistoryIndex,
    readExternalChatHistoryIndex,
    saveExternalChatHistoryIndex,
    softDeleteChat,
  };
}

export type TranscriptRepository = ReturnType<typeof createTranscriptRepository>;
