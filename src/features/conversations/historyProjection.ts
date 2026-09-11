import type { TaskChatEntry } from "../../components/TaskChatTurn";
import {
  applyCodexMessage,
  emptyRunView,
  parseUnifiedDiffFiles,
  type RunViewState,
} from "../../lib/codexEventReducer";
import type { CodexMessage } from "../codex/types";
import { isImageContextFile } from "../../lib/imageAttachments";
import { MISSING_REVIEWABLE_PLAN_ERROR } from "../../lib/nativePlanMode";
import { parseProposedPlanEnvelope } from "../../lib/proposedPlan";
import { resolveStoredRunExecutionSettings } from "../../lib/runExecutionSettings";
import { parsePersistedRunWebPreview } from "../../lib/webPreview";
import type {
  ChatContinuationSnapshot,
  ChatContinuationTurn,
  ChatListItem,
  ChatRecord,
  ExternalTranscriptSnapshot,
  HistoryRunSummary,
} from "./types";

const DEFAULT_CODEX_PROFILE_KEY = "default";
const MAX_CONTINUATION_TRANSCRIPT_CHARACTERS = 250_000;
const CONTINUATION_TRUNCATION_MARKER = "\n\n[Truncated in continuation]";

function continuationTurnCharacters(turn: ChatContinuationTurn) {
  return turn.prompt.length + turn.finalMessage.length + turn.completedPlan.length;
}

function truncateContinuationText(value: string, limit: number) {
  if (value.length <= limit) return value;
  if (limit <= CONTINUATION_TRUNCATION_MARKER.length) {
    return CONTINUATION_TRUNCATION_MARKER.slice(0, limit);
  }
  return `${value.slice(0, limit - CONTINUATION_TRUNCATION_MARKER.length)}${CONTINUATION_TRUNCATION_MARKER}`;
}

function truncateContinuationTurn(
  turn: ChatContinuationTurn,
  limit: number,
): ChatContinuationTurn {
  const promptLimit = Math.min(50_000, Math.max(1, Math.floor(limit * 0.25)));
  const prompt = truncateContinuationText(turn.prompt, promptLimit);
  const remaining = Math.max(0, limit - prompt.length);
  const populatedResponses = Number(Boolean(turn.finalMessage)) + Number(Boolean(turn.completedPlan));
  const responseLimit = populatedResponses > 0 ? Math.floor(remaining / populatedResponses) : 0;
  return {
    ...turn,
    prompt,
    finalMessage: turn.finalMessage
      ? truncateContinuationText(turn.finalMessage, responseLimit)
      : "",
    completedPlan: turn.completedPlan
      ? truncateContinuationText(turn.completedPlan, responseLimit)
      : "",
  };
}

export function boundChatContinuationTurns(
  turns: ChatContinuationTurn[],
  limit = MAX_CONTINUATION_TRANSCRIPT_CHARACTERS,
) {
  if (turns.length === 0 || limit <= 0) return [];
  const total = turns.reduce(
    (characters, turn) => characters + continuationTurnCharacters(turn),
    0,
  );
  if (total <= limit) return turns;
  if (turns.length === 1) return [truncateContinuationTurn(turns[0], limit)];

  const first = truncateContinuationTurn(
    turns[0],
    Math.min(50_000, Math.max(1, Math.floor(limit * 0.2))),
  );
  let remaining = Math.max(0, limit - continuationTurnCharacters(first));
  const newest: ChatContinuationTurn[] = [];
  for (let index = turns.length - 1; index > 0 && remaining > 0; index -= 1) {
    const turn = turns[index];
    const characters = continuationTurnCharacters(turn);
    if (characters <= remaining) {
      newest.unshift(turn);
      remaining -= characters;
      continue;
    }
    newest.unshift(truncateContinuationTurn(turn, remaining));
    break;
  }
  return [first, ...newest];
}

export function historyChatVersion(chat: ChatListItem) {
  return [
    chat.external_updated_at ?? "",
    chat.native_thread_updated_at ?? "",
    chat.latest_activity_at,
    chat.updated_at,
    chat.turn_count,
    chat.continuation_turn_count ?? 0,
  ].join(":");
}

