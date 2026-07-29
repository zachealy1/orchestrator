import { open } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import { listen } from "@tauri-apps/api/event";
import {
  AlertCircle,
  BarChart3,
  Bell,
  BellOff,
  Bot,
  Check,
  ChevronDown,
  ChevronRight,
  CircleUserRound,
  FileText,
  Folder,
  FolderOpen,
  Gauge,
  GitBranch,
  GitBranchPlus,
  GitCommitHorizontal,
  Loader2,
  LogIn,
  LogOut,
  Monitor,
  Moon,
  PanelRight,
  Pencil,
  Plug,
  Plus,
  RefreshCw,
  Settings,
  SquarePen,
  Sun,
  Trash2,
  UploadCloud,
  UserPlus,
  X,
} from "lucide-react";
import {
  memo,
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { flushSync } from "react-dom";
import type {
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  TransitionEvent as ReactTransitionEvent,
} from "react";
import "./App.css";
import orchestratorMark from "./assets/brand/orchestrator-mark.png";
import {
  buildCommitIntentContext,
  type WorkspaceCommitIntentContext,
} from "./lib/commitMessage";
import {
  clearRunningGitOperation,
  gitOperationFailureCopy,
  gitOperationRetryLabel,
  gitOperationRunningCopy,
  gitOperationSuccessCopy,
  persistRunningGitOperation,
  restoreInterruptedGitOperations,
  type GitOperationPhase,
  type WorkspaceGitOperationRequest,
  type WorkspaceGitOperationState,
} from "./lib/gitOperations";
import {
  appendRunEvent,
  appendRunEvents,
  activateChatAccountHandoff,
  activateExternalTranscriptSnapshot,
  claimChatTitleGeneration,
  chatHasPendingPlanReview,
  completeDuplicateProfileCleanup,
  completeChatTitleGeneration,
  createChat,
  createChatWithQueuedPrompt,
  createCodexAccount,
  createRun,
  createTask,
  enqueuePromptQueueItem,
  failPromptQueueItem,
  getAnalyticsSummary,
  getChatRecord,
  getChatWithRuns,
  getNextChatTurnIndex,
  holdRestoredPromptQueueItems,
  listChatSubagents,
  listPromptQueueItems,
  listLocalChatTranscript,
  listWorkspaceChats,
  listCodexAccounts,
  listDuplicateProfilesPendingCleanup,
  listWorkspaces,
  recordTokenUsage,
  readPromptQueueItem,
  readExternalTranscriptSnapshot,
  recoverAbandonedRuns,
  recoverInterruptedPromptQueueItems,
  recoverInterruptedChatTitleGenerations,
  removePromptQueueItem,
  reorderPromptQueueItems,
  reschedulePromptQueueItemAfterSteeringRace,
  retryPromptQueueItem,
  setPromptQueueItemAutoSend,
  prioritizePromptQueueItem,
  claimPromptQueueItem,
  markPromptQueueItemSteering,
  acceptPromptQueueItem,
  completePromptQueueItem,
  updatePromptQueueItemSnapshot,
  updatePromptQueueItemContextFingerprint,
  advanceChatConversationRevision,
  renameCodexAccount,
  savePreflightReport,
  softDeleteChat,
  softDeleteRun,
  softDeleteWorkspace,
  softDeleteCodexAccount,
  failChatTitleGeneration,
  updateChat,
  updateCodexAccount,
  updateRun,
  updateTaskStatus,
  upsertExternalCodexChats,
  upsertRunSubagent,
  upsertWorkspace,
  type RunEventInput,
} from "./db";
import {
  cancelCodexLogin,
  cancelDefaultProfileThreadTranscript,
  codexDefaultProfileRpc,
  codexRpc,
  commitWorkspaceChanges,
  connectDefaultCodexProfile,
  connectCodex,
  checkoutGitBranch,
  createGitBranch,
  deleteCodexProfile,
  generateWorkspaceCommitMessage,
  generateChatTitle,
  focusBrowserSession,
  inspectPromptQueueContext,
  inspectDroppedContextPaths,
  listGitBranches,
  listCodexModels,
  listCodexSkills,
  listWorkspaceGitStatus,
  listWorkspaceDirectory,
  loadDefaultProfileTurnActivity,
  logoutCodexAccount,
  pushWorkspaceBranch,
  readDefaultCodexFile,
  readCodexFile,
  readCodexAccount,
  readAgentNotificationPermissionStatus,
  readBrowserRuntimeStatus,
  readBrowserSessionStatus,
  readProjectedSubagentThread,
  readWorkspaceGitDiff,
  readWorkspaceFilePreview,
  resolveCodexServerRequest,
  resolveDefaultCodexServerRequest,
  removeAgentNotification,
  requestAgentNotificationPermission,
  prepareBrowserSession,
  probeLocalWebPreview,
  runPreflight,
  setThreadGoal,
  startCodexLogin,
  stopCodex,
  stopDefaultCodexProfile,
  stopBrowserSession,
  sendAgentNotification,
  syncDefaultProfileThreadTranscript,
  takePendingAgentNotificationActivation,
  updateBrowserSessionTarget,
  undoWorkspaceGitDiff,
  openAgentNotificationSettings,
} from "./codexClient";
import {
  fallbackChatTitle,
  sanitizeGeneratedChatTitle,
} from "./lib/chatTitles";
import { AnalyticsSummary } from "./components/AnalyticsSummary";
import {
  ComposerSelect,
  type ComposerSelectOption,
} from "./components/ComposerSelect";
import { FilePreviewDrawer } from "./components/FilePreviewDrawer";
import type { TaskChatEntry } from "./components/TaskChatTranscript";
import {
  VirtuosoTaskChatTranscript,
  type TranscriptNotificationFocusRequest,
  type TranscriptViewportSnapshot,
  type VirtuosoTaskChatTranscriptHandle,
} from "./components/VirtuosoTaskChatTranscript";
import { TaskTranscriptErrorBoundary } from "./components/TaskTranscriptErrorBoundary";
import { TaskComposer } from "./components/TaskComposer";
import { SubagentInspector } from "./components/SubagentInspector";
import {
  FLOATING_STATUS_NOTICE_TIMEOUT_MS,
  FloatingHeaderStatusBubble,
  type FloatingStatusNotice,
} from "./components/FloatingHeaderStatusBubble";
import {
  addApprovalRequest,
  addServerRequest,
  applyCodexMessage,
  emptyRunView,
  markApprovalAwaitingResolution,
  markApprovalError,
  markApprovalSubmitting,
  parseUnifiedDiffFiles,
  resolveApprovalRequest,
  resolveServerRequest,
  setServerRequestSubmissionState,
  updateNativePlanReview,
  updateRunElapsed,
  type RunEditedFile,
  type RunViewState,
} from "./lib/codexEventReducer";
import {
  findSafeApprovalDenialChoice,
  parseApprovalRequest,
  type ActivePlaywrightToolCall,
  type ApprovalChoice,
  type CodexApprovalRequest,
} from "./lib/codexApprovals";
import { selectRunControlForIds } from "./lib/runControlRouting";
import {
  ASK_FOR_APPROVAL_PERMISSION_PROFILE,
  accessModeWarning,
  accessSettings,
  persistCodexAccessPreference,
  readCodexAccessPreference,
  type CodexAccessSettings,
} from "./lib/codexAccess";
import {
  persistComputerUsePreference,
  readComputerUsePreference,
} from "./lib/computerUse";
import {
  createRunExecutionSettings,
  resolveStoredRunExecutionSettings,
  serializeRunExecutionSettings,
} from "./lib/runExecutionSettings";
import {
  comparePromptQueueDisplayOrder,
  comparePromptQueueDispatchOrder,
  createPromptQueueItemId,
  createQueuedPromptSnapshot,
  isPromptQueueItemAutoDispatchEligible,
  isPromptQueueItemMutable,
  isPromptQueueItemPending,
  rebaselinePromptQueueContextFingerprint,
  validatePromptQueueDraft,
} from "./lib/promptQueue";
import {
  buildCodexTurnInput,
  isImageContextFile,
  normalizeContextFileMedia,
  prepareContextImageFiles,
} from "./lib/imageAttachments";
import {
  createStableClientMessageId,
  isCollaborationModeMask,
  isNativeUserInputRequest,
  requestKey,
  selectNativePlanModes,
  type CollaborationMode,
  type CollaborationModeMask,
  type NativeUserInputRequest,
  type RunIntent,
  type UserInputResponse,
} from "./lib/nativePlanMode";
import {
  deriveGoalProgressIndicator,
  goalKeepsRunOpen,
  parseThreadGoal,
  type GoalProgressAction,
  type ThreadGoalSetResponse,
  type ThreadGoalState,
  type ThreadGoalStatus,
} from "./lib/goalProgress";
import { derivePlanProgressIndicator } from "./lib/planProgress";
import {
  findSubagentByThread,
  getConversationSubagents,
  isActiveSubagentStatus,
  lifecycleFromChildTurn,
  lifecycleFromCollabToolCall,
  parseCollabToolCalls,
  parseLegacySubagentActivity,
  promoteSubagentConversation,
  replaceConversationSubagents,
  subagentConversationKey,
  updateSubagentByThread,
  upsertConversationSubagent,
  type SubagentRecord,
} from "./lib/subagents";
import { parseProposedPlanEnvelope } from "./lib/proposedPlan";
import {
  getContextUsageDisplay,
  parseThreadTokenUsage,
} from "./lib/contextUsage";
import {
  formatCodexAuthMessage,
  formatCodexPlanType,
  getCodexAccountSummary,
  formatLoginStartStatus,
  isCodexSignedIn,
  shouldBlockRunForAuth,
} from "./lib/codexAuth";
import {
  cancelHistoricalTranscriptPreparation,
  HISTORICAL_RENDER_PIPELINE_VERSION,
  prepareHistoricalTranscript,
} from "./lib/historicalTranscriptPreparation";
import {
  captureTranscriptViewportAnchor,
  restoreTranscriptViewportAnchor,
  type TranscriptViewportAnchor,
} from "./lib/transcriptScrollAnchor";
import {
  historyDrawerReservesSpace,
  historyDrawerTargetsOpen,
  type HistoryDrawerPhase,
} from "./lib/historyDrawerTransition";
import {
  buildRunPrompt,
  estimateTokens,
  improvePrompt,
} from "./lib/taskAnalysis";
import {
  coalesceFrameBatchedCodexMessages,
  shouldFrameBatchCodexMessage,
} from "./lib/codexNotificationBatch";
import {
  commandOutputTail,
  extractLocalWebPreviewCandidates,
  parsePersistedRunWebPreview,
  readWebPreviewCommandSignal,
  serializeRunWebPreview,
  type RunWebPreview,
} from "./lib/webPreview";
import {
  applyResolvedTheme,
  applyThemePreference,
  persistThemePreference,
  readThemePreference,
  resolveTheme,
  watchSystemTheme,
} from "./lib/theme";
import {
  restorePromptInlineFileReferencesForComposer,
  serializePromptInlineFileReferences,
} from "./lib/contextFiles";
import {
  registerNativeContextFileDrop,
  type NativeContextFileDropEvent,
} from "./lib/nativeContextFileDrop";
import {
  useMacOsWindowDragRegionsEnabled,
  windowDragRegionValue,
} from "./lib/windowDragging";
import {
  buildSafeAgentNotificationCopy,
  createAgentNotificationEventKey,
  isAgentNotificationTargetNavigable,
  persistAgentNotificationPreferences,
  readAgentNotificationPreferences,
  recordAgentNotificationDelivered,
  shouldSendAgentNotification,
  wasAgentNotificationDelivered,
  type AgentNotificationKind,
  type AgentNotificationPermissionStatus,
  type AgentNotificationPreferences,
  type AgentNotificationTarget,
} from "./lib/agentNotifications";
import type {
  AccountLoginCompletedNotification,
  AccountUpdatedNotification,
  AdditionalContextEntry,
  AnalyticsSummary as AnalyticsSummaryType,
  ChatListItem,
  ChatOrigin,
  BrowserRuntimeStatus,
  BrowserSessionState,
  PreparedBrowserSession,
  ChatRecord,
  CodexAccount,
  CodexAccessMode,
  CodexAccountProfile,
  CodexAccountStatus,
  CodexMessage,
  CodexMessageEvent,
  CodexLoginState,
  CodexModel,
  CodexSkillSummary,
  ComposerMentionSearchStatus,
  CodexProcessEvent,
  CodexProfileKey,
  ComposerContextFile,
  OssProvider,
  PreflightReport,
  PromptQueueContextFingerprint,
  PromptQueueItem,
  RunExecutionSettings,
  RunInteractionMode,
  SelectedComposerSkill,
  SlashCommandItem,
  SlashCommandSearchStatus,
  ThemePreference,
  Workspace,
  WorkspaceFilePreview,
  WorkspaceGitDiff,
  WorkspaceGitFileStatus,
  WorkspaceGitStatusSnapshot,
  WorkspacePreviewState,
  WorkspaceTreeEntry,
  HistoryRunSummary,
  ExternalTranscriptSnapshot,
  HistoricalChatOpenRequest,
  HistoricalTranscriptState,
} from "./types";

const DEFAULT_ANALYTICS: AnalyticsSummaryType = {
  run_count: 0,
  completed_count: 0,
  failed_count: 0,
  total_tokens: 0,
  cached_tokens: 0,
  avg_duration_ms: null,
};

const PREVIEW_DRAWER_DEFAULT_WIDTH = 520;
const PREVIEW_DRAWER_MIN_WIDTH = 360;
const PREVIEW_DRAWER_VIEWPORT_GUTTER = 360;
const PREVIEW_DRAWER_RESIZE_STEP = 40;
const PREVIEW_DRAWER_RESIZE_LARGE_STEP = 80;
const DIFF_DRAWER_PREFERRED_WIDTH = 860;
const DIFF_SIDE_BY_SIDE_MIN_WIDTH = 760;
const DEFAULT_CONTEXT_WINDOW = 258_400;
const GIT_STATUS_AUTO_REFRESH_INTERVAL_MS = 3000;
const BACKGROUND_REFRESH_RETRY_MS = 500;
const BACKGROUND_INTERACTION_GRACE_MS = 700;
const HISTORY_CHAT_PAGE_SIZE = 20;
const HISTORY_CHAT_CACHE_LIMIT = 5;
const HISTORY_CHAT_CACHE_SOURCE_CHARACTER_BUDGET = 2_000_000;
const HISTORY_ACTIVITY_PAGE_SIZE = 50;
const HISTORY_ACTIVITY_CACHE_LIMIT = 200;
const HISTORY_VIRTUOSO_BASE_INDEX = 1_000_000;
const HISTORY_TRANSCRIPT_COMMIT_IDLE_MS = 150;
const HISTORY_TRANSCRIPT_RESIZE_IDLE_MS = 120;
const HISTORY_TRANSCRIPT_RESIZE_WAIT_LIMIT_MS = 500;
const AGENT_NOTIFICATION_FOCUS_TIMEOUT_MS = 5_000;
const HISTORY_DRAWER_TRANSITION_FALLBACK_MS = 240;
const RUN_EVENT_BATCH_DELAY_MS = 100;
const RUN_EVENT_BATCH_MAX_SIZE = 50;
const WEB_PREVIEW_PROBE_RETRY_DELAYS_MS = [0, 250, 750, 1_500, 2_500] as const;
const RUN_NOTIFICATION_BINDING_TTL_MS = 30_000;
const RUN_NOTIFICATION_BINDING_BUFFER_LIMIT = 100;
const COMMIT_MESSAGE_GENERATION_ERROR =
  "Could not generate a commit message. Enter a message manually or try again.";
const BUFFERABLE_RUN_NOTIFICATION_METHODS = new Set([
  "item/completed",
  "item/started",
  "thread/started",
  "thread/status/changed",
  "thread/tokenUsage/updated",
  "turn/completed",
  "turn/diff/updated",
  "turn/plan/updated",
  "turn/started",
]);
const EMPTY_GIT_STATUS_BY_PATH = new Map<string, WorkspaceGitFileStatus>();
const EMPTY_DIRTY_DIRECTORY_PATHS = new Set<string>();
const DEFAULT_CODEX_PROFILE_KEY: CodexProfileKey = "default";
const EXTERNAL_CODEX_SOURCE_KINDS = ["vscode", "appServer", "cli"];

type AppView = "task" | "analytics" | "settings";

function approvalNotificationEventKey(request: CodexApprovalRequest) {
  return createAgentNotificationEventKey(
    "approval-required",
    request.profileKey,
    request.key,
  );
}

function userInputNotificationEventKey(
  profileKey: CodexProfileKey,
  request: NativeUserInputRequest,
) {
  return createAgentNotificationEventKey(
    "user-input-required",
    profileKey,
    request.params.threadId,
    request.params.turnId,
    requestKey(request),
  );
}

function planNotificationEventKey(
  profileKey: CodexProfileKey | null,
  entry: Pick<TaskChatEntry, "runId" | "runView">,
) {
  return createAgentNotificationEventKey(
    "plan-ready",
    profileKey,
    entry.runView.threadId,
    entry.runView.turnId,
    entry.runView.nativePlan.planItemId,
    entry.runId,
  );
}

function externalActionNotificationEventKey(
  accountId: number,
  loginId: string,
) {
  return createAgentNotificationEventKey("external-action", accountId, loginId);
}

function agentNotificationPermissionLabel(
  permission: AgentNotificationPermissionStatus,
) {
  switch (permission) {
    case "allowed":
      return "Allowed";
    case "not-enabled":
      return "Not enabled";
    case "denied":
      return "Denied";
    case "unavailable":
      return "Unavailable";
  }
}

function createTaskChatClientId() {
  return `chat-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

function waitForNextPaint() {
  return new Promise<void>((resolve) => {
    const scheduleFrame =
      typeof requestAnimationFrame === "function"
        ? requestAnimationFrame
        : (callback: FrameRequestCallback) => {
            setTimeout(() => callback(performance.now()), 0);
            return 0;
          };
    scheduleFrame(() => {
      setTimeout(resolve, 0);
    });
  });
}

function useStableEvent<T extends (...args: never[]) => unknown>(callback: T): T {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  return useCallback(
    ((...args: Parameters<T>) => callbackRef.current(...args)) as T,
    [],
  );
}

function replaceChatEntries(
  current: TaskChatEntry[],
  workspaceId: number,
  chatId: number,
  entries: TaskChatEntry[],
) {
  return [
    ...current.filter(
      (entry) => entry.workspaceId !== workspaceId || entry.chatId !== chatId,
    ),
    ...entries,
  ];
}

function workspaceTreeEntriesEqual(
  left: WorkspaceTreeEntry[] | undefined,
  right: WorkspaceTreeEntry[],
) {
  if (!left || left.length !== right.length) return false;
  return left.every((entry, index) => {
    const candidate = right[index];
    return (
      candidate !== undefined &&
      entry.name === candidate.name &&
      entry.path === candidate.path &&
      entry.relativePath === candidate.relativePath &&
      entry.kind === candidate.kind
    );
  });
}

function mergeCommandActivities(
  current: RunViewState["commands"],
  incoming: RunViewState["commands"],
) {
  const byId = new Map(current.map((command) => [command.id, command]));
  incoming.forEach((command) => byId.set(command.id, command));
  return [...byId.values()];
}

function mergeEditedFileActivities(
  current: RunViewState["editedFiles"],
  incoming: RunViewState["editedFiles"],
) {
  const byPath = new Map(current.map((file) => [file.path, file]));
  incoming.forEach((file) => byPath.set(file.path, file));
  return [...byPath.values()];
}

function historyChatVersion(chat: ChatListItem) {
  return [
    chat.external_updated_at ?? "",
    chat.latest_activity_at,
    chat.updated_at,
    chat.turn_count,
  ].join(":");
}

function historyActivityTime(value: string | null | undefined) {
  if (!value) return Number.NEGATIVE_INFINITY;
  const sqliteTimestamp =
    /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(value)
      ? `${value.replace(" ", "T")}Z`
      : value;
  const timestamp = Date.parse(sqliteTimestamp);
  return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY;
}

function sortHistoryChatsByActivity(
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

class RunStoppedError extends Error {
  constructor() {
    super("Run stopped by user.");
    this.name = "RunStoppedError";
  }
}

type ActiveRunControl = {
  accountId: number;
  profileKey: CodexProfileKey;
  workspaceId: number;
  clientId: string;
  promptFallback: string;
  imageContextFilesFallback: ComposerContextFile[];
  chatId: number | null;
  stopped: boolean;
  taskId: number | null;
  runId: number | null;
  setupStarted: boolean;
  cancelScheduledSetup: (() => void) | null;
  interactionMode: RunInteractionMode;
  acceptsThreadContinuation: boolean;
  goal: ThreadGoalState | null;
  goalActionPending: GoalProgressAction | null;
  goalActionError: string | null;
  goalTurnCompleted: boolean;
  threadId: string | null;
  turnId: string | null;
  intent: RunIntent;
  clientUserMessageId: string;
  executionSettings: RunExecutionSettings;
  entry: TaskChatEntry | null;
  runView: RunViewState;
  eventSequence: number;
  queueItemId: string | null;
  queueAdvanceBlocked: boolean;
  browserSession: PreparedBrowserSession | null;
  activePlaywrightToolCalls: Map<string, ActivePlaywrightToolCall>;
  webPreviewDetection: WebPreviewDetectionState;
};

type WebPreviewCommandBuffer = {
  command: string;
  output: string;
};

type WebPreviewProbeAttempt = {
  sequence: number;
  sourceCommandId: string;
  timers: Set<number>;
};

type WebPreviewDetectionState = {
  commands: Map<string, WebPreviewCommandBuffer>;
  probes: Map<string, WebPreviewProbeAttempt>;
  nextSequence: number;
  confirmedSequence: number;
  disposed: boolean;
};

function isActiveRunControl(control: ActiveRunControl) {
  return (
    !control.stopped &&
    (control.runView.status === "connecting" ||
      control.runView.status === "running")
  );
}

type RunAccessSettings = CodexAccessSettings;

type RunSetupSnapshot = {
  promptText: string;
  promptFallback: string;
  workspace: Workspace;
  accountId: number;
  account: CodexAccountProfile | null;
  profileKey: CodexProfileKey;
  chatOrigin: ChatOrigin;
  externalThreadId: string | null;
  selectedBranch: string | null;
  cachedPreflight: PreflightReport | null;
  mode: "plan" | "run";
  intent?: RunIntent;
  clientUserMessageId?: string;
  access: RunAccessSettings;
  computerUseEnabled: boolean;
  model: string | null;
  effort: string | null;
  useOss: boolean;
  ossProvider: OssProvider;
  improvedPrompt: string;
  contextFiles: ComposerContextFile[];
  selectedSkills: SelectedComposerSkill[];
  goalMode: boolean;
  loginState: CodexLoginState;
  chatId: number | null;
  threadId: string | null;
  turnIndex: number;
  threadStrategy: RunThreadStrategy;
  previousChatContext?: string | null;
  handoffContextBudgetTokens?: number;
  supersededRunIds?: number[];
  replacementClientId?: string | null;
  restoreEntryOnSetupFailure?: TaskChatEntry | null;
  restorePromptOnSetupFailure?: boolean;
  sourcePlanEntry?: TaskChatEntry;
  defaultCollaborationMode?: CollaborationMode | null;
  executionSettings: RunExecutionSettings;
  queueItemId?: string | null;
  fromQueue?: boolean;
};

type PromptQueueComposerEditState = {
  item: PromptQueueItem;
  previousComposer: Pick<
    WorkspaceTaskMemory,
    "prompt" | "contextFiles" | "selectedSkills"
  > & {
    selectedModelId: string | null;
    selectedReasoningEffort: string | null;
    goalMode: boolean;
    planMode: boolean;
  };
  status: "editing" | "saving";
  error: string | null;
};

type PromptQueuePauseReason =
  | "restart"
  | "failure"
  | "stale"
  | "workflow"
  | "manual";

type WorkspaceHistoryState = {
  status: "idle" | "loading" | "loaded" | "error";
  chats: ChatListItem[];
  error: string | null;
};

type LoadWorkspaceHistoryOptions = {
  syncExternal?: boolean;
  showLoading?: boolean;
};

type HistoryChatLoadState = {
  chatId: number;
  workspaceId: number;
  title: string;
  error: string | null;
};

type ChatTitleGenerationRequest = {
  chatId: number;
  workspacePath: string;
  accountId: number;
  model: string | null;
  initialPrompt: string;
  fallbackTitle: string;
};

type HistoryOpenPhase = "loading" | "hydrating" | "complete";

type HistoryOpenRequest = {
  requestId: number;
  workspaceId: number;
  chatId: number;
  phase: HistoryOpenPhase;
};

type AgentNotificationNavigationPhase =
  | "resolving"
  | "opening-chat"
  | "focusing"
  | "complete";

type AgentNotificationNavigationState = {
  requestId: number;
  target: AgentNotificationTarget;
  phase: AgentNotificationNavigationPhase;
};

type AgentNotificationNavigationResult =
  | "complete"
  | "terminal"
  | "retryable";

type PendingAgentNotificationFocus = {
  requestId: number;
  timeoutId: number;
  resolve: (found: boolean) => void;
};

type PendingApprovalAttention = {
  accountId: number;
  request: CodexApprovalRequest;
  target: AgentNotificationTarget;
};

function pendingApprovalMatchesEntry(
  attention: PendingApprovalAttention,
  entry: TaskChatEntry,
) {
  const { request, target } = attention;
  if (
    target.workspaceId !== null &&
    target.workspaceId !== undefined &&
    target.workspaceId !== entry.workspaceId
  ) {
    return false;
  }
  if (
    target.chatId !== null &&
    target.chatId !== undefined &&
    target.chatId !== entry.chatId
  ) {
    return false;
  }
  if (target.runId !== null && target.runId !== undefined) {
    return target.runId === entry.runId;
  }
  if (
    request.threadId &&
    entry.runView.threadId &&
    request.threadId !== entry.runView.threadId
  ) {
    return false;
  }
  if (
    request.turnId &&
    entry.runView.turnId &&
    request.turnId !== entry.runView.turnId
  ) {
    return false;
  }
  return Boolean(
    (request.threadId && entry.runView.threadId) ||
      (request.turnId && entry.runView.turnId),
  );
}

function pendingApprovalCouldBelongToControl(
  attention: PendingApprovalAttention,
  control: ActiveRunControl,
) {
  const { request, target } = attention;
  const child =
    request.threadId && request.profileKey === control.profileKey
      ? findSubagentByThread(request.profileKey, request.threadId)
      : null;
  const belongsToChild = child?.ownerClientId === control.clientId;
  if (
    !isActiveRunControl(control) ||
    request.profileKey !== control.profileKey
  ) {
    return false;
  }
  if (
    target.entryClientId &&
    target.entryClientId !== control.clientId
  ) {
    return false;
  }
  if (
    target.runId !== null &&
    target.runId !== undefined &&
    target.runId !== control.runId
  ) {
    return false;
  }
  if (
    target.workspaceId !== null &&
    target.workspaceId !== undefined &&
    target.workspaceId !== control.workspaceId
  ) {
    return false;
  }
  if (
    target.chatId !== null &&
    target.chatId !== undefined &&
    target.chatId !== control.chatId
  ) {
    return false;
  }
  if (
    request.threadId &&
    control.threadId &&
    request.threadId !== control.threadId &&
    !belongsToChild
  ) {
    return false;
  }
  if (request.turnId && belongsToChild && child?.childTurnId) {
    if (request.turnId !== child.childTurnId) return false;
  } else if (
    request.turnId &&
    control.turnId &&
    request.turnId !== control.turnId &&
    !control.acceptsThreadContinuation
  ) {
    return false;
  }
  const requestReceivedAt = Date.parse(request.receivedAt);
  const runStartedAt = control.runView.startedAt
    ? Date.parse(control.runView.startedAt)
    : Number.NaN;
  if (
    Number.isFinite(requestReceivedAt) &&
    Number.isFinite(runStartedAt) &&
    requestReceivedAt < runStartedAt
  ) {
    return false;
  }
  return true;
}

function approvalRequestMatchesRun(
  request: CodexApprovalRequest,
  profileKey: CodexProfileKey,
  threadId: string | null,
  turnId: string | null,
) {
  if (request.profileKey !== profileKey) return false;
  if (turnId && request.turnId) {
    return (
      request.turnId === turnId &&
      (!threadId || !request.threadId || request.threadId === threadId)
    );
  }
  return Boolean(
    threadId &&
      request.threadId &&
      request.threadId === threadId,
  );
}

type SelectHistoryChatOptions = {
  source?: "drawer" | "notification" | "workspace";
  workspace?: Workspace;
  positionIntent?: HistoricalTranscriptState["positionIntent"];
};

type StableHistoryChatCacheEntry = {
  version: string;
  renderVersion: string;
  entries: TaskChatEntry[];
  transcript: HistoricalTranscriptState;
  sourceCharacters: number;
};

type WorkspaceChatSession = {
  chatId: number;
  threadId: string | null;
  origin: ChatOrigin;
  profileKey: CodexProfileKey | null;
  externalThreadId: string | null;
  nextTurnIndex: number;
  savedDefaultCollaborationMode?: CollaborationMode | null;
};

type SubagentInspectorTarget = {
  conversationKey: string;
  subagentId: string;
};

type PendingAccountHandoff = {
  workspaceId: number;
  chatId: number;
  fromProfileKey: CodexProfileKey | null;
  fromThreadId: string | null;
  targetAccountId: number;
  targetProfileKey: CodexProfileKey;
};

type AccountHandoffRunStrategy = PendingAccountHandoff & {
  adoptingExternalChat: boolean;
};

type RunThreadStrategy =
  | { kind: "resume" }
  | { kind: "fresh" }
  | { kind: "handoff"; handoff: AccountHandoffRunStrategy };

type AccountHandoffCandidate = PendingAccountHandoff & {
  fromLabel: string;
  targetLabel: string;
  status: "idle" | "selecting";
  error: string | null;
};

type PlanImplementationDialogState = {
  requestId: number;
  workspaceId: number;
  chatId: number;
  entry: TaskChatEntry;
  allowDefaultProfile: boolean;
  accountId: number;
  profileKey: CodexProfileKey;
  models: CodexModel[];
  selectedModelId: string | null;
  reasoningEffort: string | null;
  status: "loading" | "idle" | "starting";
  error: string | null;
};

type BranchCreationDialogState = {
  workspace: Workspace;
  baseBranch: string | null;
  branchName: string;
  status: "idle" | "creating";
  error: string | null;
};

type GoalEditCandidate = {
  workspaceId: number;
  clientId: string;
  objective: string;
  status: "idle" | "stopping";
  error: string | null;
};

type GoalTerminationState = {
  workspaceId: number;
  clientId: string;
  action: Extract<GoalProgressAction, "stopping" | "editing">;
};

type StopActiveRunResult = {
  stopped: boolean;
  goalCleared: boolean;
};

type PlanFollowUpExecutionSelection = {
  accountId: number;
  profileKey: CodexProfileKey;
  model: CodexModel | null;
  reasoningEffort: string | null;
};

export type AccountHandoffContextTurn = {
  turnIndex: number;
  prompt: string;
  finalMessage: string;
  completedPlan: string;
  intent: RunIntent | null;
  planReviewState: string | null;
};

type WorkspaceTaskSelection =
  | { kind: "new" }
  | { kind: "draft"; clientId: string }
  | { kind: "chat"; session: WorkspaceChatSession };

type WorkspaceTaskMemory = {
  selection: WorkspaceTaskSelection;
  prompt: string;
  contextFiles: ComposerContextFile[];
  selectedSkills: SelectedComposerSkill[];
  historicalTranscript: HistoricalTranscriptState | null;
  transcriptViewportSnapshot: TranscriptViewportSnapshot | null;
};

type CommitMessageGenerationSnapshot = {
  accountId: number | null;
  includeUnstaged: boolean;
  model: string | null;
  intentContext: WorkspaceCommitIntentContext | null;
  files: WorkspaceGitFileStatus[];
  changeKey: string;
};

type HeaderGitAction =
  | {
      label: string;
      disabled: false;
      canCommit: boolean;
      canPush: boolean;
      statusLabel: string;
      statusKind: "checking" | "error" | "clean" | "changed" | "ahead";
      reason?: string;
    }
  | {
      label: string;
      disabled: true;
      canCommit: false;
      canPush: false;
      statusLabel: string;
      statusKind: "disabled";
      reason: string;
    };

type ExplorerPointerDrag = {
  active: boolean;
  workspace: Workspace;
  entry: WorkspaceTreeEntry;
  file: ComposerContextFile;
  pointerId: number;
  startX: number;
  startY: number;
};

type ExplorerDragPreview = {
  fileName: string;
  x: number;
  y: number;
  overDropSurface: boolean;
};

type PendingFrameCodexNotification = {
  message: CodexMessage;
  profileKey: CodexProfileKey;
};

type PendingRunBindingNotification = {
  accountId: number;
  profileKey: CodexProfileKey;
  message: CodexMessage;
  receivedAt: number;
};

function readCodexMessageRunIdentity(message: CodexMessage) {
  const params = readObject(message.params);
  return {
    threadId:
      readString(params.threadId) ?? readString(readObject(params.thread).id),
    turnId:
      readString(params.turnId) ?? readString(readObject(params.turn).id),
  };
}

function readSubagentTurnStatus(message: CodexMessage) {
  const params = readObject(message.params);
  const turn = readObject(params.turn);
  return readString(turn.status) ?? readString(params.status);
}

function readSubagentVisibleResult(message: CodexMessage) {
  if (message.method !== "item/completed") return null;
  const params = readObject(message.params);
  const item = readObject(params.item);
  if (readString(item.type) !== "agentMessage") return null;
  const phase = readString(item.phase);
  if (phase && phase !== "final_answer") return null;
  const text =
    readString(item.text) ??
    readString(item.content) ??
    (Array.isArray(item.content)
      ? item.content
          .map((part) => {
            if (typeof part === "string") return part;
            return readString(readObject(part).text) ?? "";
          })
          .filter(Boolean)
          .join("\n")
      : null);
  return text?.trim() || null;
}

function readSubagentError(message: CodexMessage) {
  const params = readObject(message.params);
  const turn = readObject(params.turn);
  const error = params.error ?? turn.error;
  if (typeof error === "string") return error;
  const record = readObject(error);
  return (
    readString(record.message) ??
    readString(record.error) ??
    (Object.keys(record).length > 0 ? JSON.stringify(record) : null)
  );
}

function markPerformance(name: string) {
  if (
    typeof performance !== "undefined" &&
    typeof performance.mark === "function"
  ) {
    performance.mark(name);
  }
}

function scheduleAfterNextPaint(callback: () => void) {
  let cancelled = false;
  let frameId: number | null = null;
  let timeoutId: number | null = null;

  const runCallback = () => {
    timeoutId = null;
    if (!cancelled) {
      callback();
    }
  };

  if (typeof window === "undefined") {
    timeoutId = setTimeout(runCallback, 0) as unknown as number;
  } else {
    frameId = window.requestAnimationFrame(() => {
      frameId = null;
      timeoutId = window.setTimeout(runCallback, 0);
    });
  }

  return () => {
    cancelled = true;
    if (typeof window !== "undefined" && frameId !== null) {
      window.cancelAnimationFrame(frameId);
    }
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }
  };
}

const BUILTIN_SLASH_COMMANDS: SlashCommandItem[] = [
  {
    kind: "builtin",
    command: "plan",
    title: "Plan mode",
    description: "Turn on plan-first routing for this task",
  },
  {
    kind: "builtin",
    command: "goal",
    title: "Goal",
    description: "Keep Codex working toward a persistent objective",
  },
  {
    kind: "builtin",
    command: "reasoning",
    title: "Reasoning",
    description: "Choose the reasoning effort for the selected agent",
  },
  {
    kind: "builtin",
    command: "compact",
    title: "Compact",
    description: "Summarize the current thread context when available",
  },
  {
    kind: "builtin",
    command: "status",
    title: "Status",
    description: "Show workspace, account, model, token, and run metadata",
  },
  {
    kind: "builtin",
    command: "review",
    title: "Code review",
    description: "Prepare a review prompt for current git changes",
  },
  {
    kind: "builtin",
    command: "mcp",
    title: "MCP",
    description: "Show connected tools and server status when available",
  },
  {
    kind: "builtin",
    command: "init",
    title: "Init",
    description: "Prepare a prompt to create or update AGENTS.md",
  },
];

const THEME_OPTIONS: Array<{
  value: ThemePreference;
  label: string;
  icon: typeof Sun;
}> = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

type AuthRowState = {
  title: string;
  subtitle: string;
  avatarLabel: string;
  tone: "default" | "waiting" | "failed" | "signed-in";
};

type WorkspaceDirectoryState = {
  status: "loading" | "loaded" | "error";
  entries: WorkspaceTreeEntry[];
  error: string | null;
};

type WorkspaceGitStatusState = {
  status: "idle" | "loading" | "loaded" | "error";
  snapshot: WorkspaceGitStatusSnapshot | null;
  error: string | null;
};

type WorkspaceContextMenuState = {
  workspace: Workspace;
  x: number;
  y: number;
};

type ChatHistoryContextMenuState = {
  chat: ChatListItem;
  x: number;
  y: number;
};

type WorkspaceGitSummary = {
  total: number;
  modified: number;
  added: number;
  deleted: number;
  untracked: number;
  conflicted: number;
  additions: number;
  deletions: number;
};

type RefreshWorkspaceGitStatusOptions = {
  showLoading?: boolean;
  background?: boolean;
  force?: boolean;
};

type OpenWorkspaceFilePreviewOptions = {
  forceRefresh?: boolean;
  mode?: "preview" | "diff";
};

function workspaceCacheKey(workspacePath: string, childPath: string) {
  return `${workspacePath}\u0000${childPath}`;
}

function gitStatusSnapshotKey(snapshot: WorkspaceGitStatusSnapshot | null) {
  if (!snapshot) {
    return "";
  }

  const files = snapshot.files
    .map((file) =>
      [
        file.relativePath,
        file.oldRelativePath ?? "",
        file.indexStatus,
        file.worktreeStatus,
        file.statusKind,
        file.badge,
      ].join("\u0000"),
    )
    .sort()
    .join("\u0001");

  return [
    snapshot.workspacePath,
    snapshot.gitRoot,
    snapshot.additions ?? "",
    snapshot.deletions ?? "",
    files,
  ].join("\u0002");
}

function summarizeWorkspaceGitStatus(
  snapshot: WorkspaceGitStatusSnapshot | null,
): WorkspaceGitSummary {
  return summarizeWorkspaceGitFiles(
    snapshot?.files ?? [],
    snapshot?.additions,
    snapshot?.deletions,
  );
}

function summarizeWorkspaceGitFiles(
  files: WorkspaceGitFileStatus[],
  additions?: number,
  deletions?: number,
): WorkspaceGitSummary {
  const summary: WorkspaceGitSummary = {
    total: files.length,
    modified: 0,
    added: 0,
    deleted: 0,
    untracked: 0,
    conflicted: 0,
    additions: additions ?? 0,
    deletions: deletions ?? 0,
  };

  files.forEach((file) => {
    if (file.statusKind === "modified") {
      summary.modified += 1;
    } else if (
      file.statusKind === "added" ||
      file.statusKind === "copied" ||
      file.statusKind === "renamed"
    ) {
      summary.added += 1;
    } else if (file.statusKind === "deleted") {
      summary.deleted += 1;
    } else if (file.statusKind === "untracked") {
      summary.untracked += 1;
    } else if (file.statusKind === "conflicted") {
      summary.conflicted += 1;
    }
  });

  if (additions === undefined && deletions === undefined) {
    summary.additions = summary.modified + summary.added + summary.untracked;
    summary.deletions = summary.deleted + summary.conflicted;
  }

  return summary;
}

function filesIncludedInCommitMessage(
  files: WorkspaceGitFileStatus[],
  includeUnstaged: boolean,
) {
  if (includeUnstaged) {
    return files;
  }

  return files.filter(
    (file) =>
      file.indexStatus !== " " &&
      file.indexStatus !== "?" &&
      file.indexStatus !== "",
  );
}

function gitChangeFingerprint(
  workspacePath: string | null,
  files: WorkspaceGitFileStatus[],
  summary: WorkspaceGitSummary,
  includeUnstaged: boolean,
) {
  return [
    workspacePath ?? "",
    includeUnstaged ? "all" : "staged",
    summary.additions,
    summary.deletions,
    ...files
      .map((file) =>
        [
          file.relativePath,
          file.oldRelativePath ?? "",
          file.indexStatus,
          file.worktreeStatus,
          file.statusKind,
          file.badge,
        ].join(":"),
      )
      .sort(),
  ].join("\u0001");
}

class DuplicateCodexAccountError extends Error {
  constructor(
    readonly duplicateAccountId: number,
    readonly existingAccountId: number,
    email: string,
  ) {
    super(`${email} is already added to Orchestrator.`);
    this.name = "DuplicateCodexAccountError";
  }
}

const TASK_QUOTES = [
  "You prompting me?",
  "You scoping this, or am I?",
  "Are you talking to the agent?",
  "You had me at clear requirements.",
  "To production and beyond.",
  "To plan mode and beyond.",
  "To clean context and beyond.",
  "To the repo and beyond.",
  "I am your planner.",
  "I am your context.",
  "No, I am your workflow.",
  "Search your feelings. You know it needs tests.",
  "The prompt is strong with this one.",
  "May the context be with you.",
  "Use the plan, Luke.",
  "This is the prompt you're looking for.",
  "The agents are standing by.",
  "Houston, we have a scope problem.",
  "We're gonna need a better prompt.",
  "I'll be back... with a clearer plan.",
  "Say hello to my little task.",
  "Here's looking at you, codebase.",
  "Keep your prompts close and your acceptance criteria closer.",
  "One does not simply run an agent without scope.",
  "There's no place like prod... but let's test first.",
  "The first rule of Orchestrator: clarify the task.",
  "With great automation comes great approval gates.",
  "Life finds a way. Agents find edge cases.",
  "The code must flow.",
  "Open the pod bay doors? Not without approval.",
  "I feel the need... the need for clean context.",
  "You can't handle the full repo scan.",
  "Show me the failing test.",
  "Nobody puts context in the corner.",
  "Roads? Where we're going, we need tests.",
  "The plan will go on.",
  "A prompt. A plan. A clean execution.",
  "Assemble the workflow.",
  "Cue the agents.",
  "Roll initiative: prompt analysis.",
  "Let's make this run count.",
  "Give me the chaos. I'll make it structured.",
  "What's the mission?",
  "Ready to conduct some code?",
  "Let's orchestrate something useful.",
  "Before we run, we plan.",
  "Your move, developer.",
  "The agents have entered the chat.",
  "This task needs a bigger plan.",
  "Less waffle. More workflow.",
  "Great prompt, kid. Don't get cocky.",
  "I find your lack of scope disturbing.",
  "That's not a prompt. That's a plot twist.",
  "This is where the plan begins.",
  "Every great build starts with a better brief.",
  "Clarify first. Execute second.",
  "Tell me the goal. I'll tune the agents.",
  "The repo awakens.",
  "A new prompt rises.",
  "Return of the context.",
  "Attack of the vague requirements.",
  "The last prompt was only the beginning.",
];

function App() {
  const macOsWindowDragRegionsEnabled = useMacOsWindowDragRegionsEnabled();
  const selfWindowDragRegion = windowDragRegionValue(
    macOsWindowDragRegionsEnabled,
    "true",
  );
  const deepWindowDragRegion = windowDragRegionValue(
    macOsWindowDragRegionsEnabled,
    "deep",
  );
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [selectedWorkspace, setSelectedWorkspace] = useState<Workspace | null>(null);
  const [workspaceContextMenu, setWorkspaceContextMenu] =
    useState<WorkspaceContextMenuState | null>(null);
  const [workspaceDeleteCandidate, setWorkspaceDeleteCandidate] =
    useState<Workspace | null>(null);
  const [chatHistoryContextMenu, setChatHistoryContextMenu] =
    useState<ChatHistoryContextMenuState | null>(null);
  const [chatHistoryDeleteCandidate, setChatHistoryDeleteCandidate] =
    useState<ChatListItem | null>(null);
  const [expandedWorkspaceIds, setExpandedWorkspaceIds] = useState<Set<number>>(
    () => new Set(),
  );
  const [expandedDirectoryPaths, setExpandedDirectoryPaths] = useState<Set<string>>(
    () => new Set(),
  );
  const [directoryStates, setDirectoryStates] = useState<
    Record<string, WorkspaceDirectoryState>
  >({});
  const directoryEntriesCache = useRef(new Map<string, WorkspaceTreeEntry[]>());
  const directoryRequestCache = useRef(
    new Map<string, Promise<WorkspaceTreeEntry[]>>(),
  );
  const directoryRequestGenerations = useRef(new Map<string, number>());
  const [previewState, setPreviewState] = useState<WorkspacePreviewState>({
    status: "idle",
    mode: "preview",
    file: null,
    preview: null,
    error: null,
    diffStatus: "idle",
    diff: null,
    diffError: null,
  });
  const previewStateRef = useRef<WorkspacePreviewState>(previewState);
  const filePreviewCache = useRef(new Map<string, WorkspaceFilePreview>());
  const filePreviewRequestCache = useRef(
    new Map<string, Promise<WorkspaceFilePreview>>(),
  );
  const fileDiffCache = useRef(new Map<string, WorkspaceGitDiff>());
  const fileDiffRequestCache = useRef(
    new Map<string, Promise<WorkspaceGitDiff>>(),
  );
  const [gitStatusStates, setGitStatusStates] = useState<
    Record<number, WorkspaceGitStatusState>
  >({});
  const [previewDrawerWidth, setPreviewDrawerWidth] = useState(
    PREVIEW_DRAWER_DEFAULT_WIDTH,
  );
  const [previewResizing, setPreviewResizing] = useState(false);
  const [codexAccounts, setCodexAccounts] = useState<CodexAccountProfile[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null);
  const [connectedAccountIds, setConnectedAccountIds] = useState<Set<number>>(
    () => new Set(),
  );
  const [analytics, setAnalytics] = useState<AnalyticsSummaryType>(DEFAULT_ANALYTICS);
  const [activeView, setActiveView] = useState<AppView>("task");
  const [themePreference, setThemePreference] = useState<ThemePreference>(
    readThemePreference,
  );
  const [resolvedTheme, setResolvedTheme] = useState(() =>
    resolveTheme(readThemePreference()),
  );
  const [agentNotificationPreferences, setAgentNotificationPreferences] =
    useState<AgentNotificationPreferences>(readAgentNotificationPreferences);
  const [agentNotificationPermission, setAgentNotificationPermission] =
    useState<AgentNotificationPermissionStatus>("unavailable");
  const [computerUseEnabled, setComputerUseEnabled] = useState(
    () => readComputerUsePreference().enabled,
  );
  const [browserRuntimeStatus, setBrowserRuntimeStatus] =
    useState<BrowserRuntimeStatus | null>(null);
  const [transcriptNotificationFocusRequest, setTranscriptNotificationFocusRequest] =
    useState<TranscriptNotificationFocusRequest | null>(null);
  const [, setAgentNotificationNavigation] =
    useState<AgentNotificationNavigationState | null>(null);
  const [prompt, setPrompt] = useState("");
  const [promptRevision, setPromptRevision] = useState(0);
  const promptRef = useRef(prompt);
  const replaceComposerPrompt = useCallback(
    (nextPrompt: string | ((currentPrompt: string) => string)) => {
      const resolvedPrompt =
        typeof nextPrompt === "function"
          ? nextPrompt(promptRef.current)
          : nextPrompt;
      promptRef.current = resolvedPrompt;
      setPrompt(resolvedPrompt);
      setPromptRevision((current) => current + 1);
    },
    [],
  );
  const preflightRef = useRef<PreflightReport | null>(null);
  const [runView, setRunView] = useState<RunViewState>(emptyRunView);
  const [taskChatEntries, setTaskChatEntries] = useState<TaskChatEntry[]>([]);
  const [activeChatEntryId, setActiveChatEntryId] = useState<string | null>(null);
  const [selectedDraftChatEntryId, setSelectedDraftChatEntryId] = useState<
    string | null
  >(null);
  const selectedDraftChatEntryIdRef = useRef<string | null>(null);
  const [activeRunRegistryVersion, setActiveRunRegistryVersion] = useState(0);
  const [unreadCompletedChats, setUnreadCompletedChats] = useState<
    Record<number, number[]>
  >({});
  const [historyDrawerPhase, setHistoryDrawerPhase] =
    useState<HistoryDrawerPhase>("closed");
  const [subagentInspectorTarget, setSubagentInspectorTarget] =
    useState<SubagentInspectorTarget | null>(null);
  const subagentInspectorTargetRef = useRef<SubagentInspectorTarget | null>(
    null,
  );
  const historyDrawerOpen = historyDrawerTargetsOpen(historyDrawerPhase);
  const historyDrawerSpaceReserved =
    historyDrawerReservesSpace(historyDrawerPhase);
  const [historyState, setHistoryState] = useState<WorkspaceHistoryState>({
    status: "idle",
    chats: [],
    error: null,
  });
  const [historyChatLoadState, setHistoryChatLoadState] =
    useState<HistoryChatLoadState | null>(null);
  const [selectedHistoryChatId, setSelectedHistoryChatId] = useState<number | null>(null);
  const [historyOpenRequest, setHistoryOpenRequest] =
    useState<HistoryOpenRequest | null>(null);
  const [historicalTranscript, setHistoricalTranscript] =
    useState<HistoricalTranscriptState | null>(null);
  const [taskViewportElement, setTaskViewportElement] =
    useState<HTMLElement | null>(null);
  const [taskViewportWidth, setTaskViewportWidth] = useState(1_024);
  const [taskViewportStable, setTaskViewportStable] = useState(true);
  const [workspaceChatSessions, setWorkspaceChatSessions] = useState<
    Record<number, WorkspaceChatSession | undefined>
  >({});
  const [pendingAccountHandoffs, setPendingAccountHandoffs] = useState<
    Record<number, PendingAccountHandoff | undefined>
  >({});
  const [accountHandoffCandidate, setAccountHandoffCandidate] =
    useState<AccountHandoffCandidate | null>(null);
  const [planImplementationDialog, setPlanImplementationDialog] =
    useState<PlanImplementationDialogState | null>(null);
  const [branchCreationDialog, setBranchCreationDialog] =
    useState<BranchCreationDialogState | null>(null);
  const [branchCreationPendingWorkspaceId, setBranchCreationPendingWorkspaceId] =
    useState<number | null>(null);
  const [goalEditCandidate, setGoalEditCandidate] =
    useState<GoalEditCandidate | null>(null);
  const [goalTermination, setGoalTermination] =
    useState<GoalTerminationState | null>(null);
  const [promptQueuesByChat, setPromptQueuesByChat] = useState<
    Record<number, PromptQueueItem[] | undefined>
  >({});
  const [promptQueueActionPendingItemId, setPromptQueueActionPendingItemId] =
    useState<string | null>(null);
  const [promptQueueComposerEdit, setPromptQueueComposerEdit] =
    useState<PromptQueueComposerEditState | null>(null);
  const planImplementationDialogRequestRef = useRef(0);
  const planImplementationDialogRef = useRef<HTMLElement | null>(null);
  const planImplementationReturnFocusRef = useRef<HTMLElement | null>(null);
  const branchCreationInputRef = useRef<HTMLInputElement | null>(null);
  const branchCreationInFlightRef = useRef(false);
  const [commitDialogOpen, setCommitDialogOpen] = useState(false);
  const [commitIntentContext, setCommitIntentContext] =
    useState<WorkspaceCommitIntentContext | null>(null);
  const [commitMessage, setCommitMessage] = useState("");
  const [commitDialogMessage, setCommitDialogMessage] = useState("");
  const [commitDialogError, setCommitDialogError] = useState(false);
  const [includeUnstagedChanges, setIncludeUnstagedChanges] = useState(true);
  const [gitOperationsByWorkspace, setGitOperationsByWorkspace] = useState<
    Record<number, WorkspaceGitOperationState | undefined>
  >(restoreInterruptedGitOperations);
  const [statusMessage, setStatusMessage] = useState("Choose a workspace to begin.");
  const [codexAccount, setCodexAccount] = useState<CodexAccount | null>(null);
  const [requiresOpenaiAuth, setRequiresOpenaiAuth] = useState(true);
  const [loginState, setLoginState] = useState<CodexLoginState>("idle");
  const [pendingLoginId, setPendingLoginId] = useState<string | null>(null);
  const [pendingLoginAccountId, setPendingLoginAccountId] = useState<number | null>(null);
  const [loginUserCode, setLoginUserCode] = useState<string | null>(null);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [useOss, setUseOss] = useState(false);
  const [ossProvider, setOssProvider] = useState<OssProvider>("ollama");
  const [models, setModels] = useState<CodexModel[]>([]);
  const [modelLoadError, setModelLoadError] = useState<string | null>(null);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [selectedReasoningEffort, setSelectedReasoningEffort] = useState<string | null>(null);
  const [goalMode, setGoalMode] = useState(false);
  const [planMode, setPlanMode] = useState(false);
  const [initialAccessPreference] = useState(readCodexAccessPreference);
  const [accessMode, setAccessMode] = useState<CodexAccessMode>(
    initialAccessPreference.accessMode,
  );
  const [contextFiles, setContextFiles] = useState<ComposerContextFile[]>([]);
  const [taskContextDropActive, setTaskContextDropActive] = useState(false);
  const [explorerDragPreview, setExplorerDragPreview] =
    useState<ExplorerDragPreview | null>(null);
  const taskContextDropSurfaceRef = useRef<HTMLElement | null>(null);
  const taskComposerPromptRef = useRef<HTMLTextAreaElement | null>(null);
  const taskContextDropActiveRef = useRef(false);
  const nativeContextDropPathsRef = useRef<string[]>([]);
  const explorerDragContextFileRef = useRef<ComposerContextFile | null>(null);
  const explorerPointerDragRef = useRef<ExplorerPointerDrag | null>(null);
  const explorerPointerDragCleanupRef = useRef<(() => void) | null>(null);
  const suppressWorkspaceFileClickRef = useRef(false);
  const handleTaskComposerDropSurfaceElementChange = useCallback(
    (element: HTMLElement | null) => {
      taskContextDropSurfaceRef.current = element;
    },
    [],
  );
  const handleTaskComposerPromptElementChange = useCallback(
    (element: HTMLTextAreaElement | null) => {
      taskComposerPromptRef.current = element;
    },
    [],
  );
  const [selectedSkills, setSelectedSkills] = useState<SelectedComposerSkill[]>([]);
  const [mentionResults, setMentionResults] = useState<ComposerContextFile[]>([]);
  const [mentionSearchStatus, setMentionSearchStatus] =
    useState<ComposerMentionSearchStatus>("idle");
  const [mentionSearchError, setMentionSearchError] = useState<string | null>(null);
  const [slashCommandResults, setSlashCommandResults] =
    useState<SlashCommandItem[]>(BUILTIN_SLASH_COMMANDS);
  const [slashCommandSearchStatus, setSlashCommandSearchStatus] =
    useState<SlashCommandSearchStatus>("idle");
  const [slashCommandSearchError, setSlashCommandSearchError] =
    useState<string | null>(null);
  const [branches, setBranches] = useState<string[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<string | null>(null);

  const currentRunId = useRef<number | null>(null);
  const currentTaskId = useRef<number | null>(null);
  const currentRunAccountId = useRef<number | null>(null);
  const currentRunProfileKey = useRef<CodexProfileKey | null>(null);
  const runViewRef = useRef<RunViewState>(emptyRunView);
  const activeChatEntryIdRef = useRef<string | null>(null);
  const activeRunControlRef = useRef<ActiveRunControl | null>(null);
  const activeRunControlsRef = useRef(new Map<string, ActiveRunControl>());
  const workspacesRef = useRef<Workspace[]>([]);
  const activeViewRef = useRef<AppView>("task");
  const accountMenuOpenRef = useRef(false);
  const appFocusedRef = useRef(
    typeof document === "undefined" ? true : document.hasFocus(),
  );
  const appVisibleRef = useRef(
    typeof document === "undefined" ? true : document.visibilityState !== "hidden",
  );
  const agentNotificationPreferencesRef = useRef(agentNotificationPreferences);
  const agentNotificationPermissionRef = useRef(agentNotificationPermission);
  const historyStateRef = useRef<WorkspaceHistoryState>({
    status: "idle",
    chats: [],
    error: null,
  });
  const chatTitleGenerationsInFlightRef = useRef(new Set<number>());
  const handledNotificationActivationKeysRef = useRef(new Set<string>());
  const notificationActivationsInFlightRef = useRef(new Set<string>());
  const pendingNotificationDeliveryKeysRef = useRef(new Set<string>());
  const bootstrapCompleteRef = useRef(false);
  const pendingNotificationActivationRef =
    useRef<AgentNotificationTarget | null>(null);
  const notificationFocusSequenceRef = useRef(0);
  const notificationNavigationSequenceRef = useRef(0);
  const pendingAgentNotificationFocusRef =
    useRef<PendingAgentNotificationFocus | null>(null);
  const [unroutedApprovals, setUnroutedApprovals] = useState<
    PendingApprovalAttention[]
  >([]);
  const unroutedApprovalsRef = useRef<PendingApprovalAttention[]>([]);
  const orphanApprovalResolutionLocksRef = useRef(new Set<string>());
  const resolvedOrphanApprovalKeysRef = useRef(new Set<string>());
  const [approvalSafetyWarning, setApprovalSafetyWarning] = useState<
    string | null
  >(null);
  const [editedPromptNotice, setEditedPromptNotice] = useState<{
    kind: "rerun-error";
    workspaceId: number;
    entryId: string;
    message: string;
  } | null>(null);
  const collaborationModeMasksRef = useRef(
    new Map<CodexProfileKey, Promise<CollaborationModeMask[]>>(),
  );
  const userInputAutoResolutionTimersRef = useRef(new Map<string, number>());
  const requestActionLocksRef = useRef(new Set<string>());
  const planActionLocksRef = useRef(new Set<string>());
  const promptQueuesByChatRef = useRef<
    Record<number, PromptQueueItem[] | undefined>
  >({});
  const pausedPromptQueueChatIdsRef = useRef<Set<number>>(new Set());
  const promptQueuePauseReasonsRef = useRef(
    new Map<number, PromptQueuePauseReason>(),
  );
  const promptQueueEnqueueOperationsRef = useRef(
    new Map<number, Promise<void>>(),
  );
  const promptQueuePendingSubmissionKeysRef = useRef(
    new Map<number, Set<string>>(),
  );
  const promptQueueComposerEditRef =
    useRef<PromptQueueComposerEditState | null>(null);
  const promptQueueClaimLocksRef = useRef(new Set<number>());
  const promptQueueActionLocksRef = useRef(new Set<string>());
  const promptQueueDispatchTimersRef = useRef(new Map<number, number>());
  const historyChatLoadIdRef = useRef(0);
  const taskChatEntriesRef = useRef<TaskChatEntry[]>([]);
  const contextFilesRef = useRef<ComposerContextFile[]>([]);
  const selectedSkillsRef = useRef<SelectedComposerSkill[]>([]);
  const historicalTranscriptRef = useRef<HistoricalTranscriptState | null>(null);
  const workspaceTaskMemoriesRef = useRef<
    Record<number, WorkspaceTaskMemory | undefined>
  >({});
  const taskChatTranscriptRef =
    useRef<VirtuosoTaskChatTranscriptHandle | null>(null);
  const pendingAccountHandoffsRef = useRef<
    Record<number, PendingAccountHandoff | undefined>
  >({});
  const transcriptScrollActiveRef = useRef(false);
  const previewResizingRef = useRef(false);
  const lastForegroundInteractionAtRef = useRef(0);
  const stableHistoryChatCacheRef = useRef(
    new Map<number, StableHistoryChatCacheEntry>(),
  );
  const activeExternalTranscriptSyncRef = useRef<{
    chatId: number;
    requestId: string;
  } | null>(null);
  const historicalPreparationAbortRef = useRef<AbortController | null>(null);
  const pendingTranscriptCommitRef = useRef<(() => void) | null>(null);
  const transcriptCommitIdleTimerRef = useRef<number | null>(null);
  const transcriptViewportStableRef = useRef(true);
  const transcriptViewportWidthRef = useRef(1_024);
  const pendingTranscriptViewportWidthRef = useRef<number | null>(null);
  const transcriptViewportResizeTimerRef = useRef<number | null>(null);
  const transcriptViewportWaitersRef = useRef(new Set<() => void>());
  const historyDrawerPhaseRef = useRef<HistoryDrawerPhase>("closed");
  const historyDrawerClosedWaitersRef = useRef(new Set<() => void>());
  const historyDrawerAnchorRef = useRef<TranscriptViewportAnchor | null>(null);
  const historyDrawerAnchorRestoreFrameRef = useRef<number | null>(null);
  const historyDrawerAnchorReleaseTimerRef = useRef<number | null>(null);
  const pendingHistoryDrawerOpenRef = useRef(false);
  const pendingHistoryDrawerCloseRef = useRef(false);
  const historicalActivityCacheRef = useRef(
    new Map<string, Awaited<ReturnType<typeof loadDefaultProfileTurnActivity>>>(),
  );
  const historicalActivityRequestCacheRef = useRef(
    new Map<
      string,
      Promise<Awaited<ReturnType<typeof loadDefaultProfileTurnActivity>>>
    >(),
  );
  useEffect(
    () => () => {
      historicalPreparationAbortRef.current?.abort();
      cancelHistoricalTranscriptPreparation();
      userInputAutoResolutionTimersRef.current.forEach((timer) =>
        window.clearTimeout(timer),
      );
      userInputAutoResolutionTimersRef.current.clear();
      promptQueueDispatchTimersRef.current.forEach((timer) =>
        window.clearTimeout(timer),
      );
      promptQueueDispatchTimersRef.current.clear();
    },
    [],
  );
  taskChatEntriesRef.current = taskChatEntries;
  contextFilesRef.current = contextFiles;
  selectedSkillsRef.current = selectedSkills;
  historicalTranscriptRef.current = historicalTranscript;
  pendingAccountHandoffsRef.current = pendingAccountHandoffs;
  promptQueuesByChatRef.current = promptQueuesByChat;
  workspacesRef.current = workspaces;
  activeViewRef.current = activeView;
  accountMenuOpenRef.current = accountMenuOpen;
  agentNotificationPreferencesRef.current = agentNotificationPreferences;
  agentNotificationPermissionRef.current = agentNotificationPermission;
  historyStateRef.current = historyState;
  unroutedApprovalsRef.current = unroutedApprovals;
  previewResizingRef.current = previewResizing;
  const workspaceChatSessionsRef = useRef<
    Record<number, WorkspaceChatSession | undefined>
  >({});
  const pendingFrameCodexNotificationsRef = useRef<
    PendingFrameCodexNotification[]
  >([]);
  const pendingFrameCodexNotificationIdRef = useRef<number | null>(null);
  const pendingRunBindingNotificationsRef = useRef<
    PendingRunBindingNotification[]
  >([]);
  const pendingRunEventWritesRef = useRef<RunEventInput[]>([]);
  const pendingRunEventFlushTimerRef = useRef<number | null>(null);
  const runEventWriteChainRef = useRef<Promise<void>>(Promise.resolve());
  const selectedWorkspaceRef = useRef<Workspace | null>(null);
  const codexAccountsRef = useRef<CodexAccountProfile[]>([]);
  const selectedAccountIdRef = useRef<number | null>(null);
  const connectedAccountIdsRef = useRef<Set<number>>(new Set());
  const pendingLoginIdRef = useRef<string | null>(null);
  const pendingLoginAccountIdRef = useRef<number | null>(null);
  const modelsRef = useRef<CodexModel[]>([]);
  const modelLoadErrorRef = useRef<string | null>(null);
  const previewRequestId = useRef(0);
  const gitStatusRefreshCache = useRef(new Map<number, Promise<void>>());
  const workspaceFileIndexCache = useRef(new Map<number, WorkspaceTreeEntry[]>());
  const workspaceFileIndexRequestCache = useRef(
    new Map<number, Promise<WorkspaceTreeEntry[]>>(),
  );
  const mentionSearchRequestId = useRef(0);
  const slashCommandSearchRequestId = useRef(0);
  const codexSkillCache = useRef(new Map<number, CodexSkillSummary[]>());
  const codexSkillRequestCache = useRef(
    new Map<number, Promise<CodexSkillSummary[]>>(),
  );
  const lastCommitSubjectsRef = useRef(
    new Map<number, { subject: string; changeKey: string }>(),
  );
  const gitActionInFlightRef = useRef(false);
  const gitOperationInFlightWorkspaceIdsRef = useRef(new Set<number>());
  const gitOperationSequenceRef = useRef(0);
  const workspaceContextMenuRef = useRef<HTMLDivElement | null>(null);
  const chatHistoryContextMenuRef = useRef<HTMLDivElement | null>(null);
  const accountMenuContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(
    () => () => {
      if (pendingFrameCodexNotificationIdRef.current !== null) {
        window.cancelAnimationFrame(pendingFrameCodexNotificationIdRef.current);
        pendingFrameCodexNotificationIdRef.current = null;
      }
      pendingFrameCodexNotificationsRef.current = [];
      if (pendingRunEventFlushTimerRef.current !== null) {
        window.clearTimeout(pendingRunEventFlushTimerRef.current);
        pendingRunEventFlushTimerRef.current = null;
      }
      const pendingWrites = pendingRunEventWritesRef.current.splice(0);
      if (pendingWrites.length > 0) {
        void runEventWriteChainRef.current
          .catch(() => undefined)
          .then(() => appendRunEvents(pendingWrites));
      }
    },
    [],
  );

  const updateHistoryDrawerPhase = useCallback((phase: HistoryDrawerPhase) => {
    historyDrawerPhaseRef.current = phase;
    setHistoryDrawerPhase(phase);
  }, []);

  const captureHistoryDrawerAnchor = useCallback(() => {
    const scroller = taskViewportElement?.querySelector<HTMLElement>(
      ".task-chat-transcript.virtuoso-transcript, .task-chat-transcript.native-transcript",
    );
    return captureTranscriptViewportAnchor(scroller ?? null);
  }, [taskViewportElement]);

  const cancelHistoryDrawerAnchorSchedule = useCallback(() => {
    if (historyDrawerAnchorRestoreFrameRef.current !== null) {
      window.cancelAnimationFrame(historyDrawerAnchorRestoreFrameRef.current);
      historyDrawerAnchorRestoreFrameRef.current = null;
    }
    if (historyDrawerAnchorReleaseTimerRef.current !== null) {
      window.clearTimeout(historyDrawerAnchorReleaseTimerRef.current);
      historyDrawerAnchorReleaseTimerRef.current = null;
    }
  }, []);

  const scheduleHistoryDrawerAnchorRestore = useCallback(() => {
    if (
      !historyDrawerAnchorRef.current ||
      transcriptScrollActiveRef.current ||
      historyDrawerAnchorRestoreFrameRef.current !== null
    ) {
      return;
    }

    historyDrawerAnchorRestoreFrameRef.current = window.requestAnimationFrame(
      () => {
        historyDrawerAnchorRestoreFrameRef.current = null;
        if (transcriptScrollActiveRef.current) return;
        restoreTranscriptViewportAnchor(historyDrawerAnchorRef.current);
      },
    );
  }, []);

  const releaseHistoryDrawerAnchorAfterResize = useCallback(() => {
    if (historyDrawerAnchorReleaseTimerRef.current !== null) {
      window.clearTimeout(historyDrawerAnchorReleaseTimerRef.current);
    }
    historyDrawerAnchorReleaseTimerRef.current = window.setTimeout(() => {
      historyDrawerAnchorReleaseTimerRef.current = null;
      const anchor = historyDrawerAnchorRef.current;
      if (!anchor || transcriptScrollActiveRef.current) return;

      if (historyDrawerAnchorRestoreFrameRef.current !== null) {
        window.cancelAnimationFrame(historyDrawerAnchorRestoreFrameRef.current);
      }
      historyDrawerAnchorRestoreFrameRef.current = window.requestAnimationFrame(
        () => {
          historyDrawerAnchorRestoreFrameRef.current = null;
          if (transcriptScrollActiveRef.current) return;
          restoreTranscriptViewportAnchor(anchor);
          if (historyDrawerAnchorRef.current === anchor) {
            historyDrawerAnchorRef.current = null;
          }
        },
      );
    }, HISTORY_TRANSCRIPT_RESIZE_IDLE_MS + 32);
  }, []);

  const finalizeHistoryDrawerOpen = useCallback(() => {
    if (historyDrawerPhaseRef.current !== "opening") return;
    if (!transcriptScrollActiveRef.current) {
      restoreTranscriptViewportAnchor(historyDrawerAnchorRef.current);
    }
    scheduleHistoryDrawerAnchorRestore();
    releaseHistoryDrawerAnchorAfterResize();
    updateHistoryDrawerPhase("open");
  }, [
    releaseHistoryDrawerAnchorAfterResize,
    scheduleHistoryDrawerAnchorRestore,
    updateHistoryDrawerPhase,
  ]);

  const finalizeHistoryDrawerClose = useCallback(() => {
    if (historyDrawerPhaseRef.current !== "closing") return;
    pendingHistoryDrawerCloseRef.current = false;
    if (!transcriptScrollActiveRef.current) {
      restoreTranscriptViewportAnchor(historyDrawerAnchorRef.current);
    }
    scheduleHistoryDrawerAnchorRestore();
    releaseHistoryDrawerAnchorAfterResize();
    updateHistoryDrawerPhase("closed");
  }, [
    releaseHistoryDrawerAnchorAfterResize,
    scheduleHistoryDrawerAnchorRestore,
    updateHistoryDrawerPhase,
  ]);

  const completeHistoryDrawerTransition = useCallback(
    (phase: "opening" | "closing") => {
      if (historyDrawerPhaseRef.current !== phase) return;

      if (phase === "opening") {
        finalizeHistoryDrawerOpen();
        return;
      }

      finalizeHistoryDrawerClose();
    },
    [finalizeHistoryDrawerClose, finalizeHistoryDrawerOpen],
  );

  const beginHistoryDrawerOpen = useCallback(() => {
    const phase = historyDrawerPhaseRef.current;
    if (phase === "opening" || phase === "open") {
      return;
    }

    pendingHistoryDrawerOpenRef.current = false;
    pendingHistoryDrawerCloseRef.current = false;
    cancelHistoryDrawerAnchorSchedule();
    historyDrawerAnchorRef.current = captureHistoryDrawerAnchor();
    updateHistoryDrawerPhase("opening");
  }, [
    cancelHistoryDrawerAnchorSchedule,
    captureHistoryDrawerAnchor,
    updateHistoryDrawerPhase,
  ]);

  const openHistoryDrawer = useCallback(() => {
    if (transcriptScrollActiveRef.current) {
      pendingHistoryDrawerOpenRef.current = true;
      return;
    }
    beginHistoryDrawerOpen();
  }, [beginHistoryDrawerOpen]);

  const beginHistoryDrawerClose = useCallback(() => {
    const phase = historyDrawerPhaseRef.current;
    if (phase === "closed" || phase === "closing") {
      return;
    }

    pendingHistoryDrawerOpenRef.current = false;
    pendingHistoryDrawerCloseRef.current = false;
    cancelHistoryDrawerAnchorSchedule();
    historyDrawerAnchorRef.current = captureHistoryDrawerAnchor();
    updateHistoryDrawerPhase("closing");
  }, [
    cancelHistoryDrawerAnchorSchedule,
    captureHistoryDrawerAnchor,
    updateHistoryDrawerPhase,
  ]);

  const closeHistoryDrawer = useCallback(() => {
    pendingHistoryDrawerOpenRef.current = false;
    const phase = historyDrawerPhaseRef.current;
    if (phase === "closed" || phase === "closing") {
      return;
    }
    if (transcriptScrollActiveRef.current) {
      pendingHistoryDrawerCloseRef.current = true;
      return;
    }
    beginHistoryDrawerClose();
  }, [beginHistoryDrawerClose]);

  const closeSubagentInspector = useCallback(() => {
    if (!subagentInspectorTargetRef.current) return;
    cancelHistoryDrawerAnchorSchedule();
    historyDrawerAnchorRef.current = captureHistoryDrawerAnchor();
    subagentInspectorTargetRef.current = null;
    setSubagentInspectorTarget(null);
    scheduleHistoryDrawerAnchorRestore();
    releaseHistoryDrawerAnchorAfterResize();
  }, [
    cancelHistoryDrawerAnchorSchedule,
    captureHistoryDrawerAnchor,
    releaseHistoryDrawerAnchorAfterResize,
    scheduleHistoryDrawerAnchorRestore,
  ]);

  const openSubagentInspector = useCallback(
    (record: SubagentRecord) => {
      const conversationKey = subagentConversationKey(record);
      if (!conversationKey) return;
      cancelHistoryDrawerAnchorSchedule();
      historyDrawerAnchorRef.current = captureHistoryDrawerAnchor();
      pendingHistoryDrawerOpenRef.current = false;
      pendingHistoryDrawerCloseRef.current = false;
      updateHistoryDrawerPhase("closed");
      const target = {
        conversationKey,
        subagentId: record.id,
      };
      subagentInspectorTargetRef.current = target;
      setSubagentInspectorTarget(target);
      scheduleHistoryDrawerAnchorRestore();
      releaseHistoryDrawerAnchorAfterResize();
    },
    [
      cancelHistoryDrawerAnchorSchedule,
      captureHistoryDrawerAnchor,
      releaseHistoryDrawerAnchorAfterResize,
      scheduleHistoryDrawerAnchorRestore,
      updateHistoryDrawerPhase,
    ],
  );

  const loadSubagentTranscript = useStableEvent(
    async (record: SubagentRecord) => {
      await ensureCodexProfileConnected(
        record.profileKey as CodexProfileKey,
        record.accountId,
      );
      return readProjectedSubagentThread({
        accountId: record.accountId,
        profileKey: record.profileKey,
        threadId: record.childThreadId,
      });
    },
  );

  const steerSubagent = useStableEvent(
    async (record: SubagentRecord, instruction: string) => {
      const current =
        findSubagentByThread(record.profileKey, record.childThreadId) ??
        record;
      if (
        !current.childTurnId ||
        !isActiveSubagentStatus(current.status) ||
        current.needsAttention
      ) {
        throw new Error(
          "This subagent does not have an active turn that can accept instructions.",
        );
      }
      await ensureCodexProfileConnected(
        current.profileKey as CodexProfileKey,
        current.accountId,
      );
      await codexRpcForProfile(
        current.profileKey as CodexProfileKey,
        current.accountId,
        "turn/steer",
        {
          threadId: current.childThreadId,
          expectedTurnId: current.childTurnId,
          clientUserMessageId: createStableClientMessageId(),
          input: [{ type: "text", text: instruction.trim() }],
        },
      );
      const updated = {
        ...current,
        status: "running" as const,
        error: null,
        updatedAt: new Date().toISOString(),
      };
      saveSubagentRecord(updated);
    },
  );

  const stopSubagent = useStableEvent(async (record: SubagentRecord) => {
    const records = getConversationSubagents(
      subagentConversationKey(record),
    );
    const byThread = new Map(
      records.map((candidate) => [candidate.childThreadId, candidate]),
    );
    const isDescendantOf = (
      candidate: SubagentRecord,
      ancestorThreadId: string,
    ) => {
      let parentThreadId = candidate.parentThreadId;
      const visited = new Set<string>();
      while (parentThreadId && !visited.has(parentThreadId)) {
        if (parentThreadId === ancestorThreadId) return true;
        visited.add(parentThreadId);
        parentThreadId =
          byThread.get(parentThreadId)?.parentThreadId ?? "";
      }
      return false;
    };
    const hierarchyDepth = (candidate: SubagentRecord) => {
      let depth = 1;
      let parentThreadId = candidate.parentThreadId;
      const visited = new Set<string>([candidate.childThreadId]);
      while (parentThreadId && !visited.has(parentThreadId)) {
        visited.add(parentThreadId);
        const parent = byThread.get(parentThreadId);
        if (!parent) break;
        depth += 1;
        parentThreadId = parent.parentThreadId;
      }
      return depth;
    };
    const targets = records
      .filter(
        (candidate) =>
          isActiveSubagentStatus(candidate.status) &&
          (candidate.childThreadId === record.childThreadId ||
            isDescendantOf(candidate, record.childThreadId)),
      )
      .sort((left, right) => hierarchyDepth(right) - hierarchyDepth(left));
    if (targets.length === 0) {
      throw new Error("This subagent is no longer running.");
    }

    for (const target of targets) {
      const current =
        findSubagentByThread(target.profileKey, target.childThreadId) ??
        target;
      if (!current.childTurnId) {
        throw new Error(
          `The active turn for ${current.task || "this subagent"} is unavailable.`,
        );
      }
      saveSubagentRecord({
        ...current,
        status: "stopping",
        updatedAt: new Date().toISOString(),
      });
      try {
        await ensureCodexProfileConnected(
          current.profileKey as CodexProfileKey,
          current.accountId,
        );
        const interruptedTurnId = await interruptTurnForProfile(
          current.profileKey as CodexProfileKey,
          current.accountId,
          current.childThreadId,
          current.childTurnId,
        );
        if (interruptedTurnId === null) {
          saveSubagentRecord({
            ...current,
            status: "stopped",
            needsAttention: false,
            statusBeforeAttention: null,
            completedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
        }
      } catch (error) {
        saveSubagentRecord({
          ...current,
          status: current.status,
          error: error instanceof Error ? error.message : String(error),
          updatedAt: new Date().toISOString(),
        });
        throw error;
      }
    }

    window.setTimeout(() => {
      targets.forEach((target) => {
        const current = findSubagentByThread(
          target.profileKey,
          target.childThreadId,
        );
        if (!current || current.status !== "stopping") return;
        void loadSubagentTranscript(current)
          .then((transcript) => {
            const latest = findSubagentByThread(
              current.profileKey,
              current.childThreadId,
            );
            if (!latest || latest.status !== "stopping") return;
            if (transcript.activeTurnId) {
              saveSubagentRecord({
                ...latest,
                childTurnId: transcript.activeTurnId,
                status: "running",
                updatedAt: new Date().toISOString(),
              });
              return;
            }
            saveSubagentRecord({
              ...latest,
              status: "stopped",
              needsAttention: false,
              statusBeforeAttention: null,
              completedAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            });
          })
          .catch(() => undefined);
      });
    }, 4_000);
  });

  const toggleHistoryDrawer = useCallback(() => {
    if (subagentInspectorTargetRef.current) {
      cancelHistoryDrawerAnchorSchedule();
      historyDrawerAnchorRef.current = captureHistoryDrawerAnchor();
      subagentInspectorTargetRef.current = null;
      setSubagentInspectorTarget(null);
      beginHistoryDrawerOpen();
      scheduleHistoryDrawerAnchorRestore();
      releaseHistoryDrawerAnchorAfterResize();
      return;
    }
    const phase = historyDrawerPhaseRef.current;
    if (phase === "open" || phase === "opening") {
      closeHistoryDrawer();
    } else {
      openHistoryDrawer();
    }
  }, [
    beginHistoryDrawerOpen,
    cancelHistoryDrawerAnchorSchedule,
    captureHistoryDrawerAnchor,
    closeHistoryDrawer,
    openHistoryDrawer,
    releaseHistoryDrawerAnchorAfterResize,
    scheduleHistoryDrawerAnchorRestore,
  ]);

  const waitForHistoryDrawerClosed = useCallback(() => {
    if (
      historyDrawerPhaseRef.current === "closed" &&
      !pendingHistoryDrawerOpenRef.current &&
      !pendingHistoryDrawerCloseRef.current
    ) {
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      let settled = false;
      let timeoutId: number | null = null;
      const finish = () => {
        if (settled) return;
        settled = true;
        historyDrawerClosedWaitersRef.current.delete(finish);
        if (timeoutId !== null) {
          window.clearTimeout(timeoutId);
        }
        resolve();
      };
      historyDrawerClosedWaitersRef.current.add(finish);
      timeoutId = window.setTimeout(
        finish,
        HISTORY_DRAWER_TRANSITION_FALLBACK_MS + 100,
      );
    });
  }, []);

  const handleHistoryDrawerTransitionEnd = useCallback(
    (event: ReactTransitionEvent<HTMLElement>) => {
      if (event.currentTarget !== event.target || event.propertyName !== "transform") {
        return;
      }
      const phase = historyDrawerPhaseRef.current;
      if (phase === "opening" || phase === "closing") {
        completeHistoryDrawerTransition(phase);
      }
    },
    [completeHistoryDrawerTransition],
  );

  useEffect(() => {
    if (historyDrawerPhase !== "opening" && historyDrawerPhase !== "closing") {
      return;
    }

    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      const frame = window.requestAnimationFrame(() =>
        completeHistoryDrawerTransition(historyDrawerPhase),
      );
      return () => window.cancelAnimationFrame(frame);
    }

    const timer = window.setTimeout(
      () => completeHistoryDrawerTransition(historyDrawerPhase),
      HISTORY_DRAWER_TRANSITION_FALLBACK_MS,
    );
    return () => window.clearTimeout(timer);
  }, [completeHistoryDrawerTransition, historyDrawerPhase]);

  useEffect(() => {
    if (historyDrawerPhase === "closed") {
      historyDrawerClosedWaitersRef.current.forEach((resolve) => resolve());
      historyDrawerClosedWaitersRef.current.clear();
    }
  }, [historyDrawerPhase]);

  const schedulePendingTranscriptCommit = useCallback(() => {
    if (
      !pendingTranscriptCommitRef.current ||
      transcriptScrollActiveRef.current ||
      !transcriptViewportStableRef.current
    ) {
      return;
    }
    if (transcriptCommitIdleTimerRef.current !== null) {
      window.clearTimeout(transcriptCommitIdleTimerRef.current);
    }
    transcriptCommitIdleTimerRef.current = window.setTimeout(() => {
      transcriptCommitIdleTimerRef.current = null;
      if (
        transcriptScrollActiveRef.current ||
        !transcriptViewportStableRef.current
      ) {
        return;
      }
      const commit = pendingTranscriptCommitRef.current;
      pendingTranscriptCommitRef.current = null;
      commit?.();
    }, HISTORY_TRANSCRIPT_COMMIT_IDLE_MS);
  }, []);

  const settleTranscriptViewportWidth = useCallback(
    (width: number) => {
      pendingTranscriptViewportWidthRef.current = null;
      transcriptViewportWidthRef.current = width;
      transcriptViewportStableRef.current = true;
      setTaskViewportStable(true);
      setTaskViewportWidth(width);
      scheduleHistoryDrawerAnchorRestore();
      releaseHistoryDrawerAnchorAfterResize();
      transcriptViewportWaitersRef.current.forEach((resolve) => resolve());
      transcriptViewportWaitersRef.current.clear();
      schedulePendingTranscriptCommit();
    },
    [
      releaseHistoryDrawerAnchorAfterResize,
      scheduleHistoryDrawerAnchorRestore,
      schedulePendingTranscriptCommit,
    ],
  );

  useEffect(() => {
    if (!taskViewportElement) return;

    const initialWidth = taskViewportElement.getBoundingClientRect().width;
    if (initialWidth > 0) {
      transcriptViewportWidthRef.current = initialWidth;
      setTaskViewportWidth(initialWidth);
    }
    transcriptViewportStableRef.current = true;
    setTaskViewportStable(true);

    if (typeof ResizeObserver === "undefined") {
      return;
    }

    let latestWidth = transcriptViewportWidthRef.current;
    const observer = new ResizeObserver((entries) => {
      const nextWidth =
        entries[0]?.contentRect.width ??
        taskViewportElement.getBoundingClientRect().width;
      if (nextWidth <= 0 || Math.abs(nextWidth - latestWidth) < 0.5) {
        return;
      }
      latestWidth = nextWidth;
      transcriptViewportStableRef.current = false;
      setTaskViewportStable(false);
      scheduleHistoryDrawerAnchorRestore();
      releaseHistoryDrawerAnchorAfterResize();
      if (transcriptCommitIdleTimerRef.current !== null) {
        window.clearTimeout(transcriptCommitIdleTimerRef.current);
        transcriptCommitIdleTimerRef.current = null;
      }
      if (transcriptViewportResizeTimerRef.current !== null) {
        window.clearTimeout(transcriptViewportResizeTimerRef.current);
      }
      transcriptViewportResizeTimerRef.current = window.setTimeout(() => {
        transcriptViewportResizeTimerRef.current = null;
        pendingTranscriptViewportWidthRef.current = latestWidth;
        if (!transcriptScrollActiveRef.current) {
          settleTranscriptViewportWidth(latestWidth);
        }
      }, HISTORY_TRANSCRIPT_RESIZE_IDLE_MS);
    });
    observer.observe(taskViewportElement);

    return () => {
      observer.disconnect();
      if (transcriptViewportResizeTimerRef.current !== null) {
        window.clearTimeout(transcriptViewportResizeTimerRef.current);
        transcriptViewportResizeTimerRef.current = null;
      }
      transcriptViewportStableRef.current = true;
      pendingTranscriptViewportWidthRef.current = null;
      setTaskViewportStable(true);
      transcriptViewportWaitersRef.current.forEach((resolve) => resolve());
      transcriptViewportWaitersRef.current.clear();
    };
  }, [
    releaseHistoryDrawerAnchorAfterResize,
    scheduleHistoryDrawerAnchorRestore,
    settleTranscriptViewportWidth,
    taskViewportElement,
  ]);

  useEffect(
    () => () => {
      if (transcriptCommitIdleTimerRef.current !== null) {
        window.clearTimeout(transcriptCommitIdleTimerRef.current);
      }
      if (transcriptViewportResizeTimerRef.current !== null) {
        window.clearTimeout(transcriptViewportResizeTimerRef.current);
      }
      pendingHistoryDrawerOpenRef.current = false;
      pendingHistoryDrawerCloseRef.current = false;
      cancelHistoryDrawerAnchorSchedule();
      historyDrawerAnchorRef.current = null;
      transcriptViewportWaitersRef.current.forEach((resolve) => resolve());
      transcriptViewportWaitersRef.current.clear();
      historyDrawerClosedWaitersRef.current.forEach((resolve) => resolve());
      historyDrawerClosedWaitersRef.current.clear();
    },
    [cancelHistoryDrawerAnchorSchedule],
  );

  const handleTranscriptScrollActivityChange = useCallback((active: boolean) => {
    transcriptScrollActiveRef.current = active;
    if (active) {
      cancelHistoryDrawerAnchorSchedule();
      historyDrawerAnchorRef.current = null;
      if (transcriptCommitIdleTimerRef.current !== null) {
        window.clearTimeout(transcriptCommitIdleTimerRef.current);
        transcriptCommitIdleTimerRef.current = null;
      }
      return;
    }

    const pendingViewportWidth = pendingTranscriptViewportWidthRef.current;
    if (pendingViewportWidth !== null) {
      settleTranscriptViewportWidth(pendingViewportWidth);
    }

    if (pendingHistoryDrawerCloseRef.current) {
      beginHistoryDrawerClose();
    } else if (pendingHistoryDrawerOpenRef.current) {
      beginHistoryDrawerOpen();
    }

    schedulePendingTranscriptCommit();
  }, [
    beginHistoryDrawerClose,
    beginHistoryDrawerOpen,
    cancelHistoryDrawerAnchorSchedule,
    schedulePendingTranscriptCommit,
    settleTranscriptViewportWidth,
  ]);
  const clearHistoricalLatestPositionRequest = useCallback((
    request: HistoricalChatOpenRequest,
  ) => {
    setHistoricalTranscript((current) => {
      if (
        current?.openAtLatestRequest?.requestId !== request.requestId ||
        current.openAtLatestRequest.chatId !== request.chatId ||
        current.openAtLatestRequest.transcriptVersion !==
          request.transcriptVersion
      ) {
        return current;
      }
      const next: HistoricalTranscriptState = {
        ...current,
        positionIntent: "preserve",
        openAtLatestRequest: null,
      };
      historicalTranscriptRef.current = next;
      const workspaceId = selectedWorkspaceRef.current?.id;
      if (workspaceId !== undefined) {
        const remembered = workspaceTaskMemoriesRef.current[workspaceId];
        if (
          remembered?.selection.kind === "chat" &&
          remembered.selection.session.chatId === next.chatId
        ) {
          workspaceTaskMemoriesRef.current[workspaceId] = {
            ...remembered,
            historicalTranscript: next,
          };
        }
      }
      return next;
    });
  }, []);
  const resolveTranscriptRequest = useStableEvent(handleResolveRequest);
  const answerTranscriptUserInput = useStableEvent(handleAnswerUserInput);
  const implementTranscriptPlan = useStableEvent(handleImplementPlan);
  const reviseTranscriptPlan = useStableEvent(handleRevisePlan);
  const cancelTranscriptPlan = useStableEvent(handleCancelPlan);
  const openTranscriptFileLink = useStableEvent(openTaskResponseFileLink);
  const openTranscriptWebPreview = useStableEvent(handleOpenWebPreview);
  const reviewTranscriptEditedFile = useStableEvent(handleReviewEditedFile);
  const undoTranscriptEditedFiles = useStableEvent(handleUndoEditedFiles);
  const editTranscriptPrompt = useStableEvent(handleEditLatestPrompt);
  const loadTranscriptHistoricalActivity = useStableEvent(loadHistoricalActivity);
  const rememberTranscriptViewport = useStableEvent(
    rememberTranscriptViewportSnapshot,
  );
  const activateAgentNotification = useStableEvent(
    handleAgentNotificationActivation,
  );
  const completeAgentNotificationFocus = useStableEvent(
    (
      request: TranscriptNotificationFocusRequest,
      found: boolean,
    ) => {
      setTranscriptNotificationFocusRequest((current) =>
        current?.requestId === request.requestId ? null : current,
      );
      const pendingFocus = pendingAgentNotificationFocusRef.current;
      if (pendingFocus?.requestId === request.requestId) {
        pendingAgentNotificationFocusRef.current = null;
        window.clearTimeout(pendingFocus.timeoutId);
        pendingFocus.resolve(found);
      }
    },
  );
  const dispatchAgentNotificationActivation = useStableEvent(
    (target: AgentNotificationTarget | null) => {
      if (!target) return;
      if (!bootstrapCompleteRef.current) {
        pendingNotificationActivationRef.current = target;
        return;
      }
      if (
        handledNotificationActivationKeysRef.current.has(target.eventKey) ||
        notificationActivationsInFlightRef.current.has(target.eventKey)
      ) {
        return;
      }

      notificationActivationsInFlightRef.current.add(target.eventKey);
      void activateAgentNotification(target)
        .then((result) => {
          if (result === "complete" || result === "terminal") {
            handledNotificationActivationKeysRef.current.add(target.eventKey);
          }
        })
        .catch(() => {
          setStatusMessage("Could not open the chat for that notification.");
        })
        .finally(() => {
          notificationActivationsInFlightRef.current.delete(target.eventKey);
        });
    },
  );
  const selectHistoryChatFromDrawer = useStableEvent((chat: ChatListItem) => {
    void selectHistoryChat(chat);
  });
  const openChatHistoryContextMenuFromDrawer = useStableEvent(
    openChatHistoryContextMenu,
  );
  const changeComposerPrompt = useStableEvent((nextPrompt: string) => {
    lastForegroundInteractionAtRef.current = Date.now();
    promptRef.current = nextPrompt;
    preflightRef.current = null;
    const queueEdit = promptQueueComposerEditRef.current;
    if (queueEdit?.error) {
      setPromptQueueComposerEditState({ ...queueEdit, error: null });
    }
    if (contextFiles.some((file) => file.source === "search")) {
      setContextFiles((current) => {
        const nextFiles = pruneMissingInlineContextFiles(current, nextPrompt);
        return nextFiles.length === current.length ? current : nextFiles;
      });
    }
  });
  const selectComposerAccount = useStableEvent((accountId: number) => {
    requestCodexAccountSelection(accountId);
  });
  const chooseComposerContextFiles = useStableEvent(() => {
    void chooseContextFiles();
  });
  const searchComposerMentionFiles = useStableEvent((query: string) => {
    void searchMentionFiles(query);
  });
  const selectComposerMentionFile = useStableEvent(addMentionFileToContext);
  const closeComposerMentionSearch = useStableEvent(closeMentionSearch);
  const searchComposerSlashCommands = useStableEvent((query: string) => {
    void searchSlashCommands(query);
  });
  const selectComposerSlashCommand = useStableEvent(handleSlashCommandSelect);
  const closeComposerSlashSearch = useStableEvent(closeSlashCommandSearch);
  const dropComposerContextFiles = useStableEvent(addDroppedContextFiles);
  const receiveNativeContextFileDrop = useStableEvent(
    handleNativeContextFileDrop,
  );
  const getComposerContextFileDropFallback = useStableEvent(
    getExplorerDragContextFiles,
  );
  const completeComposerContextFileDrop = useStableEvent(endWorkspaceFileDrag);
  const removeComposerContextFile = useStableEvent((path: string) => {
    setContextFiles((current) => current.filter((file) => file.path !== path));
  });
  const removeComposerSkill = useStableEvent((skillId: string) => {
    setSelectedSkills((current) =>
      current.filter((skill) => skill.id !== skillId),
    );
  });
  const runComposerPrompt = useStableEvent((nextPrompt: string) => {
    if (promptQueueComposerEditRef.current) {
      void savePromptQueueComposerEdit(nextPrompt);
      return;
    }
    void launchRun(nextPrompt);
  });
  const dispatchSelectedPromptQueue = useStableEvent(() => {
    const chatId =
      workspaceChatSessionsRef.current[selectedWorkspaceRef.current?.id ?? -1]
        ?.chatId;
    if (chatId) {
      schedulePromptQueueDispatch(chatId);
    }
  });
  const editComposerQueuedPrompt = useStableEvent(openPromptQueueComposerEdit);
  const cancelComposerQueuedPromptEdit = useStableEvent(
    cancelPromptQueueComposerEdit,
  );
  const removeComposerQueuedPrompt = useStableEvent((item: PromptQueueItem) => {
    void removeQueuedPrompt(item);
  });
  const retryComposerQueuedPrompt = useStableEvent((item: PromptQueueItem) => {
    void retryQueuedPrompt(item);
  });
  const changeComposerQueuedPromptAutoSend = useStableEvent(
    (item: PromptQueueItem, enabled: boolean) => {
      void changeQueuedPromptAutoSend(item, enabled);
    },
  );
  const sendComposerQueuedPromptNow = useStableEvent(
    (item: PromptQueueItem) => {
      void sendQueuedPromptNow(item);
    },
  );
  const reorderComposerPromptQueue = useStableEvent(
    (orderedItemIds: string[]) => {
      void reorderSelectedPromptQueue(orderedItemIds);
    },
  );
  const stopComposerRun = useStableEvent(() => {
    void stopActiveRun();
  });
  useEffect(() => {
    if (activeView !== "task") return;

    let disposed = false;
    let unregister: () => void = () => undefined;
    void registerNativeContextFileDrop(receiveNativeContextFileDrop)
      .then((cleanup) => {
        if (disposed) {
          cleanup();
        } else {
          unregister = cleanup;
        }
      })
      .catch((error) => {
        if (disposed) return;
        nativeContextDropPathsRef.current = [];
        setTaskContextDropActiveValue(false);
        setStatusMessage(
          `Native file dropping is unavailable: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      });

    return () => {
      disposed = true;
      unregister();
      nativeContextDropPathsRef.current = [];
      taskContextDropActiveRef.current = false;
    };
  }, [activeView, receiveNativeContextFileDrop]);

  useEffect(() => {
    nativeContextDropPathsRef.current = [];
    setTaskContextDropActiveValue(false);
  }, [activeView, selectedWorkspace?.id]);

  const hasComposerContextFileDropFallback = useCallback(
    () => explorerDragContextFileRef.current !== null,
    [],
  );

  const taskQuote = useMemo(
    () => TASK_QUOTES[Math.floor(Math.random() * TASK_QUOTES.length)],
    [],
  );
  const selectedWorkspaceName = selectedWorkspace?.label ?? "Choose a repository";
  const selectedWorkspacePath = selectedWorkspace?.path ?? "No workspace selected";
  const selectedAccount =
    codexAccounts.find((account) => account.id === selectedAccountId) ?? null;
  const selectedModel =
    models.find((model) => model.id === selectedModelId) ?? models[0] ?? null;
  const selectedModelContextWindow =
    getCodexModelContextWindow(selectedModel) ?? DEFAULT_CONTEXT_WINDOW;
  const signedInAccounts = useMemo(
    () => codexAccounts.filter((account) => account.status === "signed_in"),
    [codexAccounts],
  );
  const codexConnected =
    selectedAccountId !== null && connectedAccountIds.has(selectedAccountId);
  const selectedWorkspaceChatSession = selectedWorkspace
    ? (workspaceChatSessions[selectedWorkspace.id] ?? null)
    : null;
  const selectedSubagentConversationKey =
    subagentConversationKey({
      chatId: selectedWorkspaceChatSession?.chatId,
      ownerClientId: selectedDraftChatEntryId,
    });
  const selectedPromptQueueItems = selectedWorkspaceChatSession
    ? (promptQueuesByChat[selectedWorkspaceChatSession.chatId] ?? [])
        .filter(isPromptQueueItemPending)
        .sort(comparePromptQueueDisplayOrder)
    : [];
  useEffect(() => {
    subagentInspectorTargetRef.current = subagentInspectorTarget;
  }, [subagentInspectorTarget]);
  useEffect(() => {
    if (
      subagentInspectorTarget &&
      subagentInspectorTarget.conversationKey !==
        selectedSubagentConversationKey
    ) {
      subagentInspectorTargetRef.current = null;
      setSubagentInspectorTarget(null);
    }
  }, [selectedSubagentConversationKey, subagentInspectorTarget]);
  const inspectedSubagentParentEntry = useMemo(() => {
    if (!subagentInspectorTarget) return null;
    const record = getConversationSubagents(
      subagentInspectorTarget.conversationKey,
    ).find(
      (candidate) => candidate.id === subagentInspectorTarget.subagentId,
    );
    if (!record) return null;
    return (
      taskChatEntries.find(
        (entry) =>
          (record.ownerClientId &&
            entry.clientId === record.ownerClientId) ||
          (record.runId !== null && entry.runId === record.runId),
      ) ?? null
    );
  }, [subagentInspectorTarget, taskChatEntries]);
  useEffect(() => {
    const edit = promptQueueComposerEditRef.current;
    if (
      !edit ||
      (selectedWorkspace?.id === edit.item.workspaceId &&
        selectedWorkspaceChatSession?.chatId === edit.item.chatId)
    ) {
      return;
    }
    setPromptQueueComposerEditState(null);
    restorePromptQueueComposer(edit);
  }, [selectedWorkspace?.id, selectedWorkspaceChatSession?.chatId]);
  const selectedPendingAccountHandoff = selectedWorkspaceChatSession
    ? pendingAccountHandoffs[selectedWorkspaceChatSession.chatId] ?? null
    : null;
  const selectedComposerAccountId =
    selectedPendingAccountHandoff?.targetAccountId ??
    accountIdFromProfileKey(selectedWorkspaceChatSession?.profileKey) ??
    (selectedWorkspaceChatSession ? null : selectedAccountId);
  const selectedComposerAccountPlaceholder =
    selectedWorkspaceChatSession?.profileKey === DEFAULT_CODEX_PROFILE_KEY &&
    !selectedPendingAccountHandoff
      ? "Codex default profile"
      : "Sign in required";
  const planImplementationSelectedModel =
    planImplementationDialog?.models.find(
      (model) => model.id === planImplementationDialog.selectedModelId,
    ) ?? null;
  const planImplementationAccountOptions = useMemo(() => {
    const options: ComposerSelectOption[] = [
      ...(planImplementationDialog?.allowDefaultProfile
        ? [{ value: "default", label: "Codex default profile" }]
        : []),
      ...signedInAccounts.map((account) => ({
        value: account.id.toString(),
        label: account.label,
      })),
    ];
    if (
      planImplementationDialog &&
      planImplementationDialog.profileKey !== DEFAULT_CODEX_PROFILE_KEY &&
      !options.some(
        (option) =>
          option.value === planImplementationDialog.accountId.toString(),
      )
    ) {
      const unavailableAccount = codexAccounts.find(
        (account) => account.id === planImplementationDialog.accountId,
      );
      options.push({
        value: planImplementationDialog.accountId.toString(),
        label: `${
          unavailableAccount?.label ?? "Original Codex account"
        } (sign in required)`,
        disabled: true,
      });
    }
    return options;
  }, [
    codexAccounts,
    planImplementationDialog,
    signedInAccounts,
  ]);
  const planImplementationModelOptions =
    planImplementationDialog?.models.map((model) => ({
      value: model.id,
      label: model.displayName || model.model,
    })) ?? [];
  const planImplementationReasoningOptions =
    planImplementationSelectedModel?.supportedReasoningEfforts.map(
      (option) => ({
        value: option.reasoningEffort,
        label: formatReasoningEffort(option.reasoningEffort),
      }),
    ) ?? [];
  const selectedActiveRunControl = useMemo(() => {
    if (!selectedWorkspace) return null;
    const controls = [...activeRunControlsRef.current.values()];
    if (selectedDraftChatEntryId) {
      return (
        controls.find(
          (control) =>
            control.workspaceId === selectedWorkspace.id &&
            control.clientId === selectedDraftChatEntryId,
        ) ?? null
      );
    }
    if (selectedWorkspaceChatSession?.chatId !== undefined) {
      return (
        controls.find(
          (control) =>
            control.workspaceId === selectedWorkspace.id &&
            control.chatId === selectedWorkspaceChatSession.chatId,
        ) ?? null
      );
    }
    return null;
  }, [
    activeRunRegistryVersion,
    selectedDraftChatEntryId,
    selectedWorkspace,
    selectedWorkspaceChatSession?.chatId,
  ]);
  const runIsActive = Boolean(
    selectedActiveRunControl && isActiveRunControl(selectedActiveRunControl),
  );
  const selectedGoalTerminationPending =
    goalTermination?.workspaceId === selectedWorkspace?.id;
  const selectedGoalProgress = deriveGoalProgressIndicator(
    selectedActiveRunControl?.goal ?? null,
    selectedActiveRunControl?.goalActionPending ?? null,
  );
  const selectedPlanProgress = useMemo(
    () =>
      derivePlanProgressIndicator(selectedActiveRunControl?.runView ?? null),
    [selectedActiveRunControl?.runView],
  );
  const selectedWorkspaceRunningChatActivity = (() => {
    const activityByChatId = new Map<number, string>();
    if (!selectedWorkspace) return activityByChatId;
    activeRunControlsRef.current.forEach((control) => {
      if (
        control.workspaceId === selectedWorkspace.id &&
        control.chatId !== null &&
        isActiveRunControl(control)
      ) {
        const startedAt = control.runView.startedAt;
        if (
          startedAt &&
          historyActivityTime(startedAt) >
            historyActivityTime(activityByChatId.get(control.chatId))
        ) {
          activityByChatId.set(control.chatId, startedAt);
        }
      }
    });
    return activityByChatId;
  })();
  const selectedWorkspaceUnreadChatCount = selectedWorkspace
    ? (unreadCompletedChats[selectedWorkspace.id]?.length ?? 0)
    : 0;
  const canRun = Boolean(selectedWorkspace);
  const selectedGitStatusState = selectedWorkspace
    ? gitStatusStates[selectedWorkspace.id] ?? {
        status: "idle" as const,
        snapshot: null,
        error: null,
      }
    : null;
  const gitStatusByWorkspaceId = useMemo(() => {
    const maps = new Map<number, Map<string, WorkspaceGitFileStatus>>();
    Object.entries(gitStatusStates).forEach(([workspaceId, state]) => {
      const statusByPath = new Map<string, WorkspaceGitFileStatus>();
      state.snapshot?.files.forEach((file) => {
        statusByPath.set(file.relativePath, file);
      });
      maps.set(Number(workspaceId), statusByPath);
    });
    return maps;
  }, [gitStatusStates]);
  const dirtyDirectoryPathsByWorkspaceId = useMemo(() => {
    const maps = new Map<number, Set<string>>();
    Object.entries(gitStatusStates).forEach(([workspaceId, state]) => {
      const paths = new Set<string>();
      state.snapshot?.files.forEach((file) => {
        paths.add("");
        const parts = file.relativePath.split("/");
        for (let index = 1; index < parts.length; index += 1) {
          paths.add(parts.slice(0, index).join("/"));
        }
      });
      maps.set(Number(workspaceId), paths);
    });
    return maps;
  }, [gitStatusStates]);
  const gitStatusByRelativePath = useMemo(() => {
    if (!selectedWorkspace) {
      return EMPTY_GIT_STATUS_BY_PATH;
    }

    return gitStatusByWorkspaceId.get(selectedWorkspace.id) ?? EMPTY_GIT_STATUS_BY_PATH;
  }, [gitStatusByWorkspaceId, selectedWorkspace]);
  const selectedGitSummary = useMemo(
    () => summarizeWorkspaceGitStatus(selectedGitStatusState?.snapshot ?? null),
    [selectedGitStatusState?.snapshot],
  );
  const selectedGitFiles = selectedGitStatusState?.snapshot?.files ?? [];
  const commitMessageFiles = useMemo(
    () => filesIncludedInCommitMessage(selectedGitFiles, includeUnstagedChanges),
    [includeUnstagedChanges, selectedGitFiles],
  );
  const commitMessageSummary = useMemo(
    () =>
      includeUnstagedChanges
        ? summarizeWorkspaceGitFiles(
            commitMessageFiles,
            selectedGitStatusState?.snapshot?.additions,
            selectedGitStatusState?.snapshot?.deletions,
          )
        : summarizeWorkspaceGitFiles(commitMessageFiles),
    [
      commitMessageFiles,
      includeUnstagedChanges,
      selectedGitStatusState?.snapshot?.additions,
      selectedGitStatusState?.snapshot?.deletions,
    ],
  );
  const commitMessageChangeKey = useMemo(
    () =>
      gitChangeFingerprint(
        selectedWorkspace?.path ?? null,
        commitMessageFiles,
        commitMessageSummary,
        includeUnstagedChanges,
      ),
    [
      commitMessageFiles,
      commitMessageSummary,
      includeUnstagedChanges,
      selectedWorkspace?.path,
    ],
  );
  const selectedHasStagedGitChanges = useMemo(
    () =>
      selectedGitFiles.some(
        (file) =>
          file.indexStatus !== " " &&
          file.indexStatus !== "?" &&
          file.indexStatus !== "",
      ),
    [selectedGitFiles],
  );
  const selectedGitOperation = selectedWorkspace
    ? gitOperationsByWorkspace[selectedWorkspace.id] ?? null
    : null;
  const selectedGitActionStatus =
    selectedGitOperation?.status === "running"
      ? selectedGitOperation.phase
      : "idle";
  const headerGitAction = useMemo<HeaderGitAction>(() => {
    const baseLabel = "Commit or push";
    if (!selectedWorkspace) {
      return {
        label: baseLabel,
        disabled: true,
        canCommit: false,
        canPush: false,
        statusLabel: "No folder",
        statusKind: "disabled",
        reason: "Choose a workspace",
      };
    }
    if (selectedGitStatusState?.status === "loading" || selectedGitStatusState?.status === "idle") {
      return {
        label: baseLabel,
        disabled: false,
        canCommit: false,
        canPush: false,
        statusLabel: "Checking git",
        statusKind: "checking",
        reason: "Checking git status",
      };
    }
    if (selectedGitStatusState?.status === "error") {
      return {
        label: baseLabel,
        disabled: false,
        canCommit: false,
        canPush: false,
        statusLabel: "Git unavailable",
        statusKind: "error",
        reason: selectedGitStatusState.error ?? "Git unavailable",
      };
    }
    const snapshot = selectedGitStatusState?.snapshot;
    const canPush = Boolean(snapshot?.canPush);
    if (selectedGitSummary.total > 0) {
      return {
        label: baseLabel,
        disabled: false,
        canCommit: true,
        canPush,
        statusLabel: `${selectedGitSummary.total} changed`,
        statusKind: "changed",
      };
    }
    if (canPush) {
      const ahead = snapshot?.aheadCount ?? 0;
      return {
        label: baseLabel,
        disabled: false,
        canCommit: false,
        canPush: true,
        statusLabel: ahead > 0 ? `${ahead} ahead` : "Ready to push",
        statusKind: "ahead",
      };
    }
    return {
      label: baseLabel,
      disabled: false,
      canCommit: false,
      canPush: false,
      statusLabel: "No changes",
      statusKind: "clean",
      reason: "No changes or pushes available",
    };
  }, [
    selectedGitStatusState?.error,
    selectedGitStatusState?.snapshot,
    selectedGitStatusState?.status,
    selectedGitSummary.total,
    selectedWorkspace,
  ]);
  const canCommitFromDialog =
    headerGitAction.canCommit &&
    (includeUnstagedChanges || selectedHasStagedGitChanges);
  const selectedWorkspaceBaseChatEntries = useMemo(
    () => {
      if (!selectedWorkspace) return [];
      if (selectedWorkspaceChatSession) {
        return taskChatEntries.filter(
          (entry) =>
            entry.workspaceId === selectedWorkspace.id &&
            entry.chatId === selectedWorkspaceChatSession.chatId,
        );
      }
      if (selectedDraftChatEntryId) {
        return taskChatEntries.filter(
          (entry) =>
            entry.workspaceId === selectedWorkspace.id &&
            entry.clientId === selectedDraftChatEntryId,
        );
      }
      return [];
    },
    [
      selectedDraftChatEntryId,
      selectedWorkspace,
      selectedWorkspaceChatSession,
      taskChatEntries,
    ],
  );
  const pendingApprovalAttentions = useMemo(() => {
    const activeControls = [...activeRunControlsRef.current.values()];
    const attentions = unroutedApprovals.filter((attention) =>
      activeControls.some((control) =>
        pendingApprovalCouldBelongToControl(attention, control),
      ),
    );
    const knownKeys = new Set(
      attentions.map(
        ({ request }) => `${request.profileKey}:${request.key}`,
      ),
    );

    activeControls.forEach((control) => {
      if (!isActiveRunControl(control)) return;
      control.runView.approvalRequests.forEach((request) => {
        const key = `${request.profileKey}:${request.key}`;
        if (knownKeys.has(key)) return;
        knownKeys.add(key);
        attentions.push({
          accountId: control.accountId,
          request,
          target: {
            eventKey: approvalNotificationEventKey(request),
            kind: "approval-required",
            workspaceId: control.workspaceId,
            chatId: control.chatId,
            runId: control.runId,
            entryClientId: control.clientId,
            requestId: request.key,
            planItemId: null,
            accountId:
              control.profileKey === DEFAULT_CODEX_PROFILE_KEY
                ? null
                : control.accountId,
            profileKey: control.profileKey,
            threadId: request.threadId ?? control.threadId,
            turnId: request.turnId ?? control.turnId,
            subagentThreadId:
              findSubagentByThread(
                control.profileKey,
                request.threadId,
              )?.ownerClientId === control.clientId
                ? request.threadId
                : null,
          },
        });
      });
    });

    return attentions;
  }, [activeRunRegistryVersion, taskChatEntries, unroutedApprovals]);
  const selectedWorkspaceChatEntries = useMemo(() => {
    if (
      selectedWorkspaceBaseChatEntries.length === 0 ||
      pendingApprovalAttentions.length === 0
    ) {
      return selectedWorkspaceBaseChatEntries;
    }

    let changed = false;
    const entries = selectedWorkspaceBaseChatEntries.map((entry) => {
      const matchingRequests = pendingApprovalAttentions
        .filter((attention) =>
          pendingApprovalMatchesEntry(attention, entry),
        )
        .map((attention) => attention.request);
      if (matchingRequests.length === 0) return entry;

      let nextRunView = entry.runView;
      matchingRequests.forEach((request) => {
        nextRunView = addApprovalRequest(nextRunView, request);
      });
      if (nextRunView === entry.runView) return entry;
      changed = true;
      return {
        ...entry,
        runView: nextRunView,
      };
    });

    return changed ? entries : selectedWorkspaceBaseChatEntries;
  }, [pendingApprovalAttentions, selectedWorkspaceBaseChatEntries]);
  const visibleTaskChatEntries = selectedWorkspaceChatEntries;
  const crossConversationApprovals = useMemo(
    () =>
      pendingApprovalAttentions.filter(
        (attention) =>
          !selectedWorkspaceChatEntries.some((entry) =>
            pendingApprovalMatchesEntry(attention, entry),
          ),
    ),
    [pendingApprovalAttentions, selectedWorkspaceChatEntries],
  );
  const crossConversationApprovalRevision = useMemo(
    () =>
      crossConversationApprovals
        .map(({ request }) => `${request.profileKey}:${request.key}`)
        .sort()
        .join("|"),
    [crossConversationApprovals],
  );
  const floatingStatusNotices = useMemo<FloatingStatusNotice[]>(() => {
    const notices: FloatingStatusNotice[] = [];
    if (crossConversationApprovals.length > 0) {
      const count = crossConversationApprovals.length;
      notices.push({
        id: "cross-conversation-approvals",
        revisionKey: crossConversationApprovalRevision,
        tone: "approval",
        title: count === 1 ? "Approval needed" : `${count} approvals needed`,
        detail:
          count === 1
            ? "Another chat is waiting for your approval"
            : "Other chats are waiting for your approval",
        actionLabel:
          count === 1
            ? "Open chat awaiting approval"
            : "Open oldest chat awaiting approval",
        timeoutMs: null,
      });
    }
    if (approvalSafetyWarning) {
      notices.push({
        id: "approval-safety-warning",
        revisionKey: approvalSafetyWarning,
        tone: "warning",
        title: "Approval unavailable",
        detail: approvalSafetyWarning,
        timeoutMs: FLOATING_STATUS_NOTICE_TIMEOUT_MS,
      });
    }
    if (selectedActiveRunControl?.goalActionError) {
      notices.push({
        id: "goal-action-error",
        revisionKey: selectedActiveRunControl.goalActionError,
        tone: "warning",
        title: "Goal update failed",
        detail: selectedActiveRunControl.goalActionError,
        timeoutMs: FLOATING_STATUS_NOTICE_TIMEOUT_MS,
      });
    }
    if (
      selectedGitOperation &&
      (selectedGitOperation.status === "succeeded" ||
        selectedGitOperation.status === "failed")
    ) {
      notices.push({
        id: `git-operation-${selectedGitOperation.id}`,
        revisionKey: `${selectedGitOperation.status}:${selectedGitOperation.detail}`,
        tone:
          selectedGitOperation.status === "succeeded" ? "success" : "warning",
        title: selectedGitOperation.title,
        detail: selectedGitOperation.detail,
        actionLabel:
          selectedGitOperation.status === "failed"
            ? gitOperationRetryLabel(selectedGitOperation.retryRequest)
            : undefined,
        timeoutMs: FLOATING_STATUS_NOTICE_TIMEOUT_MS,
      });
    }
    return notices;
  }, [
    approvalSafetyWarning,
    crossConversationApprovalRevision,
    crossConversationApprovals.length,
    selectedActiveRunControl?.goalActionError,
    selectedGitOperation,
  ]);
  const activateFloatingStatusNotice = useStableEvent((noticeId: string) => {
    if (noticeId === "cross-conversation-approvals") {
      const oldest = [...crossConversationApprovals].sort((left, right) =>
        left.request.receivedAt.localeCompare(right.request.receivedAt),
      )[0];
      if (oldest) {
        void openPendingApprovalAttention(oldest);
      }
      return;
    }
    if (
      selectedGitOperation?.status === "failed" &&
      noticeId === `git-operation-${selectedGitOperation.id}`
    ) {
      if (selectedGitOperation.retryRequest) {
        retryWorkspaceGitOperation(selectedGitOperation.retryRequest);
      } else {
        openCommitDialog();
      }
    }
  });
  const planReviewAwaiting = visibleTaskChatEntries.some(
    (entry) => entry.runView.nativePlan.reviewState === "available",
  );
  const selectedWorkspaceChatMeta = useMemo(() => {
    let latestPromptEntry: TaskChatEntry | null = null;
    let latestTokenUsage: RunViewState["tokenUsage"] = null;

    for (let index = selectedWorkspaceChatEntries.length - 1; index >= 0; index -= 1) {
      const entry = selectedWorkspaceChatEntries[index];
      if (!latestPromptEntry && entry.prompt.trim().length > 0) {
        latestPromptEntry = entry;
      }
      if (!latestTokenUsage && entry.runView.tokenUsage) {
        latestTokenUsage = entry.runView.tokenUsage;
      }
      if (latestPromptEntry && latestTokenUsage) {
        break;
      }
    }

    return {
      latestPromptEntry,
      latestTokenUsage,
    };
  }, [selectedWorkspaceChatEntries]);
  const selectedHistoryChatLoading =
    selectedWorkspace && historyChatLoadState?.workspaceId === selectedWorkspace.id
      ? historyChatLoadState
      : null;
  const selectedHistoricalTranscript =
    selectedWorkspace &&
    historicalTranscript?.chatId === selectedWorkspaceChatSession?.chatId
      ? historicalTranscript
      : null;
  const selectedTranscriptIdentity = selectedWorkspaceChatSession?.chatId
    ? `chat:${selectedWorkspaceChatSession.chatId}`
    : selectedDraftChatEntryId
      ? `draft:${selectedDraftChatEntryId}`
      : `workspace:${selectedWorkspace?.id ?? "none"}:live`;
  const selectedTranscriptViewportSnapshot = selectedWorkspace
    ? workspaceTaskMemoriesRef.current[selectedWorkspace.id]
        ?.transcriptViewportSnapshot ?? null
    : null;
  const suggestedCommitIntentContext = useMemo(
    () => buildCommitIntentContext(selectedWorkspaceChatEntries),
    [selectedWorkspaceChatEntries],
  );
  const editablePromptEntryId = useMemo(() => {
    if (runIsActive || activeChatEntryId !== null) {
      return null;
    }
    if (
      selectedWorkspaceChatSession?.origin === "codex_external" &&
      selectedWorkspaceChatSession.profileKey === DEFAULT_CODEX_PROFILE_KEY
    ) {
      return null;
    }
    const latestEntry = selectedWorkspaceChatMeta.latestPromptEntry;
    if (
      !latestEntry ||
      latestEntry.status === "connecting" ||
      latestEntry.status === "running"
    ) {
      return null;
    }
    return latestEntry.clientId;
  }, [
    activeChatEntryId,
    runIsActive,
    selectedWorkspaceChatSession?.origin,
    selectedWorkspaceChatSession?.profileKey,
    selectedWorkspaceChatMeta.latestPromptEntry,
  ]);
  const selectedWorkspaceContextUsage = selectedWorkspaceChatMeta.latestTokenUsage;
  const hasTaskChat =
    visibleTaskChatEntries.length > 0 || selectedHistoryChatLoading !== null;
  const codexSignedIn = isCodexSignedIn(codexAccount);
  const authMessage = formatCodexAuthMessage({
    connected: codexConnected,
    account: codexAccount,
    requiresOpenaiAuth,
    loginState,
    loginUserCode,
    errorMessage: loginError,
  });
  const showCancelLogin = loginState === "waiting" && pendingLoginId !== null;
  const showLogout = codexSignedIn;
  const accountSummary = getCodexAccountSummary(codexAccount);
  const authRow = useMemo<AuthRowState>(() => {
    if (codexSignedIn && accountSummary) {
      return {
        title: accountSummary.title,
        subtitle: accountSummary.subtitle,
        avatarLabel: accountSummary.avatarLabel,
        tone: "signed-in",
      };
    }

    if (loginState === "waiting") {
      return {
        title: loginUserCode ? `Enter code ${loginUserCode}` : "Waiting for browser sign-in",
        subtitle: "Complete Codex sign-in in your browser",
        avatarLabel: "C",
        tone: "waiting",
      };
    }

    if (loginState === "starting") {
      return {
        title: "Starting Codex sign-in",
        subtitle: "Opening your browser",
        avatarLabel: "C",
        tone: "waiting",
      };
    }

    if (loginState === "failed") {
      return {
        title: "Sign-in failed",
        subtitle: loginError ?? "Try again",
        avatarLabel: "!",
        tone: "failed",
      };
    }

    if (!codexConnected) {
      return {
        title: "Sign in to Codex",
        subtitle: loginError ?? "Connect and authenticate",
        avatarLabel: "C",
        tone: "default",
      };
    }

    if (!requiresOpenaiAuth) {
      return {
        title: "Sign in to Codex",
        subtitle: "Optional for local runs",
        avatarLabel: "C",
        tone: "default",
      };
    }

    return {
      title: "Sign in to Codex",
      subtitle: "Authentication required",
      avatarLabel: "C",
      tone: "default",
    };
  }, [
    accountSummary,
    codexConnected,
    codexSignedIn,
    loginError,
    loginState,
    loginUserCode,
    requiresOpenaiAuth,
  ]);
  const previewGitStatus = useMemo(
    () => {
      if (!previewState.file) {
        return null;
      }

      const workspace =
        workspaces.find((candidate) =>
          pathBelongsToWorkspace(previewState.file?.path ?? "", candidate.path),
        ) ?? selectedWorkspace;

      if (!workspace) {
        return null;
      }

      return (
        gitStatusByWorkspaceId
          .get(workspace.id)
          ?.get(previewState.file.relativePath) ?? null
      );
    },
    [gitStatusByWorkspaceId, previewState.file, selectedWorkspace, workspaces],
  );
  const previewDiffSections = useMemo(
    () => previewState.diff?.sections ?? [],
    [previewState.diff],
  );
  const previewRenderableDiffSections = useMemo(
    () => previewDiffSections.filter((section) => !section.isBinary),
    [previewDiffSections],
  );
  const previewDiffHasBinary = useMemo(
    () => previewDiffSections.some((section) => section.isBinary),
    [previewDiffSections],
  );
  const previewDiffEmpty =
    previewState.diffStatus === "loaded" && previewDiffSections.length === 0;
  const previewDiffLayout =
    previewDrawerWidth >= DIFF_SIDE_BY_SIDE_MIN_WIDTH
      ? "side-by-side"
      : "inline";
  const previewDrawerMaxWidth = getMaxPreviewDrawerWidth();

  useEffect(() => {
    void bootstrap();
  }, []);

  useEffect(() => {
    persistThemePreference(themePreference);
    setResolvedTheme(applyThemePreference(themePreference));

    if (themePreference !== "system") {
      return;
    }

    return watchSystemTheme((theme) => {
      applyResolvedTheme(theme);
      setResolvedTheme(theme);
    });
  }, [themePreference]);

  useEffect(() => {
    persistAgentNotificationPreferences(agentNotificationPreferences);
  }, [agentNotificationPreferences]);

  useEffect(() => {
    persistComputerUsePreference({ enabled: computerUseEnabled });
  }, [computerUseEnabled]);

  useEffect(() => {
    let disposed = false;
    void readBrowserRuntimeStatus()
      .then((status) => {
        if (!disposed) setBrowserRuntimeStatus(status);
      })
      .catch((error) => {
        if (disposed) return;
        setBrowserRuntimeStatus({
          available: false,
          message:
            error instanceof Error
              ? error.message
              : "The bundled browser runtime is unavailable.",
        });
      });
    return () => {
      disposed = true;
    };
  }, []);

  useEffect(() => {
    let disposed = false;

    const refreshPermission = async () => {
      try {
        const permission = await readAgentNotificationPermissionStatus();
        if (!disposed) {
          agentNotificationPermissionRef.current = permission;
          setAgentNotificationPermission(permission);
        }
      } catch {
        if (!disposed) {
          agentNotificationPermissionRef.current = "unavailable";
          setAgentNotificationPermission("unavailable");
        }
      }
    };
    const handleFocus = () => {
      appFocusedRef.current = true;
      void refreshPermission();
    };
    const handleBlur = () => {
      appFocusedRef.current = false;
    };
    const handleVisibilityChange = () => {
      appVisibleRef.current = document.visibilityState !== "hidden";
      if (appVisibleRef.current) void refreshPermission();
    };

    appFocusedRef.current = document.hasFocus();
    appVisibleRef.current = document.visibilityState !== "hidden";
    void refreshPermission();
    window.addEventListener("focus", handleFocus);
    window.addEventListener("blur", handleBlur);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      disposed = true;
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("blur", handleBlur);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | null = null;

    void listen<AgentNotificationTarget>(
      "orchestrator:agent-notification-activated",
      (event) => {
        if (!disposed) {
          dispatchAgentNotificationActivation(event.payload);
        }
      },
    ).then((dispose) => {
      if (disposed) dispose();
      else unlisten = dispose;
    });
    void takePendingAgentNotificationActivation()
      .then((target) => {
        if (!disposed) {
          dispatchAgentNotificationActivation(target);
        }
      })
      .catch(() => undefined);

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [dispatchAgentNotificationActivation]);

  useEffect(() => {
    if (!selectedWorkspace) {
      return;
    }

    void refreshWorkspaceData(selectedWorkspace.id);
    void refreshBranches(selectedWorkspace);
    void refreshWorkspaceGitStatus(selectedWorkspace);
  }, [selectedWorkspace]);

  useEffect(() => {
    if (!historyDrawerOpen || !selectedWorkspace) {
      return;
    }

    void loadWorkspaceRunHistory(selectedWorkspace, {
      syncExternal: false,
      showLoading: true,
    });
  }, [historyDrawerOpen, selectedWorkspace?.id]);

  useEffect(() => {
    if (historyDrawerPhase !== "open" || !selectedWorkspace) {
      return;
    }

    void loadWorkspaceRunHistory(selectedWorkspace, {
      syncExternal: true,
      showLoading: false,
    });
  }, [historyDrawerPhase, selectedWorkspace?.id]);

  useEffect(() => {
    workspaces.forEach((workspace) => {
      void refreshWorkspaceGitStatus(workspace, { showLoading: false });
    });
  }, [workspaces]);

  useEffect(() => {
    const markForegroundInteraction = () => {
      lastForegroundInteractionAtRef.current = Date.now();
    };

    window.addEventListener("pointerdown", markForegroundInteraction, true);
    window.addEventListener("wheel", markForegroundInteraction, {
      capture: true,
      passive: true,
    });
    window.addEventListener("touchstart", markForegroundInteraction, {
      capture: true,
      passive: true,
    });
    return () => {
      window.removeEventListener("pointerdown", markForegroundInteraction, true);
      window.removeEventListener("wheel", markForegroundInteraction, true);
      window.removeEventListener("touchstart", markForegroundInteraction, true);
    };
  }, []);

  useEffect(() => {
    if (workspaces.length === 0) {
      return;
    }

    let cancelled = false;
    let timeoutId: number | null = null;

    const shouldDeferRefresh = () =>
      document.visibilityState === "hidden" ||
      transcriptScrollActiveRef.current ||
      previewResizingRef.current ||
      historyDrawerPhaseRef.current === "opening" ||
      historyDrawerPhaseRef.current === "closing" ||
      Date.now() - lastForegroundInteractionAtRef.current <
        BACKGROUND_INTERACTION_GRACE_MS;

    const scheduleRefresh = (delay = GIT_STATUS_AUTO_REFRESH_INTERVAL_MS) => {
      if (cancelled) {
        return;
      }

      timeoutId = window.setTimeout(async () => {
        timeoutId = null;
        if (shouldDeferRefresh()) {
          scheduleRefresh(BACKGROUND_REFRESH_RETRY_MS);
          return;
        }

        const selectedWorkspaceId = selectedWorkspaceRef.current?.id ?? null;
        const orderedWorkspaces = [...workspaces].sort(
          (left, right) =>
            Number(right.id === selectedWorkspaceId) -
            Number(left.id === selectedWorkspaceId),
        );

        for (const workspace of orderedWorkspaces) {
          if (cancelled || shouldDeferRefresh()) break;
          await refreshWorkspaceGitStatus(workspace, {
            showLoading: false,
            background: true,
          }).catch(() => undefined);
          if (cancelled || shouldDeferRefresh()) break;
          await refreshVisibleWorkspaceDirectories(workspace);
        }
        scheduleRefresh();
      }, delay);
    };

    scheduleRefresh();

    return () => {
      cancelled = true;
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [expandedDirectoryPaths, expandedWorkspaceIds, workspaces]);

  useEffect(() => {
    selectedWorkspaceRef.current = selectedWorkspace;
  }, [selectedWorkspace]);

  useEffect(() => {
    setSelectedRunAliases(selectedActiveRunControl);
  }, [selectedActiveRunControl]);

  useEffect(() => {
    previewStateRef.current = previewState;
  }, [previewState]);

  useEffect(() => {
    const hasActiveRuns = [...activeRunControlsRef.current.values()].some(
      isActiveRunControl,
    );
    if (!hasActiveRuns) {
      return;
    }

    const tick = () => {
      activeRunControlsRef.current.forEach((control) => {
        if (isActiveRunControl(control)) {
          updateRunControlView(control, (current) => updateRunElapsed(current));
        }
      });
    };

    tick();
    const intervalId = window.setInterval(tick, 1000);
    return () => window.clearInterval(intervalId);
  }, [activeRunRegistryVersion]);

  useEffect(() => {
    if (unroutedApprovals.length === 0) return;
    reconcileUnroutedApprovals();
  }, [activeRunRegistryVersion, taskChatEntries, unroutedApprovals]);

  useEffect(() => {
    mentionSearchRequestId.current += 1;
    setMentionResults([]);
    setMentionSearchStatus("idle");
    setMentionSearchError(null);

    if (selectedWorkspace) {
      workspaceFileIndexCache.current.delete(selectedWorkspace.id);
    }
  }, [selectedWorkspace?.id]);

  useEffect(() => {
    slashCommandSearchRequestId.current += 1;
    setSlashCommandResults(BUILTIN_SLASH_COMMANDS);
    setSlashCommandSearchStatus("idle");
    setSlashCommandSearchError(null);
  }, [selectedAccountId]);

  useEffect(() => {
    if (!workspaceContextMenu) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      const menu = workspaceContextMenuRef.current;
      if (menu && event.target instanceof Node && menu.contains(event.target)) {
        return;
      }

      setWorkspaceContextMenu(null);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setWorkspaceContextMenu(null);
      }
    }

    function handleScroll() {
      setWorkspaceContextMenu(null);
    }

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("scroll", handleScroll, true);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, [workspaceContextMenu]);

  useEffect(() => {
    if (!chatHistoryContextMenu) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      const menu = chatHistoryContextMenuRef.current;
      if (menu && event.target instanceof Node && menu.contains(event.target)) {
        return;
      }

      setChatHistoryContextMenu(null);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setChatHistoryContextMenu(null);
      }
    }

    function handleScroll() {
      setChatHistoryContextMenu(null);
    }

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("scroll", handleScroll, true);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, [chatHistoryContextMenu]);

  useEffect(() => {
    if (!historyDrawerOpen) {
      setChatHistoryContextMenu(null);
    }
  }, [historyDrawerOpen]);

  useEffect(() => {
    if (!workspaceDeleteCandidate) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setWorkspaceDeleteCandidate(null);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [workspaceDeleteCandidate]);

  useEffect(() => {
    if (!chatHistoryDeleteCandidate) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setChatHistoryDeleteCandidate(null);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [chatHistoryDeleteCandidate]);

  useEffect(() => {
    if (!accountHandoffCandidate) {
      return;
    }
    const candidateStatus = accountHandoffCandidate.status;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && candidateStatus === "idle") {
        setAccountHandoffCandidate(null);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [accountHandoffCandidate]);

  useEffect(() => {
    if (!planImplementationDialog) {
      return;
    }
    const canClose = planImplementationDialog.status !== "starting";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && canClose) {
        closePlanImplementationDialog();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [planImplementationDialog]);

  useEffect(() => {
    if (!planImplementationDialog) return;
    const frame = window.requestAnimationFrame(() => {
      const dialog = planImplementationDialogRef.current;
      if (!dialog || dialog.contains(document.activeElement)) return;
      const target =
        dialog.querySelector<HTMLElement>(
          '[role="combobox"]:not([disabled]), button:not([disabled])',
        ) ?? dialog;
      target.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [
    planImplementationDialog?.entry.clientId,
    planImplementationDialog?.status,
  ]);

  useEffect(() => {
    if (!branchCreationDialog) return;
    const canClose = branchCreationDialog.status === "idle";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && canClose) {
        setBranchCreationDialog(null);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [branchCreationDialog?.status]);

  useEffect(() => {
    if (!branchCreationDialog) return;
    const frame = window.requestAnimationFrame(() => {
      branchCreationInputRef.current?.focus({ preventScroll: true });
      branchCreationInputRef.current?.select();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [branchCreationDialog?.workspace.id]);

  useEffect(() => {
    if (
      branchCreationDialog &&
      branchCreationDialog.status === "idle" &&
      branchCreationDialog.workspace.id !== selectedWorkspace?.id
    ) {
      setBranchCreationDialog(null);
    }
  }, [branchCreationDialog, selectedWorkspace?.id]);

  useEffect(() => {
    if (!accountMenuOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      const container = accountMenuContainerRef.current;
      if (container && event.target instanceof Node && container.contains(event.target)) {
        return;
      }

      setAccountMenuOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setAccountMenuOpen(false);
      }
    }

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [accountMenuOpen]);

  useEffect(() => {
    if (selectedWorkspace) {
      workspaceFileIndexCache.current.delete(selectedWorkspace.id);
    }
  }, [selectedWorkspace?.id, selectedGitStatusState?.snapshot]);

  useEffect(() => {
    function handleResize() {
      setPreviewDrawerWidth((current) => clampPreviewDrawerWidth(current));
    }

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (!previewResizing) {
      return;
    }

    function handlePointerMove(event: PointerEvent) {
      setPreviewDrawerWidth(
        clampPreviewDrawerWidth(window.innerWidth - event.clientX),
      );
    }

    function handlePointerUp() {
      setPreviewResizing(false);
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [previewResizing]);

  useEffect(() => {
    codexAccountsRef.current = codexAccounts;
  }, [codexAccounts]);

  useEffect(() => {
    selectedAccountIdRef.current = selectedAccountId;
  }, [selectedAccountId]);

  useEffect(() => {
    connectedAccountIdsRef.current = connectedAccountIds;
  }, [connectedAccountIds]);

  useEffect(() => {
    pendingLoginIdRef.current = pendingLoginId;
  }, [pendingLoginId]);

  useEffect(() => {
    pendingLoginAccountIdRef.current = pendingLoginAccountId;
  }, [pendingLoginAccountId]);

  useEffect(() => {
    modelsRef.current = models;
  }, [models]);

  useEffect(() => {
    modelLoadErrorRef.current = modelLoadError;
  }, [modelLoadError]);

  useEffect(() => {
    if (!codexSignedIn) {
      setAccountMenuOpen(false);
    }
  }, [codexSignedIn]);

  useEffect(() => {
    const selectedModel =
      models.find((model) => model.id === selectedModelId) ?? models[0] ?? null;

    if (!selectedModel) {
      setSelectedReasoningEffort(null);
      return;
    }

    const efforts = selectedModel.supportedReasoningEfforts.map(
      (option) => option.reasoningEffort,
    );
    setSelectedReasoningEffort((current) => {
      if (current && efforts.includes(current)) {
        return current;
      }

      if (efforts.includes(selectedModel.defaultReasoningEffort)) {
        return selectedModel.defaultReasoningEffort;
      }

      return efforts[0] ?? null;
    });
  }, [models, selectedModelId]);

  useEffect(() => {
    let notificationUnlisten: (() => void) | null = null;
    let requestUnlisten: (() => void) | null = null;
    let processUnlisten: (() => void) | null = null;
    let browserSessionUnlisten: (() => void) | null = null;
    let disposed = false;

    void listen<BrowserSessionState>(
      "orchestrator:browser-session",
      (event) => {
        const control = [...activeRunControlsRef.current.values()].find(
          (candidate) =>
            candidate.browserSession?.token === event.payload.token,
        );
        if (control) {
          updateRunControlBrowserState(control, event.payload);
        }
      },
    ).then((unlisten) => {
      if (disposed) unlisten();
      else browserSessionUnlisten = unlisten;
    });

    void listen<CodexMessageEvent>("codex:notification", (event) => {
      const profileKey =
        event.payload.profileKey ??
        (`account:${event.payload.accountId}` as CodexProfileKey);
      void handleCodexNotification(
        event.payload.accountId,
        profileKey,
        event.payload.message,
      );
    }).then((unlisten) => {
      if (disposed) unlisten();
      else notificationUnlisten = unlisten;
    });

    void listen<CodexMessageEvent>("codex:server-request", (event) => {
      const profileKey =
        event.payload.profileKey ??
        (`account:${event.payload.accountId}` as CodexProfileKey);
      void handleCodexServerRequest(
        event.payload.accountId,
        profileKey,
        event.payload.message,
        event.payload.requestToken ?? null,
      );
    }).then((unlisten) => {
      if (disposed) unlisten();
      else requestUnlisten = unlisten;
    });

    void listen<CodexProcessEvent>("codex:process", (event) => {
      const profileKey =
        event.payload.profileKey ??
        (`account:${event.payload.accountId}` as CodexProfileKey);
      const profileControls = [...activeRunControlsRef.current.values()].filter(
        (control) => control.profileKey === profileKey,
      );
      if (
        selectedAccountIdRef.current === event.payload.accountId ||
        profileControls.length > 0
      ) {
        setStatusMessage(event.payload.message);
      }
      if (
        event.payload.status === "exited" ||
        event.payload.status === "stopped"
      ) {
        [
          ...profileControls.flatMap(
            (control) => control.runView.approvalRequests,
          ),
          ...unroutedApprovalsRef.current.map(
            (attention) => attention.request,
          ),
        ]
          .filter((request) => request.profileKey === profileKey)
          .forEach((request) => {
            void removeAgentNotification(
              approvalNotificationEventKey(request),
            ).catch(() => undefined);
          });
        profileControls
          .flatMap((control) =>
            control.runView.serverRequests
              .filter(isNativeUserInputRequest)
              .map((request) => ({ control, request })),
          )
          .forEach(({ control, request }) => {
            void removeAgentNotification(
              userInputNotificationEventKey(control.profileKey, request),
            ).catch(() => undefined);
          });
        setApprovalSafetyWarning(null);
        const remainingUnroutedApprovals =
          unroutedApprovalsRef.current.filter(
            (attention) => attention.request.profileKey !== profileKey,
          );
        unroutedApprovalsRef.current = remainingUnroutedApprovals;
        setUnroutedApprovals(remainingUnroutedApprovals);
      }
      if (profileControls.length > 0) {
        flushFrameBatchedCodexNotifications();
        profileControls.forEach((control) => {
          void persistRunEvent(
            control,
            "process",
            event.payload.status,
            event.payload,
          );
        });
        if (
          event.payload.status === "exited" ||
          event.payload.status === "stopped"
        ) {
          profileControls.forEach((control) => {
            updateRunControlView(control, (current) => ({
              ...current,
              approvalRequests: [],
              approvalResourcesByItemId: {},
              serverRequests: [],
            }));
          });
        }
      }
      setConnectedAccountIds((current) => {
        const next = new Set(current);
        if (event.payload.status === "connected") {
          next.add(event.payload.accountId);
        }
        if (event.payload.status === "exited" || event.payload.status === "stopped") {
          next.delete(event.payload.accountId);
        }
        return next;
      });
      if (event.payload.status === "exited" || event.payload.status === "stopped") {
        collaborationModeMasksRef.current.delete(profileKey);
        if (selectedAccountIdRef.current === event.payload.accountId) {
          setRequiresOpenaiAuth(true);
        }
        if (pendingLoginAccountIdRef.current === event.payload.accountId) {
          dismissExternalLoginNotification(
            event.payload.accountId,
            pendingLoginIdRef.current,
          );
          resetLoginFlow();
        }
      }
    }).then((unlisten) => {
      if (disposed) unlisten();
      else processUnlisten = unlisten;
    });

    return () => {
      disposed = true;
      notificationUnlisten?.();
      requestUnlisten?.();
      processUnlisten?.();
      browserSessionUnlisten?.();
    };
  }, []);

  useEffect(() => {
    if (
      loginState !== "waiting" ||
      !pendingLoginId ||
      !pendingLoginAccountId ||
      !connectedAccountIds.has(pendingLoginAccountId)
    ) {
      return;
    }

    let disposed = false;
    let timeoutId: number | null = null;
    let attempts = 0;
    const maxAttempts = 60;

    const pollAccount = async () => {
      attempts += 1;

      try {
        const response = await refreshAccountState(pendingLoginAccountId, true);
        if (response.account) {
          dismissExternalLoginNotification(pendingLoginAccountId, pendingLoginId);
          if (selectedAccountIdRef.current === pendingLoginAccountId) {
            await refreshCodexModels(pendingLoginAccountId);
          }
          setStatusMessage("Codex sign-in completed.");
          return;
        }
      } catch (error) {
        if (error instanceof DuplicateCodexAccountError) {
          return;
        }
        // Keep waiting; transient refresh failures are common while the browser flow is active.
      }

      if (disposed) {
        return;
      }

      if (attempts >= maxAttempts) {
        dismissExternalLoginNotification(pendingLoginAccountId, pendingLoginId);
        resetLoginFlow("failed");
        setLoginError("Codex sign-in timed out. Try again.");
        setStatusMessage("Sign-in timed out. Try again.");
        return;
      }

      timeoutId = window.setTimeout(pollAccount, 2000);
    };

    timeoutId = window.setTimeout(pollAccount, 2000);

    return () => {
      disposed = true;
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [
    connectedAccountIds,
    loginState,
    pendingLoginAccountId,
    pendingLoginId,
  ]);

  async function bootstrap() {
    await Promise.all([
      recoverAbandonedRuns(),
      recoverInterruptedChatTitleGenerations(),
      recoverInterruptedPromptQueueItems(),
    ]);
    const restoredQueueItems = await holdRestoredPromptQueueItems();
    const restoredQueues = restoredQueueItems.reduce<
      Record<number, PromptQueueItem[]>
    >((queues, item) => {
      (queues[item.chatId] ??= []).push(item);
      return queues;
    }, {});
    const restoredPausedChatIds = new Set(
      restoredQueueItems.map((item) => item.chatId),
    );
    promptQueuesByChatRef.current = restoredQueues;
    pausedPromptQueueChatIdsRef.current = restoredPausedChatIds;
    promptQueuePauseReasonsRef.current = new Map(
      [...restoredPausedChatIds].map((chatId) => [chatId, "restart"]),
    );
    setPromptQueuesByChat(restoredQueues);
    const duplicateProfileIds = await listDuplicateProfilesPendingCleanup();
    await Promise.allSettled(
      duplicateProfileIds.map(async (accountId) => {
        await deleteCodexProfile(accountId);
        await completeDuplicateProfileCleanup(accountId);
      }),
    );

    const [workspaceRows, accountRows] = await Promise.all([
      listWorkspaces(),
      listCodexAccounts(),
    ]);
    const workspace = workspaceRows[0] ?? null;
    const preferredAccount =
      accountRows.find(
        (account) =>
          account.id === workspace?.default_account_id &&
          account.status === "signed_in",
      ) ??
      accountRows.find((account) => account.status === "signed_in") ??
      accountRows[0] ??
      null;

    setWorkspaces(workspaceRows);
    workspacesRef.current = workspaceRows;
    setSelectedWorkspace(workspace);
    selectedWorkspaceRef.current = workspace;
    setCodexAccounts(accountRows);
    codexAccountsRef.current = accountRows;
    setSelectedAccountId(preferredAccount?.id ?? null);
    selectedAccountIdRef.current = preferredAccount?.id ?? null;

    await Promise.allSettled(
      accountRows
        .filter((account) => account.status === "signed_in")
        .map(async (account) => {
          await ensureCodexConnected(account.id);
          await refreshAccountState(account.id, true);
        }),
    );

    if (preferredAccount) {
      await refreshCodexModels(preferredAccount.id);
    }

    bootstrapCompleteRef.current = true;
    const pendingActivation = pendingNotificationActivationRef.current;
    pendingNotificationActivationRef.current = null;
    dispatchAgentNotificationActivation(pendingActivation);
  }

  async function refreshWorkspaceData(workspaceId: number) {
    const summary = await getAnalyticsSummary(workspaceId);
    setAnalytics(summary);
  }

  async function syncExternalCodexChats(workspace: Workspace) {
    try {
      await connectDefaultCodexProfile();
      setConnectedAccountIds((current) => {
        const next = new Set(current).add(0);
        connectedAccountIdsRef.current = next;
        return next;
      });
      const response = await codexDefaultProfileRpc<unknown>("thread/list", {
        cwd: workspace.path,
        sourceKinds: EXTERNAL_CODEX_SOURCE_KINDS,
        archived: false,
        sortKey: "recency_at",
        sortDirection: "desc",
        limit: 100,
      });
      const root = readObject(response);
      const threads =
        readArray(root.threads).length > 0
          ? readArray(root.threads)
          : readArray(root.data).length > 0
            ? readArray(root.data)
            : readArray(root.items);
      await upsertExternalCodexChats(
        threads.flatMap((threadValue) => {
          const thread = readObject(threadValue);
          const id = readString(thread.id);
          if (!id) {
            return [];
          }
          const threadSource = readString(thread.threadSource);
          if (threadSource === "orchestrator") {
            return [];
          }
          const sourceKind =
            threadSource ?? readString(readObject(thread.source).kind) ?? "unknown";
          const title =
            readString(thread.name) ??
            readString(thread.preview) ??
            "Untitled Codex chat";
          return [
            {
              workspaceId: workspace.id,
              profileKey: "default" as const,
              externalThreadId: id,
              title,
              status: readString(thread.status) ?? "completed",
              sourceKind,
              cwd: readString(thread.cwd),
              createdAt: readString(thread.createdAt),
              updatedAt: readString(thread.updatedAt),
            },
          ];
        }),
      );
    } catch (error) {
      setStatusMessage(
        `Could not sync Codex history: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  function updateHistoryChatTitle(
    chatId: number,
    title: string,
    generationState: "complete" | "failed",
  ) {
    setHistoryState((current) => {
      const index = current.chats.findIndex((chat) => chat.id === chatId);
      if (index < 0) return current;
      const existing = current.chats[index];
      if (
        existing?.title === title &&
        existing.title_generation_state === generationState
      ) {
        return current;
      }
      const chats = current.chats.slice();
      chats[index] = {
        ...existing,
        title,
        title_generation_state: generationState,
        title_generation_started_at: null,
      };
      return { ...current, chats };
    });
  }

  function setChatPromptQueue(chatId: number, items: PromptQueueItem[]) {
    const nextItems = items
      .filter(isPromptQueueItemPending)
      .sort(comparePromptQueueDisplayOrder);
    const next = {
      ...promptQueuesByChatRef.current,
      [chatId]: nextItems,
    };
    if (nextItems.length === 0) {
      delete next[chatId];
    }
    promptQueuesByChatRef.current = next;
    setPromptQueuesByChat(next);
  }

  function upsertPromptQueueItemInMemory(item: PromptQueueItem) {
    const current = promptQueuesByChatRef.current[item.chatId] ?? [];
    const index = current.findIndex((candidate) => candidate.id === item.id);
    const next =
      index < 0
        ? [...current, item]
        : current.map((candidate) =>
            candidate.id === item.id ? item : candidate,
          );
    setChatPromptQueue(item.chatId, next);
  }

  function removePromptQueueItemFromMemory(chatId: number, itemId: string) {
    setChatPromptQueue(
      chatId,
      (promptQueuesByChatRef.current[chatId] ?? []).filter(
        (item) => item.id !== itemId,
      ),
    );
  }

  async function refreshPromptQueue(chatId: number) {
    const items = await listPromptQueueItems(chatId);
    setChatPromptQueue(chatId, items);
    return items;
  }

  function setPromptQueuePaused(
    chatId: number,
    paused: boolean,
    reason: PromptQueuePauseReason = "manual",
  ) {
    const next = new Set(pausedPromptQueueChatIdsRef.current);
    if (paused) {
      next.add(chatId);
      promptQueuePauseReasonsRef.current.set(chatId, reason);
    } else {
      next.delete(chatId);
      promptQueuePauseReasonsRef.current.delete(chatId);
    }
    pausedPromptQueueChatIdsRef.current = next;
  }

  function startChatTitleGeneration(request: ChatTitleGenerationRequest) {
    if (chatTitleGenerationsInFlightRef.current.has(request.chatId)) return;
    chatTitleGenerationsInFlightRef.current.add(request.chatId);

    void (async () => {
      try {
        if (!(await claimChatTitleGeneration(request.chatId))) return;
        const result = await generateChatTitle({
          workspacePath: request.workspacePath,
          accountId: request.accountId,
          model: request.model,
          initialPrompt: request.initialPrompt,
        });
        const title = sanitizeGeneratedChatTitle(result.title);
        if (!title) {
          throw new Error("Codex returned an invalid conversation title");
        }
        if (await completeChatTitleGeneration(request.chatId, title)) {
          updateHistoryChatTitle(request.chatId, title, "complete");
        }
      } catch (error) {
        console.warn(
          `AI chat title generation failed for chat ${request.chatId}; using the prompt-based fallback.`,
          error,
        );
        if (await failChatTitleGeneration(request.chatId).catch(() => false)) {
          updateHistoryChatTitle(
            request.chatId,
            request.fallbackTitle,
            "failed",
          );
          setStatusMessage(
            "AI title generation failed; using the prompt-based title.",
          );
        }
      } finally {
        chatTitleGenerationsInFlightRef.current.delete(request.chatId);
      }
    })();
  }

  async function loadWorkspaceRunHistory(
    workspaceOrId: Workspace | number,
    options: LoadWorkspaceHistoryOptions = {},
  ) {
    const syncExternal = options.syncExternal ?? true;
    const showLoading = options.showLoading ?? true;
    const workspace =
      typeof workspaceOrId === "number"
        ? workspaces.find((candidate) => candidate.id === workspaceOrId) ??
          (selectedWorkspaceRef.current?.id === workspaceOrId
            ? selectedWorkspaceRef.current
            : null)
        : workspaceOrId;
    const workspaceId =
      typeof workspaceOrId === "number" ? workspaceOrId : workspaceOrId.id;
    if (showLoading) {
      setHistoryState((current) => ({
        ...current,
        status: "loading",
        error: null,
      }));
    }
    try {
      if (workspace && syncExternal) {
        await syncExternalCodexChats(workspace);
      }
      const chats = await listWorkspaceChats(workspaceId);
      setHistoryState((current) => {
        const currentById = new Map(current.chats.map((chat) => [chat.id, chat]));
        const mergedChats = chats.map((chat) => {
          const existing = currentById.get(chat.id);
          const incomingIsPending =
            chat.title_generation_state === "pending" ||
            chat.title_generation_state === "generating";
          const existingIsSettled =
            existing?.title_generation_state === "complete" ||
            existing?.title_generation_state === "failed";
          return incomingIsPending && existingIsSettled
            ? {
                ...chat,
                title: existing.title,
                title_generation_state: existing.title_generation_state,
                title_generation_started_at: null,
              }
            : chat;
        });
        return { status: "loaded", chats: mergedChats, error: null };
      });
    } catch (error) {
      if (showLoading) {
        setHistoryState({
          status: "error",
          chats: [],
          error: error instanceof Error ? error.message : String(error),
        });
      } else {
        setStatusMessage(
          `Could not refresh chat history: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }

  async function refreshSelectedWorkspaceHistory() {
    if (!selectedWorkspaceRef.current || !historyDrawerOpen) {
      return;
    }
    await loadWorkspaceRunHistory(selectedWorkspaceRef.current);
  }

  async function refreshWorkspaceGitStatus(
    workspace: Workspace,
    options: RefreshWorkspaceGitStatusOptions = {},
  ) {
    const existingRefresh = gitStatusRefreshCache.current.get(workspace.id);
    if (existingRefresh) {
      if (!options.force) {
        return existingRefresh;
      }

      // A completion refresh must observe the filesystem after the turn. An
      // in-flight poll may have captured the pre-run state, so wait for it and
      // issue one new request instead of reusing its potentially stale result.
      await existingRefresh.catch(() => undefined);
      return refreshWorkspaceGitStatus(workspace, {
        ...options,
        force: false,
      });
    }

    const showLoading = options.showLoading ?? true;
    if (showLoading) {
      setGitStatusStates((current) => ({
        ...current,
        [workspace.id]: {
          status: "loading",
          snapshot: current[workspace.id]?.snapshot ?? null,
          error: null,
        },
      }));
    }

    const refresh = listWorkspaceGitStatus(workspace.path)
      .then((snapshot) => {
        const update = () => {
          setGitStatusStates((current) => {
            const previous = current[workspace.id];
            if (
              previous?.status === "loaded" &&
              previous.error === null &&
              gitStatusSnapshotKey(previous.snapshot) ===
                gitStatusSnapshotKey(snapshot)
            ) {
              return current;
            }

            return {
              ...current,
              [workspace.id]: { status: "loaded", snapshot, error: null },
            };
          });
        };
        if (options.background) startTransition(update);
        else update();
      })
      .catch((error) => {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const update = () => {
          setGitStatusStates((current) => {
            const previous = current[workspace.id];
            if (previous?.status === "error" && previous.error === errorMessage) {
              return current;
            }

            return {
              ...current,
              [workspace.id]: {
                status: "error",
                snapshot: previous?.snapshot ?? null,
                error: errorMessage,
              },
            };
          });
        };
        if (options.background) startTransition(update);
        else update();
      })
      .finally(() => {
        gitStatusRefreshCache.current.delete(workspace.id);
      });

    gitStatusRefreshCache.current.set(workspace.id, refresh);
    return refresh;
  }

  async function refreshBranches(workspace: Workspace) {
    try {
      const result = await listGitBranches(workspace.path);
      if (selectedWorkspaceRef.current?.id !== workspace.id) {
        return;
      }
      setBranches(result.branches);
      setSelectedBranch(result.currentBranch ?? result.branches[0] ?? null);
    } catch (error) {
      if (selectedWorkspaceRef.current?.id !== workspace.id) {
        return;
      }
      setBranches([]);
      setSelectedBranch(null);
      setStatusMessage(
        `Branches unavailable for ${workspace.label}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  function resetLoginFlow(nextState: CodexLoginState = "idle") {
    setLoginState(nextState);
    setPendingLoginId(null);
    setPendingLoginAccountId(null);
    setLoginUserCode(null);
    pendingLoginIdRef.current = null;
    pendingLoginAccountIdRef.current = null;
  }

  async function discardDuplicateAccount(
    duplicateAccountId: number,
    existingAccount: CodexAccountProfile,
    email: string,
  ) {
    await deleteCodexProfile(duplicateAccountId).catch(() => undefined);
    await softDeleteCodexAccount(duplicateAccountId);

    setConnectedAccountIds((current) => {
      const next = new Set(current);
      next.delete(duplicateAccountId);
      connectedAccountIdsRef.current = next;
      return next;
    });
    setCodexAccounts((current) => {
      const next = current.filter(
        (account) => account.id !== duplicateAccountId,
      );
      codexAccountsRef.current = next;
      return next;
    });

    setSelectedAccountId(existingAccount.id);
    selectedAccountIdRef.current = existingAccount.id;
    setCodexAccount({
      type: "chatgpt",
      email: existingAccount.email,
      planType: existingAccount.plan_type ?? "unknown",
    });
    setRequiresOpenaiAuth(true);
    setLoginError(null);
    setAccountMenuOpen(false);
    resetLoginFlow();
    setStatusMessage(
      `${email} is already added. Switched back to ${existingAccount.label}.`,
    );

    await ensureCodexConnected(existingAccount.id).catch(() => undefined);
    await refreshCodexModels(existingAccount.id).catch(() => undefined);
  }

  async function refreshAccountState(accountId: number, refreshToken = true) {
    try {
      const response = await readCodexAccount(accountId, { refreshToken });
      const chatgptAccount =
        response.account?.type === "chatgpt" ? response.account : null;
      const existing = codexAccountsRef.current.find(
        (account) => account.id === accountId,
      );
      const normalizedEmail = chatgptAccount?.email?.trim().toLowerCase();
      const duplicateAccount = normalizedEmail
        ? codexAccountsRef.current.find(
            (account) =>
              account.id !== accountId &&
              account.deleted_at === null &&
              account.email?.trim().toLowerCase() === normalizedEmail,
          )
        : null;

      if (duplicateAccount && chatgptAccount?.email) {
        const duplicateError = new DuplicateCodexAccountError(
          accountId,
          duplicateAccount.id,
          chatgptAccount.email,
        );
        await discardDuplicateAccount(
          accountId,
          duplicateAccount,
          chatgptAccount.email,
        );
        throw duplicateError;
      }

      const nextLabel =
        existing?.label && existing.label !== "New Codex account"
          ? existing.label
          : (chatgptAccount?.email ?? existing?.label ?? "Codex account");
      const profileStatus: CodexAccountStatus = chatgptAccount
        ? "signed_in"
        : "signed_out";

      await updateCodexAccount(accountId, {
        label: nextLabel,
        email: chatgptAccount?.email ?? null,
        planType: chatgptAccount?.planType ?? null,
        status: profileStatus,
        lastError: null,
        touchLastUsed: Boolean(chatgptAccount),
      });
      setCodexAccounts((current) => {
        const next = current.map((account) =>
          account.id === accountId
            ? {
                ...account,
                label: nextLabel,
                email: chatgptAccount?.email ?? null,
                plan_type: chatgptAccount?.planType ?? null,
                status: profileStatus,
                last_error: null,
                last_used_at: chatgptAccount
                  ? new Date().toISOString()
                  : account.last_used_at,
              }
            : account,
        );
        codexAccountsRef.current = next;
        return next;
      });

      if (selectedAccountIdRef.current === accountId) {
        setCodexAccount(response.account);
        setRequiresOpenaiAuth(response.requiresOpenaiAuth);
      }
      setLoginError(null);

      if (
        response.account &&
        pendingLoginAccountIdRef.current === accountId
      ) {
        resetLoginFlow();
        setAccountMenuOpen(false);
      }

      return response;
    } catch (error) {
      if (error instanceof DuplicateCodexAccountError) {
        throw error;
      }

      const message = error instanceof Error ? error.message : String(error);
      await updateCodexAccount(accountId, {
        status: "error",
        lastError: message,
      });
      setCodexAccounts((current) => {
        const next = current.map((account) =>
          account.id === accountId
            ? { ...account, status: "error" as const, last_error: message }
            : account,
        );
        codexAccountsRef.current = next;
        return next;
      });
      if (selectedAccountIdRef.current === accountId) {
        // A failed account/read request is transport state, not evidence that
        // the user signed out. Preserve the last confirmed account so a
        // transient timeout can be retried after connectivity returns.
        setLoginError(message);
      }
      throw error;
    }
  }

  async function refreshCodexModels(accountId: number) {
    try {
      const visibleModels = await listCodexModels(accountId);
      setModels(visibleModels);
      setModelLoadError(null);
      setSelectedModelId((current) => {
        if (current && visibleModels.some((model) => model.id === current)) {
          return current;
        }

        return (
          visibleModels.find((model) => model.isDefault)?.id ??
          visibleModels[0]?.id ??
          null
        );
      });
    } catch (error) {
      setModels([]);
      setSelectedModelId(null);
      setSelectedReasoningEffort(null);
      setModelLoadError(error instanceof Error ? error.message : String(error));
    }
  }

  async function listCodexModelsForProfile(
    profileKey: CodexProfileKey,
    accountId: number,
  ) {
    await ensureCodexProfileConnected(profileKey, accountId);
    if (profileKey !== DEFAULT_CODEX_PROFILE_KEY) {
      return listCodexModels(accountId);
    }

    const visibleModels: CodexModel[] = [];
    let cursor: string | null = null;
    do {
      const response: {
        data?: CodexModel[];
        nextCursor?: string | null;
      } = await codexDefaultProfileRpc("model/list", {
        includeHidden: false,
        limit: 100,
        cursor,
      });
      visibleModels.push(
        ...(response.data ?? []).filter((model: CodexModel) => !model.hidden),
      );
      cursor = response.nextCursor ?? null;
    } while (cursor);
    return visibleModels;
  }

  async function chooseWorkspace() {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "Choose a repository workspace",
    });

    if (typeof selected !== "string") {
      return;
    }

    cancelAgentNotificationNavigation();
    const workspace = await upsertWorkspace(selected);
    historyChatLoadIdRef.current += 1;
    cancelActiveExternalTranscriptSync();
    cancelActiveHistoricalTranscriptPreparation();
    pendingTranscriptCommitRef.current = null;
    transcriptScrollActiveRef.current = false;
    setHistoryChatLoadState(null);
    setHistoryOpenRequest(null);
    setHistoricalTranscript(null);
    setWorkspaces(await listWorkspaces());
    setSelectedWorkspace(workspace);
    setActiveView("task");
    setStatusMessage(`Selected ${workspace.label}`);
  }

  function createEmptyWorkspaceTaskMemory(): WorkspaceTaskMemory {
    return {
      selection: { kind: "new" },
      prompt: "",
      contextFiles: [],
      selectedSkills: [],
      historicalTranscript: null,
      transcriptViewportSnapshot: null,
    };
  }

  function sanitizeRememberedHistoricalTranscript(
    transcript: HistoricalTranscriptState | null,
  ) {
    return transcript
      ? {
          ...transcript,
          positionIntent: "preserve" as const,
          openAtLatestRequest: null,
        }
      : null;
  }

  function rememberCurrentWorkspaceTaskMemory() {
    const workspace = selectedWorkspaceRef.current;
    if (!workspace) return;

    const session = workspaceChatSessionsRef.current[workspace.id];
    const selection: WorkspaceTaskSelection = selectedDraftChatEntryIdRef.current
      ? { kind: "draft", clientId: selectedDraftChatEntryIdRef.current }
      : session
        ? { kind: "chat", session: { ...session } }
        : { kind: "new" };
    const transcript =
      session && historicalTranscriptRef.current?.chatId === session.chatId
        ? sanitizeRememberedHistoricalTranscript(
            historicalTranscriptRef.current,
          )
        : null;

    const existing = workspaceTaskMemoriesRef.current[workspace.id];
    workspaceTaskMemoriesRef.current[workspace.id] = {
      selection,
      prompt: promptRef.current,
      contextFiles: [...contextFilesRef.current],
      selectedSkills: [...selectedSkillsRef.current],
      historicalTranscript: transcript,
      transcriptViewportSnapshot:
        existing?.transcriptViewportSnapshot ?? null,
    };
  }

  function rememberTranscriptViewportSnapshot(
    snapshot: TranscriptViewportSnapshot,
  ) {
    const memory = workspaceTaskMemoriesRef.current[snapshot.workspaceId];
    if (!memory) return;
    const expectedIdentity =
      memory.selection.kind === "chat"
        ? `chat:${memory.selection.session.chatId}`
        : memory.selection.kind === "draft"
          ? `workspace:${snapshot.workspaceId}:live`
          : null;
    if (snapshot.transcriptIdentity !== expectedIdentity) return;
    workspaceTaskMemoriesRef.current[snapshot.workspaceId] = {
      ...memory,
      transcriptViewportSnapshot: snapshot,
    };
  }

  function rememberWorkspaceTaskSelection(
    workspaceId: number,
    selection: WorkspaceTaskSelection,
    transcript: HistoricalTranscriptState | null = null,
  ) {
    const existing =
      workspaceTaskMemoriesRef.current[workspaceId] ??
      createEmptyWorkspaceTaskMemory();
    const useVisibleComposer =
      selectedWorkspaceRef.current?.id === workspaceId;
    workspaceTaskMemoriesRef.current[workspaceId] = {
      selection,
      prompt: useVisibleComposer ? promptRef.current : existing.prompt,
      contextFiles: useVisibleComposer
        ? [...contextFilesRef.current]
        : [...existing.contextFiles],
      selectedSkills: useVisibleComposer
        ? [...selectedSkillsRef.current]
        : [...existing.selectedSkills],
      historicalTranscript: sanitizeRememberedHistoricalTranscript(transcript),
      transcriptViewportSnapshot: null,
    };
  }

  function updateRememberedWorkspaceChatSession(
    workspaceId: number,
    chatId: number,
    session: WorkspaceChatSession,
  ) {
    const memory = workspaceTaskMemoriesRef.current[workspaceId];
    if (
      memory?.selection.kind !== "chat" ||
      memory.selection.session.chatId !== chatId
    ) {
      return false;
    }

    workspaceTaskMemoriesRef.current[workspaceId] = {
      ...memory,
      selection: { kind: "chat", session: { ...session } },
    };
    setWorkspaceChatSession(workspaceId, session);
    return true;
  }

  function promoteRememberedWorkspaceDraft(
    workspaceId: number,
    clientId: string,
    session: WorkspaceChatSession,
  ) {
    const memory = workspaceTaskMemoriesRef.current[workspaceId];
    const selectedDraftMatches =
      selectedWorkspaceRef.current?.id === workspaceId &&
      selectedDraftChatEntryIdRef.current === clientId;
    const rememberedDraftMatches =
      memory?.selection.kind === "draft" &&
      memory.selection.clientId === clientId;
    if (!selectedDraftMatches && !rememberedDraftMatches) {
      return false;
    }

    rememberWorkspaceTaskSelection(
      workspaceId,
      { kind: "chat", session },
      null,
    );
    setWorkspaceChatSession(workspaceId, session);
    if (selectedDraftMatches) {
      setSelectedDraftChat(null);
      setSelectedHistoryChatId(session.chatId);
    }
    return true;
  }

  function restoreWorkspaceComposer(memory: WorkspaceTaskMemory) {
    replaceComposerPrompt(memory.prompt);
    contextFilesRef.current = [...memory.contextFiles];
    selectedSkillsRef.current = [...memory.selectedSkills];
    setContextFiles([...memory.contextFiles]);
    setSelectedSkills([...memory.selectedSkills]);
  }

  function updateRememberedWorkspaceComposer(
    workspaceId: number,
    update: Partial<
      Pick<
        WorkspaceTaskMemory,
        "prompt" | "contextFiles" | "selectedSkills"
      >
    >,
  ) {
    const existing =
      workspaceTaskMemoriesRef.current[workspaceId] ??
      createEmptyWorkspaceTaskMemory();
    const next: WorkspaceTaskMemory = {
      ...existing,
      ...update,
      contextFiles: update.contextFiles
        ? [...update.contextFiles]
        : existing.contextFiles,
      selectedSkills: update.selectedSkills
        ? [...update.selectedSkills]
        : existing.selectedSkills,
    };
    workspaceTaskMemoriesRef.current[workspaceId] = next;
    if (selectedWorkspaceRef.current?.id !== workspaceId) return;
    if (update.prompt !== undefined) {
      replaceComposerPrompt(update.prompt);
    }
    if (update.contextFiles) {
      contextFilesRef.current = [...update.contextFiles];
      setContextFiles([...update.contextFiles]);
    }
    if (update.selectedSkills) {
      selectedSkillsRef.current = [...update.selectedSkills];
      setSelectedSkills([...update.selectedSkills]);
    }
  }

  function removeSubmittedImagesFromWorkspaceComposer(
    workspaceId: number,
    submittedFiles: ComposerContextFile[],
  ) {
    const submittedImagePaths = new Set(
      submittedFiles
        .filter(isImageContextFile)
        .flatMap((file) => [file.path, file.canonicalPath])
        .filter((path): path is string => Boolean(path)),
    );
    if (submittedImagePaths.size === 0) return;

    const currentFiles =
      selectedWorkspaceRef.current?.id === workspaceId
        ? contextFilesRef.current
        : workspaceTaskMemoriesRef.current[workspaceId]?.contextFiles ?? [];
    updateRememberedWorkspaceComposer(workspaceId, {
      contextFiles: currentFiles.filter(
        (file) =>
          !submittedImagePaths.has(file.path) &&
          (!file.canonicalPath ||
            !submittedImagePaths.has(file.canonicalPath)),
      ),
    });
  }

  function restoreRunComposerForRetry(
    workspaceId: number,
    prompt: string,
    imageFiles: ComposerContextFile[],
  ) {
    const currentFiles =
      selectedWorkspaceRef.current?.id === workspaceId
        ? contextFilesRef.current
        : workspaceTaskMemoriesRef.current[workspaceId]?.contextFiles ?? [];
    updateRememberedWorkspaceComposer(workspaceId, {
      prompt,
      contextFiles: mergeContextFiles(currentFiles, imageFiles),
    });
  }

  function rememberedWorkspaceSelectionStillMatches(
    workspaceId: number,
    selection: WorkspaceTaskSelection,
  ) {
    const current = workspaceTaskMemoriesRef.current[workspaceId]?.selection;
    if (!current || current.kind !== selection.kind) return false;
    if (selection.kind === "new") return true;
    if (selection.kind === "draft") {
      return current.kind === "draft" && current.clientId === selection.clientId;
    }
    return (
      current.kind === "chat" &&
      current.session.chatId === selection.session.chatId
    );
  }

  function fallBackToNewWorkspaceChat(workspace: Workspace, message: string) {
    const previousSession = workspaceChatSessionsRef.current[workspace.id];
    if (previousSession) {
      clearPendingAccountHandoff(previousSession.chatId);
    }
    const existing =
      workspaceTaskMemoriesRef.current[workspace.id] ??
      createEmptyWorkspaceTaskMemory();
    workspaceTaskMemoriesRef.current[workspace.id] = {
      ...existing,
      selection: { kind: "new" },
      historicalTranscript: null,
      transcriptViewportSnapshot: null,
    };
    if (selectedWorkspaceRef.current?.id !== workspace.id) return;

    flushSync(() => {
      setWorkspaceChatSession(workspace.id, undefined);
      setSelectedDraftChat(null);
      setSelectedHistoryChatId(null);
      setHistoryChatLoadState(null);
      setHistoryOpenRequest(null);
      historicalTranscriptRef.current = null;
      setHistoricalTranscript(null);
      setSelectedRunAliases(null);
    });
    setStatusMessage(message);
  }

  async function reloadRememberedWorkspaceChat(
    workspace: Workspace,
    selection: Extract<WorkspaceTaskSelection, { kind: "chat" }>,
  ) {
    try {
      const chatWithRuns = await getChatWithRuns(selection.session.chatId);
      if (
        selectedWorkspaceRef.current?.id !== workspace.id ||
        !rememberedWorkspaceSelectionStillMatches(workspace.id, selection)
      ) {
        return;
      }
      await selectHistoryChat(chatWithRuns.chat, {
        source: "workspace",
        workspace,
        positionIntent: "preserve",
      });
    } catch (error) {
      if (
        selectedWorkspaceRef.current?.id !== workspace.id ||
        !rememberedWorkspaceSelectionStillMatches(workspace.id, selection)
      ) {
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      if (/chat (?:was )?not found/i.test(message)) {
        fallBackToNewWorkspaceChat(
          workspace,
          "The previous chat is no longer available. Started a new chat.",
        );
        return;
      }
      setHistoryChatLoadState((current) =>
        current?.workspaceId === workspace.id &&
        current.chatId === selection.session.chatId
          ? { ...current, error: message }
          : current,
      );
      setStatusMessage(`Could not restore the previous chat: ${message}`);
    }
  }

  function selectWorkspace(workspaceId: number) {
    const workspace = workspaces.find((candidate) => candidate.id === workspaceId);
    if (!workspace) {
      return;
    }

    cancelAgentNotificationNavigation();
    const previousWorkspaceId = selectedWorkspaceRef.current?.id ?? null;
    if (previousWorkspaceId === workspace.id) {
      setWorkspaceContextMenu(null);
      setActiveView("task");
      setStatusMessage(`Selected ${workspace.label}`);
      return;
    }

    taskChatTranscriptRef.current?.captureViewportState();
    rememberCurrentWorkspaceTaskMemory();
    historyChatLoadIdRef.current += 1;
    cancelActiveExternalTranscriptSync();
    cancelActiveHistoricalTranscriptPreparation();
    pendingTranscriptCommitRef.current = null;
    transcriptScrollActiveRef.current = false;

    const memory =
      workspaceTaskMemoriesRef.current[workspace.id] ??
      createEmptyWorkspaceTaskMemory();
    workspaceTaskMemoriesRef.current[workspace.id] = memory;
    let selection = memory.selection;
    let restoredTranscript = memory.historicalTranscript;
    let restoredEntries: TaskChatEntry[] | null = null;
    let selectedRunControl: ActiveRunControl | null = null;
    let needsHistoryReload = false;

    if (selection.kind === "draft") {
      const draftSelection = selection;
      const draftExists = taskChatEntriesRef.current.some(
        (entry) =>
          entry.workspaceId === workspace.id &&
          entry.clientId === draftSelection.clientId,
      );
      selectedRunControl =
        activeRunControlsRef.current.get(draftSelection.clientId) ?? null;
      if (!draftExists && selectedRunControl?.entry) {
        restoredEntries = [
          ...taskChatEntriesRef.current.filter(
            (entry) => entry.clientId !== selectedRunControl?.clientId,
          ),
          selectedRunControl.entry,
        ];
      }
      if (!draftExists && !selectedRunControl) {
        selection = { kind: "new" };
        workspaceTaskMemoriesRef.current[workspace.id] = {
          ...memory,
          selection,
          historicalTranscript: null,
          transcriptViewportSnapshot: null,
        };
      }
    } else if (selection.kind === "chat") {
      const chatSelection = selection;
      selectedRunControl = findRunControlByChat(
        workspace.id,
        chatSelection.session.chatId,
      );
      const chatEntriesExist = taskChatEntriesRef.current.some(
        (entry) =>
          entry.workspaceId === workspace.id &&
          entry.chatId === chatSelection.session.chatId,
      );
      if (!chatEntriesExist) {
        const cached = stableHistoryChatCacheRef.current.get(
          chatSelection.session.chatId,
        );
        if (cached) {
          const cachedEntries = selectedRunControl?.entry
            ? [
                ...cached.entries.filter(
                  (entry) => entry.clientId !== selectedRunControl?.clientId,
                ),
                selectedRunControl.entry,
              ]
            : cached.entries;
          restoredEntries = replaceChatEntries(
            taskChatEntriesRef.current,
            workspace.id,
            chatSelection.session.chatId,
            cachedEntries,
          );
          restoredTranscript =
            restoredTranscript ??
            sanitizeRememberedHistoricalTranscript(cached.transcript);
        } else if (selectedRunControl?.entry) {
          restoredEntries = replaceChatEntries(
            taskChatEntriesRef.current,
            workspace.id,
            chatSelection.session.chatId,
            [selectedRunControl.entry],
          );
        } else {
          needsHistoryReload = true;
        }
      }
    }

    const selectedChatSession =
      selection.kind === "chat" ? selection.session : undefined;
    const selectedDraftId =
      selection.kind === "draft" ? selection.clientId : null;
    const selectedChatId =
      selection.kind === "chat" ? selection.session.chatId : null;

    flushSync(() => {
      setWorkspaceContextMenu(null);
      selectedWorkspaceRef.current = workspace;
      setSelectedWorkspace(workspace);
      restoreWorkspaceComposer(
        workspaceTaskMemoriesRef.current[workspace.id] ?? memory,
      );
      setWorkspaceChatSession(workspace.id, selectedChatSession);
      setSelectedDraftChat(selectedDraftId);
      setSelectedHistoryChatId(selectedChatId);
      setHistoryOpenRequest(null);
      const nextTranscript =
        selection.kind === "chat"
          ? sanitizeRememberedHistoricalTranscript(restoredTranscript)
          : null;
      historicalTranscriptRef.current = nextTranscript;
      setHistoricalTranscript(nextTranscript);
      setHistoryChatLoadState(
        needsHistoryReload && selection.kind === "chat"
          ? {
              chatId: selection.session.chatId,
              workspaceId: workspace.id,
              title: "Previous chat",
              error: null,
            }
          : null,
      );
      if (restoredEntries) {
        taskChatEntriesRef.current = restoredEntries;
        setTaskChatEntries(restoredEntries);
      }
      setSelectedRunAliases(selectedRunControl);
      setActiveView("task");
    });

    preflightRef.current = null;
    setStatusMessage(
      selection.kind === "new"
        ? `Selected ${workspace.label}. Started a new chat.`
        : `Selected ${workspace.label}. Restored the previous chat.`,
    );
    selectWorkspaceExecutionAccount(workspace, selectedChatSession ?? null);
    if (needsHistoryReload && selection.kind === "chat") {
      void reloadRememberedWorkspaceChat(workspace, selection);
    }
  }

  function setWorkspaceChatSession(
    workspaceId: number,
    session: WorkspaceChatSession | undefined,
  ) {
    setWorkspaceChatSessions((current) => {
      const next = { ...current };
      if (session) {
        next[workspaceId] = session;
      } else {
        delete next[workspaceId];
      }
      workspaceChatSessionsRef.current = next;
      return next;
    });
  }

  function setSelectedDraftChat(clientId: string | null) {
    selectedDraftChatEntryIdRef.current = clientId;
    setSelectedDraftChatEntryId(clientId);
  }

  function setSelectedRunAliases(control: ActiveRunControl | null) {
    activeRunControlRef.current = control;
    activeChatEntryIdRef.current = control?.clientId ?? null;
    currentRunId.current = control?.runId ?? null;
    currentTaskId.current = control?.taskId ?? null;
    currentRunAccountId.current = control?.accountId ?? null;
    currentRunProfileKey.current = control?.profileKey ?? null;
    runViewRef.current = control?.runView ?? emptyRunView;
    setActiveChatEntryId(control?.clientId ?? null);
    setRunView(control?.runView ?? emptyRunView);
  }

  function runControlIsSelected(control: ActiveRunControl) {
    if (selectedWorkspaceRef.current?.id !== control.workspaceId) return false;
    if (selectedDraftChatEntryIdRef.current === control.clientId) return true;
    const session = workspaceChatSessionsRef.current[control.workspaceId];
    return control.chatId !== null && session?.chatId === control.chatId;
  }

  function selectedRunIsActiveNow() {
    return [...activeRunControlsRef.current.values()].some(
      (control) =>
        runControlIsSelected(control) && isActiveRunControl(control),
    );
  }

  function registerRunControl(control: ActiveRunControl) {
    activeRunControlsRef.current.set(control.clientId, control);
    setActiveRunRegistryVersion((current) => current + 1);
    if (runControlIsSelected(control)) {
      setSelectedRunAliases(control);
    }
  }

  function updateRunControlBrowserState(
    control: ActiveRunControl,
    state: BrowserSessionState,
  ) {
    if (
      !control.browserSession ||
      control.browserSession.token !== state.token
    ) {
      return;
    }
    control.browserSession = {
      ...control.browserSession,
      state,
    };
    setActiveRunRegistryVersion((current) => current + 1);
  }

  async function refreshRunControlBrowserState(control: ActiveRunControl) {
    const token = control.browserSession?.token;
    if (!token) return;
    try {
      updateRunControlBrowserState(
        control,
        await readBrowserSessionStatus(token),
      );
    } catch {
      // MCP startup events remain the primary source; status refresh is supplementary.
    }
  }

  function setRunControlBrowserLifecycle(
    control: ActiveRunControl,
    status: BrowserSessionState["status"],
    error: string | null = null,
  ) {
    const session = control.browserSession;
    if (!session) return;
    updateRunControlBrowserState(control, {
      ...session.state,
      status,
      error,
    });
  }

  function applyBrowserLifecycleNotification(
    control: ActiveRunControl,
    method: string | null,
    params: Record<string, unknown>,
  ) {
    if (
      method === "turn/completed" ||
      method === "turn/interrupted" ||
      method === "error"
    ) {
      control.activePlaywrightToolCalls.clear();
    }
    if (!control.browserSession) return;
    if (
      method === "mcpServer/startupStatus/updated" &&
      readString(params.name) === "playwright"
    ) {
      const status = readString(params.status);
      if (status === "starting" || status === "ready") {
        setRunControlBrowserLifecycle(control, status);
      } else if (status === "failed") {
        setRunControlBrowserLifecycle(
          control,
          "error",
          readString(params.error) ?? "The browser service could not start.",
        );
      } else if (status === "cancelled") {
        setRunControlBrowserLifecycle(control, "stopped");
      }
      void refreshRunControlBrowserState(control);
      return;
    }

    if (method === "item/started" || method === "item/completed") {
      const item = readObject(params.item);
      if (
        readString(item.type) !== "mcpToolCall" ||
        readString(item.server) !== "playwright"
      ) {
        return;
      }
      const itemId = readString(item.id);
      if (itemId) {
        if (method === "item/started") {
          const threadId = readString(params.threadId) ?? control.threadId;
          const turnId = readString(params.turnId) ?? control.turnId;
          const tool = readString(item.tool);
          if (threadId && turnId && tool) {
            control.activePlaywrightToolCalls.set(itemId, {
              itemId,
              threadId,
              turnId,
              tool,
              arguments: item.arguments ?? {},
            });
          }
        } else {
          control.activePlaywrightToolCalls.delete(itemId);
        }
      }
      setRunControlBrowserLifecycle(
        control,
        method === "item/started" &&
          control.browserSession.state.browserPid === null
          ? "starting"
          : "running",
        readString(readObject(item.error).message),
      );
      void refreshRunControlBrowserState(control);
    }
  }

  async function cleanupRunBrowserSession(
    control: ActiveRunControl,
    options: { unsubscribe?: boolean } = {},
  ) {
    const session = control.browserSession;
    if (!session) return;
    control.browserSession = null;
    setActiveRunRegistryVersion((current) => current + 1);

    if (options.unsubscribe !== false && control.threadId) {
      await codexRpcForProfile(
        control.profileKey,
        control.accountId,
        "thread/unsubscribe",
        { threadId: control.threadId },
      ).catch(() => undefined);
    }
    await stopBrowserSession(session.token).catch(() => undefined);
  }

  function clearUnroutedApprovalsForRun(
    profileKey: CodexProfileKey,
    threadId: string | null,
    turnId: string | null,
  ) {
    const current = unroutedApprovalsRef.current;
    const removed = current.filter(({ request }) =>
      approvalRequestMatchesRun(request, profileKey, threadId, turnId),
    );
    if (removed.length === 0) return;

    const next = current.filter(
      ({ request }) =>
        !approvalRequestMatchesRun(request, profileKey, threadId, turnId),
    );
    unroutedApprovalsRef.current = next;
    setUnroutedApprovals(next);
    removed.forEach(({ request }) => {
      void removeAgentNotification(
        approvalNotificationEventKey(request),
      ).catch(() => undefined);
    });
  }

  function removeUnroutedApprovalByKey(requestKey: string) {
    const current = unroutedApprovalsRef.current;
    if (
      !current.some(({ request }) => request.key === requestKey)
    ) {
      return;
    }
    const next = current.filter(
      ({ request }) => request.key !== requestKey,
    );
    unroutedApprovalsRef.current = next;
    setUnroutedApprovals(next);
  }

  function rememberResolvedOrphanApproval(requestKey: string) {
    const resolved = resolvedOrphanApprovalKeysRef.current;
    resolved.add(requestKey);
    if (resolved.size <= 256) return;
    const oldest = resolved.values().next().value;
    if (typeof oldest === "string") resolved.delete(oldest);
  }

  function markCodexProfileDisconnected(
    profileKey: CodexProfileKey,
    accountId: number,
  ) {
    const connectionId =
      profileKey === DEFAULT_CODEX_PROFILE_KEY ? 0 : accountId;
    const next = new Set(connectedAccountIdsRef.current);
    next.delete(connectionId);
    connectedAccountIdsRef.current = next;
    setConnectedAccountIds(next);
    collaborationModeMasksRef.current.delete(profileKey);
  }

  function approvalResolutionAlreadyTerminal(error: unknown) {
    const message =
      error instanceof Error ? error.message : String(error);
    return /stale|already resolved|already submitted|not connected/iu.test(
      message,
    );
  }

  async function rejectOrphanedApproval(
    attention: PendingApprovalAttention,
  ) {
    const requestKey = attention.request.key;
    if (
      resolvedOrphanApprovalKeysRef.current.has(requestKey) ||
      orphanApprovalResolutionLocksRef.current.has(requestKey)
    ) {
      return;
    }
    orphanApprovalResolutionLocksRef.current.add(requestKey);

    try {
      const denial = findSafeApprovalDenialChoice(attention.request);
      if (denial) {
        if (
          attention.request.profileKey === DEFAULT_CODEX_PROFILE_KEY
        ) {
          await resolveDefaultCodexServerRequest(
            attention.request.id,
            attention.request.requestToken,
            denial.response,
          );
        } else {
          await resolveCodexServerRequest(
            attention.accountId,
            attention.request.id,
            attention.request.requestToken,
            denial.response,
          );
        }
      } else {
        let interrupted = false;
        if (attention.request.threadId && attention.request.turnId) {
          try {
            await codexRpcForProfile(
              attention.request.profileKey,
              attention.accountId,
              "turn/interrupt",
              {
                threadId: attention.request.threadId,
                turnId: attention.request.turnId,
              },
            );
            interrupted = true;
          } catch {
            // If the stale turn cannot be interrupted, an idle profile can be
            // restarted without disrupting a bound agent turn.
          }
        }

        if (!interrupted) {
          const hasBoundProfileTurn = [
            ...activeRunControlsRef.current.values(),
          ].some(
            (control) =>
              isActiveRunControl(control) &&
              control.profileKey === attention.request.profileKey &&
              control.turnId !== null,
          );
          if (hasBoundProfileTurn) {
            throw new Error(
              "The stale request could not be cancelled without interrupting another active turn.",
            );
          }
          if (
            attention.request.profileKey === DEFAULT_CODEX_PROFILE_KEY
          ) {
            await stopDefaultCodexProfile();
          } else {
            await stopCodex(attention.accountId);
          }
          markCodexProfileDisconnected(
            attention.request.profileKey,
            attention.accountId,
          );
        }
      }

      rememberResolvedOrphanApproval(requestKey);
      removeUnroutedApprovalByKey(requestKey);
      void removeAgentNotification(
        approvalNotificationEventKey(attention.request),
      ).catch(() => undefined);
    } catch (error) {
      if (approvalResolutionAlreadyTerminal(error)) {
        rememberResolvedOrphanApproval(requestKey);
        removeUnroutedApprovalByKey(requestKey);
        return;
      }
      setApprovalSafetyWarning(
        "Codex has a stale approval request that could not be cancelled safely. Stop the affected turn or restart its Codex profile.",
      );
    } finally {
      orphanApprovalResolutionLocksRef.current.delete(requestKey);
    }
  }

  function reconcileUnroutedApprovals() {
    const controls = [...activeRunControlsRef.current.values()];
    for (const attention of unroutedApprovalsRef.current) {
      const exactControl = findRunControlForIds(
        attention.request.profileKey,
        attention.request.threadId,
        attention.request.turnId,
      );
      if (exactControl) {
        updateRunControlView(exactControl, (current) =>
          addApprovalRequest(current, attention.request),
        );
        const child = findSubagentByThread(
          attention.request.profileKey,
          attention.request.threadId,
        );
        if (child?.ownerClientId === exactControl.clientId) {
          setSubagentAttention(
            exactControl,
            child.childThreadId,
            true,
          );
        }
        removeUnroutedApprovalByKey(attention.request.key);
        continue;
      }
      if (
        !controls.some((control) =>
          pendingApprovalCouldBelongToControl(attention, control),
        )
      ) {
        void rejectOrphanedApproval(attention);
      }
    }
  }

  function clearApprovalAttentionForRun(
    profileKey: CodexProfileKey,
    threadId: string | null,
    turnId: string | null,
  ) {
    activeRunControlsRef.current.forEach((control) => {
      const matchingRequests = control.runView.approvalRequests.filter(
        (request) =>
          approvalRequestMatchesRun(
            request,
            profileKey,
            threadId,
            turnId,
          ),
      );
      matchingRequests.forEach((request) => {
        void removeAgentNotification(
          approvalNotificationEventKey(request),
        ).catch(() => undefined);
      });
      if (matchingRequests.length > 0) {
        updateRunControlView(control, (current) =>
          matchingRequests.reduce(
            (next, request) =>
              resolveApprovalRequest(
                next,
                request.id,
                request.threadId ?? undefined,
              ),
            current,
          ),
        );
      }
    });
    clearUnroutedApprovalsForRun(profileKey, threadId, turnId);
  }

  function removeRunControl(
    control: ActiveRunControl,
    options: { cleanupBrowser?: boolean } = {},
  ) {
    if (activeRunControlsRef.current.get(control.clientId) !== control) return;
    control.activePlaywrightToolCalls.clear();
    cancelWebPreviewDetection(control);
    if (options.cleanupBrowser !== false && control.browserSession) {
      void cleanupRunBrowserSession(control);
    }
    control.runView.serverRequests
      .filter(isNativeUserInputRequest)
      .forEach((request) => {
        void removeAgentNotification(
          userInputNotificationEventKey(control.profileKey, request),
        ).catch(() => undefined);
      });
    control.runView.approvalRequests.forEach((request) => {
      void removeAgentNotification(
        approvalNotificationEventKey(request),
      ).catch(() => undefined);
    });
    clearUnroutedApprovalsForRun(
      control.profileKey,
      control.threadId,
      control.turnId,
    );
    activeRunControlsRef.current.delete(control.clientId);
    pendingRunBindingNotificationsRef.current =
      pendingRunBindingNotificationsRef.current.filter((pending) => {
        if (pending.profileKey !== control.profileKey) return true;
        const identity = readCodexMessageRunIdentity(pending.message);
        if (control.turnId && identity.turnId === control.turnId) return false;
        return !(
          control.threadId &&
          identity.threadId === control.threadId &&
          (!identity.turnId || !control.turnId)
        );
      });
    setActiveRunRegistryVersion((current) => current + 1);
    if (activeRunControlRef.current === control) {
      setSelectedRunAliases(null);
    }
  }

  function findRunControlByChat(workspaceId: number, chatId: number) {
    return (
      [...activeRunControlsRef.current.values()].find(
        (control) =>
          isActiveRunControl(control) &&
          control.workspaceId === workspaceId &&
          control.chatId === chatId,
      ) ?? null
    );
  }

  function findRunControlForMessage(
    profileKey: CodexProfileKey,
    message: CodexMessage,
  ) {
    const {
      threadId: messageThreadId,
      turnId: messageTurnId,
    } = readCodexMessageRunIdentity(message);
    return findRunControlForIds(
      profileKey,
      messageThreadId,
      messageTurnId,
    );
  }

  function prunePendingRunBindingNotifications(now = Date.now()) {
    pendingRunBindingNotificationsRef.current =
      pendingRunBindingNotificationsRef.current.filter(
        (pending) => now - pending.receivedAt <= RUN_NOTIFICATION_BINDING_TTL_MS,
      );
  }

  function bufferPendingRunBindingNotification(
    accountId: number,
    profileKey: CodexProfileKey,
    message: CodexMessage,
  ) {
    const method = message.method ?? "";
    if (!BUFFERABLE_RUN_NOTIFICATION_METHODS.has(method)) return;

    const identity = readCodexMessageRunIdentity(message);
    if (!identity.threadId && !identity.turnId) return;
    const hasProfileRun = [...activeRunControlsRef.current.values()].some(
      (control) => !control.stopped && control.profileKey === profileKey,
    );
    if (!hasProfileRun) return;

    prunePendingRunBindingNotifications();
    pendingRunBindingNotificationsRef.current.push({
      accountId,
      profileKey,
      message,
      receivedAt: Date.now(),
    });
    const overflow =
      pendingRunBindingNotificationsRef.current.length -
      RUN_NOTIFICATION_BINDING_BUFFER_LIMIT;
    if (overflow > 0) {
      pendingRunBindingNotificationsRef.current.splice(0, overflow);
    }
  }

  async function flushPendingRunBindingNotifications(
    control: ActiveRunControl,
  ) {
    prunePendingRunBindingNotifications();
    const replay: PendingRunBindingNotification[] = [];
    pendingRunBindingNotificationsRef.current =
      pendingRunBindingNotificationsRef.current.filter((pending) => {
        const match = findRunControlForMessage(
          pending.profileKey,
          pending.message,
        );
        if (match !== control) return true;
        replay.push(pending);
        return false;
      });

    for (const pending of replay) {
      await handleCodexNotification(
        pending.accountId,
        pending.profileKey,
        pending.message,
      );
    }
  }

  function saveSubagentRecord(record: SubagentRecord) {
    upsertConversationSubagent(record);
    if (record.runId === null) return;
    void upsertRunSubagent(record).catch((error) => {
      console.error("Could not persist subagent lifecycle", error);
    });
  }

  function trackSubagentCollaboration(
    control: ActiveRunControl,
    message: CodexMessage,
  ) {
    const identity = readCodexMessageRunIdentity(message);
    const now = new Date().toISOString();
    const records = parseCollabToolCalls(message).map((call) => {
      const existing = findSubagentByThread(
        control.profileKey,
        call.childThreadId,
      );
      const hierarchyParent =
        call.senderThreadId === control.threadId
          ? null
          : findSubagentByThread(control.profileKey, call.senderThreadId);
      const status = lifecycleFromCollabToolCall(
        call,
        message.method,
        existing?.status ?? null,
      );
      const terminal = !isActiveSubagentStatus(status);
      const record: SubagentRecord = {
        id:
          existing?.id ??
          `${control.profileKey}:${control.runId ?? control.clientId}:${call.childThreadId}`,
        ownerClientId: control.clientId,
        workspaceId: control.workspaceId,
        chatId: control.chatId,
        runId: control.runId,
        parentTurnId:
          existing?.parentTurnId ??
          identity.turnId ??
          hierarchyParent?.childTurnId ??
          control.turnId,
        profileKey: control.profileKey,
        accountId: control.accountId,
        rootThreadId:
          existing?.rootThreadId ??
          control.threadId ??
          call.senderThreadId,
        parentThreadId: call.senderThreadId,
        childThreadId: call.childThreadId,
        childTurnId: existing?.childTurnId ?? null,
        spawnItemId:
          call.tool === "spawn_agent"
            ? call.itemId
            : existing?.spawnItemId ?? null,
        task: call.prompt ?? existing?.task ?? "Subagent task",
        depth:
          existing?.depth ??
          (hierarchyParent ? hierarchyParent.depth + 1 : 1),
        status,
        statusBeforeAttention:
          status === "needs-attention"
            ? existing?.statusBeforeAttention ??
              existing?.status ??
              "running"
            : null,
        agentStatus: call.agentStatus ?? existing?.agentStatus ?? null,
        needsAttention: status === "needs-attention",
        error:
          status === "failed"
            ? existing?.error ?? "The subagent operation failed."
            : null,
        finalResult: existing?.finalResult ?? null,
        startedAt: existing?.startedAt ?? now,
        updatedAt: now,
        completedAt: terminal ? existing?.completedAt ?? now : null,
      };
      saveSubagentRecord(record);
      return record;
    });
    if (records.length > 0) return records;

    const legacy = parseLegacySubagentActivity(message);
    if (!legacy) return [];
    const existing = findSubagentByThread(
      control.profileKey,
      legacy.childThreadId,
    );
    const parentThreadId =
      identity.threadId ?? control.threadId ?? legacy.childThreadId;
    const hierarchyParent =
      parentThreadId === control.threadId
        ? null
        : findSubagentByThread(control.profileKey, parentThreadId);
    const terminal = !isActiveSubagentStatus(legacy.status);
    const record: SubagentRecord = {
      id:
        existing?.id ??
        `${control.profileKey}:${control.runId ?? control.clientId}:${legacy.childThreadId}`,
      ownerClientId: control.clientId,
      workspaceId: control.workspaceId,
      chatId: control.chatId,
      runId: control.runId,
      parentTurnId:
        existing?.parentTurnId ??
        identity.turnId ??
        hierarchyParent?.childTurnId ??
        control.turnId,
      profileKey: control.profileKey,
      accountId: control.accountId,
      rootThreadId:
        existing?.rootThreadId ??
        control.threadId ??
        parentThreadId,
      parentThreadId,
      childThreadId: legacy.childThreadId,
      childTurnId: existing?.childTurnId ?? null,
      spawnItemId: existing?.spawnItemId ?? legacy.itemId,
      task:
        existing?.task ??
        (legacy.agentPath
          ? `Subagent ${legacy.agentPath}`
          : "Subagent task"),
      depth:
        existing?.depth ??
        (hierarchyParent ? hierarchyParent.depth + 1 : 1),
      status: legacy.status,
      statusBeforeAttention: existing?.statusBeforeAttention ?? null,
      agentStatus: existing?.agentStatus ?? null,
      needsAttention: false,
      error: existing?.error ?? null,
      finalResult: existing?.finalResult ?? null,
      startedAt: existing?.startedAt ?? now,
      updatedAt: now,
      completedAt: terminal ? existing?.completedAt ?? now : null,
    };
    saveSubagentRecord(record);
    return [record];
  }

  function updateSubagentFromNotification(
    control: ActiveRunControl,
    record: SubagentRecord,
    message: CodexMessage,
  ) {
    const identity = readCodexMessageRunIdentity(message);
    const now = new Date().toISOString();
    const lifecycle = lifecycleFromChildTurn(
      message.method,
      readSubagentTurnStatus(message),
    );
    const visibleResult = readSubagentVisibleResult(message);
    const failed = lifecycle === "failed" || message.method === "error";
    const status =
      lifecycle ??
      (message.method === "thread/status/changed"
        ? readString(readObject(readObject(message.params).status).type) ===
          "idle"
          ? "waiting"
          : record.status
        : record.status);
    const terminal = !isActiveSubagentStatus(status);
    const next: SubagentRecord = {
      ...record,
      ownerClientId: control.clientId,
      chatId: control.chatId,
      runId: control.runId,
      childTurnId:
        message.method?.startsWith("turn/")
          ? identity.turnId ?? record.childTurnId
          : record.childTurnId,
      status,
      statusBeforeAttention:
        status === "needs-attention"
          ? record.statusBeforeAttention ?? record.status
          : record.statusBeforeAttention,
      needsAttention:
        status === "needs-attention" ? true : record.needsAttention,
      error: failed ? readSubagentError(message) ?? record.error : record.error,
      finalResult: visibleResult ?? record.finalResult,
      updatedAt: now,
      completedAt: terminal ? record.completedAt ?? now : null,
    };
    saveSubagentRecord(next);
    return next;
  }

  function setSubagentAttention(
    control: ActiveRunControl,
    threadId: string | null,
    needsAttention: boolean,
  ) {
    if (!threadId) return null;
    const next = updateSubagentByThread(
      control.profileKey,
      threadId,
      (record) => ({
        ...record,
        status: needsAttention
          ? "needs-attention"
          : !isActiveSubagentStatus(record.status)
            ? record.status
            : record.statusBeforeAttention &&
                isActiveSubagentStatus(record.statusBeforeAttention)
              ? record.statusBeforeAttention
              : "running",
        statusBeforeAttention: needsAttention
          ? record.status === "needs-attention"
            ? record.statusBeforeAttention
            : record.status
          : null,
        needsAttention,
        updatedAt: new Date().toISOString(),
      }),
    );
    if (next?.runId !== null && next?.runId !== undefined) {
      void upsertRunSubagent(next).catch((error) => {
        console.error("Could not persist subagent attention", error);
      });
    }
    return next;
  }

  function subagentHasPendingInteractions(
    control: ActiveRunControl,
    threadId: string,
  ) {
    return (
      control.runView.approvalRequests.some(
        (request) =>
          request.threadId === threadId &&
          request.status !== "stale",
      ) ||
      control.runView.serverRequests.some((request) => {
        const identity = readCodexMessageRunIdentity(request);
        return identity.threadId === threadId;
      })
    );
  }

  function clearSubagentInteractions(
    control: ActiveRunControl,
    threadId: string,
  ) {
    const approvals = control.runView.approvalRequests.filter(
      (request) => request.threadId === threadId,
    );
    const questions = control.runView.serverRequests
      .filter(isNativeUserInputRequest)
      .filter((request) => request.params.threadId === threadId);
    approvals.forEach((request) => {
      void removeAgentNotification(
        approvalNotificationEventKey(request),
      ).catch(() => undefined);
    });
    questions.forEach((request) => {
      clearUserInputAutoResolutionTimer(control.profileKey, request.id);
      void removeAgentNotification(
        userInputNotificationEventKey(control.profileKey, request),
      ).catch(() => undefined);
    });
    if (approvals.length > 0 || questions.length > 0) {
      updateRunControlView(control, (current) => {
        const withoutApprovals = approvals.reduce(
          (next, request) =>
            resolveApprovalRequest(
              next,
              request.id,
              request.threadId ?? undefined,
            ),
          current,
        );
        return questions.reduce(
          (next, request) => resolveServerRequest(next, request.id),
          withoutApprovals,
        );
      });
    }
    setSubagentAttention(control, threadId, false);
  }

  function findRunControlForIds(
    profileKey: CodexProfileKey,
    threadId: string | null,
    turnId: string | null,
  ) {
    const child = findSubagentByThread(profileKey, threadId);
    if (child?.ownerClientId) {
      const owner =
        activeRunControlsRef.current.get(child.ownerClientId) ?? null;
      if (
        owner &&
        !owner.stopped &&
        owner.profileKey === profileKey &&
        (!turnId ||
          !child.childTurnId ||
          child.childTurnId === turnId ||
          child.status === "starting")
      ) {
        return owner;
      }
    }
    return (
      selectRunControlForIds(
        [...activeRunControlsRef.current.values()].map((control) => ({
          control,
          profileKey: control.profileKey,
          stopped: control.stopped,
          threadId: control.threadId,
          turnId: control.turnId,
          startedAt: control.runView.startedAt,
          acceptsThreadContinuation: control.acceptsThreadContinuation,
        })),
        profileKey,
        threadId,
        turnId,
      )?.control ?? null
    );
  }

  function startTaskChatEntry(entry: TaskChatEntry) {
    setSelectedHistoryChatId(entry.chatId ?? null);
    if (entry.chatId === null) setSelectedDraftChat(entry.clientId);
    setTaskChatEntries((current) => [...current, entry]);
  }

  function replaceTaskChatEntry(targetClientId: string, entry: TaskChatEntry) {
    setSelectedHistoryChatId(entry.chatId ?? null);
    if (entry.chatId === null) setSelectedDraftChat(entry.clientId);
    setTaskChatEntries((current) =>
      current.map((currentEntry) =>
        currentEntry.clientId === targetClientId ? entry : currentEntry,
      ),
    );
  }

  function restoreTaskChatEntry(targetClientId: string, entry: TaskChatEntry) {
    setTaskChatEntries((current) =>
      current.map((currentEntry) =>
        currentEntry.clientId === targetClientId ? entry : currentEntry,
      ),
    );
  }

  function updateTaskChatEntryIds(
    clientId: string,
    ids: {
      taskId?: number;
      runId?: number;
      chatId?: number;
      turnIndex?: number;
    },
  ) {
    const control = activeRunControlsRef.current.get(clientId);
    if (control?.entry) {
      control.entry = { ...control.entry, ...ids };
    }
    if (ids.chatId !== undefined) {
      promoteSubagentConversation(clientId, ids.chatId);
    }
    if (ids.runId !== undefined) {
      const conversationKey = subagentConversationKey({
        chatId: ids.chatId ?? control?.chatId ?? null,
        ownerClientId: clientId,
      });
      if (conversationKey) {
        getConversationSubagents(conversationKey)
          .filter((record) => record.ownerClientId === clientId)
          .forEach((record) => {
            saveSubagentRecord({
              ...record,
              runId: ids.runId ?? record.runId,
              chatId: ids.chatId ?? record.chatId,
              updatedAt: new Date().toISOString(),
            });
          });
      }
    }
    setTaskChatEntries((current) =>
      current.map((entry) =>
        entry.clientId === clientId ? { ...entry, ...ids } : entry,
      ),
    );
  }

  function updateTaskChatEntry(
    clientId: string,
    updater: (entry: TaskChatEntry) => TaskChatEntry,
  ) {
    const control = activeRunControlsRef.current.get(clientId);
    if (control?.entry) {
      control.entry = updater(control.entry);
    }
    setTaskChatEntries((current) =>
      current.map((entry) =>
        entry.clientId === clientId ? updater(entry) : entry,
      ),
    );
  }

  function updateTaskChatEntryRunView(
    clientId: string,
    updater: (runView: RunViewState) => RunViewState,
  ) {
    const control = activeRunControlsRef.current.get(clientId);
    let controlledRunView: RunViewState | null = null;
    if (control?.entry) {
      const nextRunView = updater(control.entry.runView);
      controlledRunView = nextRunView;
      control.entry = {
        ...control.entry,
        status: nextRunView.status,
        runView: nextRunView,
      };
      control.runView = nextRunView;
    }
    setTaskChatEntries((current) =>
      current.map((entry) => {
        if (entry.clientId !== clientId) return entry;
        const nextRunView = controlledRunView ?? updater(entry.runView);
        return { ...entry, status: nextRunView.status, runView: nextRunView };
      }),
    );
  }

  function updateRunControlView(
    control: ActiveRunControl,
    updater: (current: RunViewState) => RunViewState,
  ) {
    const nextRunView = updater(control.runView);
    control.runView = nextRunView;
    if (control.entry) {
      control.entry = {
        ...control.entry,
        status: nextRunView.status,
        runView: nextRunView,
      };
    }
    if (activeRunControlRef.current === control) {
      runViewRef.current = nextRunView;
      setRunView(nextRunView);
    }
    setTaskChatEntries((current) =>
      current.map((entry) =>
        entry.clientId === control.clientId
          ? { ...entry, status: nextRunView.status, runView: nextRunView }
          : entry,
      ),
    );
    return nextRunView;
  }

  function inspectCodexMessageForWebPreview(
    control: ActiveRunControl,
    message: CodexMessage,
  ) {
    const signal = readWebPreviewCommandSignal(message);
    if (!signal || control.webPreviewDetection.disposed) return;

    const current = control.webPreviewDetection.commands.get(signal.commandId) ?? {
      command: "",
      output: "",
    };
    const next = {
      command: signal.command || current.command,
      output: commandOutputTail(current.output, signal.outputDelta),
    };
    control.webPreviewDetection.commands.set(signal.commandId, next);

    extractLocalWebPreviewCandidates(next).forEach((url) => {
      scheduleWebPreviewProbe(control, url, signal.commandId);
    });

    if (
      signal.completed &&
      control.runView.webPreview?.sourceCommandId === signal.commandId
    ) {
      void recheckWebPreview(control.runView.webPreview, {
        control,
        entryClientId: control.clientId,
        runId: control.runId,
      });
    }
  }

  function scheduleWebPreviewProbe(
    control: ActiveRunControl,
    url: string,
    sourceCommandId: string,
  ) {
    const detection = control.webPreviewDetection;
    if (
      detection.disposed ||
      detection.probes.has(url) ||
      control.runView.webPreview?.url === url
    ) {
      return;
    }

    const sequence = detection.nextSequence + 1;
    detection.nextSequence = sequence;
    const probe: WebPreviewProbeAttempt = {
      sequence,
      sourceCommandId,
      timers: new Set(),
    };
    detection.probes.set(url, probe);

    const attempt = (attemptIndex: number) => {
      if (
        detection.disposed ||
        detection.probes.get(url) !== probe
      ) {
        return;
      }
      const delay = WEB_PREVIEW_PROBE_RETRY_DELAYS_MS[attemptIndex];
      const timer = window.setTimeout(() => {
        probe.timers.delete(timer);
        void probeLocalWebPreview(url)
          .then((result) => {
            if (
              detection.disposed ||
              detection.probes.get(url) !== probe
            ) {
              return;
            }
            if (!result.reachable) {
              if (attemptIndex + 1 < WEB_PREVIEW_PROBE_RETRY_DELAYS_MS.length) {
                attempt(attemptIndex + 1);
              } else {
                detection.probes.delete(url);
              }
              return;
            }

            detection.probes.delete(url);
            if (probe.sequence < detection.confirmedSequence) return;
            detection.confirmedSequence = probe.sequence;
            const preview: RunWebPreview = {
              version: 1,
              url: result.normalizedUrl,
              origin: new URL(result.normalizedUrl).origin,
              detectedAt: new Date().toISOString(),
              sourceCommandId,
              availability: "available",
            };
            updateRunControlView(control, (currentRunView) => ({
              ...currentRunView,
              webPreview: preview,
            }));
            if (control.runId !== null) {
              void updateRun(control.runId, {
                webPreviewJson: serializeRunWebPreview(preview),
              }).catch((error) => {
                console.error("Could not persist the web preview", error);
              });
            }
          })
          .catch((error) => {
            detection.probes.delete(url);
            console.error("Could not probe the local web preview", error);
            setStatusMessage(
              "Web preview detection is unavailable. Restart Orchestrator and try again.",
            );
          });
      }, delay);
      probe.timers.add(timer);
    };

    attempt(0);
  }

  async function recheckWebPreview(
    preview: RunWebPreview,
    target: {
      control?: ActiveRunControl;
      entryClientId: string;
      runId: number | null;
    },
  ) {
    let result;
    try {
      result = await probeLocalWebPreview(preview.url);
    } catch {
      result = { normalizedUrl: preview.url, reachable: false };
    }
    const nextPreview: RunWebPreview = {
      ...preview,
      url: result.normalizedUrl,
      origin: new URL(result.normalizedUrl).origin,
      availability: result.reachable ? "available" : "unavailable",
    };
    if (
      target.control &&
      !target.control.webPreviewDetection.disposed &&
      target.control.runView.webPreview?.url === preview.url
    ) {
      updateRunControlView(target.control, (current) => ({
        ...current,
        webPreview: nextPreview,
      }));
    } else {
      updateTaskChatEntryRunView(target.entryClientId, (current) =>
        current.webPreview?.url === preview.url
          ? { ...current, webPreview: nextPreview }
          : current,
      );
    }
    if (target.runId !== null) {
      await updateRun(target.runId, {
        webPreviewJson: serializeRunWebPreview(nextPreview),
      }).catch(() => undefined);
    }
    return nextPreview;
  }

  function probeTerminalWebPreview(
    url: string,
    sourceCommandId: string,
    target: {
      entryClientId: string;
      runId: number | null;
    },
  ) {
    const attempt = (attemptIndex: number) => {
      window.setTimeout(() => {
        void probeLocalWebPreview(url)
          .then((result) => {
            if (!result.reachable) {
              if (attemptIndex + 1 < WEB_PREVIEW_PROBE_RETRY_DELAYS_MS.length) {
                attempt(attemptIndex + 1);
              }
              return;
            }
            const preview: RunWebPreview = {
              version: 1,
              url: result.normalizedUrl,
              origin: new URL(result.normalizedUrl).origin,
              detectedAt: new Date().toISOString(),
              sourceCommandId,
              availability: "available",
            };
            updateTaskChatEntryRunView(target.entryClientId, (current) => ({
              ...current,
              webPreview: preview,
            }));
            if (target.runId !== null) {
              void updateRun(target.runId, {
                webPreviewJson: serializeRunWebPreview(preview),
              }).catch(() => undefined);
            }
          })
          .catch((error) => {
            console.error("Could not probe the local web preview", error);
            setStatusMessage(
              "Web preview detection is unavailable. Restart Orchestrator and try again.",
            );
          });
      }, WEB_PREVIEW_PROBE_RETRY_DELAYS_MS[attemptIndex]);
    };

    attempt(0);
  }

  function cancelWebPreviewDetection(control: ActiveRunControl) {
    const detection = control.webPreviewDetection;
    detection.disposed = true;
    detection.probes.forEach((probe) => {
      probe.timers.forEach((timer) => window.clearTimeout(timer));
      probe.timers.clear();
    });
    detection.probes.clear();
    detection.commands.clear();
  }

  function clearActiveChatRun() {
    activeChatEntryIdRef.current = null;
    setActiveChatEntryId(null);
  }

  function ensureRunControlActive(control: ActiveRunControl) {
    if (
      control.stopped ||
      activeRunControlsRef.current.get(control.clientId) !== control
    ) {
      throw new RunStoppedError();
    }
  }

  function markRunInterrupted(
    control: ActiveRunControl,
    message = "Stopped by user.",
  ) {
    const completedAt = new Date().toISOString();
    const stoppedRunView = updateRunControlView(control, (current) => {
      const elapsedRunView = updateRunElapsed(current);
      return {
        ...elapsedRunView,
        status: "interrupted",
        completedAt,
        error: message,
        approvalRequests: [],
        approvalResourcesByItemId: {},
        streamEvents:
          elapsedRunView.streamEvents.length > 0
            ? elapsedRunView.streamEvents
            : [
                {
                  id: `run-stopped-${completedAt}`,
                  kind: "system",
                  text: message,
                  timestamp: completedAt,
                },
              ],
        nativePlan:
          elapsedRunView.nativePlan.mode === "plan"
            ? {
                ...elapsedRunView.nativePlan,
                phase: "cancelled",
                reviewState: "cancelled",
              }
            : elapsedRunView.nativePlan,
      };
    });

    return { completedAt, stoppedRunView };
  }

  async function persistInterruptedRun(
    control: ActiveRunControl | null,
    completedAt: string,
    stoppedRunView: RunViewState,
  ) {
    const runId = control?.runId ?? null;
    const taskId = control?.taskId ?? null;

    if (runId !== null) {
      await updateRun(runId, {
        status: "interrupted",
        completedAt,
        durationMs: stoppedRunView.elapsedMs,
        error: stoppedRunView.error ?? "Stopped by user.",
      }).catch(() => undefined);
    }

    if (control?.chatId !== null && control?.chatId !== undefined) {
      await updateChat(control.chatId, { status: "interrupted" }).catch(
        () => undefined,
      );
    }

    if (taskId !== null) {
      await updateTaskStatus(taskId, "interrupted").catch(() => undefined);
    }
  }

  async function stopActiveRun(
    targetControl?: ActiveRunControl | null,
  ): Promise<StopActiveRunResult> {
    const control =
      targetControl === undefined
        ? selectedActiveRunControl ?? activeRunControlRef.current
        : targetControl;
    const accountId =
      control?.accountId ?? currentRunAccountId.current ?? selectedAccountIdRef.current;
    const profileKey =
      control?.profileKey ??
      currentRunProfileKey.current ??
      (accountId ? (`account:${accountId}` as CodexProfileKey) : null);
    const threadId = control?.threadId ?? runViewRef.current.threadId;
    const turnId = control?.turnId ?? runViewRef.current.turnId;

    if (!control) {
      return { stopped: false, goalCleared: false };
    }

    flushFrameBatchedCodexNotifications();
    await flushBufferedRunEvents().catch(() => undefined);

    const planningThreadId = control?.runView.threadId ?? null;
    const planningTurnId = control?.runView.turnId ?? null;
    const interruptNativePlan =
      control?.runView.nativePlan.mode === "plan" &&
      planningThreadId !== null &&
      planningTurnId !== null &&
      profileKey !== null;
    const shouldStopCodex =
      !interruptNativePlan &&
      profileKey !== null &&
      threadId !== null &&
      turnId !== null;
    const shouldClearThreadGoal =
      Boolean(control?.acceptsThreadContinuation) &&
      profileKey !== null &&
      threadId !== null;
    let goalClearError: string | null = null;

    if (control) {
      control.stopped = true;
      control.cancelScheduledSetup?.();
      control.cancelScheduledSetup = null;
    }

    const shouldRestorePrompt =
      control.queueItemId === null &&
      control.turnId === null &&
      Boolean(control.promptFallback);
    const { completedAt, stoppedRunView } = markRunInterrupted(control);
    if (shouldRestorePrompt && control) {
      updateTaskChatEntry(control.clientId, (entry) => ({
        ...entry,
        imageAttachmentDelivery: entry.imageAttachmentDelivery
          ? { status: "failed", error: "Stopped before the image was sent." }
          : undefined,
      }));
      restoreRunComposerForRetry(
        control.workspaceId,
        control.promptFallback,
        control.imageContextFilesFallback,
      );
    }
    await persistInterruptedRun(control, completedAt, stoppedRunView);
    if (control.queueItemId) {
      const failedQueueItem = await failPromptQueueItem(
        control.queueItemId,
        "The queued prompt was cancelled.",
      ).catch(() => null);
      if (failedQueueItem) {
        upsertPromptQueueItemInMemory(failedQueueItem);
      }
      if (control.chatId !== null) {
        setPromptQueuePaused(control.chatId, true, "failure");
      }
    } else if (
      control.chatId !== null &&
      (promptQueuesByChatRef.current[control.chatId] ?? []).some(
        isPromptQueueItemPending,
      )
    ) {
      setPromptQueuePaused(control.chatId, true, "failure");
    }

    if (
      shouldClearThreadGoal &&
      profileKey !== null &&
      accountId !== null &&
      threadId !== null
    ) {
      try {
        await clearThreadGoalForProfile(profileKey, accountId, threadId);
        control.acceptsThreadContinuation = false;
        control.goal = null;
        control.goalActionPending = null;
        control.goalActionError = null;
      } catch (error) {
        goalClearError =
          error instanceof Error ? error.message : String(error);
      }
    }

    if (interruptNativePlan && profileKey !== null && accountId !== null) {
      try {
        await codexRpcForProfile(profileKey, accountId, "turn/interrupt", {
          threadId: planningThreadId,
          turnId: planningTurnId,
        });
        const modes = await collaborationModesForRun(
          profileKey,
          accountId,
          selectedModel?.model ?? null,
          selectedReasoningEffort,
          false,
        );
        await codexRpcForProfile(profileKey, accountId, "thread/settings/update", {
          threadId: planningThreadId,
          collaborationMode: modes.default,
        });
        if (control?.chatId !== null && control?.chatId !== undefined) {
          await updateChat(control.chatId, { collaborationMode: "default" });
        }
      } catch (error) {
        setStatusMessage(
          `Plan turn stopped locally, but mode reset failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    removeRunControl(control, { cleanupBrowser: false });
    setStatusMessage(
      goalClearError
        ? `Codex run stopped, but its Goal Mode state could not be cleared: ${goalClearError}`
        : "Codex run stopped.",
    );

    if (shouldStopCodex) {
      try {
        const interruptedTurnId = await interruptTurnForProfile(
          profileKey,
          accountId ?? 0,
          threadId,
          turnId,
        );
        if (interruptedTurnId) {
          control.turnId = interruptedTurnId;
        }
      } catch (error) {
        setStatusMessage(
          `Run stopped locally, but Codex could not be interrupted safely: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
    void cleanupRunBrowserSession(control);
    return {
      stopped: true,
      goalCleared: goalClearError === null,
    };
  }

  async function focusSelectedBrowserSession() {
    const control = selectedActiveRunControl;
    const token = control?.browserSession?.token;
    if (!control || !token) return;
    try {
      updateRunControlBrowserState(
        control,
        await focusBrowserSession(token),
      );
    } catch (error) {
      setStatusMessage(
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  async function stopSelectedBrowserSession() {
    const control = selectedActiveRunControl;
    const token = control?.browserSession?.token;
    if (!control || !token) return;
    try {
      updateRunControlBrowserState(
        control,
        await stopBrowserSession(token),
      );
      setStatusMessage("Browser session stopped.");
    } catch (error) {
      setStatusMessage(
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  function openWorkspaceContextMenu(
    workspace: Workspace,
    event:
      | ReactMouseEvent<HTMLElement>
      | ReactKeyboardEvent<HTMLElement>,
  ) {
    event.preventDefault();
    event.stopPropagation();
    const position = contextMenuPosition(event);
    setWorkspaceContextMenu({
      workspace,
      ...position,
    });
  }

  function handleWorkspaceLabelKeyDown(
    workspace: Workspace,
    event: ReactKeyboardEvent<HTMLButtonElement>,
  ) {
    if (event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey)) {
      openWorkspaceContextMenu(workspace, event);
    }
  }

  function requestWorkspaceDelete(workspace: Workspace) {
    setWorkspaceContextMenu(null);
    if (
      [...activeRunControlsRef.current.values()].some(
        (control) =>
          isActiveRunControl(control) && control.workspaceId === workspace.id,
      )
    ) {
      setStatusMessage("Wait for the active run to finish before removing this workspace.");
      return;
    }

    setWorkspaceDeleteCandidate(workspace);
  }

  function openChatHistoryContextMenu(
    chat: ChatListItem,
    event:
      | ReactMouseEvent<HTMLElement>
      | ReactKeyboardEvent<HTMLElement>,
  ) {
    event.preventDefault();
    event.stopPropagation();
    setChatHistoryContextMenu({
      chat,
      ...contextMenuPosition(event),
    });
  }

  function requestChatHistoryDelete(chat: ChatListItem) {
    setChatHistoryContextMenu(null);
    if (findRunControlByChat(chat.workspace_id, chat.id)) {
      setStatusMessage("Wait for the active run to finish before removing this chat.");
      return;
    }

    setChatHistoryDeleteCandidate(chat);
  }

  function cacheStableHistoryChat(
    chat: ChatListItem,
    entries: TaskChatEntry[],
    transcript: HistoricalTranscriptState,
  ) {
    const cacheableTranscript: HistoricalTranscriptState = {
      ...transcript,
      positionIntent: "preserve",
      openAtLatestRequest: null,
    };
    const cache = stableHistoryChatCacheRef.current;
    cache.delete(chat.id);
    const sourceCharacters = entries.reduce(
      (total, entry) => total + entry.runView.finalMessage.length,
      0,
    );
    if (sourceCharacters > HISTORY_CHAT_CACHE_SOURCE_CHARACTER_BUDGET) {
      return;
    }
    cache.set(chat.id, {
      version: historyChatVersion(chat),
      renderVersion: HISTORICAL_RENDER_PIPELINE_VERSION,
      entries,
      transcript: cacheableTranscript,
      sourceCharacters,
    });
    const cachedSourceCharacters = () =>
      [...cache.values()].reduce(
        (total, entry) => total + entry.sourceCharacters,
        0,
      );
    while (
      cache.size > HISTORY_CHAT_CACHE_LIMIT ||
      cachedSourceCharacters() > HISTORY_CHAT_CACHE_SOURCE_CHARACTER_BUDGET
    ) {
      const oldest = cache.keys().next().value;
      if (typeof oldest !== "number") break;
      cache.delete(oldest);
    }
  }

  function publishStableHistoryChat(
    chat: ChatListItem,
    entries: TaskChatEntry[],
    transcript: HistoricalTranscriptState,
    loadId: number,
    positionIntent: HistoricalTranscriptState["positionIntent"] = "latest",
  ) {
    if (historyChatLoadIdRef.current !== loadId) return;
    const publishedTranscript: HistoricalTranscriptState = {
      ...transcript,
      positionIntent,
      openAtLatestRequest:
        positionIntent === "latest"
          ? {
              requestId: loadId,
              chatId: chat.id,
              transcriptVersion: transcript.sourceVersion,
            }
          : null,
    };
    const allEntries = replaceChatEntries(
      taskChatEntriesRef.current,
      chat.workspace_id,
      chat.id,
      entries,
    );
    taskChatEntriesRef.current = allEntries;
    historicalTranscriptRef.current = publishedTranscript;
    const remembered = workspaceTaskMemoriesRef.current[chat.workspace_id];
    if (
      remembered?.selection.kind === "chat" &&
      remembered.selection.session.chatId === chat.id
    ) {
      workspaceTaskMemoriesRef.current[chat.workspace_id] = {
        ...remembered,
        historicalTranscript:
          sanitizeRememberedHistoricalTranscript(publishedTranscript),
      };
    }
    startTransition(() => {
      setTaskChatEntries(allEntries);
      setHistoricalTranscript(publishedTranscript);
      setHistoryChatLoadState(null);
      setHistoryOpenRequest(null);
    });
    cacheStableHistoryChat(chat, entries, publishedTranscript);
    if (
      (chat.origin === "orchestrator" || isAdoptedExternalChat(chat)) &&
      entries.some((entry) => entry.runView.nativePlan.reviewState === "available")
    ) {
      void reconcileReopenedPlanWorkflow(chat, entries, loadId);
    }
  }

  async function reconcileReopenedPlanWorkflow(
    chat: ChatListItem,
    entries: TaskChatEntry[],
    loadId: number,
  ) {
    const entry = [...entries]
      .reverse()
      .find((candidate) => candidate.runView.nativePlan.reviewState === "available");
    const threadId = entry?.runView.threadId ?? chat.codex_thread_id;
    if (!entry || !threadId) return;
    const profileKey =
      chat.profile_key ??
      (chat.account_id === null
        ? null
        : (`account:${chat.account_id}` as CodexProfileKey));
    if (!profileKey) return;
    const accountId = profileKey === DEFAULT_CODEX_PROFILE_KEY
      ? 0
      : Number(profileKey.slice("account:".length));
    if (!Number.isFinite(accountId)) return;

    try {
      await ensureCodexProfileConnected(profileKey, accountId);
      const response = await codexRpcForProfile<{ thread?: unknown }>(
        profileKey,
        accountId,
        "thread/read",
        { threadId, includeTurns: true },
      );
      if (historyChatLoadIdRef.current !== loadId) return;
      const thread = readObject(response.thread);
      const turn = (Array.isArray(thread.turns) ? thread.turns : [])
        .map(readObject)
        .find((candidate) => readString(candidate.id) === entry.runView.turnId);
      const planItem = (turn && Array.isArray(turn.items) ? turn.items : [])
        .map(readObject)
        .find((item) => item.type === "plan");
      const text = planItem ? readString(planItem.text) : null;
      if (text && text !== entry.runView.nativePlan.completedText) {
        updateTaskChatEntryRunView(entry.clientId, (current) => ({
          ...current,
          latestPlan: text,
          nativePlan: {
            ...current.nativePlan,
            planItemId: readString(planItem?.id) ?? current.nativePlan.planItemId,
            previewText: text,
            completedText: text,
          },
        }));
        if (entry.runId !== null) {
          await updateRun(entry.runId, {
            completedPlanItemId: readString(planItem?.id),
            completedPlanText: text,
          });
        }
      }
    } catch {
      // The persisted completed plan remains reviewable while App Server reconnects.
    }
  }

  function deferStableTranscriptCommit(commit: () => void) {
    pendingTranscriptCommitRef.current = commit;
    schedulePendingTranscriptCommit();
  }

  function markTranscriptViewportUnstable() {
    if (!taskViewportElement || typeof ResizeObserver === "undefined") {
      return;
    }
    transcriptViewportStableRef.current = false;
    setTaskViewportStable(false);
    if (transcriptCommitIdleTimerRef.current !== null) {
      window.clearTimeout(transcriptCommitIdleTimerRef.current);
      transcriptCommitIdleTimerRef.current = null;
    }
    if (transcriptViewportResizeTimerRef.current !== null) {
      window.clearTimeout(transcriptViewportResizeTimerRef.current);
    }
    transcriptViewportResizeTimerRef.current = window.setTimeout(() => {
      transcriptViewportResizeTimerRef.current = null;
      const width = taskViewportElement.getBoundingClientRect().width;
      if (width > 0) {
        pendingTranscriptViewportWidthRef.current = width;
      }
      if (transcriptScrollActiveRef.current) {
        return;
      }
      if (width > 0) {
        settleTranscriptViewportWidth(width);
      } else {
        transcriptViewportStableRef.current = true;
        setTaskViewportStable(true);
        transcriptViewportWaitersRef.current.forEach((resolve) => resolve());
        transcriptViewportWaitersRef.current.clear();
        schedulePendingTranscriptCommit();
      }
    }, HISTORY_TRANSCRIPT_RESIZE_WAIT_LIMIT_MS);
  }

  async function waitForTranscriptViewportStable() {
    if (transcriptViewportStableRef.current) {
      return;
    }
    await new Promise<void>((resolve) => {
      let settled = false;
      let timeoutId: number | null = null;
      const finish = () => {
        if (settled) return;
        settled = true;
        transcriptViewportWaitersRef.current.delete(finish);
        if (timeoutId !== null) {
          window.clearTimeout(timeoutId);
        }
        resolve();
      };
      transcriptViewportWaitersRef.current.add(finish);
      timeoutId = window.setTimeout(() => {
        const width =
          taskViewportElement?.getBoundingClientRect().width ??
          transcriptViewportWidthRef.current;
        if (width > 0) {
          settleTranscriptViewportWidth(width);
        } else {
          transcriptViewportStableRef.current = true;
          setTaskViewportStable(true);
          transcriptViewportWaitersRef.current.forEach((waiter) => waiter());
          transcriptViewportWaitersRef.current.clear();
          schedulePendingTranscriptCommit();
        }
        finish();
      }, HISTORY_TRANSCRIPT_RESIZE_WAIT_LIMIT_MS);
    });
  }

  function cancelActiveExternalTranscriptSync() {
    const active = activeExternalTranscriptSyncRef.current;
    activeExternalTranscriptSyncRef.current = null;
    if (active) {
      void cancelDefaultProfileThreadTranscript(active.requestId).catch(() => undefined);
    }
  }

  function cancelActiveHistoricalTranscriptPreparation() {
    historicalPreparationAbortRef.current?.abort();
    historicalPreparationAbortRef.current = null;
    cancelHistoricalTranscriptPreparation();
  }

  async function prepareHistoryChatEntries(
    chat: ChatListItem,
    entries: TaskChatEntry[],
    transcript: HistoricalTranscriptState,
    loadId: number,
  ) {
    cancelActiveHistoricalTranscriptPreparation();
    const controller = new AbortController();
    historicalPreparationAbortRef.current = controller;
    try {
      const preparedEntries = await prepareHistoricalTranscript(
        entries,
        `${HISTORICAL_RENDER_PIPELINE_VERSION}:${chat.id}:${transcript.sourceVersion}`,
        controller.signal,
      );
      if (
        controller.signal.aborted ||
        historyChatLoadIdRef.current !== loadId ||
        selectedWorkspaceRef.current?.id !== chat.workspace_id
      ) {
        return null;
      }
      return preparedEntries;
    } finally {
      if (historicalPreparationAbortRef.current === controller) {
        historicalPreparationAbortRef.current = null;
      }
    }
  }

  async function synchronizeExternalTranscript(
    chat: ChatListItem,
    loadId: number,
    publication: "none" | "initial",
    positionIntent: HistoricalTranscriptState["positionIntent"] = "latest",
  ) {
    if (isAdoptedExternalChat(chat)) {
      return;
    }
    const threadId = chat.external_thread_id ?? chat.codex_thread_id;
    if (!threadId) return;
    const sourceVersion = chat.external_updated_at ?? chat.updated_at;
    const requestId = `transcript-${chat.id}-${Date.now().toString(36)}`;
    activeExternalTranscriptSyncRef.current = { chatId: chat.id, requestId };
    try {
      await ensureCodexProfileConnected(DEFAULT_CODEX_PROFILE_KEY, 0);
      const snapshot = await syncDefaultProfileThreadTranscript({
        threadId,
        sourceVersion,
        pageSize: HISTORY_CHAT_PAGE_SIZE,
        requestId,
      });
      if (activeExternalTranscriptSyncRef.current?.requestId !== requestId) {
        return;
      }
      await activateExternalTranscriptSnapshot(chat.id, snapshot);
      const completeEntries = createTaskChatEntriesFromExternalTranscriptSnapshot(
        chat,
        snapshot,
      );
      const transcript: HistoricalTranscriptState = {
        chatId: chat.id,
        sourceVersion,
        complete: true,
        firstItemIndex: HISTORY_VIRTUOSO_BASE_INDEX,
        positionIntent:
          publication === "initial" ? positionIntent : "preserve",
        openAtLatestRequest: null,
        syncStatus: "complete",
      };
      if (publication === "none") {
        stableHistoryChatCacheRef.current.delete(chat.id);
        return;
      }
      const preparedEntries = await prepareHistoryChatEntries(
        chat,
        completeEntries,
        transcript,
        loadId,
      );
      if (!preparedEntries) return;
      cacheStableHistoryChat(chat, preparedEntries, transcript);
      if (
        historyChatLoadIdRef.current === loadId &&
        selectedWorkspaceRef.current?.id === chat.workspace_id
      ) {
        const publish = () => {
          publishStableHistoryChat(
            chat,
            preparedEntries,
            transcript,
            loadId,
            publication === "initial" ? positionIntent : "preserve",
          );
          setStatusMessage(
            `Opened chat from ${formatHistoryTimestamp(chat.latest_activity_at)}.`,
          );
        };
        if (
          publication === "initial" &&
          transcriptViewportStableRef.current &&
          !transcriptScrollActiveRef.current
        ) {
          publish();
        } else {
          deferStableTranscriptCommit(publish);
        }
      }
    } catch (error) {
      if (publication === "initial") {
        if (/method not found|unknown method|-32601/i.test(String(error))) {
          throw new Error(
            "Paged Codex history is unavailable. Update Codex and try again.",
          );
        }
        throw error;
      }
      if (
        historyChatLoadIdRef.current === loadId &&
        !/cancelled/i.test(String(error))
      ) {
        setHistoricalTranscript((current) =>
          current?.chatId === chat.id
            ? { ...current, syncStatus: "error" }
            : current,
        );
        setStatusMessage(
          `Opened the available turns, but transcript sync failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    } finally {
      if (activeExternalTranscriptSyncRef.current?.requestId === requestId) {
        activeExternalTranscriptSyncRef.current = null;
      }
    }
  }

  async function loadExternalCodexChat(
    chat: ChatListItem,
    loadId: number,
    positionIntent: HistoricalTranscriptState["positionIntent"],
  ) {
    if (isAdoptedExternalChat(chat)) {
      const snapshot = await readExternalTranscriptSnapshot(chat.id);
      if (!snapshot) {
        throw new Error(
          "The frozen imported transcript is unavailable for this adopted chat.",
        );
      }
      const localRuns = await listLocalChatTranscript(chat.id);
      if (historyChatLoadIdRef.current !== loadId) return;
      const entries = [
        ...createTaskChatEntriesFromExternalTranscriptSnapshot(chat, snapshot),
        ...localRuns.map(createTaskChatEntryFromHistoryRun),
      ].sort(
        (left, right) =>
          (left.turnIndex ?? Number.MAX_SAFE_INTEGER) -
          (right.turnIndex ?? Number.MAX_SAFE_INTEGER),
      );
      const transcript: HistoricalTranscriptState = {
        chatId: chat.id,
        sourceVersion: historyChatVersion(chat),
        complete: true,
        firstItemIndex: HISTORY_VIRTUOSO_BASE_INDEX,
        positionIntent,
        openAtLatestRequest: null,
        syncStatus: "complete",
      };
      const preparedEntries = await prepareHistoryChatEntries(
        chat,
        entries,
        transcript,
        loadId,
      );
      if (!preparedEntries) return;
      publishStableHistoryChat(
        chat,
        preparedEntries,
        transcript,
        loadId,
        positionIntent,
      );
      setStatusMessage(
        `Opened chat from ${formatHistoryTimestamp(chat.latest_activity_at)}.`,
      );
      return;
    }

    const threadId = chat.external_thread_id ?? chat.codex_thread_id;
    if (!threadId) {
      throw new Error("External Codex chat is missing its thread id.");
    }
    const sourceVersion = chat.external_updated_at ?? chat.updated_at;
    const currentSnapshot = await readExternalTranscriptSnapshot(chat.id, sourceVersion);
    if (historyChatLoadIdRef.current !== loadId) return;
    if (currentSnapshot) {
      const entries = createTaskChatEntriesFromExternalTranscriptSnapshot(
        chat,
        currentSnapshot,
      );
      const transcript: HistoricalTranscriptState = {
        chatId: chat.id,
        sourceVersion,
        complete: true,
        firstItemIndex: HISTORY_VIRTUOSO_BASE_INDEX,
        positionIntent,
        openAtLatestRequest: null,
        syncStatus: "complete",
      };
      const preparedEntries = await prepareHistoryChatEntries(
        chat,
        entries,
        transcript,
        loadId,
      );
      if (!preparedEntries) return;
      publishStableHistoryChat(
        chat,
        preparedEntries,
        transcript,
        loadId,
        positionIntent,
      );
      setStatusMessage(`Opened chat from ${formatHistoryTimestamp(chat.latest_activity_at)}.`);
      return;
    }

    const staleSnapshot = await readExternalTranscriptSnapshot(chat.id);
    if (historyChatLoadIdRef.current !== loadId) return;
    if (staleSnapshot) {
      const entries = createTaskChatEntriesFromExternalTranscriptSnapshot(chat, staleSnapshot);
      const transcript: HistoricalTranscriptState = {
        chatId: chat.id,
        sourceVersion: staleSnapshot.sourceVersion,
        complete: true,
        firstItemIndex: HISTORY_VIRTUOSO_BASE_INDEX,
        positionIntent,
        openAtLatestRequest: null,
        syncStatus: "syncing",
      };
      const preparedEntries = await prepareHistoryChatEntries(
        chat,
        entries,
        transcript,
        loadId,
      );
      if (!preparedEntries) return;
      publishStableHistoryChat(
        chat,
        preparedEntries,
        transcript,
        loadId,
        positionIntent,
      );
      void synchronizeExternalTranscript(chat, loadId, "none", positionIntent);
      return;
    }

    await synchronizeExternalTranscript(
      chat,
      loadId,
      "initial",
      positionIntent,
    );
  }

  function markWorkspaceChatRead(workspaceId: number, chatId: number) {
    setUnreadCompletedChats((current) => {
      const currentWorkspaceChats = current[workspaceId] ?? [];
      const remaining = currentWorkspaceChats.filter(
        (candidateChatId) => candidateChatId !== chatId,
      );
      if (remaining.length === currentWorkspaceChats.length) {
        return current;
      }
      const next = { ...current };
      if (remaining.length > 0) next[workspaceId] = remaining;
      else delete next[workspaceId];
      return next;
    });
  }

  function applyWorkspaceForChatNavigation(workspace: Workspace) {
    if (selectedWorkspaceRef.current?.id !== workspace.id) {
      taskChatTranscriptRef.current?.captureViewportState();
      rememberCurrentWorkspaceTaskMemory();
    }
    const memory =
      workspaceTaskMemoriesRef.current[workspace.id] ??
      createEmptyWorkspaceTaskMemory();
    workspaceTaskMemoriesRef.current[workspace.id] = memory;
    setWorkspaceContextMenu(null);
    selectedWorkspaceRef.current = workspace;
    setSelectedWorkspace(workspace);
    restoreWorkspaceComposer(memory);
    activeViewRef.current = "task";
    setActiveView("task");
    preflightRef.current = null;
  }

  function selectWorkspaceExecutionAccount(
    workspace: Workspace,
    session: WorkspaceChatSession | null,
  ) {
    const accountId =
      accountIdFromProfileKey(session?.profileKey) ??
      (!session ? workspace.default_account_id : null);
    if (accountId && accountId !== selectedAccountIdRef.current) {
      void selectCodexAccount(accountId);
    }
  }

  async function selectHistoryChat(
    chat: ChatListItem,
    options: SelectHistoryChatOptions = {},
  ): Promise<boolean> {
    if (options.source !== "notification") {
      cancelAgentNotificationNavigation();
    }
    const targetWorkspace =
      options.workspace ??
      workspacesRef.current.find(
        (candidate) => candidate.id === chat.workspace_id,
      ) ??
      null;
    if (!targetWorkspace) {
      setStatusMessage("The workspace for that chat is no longer available.");
      return false;
    }

    const loadId = historyChatLoadIdRef.current + 1;
    historyChatLoadIdRef.current = loadId;
    cancelActiveExternalTranscriptSync();
    cancelActiveHistoricalTranscriptPreparation();
    pendingTranscriptCommitRef.current = null;
    transcriptScrollActiveRef.current = false;
    const session: WorkspaceChatSession = {
      chatId: chat.id,
      threadId: isAdoptedExternalChat(chat)
        ? chat.codex_thread_id
        : chat.external_thread_id ?? chat.codex_thread_id,
      origin: chat.origin,
      profileKey: chat.profile_key,
      externalThreadId: chat.external_thread_id,
      nextTurnIndex: Math.max(1, (Number(chat.turn_count) || 0) + 1),
      savedDefaultCollaborationMode: parseSavedDefaultCollaborationMode(
        chat.saved_default_collaboration_mode_json,
      ),
    };
    const subagentKey = subagentConversationKey({ chatId: chat.id });
    if (
      subagentKey &&
      getConversationSubagents(subagentKey).length === 0
    ) {
      void listChatSubagents(chat.id)
        .then((records) => {
          replaceConversationSubagents(subagentKey, records);
        })
        .catch((error) => {
          console.error("Could not restore chat subagents", error);
        });
    }
    const runningControl = findRunControlByChat(chat.workspace_id, chat.id);
    const positionIntent = options.positionIntent ?? "latest";

    markWorkspaceChatRead(chat.workspace_id, chat.id);
    rememberWorkspaceTaskSelection(
      chat.workspace_id,
      { kind: "chat", session },
      null,
    );

    if (runningControl) {
      const liveEntry = runningControl.entry;
      flushSync(() => {
        applyWorkspaceForChatNavigation(targetWorkspace);
        setChatHistoryContextMenu(null);
        setSelectedDraftChat(null);
        setSelectedHistoryChatId(chat.id);
        setWorkspaceChatSession(chat.workspace_id, session);
        setHistoryChatLoadState(null);
        setHistoryOpenRequest(null);
        historicalTranscriptRef.current = null;
        setHistoricalTranscript(null);
        closeHistoryDrawer();
        if (liveEntry) {
          setTaskChatEntries((current) => {
            const existing = current.filter(
              (entry) =>
                entry.workspaceId === chat.workspace_id &&
                entry.chatId === chat.id,
            );
            const nextEntries = existing.some(
              (entry) => entry.clientId === runningControl.clientId,
            )
              ? existing.map((entry) =>
                  entry.clientId === runningControl.clientId
                    ? liveEntry
                    : entry,
                )
              : [...existing, liveEntry];
            return replaceChatEntries(
              current,
              chat.workspace_id,
              chat.id,
              nextEntries,
            );
          });
        }
        setSelectedRunAliases(runningControl);
      });
      selectWorkspaceExecutionAccount(targetWorkspace, session);
      setStatusMessage("Opened running chat.");
      return true;
    }

    flushSync(() => {
      applyWorkspaceForChatNavigation(targetWorkspace);
      setChatHistoryContextMenu(null);
      setSelectedDraftChat(null);
      setSelectedHistoryChatId(chat.id);
      setWorkspaceChatSession(chat.workspace_id, session);
      setHistoryChatLoadState({
        chatId: chat.id,
        workspaceId: chat.workspace_id,
        title: chat.title,
        error: null,
      });
      setHistoryOpenRequest({
        workspaceId: chat.workspace_id,
        chatId: chat.id,
        requestId: loadId,
        phase: "loading",
      });
      historicalTranscriptRef.current = null;
      setHistoricalTranscript(null);
      setTaskChatEntries((current) =>
        replaceChatEntries(current, chat.workspace_id, chat.id, []),
      );
      closeHistoryDrawer();
      setSelectedRunAliases(null);
    });
    selectWorkspaceExecutionAccount(targetWorkspace, session);

    setStatusMessage(`Opening chat from ${formatHistoryTimestamp(chat.latest_activity_at)}.`);
    try {
      await waitForNextPaint();
      await waitForHistoryDrawerClosed();
      markTranscriptViewportUnstable();
      await waitForNextPaint();
      await waitForTranscriptViewportStable();
      if (historyChatLoadIdRef.current !== loadId) {
        return false;
      }

      const cached = stableHistoryChatCacheRef.current.get(chat.id);
      if (
        cached?.version === historyChatVersion(chat) &&
        cached.renderVersion === HISTORICAL_RENDER_PIPELINE_VERSION
      ) {
        publishStableHistoryChat(
          chat,
          cached.entries,
          cached.transcript,
          loadId,
          positionIntent,
        );
        setStatusMessage(
          `Opened chat from ${formatHistoryTimestamp(chat.latest_activity_at)}.`,
        );
        return true;
      }

      if (chat.origin === "codex_external") {
        await loadExternalCodexChat(chat, loadId, positionIntent);
        return (
          historyChatLoadIdRef.current === loadId &&
          selectedWorkspaceRef.current?.id === chat.workspace_id
        );
      }

      await loadLocalHistoryChatProgressively(
        chat,
        loadId,
        positionIntent,
      );
      return (
        historyChatLoadIdRef.current === loadId &&
        selectedWorkspaceRef.current?.id === chat.workspace_id
      );
    } catch (error) {
      if (historyChatLoadIdRef.current !== loadId) {
        return false;
      }
      const message = error instanceof Error ? error.message : String(error);
      setHistoryChatLoadState((current) =>
        current?.chatId === chat.id ? { ...current, error: message } : current,
      );
      historicalTranscriptRef.current = null;
      setHistoricalTranscript(null);
      setHistoryOpenRequest((current) =>
        current?.requestId === loadId ? null : current,
      );
      setStatusMessage(
        `Could not open chat: ${message}`,
      );
      return false;
    }
  }

  async function loadLocalHistoryChatProgressively(
    chat: ChatListItem,
    loadId: number,
    positionIntent: HistoricalTranscriptState["positionIntent"],
  ) {
    const runs = await listLocalChatTranscript(chat.id);
    if (historyChatLoadIdRef.current !== loadId) {
      return;
    }
    const entries = runs.map(createTaskChatEntryFromHistoryRun);
    const transcript: HistoricalTranscriptState = {
      chatId: chat.id,
      sourceVersion: historyChatVersion(chat),
      complete: true,
      firstItemIndex: HISTORY_VIRTUOSO_BASE_INDEX,
      positionIntent,
      openAtLatestRequest: null,
      syncStatus: "complete",
    };
    const preparedEntries = await prepareHistoryChatEntries(
      chat,
      entries,
      transcript,
      loadId,
    );
    if (!preparedEntries) return;
    publishStableHistoryChat(
      chat,
      preparedEntries,
      transcript,
      loadId,
      positionIntent,
    );
    setStatusMessage(`Opened chat from ${formatHistoryTimestamp(chat.latest_activity_at)}.`);
  }

  async function loadHistoricalActivity(entry: TaskChatEntry) {
    const activity = entry.historicalActivity;
    if (!activity || activity.status === "loading") {
      return;
    }
    const cursor =
      activity.status === "loaded" ? activity.nextCursor : activity.nextCursor ?? null;
    if (activity.status === "loaded" && !cursor) {
      return;
    }

    updateHistoricalActivityEntry(entry.clientId, (current) => ({
      ...current,
      historicalActivity: current.historicalActivity
        ? { ...current.historicalActivity, status: "loading", error: null }
        : current.historicalActivity,
    }));

    const cacheKey = `${activity.threadId}:${activity.turnId}:${cursor ?? "latest"}`;
    try {
      let response = historicalActivityCacheRef.current.get(cacheKey);
      if (!response) {
        let request = historicalActivityRequestCacheRef.current.get(cacheKey);
        if (!request) {
          request = ensureCodexProfileConnected(DEFAULT_CODEX_PROFILE_KEY, 0).then(
            () =>
              loadDefaultProfileTurnActivity({
                threadId: activity.threadId,
                turnId: activity.turnId,
                cursor,
                limit: HISTORY_ACTIVITY_PAGE_SIZE,
              }),
          );
          historicalActivityRequestCacheRef.current.set(cacheKey, request);
        }
        try {
          response = await request;
          historicalActivityCacheRef.current.set(cacheKey, response);
          while (
            historicalActivityCacheRef.current.size >
            HISTORY_ACTIVITY_CACHE_LIMIT
          ) {
            const oldestKey = historicalActivityCacheRef.current.keys().next().value;
            if (typeof oldestKey !== "string") {
              break;
            }
            historicalActivityCacheRef.current.delete(oldestKey);
          }
        } finally {
          historicalActivityRequestCacheRef.current.delete(cacheKey);
        }
      }

      if (!taskChatEntriesRef.current.some((item) => item.clientId === entry.clientId)) {
        return;
      }
      updateHistoricalActivityEntry(entry.clientId, (current) => ({
        ...current,
        runView: {
          ...current.runView,
          commands: mergeCommandActivities(
            current.runView.commands,
            response.commands.map((command) => ({ ...command, output: "" })),
          ),
          editedFiles: mergeEditedFileActivities(
            current.runView.editedFiles,
            response.editedFiles,
          ),
        },
        historicalActivity: current.historicalActivity
          ? {
              ...current.historicalActivity,
              status: "loaded",
              nextCursor: response.nextCursor,
              error: null,
            }
          : current.historicalActivity,
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      updateHistoricalActivityEntry(entry.clientId, (current) => ({
        ...current,
        historicalActivity: current.historicalActivity
          ? { ...current.historicalActivity, status: "error", error: message }
          : current.historicalActivity,
      }));
    }
  }

  function updateHistoricalActivityEntry(
    clientId: string,
    updater: (entry: TaskChatEntry) => TaskChatEntry,
  ) {
    setTaskChatEntries((current) => {
      const next = current.map((entry) =>
        entry.clientId === clientId ? updater(entry) : entry,
      );
      taskChatEntriesRef.current = next;
      return next;
    });
  }

  function startNewWorkspaceChat() {
    if (!selectedWorkspace) {
      setStatusMessage("Choose a workspace before starting a new chat.");
      return;
    }
    cancelAgentNotificationNavigation();
    const previousSession =
      workspaceChatSessionsRef.current[selectedWorkspace.id];
    if (previousSession) {
      clearPendingAccountHandoff(previousSession.chatId);
    }
    historyChatLoadIdRef.current += 1;
    cancelActiveExternalTranscriptSync();
    cancelActiveHistoricalTranscriptPreparation();
    pendingTranscriptCommitRef.current = null;
    transcriptScrollActiveRef.current = false;
    setHistoryChatLoadState(null);
    setHistoryOpenRequest(null);
    historicalTranscriptRef.current = null;
    setHistoricalTranscript(null);
    rememberWorkspaceTaskSelection(
      selectedWorkspace.id,
      { kind: "new" },
      null,
    );
    setWorkspaceChatSession(selectedWorkspace.id, undefined);
    setSelectedDraftChat(null);
    setSelectedHistoryChatId(null);
    setSelectedRunAliases(null);
    preflightRef.current = null;
    setStatusMessage("Started a new chat.");
  }

  async function confirmChatHistoryDelete() {
    const chat = chatHistoryDeleteCandidate;
    if (!chat) {
      return;
    }

    await softDeleteChat(chat.id);
    const queueDispatchTimer =
      promptQueueDispatchTimersRef.current.get(chat.id);
    if (queueDispatchTimer !== undefined) {
      window.clearTimeout(queueDispatchTimer);
      promptQueueDispatchTimersRef.current.delete(chat.id);
    }
    promptQueueClaimLocksRef.current.delete(chat.id);
    setChatPromptQueue(chat.id, []);
    setPromptQueuePaused(chat.id, false);
    clearPendingAccountHandoff(chat.id);
    stableHistoryChatCacheRef.current.delete(chat.id);
    const deletedSubagentKey = subagentConversationKey({ chatId: chat.id });
    if (deletedSubagentKey) {
      replaceConversationSubagents(deletedSubagentKey, []);
    }
    const remembered = workspaceTaskMemoriesRef.current[chat.workspace_id];
    if (
      remembered?.selection.kind === "chat" &&
      remembered.selection.session.chatId === chat.id
    ) {
      workspaceTaskMemoriesRef.current[chat.workspace_id] = {
        ...remembered,
        selection: { kind: "new" },
        historicalTranscript: null,
        transcriptViewportSnapshot: null,
      };
    }
    if (
      historyChatLoadState?.chatId === chat.id ||
      historyOpenRequest?.chatId === chat.id ||
      selectedHistoryChatId === chat.id
    ) {
      historyChatLoadIdRef.current += 1;
      cancelActiveExternalTranscriptSync();
      cancelActiveHistoricalTranscriptPreparation();
      pendingTranscriptCommitRef.current = null;
      transcriptScrollActiveRef.current = false;
    }
    setHistoryChatLoadState((current) =>
      current?.chatId === chat.id ? null : current,
    );
    setHistoryOpenRequest((current) =>
      current?.chatId === chat.id ? null : current,
    );
    setHistoricalTranscript((current) =>
      current?.chatId === chat.id ? null : current,
    );
    if (
      selectedHistoryChatId === chat.id ||
      workspaceChatSessionsRef.current[chat.workspace_id]?.chatId === chat.id
    ) {
      historicalTranscriptRef.current = null;
      setSelectedHistoryChatId(null);
      setWorkspaceChatSession(chat.workspace_id, undefined);
      setSelectedDraftChat(null);
      setSelectedRunAliases(null);
      setTaskChatEntries((current) =>
        current.filter((entry) => entry.chatId !== chat.id),
      );
    }
    setChatHistoryDeleteCandidate(null);
    setStatusMessage("Removed chat from history.");
    await refreshSelectedWorkspaceHistory();
    await refreshWorkspaceData(chat.workspace_id);
  }

  async function confirmWorkspaceDelete() {
    const workspace = workspaceDeleteCandidate;
    if (!workspace) {
      return;
    }

    const wasSelected = selectedWorkspaceRef.current?.id === workspace.id;
    await softDeleteWorkspace(workspace.id);
    setWorkspaceDeleteCandidate(null);
    clearWorkspaceRuntimeState(workspace);

    const remaining = workspacesRef.current.filter(
      (candidate) => candidate.id !== workspace.id,
    );
    workspacesRef.current = remaining;
    setWorkspaces(remaining);

    if (wasSelected) {
      const nextWorkspace = remaining[0] ?? null;
      selectedWorkspaceRef.current = null;
      setSelectedWorkspace(null);
      if (nextWorkspace) {
        selectWorkspace(nextWorkspace.id);
        setStatusMessage(
          `Removed ${workspace.label}. Restored ${nextWorkspace.label}.`,
        );
      } else {
        setStatusMessage(
          `Removed ${workspace.label}. Add or choose a workspace to continue.`,
        );
      }
      return;
    }

    setStatusMessage(`Removed ${workspace.label} from Orchestrator.`);
  }

  function clearWorkspaceRuntimeState(workspace: Workspace) {
    if (
      historyChatLoadState?.workspaceId === workspace.id ||
      historyOpenRequest?.workspaceId === workspace.id
    ) {
      historyChatLoadIdRef.current += 1;
      cancelActiveExternalTranscriptSync();
      cancelActiveHistoricalTranscriptPreparation();
      pendingTranscriptCommitRef.current = null;
      transcriptScrollActiveRef.current = false;
    }
    setHistoricalTranscript((current) =>
      current?.chatId === workspaceChatSessionsRef.current[workspace.id]?.chatId
        ? null
        : current,
    );
    const workspaceRoot = normalizeWorkspacePath(workspace.path);
    const workspacePrefix = `${workspaceRoot}/`;
    const belongsToWorkspace = (path: string) => {
      const normalized = normalizeWorkspacePath(path);
      return normalized === workspaceRoot || normalized.startsWith(workspacePrefix);
    };

    setExpandedWorkspaceIds((current) => {
      const next = new Set(current);
      next.delete(workspace.id);
      return next;
    });
    setExpandedDirectoryPaths(
      (current) =>
        new Set(
          [...current].filter((directoryPath) => !belongsToWorkspace(directoryPath)),
        ),
    );
    setDirectoryStates((current) =>
      Object.fromEntries(
        Object.entries(current).filter(([key]) => !key.startsWith(`${workspace.path}\u0000`)),
      ),
    );
    setGitStatusStates((current) => {
      const next = { ...current };
      delete next[workspace.id];
      return next;
    });
    setGitOperationsByWorkspace((current) => {
      if (!current[workspace.id]) return current;
      const next = { ...current };
      delete next[workspace.id];
      return next;
    });
    clearRunningGitOperation(workspace.id);
    setContextFiles((current) =>
      current.filter((file) => !belongsToWorkspace(file.path)),
    );
    setTaskChatEntries((current) =>
      current.filter((entry) => entry.workspaceId !== workspace.id),
    );
    const workspaceQueueChatIds = Object.values(
      promptQueuesByChatRef.current,
    ).flatMap((items) =>
      (items ?? [])
        .filter((item) => item.workspaceId === workspace.id)
        .map((item) => item.chatId),
    );
    for (const chatId of new Set(workspaceQueueChatIds)) {
      const dispatchTimer = promptQueueDispatchTimersRef.current.get(chatId);
      if (dispatchTimer !== undefined) {
        window.clearTimeout(dispatchTimer);
        promptQueueDispatchTimersRef.current.delete(chatId);
      }
      promptQueueClaimLocksRef.current.delete(chatId);
      setChatPromptQueue(chatId, []);
      setPromptQueuePaused(chatId, false);
    }
    if (
      promptQueueComposerEditRef.current?.item.workspaceId === workspace.id
    ) {
      setPromptQueueComposerEditState(null);
    }
    promptQueueEnqueueOperationsRef.current.delete(workspace.id);
    promptQueuePendingSubmissionKeysRef.current.delete(workspace.id);
    delete workspaceTaskMemoriesRef.current[workspace.id];
    const remainingHandoffs = Object.fromEntries(
      Object.entries(pendingAccountHandoffsRef.current).filter(
        ([, handoff]) => handoff?.workspaceId !== workspace.id,
      ),
    );
    pendingAccountHandoffsRef.current = remainingHandoffs;
    setPendingAccountHandoffs(remainingHandoffs);
    setWorkspaceChatSession(workspace.id, undefined);
    setHistoryChatLoadState((current) =>
      current?.workspaceId === workspace.id ? null : current,
    );
    setHistoryOpenRequest((current) =>
      current?.workspaceId === workspace.id ? null : current,
    );
    if (selectedHistoryChatId !== null) {
      setSelectedHistoryChatId(null);
    }
    if (activeChatEntryId !== null) {
      const activeEntry = taskChatEntries.find(
        (entry) => entry.clientId === activeChatEntryId,
      );
      if (activeEntry?.workspaceId === workspace.id) {
        clearActiveChatRun();
      }
    }
    preflightRef.current = null;

    if (previewState.file && belongsToWorkspace(previewState.file.path)) {
      setPreviewState({
        status: "idle",
        mode: "preview",
        file: null,
        preview: null,
        error: null,
        diffStatus: "idle",
        diff: null,
        diffError: null,
      });
    }

    for (const key of directoryEntriesCache.current.keys()) {
      if (key.startsWith(`${workspace.path}\u0000`)) {
        directoryEntriesCache.current.delete(key);
      }
    }
    for (const key of directoryRequestCache.current.keys()) {
      if (key.startsWith(`${workspace.path}\u0000`)) {
        directoryRequestCache.current.delete(key);
      }
    }
    for (const key of filePreviewCache.current.keys()) {
      if (key.startsWith(`${workspace.path}\u0000`)) {
        filePreviewCache.current.delete(key);
      }
    }
    for (const key of filePreviewRequestCache.current.keys()) {
      if (key.startsWith(`${workspace.path}\u0000`)) {
        filePreviewRequestCache.current.delete(key);
      }
    }
    for (const key of fileDiffCache.current.keys()) {
      if (key.startsWith(`${workspace.path}\u0000`)) {
        fileDiffCache.current.delete(key);
      }
    }
    for (const key of fileDiffRequestCache.current.keys()) {
      if (key.startsWith(`${workspace.path}\u0000`)) {
        fileDiffRequestCache.current.delete(key);
      }
    }
    gitStatusRefreshCache.current.delete(workspace.id);
    workspaceFileIndexCache.current.delete(workspace.id);
    workspaceFileIndexRequestCache.current.delete(workspace.id);
  }

  function openBranchCreationDialog() {
    const workspace = selectedWorkspaceRef.current;
    if (
      !workspace ||
      branchCreationInFlightRef.current ||
      branchCreationPendingWorkspaceId !== null ||
      selectedGitActionStatus !== "idle" ||
      selectedGitStatusState?.status !== "loaded"
    ) {
      return;
    }

    setBranchCreationDialog({
      workspace,
      baseBranch: selectedBranch,
      branchName: "",
      status: "idle",
      error: null,
    });
  }

  async function confirmBranchCreation() {
    const dialog = branchCreationDialog;
    if (!dialog || dialog.status !== "idle" || branchCreationInFlightRef.current) {
      return;
    }

    const branchName = dialog.branchName.trim();
    if (!branchName) {
      setBranchCreationDialog((current) =>
        current
          ? { ...current, error: "Enter a branch name before creating it." }
          : current,
      );
      return;
    }

    branchCreationInFlightRef.current = true;
    setBranchCreationPendingWorkspaceId(dialog.workspace.id);
    setBranchCreationDialog((current) =>
      current?.workspace.id === dialog.workspace.id
        ? {
            ...current,
            branchName,
            status: "creating",
            error: null,
          }
        : current,
    );

    try {
      const result = await createGitBranch(dialog.workspace.path, branchName);
      preflightRef.current = null;
      await Promise.allSettled([
        refreshBranches(dialog.workspace),
        refreshWorkspaceGitStatus(dialog.workspace, {
          showLoading: false,
          force: true,
        }),
      ]);
      if (selectedWorkspaceRef.current?.id === dialog.workspace.id) {
        setSelectedBranch(result.branch);
        setStatusMessage(
          `Created and switched to ${result.branch} in ${dialog.workspace.label}.`,
        );
      }
      setBranchCreationDialog((current) =>
        current?.workspace.id === dialog.workspace.id ? null : current,
      );
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      setBranchCreationDialog((current) =>
        current?.workspace.id === dialog.workspace.id
          ? {
              ...current,
              status: "idle",
              error: `Could not create branch: ${detail}`,
            }
          : current,
      );
    } finally {
      branchCreationInFlightRef.current = false;
      setBranchCreationPendingWorkspaceId((current) =>
        current === dialog.workspace.id ? null : current,
      );
    }
  }

  async function selectBranch(branch: string) {
    if (!selectedWorkspace || !branch) {
      return;
    }

    setSelectedBranch(branch);
    preflightRef.current = null;
    try {
      await checkoutGitBranch(selectedWorkspace.path, branch);
      await refreshBranches(selectedWorkspace);
      await refreshWorkspaceGitStatus(selectedWorkspace);
      setStatusMessage(`Working on ${selectedWorkspace.label} at ${branch}.`);
    } catch (error) {
      await refreshBranches(selectedWorkspace);
      await refreshWorkspaceGitStatus(selectedWorkspace);
      setStatusMessage(
        `Could not switch to ${branch}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async function ensureRunBranch(workspace: Workspace, branch: string | null) {
    if (!branch) {
      return true;
    }

    try {
      await checkoutGitBranch(workspace.path, branch);
      return true;
    } catch (error) {
      await refreshBranches(workspace);
      await refreshWorkspaceGitStatus(workspace);
      setStatusMessage(
        `Could not switch to ${branch}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return false;
    }
  }

  async function chooseContextFiles() {
    const selected = await open({
      directory: false,
      multiple: true,
      title: "Add files to context",
    });
    const paths = normalizeDialogSelection(selected);

    if (paths.length === 0) {
      return;
    }

    setContextFiles((current) => mergeContextFiles(current, paths.map(contextFileFromPath)));
  }

  async function getWorkspaceFileIndex(workspace: Workspace) {
    const cached = workspaceFileIndexCache.current.get(workspace.id);
    if (cached) {
      return cached;
    }

    const existingRequest = workspaceFileIndexRequestCache.current.get(workspace.id);
    if (existingRequest) {
      return existingRequest;
    }

    const request = collectWorkspaceFiles(workspace, workspace.path)
      .then((files) => {
        workspaceFileIndexCache.current.set(workspace.id, files);
        return files;
      })
      .finally(() => {
        workspaceFileIndexRequestCache.current.delete(workspace.id);
      });

    workspaceFileIndexRequestCache.current.set(workspace.id, request);
    return request;
  }

  async function searchMentionFiles(query: string) {
    const requestId = mentionSearchRequestId.current + 1;
    mentionSearchRequestId.current = requestId;
    setMentionSearchError(null);

    if (!selectedWorkspace) {
      setMentionResults([]);
      setMentionSearchStatus("disabled");
      return;
    }

    if (!query.trim()) {
      setMentionResults([]);
      setMentionSearchStatus("loaded");
      return;
    }

    setMentionSearchStatus("loading");

    try {
      const files = await getWorkspaceFileIndex(selectedWorkspace);
      if (mentionSearchRequestId.current !== requestId) {
        return;
      }

      setMentionResults(searchWorkspaceFiles(files, query));
      setMentionSearchStatus("loaded");
    } catch (error) {
      if (mentionSearchRequestId.current !== requestId) {
        return;
      }

      setMentionResults([]);
      setMentionSearchStatus("error");
      setMentionSearchError(error instanceof Error ? error.message : String(error));
    }
  }

  function closeMentionSearch() {
    mentionSearchRequestId.current += 1;
    setMentionResults([]);
    setMentionSearchStatus("idle");
    setMentionSearchError(null);
  }

  function addMentionFileToContext(file: ComposerContextFile) {
    setContextFiles((current) => mergeContextFiles(current, [file]));
    setStatusMessage(`Added ${file.name} to context.`);
  }

  async function getCodexSkills(accountId: number) {
    const cached = codexSkillCache.current.get(accountId);
    if (cached) {
      return cached;
    }

    const existingRequest = codexSkillRequestCache.current.get(accountId);
    if (existingRequest) {
      return existingRequest;
    }

    const request = listCodexSkills(accountId)
      .then((skills) => {
        codexSkillCache.current.set(accountId, skills);
        return skills;
      })
      .finally(() => {
        codexSkillRequestCache.current.delete(accountId);
      });

    codexSkillRequestCache.current.set(accountId, request);
    return request;
  }

  async function searchSlashCommands(query: string) {
    const requestId = slashCommandSearchRequestId.current + 1;
    slashCommandSearchRequestId.current = requestId;
    setSlashCommandSearchError(null);

    const accountId = selectedAccountIdRef.current;
    const builtInResults = buildSlashCommandResults(query, []);

    if (!accountId) {
      setSlashCommandResults(builtInResults);
      setSlashCommandSearchStatus("disabled");
      setSlashCommandSearchError("Sign in to load skills.");
      return;
    }

    const cachedSkills = codexSkillCache.current.get(accountId);
    if (cachedSkills) {
      setSlashCommandResults(buildSlashCommandResults(query, cachedSkills));
      setSlashCommandSearchStatus("loaded");
      return;
    }

    setSlashCommandResults(builtInResults);
    setSlashCommandSearchStatus("loading");

    try {
      await ensureCodexConnected(accountId);
      const skills = await getCodexSkills(accountId);
      if (slashCommandSearchRequestId.current !== requestId) {
        return;
      }

      setSlashCommandResults(buildSlashCommandResults(query, skills));
      setSlashCommandSearchStatus("loaded");
    } catch (error) {
      if (slashCommandSearchRequestId.current !== requestId) {
        return;
      }

      setSlashCommandResults(builtInResults);
      setSlashCommandSearchStatus("error");
      setSlashCommandSearchError(
        `Skills unavailable: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  function closeSlashCommandSearch() {
    slashCommandSearchRequestId.current += 1;
    setSlashCommandResults(BUILTIN_SLASH_COMMANDS);
    setSlashCommandSearchStatus("idle");
    setSlashCommandSearchError(null);
  }

  function addSelectedSkill(skill: CodexSkillSummary) {
    setSelectedSkills((current) => {
      if (current.some((selectedSkill) => selectedSkill.id === skill.id)) {
        return current;
      }

      return [...current, skill];
    });
    setStatusMessage(`Added ${skill.name} skill to this task.`);
  }

  function handleSlashCommandSelect(item: SlashCommandItem) {
    if (item.kind === "skill") {
      addSelectedSkill(item.skill);
      return;
    }

    switch (item.command) {
      case "plan":
        handlePlanModeChange(true);
        setStatusMessage("Plan mode enabled.");
        return;
      case "goal":
        handleGoalModeChange(true);
        setStatusMessage("Goal mode enabled.");
        return;
      case "compact":
        void compactActiveThread();
        return;
      case "status":
        setStatusMessage(
          buildComposerStatusMessage({
            workspace: selectedWorkspaceRef.current,
            branch: selectedBranch,
            account: selectedAccount,
            model: selectedModel,
            reasoningEffort: selectedReasoningEffort,
            tokenEstimate: estimateTokens(promptRef.current),
            contextFiles,
            selectedSkills,
            gitSummary: selectedGitSummary,
            runView,
          }),
        );
        return;
      case "review":
        replaceComposerPrompt((current) =>
          applyPromptDraft(
            current,
            buildCodeReviewDraft(
              selectedWorkspaceRef.current,
              selectedBranch,
              selectedGitSummary,
            ),
          ),
        );
        preflightRef.current = null;
        setStatusMessage("Prepared a code review prompt.");
        return;
      case "mcp":
        void showMcpStatus();
        return;
      case "init":
        replaceComposerPrompt((current) =>
          applyPromptDraft(current, buildInitInstructionsDraft(selectedWorkspaceRef.current)),
        );
        preflightRef.current = null;
        setStatusMessage("Prepared an AGENTS.md setup prompt.");
        return;
      case "reasoning":
        return;
    }
  }

  async function compactActiveThread() {
    const accountId = selectedAccountIdRef.current;
    if (!accountId || !runView.threadId) {
      setStatusMessage("Start a Codex thread before compacting context.");
      return;
    }

    try {
      await ensureCodexConnected(accountId);
      await codexRpc(accountId, "thread/compact", { threadId: runView.threadId });
      setStatusMessage("Requested context compaction for the active thread.");
    } catch (error) {
      setStatusMessage(
        `Compact unavailable: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async function showMcpStatus() {
    const accountId = selectedAccountIdRef.current;
    if (!accountId) {
      setStatusMessage("Sign in to a Codex account to inspect MCP status.");
      return;
    }

    try {
      await ensureCodexConnected(accountId);
      const response = await codexRpc<unknown>(accountId, "mcp/list", {});
      setStatusMessage(formatMcpStatus(response));
    } catch (error) {
      setStatusMessage(
        `MCP status unavailable: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async function ensureCodexConnected(accountId: number) {
    if (connectedAccountIdsRef.current.has(accountId)) {
      return;
    }

    const connection = await connectCodex(accountId);
    setConnectedAccountIds((current) => {
      const next = new Set(current).add(accountId);
      connectedAccountIdsRef.current = next;
      return next;
    });
    setStatusMessage(
      connection.alreadyConnected
        ? "Codex app-server already connected."
        : `Codex app-server connected${connection.pid ? ` as ${connection.pid}` : ""}.`,
    );
  }

  async function ensureCodexProfileConnected(
    profileKey: CodexProfileKey,
    accountId: number,
  ) {
    if (profileKey !== DEFAULT_CODEX_PROFILE_KEY) {
      await ensureCodexConnected(accountId);
      await probeCollaborationModes(profileKey, accountId);
      return;
    }

    if (!connectedAccountIdsRef.current.has(0)) {
      const connection = await connectDefaultCodexProfile();
      setConnectedAccountIds((current) => {
        const next = new Set(current).add(0);
        connectedAccountIdsRef.current = next;
        return next;
      });
      setStatusMessage(
        connection.alreadyConnected
          ? "Default Codex profile already connected."
          : `Default Codex profile connected${
              connection.pid ? ` as ${connection.pid}` : ""
            }.`,
      );
    }
    await probeCollaborationModes(profileKey, accountId);
  }

  function probeCollaborationModes(
    profileKey: CodexProfileKey,
    accountId: number,
  ) {
    const cached = collaborationModeMasksRef.current.get(profileKey);
    if (cached) return cached;
    const request = codexRpcForProfile<{ data?: CollaborationModeMask[] }>(
      profileKey,
      accountId,
      "collaborationMode/list",
      {},
    )
      .then((response) =>
        (Array.isArray(response.data) ? response.data : []).filter(
          isCollaborationModeMask,
        ),
      )
      .catch(() => {
        collaborationModeMasksRef.current.delete(profileKey);
        return [];
      });
    collaborationModeMasksRef.current.set(profileKey, request);
    return request;
  }

  async function collaborationModesForRun(
    profileKey: CodexProfileKey,
    accountId: number,
    model: string | null,
    effort: string | null,
    requirePlan: boolean,
  ) {
    const masks = await probeCollaborationModes(profileKey, accountId);
    if (masks.length > 0) {
      try {
        return selectNativePlanModes(masks, model, effort);
      } catch (error) {
        if (requirePlan) throw error;
      }
    }
    if (requirePlan) {
      throw new Error(
        "Plan mode requires a Codex app-server with native collaboration-mode support.",
      );
    }
    const defaultMode: CollaborationMode = {
      mode: "default",
      settings: {
        model: model ?? "",
        reasoning_effort: effort,
        developer_instructions: null,
      },
    };
    return { plan: null, default: defaultMode };
  }

  function codexRpcForProfile<T>(
    profileKey: CodexProfileKey,
    accountId: number,
    method: string,
    params: unknown = {},
  ) {
    return profileKey === DEFAULT_CODEX_PROFILE_KEY
      ? codexDefaultProfileRpc<T>(method, params)
      : codexRpc<T>(accountId, method, params);
  }

  function readCodexFileForProfile(
    profileKey: CodexProfileKey,
    accountId: number,
    path: string,
  ) {
    return profileKey === DEFAULT_CODEX_PROFILE_KEY
      ? readDefaultCodexFile(path)
      : readCodexFile(accountId, path);
  }

  function setThreadGoalForProfile(
    profileKey: CodexProfileKey,
    accountId: number,
    threadId: string,
    objective: string,
  ): Promise<ThreadGoalSetResponse> {
    return profileKey === DEFAULT_CODEX_PROFILE_KEY
      ? codexDefaultProfileRpc<ThreadGoalSetResponse>("thread/goal/set", {
          threadId,
          objective,
          status: "active",
          tokenBudget: null,
        })
      : setThreadGoal(accountId, threadId, objective);
  }

  function updateThreadGoalStatusForProfile(
    profileKey: CodexProfileKey,
    accountId: number,
    threadId: string,
    status: Extract<ThreadGoalStatus, "active" | "paused">,
  ) {
    return codexRpcForProfile<ThreadGoalSetResponse>(
      profileKey,
      accountId,
      "thread/goal/set",
      { threadId, status },
    );
  }

  function clearThreadGoalForProfile(
    profileKey: CodexProfileKey,
    accountId: number,
    threadId: string,
  ) {
    return codexRpcForProfile<{ cleared: boolean }>(
      profileKey,
      accountId,
      "thread/goal/clear",
      { threadId },
    );
  }

  async function interruptTurnForProfile(
    profileKey: CodexProfileKey,
    accountId: number,
    threadId: string,
    turnId: string,
  ) {
    let activeTurnId = turnId;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        await codexRpcForProfile(profileKey, accountId, "turn/interrupt", {
          threadId,
          turnId: activeTurnId,
        });
        return activeTurnId;
      } catch (error) {
        const expectedTurnId = readExpectedActiveTurnId(error);
        if (
          attempt === 0 &&
          expectedTurnId &&
          expectedTurnId !== activeTurnId
        ) {
          activeTurnId = expectedTurnId;
          continue;
        }
        if (isCodexTurnAlreadyTerminalError(error)) {
          return null;
        }
        throw error;
      }
    }

    return null;
  }

  async function selectCodexAccount(accountId: number) {
    if (runIsActive) {
      return false;
    }

    const profile = codexAccountsRef.current.find(
      (account) => account.id === accountId,
    );
    if (!profile) {
      return false;
    }

    setSelectedAccountId(accountId);
    selectedAccountIdRef.current = accountId;
    setAccountMenuOpen(false);
    setCodexAccount(
      profile.status === "signed_in" && profile.plan_type
        ? {
            type: "chatgpt",
            email: profile.email,
            planType: profile.plan_type,
          }
        : null,
    );
    setRequiresOpenaiAuth(true);
    setLoginError(profile.last_error);

    try {
      await ensureCodexConnected(accountId);
      await refreshAccountState(accountId, true);
      await refreshCodexModels(accountId);
      await updateCodexAccount(accountId, { touchLastUsed: true });
      return true;
    } catch (error) {
      setStatusMessage(
        `Could not select ${profile.label}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return false;
    }
  }

  function setPendingAccountHandoff(handoff: PendingAccountHandoff) {
    const next = {
      ...pendingAccountHandoffsRef.current,
      [handoff.chatId]: handoff,
    };
    pendingAccountHandoffsRef.current = next;
    setPendingAccountHandoffs(next);
  }

  function clearPendingAccountHandoff(chatId: number) {
    if (!pendingAccountHandoffsRef.current[chatId]) return;
    const next = { ...pendingAccountHandoffsRef.current };
    delete next[chatId];
    pendingAccountHandoffsRef.current = next;
    setPendingAccountHandoffs(next);
  }

  function requestCodexAccountSelection(accountId: number) {
    const account = codexAccountsRef.current.find(
      (candidate) => candidate.id === accountId && candidate.status === "signed_in",
    );
    if (!account) {
      setStatusMessage("Sign in to that Codex account before selecting it.");
      return;
    }

    const workspace = selectedWorkspaceRef.current;
    const session = workspace
      ? workspaceChatSessionsRef.current[workspace.id] ?? null
      : null;
    if (!workspace || !session) {
      void selectCodexAccount(accountId);
      return;
    }
    if (selectedRunIsActiveNow()) {
      setStatusMessage("Wait for the active turn to finish before switching accounts.");
      return;
    }

    const targetProfileKey = `account:${accountId}` as CodexProfileKey;
    if (session.profileKey === targetProfileKey) {
      clearPendingAccountHandoff(session.chatId);
      void selectCodexAccount(accountId);
      return;
    }

    const currentAccountId = accountIdFromProfileKey(session.profileKey);
    const currentAccount =
      currentAccountId === null
        ? null
        : codexAccountsRef.current.find(
            (candidate) => candidate.id === currentAccountId,
          ) ?? null;
    setAccountHandoffCandidate({
      workspaceId: workspace.id,
      chatId: session.chatId,
      fromProfileKey: session.profileKey,
      fromThreadId: session.threadId,
      targetAccountId: accountId,
      targetProfileKey,
      fromLabel:
        session.profileKey === DEFAULT_CODEX_PROFILE_KEY
          ? "Codex default profile"
          : currentAccount?.label ?? "Current Codex account",
      targetLabel: account.label,
      status: "idle",
      error: null,
    });
  }

  async function confirmAccountHandoff() {
    const candidate = accountHandoffCandidate;
    const workspace = selectedWorkspaceRef.current;
    const session = workspace
      ? workspaceChatSessionsRef.current[workspace.id] ?? null
      : null;
    if (
      !candidate ||
      !workspace ||
      workspace.id !== candidate.workspaceId ||
      !session ||
      session.chatId !== candidate.chatId ||
      session.profileKey !== candidate.fromProfileKey ||
      session.threadId !== candidate.fromThreadId ||
      selectedRunIsActiveNow()
    ) {
      setAccountHandoffCandidate(null);
      setStatusMessage("The chat changed before the account handoff could be confirmed.");
      return;
    }

    setAccountHandoffCandidate({ ...candidate, status: "selecting", error: null });
    try {
      await ensureCodexProfileConnected(
        candidate.targetProfileKey,
        candidate.targetAccountId,
      );
      const authState = await refreshAccountState(
        candidate.targetAccountId,
        true,
      );
      if (shouldBlockRunForAuth(authState.requiresOpenaiAuth, authState.account)) {
        throw new Error("Sign in to the selected Codex account first.");
      }

      if (!useOss && !modelLoadError) {
        const currentModel =
          models.find((model) => model.id === selectedModelId) ??
          models[0] ??
          null;
        if (!currentModel) {
          throw new Error("Choose an available model before switching accounts.");
        }
        const targetModels = await listCodexModels(candidate.targetAccountId);
        const targetModel =
          targetModels.find(
            (model) =>
              model.id === currentModel.id ||
              model.model === currentModel.model,
          ) ?? null;
        if (!targetModel) {
          throw new Error(
            `${currentModel.displayName || currentModel.model} is unavailable for the selected account.`,
          );
        }
        if (
          selectedReasoningEffort &&
          !targetModel.supportedReasoningEfforts.some(
            (option) =>
              option.reasoningEffort === selectedReasoningEffort,
          )
        ) {
          throw new Error(
            `${formatReasoningEffort(
              selectedReasoningEffort,
            )} reasoning is unavailable for the selected account.`,
          );
        }
      }
      await updateCodexAccount(candidate.targetAccountId, {
        touchLastUsed: true,
      });
    } catch (error) {
      setAccountHandoffCandidate((current) =>
        current?.chatId === candidate.chatId
          ? {
              ...current,
              status: "idle",
              error:
                error instanceof Error
                  ? error.message
                  : "Could not prepare the selected Codex account.",
            }
          : current,
      );
      return;
    }

    const latestSession =
      workspaceChatSessionsRef.current[candidate.workspaceId] ?? null;
    if (
      selectedWorkspaceRef.current?.id !== candidate.workspaceId ||
      !latestSession ||
      latestSession.chatId !== candidate.chatId ||
      latestSession.profileKey !== candidate.fromProfileKey ||
      latestSession.threadId !== candidate.fromThreadId ||
      selectedRunIsActiveNow()
    ) {
      setAccountHandoffCandidate(null);
      setStatusMessage(
        "The chat changed before the account handoff could be confirmed.",
      );
      return;
    }

    setPendingAccountHandoff({
      workspaceId: candidate.workspaceId,
      chatId: candidate.chatId,
      fromProfileKey: candidate.fromProfileKey,
      fromThreadId: candidate.fromThreadId,
      targetAccountId: candidate.targetAccountId,
      targetProfileKey: candidate.targetProfileKey,
    });
    setAccountHandoffCandidate(null);
    setStatusMessage(
      `The next turn will continue with ${candidate.targetLabel} in a fresh Codex thread.`,
    );
  }

  function notifyExternalLoginAction(accountId: number, loginId: string) {
    const account = codexAccountsRef.current.find(
      (candidate) => candidate.id === accountId,
    );
    const eventKey = externalActionNotificationEventKey(accountId, loginId);
    void deliverAgentNotification({
      kind: "external-action",
      target: {
        eventKey,
        kind: "external-action",
        workspaceId: null,
        chatId: null,
        runId: null,
        entryClientId: null,
        requestId: loginId,
        planItemId: null,
        accountId,
        profileKey: `account:${accountId}`,
        threadId: null,
        turnId: null,
      },
      accountLabel: account?.label ?? account?.email,
    });
  }

  function dismissExternalLoginNotification(
    accountId: number,
    loginId: string | null,
  ) {
    if (!loginId) return;
    void removeAgentNotification(
      externalActionNotificationEventKey(accountId, loginId),
    ).catch(() => undefined);
  }

  async function handleLogin() {
    if (loginState === "starting" || loginState === "waiting") {
      setStatusMessage("A Codex sign-in is already in progress.");
      return;
    }

    setLoginState("starting");
    setLoginError(null);
    setStatusMessage("Starting Codex sign-in...");

    let loginAccountId: number | null = null;

    try {
      const accountId = selectedAccountIdRef.current;
      let profile = codexAccountsRef.current.find(
        (account) => account.id === accountId,
      );

      if (!profile || profile.status === "signed_in") {
        profile = await createCodexAccount();
        setCodexAccounts((current) => {
          const next = [profile!, ...current];
          codexAccountsRef.current = next;
          return next;
        });
      }
      loginAccountId = profile.id;

      setSelectedAccountId(loginAccountId);
      selectedAccountIdRef.current = loginAccountId;
      setPendingLoginAccountId(loginAccountId);
      pendingLoginAccountIdRef.current = loginAccountId;

      await ensureCodexConnected(loginAccountId);
      const response = await startCodexLogin(loginAccountId);

      if (response.type === "chatgpt") {
        setPendingLoginId(response.loginId);
        pendingLoginIdRef.current = response.loginId;
        setLoginState("waiting");
        await openUrl(response.authUrl);
        notifyExternalLoginAction(loginAccountId, response.loginId);
      } else if (response.type === "chatgptDeviceCode") {
        setPendingLoginId(response.loginId);
        pendingLoginIdRef.current = response.loginId;
        setLoginUserCode(response.userCode);
        setLoginState("waiting");
        await openUrl(response.verificationUrl);
        notifyExternalLoginAction(loginAccountId, response.loginId);
      } else {
        resetLoginFlow("failed");
        setLoginError(formatLoginStartStatus(response));
      }

      setStatusMessage(formatLoginStartStatus(response));
    } catch (error) {
      if (loginAccountId !== null) {
        dismissExternalLoginNotification(
          loginAccountId,
          pendingLoginIdRef.current,
        );
      }
      resetLoginFlow("failed");
      const message = error instanceof Error ? error.message : String(error);
      if (loginAccountId !== null) {
        await updateCodexAccount(loginAccountId, {
          status: "error",
          lastError: message,
        }).catch(() => undefined);
      }
      setLoginError(message);
      setStatusMessage(`Sign-in failed: ${message}`);
    }
  }

  async function handleAddAccount() {
    if (runIsActive || loginState === "starting" || loginState === "waiting") {
      return;
    }
    setLoginState("starting");
    setLoginError(null);
    setStatusMessage("Creating Codex account...");

    try {
      const account = await createCodexAccount();
      setCodexAccounts((current) => {
        const next = [account, ...current];
        codexAccountsRef.current = next;
        return next;
      });
      setSelectedAccountId(account.id);
      selectedAccountIdRef.current = account.id;
      setCodexAccount(null);
      setAccountMenuOpen(false);
      await handleLoginForAccount(account);
    } catch (error) {
      resetLoginFlow("failed");
      const message = error instanceof Error ? error.message : String(error);
      setLoginError(message);
      setStatusMessage(`Could not add Codex account: ${message}`);
    }
  }

  async function handleLoginForAccount(account: CodexAccountProfile) {
    setPendingLoginAccountId(account.id);
    pendingLoginAccountIdRef.current = account.id;
    setLoginState("starting");
    setLoginError(null);

    try {
      await ensureCodexConnected(account.id);
      const response = await startCodexLogin(account.id);
      if (response.type === "chatgpt") {
        setPendingLoginId(response.loginId);
        pendingLoginIdRef.current = response.loginId;
        setLoginState("waiting");
        await openUrl(response.authUrl);
        notifyExternalLoginAction(account.id, response.loginId);
      } else if (response.type === "chatgptDeviceCode") {
        setPendingLoginId(response.loginId);
        pendingLoginIdRef.current = response.loginId;
        setLoginUserCode(response.userCode);
        setLoginState("waiting");
        await openUrl(response.verificationUrl);
        notifyExternalLoginAction(account.id, response.loginId);
      } else {
        resetLoginFlow("failed");
        setLoginError(formatLoginStartStatus(response));
      }
      setStatusMessage(formatLoginStartStatus(response));
    } catch (error) {
      dismissExternalLoginNotification(account.id, pendingLoginIdRef.current);
      resetLoginFlow("failed");
      const message = error instanceof Error ? error.message : String(error);
      await updateCodexAccount(account.id, {
        status: "error",
        lastError: message,
      });
      setLoginError(message);
      setStatusMessage(`Sign-in failed: ${message}`);
    }
  }

  async function handleCancelLogin() {
    if (!pendingLoginId || !pendingLoginAccountId) {
      return;
    }

    try {
      await cancelCodexLogin(pendingLoginAccountId, pendingLoginId);
      dismissExternalLoginNotification(pendingLoginAccountId, pendingLoginId);
      const profile = codexAccountsRef.current.find(
        (account) => account.id === pendingLoginAccountId,
      );
      if (profile?.status === "pending") {
        await deleteCodexProfile(pendingLoginAccountId);
        await softDeleteCodexAccount(pendingLoginAccountId);
        setCodexAccounts((current) => {
          const next = current.filter(
            (account) => account.id !== pendingLoginAccountId,
          );
          codexAccountsRef.current = next;
          return next;
        });
        const fallback = codexAccountsRef.current.find(
          (account) => account.status === "signed_in",
        );
        setSelectedAccountId(fallback?.id ?? null);
        selectedAccountIdRef.current = fallback?.id ?? null;
        setCodexAccount(
          fallback?.plan_type
            ? {
                type: "chatgpt",
                email: fallback.email,
                planType: fallback.plan_type,
              }
            : null,
        );
        if (fallback) {
          await refreshCodexModels(fallback.id);
        }
      }
      resetLoginFlow();
      setLoginError(null);
      setAccountMenuOpen(false);
      setStatusMessage("Codex sign-in cancelled.");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setLoginState("failed");
      setLoginError(message);
      setStatusMessage(`Could not cancel Codex sign-in: ${message}`);
    }
  }

  async function handleRefreshAccount() {
    const accountId = selectedAccountIdRef.current;
    if (!accountId) {
      return;
    }
    try {
      await ensureCodexConnected(accountId);
      await refreshAccountState(accountId, true);
      await refreshCodexModels(accountId);
      setStatusMessage("Codex account refreshed.");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setLoginError(message);
      setStatusMessage(`Could not refresh Codex account: ${message}`);
    }
  }

  async function handleLogout() {
    const accountId = selectedAccountIdRef.current;
    if (!accountId || runIsActive) {
      return;
    }
    try {
      await ensureCodexConnected(accountId);
      await logoutCodexAccount(accountId);
      await updateCodexAccount(accountId, {
        status: "signed_out",
        email: null,
        planType: null,
        lastError: null,
      });
      setCodexAccounts((current) => {
        const next = current.map((account) =>
          account.id === accountId
            ? {
                ...account,
                status: "signed_out" as const,
                email: null,
                plan_type: null,
                last_error: null,
              }
            : account,
        );
        codexAccountsRef.current = next;
        return next;
      });
      const fallback = codexAccountsRef.current.find(
        (account) => account.id !== accountId && account.status === "signed_in",
      );
      resetLoginFlow();
      setAccountMenuOpen(false);
      setSelectedAccountId(fallback?.id ?? accountId);
      selectedAccountIdRef.current = fallback?.id ?? accountId;
      if (fallback?.plan_type) {
        setCodexAccount({
          type: "chatgpt",
          email: fallback.email,
          planType: fallback.plan_type,
        });
        await refreshCodexModels(fallback.id);
      } else {
        setCodexAccount(null);
        setModels([]);
      }
      setStatusMessage("Signed out of Codex.");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setLoginState("failed");
      setLoginError(message);
      setStatusMessage(`Could not sign out of Codex: ${message}`);
    }
  }

  async function handleRemoveAccount(accountId: number) {
    if (runIsActive) {
      return;
    }
    await deleteCodexProfile(accountId);
    await softDeleteCodexAccount(accountId);
    setCodexAccounts((current) => {
      const next = current.filter((account) => account.id !== accountId);
      codexAccountsRef.current = next;
      return next;
    });
    setWorkspaces((current) =>
      current.map((workspace) =>
        workspace.default_account_id === accountId
          ? { ...workspace, default_account_id: null }
          : workspace,
      ),
    );
    if (selectedAccountIdRef.current === accountId) {
      const fallback = codexAccountsRef.current.find(
        (account) => account.status === "signed_in",
      );
      setSelectedAccountId(fallback?.id ?? null);
      selectedAccountIdRef.current = fallback?.id ?? null;
      setCodexAccount(
        fallback?.plan_type
          ? {
              type: "chatgpt",
              email: fallback.email,
              planType: fallback.plan_type,
            }
          : null,
      );
    }
    setAccountMenuOpen(false);
    setStatusMessage("Codex account removed from Orchestrator.");
  }

  async function handleRenameAccount(accountId: number, label: string) {
    const trimmed = label.trim();
    if (!trimmed) {
      return;
    }
    await renameCodexAccount(accountId, trimmed);
    setCodexAccounts((current) => {
      const next = current.map((account) =>
        account.id === accountId ? { ...account, label: trimmed } : account,
      );
      codexAccountsRef.current = next;
      return next;
    });
  }

  function openCommitDialog() {
    if (
      !selectedWorkspace ||
      gitOperationInFlightWorkspaceIdsRef.current.has(selectedWorkspace.id)
    ) {
      return;
    }
    setGitOperationsByWorkspace((current) => {
      if (!current[selectedWorkspace.id]) return current;
      const next = { ...current };
      delete next[selectedWorkspace.id];
      return next;
    });
    clearRunningGitOperation(selectedWorkspace.id);
    setCommitIntentContext(suggestedCommitIntentContext);
    setCommitMessage("");
    setCommitDialogMessage("");
    setCommitDialogError(false);
    setIncludeUnstagedChanges(true);
    setCommitDialogOpen(true);
  }

  function handleHeaderGitAction() {
    if (
      !selectedWorkspace ||
      selectedGitActionStatus !== "idle" ||
      gitActionInFlightRef.current
    ) {
      return;
    }

    if (commitDialogOpen) {
      setCommitDialogOpen(false);
    } else {
      openCommitDialog();
    }
  }

  function updateWorkspaceGitOperation(
    workspaceId: number,
    operationId: number,
    update:
      | Partial<WorkspaceGitOperationState>
      | ((
          current: WorkspaceGitOperationState,
        ) => WorkspaceGitOperationState),
  ) {
    setGitOperationsByWorkspace((current) => {
      const operation = current[workspaceId];
      if (!operation || operation.id !== operationId) {
        return current;
      }
      const nextOperation =
        typeof update === "function"
          ? update(operation)
          : { ...operation, ...update };
      return {
        ...current,
        [workspaceId]: nextOperation,
      };
    });
  }

  async function refreshWorkspaceAfterGitOperation(workspace: Workspace) {
    await refreshWorkspaceGitStatus(workspace, {
      showLoading: false,
      force: true,
    });
  }

  async function executeWorkspaceGitOperation(
    workspace: Workspace,
    request: WorkspaceGitOperationRequest,
    operationId: number,
  ) {
    let phase: GitOperationPhase =
      request.kind === "push" ? "pushing" : "committing";
    let commitCompleted = false;

    try {
      if (request.kind !== "push") {
        await commitWorkspaceChanges(
          workspace.path,
          request.commitMessage ?? "",
          request.includeUnstaged,
        );
        commitCompleted = true;
        if (request.commitMessage && request.changeKey) {
          lastCommitSubjectsRef.current.set(workspace.id, {
            subject: cleanGeneratedCommitSubject(request.commitMessage),
            changeKey: request.changeKey,
          });
        }
      }

      if (request.kind !== "commit") {
        phase = "pushing";
        persistRunningGitOperation(request, phase);
        const runningCopy = gitOperationRunningCopy(request.kind, phase);
        updateWorkspaceGitOperation(workspace.id, operationId, (current) => ({
          ...current,
          phase,
          ...runningCopy,
        }));
        await pushWorkspaceBranch(workspace.path);
      }

      await refreshWorkspaceAfterGitOperation(workspace);
      const successCopy = gitOperationSuccessCopy(request.kind);
      updateWorkspaceGitOperation(workspace.id, operationId, {
        status: "succeeded",
        retryRequest: null,
        ...successCopy,
      });
      if (selectedWorkspaceRef.current?.id === workspace.id) {
        setStatusMessage(successCopy.detail);
      }
    } catch (error) {
      await refreshWorkspaceAfterGitOperation(workspace);
      const failureCopy = gitOperationFailureCopy(
        phase,
        error,
        commitCompleted,
      );
      const retryRequest =
        commitCompleted && phase === "pushing"
          ? {
              ...request,
              kind: "push" as const,
              commitMessage: null,
              changeKey: null,
            }
          : request;
      updateWorkspaceGitOperation(workspace.id, operationId, {
        status: "failed",
        retryRequest,
        ...failureCopy,
      });
      if (selectedWorkspaceRef.current?.id === workspace.id) {
        setStatusMessage(failureCopy.detail);
      }
    } finally {
      gitOperationInFlightWorkspaceIdsRef.current.delete(workspace.id);
      clearRunningGitOperation(workspace.id);
    }
  }

  function registerWorkspaceGitOperation(
    request: WorkspaceGitOperationRequest,
    phase: GitOperationPhase,
  ) {
    if (
      gitOperationInFlightWorkspaceIdsRef.current.has(request.workspaceId)
    ) {
      return null;
    }
    const workspace =
      workspacesRef.current.find(
        (candidate) =>
          candidate.id === request.workspaceId &&
          candidate.path === request.workspacePath,
      ) ?? null;
    if (!workspace) {
      return null;
    }

    gitOperationInFlightWorkspaceIdsRef.current.add(workspace.id);
    const operationId = ++gitOperationSequenceRef.current;
    const runningCopy = gitOperationRunningCopy(request.kind, phase);
    const operation: WorkspaceGitOperationState = {
      id: operationId,
      request,
      phase,
      status: "running",
      retryRequest: null,
      ...runningCopy,
    };

    persistRunningGitOperation(request, phase);
    flushSync(() => {
      setGitOperationsByWorkspace((current) => ({
        ...current,
        [workspace.id]: operation,
      }));
      setCommitDialogOpen(false);
      setCommitIntentContext(null);
      setCommitMessage("");
      setCommitDialogMessage("");
      setCommitDialogError(false);
    });
    return { operationId, workspace };
  }

  function startWorkspaceGitOperation(request: WorkspaceGitOperationRequest) {
    const phase: GitOperationPhase =
      request.kind === "push" ? "pushing" : "committing";
    const registered = registerWorkspaceGitOperation(request, phase);
    if (!registered) return false;
    void executeWorkspaceGitOperation(
      registered.workspace,
      request,
      registered.operationId,
    );
    return true;
  }

  function retryWorkspaceGitOperation(request: WorkspaceGitOperationRequest) {
    if (!startWorkspaceGitOperation(request)) {
      setStatusMessage(
        gitOperationInFlightWorkspaceIdsRef.current.has(request.workspaceId)
          ? "A Git operation is already running for this workspace."
          : "This workspace is no longer available.",
      );
    }
  }

  function handlePushOnly() {
    const workspace = selectedWorkspace;
    if (
      !workspace ||
      !headerGitAction.canPush ||
      selectedGitActionStatus !== "idle" ||
      gitActionInFlightRef.current
    ) {
      return;
    }

    gitActionInFlightRef.current = true;
    try {
      startWorkspaceGitOperation({
        workspaceId: workspace.id,
        workspacePath: workspace.path,
        workspaceLabel: workspace.label,
        kind: "push",
        commitMessage: null,
        includeUnstaged: true,
        changeKey: null,
      });
    } finally {
      gitActionInFlightRef.current = false;
    }
  }

  async function generateCommitMessageForOperation(
    workspace: Workspace,
    snapshot: CommitMessageGenerationSnapshot,
  ) {
    const result = await generateWorkspaceCommitMessage({
      workspacePath: workspace.path,
      accountId: snapshot.accountId,
      includeUnstaged: snapshot.includeUnstaged,
      model: snapshot.model,
      intentContext: snapshot.intentContext,
    });
    const rejection = generatedCommitSubjectRejectionReason(
      result.message,
      snapshot.files,
    );
    if (rejection) {
      throw new Error(rejection);
    }
    const generated = cleanGeneratedCommitSubject(result.message);
    const previous = lastCommitSubjectsRef.current.get(workspace.id);
    if (
      previous &&
      previous.changeKey !== snapshot.changeKey &&
      previous.subject.toLowerCase() === generated.toLowerCase()
    ) {
      throw new Error("Codex repeated a subject for different changes.");
    }
    return generated;
  }

  async function executeWorkspaceCommitGeneration(
    workspace: Workspace,
    request: WorkspaceGitOperationRequest,
    snapshot: CommitMessageGenerationSnapshot,
    operationId: number,
  ) {
    let message: string;
    try {
      message = await generateCommitMessageForOperation(
        workspace,
        snapshot,
      );
    } catch {
      updateWorkspaceGitOperation(workspace.id, operationId, {
        status: "failed",
        retryRequest: null,
        title: "Commit message unavailable",
        detail: COMMIT_MESSAGE_GENERATION_ERROR,
      });
      if (selectedWorkspaceRef.current?.id === workspace.id) {
        setStatusMessage(COMMIT_MESSAGE_GENERATION_ERROR);
      }
      gitOperationInFlightWorkspaceIdsRef.current.delete(workspace.id);
      clearRunningGitOperation(workspace.id);
      return;
    }

    const generatedRequest: WorkspaceGitOperationRequest = {
      ...request,
      commitMessage: message,
    };
    const runningCopy = gitOperationRunningCopy(
      generatedRequest.kind,
      "committing",
    );
    persistRunningGitOperation(generatedRequest, "committing");
    updateWorkspaceGitOperation(workspace.id, operationId, (current) => ({
      ...current,
      request: generatedRequest,
      phase: "committing",
      ...runningCopy,
    }));
    await executeWorkspaceGitOperation(
      workspace,
      generatedRequest,
      operationId,
    );
  }

  function startWorkspaceCommitGeneration(
    request: WorkspaceGitOperationRequest,
    snapshot: CommitMessageGenerationSnapshot,
  ) {
    const registered = registerWorkspaceGitOperation(request, "generating");
    if (!registered) return false;
    void executeWorkspaceCommitGeneration(
      registered.workspace,
      request,
      snapshot,
      registered.operationId,
    );
    return true;
  }

  function handleCommitAll(options: { pushAfter?: boolean } = {}) {
    const workspace = selectedWorkspace;
    if (
      !workspace ||
      !canCommitFromDialog ||
      selectedGitActionStatus !== "idle" ||
      gitActionInFlightRef.current
    ) {
      return;
    }

    gitActionInFlightRef.current = true;
    try {
      const authoredMessage = commitMessage.trim();
      const request: WorkspaceGitOperationRequest = {
        workspaceId: workspace.id,
        workspacePath: workspace.path,
        workspaceLabel: workspace.label,
        kind: options.pushAfter ? "commit-and-push" : "commit",
        commitMessage: authoredMessage || null,
        includeUnstaged: includeUnstagedChanges,
        changeKey: commitMessageChangeKey,
      };
      if (authoredMessage) {
        startWorkspaceGitOperation(request);
      } else {
        startWorkspaceCommitGeneration(request, {
          accountId: selectedAccountId,
          includeUnstaged: includeUnstagedChanges,
          model: selectedModel?.model ?? selectedModel?.id ?? null,
          intentContext: commitIntentContext,
          files: [...commitMessageFiles],
          changeKey: commitMessageChangeKey,
        });
      }
    } finally {
      gitActionInFlightRef.current = false;
    }
  }

  function beginOptimisticRun(snapshot: RunSetupSnapshot) {
    const selectedSession = selectedWorkspaceRef.current
      ? workspaceChatSessionsRef.current[selectedWorkspaceRef.current.id] ?? null
      : null;
    const visibleTarget =
      selectedWorkspaceRef.current?.id === snapshot.workspace.id &&
      (snapshot.chatId === null ||
        selectedSession?.chatId === snapshot.chatId);
    if (visibleTarget) {
      historyChatLoadIdRef.current += 1;
      cancelActiveExternalTranscriptSync();
      cancelActiveHistoricalTranscriptPreparation();
      pendingTranscriptCommitRef.current = null;
      setHistoryChatLoadState(null);
      setHistoryOpenRequest(null);
      historicalTranscriptRef.current = null;
      setHistoricalTranscript(null);
    }
    const clientId = snapshot.queueItemId ?? createTaskChatClientId();
    const intent: RunIntent =
      snapshot.intent ?? (snapshot.mode === "plan" ? "plan" : "normal");
    const clientUserMessageId =
      snapshot.clientUserMessageId ?? createStableClientMessageId();
    snapshot.intent = intent;
    snapshot.clientUserMessageId = clientUserMessageId;
    const submittedAt = new Date().toISOString();
    const resumesExistingThread = snapshot.threadStrategy.kind === "resume";
    const previousThreadUsage =
      snapshot.profileKey !== DEFAULT_CODEX_PROFILE_KEY &&
      snapshot.threadId !== null &&
      resumesExistingThread
        ? [...selectedWorkspaceChatEntries]
            .reverse()
            .find(
              (entry) =>
                entry.chatId === snapshot.chatId &&
                entry.runView.threadId === snapshot.threadId &&
                entry.runView.tokenUsage !== null,
            )?.runView.tokenUsage ?? null
        : null;
    const startsFreshThread = !resumesExistingThread;
    const initialRunView = {
      ...emptyRunView,
      status: "connecting" as const,
      startedAt: submittedAt,
      tokenUsageStartTotal: startsFreshThread
        ? 0
        : previousThreadUsage?.totalTokens ?? null,
      tokenUsageStartCachedInput: startsFreshThread
        ? 0
        : previousThreadUsage?.cachedInputTokens ?? null,
      nativePlan: {
        ...emptyRunView.nativePlan,
        intent,
        mode:
          intent === "plan" || intent === "plan-revision" ? "plan" as const : "default" as const,
        phase:
          intent === "plan" || intent === "plan-revision"
            ? "activating" as const
            : intent === "plan-implementation"
              ? "implementing" as const
              : "inactive" as const,
      },
    };
    const runControl: ActiveRunControl = {
      accountId: snapshot.accountId,
      profileKey: snapshot.profileKey,
      workspaceId: snapshot.workspace.id,
      clientId,
      promptFallback: snapshot.promptFallback,
      imageContextFilesFallback: snapshot.contextFiles
        .filter(isImageContextFile)
        .map((file) => ({ ...file })),
      chatId: snapshot.chatId,
      stopped: false,
      taskId: null,
      runId: null,
      setupStarted: false,
      cancelScheduledSetup: null,
      interactionMode: interactionModeForSnapshot(snapshot),
      acceptsThreadContinuation: snapshot.goalMode,
      goal: null,
      goalActionPending: null,
      goalActionError: null,
      goalTurnCompleted: false,
      threadId: snapshot.threadId,
      turnId: null,
      intent,
      clientUserMessageId,
      executionSettings: snapshot.executionSettings,
      entry: null,
      runView: initialRunView,
      eventSequence: 0,
      queueItemId: snapshot.queueItemId ?? null,
      queueAdvanceBlocked: false,
      browserSession: null,
      activePlaywrightToolCalls: new Map(),
      webPreviewDetection: {
        commands: new Map(),
        probes: new Map(),
        nextSequence: 0,
        confirmedSequence: 0,
        disposed: false,
      },
    };
    const nextEntry: TaskChatEntry = {
      clientId,
      workspaceId: snapshot.workspace.id,
      chatId: snapshot.chatId,
      turnIndex: snapshot.turnIndex,
      runId: null,
      taskId: null,
      prompt: snapshot.promptText,
      contextFiles: snapshot.contextFiles,
      executionSettings: {
        settings: snapshot.executionSettings,
        source: "captured",
      },
      submittedAt,
      status: initialRunView.status,
      runView: initialRunView,
      imageAttachmentDelivery:
        snapshot.contextFiles.some(isImageContextFile)
          ? { status: "preparing", error: null }
          : undefined,
    };
    runControl.entry = nextEntry;
    if (visibleTarget) {
      // Queue state is committed before dispatch. Let Virtuoso own the
      // subsequent append so it cannot compete with a second anchor.
      if (!snapshot.fromQueue) {
        taskChatTranscriptRef.current?.stabilizeForSubmission();
      }
      flushSync(() => {
        if (snapshot.replacementClientId) {
          replaceTaskChatEntry(snapshot.replacementClientId, nextEntry);
        } else {
          startTaskChatEntry(nextEntry);
        }
        if (snapshot.restorePromptOnSetupFailure !== false) {
          replaceComposerPrompt("");
          removeSubmittedImagesFromWorkspaceComposer(
            snapshot.workspace.id,
            snapshot.contextFiles,
          );
        }
      });
      if (!snapshot.fromQueue) {
        taskChatTranscriptRef.current?.settleAfterSubmission();
      }
    }
    registerRunControl(runControl);
    if (visibleTarget) {
      rememberCurrentWorkspaceTaskMemory();
    }
    markPerformance("orchestrator:submit:optimistic-committed");

    return runControl;
  }

  async function continueRunSetup(
    runControl: ActiveRunControl,
    snapshot: RunSetupSnapshot,
  ) {
    let chatId = snapshot.chatId;
    const accountHandoff =
      snapshot.threadStrategy.kind === "handoff"
        ? snapshot.threadStrategy.handoff
        : null;
    let threadId =
      snapshot.threadStrategy.kind === "resume" ? snapshot.threadId : null;
    let taskId: number | null = null;
    let runId: number | null = null;
    let accountHandoffActivated = false;
    let pendingChatTitleGeneration: ChatTitleGenerationRequest | null = null;
    const warnings: string[] = [];

    setStatusMessage("Preparing run...");
    preflightRef.current = null;

    try {
      if (!(await ensureRunBranch(snapshot.workspace, snapshot.selectedBranch))) {
        throw new Error(
          snapshot.selectedBranch
            ? `Could not switch to ${snapshot.selectedBranch}.`
            : "Could not prepare the selected branch.",
        );
      }
      ensureRunControlActive(runControl);

      snapshot.contextFiles = await prepareContextImageFiles(
        snapshot.contextFiles,
      );
      snapshot.executionSettings = createRunExecutionSettings({
        ...snapshot.executionSettings,
        contextFiles: snapshot.contextFiles,
      });
      runControl.executionSettings = snapshot.executionSettings;
      runControl.imageContextFilesFallback = snapshot.contextFiles
        .filter(isImageContextFile)
        .map((file) => ({ ...file }));
      updateTaskChatEntry(runControl.clientId, (entry) => ({
        ...entry,
        contextFiles: snapshot.contextFiles.map((file) => ({ ...file })),
        executionSettings: {
          settings: snapshot.executionSettings,
          source: "captured",
        },
        imageAttachmentDelivery: snapshot.contextFiles.some(isImageContextFile)
          ? { status: "preparing", error: null }
          : undefined,
      }));
      if (snapshot.restorePromptOnSetupFailure !== false) {
        removeSubmittedImagesFromWorkspaceComposer(
          snapshot.workspace.id,
          snapshot.contextFiles,
        );
      }
      ensureRunControlActive(runControl);

      const report =
        snapshot.cachedPreflight ??
        (await runPreflight({
          workspace: snapshot.workspace,
          prompt: snapshot.promptText,
          useOss: snapshot.useOss,
          ossProvider: snapshot.ossProvider,
        }));
      ensureRunControlActive(runControl);
      preflightRef.current = report;

      await ensureCodexProfileConnected(snapshot.profileKey, snapshot.accountId);
      ensureRunControlActive(runControl);
      const collaborationModes = await collaborationModesForRun(
        snapshot.profileKey,
        snapshot.accountId,
        snapshot.model,
        snapshot.effort,
        snapshot.mode === "plan",
      );
      const collaborationMode =
        snapshot.mode === "plan"
          ? collaborationModes.plan
          : snapshot.defaultCollaborationMode ?? collaborationModes.default;
      if (!collaborationMode) {
        throw new Error("Codex did not return a native Plan collaboration mode.");
      }
      ensureRunControlActive(runControl);
      if (snapshot.profileKey !== DEFAULT_CODEX_PROFILE_KEY) {
        const authState = await refreshAccountState(snapshot.accountId, true);
        ensureRunControlActive(runControl);
        if (shouldBlockRunForAuth(authState.requiresOpenaiAuth, authState.account)) {
          throw new Error(
            snapshot.loginState === "waiting"
              ? "Finish Codex sign-in before starting a run."
              : "Sign in to Codex before starting a run.",
          );
        }
      }
      if (accountHandoff) {
        snapshot.previousChatContext = await buildAccountHandoffContext(
          snapshot,
          runControl,
        );
        ensureRunControlActive(runControl);
      }

      if (chatId === null) {
        if (snapshot.chatOrigin !== "orchestrator") {
          throw new Error("External Codex chats must be opened from history before continuing.");
        }
        const initialTitlePrompt = restorePromptInlineFileReferencesForComposer(
          snapshot.promptText,
          snapshot.contextFiles.filter((file) => file.source === "search"),
        );
        const fallbackTitle = fallbackChatTitle(initialTitlePrompt);
        const chat = await createChat({
          workspaceId: snapshot.workspace.id,
          accountId: snapshot.accountId,
          title: fallbackTitle,
          status: "starting",
          generateTitle: true,
        });
        chatId = chat.id;
        threadId = chat.codex_thread_id;
        pendingChatTitleGeneration = {
          chatId: chat.id,
          workspacePath: snapshot.workspace.path,
          accountId: snapshot.accountId,
          model: snapshot.model,
          initialPrompt: initialTitlePrompt,
          fallbackTitle,
        };
        runControl.chatId = chat.id;
        promoteRememberedWorkspaceDraft(
          snapshot.workspace.id,
          runControl.clientId,
          {
            chatId: chat.id,
            threadId,
            origin: snapshot.chatOrigin,
            profileKey: snapshot.profileKey,
            externalThreadId: snapshot.externalThreadId,
            nextTurnIndex: snapshot.turnIndex + 1,
          },
        );
        updateTaskChatEntryIds(runControl.clientId, {
          chatId: chat.id,
          turnIndex: snapshot.turnIndex,
        });
      }
      ensureRunControlActive(runControl);

      const task = await createTask({
        workspaceId: snapshot.workspace.id,
        chatId,
        turnIndex: snapshot.turnIndex,
        originalPrompt: snapshot.promptText,
        improvedPrompt: report.improvedPrompt || snapshot.improvedPrompt,
        routeRecommendation: report.routeRecommendation,
        budgetTokens: report.tokenEstimate,
      });
      taskId = task.id;
      runControl.taskId = task.id;
      if (activeRunControlRef.current === runControl) {
        currentTaskId.current = task.id;
      }
      ensureRunControlActive(runControl);

      await savePreflightReport(snapshot.workspace.id, task.id, report);
      ensureRunControlActive(runControl);

      const run = await createRun({
        taskId: task.id,
        workspaceId: snapshot.workspace.id,
        chatId,
        turnIndex: snapshot.turnIndex,
        accountId:
          snapshot.profileKey === DEFAULT_CODEX_PROFILE_KEY
            ? null
            : snapshot.accountId,
        accountLabel: snapshot.account?.label ?? "Codex default profile",
        accountEmail: snapshot.account?.email ?? null,
        status: "starting",
        sandbox: snapshot.access.sandbox,
        approvalPolicy: snapshot.access.approvalPolicy,
        model: snapshot.model,
        modelProvider: snapshot.useOss ? "oss" : null,
        collaborationMode: collaborationMode.mode,
        runIntent: runControl.intent,
        clientUserMessageId: runControl.clientUserMessageId,
        executionSettingsJson: serializeRunExecutionSettings(
          snapshot.executionSettings,
        ),
      });
      runId = run.id;
      runControl.runId = run.id;
      if (activeRunControlRef.current === runControl) {
        currentRunId.current = run.id;
        currentRunAccountId.current = snapshot.accountId;
        currentRunProfileKey.current = snapshot.profileKey;
      }
      ensureRunControlActive(runControl);
      for (const supersededRunId of snapshot.supersededRunIds ?? []) {
        await softDeleteRun(supersededRunId);
        ensureRunControlActive(runControl);
      }
      flushFrameBatchedCodexNotifications();
      await flushBufferedRunEvents().catch(() => undefined);
      runControl.eventSequence = 0;
      updateTaskChatEntryIds(runControl.clientId, {
        taskId: task.id,
        runId: run.id,
        chatId,
        turnIndex: snapshot.turnIndex,
      });
      const browserSession = snapshot.computerUseEnabled
        ? await prepareBrowserSession({
            profileKey: snapshot.profileKey,
            workspaceId: snapshot.workspace.id,
            chatId,
            runId: run.id,
            entryId: runControl.clientId,
            threadId,
            turnId: null,
            accessMode: snapshot.access.accessMode,
          })
        : null;
      runControl.browserSession = browserSession;
      if (browserSession) {
        setActiveRunRegistryVersion((current) => current + 1);
      }
      const threadConfig = {
        ...(snapshot.useOss
          ? {
              model_provider: "oss",
              oss_provider: snapshot.ossProvider,
            }
          : {}),
        ...(browserSession?.config ?? {}),
      };

      let threadModel: string | null | undefined = snapshot.model;
      let threadModelProvider: string | null | undefined = snapshot.useOss ? "oss" : null;
      let resumedThread = false;
      const startThread = async () => {
        if (chatId === null) {
          throw new Error("Chat was not prepared before starting a Codex thread.");
        }
        if (
          snapshot.profileKey === DEFAULT_CODEX_PROFILE_KEY &&
          !accountHandoff
        ) {
          throw new Error("External Codex chats cannot be restarted as Orchestrator threads.");
        }
        const activeChatId = chatId;
        const thread = await codexRpcForProfile<{
          thread: { id: string };
          model?: string;
          modelProvider?: string;
          serviceTier?: string | null;
          approvalPolicy?: string;
          activePermissionProfile?: { id?: string | null } | null;
        }>(snapshot.profileKey, snapshot.accountId, "thread/start", {
          cwd: snapshot.workspace.path,
          model: snapshot.model,
          approvalPolicy: snapshot.access.approvalPolicy,
          approvalsReviewer: "user",
          permissions: snapshot.access.permissionProfile,
          serviceName: "orchestrator",
          threadSource: "orchestrator",
          config: threadConfig,
        });
        ensureRunControlActive(runControl);
        assertRuntimeAccessMatches(thread, snapshot.access);
        const nextThreadId = thread.thread.id;
        runControl.threadId = nextThreadId;
        void flushPendingRunBindingNotifications(runControl).catch((error) => {
          console.error("Could not replay buffered Codex notifications", error);
        });
        const nextThreadModel = thread.model ?? snapshot.model;
        const nextThreadModelProvider =
          thread.modelProvider ?? (snapshot.useOss ? "oss" : null);
        if (!accountHandoff) {
          await updateChat(activeChatId, {
            codexThreadId: nextThreadId,
            status: "running",
          });
          updateRememberedWorkspaceChatSession(
            snapshot.workspace.id,
            activeChatId,
            {
              chatId: activeChatId,
              threadId: nextThreadId,
              origin: snapshot.chatOrigin,
              profileKey: snapshot.profileKey,
              externalThreadId: snapshot.externalThreadId,
              nextTurnIndex: snapshot.turnIndex + 1,
            },
          );
        }
        return {
          threadId: nextThreadId,
          model: nextThreadModel,
          modelProvider: nextThreadModelProvider,
        };
      };

      if (!threadId) {
        const thread = await startThread();
        threadId = thread.threadId;
        threadModel = thread.model;
        threadModelProvider = thread.modelProvider;
      } else {
        runControl.threadId = threadId;
        void flushPendingRunBindingNotifications(runControl).catch((error) => {
          console.error("Could not replay buffered Codex notifications", error);
        });
        try {
          const resumed = await codexRpcForProfile<{
            model?: string;
            modelProvider?: string;
            approvalPolicy?: string;
            activePermissionProfile?: { id?: string | null } | null;
          }>(snapshot.profileKey, snapshot.accountId, "thread/resume", {
            threadId,
            cwd: snapshot.workspace.path,
            approvalPolicy: snapshot.access.approvalPolicy,
            approvalsReviewer: "user",
            permissions: snapshot.access.permissionProfile,
            config: threadConfig,
          });
          resumedThread = true;
          assertRuntimeAccessMatches(resumed, snapshot.access);
          threadModel = resumed.model ?? threadModel;
          threadModelProvider = resumed.modelProvider ?? threadModelProvider;
        } catch (error) {
          if (
            snapshot.profileKey !== DEFAULT_CODEX_PROFILE_KEY &&
            isCodexThreadNotFoundError(error)
          ) {
            const thread = await startThread();
            threadId = thread.threadId;
            threadModel = thread.model;
            threadModelProvider = thread.modelProvider;
            updateRunControlView(runControl, (current) => ({
              ...current,
              tokenUsageStartTotal: 0,
              tokenUsageStartCachedInput: 0,
            }));
          } else if (snapshot.profileKey === DEFAULT_CODEX_PROFILE_KEY) {
            throw new Error(
              `Could not resume the external Codex thread: ${
                error instanceof Error ? error.message : String(error)
              }`,
            );
          } else {
            throw error;
          }
        }
        if (resumedThread && !snapshot.goalMode) {
          try {
            await clearThreadGoalForProfile(
              snapshot.profileKey,
              snapshot.accountId,
              threadId,
            );
          } catch (error) {
            throw new Error(
              `Could not clear the previous Goal Mode state before starting this turn: ${
                error instanceof Error ? error.message : String(error)
              }`,
            );
          }
        }
        try {
          await codexRpcForProfile(
            snapshot.profileKey,
            snapshot.accountId,
            "thread/settings/update",
            {
              threadId,
              collaborationMode,
            },
          );
        } catch (error) {
          if (!isCodexThreadNotFoundError(error)) throw error;
        }
        ensureRunControlActive(runControl);
        await updateChat(chatId, { status: "running" });
      }
      if (!accountHandoff) {
        await updateChat(chatId, {
          collaborationMode: collaborationMode.mode,
          savedDefaultCollaborationModeJson:
            snapshot.mode === "plan"
              ? JSON.stringify(
                  snapshot.defaultCollaborationMode ??
                    collaborationModes.default,
                )
              : null,
        });
      }
      if (!accountHandoff) {
        updateRememberedWorkspaceChatSession(
          snapshot.workspace.id,
          chatId,
          {
            chatId,
            threadId,
            origin: snapshot.chatOrigin,
            profileKey: snapshot.profileKey,
            externalThreadId: snapshot.externalThreadId,
            nextTurnIndex: snapshot.turnIndex + 1,
            savedDefaultCollaborationMode:
              snapshot.mode === "plan"
                ? snapshot.defaultCollaborationMode ?? collaborationModes.default
                : null,
          },
        );
      }
      ensureRunControlActive(runControl);
      if (browserSession) {
        updateRunControlBrowserState(
          runControl,
          await updateBrowserSessionTarget(browserSession.token, {
            ...browserSession.state.target,
            chatId,
            runId: run.id,
            threadId,
            turnId: null,
          }),
        );
      }

      await updateRun(run.id, {
        codexThreadId: threadId,
        model: threadModel ?? snapshot.model,
        modelProvider: threadModelProvider ?? (snapshot.useOss ? "oss" : null),
        status: "running",
        collaborationMode: collaborationMode.mode,
        runIntent: runControl.intent,
      });
      ensureRunControlActive(runControl);

      if (snapshot.goalMode) {
        try {
          const response = await setThreadGoalForProfile(
            snapshot.profileKey,
            snapshot.accountId,
            threadId,
            snapshot.promptText,
          );
          const goal = parseThreadGoal(response.goal, {
            fallbackThreadId: threadId,
          });
          if (!goal) {
            throw new Error("Codex returned invalid goal state.");
          }
          runControl.acceptsThreadContinuation = true;
          runControl.goal = goal;
          runControl.goalActionPending = null;
          runControl.goalActionError = null;
          setActiveRunRegistryVersion((current) => current + 1);
          ensureRunControlActive(runControl);
        } catch (error) {
          if (error instanceof RunStoppedError) {
            throw error;
          }
          runControl.acceptsThreadContinuation = false;
          runControl.goal = null;
          runControl.goalActionPending = null;
          runControl.goalActionError = null;
          warnings.push(
            `Goal mode could not set a thread goal: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }

      const baseTurnText =
        runControl.intent === "plan-revision" ||
        runControl.intent === "plan-implementation"
          ? snapshot.promptText
          : snapshot.mode === "plan"
          ? report.improvedPrompt || snapshot.improvedPrompt
          : buildRunPrompt(
              report.improvedPrompt || snapshot.improvedPrompt,
              report.recommendations,
            );
      const progressAwareTurnText =
        runControl.intent === "plan-implementation"
          ? addPlanImplementationProgressInstructions(baseTurnText)
          : baseTurnText;
      const text = applySelectedSkillsToPrompt(
        progressAwareTurnText,
        snapshot.selectedSkills,
      );
      let { additionalContext, skippedFiles } = await buildAdditionalContext(
        snapshot.profileKey,
        snapshot.accountId,
        snapshot.contextFiles,
        snapshot.workspace.id,
      );
      if (snapshot.previousChatContext) {
        additionalContext = {
          ...(additionalContext ?? {}),
          "chat:previous-turns": {
            kind: "application",
            value: snapshot.previousChatContext,
          },
        };
      }
      ensureRunControlActive(runControl);
      if (skippedFiles.length > 0) {
        warnings.push(
          `Skipped context file${skippedFiles.length === 1 ? "" : "s"}: ${skippedFiles.join(", ")}`,
        );
      }

      const startTurn = (nextThreadId: string) =>
        codexRpcForProfile<{ turn: { id: string } }>(
          snapshot.profileKey,
          snapshot.accountId,
          "turn/start",
          {
            threadId: nextThreadId,
            input: buildCodexTurnInput(text, snapshot.contextFiles),
            additionalContext,
            cwd: snapshot.workspace.path,
            approvalPolicy: snapshot.access.approvalPolicy,
            approvalsReviewer: "user",
            permissions: snapshot.access.permissionProfile,
            model: snapshot.model,
            effort: snapshot.effort,
            collaborationMode,
            clientUserMessageId: runControl.clientUserMessageId,
          },
        );

      let turn: { turn: { id: string } };
      try {
        turn = await startTurn(threadId);
      } catch (error) {
        if (
          !isCodexThreadNotFoundError(error) ||
          snapshot.profileKey === DEFAULT_CODEX_PROFILE_KEY
        ) {
          throw error;
        }
        warnings.push(
          "Previous Codex thread was no longer available, so Orchestrator started a fresh thread for this chat.",
        );
        const thread = await startThread();
        threadId = thread.threadId;
        threadModel = thread.model;
        threadModelProvider = thread.modelProvider;
        updateRunControlView(runControl, (current) => ({
          ...current,
          tokenUsageStartTotal: 0,
          tokenUsageStartCachedInput: 0,
        }));
        await updateRun(run.id, {
          codexThreadId: threadId,
          model: threadModel ?? snapshot.model,
          modelProvider: threadModelProvider ?? (snapshot.useOss ? "oss" : null),
          status: "running",
          collaborationMode: collaborationMode.mode,
          runIntent: runControl.intent,
        });
        ensureRunControlActive(runControl);
        if (snapshot.goalMode) {
          try {
            const response = await setThreadGoalForProfile(
              snapshot.profileKey,
              snapshot.accountId,
              threadId,
              snapshot.promptText,
            );
            const goal = parseThreadGoal(response.goal, {
              fallbackThreadId: threadId,
            });
            if (!goal) {
              throw new Error("Codex returned invalid goal state.");
            }
            runControl.acceptsThreadContinuation = true;
            runControl.goal = goal;
            runControl.goalActionPending = null;
            runControl.goalActionError = null;
            setActiveRunRegistryVersion((current) => current + 1);
            ensureRunControlActive(runControl);
          } catch (goalError) {
            if (goalError instanceof RunStoppedError) {
              throw goalError;
            }
            runControl.acceptsThreadContinuation = false;
            runControl.goal = null;
            runControl.goalActionPending = null;
            runControl.goalActionError = null;
            warnings.push(
              `Goal mode could not set a thread goal on the fresh thread: ${
                goalError instanceof Error ? goalError.message : String(goalError)
              }`,
            );
          }
        }
        turn = await startTurn(threadId);
      }
      ensureRunControlActive(runControl);
      runControl.threadId = threadId;
      runControl.turnId = turn.turn.id;
      if (accountHandoff) {
        let activated = false;
        try {
          activated = await activateChatAccountHandoff({
            chatId,
            expectedProfileKey: accountHandoff.fromProfileKey,
            expectedThreadId: accountHandoff.fromThreadId,
            accountId: accountHandoff.targetAccountId,
            profileKey: accountHandoff.targetProfileKey,
            codexThreadId: threadId,
            status: "running",
          });
        } catch (error) {
          await codexRpcForProfile(
            snapshot.profileKey,
            snapshot.accountId,
            "turn/interrupt",
            { threadId, turnId: turn.turn.id },
          ).catch(() => undefined);
          throw error;
        }
        if (!activated) {
          await codexRpcForProfile(
            snapshot.profileKey,
            snapshot.accountId,
            "turn/interrupt",
            { threadId, turnId: turn.turn.id },
          ).catch(() => undefined);
          throw new Error(
            "The chat changed before the account handoff could be activated.",
          );
        }
        accountHandoffActivated = true;
        await updateChat(chatId, {
          collaborationMode: collaborationMode.mode,
          savedDefaultCollaborationModeJson:
            snapshot.mode === "plan"
              ? JSON.stringify(
                  snapshot.defaultCollaborationMode ??
                    collaborationModes.default,
                )
              : null,
        }).catch(() => {
          warnings.push(
            "The account handoff succeeded, but its collaboration-mode metadata could not be saved.",
          );
        });
        updateRememberedWorkspaceChatSession(
          snapshot.workspace.id,
          chatId,
          {
            chatId,
            threadId,
            origin: snapshot.chatOrigin,
            profileKey: snapshot.profileKey,
            externalThreadId: snapshot.externalThreadId,
            nextTurnIndex: snapshot.turnIndex + 1,
            savedDefaultCollaborationMode:
              snapshot.mode === "plan"
                ? snapshot.defaultCollaborationMode ?? collaborationModes.default
                : null,
          },
        );
        clearPendingAccountHandoff(chatId);
      }
      if (browserSession) {
        updateRunControlBrowserState(
          runControl,
          await updateBrowserSessionTarget(browserSession.token, {
            ...browserSession.state.target,
            chatId,
            runId: run.id,
            threadId,
            turnId: turn.turn.id,
          }),
        );
      }
      if (snapshot.queueItemId && runId !== null) {
        const acceptedQueueItem = await acceptPromptQueueItem({
          itemId: snapshot.queueItemId,
          runId,
          turnId: turn.turn.id,
        });
        if (!acceptedQueueItem) {
          await codexRpcForProfile(
            snapshot.profileKey,
            snapshot.accountId,
            "turn/interrupt",
            { threadId, turnId: turn.turn.id },
          ).catch(() => undefined);
          throw new Error(
            "The queued prompt changed before Codex accepted it.",
          );
        }
        upsertPromptQueueItemInMemory(acceptedQueueItem);
        await advanceChatConversationRevision(chatId, { queueOwned: true });
        await refreshPromptQueue(chatId);
      }

      updateRunControlView(runControl, (current) => ({
        ...current,
        status: "running",
        threadId,
        turnId: turn.turn.id,
      }));
      reconcileUnroutedApprovals();
      updateTaskChatEntry(runControl.clientId, (entry) => ({
        ...entry,
        imageAttachmentDelivery: entry.imageAttachmentDelivery
          ? { status: "sent", error: null }
          : undefined,
      }));
      await updateRun(run.id, {
        codexTurnId: turn.turn.id,
        status: "running",
      });
      ensureRunControlActive(runControl);
      await updateTaskStatus(task.id, "running");
      ensureRunControlActive(runControl);
      void flushPendingRunBindingNotifications(runControl).catch((error) => {
        console.error("Could not replay buffered Codex notifications", error);
      });
      if (pendingChatTitleGeneration) {
        const titleRequest = pendingChatTitleGeneration;
        pendingChatTitleGeneration = null;
        startChatTitleGeneration(titleRequest);
      }
      await refreshWorkspaceData(snapshot.workspace.id);
      ensureRunControlActive(runControl);
      if (selectedWorkspaceRef.current?.id === snapshot.workspace.id) {
        void refreshSelectedWorkspaceHistory();
      }
      const runStartedMessage =
        snapshot.mode === "plan" ? "Plan mode turn started." : "Codex run started.";
      setStatusMessage(
        warnings.length > 0
          ? `${runStartedMessage} ${warnings.join(" ")}`
          : runStartedMessage,
      );
      preflightRef.current = null;
    } catch (error) {
      if (pendingChatTitleGeneration) {
        const titleRequest = pendingChatTitleGeneration;
        pendingChatTitleGeneration = null;
        if (await failChatTitleGeneration(titleRequest.chatId).catch(() => false)) {
          updateHistoryChatTitle(
            titleRequest.chatId,
            titleRequest.fallbackTitle,
            "failed",
          );
        }
      }
      if (error instanceof RunStoppedError || runControl.stopped) {
        await persistInterruptedRun(
          runControl,
          new Date().toISOString(),
          runControl.runView,
        );
        if (snapshot.queueItemId) {
          const failedQueueItem = await failPromptQueueItem(
            snapshot.queueItemId,
            "The queued prompt was cancelled before Codex accepted it.",
          ).catch(() => null);
          if (failedQueueItem) {
            upsertPromptQueueItemInMemory(failedQueueItem);
          }
          if (chatId !== null) {
            setPromptQueuePaused(chatId, true, "failure");
          }
        }
        removeRunControl(runControl);
        return;
      }

      const message = error instanceof Error ? error.message : String(error);
      const handoffDidNotActivate = Boolean(
        accountHandoff && !accountHandoffActivated,
      );
      if (runControl.turnId === null) {
        updateTaskChatEntry(runControl.clientId, (entry) => ({
          ...entry,
          imageAttachmentDelivery: entry.imageAttachmentDelivery
            ? { status: "failed", error: message }
            : undefined,
        }));
      }
      if (snapshot.sourcePlanEntry) {
        restoreTaskChatEntry(
          snapshot.sourcePlanEntry.clientId,
          snapshot.sourcePlanEntry,
        );
        planActionLocksRef.current.delete(snapshot.sourcePlanEntry.clientId);
        if (snapshot.sourcePlanEntry.runId !== null) {
          await updateRun(snapshot.sourcePlanEntry.runId, {
            planReviewState: "available",
          }).catch(() => undefined);
        }
      }
      const completedAt = new Date().toISOString();
      const failedRunView = updateRunControlView(runControl, (current) => {
        const elapsedRunView = updateRunElapsed(current);
        return {
          ...elapsedRunView,
          status: "failed",
          completedAt,
          error: message,
          streamEvents:
            elapsedRunView.streamEvents.length > 0
              ? elapsedRunView.streamEvents
              : [
                  {
                    id: `setup-error-${completedAt}`,
                    kind: "system",
                    text: `Setup failed: ${message}`,
                    timestamp: completedAt,
                  },
                ],
        };
      });
      if (runId === null) {
        if (snapshot.restoreEntryOnSetupFailure) {
          restoreTaskChatEntry(runControl.clientId, snapshot.restoreEntryOnSetupFailure);
        }
      } else {
        await updateRun(runId, {
          status: "failed",
          completedAt,
          durationMs: failedRunView.elapsedMs,
          error: message,
        }).catch(() => undefined);
      }
      if (
        (runControl.turnId === null || handoffDidNotActivate) &&
        snapshot.restorePromptOnSetupFailure !== false
      ) {
        restoreRunComposerForRetry(
          snapshot.workspace.id,
          snapshot.promptFallback,
          runControl.imageContextFilesFallback,
        );
      }
      if (taskId !== null) {
        await updateTaskStatus(taskId, "failed").catch(() => undefined);
      }
      if (chatId !== null && !handoffDidNotActivate) {
        await updateChat(chatId, { status: "failed" }).catch(() => undefined);
      }
      if (snapshot.queueItemId) {
        const failedQueueItem = await failPromptQueueItem(
          snapshot.queueItemId,
          message,
        ).catch(() => null);
        if (failedQueueItem) {
          upsertPromptQueueItemInMemory(failedQueueItem);
        }
        if (chatId !== null) {
          setPromptQueuePaused(chatId, true, "failure");
        }
      }
      removeRunControl(runControl);
      setStatusMessage(`Run setup failed: ${message}`);
    }
  }

  function scheduleRunSetup(runControl: ActiveRunControl, snapshot: RunSetupSnapshot) {
    runControl.cancelScheduledSetup = scheduleAfterNextPaint(() => {
      runControl.cancelScheduledSetup = null;
      if (
        runControl.stopped ||
        activeRunControlsRef.current.get(runControl.clientId) !== runControl
      ) {
        return;
      }
      runControl.setupStarted = true;
      markPerformance("orchestrator:submit:setup-start");
      void continueRunSetup(runControl, snapshot);
    });
  }

  async function capturePromptQueueContextFingerprint(input: {
    workspace: Workspace;
    chat: ChatRecord;
    executionSettings: RunExecutionSettings;
  }): Promise<PromptQueueContextFingerprint> {
    const inspection = await inspectPromptQueueContext(
      input.workspace.path,
      input.executionSettings.contextFiles.map((file) => file.path),
    );
    return {
      version: 1,
      workspacePath: inspection.workspacePath,
      branch: inspection.branch,
      headCommit: inspection.headCommit,
      worktreeFingerprint: inspection.worktreeFingerprint,
      profileKey:
        (input.chat.profile_key as CodexProfileKey | null) ??
        input.executionSettings.profileKey,
      threadId:
        input.chat.codex_thread_id ??
        (input.chat.origin === "codex_external"
          ? input.chat.external_thread_id
          : null),
      conversationRevision: Number(input.chat.conversation_revision ?? 0),
      files: inspection.files,
    };
  }

  function queueContextStaleReasons(
    item: PromptQueueItem,
    chat: ChatRecord,
    inspection: Awaited<ReturnType<typeof inspectPromptQueueContext>>,
  ) {
    const expected = item.snapshot.contextFingerprint;
    const reasons: string[] = [];
    if (inspection.workspacePath !== expected.workspacePath) {
      reasons.push("The workspace location changed.");
    }
    if (expected.branch !== inspection.branch) {
      reasons.push("The active branch changed.");
    }
    if (expected.headCommit !== inspection.headCommit) {
      reasons.push("The repository HEAD changed.");
    }
    if (expected.worktreeFingerprint !== inspection.worktreeFingerprint) {
      reasons.push("The workspace files changed.");
    }
    if (
      Number(chat.conversation_revision ?? 0) !==
      expected.conversationRevision
    ) {
      reasons.push("The conversation changed after this prompt was queued.");
    }
    const currentProfileKey =
      (chat.profile_key as CodexProfileKey | null) ??
      item.snapshot.executionSettings.profileKey;
    const currentThreadId =
      chat.codex_thread_id ??
      (chat.origin === "codex_external" ? chat.external_thread_id : null);
    if (
      expected.profileKey !== currentProfileKey ||
      expected.threadId !== currentThreadId
    ) {
      reasons.push("The conversation account or Codex thread changed.");
    }
    const currentFiles = new Map(
      inspection.files.map((file) => [file.path, file]),
    );
    for (const expectedFile of expected.files) {
      const currentFile = currentFiles.get(expectedFile.path);
      if (!currentFile?.available) {
        reasons.push(`Attachment is unavailable: ${expectedFile.path}`);
        continue;
      }
      if (
        expectedFile.canonicalPath !== currentFile.canonicalPath ||
        expectedFile.size !== currentFile.size ||
        expectedFile.modifiedAtMs !== currentFile.modifiedAtMs
      ) {
        reasons.push(`Attachment changed: ${expectedFile.path}`);
      }
    }
    return [...new Set(reasons)];
  }

  async function refreshQueuedPromptCurrentContext(
    item: PromptQueueItem,
    chat: ChatRecord,
    inspection: Awaited<ReturnType<typeof inspectPromptQueueContext>>,
  ) {
    const currentProfileKey =
      (chat.profile_key as CodexProfileKey | null) ??
      item.snapshot.executionSettings.profileKey;
    const currentThreadId =
      chat.codex_thread_id ??
      (chat.origin === "codex_external" ? chat.external_thread_id : null);
    const contextFingerprint = rebaselinePromptQueueContextFingerprint({
      expected: item.snapshot.contextFingerprint,
      inspection,
      executionProfileKey: item.snapshot.executionSettings.profileKey,
      currentProfileKey,
      currentThreadId,
      conversationRevision: Number(chat.conversation_revision ?? 0),
    });
    const updated = await updatePromptQueueItemContextFingerprint(
      item.id,
      createQueuedPromptSnapshot({
        prompt: item.prompt,
        executionSettings: item.snapshot.executionSettings,
        contextFingerprint,
      }),
    );
    if (updated) upsertPromptQueueItemInMemory(updated);
    return updated;
  }

  async function rebaselineQueuedPromptContexts(chatId: number) {
    const [chat, items] = await Promise.all([
      getChatRecord(chatId),
      listPromptQueueItems(chatId),
    ]);
    if (!chat || items.length === 0) {
      setChatPromptQueue(chatId, items);
      return;
    }
    const pendingItems = items.filter((item) =>
      ["queued", "scheduled-next"].includes(item.status),
    );
    if (pendingItems.length === 0) {
      setChatPromptQueue(chatId, items);
      return;
    }
    const profileKey =
      (chat.profile_key as CodexProfileKey | null) ??
      pendingItems[0]?.snapshot.executionSettings.profileKey ??
      DEFAULT_CODEX_PROFILE_KEY;
    const threadId =
      chat.codex_thread_id ??
      (chat.origin === "codex_external" ? chat.external_thread_id : null);
    const conversationRevision = Number(chat.conversation_revision ?? 0);
    const workspace =
      workspacesRef.current.find(
        (candidate) => candidate.id === chat.workspace_id,
      ) ?? null;
    if (!workspace) {
      setChatPromptQueue(chatId, items);
      return;
    }
    const inspections = new Map<
      string,
      Promise<Awaited<ReturnType<typeof inspectPromptQueueContext>>>
    >();
    const inspectItemContext = (item: PromptQueueItem) => {
      const paths = item.snapshot.executionSettings.contextFiles.map(
        (file) => file.path,
      );
      const key = JSON.stringify(paths);
      const existing = inspections.get(key);
      if (existing) return existing;
      const inspection = inspectPromptQueueContext(workspace.path, paths);
      inspections.set(key, inspection);
      return inspection;
    };
    const updated = await Promise.all(
      pendingItems.map(async (item) => {
        const expected = item.snapshot.contextFingerprint;
        const inspection = await inspectItemContext(item);
        const contextFingerprint =
          rebaselinePromptQueueContextFingerprint({
            expected,
            inspection,
            executionProfileKey:
              item.snapshot.executionSettings.profileKey,
            currentProfileKey: profileKey,
            currentThreadId: threadId,
            conversationRevision,
          });
        return updatePromptQueueItemContextFingerprint(
          item.id,
          createQueuedPromptSnapshot({
            prompt: item.prompt,
            executionSettings: item.snapshot.executionSettings,
            contextFingerprint,
          }),
        );
      }),
    );
    const updatedById = new Map(
      updated
        .filter((item): item is PromptQueueItem => item !== null)
        .map((item) => [item.id, item]),
    );
    setChatPromptQueue(
      chatId,
      items.map((item) => updatedById.get(item.id) ?? item),
    );
  }

  async function chatBlocksPromptQueue(chatId: number) {
    const activeControl = [...activeRunControlsRef.current.values()].find(
      (control) =>
        control.chatId === chatId && isActiveRunControl(control),
    );
    if (activeControl) return true;
    const conversationKey = subagentConversationKey({ chatId });
    if (
      conversationKey &&
      getConversationSubagents(conversationKey).some(
        (record) =>
          record.needsAttention || record.status === "needs-attention",
      )
    ) {
      return true;
    }

    return chatHasPendingPlanReview(chatId).catch(() => true);
  }

  function schedulePromptQueueDispatch(chatId: number, delayMs = 0) {
    if (promptQueueDispatchTimersRef.current.has(chatId)) return;
    const timer = window.setTimeout(() => {
      promptQueueDispatchTimersRef.current.delete(chatId);
      void dispatchPromptQueue(chatId);
    }, delayMs);
    promptQueueDispatchTimersRef.current.set(chatId, timer);
  }

  async function dispatchPromptQueue(chatId: number) {
    if (
      promptQueueClaimLocksRef.current.has(chatId) ||
      pausedPromptQueueChatIdsRef.current.has(chatId)
    ) {
      return;
    }
    promptQueueClaimLocksRef.current.add(chatId);
    try {
      if (await chatBlocksPromptQueue(chatId)) return;
      const items = await refreshPromptQueue(chatId);
      let item = items
        .filter(isPromptQueueItemPending)
        .filter(isPromptQueueItemAutoDispatchEligible)
        .sort(comparePromptQueueDispatchOrder)[0];
      if (!item) return;
      if (item.status === "failed") {
        setPromptQueuePaused(
          chatId,
          true,
          "failure",
        );
        setStatusMessage(
          "Retry, edit, skip, or remove the failed prompt before resuming the queue.",
        );
        return;
      }
      if (item.status === "stale") {
        const recovered = await retryPromptQueueItem(item.id, {
          autoSendEnabled: item.autoSendEnabled,
        });
        if (!recovered) return;
        item = recovered;
        upsertPromptQueueItemInMemory(recovered);
      }
      if (
        item.status !== "queued" &&
        item.status !== "scheduled-next"
      ) {
        return;
      }
      const [chat, workspace] = await Promise.all([
        getChatRecord(chatId),
        Promise.resolve(
          workspacesRef.current.find(
            (candidate) => candidate.id === item.workspaceId,
          ) ?? null,
        ),
      ]);
      if (!chat || !workspace) {
        const failed = await failPromptQueueItem(
          item.id,
          "The queued prompt's workspace or chat is no longer available.",
        );
        if (failed) upsertPromptQueueItemInMemory(failed);
        setPromptQueuePaused(chatId, true, "failure");
        return;
      }
      const inspection = await inspectPromptQueueContext(
        workspace.path,
        item.snapshot.executionSettings.contextFiles.map((file) => file.path),
      );
      const staleReasons = queueContextStaleReasons(item, chat, inspection);
      if (staleReasons.length > 0) {
        const refreshedItem = await refreshQueuedPromptCurrentContext(
          item,
          chat,
          inspection,
        );
        if (!refreshedItem) return;
        item = refreshedItem;
      }
      const claimed = await claimPromptQueueItem(item.id);
      if (!claimed) return;
      upsertPromptQueueItemInMemory(claimed);
      await launchQueuedPrompt(claimed, chat, workspace);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const currentItems = promptQueuesByChatRef.current[chatId] ?? [];
      const startingItem = currentItems.find(
        (item) => item.status === "starting",
      );
      if (startingItem) {
        const failed = await failPromptQueueItem(
          startingItem.id,
          message,
        ).catch(() => null);
        if (failed) upsertPromptQueueItemInMemory(failed);
      }
      setPromptQueuePaused(chatId, true, "failure");
      setStatusMessage(`Queued prompt could not start: ${message}`);
    } finally {
      promptQueueClaimLocksRef.current.delete(chatId);
    }
  }

  async function launchQueuedPrompt(
    item: PromptQueueItem,
    chat: ChatRecord,
    workspace: Workspace,
  ) {
    const settings = item.snapshot.executionSettings;
    const profileKey = settings.profileKey;
    const accountId = settings.accountId;
    const account =
      profileKey === DEFAULT_CODEX_PROFILE_KEY
        ? null
        : codexAccountsRef.current.find(
            (candidate) => candidate.id === accountId,
          ) ?? null;
    if (
      profileKey !== DEFAULT_CODEX_PROFILE_KEY &&
      (!account || account.status !== "signed_in")
    ) {
      throw new Error("The queued prompt's Codex account is unavailable.");
    }
    const availableModels = settings.useOss
      ? []
      : await listCodexModelsForProfile(profileKey, accountId);
    const selectedQueuedModel = settings.model
      ? availableModels.find(
          (model) =>
            model.model === settings.model || model.id === settings.model,
        ) ?? null
      : null;
    if (settings.model && !selectedQueuedModel) {
      throw new Error("The queued prompt's model is no longer available.");
    }
    if (
      settings.reasoningEffort &&
      selectedQueuedModel &&
      !selectedQueuedModel.supportedReasoningEfforts.some(
        (option) =>
          option.reasoningEffort === settings.reasoningEffort,
      )
    ) {
      throw new Error(
        "The queued prompt's reasoning level is no longer available.",
      );
    }
    const currentProfileKey =
      (chat.profile_key as CodexProfileKey | null) ?? profileKey;
    const currentThreadId =
      chat.codex_thread_id ??
      (chat.origin === "codex_external" ? chat.external_thread_id : null);
    const accountHandoff: AccountHandoffRunStrategy | null =
      currentProfileKey !== profileKey
        ? {
            workspaceId: workspace.id,
            chatId: chat.id,
            fromProfileKey: currentProfileKey,
            fromThreadId: currentThreadId,
            targetAccountId: accountId,
            targetProfileKey: profileKey,
            adoptingExternalChat:
              chat.origin === "codex_external" &&
              currentProfileKey === DEFAULT_CODEX_PROFILE_KEY,
          }
        : null;
    const mode = settings.mode;
    const intent = settings.intent;
    const turnIndex = await getNextChatTurnIndex(chat.id);
    const snapshot: RunSetupSnapshot = {
      promptText: item.prompt,
      promptFallback: item.prompt,
      workspace: { ...workspace },
      accountId,
      account: account ? { ...account } : null,
      profileKey,
      chatOrigin: chat.origin,
      externalThreadId: chat.external_thread_id,
      selectedBranch: settings.selectedBranch,
      cachedPreflight: null,
      mode,
      intent,
      clientUserMessageId: item.clientMessageId,
      access: accessSettings({ accessMode: settings.accessMode }),
      computerUseEnabled: settings.computerUseEnabled,
      model: settings.model,
      effort: settings.reasoningEffort,
      useOss: settings.useOss,
      ossProvider: settings.ossProvider,
      improvedPrompt: improvePrompt(item.prompt),
      contextFiles: settings.contextFiles.map((file) => ({ ...file })),
      selectedSkills: settings.selectedSkills.map((skill) => ({ ...skill })),
      goalMode: settings.goalMode,
      loginState: "idle",
      chatId: chat.id,
      threadId: accountHandoff ? null : currentThreadId,
      turnIndex,
      threadStrategy: accountHandoff
        ? { kind: "handoff", handoff: accountHandoff }
        : currentThreadId
          ? { kind: "resume" }
          : { kind: "fresh" },
      handoffContextBudgetTokens: Math.max(
        1,
        Math.floor(
          (getCodexModelContextWindow(selectedQueuedModel) ??
            DEFAULT_CONTEXT_WINDOW) * 0.25,
        ),
      ),
      executionSettings: settings,
      restorePromptOnSetupFailure: false,
      queueItemId: item.id,
      fromQueue: true,
    };
    const runControl = beginOptimisticRun(snapshot);
    scheduleRunSetup(runControl, snapshot);
  }

  function queuedPromptCanSteerActiveTurn(
    item: PromptQueueItem,
    control: ActiveRunControl,
  ) {
    const queued = item.snapshot.executionSettings;
    const active = control.executionSettings;
    const imagesOnly = queued.contextFiles.every(isImageContextFile);
    const selectedSession =
      workspaceChatSessionsRef.current[item.workspaceId] ?? null;
    return (
      control.chatId === item.chatId &&
      control.threadId !== null &&
      control.turnId !== null &&
      control.runId !== null &&
      control.interactionMode === "chat" &&
      control.intent === "normal" &&
      control.goal === null &&
      control.runView.nativePlan.reviewState === "none" &&
      control.runView.approvalRequests.length === 0 &&
      control.runView.serverRequests.length === 0 &&
      !pendingAccountHandoffsRef.current[item.chatId] &&
      queued.mode === "run" &&
      queued.intent === "normal" &&
      !queued.goalMode &&
      queued.profileKey === control.profileKey &&
      queued.accountId === control.accountId &&
      queued.selectedBranch === active.selectedBranch &&
      queued.model === active.model &&
      queued.reasoningEffort === active.reasoningEffort &&
      queued.accessMode === active.accessMode &&
      queued.computerUseEnabled === active.computerUseEnabled &&
      queued.useOss === active.useOss &&
      queued.ossProvider === active.ossProvider &&
      selectedSession?.threadId === control.threadId &&
      imagesOnly
    );
  }

  async function steerQueuedPrompt(
    item: PromptQueueItem,
    control: ActiveRunControl,
  ) {
    if (
      !queuedPromptCanSteerActiveTurn(item, control) ||
      !control.threadId ||
      !control.turnId ||
      control.runId === null
    ) {
      return false;
    }
    const workspace = workspacesRef.current.find(
      (candidate) => candidate.id === item.workspaceId,
    );
    const chat = await getChatRecord(item.chatId);
    if (!workspace || !chat) return false;
    const inspection = await inspectPromptQueueContext(
      workspace.path,
      item.snapshot.executionSettings.contextFiles.map((file) => file.path),
    );
    const staleReasons = queueContextStaleReasons(item, chat, inspection);
    if (staleReasons.length > 0) {
      const refreshedItem = await refreshQueuedPromptCurrentContext(
        item,
        chat,
        inspection,
      );
      if (!refreshedItem) {
        throw new Error(
          "The queued prompt changed before its current context could be applied.",
        );
      }
    }
    const steeringItem = await markPromptQueueItemSteering(item.id);
    if (!steeringItem) return true;
    upsertPromptQueueItemInMemory(steeringItem);
    try {
      const preparedFiles = await prepareContextImageFiles(
        item.snapshot.executionSettings.contextFiles,
      );
      const text = applySelectedSkillsToPrompt(
        item.prompt,
        item.snapshot.executionSettings.selectedSkills,
      );
      await codexRpcForProfile(
        control.profileKey,
        control.accountId,
        "turn/steer",
        {
          threadId: control.threadId,
          expectedTurnId: control.turnId,
          clientUserMessageId: item.clientMessageId,
          input: buildCodexTurnInput(text, preparedFiles),
        },
      );
      await persistRunEvent(control, "client-action", "turn/steer", {
        queueItemId: item.id,
        clientUserMessageId: item.clientMessageId,
        prompt: item.prompt,
      });
      updateTaskChatEntry(control.clientId, (entry) => ({
        ...entry,
        steeredPrompts: [
          ...(entry.steeredPrompts ?? []),
          {
            id: item.id,
            prompt: item.prompt,
            submittedAt: new Date().toISOString(),
          },
        ],
      }));
      await completePromptQueueItem(item.id);
      removePromptQueueItemFromMemory(item.chatId, item.id);
      setStatusMessage("Queued prompt was sent to the active turn.");
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/turn.+(complete|not active|not found|mismatch)/i.test(message)) {
        const scheduled =
          await reschedulePromptQueueItemAfterSteeringRace(item.id);
        if (scheduled) {
          upsertPromptQueueItemInMemory(scheduled);
        }
        schedulePromptQueueDispatch(item.chatId);
        setStatusMessage(
          "The active turn finished first, so the prompt is scheduled next.",
        );
        return true;
      }
      const failed = await failPromptQueueItem(item.id, message);
      if (failed) upsertPromptQueueItemInMemory(failed);
      setPromptQueuePaused(item.chatId, true, "failure");
      setStatusMessage(`Could not send queued prompt: ${message}`);
      return true;
    }
  }

  async function launchRun(composerPrompt = promptRef.current) {
    markPerformance("orchestrator:submit:start");
    setApprovalSafetyWarning(null);
    setEditedPromptNotice(null);

    const workspace = selectedWorkspaceRef.current;
    if (!workspace) {
      setStatusMessage("Select a workspace before adding a prompt.");
      return;
    }
    const promptText = serializePromptInlineFileReferences(
      composerPrompt.trim(),
      contextFilesRef.current.filter((file) => file.source === "search"),
    );
    let session = workspaceChatSessionsRef.current[workspace.id] ?? null;
    const pendingHandoff = session
      ? pendingAccountHandoffsRef.current[session.chatId] ?? null
      : null;
    const profileKey: CodexProfileKey =
      pendingHandoff?.targetProfileKey ??
      session?.profileKey ??
      (`account:${selectedAccountIdRef.current}` as CodexProfileKey);
    const accountId =
      profileKey === DEFAULT_CODEX_PROFILE_KEY
        ? 0
        : accountIdFromProfileKey(profileKey);
    const account =
      accountId && accountId !== 0
        ? codexAccountsRef.current.find(
            (candidate) => candidate.id === accountId,
          ) ?? null
        : null;
    if (!promptText) {
      if (session) schedulePromptQueueDispatch(session.chatId);
      return;
    }
    if (
      profileKey !== DEFAULT_CODEX_PROFILE_KEY &&
      (!accountId || !account || account.status !== "signed_in")
    ) {
      setStatusMessage("Sign in to a Codex account before queuing a prompt.");
      return;
    }
    const selectedQueuedModel =
      modelsRef.current.find((model) => model.id === selectedModelId) ??
      modelsRef.current[0] ??
      null;
    const mode = planMode ? "plan" : "run";
    const intent: RunIntent = planMode ? "plan" : "normal";
    const executionSettings = createRunExecutionSettings({
      accountId: accountId ?? 0,
      profileKey,
      selectedBranch,
      mode,
      intent,
      accessMode,
      computerUseEnabled,
      model:
        useOss || modelLoadErrorRef.current
          ? null
          : selectedQueuedModel?.model ?? null,
      reasoningEffort:
        useOss || modelLoadErrorRef.current
          ? null
          : selectedReasoningEffort,
      useOss,
      ossProvider,
      contextFiles: contextFilesRef.current,
      selectedSkills: selectedSkillsRef.current,
      goalMode,
    });
    const currentQueueSize = session
      ? (promptQueuesByChatRef.current[session.chatId] ?? []).filter(
          isPromptQueueItemPending,
        ).length
      : 0;
    const validationError = validatePromptQueueDraft({
      prompt: promptText,
      attachmentCount: executionSettings.contextFiles.length,
      currentQueueSize,
    });
    if (validationError) {
      setStatusMessage(validationError);
      return;
    }
    const submissionKey = `${promptText}\u0000${JSON.stringify(
      executionSettings,
    )}`;
    const pendingSubmissionKeys =
      promptQueuePendingSubmissionKeysRef.current.get(workspace.id) ??
      new Set<string>();
    if (pendingSubmissionKeys.has(submissionKey)) {
      return;
    }
    pendingSubmissionKeys.add(submissionKey);
    promptQueuePendingSubmissionKeysRef.current.set(
      workspace.id,
      pendingSubmissionKeys,
    );
    const previousEnqueue =
      promptQueueEnqueueOperationsRef.current.get(workspace.id) ??
      Promise.resolve();
    let releaseEnqueue!: () => void;
    const enqueueGate = new Promise<void>((resolve) => {
      releaseEnqueue = resolve;
    });
    const serializedEnqueue = previousEnqueue
      .catch(() => undefined)
      .then(() => enqueueGate);
    promptQueueEnqueueOperationsRef.current.set(
      workspace.id,
      serializedEnqueue,
    );
    await previousEnqueue.catch(() => undefined);
    session = workspaceChatSessionsRef.current[workspace.id] ?? null;

    let createdChat: ChatRecord | null = null;
    try {
      let queuedItem: PromptQueueItem | null = null;
      if (!session) {
        const initialTitlePrompt = restorePromptInlineFileReferencesForComposer(
          promptText,
          executionSettings.contextFiles.filter(
            (file) => file.source === "search",
          ),
        );
        const fallbackTitle = fallbackChatTitle(initialTitlePrompt);
        const inspection = await inspectPromptQueueContext(
          workspace.path,
          executionSettings.contextFiles.map((file) => file.path),
        );
        const contextFingerprint: PromptQueueContextFingerprint = {
          version: 1,
          workspacePath: inspection.workspacePath,
          branch: inspection.branch,
          headCommit: inspection.headCommit,
          worktreeFingerprint: inspection.worktreeFingerprint,
          profileKey,
          threadId: null,
          conversationRevision: 0,
          files: inspection.files,
        };
        const snapshot = createQueuedPromptSnapshot({
          prompt: promptText,
          executionSettings,
          contextFingerprint,
        });
        const queuedConversation = await createChatWithQueuedPrompt({
          workspaceId: workspace.id,
          accountId:
            profileKey === DEFAULT_CODEX_PROFILE_KEY ? null : accountId,
          title: fallbackTitle,
          status: "queued",
          generateTitle: true,
          itemId: createPromptQueueItemId(),
          clientMessageId: createStableClientMessageId(),
          prompt: promptText,
          snapshot,
        });
        createdChat = queuedConversation.chat;
        queuedItem = queuedConversation.item;
        session = {
          chatId: createdChat.id,
          threadId: null,
          origin: "orchestrator",
          profileKey,
          externalThreadId: null,
          nextTurnIndex: 1,
        };
        setWorkspaceChatSession(workspace.id, session);
        rememberWorkspaceTaskSelection(
          workspace.id,
          { kind: "chat", session },
          null,
        );
        setSelectedDraftChat(null);
        setSelectedHistoryChatId(createdChat.id);
      } else {
        const chat = await getChatRecord(session.chatId);
        if (!chat) {
          throw new Error("The conversation could not be prepared.");
        }
        const contextFingerprint =
          await capturePromptQueueContextFingerprint({
            workspace,
            chat,
            executionSettings,
          });
        const snapshot = createQueuedPromptSnapshot({
          prompt: promptText,
          executionSettings,
          contextFingerprint,
        });
        queuedItem = await enqueuePromptQueueItem({
          id: createPromptQueueItemId(),
          clientMessageId: createStableClientMessageId(),
          workspaceId: workspace.id,
          chatId: session.chatId,
          prompt: promptText,
          snapshot,
        });
      }
      if (!queuedItem) {
        throw new Error("The prompt was not added to the queue.");
      }
      taskChatTranscriptRef.current?.stabilizeForSubmission();
      const submittedWorkspacePrompt =
        selectedWorkspaceRef.current?.id === workspace.id
          ? promptRef.current
          : workspaceTaskMemoriesRef.current[workspace.id]?.prompt ??
            composerPrompt;
      const composerStillMatchesSubmission =
        submittedWorkspacePrompt.trim() === composerPrompt.trim();
      flushSync(() => {
        upsertPromptQueueItemInMemory(queuedItem);
        if (composerStillMatchesSubmission) {
          updateRememberedWorkspaceComposer(workspace.id, { prompt: "" });
          removeSubmittedImagesFromWorkspaceComposer(
            workspace.id,
            executionSettings.contextFiles,
          );
        }
        if (executionSettings.mode === "plan" && planMode) setPlanMode(false);
      });
      taskChatTranscriptRef.current?.settleAfterSubmission();
      if (createdChat) {
        const initialPrompt = restorePromptInlineFileReferencesForComposer(
          promptText,
          executionSettings.contextFiles.filter(
            (file) => file.source === "search",
          ),
        );
        const fallbackTitle = fallbackChatTitle(initialPrompt);
        startChatTitleGeneration({
          chatId: createdChat.id,
          workspacePath: workspace.path,
          accountId: accountId ?? 0,
          model: executionSettings.model,
          initialPrompt,
          fallbackTitle,
        });
      }
      setStatusMessage(
        runIsActive
          ? "Prompt added to this chat's queue."
          : "Prompt queued.",
      );
      schedulePromptQueueDispatch(session.chatId);
    } catch (error) {
      setStatusMessage(
        `Could not queue prompt: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    } finally {
      pendingSubmissionKeys.delete(submissionKey);
      if (pendingSubmissionKeys.size === 0) {
        promptQueuePendingSubmissionKeysRef.current.delete(workspace.id);
      }
      releaseEnqueue();
      void serializedEnqueue.finally(() => {
        if (
          promptQueueEnqueueOperationsRef.current.get(workspace.id) ===
          serializedEnqueue
        ) {
          promptQueueEnqueueOperationsRef.current.delete(workspace.id);
        }
      });
    }
  }

  function restorePromptQueueComposer(edit: PromptQueueComposerEditState) {
    updateRememberedWorkspaceComposer(edit.item.workspaceId, {
      prompt: edit.previousComposer.prompt,
      contextFiles: edit.previousComposer.contextFiles,
      selectedSkills: edit.previousComposer.selectedSkills,
    });
    setSelectedModelId(edit.previousComposer.selectedModelId);
    setSelectedReasoningEffort(
      edit.previousComposer.selectedReasoningEffort,
    );
    setGoalMode(edit.previousComposer.goalMode);
    setPlanMode(edit.previousComposer.planMode);
  }

  function setPromptQueueComposerEditState(
    next: PromptQueueComposerEditState | null,
  ) {
    promptQueueComposerEditRef.current = next;
    setPromptQueueComposerEdit(next);
  }

  function focusPromptQueueComposer(selectAll = false) {
    window.requestAnimationFrame(() => {
      const textarea = taskComposerPromptRef.current;
      textarea?.focus({ preventScroll: true });
      if (selectAll && textarea) {
        textarea.setSelectionRange(0, textarea.value.length);
      }
    });
  }

  function openPromptQueueComposerEdit(item: PromptQueueItem) {
    if (!isPromptQueueItemMutable(item)) return;
    const selectedSession =
      workspaceChatSessionsRef.current[item.workspaceId] ?? null;
    if (
      selectedWorkspaceRef.current?.id !== item.workspaceId ||
      selectedSession?.chatId !== item.chatId
    ) {
      setStatusMessage(
        "Open this queued prompt's conversation before editing it.",
      );
      return;
    }

    const settings = item.snapshot.executionSettings;
    const queuedModel = settings.model
      ? modelsRef.current.find(
          (model) =>
            model.id === settings.model || model.model === settings.model,
        ) ?? null
      : null;
    if (!settings.useOss && settings.model && !queuedModel) {
      setStatusMessage(
        `The queued prompt's model ${settings.model} is no longer available.`,
      );
      return;
    }
    const existingEdit = promptQueueComposerEditRef.current;
    if (existingEdit?.status === "saving") return;
    if (existingEdit) restorePromptQueueComposer(existingEdit);

    const nextEdit: PromptQueueComposerEditState = {
      item,
      previousComposer: {
        prompt: existingEdit
          ? existingEdit.previousComposer.prompt
          : promptRef.current,
        contextFiles: (
          existingEdit
            ? existingEdit.previousComposer.contextFiles
            : contextFilesRef.current
        ).map((file) => ({ ...file })),
        selectedSkills: (
          existingEdit
            ? existingEdit.previousComposer.selectedSkills
            : selectedSkillsRef.current
        ).map((skill) => ({ ...skill })),
        selectedModelId: existingEdit
          ? existingEdit.previousComposer.selectedModelId
          : selectedModelId,
        selectedReasoningEffort: existingEdit
          ? existingEdit.previousComposer.selectedReasoningEffort
          : selectedReasoningEffort,
        goalMode: existingEdit
          ? existingEdit.previousComposer.goalMode
          : goalMode,
        planMode: existingEdit
          ? existingEdit.previousComposer.planMode
          : planMode,
      },
      status: "editing",
      error: null,
    };
    setPromptQueueComposerEditState(nextEdit);
    updateRememberedWorkspaceComposer(item.workspaceId, {
      prompt: restorePromptInlineFileReferencesForComposer(
        item.prompt,
        settings.contextFiles.filter((file) => file.source === "search"),
      ),
      contextFiles: settings.contextFiles,
      selectedSkills: settings.selectedSkills,
    });
    if (!settings.useOss) {
      setSelectedModelId(queuedModel?.id ?? null);
      setSelectedReasoningEffort(settings.reasoningEffort);
    }
    const queuedPlanMode = settings.mode === "plan";
    setGoalMode(!queuedPlanMode && settings.goalMode);
    setPlanMode(queuedPlanMode);
    focusPromptQueueComposer(true);
  }

  function cancelPromptQueueComposerEdit() {
    const edit = promptQueueComposerEditRef.current;
    if (!edit || edit.status === "saving") return;
    setPromptQueueComposerEditState(null);
    restorePromptQueueComposer(edit);
    focusPromptQueueComposer();
    setStatusMessage("Queued prompt edit cancelled.");
  }

  async function savePromptQueueComposerEdit(nextPrompt: string) {
    const editor = promptQueueComposerEditRef.current;
    if (!editor || editor.status !== "editing") return;
    setPromptQueueComposerEditState({
      ...editor,
      status: "saving",
      error: null,
    });
    let currentItem: PromptQueueItem | null;
    try {
      currentItem = await readPromptQueueItem(editor.item.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setPromptQueueComposerEditState({
        ...editor,
        status: "editing",
        error: message,
      });
      setStatusMessage(`Could not load queued prompt: ${message}`);
      return;
    }
    if (!currentItem || !isPromptQueueItemMutable(currentItem)) {
      const message = "This queued prompt has already started.";
      setPromptQueueComposerEditState({
        ...editor,
        status: "editing",
        error: message,
      });
      setStatusMessage(message);
      return;
    }
    const serializedPrompt = serializePromptInlineFileReferences(
      nextPrompt.trim(),
      contextFilesRef.current.filter((file) => file.source === "search"),
    );
    const queueSize = (
      promptQueuesByChatRef.current[editor.item.chatId] ?? []
    ).filter(
      (item) => item.id !== editor.item.id && isPromptQueueItemPending(item),
    ).length;
    const validationError = validatePromptQueueDraft({
      prompt: serializedPrompt,
      attachmentCount: contextFilesRef.current.length,
      currentQueueSize: queueSize,
    });
    if (validationError) {
      setPromptQueueComposerEditState({
        ...editor,
        status: "editing",
        error: validationError,
      });
      setStatusMessage(validationError);
      return;
    }
    try {
      const [chat, workspace] = await Promise.all([
        getChatRecord(editor.item.chatId),
        Promise.resolve(
          workspacesRef.current.find(
            (candidate) => candidate.id === editor.item.workspaceId,
          ) ?? null,
        ),
      ]);
      if (!chat || !workspace) {
        throw new Error("The queued prompt's chat is no longer available.");
      }
      const originalSettings = currentItem.snapshot.executionSettings;
      const selectedEditedModel = originalSettings.useOss
        ? null
        : modelsRef.current.find(
            (model) => model.id === selectedModelId,
          ) ?? null;
      if (!originalSettings.useOss && !selectedEditedModel) {
        throw new Error("Select an available model for the queued prompt.");
      }
      if (
        selectedReasoningEffort &&
        selectedEditedModel &&
        !selectedEditedModel.supportedReasoningEfforts.some(
          (option) =>
            option.reasoningEffort === selectedReasoningEffort,
        )
      ) {
        throw new Error(
          "Select an available reasoning level for the queued prompt.",
        );
      }
      const editedPlanMode = planMode;
      const editedGoalMode = !editedPlanMode && goalMode;
      const executionSettings = createRunExecutionSettings({
        accountId: originalSettings.accountId,
        profileKey: originalSettings.profileKey,
        selectedBranch: originalSettings.selectedBranch,
        mode: editedPlanMode ? "plan" : "run",
        intent: editedPlanMode ? "plan" : "normal",
        accessMode: originalSettings.accessMode,
        computerUseEnabled: originalSettings.computerUseEnabled,
        model: originalSettings.useOss
          ? originalSettings.model
          : selectedEditedModel?.model ?? null,
        reasoningEffort: originalSettings.useOss
          ? originalSettings.reasoningEffort
          : selectedReasoningEffort,
        useOss: originalSettings.useOss,
        ossProvider: originalSettings.ossProvider,
        contextFiles: contextFilesRef.current,
        selectedSkills: selectedSkillsRef.current,
        goalMode: editedGoalMode,
      });
      const contextFingerprint =
        await capturePromptQueueContextFingerprint({
          workspace,
          chat,
          executionSettings,
        });
      const snapshot = createQueuedPromptSnapshot({
        prompt: serializedPrompt,
        executionSettings,
        contextFingerprint,
      });
      const updated = await updatePromptQueueItemSnapshot(
        editor.item.id,
        snapshot,
      );
      if (!updated) {
        throw new Error("This queued prompt changed before it could be saved.");
      }
      upsertPromptQueueItemInMemory(updated);
      setPromptQueueComposerEditState(null);
      restorePromptQueueComposer(editor);
      focusPromptQueueComposer();
      setStatusMessage("Queued prompt updated.");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setPromptQueueComposerEditState({
        ...editor,
        status: "editing",
        error: message,
      });
      setStatusMessage(`Could not update queued prompt: ${message}`);
    }
  }

  async function removeQueuedPrompt(item: PromptQueueItem) {
    if (!isPromptQueueItemMutable(item)) return;
    setPromptQueueActionPendingItemId(item.id);
    try {
      if (!(await removePromptQueueItem(item.id))) {
        throw new Error("The prompt has already started.");
      }
      removePromptQueueItemFromMemory(item.chatId, item.id);
      setStatusMessage("Queued prompt removed.");
    } catch (error) {
      setStatusMessage(
        `Could not remove queued prompt: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    } finally {
      setPromptQueueActionPendingItemId(null);
    }
  }

  async function retryQueuedPrompt(item: PromptQueueItem) {
    setPromptQueueActionPendingItemId(item.id);
    try {
      const retried = await retryPromptQueueItem(item.id);
      if (!retried) throw new Error("The prompt is no longer retryable.");
      upsertPromptQueueItemInMemory(retried);
      setPromptQueuePaused(item.chatId, false);
      setStatusMessage("Queued prompt ready to retry.");
      schedulePromptQueueDispatch(item.chatId);
    } catch (error) {
      setStatusMessage(
        `Could not retry queued prompt: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    } finally {
      setPromptQueueActionPendingItemId(null);
    }
  }

  async function changeQueuedPromptAutoSend(
    item: PromptQueueItem,
    enabled: boolean,
  ) {
    const actionKey = `auto-send:${item.id}`;
    if (promptQueueActionLocksRef.current.has(actionKey)) return;
    promptQueueActionLocksRef.current.add(actionKey);
    setPromptQueueActionPendingItemId(item.id);
    try {
      const updated = await setPromptQueueItemAutoSend(item.id, enabled);
      if (!updated) {
        throw new Error(
          enabled
            ? "The prompt can no longer be restored."
            : "The prompt can no longer be held.",
        );
      }
      upsertPromptQueueItemInMemory(updated);

      const pauseReason = promptQueuePauseReasonsRef.current.get(item.chatId);
      if (
        enabled ||
        (!enabled && (pauseReason === "failure" || pauseReason === "stale"))
      ) {
        setPromptQueuePaused(item.chatId, false);
      }
      if (!pausedPromptQueueChatIdsRef.current.has(item.chatId)) {
        schedulePromptQueueDispatch(item.chatId);
      }
      setStatusMessage(
        enabled
          ? "Automatic sending restored for the queued prompt."
          : "Queued prompt held from automatic sending.",
      );
    } catch (error) {
      setStatusMessage(
        `Could not ${enabled ? "restore" : "hold"} queued prompt: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    } finally {
      promptQueueActionLocksRef.current.delete(actionKey);
      setPromptQueueActionPendingItemId(null);
    }
  }

  async function sendQueuedPromptNow(item: PromptQueueItem) {
    if (promptQueueActionPendingItemId === item.id) return;
    setPromptQueueActionPendingItemId(item.id);
    try {
      let prioritized = item;
      if (item.status === "failed" || item.status === "stale") {
        const retried = await retryPromptQueueItem(item.id, {
          autoSendEnabled: item.autoSendEnabled,
        });
        if (!retried) throw new Error("The prompt is no longer retryable.");
        prioritized = retried;
      }
      const next = await prioritizePromptQueueItem(prioritized.id);
      if (!next) throw new Error("The prompt could not be prioritized.");
      upsertPromptQueueItemInMemory(next);
      const activeControl = [...activeRunControlsRef.current.values()].find(
        (control) =>
          control.chatId === item.chatId && isActiveRunControl(control),
      );
      if (activeControl && (await steerQueuedPrompt(next, activeControl))) {
        return;
      }
      setPromptQueuePaused(item.chatId, false);
      schedulePromptQueueDispatch(item.chatId);
      setStatusMessage(
        activeControl
          ? "Queued prompt scheduled to run next."
          : "Queued prompt moved to the front.",
      );
    } catch (error) {
      setStatusMessage(
        `Could not prioritize queued prompt: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    } finally {
      setPromptQueueActionPendingItemId(null);
    }
  }

  async function reorderSelectedPromptQueue(orderedItemIds: string[]) {
    const chatId = selectedWorkspaceChatSession?.chatId;
    if (!chatId) return;
    const current = promptQueuesByChatRef.current[chatId] ?? [];
    const currentById = new Map(current.map((item) => [item.id, item]));
    const ordered = orderedItemIds
      .map((id) => currentById.get(id))
      .filter((item): item is PromptQueueItem => Boolean(item));
    const optimistic = ordered.map((item, index) => ({
      ...item,
      position: index,
    }));
    setChatPromptQueue(chatId, optimistic);
    try {
      if (!(await reorderPromptQueueItems(chatId, orderedItemIds))) {
        throw new Error("The queue changed while it was being reordered.");
      }
      await refreshPromptQueue(chatId);
    } catch (error) {
      await refreshPromptQueue(chatId).catch(() => undefined);
      setStatusMessage(
        `Could not reorder queue: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  async function handleEditLatestPrompt(
    entry: TaskChatEntry,
    nextPrompt: string,
  ) {
    markPerformance("orchestrator:submit:start");
    setEditedPromptNotice(null);

    const resolvedExecutionSettings = entry.executionSettings;
    const originalSettings = resolvedExecutionSettings?.settings;
    const originalContextFiles =
      originalSettings?.contextFiles ?? entry.contextFiles ?? [];
    const promptText = serializePromptInlineFileReferences(
      nextPrompt.trim(),
      originalContextFiles.filter((file) => file.source === "search"),
    );
    const workspace = selectedWorkspace;
    const showRerunIssue = (message: string) => {
      setStatusMessage(message);
      setEditedPromptNotice({
        kind: "rerun-error",
        workspaceId: entry.workspaceId,
        entryId: entry.clientId,
        message,
      });
    };

    if (!workspace || !promptText) {
      showRerunIssue("Select a workspace and provide a prompt before rerunning.");
      return;
    }
    if (!originalSettings) {
      showRerunIssue(
        "The original execution settings are unavailable, so this prompt cannot be rerun safely.",
      );
      return;
    }
    if (
      selectedWorkspaceChatSession?.origin === "codex_external" &&
      selectedWorkspaceChatSession.profileKey === DEFAULT_CODEX_PROFILE_KEY
    ) {
      showRerunIssue("External Codex chats can be continued, but edited prompts require an Orchestrator chat.");
      return;
    }
    if (entry.clientId !== editablePromptEntryId) {
      showRerunIssue("Only the latest prompt can be edited.");
      return;
    }
    if (selectedRunIsActiveNow()) {
      showRerunIssue("Wait for the active run to finish before editing a prompt.");
      return;
    }
    if (originalSettings.profileKey === DEFAULT_CODEX_PROFILE_KEY) {
      showRerunIssue(
        "Edited prompts are unavailable for runs from the default external Codex profile.",
      );
      return;
    }

    const account = codexAccountsRef.current.find(
      (candidate) => candidate.id === originalSettings.accountId,
    );
    if (!account) {
      showRerunIssue(
        "The Codex account used by the original prompt is no longer available.",
      );
      return;
    }
    if (account.status === "signed_out") {
      showRerunIssue(
        "Sign in to the Codex account used by the original prompt before rerunning it.",
      );
      return;
    }
    if (
      originalSettings.accessMode === "full-access" &&
      !window.confirm(accessModeWarning("full-access") ?? "")
    ) {
      return;
    }

    try {
      const branchList = await listGitBranches(workspace.path);
      if (
        originalSettings.selectedBranch &&
        !branchList.branches.includes(originalSettings.selectedBranch)
      ) {
        showRerunIssue(
          `The original branch ${originalSettings.selectedBranch} is no longer available.`,
        );
        return;
      }

      if (!originalSettings.useOss && originalSettings.model) {
        await ensureCodexProfileConnected(
          originalSettings.profileKey,
          originalSettings.accountId,
        );
        const availableModels = await listCodexModels(originalSettings.accountId);
        const originalModel = availableModels.find(
          (candidate) =>
            candidate.model === originalSettings.model ||
            candidate.id === originalSettings.model,
        );
        if (!originalModel) {
          showRerunIssue(
            `The original model ${originalSettings.model} is no longer available.`,
          );
          return;
        }
        if (
          originalSettings.reasoningEffort &&
          !originalModel.supportedReasoningEfforts.some(
            (option) =>
              option.reasoningEffort === originalSettings.reasoningEffort,
          )
        ) {
          showRerunIssue(
            `The original reasoning option ${formatReasoningEffort(
              originalSettings.reasoningEffort,
            )} is no longer available for ${originalModel.displayName}.`,
          );
          return;
        }
      }
    } catch (error) {
      showRerunIssue(
        `Could not validate the original run settings: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return;
    }

    const chatId = entry.chatId ?? selectedWorkspaceChatSession?.chatId ?? null;

    const editedTurnIndex =
      entry.turnIndex ??
      Math.max(
        1,
        visibleTaskChatEntries.findIndex(
          (chatEntry) => chatEntry.clientId === entry.clientId,
        ) + 1,
      );
    const previousEntries = visibleTaskChatEntries.filter((chatEntry) => {
      if (chatEntry.clientId === entry.clientId) {
        return false;
      }
      const currentTurnIndex = chatEntry.turnIndex ?? 0;
      return currentTurnIndex > 0 && currentTurnIndex < editedTurnIndex;
    });
    const snapshot: RunSetupSnapshot = {
      promptText,
      promptFallback: nextPrompt,
      workspace: { ...workspace },
      accountId: originalSettings.accountId,
      account: { ...account },
      profileKey: originalSettings.profileKey,
      chatOrigin: "orchestrator",
      externalThreadId: null,
      selectedBranch: originalSettings.selectedBranch,
      cachedPreflight: null,
      mode: originalSettings.mode,
      intent: originalSettings.intent,
      access: accessSettings({ accessMode: originalSettings.accessMode }),
      computerUseEnabled: originalSettings.computerUseEnabled,
      model: originalSettings.model,
      effort: originalSettings.reasoningEffort,
      useOss: originalSettings.useOss,
      ossProvider: originalSettings.ossProvider,
      improvedPrompt: improvePrompt(promptText),
      contextFiles: originalContextFiles.map((file) => ({ ...file })),
      selectedSkills: originalSettings.selectedSkills.map((skill) => ({
        ...skill,
      })),
      goalMode: originalSettings.goalMode,
      loginState,
      chatId,
      threadId: null,
      turnIndex: editedTurnIndex,
      threadStrategy: { kind: "fresh" },
      previousChatContext: buildPreviousChatContext(previousEntries),
      supersededRunIds: entry.runId !== null ? [entry.runId] : [],
      replacementClientId: entry.clientId,
      restoreEntryOnSetupFailure: entry,
      restorePromptOnSetupFailure: false,
      executionSettings: createRunExecutionSettings({
        ...originalSettings,
        contextFiles: originalContextFiles,
      }),
    };

    const runControl = beginOptimisticRun(snapshot);
    scheduleRunSetup(runControl, snapshot);
  }

  async function buildAccountHandoffContext(
    snapshot: RunSetupSnapshot,
    runControl: ActiveRunControl,
  ) {
    if (
      snapshot.threadStrategy.kind !== "handoff" ||
      snapshot.chatId === null
    ) {
      return null;
    }

    const chatWithRuns = await getChatWithRuns(snapshot.chatId);
    ensureRunControlActive(runControl);
    const turns: AccountHandoffContextTurn[] = [];

    if (chatWithRuns.chat.origin === "codex_external") {
      const sourceVersion =
        chatWithRuns.chat.external_updated_at ?? chatWithRuns.chat.updated_at;
      let externalSnapshot =
        (await readExternalTranscriptSnapshot(snapshot.chatId, sourceVersion)) ??
        (await readExternalTranscriptSnapshot(snapshot.chatId));
      ensureRunControlActive(runControl);

      if (
        chatWithRuns.chat.sync_status !== "adopted" &&
        (!externalSnapshot || externalSnapshot.sourceVersion !== sourceVersion)
      ) {
        const externalThreadId = chatWithRuns.chat.external_thread_id;
        if (!externalThreadId) {
          throw new Error("The imported chat is missing its source thread.");
        }
        try {
          await ensureCodexProfileConnected(DEFAULT_CODEX_PROFILE_KEY, 0);
          ensureRunControlActive(runControl);
          const synced = await syncDefaultProfileThreadTranscript({
            threadId: externalThreadId,
            sourceVersion,
            pageSize: HISTORY_CHAT_PAGE_SIZE,
            requestId: `handoff-${snapshot.chatId}-${runControl.clientId}`,
          });
          ensureRunControlActive(runControl);
          await activateExternalTranscriptSnapshot(snapshot.chatId, synced);
          externalSnapshot = await readExternalTranscriptSnapshot(
            snapshot.chatId,
            sourceVersion,
          );
        } catch (error) {
          if (!externalSnapshot) {
            throw new Error(
              `Could not prepare the imported chat for account handoff: ${
                error instanceof Error ? error.message : String(error)
              }`,
            );
          }
        }
      }

      externalSnapshot?.turns.forEach((turn) => {
        const normalizedPlan = normalizeHistoricalProposedPlan(turn.finalMessage);
        turns.push({
          turnIndex: turn.slotIndex + 1,
          prompt: turn.prompt,
          finalMessage:
            normalizedPlan.finalMessage || turn.error || "",
          completedPlan: normalizedPlan.planText,
          intent: normalizedPlan.planText ? "plan" : "normal",
          planReviewState: normalizedPlan.planText ? "available" : null,
        });
      });
    }

    chatWithRuns.runs.forEach((run, index) => {
      const normalizedPlan = normalizeHistoricalProposedPlan(
        run.final_message ?? "",
        run.completed_plan_text,
      );
      turns.push({
        turnIndex: run.turn_index ?? index + 1,
        prompt: run.original_prompt,
        finalMessage: normalizedPlan.finalMessage || run.error || "",
        completedPlan: normalizedPlan.planText,
        intent: run.run_intent,
        planReviewState: run.plan_review_state,
      });
    });

    return buildBoundedAccountHandoffContext(
      turns,
      snapshot.sourcePlanEntry?.runView.nativePlan.completedText ?? "",
      snapshot.handoffContextBudgetTokens ?? 16_000,
    );
  }

  async function buildAdditionalContext(
    profileKey: CodexProfileKey,
    accountId: number,
    files: ComposerContextFile[],
    workspaceId: number,
  ) {
    const additionalContext: Record<string, AdditionalContextEntry> = {};
    const errors = new Map<string, string>();
    const skippedFiles: string[] = [];

    for (const file of files.filter((file) => !isImageContextFile(file))) {
      try {
        const content = await readCodexFileForProfile(
          profileKey,
          accountId,
          file.path,
        );
        additionalContext[`file:${file.path}`] = {
          kind: "untrusted",
          value: `File: ${file.path}\n\n${content}`,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.set(file.path, message);
        skippedFiles.push(file.name);
      }
    }

    const rememberedFiles =
      workspaceTaskMemoriesRef.current[workspaceId]?.contextFiles ?? files;
    updateRememberedWorkspaceComposer(workspaceId, {
      contextFiles: rememberedFiles.map((file) =>
        isImageContextFile(file)
          ? { ...file, status: "ready", error: null }
          : errors.has(file.path)
            ? { ...file, status: "error", error: errors.get(file.path) }
            : { ...file, status: "ready", error: null },
      ),
    });

    return {
      additionalContext:
        Object.keys(additionalContext).length > 0 ? additionalContext : null,
      skippedFiles,
    };
  }

  async function handleAccountLoginCompleted(
    accountId: number,
    params: AccountLoginCompletedNotification,
  ) {
    const activeLoginId = pendingLoginIdRef.current;
    const loginIdMatches =
      pendingLoginAccountIdRef.current === accountId &&
      activeLoginId !== null &&
      (params.loginId === null || params.loginId === activeLoginId);

    if (!loginIdMatches) {
      return;
    }
    dismissExternalLoginNotification(accountId, activeLoginId);

    if (params.success) {
      resetLoginFlow();
      setLoginError(null);
      try {
        await refreshAccountState(accountId, true);
        if (selectedAccountIdRef.current === accountId) {
          await refreshCodexModels(accountId);
        }
        setStatusMessage("Codex sign-in completed.");
      } catch (error) {
        if (error instanceof DuplicateCodexAccountError) {
          return;
        }
        const message = error instanceof Error ? error.message : String(error);
        setLoginState("failed");
        setLoginError(message);
        setStatusMessage(`Sign-in failed: ${message}`);
      }
      return;
    }

    const message = params.error ?? "Codex sign-in failed.";
    resetLoginFlow("failed");
    setLoginError(message);
    await updateCodexAccount(accountId, {
      status: "error",
      lastError: message,
    });
    setStatusMessage(`Sign-in failed: ${message}`);
  }

  async function handleAccountUpdated(
    accountId: number,
    _params: AccountUpdatedNotification,
  ) {
    try {
      await refreshAccountState(accountId, false);
      if (
        selectedAccountIdRef.current === accountId &&
        (modelsRef.current.length === 0 || modelLoadErrorRef.current)
      ) {
        await refreshCodexModels(accountId);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (
        selectedAccountIdRef.current === accountId ||
        pendingLoginAccountIdRef.current === accountId
      ) {
        setLoginState("failed");
        setLoginError(message);
      }
    }
  }

  function flushFrameBatchedCodexNotifications() {
    if (pendingFrameCodexNotificationIdRef.current !== null) {
      window.cancelAnimationFrame(pendingFrameCodexNotificationIdRef.current);
      pendingFrameCodexNotificationIdRef.current = null;
    }

    const pending = pendingFrameCodexNotificationsRef.current.splice(0);
    if (pending.length === 0) {
      return runViewRef.current;
    }
    const messagesByControl = new Map<ActiveRunControl, CodexMessage[]>();
    pending.forEach(({ profileKey, message }) => {
      const control = findRunControlForMessage(profileKey, message);
      if (!control) return;
      const messages = messagesByControl.get(control) ?? [];
      messages.push(message);
      messagesByControl.set(control, messages);
    });
    messagesByControl.forEach((messages, control) => {
      const coalesced = coalesceFrameBatchedCodexMessages(messages);
      updateRunControlView(control, (current) =>
        coalesced.reduce(applyCodexMessage, current),
      );
    });
    return runViewRef.current;
  }

  function queueFrameBatchedCodexNotification(
    profileKey: CodexProfileKey,
    message: CodexMessage,
  ) {
    pendingFrameCodexNotificationsRef.current.push({ profileKey, message });
    if (pendingFrameCodexNotificationIdRef.current !== null) return;

    pendingFrameCodexNotificationIdRef.current = window.requestAnimationFrame(
      () => {
        pendingFrameCodexNotificationIdRef.current = null;
        flushFrameBatchedCodexNotifications();
      },
    );
  }

  function createRunEventInput(
    control: ActiveRunControl,
    eventType: RunEventInput["eventType"],
    method: string | null,
    payload: unknown,
  ) {
    const runId = control.runId;
    if (!runId) return null;

    control.eventSequence += 1;
    return {
      runId,
      sequence: control.eventSequence,
      eventType,
      method,
      payload,
    } satisfies RunEventInput;
  }

  function flushBufferedRunEvents() {
    if (pendingRunEventFlushTimerRef.current !== null) {
      window.clearTimeout(pendingRunEventFlushTimerRef.current);
      pendingRunEventFlushTimerRef.current = null;
    }

    const batch = pendingRunEventWritesRef.current.splice(0);
    if (batch.length === 0) return runEventWriteChainRef.current;

    const write = runEventWriteChainRef.current
      .catch(() => undefined)
      .then(() => appendRunEvents(batch));
    runEventWriteChainRef.current = write;
    return write;
  }

  function queueBufferedRunEvent(
    control: ActiveRunControl,
    eventType: RunEventInput["eventType"],
    method: string | null,
    payload: unknown,
  ) {
    const input = createRunEventInput(control, eventType, method, payload);
    if (!input) return;

    pendingRunEventWritesRef.current.push(input);
    if (pendingRunEventWritesRef.current.length >= RUN_EVENT_BATCH_MAX_SIZE) {
      void flushBufferedRunEvents().catch((error) => {
        console.error("Could not persist buffered Codex events", error);
      });
      return;
    }
    if (pendingRunEventFlushTimerRef.current !== null) return;

    pendingRunEventFlushTimerRef.current = window.setTimeout(() => {
      pendingRunEventFlushTimerRef.current = null;
      void flushBufferedRunEvents().catch((error) => {
        console.error("Could not persist buffered Codex events", error);
      });
    }, RUN_EVENT_BATCH_DELAY_MS);
  }

  function agentNotificationTargetVisible(target: AgentNotificationTarget) {
    if (target.kind === "external-action") {
      return target.accountId === selectedAccountIdRef.current;
    }

    if (
      activeViewRef.current !== "task" ||
      target.workspaceId !== selectedWorkspaceRef.current?.id
    ) {
      return false;
    }
    const session = target.workspaceId
      ? workspaceChatSessionsRef.current[target.workspaceId]
      : null;
    const targetChatVisible =
      target.chatId !== null && target.chatId !== undefined
        ? session?.chatId === target.chatId
        : taskChatEntriesRef.current.some(
            (entry) => entry.clientId === target.entryClientId,
          );
    if (target.subagentThreadId) {
      if (!targetChatVisible) return false;
      const inspected = subagentInspectorTargetRef.current;
      const record = findSubagentByThread(
        (target.profileKey ?? DEFAULT_CODEX_PROFILE_KEY) as CodexProfileKey,
        target.subagentThreadId,
      );
      if (!inspected || inspected.subagentId !== record?.id) return false;
      const kind =
        target.kind === "approval-required"
          ? "approval"
          : target.kind === "user-input-required"
            ? "user-input"
            : null;
      if (!kind) return true;
      const control = Array.from(
        document.querySelectorAll<HTMLElement>(
          `.subagent-inspector [data-agent-notification-target="${kind}"]`,
        ),
      ).find(
        (candidate) =>
          !target.requestId ||
          candidate.dataset.agentNotificationId === target.requestId,
      );
      if (!control) return false;
      const bounds = control.getBoundingClientRect();
      return (
        bounds.bottom > 0 &&
        bounds.right > 0 &&
        bounds.top < window.innerHeight &&
        bounds.left < window.innerWidth
      );
    }
    if (!targetChatVisible || target.kind !== "user-input-required") {
      return targetChatVisible;
    }

    const question = Array.from(
      document.querySelectorAll<HTMLElement>(
        '[data-agent-notification-target="user-input"]',
      ),
    ).find(
      (candidate) =>
        !target.requestId ||
        candidate.dataset.agentNotificationId === target.requestId,
    );
    if (!question) return false;
    const bounds = question.getBoundingClientRect();
    if (bounds.width === 0 && bounds.height === 0) return true;
    return (
      bounds.bottom > 0 &&
      bounds.right > 0 &&
      bounds.top < window.innerHeight &&
      bounds.left < window.innerWidth
    );
  }

  async function deliverAgentNotification(input: {
    kind: AgentNotificationKind;
    target: AgentNotificationTarget;
    chatTitle?: string | null;
    workspaceLabel?: string | null;
    accountLabel?: string | null;
    targetVisible?: boolean;
  }) {
    if (
      pendingNotificationDeliveryKeysRef.current.has(input.target.eventKey) ||
      wasAgentNotificationDelivered(input.target.eventKey)
    ) {
      return;
    }
    if (
      !shouldSendAgentNotification({
        kind: input.kind,
        preferences: agentNotificationPreferencesRef.current,
        permissionStatus: agentNotificationPermissionRef.current,
        appFocused: appFocusedRef.current,
        appVisible: appVisibleRef.current,
        targetVisible:
          input.targetVisible ?? agentNotificationTargetVisible(input.target),
      })
    ) {
      return;
    }

    pendingNotificationDeliveryKeysRef.current.add(input.target.eventKey);
    const copy = buildSafeAgentNotificationCopy(input);
    try {
      const result = await sendAgentNotification({
        ...copy,
        groupKey:
          input.target.chatId !== null && input.target.chatId !== undefined
            ? `chat:${input.target.chatId}`
            : input.target.workspaceId !== null &&
                input.target.workspaceId !== undefined
              ? `workspace:${input.target.workspaceId}`
              : input.target.accountId !== null &&
                  input.target.accountId !== undefined
                ? `account:${input.target.accountId}`
                : null,
        target: input.target,
      });
      agentNotificationPermissionRef.current = result.permissionStatus;
      setAgentNotificationPermission(result.permissionStatus);
      if (result.delivered) {
        recordAgentNotificationDelivered(input.target.eventKey);
      }
    } catch {
      // Notifications are supplementary; native delivery failures must not affect a run.
    } finally {
      pendingNotificationDeliveryKeysRef.current.delete(input.target.eventKey);
    }
  }

  function setAgentNotificationNavigationPhase(
    requestId: number,
    target: AgentNotificationTarget,
    phase: AgentNotificationNavigationPhase,
  ) {
    if (notificationNavigationSequenceRef.current !== requestId) return;
    setAgentNotificationNavigation({ requestId, target, phase });
  }

  function cancelPendingAgentNotificationFocus() {
    const pendingFocus = pendingAgentNotificationFocusRef.current;
    pendingAgentNotificationFocusRef.current = null;
    if (pendingFocus) {
      window.clearTimeout(pendingFocus.timeoutId);
      pendingFocus.resolve(false);
    }
    setTranscriptNotificationFocusRequest(null);
  }

  function cancelAgentNotificationNavigation() {
    notificationNavigationSequenceRef.current += 1;
    cancelPendingAgentNotificationFocus();
    setAgentNotificationNavigation(null);
  }

  function agentNotificationNavigationIsCurrent(requestId: number) {
    return notificationNavigationSequenceRef.current === requestId;
  }

  function findRunControlForAgentNotification(
    target: AgentNotificationTarget,
  ) {
    return (
      [...activeRunControlsRef.current.values()].find(
        (control) =>
          control.workspaceId === target.workspaceId &&
          ((target.entryClientId &&
            control.clientId === target.entryClientId) ||
            (target.runId !== null &&
              target.runId !== undefined &&
              control.runId === target.runId) ||
            (target.turnId && control.turnId === target.turnId) ||
            (target.chatId !== null &&
              target.chatId !== undefined &&
              control.chatId === target.chatId)),
      ) ?? null
    );
  }

  async function resolvePendingApprovalTarget(
    attention: PendingApprovalAttention,
  ): Promise<AgentNotificationTarget | null> {
    if (isAgentNotificationTargetNavigable(attention.target)) {
      return attention.target;
    }

    const entry = taskChatEntriesRef.current.find((candidate) =>
      pendingApprovalMatchesEntry(attention, candidate),
    );
    if (entry) {
      return {
        ...attention.target,
        workspaceId: entry.workspaceId,
        chatId: entry.chatId,
        runId: entry.runId,
        entryClientId: entry.clientId,
      };
    }

    const threadId = attention.request.threadId;
    if (!threadId) return null;

    const cachedChat = historyStateRef.current.chats.find(
      (chat) =>
        !chat.deleted_at &&
        (chat.codex_thread_id === threadId ||
          chat.external_thread_id === threadId),
    );
    if (cachedChat) {
      return {
        ...attention.target,
        workspaceId: cachedChat.workspace_id,
        chatId: cachedChat.id,
      };
    }

    const workspaceHistories = await Promise.all(
      workspacesRef.current.map(async (workspace) => {
        try {
          return await listWorkspaceChats(workspace.id);
        } catch {
          return [];
        }
      }),
    );
    const chat = workspaceHistories
      .flat()
      .find(
        (candidate) =>
          !candidate.deleted_at &&
          (candidate.codex_thread_id === threadId ||
            candidate.external_thread_id === threadId),
      );
    if (!chat) return null;

    return {
      ...attention.target,
      workspaceId: chat.workspace_id,
      chatId: chat.id,
    };
  }

  async function openPendingApprovalAttention(
    attention: PendingApprovalAttention,
  ) {
    const target = await resolvePendingApprovalTarget(attention);
    if (!target || !isAgentNotificationTargetNavigable(target)) {
      setStatusMessage(
        "The chat waiting for approval is no longer available.",
      );
      return;
    }

    setUnroutedApprovals((current) =>
      current.map((candidate) =>
        candidate.request.key === attention.request.key
          ? { ...candidate, target }
          : candidate,
      ),
    );
    const result = await handleAgentNotificationActivation(target);
    if (result === "retryable") {
      setStatusMessage("Could not open the chat waiting for approval.");
    }
  }

  function findEntryForAgentNotification(
    target: AgentNotificationTarget,
    workspaceId: number,
  ) {
    const workspaceEntries = taskChatEntriesRef.current.filter(
      (entry) =>
        entry.workspaceId === workspaceId &&
        (target.chatId === null ||
          target.chatId === undefined ||
          entry.chatId === target.chatId),
    );
    return (
      workspaceEntries.find(
        (entry) =>
          (target.entryClientId &&
            entry.clientId === target.entryClientId) ||
          (target.runId !== null &&
            target.runId !== undefined &&
            entry.runId === target.runId) ||
          (target.turnId && entry.runView.turnId === target.turnId),
      ) ??
      (target.entryClientId || target.runId !== null || target.turnId
        ? null
        : workspaceEntries[workspaceEntries.length - 1] ?? null)
    );
  }

  function openInMemoryAgentNotificationChat(
    workspace: Workspace,
    target: AgentNotificationTarget,
    runningControl: ActiveRunControl | null,
  ) {
    const entry = findEntryForAgentNotification(target, workspace.id);
    if (!entry) return false;

    const chatId = target.chatId ?? runningControl?.chatId ?? entry.chatId;
    const existingSession = workspaceChatSessionsRef.current[workspace.id];
    let session: WorkspaceChatSession | undefined;
    if (chatId !== null && chatId !== undefined) {
      if (existingSession?.chatId === chatId) {
        session = existingSession;
      } else if (runningControl && runningControl.chatId === chatId) {
        const chatEntries = taskChatEntriesRef.current.filter(
          (candidate) =>
            candidate.workspaceId === workspace.id &&
            candidate.chatId === chatId,
        );
        const latestTurnIndex = chatEntries.reduce(
          (latest, candidate) =>
            Math.max(latest, candidate.turnIndex ?? 0),
          0,
        );
        session = {
          chatId,
          threadId: runningControl.threadId,
          origin:
            runningControl.profileKey === DEFAULT_CODEX_PROFILE_KEY
              ? "codex_external"
              : "orchestrator",
          profileKey: runningControl.profileKey,
          externalThreadId:
            runningControl.profileKey === DEFAULT_CODEX_PROFILE_KEY
              ? runningControl.threadId
              : null,
          nextTurnIndex: Math.max(1, latestTurnIndex + 1),
        };
      } else {
        return false;
      }
    }

    const selectedSession =
      selectedWorkspaceRef.current?.id === workspace.id
        ? workspaceChatSessionsRef.current[workspace.id]
        : null;
    const sameVisibleChat =
      selectedWorkspaceRef.current?.id === workspace.id &&
      ((chatId !== null &&
        chatId !== undefined &&
        selectedSession?.chatId === chatId) ||
        (chatId === null &&
          selectedDraftChatEntryIdRef.current === entry.clientId));

    if (session) {
      rememberWorkspaceTaskSelection(
        workspace.id,
        { kind: "chat", session },
        null,
      );
    } else {
      rememberWorkspaceTaskSelection(
        workspace.id,
        { kind: "draft", clientId: entry.clientId },
        null,
      );
    }

    if (!sameVisibleChat) {
      historyChatLoadIdRef.current += 1;
      cancelActiveExternalTranscriptSync();
      cancelActiveHistoricalTranscriptPreparation();
      pendingTranscriptCommitRef.current = null;
      transcriptScrollActiveRef.current = false;
    }

    flushSync(() => {
      applyWorkspaceForChatNavigation(workspace);
      setChatHistoryContextMenu(null);
      if (session) {
        setWorkspaceChatSession(workspace.id, session);
        setSelectedDraftChat(null);
        setSelectedHistoryChatId(session.chatId);
      } else {
        setWorkspaceChatSession(workspace.id, undefined);
        setSelectedDraftChat(entry.clientId);
        setSelectedHistoryChatId(null);
      }
      if (!sameVisibleChat) {
        setHistoryChatLoadState(null);
        setHistoryOpenRequest(null);
        historicalTranscriptRef.current = null;
        setHistoricalTranscript(null);
      }
      closeHistoryDrawer();
      setSelectedRunAliases(runningControl);
    });
    if (chatId !== null && chatId !== undefined) {
      markWorkspaceChatRead(workspace.id, chatId);
    }
    selectWorkspaceExecutionAccount(workspace, session ?? null);
    return true;
  }

  async function focusSubagentNotificationTarget(
    target: AgentNotificationTarget,
    navigationRequestId: number,
  ) {
    if (!target.subagentThreadId) return false;
    let record = findSubagentByThread(
      (target.profileKey ?? DEFAULT_CODEX_PROFILE_KEY) as CodexProfileKey,
      target.subagentThreadId,
    );
    if (!record && target.chatId !== null && target.chatId !== undefined) {
      try {
        const records = await listChatSubagents(target.chatId);
        const conversationKey = subagentConversationKey({
          chatId: target.chatId,
        });
        if (conversationKey) {
          replaceConversationSubagents(conversationKey, records);
        }
        record =
          records.find(
            (candidate) =>
              candidate.childThreadId === target.subagentThreadId &&
              (!target.profileKey ||
                candidate.profileKey === target.profileKey),
          ) ?? null;
      } catch {
        return false;
      }
    }
    if (
      !record ||
      !agentNotificationNavigationIsCurrent(navigationRequestId)
    ) {
      return false;
    }

    openSubagentInspector(record);
    setAgentNotificationNavigationPhase(
      navigationRequestId,
      target,
      "focusing",
    );
    const notificationKind =
      target.kind === "approval-required"
        ? "approval"
        : target.kind === "user-input-required"
          ? "user-input"
          : null;
    if (!notificationKind) return true;

    const deadline = Date.now() + AGENT_NOTIFICATION_FOCUS_TIMEOUT_MS;
    while (
      Date.now() < deadline &&
      agentNotificationNavigationIsCurrent(navigationRequestId)
    ) {
      await waitForNextPaint();
      const candidates = Array.from(
        document.querySelectorAll<HTMLElement>(
          `.subagent-inspector [data-agent-notification-target="${notificationKind}"]`,
        ),
      );
      const targetElement =
        candidates.find(
          (candidate) =>
            !target.requestId ||
            candidate.dataset.agentNotificationId === target.requestId,
        ) ?? null;
      if (targetElement) {
        const focusTarget =
          targetElement.querySelector<HTMLElement>(
            'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
          ) ?? targetElement;
        focusTarget.focus({ preventScroll: true });
        return true;
      }
      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, 40);
      });
    }
    return false;
  }

  function focusAgentNotificationTarget(
    target: AgentNotificationTarget,
    navigationRequestId: number,
  ) {
    if (!agentNotificationNavigationIsCurrent(navigationRequestId)) {
      return Promise.resolve(false);
    }
    if (target.subagentThreadId) {
      return focusSubagentNotificationTarget(
        target,
        navigationRequestId,
      );
    }

    notificationFocusSequenceRef.current += 1;
    const focusRequest: TranscriptNotificationFocusRequest = {
      requestId: notificationFocusSequenceRef.current,
      kind:
        target.kind === "approval-required"
          ? "approval"
          : target.kind === "user-input-required"
            ? "user-input"
            : target.kind === "plan-ready"
              ? "plan"
              : "response",
      entryClientId: target.entryClientId ?? null,
      runId: target.runId ?? null,
      turnId: target.turnId ?? null,
      targetId: target.requestId ?? target.planItemId ?? null,
    };
    cancelPendingAgentNotificationFocus();
    setAgentNotificationNavigationPhase(
      navigationRequestId,
      target,
      "focusing",
    );
    return new Promise<boolean>((resolve) => {
      const timeoutId = window.setTimeout(() => {
        const pendingFocus = pendingAgentNotificationFocusRef.current;
        if (pendingFocus?.requestId !== focusRequest.requestId) return;
        pendingAgentNotificationFocusRef.current = null;
        setTranscriptNotificationFocusRequest((current) =>
          current?.requestId === focusRequest.requestId ? null : current,
        );
        resolve(false);
      }, AGENT_NOTIFICATION_FOCUS_TIMEOUT_MS);
      pendingAgentNotificationFocusRef.current = {
        requestId: focusRequest.requestId,
        timeoutId,
        resolve,
      };
      setTranscriptNotificationFocusRequest(focusRequest);
    });
  }

  async function completeAgentNotificationChatNavigation(
    target: AgentNotificationTarget,
    navigationRequestId: number,
  ): Promise<AgentNotificationNavigationResult> {
    await waitForHistoryDrawerClosed();
    await waitForNextPaint();
    if (!agentNotificationNavigationIsCurrent(navigationRequestId)) {
      return "retryable";
    }

    const focused = await focusAgentNotificationTarget(
      target,
      navigationRequestId,
    );
    if (!agentNotificationNavigationIsCurrent(navigationRequestId)) {
      return "retryable";
    }
    if (!focused) {
      setStatusMessage(
        "That notification target is no longer available in this chat.",
      );
      setAgentNotificationNavigation(null);
      return "retryable";
    }

    setAgentNotificationNavigationPhase(
      navigationRequestId,
      target,
      "complete",
    );
    return "complete";
  }

  async function handleAgentNotificationActivation(
    target: AgentNotificationTarget,
  ): Promise<AgentNotificationNavigationResult> {
    if (!isAgentNotificationTargetNavigable(target)) {
      setStatusMessage("That notification target is no longer available.");
      return "terminal";
    }

    cancelPendingAgentNotificationFocus();
    const navigationRequestId =
      notificationNavigationSequenceRef.current + 1;
    notificationNavigationSequenceRef.current = navigationRequestId;
    setAgentNotificationNavigation({
      requestId: navigationRequestId,
      target,
      phase: "resolving",
    });

    if (target.kind === "external-action") {
      const account = codexAccountsRef.current.find(
        (candidate) => candidate.id === target.accountId,
      );
      if (!account || account.status === "signed_in") {
        setStatusMessage("That sign-in action is no longer pending.");
        setAgentNotificationNavigation(null);
        return "terminal";
      }
      setSelectedAccountId(account.id);
      selectedAccountIdRef.current = account.id;
      activeViewRef.current = "settings";
      setActiveView("settings");
      window.requestAnimationFrame(() => {
        document
          .querySelector<HTMLElement>(`[data-managed-account-id="${account.id}"]`)
          ?.focus({ preventScroll: true });
      });
      setAgentNotificationNavigationPhase(
        navigationRequestId,
        target,
        "complete",
      );
      return "complete";
    }

    const workspace = workspacesRef.current.find(
      (candidate) => candidate.id === target.workspaceId,
    );
    if (!workspace) {
      setStatusMessage("The workspace for that notification is no longer available.");
      setAgentNotificationNavigation(null);
      return "terminal";
    }

    const runningControl = findRunControlForAgentNotification(target);
    if (
      runningControl &&
      openInMemoryAgentNotificationChat(
        workspace,
        target,
        runningControl,
      )
    ) {
      return completeAgentNotificationChatNavigation(
        target,
        navigationRequestId,
      );
    }

    if (
      openInMemoryAgentNotificationChat(
        workspace,
        target,
        null,
      )
    ) {
      return completeAgentNotificationChatNavigation(
        target,
        navigationRequestId,
      );
    }

    if (!agentNotificationNavigationIsCurrent(navigationRequestId)) {
      return "retryable";
    }
    setAgentNotificationNavigationPhase(
      navigationRequestId,
      target,
      "opening-chat",
    );

    let chats: ChatListItem[];
    try {
      chats = await listWorkspaceChats(workspace.id);
    } catch {
      setStatusMessage("Could not load the chat for that notification.");
      setAgentNotificationNavigation(null);
      return "retryable";
    }
    if (!agentNotificationNavigationIsCurrent(navigationRequestId)) {
      return "retryable";
    }
    const chat = chats.find(
      (candidate) =>
        candidate.id === target.chatId ||
        (target.threadId &&
          (candidate.codex_thread_id === target.threadId ||
            candidate.external_thread_id === target.threadId)),
    );
    if (!chat || chat.deleted_at) {
      setStatusMessage("That notification belongs to a deleted or unavailable chat.");
      setAgentNotificationNavigation(null);
      return "terminal";
    }

    const opened = await selectHistoryChat(chat, {
      source: "notification",
      workspace,
    });
    if (
      !opened ||
      !agentNotificationNavigationIsCurrent(navigationRequestId)
    ) {
      setAgentNotificationNavigation(null);
      return "retryable";
    }

    return completeAgentNotificationChatNavigation(
      target,
      navigationRequestId,
    );
  }

  async function handleCodexNotification(
    accountId: number,
    profileKey: CodexProfileKey,
    message: CodexMessage,
  ) {
    const method = message.method ?? null;

    const params = readObject(message.params);

    if (profileKey !== DEFAULT_CODEX_PROFILE_KEY && method === "account/login/completed") {
      await handleAccountLoginCompleted(accountId, readAccountLoginCompleted(params));
    }

    if (profileKey !== DEFAULT_CODEX_PROFILE_KEY && method === "account/updated") {
      await handleAccountUpdated(accountId, readAccountUpdated(params));
    }

    if (method === "serverRequest/resolved") {
      const requestId = params.requestId;
      const threadId = readString(params.threadId);
      const resolvedUserInputRequests = [
        ...activeRunControlsRef.current.values(),
      ].flatMap((control) =>
        control.profileKey === profileKey
          ? control.runView.serverRequests
              .filter(isNativeUserInputRequest)
              .filter(
                (request) =>
                  String(request.id) === String(requestId) &&
                  (!threadId || request.params.threadId === threadId),
              )
              .map((request) => ({ control, request }))
          : [],
      );
      const resolvedApprovals = [
        ...[...activeRunControlsRef.current.values()].flatMap(
          (control) => control.runView.approvalRequests,
        ),
        ...unroutedApprovalsRef.current.map(
          (attention) => attention.request,
        ),
      ].filter(
        (request) =>
          request.profileKey === profileKey &&
          String(request.id) === String(requestId) &&
          (!threadId || request.threadId === threadId),
      );
      resolvedApprovals.forEach((request) => {
        void removeAgentNotification(
          approvalNotificationEventKey(request),
        ).catch(() => undefined);
      });
      resolvedUserInputRequests.forEach(({ control, request }) => {
        void removeAgentNotification(
          userInputNotificationEventKey(control.profileKey, request),
        ).catch(() => undefined);
      });
      const remainingUnroutedApprovals =
        unroutedApprovalsRef.current.filter(
          ({ request }) =>
            request.profileKey !== profileKey ||
            String(request.id) !== String(requestId) ||
            Boolean(threadId && request.threadId !== threadId),
        );
      unroutedApprovalsRef.current = remainingUnroutedApprovals;
      setUnroutedApprovals(remainingUnroutedApprovals);
      if (typeof requestId === "string" || typeof requestId === "number") {
        activeRunControlsRef.current.forEach((control) => {
          if (control.profileKey !== profileKey) return;
          updateRunControlView(control, (current) =>
            resolveApprovalRequest(
              current,
              requestId,
              threadId ?? undefined,
            ),
          );
        });
      }
    }

    if (
      method === "turn/completed" ||
      method === "turn/interrupted" ||
      method === "error"
    ) {
      const identity = readCodexMessageRunIdentity(message);
      clearApprovalAttentionForRun(
        profileKey,
        identity.threadId,
        identity.turnId,
      );
    }

    const control = findRunControlForMessage(profileKey, message);
    if (!control) {
      bufferPendingRunBindingNotification(accountId, profileKey, message);
      return;
    }
    const identity = readCodexMessageRunIdentity(message);
    const trackedSubagents = trackSubagentCollaboration(control, message);
    if (
      trackedSubagents.length > 0 &&
      pendingRunBindingNotificationsRef.current.length > 0
    ) {
      await flushPendingRunBindingNotifications(control);
    }
    const childRecord = findSubagentByThread(profileKey, identity.threadId);
    const isChildThread =
      childRecord?.ownerClientId === control.clientId &&
      childRecord.childThreadId !== control.threadId;
    if (isChildThread && childRecord) {
      if (method === "item/started" || method === "item/completed") {
        applyBrowserLifecycleNotification(control, method, params);
      }
      const updatedChild = updateSubagentFromNotification(
        control,
        childRecord,
        message,
      );
      if (
        method === "turn/completed" ||
        method === "turn/interrupted" ||
        method === "error"
      ) {
        clearSubagentInteractions(control, childRecord.childThreadId);
        void loadSubagentTranscript(updatedChild)
          .then((transcript) => {
            const finalResult =
              transcript.turns
                .flatMap((turn) => turn.items)
                .reverse()
                .find(
                  (item) =>
                    item.kind === "assistant" &&
                    item.phase === "final_answer" &&
                    item.text.trim(),
                ) ?? null;
            if (!finalResult || finalResult.kind !== "assistant") return;
            const latest = findSubagentByThread(
              updatedChild.profileKey,
              updatedChild.childThreadId,
            );
            if (!latest) return;
            saveSubagentRecord({
              ...latest,
              finalResult: finalResult.text,
              updatedAt: new Date().toISOString(),
            });
          })
          .catch(() => undefined);
      }
      if (
        method === "serverRequest/resolved" &&
        !subagentHasPendingInteractions(control, childRecord.childThreadId)
      ) {
        setSubagentAttention(control, childRecord.childThreadId, false);
      }
      return;
    }
    if (
      method === "turn/started" &&
      identity.turnId &&
      control.acceptsThreadContinuation
    ) {
      control.turnId = identity.turnId;
      control.goalTurnCompleted = false;
      if (control.runId !== null) {
        void updateRun(control.runId, {
          codexTurnId: identity.turnId,
          status: "running",
        }).catch(() => undefined);
      }
    }
    if (method === "thread/goal/updated") {
      const goal = parseThreadGoal(params.goal, {
        fallbackThreadId: readString(params.threadId),
      });
      if (goal) {
        if (identity.turnId && identity.turnId !== control.turnId) {
          control.turnId = identity.turnId;
          if (goal.status !== "complete") {
            control.goalTurnCompleted = false;
          }
          if (control.runId !== null) {
            void updateRun(control.runId, {
              codexTurnId: identity.turnId,
              status: "running",
            }).catch(() => undefined);
          }
        }
        control.goal = goal;
        if (!control.goalActionPending) {
          control.goalActionError = null;
        }
        control.acceptsThreadContinuation = true;
      }
    } else if (method === "thread/goal/cleared") {
      control.goal = null;
      control.goalActionPending = null;
      control.goalActionError = null;
      control.acceptsThreadContinuation = false;
    }
    const intermediateGoalTurnCompleted =
      method === "turn/completed" &&
      control.acceptsThreadContinuation &&
      goalKeepsRunOpen(control.goal);
    const terminalTurnCompleted =
      method === "turn/completed" && !intermediateGoalTurnCompleted;
    inspectCodexMessageForWebPreview(control, message);
    applyBrowserLifecycleNotification(control, method, params);

    if (shouldFrameBatchCodexMessage(message)) {
      queueBufferedRunEvent(control, "notification", method, message);
      queueFrameBatchedCodexNotification(profileKey, message);
      return;
    }

    flushFrameBatchedCodexNotifications();

    const nextRunView = updateRunControlView(control, (current) => {
      let next = applyCodexMessage(current, message);
      if (intermediateGoalTurnCompleted) {
        next = {
          ...next,
          status: "running",
          completedAt: null,
          error: null,
        };
      }
      if (method !== "serverRequest/resolved") return next;
      const requestId = params.requestId;
      if (typeof requestId !== "string" && typeof requestId !== "number") {
        return next;
      }
      return resolveApprovalRequest(
        next,
        requestId,
        readString(params.threadId) ?? undefined,
      );
    });
    if (
      method === "turn/completed" ||
      (method === "turn/interrupted" &&
        !control.stopped &&
        goalKeepsRunOpen(control.goal))
    ) {
      control.goalTurnCompleted = true;
    }
    if (terminalTurnCompleted) {
      // Terminal UI state is authoritative immediately. Post-run persistence and
      // workspace refreshes must not leave this control registered as active.
      const terminalPreview = nextRunView.webPreview;
      if (terminalPreview) {
        void recheckWebPreview(terminalPreview, {
          entryClientId: control.clientId,
          runId: control.runId,
        });
      } else {
        const pendingCandidate = [
          ...control.webPreviewDetection.probes.entries(),
        ].sort((left, right) => right[1].sequence - left[1].sequence)[0];
        if (pendingCandidate) {
          probeTerminalWebPreview(
            pendingCandidate[0],
            pendingCandidate[1].sourceCommandId,
            {
              entryClientId: control.clientId,
              runId: control.runId,
            },
          );
        }
      }
      removeRunControl(control);
    }
    await persistRunEvent(control, "notification", method, message);

    if (method === "serverRequest/resolved") {
      const requestId = params.requestId;
      if (requestId !== undefined) {
        clearUserInputAutoResolutionTimer(profileKey, requestId as string | number);
      }
    }

    if (method === "thread/settings/updated") {
      const collaborationMode = readObject(
        readObject(params.threadSettings).collaborationMode,
      );
      const mode = readString(collaborationMode.mode);
      const chatId = control.chatId;
      if (chatId !== null && (mode === "plan" || mode === "default")) {
        await updateChat(chatId, { collaborationMode: mode });
      }
    }

    const runId = control.runId;
    if (!runId) {
      return;
    }

    if (method === "thread/tokenUsage/updated") {
      const reportedTokenUsage = readTokenUsage(params);
      const tokenUsage = reportedTokenUsage ? nextRunView.tokenUsage : null;
      if (tokenUsage) {
        await recordTokenUsage({
          runId,
          threadId: readString(params.threadId),
          turnId: readString(params.turnId),
          ...tokenUsage,
        });
      }
    }

    if (terminalTurnCompleted) {
      const turn = readObject(params.turn);
      const status = readString(turn.status) === "failed" ? "failed" : "completed";
      const completedControl = control;
      const completedEntry =
        taskChatEntriesRef.current.find(
          (entry) => entry.clientId === completedControl.clientId,
        ) ?? null;
      if (status === "completed") {
        const planReady = nextRunView.nativePlan.reviewState === "available";
        const kind: AgentNotificationKind = planReady
          ? "plan-ready"
          : "response-completed";
        const eventKey = planReady
          ? planNotificationEventKey(completedControl.profileKey, {
              runId,
              runView: nextRunView,
            })
          : createAgentNotificationEventKey(
              kind,
              completedControl.profileKey,
              nextRunView.threadId,
              nextRunView.turnId,
              runId,
            );
        const workspace = workspacesRef.current.find(
          (candidate) => candidate.id === completedEntry?.workspaceId,
        );
        void deliverAgentNotification({
          kind,
          target: {
            eventKey,
            kind,
            workspaceId: completedEntry?.workspaceId ?? null,
            chatId: completedControl.chatId,
            runId,
            entryClientId: completedControl.clientId,
            requestId: null,
            planItemId: nextRunView.nativePlan.planItemId,
            accountId:
              completedControl.profileKey === DEFAULT_CODEX_PROFILE_KEY
                ? null
                : completedControl.accountId,
            profileKey: completedControl.profileKey,
            threadId: nextRunView.threadId,
            turnId: nextRunView.turnId,
          },
          chatTitle: completedEntry?.prompt,
          workspaceLabel: workspace?.label,
        });
      }
      await updateRun(runId, {
        status,
        completedAt: new Date().toISOString(),
        durationMs: readNumber(turn.durationMs) ?? nextRunView.elapsedMs,
        finalMessage: nextRunView.finalMessage,
        error: status === "failed" ? JSON.stringify(turn.error ?? "Turn failed") : null,
        collaborationMode: nextRunView.nativePlan.mode,
        runIntent: nextRunView.nativePlan.intent,
        completedPlanItemId: nextRunView.nativePlan.planItemId,
        completedPlanText: nextRunView.nativePlan.completedText || null,
        planReviewState:
          nextRunView.nativePlan.reviewState === "submitting"
            ? "available"
            : nextRunView.nativePlan.reviewState,
      });
      if (completedControl.taskId) {
        await updateTaskStatus(completedControl.taskId, status);
      }
      const activeChatId = completedControl.chatId;
      if (activeChatId !== null) {
        await updateChat(activeChatId, { status }).catch(() => undefined);
      }
      if (completedControl.queueItemId && activeChatId !== null) {
        if (status === "completed") {
          await completePromptQueueItem(completedControl.queueItemId).catch(
            () => null,
          );
          removePromptQueueItemFromMemory(
            activeChatId,
            completedControl.queueItemId,
          );
          await rebaselineQueuedPromptContexts(activeChatId).catch(
            () => undefined,
          );
          if (nextRunView.nativePlan.reviewState === "available") {
            setPromptQueuePaused(activeChatId, true, "workflow");
          } else if (completedControl.queueAdvanceBlocked) {
            setPromptQueuePaused(activeChatId, true, "manual");
            setStatusMessage(
              "Prompt queue paused after an approval was denied or a question went unanswered.",
            );
          } else {
            schedulePromptQueueDispatch(activeChatId);
          }
        } else {
          const failedQueueItem = await failPromptQueueItem(
            completedControl.queueItemId,
            nextRunView.error ?? "Codex could not complete this queued prompt.",
          ).catch(() => null);
          if (failedQueueItem) {
            upsertPromptQueueItemInMemory(failedQueueItem);
          }
          setPromptQueuePaused(activeChatId, true, "failure");
        }
      } else if (activeChatId !== null) {
        await advanceChatConversationRevision(activeChatId, {
          queueOwned: false,
        }).catch(() => undefined);
        const pendingQueue = await refreshPromptQueue(activeChatId).catch(
          () => [],
        );
        if (pendingQueue.length > 0) {
          if (status === "failed") {
            setPromptQueuePaused(activeChatId, true, "failure");
          } else if (nextRunView.nativePlan.reviewState === "available") {
            setPromptQueuePaused(activeChatId, true, "workflow");
          } else if (completedControl.queueAdvanceBlocked) {
            setPromptQueuePaused(activeChatId, true, "manual");
            setStatusMessage(
              "Prompt queue paused after an approval was denied or a question went unanswered.",
            );
          } else {
            const pauseReason =
              promptQueuePauseReasonsRef.current.get(activeChatId);
            if (pauseReason === "workflow") {
              setPromptQueuePaused(activeChatId, false);
            }
            if (!pausedPromptQueueChatIdsRef.current.has(activeChatId)) {
              schedulePromptQueueDispatch(activeChatId);
            }
          }
        }
      }
      const completedWorkspace = completedControl
        ? workspacesRef.current.find(
            (workspace) => workspace.id === completedControl.workspaceId,
          ) ?? null
        : null;
      if (completedWorkspace) {
        invalidateWorkspacePreviewCaches(completedWorkspace, undefined, {
          reloadOpenPreview: true,
        });
        await Promise.all([
          refreshWorkspaceGitStatus(completedWorkspace, {
            showLoading: false,
            force: true,
          }),
          refreshWorkspaceDirectoriesAfterRun(completedWorkspace),
          selectedWorkspaceRef.current?.id === completedWorkspace.id
            ? refreshWorkspaceData(completedWorkspace.id)
            : Promise.resolve(),
        ]);
      }
      if (
        activeChatId !== null &&
        !(
          activeViewRef.current === "task" &&
          runControlIsSelected(completedControl)
        )
      ) {
        setUnreadCompletedChats((current) => {
          const workspaceChats = current[completedControl.workspaceId] ?? [];
          if (workspaceChats.includes(activeChatId)) return current;
          return {
            ...current,
            [completedControl.workspaceId]: [...workspaceChats, activeChatId],
          };
        });
      }
      if (selectedWorkspaceRef.current?.id === completedControl.workspaceId) {
        await refreshSelectedWorkspaceHistory();
      }
    }
    if (
      method === "thread/goal/updated" &&
      control.goal?.status === "complete" &&
      control.goalTurnCompleted &&
      activeRunControlsRef.current.get(control.clientId) === control
    ) {
      control.goalTurnCompleted = false;
      await handleCodexNotification(accountId, profileKey, {
        method: "turn/completed",
        params: {
          threadId: control.threadId,
          turn: {
            id: control.turnId,
            status: "completed",
            durationMs: control.runView.elapsedMs,
            error: null,
          },
        },
      });
    }
  }

  async function handleCodexServerRequest(
    accountId: number,
    profileKey: CodexProfileKey,
    request: CodexMessage,
    requestToken: string | null,
  ) {
    if (!requestToken) {
      const warning =
        "Codex sent a server request without a one-shot request token. It was left unresolved for safety.";
      setStatusMessage(warning);
      setApprovalSafetyWarning(warning);
      return;
    }
    flushFrameBatchedCodexNotifications();
    const {
      threadId: requestThreadId,
      turnId: requestTurnId,
    } = readCodexMessageRunIdentity(request);
    const control = findRunControlForIds(
      profileKey,
      requestThreadId,
      requestTurnId,
    );
    const requestSubagent = findSubagentByThread(
      profileKey,
      requestThreadId,
    );
    const requestBelongsToSubagent =
      control !== null &&
      requestSubagent?.ownerClientId === control.clientId;
    const parsed = parseApprovalRequest({
      message: request,
      profileKey,
      requestToken,
      interactionMode: control?.interactionMode ?? "chat",
      activePlaywrightToolCalls:
        control?.browserSession?.state.target.accessMode ===
        "ask-for-approval"
          ? [...control.activePlaywrightToolCalls.values()]
          : [],
    });
    if (parsed && !isNativeUserInputRequest(request)) {
      if (
        parsed.kind === "browser" &&
        (!control?.browserSession ||
          control.browserSession.token !==
            parsed.browserRequest?.sessionToken)
      ) {
        parsed.kind = "unsupported";
        parsed.browserRequest = null;
        parsed.choices = [];
        parsed.error =
          "This browser approval did not match the active isolated browser session.";
      }
      if (
        parsed.kind === "browser-tool" &&
        (!control?.browserSession ||
          control.browserSession.state.target.accessMode !==
            "ask-for-approval" ||
          !parsed.browserToolRequest ||
          !control.activePlaywrightToolCalls.has(
            parsed.browserToolRequest.itemId,
          ))
      ) {
        parsed.kind = "unsupported";
        parsed.browserToolRequest = null;
        parsed.choices = [];
        parsed.error =
          "This browser tool approval did not match the active isolated browser session.";
      }
      const belongsToActiveRun = control !== null;
      const shouldNotify = [
        "command",
        "file-change",
        "permissions",
        "legacy-command",
        "legacy-file-change",
        "browser",
        "browser-tool",
      ].includes(parsed.kind);
      const historyChat = !belongsToActiveRun
        ? historyStateRef.current.chats.find(
            (chat) =>
              chat.profile_key === profileKey &&
              Boolean(parsed.threadId) &&
              (chat.codex_thread_id === parsed.threadId ||
                chat.external_thread_id === parsed.threadId),
          ) ?? null
        : null;
      const activeEntry = belongsToActiveRun
        ? taskChatEntriesRef.current.find(
            (entry) => entry.clientId === control?.clientId,
          ) ?? null
        : null;
      const workspaceId =
        activeEntry?.workspaceId ?? historyChat?.workspace_id ?? null;
      const workspace = workspacesRef.current.find(
        (candidate) => candidate.id === workspaceId,
      );
      const eventKey = approvalNotificationEventKey(parsed);
      const notificationTarget: AgentNotificationTarget = {
        eventKey,
        kind: "approval-required",
        workspaceId,
        chatId: control?.chatId ?? historyChat?.id ?? null,
        runId: control?.runId ?? null,
        entryClientId: control?.clientId ?? null,
        requestId: parsed.key,
        planItemId: null,
        accountId:
          profileKey === DEFAULT_CODEX_PROFILE_KEY ? null : accountId,
        profileKey,
        threadId: parsed.threadId,
        turnId: parsed.turnId,
        subagentThreadId: requestBelongsToSubagent
          ? requestSubagent.childThreadId
          : null,
      };
      const notifyApproval = () => {
        if (!shouldNotify) return;
        void deliverAgentNotification({
          kind: "approval-required",
          target: notificationTarget,
          chatTitle: requestBelongsToSubagent
            ? requestSubagent?.task
            : activeEntry?.prompt ?? historyChat?.title,
          workspaceLabel: workspace?.label,
        });
      };

      if (!belongsToActiveRun) {
        const attention: PendingApprovalAttention = {
          accountId,
          request: parsed,
          target: notificationTarget,
        };
        const hasPotentialOwner = [
          ...activeRunControlsRef.current.values(),
        ].some((candidate) =>
          pendingApprovalCouldBelongToControl(attention, candidate),
        );
        if (!hasPotentialOwner) {
          void rejectOrphanedApproval(attention);
          return;
        }
        if (
          !unroutedApprovalsRef.current.some(
            (candidate) => candidate.request.key === parsed.key,
          )
        ) {
          const next = [...unroutedApprovalsRef.current, attention];
          unroutedApprovalsRef.current = next;
          setUnroutedApprovals(next);
        }
        setStatusMessage(
          "Codex is waiting for approval in another conversation. The request remains blocked and was not approved.",
        );
        notifyApproval();
        return;
      }

      updateRunControlView(control, (current) => addApprovalRequest(current, parsed));
      if (requestBelongsToSubagent) {
        setSubagentAttention(control, requestSubagent.childThreadId, true);
      }
      if (parsed.kind === "browser" || parsed.kind === "browser-tool") {
        setRunControlBrowserLifecycle(control, "awaiting-approval");
      }
      notifyApproval();
      await persistRunEvent(
        control,
        "server-request",
        request.method ?? null,
        request,
      );
      return;
    }

    if (!control) return;
    if (
      request.id !== undefined &&
      control.runView.serverRequests.some(
        (existing) => String(existing.id) === String(request.id),
      )
    ) {
      return;
    }
    const routedRequest = { ...request, requestToken };
    updateRunControlView(control, (current) =>
      addServerRequest(current, routedRequest),
    );
    await persistRunEvent(
      control,
      "server-request",
      request.method ?? null,
      request,
    );
    if (isNativeUserInputRequest(routedRequest)) {
      const activeEntry =
        taskChatEntriesRef.current.find(
          (entry) => entry.clientId === control.clientId,
        ) ?? null;
      const workspace =
        workspacesRef.current.find(
          (candidate) => candidate.id === control.workspaceId,
        ) ?? null;
      const eventKey = userInputNotificationEventKey(
        profileKey,
        routedRequest,
      );
      const target: AgentNotificationTarget = {
        eventKey,
        kind: "user-input-required",
        workspaceId: control.workspaceId,
        chatId: control.chatId,
        runId: control.runId,
        entryClientId: control.clientId,
        requestId: requestKey(routedRequest),
        planItemId: null,
        accountId:
          profileKey === DEFAULT_CODEX_PROFILE_KEY ? null : accountId,
        profileKey,
        threadId: routedRequest.params.threadId,
        turnId: routedRequest.params.turnId,
        subagentThreadId: requestBelongsToSubagent
          ? requestSubagent.childThreadId
          : null,
      };
      if (requestBelongsToSubagent) {
        setSubagentAttention(control, requestSubagent.childThreadId, true);
      }
      window.requestAnimationFrame(() => {
        if (
          activeRunControlsRef.current.get(control.clientId) !== control ||
          !control.runView.serverRequests.some(
            (candidate) =>
              isNativeUserInputRequest(candidate) &&
              requestKey(candidate) === requestKey(routedRequest),
          )
        ) {
          return;
        }
        void deliverAgentNotification({
          kind: "user-input-required",
          target,
          chatTitle: requestBelongsToSubagent
            ? requestSubagent?.task
            : activeEntry?.prompt ?? control.promptFallback,
          workspaceLabel: workspace?.label,
        });
      });
    }
    if (isNativeUserInputRequest(request) && request.params.autoResolutionMs) {
      const routedUserInputRequest = { ...request, requestToken };
      const timerKey = `${profileKey}:${requestKey(request)}`;
      const timer = window.setTimeout(() => {
        userInputAutoResolutionTimersRef.current.delete(timerKey);
        const activeEntry = taskChatEntriesRef.current.find(
          (entry) => entry.clientId === control.clientId,
        );
        if (activeEntry) {
          control.queueAdvanceBlocked = true;
          void handleAnswerUserInput(activeEntry, routedUserInputRequest, {
            answers: {},
          });
        }
      }, request.params.autoResolutionMs);
      userInputAutoResolutionTimersRef.current.set(timerKey, timer);
    }
  }

  function clearUserInputAutoResolutionTimer(
    profileKey: CodexProfileKey,
    requestId: string | number,
  ) {
    const key = `${profileKey}:${String(requestId)}`;
    const timer = userInputAutoResolutionTimersRef.current.get(key);
    if (timer !== undefined) window.clearTimeout(timer);
    userInputAutoResolutionTimersRef.current.delete(key);
  }

  async function persistRunEvent(
    control: ActiveRunControl,
    eventType: "notification" | "server-request" | "process" | "client-action",
    method: string | null,
    payload: unknown,
  ) {
    await flushBufferedRunEvents();
    const input = createRunEventInput(control, eventType, method, payload);
    if (input) await appendRunEvent(input);
  }

  async function handleResolveRequest(
    request: CodexApprovalRequest,
    choice: ApprovalChoice,
  ) {
    const control = findRunControlForIds(
      request.profileKey,
      request.threadId,
      request.turnId,
    );
    if (!control) {
      const attention = unroutedApprovalsRef.current.find(
        (candidate) => candidate.request.key === request.key,
      );
      const currentRequest = attention?.request;
      const selectedChoice = currentRequest?.choices.find(
        (candidate) => candidate.id === choice.id,
      );
      if (
        !attention ||
        !currentRequest ||
        (currentRequest.status !== "pending" &&
          currentRequest.status !== "error") ||
        !selectedChoice
      ) {
        return;
      }

      setUnroutedApprovals((current) =>
        current.map((candidate) =>
          candidate.request.key === currentRequest.key
            ? {
                ...candidate,
                request: {
                  ...candidate.request,
                  status: "submitting",
                  selectedChoiceId: selectedChoice.id,
                  error: null,
                },
              }
            : candidate,
        ),
      );
      try {
        if (currentRequest.profileKey === DEFAULT_CODEX_PROFILE_KEY) {
          await resolveDefaultCodexServerRequest(
            currentRequest.id,
            currentRequest.requestToken,
            selectedChoice.response,
          );
        } else {
          await resolveCodexServerRequest(
            attention.accountId,
            currentRequest.id,
            currentRequest.requestToken,
            selectedChoice.response,
          );
        }
        void removeAgentNotification(
          approvalNotificationEventKey(currentRequest),
        ).catch(() => undefined);
        setUnroutedApprovals((current) =>
          current.map((candidate) =>
            candidate.request.key === currentRequest.key
              ? {
                  ...candidate,
                  request: {
                    ...candidate.request,
                    status: "awaiting-resolution",
                    error: null,
                  },
                }
              : candidate,
          ),
        );
      } catch (error) {
        setUnroutedApprovals((current) =>
          current.map((candidate) =>
            candidate.request.key === currentRequest.key
              ? {
                  ...candidate,
                  request: {
                    ...candidate.request,
                    status: "error",
                    error:
                      error instanceof Error
                        ? error.message
                        : String(error),
                  },
                }
              : candidate,
          ),
        );
      }
      return;
    }
    const accountId = control.accountId;
    const profileKey = control.profileKey;
    const currentRequest = control.runView.approvalRequests.find(
      (candidate) => candidate.key === request.key,
    );
    const requestSubagent = findSubagentByThread(
      currentRequest?.profileKey ?? request.profileKey,
      currentRequest?.threadId ?? request.threadId,
    );
    const requestBelongsToSubagent =
      requestSubagent?.ownerClientId === control.clientId;
    const selectedChoice = currentRequest?.choices.find(
      (candidate) => candidate.id === choice.id,
    );
    if (
      !currentRequest ||
      (currentRequest.status !== "pending" && currentRequest.status !== "error") ||
      !selectedChoice ||
      currentRequest.profileKey !== profileKey
    ) {
      return;
    }
    if (
      currentRequest.threadId &&
      control?.threadId &&
      currentRequest.threadId !== control.threadId &&
      !requestBelongsToSubagent
    ) {
      updateRunControlView(control, (current) =>
        markApprovalError(
          current,
          request.key,
          "This approval belongs to a different Codex thread.",
        ),
      );
      return;
    }
    if (
      currentRequest.turnId &&
      ((requestBelongsToSubagent &&
        requestSubagent?.childTurnId &&
        currentRequest.turnId !== requestSubagent.childTurnId) ||
        (!requestBelongsToSubagent &&
          control?.turnId &&
          currentRequest.turnId !== control.turnId))
    ) {
      updateRunControlView(control, (current) =>
        markApprovalError(
          current,
          currentRequest.key,
          "This approval belongs to a different Codex turn.",
        ),
      );
      return;
    }

    updateRunControlView(control, (current) =>
      markApprovalSubmitting(current, currentRequest.key, selectedChoice.id),
    );
    try {
      if (profileKey === DEFAULT_CODEX_PROFILE_KEY) {
        await resolveDefaultCodexServerRequest(
          currentRequest.id,
          currentRequest.requestToken,
          selectedChoice.response,
        );
      } else {
        await resolveCodexServerRequest(
          accountId,
          currentRequest.id,
          currentRequest.requestToken,
          selectedChoice.response,
        );
      }
      if (selectedChoice.tone === "danger") {
        control.queueAdvanceBlocked = true;
      }
      void removeAgentNotification(
        approvalNotificationEventKey(currentRequest),
      ).catch(() => undefined);
      updateRunControlView(control, (current) =>
        markApprovalAwaitingResolution(current, currentRequest.key),
      );
      if (
        currentRequest.kind === "browser" ||
        currentRequest.kind === "browser-tool"
      ) {
        setRunControlBrowserLifecycle(control, "running");
        void refreshRunControlBrowserState(control);
      }
    } catch (error) {
      updateRunControlView(control, (current) =>
        markApprovalError(
          current,
          currentRequest.key,
          error instanceof Error ? error.message : String(error),
        ),
      );
    }
  }

  async function handleAnswerUserInput(
    entry: TaskChatEntry,
    request: NativeUserInputRequest,
    response: UserInputResponse,
  ) {
    const actionKey = `${request.params.threadId}:${request.params.turnId}:${requestKey(request)}`;
    if (requestActionLocksRef.current.has(actionKey)) return;
    const control = activeRunControlsRef.current.get(entry.clientId) ?? null;
    if (!control) {
      setStatusMessage("That Codex question is no longer active.");
      return;
    }
    const activeEntryId = control.clientId;
    const accountId = control.accountId;
    const profileKey = control.profileKey;
    const requestSubagent = findSubagentByThread(
      profileKey,
      request.params.threadId,
    );
    const requestBelongsToSubagent =
      requestSubagent?.ownerClientId === control.clientId;
    const matchesThread =
      request.params.threadId === control.threadId ||
      requestBelongsToSubagent;
    const matchesTurn = requestBelongsToSubagent
      ? !requestSubagent?.childTurnId ||
        requestSubagent.childTurnId === request.params.turnId
      : request.params.turnId === control.turnId;
    if (
      activeEntryId !== entry.clientId ||
      !matchesThread ||
      !matchesTurn ||
      !control.runView.serverRequests.some(
        (candidate) => String(candidate.id) === String(request.id),
      )
    ) {
      setStatusMessage("That Codex question is no longer active.");
      return;
    }
    requestActionLocksRef.current.add(actionKey);

    const requestToken = request.requestToken;
    if (!requestToken) {
      requestActionLocksRef.current.delete(actionKey);
      setStatusMessage("That Codex question is missing its native request token.");
      return;
    }

    updateRunControlView(control, (current) =>
      setServerRequestSubmissionState(current, request, "submitting"),
    );
    clearUserInputAutoResolutionTimer(profileKey, request.id);
    try {
      if (profileKey === DEFAULT_CODEX_PROFILE_KEY) {
        await resolveDefaultCodexServerRequest(request.id, requestToken, response);
      } else {
        await resolveCodexServerRequest(accountId, request.id, requestToken, response);
      }
      void removeAgentNotification(
        userInputNotificationEventKey(profileKey, request),
      ).catch(() => undefined);
    } catch (error) {
      requestActionLocksRef.current.delete(actionKey);
      updateRunControlView(control, (current) =>
        setServerRequestSubmissionState(current, request, "failed"),
      );
      setStatusMessage(
        `Could not send Codex input: ${error instanceof Error ? error.message : String(error)}`,
      );
      return;
    }

    try {
      await persistRunEvent(control, "client-action", request.method, {
        requestId: request.id,
        threadId: request.params.threadId,
        turnId: request.params.turnId,
        response: {
          answers: Object.fromEntries(
            request.params.questions.map((question) => [
              question.id,
              question.isSecret
                ? { answers: ["<redacted>"] }
                : response.answers[question.id] ?? { answers: [] },
            ]),
          ),
        },
      });
    } catch (error) {
      setStatusMessage(
        `Codex accepted the answer, but Orchestrator could not save its audit event: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
    updateRunControlView(control, (current) =>
      resolveServerRequest(current, request.id),
    );
    if (
      requestBelongsToSubagent &&
      requestSubagent &&
      !subagentHasPendingInteractions(control, requestSubagent.childThreadId)
    ) {
      setSubagentAttention(control, requestSubagent.childThreadId, false);
    }
    requestActionLocksRef.current.delete(actionKey);
  }

  function choosePlanImplementationModel(
    availableModels: CodexModel[],
    preferredModel: string | null | undefined,
  ) {
    return (
      availableModels.find(
        (model) =>
          model.id === preferredModel || model.model === preferredModel,
      ) ??
      availableModels.find((model) => model.isDefault) ??
      availableModels[0] ??
      null
    );
  }

  function choosePlanImplementationReasoning(
    model: CodexModel | null,
    preferredEffort: string | null | undefined,
  ) {
    if (!model) return null;
    const supported = model.supportedReasoningEfforts.map(
      (option) => option.reasoningEffort,
    );
    if (preferredEffort && supported.includes(preferredEffort)) {
      return preferredEffort;
    }
    if (supported.includes(model.defaultReasoningEffort)) {
      return model.defaultReasoningEffort;
    }
    return supported[0] ?? null;
  }

  async function listValidatedPlanImplementationModels(
    profileKey: CodexProfileKey,
    accountId: number,
  ) {
    await ensureCodexProfileConnected(profileKey, accountId);
    if (profileKey !== DEFAULT_CODEX_PROFILE_KEY) {
      const authState = await refreshAccountState(accountId, true);
      if (
        shouldBlockRunForAuth(
          authState.requiresOpenaiAuth,
          authState.account,
        )
      ) {
        throw new Error("Sign in to the selected Codex account first.");
      }
    }
    return listCodexModelsForProfile(profileKey, accountId);
  }

  function closePlanImplementationDialog() {
    planImplementationDialogRequestRef.current += 1;
    setPlanImplementationDialog(null);
    const returnTarget = planImplementationReturnFocusRef.current;
    planImplementationReturnFocusRef.current = null;
    window.requestAnimationFrame(() => {
      if (returnTarget?.isConnected) {
        returnTarget.focus({ preventScroll: true });
      }
    });
  }

  function trapPlanImplementationDialogFocus(
    event: ReactKeyboardEvent<HTMLElement>,
  ) {
    if (event.key !== "Tab") return;
    const dialog = planImplementationDialogRef.current;
    if (!dialog || !dialog.contains(event.target as Node)) return;
    const focusable = Array.from(
      dialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [role="combobox"]:not([aria-disabled="true"]), [href], input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ).filter(
      (element) =>
        element.getAttribute("aria-hidden") !== "true" && !element.hidden,
    );
    if (focusable.length === 0) {
      event.preventDefault();
      dialog.focus({ preventScroll: true });
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus({ preventScroll: true });
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus({ preventScroll: true });
    }
  }

  async function openPlanImplementationDialog(entry: TaskChatEntry) {
    const workspace = selectedWorkspaceRef.current;
    const session = workspace
      ? workspaceChatSessionsRef.current[workspace.id] ?? null
      : null;
    if (
      !workspace ||
      !session ||
      entry.chatId === null ||
      session.chatId !== entry.chatId ||
      !session.threadId
    ) {
      setStatusMessage("Reopen the plan's chat before implementing it.");
      return;
    }
    if (selectedRunIsActiveNow()) {
      setStatusMessage("Wait for the active turn to finish first.");
      return;
    }

    const preferredSettings =
      entry.executionSettings?.source === "captured"
        ? entry.executionSettings.settings
        : null;
    const preferredProfileKey = preferredSettings?.profileKey ?? null;
    const profileKey: CodexProfileKey =
      preferredProfileKey === DEFAULT_CODEX_PROFILE_KEY &&
      session.profileKey !== DEFAULT_CODEX_PROFILE_KEY
        ? session.profileKey ?? DEFAULT_CODEX_PROFILE_KEY
        : preferredProfileKey ??
          session.profileKey ??
          DEFAULT_CODEX_PROFILE_KEY;
    const accountId =
      profileKey === DEFAULT_CODEX_PROFILE_KEY
        ? 0
        : accountIdFromProfileKey(profileKey);
    if (accountId === null) {
      setStatusMessage("The plan's Codex account is unavailable.");
      return;
    }

    const requestId = planImplementationDialogRequestRef.current + 1;
    planImplementationDialogRequestRef.current = requestId;
    if (document.activeElement instanceof HTMLElement) {
      planImplementationReturnFocusRef.current = document.activeElement;
    }
    setPlanImplementationDialog({
      requestId,
      workspaceId: workspace.id,
      chatId: session.chatId,
      entry,
      allowDefaultProfile:
        session.profileKey === DEFAULT_CODEX_PROFILE_KEY,
      accountId,
      profileKey,
      models: [],
      selectedModelId: null,
      reasoningEffort: preferredSettings?.reasoningEffort ?? null,
      status: "loading",
      error: null,
    });

    try {
      const availableModels = await listValidatedPlanImplementationModels(
        profileKey,
        accountId,
      );
      if (planImplementationDialogRequestRef.current !== requestId) return;
      const selectedModel = choosePlanImplementationModel(
        availableModels,
        preferredSettings?.model ??
          (models.find((model) => model.id === selectedModelId)?.model ?? null),
      );
      setPlanImplementationDialog((current) =>
        current?.requestId === requestId
          ? {
              ...current,
              models: availableModels,
              selectedModelId: selectedModel?.id ?? null,
              reasoningEffort: choosePlanImplementationReasoning(
                selectedModel,
                current.reasoningEffort,
              ),
              status: "idle",
              error:
                selectedModel === null
                  ? "No compatible Codex models are available for this account."
                  : null,
            }
          : current,
      );
    } catch (error) {
      if (planImplementationDialogRequestRef.current !== requestId) return;
      setPlanImplementationDialog((current) =>
        current?.requestId === requestId
          ? {
              ...current,
              status: "idle",
              error:
                error instanceof Error
                  ? error.message
                  : "Could not load models for this account.",
            }
          : current,
      );
    }
  }

  async function changePlanImplementationAccount(value: string) {
    const current = planImplementationDialog;
    if (!current || current.status !== "idle") return;
    const accountId = value === "default" ? 0 : Number(value);
    const profileKey: CodexProfileKey =
      value === "default"
        ? DEFAULT_CODEX_PROFILE_KEY
        : (`account:${accountId}` as CodexProfileKey);
    if (
      (value === "default" && !current.allowDefaultProfile) ||
      (value !== "default" &&
        !codexAccountsRef.current.some(
          (account) =>
            account.id === accountId && account.status === "signed_in",
        ))
    ) {
      return;
    }

    const requestId = planImplementationDialogRequestRef.current + 1;
    planImplementationDialogRequestRef.current = requestId;
    setPlanImplementationDialog({
      ...current,
      requestId,
      accountId,
      profileKey,
      models: [],
      selectedModelId: null,
      status: "loading",
      error: null,
    });
    try {
      const availableModels = await listValidatedPlanImplementationModels(
        profileKey,
        accountId,
      );
      if (planImplementationDialogRequestRef.current !== requestId) return;
      const previousModel = current.models.find(
        (model) => model.id === current.selectedModelId,
      );
      const selectedModel = choosePlanImplementationModel(
        availableModels,
        previousModel?.model,
      );
      setPlanImplementationDialog((latest) =>
        latest?.requestId === requestId
          ? {
              ...latest,
              models: availableModels,
              selectedModelId: selectedModel?.id ?? null,
              reasoningEffort: choosePlanImplementationReasoning(
                selectedModel,
                current.reasoningEffort,
              ),
              status: "idle",
              error:
                selectedModel === null
                  ? "No compatible Codex models are available for this account."
                  : null,
            }
          : latest,
      );
    } catch (error) {
      if (planImplementationDialogRequestRef.current !== requestId) return;
      setPlanImplementationDialog((latest) =>
        latest?.requestId === requestId
          ? {
              ...latest,
              status: "idle",
              error:
                error instanceof Error
                  ? error.message
                  : "Could not load models for this account.",
            }
          : latest,
      );
    }
  }

  function changePlanImplementationModel(modelId: string) {
    setPlanImplementationDialog((current) => {
      if (!current || current.status !== "idle") return current;
      const model =
        current.models.find((candidate) => candidate.id === modelId) ?? null;
      return {
        ...current,
        selectedModelId: model?.id ?? null,
        reasoningEffort: choosePlanImplementationReasoning(
          model,
          current.reasoningEffort,
        ),
      };
    });
  }

  function confirmPlanImplementation() {
    const dialog = planImplementationDialog;
    const workspace = selectedWorkspaceRef.current;
    const session = workspace
      ? workspaceChatSessionsRef.current[workspace.id] ?? null
      : null;
    if (
      !dialog ||
      dialog.status !== "idle" ||
      !workspace ||
      workspace.id !== dialog.workspaceId ||
      !session ||
      session.chatId !== dialog.chatId ||
      selectedRunIsActiveNow()
    ) {
      return;
    }
    const model =
      dialog.models.find(
        (candidate) => candidate.id === dialog.selectedModelId,
      ) ?? null;
    if (!model) {
      setPlanImplementationDialog({
        ...dialog,
        error: "Choose an available model before implementing the plan.",
      });
      return;
    }
    if (
      dialog.reasoningEffort &&
      !model.supportedReasoningEfforts.some(
        (option) => option.reasoningEffort === dialog.reasoningEffort,
      )
    ) {
      setPlanImplementationDialog({
        ...dialog,
        error:
          "Choose a reasoning level supported by the selected model.",
      });
      return;
    }

    if (dialog.profileKey !== session.profileKey) {
      setPendingAccountHandoff({
        workspaceId: workspace.id,
        chatId: session.chatId,
        fromProfileKey: session.profileKey,
        fromThreadId: session.threadId,
        targetAccountId: dialog.accountId,
        targetProfileKey: dialog.profileKey,
      });
    } else {
      clearPendingAccountHandoff(session.chatId);
    }

    setPlanImplementationDialog({ ...dialog, status: "starting", error: null });
    const started = launchPlanFollowUp(
      dialog.entry,
      "Implement the plan.",
      "plan-implementation",
      {
        accountId: dialog.accountId,
        profileKey: dialog.profileKey,
        model,
        reasoningEffort: dialog.reasoningEffort,
      },
    );
    if (started) {
      closePlanImplementationDialog();
    } else {
      setPlanImplementationDialog((current) =>
        current?.requestId === dialog.requestId
          ? {
              ...current,
              status: "idle",
              error: "The implementation could not be started.",
            }
          : current,
      );
    }
  }

  function launchPlanFollowUp(
    entry: TaskChatEntry,
    promptText: string,
    intent: "plan-revision" | "plan-implementation",
    executionSelection?: PlanFollowUpExecutionSelection,
  ): boolean {
    const workspace = selectedWorkspaceRef.current;
    const chatSession = workspace
      ? workspaceChatSessionsRef.current[workspace.id] ?? null
      : null;
    if (
      !workspace ||
      !chatSession ||
      entry.chatId === null ||
      chatSession.chatId !== entry.chatId ||
      !chatSession.threadId
    ) {
      setStatusMessage("Reopen the plan's chat before continuing this workflow.");
      return false;
    }
    if (selectedRunIsActiveNow()) {
      setStatusMessage("Wait for the active turn to finish first.");
      return false;
    }
    if (entry.runView.nativePlan.reviewState !== "available") {
      setStatusMessage("That plan is no longer awaiting review.");
      return false;
    }
    const pendingHandoff =
      pendingAccountHandoffsRef.current[chatSession.chatId] ?? null;
    if (
      pendingHandoff &&
      (pendingHandoff.workspaceId !== workspace.id ||
        pendingHandoff.fromProfileKey !== chatSession.profileKey ||
        pendingHandoff.fromThreadId !== chatSession.threadId)
    ) {
      clearPendingAccountHandoff(pendingHandoff.chatId);
      setStatusMessage(
        "The chat changed after the account switch was confirmed. Select the account again.",
      );
      return false;
    }
    const sessionProfileKey = chatSession.profileKey;
    const profileKey: CodexProfileKey =
      executionSelection?.profileKey ??
      pendingHandoff?.targetProfileKey ??
      sessionProfileKey ??
      DEFAULT_CODEX_PROFILE_KEY;
    const usesDefaultProfile = profileKey === DEFAULT_CODEX_PROFILE_KEY;
    const sessionAccountId =
      profileKey?.startsWith("account:")
        ? Number(profileKey.slice("account:".length))
        : null;
    const accountId = executionSelection?.accountId ?? (usesDefaultProfile
      ? 0
      : Number.isFinite(sessionAccountId)
        ? sessionAccountId
        : selectedAccountIdRef.current);
    const account = usesDefaultProfile
      ? null
      : codexAccountsRef.current.find((candidate) => candidate.id === accountId) ?? null;
    if (!usesDefaultProfile && (!accountId || !account)) {
      setStatusMessage("Sign in to the plan's Codex account before continuing.");
      return false;
    }
    const accountHandoff: AccountHandoffRunStrategy | null =
      pendingHandoff && pendingHandoff.targetProfileKey !== chatSession.profileKey
        ? {
            ...pendingHandoff,
            adoptingExternalChat:
              chatSession.origin === "codex_external" &&
              chatSession.profileKey === DEFAULT_CODEX_PROFILE_KEY,
          }
        : null;
    if (planActionLocksRef.current.has(entry.clientId)) return false;
    planActionLocksRef.current.add(entry.clientId);
    const selectedModel =
      executionSelection?.model ??
      models.find((option) => option.id === selectedModelId) ??
      models[0] ??
      null;
    const followUpUseOss = executionSelection ? false : useOss;
    const model = executionSelection
      ? selectedModel?.model ?? null
      : useOss || modelLoadError
        ? null
        : selectedModel?.model ?? null;
    const reasoningEffort = executionSelection
      ? executionSelection.reasoningEffort
      : selectedReasoningEffort;
    void removeAgentNotification(
      planNotificationEventKey(profileKey, entry),
    ).catch(() => undefined);

    updateTaskChatEntryRunView(entry.clientId, (current) =>
      updateNativePlanReview(
        current,
        intent === "plan-revision" ? "superseded" : "approved",
        "transitioning",
      ),
    );
    if (entry.runId !== null) {
      void updateRun(entry.runId, {
        planReviewState:
          intent === "plan-revision" ? "superseded" : "approved",
      });
    }
    setPlanMode(intent === "plan-revision");
    setGoalMode(false);

    const mode = intent === "plan-revision" ? "plan" : "run";
    const executionSettings = createRunExecutionSettings({
      accountId: accountId ?? 0,
      profileKey,
      selectedBranch,
      mode,
      intent,
      accessMode,
      computerUseEnabled,
      model,
      reasoningEffort: model ? reasoningEffort : null,
      useOss: followUpUseOss,
      ossProvider,
      contextFiles: [],
      selectedSkills: [],
      goalMode: false,
    });
    const snapshot: RunSetupSnapshot = {
      promptText,
      promptFallback: promptText,
      workspace: { ...workspace },
      accountId: accountId ?? 0,
      account: account ? { ...account } : null,
      profileKey,
      chatOrigin: chatSession.origin,
      externalThreadId: chatSession.externalThreadId,
      selectedBranch,
      cachedPreflight: null,
      mode,
      intent,
      clientUserMessageId: createStableClientMessageId(),
      access: accessSettings({ accessMode }),
      computerUseEnabled,
      model,
      effort: model ? reasoningEffort : null,
      useOss: followUpUseOss,
      ossProvider,
      improvedPrompt: promptText,
      contextFiles: [],
      selectedSkills: [],
      goalMode: false,
      loginState,
      chatId: entry.chatId,
      threadId: accountHandoff ? null : chatSession.threadId,
      turnIndex: chatSession.nextTurnIndex,
      restorePromptOnSetupFailure: false,
      sourcePlanEntry: entry,
      defaultCollaborationMode: chatSession.savedDefaultCollaborationMode,
      executionSettings,
      threadStrategy: accountHandoff
        ? { kind: "handoff", handoff: accountHandoff }
        : { kind: "resume" },
      handoffContextBudgetTokens: accountHandoff
        ? Math.max(
            1_024,
            Math.floor(
              (getCodexModelContextWindow(selectedModel) ?? 128_000) * 0.25,
            ),
          )
        : undefined,
    };
    const runControl = beginOptimisticRun(snapshot);
    scheduleRunSetup(runControl, snapshot);
    return true;
  }

  function handleImplementPlan(entry: TaskChatEntry) {
    void openPlanImplementationDialog(entry);
  }

  function handleRevisePlan(entry: TaskChatEntry, revision: string) {
    return launchPlanFollowUp(entry, revision, "plan-revision");
  }

  async function handleCancelPlan(entry: TaskChatEntry) {
    if (entry.runView.nativePlan.reviewState !== "available") {
      setStatusMessage("That plan is no longer awaiting review.");
      return;
    }
    const workspace = selectedWorkspaceRef.current;
    const session = workspace
      ? workspaceChatSessionsRef.current[workspace.id] ?? null
      : null;
    if (!session?.threadId || entry.chatId === null || session.chatId !== entry.chatId) {
      setStatusMessage("Reopen the plan's chat before cancelling it.");
      return;
    }
    const usesDefaultProfile =
      session.profileKey === DEFAULT_CODEX_PROFILE_KEY;
    const sessionAccountId = accountIdFromProfileKey(session.profileKey);
    const accountId = usesDefaultProfile
      ? 0
      : Number.isFinite(sessionAccountId)
        ? sessionAccountId
        : selectedAccountIdRef.current;
    if (!usesDefaultProfile && !accountId) return;
    if (planActionLocksRef.current.has(entry.clientId)) return;
    planActionLocksRef.current.add(entry.clientId);
    updateTaskChatEntryRunView(entry.clientId, (current) =>
      updateNativePlanReview(current, "submitting", "cancelling"),
    );
    const profileKey: CodexProfileKey =
      session.profileKey ??
      (`account:${accountId}` as CodexProfileKey);
    try {
      await ensureCodexProfileConnected(profileKey, accountId ?? 0);
      const modes = await collaborationModesForRun(
        profileKey,
        accountId ?? 0,
        selectedModel?.model ?? null,
        selectedReasoningEffort,
        false,
      );
      await codexRpcForProfile(profileKey, accountId ?? 0, "thread/settings/update", {
        threadId: session.threadId,
        collaborationMode: session.savedDefaultCollaborationMode ?? modes.default,
      });
      updateTaskChatEntryRunView(entry.clientId, (current) =>
        updateNativePlanReview(current, "cancelled", "cancelled"),
      );
      void removeAgentNotification(
        planNotificationEventKey(profileKey, entry),
      ).catch(() => undefined);
      if (entry.runId !== null) {
        await updateRun(entry.runId, { planReviewState: "cancelled" });
      }
      await updateChat(entry.chatId, {
        status: "completed",
        collaborationMode: "default",
        savedDefaultCollaborationModeJson: null,
      });
      await advanceChatConversationRevision(entry.chatId, {
        queueOwned: false,
      }).catch(() => undefined);
      const pendingQueue = await refreshPromptQueue(entry.chatId).catch(
        () => [],
      );
      if (pendingQueue.length > 0) {
        if (
          promptQueuePauseReasonsRef.current.get(entry.chatId) === "workflow"
        ) {
          setPromptQueuePaused(entry.chatId, false);
        }
        if (!pausedPromptQueueChatIdsRef.current.has(entry.chatId)) {
          schedulePromptQueueDispatch(entry.chatId);
        }
      }
      setPlanMode(false);
      setStatusMessage("Plan cancelled. Codex returned to Default mode.");
      planActionLocksRef.current.delete(entry.clientId);
    } catch (error) {
      planActionLocksRef.current.delete(entry.clientId);
      updateTaskChatEntryRunView(entry.clientId, (current) =>
        updateNativePlanReview(current, "available", "awaiting-approval"),
      );
      setStatusMessage(
        `Could not cancel Plan mode: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  function requestWorkspaceDirectoryEntries(
    workspace: Workspace,
    directoryPath: string,
    force = false,
  ) {
    const cacheKey = workspaceCacheKey(workspace.path, directoryPath);
    const existingRequest = directoryRequestCache.current.get(cacheKey);
    if (existingRequest && !force) {
      return {
        cacheKey,
        generation: directoryRequestGenerations.current.get(cacheKey) ?? 0,
        request: existingRequest,
      };
    }

    const generation =
      (directoryRequestGenerations.current.get(cacheKey) ?? 0) + 1;
    directoryRequestGenerations.current.set(cacheKey, generation);

    let request: Promise<WorkspaceTreeEntry[]>;
    request = listWorkspaceDirectory(workspace.path, directoryPath).finally(() => {
      if (directoryRequestCache.current.get(cacheKey) === request) {
        directoryRequestCache.current.delete(cacheKey);
      }
    });
    directoryRequestCache.current.set(cacheKey, request);

    return { cacheKey, generation, request };
  }

  function workspaceDirectoryRequestIsCurrent(
    cacheKey: string,
    generation: number,
  ) {
    return directoryRequestGenerations.current.get(cacheKey) === generation;
  }

  async function loadWorkspaceDirectory(
    workspace: Workspace,
    directoryPath: string,
    force = false,
  ) {
    const cacheKey = workspaceCacheKey(workspace.path, directoryPath);
    const existing = directoryStates[directoryPath];
    const cachedEntries = directoryEntriesCache.current.get(cacheKey);

    if (!force && cachedEntries) {
      setDirectoryStates((current) => ({
        ...current,
        [directoryPath]: {
          status: "loaded",
          entries: cachedEntries,
          error: null,
        },
      }));
      return;
    }

    if (
      !force &&
      (existing?.status === "loaded" || existing?.status === "loading")
    ) {
      if (existing.status === "loaded") {
        directoryEntriesCache.current.set(cacheKey, existing.entries);
      }
      return;
    }

    const { generation, request } = requestWorkspaceDirectoryEntries(
      workspace,
      directoryPath,
      force,
    );

    setDirectoryStates((current) => ({
      ...current,
      [directoryPath]: {
        status: "loading",
        entries: current[directoryPath]?.entries ?? [],
        error: null,
      },
    }));

    try {
      const entries = await request;
      if (!workspaceDirectoryRequestIsCurrent(cacheKey, generation)) {
        return;
      }
      directoryEntriesCache.current.set(cacheKey, entries);
      setDirectoryStates((current) => ({
        ...current,
        [directoryPath]: { status: "loaded", entries, error: null },
      }));
    } catch (error) {
      if (!workspaceDirectoryRequestIsCurrent(cacheKey, generation)) {
        return;
      }
      setDirectoryStates((current) => ({
        ...current,
        [directoryPath]: {
          status: "error",
          entries: [],
          error: error instanceof Error ? error.message : String(error),
        },
      }));
    }
  }

  function toggleWorkspaceExpanded(workspace: Workspace) {
    const opening = !expandedWorkspaceIds.has(workspace.id);
    setExpandedWorkspaceIds((current) => {
      const next = new Set(current);
      if (next.has(workspace.id)) {
        next.delete(workspace.id);
      } else {
        next.add(workspace.id);
      }
      return next;
    });

    if (opening) {
      void loadWorkspaceDirectory(workspace, workspace.path, true);
    }
  }

  function toggleDirectoryExpanded(
    workspace: Workspace,
    directoryPath: string,
    loadDirectory = true,
  ) {
    const opening = !expandedDirectoryPaths.has(directoryPath);
    setExpandedDirectoryPaths((current) => {
      const next = new Set(current);
      if (next.has(directoryPath)) {
        next.delete(directoryPath);
      } else {
        next.add(directoryPath);
      }
      return next;
    });

    if (opening && loadDirectory) {
      void loadWorkspaceDirectory(workspace, directoryPath, true);
    }
  }

  async function refreshWorkspaceDirectoryInBackground(
    workspace: Workspace,
    directoryPath: string,
    force = false,
  ) {
    const cacheKey = workspaceCacheKey(workspace.path, directoryPath);
    const { generation, request } = requestWorkspaceDirectoryEntries(
      workspace,
      directoryPath,
      force,
    );

    try {
      const entries = await request;
      if (!workspaceDirectoryRequestIsCurrent(cacheKey, generation)) {
        return;
      }
      const cachedEntries = directoryEntriesCache.current.get(cacheKey);
      if (workspaceTreeEntriesEqual(cachedEntries, entries)) return;

      directoryEntriesCache.current.set(cacheKey, entries);
      startTransition(() => {
        setDirectoryStates((current) => {
          const existing = current[directoryPath];
          if (
            existing?.status === "loaded" &&
            existing.error === null &&
            workspaceTreeEntriesEqual(existing.entries, entries)
          ) {
            return current;
          }
          return {
            ...current,
            [directoryPath]: { status: "loaded", entries, error: null },
          };
        });
      });
    } catch {
      // Background polling is intentionally quiet. Explicit expansion still
      // exposes directory errors through loadWorkspaceDirectory().
    }
  }

  async function refreshWorkspaceDirectoriesAfterRun(workspace: Workspace) {
    const cachePrefix = `${workspace.path}\u0000`;
    const directoryPaths = new Set<string>([workspace.path]);

    for (const cacheKey of directoryEntriesCache.current.keys()) {
      if (cacheKey.startsWith(cachePrefix)) {
        directoryPaths.add(cacheKey.slice(cachePrefix.length));
      }
    }
    for (const cacheKey of directoryRequestCache.current.keys()) {
      if (cacheKey.startsWith(cachePrefix)) {
        directoryPaths.add(cacheKey.slice(cachePrefix.length));
      }
    }

    await Promise.all(
      [...directoryPaths].map((directoryPath) =>
        refreshWorkspaceDirectoryInBackground(workspace, directoryPath, true),
      ),
    );
  }

  async function refreshVisibleWorkspaceDirectories(workspace: Workspace) {
    if (!expandedWorkspaceIds.has(workspace.id)) {
      return;
    }

    const workspaceRoot = normalizeWorkspacePath(workspace.path);
    const visibleDirectoryPaths = new Set<string>([workspace.path]);
    expandedDirectoryPaths.forEach((directoryPath) => {
      const normalizedDirectoryPath = normalizeWorkspacePath(directoryPath);
      if (
        normalizedDirectoryPath === workspaceRoot ||
        normalizedDirectoryPath.startsWith(`${workspaceRoot}/`)
      ) {
        visibleDirectoryPaths.add(directoryPath);
      }
    });

    for (const directoryPath of visibleDirectoryPaths) {
      await refreshWorkspaceDirectoryInBackground(workspace, directoryPath);
    }
  }

  async function openWorkspaceFilePreview(
    workspace: Workspace,
    file: WorkspaceTreeEntry,
    options: OpenWorkspaceFilePreviewOptions = {},
  ) {
    const requestId = previewRequestId.current + 1;
    previewRequestId.current = requestId;
    const gitStatus = gitStatusByRelativePath.get(file.relativePath) ?? null;
    const mode =
      options.mode ??
      (gitStatus?.statusKind === "deleted" || file.gitGhost ? "diff" : "preview");
    const cacheKey = workspaceCacheKey(workspace.path, file.path);
    if (options.forceRefresh) {
      invalidateWorkspacePreviewCaches(workspace, file.path);
    }
    const cachedPreview = filePreviewCache.current.get(cacheKey) ?? null;
    const cachedDiff = fileDiffCache.current.get(cacheKey) ?? null;
    setPreviewState({
      status:
        mode === "preview"
          ? cachedPreview
            ? "loaded"
            : "loading"
          : cachedPreview
            ? "loaded"
            : "idle",
      mode,
      file,
      preview: cachedPreview,
      error: null,
      diffStatus:
        mode === "diff"
          ? cachedDiff
            ? "loaded"
            : "loading"
          : cachedDiff
            ? "loaded"
            : "idle",
      diff: cachedDiff,
      diffError: null,
    });

    if (mode === "diff") {
      growPreviewDrawerForDiff();
      if (!cachedDiff) {
        await loadWorkspaceFileDiff(workspace, file, requestId);
      }
      return;
    }

    if (!cachedPreview) {
      await loadWorkspaceFilePreview(workspace, file, requestId);
    }
  }

  function openTaskResponseFileLink(href: string) {
    const workspace = selectedWorkspaceRef.current;
    if (!workspace) {
      return false;
    }

    const file = workspaceFileEntryFromResponseLink(href, workspace);
    if (!file) {
      return false;
    }

    void openWorkspaceFilePreview(workspace, file, { forceRefresh: true });
    return true;
  }

  async function handleOpenWebPreview(
    entry: TaskChatEntry,
    preview: RunWebPreview,
  ) {
    const control = activeRunControlsRef.current.get(entry.clientId);
    const nextPreview = await recheckWebPreview(preview, {
      control,
      entryClientId: entry.clientId,
      runId: entry.runId,
    });
    if (nextPreview.availability !== "available") {
      throw new Error("This web preview is no longer running.");
    }
    await openUrl(nextPreview.url);
  }

  async function handleReviewEditedFile(
    entry: TaskChatEntry,
    editedFile: RunEditedFile,
  ) {
    const workspace = selectedWorkspaceRef.current;
    if (!workspace || workspace.id !== entry.workspaceId) {
      throw new Error("Open the workspace for this edit before reviewing it");
    }

    const file = workspaceFileEntryFromResponseLink(editedFile.path, workspace);
    if (!file) {
      throw new Error("That edited file is outside the selected workspace");
    }

    await openWorkspaceFilePreview(workspace, file, {
      forceRefresh: true,
      mode: "diff",
    });
  }

  async function handleUndoEditedFiles(entry: TaskChatEntry) {
    const workspace = selectedWorkspaceRef.current;
    if (!workspace || workspace.id !== entry.workspaceId) {
      throw new Error("Open the workspace for this edit before undoing it");
    }
    if (entry.runView.fileChangesReverted) {
      return;
    }
    if (!entry.runView.latestDiff.trim()) {
      throw new Error("The exact edit diff is unavailable for this run");
    }
    if (
      [...activeRunControlsRef.current.values()].some(
        (control) =>
          isActiveRunControl(control) && control.workspaceId === workspace.id,
      )
    ) {
      throw new Error("Stop the active agent in this workspace before undoing changes");
    }

    const result = await undoWorkspaceGitDiff(
      workspace.path,
      entry.runView.latestDiff,
    );
    updateTaskChatEntryRunView(entry.clientId, (current) => ({
      ...current,
      fileChangesReverted: true,
    }));
    invalidateWorkspacePreviewCaches(workspace, undefined, {
      reloadOpenPreview: true,
    });
    await Promise.all([
      refreshWorkspaceGitStatus(workspace, {
        showLoading: false,
        force: true,
      }),
      refreshWorkspaceDirectoriesAfterRun(workspace),
    ]);
    setStatusMessage(result.message);
  }

  function invalidateWorkspacePreviewCaches(
    workspace: Workspace,
    filePath?: string,
    options: { reloadOpenPreview?: boolean } = {},
  ) {
    deletePreviewCacheEntries(filePreviewCache.current, workspace, filePath);
    deletePreviewCacheEntries(filePreviewRequestCache.current, workspace, filePath);
    deletePreviewCacheEntries(fileDiffCache.current, workspace, filePath);
    deletePreviewCacheEntries(fileDiffRequestCache.current, workspace, filePath);

    if (!options.reloadOpenPreview) {
      return;
    }

    const openPreview = previewStateRef.current;
    const openFile = openPreview.file;
    if (
      !openFile ||
      !pathBelongsToWorkspace(openFile.path, workspace.path) ||
      (filePath && openFile.path !== filePath)
    ) {
      return;
    }

    const requestId = previewRequestId.current + 1;
    previewRequestId.current = requestId;
    if (openPreview.mode === "diff") {
      void loadWorkspaceFileDiff(workspace, openFile, requestId);
      return;
    }

    void loadWorkspaceFilePreview(workspace, openFile, requestId);
  }

  function deletePreviewCacheEntries<T>(
    cache: Map<string, T>,
    workspace: Workspace,
    filePath?: string,
  ) {
    if (filePath) {
      cache.delete(workspaceCacheKey(workspace.path, filePath));
      return;
    }

    const prefix = `${workspace.path}\u0000`;
    for (const key of cache.keys()) {
      if (key.startsWith(prefix)) {
        cache.delete(key);
      }
    }
  }

  async function loadWorkspaceFilePreview(
    workspace: Workspace,
    file: WorkspaceTreeEntry,
    requestId = previewRequestId.current,
  ) {
    const cacheKey = workspaceCacheKey(workspace.path, file.path);
    const cachedPreview = filePreviewCache.current.get(cacheKey);
    if (cachedPreview) {
      setPreviewState((current) => ({
        ...current,
        status: "loaded",
        file,
        preview: cachedPreview,
        error: null,
      }));
      return;
    }

    setPreviewState((current) => ({
      ...current,
      status: "loading",
      error: null,
    }));

    try {
      const existingRequest = filePreviewRequestCache.current.get(cacheKey);
      const request =
        existingRequest ??
        readWorkspaceFilePreview(workspace.path, file.path).finally(() => {
          filePreviewRequestCache.current.delete(cacheKey);
        });
      if (!existingRequest) {
        filePreviewRequestCache.current.set(cacheKey, request);
      }

      const preview = await request;
      filePreviewCache.current.set(cacheKey, preview);
      if (previewRequestId.current !== requestId) {
        return;
      }
      setPreviewState((current) => ({
        ...current,
        status: "loaded",
        file,
        preview,
        error: null,
      }));
    } catch (error) {
      if (previewRequestId.current !== requestId) {
        return;
      }
      setPreviewState((current) => ({
        ...current,
        status: "error",
        file,
        preview: current.preview,
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  }

  async function loadWorkspaceFileDiff(
    workspace: Workspace,
    file: WorkspaceTreeEntry,
    requestId = previewRequestId.current,
  ) {
    const cacheKey = workspaceCacheKey(workspace.path, file.path);
    const cachedDiff = fileDiffCache.current.get(cacheKey);
    if (cachedDiff) {
      setPreviewState((current) => ({
        ...current,
        diffStatus: "loaded",
        diff: cachedDiff,
        diffError: null,
      }));
      return;
    }

    setPreviewState((current) => ({
      ...current,
      diffStatus: "loading",
      diffError: null,
    }));

    try {
      const existingRequest = fileDiffRequestCache.current.get(cacheKey);
      const request =
        existingRequest ??
        readWorkspaceGitDiff(workspace.path, file.path).finally(() => {
          fileDiffRequestCache.current.delete(cacheKey);
        });
      if (!existingRequest) {
        fileDiffRequestCache.current.set(cacheKey, request);
      }

      const diff = await request;
      fileDiffCache.current.set(cacheKey, diff);
      if (previewRequestId.current !== requestId) {
        return;
      }
      setPreviewState((current) => ({
        ...current,
        diffStatus: "loaded",
        diff,
        diffError: null,
      }));
    } catch (error) {
      if (previewRequestId.current !== requestId) {
        return;
      }
      setPreviewState((current) => ({
        ...current,
        diffStatus: "error",
        diff: null,
        diffError: error instanceof Error ? error.message : String(error),
      }));
    }
  }

  const closeWorkspaceFilePreview = useCallback(() => {
    previewRequestId.current += 1;
    setPreviewState({
      status: "idle",
      mode: "preview",
      file: null,
      preview: null,
      error: null,
      diffStatus: "idle",
      diff: null,
      diffError: null,
    });
  }, []);

  const startPreviewDrawerResize = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    setPreviewResizing(true);
  }, []);

  const resizePreviewDrawer = useCallback((delta: number) => {
    setPreviewDrawerWidth((current) => clampPreviewDrawerWidth(current + delta));
  }, []);

  const handleGoalModeChange = useCallback((nextGoalMode: boolean) => {
    setGoalMode(nextGoalMode);
    if (nextGoalMode) {
      setPlanMode(false);
    }
  }, []);

  async function terminateSelectedGoal(
    control: ActiveRunControl,
    action: Extract<GoalProgressAction, "stopping" | "editing">,
  ) {
    if (
      !control.threadId ||
      !control.goal ||
      control.goalActionPending ||
      !isActiveRunControl(control)
    ) {
      return false;
    }

    const actionLabel =
      action === "editing" ? "prepare the goal for editing" : "stop the goal";
    setGoalTermination({
      workspaceId: control.workspaceId,
      clientId: control.clientId,
      action,
    });
    control.goalActionPending = action;
    control.goalActionError = null;
    setActiveRunRegistryVersion((current) => current + 1);

    try {
      await clearThreadGoalForProfile(
        control.profileKey,
        control.accountId,
        control.threadId,
      );
      if (
        control.stopped ||
        activeRunControlsRef.current.get(control.clientId) !== control
      ) {
        return false;
      }

      control.acceptsThreadContinuation = false;
      control.goal = null;
      control.goalActionPending = null;
      control.goalActionError = null;
      setActiveRunRegistryVersion((current) => current + 1);

      const result = await stopActiveRun(control);
      return result.stopped && result.goalCleared;
    } catch (error) {
      const message = `Could not ${actionLabel}: ${
        error instanceof Error ? error.message : String(error)
      }`;
      if (
        !control.stopped &&
        activeRunControlsRef.current.get(control.clientId) === control
      ) {
        control.goalActionPending = null;
        control.goalActionError = message;
        setActiveRunRegistryVersion((current) => current + 1);
      }
      setStatusMessage(message);
      return false;
    } finally {
      setGoalTermination((current) =>
        current?.clientId === control.clientId && current.action === action
          ? null
          : current,
      );
    }
  }

  async function stopSelectedGoal() {
    const control = selectedActiveRunControl;
    if (!control) return;
    if (await terminateSelectedGoal(control, "stopping")) {
      setGoalMode(false);
    }
  }

  function focusGoalObjectiveInComposer(
    workspaceId: number,
    objective: string,
  ) {
    flushSync(() => {
      setPlanMode(false);
      setGoalMode(true);
      updateRememberedWorkspaceComposer(workspaceId, {
        prompt: objective,
      });
    });
    preflightRef.current = null;

    window.requestAnimationFrame(() => {
      if (selectedWorkspaceRef.current?.id !== workspaceId) return;
      const textarea = taskComposerPromptRef.current;
      if (!textarea) return;
      textarea.focus({ preventScroll: true });
      textarea.setSelectionRange(0, textarea.value.length);
    });
  }

  async function editSelectedGoal(candidate: GoalEditCandidate) {
    const control = activeRunControlsRef.current.get(candidate.clientId) ?? null;
    if (
      !control ||
      selectedWorkspaceRef.current?.id !== candidate.workspaceId ||
      control.workspaceId !== candidate.workspaceId ||
      control.goal?.objective !== candidate.objective
    ) {
      setGoalEditCandidate(null);
      setStatusMessage("That goal changed before it could be edited.");
      return;
    }

    setGoalEditCandidate((current) =>
      current?.clientId === candidate.clientId
        ? { ...current, status: "stopping", error: null }
        : current,
    );
    const stopped = await terminateSelectedGoal(control, "editing");
    if (!stopped) {
      setGoalEditCandidate((current) =>
        current?.clientId === candidate.clientId
          ? {
              ...current,
              status: "idle",
              error: "The goal could not be stopped. Try again.",
            }
          : current,
      );
      return;
    }

    setGoalEditCandidate(null);
    focusGoalObjectiveInComposer(candidate.workspaceId, candidate.objective);
    setStatusMessage("Goal stopped. Edit the objective, then submit it to continue.");
  }

  function requestEditSelectedGoal() {
    const control = selectedActiveRunControl;
    const objective = control?.goal?.objective.trim() ?? "";
    if (
      !control ||
      !objective ||
      control.goalActionPending ||
      !isActiveRunControl(control)
    ) {
      return;
    }

    const candidate: GoalEditCandidate = {
      workspaceId: control.workspaceId,
      clientId: control.clientId,
      objective,
      status: "idle",
      error: null,
    };
    const currentDraft = promptRef.current.trim();
    if (currentDraft && currentDraft !== objective) {
      setGoalEditCandidate(candidate);
      return;
    }

    void editSelectedGoal(candidate);
  }

  async function updateSelectedGoalStatus(
    status: Extract<ThreadGoalStatus, "active" | "paused">,
  ) {
    const control = selectedActiveRunControl;
    if (
      !control ||
      !control.threadId ||
      !control.goal ||
      control.goalActionPending ||
      !isActiveRunControl(control)
    ) {
      return;
    }

    const action: GoalProgressAction =
      status === "paused" ? "pausing" : "resuming";
    control.goalActionPending = action;
    control.goalActionError = null;
    setActiveRunRegistryVersion((current) => current + 1);

    try {
      const response = await updateThreadGoalStatusForProfile(
        control.profileKey,
        control.accountId,
        control.threadId,
        status,
      );
      const goal = parseThreadGoal(response.goal, {
        fallbackThreadId: control.threadId,
      });
      if (!goal) {
        throw new Error("Codex returned invalid goal state.");
      }
      if (
        control.stopped ||
        activeRunControlsRef.current.get(control.clientId) !== control
      ) {
        return;
      }
      control.goal = goal;
      control.goalActionError = null;
      setActiveRunRegistryVersion((current) => current + 1);

      if (
        control.stopped ||
        activeRunControlsRef.current.get(control.clientId) !== control
      ) {
        return;
      }
      control.goalActionPending = null;
      control.goalActionError = null;
      setActiveRunRegistryVersion((current) => current + 1);
    } catch (error) {
      if (activeRunControlsRef.current.get(control.clientId) === control) {
        control.goalActionPending = null;
        control.goalActionError = `Could not ${
          status === "paused" ? "pause" : "resume"
        } goal: ${error instanceof Error ? error.message : String(error)}`;
        setActiveRunRegistryVersion((current) => current + 1);
      }
      setStatusMessage(
        control.goalActionError ??
          `Could not ${status === "paused" ? "pause" : "resume"} goal.`,
      );
    }
  }

  const handlePlanModeChange = useCallback((nextPlanMode: boolean) => {
    setPlanMode(nextPlanMode);
    if (nextPlanMode) {
      setGoalMode(false);
    }
  }, []);

  const handleAccessModeChange = useCallback(
    (nextAccessMode: CodexAccessMode) => {
      const warning = accessModeWarning(nextAccessMode);
      if (warning && !window.confirm(warning)) return;
      setAccessMode(nextAccessMode);
      persistCodexAccessPreference({
        accessMode: nextAccessMode,
      });
    },
    [],
  );

  const handleAgentNotificationPreferenceChange = useCallback(
    (key: keyof AgentNotificationPreferences, enabled: boolean) => {
      setAgentNotificationPreferences((current) => ({
        ...current,
        [key]: enabled,
      }));
    },
    [],
  );

  const handleEnableAgentNotifications = useCallback(async () => {
    try {
      const permission = await requestAgentNotificationPermission();
      agentNotificationPermissionRef.current = permission;
      setAgentNotificationPermission(permission);
      setStatusMessage(
        permission === "allowed"
          ? "macOS notifications enabled."
          : permission === "denied"
            ? "macOS notification permission was denied."
            : "Notifications are unavailable in this build.",
      );
    } catch (error) {
      setStatusMessage(
        `Could not enable notifications: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }, []);

  const handleOpenAgentNotificationSettings = useCallback(async () => {
    try {
      await openAgentNotificationSettings();
    } catch (error) {
      setStatusMessage(
        `Could not open notification settings: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }, []);

  const growPreviewDrawerForDiff = useCallback(() => {
    setPreviewDrawerWidth((current) =>
      clampPreviewDrawerWidth(Math.max(current, DIFF_DRAWER_PREFERRED_WIDTH)),
    );
  }, []);

  const setWorkspacePreviewMode = useCallback((mode: "preview" | "diff") => {
    const file = previewState.file;
    const workspace = selectedWorkspace;
    if (!file || !workspace || previewState.mode === mode) {
      return;
    }

    setPreviewState((current) => ({ ...current, mode }));
    const cacheKey = workspaceCacheKey(workspace.path, file.path);
    const cachedPreview = filePreviewCache.current.get(cacheKey);
    const cachedDiff = fileDiffCache.current.get(cacheKey);
    if (mode === "preview" && cachedPreview) {
      setPreviewState((current) => ({
        ...current,
        mode,
        status: "loaded",
        preview: cachedPreview,
        error: null,
      }));
      return;
    }
    if (mode === "diff" && cachedDiff) {
      growPreviewDrawerForDiff();
      setPreviewState((current) => ({
        ...current,
        mode,
        diffStatus: "loaded",
        diff: cachedDiff,
        diffError: null,
      }));
      return;
    }

    if (mode === "preview" && previewState.status === "idle") {
      void loadWorkspaceFilePreview(workspace, file);
    }
    if (mode === "diff" && previewState.diffStatus === "idle") {
      growPreviewDrawerForDiff();
      void loadWorkspaceFileDiff(workspace, file);
    } else if (mode === "diff") {
      growPreviewDrawerForDiff();
    }
  }, [
    growPreviewDrawerForDiff,
    previewState.diffStatus,
    previewState.file,
    previewState.mode,
    previewState.status,
    selectedWorkspace,
  ]);

  const handlePreviewResizeKeyDown = useCallback((
    event: ReactKeyboardEvent<HTMLDivElement>,
  ) => {
    const step = event.shiftKey
      ? PREVIEW_DRAWER_RESIZE_LARGE_STEP
      : PREVIEW_DRAWER_RESIZE_STEP;

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      resizePreviewDrawer(step);
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      resizePreviewDrawer(-step);
    }

    if (event.key === "Home") {
      event.preventDefault();
      setPreviewDrawerWidth(PREVIEW_DRAWER_MIN_WIDTH);
    }

    if (event.key === "End") {
      event.preventDefault();
      setPreviewDrawerWidth(getMaxPreviewDrawerWidth());
    }
  }, [resizePreviewDrawer]);

  function endWorkspaceFileDrag() {
    explorerPointerDragCleanupRef.current?.();
    explorerPointerDragCleanupRef.current = null;
    explorerDragContextFileRef.current = null;
    explorerPointerDragRef.current = null;
    setTaskContextDropActiveValue(false);
    setExplorerDragPreview(null);
  }

  function startWorkspaceFilePointerDrag(
    event: ReactPointerEvent<HTMLElement>,
    workspace: Workspace,
    file: WorkspaceTreeEntry,
  ) {
    if (event.button !== 0) {
      return;
    }

    const contextFile = contextFileFromWorkspaceEntry(file);
    explorerDragContextFileRef.current = contextFile;
    explorerPointerDragRef.current = {
      active: false,
      workspace,
      entry: file,
      file: contextFile,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
    };

    event.currentTarget.setPointerCapture?.(event.pointerId);
    attachWorkspaceFilePointerDragListeners();
  }

  function attachWorkspaceFilePointerDragListeners() {
    explorerPointerDragCleanupRef.current?.();

    function handleWindowPointerMove(event: PointerEvent) {
      if (
        updateWorkspaceFilePointerDragAt(
          event.pointerId,
          event.clientX,
          event.clientY,
        )
      ) {
        event.preventDefault();
      }
    }

    function handleWindowPointerUp(event: PointerEvent) {
      if (
        finishWorkspaceFilePointerDragAt(
          event.pointerId,
          event.clientX,
          event.clientY,
        )
      ) {
        event.preventDefault();
      }
    }

    function handleWindowPointerCancel(event: PointerEvent) {
      const drag = explorerPointerDragRef.current;
      if (drag?.pointerId === event.pointerId) {
        endWorkspaceFileDrag();
      }
    }

    window.addEventListener("pointermove", handleWindowPointerMove);
    window.addEventListener("pointerup", handleWindowPointerUp);
    window.addEventListener("pointercancel", handleWindowPointerCancel);
    explorerPointerDragCleanupRef.current = () => {
      window.removeEventListener("pointermove", handleWindowPointerMove);
      window.removeEventListener("pointerup", handleWindowPointerUp);
      window.removeEventListener("pointercancel", handleWindowPointerCancel);
    };
  }

  function updateWorkspaceFilePointerDrag(event: ReactPointerEvent<HTMLElement>) {
    if (
      updateWorkspaceFilePointerDragAt(
        event.pointerId,
        event.clientX,
        event.clientY,
      )
    ) {
      event.preventDefault();
    }
  }

  function updateWorkspaceFilePointerDragAt(
    pointerId: number,
    clientX: number,
    clientY: number,
  ) {
    const drag = explorerPointerDragRef.current;
    if (!drag || drag.pointerId !== pointerId) {
      return false;
    }

    const moved =
      Math.abs(clientX - drag.startX) > 4 ||
      Math.abs(clientY - drag.startY) > 4;
    if (!drag.active && moved) {
      drag.active = true;
    }

    if (!drag.active) {
      return false;
    }

    const overDropSurface = isPointInTaskContextDropSurface(clientX, clientY);
    setTaskContextDropActiveValue(overDropSurface);
    setExplorerDragPreview({
      fileName: drag.file.name,
      x: clientX,
      y: clientY,
      overDropSurface,
    });
    return true;
  }

  function finishWorkspaceFilePointerDrag(event: ReactPointerEvent<HTMLElement>) {
    const handled = finishWorkspaceFilePointerDragAt(
      event.pointerId,
      event.clientX,
      event.clientY,
    );
    if (!handled) {
      return;
    }

    event.currentTarget.releasePointerCapture?.(event.pointerId);
    event.preventDefault();
    event.stopPropagation();
  }

  function finishWorkspaceFilePointerDragAt(
    pointerId: number,
    clientX: number,
    clientY: number,
  ) {
    const drag = explorerPointerDragRef.current;
    if (!drag || drag.pointerId !== pointerId) {
      return false;
    }

    suppressNextWorkspaceFileClick();

    if (!drag.active) {
      void openWorkspaceFilePreview(drag.workspace, drag.entry);
      endWorkspaceFileDrag();
      return true;
    }

    if (isPointInTaskContextDropSurface(clientX, clientY)) {
      addDroppedContextFiles([drag.file]);
    }

    endWorkspaceFileDrag();
    return true;
  }

  function cancelWorkspaceFilePointerDrag(event: ReactPointerEvent<HTMLElement>) {
    const drag = explorerPointerDragRef.current;
    if (drag?.pointerId === event.pointerId) {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
      endWorkspaceFileDrag();
    }
  }

  function suppressNextWorkspaceFileClick() {
    suppressWorkspaceFileClickRef.current = true;
    window.setTimeout(() => {
      suppressWorkspaceFileClickRef.current = false;
    }, 160);
  }

  function shouldSuppressWorkspaceFileClick() {
    if (!suppressWorkspaceFileClickRef.current) {
      return false;
    }

    suppressWorkspaceFileClickRef.current = false;
    return true;
  }

  function isPointInTaskContextDropSurface(clientX: number, clientY: number) {
    const surface = taskContextDropSurfaceRef.current;
    if (!surface) {
      return false;
    }

    const rect = surface.getBoundingClientRect();
    return (
      clientX >= rect.left &&
      clientX <= rect.right &&
      clientY >= rect.top &&
      clientY <= rect.bottom
    );
  }

  function setTaskContextDropActiveValue(value: boolean) {
    if (taskContextDropActiveRef.current === value) {
      return;
    }

    taskContextDropActiveRef.current = value;
    setTaskContextDropActive(value);
  }

  function getExplorerDragContextFiles() {
    return explorerDragContextFileRef.current
      ? [explorerDragContextFileRef.current]
      : [];
  }

  function contextFileFromWorkspaceEntry(file: WorkspaceTreeEntry): ComposerContextFile {
    return normalizeContextFileMedia({
      path: file.path,
      name: file.name,
      source: "explorer",
      status: "ready",
    });
  }

  function addDroppedContextFiles(files: ComposerContextFile[]) {
    const workspaceId = selectedWorkspaceRef.current?.id;
    if (workspaceId === undefined || files.length === 0) return;

    const added = addDroppedContextFilesToWorkspace(workspaceId, files);
    if (added > 0) {
      setStatusMessage(
        `Added ${added === 1 ? "1 file" : `${added} files`} to context.`,
      );
    }
  }

  function addDroppedContextFilesToWorkspace(
    workspaceId: number,
    files: ComposerContextFile[],
  ) {
    const current =
      selectedWorkspaceRef.current?.id === workspaceId
        ? contextFilesRef.current
        : workspaceTaskMemoriesRef.current[workspaceId]?.contextFiles ?? [];
    const next = mergeContextFiles(current, files);
    const added = next.length - current.length;
    if (added > 0) {
      updateRememberedWorkspaceComposer(workspaceId, {
        contextFiles: next,
      });
    }
    return added;
  }

  function handleNativeContextFileDrop(event: NativeContextFileDropEvent) {
    if (event.type === "leave") {
      nativeContextDropPathsRef.current = [];
      setTaskContextDropActiveValue(false);
      return;
    }

    if (event.type === "enter") {
      nativeContextDropPathsRef.current = [...event.paths];
    }

    const paths =
      event.type === "drop"
        ? event.paths
        : nativeContextDropPathsRef.current;
    const overInput =
      activeViewRef.current === "task" &&
      selectedWorkspaceRef.current !== null &&
      paths.length > 0 &&
      isPointInTaskContextDropSurface(event.clientX, event.clientY);

    if (event.type !== "drop") {
      setTaskContextDropActiveValue(overInput);
      return;
    }

    nativeContextDropPathsRef.current = [];
    setTaskContextDropActiveValue(false);
    const workspaceId = selectedWorkspaceRef.current?.id;
    if (!overInput || workspaceId === undefined || paths.length === 0) return;

    const textarea = taskComposerPromptRef.current;
    const selection = textarea
      ? {
          start: textarea.selectionStart,
          end: textarea.selectionEnd,
          direction: textarea.selectionDirection,
        }
      : null;
    void inspectAndAttachNativeContextFiles(
      workspaceId,
      paths,
      textarea,
      selection,
    );
  }

  async function inspectAndAttachNativeContextFiles(
    workspaceId: number,
    paths: string[],
    textarea: HTMLTextAreaElement | null,
    selection: {
      start: number;
      end: number;
      direction: "forward" | "backward" | "none" | null;
    } | null,
  ) {
    try {
      const inspection = await inspectDroppedContextPaths(paths);
      const files = inspection.files.map((file) =>
        normalizeContextFileMedia({
          path: file.path,
          canonicalPath: file.canonicalPath,
          name: file.name,
          source: "picker",
          status: "ready",
        }),
      );
      const added = addDroppedContextFilesToWorkspace(workspaceId, files);
      if (selectedWorkspaceRef.current?.id === workspaceId) {
        if (added > 0) {
          setStatusMessage(
            `Added ${added === 1 ? "1 file" : `${added} files`} to context.${
              inspection.rejected.length > 0
                ? ` Skipped ${inspection.rejected.length} unsupported item${
                    inspection.rejected.length === 1 ? "" : "s"
                  }.`
                : ""
            }`,
          );
        } else if (inspection.rejected.length > 0) {
          setStatusMessage(
            `Skipped ${inspection.rejected.length} dropped item${
              inspection.rejected.length === 1 ? "" : "s"
            } because only readable files can be attached.`,
          );
        }
      }
    } catch (error) {
      if (selectedWorkspaceRef.current?.id === workspaceId) {
        setStatusMessage(
          `Could not inspect dropped files: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    } finally {
      restorePromptFocusAfterNativeDrop(workspaceId, textarea, selection);
    }
  }

  function restorePromptFocusAfterNativeDrop(
    workspaceId: number,
    textarea: HTMLTextAreaElement | null,
    selection: {
      start: number;
      end: number;
      direction: "forward" | "backward" | "none" | null;
    } | null,
  ) {
    if (!textarea) return;
    window.requestAnimationFrame(() => {
      if (
        selectedWorkspaceRef.current?.id !== workspaceId ||
        taskComposerPromptRef.current !== textarea
      ) {
        return;
      }

      textarea.focus({ preventScroll: true });
      if (selection) {
        const end = textarea.value.length;
        textarea.setSelectionRange(
          Math.min(selection.start, end),
          Math.min(selection.end, end),
          selection.direction ?? undefined,
        );
      }
    });
  }

  function workspaceDirectoryEntries(
    workspace: Workspace,
    directoryPath: string,
    entries: WorkspaceTreeEntry[],
  ) {
    const workspaceGitStatusByRelativePath =
      workspaceGitStatusMap(workspace);
    const visibleEntries = entries.filter(
      (entry) =>
        workspaceGitStatusByRelativePath.get(entry.relativePath)?.statusKind !==
        "deleted",
    );
    const byRelativePath = new Map(
      visibleEntries.map((entry) => [entry.relativePath, entry]),
    );
    const merged = [...visibleEntries];
    const directoryRelativePath = relativeDirectoryPath(workspace, directoryPath);

    gitStatusStates[workspace.id]?.snapshot?.files.forEach((file) => {
      if (file.statusKind === "deleted") {
        return;
      }

      const gitEntry = gitStatusChildEntry(
        workspace,
        directoryRelativePath,
        file,
      );
      if (gitEntry && !byRelativePath.has(gitEntry.relativePath)) {
        byRelativePath.set(gitEntry.relativePath, gitEntry);
        merged.push(gitEntry);
      }
    });

    return merged.sort((left, right) => {
      const leftIsFile = left.kind === "file";
      const rightIsFile = right.kind === "file";
      return (
        Number(leftIsFile) - Number(rightIsFile) ||
        left.name.toLowerCase().localeCompare(right.name.toLowerCase())
      );
    });
  }

  function workspaceEntryGitStatus(workspace: Workspace, entry: WorkspaceTreeEntry) {
    return workspaceGitStatusMap(workspace).get(entry.relativePath) ?? null;
  }

  function workspaceDirectoryHasChanges(workspace: Workspace, entry: WorkspaceTreeEntry) {
    return (
      entry.kind === "directory" &&
      workspaceDirtyDirectoryPaths(workspace).has(entry.relativePath)
    );
  }

  function workspaceGitStatusMap(workspace: Workspace) {
    return gitStatusByWorkspaceId.get(workspace.id) ?? EMPTY_GIT_STATUS_BY_PATH;
  }

  function workspaceDirtyDirectoryPaths(workspace: Workspace) {
    return (
      dirtyDirectoryPathsByWorkspaceId.get(workspace.id) ??
      EMPTY_DIRTY_DIRECTORY_PATHS
    );
  }

  function renderWorkspaceDirectory(
    workspace: Workspace,
    directoryPath: string,
    depth: number,
  ) {
    const state = directoryStates[directoryPath];
    const entries = workspaceDirectoryEntries(
      workspace,
      directoryPath,
      state?.entries ?? [],
    );

    if ((!state || state.status === "loading") && entries.length === 0) {
      return (
        <div
          className="workspace-tree-status"
          style={treeIndentStyle(depth)}
          key={`${directoryPath}-loading`}
        >
          <Loader2 size={14} aria-hidden="true" />
          <span>Loading</span>
        </div>
      );
    }

    if (state?.status === "error" && entries.length === 0) {
      return (
        <div
          className="workspace-tree-status error"
          style={treeIndentStyle(depth)}
          key={`${directoryPath}-error`}
        >
          <AlertCircle size={14} aria-hidden="true" />
          <span>{state.error ?? "Unable to load folder"}</span>
        </div>
      );
    }

    if (entries.length === 0) {
      return (
        <div
          className="workspace-tree-status"
          style={treeIndentStyle(depth)}
          key={`${directoryPath}-empty`}
        >
          <span>Empty folder</span>
        </div>
      );
    }

    return entries.map((entry) =>
      renderWorkspaceTreeEntry(workspace, entry, depth),
    );
  }

  function renderWorkspaceTreeEntry(
    workspace: Workspace,
    entry: WorkspaceTreeEntry,
    depth: number,
  ) {
    const directory = entry.kind === "directory";
    const expanded = expandedDirectoryPaths.has(entry.path);
    const gitStatus = workspaceEntryGitStatus(workspace, entry);
    const dirtyDirectory = workspaceDirectoryHasChanges(workspace, entry);
    const gitStateClass = gitStatus
      ? ` git-${gitStatus.statusKind}`
      : dirtyDirectory
        ? " git-dirty"
        : "";
    const draggable =
      !directory && !entry.gitGhost && gitStatus?.statusKind !== "deleted";

    return (
      <div className="workspace-tree-branch" key={entry.path}>
        <div
          className={`workspace-tree-row ${directory ? "directory" : "file"}${draggable ? " draggable" : ""}${gitStateClass}`}
          style={treeIndentStyle(depth)}
          onPointerDown={
              !draggable
                ? undefined
              : (event) => startWorkspaceFilePointerDrag(event, workspace, entry)
          }
          onPointerMove={!draggable ? undefined : updateWorkspaceFilePointerDrag}
          onPointerUp={!draggable ? undefined : finishWorkspaceFilePointerDrag}
          onPointerCancel={!draggable ? undefined : cancelWorkspaceFilePointerDrag}
        >
          {directory ? (
            <button
              className="workspace-tree-chevron"
              type="button"
              aria-label={`${expanded ? "Collapse" : "Expand"} ${entry.name}`}
              aria-expanded={expanded}
              onClick={() =>
                toggleDirectoryExpanded(workspace, entry.path, !entry.gitGhost)
              }
            >
              {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
          ) : (
            <span className="workspace-tree-chevron-placeholder" aria-hidden="true" />
          )}

          <button
            className="workspace-tree-label"
            type="button"
            title={entry.relativePath}
            onClick={(event) => {
              if (!directory && shouldSuppressWorkspaceFileClick()) {
                event.preventDefault();
                event.stopPropagation();
                return;
              }

              if (directory) {
                toggleDirectoryExpanded(workspace, entry.path, !entry.gitGhost);
              } else {
                void openWorkspaceFilePreview(workspace, entry);
              }
            }}
          >
            {directory ? (
              expanded ? (
                <FolderOpen size={15} aria-hidden="true" />
              ) : (
                <Folder size={15} aria-hidden="true" />
              )
            ) : (
              <FileText size={15} aria-hidden="true" />
            )}
            <span className="workspace-entry-name">{entry.name}</span>
            {dirtyDirectory ? (
              <span className="workspace-git-dot" aria-label="Contains changes" />
            ) : null}
            {gitStatus ? (
              <span
                className={`workspace-git-badge ${gitStatus.statusKind}`}
                aria-label={`${gitStatus.statusKind} file`}
              >
                {gitStatus.badge}
              </span>
            ) : null}
          </button>
        </div>
        {directory && expanded
          ? renderWorkspaceDirectory(workspace, entry.path, depth + 1)
          : null}
      </div>
    );
  }

  return (
    <main className="app-shell" data-tauri-drag-region={selfWindowDragRegion}>
      <aside className="app-rail" data-tauri-drag-region={deepWindowDragRegion}>
        <div
          className="app-rail-titlebar-drag-region"
          data-tauri-drag-region={selfWindowDragRegion}
          aria-hidden="true"
        />
        <nav
          className="primary-nav"
          aria-label="Primary"
          data-tauri-drag-region={selfWindowDragRegion}
        >
          <button
            className={activeView === "analytics" ? "active" : ""}
            type="button"
            onClick={() => setActiveView("analytics")}
          >
            <BarChart3 size={17} />
            <span>Analytics</span>
          </button>
          <button
            className={activeView === "settings" ? "active" : ""}
            type="button"
            onClick={() => setActiveView("settings")}
          >
            <Settings size={17} />
            <span>Settings</span>
          </button>
        </nav>

        <div className="rail-section">
          <div
            className="rail-section-header"
            data-tauri-drag-region={selfWindowDragRegion}
          >
            <span id="workspaces-heading">Workspaces</span>
            <button
              className="workspace-add"
              type="button"
              onClick={() => void chooseWorkspace()}
              aria-label="Add workspace"
              title="Add workspace"
            >
              <Plus size={16} aria-hidden="true" />
            </button>
          </div>

          <nav
            className="workspace-list"
            aria-labelledby="workspaces-heading"
            data-tauri-drag-region="false"
          >
            {workspaces.length === 0 ? (
              <p className="muted">No workspaces yet.</p>
            ) : (
              workspaces.map((workspace) => {
                const expanded = expandedWorkspaceIds.has(workspace.id);
                const selected = workspace.id === selectedWorkspace?.id;
                const active = selected && activeView === "task";
                const workspaceDirty = workspaceDirtyDirectoryPaths(workspace).has("");

                return (
                  <div className="workspace-tree-branch" key={workspace.id}>
                    <div
                      className={`workspace-root-row ${active ? "active" : ""}${
                        workspaceDirty ? " git-dirty" : ""
                      }`}
                      onContextMenu={(event) =>
                        openWorkspaceContextMenu(workspace, event)
                      }
                    >
                      <button
                        className="workspace-tree-chevron"
                        type="button"
                        aria-label={`${expanded ? "Collapse" : "Expand"} ${workspace.label}`}
                        aria-expanded={expanded}
                        onClick={() => toggleWorkspaceExpanded(workspace)}
                      >
                        {expanded ? (
                          <ChevronDown size={14} />
                        ) : (
                          <ChevronRight size={14} />
                        )}
                      </button>
                      <button
                        className="workspace-root-label"
                        type="button"
                        onClick={() => {
                          if (active) {
                            toggleWorkspaceExpanded(workspace);
                          } else {
                            selectWorkspace(workspace.id);
                          }
                        }}
                        onKeyDown={(event) =>
                          handleWorkspaceLabelKeyDown(workspace, event)
                        }
                        onContextMenu={(event) =>
                          openWorkspaceContextMenu(workspace, event)
                        }
                        aria-current={active ? "page" : undefined}
                        title={workspace.label}
                      >
                        <span className="workspace-icon" aria-hidden="true">
                          {expanded ? <FolderOpen size={16} /> : <Folder size={16} />}
                        </span>
                        <span className="workspace-name">{workspace.label}</span>
                        {workspaceDirty ? (
                          <span className="workspace-git-dot" aria-label="Contains changes" />
                        ) : null}
                      </button>
                    </div>
                    {expanded
                      ? renderWorkspaceDirectory(workspace, workspace.path, 1)
                      : null}
                  </div>
                );
              })
            )}
          </nav>
          {workspaceContextMenu ? (
            <div
              className="workspace-context-menu"
              data-tauri-drag-region="false"
              ref={workspaceContextMenuRef}
              role="menu"
              aria-label={`${workspaceContextMenu.workspace.label} workspace actions`}
              style={{
                left: workspaceContextMenu.x,
                top: workspaceContextMenu.y,
              }}
            >
              <button
                className="workspace-context-menu-item danger"
                type="button"
                role="menuitem"
                onClick={() => requestWorkspaceDelete(workspaceContextMenu.workspace)}
                disabled={
                  runIsActive &&
                  workspaceContextMenu.workspace.id === selectedWorkspace?.id
                }
              >
                <Trash2 size={15} aria-hidden="true" />
                <span>Remove from Orchestrator</span>
              </button>
            </div>
          ) : null}
        </div>

        <div
          className={`codex-card account-card auth-${authRow.tone}`}
          data-tauri-drag-region="false"
          ref={accountMenuContainerRef}
        >
          {codexSignedIn ? (
            <>
              <button
                className={`account-trigger secondary ${accountMenuOpen ? "open" : ""}`}
                type="button"
                onClick={() => setAccountMenuOpen((current) => !current)}
                aria-expanded={accountMenuOpen}
                aria-controls="codex-account-menu"
                aria-label="Codex account"
              >
                <span className="account-avatar" aria-hidden="true">
                  {authRow.avatarLabel}
                </span>
                <span className="account-copy">
                  <strong>{authRow.title}</strong>
                  <span>{authRow.subtitle}</span>
                </span>
                <ChevronDown className="account-chevron" size={18} />
              </button>
              {accountMenuOpen ? (
                <div className="account-menu" id="codex-account-menu">
                  {codexAccounts.length > 1 ? (
                    <div className="account-menu-section">
                      <div className="account-switcher-list" aria-label="Codex accounts">
                        {codexAccounts
                          .filter((account) => account.id !== selectedAccountId)
                          .map((account) => {
                            const duplicateIdentity =
                              codexAccounts.filter(
                                (candidate) =>
                                  (candidate.email ?? candidate.label).toLowerCase() ===
                                  (account.email ?? account.label).toLowerCase(),
                              ).length > 1;
                            const details = [
                              account.email && account.email !== account.label
                                ? account.email
                                : null,
                              account.status === "signed_in"
                                ? account.plan_type
                                  ? formatCodexPlanType(account.plan_type)
                                  : "Signed in"
                                : "Signed out",
                              duplicateIdentity ? `Local profile ${account.id}` : null,
                            ].filter(Boolean);

                            return (
                              <button
                                className="account-switcher-item"
                                type="button"
                                key={account.id}
                                onClick={() => void selectCodexAccount(account.id)}
                                disabled={runIsActive}
                              >
                                <span className="account-mini-avatar" aria-hidden="true">
                                  {(account.email ?? account.label).charAt(0).toUpperCase()}
                                </span>
                                <span>
                                  <strong>{account.label}</strong>
                                  <small>{details.join(" · ")}</small>
                                </span>
                                <ChevronRight size={15} aria-hidden="true" />
                              </button>
                            );
                          })}
                      </div>
                    </div>
                  ) : null}
                  {codexAccounts.length > 1 ? (
                    <div className="account-menu-separator" />
                  ) : null}
                  <div className="account-menu-group">
                    <button
                      className="account-menu-action"
                      type="button"
                      onClick={() => void handleAddAccount()}
                      disabled={runIsActive}
                    >
                      <UserPlus size={16} />
                      Add account
                    </button>
                    <button
                      className="account-menu-action"
                      type="button"
                      onClick={() => {
                        setActiveView("settings");
                        setAccountMenuOpen(false);
                      }}
                    >
                      <Settings size={16} />
                      Manage accounts
                    </button>
                  </div>
                  <div className="account-menu-separator" />
                  <div className="account-menu-group">
                    <button
                      className="account-menu-action"
                      type="button"
                      onClick={handleRefreshAccount}
                      disabled={runIsActive}
                    >
                      <RefreshCw size={16} />
                      Refresh account
                    </button>
                    <button
                      className="account-menu-action"
                      type="button"
                      onClick={handleLogout}
                      aria-label="Log out of Codex"
                      disabled={runIsActive}
                    >
                      <LogOut size={16} />
                      Log out
                    </button>
                  </div>
                </div>
              ) : null}
            </>
          ) : (
            <button
              className="account-sign-in secondary"
              type="button"
              onClick={showCancelLogin ? handleCancelLogin : handleLogin}
              disabled={loginState === "starting"}
              aria-label={showCancelLogin ? "Cancel Codex sign-in" : "Sign in to Codex"}
            >
              <span className="account-copy">
                <strong>{authRow.title}</strong>
                <span>{showCancelLogin ? "Click to cancel" : authRow.subtitle}</span>
              </span>
              {showCancelLogin ? (
                <X className="account-action-icon" size={18} />
              ) : (
                <LogIn className="account-action-icon" size={18} />
              )}
            </button>
          )}
        </div>
      </aside>

      {accountHandoffCandidate ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (
              event.target === event.currentTarget &&
              accountHandoffCandidate.status === "idle"
            ) {
              setAccountHandoffCandidate(null);
            }
          }}
        >
          <section
            className="confirmation-dialog account-handoff-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="account-handoff-title"
            aria-describedby="account-handoff-description"
          >
            <div>
              <p className="eyebrow">Codex account</p>
              <h2 id="account-handoff-title">Switch account for this chat?</h2>
              <p id="account-handoff-description">
                Continue from {accountHandoffCandidate.fromLabel} with{" "}
                {accountHandoffCandidate.targetLabel}. The next turn starts a
                fresh Codex thread. Visible messages remain, but token usage
                resets and hidden reasoning or tool state cannot be transferred.
              </p>
              {accountHandoffCandidate.error ? (
                <p className="account-handoff-error" role="alert">
                  <AlertCircle size={15} aria-hidden="true" />
                  <span>{accountHandoffCandidate.error}</span>
                </p>
              ) : null}
            </div>
            <div className="confirmation-actions">
              <button
                className="native-plan-icon-action"
                type="button"
                aria-label="Keep current account"
                data-tooltip="Keep current account"
                disabled={accountHandoffCandidate.status !== "idle"}
                onClick={() => setAccountHandoffCandidate(null)}
              >
                <X size={15} aria-hidden="true" />
              </button>
              <button
                className="native-plan-icon-action implement"
                type="button"
                aria-label="Switch account"
                data-tooltip="Switch account"
                disabled={accountHandoffCandidate.status !== "idle"}
                onClick={() => void confirmAccountHandoff()}
              >
                {accountHandoffCandidate.status === "selecting" ? (
                  <Loader2 className="spin" size={15} aria-hidden="true" />
                ) : (
                  <Check size={15} aria-hidden="true" />
                )}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {branchCreationDialog ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (
              event.target === event.currentTarget &&
              branchCreationDialog.status === "idle"
            ) {
              setBranchCreationDialog(null);
            }
          }}
        >
          <form
            className="confirmation-dialog branch-creation-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="branch-creation-title"
            aria-describedby="branch-creation-description"
            onSubmit={(event) => {
              event.preventDefault();
              void confirmBranchCreation();
            }}
          >
            <div>
              <p className="eyebrow">Git</p>
              <h2 id="branch-creation-title">Create branch</h2>
              <p id="branch-creation-description">
                Create and switch to a new local branch
                {branchCreationDialog.baseBranch
                  ? ` from ${branchCreationDialog.baseBranch}`
                  : " from the current Git state"}
                . Current workspace changes will carry over.
              </p>
            </div>
            <label className="branch-creation-field">
              <span>Branch name</span>
              <input
                ref={branchCreationInputRef}
                type="text"
                value={branchCreationDialog.branchName}
                placeholder="feature/my-branch"
                autoComplete="off"
                spellCheck={false}
                disabled={branchCreationDialog.status !== "idle"}
                onChange={(event) => {
                  const branchName = event.currentTarget.value;
                  setBranchCreationDialog((current) =>
                    current
                      ? {
                          ...current,
                          branchName,
                          error: null,
                        }
                      : current,
                  );
                }}
              />
            </label>
            {branchCreationDialog.error ? (
              <p className="confirmation-error" role="alert">
                <AlertCircle size={15} aria-hidden="true" />
                <span>{branchCreationDialog.error}</span>
              </p>
            ) : null}
            <div className="confirmation-actions">
              <button
                className="native-plan-icon-action"
                type="button"
                aria-label="Cancel branch creation"
                data-tooltip="Cancel branch creation"
                disabled={branchCreationDialog.status !== "idle"}
                onClick={() => setBranchCreationDialog(null)}
              >
                <X size={15} aria-hidden="true" />
              </button>
              <button
                className="native-plan-icon-action implement"
                type="submit"
                aria-label="Create branch"
                data-tooltip="Create branch"
                disabled={branchCreationDialog.status !== "idle"}
              >
                {branchCreationDialog.status === "creating" ? (
                  <Loader2 className="spin" size={15} aria-hidden="true" />
                ) : (
                  <GitBranchPlus size={15} aria-hidden="true" />
                )}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {planImplementationDialog ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (
              event.target === event.currentTarget &&
              planImplementationDialog.status !== "starting"
            ) {
              closePlanImplementationDialog();
            }
          }}
        >
          <section
            className="confirmation-dialog plan-implementation-dialog"
            ref={planImplementationDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="plan-implementation-title"
            aria-describedby="plan-implementation-description"
            tabIndex={-1}
            onKeyDown={trapPlanImplementationDialogFocus}
          >
            <div className="plan-implementation-copy">
              <h2 id="plan-implementation-title">
                Confirm implementation settings
              </h2>
              <p id="plan-implementation-description">
                Choose the account, model, and reasoning level for the
                implementation. Switching accounts starts a fresh Codex thread
                while keeping this conversation visible; token usage resets and
                hidden reasoning or tool state is not transferred.
              </p>
            </div>
            <div
              className="plan-implementation-fields"
              aria-busy={planImplementationDialog.status === "loading"}
            >
              <ComposerSelect
                ariaLabel="Implementation account"
                value={
                  planImplementationDialog.profileKey ===
                  DEFAULT_CODEX_PROFILE_KEY
                    ? "default"
                    : planImplementationDialog.accountId.toString()
                }
                options={planImplementationAccountOptions}
                placeholder="Choose account"
                icon={<CircleUserRound size={16} />}
                disabled={planImplementationDialog.status !== "idle"}
                onChange={(value) =>
                  void changePlanImplementationAccount(value)
                }
              />
              <ComposerSelect
                ariaLabel="Implementation model"
                value={planImplementationDialog.selectedModelId ?? ""}
                options={planImplementationModelOptions}
                placeholder={
                  planImplementationDialog.status === "loading"
                    ? "Loading models"
                    : "Choose model"
                }
                icon={<Bot size={16} />}
                disabled={
                  planImplementationDialog.status !== "idle" ||
                  planImplementationModelOptions.length === 0
                }
                onChange={changePlanImplementationModel}
              />
              <ComposerSelect
                ariaLabel="Implementation reasoning"
                value={planImplementationDialog.reasoningEffort ?? ""}
                options={planImplementationReasoningOptions}
                placeholder="Default"
                icon={<Gauge size={16} />}
                disabled={
                  planImplementationDialog.status !== "idle" ||
                  planImplementationReasoningOptions.length === 0
                }
                onChange={(value) =>
                  setPlanImplementationDialog((current) =>
                    current
                      ? { ...current, reasoningEffort: value }
                      : current,
                  )
                }
              />
            </div>
            {planImplementationDialog.error ? (
              <p className="account-handoff-error" role="alert">
                <AlertCircle size={15} aria-hidden="true" />
                <span>{planImplementationDialog.error}</span>
              </p>
            ) : null}
            <div className="confirmation-actions">
              <button
                className="native-plan-icon-action"
                type="button"
                aria-label="Cancel implementation"
                data-tooltip="Cancel implementation"
                disabled={planImplementationDialog.status === "starting"}
                onClick={closePlanImplementationDialog}
              >
                <X size={15} aria-hidden="true" />
              </button>
              <button
                className="native-plan-icon-action implement"
                type="button"
                aria-label="Implement plan"
                data-tooltip="Implement plan"
                disabled={
                  planImplementationDialog.status !== "idle" ||
                  !planImplementationSelectedModel
                }
                onClick={confirmPlanImplementation}
              >
                {planImplementationDialog.status === "starting" ? (
                  <Loader2 className="spin" size={15} aria-hidden="true" />
                ) : (
                  <Check size={15} aria-hidden="true" />
                )}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {goalEditCandidate ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (
              event.target === event.currentTarget &&
              goalEditCandidate.status === "idle"
            ) {
              setGoalEditCandidate(null);
            }
          }}
        >
          <section
            className="confirmation-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="goal-edit-title"
            aria-describedby="goal-edit-description"
          >
            <div>
              <p className="eyebrow">Goal</p>
              <h2 id="goal-edit-title">Replace draft and edit goal?</h2>
              <p id="goal-edit-description">
                This stops the current goal and replaces your unsent prompt
                with its objective. Attached files and selected skills remain
                available.
              </p>
              {goalEditCandidate.error ? (
                <p className="account-handoff-error" role="alert">
                  <AlertCircle size={15} aria-hidden="true" />
                  <span>{goalEditCandidate.error}</span>
                </p>
              ) : null}
            </div>
            <div className="confirmation-actions">
              <button
                className="native-plan-icon-action"
                type="button"
                aria-label="Keep current goal"
                title="Keep current goal"
                data-tooltip="Keep current goal"
                disabled={goalEditCandidate.status !== "idle"}
                onClick={() => setGoalEditCandidate(null)}
              >
                <X size={15} aria-hidden="true" />
              </button>
              <button
                className="native-plan-icon-action"
                type="button"
                aria-label="Stop and edit goal"
                title="Stop and edit goal"
                data-tooltip="Stop and edit goal"
                disabled={goalEditCandidate.status !== "idle"}
                onClick={() => void editSelectedGoal(goalEditCandidate)}
              >
                {goalEditCandidate.status === "stopping" ? (
                  <Loader2 className="spin" size={15} aria-hidden="true" />
                ) : (
                  <Pencil size={15} aria-hidden="true" />
                )}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {workspaceDeleteCandidate ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setWorkspaceDeleteCandidate(null);
            }
          }}
        >
          <section
            className="confirmation-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="workspace-delete-title"
            aria-describedby="workspace-delete-description"
          >
            <div>
              <p className="eyebrow">Workspace</p>
              <h2 id="workspace-delete-title">Remove workspace?</h2>
              <p id="workspace-delete-description">
                This removes {workspaceDeleteCandidate.label} from Orchestrator.
                The folder on disk will not be deleted.
              </p>
            </div>
            <div className="confirmation-actions">
              <button
                className="native-plan-icon-action"
                type="button"
                aria-label="Keep workspace"
                data-tooltip="Keep workspace"
                onClick={() => setWorkspaceDeleteCandidate(null)}
              >
                <X size={15} aria-hidden="true" />
              </button>
              <button
                className="native-plan-icon-action cancel"
                type="button"
                aria-label="Remove workspace"
                data-tooltip="Remove workspace"
                onClick={() => void confirmWorkspaceDelete()}
              >
                <Trash2 size={15} aria-hidden="true" />
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {chatHistoryDeleteCandidate ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setChatHistoryDeleteCandidate(null);
            }
          }}
        >
          <section
            className="confirmation-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="chat-delete-title"
            aria-describedby="chat-delete-description"
          >
            <div>
              <p className="eyebrow">Chat</p>
              <h2 id="chat-delete-title">Remove chat?</h2>
              <p id="chat-delete-description">
                This removes the chat from Orchestrator history, but it is not
                permanently deleted.
              </p>
            </div>
            <div className="confirmation-actions">
              <button
                className="secondary"
                type="button"
                onClick={() => setChatHistoryDeleteCandidate(null)}
              >
                Cancel
              </button>
              <button
                className="danger"
                type="button"
                onClick={() => void confirmChatHistoryDelete()}
              >
                Remove chat
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {commitDialogOpen ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (
              event.target === event.currentTarget &&
              selectedGitActionStatus === "idle"
            ) {
              setCommitDialogOpen(false);
            }
          }}
        >
          <section
            className="confirmation-dialog git-action-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="git-action-title"
          >
            <h2 className="sr-only" id="git-action-title">Commit or push</h2>
            <div className="git-action-status-row">
              <span className="git-action-branch">
                <GitBranch size={15} aria-hidden="true" />
                <span>{selectedBranch ?? "No branch"}</span>
              </span>
              {selectedGitSummary.total > 0 ? (
                <span className="git-action-diff-summary" aria-label={`${selectedGitSummary.additions} additions, ${selectedGitSummary.deletions} deletions`}>
                  <span className="added">+{selectedGitSummary.additions}</span>
                  <span className="deleted">-{selectedGitSummary.deletions}</span>
                </span>
              ) : (
                <span className={`git-action-state ${headerGitAction.statusKind}`}>
                  {headerGitAction.statusLabel}
                </span>
              )}
            </div>

            <label className="git-action-message">
              <textarea
                aria-label="Commit message"
                placeholder="Commit message (leave blank to generate)..."
                value={commitMessage}
                onChange={(event) => {
                  setCommitMessage(event.target.value);
                  setCommitDialogMessage("");
                  setCommitDialogError(false);
                }}
                disabled={selectedGitActionStatus !== "idle"}
              />
            </label>

            <div className="git-action-feedback-slot">
              {commitDialogMessage ? (
                <p
                  className={`git-action-feedback ${
                    commitDialogError ? "error" : ""
                  }`}
                  role={commitDialogError ? "alert" : "status"}
                >
                  {commitDialogError ? (
                    <AlertCircle
                      className="git-action-feedback-icon"
                      size={16}
                      aria-hidden="true"
                    />
                  ) : null}
                  <span>{commitDialogMessage}</span>
                </p>
              ) : null}
            </div>

            <label
              className={`git-action-include-row ${
                includeUnstagedChanges ? "checked" : ""
              }`}
            >
              <input
                className="git-action-include-input"
                type="checkbox"
                checked={includeUnstagedChanges}
                onChange={(event) =>
                  setIncludeUnstagedChanges(event.currentTarget.checked)
                }
                disabled={selectedGitActionStatus !== "idle"}
              />
              <span className="git-action-checkbox" aria-hidden="true">
                {includeUnstagedChanges ? <Check size={14} strokeWidth={3} /> : null}
              </span>
              <span>Include unstaged changes</span>
            </label>

            <div className="git-action-actions" role="group" aria-label="Git actions">
              <button
                className="git-action-row primary"
                type="button"
                aria-label="Commit"
                onClick={() => void handleCommitAll()}
                disabled={
                  !canCommitFromDialog || selectedGitActionStatus !== "idle"
                }
              >
                <span>
                  {selectedGitActionStatus === "committing" ? (
                    <Loader2 className="spin" size={16} aria-hidden="true" />
                  ) : selectedGitActionStatus === "generating" ? (
                    <Loader2 className="spin" size={16} aria-hidden="true" />
                  ) : (
                    <GitCommitHorizontal size={16} aria-hidden="true" />
                  )}
                  {selectedGitActionStatus === "generating"
                    ? "Generating"
                    : "Commit"}
                </span>
                <kbd>Cmd Return</kbd>
              </button>
              <button
                className="git-action-row"
                type="button"
                aria-label="Commit and push"
                onClick={() => void handleCommitAll({ pushAfter: true })}
                disabled={
                  !canCommitFromDialog || selectedGitActionStatus !== "idle"
                }
              >
                <span>
                  {selectedGitActionStatus === "generating" ? (
                    <Loader2 className="spin" size={16} aria-hidden="true" />
                  ) : (
                    <UploadCloud size={16} aria-hidden="true" />
                  )}
                  {selectedGitActionStatus === "generating"
                    ? "Generating"
                    : "Commit and push"}
                </span>
              </button>
              <button
                className="git-action-row"
                type="button"
                aria-label="Push"
                onClick={() => void handlePushOnly()}
                disabled={
                  !headerGitAction.canPush ||
                  selectedGitActionStatus !== "idle"
                }
              >
                <span>
                  {selectedGitActionStatus === "pushing" ? (
                    <Loader2 className="spin" size={16} aria-hidden="true" />
                  ) : (
                    <UploadCloud size={16} aria-hidden="true" />
                  )}
                  Push
                </span>
              </button>
            </div>
          </section>
        </div>
      ) : null}

      <section
        className={`main ${activeView === "task" ? "task-main" : ""}`}
        data-tauri-drag-region={
          activeView === "task" ? selfWindowDragRegion : "false"
        }
      >
        <FloatingHeaderStatusBubble
          notices={floatingStatusNotices}
          anchorElement={taskViewportElement}
          active={activeView === "task"}
          onActivate={activateFloatingStatusNotice}
        />
        {activeView !== "task" ? (
          <>
            <header
              className="topbar"
              data-tauri-drag-region={deepWindowDragRegion}
            >
              <div data-tauri-drag-region="false">
                <p className="eyebrow">{selectedWorkspacePath}</p>
                <h2>{selectedWorkspaceName}</h2>
              </div>
              <div className="topbar-actions" data-tauri-drag-region="false">
                <span>{authMessage}</span>
                <button
                  className="icon-button"
                  type="button"
                  onClick={() => {
                    if (selectedWorkspace) {
                      void refreshWorkspaceData(selectedWorkspace.id);
                      void refreshWorkspaceGitStatus(selectedWorkspace);
                      void refreshBranches(selectedWorkspace);
                    }
                  }}
                  title="Refresh"
                >
                  <RefreshCw size={17} />
                </button>
                <button className="icon-button" type="button" onClick={() => setActiveView("settings")} title="Settings">
                  <Settings size={17} />
                </button>
              </div>
            </header>

            <div
              className="status-strip"
              data-tauri-drag-region={selfWindowDragRegion}
            >
              <span>Status</span>
              <p>{statusMessage}</p>
            </div>
          </>
        ) : null}

        {activeView === "task" ? (
          <div className="codex-workspace">
            <WorkspaceContextBanner
              workspace={selectedWorkspace}
              branch={selectedBranch}
              branches={branches}
              gitState={selectedGitStatusState}
              gitSummary={selectedGitSummary}
              gitAction={headerGitAction}
              gitActionStatus={selectedGitActionStatus}
              commitDialogOpen={commitDialogOpen}
              contextUsage={selectedWorkspaceContextUsage}
              contextWindow={selectedModelContextWindow}
              onGitAction={() => void handleHeaderGitAction()}
              onBranchChange={(branch) => void selectBranch(branch)}
              branchCreationBusy={branchCreationPendingWorkspaceId !== null}
              onCreateBranch={openBranchCreationDialog}
              newChatDisabled={false}
              onNewChat={startNewWorkspaceChat}
              historyOpen={historyDrawerOpen}
              historyNotificationCount={selectedWorkspaceUnreadChatCount}
              onToggleHistory={toggleHistoryDrawer}
              browserSession={
                selectedActiveRunControl?.browserSession?.state ?? null
              }
              onFocusBrowser={() => void focusSelectedBrowserSession()}
              onStopBrowser={() => void stopSelectedBrowserSession()}
              windowDragRegionsEnabled={macOsWindowDragRegionsEnabled}
            />
            <div
              className={`codex-workspace-body${
                historyDrawerSpaceReserved ? " history-space-reserved" : ""
              }${historyDrawerOpen ? " history-open" : ""}${
                subagentInspectorTarget ? " subagent-inspector-open" : ""
              }`}
              data-history-transition-phase={historyDrawerPhase}
            >
              <section
                className={`task-hero ${hasTaskChat ? "has-chat" : ""}`}
                aria-label="Task chat"
                data-tauri-drag-region={selfWindowDragRegion}
                ref={setTaskViewportElement}
              >
                {visibleTaskChatEntries.length > 0 ? (
                  <TaskTranscriptErrorBoundary
                    resetKey={
                      selectedHistoricalTranscript
                        ? `history:${selectedHistoricalTranscript.chatId}:${selectedHistoricalTranscript.sourceVersion}`
                        : `live:${selectedWorkspace?.id ?? "none"}`
                    }
                    onError={(error) => {
                      setStatusMessage(
                        `Could not display chat: ${error.message}`,
                      );
                    }}
                  >
                    <VirtuosoTaskChatTranscript
                      ref={taskChatTranscriptRef}
                      key={selectedTranscriptIdentity}
                      entries={visibleTaskChatEntries}
                      transcriptIdentity={selectedTranscriptIdentity}
                      transcriptVersion={
                        selectedHistoricalTranscript?.sourceVersion ?? "live"
                      }
                      restoredViewportSnapshot={
                        selectedTranscriptViewportSnapshot
                      }
                      onViewportSnapshotChange={rememberTranscriptViewport}
                      viewportWidth={taskViewportWidth}
                      viewportStable={taskViewportStable}
                      firstItemIndex={
                        selectedHistoricalTranscript?.firstItemIndex ??
                        HISTORY_VIRTUOSO_BASE_INDEX
                      }
                      openAtLatestRequest={
                        selectedHistoricalTranscript?.openAtLatestRequest ?? null
                      }
                      onOpenAtLatestApplied={
                        clearHistoricalLatestPositionRequest
                      }
                      onOpenAtLatestCancelled={
                        clearHistoricalLatestPositionRequest
                      }
                      liveFollow={runIsActive}
                      onResolveRequest={resolveTranscriptRequest}
                      onAnswerUserInput={answerTranscriptUserInput}
                      onImplementPlan={implementTranscriptPlan}
                      onRevisePlan={reviseTranscriptPlan}
                      onCancelPlan={cancelTranscriptPlan}
                      onOpenFileLink={openTranscriptFileLink}
                      onOpenWebPreview={openTranscriptWebPreview}
                      onReviewEditedFile={reviewTranscriptEditedFile}
                      onUndoEditedFiles={undoTranscriptEditedFiles}
                      fileUndoDisabled={selectedWorkspaceRunningChatActivity.size > 0}
                      editablePromptEntryId={editablePromptEntryId}
                      onEditPrompt={editTranscriptPrompt}
                      onScrollActivityChange={
                        handleTranscriptScrollActivityChange
                      }
                      onLoadHistoricalActivity={loadTranscriptHistoricalActivity}
                      notificationFocusRequest={transcriptNotificationFocusRequest}
                      onNotificationFocusApplied={completeAgentNotificationFocus}
                    />
                  </TaskTranscriptErrorBoundary>
                ) : selectedHistoryChatLoading ? (
                  <HistoryChatLoading
                    title={selectedHistoryChatLoading.title}
                    error={selectedHistoryChatLoading.error}
                  />
                ) : (
                  <h1>{taskQuote}</h1>
                )}
                {editedPromptNotice &&
                editedPromptNotice.kind === "rerun-error" &&
                editedPromptNotice.workspaceId === selectedWorkspace?.id &&
                visibleTaskChatEntries.some(
                  (entry) => entry.clientId === editedPromptNotice.entryId,
                ) ? (
                  <div
                    className="edited-prompt-notice"
                    role="alert"
                  >
                    <AlertCircle size={16} aria-hidden="true" />
                    <span>{editedPromptNotice.message}</span>
                  </div>
                ) : null}
                <TaskComposer
                  disabled={
                    !canRun ||
                    selectedGoalTerminationPending
                  }
                  runActive={runIsActive}
                  prompt={prompt}
                  promptRevision={promptRevision}
                  accounts={signedInAccounts}
                  selectedAccountId={selectedComposerAccountId}
                  accountPlaceholder={selectedComposerAccountPlaceholder}
                  accountSelectionDisabled={
                    runIsActive || selectedGoalTerminationPending
                  }
                  modelSelectionDisabled={
                    planReviewAwaiting ||
                    selectedGoalTerminationPending
                  }
                  models={models}
                  modelLoadError={modelLoadError}
                  selectedModelId={selectedModelId}
                  selectedReasoningEffort={selectedReasoningEffort}
                  goalMode={goalMode}
                  planMode={planMode}
                  goalProgress={selectedGoalProgress}
                  planProgress={selectedPlanProgress}
                  subagentConversationKey={selectedSubagentConversationKey}
                  queueItems={selectedPromptQueueItems}
                  queueActionPendingItemId={promptQueueActionPendingItemId}
                  queueEditActive={promptQueueComposerEdit !== null}
                  queueEditSaving={
                    promptQueueComposerEdit?.status === "saving"
                  }
                  queueEditError={promptQueueComposerEdit?.error ?? null}
                  accessMode={accessMode}
                  contextFiles={contextFiles}
                  selectedSkills={selectedSkills}
                  mentionResults={mentionResults}
                  mentionSearchStatus={mentionSearchStatus}
                  mentionSearchError={mentionSearchError}
                  slashCommandResults={slashCommandResults}
                  slashCommandSearchStatus={slashCommandSearchStatus}
                  slashCommandSearchError={slashCommandSearchError}
                  onAccountChange={selectComposerAccount}
                  onPromptChange={changeComposerPrompt}
                  onModelChange={setSelectedModelId}
                  onReasoningEffortChange={setSelectedReasoningEffort}
                  onGoalModeChange={handleGoalModeChange}
                  onPlanModeChange={handlePlanModeChange}
                  onPauseGoal={() => {
                    void updateSelectedGoalStatus("paused");
                  }}
                  onResumeGoal={() => {
                    void updateSelectedGoalStatus("active");
                  }}
                  onEditGoal={requestEditSelectedGoal}
                  onStopGoal={() => {
                    void stopSelectedGoal();
                  }}
                  onQueueEdit={editComposerQueuedPrompt}
                  onQueueRemove={removeComposerQueuedPrompt}
                  onQueueRetry={retryComposerQueuedPrompt}
                  onQueueAutoSendChange={changeComposerQueuedPromptAutoSend}
                  onQueueSendNow={sendComposerQueuedPromptNow}
                  onQueueReorder={reorderComposerPromptQueue}
                  onInspectSubagent={openSubagentInspector}
                  onQueueEditCancel={cancelComposerQueuedPromptEdit}
                  onDispatchQueued={dispatchSelectedPromptQueue}
                  onAccessModeChange={handleAccessModeChange}
                  onAddFiles={chooseComposerContextFiles}
                  onMentionSearch={searchComposerMentionFiles}
                  onMentionFileSelect={selectComposerMentionFile}
                  onMentionClose={closeComposerMentionSearch}
                  onSlashCommandSearch={searchComposerSlashCommands}
                  onSlashCommandSelect={selectComposerSlashCommand}
                  onSlashCommandClose={closeComposerSlashSearch}
                  onContextFilesDrop={dropComposerContextFiles}
                  onContextFilesDropError={setStatusMessage}
                  contextDropActive={taskContextDropActive}
                  onDropSurfaceElementChange={handleTaskComposerDropSurfaceElementChange}
                  onPromptElementChange={handleTaskComposerPromptElementChange}
                  hasContextFileDropFallback={hasComposerContextFileDropFallback}
                  getContextFileDropFallback={getComposerContextFileDropFallback}
                  onContextFileDropHandled={completeComposerContextFileDrop}
                  onRemoveFile={removeComposerContextFile}
                  onRemoveSkill={removeComposerSkill}
                  onRun={runComposerPrompt}
                  onStop={stopComposerRun}
                />
              </section>
              <WorkspaceHistoryDrawer
                phase={historyDrawerPhase}
                workspace={selectedWorkspace}
                historyState={historyState}
                selectedChatId={selectedHistoryChatId ?? selectedWorkspaceChatSession?.chatId ?? null}
                runningChatActivity={selectedWorkspaceRunningChatActivity}
                onSelectChat={selectHistoryChatFromDrawer}
                onOpenChatContextMenu={openChatHistoryContextMenuFromDrawer}
                onTransitionEnd={handleHistoryDrawerTransitionEnd}
              />
              {subagentInspectorTarget ? (
                <SubagentInspector
                  conversationKey={
                    subagentInspectorTarget.conversationKey
                  }
                  subagentId={subagentInspectorTarget.subagentId}
                  parentEntry={inspectedSubagentParentEntry}
                  parentRunView={
                    inspectedSubagentParentEntry?.runView ?? null
                  }
                  onClose={closeSubagentInspector}
                  onLoadTranscript={loadSubagentTranscript}
                  onResolveRequest={resolveTranscriptRequest}
                  onAnswerUserInput={answerTranscriptUserInput}
                  onSteer={steerSubagent}
                  onStop={stopSubagent}
                />
              ) : null}
              {chatHistoryContextMenu ? (
                <div
                  className="workspace-context-menu"
                  ref={chatHistoryContextMenuRef}
                  role="menu"
                  aria-label={`${chatHistoryContextMenu.chat.title} chat actions`}
                  style={{
                    left: chatHistoryContextMenu.x,
                    top: chatHistoryContextMenu.y,
                  }}
                >
                  <button
                    className="workspace-context-menu-item danger"
                    type="button"
                    role="menuitem"
                    onClick={() => requestChatHistoryDelete(chatHistoryContextMenu.chat)}
                    disabled={
                      findRunControlByChat(
                        chatHistoryContextMenu.chat.workspace_id,
                        chatHistoryContextMenu.chat.id,
                      ) !== null
                    }
                  >
                    <Trash2 size={15} aria-hidden="true" />
                    <span>Remove chat</span>
                  </button>
                </div>
              ) : null}
            </div>
            <FilePreviewDrawer
              previewState={previewState}
              previewGitStatus={previewGitStatus}
              previewRenderableDiffSections={previewRenderableDiffSections}
              previewDiffHasBinary={previewDiffHasBinary}
              previewDiffEmpty={previewDiffEmpty}
              previewDiffLayout={previewDiffLayout}
              resolvedTheme={resolvedTheme}
              previewDrawerWidth={previewDrawerWidth}
              previewResizing={previewResizing}
              minWidth={PREVIEW_DRAWER_MIN_WIDTH}
              maxWidth={previewDrawerMaxWidth}
              onModeChange={setWorkspacePreviewMode}
              onClose={closeWorkspaceFilePreview}
              onResizeStart={startPreviewDrawerResize}
              onResizeKeyDown={handlePreviewResizeKeyDown}
            />
          </div>
        ) : null}

        {activeView === "analytics" ? (
          <div
            className="view-stack"
            data-tauri-drag-region={selfWindowDragRegion}
          >
            <AnalyticsSummary summary={analytics} />
            <section className="surface analytics-detail" aria-label="Analytics detail">
              <div className="surface-header">
                <div>
                  <p className="eyebrow">Local metrics</p>
                  <h2>Workspace usage</h2>
                </div>
              </div>
              <div className="analytics-breakdown">
                <div>
                  <span>Completed runs</span>
                  <strong>{analytics.completed_count.toLocaleString()}</strong>
                </div>
                <div>
                  <span>Cached tokens</span>
                  <strong>{analytics.cached_tokens.toLocaleString()}</strong>
                </div>
                <div>
                  <span>Failure rate</span>
                  <strong>
                    {analytics.run_count
                      ? `${Math.round((analytics.failed_count / analytics.run_count) * 100)}%`
                      : "0%"}
                  </strong>
                </div>
              </div>
            </section>
          </div>
        ) : null}

        {activeView === "settings" ? (
          <div
            className="settings-grid"
            data-tauri-drag-region={selfWindowDragRegion}
          >
            <section className="surface settings-panel appearance-panel" aria-label="Appearance settings">
              <div className="surface-header">
                <div>
                  <p className="eyebrow">Appearance</p>
                  <h2>Theme</h2>
                </div>
              </div>
              <div className="setting-row appearance-setting">
                <div>
                  <strong>Interface theme</strong>
                  <span>Choose a theme or follow your system appearance.</span>
                </div>
                <div
                  className="theme-selector"
                  role="radiogroup"
                  aria-label="Interface theme"
                >
                  {THEME_OPTIONS.map((option) => {
                    const ThemeIcon = option.icon;
                    const selected = themePreference === option.value;

                    return (
                      <button
                        className={selected ? "active" : ""}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        key={option.value}
                        onClick={() => setThemePreference(option.value)}
                      >
                        <ThemeIcon size={16} aria-hidden="true" />
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </section>

            <section
              className="surface settings-panel computer-use-settings-panel"
              aria-label="Computer use settings"
            >
              <div className="surface-header">
                <div>
                  <p className="eyebrow">Agent capabilities</p>
                  <h2>Computer use</h2>
                </div>
                <span
                  className={`notification-permission-status ${
                    browserRuntimeStatus === null
                      ? ""
                      : browserRuntimeStatus.available
                        ? "permission-allowed"
                        : "permission-denied"
                  }`}
                >
                  {browserRuntimeStatus?.available === false ? (
                    <AlertCircle size={14} aria-hidden="true" />
                  ) : (
                    <Monitor size={14} aria-hidden="true" />
                  )}
                  {browserRuntimeStatus === null
                    ? "Checking"
                    : browserRuntimeStatus.available
                      ? "Available"
                      : "Unavailable"}
                </span>
              </div>
              <div className="setting-list">
                <label className="setting-row checkbox-setting">
                  <div>
                    <strong>Enable browser computer use</strong>
                    <span>
                      Give future agent turns an isolated browser that opens only
                      when Codex uses it.
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={computerUseEnabled}
                    onChange={(event) =>
                      setComputerUseEnabled(event.currentTarget.checked)
                    }
                  />
                </label>
              </div>
              {browserRuntimeStatus?.available === false ? (
                <p className="computer-use-runtime-error" role="alert">
                  {browserRuntimeStatus.message ??
                    "The bundled browser runtime is unavailable."}
                </p>
              ) : null}
            </section>

            <section
              className="surface settings-panel notification-settings-panel"
              aria-label="Notification settings"
            >
              <div className="surface-header">
                <div>
                  <p className="eyebrow">Notifications</p>
                  <h2>Agent alerts</h2>
                </div>
                <span
                  className={`notification-permission-status permission-${agentNotificationPermission}`}
                >
                  {agentNotificationPermission === "allowed" ? (
                    <Bell size={14} aria-hidden="true" />
                  ) : (
                    <BellOff size={14} aria-hidden="true" />
                  )}
                  {agentNotificationPermissionLabel(agentNotificationPermission)}
                </span>
              </div>
              <div className="setting-list">
                <label className="setting-row checkbox-setting">
                  <div>
                    <strong>Completed responses</strong>
                    <span>Notify when a response finishes while Orchestrator is not focused.</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={agentNotificationPreferences.responseCompleted}
                    onChange={(event) =>
                      handleAgentNotificationPreferenceChange(
                        "responseCompleted",
                        event.currentTarget.checked,
                      )
                    }
                  />
                </label>
                <label className="setting-row checkbox-setting">
                  <div>
                    <strong>Approval requests</strong>
                    <span>Notify when Codex needs permission to continue.</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={agentNotificationPreferences.approvalRequired}
                    onChange={(event) =>
                      handleAgentNotificationPreferenceChange(
                        "approvalRequired",
                        event.currentTarget.checked,
                      )
                    }
                  />
                </label>
                <label className="setting-row checkbox-setting">
                  <div>
                    <strong>Agent questions</strong>
                    <span>Notify when Codex needs your answer to continue.</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={agentNotificationPreferences.userInputRequired}
                    onChange={(event) =>
                      handleAgentNotificationPreferenceChange(
                        "userInputRequired",
                        event.currentTarget.checked,
                      )
                    }
                  />
                </label>
                <label className="setting-row checkbox-setting">
                  <div>
                    <strong>Plans ready</strong>
                    <span>Notify when a plan is ready to implement or revise.</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={agentNotificationPreferences.planReady}
                    onChange={(event) =>
                      handleAgentNotificationPreferenceChange(
                        "planReady",
                        event.currentTarget.checked,
                      )
                    }
                  />
                </label>
                <label className="setting-row checkbox-setting">
                  <div>
                    <strong>External actions</strong>
                    <span>Notify when browser sign-in or another external step is required.</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={agentNotificationPreferences.externalAction}
                    onChange={(event) =>
                      handleAgentNotificationPreferenceChange(
                        "externalAction",
                        event.currentTarget.checked,
                      )
                    }
                  />
                </label>
              </div>
              <div className="notification-settings-actions">
                {agentNotificationPermission === "denied" ? (
                  <button
                    className="secondary"
                    type="button"
                    onClick={() => void handleOpenAgentNotificationSettings()}
                  >
                    <Settings size={16} aria-hidden="true" />
                    Open macOS settings
                  </button>
                ) : agentNotificationPermission !== "allowed" ? (
                  <button
                    className="secondary"
                    type="button"
                    onClick={() => void handleEnableAgentNotifications()}
                    disabled={agentNotificationPermission === "unavailable"}
                  >
                    <Bell size={16} aria-hidden="true" />
                    Enable notifications
                  </button>
                ) : null}
              </div>
            </section>

            <section className="surface settings-panel" aria-label="Codex settings">
              <div className="surface-header">
                <div>
                  <p className="eyebrow">Settings</p>
                  <h2>Codex connection</h2>
                </div>
                <span className={`run-status ${codexConnected ? "completed" : "interrupted"}`}>
                  {codexConnected ? "connected" : "disconnected"}
                </span>
              </div>
              <div className="setting-list">
                <div className="account-management">
                  {codexAccounts.length === 0 ? (
                    <p className="muted">No Codex accounts added.</p>
                  ) : (
                    codexAccounts.map((account) => (
                      <article
                        className="managed-account-row"
                        key={account.id}
                        data-managed-account-id={account.id}
                        tabIndex={-1}
                      >
                        <span className="account-mini-avatar" aria-hidden="true">
                          {(account.email ?? account.label).charAt(0).toUpperCase()}
                        </span>
                        <div>
                          <input
                            defaultValue={account.label}
                            onBlur={(event) =>
                              void handleRenameAccount(
                                account.id,
                                event.currentTarget.value,
                              )
                            }
                            aria-label={`Account label for ${account.label}`}
                            disabled={runIsActive}
                          />
                          <span>
                            {account.email ?? "Not signed in"} · {account.plan_type ?? account.status}
                          </span>
                        </div>
                        <div className="button-row compact">
                          {account.id !== selectedAccountId ? (
                            <button
                              className="secondary small"
                              type="button"
                              onClick={() => void selectCodexAccount(account.id)}
                              disabled={runIsActive}
                            >
                              Select
                            </button>
                          ) : null}
                          {account.status !== "signed_in" ? (
                            <button
                              className="secondary small"
                              type="button"
                              onClick={() => {
                                setSelectedAccountId(account.id);
                                selectedAccountIdRef.current = account.id;
                                void handleLoginForAccount(account);
                              }}
                              disabled={runIsActive || loginState === "waiting"}
                            >
                              <LogIn size={14} />
                              Sign in
                            </button>
                          ) : null}
                          <button
                            className="danger icon-button"
                            type="button"
                            onClick={() => void handleRemoveAccount(account.id)}
                            disabled={runIsActive}
                            title={`Remove ${account.label}`}
                            aria-label={`Remove ${account.label}`}
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </article>
                    ))
                  )}
                  <button
                    className="secondary"
                    type="button"
                    onClick={() => void handleAddAccount()}
                    disabled={runIsActive || loginState === "waiting"}
                  >
                    <UserPlus size={16} />
                    Add Codex account
                  </button>
                </div>
                <div className="setting-row">
                  <div>
                    <strong>Selected account</strong>
                    <span>{authMessage}</span>
                  </div>
                  <div className="button-row compact">
                    <button
                      className="secondary"
                      type="button"
                      onClick={() =>
                        selectedAccountId &&
                        void ensureCodexConnected(selectedAccountId)
                      }
                      disabled={!selectedAccountId || runIsActive}
                    >
                      <Plug size={16} />
                      Connect
                    </button>
                    {showLogout ? (
                      <button
                        className="secondary"
                        type="button"
                        onClick={handleLogout}
                        disabled={runIsActive}
                      >
                        <LogOut size={16} />
                        Log out
                      </button>
                    ) : null}
                  </div>
                </div>
                <label className="setting-row checkbox-setting">
                  <div>
                    <strong>Use local OSS provider</strong>
                    <span>Pass Codex config overrides for OSS mode when launching runs.</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={useOss}
                    onChange={(event) => setUseOss(event.currentTarget.checked)}
                  />
                </label>
                <div className="setting-row">
                  <div>
                    <strong>OSS provider</strong>
                    <span>Used only when local OSS mode is enabled.</span>
                  </div>
                  <ComposerSelect
                    ariaLabel="Settings OSS provider"
                    value={ossProvider}
                    options={[
                      { value: "ollama", label: "Ollama" },
                      { value: "lmstudio", label: "LM Studio" },
                    ]}
                    placeholder="Select provider"
                    icon={<Plug size={16} />}
                    className="settings-provider-select"
                    disabled={!useOss}
                    onChange={(value) => setOssProvider(value as OssProvider)}
                  />
                </div>
              </div>
            </section>

            <section className="surface brand-panel" aria-label="About Orchestrator">
              <div className="brand-lockup">
                <img src={orchestratorMark} alt="" />
                <div>
                  <h2>Orchestrator</h2>
                  <span>Token-aware Codex workspace</span>
                </div>
              </div>
              <p>
                A token-aware desktop workspace for Codex runs, advisory preflight,
                context budgeting, and local analytics.
              </p>
            </section>
          </div>
        ) : null}
      </section>

      {explorerDragPreview ? (
        <div
          className={`explorer-drag-preview ${
            explorerDragPreview.overDropSurface ? "over-drop-surface" : ""
          }`}
          role="status"
          aria-label={`Dragging ${explorerDragPreview.fileName}`}
          style={{
            left: explorerDragPreview.x,
            top: explorerDragPreview.y,
          }}
        >
          <FileText size={15} aria-hidden="true" />
          <span>{explorerDragPreview.fileName}</span>
          <small>
            {explorerDragPreview.overDropSurface ? "Drop to add" : "Drag to chat"}
          </small>
        </div>
      ) : null}
    </main>
  );
}

function WorkspaceContextBanner({
  workspace,
  branch,
  branches,
  gitState,
  gitSummary,
  gitAction,
  gitActionStatus,
  commitDialogOpen,
  contextUsage,
  contextWindow,
  onGitAction,
  onBranchChange,
  branchCreationBusy,
  onCreateBranch,
  newChatDisabled,
  onNewChat,
  historyOpen,
  historyNotificationCount,
  onToggleHistory,
  browserSession,
  onFocusBrowser,
  onStopBrowser,
  windowDragRegionsEnabled,
}: {
  workspace: Workspace | null;
  branch: string | null;
  branches: string[];
  gitState: WorkspaceGitStatusState | null;
  gitSummary: WorkspaceGitSummary;
  gitAction: HeaderGitAction;
  gitActionStatus: "idle" | "generating" | "committing" | "pushing";
  commitDialogOpen: boolean;
  contextUsage: RunViewState["tokenUsage"];
  contextWindow: number;
  onGitAction: () => void;
  onBranchChange: (branch: string) => void;
  branchCreationBusy: boolean;
  onCreateBranch: () => void;
  newChatDisabled: boolean;
  onNewChat: () => void;
  historyOpen: boolean;
  historyNotificationCount: number;
  onToggleHistory: () => void;
  browserSession: BrowserSessionState | null;
  onFocusBrowser: () => void;
  onStopBrowser: () => void;
  windowDragRegionsEnabled: boolean;
}) {
  const [browserMenuOpen, setBrowserMenuOpen] = useState(false);
  const browserMenuRef = useRef<HTMLDivElement>(null);
  const deepWindowDragRegion = windowDragRegionValue(
    windowDragRegionsEnabled,
    "deep",
  );
  const browserVisible =
    browserSession !== null &&
    ["starting", "running", "awaiting-approval", "error"].includes(
      browserSession.status,
    );

  useEffect(() => {
    if (!browserMenuOpen) return;
    const closeForPointer = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !browserMenuRef.current?.contains(event.target)
      ) {
        setBrowserMenuOpen(false);
      }
    };
    const closeForEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setBrowserMenuOpen(false);
    };
    window.addEventListener("pointerdown", closeForPointer);
    window.addEventListener("keydown", closeForEscape);
    return () => {
      window.removeEventListener("pointerdown", closeForPointer);
      window.removeEventListener("keydown", closeForEscape);
    };
  }, [browserMenuOpen]);

  useEffect(() => {
    if (!browserVisible) setBrowserMenuOpen(false);
  }, [browserVisible]);

  if (!workspace) {
    return (
      <section
        className="workspace-context-banner empty"
        aria-label="Selected folder"
        data-tauri-drag-region={deepWindowDragRegion}
      >
        <div className="workspace-context-left">
          <div className="workspace-context-main">
            <span className="workspace-context-icon" aria-hidden="true">
              <Folder size={17} />
            </span>
            <div data-tauri-drag-region="false">
              <strong>No folder selected</strong>
              <span>Add or choose a workspace to start a task.</span>
            </div>
          </div>
          <WorkspaceContextMeter tokenUsage={null} contextWindow={contextWindow} />
        </div>
        <div className="workspace-context-actions" data-tauri-drag-region="false">
          <button className="workspace-header-button" type="button" disabled>
            <GitCommitHorizontal size={15} />
            Git
          </button>
          <button
            className="workspace-header-button icon-only"
            type="button"
            disabled
            aria-label="New chat"
            title="Start a new chat"
          >
            <SquarePen size={15} />
          </button>
          <button
            className="workspace-header-button icon-only history-panel-button"
            type="button"
            disabled
            aria-label="Open chat history"
            title="History"
          >
            <PanelRight size={15} />
          </button>
        </div>
      </section>
    );
  }

  const gitLoading =
    !gitState ||
    gitState.status === "loading" ||
    gitState.status === "idle";
  const gitError = gitState?.status === "error";
  const gitClean = !gitLoading && !gitError && gitSummary.total === 0;
  const gitOperationRunning =
    gitActionStatus === "committing" || gitActionStatus === "pushing";
  const branchSelectorDisabled =
    gitLoading ||
    gitError ||
    gitActionStatus !== "idle" ||
    branchCreationBusy;
  const gitBusyLabel =
    gitActionStatus === "generating"
      ? "Generating commit message"
      : gitActionStatus === "committing"
        ? "Committing changes"
        : gitActionStatus === "pushing"
          ? "Pushing branch"
          : null;

  return (
    <section
      className="workspace-context-banner"
      aria-label="Selected folder"
      data-tauri-drag-region={deepWindowDragRegion}
    >
      <div className="workspace-context-left">
        <div className="workspace-context-main">
          <span className="workspace-context-icon" aria-hidden="true">
            <Folder size={17} />
          </span>
          <div data-tauri-drag-region="false">
            <strong>{workspace.label}</strong>
            <span title={workspace.path}>{workspace.path}</span>
          </div>
        </div>
        <div
          className="workspace-context-chips"
          aria-label="Selected folder status"
          data-tauri-drag-region="false"
        >
          {gitOperationRunning ? (
            <span
              className="workspace-context-chip git-operation-running"
              role="status"
              aria-label={gitBusyLabel ?? "Git operation in progress"}
            >
              <Loader2 className="spin" size={14} aria-hidden="true" />
              <span className="sr-only">
                {gitActionStatus === "committing" ? "Committing" : "Pushing"}
              </span>
            </span>
          ) : null}
          {!gitOperationRunning && gitLoading ? (
            <span className="workspace-context-chip">Checking git</span>
          ) : null}
          {!gitOperationRunning && gitError ? (
              <span className="workspace-context-chip warning">
                Git unavailable
              </span>
          ) : null}
          {!gitOperationRunning && gitClean ? (
            <span className="workspace-context-chip clean">Clean</span>
          ) : null}
          {!gitOperationRunning &&
          !gitLoading &&
          !gitError &&
          gitSummary.total > 0 ? (
            <WorkspaceContextGitSummaryChip gitSummary={gitSummary} />
          ) : null}
          <WorkspaceContextMeter
            tokenUsage={contextUsage}
            contextWindow={contextWindow}
          />
        </div>
      </div>

      <div className="workspace-context-actions" data-tauri-drag-region="false">
        <ComposerSelect
          ariaLabel="Branch"
          value={branch ?? ""}
          options={[
            ...branches.map((candidate) => ({
              value: candidate,
              label: candidate,
            })),
            {
              id: "create-branch",
              value: "",
              label: "Create branch...",
              action: true,
              icon: <GitBranchPlus size={14} />,
            },
          ]}
          placeholder="No branch"
          icon={<GitBranch size={14} />}
          className="workspace-branch-select"
          disabled={branchSelectorDisabled}
          onChange={onBranchChange}
          onAction={(actionId) => {
            if (actionId === "create-branch") onCreateBranch();
          }}
        />
        {browserVisible ? (
          <div className="workspace-browser-action" ref={browserMenuRef}>
            <button
              className={`workspace-header-button icon-only browser-session-button browser-${browserSession.status}`}
              type="button"
              aria-label="Browser session"
              title={
                browserSession.status === "awaiting-approval"
                  ? "Browser needs approval"
                  : browserSession.status === "starting"
                    ? "Browser is starting"
                    : browserSession.status === "error"
                      ? "Browser session failed"
                      : "Focus browser"
              }
              aria-expanded={browserMenuOpen}
              onClick={() => {
                if (
                  browserSession.status === "running" ||
                  browserSession.status === "awaiting-approval"
                ) {
                  onFocusBrowser();
                }
                setBrowserMenuOpen((current) => !current);
              }}
            >
              {browserSession.status === "starting" ? (
                <Loader2 className="spin" size={15} aria-hidden="true" />
              ) : browserSession.status === "awaiting-approval" ||
                browserSession.status === "error" ? (
                <AlertCircle size={15} aria-hidden="true" />
              ) : (
                <Monitor size={15} aria-hidden="true" />
              )}
            </button>
            {browserMenuOpen ? (
              <div
                className="workspace-browser-popover"
                role="group"
                aria-label="Browser session controls"
              >
                <button
                  className="native-plan-icon-action"
                  type="button"
                  aria-label="Focus browser"
                  data-tooltip="Focus browser"
                  disabled={
                    browserSession.status !== "running" &&
                    browserSession.status !== "awaiting-approval"
                  }
                  onClick={() => {
                    onFocusBrowser();
                    setBrowserMenuOpen(false);
                  }}
                >
                  <Monitor size={15} aria-hidden="true" />
                </button>
                <button
                  className="native-plan-icon-action cancel"
                  type="button"
                  aria-label="Stop browser"
                  data-tooltip="Stop browser"
                  onClick={() => {
                    onStopBrowser();
                    setBrowserMenuOpen(false);
                  }}
                >
                  <X size={15} aria-hidden="true" />
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
        <div className="workspace-git-action">
          <button
            className="workspace-header-button icon-only primary"
            type="button"
            onClick={onGitAction}
            disabled={gitAction.disabled || gitActionStatus !== "idle"}
            title={
              gitBusyLabel ??
              (gitAction.disabled ? gitAction.reason : gitAction.label)
            }
            aria-label={gitAction.label}
            aria-expanded={commitDialogOpen}
            aria-busy={gitActionStatus !== "idle"}
          >
            {gitActionStatus === "generating" ? (
              <Loader2 className="spin" size={15} aria-hidden="true" />
            ) : (
              <GitCommitHorizontal size={15} aria-hidden="true" />
            )}
          </button>
        </div>
        <button
          className="workspace-header-button icon-only"
          type="button"
          onClick={onNewChat}
          disabled={newChatDisabled}
          aria-label="New chat"
          title="Start a new chat"
        >
          <SquarePen size={15} />
        </button>
        <button
          className={`workspace-header-button icon-only history-panel-button ${
            historyOpen ? "active" : ""
          }`}
          type="button"
          onClick={onToggleHistory}
          aria-label={historyOpen ? "Close chat history" : "Open chat history"}
          title={historyOpen ? "Close history" : "Open history"}
          aria-pressed={historyOpen}
        >
          <PanelRight size={15} />
          {historyNotificationCount > 0 ? (
            <span
              className="history-notification-badge"
              aria-label={`${historyNotificationCount} completed chat${
                historyNotificationCount === 1 ? "" : "s"
              }`}
            >
              {historyNotificationCount > 9 ? "9+" : historyNotificationCount}
            </span>
          ) : null}
        </button>
      </div>
    </section>
  );
}

function HistoryChatLoading({
  title,
  error,
}: {
  title: string;
  error: string | null;
}) {
  return (
    <section className="task-chat-loading" aria-label="Task chat transcript">
      {error ? (
        <p className="history-chat-load-error" role="alert">
          Could not open {title}: {error}
        </p>
      ) : (
        <p className="stream-placeholder stream-preparing" aria-label="Loading chat">
          <span className="stream-loading-dots" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          Loading {title}
        </p>
      )}
    </section>
  );
}

function WorkspaceContextGitSummaryChip({
  gitSummary,
}: {
  gitSummary: WorkspaceGitSummary;
}) {
  const statusLabel = formatGitSummaryForStatus(gitSummary);
  const label = `${statusLabel}; ${formatChangeStatLabel(
    gitSummary.additions,
    "addition",
    "additions",
  )}, ${formatChangeStatLabel(gitSummary.deletions, "deletion", "deletions")}`;

  return (
    <span
      className="workspace-context-chip changed git-summary"
      title={label}
      aria-label={label}
    >
      <span className="workspace-context-change-stat additions">
        +{gitSummary.additions.toLocaleString()}
      </span>
      <span className="workspace-context-change-stat deletions">
        -{gitSummary.deletions.toLocaleString()}
      </span>
    </span>
  );
}

function formatChangeStatLabel(count: number, singular: string, plural: string) {
  return `${count.toLocaleString()} ${count === 1 ? singular : plural}`;
}

function WorkspaceContextMeter({
  tokenUsage,
  contextWindow,
}: {
  tokenUsage: RunViewState["tokenUsage"];
  contextWindow: number;
}) {
  const usage = getContextUsageDisplay(
    tokenUsage,
    contextWindow,
    DEFAULT_CONTEXT_WINDOW,
  );

  const meterStyle =
    usage.percentage === null
      ? undefined
      : ({ "--context-meter-fill": `${usage.percentage}%` } as CSSProperties);

  return (
    <span
      className={`workspace-context-meter ${usage.percentage === null ? "unknown" : ""}`}
      data-tauri-drag-region="false"
      role={usage.percentage === null ? "status" : "meter"}
      aria-label="Context usage"
      aria-valuemin={usage.percentage === null ? undefined : 0}
      aria-valuemax={usage.percentage === null ? undefined : 100}
      aria-valuenow={usage.percentage === null ? undefined : usage.percentage}
      aria-valuetext={usage.label}
      title={usage.title}
      style={meterStyle}
    >
      <span className="context-meter-copy">
        {usage.percentage === null || usage.windowLabel === null ? (
          usage.label
        ) : (
          <>
            <span className="context-meter-value">
              {usage.usedLabel} / {usage.windowLabel}
            </span>
            <span className="context-meter-percent">{usage.percentage}%</span>
          </>
        )}
      </span>
    </span>
  );
}

const WorkspaceHistoryDrawer = memo(function WorkspaceHistoryDrawer({
  phase,
  workspace,
  historyState,
  selectedChatId,
  runningChatActivity,
  onSelectChat,
  onOpenChatContextMenu,
  onTransitionEnd,
}: {
  phase: HistoryDrawerPhase;
  workspace: Workspace | null;
  historyState: WorkspaceHistoryState;
  selectedChatId: number | null;
  runningChatActivity: ReadonlyMap<number, string>;
  onSelectChat: (chat: ChatListItem) => void;
  onOpenChatContextMenu: (
    chat: ChatListItem,
    event: ReactMouseEvent<HTMLElement> | ReactKeyboardEvent<HTMLElement>,
  ) => void;
  onTransitionEnd: (event: ReactTransitionEvent<HTMLElement>) => void;
}) {
  const open = phase === "opening" || phase === "open";
  const orderedChats = sortHistoryChatsByActivity(
    historyState.chats,
    runningChatActivity,
  );
  return (
    <aside
      className={`workspace-history-drawer ${phase}`}
      aria-label="Workspace chat history"
      aria-hidden={!open}
      inert={!open ? true : undefined}
      onTransitionEnd={onTransitionEnd}
    >
      <header>
        <div>
          <p className="eyebrow">History</p>
          <h2>{workspace?.label ?? "Workspace chats"}</h2>
        </div>
      </header>

      {historyState.status === "loading" ? (
        <div className="history-empty">
          <Loader2 className="spin" size={16} />
          Loading chats...
        </div>
      ) : null}
      {historyState.status === "error" ? (
        <div className="history-empty error">{historyState.error}</div>
      ) : null}
      {historyState.status === "loaded" && historyState.chats.length === 0 ? (
        <div className="history-empty">No chats yet.</div>
      ) : null}

      <div className="history-drawer-body">
        <div className="history-run-list" aria-label="Workspace chats">
          {orderedChats.map((chat) => (
            <WorkspaceHistoryRow
              key={chat.id}
              chat={chat}
              selected={selectedChatId === chat.id}
              running={runningChatActivity.has(chat.id)}
              onSelect={onSelectChat}
              onOpenContextMenu={onOpenChatContextMenu}
            />
          ))}
        </div>
      </div>
    </aside>
  );
});

const WorkspaceHistoryRow = memo(function WorkspaceHistoryRow({
  chat,
  selected,
  running,
  onSelect,
  onOpenContextMenu,
}: {
  chat: ChatListItem;
  selected: boolean;
  running: boolean;
  onSelect: (chat: ChatListItem) => void;
  onOpenContextMenu: (
    chat: ChatListItem,
    event: ReactMouseEvent<HTMLElement> | ReactKeyboardEvent<HTMLElement>,
  ) => void;
}) {
  return (
    <button
      className={`history-run-item ${selected ? "selected" : ""}`}
      type="button"
      aria-pressed={selected}
      title={chat.title}
      onClick={() => onSelect(chat)}
      onContextMenu={(event) => onOpenContextMenu(chat, event)}
      onKeyDown={(event) => {
        if (
          event.key === "ContextMenu" ||
          (event.key === "F10" && event.shiftKey)
        ) {
          onOpenContextMenu(chat, event);
        }
      }}
    >
      <span className="history-run-title-row">
        <strong>{chat.title}</strong>
        {running ? (
          <Loader2
            className="history-run-spinner spin"
            size={15}
            aria-label="Agent running"
          />
        ) : null}
      </span>
      <span>{formatHistoryChatMeta(chat)}</span>
    </button>
  );
});

function createTaskChatEntriesFromExternalTranscriptSnapshot(
  chat: ChatListItem,
  snapshot: Pick<ExternalTranscriptSnapshot, "threadId" | "turns">,
): TaskChatEntry[] {
  return snapshot.turns.map((turn) => {
    const normalizedPlan = normalizeHistoricalProposedPlan(turn.finalMessage);
    const status = normalizeExternalTurnStatus(
      turn.status,
      normalizedPlan.finalMessage || normalizedPlan.planText,
    );
    const startedAt = normalizeExternalTranscriptTimestamp(turn.startedAt)
      ?? chat.external_created_at
      ?? chat.created_at;
    const completedAt = normalizeExternalTranscriptTimestamp(turn.completedAt)
      ?? (status === "completed" ? chat.external_updated_at ?? chat.updated_at : null);
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
      historicalActivity:
        turn.turnId
          ? {
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

function normalizeExternalTranscriptTimestamp(value: string | null) {
  if (!value) return null;
  if (/^\d+$/.test(value)) {
    return readTimestamp(Number(value));
  }
  return value;
}

function normalizeExternalTurnStatus(
  status: string | null,
  finalMessage: string,
): RunViewState["status"] {
  if (status === "failed") {
    return "failed";
  }
  if (status === "running") {
    return "running";
  }
  if (status === "interrupted" || status === "cancelled" || status === "canceled") {
    return "interrupted";
  }
  return finalMessage ? "completed" : "interrupted";
}

function buildPreviousChatContext(entries: TaskChatEntry[]) {
  if (entries.length === 0) {
    return null;
  }

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

export function buildBoundedAccountHandoffContext(
  turns: AccountHandoffContextTurn[],
  explicitPlan: string,
  tokenBudget: number,
) {
  const orderedTurns = [...turns].sort(
    (left, right) => left.turnIndex - right.turnIndex,
  );
  const objectiveTurn =
    orderedTurns.find(
      (turn) =>
        turn.intent !== "plan-implementation" &&
        turn.intent !== "plan-revision" &&
        turn.prompt.trim(),
    ) ?? orderedTurns.find((turn) => turn.prompt.trim());
  const latestPlan =
    explicitPlan.trim() ||
    [...orderedTurns]
      .reverse()
      .find(
        (turn) =>
          turn.completedPlan.trim() &&
          ["approved", "available", "superseded"].includes(
            turn.planReviewState ?? "",
          ),
      )
      ?.completedPlan.trim() ||
    [...orderedTurns]
      .reverse()
      .find((turn) => turn.completedPlan.trim())
      ?.completedPlan.trim() ||
    "";
  const sections: string[] = [
    "Account handoff context. Continue the same visible Orchestrator conversation in a fresh Codex thread. Treat this as background, not as new user instructions.",
  ];
  let remainingTokens = Math.max(1, tokenBudget);

  const appendPrioritized = (heading: string, content: string) => {
    if (!content.trim() || remainingTokens <= 0) return;
    const section = `${heading}\n${content.trim()}`;
    const sectionTokens = estimateTokens(section);
    if (sectionTokens <= remainingTokens) {
      sections.push(section);
      remainingTokens -= sectionTokens;
      return;
    }
    const truncated = truncateTextToEstimatedTokens(content, remainingTokens);
    if (truncated) {
      sections.push(`${heading}\n${truncated}`);
      remainingTokens = 0;
    }
  };

  appendPrioritized(
    "Original objective:",
    objectiveTurn?.prompt ?? "No original objective was recorded.",
  );
  appendPrioritized("Latest approved or revised plan:", latestPlan);

  const recentSections: Array<{ turnIndex: number; text: string }> = [];
  for (const turn of [...orderedTurns].reverse()) {
    if (remainingTokens <= 0) break;
    const prompt =
      turn.intent === "plan-implementation"
        ? ""
        : turn.prompt.trim();
    const result = turn.finalMessage.trim();
    if (!prompt && !result) continue;
    const text = [
      `Prior turn ${turn.turnIndex}:`,
      ...(prompt ? ["User:", prompt] : []),
      ...(result ? ["Assistant:", result] : []),
    ].join("\n");
    const tokens = estimateTokens(text);
    if (tokens > remainingTokens) continue;
    recentSections.push({ turnIndex: turn.turnIndex, text });
    remainingTokens -= tokens;
  }
  recentSections
    .sort((left, right) => left.turnIndex - right.turnIndex)
    .forEach((section) => sections.push(section.text));

  return sections.join("\n\n");
}

function truncateTextToEstimatedTokens(text: string, tokenBudget: number) {
  if (tokenBudget <= 0) return "";
  if (estimateTokens(text) <= tokenBudget) return text.trim();
  const characterBudget = Math.max(0, tokenBudget * 4 - 24);
  const truncated = text.trim().slice(0, characterBudget).trimEnd();
  return truncated ? `${truncated}\n[Context truncated]` : "";
}

function createTaskChatEntryFromHistoryRun(run: HistoryRunSummary): TaskChatEntry {
  const status = normalizeHistoryRunStatus(run);
  const executionSettings = resolveStoredRunExecutionSettings(
    run.execution_settings_json,
    run,
  );
  const normalizedPlan = normalizeHistoricalProposedPlan(
    run.final_message ?? "",
    run.completed_plan_text,
  );
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
      error: run.error,
      editedFiles: parseUnifiedDiffFiles(latestDiff),
      latestDiff,
      webPreview: parsePersistedRunWebPreview(run.web_preview_json),
      latestPlan: normalizedPlan.planText,
      nativePlan: {
        ...emptyRunView.nativePlan,
        intent: runIntent,
        mode: normalizedPlan.promoted ? "plan" : run.collaboration_mode ?? null,
        phase:
          hasReviewablePlan
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
  };
}

function normalizeHistoricalProposedPlan(
  finalMessage: string,
  completedPlanText: string | null = null,
) {
  const envelope = parseProposedPlanEnvelope(finalMessage);
  const planText = completedPlanText ?? envelope?.markdown ?? "";
  const envelopeRepresentsPlan = Boolean(
    envelope && (!completedPlanText || completedPlanText === envelope.markdown),
  );

  return {
    finalMessage: envelopeRepresentsPlan ? "" : finalMessage,
    planText,
    promoted: Boolean(envelope && !completedPlanText),
  };
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

  if (run.status === "cancelled" || run.status === "canceled" || run.status === "stopped") {
    return "interrupted";
  }

  if (run.error) {
    return "failed";
  }

  if (run.completed_at || run.final_message) {
    return "completed";
  }

  return "interrupted";
}

function parseSavedDefaultCollaborationMode(value: string | null | undefined) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<CollaborationMode>;
    const settings = readObject(parsed.settings);
    if (
      parsed.mode === "default" &&
      typeof settings.model === "string" &&
      (typeof settings.reasoning_effort === "string" ||
        settings.reasoning_effort === null) &&
      settings.developer_instructions === null
    ) {
      return parsed as CollaborationMode;
    }
  } catch {
    // Ignore corrupt persisted settings and rebuild the Default preset.
  }
  return null;
}

function buildSlashCommandResults(
  query: string,
  skills: CodexSkillSummary[],
): SlashCommandItem[] {
  const skillItems = skills.map((skill): SlashCommandItem => ({
    kind: "skill",
    skill,
    title: skill.name,
    description: skill.description ?? "Use this Codex skill for the next run",
  }));

  return [...BUILTIN_SLASH_COMMANDS, ...skillItems]
    .filter((item) => slashCommandMatches(item, query))
    .slice(0, 24);
}

function slashCommandMatches(item: SlashCommandItem, query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return true;
  }

  const haystack = `${item.title} ${item.description}`.toLowerCase();
  return haystack.includes(normalizedQuery);
}

function applyPromptDraft(current: string, draft: string) {
  const trimmed = current.trim();
  return trimmed ? `${trimmed}\n\n${draft}` : draft;
}

function buildCodeReviewDraft(
  workspace: Workspace | null,
  branch: string | null,
  gitSummary: WorkspaceGitSummary,
) {
  const target = workspace?.label ?? "the selected repository";
  const branchLine = branch ? `Current branch: ${branch}.` : "Current branch: unknown.";
  const changeLine =
    gitSummary.total > 0
      ? `Review the ${gitSummary.total} current git change${
          gitSummary.total === 1 ? "" : "s"
        }.`
      : "Review the current working tree and confirm whether it is clean.";

  return [
    `Review ${target}.`,
    branchLine,
    changeLine,
    "",
    "Focus on bugs, behavioral regressions, security issues, and missing tests.",
    "Return prioritized findings first, with file and line references when available.",
    "Do not edit files unless I explicitly ask for fixes.",
  ].join("\n");
}

function buildInitInstructionsDraft(workspace: Workspace | null) {
  const target = workspace?.label ?? "the selected repository";
  return [
    `Create or update AGENTS.md for ${target}.`,
    "",
    "Inspect the repository structure, scripts, tests, conventions, and existing documentation first.",
    "Write concise instructions that future Codex runs can follow for building, testing, linting, and reviewing this repo.",
    "Keep the file specific to this codebase and avoid generic filler.",
  ].join("\n");
}

function buildComposerStatusMessage({
  workspace,
  branch,
  account,
  model,
  reasoningEffort,
  tokenEstimate,
  contextFiles,
  selectedSkills,
  gitSummary,
  runView,
}: {
  workspace: Workspace | null;
  branch: string | null;
  account: CodexAccountProfile | null;
  model: CodexModel | null;
  reasoningEffort: string | null;
  tokenEstimate: number;
  contextFiles: ComposerContextFile[];
  selectedSkills: SelectedComposerSkill[];
  gitSummary: WorkspaceGitSummary;
  runView: RunViewState;
}) {
  const parts = [
    workspace ? `Workspace ${workspace.label}` : "No workspace selected",
    branch ? `branch ${branch}` : "no branch",
    formatGitSummaryForStatus(gitSummary),
    account ? `account ${account.label}` : "no account",
    model ? `agent ${model.displayName || model.model}` : "no agent",
    reasoningEffort ? `reasoning ${formatReasoningEffort(reasoningEffort)}` : "default reasoning",
    `${tokenEstimate.toLocaleString()} tokens`,
    `${contextFiles.length} file${contextFiles.length === 1 ? "" : "s"}`,
    `${selectedSkills.length} skill${selectedSkills.length === 1 ? "" : "s"}`,
  ];

  if (runView.threadId) {
    parts.push(`thread ${runView.threadId}`);
  }

  if (runView.turnId) {
    parts.push(`turn ${runView.turnId}`);
  }

  return parts.join(" | ");
}

function formatGitSummaryForStatus(summary: WorkspaceGitSummary) {
  if (summary.total === 0) {
    return "git clean";
  }

  const details = [
    summary.modified > 0 ? `${summary.modified} modified` : null,
    summary.added > 0 ? `${summary.added} added` : null,
    summary.deleted > 0 ? `${summary.deleted} deleted` : null,
    summary.untracked > 0 ? `${summary.untracked} untracked` : null,
    summary.conflicted > 0 ? `${summary.conflicted} conflicted` : null,
  ].filter(Boolean);

  return `${summary.total} changed${details.length > 0 ? ` (${details.join(", ")})` : ""}`;
}

function addPlanImplementationProgressInstructions(prompt: string) {
  return [
    prompt.trimEnd(),
    "",
    "Track this implementation with Codex's structured plan tool:",
    "- Before changing files, call `update_plan` with a concise checklist derived from the approved plan.",
    "- Keep exactly one step in progress while work is underway and update the checklist whenever execution advances.",
    "- Mark every completed step before sending the final response.",
    "- If the implementation genuinely has only one step, keep a single step rather than inventing extra work.",
  ].join("\n");
}

function applySelectedSkillsToPrompt(
  prompt: string,
  selectedSkills: SelectedComposerSkill[],
) {
  if (selectedSkills.length === 0) {
    return prompt;
  }

  return [
    "Use these Codex skills if they are relevant to the task:",
    ...selectedSkills.map((skill) =>
      skill.description ? `- ${skill.name}: ${skill.description}` : `- ${skill.name}`,
    ),
    "",
    prompt,
  ].join("\n");
}

function formatMcpStatus(payload: unknown) {
  const root = readObject(payload);
  const servers =
    readArray(payload).length > 0
      ? readArray(payload)
      : readArray(root.servers).length > 0
        ? readArray(root.servers)
        : readArray(root.data).length > 0
          ? readArray(root.data)
          : readArray(root.items);

  if (servers.length === 0) {
    return "MCP: no servers reported by Codex.";
  }

  const names = servers
    .map((server) => {
      const object = readObject(server);
      return readString(object.name) ?? readString(object.id) ?? readString(object.label);
    })
    .filter((name): name is string => Boolean(name))
    .slice(0, 4);

  const suffix =
    names.length > 0
      ? ` (${names.join(", ")}${servers.length > names.length ? ", ..." : ""})`
      : "";
  return `MCP: ${servers.length} server${servers.length === 1 ? "" : "s"} available${suffix}.`;
}

function formatReasoningEffort(effort: string) {
  return effort
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function interactionModeForSnapshot(snapshot: RunSetupSnapshot): RunInteractionMode {
  if (snapshot.goalMode && snapshot.mode === "plan") return "goal-plan";
  if (snapshot.goalMode) return "goal";
  return snapshot.mode === "plan" ? "plan" : "chat";
}

function assertRuntimeAccessMatches(
  runtime: {
    approvalPolicy?: string;
    activePermissionProfile?: { id?: string | null } | null;
  },
  expected: RunAccessSettings,
) {
  if (
    runtime.approvalPolicy &&
    runtime.approvalPolicy !== expected.approvalPolicy
  ) {
    throw new Error(
      `Codex activated approval policy ${runtime.approvalPolicy}, but the application requested ${expected.approvalPolicy}. The run was stopped to avoid a permission mismatch.`,
    );
  }
  const activeProfile = runtime.activePermissionProfile?.id;
  if (activeProfile && activeProfile !== expected.permissionProfile) {
    const compatibilityHint =
      expected.permissionProfile === ASK_FOR_APPROVAL_PERMISSION_PROFILE
        ? " Ask for approval requires a Codex version with custom permission-profile support. Update Codex and retry."
        : "";
    throw new Error(
      `Codex activated permission profile ${activeProfile}, but the application requested ${expected.permissionProfile}. The run was stopped to avoid a sandbox mismatch.${compatibilityHint}`,
    );
  }
}

function normalizeDialogSelection(selection: unknown) {
  if (Array.isArray(selection)) {
    return selection.filter((item): item is string => typeof item === "string");
  }

  return typeof selection === "string" ? [selection] : [];
}

function contextFileFromPath(path: string): ComposerContextFile {
  return normalizeContextFileMedia({
    path,
    name: basename(path),
    source: "picker",
    status: "ready",
  });
}

function cleanGeneratedCommitSubject(subject: string) {
  return subject
    .replace(
      /\s+\((?:\d+\s+(?:modified|added|deleted|untracked|renamed|copied|changed)(?:,\s*)?)+\)$/i,
      "",
    )
    .trim();
}

function generatedCommitSubjectRejectionReason(
  subject: string,
  files: WorkspaceGitFileStatus[],
) {
  const raw = subject.trim();
  if (!raw) {
    return "Codex returned an empty subject.";
  }
  if (raw.includes("\n") || /[`*#]/.test(raw)) {
    return "Codex returned a malformed or Markdown-formatted subject.";
  }
  if (
    /\s+\((?:\d+\s+(?:modified|added|deleted|untracked|renamed|copied|changed)(?:,\s*)?)+\)$/i.test(
      raw,
    )
  ) {
    return "Codex returned a subject containing change counts.";
  }

  const cleaned = cleanGeneratedCommitSubject(raw);
  if (cleaned.length > 72) {
    return "Codex returned a subject longer than 72 characters.";
  }
  const normalized = cleaned
    .toLowerCase()
    .replace(/[._/-]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[.!?]+$/g, "")
    .trim();
  const proceduralSubjects = new Set([
    "implement plan",
    "implement the plan",
    "apply plan",
    "apply the plan",
    "execute plan",
    "execute the plan",
    "follow plan",
    "follow the plan",
    "complete plan",
    "complete the plan",
    "continue plan",
    "continue the plan",
    "apply requested changes",
    "apply requested workspace changes",
    "implement requested changes",
    "make requested changes",
    "address requested changes",
    "complete task",
    "finish task",
  ]);
  if (proceduralSubjects.has(normalized)) {
    return "Codex returned an orchestration instruction instead of the change intent.";
  }
  if (isDiffDrivenCommitSubject(cleaned, files)) {
    return "Codex returned a file-focused or generic subject.";
  }
  return null;
}

function isDiffDrivenCommitSubject(
  subject: string,
  files: WorkspaceGitFileStatus[],
) {
  const normalized = cleanGeneratedCommitSubject(subject)
    .toLowerCase()
    .replace(/[._/-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) {
    return true;
  }

  const normalizeSubjectPart = (value: string) =>
    value
      .toLowerCase()
      .replace(/[._/-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  const fileStemSubjects = files.flatMap((file) => {
    const fileName = basename(file.relativePath);
    const stem = fileName.replace(/\.[^.]+$/, "").trim();
    return [normalizeSubjectPart(fileName), normalizeSubjectPart(stem)].filter(Boolean);
  });
  const fileOnlyVerbs = ["update", "refine", "improve", "change", "modify"];
  if (
    fileStemSubjects.some((fileName) =>
      fileOnlyVerbs.some((verb) => normalized === `${verb} ${fileName}`),
    )
  ) {
    return true;
  }

  if (
    [
      "update app css",
      "refine app css",
      "improve app css",
      "update app tsx",
      "refine app tsx",
      "improve app tsx",
      "update lib rs",
      "refine lib rs",
      "improve lib rs",
    ].includes(normalized)
  ) {
    return true;
  }

  if (
    [
      "update app styling",
      "refine app styling",
      "improve app styling",
      "update app shell",
      "refine app shell",
      "improve app shell",
      "update tauri bridge",
      "refine tauri bridge",
      "improve tauri bridge",
      "update tauri backend",
      "refine tauri backend",
      "improve tauri backend",
      "update app styling and app shell",
      "refine app styling and app shell",
      "improve app styling and app shell",
      "update app shell and app styling",
      "refine app shell and app styling",
      "improve app shell and app styling",
      "update tauri bridge and app styling",
      "refine tauri bridge and app styling",
      "improve tauri bridge and app styling",
      "update app styling and tauri bridge",
      "refine app styling and tauri bridge",
      "improve app styling and tauri bridge",
      "update react app",
      "refine react app",
      "improve react app",
      "update files",
      "refine files",
      "improve files",
      "update code",
      "refine code",
      "improve code",
    ].includes(normalized)
  ) {
    return true;
  }

  const words = normalized.split(" ").filter((word) => word !== "and");
  const [verb, ...rest] = words;
  const broadWords = new Set([
    "app",
    "application",
    "backend",
    "bridge",
    "code",
    "desktop",
    "files",
    "frontend",
    "integration",
    "react",
    "shell",
    "styling",
    "tauri",
    "ui",
    "workflow",
    "workspace",
  ]);
  return (
    ["update", "refine", "improve"].includes(verb ?? "") &&
    rest.length > 0 &&
    rest.length <= 5 &&
    rest.every((word) => broadWords.has(word))
  );
}

function getCodexModelContextWindow(model: CodexModel | null) {
  const candidates = [
    model?.modelContextWindow,
    model?.contextWindow,
    model?.contextWindowTokens,
  ];

  return (
    candidates.find(
      (value): value is number =>
        typeof value === "number" && Number.isFinite(value) && value > 0,
    ) ?? null
  );
}

function formatHistoryChatMeta(chat: ChatListItem) {
  return [
    formatChatSourceLabel(chat),
    formatHistoryTimestamp(chat.latest_activity_at),
    chat.status,
    `${chat.turn_count} turn${chat.turn_count === 1 ? "" : "s"}`,
    formatHistoryDuration(chat.duration_ms),
    formatHistoryTokens(chat.total_tokens),
  ].join(" · ");
}

function formatChatSourceLabel(chat: ChatListItem) {
  if (chat.origin !== "codex_external") {
    return "Orchestrator";
  }

  const suffix = isAdoptedExternalChat(chat)
    ? " · Continued in Orchestrator"
    : "";
  if (chat.source_kind === "vscode") {
    return `VS Code${suffix}`;
  }
  if (chat.source_kind === "cli") {
    return `CLI${suffix}`;
  }
  if (chat.source_kind === "appServer") {
    return `Codex App${suffix}`;
  }
  return `Codex${suffix}`;
}

function isAdoptedExternalChat(
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

function accountIdFromProfileKey(
  profileKey: CodexProfileKey | null | undefined,
) {
  if (!profileKey?.startsWith("account:")) return null;
  const accountId = Number(profileKey.slice("account:".length));
  return Number.isFinite(accountId) && accountId > 0 ? accountId : null;
}

function formatHistoryTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatHistoryDuration(milliseconds: number | null) {
  if (!milliseconds || milliseconds <= 0) {
    return "No duration";
  }
  const seconds = Math.round(milliseconds / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return remainder ? `${minutes}m ${remainder}s` : `${minutes}m`;
}

function formatHistoryTokens(tokens: number | null) {
  return tokens && tokens > 0 ? `${tokens.toLocaleString()} tokens` : "No tokens";
}

function contextMenuPosition(
  event: ReactMouseEvent<HTMLElement> | ReactKeyboardEvent<HTMLElement>,
) {
  if ("clientX" in event && event.clientX !== 0) {
    return clampContextMenuPosition(event.clientX, event.clientY);
  }

  const rect = event.currentTarget.getBoundingClientRect();
  return clampContextMenuPosition(rect.left + 28, rect.top + rect.height);
}

function clampContextMenuPosition(x: number, y: number) {
  const gutter = 8;
  const estimatedWidth = 220;
  const estimatedHeight = 52;
  return {
    x: Math.max(gutter, Math.min(x, window.innerWidth - estimatedWidth - gutter)),
    y: Math.max(gutter, Math.min(y, window.innerHeight - estimatedHeight - gutter)),
  };
}

async function collectWorkspaceFiles(
  workspace: Workspace,
  directoryPath: string,
): Promise<WorkspaceTreeEntry[]> {
  const entries = await listWorkspaceDirectory(workspace.path, directoryPath);
  const files = entries.filter((entry) => entry.kind === "file");
  const childFiles = await Promise.all(
    entries
      .filter((entry) => entry.kind === "directory")
      .map((entry) => collectWorkspaceFiles(workspace, entry.path)),
  );

  return [...files, ...childFiles.flat()].sort((left, right) =>
    left.relativePath.localeCompare(right.relativePath),
  );
}

function searchWorkspaceFiles(
  files: WorkspaceTreeEntry[],
  query: string,
): ComposerContextFile[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return [];
  }

  return files
    .map((file) => ({
      file,
      score: workspaceFileSearchScore(file, normalizedQuery),
    }))
    .filter((entry) => entry.score !== null)
    .sort((left, right) => {
      const scoreDifference = (left.score ?? 0) - (right.score ?? 0);
      if (scoreDifference !== 0) {
        return scoreDifference;
      }

      const lengthDifference =
        left.file.relativePath.length - right.file.relativePath.length;
      if (lengthDifference !== 0) {
        return lengthDifference;
      }

      return left.file.relativePath.localeCompare(right.file.relativePath);
    })
    .slice(0, 8)
    .map(({ file }) => ({
      path: file.path,
      name: file.name,
      source: "search" as const,
      relativePath: file.relativePath,
      status: "ready" as const,
    }));
}

function workspaceFileSearchScore(
  file: WorkspaceTreeEntry,
  normalizedQuery: string,
) {
  const name = file.name.toLowerCase();
  const relativePath = file.relativePath.toLowerCase();

  if (name.startsWith(normalizedQuery)) {
    return 0;
  }

  if (relativePath.startsWith(normalizedQuery)) {
    return 1;
  }

  if (name.includes(normalizedQuery)) {
    return 2;
  }

  if (relativePath.includes(normalizedQuery)) {
    return 3;
  }

  return null;
}

function treeIndentStyle(depth: number) {
  return { "--depth": depth } as CSSProperties;
}

function relativeDirectoryPath(workspace: Workspace, directoryPath: string) {
  const workspacePath = normalizeWorkspacePath(workspace.path);
  const normalizedDirectory = normalizeWorkspacePath(directoryPath);
  if (normalizedDirectory === workspacePath) {
    return "";
  }

  const prefix = `${workspacePath}/`;
  return normalizedDirectory.startsWith(prefix)
    ? normalizedDirectory.slice(prefix.length)
    : "";
}

function gitStatusChildEntry(
  workspace: Workspace,
  directoryRelativePath: string,
  gitStatus: WorkspaceGitFileStatus,
): WorkspaceTreeEntry | null {
  const changedRelativePath = gitStatus.relativePath;
  const directoryPrefix = directoryRelativePath
    ? `${directoryRelativePath.replace(/\/+$/, "")}/`
    : "";
  if (!changedRelativePath.startsWith(directoryPrefix)) {
    return null;
  }

  const remainder = changedRelativePath.slice(directoryPrefix.length);
  const [name] = remainder.split("/");
  if (!name) {
    return null;
  }

  const relativePath = directoryPrefix ? `${directoryPrefix}${name}` : name;
  const finalPath = relativePath === changedRelativePath;
  const deleted = gitStatus.statusKind === "deleted";
  return {
    name,
    path: finalPath ? gitStatus.path : joinWorkspacePath(workspace.path, relativePath),
    relativePath,
    kind: finalPath ? "file" : "directory",
    gitGhost: deleted,
  };
}

function normalizeWorkspacePath(path: string) {
  return path.replace(/\\/g, "/").replace(/\/+$/, "");
}

function pathBelongsToWorkspace(path: string, workspacePath: string) {
  const normalizedPath = normalizeWorkspacePath(path);
  const normalizedWorkspacePath = normalizeWorkspacePath(workspacePath);
  return (
    normalizedPath === normalizedWorkspacePath ||
    normalizedPath.startsWith(`${normalizedWorkspacePath}/`)
  );
}

function joinWorkspacePath(workspacePath: string, relativePath: string) {
  return `${normalizeWorkspacePath(workspacePath)}/${relativePath.replace(/^\/+/, "")}`;
}

function workspaceFileEntryFromResponseLink(
  href: string,
  workspace: Workspace,
): WorkspaceTreeEntry | null {
  const path = resolveResponseLinkPath(href, workspace.path);
  if (!path || !pathBelongsToWorkspace(path, workspace.path)) {
    return null;
  }

  const normalizedPath = normalizeWorkspacePath(path);
  const workspaceRoot = normalizeWorkspacePath(workspace.path);
  const relativePath = normalizedPath.slice(workspaceRoot.length).replace(/^\/+/, "");
  if (!relativePath) {
    return null;
  }

  return {
    name: basename(relativePath),
    path: normalizedPath,
    relativePath,
    kind: "file",
  };
}

function resolveResponseLinkPath(href: string, workspacePath: string) {
  const cleanHref = href.trim();
  if (!cleanHref || cleanHref.startsWith("#")) {
    return null;
  }

  if (/^[a-z][a-z\d+.-]*:/i.test(cleanHref)) {
    try {
      const url = new URL(cleanHref);
      if (url.protocol === "file:") {
        return stripResponseLinkLineReference(
          safeDecodeURIComponent(url.pathname),
          workspacePath,
        );
      }
      if (
        (url.protocol === "http:" || url.protocol === "https:") &&
        isLocalhost(url.hostname)
      ) {
        return stripResponseLinkLineReference(
          safeDecodeURIComponent(url.pathname),
          workspacePath,
        );
      }
    } catch {
      return null;
    }

    return null;
  }

  const pathOnly = stripLinkSearchAndHash(cleanHref);
  if (!pathOnly) {
    return null;
  }

  const decodedPath = safeDecodeURIComponent(pathOnly);
  const resolvedPath = decodedPath.startsWith("/")
    ? decodedPath
    : joinWorkspacePath(workspacePath, decodedPath);
  return stripResponseLinkLineReference(resolvedPath, workspacePath);
}

function stripResponseLinkLineReference(path: string, workspacePath: string) {
  const normalizedPath = normalizeWorkspacePath(path);
  if (!pathBelongsToWorkspace(normalizedPath, workspacePath)) {
    return normalizedPath;
  }

  const match = normalizedPath.match(/^(.*):\d+(?::\d+)?$/);
  if (!match?.[1] || match[1].endsWith("/")) {
    return normalizedPath;
  }

  return match[1];
}

function stripLinkSearchAndHash(href: string) {
  const [withoutHash] = href.split("#", 1);
  const [withoutSearch] = withoutHash.split("?", 1);
  return withoutSearch;
}

function safeDecodeURIComponent(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function isLocalhost(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function getMaxPreviewDrawerWidth() {
  if (typeof window === "undefined") {
    return PREVIEW_DRAWER_DEFAULT_WIDTH;
  }

  return Math.max(
    PREVIEW_DRAWER_MIN_WIDTH,
    window.innerWidth - PREVIEW_DRAWER_VIEWPORT_GUTTER,
  );
}

function clampPreviewDrawerWidth(width: number) {
  return Math.min(
    Math.max(width, PREVIEW_DRAWER_MIN_WIDTH),
    getMaxPreviewDrawerWidth(),
  );
}

function mergeContextFiles(
  current: ComposerContextFile[],
  additions: ComposerContextFile[],
) {
  const existing = new Set(
    current.flatMap((file) =>
      file.canonicalPath ? [file.path, file.canonicalPath] : [file.path],
    ),
  );
  const merged = [...current];

  for (const file of additions) {
    if (
      !existing.has(file.path) &&
      (!file.canonicalPath || !existing.has(file.canonicalPath))
    ) {
      existing.add(file.path);
      if (file.canonicalPath) {
        existing.add(file.canonicalPath);
      }
      merged.push(
        normalizeContextFileMedia({
          ...file,
          status: file.status ?? "ready",
        }),
      );
    }
  }

  return merged;
}

function pruneMissingInlineContextFiles(
  files: ComposerContextFile[],
  prompt: string,
) {
  return files.filter((file) => {
    if (file.source !== "search") {
      return true;
    }

    return prompt.includes(file.name);
  });
}

function readAccountLoginCompleted(
  params: Record<string, unknown>,
): AccountLoginCompletedNotification {
  return {
    success: params.success === true,
    error: readString(params.error),
    loginId: readString(params.loginId),
  };
}

function readAccountUpdated(
  params: Record<string, unknown>,
): AccountUpdatedNotification {
  return {
    authMode: readString(params.authMode) as AccountUpdatedNotification["authMode"],
    planType: readString(params.planType) as AccountUpdatedNotification["planType"],
  };
}

function basename(path: string) {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

function readTokenUsage(params: Record<string, unknown>) {
  return parseThreadTokenUsage(params.tokenUsage);
}

function readObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function readString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function readTimestamp(value: unknown) {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  const milliseconds = value > 10_000_000_000 ? value : value * 1000;
  return new Date(milliseconds).toISOString();
}

function readNumber(value: unknown) {
  return typeof value === "number" ? value : null;
}

function isCodexThreadNotFoundError(error: unknown) {
  const root = readObject(error);
  const directMessage = readString(root.message);
  const directCode = readNumber(root.code);
  if (directCode === -32600 && directMessage?.toLowerCase().includes("thread not found")) {
    return true;
  }

  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : directMessage;
  if (!message) {
    return false;
  }

  try {
    const parsed = JSON.parse(message);
    const parsedObject = readObject(parsed);
    const parsedMessage = readString(parsedObject.message);
    const parsedCode = readNumber(parsedObject.code);
    return (
      parsedCode === -32600 &&
      Boolean(parsedMessage?.toLowerCase().includes("thread not found"))
    );
  } catch {
    return message.toLowerCase().includes("thread not found");
  }
}

function readExpectedActiveTurnId(error: unknown) {
  const message = readCodexRpcErrorMessage(error);
  return (
    message.match(
      /expected active turn id\s+([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i,
    )?.[1] ?? null
  );
}

function isCodexTurnAlreadyTerminalError(error: unknown) {
  const message = readCodexRpcErrorMessage(error).toLowerCase();
  return (
    message.includes("no active turn") ||
    message.includes("turn is not active") ||
    message.includes("turn not active") ||
    message.includes("turn already completed") ||
    message.includes("turn already interrupted")
  );
}

function readCodexRpcErrorMessage(error: unknown) {
  const root = readObject(error);
  const directMessage = readString(root.message);
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : directMessage ?? "";

  try {
    const parsed = readObject(JSON.parse(message));
    return readString(parsed.message) ?? message;
  } catch {
    return message;
  }
}

export default App;
