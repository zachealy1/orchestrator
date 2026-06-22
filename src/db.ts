import Database from "@tauri-apps/plugin-sql";
import type {
  AnalyticsSummary,
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
    "SELECT id, path, label, last_opened_at, created_at FROM workspaces ORDER BY last_opened_at DESC",
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
       last_opened_at = CURRENT_TIMESTAMP`,
    [path, label],
  );

  const workspace = await selectOne<Workspace>(
    "SELECT id, path, label, last_opened_at, created_at FROM workspaces WHERE path = $1",
    [path],
  );

  if (!workspace) {
    throw new Error("Workspace was not saved");
  }

  return workspace;
}

export async function createTask(input: {
  workspaceId: number;
  originalPrompt: string;
  improvedPrompt: string;
  routeRecommendation: string;
  budgetTokens: number;
}) {
  const db = await getDatabase();
  const result = await db.execute(
    `INSERT INTO tasks (
      workspace_id, original_prompt, improved_prompt, route_recommendation, budget_tokens, status
    ) VALUES ($1, $2, $3, $4, $5, 'created')`,
    [
      input.workspaceId,
      input.originalPrompt,
      input.improvedPrompt,
      input.routeRecommendation,
      input.budgetTokens,
    ],
  );

  const task = await selectOne<TaskRecord>(
    `SELECT id, workspace_id, original_prompt, improved_prompt, route_recommendation,
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
  status: string;
  sandbox: string;
  approvalPolicy: string;
  model?: string | null;
  modelProvider?: string | null;
}) {
  const db = await getDatabase();
  const result = await db.execute(
    `INSERT INTO runs (
      task_id, workspace_id, status, sandbox, approval_policy, model, model_provider
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      input.taskId,
      input.workspaceId,
      input.status,
      input.sandbox,
      input.approvalPolicy,
      input.model ?? null,
      input.modelProvider ?? null,
    ],
  );

  const run = await selectOne<RunRecord>(
    `SELECT id, task_id, workspace_id, codex_thread_id, codex_turn_id, model, model_provider,
      sandbox, approval_policy, status, started_at, completed_at, duration_ms, final_message, error
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
    `SELECT runs.id, runs.task_id, runs.workspace_id, runs.codex_thread_id, runs.codex_turn_id,
      runs.model, runs.model_provider, runs.sandbox, runs.approval_policy, runs.status,
      runs.started_at, runs.completed_at, runs.duration_ms, runs.final_message, runs.error,
      tasks.original_prompt, tasks.improved_prompt, tasks.route_recommendation, tasks.budget_tokens
     FROM runs
     JOIN tasks ON tasks.id = runs.task_id
     WHERE runs.workspace_id = $1
     ORDER BY runs.started_at DESC
     LIMIT 50`,
    [workspaceId],
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
     WHERE runs.workspace_id = $1`,
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