export function parseChatContinuationSnapshot(
  value: string | null | undefined,
): ChatContinuationSnapshot | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as ChatContinuationSnapshot;
    if (
      parsed.version !== 1 ||
      !Number.isInteger(parsed.sourceChatId) ||
      typeof parsed.context !== "string" ||
      !Array.isArray(parsed.turns)
    ) {
      return null;
    }
    const turns = parsed.turns.filter(
      (turn) =>
        Number.isInteger(turn.turnIndex) &&
        typeof turn.prompt === "string" &&
        typeof turn.finalMessage === "string" &&
        typeof turn.completedPlan === "string" &&
        turn.status === "completed" &&
        typeof turn.startedAt === "string",
    );
    if (turns.length !== parsed.turns.length) return null;
    return { ...parsed, turns };
  } catch {
    return null;
  }
}

export function createTaskChatEntriesFromContinuationSnapshot(
  chat: ChatListItem,
): TaskChatEntry[] {
  const snapshot = parseChatContinuationSnapshot(
    chat.continuation_snapshot_json,
  );
  if (!snapshot) return [];
  return snapshot.turns.map((turn) => {
    const finalMessageItemId = turn.finalMessage
      ? `continuation-final-${chat.id}-${turn.turnIndex}`
      : null;
    const planItemId = turn.completedPlan
      ? `continuation-plan-${chat.id}-${turn.turnIndex}`
      : null;
    return {
      clientId: `continuation-${chat.id}-turn-${turn.turnIndex}`,
      workspaceId: chat.workspace_id,
      chatId: chat.id,
      turnIndex: turn.turnIndex,
      runId: null,
      taskId: null,
      prompt: turn.prompt,
      submittedAt: turn.startedAt,
      status: "completed",
      runView: {
        ...emptyRunView,
        status: "completed",
        startedAt: turn.startedAt,
        completedAt: turn.completedAt,
        elapsedMs: turn.durationMs ?? 0,
        finalMessage: turn.finalMessage,
        finalMessageItemId,
        agentMessagesById: finalMessageItemId
          ? {
              [finalMessageItemId]: {
                text: turn.finalMessage,
                phase: "final_answer" as const,
              },
            }
          : {},
        latestPlan: turn.completedPlan,
        nativePlan: turn.completedPlan
          ? {
              ...emptyRunView.nativePlan,
              intent: "plan" as const,
              mode: "plan" as const,
              phase: "completed" as const,
              planItemId,
              previewText: turn.completedPlan,
              completedText: turn.completedPlan,
              reviewState: "superseded" as const,
            }
          : emptyRunView.nativePlan,
      },
    };
  });
}

export function historyActivityTime(value: string | null | undefined) {
  if (!value) return Number.NEGATIVE_INFINITY;
  const sqliteTimestamp =
    /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(value)
      ? `${value.replace(" ", "T")}Z`
      : value;
  const timestamp = Date.parse(sqliteTimestamp);
  return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY;
}

export function sortHistoryChatsByActivity(
  chats: ChatListItem[],
  liveActivityByChatId: ReadonlyMap<number, string>,
) {
  return chats
    .map((chat, index) => ({ chat, index }))
    .sort((left, right) => {
      const leftActivity = Math.max(
        historyActivityTime(left.chat.latest_activity_at),
        historyActivityTime(liveActivityByChatId.get(left.chat.id)),
      );
      const rightActivity = Math.max(
        historyActivityTime(right.chat.latest_activity_at),
        historyActivityTime(liveActivityByChatId.get(right.chat.id)),
      );
      return (
        rightActivity - leftActivity ||
        right.chat.id - left.chat.id ||
        left.index - right.index
      );
    })
    .map(({ chat }) => chat);
}

