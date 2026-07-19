import { open } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import { listen } from "@tauri-apps/api/event";
import {
  AlertCircle,
  BarChart3,
  Bell,
  BellOff,
  Check,
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
  FolderOpen,
  GitBranch,
  GitCommitHorizontal,
  Loader2,
  LogIn,
  LogOut,
  Monitor,
  Moon,
  PanelRight,
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
  DragEvent,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  TransitionEvent as ReactTransitionEvent,
} from "react";
import "./App.css";
import orchestratorMark from "./assets/brand/orchestrator-mark.png";
import {
  appendRunEvent,
  appendRunEvents,
  activateExternalTranscriptSnapshot,
  completeDuplicateProfileCleanup,
  createChat,
  createCodexAccount,
  createRun,
  createTask,
  getAnalyticsSummary,
  listLocalChatTranscript,
  listWorkspaceChats,
  listCodexAccounts,
  listDuplicateProfilesPendingCleanup,
  listWorkspaces,
  recordTokenUsage,
  readExternalTranscriptSnapshot,
  renameCodexAccount,
  savePreflightReport,
  softDeleteChat,
  softDeleteRun,
  softDeleteWorkspace,
  softDeleteCodexAccount,
  updateChat,
  updateCodexAccount,
  updateRun,
  updateTaskStatus,
  upsertExternalCodexChats,
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
  deleteCodexProfile,
  generateWorkspaceCommitMessage,
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
  readWorkspaceGitDiff,
  readWorkspaceFilePreview,
  resolveCodexServerRequest,
  resolveDefaultCodexServerRequest,
  removeAgentNotification,
  requestAgentNotificationPermission,
  runPreflight,
  setThreadGoal,
  startCodexLogin,
  stopDefaultCodexProfile,
  stopCodex,
  sendAgentNotification,
  syncDefaultProfileThreadTranscript,
  takePendingAgentNotificationActivation,
  openAgentNotificationSettings,
} from "./codexClient";
import { AnalyticsSummary } from "./components/AnalyticsSummary";
import { ComposerSelect } from "./components/ComposerSelect";
import { FilePreviewDrawer } from "./components/FilePreviewDrawer";
import type { TaskChatEntry } from "./components/TaskChatTranscript";
import {
  VirtuosoTaskChatTranscript,
  type TranscriptNotificationFocusRequest,
} from "./components/VirtuosoTaskChatTranscript";
import { TaskTranscriptErrorBoundary } from "./components/TaskTranscriptErrorBoundary";
import { TaskComposer } from "./components/TaskComposer";
import {
  addApprovalRequest,
  addServerRequest,
  applyCodexMessage,
  emptyRunView,
  markApprovalAwaitingResolution,
  markApprovalError,
  markApprovalSubmitting,
  resolveApprovalRequest,
  resolveServerRequest,
  setServerRequestSubmissionState,
  updateNativePlanReview,
  updateRunElapsed,
  type RunViewState,
} from "./lib/codexEventReducer";
import {
  parseApprovalRequest,
  type ApprovalChoice,
  type CodexApprovalRequest,
} from "./lib/codexApprovals";
import {
  accessModeWarning,
  accessSettings,
  persistCodexAccessPreference,
  readCodexAccessPreference,
  type CodexAccessSettings,
} from "./lib/codexAccess";
import {
  createStableClientMessageId,
  isCollaborationModeMask,
  isNativeUserInputRequest,
  messageMatchesRun,
  requestKey,
  selectNativePlanModes,
  type CollaborationMode,
  type CollaborationModeMask,
  type NativeUserInputRequest,
  type RunIntent,
  type UserInputResponse,
} from "./lib/nativePlanMode";
import { parseProposedPlanEnvelope } from "./lib/proposedPlan";
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
  applyResolvedTheme,
  applyThemePreference,
  persistThemePreference,
  readThemePreference,
  resolveTheme,
  watchSystemTheme,
} from "./lib/theme";
import {
  hasContextFilePayload,
  readDroppedContextFiles,
  restorePromptInlineFileReferencesForComposer,
  serializePromptInlineFileReferences,
} from "./lib/contextFiles";
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
const HISTORY_DRAWER_TRANSITION_FALLBACK_MS = 240;
const RUN_EVENT_BATCH_DELAY_MS = 100;
const RUN_EVENT_BATCH_MAX_SIZE = 50;
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

