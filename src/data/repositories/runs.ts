import { commands, type RunEventWrite } from "../../generated/tauri";
import type { PreflightReport, RunRecord, TaskRecord } from "../../features/runs/types";
import { FrontendDatabase } from "../database";

export type RunEventType =
  | "notification"
  | "server-request"
  | "process"
  | "client-action";

export type RunEventInput = Omit<RunEventWrite, "eventType"> & {
  eventType: RunEventType;
};

export function createRunRepository(database: FrontendDatabase) {
  const getDatabase = () => database.get();
  const selectOne = <T>(query: string, bindValues: unknown[] = []) =>
    database.selectOne<T>(query, bindValues);

  async function createTask(input: {
    workspaceId: number;
    chatId?: number | null;
    turnIndex?: number | null;
    originalPrompt: string;
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
        input.originalPrompt,
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

  async function updateTaskStatus(taskId: number, status: string) {
    const db = await getDatabase();
    await db.execute("UPDATE tasks SET status = $1 WHERE id = $2", [status, taskId]);
  }

  async function savePreflightReport(
    workspaceId: number,
    taskId: number | null,
    report: PreflightReport,
  ) {
    await commands.savePreflightReportTransaction(workspaceId, taskId, report);
  }

  async function createRun(input: {
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

  async function updateRun(
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

  async function softDeleteRun(runId: number) {
    const db = await getDatabase();
    await db.execute(
      "UPDATE runs SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1",
      [runId],
    );
  }


  async function appendRunEvents(inputs: RunEventInput[]) {
    if (inputs.length === 0) return;
    await commands.appendRunEventsTransaction(inputs);
  }

  async function appendRunEvent(input: RunEventInput) {
    await appendRunEvents([input]);
  }

  async function recordTokenUsage(input: {
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

  return {
    createTask,
    updateTaskStatus,
    savePreflightReport,
    createRun,
    updateRun,
    softDeleteRun,
    appendRunEvents,
    appendRunEvent,
    recordTokenUsage,
  };
}

export type RunRepository = ReturnType<typeof createRunRepository>;