export function createTaskChatEntriesFromExternalTranscriptSnapshot(
  chat: ChatListItem,
  snapshot: Pick<ExternalTranscriptSnapshot, "threadId" | "turns">,
): TaskChatEntry[] {
  return snapshot.turns.map((turn) => {
    const normalizedPlan = normalizeHistoricalProposedPlan(turn.finalMessage);
    const status = normalizeExternalTurnStatus(
      turn.status,
      normalizedPlan.finalMessage || normalizedPlan.planText,
    );
    const startedAt =
      normalizeExternalTranscriptTimestamp(turn.startedAt) ??
      chat.external_created_at ??
      chat.created_at;
    const completedAt =
      normalizeExternalTranscriptTimestamp(turn.completedAt) ??
      (status === "completed"
        ? chat.external_updated_at ?? chat.updated_at
        : null);
    const stableTurnKey = turn.turnId ?? `${turn.slotIndex}-${startedAt}`;
    const finalMessageItemId = normalizedPlan.finalMessage
      ? `external-final-${chat.id}-${stableTurnKey}`
      : null;
    const planItemId = normalizedPlan.promoted
      ? `external-proposed-plan-${chat.id}-${stableTurnKey}`
      : null;
    return {
      clientId: `external-chat-${chat.id}-turn-${stableTurnKey}`,
      workspaceId: chat.workspace_id,
      chatId: chat.id,
      turnIndex: turn.slotIndex + 1,
      runId: null,
      taskId: null,
      prompt: turn.prompt,
      submittedAt: startedAt,
      status,
      runView: {
        ...emptyRunView,
        status,
        threadId: snapshot.threadId,
        turnId: turn.turnId,
        startedAt,
        completedAt,
        elapsedMs: turn.durationMs ?? 0,
        finalMessage: normalizedPlan.finalMessage,
        finalMessageItemId,
        agentMessagesById:
          finalMessageItemId === null
            ? {}
            : {
                [finalMessageItemId]: {
                  text: normalizedPlan.finalMessage,
                  phase: "final_answer" as const,
                },
              },
        latestPlan: normalizedPlan.planText,
        nativePlan: normalizedPlan.promoted
          ? {
              ...emptyRunView.nativePlan,
              intent: "plan" as const,
              mode: "plan" as const,
              phase: "completed" as const,
              planItemId,
              previewText: normalizedPlan.planText,
              completedText: normalizedPlan.planText,
              completedTurnId: turn.turnId,
            }
          : emptyRunView.nativePlan,
        error: turn.error,
        tokenUsage:
          turn.totalTokens === null
            ? null
            : {
                totalTokens: turn.totalTokens,
                inputTokens: 0,
                cachedInputTokens: 0,
                outputTokens: 0,
                reasoningOutputTokens: 0,
                turnTokens: turn.totalTokens,
                turnCachedInputTokens: null,
                contextTokens: null,
                modelContextWindow: turn.modelContextWindow,
              },
      },
      historicalActivity: turn.turnId
        ? {
            source: "default-profile" as const,
            profileKey: "default" as const,
            threadId: snapshot.threadId,
            turnId: turn.turnId,
            status: "available" as const,
            nextCursor: null,
            error: null,
          }
        : undefined,
    };
  });
}

export function buildPreviousChatContext(entries: TaskChatEntry[]) {
  if (entries.length === 0) return null;

  const sections = entries.map((entry, index) => {
    const turnLabel = entry.turnIndex ?? index + 1;
    const assistantResult =
      entry.runView.finalMessage ||
      entry.runView.error ||
      "No assistant result was recorded for this turn.";
    return [
      `Turn ${turnLabel}`,
      "User prompt:",
      entry.prompt,
      "Assistant result:",
      assistantResult,
    ].join("\n");
  });

  return [
    "Previous chat context before the edited prompt. Use this as background only; continue from the edited prompt.",
    ...sections,
  ].join("\n\n");
}

