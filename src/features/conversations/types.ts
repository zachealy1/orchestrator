import type { StateSnapshot } from "react-virtuoso";
import type { CodexProfileKey } from "../codex/types";
import type { RunListItem, RunRecord } from "../runs/types";
import type { CollaborationMode } from "../../lib/nativePlanMode";
import type { RunViewState } from "../../lib/codexEventReducer";
import type { ComposerContextFile } from "../composer/types";
import type { ResolvedRunExecutionSettings } from "../runs/types";

export type HistoryRunSummary = Pick<
  RunRecord,
  | "id"
  | "task_id"
  | "workspace_id"
  | "chat_id"
  | "turn_index"
  | "codex_thread_id"
  | "codex_turn_id"
  | "status"
  | "started_at"
  | "completed_at"
  | "duration_ms"
  | "final_message"
  | "error"
  | "collaboration_mode"
  | "run_intent"
  | "client_user_message_id"
  | "completed_plan_item_id"
  | "completed_plan_text"
  | "plan_review_state"
  | "account_id"
  | "model"
  | "model_provider"
  | "sandbox"
  | "approval_policy"
  | "execution_settings_json"
  | "web_preview_json"
> & {
  original_prompt: string;
  latest_diff?: string | null;
  latest_total_tokens: number | null;
  latest_cached_input_tokens: number | null;
  latest_run_tokens: number | null;
  latest_run_cached_input_tokens: number | null;
  latest_context_tokens: number | null;
  latest_model_context_window: number | null;
};

export type HistoryPageLoadState = "idle" | "loading" | "loaded" | "error";

export type HistoryTurnHint = {
  slotIndex: number;
  turnId: string | null;
  promptCharacters: number;
  responseCharacters: number;
  promptLines: number;
  responseLines: number;
};

export type HistoryPageDescriptor = {
  id: string;
  pageIndex: number;
  startIndex: number;
  turnCount: number;
  cursor: string | null;
  localOffset: number | null;
};

export type HistoryTranscriptIndex = {
  chatId: number;
  threadId: string | null;
  sourceVersion: string;
  totalTurns: number;
  pageSize: number;
  pages: HistoryPageDescriptor[];
  hints: HistoryTurnHint[];
};

export type ExternalThreadHistoryIndex = Omit<HistoryTranscriptIndex, "chatId"> & {
  requestId: string;
};

export type ExternalTranscriptTurnSummary = {
  slotIndex: number;
  turnId: string | null;
  prompt: string;
  finalMessage: string;
  error: string | null;
  status: string;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  totalTokens: number | null;
  modelContextWindow: number | null;
};

export type ExternalTranscriptSnapshot = {
  requestId: string;
  threadId: string;
  sourceVersion: string;
  totalTurns: number;
  turns: ExternalTranscriptTurnSummary[];
};

export type PreparedHistoricalSummary =
  | { kind: "html"; html: string; sourceHash: string }
  | { kind: "plain"; text: string; sourceHash: string };

export type TranscriptViewportSnapshot = {
  workspaceId: number;
  transcriptIdentity: string;
  transcriptVersion: string;
  viewportWidthBucket: number;
  entryCount: number;
  snapshot: StateSnapshot;
};

export type TaskChatEntry = {
  clientId: string;
  workspaceId: number;
  chatId: number | null;
  turnIndex: number | null;
  historySlotIndex?: number;
  runId: number | null;
  taskId: number | null;
  prompt: string;
  steeredPrompts?: Array<{ id: string; prompt: string; submittedAt: string }>;
  contextFiles?: ComposerContextFile[];
  imageAttachmentDelivery?: {
    status: "preparing" | "sent" | "failed";
    error: string | null;
  };
  executionSettings?: ResolvedRunExecutionSettings;
  submittedAt: string;
  status: RunViewState["status"];
  runView: RunViewState;
  preparedSummary?: PreparedHistoricalSummary;
  historicalActivity?: ({
    source: "default-profile";
    profileKey: "default";
    threadId: string;
    turnId: string;
  } | {
    source: "persisted-run";
    runId: number;
  }) & {
    status: "available" | "loading" | "loaded" | "error";
    nextCursor: string | null;
    error: string | null;
  };
};

export type PreparedHistoricalTurn = {
  entryId: string;
  summary: PreparedHistoricalSummary;
};

export type HistoricalRenderGeneration = {
  generationId: string;
  transcriptKey: string;
  sourceCharacters: number;
  turns: PreparedHistoricalTurn[];
};

