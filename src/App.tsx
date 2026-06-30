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
  Loader2,
  LogIn,
  LogOut,
  Monitor,
  Moon,
  Plug,
  Plus,
  RefreshCw,
  Settings,
  Sun,
  Trash2,
  UserPlus,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  createCodexAccount,
  createRun,
  createTask,
  getAnalyticsSummary,
  listCodexAccounts,
  listDuplicateProfilesPendingCleanup,
  listWorkspaces,
  recordTokenUsage,
  renameCodexAccount,
  savePreflightReport,
  softDeleteWorkspace,
  softDeleteCodexAccount,
  updateCodexAccount,
  updateRun,
  updateTaskStatus,
  upsertWorkspace,
} from "./db";
import {
  cancelCodexLogin,
  codexRpc,
  connectCodex,
  checkoutGitBranch,
  deleteCodexProfile,
  listGitBranches,
  listCodexModels,
  listCodexSkills,
  listWorkspaceGitStatus,
  listWorkspaceDirectory,
  logoutCodexAccount,
  readCodexFile,
  readCodexAccount,
  readWorkspaceGitDiff,
  readWorkspaceFilePreview,
  resolveCodexServerRequest,
  runPreflight,
  setThreadGoal,
  startCodexLogin,
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
import { ORCHESTRATOR_CONTEXT_FILE_MIME } from "./types";
import type {
  AccessLevel,
  AccountLoginCompletedNotification,
  AccountUpdatedNotification,
  AdditionalContextEntry,
  AnalyticsSummary as AnalyticsSummaryType,
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
const GIT_STATUS_AUTO_REFRESH_INTERVAL_MS = 3000;

type AppView = "task" | "analytics" | "settings";

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

type WorkspaceGitSummary = {
  total: number;
  modified: number;
  added: number;
  deleted: number;
  untracked: number;
  conflicted: number;
};

type RefreshWorkspaceGitStatusOptions = {
  showLoading?: boolean;
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

  return [snapshot.workspacePath, snapshot.gitRoot, files].join("\u0002");
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
  const [activeChatRunId, setActiveChatRunId] = useState<number | null>(null);
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
  const activeChatRunIdRef = useRef<number | null>(null);
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
  const gitStatusByRelativePath = useMemo(() => {
    const map = new Map<string, WorkspaceGitFileStatus>();
    selectedGitStatusState?.snapshot?.files.forEach((file) => {
      map.set(file.relativePath, file);
    });
    return map;
  }, [selectedGitStatusState?.snapshot]);
  const dirtyDirectoryPaths = useMemo(() => {
    const paths = new Set<string>();
    selectedGitStatusState?.snapshot?.files.forEach((file) => {
      paths.add("");
      const parts = file.relativePath.split("/");
      for (let index = 1; index < parts.length; index += 1) {
        paths.add(parts.slice(0, index).join("/"));
      }
    });
    return paths;
  }, [selectedGitStatusState?.snapshot]);
  const selectedGitSummary = useMemo(
    () => summarizeWorkspaceGitStatus(selectedGitStatusState?.snapshot ?? null),
    [selectedGitStatusState?.snapshot],
  );
  const selectedWorkspaceChatEntries = useMemo(
    () =>
      selectedWorkspace
        ? taskChatEntries.filter((entry) => entry.workspaceId === selectedWorkspace.id)
        : [],
    [selectedWorkspace, taskChatEntries],
  );
  const hasTaskChat = selectedWorkspaceChatEntries.length > 0;
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
    () =>
      previewState.file
        ? gitStatusByRelativePath.get(previewState.file.relativePath) ?? null
        : null,
    [gitStatusByRelativePath, previewState.file],
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
    if (!selectedWorkspace) {
      return;
    }

    let cancelled = false;
    let timeoutId: number | null = null;

    const scheduleRefresh = () => {
      if (cancelled) {
        return;
      }

      timeoutId = window.setTimeout(() => {
        void refreshWorkspaceGitStatus(selectedWorkspace, { showLoading: false })
          .catch(() => undefined)
          .finally(() => {
            refreshVisibleWorkspaceDirectories(selectedWorkspace);
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
  }, [expandedDirectoryPaths, expandedWorkspaceIds, selectedWorkspace]);

  useEffect(() => {
    selectedWorkspaceRef.current = selectedWorkspace;
  }, [selectedWorkspace]);

  useEffect(() => {
    if (
      activeChatRunId === null ||
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
  }, [activeChatRunId, runView.status]);

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
          setCodexAccount(null);
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

  function startTaskChatEntry(entry: TaskChatEntry) {
    activeChatRunIdRef.current = entry.runId;
    runViewRef.current = entry.runView;
    setActiveChatRunId(entry.runId);
    setRunView(entry.runView);
    setTaskChatEntries((current) => [...current, entry]);
  }

  function updateActiveRunView(
    updater: (current: RunViewState) => RunViewState,
  ) {
    const nextRunView = updater(runViewRef.current);
    runViewRef.current = nextRunView;
    setRunView(nextRunView);

    const activeRunId = activeChatRunIdRef.current;
    if (activeRunId !== null) {
      setTaskChatEntries((current) =>
        current.map((entry) =>
          entry.runId === activeRunId
            ? { ...entry, status: nextRunView.status, runView: nextRunView }
            : entry,
        ),
      );
    }

    return nextRunView;
  }

  function clearActiveChatRun() {
    activeChatRunIdRef.current = null;
    setActiveChatRunId(null);
  }

  function openWorkspaceContextMenu(
    workspace: Workspace,
    event:
      | ReactMouseEvent<HTMLElement>
      | ReactKeyboardEvent<HTMLElement>,
  ) {
    event.preventDefault();
    event.stopPropagation();

    if ("clientX" in event && event.clientX !== 0) {
      setWorkspaceContextMenu({
        workspace,
        x: event.clientX,
        y: event.clientY,
      });
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    setWorkspaceContextMenu({
      workspace,
      x: rect.left + 28,
      y: rect.top + rect.height,
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
    if (activeChatRunId !== null) {
      const activeEntry = taskChatEntries.find(
        (entry) => entry.runId === activeChatRunId,
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

  async function ensureSelectedBranch() {
    if (!selectedWorkspace || !selectedBranch) {
      return true;
    }

    try {
      await checkoutGitBranch(selectedWorkspace.path, selectedBranch);
      return true;
    } catch (error) {
      await refreshBranches(selectedWorkspace);
      setStatusMessage(
        `Could not switch to ${selectedBranch}: ${
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
            model: models.find((model) => model.id === selectedModelId) ?? null,
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

  async function handlePreflight() {
    if (!selectedWorkspace || !prompt.trim()) {
      setStatusMessage("Select a workspace and write a prompt first.");
      return null;
    }

    if (!(await ensureSelectedBranch())) {
      return null;
    }

    const report = await runPreflight({
      workspace: selectedWorkspace,
      prompt,
      useOss,
      ossProvider,
    });
    setPreflight(report);
    setStatusMessage("Preflight completed.");
    return report;
  }

  async function launchRun() {
    if (!selectedWorkspace || !prompt.trim()) {
      setStatusMessage("Select a workspace and write a prompt first.");
      return;
    }
    if (!selectedAccountId || !selectedAccount) {
      setStatusMessage("Sign in to a Codex account before starting a run.");
      return;
    }
    if (runIsActive) {
      setStatusMessage("Wait for the active run to finish before starting another.");
      return;
    }

    const report = preflight ?? (await handlePreflight());
    if (!report) {
      return;
    }

    await ensureCodexConnected(selectedAccountId);
    await refreshAccountState(selectedAccountId, true);
    if (!(await ensureSelectedBranch())) {
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

    const mode = planMode ? "plan" : "run";
    const access = accessSettings(accessLevel);
    const selectedModel =
      models.find((model) => model.id === selectedModelId) ?? models[0] ?? null;
    const model = useOss || modelLoadError ? null : (selectedModel?.model ?? null);
    const effort = model ? selectedReasoningEffort : null;

    const task = await createTask({
      workspaceId: selectedWorkspace.id,
      originalPrompt: prompt,
      improvedPrompt: report.improvedPrompt || improvedPrompt,
      routeRecommendation: report.routeRecommendation,
      budgetTokens: report.tokenEstimate,
    });
    currentTaskId.current = task.id;

    await savePreflightReport(selectedWorkspace.id, task.id, report);

    const run = await createRun({
      taskId: task.id,
      workspaceId: selectedWorkspace.id,
      accountId: selectedAccountId,
      accountLabel: selectedAccount.label,
      accountEmail: selectedAccount.email,
      status: "starting",
      sandbox: access.sandbox,
      approvalPolicy: access.approvalPolicy,
      model,
      modelProvider: useOss ? "oss" : null,
    });
    currentRunId.current = run.id;
    currentRunAccountId.current = selectedAccountId;
    eventSequence.current = 0;
    const startedAt = new Date().toISOString();
    const initialRunView = {
      ...emptyRunView,
      status: "running" as const,
      startedAt,
    };
    startTaskChatEntry({
      workspaceId: selectedWorkspace.id,
      runId: run.id,
      taskId: task.id,
      prompt: prompt.trim(),
      submittedAt: startedAt,
      status: initialRunView.status,
      runView: initialRunView,
    });

    const thread = await codexRpc<{
      thread: { id: string };
      model?: string;
      modelProvider?: string;
      serviceTier?: string | null;
    }>(selectedAccountId, "thread/start", {
      cwd: selectedWorkspace.path,
      model,
      approvalPolicy: access.approvalPolicy,
      approvalsReviewer: "user",
      sandbox: access.sandbox,
      serviceName: "orchestrator",
      threadSource: "orchestrator",
      config: useOss
        ? {
            model_provider: "oss",
            oss_provider: ossProvider,
          }
        : null,
    });

    await updateRun(run.id, {
      codexThreadId: thread.thread.id,
      model: thread.model ?? model,
      modelProvider: thread.modelProvider ?? (useOss ? "oss" : null),
      status: "running",
    });

    const warnings: string[] = [];
    if (goalMode) {
      try {
        await setThreadGoal(selectedAccountId, thread.thread.id, prompt.trim());
      } catch (error) {
        warnings.push(
          `Goal mode could not set a thread goal: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    const baseTurnText =
      mode === "plan"
        ? buildPlanPrompt(report.improvedPrompt || improvedPrompt)
        : buildRunPrompt(report.improvedPrompt || improvedPrompt, report.recommendations);
    const text = applySelectedSkillsToPrompt(baseTurnText, selectedSkills);
    const { additionalContext, skippedFiles } = await buildAdditionalContext(
      selectedAccountId,
      contextFiles,
    );
    if (skippedFiles.length > 0) {
      warnings.push(
        `Skipped context file${skippedFiles.length === 1 ? "" : "s"}: ${skippedFiles.join(", ")}`,
      );
    }

    const turn = await codexRpc<{ turn: { id: string } }>(
      selectedAccountId,
      "turn/start",
      {
      threadId: thread.thread.id,
      input: [{ type: "text", text, text_elements: [] }],
      additionalContext,
      cwd: selectedWorkspace.path,
      approvalPolicy: access.approvalPolicy,
      approvalsReviewer: "user",
      model,
      effort,
      },
    );

    await updateRun(run.id, {
      codexTurnId: turn.turn.id,
      status: "running",
    });
    await updateTaskStatus(task.id, "running");
    await refreshWorkspaceData(selectedWorkspace.id);
    const runStartedMessage = mode === "plan" ? "Plan mode turn started." : "Codex run started.";
    setStatusMessage(
      warnings.length > 0 ? `${runStartedMessage} ${warnings.join(" ")}` : runStartedMessage,
    );
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
      if (selectedWorkspaceRef.current) {
        await refreshWorkspaceData(selectedWorkspaceRef.current.id);
        await refreshWorkspaceGitStatus(selectedWorkspaceRef.current);
      }
      currentRunId.current = null;
      currentTaskId.current = null;
      currentRunAccountId.current = null;
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
  ) {
    const requestId = previewRequestId.current + 1;
    previewRequestId.current = requestId;
    const gitStatus = gitStatusByRelativePath.get(file.relativePath) ?? null;
    const mode = gitStatus?.statusKind === "deleted" || file.gitGhost ? "diff" : "preview";
    const cacheKey = workspaceCacheKey(workspace.path, file.path);
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

  function startWorkspaceFileDrag(
    event: DragEvent<HTMLButtonElement>,
    file: WorkspaceTreeEntry,
  ) {
    const payload: ComposerContextFile[] = [
      {
        path: file.path,
        name: file.name,
        source: "explorer",
        status: "ready",
      },
    ];
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData(
      ORCHESTRATOR_CONTEXT_FILE_MIME,
      JSON.stringify(payload),
    );
    event.dataTransfer.setData("text/plain", file.path);
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

  function workspaceDirectoryEntries(
    workspace: Workspace,
    directoryPath: string,
    entries: WorkspaceTreeEntry[],
  ) {
    if (selectedWorkspace?.id !== workspace.id) {
      return entries;
    }

    const visibleEntries = entries.filter(
      (entry) =>
        gitStatusByRelativePath.get(entry.relativePath)?.statusKind !== "deleted",
    );
    const byRelativePath = new Map(
      visibleEntries.map((entry) => [entry.relativePath, entry]),
    );
    const merged = [...visibleEntries];
    const directoryRelativePath = relativeDirectoryPath(workspace, directoryPath);

    selectedGitStatusState?.snapshot?.files.forEach((file) => {
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
    if (selectedWorkspace?.id !== workspace.id) {
      return null;
    }

    return gitStatusByRelativePath.get(entry.relativePath) ?? null;
  }

  function workspaceDirectoryHasChanges(workspace: Workspace, entry: WorkspaceTreeEntry) {
    if (selectedWorkspace?.id !== workspace.id) {
      return false;
    }

    return entry.kind === "directory" && dirtyDirectoryPaths.has(entry.relativePath);
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
          className={`workspace-tree-row ${directory ? "directory" : "file"}${gitStateClass}`}
          style={treeIndentStyle(depth)}
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
            draggable={draggable}
            onClick={() =>
              directory
                ? toggleDirectoryExpanded(workspace, entry.path, !entry.gitGhost)
                : void openWorkspaceFilePreview(workspace, entry)
            }
            onDragStart={
              !draggable
                ? undefined
                : (event) => startWorkspaceFileDrag(event, entry)
            }
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
                const workspaceDirty =
                  selected && dirtyDirectoryPaths.has("");

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

        <div className={`codex-card account-card auth-${authRow.tone}`}>
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
              gitState={selectedGitStatusState}
              gitSummary={selectedGitSummary}
            />
            <section
              className={`task-hero ${hasTaskChat ? "has-chat" : ""}`}
              aria-label="Task launch"
            >
              {hasTaskChat ? (
                <TaskChatTranscript
                  entries={selectedWorkspaceChatEntries}
                  onResolveRequest={handleResolveRequest}
                />
              ) : (
                <h1>{taskQuote}</h1>
              )}
              <TaskComposer
                disabled={!canRun}
                prompt={prompt}
                routeRecommendation={preflight?.routeRecommendation ?? routeRecommendation}
                tokenEstimate={preflight?.tokenEstimate ?? tokenEstimate}
                accounts={signedInAccounts}
                selectedAccountId={selectedAccountId}
                accountSelectionDisabled={runIsActive}
                branches={branches}
                selectedBranch={selectedBranch}
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
                onBranchChange={(branch) => void selectBranch(branch)}
                onPromptChange={(nextPrompt) => {
                  setPrompt(nextPrompt);
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
                onRemoveFile={(path) =>
                  setContextFiles((current) => current.filter((file) => file.path !== path))
                }
                onRemoveSkill={(skillId) =>
                  setSelectedSkills((current) =>
                    current.filter((skill) => skill.id !== skillId),
                  )
                }
                onPreflight={() => void handlePreflight()}
                onRun={() => void launchRun()}
              />
            </section>
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
    </main>
  );
}

function WorkspaceContextBanner({
  workspace,
  branch,
  gitState,
  gitSummary,
}: {
  workspace: Workspace | null;
  branch: string | null;
  gitState: WorkspaceGitStatusState | null;
  gitSummary: WorkspaceGitSummary;
}) {
  if (!workspace) {
    return (
      <section className="workspace-context-banner empty" aria-label="Selected folder">
        <div className="workspace-context-main">
          <span className="workspace-context-icon" aria-hidden="true">
            <Folder size={17} />
          </span>
          <div>
            <strong>No folder selected</strong>
            <span>Add or choose a workspace to start a task.</span>
          </div>
        </div>
      </section>
    );
  }

  const gitLoading = gitState?.status === "loading" || gitState?.status === "idle";
  const gitError = gitState?.status === "error";
  const gitClean = !gitLoading && !gitError && gitSummary.total === 0;

  return (
    <section className="workspace-context-banner" aria-label="Selected folder">
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
        <span className="workspace-context-chip branch">
          <GitBranch size={14} aria-hidden="true" />
          {branch ?? "No branch"}
        </span>
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
          <>
            <span className="workspace-context-chip changed">
              {gitSummary.total} changed
            </span>
            <WorkspaceContextGitBadge
              label="M"
              count={gitSummary.modified}
              title="Modified files"
            />
            <WorkspaceContextGitBadge
              label="A/R/C"
              count={gitSummary.added}
              title="Added, renamed, or copied files"
            />
            <WorkspaceContextGitBadge
              label="D"
              count={gitSummary.deleted}
              title="Deleted files"
            />
            <WorkspaceContextGitBadge
              label="?"
              count={gitSummary.untracked}
              title="Untracked files"
            />
            <WorkspaceContextGitBadge
              label="U"
              count={gitSummary.conflicted}
              title="Conflicted files"
            />
          </>
        ) : null}
      </div>
    </section>
  );
}

function WorkspaceContextGitBadge({
  label,
  count,
  title,
}: {
  label: string;
  count: number;
  title: string;
}) {
  if (count === 0) {
    return null;
  }

  return (
    <span className="workspace-context-chip git-count" title={title}>
      <span>{label}</span>
      {count}
    </span>
  );
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

function joinWorkspacePath(workspacePath: string, relativePath: string) {
  return `${normalizeWorkspacePath(workspacePath)}/${relativePath.replace(/^\/+/, "")}`;
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
