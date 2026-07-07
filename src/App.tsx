import { open } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import { listen } from "@tauri-apps/api/event";
import {
  AlertCircle,
  BarChart3,
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
  Sun,
  Trash2,
  UploadCloud,
  UserPlus,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import type {
  CSSProperties,
  DragEvent,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from "react";
import "./App.css";
import orchestratorMark from "./assets/brand/orchestrator-mark.png";
import {
  appendRunEvent,
  completeDuplicateProfileCleanup,
  createChat,
  createCodexAccount,
  createRun,
  createTask,
  getChatWithRuns,
  getAnalyticsSummary,
  listWorkspaceChats,
  listCodexAccounts,
  listDuplicateProfilesPendingCleanup,
  listWorkspaces,
  recordTokenUsage,
  renameCodexAccount,
  savePreflightReport,
  softDeleteChat,
  softDeleteWorkspace,
  softDeleteCodexAccount,
  updateChat,
  updateCodexAccount,
  updateRun,
  updateTaskStatus,
  upsertWorkspace,
} from "./db";
import {
  cancelCodexLogin,
  codexRpc,
  commitWorkspaceChanges,
  connectCodex,
  checkoutGitBranch,
  deleteCodexProfile,
  listGitBranches,
  listCodexModels,
  listCodexSkills,
  listWorkspaceGitStatus,
  listWorkspaceDirectory,
  logoutCodexAccount,
  pushWorkspaceBranch,
  readCodexFile,
  readCodexAccount,
  readWorkspaceGitDiff,
  readWorkspaceFilePreview,
  resolveCodexServerRequest,
  runPreflight,
  setThreadGoal,
  startCodexLogin,
  stopCodex,
} from "./codexClient";
import { AnalyticsSummary } from "./components/AnalyticsSummary";
import { ComposerSelect } from "./components/ComposerSelect";
import { FilePreviewDrawer } from "./components/FilePreviewDrawer";
import {
  TaskChatTranscript,
  type TaskChatEntry,
} from "./components/TaskChatTranscript";
import { TaskComposer } from "./components/TaskComposer";
import {
  addServerRequest,
  applyCodexMessage,
  emptyRunView,
  resolveServerRequest,
  updateRunElapsed,
  type RunViewState,
} from "./lib/codexEventReducer";
import {
  formatCodexAuthMessage,
  formatCodexPlanType,
  getCodexAccountSummary,
  formatLoginStartStatus,
  isCodexSignedIn,
  shouldBlockRunForAuth,
} from "./lib/codexAuth";
import {
  buildPlanPrompt,
  buildRunPrompt,
  estimateTokens,
  improvePrompt,
  recommendRoute,
} from "./lib/taskAnalysis";
import {
  applyDocumentTheme,
  applyThemePreference,
  persistThemePreference,
  readThemePreference,
  resolveTheme,
  watchSystemTheme,
} from "./lib/theme";
import {
  hasContextFilePayload,
  readDroppedContextFiles,
} from "./lib/contextFiles";
import type {
  AccessLevel,
  AccountLoginCompletedNotification,
  AccountUpdatedNotification,
  AdditionalContextEntry,
  AnalyticsSummary as AnalyticsSummaryType,
  ChatListItem,
  ChatWithRuns,
  CodexAccount,
  CodexAccountProfile,
  CodexAccountStatus,
  CodexMessage,
  CodexMessageEvent,
  CodexLoginState,
  CodexModel,
  CodexSkillSummary,
  ComposerMentionSearchStatus,
  CodexProcessEvent,
  ComposerContextFile,
  OssProvider,
  PreflightReport,
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
const EMPTY_GIT_STATUS_BY_PATH = new Map<string, WorkspaceGitFileStatus>();
const EMPTY_DIRTY_DIRECTORY_PATHS = new Set<string>();

type AppView = "task" | "analytics" | "settings";

function createTaskChatClientId() {
  return `chat-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

class RunStoppedError extends Error {
  constructor() {
    super("Run stopped by user.");
    this.name = "RunStoppedError";
  }
}

type ActiveRunControl = {
  accountId: number;
  clientId: string;
  promptFallback: string;
  chatId: number | null;
  stopped: boolean;
  taskId: number | null;
  runId: number | null;
  setupStarted: boolean;
  cancelScheduledSetup: (() => void) | null;
};

type RunAccessSettings = {
  sandbox: string;
  approvalPolicy: string;
};

type RunSetupSnapshot = {
  promptText: string;
  promptFallback: string;
  workspace: Workspace;
  accountId: number;
  account: CodexAccountProfile;
  selectedBranch: string | null;
  cachedPreflight: PreflightReport | null;
  mode: "plan" | "run";
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
};

type WorkspaceHistoryState = {
  status: "idle" | "loading" | "loaded" | "error";
  chats: ChatListItem[];
  error: string | null;
};

type WorkspaceChatSession = {
  chatId: number;
  threadId: string | null;
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
  const summary: WorkspaceGitSummary = {
    total: snapshot?.files.length ?? 0,
    modified: 0,
    added: 0,
    deleted: 0,
    untracked: 0,
    conflicted: 0,
    additions: snapshot?.additions ?? 0,
    deletions: snapshot?.deletions ?? 0,
  };

  snapshot?.files.forEach((file) => {
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

  if (snapshot && snapshot.additions === undefined && snapshot.deletions === undefined) {
    summary.additions = summary.modified + summary.added + summary.untracked;
    summary.deletions = summary.deleted + summary.conflicted;
  }

  return summary;
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
  const [prompt, setPrompt] = useState("");
  const [preflight, setPreflight] = useState<PreflightReport | null>(null);
  const [runView, setRunView] = useState<RunViewState>(emptyRunView);
  const [taskChatEntries, setTaskChatEntries] = useState<TaskChatEntry[]>([]);
  const [activeChatEntryId, setActiveChatEntryId] = useState<string | null>(null);
  const [historyDrawerOpen, setHistoryDrawerOpen] = useState(false);
  const [historyState, setHistoryState] = useState<WorkspaceHistoryState>({
    status: "idle",
    chats: [],
    error: null,
  });
  const [selectedHistoryChatId, setSelectedHistoryChatId] = useState<number | null>(null);
  const [workspaceChatSessions, setWorkspaceChatSessions] = useState<
    Record<number, WorkspaceChatSession | undefined>
  >({});
  const [commitPopoverOpen, setCommitPopoverOpen] = useState(false);
  const [commitMessage, setCommitMessage] = useState("");
  const [gitActionStatus, setGitActionStatus] = useState<
    "idle" | "committing" | "pushing"
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
  const [accessLevel, setAccessLevel] = useState<AccessLevel>("ask");
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
  const runViewRef = useRef<RunViewState>(emptyRunView);
  const activeChatEntryIdRef = useRef<string | null>(null);
  const activeRunControlRef = useRef<ActiveRunControl | null>(null);
  const workspaceChatSessionsRef = useRef<
    Record<number, WorkspaceChatSession | undefined>
  >({});
  const eventSequence = useRef(0);
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
  const workspaceContextMenuRef = useRef<HTMLDivElement | null>(null);
  const chatHistoryContextMenuRef = useRef<HTMLDivElement | null>(null);
  const accountMenuContainerRef = useRef<HTMLDivElement | null>(null);

  const improvedPrompt = useMemo(() => improvePrompt(prompt), [prompt]);
  const routeRecommendation = useMemo(() => recommendRoute(prompt), [prompt]);
  const tokenEstimate = useMemo(() => estimateTokens(prompt), [prompt]);
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
  const signedInAccounts = codexAccounts.filter(
    (account) => account.status === "signed_in",
  );
  const codexConnected =
    selectedAccountId !== null && connectedAccountIds.has(selectedAccountId);
  const runIsActive =
    runView.status === "connecting" || runView.status === "running";
  const canRun = Boolean(selectedWorkspace && prompt.trim());
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
  const selectedWorkspaceContextUsage =
    [...selectedWorkspaceChatEntries]
      .reverse()
      .find((entry) => entry.runView.tokenUsage)?.runView.tokenUsage ?? null;
  const hasTaskChat = visibleTaskChatEntries.length > 0;
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
      applyDocumentTheme(theme);
      setResolvedTheme(theme);
    });
  }, [themePreference]);

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

    void loadWorkspaceRunHistory(selectedWorkspace.id);
  }, [historyDrawerOpen, selectedWorkspace?.id]);

  useEffect(() => {
    workspaces.forEach((workspace) => {
      void refreshWorkspaceGitStatus(workspace, { showLoading: false });
    });
  }, [workspaces]);

  useEffect(() => {
    if (workspaces.length === 0) {
      return;
    }

    let cancelled = false;
    let timeoutId: number | null = null;

    const scheduleRefresh = () => {
      if (cancelled) {
        return;
      }

      timeoutId = window.setTimeout(() => {
        Promise.all(
          workspaces.map((workspace) =>
            refreshWorkspaceGitStatus(workspace, { showLoading: false }).catch(
              () => undefined,
            ),
          ),
        )
          .catch(() => undefined)
          .finally(() => {
            workspaces.forEach((workspace) => {
              refreshVisibleWorkspaceDirectories(workspace);
            });
            scheduleRefresh();
          });
      }, GIT_STATUS_AUTO_REFRESH_INTERVAL_MS);
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
      void handleCodexNotification(event.payload.accountId, event.payload.message);
    }).then((unlisten) => {
      if (disposed) unlisten();
      else notificationUnlisten = unlisten;
    });

    void listen<CodexMessageEvent>("codex:server-request", (event) => {
      void handleCodexServerRequest(event.payload.accountId, event.payload.message);
    }).then((unlisten) => {
      if (disposed) unlisten();
      else requestUnlisten = unlisten;
    });

    void listen<CodexProcessEvent>("codex:process", (event) => {
      if (
        selectedAccountIdRef.current === event.payload.accountId ||
        currentRunAccountId.current === event.payload.accountId
      ) {
        setStatusMessage(event.payload.message);
      }
      if (currentRunAccountId.current === event.payload.accountId) {
        void persistRunEvent("process", event.payload.status, event.payload);
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
        if (selectedAccountIdRef.current === event.payload.accountId) {
          setRequiresOpenaiAuth(true);
        }
        if (pendingLoginAccountIdRef.current === event.payload.accountId) {
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
    setSelectedWorkspace(workspace);
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
  }

  async function refreshWorkspaceData(workspaceId: number) {
    const summary = await getAnalyticsSummary(workspaceId);
    setAnalytics(summary);
  }

  async function loadWorkspaceRunHistory(workspaceId: number) {
    setHistoryState((current) => ({
      ...current,
      status: "loading",
      error: null,
    }));
    try {
      const chats = await listWorkspaceChats(workspaceId);
      setHistoryState({ status: "loaded", chats, error: null });
    } catch (error) {
      setHistoryState({
        status: "error",
        chats: [],
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async function refreshSelectedWorkspaceHistory() {
    if (!selectedWorkspaceRef.current || !historyDrawerOpen) {
      return;
    }
    await loadWorkspaceRunHistory(selectedWorkspaceRef.current.id);
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
        setGitStatusStates((current) => {
          const previous = current[workspace.id];
          if (
            previous?.status === "loaded" &&
            previous.error === null &&
            gitStatusSnapshotKey(previous.snapshot) === gitStatusSnapshotKey(snapshot)
          ) {
            return current;
          }

          return {
            ...current,
            [workspace.id]: { status: "loaded", snapshot, error: null },
          };
        });
      })
      .catch((error) => {
        const errorMessage = error instanceof Error ? error.message : String(error);
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

    setWorkspaceContextMenu(null);
    setSelectedWorkspace(workspace);
    setSelectedHistoryChatId(workspaceChatSessionsRef.current[workspace.id]?.chatId ?? null);
    setActiveView("task");
    setPreflight(null);
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

    if (!control && !runIsActive) {
      return;
    }

    const setupStarted = control?.setupStarted ?? false;
    const persistedRunId = currentRunId.current ?? control?.runId ?? null;
    const shouldStopCodex =
      accountId !== null &&
      (setupStarted ||
        persistedRunId !== null ||
        currentRunAccountId.current !== null);

    if (control) {
      control.stopped = true;
      control.cancelScheduledSetup?.();
      control.cancelScheduledSetup = null;
    }

    const shouldRestorePrompt =
      persistedRunId === null && Boolean(control?.promptFallback);
    const { completedAt, stoppedRunView } = markActiveRunInterrupted();
    if (shouldRestorePrompt && control) {
      setPrompt(control.promptFallback);
    }
    await persistInterruptedRun(control, completedAt, stoppedRunView);

    currentRunId.current = null;
    currentTaskId.current = null;
    currentRunAccountId.current = null;
    activeRunControlRef.current = null;
    clearActiveChatRun();
    setStatusMessage("Codex run stopped.");

    if (shouldStopCodex) {
      try {
        await stopCodex(accountId);
      } catch (error) {
        setStatusMessage(
          `Run stopped locally, but Codex app-server did not stop cleanly: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
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

  async function selectHistoryChat(chat: ChatListItem) {
    if (runIsActive) {
      setStatusMessage("Finish or stop the active run before opening history.");
      return;
    }

    setChatHistoryContextMenu(null);
    try {
      const loadedChat = await getChatWithRuns(chat.id);
      const entries = createTaskChatEntriesFromHistoryChat(loadedChat);
      setTaskChatEntries((current) => [
        ...current.filter((entry) => entry.workspaceId !== chat.workspace_id),
        ...entries,
      ]);
      setWorkspaceChatSession(chat.workspace_id, {
        chatId: chat.id,
        threadId: chat.codex_thread_id,
      });
      setSelectedHistoryChatId(chat.id);
      setHistoryDrawerOpen(false);
      setActiveView("task");
      setStatusMessage(`Opened chat from ${formatHistoryTimestamp(chat.latest_activity_at)}.`);
    } catch (error) {
      setStatusMessage(
        `Could not open chat: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
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

    setTaskChatEntries((current) =>
      current.filter((entry) => entry.workspaceId !== selectedWorkspace.id),
    );
    setWorkspaceChatSession(selectedWorkspace.id, undefined);
    setSelectedHistoryChatId(null);
    setPreflight(null);
    setStatusMessage("Started a new chat.");
  }

  async function confirmChatHistoryDelete() {
    const chat = chatHistoryDeleteCandidate;
    if (!chat) {
      return;
    }

    await softDeleteChat(chat.id);
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
    setPreflight(null);

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
    setPreflight(null);
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
            tokenEstimate,
            contextFiles,
            selectedSkills,
            gitSummary: selectedGitSummary,
            runView,
          }),
        );
        return;
      case "review":
        setPrompt((current) =>
          applyPromptDraft(
            current,
            buildCodeReviewDraft(
              selectedWorkspaceRef.current,
              selectedBranch,
              selectedGitSummary,
            ),
          ),
        );
        setPreflight(null);
        setStatusMessage("Prepared a code review prompt.");
        return;
      case "mcp":
        void showMcpStatus();
        return;
      case "init":
        setPrompt((current) =>
          applyPromptDraft(current, buildInitInstructionsDraft(selectedWorkspaceRef.current)),
        );
        setPreflight(null);
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
      } else if (response.type === "chatgptDeviceCode") {
        setPendingLoginId(response.loginId);
        pendingLoginIdRef.current = response.loginId;
        setLoginUserCode(response.userCode);
        setLoginState("waiting");
        await openUrl(response.verificationUrl);
      } else {
        resetLoginFlow("failed");
        setLoginError(formatLoginStartStatus(response));
      }

      setStatusMessage(formatLoginStartStatus(response));
    } catch (error) {
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
      } else if (response.type === "chatgptDeviceCode") {
        setPendingLoginId(response.loginId);
        pendingLoginIdRef.current = response.loginId;
        setLoginUserCode(response.userCode);
        setLoginState("waiting");
        await openUrl(response.verificationUrl);
      } else {
        resetLoginFlow("failed");
        setLoginError(formatLoginStartStatus(response));
      }
      setStatusMessage(formatLoginStartStatus(response));
    } catch (error) {
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

  function openCommitPopover() {
    if (!selectedWorkspace) {
      return;
    }
    setCommitMessage("");
    setCommitPopoverOpen(true);
  }

  function handleHeaderGitAction() {
    if (!selectedWorkspace || gitActionStatus !== "idle") {
      return;
    }

    if (commitPopoverOpen) {
      setCommitPopoverOpen(false);
    } else {
      openCommitPopover();
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
      setCommitPopoverOpen(false);
    }
  }

  async function handleCommitAll(options: { pushAfter?: boolean } = {}) {
    if (!selectedWorkspace || !headerGitAction.canCommit || gitActionStatus !== "idle") {
      return;
    }

    const message =
      commitMessage.trim() ||
      generateCommitMessage(selectedWorkspace, selectedGitFiles, selectedGitSummary);

    setGitActionStatus("committing");
    setStatusMessage("Committing workspace changes...");
    try {
      const result = await commitWorkspaceChanges(
        selectedWorkspace.path,
        message,
      );
      setStatusMessage(result.message || "Workspace changes committed.");
      await refreshBranches(selectedWorkspace);
      await refreshWorkspaceGitStatus(selectedWorkspace);
      if (options.pushAfter) {
        const pushed = await pushSelectedWorkspaceBranch();
        if (!pushed) {
          return;
        }
      }
      setCommitPopoverOpen(false);
      setCommitMessage("");
    } catch (error) {
      setStatusMessage(
        `Commit failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      setGitActionStatus("idle");
    }
  }

  function beginOptimisticRun(snapshot: RunSetupSnapshot) {
    const clientId = createTaskChatClientId();
    const submittedAt = new Date().toISOString();
    const initialRunView = {
      ...emptyRunView,
      status: "connecting" as const,
      startedAt: submittedAt,
    };
    const runControl: ActiveRunControl = {
      accountId: snapshot.accountId,
      clientId,
      promptFallback: snapshot.promptFallback,
      chatId: snapshot.chatId,
      stopped: false,
      taskId: null,
      runId: null,
      setupStarted: false,
      cancelScheduledSetup: null,
    };

    activeRunControlRef.current = runControl;
    flushSync(() => {
      startTaskChatEntry({
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
      });
      setPrompt("");
    });
    markPerformance("orchestrator:submit:optimistic-committed");

    return runControl;
  }

  async function continueRunSetup(
    runControl: ActiveRunControl,
    snapshot: RunSetupSnapshot,
  ) {
    let chatId = snapshot.chatId;
    let threadId = snapshot.threadId;
    let taskId: number | null = null;
    let runId: number | null = null;

    setStatusMessage("Preparing run...");
    setPreflight(null);

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
      setPreflight(report);

      await ensureCodexConnected(snapshot.accountId);
      ensureRunControlActive(runControl);
      const authState = await refreshAccountState(snapshot.accountId, true);
      ensureRunControlActive(runControl);
      if (shouldBlockRunForAuth(authState.requiresOpenaiAuth, authState.account)) {
        throw new Error(
          snapshot.loginState === "waiting"
            ? "Finish Codex sign-in before starting a run."
            : "Sign in to Codex before starting a run.",
        );
      }

      if (chatId === null) {
        const chat = await createChat({
          workspaceId: snapshot.workspace.id,
          accountId: snapshot.accountId,
          title: createChatTitle(snapshot.promptText),
          status: "starting",
        });
        chatId = chat.id;
        threadId = chat.codex_thread_id;
        runControl.chatId = chat.id;
        setWorkspaceChatSession(snapshot.workspace.id, {
          chatId: chat.id,
          threadId,
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
        accountId: snapshot.accountId,
        accountLabel: snapshot.account.label,
        accountEmail: snapshot.account.email,
        status: "starting",
        sandbox: snapshot.access.sandbox,
        approvalPolicy: snapshot.access.approvalPolicy,
        model: snapshot.model,
        modelProvider: snapshot.useOss ? "oss" : null,
      });
      runId = run.id;
      runControl.runId = run.id;
      currentRunId.current = run.id;
      currentRunAccountId.current = snapshot.accountId;
      ensureRunControlActive(runControl);
      eventSequence.current = 0;
      updateTaskChatEntryIds(runControl.clientId, {
        taskId: task.id,
        runId: run.id,
        chatId,
        turnIndex: snapshot.turnIndex,
      });

      let threadModel: string | null | undefined = snapshot.model;
      let threadModelProvider: string | null | undefined = snapshot.useOss ? "oss" : null;
      if (!threadId) {
        const thread = await codexRpc<{
          thread: { id: string };
          model?: string;
          modelProvider?: string;
          serviceTier?: string | null;
        }>(snapshot.accountId, "thread/start", {
          cwd: snapshot.workspace.path,
          model: snapshot.model,
          approvalPolicy: snapshot.access.approvalPolicy,
          approvalsReviewer: "user",
          sandbox: snapshot.access.sandbox,
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
        threadId = thread.thread.id;
        threadModel = thread.model ?? snapshot.model;
        threadModelProvider = thread.modelProvider ?? (snapshot.useOss ? "oss" : null);
        await updateChat(chatId, {
          codexThreadId: threadId,
          status: "running",
        });
        setWorkspaceChatSession(snapshot.workspace.id, {
          chatId,
          threadId,
        });
      } else {
        await updateChat(chatId, { status: "running" });
      }
      ensureRunControlActive(runControl);

      await updateRun(run.id, {
        codexThreadId: threadId,
        model: threadModel ?? snapshot.model,
        modelProvider: threadModelProvider ?? (snapshot.useOss ? "oss" : null),
        status: "running",
      });
      ensureRunControlActive(runControl);

      const warnings: string[] = [];
      if (snapshot.goalMode) {
        try {
          await setThreadGoal(
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
        snapshot.mode === "plan"
          ? buildPlanPrompt(report.improvedPrompt || snapshot.improvedPrompt)
          : buildRunPrompt(
              report.improvedPrompt || snapshot.improvedPrompt,
              report.recommendations,
            );
      const text = applySelectedSkillsToPrompt(
        baseTurnText,
        snapshot.selectedSkills,
      );
      const { additionalContext, skippedFiles } = await buildAdditionalContext(
        snapshot.accountId,
        snapshot.contextFiles,
      );
      ensureRunControlActive(runControl);
      if (skippedFiles.length > 0) {
        warnings.push(
          `Skipped context file${skippedFiles.length === 1 ? "" : "s"}: ${skippedFiles.join(", ")}`,
        );
      }

      const turn = await codexRpc<{ turn: { id: string } }>(
        snapshot.accountId,
        "turn/start",
        {
          threadId,
          input: [{ type: "text", text, text_elements: [] }],
          additionalContext,
          cwd: snapshot.workspace.path,
          approvalPolicy: snapshot.access.approvalPolicy,
          approvalsReviewer: "user",
          model: snapshot.model,
          effort: snapshot.effort,
        },
      );
      ensureRunControlActive(runControl);

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
      setPreflight(null);
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
        if (activeRunControlRef.current === runControl) {
          activeRunControlRef.current = null;
        }
        clearActiveChatRun();
        return;
      }

      const message = error instanceof Error ? error.message : String(error);
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
        setPrompt(snapshot.promptFallback);
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
      if (activeRunControlRef.current === runControl) {
        activeRunControlRef.current = null;
      }
      clearActiveChatRun();
      setStatusMessage(`Run setup failed: ${message}`);
    }
  }

  async function launchRun() {
    markPerformance("orchestrator:submit:start");

    const promptText = prompt.trim();
    const workspace = selectedWorkspace;
    const accountId = selectedAccountId;
    const account = selectedAccount;

    if (!workspace || !promptText) {
      setStatusMessage("Select a workspace and write a prompt first.");
      return;
    }
    if (!accountId || !account) {
      setStatusMessage("Sign in to a Codex account before starting a run.");
      return;
    }
    if (runIsActive || activeChatEntryIdRef.current !== null) {
      setStatusMessage("Wait for the active run to finish before starting another.");
      return;
    }
    if (shouldBlockRunForAuth(requiresOpenaiAuth, codexAccount)) {
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
    const chatSession = workspaceChatSessionsRef.current[workspace.id] ?? null;
    const turnIndex =
      selectedWorkspaceChatEntries.filter((entry) =>
        chatSession?.chatId ? entry.chatId === chatSession.chatId : true,
      ).length + 1;
    const snapshot: RunSetupSnapshot = {
      promptText,
      promptFallback: prompt,
      workspace: { ...workspace },
      accountId,
      account: { ...account },
      selectedBranch,
      cachedPreflight: preflight,
      mode: planMode ? "plan" : "run",
      access: accessSettings(accessLevel),
      model,
      effort: model ? selectedReasoningEffort : null,
      useOss,
      ossProvider,
      improvedPrompt,
      contextFiles: [...contextFiles],
      selectedSkills: [...selectedSkills],
      goalMode,
      loginState,
      chatId: chatSession?.chatId ?? null,
      threadId: chatSession?.threadId ?? null,
      turnIndex,
    };

    const runControl = beginOptimisticRun(snapshot);
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

  async function buildAdditionalContext(
    accountId: number,
    files: ComposerContextFile[],
  ) {
    const additionalContext: Record<string, AdditionalContextEntry> = {};
    const errors = new Map<string, string>();
    const skippedFiles: string[] = [];

    for (const file of files) {
      try {
        const content = await readCodexFile(accountId, file.path);
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

  async function handleCodexNotification(accountId: number, message: CodexMessage) {
    const method = message.method ?? null;

    const params = readObject(message.params);

    if (method === "account/login/completed") {
      await handleAccountLoginCompleted(accountId, readAccountLoginCompleted(params));
    }

    if (method === "account/updated") {
      await handleAccountUpdated(accountId, readAccountUpdated(params));
    }

    if (currentRunAccountId.current !== accountId) {
      return;
    }

    const nextRunView = updateActiveRunView((current) =>
      applyCodexMessage(current, message),
    );
    await persistRunEvent("notification", method, message);

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
      await updateRun(runId, {
        status,
        completedAt: new Date().toISOString(),
        durationMs: readNumber(turn.durationMs) ?? nextRunView.elapsedMs,
        finalMessage: nextRunView.finalMessage,
        error: status === "failed" ? JSON.stringify(turn.error ?? "Turn failed") : null,
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
      activeRunControlRef.current = null;
      clearActiveChatRun();
    }
  }

  async function handleCodexServerRequest(
    accountId: number,
    request: CodexMessage,
  ) {
    if (currentRunAccountId.current !== accountId) {
      return;
    }
    updateActiveRunView((current) => addServerRequest(current, request));
    await persistRunEvent("server-request", request.method ?? null, request);
  }

  async function persistRunEvent(
    eventType: "notification" | "server-request" | "process",
    method: string | null,
    payload: unknown,
  ) {
    const runId = currentRunId.current;
    if (!runId) {
      return;
    }

    eventSequence.current += 1;
    await appendRunEvent({
      runId,
      sequence: eventSequence.current,
      eventType,
      method,
      payload,
    });
  }

  async function handleResolveRequest(request: CodexMessage, approved: boolean) {
    if (request.id === undefined) {
      return;
    }

    const accountId = currentRunAccountId.current;
    if (!accountId) {
      return;
    }
    await resolveCodexServerRequest(
      accountId,
      request.id,
      approvalResult(request, approved),
    );
    updateActiveRunView((current) => resolveServerRequest(current, request.id!));
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

  function refreshVisibleWorkspaceDirectories(workspace: Workspace) {
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

    visibleDirectoryPaths.forEach((directoryPath) => {
      void loadWorkspaceDirectory(workspace, directoryPath, true);
    });
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
    <main className="app-shell">
      <aside className="app-rail">
        <nav className="primary-nav" aria-label="Primary">
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
          <div className="rail-section-header">
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

          <nav className="workspace-list" aria-labelledby="workspaces-heading">
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

      <section className={`main ${activeView === "task" ? "task-main" : ""}`}>
        {activeView !== "task" ? (
          <>
            <header className="topbar">
              <div>
                <p className="eyebrow">{selectedWorkspacePath}</p>
                <h2>{selectedWorkspaceName}</h2>
              </div>
              <div className="topbar-actions">
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

            <div className="status-strip">
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
              commitPopoverOpen={commitPopoverOpen}
              commitMessage={commitMessage}
              contextUsage={selectedWorkspaceContextUsage}
              contextWindow={selectedModelContextWindow}
              onGitAction={() => void handleHeaderGitAction()}
              onCommitMessageChange={setCommitMessage}
              onCommitConfirm={() => void handleCommitAll()}
              onCommitAndPush={() => void handleCommitAll({ pushAfter: true })}
              onPush={() => void handlePushOnly()}
              onBranchChange={(branch) => void selectBranch(branch)}
              newChatDisabled={runIsActive}
              onNewChat={startNewWorkspaceChat}
              historyOpen={historyDrawerOpen}
              onToggleHistory={() => setHistoryDrawerOpen((current) => !current)}
            />
            <div
              className={`codex-workspace-body ${
                historyDrawerOpen ? "history-open" : ""
              }`}
            >
              <section
                className={`task-hero ${hasTaskChat ? "has-chat" : ""}`}
                aria-label="Task chat"
                onDragOver={handleTaskContextDragOver}
                onDragLeave={handleTaskContextDragLeave}
                onDrop={handleTaskContextDrop}
              >
                {hasTaskChat ? (
                  <TaskChatTranscript
                    entries={visibleTaskChatEntries}
                    onResolveRequest={handleResolveRequest}
                    onOpenFileLink={openTaskResponseFileLink}
                  />
                ) : (
                  <h1>{taskQuote}</h1>
                )}
                <TaskComposer
                  disabled={!canRun}
                  runActive={runIsActive}
                  prompt={prompt}
                  routeRecommendation={preflight?.routeRecommendation ?? routeRecommendation}
                  tokenEstimate={preflight?.tokenEstimate ?? tokenEstimate}
                  accounts={signedInAccounts}
                  selectedAccountId={selectedAccountId}
                  accountSelectionDisabled={runIsActive}
                  models={models}
                  modelLoadError={modelLoadError}
                  selectedModelId={selectedModelId}
                  selectedReasoningEffort={selectedReasoningEffort}
                  goalMode={goalMode}
                  planMode={planMode}
                  accessLevel={accessLevel}
                  contextFiles={contextFiles}
                  selectedSkills={selectedSkills}
                  mentionResults={mentionResults}
                  mentionSearchStatus={mentionSearchStatus}
                  mentionSearchError={mentionSearchError}
                  slashCommandResults={slashCommandResults}
                  slashCommandSearchStatus={slashCommandSearchStatus}
                  slashCommandSearchError={slashCommandSearchError}
                  onAccountChange={(accountId) => void selectCodexAccount(accountId)}
                  onPromptChange={(nextPrompt) => {
                    setPrompt(nextPrompt);
                    setContextFiles((current) =>
                      pruneMissingInlineContextFiles(current, nextPrompt),
                    );
                    setPreflight(null);
                  }}
                  onModelChange={setSelectedModelId}
                  onReasoningEffortChange={setSelectedReasoningEffort}
                  onGoalModeChange={handleGoalModeChange}
                  onPlanModeChange={handlePlanModeChange}
                  onAccessLevelChange={setAccessLevel}
                  onAddFiles={() => void chooseContextFiles()}
                  onMentionSearch={(query) => void searchMentionFiles(query)}
                  onMentionFileSelect={addMentionFileToContext}
                  onMentionClose={closeMentionSearch}
                  onSlashCommandSearch={(query) => void searchSlashCommands(query)}
                  onSlashCommandSelect={handleSlashCommandSelect}
                  onSlashCommandClose={closeSlashCommandSearch}
                  onContextFilesDrop={addDroppedContextFiles}
                  onContextFilesDropError={setStatusMessage}
                  contextDropActive={taskContextDropActive}
                  onDropSurfaceElementChange={handleTaskComposerDropSurfaceElementChange}
                  hasContextFileDropFallback={() =>
                    explorerDragContextFileRef.current !== null
                  }
                  getContextFileDropFallback={getExplorerDragContextFiles}
                  onContextFileDropHandled={endWorkspaceFileDrag}
                  onRemoveFile={(path) =>
                    setContextFiles((current) => current.filter((file) => file.path !== path))
                  }
                  onRemoveSkill={(skillId) =>
                    setSelectedSkills((current) =>
                      current.filter((skill) => skill.id !== skillId),
                    )
                  }
                  onRun={() => void launchRun()}
                  onStop={() => void stopActiveRun()}
                />
              </section>
              <WorkspaceHistoryDrawer
                open={historyDrawerOpen}
                workspace={selectedWorkspace}
                historyState={historyState}
                selectedChatId={selectedHistoryChatId ?? selectedWorkspaceChatSession?.chatId ?? null}
                runSelectionDisabled={runIsActive}
                onSelectChat={(chat) => void selectHistoryChat(chat)}
                onOpenChatContextMenu={openChatHistoryContextMenu}
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
          <div className="view-stack">
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
          <div className="settings-grid">
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
                      <article className="managed-account-row" key={account.id}>
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
  commitPopoverOpen,
  commitMessage,
  contextUsage,
  contextWindow,
  onGitAction,
  onCommitMessageChange,
  onCommitConfirm,
  onCommitAndPush,
  onPush,
  onBranchChange,
  newChatDisabled,
  onNewChat,
  historyOpen,
  onToggleHistory,
}: {
  workspace: Workspace | null;
  branch: string | null;
  branches: string[];
  gitState: WorkspaceGitStatusState | null;
  gitSummary: WorkspaceGitSummary;
  gitAction: HeaderGitAction;
  gitActionStatus: "idle" | "committing" | "pushing";
  commitPopoverOpen: boolean;
  commitMessage: string;
  contextUsage: RunViewState["tokenUsage"];
  contextWindow: number;
  onGitAction: () => void;
  onCommitMessageChange: (message: string) => void;
  onCommitConfirm: () => void;
  onCommitAndPush: () => void;
  onPush: () => void;
  onBranchChange: (branch: string) => void;
  newChatDisabled: boolean;
  onNewChat: () => void;
  historyOpen: boolean;
  onToggleHistory: () => void;
}) {
  if (!workspace) {
    return (
      <section className="workspace-context-banner empty" aria-label="Selected folder">
        <div className="workspace-context-left">
          <div className="workspace-context-main">
            <span className="workspace-context-icon" aria-hidden="true">
              <Folder size={17} />
            </span>
            <div>
              <strong>No folder selected</strong>
              <span>Add or choose a workspace to start a task.</span>
            </div>
          </div>
          <WorkspaceContextMeter tokenUsage={null} contextWindow={contextWindow} />
        </div>
        <div className="workspace-context-actions">
          <button className="workspace-header-button" type="button" disabled>
            <GitCommitHorizontal size={15} />
            Git
          </button>
          <button className="workspace-header-button" type="button" disabled>
            <Plus size={15} />
            New chat
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
    <section className="workspace-context-banner" aria-label="Selected folder">
      <div className="workspace-context-left">
        <div className="workspace-context-main">
          <span className="workspace-context-icon" aria-hidden="true">
            <Folder size={17} />
          </span>
          <div>
            <strong>{workspace.label}</strong>
            <span title={workspace.path}>{workspace.path}</span>
          </div>
        </div>
        <div className="workspace-context-chips" aria-label="Selected folder status">
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

      <div className="workspace-context-actions">
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
            className="workspace-header-button primary"
            type="button"
            onClick={onGitAction}
            disabled={gitAction.disabled || gitActionStatus !== "idle"}
            title={gitAction.disabled ? gitAction.reason : gitAction.label}
            aria-expanded={commitPopoverOpen}
          >
            {gitActionStatus === "committing" || gitActionStatus === "pushing" ? (
              <Loader2 className="spin" size={15} />
            ) : (
              <GitCommitHorizontal size={15} />
            )}
            {gitActionStatus === "committing"
              ? "Committing"
              : gitActionStatus === "pushing"
                ? "Pushing"
                : gitAction.label}
          </button>
          {commitPopoverOpen ? (
            <div className="commit-popover" role="dialog" aria-label="Commit or push">
              <div className="commit-popover-status">
                <span className="commit-popover-branch">
                  <GitBranch size={15} />
                  <span>{branch ?? "No branch"}</span>
                  <ChevronDown size={14} />
                </span>
                <span className={`commit-popover-state ${gitAction.statusKind}`}>
                  {gitAction.statusLabel}
                </span>
              </div>
              <textarea
                aria-label="Commit message"
                placeholder="Commit message (leave blank to generate)..."
                value={commitMessage}
                onChange={(event) => onCommitMessageChange(event.target.value)}
              />
              <label className="commit-popover-check">
                <input type="checkbox" checked readOnly />
                <span>Include unstaged changes</span>
              </label>
              <div className="commit-popover-actions" role="group" aria-label="Git actions">
                <button
                  className="commit-popover-action"
                  type="button"
                  onClick={onCommitConfirm}
                  disabled={!gitAction.canCommit || gitActionStatus !== "idle"}
                >
                  <GitCommitHorizontal size={15} />
                  Commit
                </button>
                <button
                  className="commit-popover-action"
                  type="button"
                  onClick={onCommitAndPush}
                  disabled={!gitAction.canCommit || gitActionStatus !== "idle"}
                >
                  <UploadCloud size={15} />
                  Commit and push
                </button>
                <button
                  className="commit-popover-action"
                  type="button"
                  onClick={onPush}
                  disabled={!gitAction.canPush || gitActionStatus !== "idle"}
                >
                  <UploadCloud size={15} />
                  Push
                </button>
              </div>
            </div>
          ) : null}
        </div>
        <button
          className="workspace-header-button"
          type="button"
          onClick={onNewChat}
          disabled={newChatDisabled}
          title="Start a new chat"
        >
          <Plus size={15} />
          New chat
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

function WorkspaceHistoryDrawer({
  open,
  workspace,
  historyState,
  selectedChatId,
  runSelectionDisabled,
  onSelectChat,
  onOpenChatContextMenu,
}: {
  open: boolean;
  workspace: Workspace | null;
  historyState: WorkspaceHistoryState;
  selectedChatId: number | null;
  runSelectionDisabled: boolean;
  onSelectChat: (chat: ChatListItem) => void;
  onOpenChatContextMenu: (
    chat: ChatListItem,
    event: ReactMouseEvent<HTMLElement> | ReactKeyboardEvent<HTMLElement>,
  ) => void;
}) {
  return (
    <aside
      className={`workspace-history-drawer ${open ? "open" : "closed"}`}
      aria-label="Workspace chat history"
      aria-hidden={!open}
      inert={!open ? true : undefined}
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
}

function createTaskChatEntriesFromHistoryChat(chat: ChatWithRuns): TaskChatEntry[] {
  return chat.runs.map((run) => createTaskChatEntryFromHistoryRun(run));
}

function createTaskChatEntryFromHistoryRun(run: ChatWithRuns["runs"][number]): TaskChatEntry {
  const status = normalizeHistoryRunStatus(run);
  const finalMessage = run.final_message ?? "";
  const finalMessageItemId = finalMessage ? `history-final-${run.id}` : null;

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

function normalizeHistoryRunStatus(run: ChatWithRuns["runs"][number]): RunViewState["status"] {
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

function approvalResult(request: CodexMessage, approved: boolean) {
  if (request.method === "execCommandApproval" || request.method === "applyPatchApproval") {
    return { decision: approved ? "approved" : "denied" };
  }

  if (request.method === "item/permissions/requestApproval") {
    const params = (request.params ?? {}) as Record<string, unknown>;
    return approved
      ? { permissions: params.permissions ?? {}, scope: "turn" }
      : { permissions: {}, scope: "turn" };
  }

  return { decision: approved ? "accept" : "decline" };
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

function accessSettings(accessLevel: AccessLevel) {
  return accessLevel === "full"
    ? { sandbox: "danger-full-access", approvalPolicy: "never" }
    : { sandbox: "workspace-write", approvalPolicy: "on-request" };
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

function generateCommitMessage(
  workspace: Workspace,
  files: WorkspaceGitFileStatus[],
  summary: WorkspaceGitSummary,
) {
  if (summary.total === 1 && files[0]) {
    const fileName = basename(files[0].relativePath);
    switch (files[0].statusKind) {
      case "added":
      case "untracked":
        return `Add ${fileName}`;
      case "deleted":
        return `Remove ${fileName}`;
      case "renamed":
        return `Rename ${fileName}`;
      default:
        return `Update ${fileName}`;
    }
  }

  const pieces = [
    summary.modified ? `${summary.modified} modified` : null,
    summary.added ? `${summary.added} added` : null,
    summary.deleted ? `${summary.deleted} deleted` : null,
    summary.untracked ? `${summary.untracked} untracked` : null,
  ].filter(Boolean);

  return pieces.length > 0
    ? `Update ${workspace.label} (${pieces.join(", ")})`
    : `Update ${workspace.label}`;
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
    formatHistoryTimestamp(chat.latest_activity_at),
    chat.status,
    `${chat.turn_count} turn${chat.turn_count === 1 ? "" : "s"}`,
    formatHistoryDuration(chat.duration_ms),
    formatHistoryTokens(chat.total_tokens),
  ].join(" · ");
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

function readNumber(value: unknown) {
  return typeof value === "number" ? value : null;
}

export default App;