export type HistoricalMarkdownWorkerRequest = {
  type: "prepare";
  generationId: string;
  transcriptKey: string;
  turns: Array<{ entryId: string; markdown: string; sourceHash: string }>;
};

export type HistoricalMarkdownWorkerResponse =
  | { type: "prepared"; generation: HistoricalRenderGeneration }
  | { type: "error"; generationId: string; message: string };

export type HistoricalChatOpenRequest = {
  requestId: number;
  chatId: number;
  transcriptVersion: string;
};

export type HistoricalTranscriptState = {
  chatId: number;
  sourceVersion: string;
  complete: boolean;
  firstItemIndex: number;
  positionIntent: "latest" | "preserve";
  openAtLatestRequest: HistoricalChatOpenRequest | null;
  syncStatus: "idle" | "latest" | "syncing" | "complete" | "error";
};

export type ChatOrigin = "orchestrator" | "codex_external";

export type ChatRecord = {
  id: number;
  workspace_id: number;
  account_id: number | null;
  title: string;
  codex_thread_id: string | null;
  status: string;
  /** UI surface that owns the chat. Older callers default to `chat`. */
  surface?: "chat" | "kanban";
  origin: ChatOrigin;
  profile_key: CodexProfileKey | null;
  external_thread_id: string | null;
  source_kind: string | null;
  sync_status: string | null;
  external_cwd: string | null;
  external_created_at: string | null;
  external_updated_at: string | null;
  last_synced_at: string | null;
  native_thread_updated_at?: string | null;
  native_last_synced_at?: string | null;
  native_sync_status?: "synced" | "unavailable" | "error" | null;
  native_workspace_binding_json?: string | null;
  native_workspace_binding_status?:
    | "pending"
    | "reconciling"
    | "ready"
    | "deferred"
    | "error"
    | null;
  native_workspace_binding_error?: string | null;
  native_workspace_binding_updated_at?: string | null;
  collaboration_mode?: "plan" | "default" | null;
  saved_default_collaboration_mode_json?: string | null;
  title_generation_state?: "pending" | "generating" | "complete" | "failed";
  title_fallback?: string | null;
  title_manually_edited?: number;
  title_generation_started_at?: string | null;
  conversation_revision?: number;
  continued_from_chat_id?: number | null;
  continuation_kind?: "chat" | "worktree" | null;
  continuation_snapshot_json?: string | null;
  continuation_settings_json?: string | null;
  continuation_turn_count?: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type ChatListItem = ChatRecord & {
  account_label: string | null;
  account_email: string | null;
  latest_activity_at: string;
  turn_count: number;
  total_tokens: number | null;
  duration_ms: number | null;
  latest_model: string | null;
};

export type ChatWithRuns = {
  chat: ChatListItem;
  runs: RunListItem[];
};

export type WorkspaceHistoryState = {
  status: "idle" | "loading" | "loaded" | "error";
  chats: ChatListItem[];
  error: string | null;
};

export type ChatHistoryContextMenuState = {
  chat: ChatListItem;
  x: number;
  y: number;
};

export type ChatContinuationTurn = {
  turnIndex: number;
  prompt: string;
  finalMessage: string;
  completedPlan: string;
  status: "completed";
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
};

export type ChatContinuationSnapshot = {
  version: 1;
  sourceChatId: number;
  context: string;
  turns: ChatContinuationTurn[];
};

export type HistoryChatLoadState = {
  chatId: number;
  workspaceId: number;
  title: string;
  error: string | null;
};

export type HistoryOpenPhase = "loading" | "hydrating" | "complete";

export type HistoryOpenRequest = {
  requestId: number;
  workspaceId: number;
  chatId: number;
  phase: HistoryOpenPhase;
};

export type WorkspaceChatSession = {
  chatId: number;
  threadId: string | null;
  origin: ChatOrigin;
  profileKey: CodexProfileKey | null;
  externalThreadId: string | null;
  nextTurnIndex: number;
  savedDefaultCollaborationMode?: CollaborationMode | null;
};

export type TokenUsageSnapshot = {
  id: number;
  run_id: number;
  thread_id: string | null;
  turn_id: string | null;
  total_tokens: number;
  input_tokens: number;
  cached_input_tokens: number;
  output_tokens: number;
  reasoning_output_tokens: number;
  run_tokens: number | null;
  run_cached_input_tokens: number | null;
  context_tokens: number | null;
  model_context_window: number | null;
  created_at: string;
};