export function createTaskChatEntryFromHistoryRun(
  run: HistoryRunSummary,
): TaskChatEntry {
  const executionSettings = resolveStoredRunExecutionSettings(
    run.execution_settings_json,
    run,
  );
  const plainPlanFallbackAllowed =
    run.collaboration_mode === "plan" &&
    (run.run_intent === "plan" || run.run_intent === "plan-revision") &&
    Boolean(run.error?.includes(MISSING_REVIEWABLE_PLAN_ERROR));
  const normalizedPlan = normalizeHistoricalProposedPlan(
    run.final_message ?? "",
    run.completed_plan_text,
    plainPlanFallbackAllowed,
  );
  const recoveredMissingPlanFailure = Boolean(
    normalizedPlan.promoted &&
      run.status === "failed" &&
      run.error?.includes(MISSING_REVIEWABLE_PLAN_ERROR),
  );
  const status = recoveredMissingPlanFailure
    ? "completed"
    : normalizeHistoryRunStatus(run);
  const runError = recoveredMissingPlanFailure ? null : run.error;
  const finalMessage = normalizedPlan.finalMessage;
  const finalMessageItemId = finalMessage ? `history-final-${run.id}` : null;
  const runIntent =
    normalizedPlan.promoted && (!run.run_intent || run.run_intent === "normal")
      ? "plan"
      : run.run_intent ?? "normal";
  const hasReviewablePlan =
    Boolean(normalizedPlan.planText) && runIntent !== "plan-implementation";
  const savedPlanReviewState = run.plan_review_state ?? "none";
  const planReviewState = hasReviewablePlan
    ? savedPlanReviewState === "none"
      ? "available"
      : savedPlanReviewState
    : "none";
  const latestDiff = run.latest_diff ?? "";
  const hasSubmittedImages =
    executionSettings.settings.contextFiles.some(isImageContextFile);
  const persistedGeneratedImages = restorePersistedGeneratedImages(
    run.generated_image_events_json,
  );

  return {
    clientId: `history-run-${run.id}`,
    workspaceId: run.workspace_id,
    chatId: run.chat_id,
    turnIndex: run.turn_index,
    runId: run.id,
    taskId: run.task_id,
    prompt: run.original_prompt,
    contextFiles: executionSettings.settings.contextFiles,
    imageAttachmentDelivery: hasSubmittedImages
      ? run.codex_turn_id || status === "completed"
        ? { status: "sent", error: null }
        : { status: "failed", error: run.error ?? "Image was not sent." }
      : undefined,
    executionSettings,
    submittedAt: run.started_at,
    status,
    runView: {
      ...emptyRunView,
      status,
      threadId: run.codex_thread_id,
      turnId: run.codex_turn_id,
      startedAt: run.started_at,
      completedAt: run.completed_at,
      elapsedMs: run.duration_ms ?? 0,
      finalMessage,
      finalMessageItemId,
      agentMessagesById:
        finalMessageItemId === null
          ? {}
          : {
              [finalMessageItemId]: {
                text: finalMessage,
                phase: "final_answer",
              },
            },
      error: runError,
      editedFiles: parseUnifiedDiffFiles(latestDiff),
      latestDiff,
      generatedImagesById: persistedGeneratedImages.generatedImagesById,
      generatedImageOrder: persistedGeneratedImages.generatedImageOrder,
      webPreview: parsePersistedRunWebPreview(run.web_preview_json),
      latestPlan: normalizedPlan.planText,
      nativePlan: {
        ...emptyRunView.nativePlan,
        intent: runIntent,
        mode: normalizedPlan.promoted ? "plan" : run.collaboration_mode ?? null,
        phase: hasReviewablePlan
          ? planReviewState === "cancelled"
            ? "cancelled"
            : planReviewState === "approved" ||
                planReviewState === "superseded"
              ? "completed"
              : "awaiting-approval"
          : runIntent === "plan-implementation" && status === "completed"
            ? "completed"
            : "inactive",
        planItemId:
          run.completed_plan_item_id ??
          (normalizedPlan.promoted ? `history-proposed-plan-${run.id}` : null),
        previewText: normalizedPlan.planText,
        completedText: normalizedPlan.planText,
        completedTurnId: run.codex_turn_id,
        reviewState: planReviewState,
      },
      tokenUsage:
        run.latest_total_tokens === null
          ? null
          : {
              totalTokens: run.latest_total_tokens,
              inputTokens: 0,
              cachedInputTokens: run.latest_cached_input_tokens ?? 0,
              outputTokens: 0,
              reasoningOutputTokens: 0,
              turnTokens: run.latest_run_tokens,
              turnCachedInputTokens: run.latest_run_cached_input_tokens,
              contextTokens: run.latest_context_tokens,
              modelContextWindow: run.latest_model_context_window,
            },
    },
    historicalActivity: {
      source: "persisted-run",
      runId: run.id,
      status: "available",
      nextCursor: null,
      error: null,
    },
  };
}

export function restorePersistedGeneratedImages(
  value: string | null | undefined,
) {
  if (!value) {
    return {
      generatedImagesById: emptyRunView.generatedImagesById,
      generatedImageOrder: emptyRunView.generatedImageOrder,
    };
  }
  try {
    const events = JSON.parse(value) as unknown;
    if (!Array.isArray(events)) throw new Error("Expected an event array");
    const restored = events.reduce((state, candidate) => {
      if (
        typeof candidate !== "object" ||
        candidate === null ||
        Array.isArray(candidate)
      ) {
        return state;
      }
      const message = candidate as CodexMessage;
      if (message.method !== "item/started" && message.method !== "item/completed") {
        return state;
      }
      const item = message.params?.item;
      if (
        typeof item !== "object" ||
        item === null ||
        Array.isArray(item) ||
        (item as Record<string, unknown>).type !== "imageGeneration"
      ) {
        return state;
      }
      return applyCodexMessage(state, message);
    }, emptyRunView);
    return {
      generatedImagesById: restored.generatedImagesById,
      generatedImageOrder: restored.generatedImageOrder,
    };
  } catch {
    return {
      generatedImagesById: emptyRunView.generatedImagesById,
      generatedImageOrder: emptyRunView.generatedImageOrder,
    };
  }
}

