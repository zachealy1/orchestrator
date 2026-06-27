import { open } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import { listen } from "@tauri-apps/api/event";
import {
  BarChart3,
  Check,
  ChevronDown,
  FolderPlus,
  History,
  LogIn,
  LogOut,
  Plug,
  Power,
  RefreshCw,
  Settings,
  TerminalSquare,
  Trash2,
  UserPlus,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import orchestratorMark from "./assets/brand/orchestrator-mark.png";
import orchestratorWordmark from "./assets/brand/orchestrator-wordmark.png";
import {
  appendRunEvent,
  createCodexAccount,
  createRun,
  createTask,
  getAnalyticsSummary,
  listCodexAccounts,
  listWorkspaceRuns,
  listWorkspaces,
  recordTokenUsage,
  renameCodexAccount,
  savePreflightReport,
  setWorkspaceDefaultAccount,
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
  logoutCodexAccount,
  readCodexFile,
  readCodexAccount,
  resolveCodexServerRequest,
  runPreflight,
  setThreadGoal,
  startCodexLogin,
  stopCodex,
} from "./codexClient";
import { AnalyticsSummary } from "./components/AnalyticsSummary";
import { RunConsole } from "./components/RunConsole";
import { TaskComposer } from "./components/TaskComposer";
import {
  addServerRequest,
  applyCodexMessage,
  emptyRunView,
  resolveServerRequest,
  type RunViewState,
} from "./lib/codexEventReducer";
import {
  formatCodexAuthMessage,
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
  CodexProcessEvent,
  ComposerContextFile,
  OssProvider,
  PreflightReport,
  RunListItem,
  Workspace,
} from "./types";

const DEFAULT_ANALYTICS: AnalyticsSummaryType = {
  run_count: 0,
  completed_count: 0,
  failed_count: 0,
  total_tokens: 0,
  cached_tokens: 0,
  avg_duration_ms: null,
};

type AppView = "task" | "runs" | "analytics" | "settings";

type AuthRowState = {
  title: string;
  subtitle: string;
  avatarLabel: string;
  tone: "default" | "waiting" | "failed" | "signed-in";
};

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
  const [codexAccounts, setCodexAccounts] = useState<CodexAccountProfile[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null);
  const [connectedAccountIds, setConnectedAccountIds] = useState<Set<number>>(
    () => new Set(),
  );
  const [runs, setRuns] = useState<RunListItem[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsSummaryType>(DEFAULT_ANALYTICS);
  const [activeView, setActiveView] = useState<AppView>("task");
  const [prompt, setPrompt] = useState("");
  const [preflight, setPreflight] = useState<PreflightReport | null>(null);
  const [runView, setRunView] = useState<RunViewState>(emptyRunView);
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
  const [branches, setBranches] = useState<string[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<string | null>(null);

  const currentRunId = useRef<number | null>(null);
  const currentTaskId = useRef<number | null>(null);
  const currentRunAccountId = useRef<number | null>(null);
  const eventSequence = useRef(0);
  const selectedWorkspaceRef = useRef<Workspace | null>(null);
  const codexAccountsRef = useRef<CodexAccountProfile[]>([]);
  const selectedAccountIdRef = useRef<number | null>(null);
  const connectedAccountIdsRef = useRef<Set<number>>(new Set());
  const pendingLoginIdRef = useRef<string | null>(null);
  const pendingLoginAccountIdRef = useRef<number | null>(null);
  const modelsRef = useRef<CodexModel[]>([]);
  const modelLoadErrorRef = useRef<string | null>(null);

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

  useEffect(() => {
    void bootstrap();
  }, []);

  useEffect(() => {
    if (!selectedWorkspace) {
      return;
    }

    void refreshWorkspaceData(selectedWorkspace.id);
    void refreshBranches(selectedWorkspace);
  }, [selectedWorkspace]);

  useEffect(() => {
    selectedWorkspaceRef.current = selectedWorkspace;
  }, [selectedWorkspace]);

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
      } catch {
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
    const [runRows, summary] = await Promise.all([
      listWorkspaceRuns(workspaceId),
      getAnalyticsSummary(workspaceId),
    ]);
    setRuns(runRows);
    setAnalytics(summary);
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

  async function refreshAccountState(accountId: number, refreshToken = true) {
    try {
      const response = await readCodexAccount(accountId, { refreshToken });
      const chatgptAccount =
        response.account?.type === "chatgpt" ? response.account : null;
      const existing = codexAccountsRef.current.find(
        (account) => account.id === accountId,
      );
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
    setStatusMessage(`Selected ${workspace.label}`);
  }

  function selectWorkspace(workspaceId: number) {
    const workspace = workspaces.find((candidate) => candidate.id === workspaceId);
    if (!workspace) {
      return;
    }

    setSelectedWorkspace(workspace);
    setPreflight(null);
    setStatusMessage(`Selected ${workspace.label}`);
    if (
      workspace.default_account_id &&
      workspace.default_account_id !== selectedAccountIdRef.current
    ) {
      void selectCodexAccount(workspace.default_account_id);
    }
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
      setStatusMessage(`Working on ${selectedWorkspace.label} at ${branch}.`);
    } catch (error) {
      await refreshBranches(selectedWorkspace);
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

  async function handleStopCodex() {
    const accountId = selectedAccountIdRef.current;
    if (!accountId || runIsActive) {
      return;
    }
    await stopCodex(accountId);
    setConnectedAccountIds((current) => {
      const next = new Set(current);
      next.delete(accountId);
      connectedAccountIdsRef.current = next;
      return next;
    });
    setCodexAccount(null);
    setRequiresOpenaiAuth(true);
    setLoginError(null);
    setAccountMenuOpen(false);
    resetLoginFlow();
    setRunView((current) => ({ ...current, status: "interrupted" }));
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

  async function handleSetWorkspaceDefault() {
    if (!selectedWorkspace || !selectedAccountId) {
      return;
    }
    await setWorkspaceDefaultAccount(selectedWorkspace.id, selectedAccountId);
    const updated = {
      ...selectedWorkspace,
      default_account_id: selectedAccountId,
    };
    setSelectedWorkspace(updated);
    setWorkspaces((current) =>
      current.map((workspace) =>
        workspace.id === updated.id ? updated : workspace,
      ),
    );
    setStatusMessage(`${selectedAccount?.label ?? "Account"} is now the workspace default.`);
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
    setRunView({ ...emptyRunView, status: "running" });

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

    const text =
      mode === "plan"
        ? buildPlanPrompt(report.improvedPrompt || improvedPrompt)
        : buildRunPrompt(report.improvedPrompt || improvedPrompt, report.recommendations);
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
      await refreshAccountState(accountId, true);
      if (selectedAccountIdRef.current === accountId) {
        await refreshCodexModels(accountId);
      }
      setStatusMessage("Codex sign-in completed.");
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

    setRunView((current) => applyCodexMessage(current, message));
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
        durationMs: readNumber(turn.durationMs),
        error: status === "failed" ? JSON.stringify(turn.error ?? "Turn failed") : null,
      });
      if (currentTaskId.current) {
        await updateTaskStatus(currentTaskId.current, status);
      }
      if (selectedWorkspaceRef.current) {
        await refreshWorkspaceData(selectedWorkspaceRef.current.id);
      }
      currentRunId.current = null;
      currentTaskId.current = null;
      currentRunAccountId.current = null;
    }
  }

  async function handleCodexServerRequest(
    accountId: number,
    request: CodexMessage,
  ) {
    if (currentRunAccountId.current !== accountId) {
      return;
    }
    setRunView((current) => addServerRequest(current, request));
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
    setRunView((current) => resolveServerRequest(current, request.id!));
  }

  return (
    <main className="app-shell">
      <aside className="app-rail">
        <div className="brand-lockup">
          <img src={orchestratorMark} alt="" />
          <div>
            <strong>Orchestrator</strong>
          </div>
        </div>

        <nav className="primary-nav" aria-label="Primary">
          <button
            className={activeView === "task" ? "active" : ""}
            type="button"
            onClick={() => setActiveView("task")}
          >
            <TerminalSquare size={17} />
            <span>Task</span>
          </button>
          <button
            className={activeView === "runs" ? "active" : ""}
            type="button"
            onClick={() => setActiveView("runs")}
          >
            <History size={17} />
            <span>Runs</span>
          </button>
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
            <span>Workspaces</span>
            <button className="icon-button" type="button" onClick={chooseWorkspace} title="Add workspace">
              <FolderPlus size={16} />
            </button>
          </div>

          <nav className="workspace-list" aria-label="Workspaces">
            {workspaces.length === 0 ? (
              <p className="muted">No workspaces yet.</p>
            ) : (
              workspaces.map((workspace) => (
                <button
                  className={workspace.id === selectedWorkspace?.id ? "active" : ""}
                  key={workspace.id}
                  type="button"
                  onClick={() => selectWorkspace(workspace.id)}
                >
                  <strong>{workspace.label}</strong>
                  <span>{workspace.path}</span>
                </button>
              ))
            )}
          </nav>
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
                      <span className="account-menu-label">Switch account</span>
                      <div className="account-switcher-list" aria-label="Codex accounts">
                        {codexAccounts.map((account) => (
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
                              <small>
                                {account.status === "signed_in"
                                  ? account.plan_type ?? "Signed in"
                                  : "Signed out"}
                              </small>
                            </span>
                            {account.id === selectedAccountId ? <Check size={15} /> : null}
                          </button>
                        ))}
                      </div>
                    </div>
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
                    <button
                      className="account-menu-action account-menu-action-danger"
                      type="button"
                      onClick={handleStopCodex}
                      aria-label="Stop Codex"
                      disabled={runIsActive}
                    >
                      <Power size={16} />
                      Stop Codex
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
                <button className="icon-button" type="button" onClick={() => selectedWorkspace && refreshWorkspaceData(selectedWorkspace.id)} title="Refresh">
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
            <section className="task-hero" aria-label="Task launch">
              <h1>{taskQuote}</h1>
              <TaskComposer
                disabled={!canRun}
                prompt={prompt}
                routeRecommendation={preflight?.routeRecommendation ?? routeRecommendation}
                tokenEstimate={preflight?.tokenEstimate ?? tokenEstimate}
                workspaces={workspaces}
                selectedWorkspaceId={selectedWorkspace?.id ?? null}
                accounts={signedInAccounts}
                selectedAccountId={selectedAccountId}
                defaultAccountId={selectedWorkspace?.default_account_id ?? null}
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
                onWorkspaceChange={selectWorkspace}
                onAccountChange={(accountId) => void selectCodexAccount(accountId)}
                onSetDefaultAccount={() => void handleSetWorkspaceDefault()}
                onBranchChange={(branch) => void selectBranch(branch)}
                onPromptChange={(nextPrompt) => {
                  setPrompt(nextPrompt);
                  setPreflight(null);
                }}
                onModelChange={setSelectedModelId}
                onReasoningEffortChange={setSelectedReasoningEffort}
                onGoalModeChange={setGoalMode}
                onPlanModeChange={setPlanMode}
                onAccessLevelChange={setAccessLevel}
                onAddFiles={() => void chooseContextFiles()}
                onRemoveFile={(path) =>
                  setContextFiles((current) => current.filter((file) => file.path !== path))
                }
                onPreflight={() => void handlePreflight()}
                onRun={() => void launchRun()}
              />
            </section>
          </div>
        ) : null}

        {activeView === "runs" ? (
          <div className="view-stack">
            <section className="surface history run-history-view" aria-label="Run history">
              <div className="surface-header">
                <div>
                  <p className="eyebrow">History</p>
                  <h2>Run history</h2>
                </div>
                <span className="budget">{runs.length.toLocaleString()} runs</span>
              </div>
              {runs.length === 0 ? (
                <p className="muted">Runs will appear after Codex starts a task.</p>
              ) : (
                <div className="run-list">
                  {runs.map((run) => (
                    <article className="run-row" key={run.id}>
                      <div>
                        <strong>{run.original_prompt}</strong>
                        <span>
                          {run.status} · {run.route_recommendation} · {run.started_at}
                        </span>
                      </div>
                      <span>
                        {run.account_label ?? "Legacy account"} ·{" "}
                        {run.model_provider ?? "openai"}
                      </span>
                    </article>
                  ))}
                </div>
              )}
            </section>

            <RunConsole runView={runView} onResolveRequest={handleResolveRequest} />
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
                    <button
                      className="danger"
                      type="button"
                      onClick={handleStopCodex}
                      disabled={!selectedAccountId || runIsActive}
                    >
                      <Power size={16} />
                      Stop
                    </button>
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
                  <select
                    value={ossProvider}
                    onChange={(event) => setOssProvider(event.currentTarget.value as OssProvider)}
                    disabled={!useOss}
                    aria-label="Settings OSS provider"
                  >
                    <option value="ollama">Ollama</option>
                    <option value="lmstudio">LM Studio</option>
                  </select>
                </div>
              </div>
            </section>

            <section className="surface brand-panel" aria-label="About Orchestrator">
              <img src={orchestratorWordmark} alt="Orchestrator" />
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

function readString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function readNumber(value: unknown) {
  return typeof value === "number" ? value : null;
}

export default App;
