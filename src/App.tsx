import { open } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import { listen } from "@tauri-apps/api/event";
import {
  BarChart3,
  Bot,
  FolderPlus,
  History,
  LogIn,
  Plug,
  Power,
  RefreshCw,
  Settings,
  TerminalSquare,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import orchestratorMark from "./assets/brand/orchestrator-mark.png";
import orchestratorWordmark from "./assets/brand/orchestrator-wordmark.png";
import {
  appendRunEvent,
  createRun,
  createTask,
  getAnalyticsSummary,
  listWorkspaceRuns,
  listWorkspaces,
  recordTokenUsage,
  savePreflightReport,
  updateRun,
  updateTaskStatus,
  upsertWorkspace,
} from "./db";
import {
  codexRpc,
  connectCodex,
  checkoutGitBranch,
  getAuthStatus,
  listGitBranches,
  listCodexModels,
  readCodexFile,
  resolveCodexServerRequest,
  runPreflight,
  setThreadGoal,
  startLogin,
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
  buildPlanPrompt,
  buildRunPrompt,
  estimateTokens,
  improvePrompt,
  recommendRoute,
} from "./lib/taskAnalysis";
import type {
  AccessLevel,
  AdditionalContextEntry,
  AnalyticsSummary as AnalyticsSummaryType,
  CodexMessage,
  CodexModel,
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
  const [runs, setRuns] = useState<RunListItem[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsSummaryType>(DEFAULT_ANALYTICS);
  const [activeView, setActiveView] = useState<AppView>("task");
  const [prompt, setPrompt] = useState("");
  const [preflight, setPreflight] = useState<PreflightReport | null>(null);
  const [runView, setRunView] = useState<RunViewState>(emptyRunView);
  const [statusMessage, setStatusMessage] = useState("Choose a workspace to begin.");
  const [codexConnected, setCodexConnected] = useState(false);
  const [authMessage, setAuthMessage] = useState("Auth not checked");
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
  const eventSequence = useRef(0);

  const improvedPrompt = useMemo(() => improvePrompt(prompt), [prompt]);
  const routeRecommendation = useMemo(() => recommendRoute(prompt), [prompt]);
  const tokenEstimate = useMemo(() => estimateTokens(prompt), [prompt]);
  const taskQuote = useMemo(
    () => TASK_QUOTES[Math.floor(Math.random() * TASK_QUOTES.length)],
    [],
  );
  const selectedWorkspaceName = selectedWorkspace?.label ?? "Choose a repository";
  const selectedWorkspacePath = selectedWorkspace?.path ?? "No workspace selected";
  const canRun = Boolean(selectedWorkspace && prompt.trim());

  useEffect(() => {
    void refreshWorkspaces();
  }, []);

  useEffect(() => {
    if (!selectedWorkspace) {
      return;
    }

    void refreshWorkspaceData(selectedWorkspace.id);
    void refreshBranches(selectedWorkspace);
  }, [selectedWorkspace]);

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

    void listen<CodexMessage>("codex:notification", (event) => {
      void handleCodexNotification(event.payload);
    }).then((unlisten) => {
      if (disposed) unlisten();
      else notificationUnlisten = unlisten;
    });

    void listen<CodexMessage>("codex:server-request", (event) => {
      void handleCodexServerRequest(event.payload);
    }).then((unlisten) => {
      if (disposed) unlisten();
      else requestUnlisten = unlisten;
    });

    void listen<{ status: string; message: string }>("codex:process", (event) => {
      setStatusMessage(event.payload.message);
      void persistRunEvent("process", event.payload.status, event.payload);
      if (event.payload.status === "exited" || event.payload.status === "stopped") {
        setCodexConnected(false);
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
    let disposed = false;

    void ensureCodexConnected().catch((error) => {
      if (disposed) {
        return;
      }

      const message = error instanceof Error ? error.message : String(error);
      setModelLoadError(message);
      setAuthMessage("Codex unavailable");
      setStatusMessage(`Codex connection failed: ${message}`);
    });

    return () => {
      disposed = true;
    };
  }, []);

  async function refreshWorkspaces() {
    const rows = await listWorkspaces();
    setWorkspaces(rows);
    setSelectedWorkspace((current) => current ?? rows[0] ?? null);
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

  async function refreshCodexModels() {
    try {
      const visibleModels = await listCodexModels();
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

  async function ensureCodexConnected() {
    if (codexConnected) {
      if (models.length === 0 || modelLoadError) {
        await refreshCodexModels();
      }
      return;
    }

    setRunView((current) => ({ ...current, status: "connecting" }));
    const connection = await connectCodex();
    setCodexConnected(true);
    setStatusMessage(
      connection.alreadyConnected
        ? "Codex app-server already connected."
        : `Codex app-server connected${connection.pid ? ` as ${connection.pid}` : ""}.`,
    );

    try {
      const auth = await getAuthStatus();
      setAuthMessage(
        auth.authMethod
          ? `Signed in with ${auth.authMethod}`
          : "Codex requires authentication",
      );
    } catch (error) {
      setAuthMessage(error instanceof Error ? error.message : String(error));
    }

    await refreshCodexModels();
  }

  async function handleLogin() {
    await ensureCodexConnected();
    const response = await startLogin();

    if (response.type === "chatgpt") {
      await openUrl(response.authUrl);
      setAuthMessage("Opened Codex login in your browser.");
    } else if (response.type === "chatgptDeviceCode") {
      await openUrl(response.verificationUrl);
      setAuthMessage(`Enter code ${response.userCode} in the browser.`);
    } else {
      setAuthMessage(`Login flow started: ${response.type}`);
    }
  }

  async function handleStopCodex() {
    await stopCodex();
    setCodexConnected(false);
    setRunView((current) => ({ ...current, status: "interrupted" }));
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

    const report = preflight ?? (await handlePreflight());
    if (!report) {
      return;
    }

    await ensureCodexConnected();
    if (!(await ensureSelectedBranch())) {
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
      status: "starting",
      sandbox: access.sandbox,
      approvalPolicy: access.approvalPolicy,
      model,
      modelProvider: useOss ? "oss" : null,
    });
    currentRunId.current = run.id;
    eventSequence.current = 0;
    setRunView({ ...emptyRunView, status: "running" });

    const thread = await codexRpc<{
      thread: { id: string };
      model?: string;
      modelProvider?: string;
      serviceTier?: string | null;
    }>("thread/start", {
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
        await setThreadGoal(thread.thread.id, prompt.trim());
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
    const { additionalContext, skippedFiles } = await buildAdditionalContext(contextFiles);
    if (skippedFiles.length > 0) {
      warnings.push(
        `Skipped context file${skippedFiles.length === 1 ? "" : "s"}: ${skippedFiles.join(", ")}`,
      );
    }

    const turn = await codexRpc<{ turn: { id: string } }>("turn/start", {
      threadId: thread.thread.id,
      input: [{ type: "text", text, text_elements: [] }],
      additionalContext,
      cwd: selectedWorkspace.path,
      approvalPolicy: access.approvalPolicy,
      approvalsReviewer: "user",
      model,
      effort,
    });

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

  async function buildAdditionalContext(files: ComposerContextFile[]) {
    const additionalContext: Record<string, AdditionalContextEntry> = {};
    const errors = new Map<string, string>();
    const skippedFiles: string[] = [];

    for (const file of files) {
      try {
        const content = await readCodexFile(file.path);
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

  async function handleCodexNotification(message: CodexMessage) {
    setRunView((current) => applyCodexMessage(current, message));
    await persistRunEvent("notification", message.method ?? null, message);

    const runId = currentRunId.current;
    if (!runId) {
      return;
    }

    const params = (message.params ?? {}) as Record<string, unknown>;

    if (message.method === "thread/tokenUsage/updated") {
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

    if (message.method === "turn/completed") {
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
      if (selectedWorkspace) {
        await refreshWorkspaceData(selectedWorkspace.id);
      }
    }
  }

  async function handleCodexServerRequest(request: CodexMessage) {
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

    await resolveCodexServerRequest(request.id, approvalResult(request, approved));
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

        <div className="codex-card">
          <div>
            <Bot size={17} />
            <div>
              <strong>Codex</strong>
              <span>{codexConnected ? "Connected" : "Disconnected"}</span>
            </div>
          </div>
          <div className="codex-actions">
            <button className="icon-button" type="button" onClick={ensureCodexConnected} title="Connect Codex">
              <Plug size={17} />
            </button>
            <button className="icon-button" type="button" onClick={handleLogin} title="Log in">
              <LogIn size={17} />
            </button>
            <button className="icon-button danger" type="button" onClick={handleStopCodex} title="Stop Codex">
              <Power size={17} />
            </button>
          </div>
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
                      <span>{run.model_provider ?? "openai"}</span>
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
                <div className="setting-row">
                  <div>
                    <strong>Authentication</strong>
                    <span>{authMessage}</span>
                  </div>
                  <button className="secondary" type="button" onClick={handleLogin}>
                    <LogIn size={16} />
                    Log in
                  </button>
                </div>
                <div className="setting-row">
                  <div>
                    <strong>App server</strong>
                    <span>Spawn and manage `codex app-server --listen stdio://`.</span>
                  </div>
                  <div className="button-row compact">
                    <button className="secondary" type="button" onClick={ensureCodexConnected}>
                      <Plug size={16} />
                      Connect
                    </button>
                    <button className="danger" type="button" onClick={handleStopCodex}>
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
