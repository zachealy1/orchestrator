import Database from "@tauri-apps/plugin-sql";
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
  RunListItem,
  RunRecord,
  TaskRecord,
  Workspace,
} from "./types";

const DATABASE_URL = "sqlite:app.db";

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
}) {
  const db = await getDatabase();
  const profileKey = input.accountId === null ? null : `account:${input.accountId}`;
  const result = await db.execute(
    `INSERT INTO chats (workspace_id, account_id, title, status, origin, profile_key)
     VALUES ($1, $2, $3, $4, 'orchestrator', $5)`,
    [
      input.workspaceId,
      input.accountId,
      input.title.trim() || "Untitled chat",
      input.status,
      profileKey,
    ],
  );

  const chat = await selectOne<ChatRecord>(
    `SELECT id, workspace_id, account_id, title, codex_thread_id, status,
      origin, profile_key, external_thread_id, source_kind, sync_status,
      external_cwd, external_created_at, external_updated_at, last_synced_at,
      created_at, updated_at, deleted_at
     FROM chats WHERE id = $1`,
    [result.lastInsertId],
  );

  if (!chat) {
    throw new Error("Chat was not created");
  }

  return chat;
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
      deleted_at: string | null;
      external_created_at: string | null;
      external_updated_at: string | null;
    }>(
      `SELECT id, deleted_at, external_created_at, external_updated_at
       FROM chats
       WHERE origin = 'codex_external'
         AND profile_key = $1
         AND external_thread_id = $2
       LIMIT 1`,
      [chat.profileKey, chat.externalThreadId],
    );

    const title = chat.title.trim() || "Untitled Codex chat";
    const createdAt =
      chat.createdAt ?? existing?.external_created_at ?? new Date().toISOString();
    const updatedAt =
      chat.updatedAt ?? existing?.external_updated_at ?? createdAt;
    if (existing) {
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
}) {
  const db = await getDatabase();
  const result = await db.execute(
    `INSERT INTO runs (
      task_id, workspace_id, chat_id, turn_index,
      account_id, account_label, account_email,
      status, sandbox, approval_policy, model, model_provider,
      collaboration_mode, run_intent, client_user_message_id
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
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
    ],
  );

  const run = await selectOne<RunRecord>(
    `SELECT id, task_id, workspace_id, chat_id, turn_index,
      account_id, account_label, account_email,
      codex_thread_id, codex_turn_id, model, model_provider,
      sandbox, approval_policy, status, started_at, completed_at, duration_ms,
      final_message, error, collaboration_mode, run_intent,
      client_user_message_id, completed_plan_item_id, completed_plan_text,
      plan_review_state
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
      tasks.original_prompt, tasks.improved_prompt, tasks.route_recommendation, tasks.budget_tokens,
      latest_tokens.total_tokens AS latest_total_tokens,
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
      latest_run.account_label,
      latest_run.account_email,
      COALESCE(
        chats.external_updated_at,
        MAX(COALESCE(runs.completed_at, runs.started_at)),
        chats.updated_at
      )
        AS latest_activity_at,
      CASE
        WHEN chats.origin = 'codex_external'
          THEN COALESCE(MAX(external_snapshot.turn_count), 0)
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
     ORDER BY latest_activity_at DESC
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
      latest_run.account_label,
      latest_run.account_email,
      COALESCE(
        chats.external_updated_at,
        MAX(COALESCE(runs.completed_at, runs.started_at)),
        chats.updated_at
      )
        AS latest_activity_at,
      CASE
        WHEN chats.origin = 'codex_external'
          THEN COALESCE(MAX(external_snapshot.turn_count), 0)
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
      tasks.original_prompt, tasks.improved_prompt, tasks.route_recommendation, tasks.budget_tokens,
      latest_tokens.total_tokens AS latest_total_tokens,
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
      runs.status,
      runs.started_at, runs.completed_at, runs.duration_ms, runs.final_message, runs.error,
      runs.collaboration_mode, runs.run_intent, runs.client_user_message_id,
      runs.completed_plan_item_id, runs.completed_plan_text, runs.plan_review_state,
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
      runs.status,
      runs.started_at, runs.completed_at, runs.duration_ms, runs.final_message, runs.error,
      runs.collaboration_mode, runs.run_intent, runs.client_user_message_id,
      runs.completed_plan_item_id, runs.completed_plan_text, runs.plan_review_state,
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
