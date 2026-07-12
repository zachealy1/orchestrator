import Database from "@tauri-apps/plugin-sql";
import type {
  AnalyticsSummary,
  ChatListItem,
  ChatRecord,
  ChatWithRuns,
  CodexAccountProfile,
  CodexAccountStatus,
  PreflightReport,
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
    const existing = await selectOne<{ id: number; deleted_at: string | null }>(
      `SELECT id, deleted_at
       FROM chats
       WHERE origin = 'codex_external'
         AND profile_key = $1
         AND external_thread_id = $2
       LIMIT 1`,
      [chat.profileKey, chat.externalThreadId],
    );

    const title = chat.title.trim() || "Untitled Codex chat";
    const createdAt = chat.createdAt ?? new Date().toISOString();
    const updatedAt = chat.updatedAt ?? createdAt;
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
}) {
  const db = await getDatabase();
  const result = await db.execute(
    `INSERT INTO runs (
      task_id, workspace_id, chat_id, turn_index,
      account_id, account_label, account_email,
      status, sandbox, approval_policy, model, model_provider
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
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
    ],
  );

  const run = await selectOne<RunRecord>(
    `SELECT id, task_id, workspace_id, chat_id, turn_index,
      account_id, account_label, account_email,
      codex_thread_id, codex_turn_id, model, model_provider,
      sandbox, approval_policy, status, started_at, completed_at, duration_ms,
      final_message, error
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

export async function appendRunEvent(input: {
  runId: number;
  sequence: number;
  eventType: "notification" | "server-request" | "process";
  method: string | null;
  payload: unknown;
}) {
  const db = await getDatabase();
  await db.execute(
    `INSERT INTO run_events (run_id, sequence, event_type, method, payload_json)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      input.runId,
      input.sequence,
      input.eventType,
      input.method,
      JSON.stringify(input.payload),
    ],
  );
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
  modelContextWindow: number | null;
}) {
  const db = await getDatabase();
  await db.execute(
    `INSERT INTO token_usage_snapshots (
      run_id, thread_id, turn_id, total_tokens, input_tokens, cached_input_tokens,
      output_tokens, reasoning_output_tokens, model_context_window
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      input.runId,
      input.threadId,
      input.turnId,
      input.totalTokens,
      input.inputTokens,
      input.cachedInputTokens,
      input.outputTokens,
      input.reasoningOutputTokens,
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
      tasks.original_prompt, tasks.improved_prompt, tasks.route_recommendation, tasks.budget_tokens,
      latest_tokens.total_tokens AS latest_total_tokens,
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
      latest_run.account_label,
      latest_run.account_email,
      COALESCE(
        chats.external_updated_at,
        MAX(COALESCE(runs.completed_at, runs.started_at)),
        chats.updated_at
      )
        AS latest_activity_at,
      COUNT(runs.id) AS turn_count,
      COALESCE(SUM(latest_tokens.total_tokens), 0) AS total_tokens,
      COALESCE(SUM(runs.duration_ms), 0) AS duration_ms,
      latest_run.model AS latest_model
     FROM chats
     LEFT JOIN runs ON runs.chat_id = chats.id AND runs.deleted_at IS NULL
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
      latest_run.account_label,
      latest_run.account_email,
      COALESCE(
        chats.external_updated_at,
        MAX(COALESCE(runs.completed_at, runs.started_at)),
        chats.updated_at
      )
        AS latest_activity_at,
      COUNT(runs.id) AS turn_count,
      COALESCE(SUM(latest_tokens.total_tokens), 0) AS total_tokens,
      COALESCE(SUM(runs.duration_ms), 0) AS duration_ms,
      latest_run.model AS latest_model
     FROM chats
     LEFT JOIN runs ON runs.chat_id = chats.id AND runs.deleted_at IS NULL
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
      tasks.original_prompt, tasks.improved_prompt, tasks.route_recommendation, tasks.budget_tokens,
      latest_tokens.total_tokens AS latest_total_tokens,
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
  return db.select<RunListItem[]>(
    `SELECT runs.id, runs.task_id, runs.workspace_id, runs.chat_id, runs.turn_index,
      runs.codex_thread_id, runs.codex_turn_id,
      runs.account_id, runs.account_label, runs.account_email, runs.model, runs.model_provider,
      runs.sandbox, runs.approval_policy, runs.status,
      runs.started_at, runs.completed_at, runs.duration_ms, runs.final_message, runs.error,
      tasks.original_prompt, tasks.improved_prompt, tasks.route_recommendation, tasks.budget_tokens,
      latest_tokens.total_tokens AS latest_total_tokens,
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

export async function softDeleteChat(chatId: number) {
  const db = await getDatabase();
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
      COALESCE(SUM(latest_tokens.total_tokens), 0) AS total_tokens,
      COALESCE(SUM(latest_tokens.cached_input_tokens), 0) AS cached_tokens,
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