function replaceWorkspaceChatEntries(
  current: TaskChatEntry[],
  workspaceId: number,
  entries: TaskChatEntry[],
) {
  return [
    ...current.filter((entry) => entry.workspaceId !== workspaceId),
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

class RunStoppedError extends Error {
  constructor() {
    super("Run stopped by user.");
    this.name = "RunStoppedError";
  }
}

type ActiveRunControl = {
  accountId: number;
  profileKey: CodexProfileKey;
  clientId: string;
  promptFallback: string;
  chatId: number | null;
  stopped: boolean;
  taskId: number | null;
  runId: number | null;
  setupStarted: boolean;
  cancelScheduledSetup: (() => void) | null;
  interactionMode: RunInteractionMode;
  threadId: string | null;
  turnId: string | null;
  intent: RunIntent;
  clientUserMessageId: string;
};

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
  forceFreshThread?: boolean;
  previousChatContext?: string | null;
  supersededRunIds?: number[];
  updateChatTitle?: boolean;
  replacementClientId?: string | null;
  restoreEntryOnSetupFailure?: TaskChatEntry | null;
  restorePromptOnSetupFailure?: boolean;
  sourcePlanEntry?: TaskChatEntry;
  defaultCollaborationMode?: CollaborationMode | null;
};

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

type HistoryOpenPhase = "loading" | "hydrating" | "complete";

type HistoryOpenRequest = {
  requestId: number;
  workspaceId: number;
  chatId: number;
  phase: HistoryOpenPhase;
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
};

type OpenWorkspaceFilePreviewOptions = {
  forceRefresh?: boolean;
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
  const [transcriptNotificationFocusRequest, setTranscriptNotificationFocusRequest] =
    useState<TranscriptNotificationFocusRequest | null>(null);
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
  const [historyDrawerPhase, setHistoryDrawerPhase] =
    useState<HistoryDrawerPhase>("closed");
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
  const [commitDialogOpen, setCommitDialogOpen] = useState(false);
  const [commitIntent, setCommitIntent] = useState("");
  const [commitMessage, setCommitMessage] = useState("");
  const [commitDialogMessage, setCommitDialogMessage] = useState("");
  const [includeUnstagedChanges, setIncludeUnstagedChanges] = useState(true);
  const [gitActionStatus, setGitActionStatus] = useState<
    "idle" | "generating" | "committing" | "pushing"
  >("idle");
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
  const taskContextDropActiveRef = useRef(false);
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
  const handledNotificationActivationKeysRef = useRef(new Set<string>());
  const pendingNotificationDeliveryKeysRef = useRef(new Set<string>());
  const bootstrapCompleteRef = useRef(false);
  const pendingNotificationActivationRef =
    useRef<AgentNotificationTarget | null>(null);
  const notificationFocusSequenceRef = useRef(0);
  const [unroutedApprovals, setUnroutedApprovals] = useState<
    CodexApprovalRequest[]
  >([]);
  const unroutedApprovalsRef = useRef<CodexApprovalRequest[]>([]);
  const [approvalSafetyWarning, setApprovalSafetyWarning] = useState<
    string | null
  >(null);
  const collaborationModeMasksRef = useRef(
    new Map<CodexProfileKey, Promise<CollaborationModeMask[]>>(),
  );
  const userInputAutoResolutionTimersRef = useRef(new Map<string, number>());
  const requestActionLocksRef = useRef(new Set<string>());
  const planActionLocksRef = useRef(new Set<string>());
  const historyChatLoadIdRef = useRef(0);
  const taskChatEntriesRef = useRef<TaskChatEntry[]>([]);
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
    },
    [],
  );
  taskChatEntriesRef.current = taskChatEntries;
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
  const eventSequence = useRef(0);
  const pendingFrameCodexNotificationsRef = useRef<
    PendingFrameCodexNotification[]
  >([]);
  const pendingFrameCodexNotificationIdRef = useRef<number | null>(null);
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
  const lastCommitSubjectRef = useRef<{
    subject: string;
    changeKey: string;
  } | null>(null);
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

  const toggleHistoryDrawer = useCallback(() => {
    const phase = historyDrawerPhaseRef.current;
    if (phase === "open" || phase === "opening") {
      closeHistoryDrawer();
    } else {
      openHistoryDrawer();
    }
  }, [closeHistoryDrawer, openHistoryDrawer]);

  const waitForHistoryDrawerClosed = useCallback(() => {
    if (
      historyDrawerPhaseRef.current === "closed" &&
      !pendingHistoryDrawerOpenRef.current &&
      !pendingHistoryDrawerCloseRef.current
    ) {
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      historyDrawerClosedWaitersRef.current.add(resolve);
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
    setHistoricalTranscript((current) =>
      current?.openAtLatestRequest?.requestId === request.requestId &&
      current.openAtLatestRequest.chatId === request.chatId &&
      current.openAtLatestRequest.transcriptVersion === request.transcriptVersion
        ? {
            ...current,
            positionIntent: "preserve",
            openAtLatestRequest: null,
          }
        : current,
    );
  }, []);
  const resolveTranscriptRequest = useStableEvent(handleResolveRequest);
  const answerTranscriptUserInput = useStableEvent(handleAnswerUserInput);
  const implementTranscriptPlan = useStableEvent(handleImplementPlan);
  const reviseTranscriptPlan = useStableEvent(handleRevisePlan);
  const cancelTranscriptPlan = useStableEvent(handleCancelPlan);
  const openTranscriptFileLink = useStableEvent(openTaskResponseFileLink);
  const editTranscriptPrompt = useStableEvent(handleEditLatestPrompt);
  const loadTranscriptHistoricalActivity = useStableEvent(loadHistoricalActivity);
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
      if (!found) {
        setStatusMessage(
          "That notification target is no longer available in this chat.",
        );
      }
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
    if (contextFiles.some((file) => file.source === "search")) {
      setContextFiles((current) => {
        const nextFiles = pruneMissingInlineContextFiles(current, nextPrompt);
        return nextFiles.length === current.length ? current : nextFiles;
      });
    }
  });
  const selectComposerAccount = useStableEvent((accountId: number) => {
    void selectCodexAccount(accountId);
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
    void launchRun(nextPrompt);
  });
  const stopComposerRun = useStableEvent(() => {
    void stopActiveRun();
  });
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
  const runIsActive =
    runView.status === "connecting" || runView.status === "running";
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
  const selectedWorkspaceChatEntries = useMemo(
    () =>
      selectedWorkspace
        ? taskChatEntries.filter((entry) => entry.workspaceId === selectedWorkspace.id)
        : [],
    [selectedWorkspace, taskChatEntries],
  );
  const selectedWorkspaceChatSession = selectedWorkspace
    ? (workspaceChatSessions[selectedWorkspace.id] ?? null)
    : null;
  const visibleTaskChatEntries = selectedWorkspaceChatEntries;
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
  const suggestedCommitIntent = useMemo(
    () => buildCommitIntentFromChatEntry(selectedWorkspaceChatMeta.latestPromptEntry),
    [selectedWorkspaceChatMeta.latestPromptEntry],
  );
  const editablePromptEntryId = useMemo(() => {
    if (runIsActive || activeChatEntryId !== null) {
      return null;
    }
    if (selectedWorkspaceChatSession?.origin === "codex_external") {
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

    const dispatchActivation = (target: AgentNotificationTarget | null) => {
      if (!target || disposed) return;
      if (!bootstrapCompleteRef.current) {
        pendingNotificationActivationRef.current = target;
        return;
      }
      if (handledNotificationActivationKeysRef.current.has(target.eventKey)) {
        return;
      }
      handledNotificationActivationKeysRef.current.add(target.eventKey);
      void activateAgentNotification(target);
    };

    void listen<AgentNotificationTarget>(
      "orchestrator:agent-notification-activated",
      (event) => dispatchActivation(event.payload),
    ).then((dispose) => {
      if (disposed) dispose();
      else unlisten = dispose;
    });
    void takePendingAgentNotificationActivation()
      .then(dispatchActivation)
      .catch(() => undefined);

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [activateAgentNotification]);

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
    previewStateRef.current = previewState;
  }, [previewState]);

  useEffect(() => {
    if (
      activeChatEntryId === null ||
      (runView.status !== "connecting" && runView.status !== "running")
    ) {
      return;
    }

    const tick = () => {
      updateActiveRunView((current) => updateRunElapsed(current));
    };

    tick();
    const intervalId = window.setInterval(tick, 1000);
    return () => window.clearInterval(intervalId);
  }, [activeChatEntryId, runView.status]);

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
    let disposed = false;

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
      if (
        selectedAccountIdRef.current === event.payload.accountId ||
        currentRunProfileKey.current === profileKey
      ) {
        setStatusMessage(event.payload.message);
      }
      if (
        event.payload.status === "exited" ||
        event.payload.status === "stopped"
      ) {
        [
          ...runViewRef.current.approvalRequests,
          ...unroutedApprovalsRef.current,
        ]
          .filter((request) => request.profileKey === profileKey)
          .forEach((request) => {
            void removeAgentNotification(
              approvalNotificationEventKey(request),
            ).catch(() => undefined);
          });
        setApprovalSafetyWarning(null);
        setUnroutedApprovals((current) =>
          current.filter((request) => request.profileKey !== profileKey),
        );
      }
      if (currentRunProfileKey.current === profileKey) {
        flushFrameBatchedCodexNotifications();
        void persistRunEvent("process", event.payload.status, event.payload);
        if (
          event.payload.status === "exited" ||
          event.payload.status === "stopped"
        ) {
          updateActiveRunView((current) => ({
            ...current,
            approvalRequests: [],
            approvalResourcesByItemId: {},
          }));
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
    if (
      pendingActivation &&
      !handledNotificationActivationKeysRef.current.has(
        pendingActivation.eventKey,
      )
    ) {
      handledNotificationActivationKeysRef.current.add(
        pendingActivation.eventKey,
      );
      void activateAgentNotification(pendingActivation);
    }
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
      setHistoryState({ status: "loaded", chats, error: null });
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
      return existingRefresh;
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
      setBranches(result.branches);
      setSelectedBranch(result.currentBranch ?? result.branches[0] ?? null);
    } catch (error) {
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
        setCodexAccount(null);
        setRequiresOpenaiAuth(true);
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

  async function chooseWorkspace() {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "Choose a repository workspace",
    });

    if (typeof selected !== "string") {
      return;
    }

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

  function selectWorkspace(workspaceId: number) {
    const workspace = workspaces.find((candidate) => candidate.id === workspaceId);
    if (!workspace) {
      return;
    }

    if (selectedWorkspaceRef.current?.id !== workspace.id) {
      historyChatLoadIdRef.current += 1;
      cancelActiveExternalTranscriptSync();
      cancelActiveHistoricalTranscriptPreparation();
      pendingTranscriptCommitRef.current = null;
      transcriptScrollActiveRef.current = false;
      setHistoryChatLoadState(null);
      setHistoryOpenRequest(null);
      setHistoricalTranscript(null);
    }
    setWorkspaceContextMenu(null);
    selectedWorkspaceRef.current = workspace;
    setSelectedWorkspace(workspace);
    setSelectedHistoryChatId(workspaceChatSessionsRef.current[workspace.id]?.chatId ?? null);
    setActiveView("task");
    preflightRef.current = null;
    setStatusMessage(`Selected ${workspace.label}`);
    if (
      workspace.default_account_id &&
      workspace.default_account_id !== selectedAccountIdRef.current
    ) {
      void selectCodexAccount(workspace.default_account_id);
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

  function startTaskChatEntry(entry: TaskChatEntry) {
    setSelectedHistoryChatId(entry.chatId ?? null);
    activeChatEntryIdRef.current = entry.clientId;
    runViewRef.current = entry.runView;
    setActiveChatEntryId(entry.clientId);
    setRunView(entry.runView);
    setTaskChatEntries((current) => [...current, entry]);
  }

  function replaceTaskChatEntry(targetClientId: string, entry: TaskChatEntry) {
    setSelectedHistoryChatId(entry.chatId ?? null);
    activeChatEntryIdRef.current = entry.clientId;
    runViewRef.current = entry.runView;
    setActiveChatEntryId(entry.clientId);
    setRunView(entry.runView);
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
    setTaskChatEntries((current) =>
      current.map((entry) =>
        entry.clientId === clientId ? { ...entry, ...ids } : entry,
      ),
    );
  }

  function updateTaskChatEntryRunView(
    clientId: string,
    updater: (runView: RunViewState) => RunViewState,
  ) {
    setTaskChatEntries((current) =>
      current.map((entry) => {
        if (entry.clientId !== clientId) return entry;
        const nextRunView = updater(entry.runView);
        return { ...entry, status: nextRunView.status, runView: nextRunView };
      }),
    );
  }

  function updateActiveRunView(
    updater: (current: RunViewState) => RunViewState,
  ) {
    const nextRunView = updater(runViewRef.current);
    runViewRef.current = nextRunView;
    setRunView(nextRunView);

    const activeEntryId = activeChatEntryIdRef.current;
    if (activeEntryId !== null) {
      setTaskChatEntries((current) =>
        current.map((entry) =>
          entry.clientId === activeEntryId
            ? { ...entry, status: nextRunView.status, runView: nextRunView }
            : entry,
        ),
      );
    }

    return nextRunView;
  }

  function clearActiveChatRun() {
    activeChatEntryIdRef.current = null;
    setActiveChatEntryId(null);
  }

  function ensureRunControlActive(control: ActiveRunControl) {
    if (control.stopped || activeRunControlRef.current !== control) {
      throw new RunStoppedError();
    }
  }

  function markActiveRunInterrupted(message = "Stopped by user.") {
    const completedAt = new Date().toISOString();
    const stoppedRunView = updateActiveRunView((current) => {
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
    const runId = currentRunId.current ?? control?.runId ?? null;
    const taskId = currentTaskId.current ?? control?.taskId ?? null;

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

  async function stopActiveRun() {
    const control = activeRunControlRef.current;
    const accountId =
      control?.accountId ?? currentRunAccountId.current ?? selectedAccountIdRef.current;
    const profileKey =
      control?.profileKey ??
      currentRunProfileKey.current ??
      (accountId ? (`account:${accountId}` as CodexProfileKey) : null);
    const threadId = control?.threadId ?? runViewRef.current.threadId;
    const turnId = control?.turnId ?? runViewRef.current.turnId;

    if (!control && !runIsActive) {
      return;
    }

    flushFrameBatchedCodexNotifications();
    await flushBufferedRunEvents().catch(() => undefined);

    const setupStarted = control?.setupStarted ?? false;
    const persistedRunId = currentRunId.current ?? control?.runId ?? null;
    const planningThreadId = runViewRef.current.threadId;
    const planningTurnId = runViewRef.current.turnId;
    const interruptNativePlan =
      runViewRef.current.nativePlan.mode === "plan" &&
      planningThreadId !== null &&
      planningTurnId !== null &&
      profileKey !== null;
    const shouldStopCodex =
      !interruptNativePlan &&
      profileKey !== null &&
      (setupStarted ||
        persistedRunId !== null ||
        currentRunProfileKey.current !== null);

    if (control) {
      control.stopped = true;
      control.cancelScheduledSetup?.();
      control.cancelScheduledSetup = null;
    }

    const shouldRestorePrompt =
      persistedRunId === null && Boolean(control?.promptFallback);
    const { completedAt, stoppedRunView } = markActiveRunInterrupted();
    if (shouldRestorePrompt && control) {
      replaceComposerPrompt(control.promptFallback);
    }
    await persistInterruptedRun(control, completedAt, stoppedRunView);

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

    currentRunId.current = null;
    currentTaskId.current = null;
    currentRunAccountId.current = null;
    currentRunProfileKey.current = null;
    activeRunControlRef.current = null;
    clearActiveChatRun();
    setStatusMessage("Codex run stopped.");

    if (shouldStopCodex) {
      try {
        if (threadId && turnId && profileKey) {
          await codexRpcForProfile(profileKey, accountId ?? 0, "turn/interrupt", {
            threadId,
            turnId,
          });
        } else if (profileKey === DEFAULT_CODEX_PROFILE_KEY) {
          await stopDefaultCodexProfile();
        } else if (accountId !== null) {
          await stopCodex(accountId);
        }
      } catch (error) {
        try {
          if (profileKey === DEFAULT_CODEX_PROFILE_KEY) {
            await stopDefaultCodexProfile();
          } else if (accountId !== null) {
            await stopCodex(accountId);
          }
        } catch (stopError) {
          setStatusMessage(
            `Run stopped locally, but Codex could not be interrupted safely: ${
              stopError instanceof Error ? stopError.message : String(stopError)
            }`,
          );
        }
      }
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
    if (runIsActive && workspace.id === selectedWorkspaceRef.current?.id) {
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
    if (runIsActive && activeRunControlRef.current?.chatId === chat.id) {
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
    const allEntries = replaceWorkspaceChatEntries(
      taskChatEntriesRef.current,
      chat.workspace_id,
      entries,
    );
    taskChatEntriesRef.current = allEntries;
    startTransition(() => {
      setTaskChatEntries(allEntries);
      setHistoricalTranscript(publishedTranscript);
      setHistoryChatLoadState(null);
      setHistoryOpenRequest(null);
    });
    cacheStableHistoryChat(chat, entries, publishedTranscript);
    if (
      chat.origin === "orchestrator" &&
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
    const workspace = selectedWorkspaceRef.current;
    if (!Number.isFinite(accountId) || !workspace) return;

    try {
      await ensureCodexProfileConnected(profileKey, accountId);
      await codexRpcForProfile(profileKey, accountId, "thread/resume", {
        threadId,
        cwd: workspace.path,
      });
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
      transcriptViewportWaitersRef.current.add(resolve);
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
  ) {
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
        positionIntent: publication === "initial" ? "latest" : "preserve",
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
            publication === "initial" ? "latest" : "preserve",
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
  ) {
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
        positionIntent: "latest",
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
        positionIntent: "latest",
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
      );
      void synchronizeExternalTranscript(chat, loadId, "none");
      return;
    }

    await synchronizeExternalTranscript(chat, loadId, "initial");
  }

  async function selectHistoryChat(chat: ChatListItem) {
    if (runIsActive) {
      setStatusMessage("Finish or stop the active run before opening history.");
      return;
    }

    const loadId = historyChatLoadIdRef.current + 1;
    historyChatLoadIdRef.current = loadId;
    cancelActiveExternalTranscriptSync();
    cancelActiveHistoricalTranscriptPreparation();
    pendingTranscriptCommitRef.current = null;
    transcriptScrollActiveRef.current = false;
    const session: WorkspaceChatSession = {
      chatId: chat.id,
      threadId: chat.external_thread_id ?? chat.codex_thread_id,
      origin: chat.origin,
      profileKey: chat.profile_key,
      externalThreadId: chat.external_thread_id,
      nextTurnIndex: Math.max(1, (Number(chat.turn_count) || 0) + 1),
      savedDefaultCollaborationMode: parseSavedDefaultCollaborationMode(
        chat.saved_default_collaboration_mode_json,
      ),
    };

    flushSync(() => {
      setChatHistoryContextMenu(null);
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
      setHistoricalTranscript(null);
      setTaskChatEntries((current) =>
        replaceWorkspaceChatEntries(current, chat.workspace_id, []),
      );
      closeHistoryDrawer();
      setActiveView("task");
    });

    setStatusMessage(`Opening chat from ${formatHistoryTimestamp(chat.latest_activity_at)}.`);
    try {
      await waitForNextPaint();
      await waitForHistoryDrawerClosed();
      markTranscriptViewportUnstable();
      await waitForNextPaint();
      await waitForTranscriptViewportStable();
      if (historyChatLoadIdRef.current !== loadId) {
        return;
      }

      const cached = stableHistoryChatCacheRef.current.get(chat.id);
      if (
        cached?.version === historyChatVersion(chat) &&
        cached.renderVersion === HISTORICAL_RENDER_PIPELINE_VERSION
      ) {
        publishStableHistoryChat(chat, cached.entries, cached.transcript, loadId);
        setStatusMessage(
          `Opened chat from ${formatHistoryTimestamp(chat.latest_activity_at)}.`,
        );
        return;
      }

      if (chat.origin === "codex_external") {
        await loadExternalCodexChat(chat, loadId);
        return;
      }

      await loadLocalHistoryChatProgressively(chat, loadId);
    } catch (error) {
      if (historyChatLoadIdRef.current !== loadId) {
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      setHistoryChatLoadState((current) =>
        current?.chatId === chat.id ? { ...current, error: message } : current,
      );
      setHistoricalTranscript(null);
      setHistoryOpenRequest((current) =>
        current?.requestId === loadId ? null : current,
      );
      setStatusMessage(
        `Could not open chat: ${message}`,
      );
    }
  }

  async function loadLocalHistoryChatProgressively(
    chat: ChatListItem,
    loadId: number,
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
      positionIntent: "latest",
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
    publishStableHistoryChat(chat, preparedEntries, transcript, loadId);
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
    if (runIsActive || activeChatEntryIdRef.current !== null) {
      setStatusMessage("Finish or stop the active run before starting a new chat.");
      return;
    }

    historyChatLoadIdRef.current += 1;
    cancelActiveExternalTranscriptSync();
    cancelActiveHistoricalTranscriptPreparation();
    pendingTranscriptCommitRef.current = null;
    transcriptScrollActiveRef.current = false;
    setHistoryChatLoadState(null);
    setHistoryOpenRequest(null);
    setHistoricalTranscript(null);
    setTaskChatEntries((current) =>
      current.filter((entry) => entry.workspaceId !== selectedWorkspace.id),
    );
    setWorkspaceChatSession(selectedWorkspace.id, undefined);
    setSelectedHistoryChatId(null);
    preflightRef.current = null;
    setStatusMessage("Started a new chat.");
  }

  async function confirmChatHistoryDelete() {
    const chat = chatHistoryDeleteCandidate;
    if (!chat) {
      return;
    }

    await softDeleteChat(chat.id);
    stableHistoryChatCacheRef.current.delete(chat.id);
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
    if (selectedHistoryChatId === chat.id) {
      setSelectedHistoryChatId(null);
      setWorkspaceChatSession(chat.workspace_id, undefined);
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

    await softDeleteWorkspace(workspace.id);
    setWorkspaceDeleteCandidate(null);
    clearWorkspaceRuntimeState(workspace);

    setWorkspaces((current) => {
      const remaining = current.filter((candidate) => candidate.id !== workspace.id);
      if (selectedWorkspaceRef.current?.id === workspace.id) {
        const nextWorkspace = remaining[0] ?? null;
        setSelectedWorkspace(nextWorkspace);
        setStatusMessage(
          nextWorkspace
            ? `Removed ${workspace.label}. Selected ${nextWorkspace.label}.`
            : `Removed ${workspace.label}. Add or choose a workspace to continue.`,
        );
      } else {
        setStatusMessage(`Removed ${workspace.label} from Orchestrator.`);
      }

      return remaining;
    });
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
    setContextFiles((current) =>
      current.filter((file) => !belongsToWorkspace(file.path)),
    );
    setTaskChatEntries((current) =>
      current.filter((entry) => entry.workspaceId !== workspace.id),
    );
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
  ) {
    return profileKey === DEFAULT_CODEX_PROFILE_KEY
      ? codexDefaultProfileRpc("thread/goal/set", {
          threadId,
          objective,
          status: "active",
          tokenBudget: null,
        })
      : setThreadGoal(accountId, threadId, objective);
  }

  async function selectCodexAccount(accountId: number) {
    if (runIsActive || selectedAccountIdRef.current === accountId) {
      return;
    }

    const profile = codexAccountsRef.current.find(
      (account) => account.id === accountId,
    );
    if (!profile) {
      return;
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
    } catch (error) {
      setStatusMessage(
        `Could not select ${profile.label}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
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
    if (!selectedWorkspace) {
      return;
    }
    setCommitIntent(suggestedCommitIntent ?? "");
    setCommitMessage("");
    setCommitDialogMessage("");
    setIncludeUnstagedChanges(true);
    setCommitDialogOpen(true);
  }

  function handleHeaderGitAction() {
    if (!selectedWorkspace || gitActionStatus !== "idle") {
      return;
    }

    if (commitDialogOpen) {
      setCommitDialogOpen(false);
    } else {
      openCommitDialog();
    }
  }

  async function pushSelectedWorkspaceBranch() {
    if (!selectedWorkspace) {
      return false;
    }

    setGitActionStatus("pushing");
    setStatusMessage("Pushing current branch...");
    try {
      const result = await pushWorkspaceBranch(selectedWorkspace.path);
      setStatusMessage(result.message || "Branch pushed.");
      await refreshBranches(selectedWorkspace);
      await refreshWorkspaceGitStatus(selectedWorkspace);
      return true;
    } catch (error) {
      setStatusMessage(
        `Push failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    } finally {
      setGitActionStatus("idle");
    }
  }

  async function handlePushOnly() {
    if (!selectedWorkspace || !headerGitAction.canPush || gitActionStatus !== "idle") {
      return;
    }

    const pushed = await pushSelectedWorkspaceBranch();
    if (pushed) {
      setCommitDialogOpen(false);
    }
  }

  async function resolveCommitMessage() {
    if (!selectedWorkspace) {
      return "";
    }

    const intent = commitIntent.trim();
    const fallback = intent ? generateCommitMessageFromIntent(intent) : "";

    setGitActionStatus("generating");
    setCommitDialogMessage("Generating an intent-driven commit message...");
    setStatusMessage("Generating commit message...");
    try {
      const result = await generateWorkspaceCommitMessage({
        workspacePath: selectedWorkspace.path,
        accountId: selectedAccountId,
        includeUnstaged: includeUnstagedChanges,
        model: selectedModel?.model ?? selectedModel?.id ?? null,
        intent,
      });
      const generated = cleanGeneratedCommitSubject(result.message);
      if (generated) {
        if (isDiffDrivenCommitSubject(generated, commitMessageFiles)) {
          setStatusMessage(
            fallback
              ? "Codex returned a file-focused commit message, using the chat intent instead."
              : "Codex returned a file-focused commit message. Write a specific commit message or try again.",
          );
          setCommitDialogMessage(
            fallback
              ? "Codex returned a file-focused subject, so Orchestrator used the current chat intent."
              : "Codex returned a file-focused subject. Write a specific message or try again.",
          );
          setGitActionStatus("idle");
          return fallback;
        }
        const previous = lastCommitSubjectRef.current;
        if (
          previous &&
          previous.changeKey !== commitMessageChangeKey &&
          previous.subject.toLowerCase() === generated.toLowerCase()
        ) {
          setStatusMessage(
            fallback
              ? "Codex returned the same commit message for different changes, using the chat intent instead."
              : "Codex returned the same commit message for different changes. Write a specific commit message or try again.",
          );
          setCommitDialogMessage(
            fallback
              ? "Codex repeated an earlier subject, so Orchestrator used the current chat intent."
              : "Codex repeated an earlier subject. Write a specific message or try again.",
          );
          setGitActionStatus("idle");
          return fallback;
        }
        setCommitMessage(generated);
        setCommitDialogMessage(`Generated: ${generated}`);
        return generated;
      }
    } catch (error) {
      const localFallback = fallback || "Apply requested workspace changes";
      const message = `Using a local commit message because generation failed: ${
        error instanceof Error ? error.message : String(error)
      }`;
      setCommitDialogMessage(message);
      setStatusMessage(message);
      return localFallback;
    }

    return fallback || "Apply requested workspace changes";
  }

  async function handleCommitAll(options: { pushAfter?: boolean } = {}) {
    if (!selectedWorkspace || !canCommitFromDialog || gitActionStatus !== "idle") {
      return;
    }

    const message = commitMessage.trim() || (await resolveCommitMessage());
    if (!message.trim()) {
      setGitActionStatus("idle");
      return;
    }

    setGitActionStatus("committing");
    setStatusMessage("Committing workspace changes...");
    try {
      const result = await commitWorkspaceChanges(
        selectedWorkspace.path,
        message,
        includeUnstagedChanges,
      );
      lastCommitSubjectRef.current = {
        subject: cleanGeneratedCommitSubject(message),
        changeKey: commitMessageChangeKey,
      };
      setStatusMessage(result.message || "Workspace changes committed.");
      await refreshBranches(selectedWorkspace);
      await refreshWorkspaceGitStatus(selectedWorkspace);
      if (options.pushAfter) {
        const pushed = await pushSelectedWorkspaceBranch();
        if (!pushed) {
          return;
        }
      }
      setCommitDialogOpen(false);
      setCommitIntent("");
      setCommitMessage("");
      setCommitDialogMessage("");
    } catch (error) {
      setStatusMessage(
        `Commit failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      setGitActionStatus("idle");
    }
  }

  function beginOptimisticRun(snapshot: RunSetupSnapshot) {
    historyChatLoadIdRef.current += 1;
    cancelActiveExternalTranscriptSync();
    cancelActiveHistoricalTranscriptPreparation();
    pendingTranscriptCommitRef.current = null;
    setHistoryChatLoadState(null);
    setHistoryOpenRequest(null);
    setHistoricalTranscript(null);
    const clientId = createTaskChatClientId();
    const intent: RunIntent =
      snapshot.intent ?? (snapshot.mode === "plan" ? "plan" : "normal");
    const clientUserMessageId =
      snapshot.clientUserMessageId ?? createStableClientMessageId();
    snapshot.intent = intent;
    snapshot.clientUserMessageId = clientUserMessageId;
    const submittedAt = new Date().toISOString();
    const initialRunView = {
      ...emptyRunView,
      status: "connecting" as const,
      startedAt: submittedAt,
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
      clientId,
      promptFallback: snapshot.promptFallback,
      chatId: snapshot.chatId,
      stopped: false,
      taskId: null,
      runId: null,
      setupStarted: false,
      cancelScheduledSetup: null,
      interactionMode: interactionModeForSnapshot(snapshot),
      threadId: snapshot.threadId,
      turnId: null,
      intent,
      clientUserMessageId,
    };

    activeRunControlRef.current = runControl;
    const nextEntry: TaskChatEntry = {
      clientId,
      workspaceId: snapshot.workspace.id,
      chatId: snapshot.chatId,
      turnIndex: snapshot.turnIndex,
      runId: null,
      taskId: null,
      prompt: snapshot.promptText,
      contextFiles: snapshot.contextFiles,
      submittedAt,
      status: initialRunView.status,
      runView: initialRunView,
    };
    flushSync(() => {
      if (snapshot.replacementClientId) {
        replaceTaskChatEntry(snapshot.replacementClientId, nextEntry);
      } else {
        startTaskChatEntry(nextEntry);
      }
      if (snapshot.restorePromptOnSetupFailure !== false) {
        replaceComposerPrompt("");
      }
    });
    markPerformance("orchestrator:submit:optimistic-committed");

    return runControl;
  }

  async function continueRunSetup(
    runControl: ActiveRunControl,
    snapshot: RunSetupSnapshot,
  ) {
    let chatId = snapshot.chatId;
    let threadId = snapshot.forceFreshThread ? null : snapshot.threadId;
    let taskId: number | null = null;
    let runId: number | null = null;

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
      if (snapshot.chatOrigin === "orchestrator") {
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

      if (chatId === null) {
        if (snapshot.chatOrigin !== "orchestrator") {
          throw new Error("External Codex chats must be opened from history before continuing.");
        }
        const chat = await createChat({
          workspaceId: snapshot.workspace.id,
          accountId: snapshot.accountId,
          title: createChatTitle(
            restorePromptInlineFileReferencesForComposer(
              snapshot.promptText,
              snapshot.contextFiles.filter((file) => file.source === "search"),
            ),
          ),
          status: "starting",
        });
        chatId = chat.id;
        threadId = chat.codex_thread_id;
        runControl.chatId = chat.id;
        setWorkspaceChatSession(snapshot.workspace.id, {
          chatId: chat.id,
          threadId,
          origin: snapshot.chatOrigin,
          profileKey: snapshot.profileKey,
          externalThreadId: snapshot.externalThreadId,
          nextTurnIndex: snapshot.turnIndex + 1,
        });
        setSelectedHistoryChatId(chat.id);
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
      currentTaskId.current = task.id;
      ensureRunControlActive(runControl);

      await savePreflightReport(snapshot.workspace.id, task.id, report);
      ensureRunControlActive(runControl);

      const run = await createRun({
        taskId: task.id,
        workspaceId: snapshot.workspace.id,
        chatId,
        turnIndex: snapshot.turnIndex,
        accountId: snapshot.chatOrigin === "orchestrator" ? snapshot.accountId : null,
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
      });
      runId = run.id;
      runControl.runId = run.id;
      currentRunId.current = run.id;
      currentRunAccountId.current = snapshot.accountId;
      currentRunProfileKey.current = snapshot.profileKey;
      ensureRunControlActive(runControl);
      for (const supersededRunId of snapshot.supersededRunIds ?? []) {
        await softDeleteRun(supersededRunId);
        ensureRunControlActive(runControl);
      }
      flushFrameBatchedCodexNotifications();
      await flushBufferedRunEvents().catch(() => undefined);
      eventSequence.current = 0;
      updateTaskChatEntryIds(runControl.clientId, {
        taskId: task.id,
        runId: run.id,
        chatId,
        turnIndex: snapshot.turnIndex,
      });

      let threadModel: string | null | undefined = snapshot.model;
      let threadModelProvider: string | null | undefined = snapshot.useOss ? "oss" : null;
      const startThread = async () => {
        if (chatId === null) {
          throw new Error("Chat was not prepared before starting a Codex thread.");
        }
        if (snapshot.chatOrigin !== "orchestrator") {
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
          config: snapshot.useOss
            ? {
                model_provider: "oss",
                oss_provider: snapshot.ossProvider,
              }
            : null,
        });
        ensureRunControlActive(runControl);
        assertRuntimeAccessMatches(thread, snapshot.access);
        const nextThreadId = thread.thread.id;
        runControl.threadId = nextThreadId;
        const nextThreadModel = thread.model ?? snapshot.model;
        const nextThreadModelProvider =
          thread.modelProvider ?? (snapshot.useOss ? "oss" : null);
        await updateChat(activeChatId, {
          codexThreadId: nextThreadId,
          status: "running",
          ...(snapshot.updateChatTitle
            ? {
                title: createChatTitle(
                  restorePromptInlineFileReferencesForComposer(
                    snapshot.promptText,
                    snapshot.contextFiles.filter(
                      (file) => file.source === "search",
                    ),
                  ),
                ),
              }
            : {}),
        });
        setWorkspaceChatSession(snapshot.workspace.id, {
          chatId: activeChatId,
          threadId: nextThreadId,
          origin: snapshot.chatOrigin,
          profileKey: snapshot.profileKey,
          externalThreadId: snapshot.externalThreadId,
          nextTurnIndex: snapshot.turnIndex + 1,
        });
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
        if (snapshot.chatOrigin === "codex_external") {
          try {
            const resumed = await codexRpcForProfile<{
              approvalPolicy?: string;
              activePermissionProfile?: { id?: string | null } | null;
            }>(snapshot.profileKey, snapshot.accountId, "thread/resume", {
              threadId,
              cwd: snapshot.workspace.path,
              approvalPolicy: snapshot.access.approvalPolicy,
              approvalsReviewer: "user",
              permissions: snapshot.access.permissionProfile,
            });
            assertRuntimeAccessMatches(resumed, snapshot.access);
          } catch (error) {
            throw new Error(
              `Could not resume the external Codex thread: ${
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
      await updateChat(chatId, {
        collaborationMode: collaborationMode.mode,
        savedDefaultCollaborationModeJson:
          snapshot.mode === "plan"
            ? JSON.stringify(
                snapshot.defaultCollaborationMode ?? collaborationModes.default,
              )
            : null,
      });
      setWorkspaceChatSession(snapshot.workspace.id, {
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
      });
      ensureRunControlActive(runControl);

      await updateRun(run.id, {
        codexThreadId: threadId,
        model: threadModel ?? snapshot.model,
        modelProvider: threadModelProvider ?? (snapshot.useOss ? "oss" : null),
        status: "running",
        collaborationMode: collaborationMode.mode,
        runIntent: runControl.intent,
      });
      ensureRunControlActive(runControl);

      const warnings: string[] = [];
      if (snapshot.goalMode) {
        try {
          await setThreadGoalForProfile(
            snapshot.profileKey,
            snapshot.accountId,
            threadId,
            snapshot.promptText,
          );
          ensureRunControlActive(runControl);
        } catch (error) {
          if (error instanceof RunStoppedError) {
            throw error;
          }
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
      const text = applySelectedSkillsToPrompt(
        baseTurnText,
        snapshot.selectedSkills,
      );
      let { additionalContext, skippedFiles } = await buildAdditionalContext(
        snapshot.profileKey,
        snapshot.accountId,
        snapshot.contextFiles,
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
            input: [{ type: "text", text, text_elements: [] }],
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
        if (!isCodexThreadNotFoundError(error) || snapshot.chatOrigin !== "orchestrator") {
          throw error;
        }
        warnings.push(
          "Previous Codex thread was no longer available, so Orchestrator started a fresh thread for this chat.",
        );
        const thread = await startThread();
        threadId = thread.threadId;
        threadModel = thread.model;
        threadModelProvider = thread.modelProvider;
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
            await setThreadGoalForProfile(
              snapshot.profileKey,
              snapshot.accountId,
              threadId,
              snapshot.promptText,
            );
            ensureRunControlActive(runControl);
          } catch (goalError) {
            if (goalError instanceof RunStoppedError) {
              throw goalError;
            }
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

      updateActiveRunView((current) => ({
        ...current,
        status: "running",
        threadId,
        turnId: turn.turn.id,
      }));
      await updateRun(run.id, {
        codexTurnId: turn.turn.id,
        status: "running",
      });
      ensureRunControlActive(runControl);
      await updateTaskStatus(task.id, "running");
      ensureRunControlActive(runControl);
      await refreshWorkspaceData(snapshot.workspace.id);
      ensureRunControlActive(runControl);
      const runStartedMessage =
        snapshot.mode === "plan" ? "Plan mode turn started." : "Codex run started.";
      setStatusMessage(
        warnings.length > 0
          ? `${runStartedMessage} ${warnings.join(" ")}`
          : runStartedMessage,
      );
      preflightRef.current = null;
    } catch (error) {
      if (error instanceof RunStoppedError || runControl.stopped) {
        await persistInterruptedRun(
          runControl,
          new Date().toISOString(),
          runViewRef.current,
        );
        currentRunId.current = null;
        currentTaskId.current = null;
        currentRunAccountId.current = null;
        currentRunProfileKey.current = null;
        if (activeRunControlRef.current === runControl) {
          activeRunControlRef.current = null;
        }
        clearActiveChatRun();
        return;
      }

      const message = error instanceof Error ? error.message : String(error);
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
      const failedRunView = updateActiveRunView((current) => {
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
        if (snapshot.restorePromptOnSetupFailure !== false) {
          replaceComposerPrompt(snapshot.promptFallback);
        }
      } else {
        await updateRun(runId, {
          status: "failed",
          completedAt,
          durationMs: failedRunView.elapsedMs,
          error: message,
        }).catch(() => undefined);
      }
      if (taskId !== null) {
        await updateTaskStatus(taskId, "failed").catch(() => undefined);
      }
      if (chatId !== null) {
        await updateChat(chatId, { status: "failed" }).catch(() => undefined);
      }
      currentRunId.current = null;
      currentTaskId.current = null;
      currentRunAccountId.current = null;
      currentRunProfileKey.current = null;
      if (activeRunControlRef.current === runControl) {
        activeRunControlRef.current = null;
      }
      clearActiveChatRun();
      setStatusMessage(`Run setup failed: ${message}`);
    }
  }

  function scheduleRunSetup(runControl: ActiveRunControl, snapshot: RunSetupSnapshot) {
    runControl.cancelScheduledSetup = scheduleAfterNextPaint(() => {
      runControl.cancelScheduledSetup = null;
      if (runControl.stopped || activeRunControlRef.current !== runControl) {
        return;
      }
      runControl.setupStarted = true;
      markPerformance("orchestrator:submit:setup-start");
      void continueRunSetup(runControl, snapshot);
    });
  }

  async function launchRun(composerPrompt = promptRef.current) {
    markPerformance("orchestrator:submit:start");
    setApprovalSafetyWarning(null);

    const promptText = serializePromptInlineFileReferences(
      composerPrompt.trim(),
      contextFiles.filter((file) => file.source === "search"),
    );
    const workspace = selectedWorkspace;
    const chatSession = workspace
      ? (workspaceChatSessionsRef.current[workspace.id] ?? null)
      : null;
    const isExternalChat = chatSession?.origin === "codex_external";
    const accountId = isExternalChat ? 0 : selectedAccountId;
    const account = isExternalChat ? null : selectedAccount;
    const profileKey: CodexProfileKey = isExternalChat
      ? DEFAULT_CODEX_PROFILE_KEY
      : (`account:${accountId}` as CodexProfileKey);

    if (!workspace || !promptText) {
      setStatusMessage("Select a workspace and write a prompt first.");
      return;
    }
    if (!isExternalChat && (!accountId || !account)) {
      setStatusMessage("Sign in to a Codex account before starting a run.");
      return;
    }
    if (isExternalChat && !chatSession?.threadId) {
      setStatusMessage("This external Codex chat is missing its original thread id.");
      return;
    }
    if (runIsActive || activeChatEntryIdRef.current !== null) {
      setStatusMessage("Wait for the active run to finish before starting another.");
      return;
    }
    if (planReviewAwaiting) {
      setStatusMessage("Approve, revise, or cancel the current plan first.");
      return;
    }
    if (!isExternalChat && shouldBlockRunForAuth(requiresOpenaiAuth, codexAccount)) {
      setStatusMessage(
        loginState === "waiting"
          ? "Finish Codex sign-in before starting a run."
          : "Sign in to Codex before starting a run.",
      );
      return;
    }

    const selectedModel =
      models.find((model) => model.id === selectedModelId) ?? models[0] ?? null;
    const model = useOss || modelLoadError ? null : (selectedModel?.model ?? null);
    const turnIndex = chatSession?.nextTurnIndex ?? 1;
    const snapshot: RunSetupSnapshot = {
      promptText,
      promptFallback: composerPrompt,
      workspace: { ...workspace },
      accountId: accountId ?? 0,
      account: account ? { ...account } : null,
      profileKey,
      chatOrigin: chatSession?.origin ?? "orchestrator",
      externalThreadId: chatSession?.externalThreadId ?? null,
      selectedBranch,
      cachedPreflight: preflightRef.current,
      mode: planMode ? "plan" : "run",
      access: accessSettings({ accessMode }),
      model,
      effort: model ? selectedReasoningEffort : null,
      useOss,
      ossProvider,
      improvedPrompt: improvePrompt(promptText),
      contextFiles: [...contextFiles],
      selectedSkills: [...selectedSkills],
      goalMode,
      loginState,
      chatId: chatSession?.chatId ?? null,
      threadId: chatSession?.threadId ?? null,
      turnIndex,
    };

    const runControl = beginOptimisticRun(snapshot);
    scheduleRunSetup(runControl, snapshot);
  }

  function handleEditLatestPrompt(entry: TaskChatEntry, nextPrompt: string) {
    markPerformance("orchestrator:submit:start");

    const promptText = serializePromptInlineFileReferences(
      nextPrompt.trim(),
      (entry.contextFiles ?? []).filter((file) => file.source === "search"),
    );
    const workspace = selectedWorkspace;
    const accountId = selectedAccountId;
    const account = selectedAccount;

    if (!workspace || !promptText) {
      setStatusMessage("Select a workspace and provide a prompt before rerunning.");
      return;
    }
    if (!accountId || !account) {
      setStatusMessage("Sign in to a Codex account before rerunning a prompt.");
      return;
    }
    if (selectedWorkspaceChatSession?.origin === "codex_external") {
      setStatusMessage("External Codex chats can be continued, but edited prompts require an Orchestrator chat.");
      return;
    }
    if (entry.clientId !== editablePromptEntryId) {
      setStatusMessage("Only the latest prompt can be edited.");
      return;
    }
    if (runIsActive || activeChatEntryIdRef.current !== null) {
      setStatusMessage("Wait for the active run to finish before editing a prompt.");
      return;
    }
    if (shouldBlockRunForAuth(requiresOpenaiAuth, codexAccount)) {
      setStatusMessage(
        loginState === "waiting"
          ? "Finish Codex sign-in before rerunning a prompt."
          : "Sign in to Codex before rerunning a prompt.",
      );
      return;
    }

    const chatId = entry.chatId ?? selectedWorkspaceChatSession?.chatId ?? null;
    if (chatId === null) {
      setStatusMessage("This prompt is not attached to a chat yet.");
      return;
    }

    const selectedModel =
      models.find((modelOption) => modelOption.id === selectedModelId) ??
      models[0] ??
      null;
    const model = useOss || modelLoadError ? null : (selectedModel?.model ?? null);
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
      accountId,
      account: { ...account },
      profileKey: `account:${accountId}` as CodexProfileKey,
      chatOrigin: "orchestrator",
      externalThreadId: null,
      selectedBranch,
      cachedPreflight: null,
      mode: planMode ? "plan" : "run",
      access: accessSettings({ accessMode }),
      model,
      effort: model ? selectedReasoningEffort : null,
      useOss,
      ossProvider,
      improvedPrompt: improvePrompt(promptText),
      contextFiles: [...(entry.contextFiles ?? [])],
      selectedSkills: [...selectedSkills],
      goalMode,
      loginState,
      chatId,
      threadId: null,
      turnIndex: editedTurnIndex,
      forceFreshThread: true,
      previousChatContext: buildPreviousChatContext(previousEntries),
      supersededRunIds: entry.runId !== null ? [entry.runId] : [],
      updateChatTitle: editedTurnIndex === 1,
      replacementClientId: entry.clientId,
      restoreEntryOnSetupFailure: entry,
      restorePromptOnSetupFailure: false,
    };

    const runControl = beginOptimisticRun(snapshot);
    scheduleRunSetup(runControl, snapshot);
  }

  async function buildAdditionalContext(
    profileKey: CodexProfileKey,
    accountId: number,
    files: ComposerContextFile[],
  ) {
    const additionalContext: Record<string, AdditionalContextEntry> = {};
    const errors = new Map<string, string>();
    const skippedFiles: string[] = [];

    for (const file of files) {
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

    setContextFiles((current) =>
      current.map((file) =>
        errors.has(file.path)
          ? { ...file, status: "error", error: errors.get(file.path) }
          : { ...file, status: "ready", error: null },
      ),
    );

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
    const activeProfileKey = currentRunProfileKey.current;
    if (pending.length === 0 || activeProfileKey === null) {
      return runViewRef.current;
    }

    const messages = coalesceFrameBatchedCodexMessages(
      pending
        .filter(
          ({ message, profileKey }) =>
            profileKey === activeProfileKey &&
            messageMatchesRun(
              message,
              runViewRef.current.threadId,
              runViewRef.current.turnId,
            ),
        )
        .map(({ message }) => message),
    );
    if (messages.length === 0) {
      return runViewRef.current;
    }

    return updateActiveRunView((current) =>
      messages.reduce(applyCodexMessage, current),
    );
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
    eventType: RunEventInput["eventType"],
    method: string | null,
    payload: unknown,
  ) {
    const runId = currentRunId.current;
    if (!runId) return null;

    eventSequence.current += 1;
    return {
      runId,
      sequence: eventSequence.current,
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
    eventType: RunEventInput["eventType"],
    method: string | null,
    payload: unknown,
  ) {
    const input = createRunEventInput(eventType, method, payload);
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
    if (target.chatId !== null && target.chatId !== undefined) {
      return session?.chatId === target.chatId;
    }
    return taskChatEntriesRef.current.some(
      (entry) => entry.clientId === target.entryClientId,
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

  function focusAgentNotificationTarget(target: AgentNotificationTarget) {
    notificationFocusSequenceRef.current += 1;
    setTranscriptNotificationFocusRequest({
      requestId: notificationFocusSequenceRef.current,
      kind:
        target.kind === "approval-required"
          ? "approval"
          : target.kind === "plan-ready"
            ? "plan"
            : "response",
      entryClientId: target.entryClientId ?? null,
      runId: target.runId ?? null,
      turnId: target.turnId ?? null,
      targetId: target.requestId ?? target.planItemId ?? null,
    });
  }

  async function handleAgentNotificationActivation(
    target: AgentNotificationTarget,
  ) {
    if (!isAgentNotificationTargetNavigable(target)) {
      setStatusMessage("That notification target is no longer available.");
      return;
    }

    if (target.kind === "external-action") {
      const account = codexAccountsRef.current.find(
        (candidate) => candidate.id === target.accountId,
      );
      if (!account || account.status === "signed_in") {
        setStatusMessage("That sign-in action is no longer pending.");
        return;
      }
      setSelectedAccountId(account.id);
      selectedAccountIdRef.current = account.id;
      setActiveView("settings");
      window.requestAnimationFrame(() => {
        document
          .querySelector<HTMLElement>(`[data-managed-account-id="${account.id}"]`)
          ?.focus({ preventScroll: true });
      });
      return;
    }

    const workspace = workspacesRef.current.find(
      (candidate) => candidate.id === target.workspaceId,
    );
    if (!workspace) {
      setStatusMessage("The workspace for that notification is no longer available.");
      return;
    }
    if (
      activeRunControlRef.current &&
      activeRunControlRef.current.chatId !== target.chatId
    ) {
      setStatusMessage(
        "Finish or stop the active run before opening another notification.",
      );
      return;
    }

    if (selectedWorkspaceRef.current?.id !== workspace.id) {
      selectWorkspace(workspace.id);
    } else {
      setActiveView("task");
    }

    const visibleEntry = taskChatEntriesRef.current.find(
      (entry) =>
        entry.workspaceId === workspace.id &&
        ((target.entryClientId && entry.clientId === target.entryClientId) ||
          (target.runId !== null &&
            target.runId !== undefined &&
            entry.runId === target.runId) ||
          (target.turnId && entry.runView.turnId === target.turnId)),
    );
    const session = workspaceChatSessionsRef.current[workspace.id];
    if (visibleEntry && (!target.chatId || session?.chatId === target.chatId)) {
      focusAgentNotificationTarget(target);
      return;
    }

    let chats: ChatListItem[];
    try {
      chats = await listWorkspaceChats(workspace.id);
    } catch {
      setStatusMessage("Could not load the chat for that notification.");
      return;
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
      return;
    }

    focusAgentNotificationTarget(target);
    await selectHistoryChat(chat);
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
      const resolvedApprovals = [
        ...runViewRef.current.approvalRequests,
        ...unroutedApprovalsRef.current,
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
      setUnroutedApprovals((current) =>
        current.filter(
          (request) =>
            request.profileKey !== profileKey ||
            request.id !== requestId ||
            request.threadId !== threadId,
        ),
      );
    }

    if (currentRunProfileKey.current !== profileKey) {
      return;
    }
    if (
      !messageMatchesRun(
        message,
        runViewRef.current.threadId,
        runViewRef.current.turnId,
      )
    ) {
      return;
    }

    if (shouldFrameBatchCodexMessage(message)) {
      queueBufferedRunEvent("notification", method, message);
      queueFrameBatchedCodexNotification(profileKey, message);
      return;
    }

    flushFrameBatchedCodexNotifications();

    const nextRunView = updateActiveRunView((current) => {
      const next = applyCodexMessage(current, message);
      if (method !== "serverRequest/resolved") return next;
      const requestId = params.requestId;
      if (typeof requestId !== "string" && typeof requestId !== "number") {
        return next;
      }
      return resolveApprovalRequest(
        next,
        requestId,
        readString(params.threadId),
      );
    });
    await persistRunEvent("notification", method, message);

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
      const chatId = activeRunControlRef.current?.chatId ?? null;
      if (chatId !== null && (mode === "plan" || mode === "default")) {
        await updateChat(chatId, { collaborationMode: mode });
      }
    }

    const runId = currentRunId.current;
    if (!runId) {
      return;
    }

    if (method === "thread/tokenUsage/updated") {
      const tokenUsage = readTokenUsage(params);
      if (tokenUsage) {
        await recordTokenUsage({
          runId,
          threadId: readString(params.threadId),
          turnId: readString(params.turnId),
          ...tokenUsage,
        });
      }
    }

    if (method === "turn/completed") {
      const turn = readObject(params.turn);
      const status = readString(turn.status) === "failed" ? "failed" : "completed";
      const completedControl = activeRunControlRef.current;
      const completedEntry = completedControl
        ? taskChatEntriesRef.current.find(
            (entry) => entry.clientId === completedControl.clientId,
          ) ?? null
        : null;
      if (status === "completed" && completedControl) {
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
      if (currentTaskId.current) {
        await updateTaskStatus(currentTaskId.current, status);
      }
      const activeChatId = activeRunControlRef.current?.chatId ?? null;
      if (activeChatId !== null) {
        await updateChat(activeChatId, { status }).catch(() => undefined);
      }
      if (selectedWorkspaceRef.current) {
        invalidateWorkspacePreviewCaches(selectedWorkspaceRef.current, undefined, {
          reloadOpenPreview: true,
        });
        await refreshWorkspaceData(selectedWorkspaceRef.current.id);
        await refreshWorkspaceGitStatus(selectedWorkspaceRef.current);
      }
      await refreshSelectedWorkspaceHistory();
      currentRunId.current = null;
      currentTaskId.current = null;
      currentRunAccountId.current = null;
      currentRunProfileKey.current = null;
      activeRunControlRef.current = null;
      clearActiveChatRun();
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
    if (currentRunProfileKey.current === profileKey) {
      flushFrameBatchedCodexNotifications();
    }
    const control = activeRunControlRef.current;
    const parsed = parseApprovalRequest({
      message: request,
      profileKey,
      requestToken,
      interactionMode: control?.interactionMode ?? "chat",
    });
    if (parsed && !isNativeUserInputRequest(request)) {
      const activeThreadId = control?.threadId ?? runViewRef.current.threadId;
      const activeTurnId = control?.turnId ?? runViewRef.current.turnId;
      const belongsToActiveRun =
        currentRunProfileKey.current === profileKey &&
        (!parsed.threadId || parsed.threadId === activeThreadId) &&
        (!parsed.turnId || parsed.turnId === activeTurnId);
      const shouldNotify = [
        "command",
        "file-change",
        "legacy-command",
        "legacy-file-change",
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
      const notifyApproval = () => {
        if (!shouldNotify) return;
        void deliverAgentNotification({
          kind: "approval-required",
          target: {
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
          },
          chatTitle: activeEntry?.prompt ?? historyChat?.title,
          workspaceLabel: workspace?.label,
        });
      };

      if (!belongsToActiveRun) {
        setUnroutedApprovals((current) =>
          current.some((candidate) => candidate.key === parsed.key)
            ? current
            : [...current, parsed],
        );
        setStatusMessage(
          "Codex is waiting for approval in another conversation. The request remains blocked and was not approved.",
        );
        notifyApproval();
        return;
      }

      updateActiveRunView((current) => addApprovalRequest(current, parsed));
      notifyApproval();
      await persistRunEvent("server-request", request.method ?? null, request);
      return;
    }

    if (
      !messageMatchesRun(
        request,
        runViewRef.current.threadId,
        runViewRef.current.turnId,
      )
    ) {
      return;
    }
    if (
      request.id !== undefined &&
      runViewRef.current.serverRequests.some(
        (existing) => String(existing.id) === String(request.id),
      )
    ) {
      return;
    }
    const routedRequest = { ...request, requestToken };
    updateActiveRunView((current) => addServerRequest(current, routedRequest));
    await persistRunEvent("server-request", request.method ?? null, request);
    if (isNativeUserInputRequest(request) && request.params.autoResolutionMs) {
      const routedUserInputRequest = { ...request, requestToken };
      const timerKey = `${profileKey}:${requestKey(request)}`;
      const timer = window.setTimeout(() => {
        userInputAutoResolutionTimersRef.current.delete(timerKey);
        const activeEntry = taskChatEntriesRef.current.find(
          (entry) => entry.clientId === activeChatEntryIdRef.current,
        );
        if (activeEntry) {
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
    eventType: "notification" | "server-request" | "process" | "client-action",
    method: string | null,
    payload: unknown,
  ) {
    await flushBufferedRunEvents();
    const input = createRunEventInput(eventType, method, payload);
    if (input) await appendRunEvent(input);
  }

  async function handleResolveRequest(
    request: CodexApprovalRequest,
    choice: ApprovalChoice,
  ) {
    const accountId = currentRunAccountId.current;
    const profileKey = currentRunProfileKey.current;
    if (accountId === null || profileKey === null) {
      return;
    }
    const currentRequest = runViewRef.current.approvalRequests.find(
      (candidate) => candidate.key === request.key,
    );
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
    const control = activeRunControlRef.current;
    if (
      currentRequest.threadId &&
      control?.threadId &&
      currentRequest.threadId !== control.threadId
    ) {
      updateActiveRunView((current) =>
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
      control?.turnId &&
      currentRequest.turnId !== control.turnId
    ) {
      updateActiveRunView((current) =>
        markApprovalError(
          current,
          currentRequest.key,
          "This approval belongs to a different Codex turn.",
        ),
      );
      return;
    }

    updateActiveRunView((current) =>
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
      void removeAgentNotification(
        approvalNotificationEventKey(currentRequest),
      ).catch(() => undefined);
      updateActiveRunView((current) =>
        markApprovalAwaitingResolution(current, currentRequest.key),
      );
    } catch (error) {
      updateActiveRunView((current) =>
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
    const activeEntryId = activeChatEntryIdRef.current;
    const accountId = currentRunAccountId.current;
    const profileKey = currentRunProfileKey.current;
    if (
      activeEntryId !== entry.clientId ||
      accountId === null ||
      profileKey === null ||
      entry.runView.threadId !== request.params.threadId ||
      entry.runView.turnId !== request.params.turnId ||
      !entry.runView.serverRequests.some(
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

    updateActiveRunView((current) =>
      setServerRequestSubmissionState(current, request, "submitting"),
    );
    clearUserInputAutoResolutionTimer(profileKey, request.id);
    try {
      if (profileKey === DEFAULT_CODEX_PROFILE_KEY) {
        await resolveDefaultCodexServerRequest(request.id, requestToken, response);
      } else {
        await resolveCodexServerRequest(accountId, request.id, requestToken, response);
      }
    } catch (error) {
      requestActionLocksRef.current.delete(actionKey);
      updateActiveRunView((current) =>
        setServerRequestSubmissionState(current, request, "failed"),
      );
      setStatusMessage(
        `Could not send Codex input: ${error instanceof Error ? error.message : String(error)}`,
      );
      return;
    }

    try {
      await persistRunEvent("client-action", request.method, {
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
    updateActiveRunView((current) => resolveServerRequest(current, request.id));
    requestActionLocksRef.current.delete(actionKey);
  }

  function launchPlanFollowUp(
    entry: TaskChatEntry,
    promptText: string,
    intent: "plan-revision" | "plan-implementation",
  ) {
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
      return;
    }
    if (runIsActive || activeChatEntryIdRef.current !== null) {
      setStatusMessage("Wait for the active turn to finish first.");
      return;
    }
    if (entry.runView.nativePlan.reviewState !== "available") {
      setStatusMessage("That plan is no longer awaiting review.");
      return;
    }
    const external = chatSession.origin === "codex_external";
    const sessionProfileKey = chatSession.profileKey;
    const sessionAccountId =
      sessionProfileKey?.startsWith("account:")
        ? Number(sessionProfileKey.slice("account:".length))
        : null;
    const accountId = external
      ? 0
      : Number.isFinite(sessionAccountId)
        ? sessionAccountId
        : selectedAccountIdRef.current;
    const account = external
      ? null
      : codexAccountsRef.current.find((candidate) => candidate.id === accountId) ?? null;
    if (!external && (!accountId || !account)) {
      setStatusMessage("Sign in to the plan's Codex account before continuing.");
      return;
    }
    if (planActionLocksRef.current.has(entry.clientId)) return;
    planActionLocksRef.current.add(entry.clientId);
    const selectedModel =
      models.find((option) => option.id === selectedModelId) ?? models[0] ?? null;
    const model = useOss || modelLoadError ? null : selectedModel?.model ?? null;
    const profileKey: CodexProfileKey = external
      ? DEFAULT_CODEX_PROFILE_KEY
      : sessionProfileKey ?? (`account:${accountId}` as CodexProfileKey);
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
      mode: intent === "plan-revision" ? "plan" : "run",
      intent,
      clientUserMessageId: createStableClientMessageId(),
      access: accessSettings({ accessMode }),
      model,
      effort: model ? selectedReasoningEffort : null,
      useOss,
      ossProvider,
      improvedPrompt: promptText,
      contextFiles: [],
      selectedSkills: [],
      goalMode: false,
      loginState,
      chatId: entry.chatId,
      threadId: chatSession.threadId,
      turnIndex: chatSession.nextTurnIndex,
      restorePromptOnSetupFailure: false,
      sourcePlanEntry: entry,
      defaultCollaborationMode: chatSession.savedDefaultCollaborationMode,
    };
    const runControl = beginOptimisticRun(snapshot);
    scheduleRunSetup(runControl, snapshot);
  }

  function handleImplementPlan(entry: TaskChatEntry) {
    launchPlanFollowUp(entry, "Implement the plan.", "plan-implementation");
  }

  function handleRevisePlan(entry: TaskChatEntry, revision: string) {
    launchPlanFollowUp(entry, revision, "plan-revision");
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
    const external = session.origin === "codex_external";
    const sessionAccountId = session.profileKey?.startsWith("account:")
      ? Number(session.profileKey.slice("account:".length))
      : null;
    const accountId = external
      ? 0
      : Number.isFinite(sessionAccountId)
        ? sessionAccountId
        : selectedAccountIdRef.current;
    if (!external && !accountId) return;
    if (planActionLocksRef.current.has(entry.clientId)) return;
    planActionLocksRef.current.add(entry.clientId);
    updateTaskChatEntryRunView(entry.clientId, (current) =>
      updateNativePlanReview(current, "submitting", "cancelling"),
    );
    const profileKey: CodexProfileKey = external
      ? DEFAULT_CODEX_PROFILE_KEY
      : session.profileKey ?? (`account:${accountId}` as CodexProfileKey);
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
      setPlanMode(false);
      setStatusMessage("Plan cancelled. Codex returned to Default mode.");
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

    const existingRequest = !force
      ? directoryRequestCache.current.get(cacheKey)
      : null;
    const request =
      existingRequest ??
      listWorkspaceDirectory(workspace.path, directoryPath).finally(() => {
        directoryRequestCache.current.delete(cacheKey);
      });

    if (!existingRequest) {
      directoryRequestCache.current.set(cacheKey, request);
    }

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
      directoryEntriesCache.current.set(cacheKey, entries);
      setDirectoryStates((current) => ({
        ...current,
        [directoryPath]: { status: "loaded", entries, error: null },
      }));
    } catch (error) {
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
  ) {
    const cacheKey = workspaceCacheKey(workspace.path, directoryPath);
    const existingRequest = directoryRequestCache.current.get(cacheKey);
    const request =
      existingRequest ??
      listWorkspaceDirectory(workspace.path, directoryPath).finally(() => {
        directoryRequestCache.current.delete(cacheKey);
      });
    if (!existingRequest) {
      directoryRequestCache.current.set(cacheKey, request);
    }

    try {
      const entries = await request;
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
    const mode = gitStatus?.statusKind === "deleted" || file.gitGhost ? "diff" : "preview";
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

  function hasContextFileDrop(dataTransfer: DataTransfer) {
    return (
      hasContextFilePayload(dataTransfer) ||
      explorerDragContextFileRef.current !== null
    );
  }

  function readContextFileDrop(dataTransfer: DataTransfer) {
    const result = readDroppedContextFiles(dataTransfer);
    if (result.files.length > 0 || explorerDragContextFileRef.current === null) {
      return result;
    }

    return {
      ...result,
      files: [explorerDragContextFileRef.current],
    };
  }

  function getExplorerDragContextFiles() {
    return explorerDragContextFileRef.current
      ? [explorerDragContextFileRef.current]
      : [];
  }

  function contextFileFromWorkspaceEntry(file: WorkspaceTreeEntry): ComposerContextFile {
    return {
      path: file.path,
      name: file.name,
      source: "explorer",
      status: "ready",
    };
  }

  function addDroppedContextFiles(files: ComposerContextFile[]) {
    if (files.length === 0) {
      return;
    }

    setContextFiles((current) => mergeContextFiles(current, files));
    setStatusMessage(
      `Added ${files.length === 1 ? files[0].name : `${files.length} files`} to context.`,
    );
  }

  function handleTaskContextDragOver(event: DragEvent<HTMLElement>) {
    if (!hasContextFileDrop(event.dataTransfer)) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setTaskContextDropActive(true);
  }

  function handleTaskContextDragLeave(event: DragEvent<HTMLElement>) {
    const relatedTarget = event.relatedTarget;
    if (
      !(relatedTarget instanceof Node) ||
      !event.currentTarget.contains(relatedTarget)
    ) {
      setTaskContextDropActive(false);
    }
  }

  function handleTaskContextDrop(event: DragEvent<HTMLElement>) {
    if (!hasContextFileDrop(event.dataTransfer)) {
      return;
    }

    event.preventDefault();
    setTaskContextDropActive(false);

    const { files, skipped } = readContextFileDrop(event.dataTransfer);
    if (files.length > 0) {
      addDroppedContextFiles(files);
    }
    if (skipped > 0) {
      setStatusMessage(
        `Skipped ${skipped} dropped file${skipped === 1 ? "" : "s"} because the file path was unavailable.`,
      );
    }
    endWorkspaceFileDrag();
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
                className="secondary"
                type="button"
                onClick={() => setWorkspaceDeleteCandidate(null)}
              >
                Cancel
              </button>
              <button
                className="danger"
                type="button"
                onClick={() => void confirmWorkspaceDelete()}
              >
                Remove
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
              gitActionStatus === "idle"
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
                }}
                disabled={gitActionStatus !== "idle"}
              />
            </label>

            {commitDialogMessage ? (
              <p className="git-action-feedback" role="status">
                {commitDialogMessage}
              </p>
            ) : null}

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
                disabled={gitActionStatus !== "idle"}
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
                disabled={!canCommitFromDialog || gitActionStatus !== "idle"}
              >
                <span>
                  {gitActionStatus === "committing" ? (
                    <Loader2 className="spin" size={16} aria-hidden="true" />
                  ) : gitActionStatus === "generating" ? (
                    <Loader2 className="spin" size={16} aria-hidden="true" />
                  ) : (
                    <GitCommitHorizontal size={16} aria-hidden="true" />
                  )}
                  {gitActionStatus === "generating" ? "Generating" : "Commit"}
                </span>
                <kbd>Cmd Return</kbd>
              </button>
              <button
                className="git-action-row"
                type="button"
                aria-label="Commit and push"
                onClick={() => void handleCommitAll({ pushAfter: true })}
                disabled={!canCommitFromDialog || gitActionStatus !== "idle"}
              >
                <span>
                  {gitActionStatus === "generating" ? (
                    <Loader2 className="spin" size={16} aria-hidden="true" />
                  ) : (
                    <UploadCloud size={16} aria-hidden="true" />
                  )}
                  {gitActionStatus === "generating"
                    ? "Generating"
                    : "Commit and push"}
                </span>
              </button>
              <button
                className="git-action-row"
                type="button"
                aria-label="Push"
                onClick={() => void handlePushOnly()}
                disabled={!headerGitAction.canPush || gitActionStatus !== "idle"}
              >
                <span>
                  {gitActionStatus === "pushing" ? (
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
              gitActionStatus={gitActionStatus}
              commitDialogOpen={commitDialogOpen}
              contextUsage={selectedWorkspaceContextUsage}
              contextWindow={selectedModelContextWindow}
              onGitAction={() => void handleHeaderGitAction()}
              onBranchChange={(branch) => void selectBranch(branch)}
              newChatDisabled={runIsActive}
              onNewChat={startNewWorkspaceChat}
              historyOpen={historyDrawerOpen}
              onToggleHistory={toggleHistoryDrawer}
              windowDragRegionsEnabled={macOsWindowDragRegionsEnabled}
            />
            <div
              className={`codex-workspace-body${
                historyDrawerSpaceReserved ? " history-space-reserved" : ""
              }${historyDrawerOpen ? " history-open" : ""}`}
              data-history-transition-phase={historyDrawerPhase}
            >
              <section
                className={`task-hero ${hasTaskChat ? "has-chat" : ""}`}
                aria-label="Task chat"
                data-tauri-drag-region={selfWindowDragRegion}
                ref={setTaskViewportElement}
                onDragOver={handleTaskContextDragOver}
                onDragLeave={handleTaskContextDragLeave}
                onDrop={handleTaskContextDrop}
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
                      key={
                        selectedHistoricalTranscript
                          ? `history:${selectedHistoricalTranscript.chatId}:${selectedHistoricalTranscript.sourceVersion}`
                          : `live:${selectedWorkspace?.id ?? "none"}`
                      }
                      entries={visibleTaskChatEntries}
                      transcriptIdentity={
                        selectedWorkspaceChatSession?.chatId
                          ? `chat:${selectedWorkspaceChatSession.chatId}`
                          : `workspace:${selectedWorkspace?.id ?? "none"}:live`
                      }
                      transcriptVersion={
                        selectedHistoricalTranscript?.sourceVersion ?? "live"
                      }
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
                {unroutedApprovals.length > 0 ? (
                  <div className="unrouted-approval-warning" role="alert">
                    <AlertCircle size={16} aria-hidden="true" />
                    <span>
                      Codex is waiting for {unroutedApprovals.length} approval
                      {unroutedApprovals.length === 1 ? "" : "s"} in another
                      conversation. The request remains blocked and has not been approved.
                    </span>
                  </div>
                ) : null}
                {approvalSafetyWarning ? (
                  <div className="unrouted-approval-warning" role="alert">
                    <AlertCircle size={16} aria-hidden="true" />
                    <span>{approvalSafetyWarning}</span>
                  </div>
                ) : null}
                <TaskComposer
                  disabled={!canRun || planReviewAwaiting}
                  runActive={runIsActive}
                  prompt={prompt}
                  promptRevision={promptRevision}
                  accounts={signedInAccounts}
                  selectedAccountId={selectedAccountId}
                  accountSelectionDisabled={runIsActive || planReviewAwaiting}
                  modelSelectionDisabled={runIsActive || planReviewAwaiting}
                  models={models}
                  modelLoadError={modelLoadError}
                  selectedModelId={selectedModelId}
                  selectedReasoningEffort={selectedReasoningEffort}
                  goalMode={goalMode}
                  planMode={planMode}
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
                runSelectionDisabled={runIsActive}
                onSelectChat={selectHistoryChatFromDrawer}
                onOpenChatContextMenu={openChatHistoryContextMenuFromDrawer}
                onTransitionEnd={handleHistoryDrawerTransitionEnd}
              />
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
                      runIsActive &&
                      activeRunControlRef.current?.chatId === chatHistoryContextMenu.chat.id
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
  newChatDisabled,
  onNewChat,
  historyOpen,
  onToggleHistory,
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
  newChatDisabled: boolean;
  onNewChat: () => void;
  historyOpen: boolean;
  onToggleHistory: () => void;
  windowDragRegionsEnabled: boolean;
}) {
  const deepWindowDragRegion = windowDragRegionValue(
    windowDragRegionsEnabled,
    "deep",
  );

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

  const gitLoading = gitState?.status === "loading" || gitState?.status === "idle";
  const gitError = gitState?.status === "error";
  const gitClean = !gitLoading && !gitError && gitSummary.total === 0;

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
          {gitLoading ? (
            <span className="workspace-context-chip">Checking git</span>
          ) : null}
          {gitError ? (
            <span className="workspace-context-chip warning">Git unavailable</span>
          ) : null}
          {gitClean ? (
            <span className="workspace-context-chip clean">Clean</span>
          ) : null}
          {!gitLoading && !gitError && gitSummary.total > 0 ? (
            <WorkspaceContextGitSummaryChip gitSummary={gitSummary} />
          ) : null}
          <WorkspaceContextMeter tokenUsage={contextUsage} contextWindow={contextWindow} />
        </div>
      </div>

      <div className="workspace-context-actions" data-tauri-drag-region="false">
        <ComposerSelect
          ariaLabel="Branch"
          value={branch ?? ""}
          options={branches.map((candidate) => ({
            value: candidate,
            label: candidate,
          }))}
          placeholder="No branch"
          icon={<GitBranch size={14} />}
          className="workspace-branch-select"
          disabled={branches.length === 0}
          onChange={onBranchChange}
        />
        <div className="workspace-git-action">
          <button
            className="workspace-header-button icon-only primary"
            type="button"
            onClick={onGitAction}
            disabled={gitAction.disabled || gitActionStatus !== "idle"}
            title={gitAction.disabled ? gitAction.reason : gitAction.label}
            aria-label={gitAction.label}
            aria-expanded={commitDialogOpen}
          >
            {gitActionStatus === "generating" ||
            gitActionStatus === "committing" ||
            gitActionStatus === "pushing" ? (
              <Loader2 className="spin" size={15} />
            ) : (
              <GitCommitHorizontal size={15} />
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
  const usage = getLiveContextUsage(tokenUsage, contextWindow);

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
  runSelectionDisabled,
  onSelectChat,
  onOpenChatContextMenu,
  onTransitionEnd,
}: {
  phase: HistoryDrawerPhase;
  workspace: Workspace | null;
  historyState: WorkspaceHistoryState;
  selectedChatId: number | null;
  runSelectionDisabled: boolean;
  onSelectChat: (chat: ChatListItem) => void;
  onOpenChatContextMenu: (
    chat: ChatListItem,
    event: ReactMouseEvent<HTMLElement> | ReactKeyboardEvent<HTMLElement>,
  ) => void;
  onTransitionEnd: (event: ReactTransitionEvent<HTMLElement>) => void;
}) {
  const open = phase === "opening" || phase === "open";
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
          {historyState.chats.map((chat) => (
            <button
              key={chat.id}
              className={`history-run-item ${selectedChatId === chat.id ? "selected" : ""} ${
                runSelectionDisabled ? "disabled" : ""
              }`}
              type="button"
              aria-pressed={selectedChatId === chat.id}
              aria-disabled={runSelectionDisabled}
              title={
                runSelectionDisabled
                  ? "Finish or stop the active run before opening history"
                  : chat.title
              }
              onClick={() => onSelectChat(chat)}
              onContextMenu={(event) => onOpenChatContextMenu(chat, event)}
              onKeyDown={(event) => {
                if (event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey)) {
                  onOpenChatContextMenu(chat, event);
                }
              }}
            >
              <strong>{chat.title}</strong>
              <span>{formatHistoryChatMeta(chat)}</span>
            </button>
          ))}
        </div>
      </div>
    </aside>
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

function createTaskChatEntryFromHistoryRun(run: HistoryRunSummary): TaskChatEntry {
  const status = normalizeHistoryRunStatus(run);
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

  return {
    clientId: `history-run-${run.id}`,
    workspaceId: run.workspace_id,
    chatId: run.chat_id,
    turnIndex: run.turn_index,
    runId: run.id,
    taskId: run.task_id,
    prompt: run.original_prompt,
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
              cachedInputTokens: 0,
              outputTokens: 0,
              reasoningOutputTokens: 0,
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
    throw new Error(
      `Codex activated permission profile ${activeProfile}, but the application requested ${expected.permissionProfile}. The run was stopped to avoid a sandbox mismatch.`,
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
  return {
    path,
    name: basename(path),
    source: "picker",
    status: "ready",
  };
}

function createChatTitle(prompt: string) {
  const normalized = prompt.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "Untitled chat";
  }
  return normalized.length > 120 ? `${normalized.slice(0, 117)}...` : normalized;
}

function buildCommitIntentFromChatEntry(latestEntry: TaskChatEntry | null) {
  if (!latestEntry) {
    return "";
  }

  const parts = [`Goal: ${latestEntry.prompt.trim()}`];
  const finalSummary = latestEntry.runView.finalMessage.trim();
  if (finalSummary) {
    parts.push(`Summary: ${finalSummary}`);
  }
  return truncateCommitIntent(parts.join("\n\n"));
}

function truncateCommitIntent(intent: string) {
  const normalized = intent.trim();
  return normalized.length > 1600 ? `${normalized.slice(0, 1597).trimEnd()}...` : normalized;
}

function generateCommitMessageFromIntent(intent: string) {
  const subject = extractCommitIntentSubject(intent);
  return cleanGeneratedCommitSubject(subject) || "Describe workspace change";
}

function extractCommitIntentSubject(intent: string) {
  const lines = intent
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const preferredLine =
    lines.find((line) => /^goal\s*:/i.test(line)) ??
    lines.find((line) => /^prompt\s*:/i.test(line)) ??
    lines[0] ??
    "";
  let subject = preferredLine
    .replace(/^(goal|prompt|intent|summary)\s*:\s*/i, "")
    .replace(/^please\s+/i, "")
    .replace(/^can you\s+/i, "")
    .replace(/^could you\s+/i, "")
    .replace(/^i want you to\s+/i, "")
    .replace(/^i want to\s+/i, "")
    .replace(/^make sure\s+/i, "Ensure ")
    .replace(/\s+/g, " ")
    .trim();

  if (!subject) {
    return "Describe workspace change";
  }

  subject = subject.replace(/[.!?]+$/g, "").trim();
  subject = subject.charAt(0).toUpperCase() + subject.slice(1);
  return subject.length > 72 ? `${subject.slice(0, 69).trimEnd()}...` : subject;
}

function cleanGeneratedCommitSubject(subject: string) {
  return subject
    .replace(
      /\s+\((?:\d+\s+(?:modified|added|deleted|untracked|renamed|copied|changed)(?:,\s*)?)+\)$/i,
      "",
    )
    .trim();
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

function getLiveContextUsage(
  tokenUsage: RunViewState["tokenUsage"],
  fallbackContextWindow = DEFAULT_CONTEXT_WINDOW,
) {
  if (!tokenUsage) {
    const windowSize =
      fallbackContextWindow > 0 ? fallbackContextWindow : DEFAULT_CONTEXT_WINDOW;
    return {
      label: `0 / ${windowSize.toLocaleString()} (0%)`,
      usedLabel: "0",
      windowLabel: windowSize.toLocaleString(),
      title: `0 of ${windowSize.toLocaleString()} context tokens used`,
      percentage: 0,
    };
  }

  const total = tokenUsage.totalTokens.toLocaleString();
  const windowSize = tokenUsage.modelContextWindow;
  if (!windowSize || windowSize <= 0) {
    return {
      label: `${total} tokens`,
      usedLabel: total,
      windowLabel: null,
      title: `${total} tokens used`,
      percentage: null,
    };
  }

  const percentage = Math.min(
    100,
    Math.round((tokenUsage.totalTokens / windowSize) * 100),
  );
  return {
    label: `${total} / ${windowSize.toLocaleString()} (${percentage}%)`,
    usedLabel: total,
    windowLabel: windowSize.toLocaleString(),
    title: `${total} of ${windowSize.toLocaleString()} context tokens used`,
    percentage,
  };
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

  if (chat.source_kind === "vscode") {
    return "VS Code";
  }
  if (chat.source_kind === "cli") {
    return "CLI";
  }
  if (chat.source_kind === "appServer") {
    return "Codex App";
  }
  return "Codex";
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
  const existing = new Set(current.map((file) => file.path));
  const merged = [...current];

  for (const file of additions) {
    if (!existing.has(file.path)) {
      existing.add(file.path);
      merged.push({ ...file, status: file.status ?? "ready" });
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
  const usage = readObject(params.tokenUsage);
  const total = readObject(usage.total);

  if (!Object.keys(total).length) {
    return null;
  }

  return {
    totalTokens: readNumber(total.totalTokens) ?? 0,
    inputTokens: readNumber(total.inputTokens) ?? 0,
    cachedInputTokens: readNumber(total.cachedInputTokens) ?? 0,
    outputTokens: readNumber(total.outputTokens) ?? 0,
    reasoningOutputTokens: readNumber(total.reasoningOutputTokens) ?? 0,
    modelContextWindow: readNumber(usage.modelContextWindow),
  };
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

export default App;