export function normalizeHistoricalProposedPlan(
  finalMessage: string,
  completedPlanText: string | null = null,
  allowPlainPlanFallback = false,
) {
  const envelope = parseProposedPlanEnvelope(finalMessage);
  const plainPlan =
    allowPlainPlanFallback && !completedPlanText && !envelope
      ? finalMessage.trim()
      : "";
  const planText = completedPlanText ?? envelope?.markdown ?? plainPlan;
  const envelopeRepresentsPlan = Boolean(
    envelope && (!completedPlanText || completedPlanText === envelope.markdown),
  );
  const plainTextRepresentsPlan = Boolean(plainPlan);

  return {
    finalMessage:
      envelopeRepresentsPlan || plainTextRepresentsPlan ? "" : finalMessage,
    planText,
    promoted: Boolean((envelope || plainTextRepresentsPlan) && !completedPlanText),
  };
}

export function isAdoptedExternalChat(
  chat: Pick<ChatRecord, "origin" | "sync_status" | "account_id" | "profile_key">,
) {
  return (
    chat.origin === "codex_external" &&
    (chat.sync_status === "adopted" ||
      chat.account_id !== null ||
      (chat.profile_key !== null &&
        chat.profile_key !== DEFAULT_CODEX_PROFILE_KEY))
  );
}

export function formatHistoryChatMeta(chat: ChatListItem) {
  return [
    formatChatSourceLabel(chat),
    formatHistoryTimestamp(chat.latest_activity_at),
    chat.status,
    `${chat.turn_count} turn${chat.turn_count === 1 ? "" : "s"}`,
    formatHistoryDuration(chat.duration_ms),
    formatHistoryTokens(chat.total_tokens),
  ].join(" · ");
}

export function formatHistoryTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function normalizeExternalTranscriptTimestamp(value: string | null) {
  if (!value) return null;
  if (!/^\d+$/.test(value)) return value;
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return null;
  const milliseconds =
    numericValue > 10_000_000_000 ? numericValue : numericValue * 1000;
  return new Date(milliseconds).toISOString();
}

function normalizeExternalTurnStatus(
  status: string | null,
  finalMessage: string,
): RunViewState["status"] {
  if (status === "failed") return "failed";
  if (status === "running") return "running";
  if (status === "interrupted" || status === "cancelled" || status === "canceled") {
    return "interrupted";
  }
  return finalMessage ? "completed" : "interrupted";
}

function normalizeHistoryRunStatus(run: HistoryRunSummary): RunViewState["status"] {
  if (
    run.status === "completed" ||
    run.status === "failed" ||
    run.status === "interrupted" ||
    run.status === "connecting" ||
    run.status === "running"
  ) {
    return run.status;
  }
  if (
    run.status === "cancelled" ||
    run.status === "canceled" ||
    run.status === "stopped"
  ) {
    return "interrupted";
  }
  if (run.error) return "failed";
  if (run.completed_at || run.final_message) return "completed";
  return "interrupted";
}

function formatChatSourceLabel(chat: ChatListItem) {
  if (chat.origin !== "codex_external") return "Orchestrator";
  const suffix = isAdoptedExternalChat(chat)
    ? " · Continued in Orchestrator"
    : "";
  if (chat.source_kind === "vscode") return `VS Code${suffix}`;
  if (chat.source_kind === "cli") return `CLI${suffix}`;
  if (chat.source_kind === "appServer") return `Codex App${suffix}`;
  return `Codex${suffix}`;
}

function formatHistoryDuration(milliseconds: number | null) {
  if (!milliseconds || milliseconds <= 0) return "No duration";
  const seconds = Math.round(milliseconds / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return remainder ? `${minutes}m ${remainder}s` : `${minutes}m`;
}

function formatHistoryTokens(tokens: number | null) {
  return tokens && tokens > 0 ? `${tokens.toLocaleString()} tokens` : "No tokens";
}
