import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { ORCHESTRATOR_CONTEXT_FILE_MIME } from "./types";

const mocks = vi.hoisted(() => ({
  listeners: new Map<string, (event: { payload: unknown }) => void>(),
  openDialogMock: vi.fn(),
  openUrlMock: vi.fn(),
  connectCodexMock: vi.fn(),
  commitWorkspaceChangesMock: vi.fn(),
  pushWorkspaceBranchMock: vi.fn(),
  deleteCodexProfileMock: vi.fn(),
  readCodexAccountMock: vi.fn(),
  startCodexLoginMock: vi.fn(),
  stopCodexMock: vi.fn(),
  cancelCodexLoginMock: vi.fn(),
  logoutCodexAccountMock: vi.fn(),
  listCodexModelsMock: vi.fn(),
  listCodexSkillsMock: vi.fn(),
  listGitBranchesMock: vi.fn(),
  listWorkspaceGitStatusMock: vi.fn(),
  readWorkspaceGitDiffMock: vi.fn(),
  listWorkspaceDirectoryMock: vi.fn(),
  readWorkspaceFilePreviewMock: vi.fn(),
  checkoutGitBranchMock: vi.fn(),
  runPreflightMock: vi.fn(),
  readCodexFileMock: vi.fn(),
  setThreadGoalMock: vi.fn(),
  resolveCodexServerRequestMock: vi.fn(),
  codexRpcMock: vi.fn(),
  listWorkspacesMock: vi.fn(),
  listCodexAccountsMock: vi.fn(),
  listDuplicateProfilesPendingCleanupMock: vi.fn(),
  completeDuplicateProfileCleanupMock: vi.fn(),
  listWorkspaceRunsMock: vi.fn(),
  createCodexAccountMock: vi.fn(),
  updateCodexAccountMock: vi.fn(),
  renameCodexAccountMock: vi.fn(),
  softDeleteWorkspaceMock: vi.fn(),
  softDeleteCodexAccountMock: vi.fn(),
  getAnalyticsSummaryMock: vi.fn(),
  createTaskMock: vi.fn(),
  createRunMock: vi.fn(),
  savePreflightReportMock: vi.fn(),
  updateRunMock: vi.fn(),
  updateTaskStatusMock: vi.fn(),
  appendRunEventMock: vi.fn(),
  recordTokenUsageMock: vi.fn(),
  archiveRunMock: vi.fn(),
  unarchiveRunMock: vi.fn(),
  upsertWorkspaceMock: vi.fn(),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async (eventName: string, handler: (event: { payload: unknown }) => void) => {
    mocks.listeners.set(eventName, handler);
    return () => {
      mocks.listeners.delete(eventName);
    };
  }),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: mocks.openDialogMock,
}));

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: mocks.openUrlMock,
}));

vi.mock("./assets/brand/orchestrator-mark.png", () => ({
  default: "orchestrator-mark.png",
}));

vi.mock("./assets/brand/orchestrator-wordmark.png", () => ({
  default: "orchestrator-wordmark.png",
}));

vi.mock("./codexClient", () => ({
  cancelCodexLogin: mocks.cancelCodexLoginMock,
  codexRpc: mocks.codexRpcMock,
  commitWorkspaceChanges: mocks.commitWorkspaceChangesMock,
  connectCodex: mocks.connectCodexMock,
  checkoutGitBranch: mocks.checkoutGitBranchMock,
  deleteCodexProfile: mocks.deleteCodexProfileMock,
  listGitBranches: mocks.listGitBranchesMock,
  listWorkspaceGitStatus: mocks.listWorkspaceGitStatusMock,
  readWorkspaceGitDiff: mocks.readWorkspaceGitDiffMock,
  listCodexModels: mocks.listCodexModelsMock,
  listCodexSkills: mocks.listCodexSkillsMock,
  listWorkspaceDirectory: mocks.listWorkspaceDirectoryMock,
  logoutCodexAccount: mocks.logoutCodexAccountMock,
  pushWorkspaceBranch: mocks.pushWorkspaceBranchMock,
  readCodexAccount: mocks.readCodexAccountMock,
  readCodexFile: mocks.readCodexFileMock,
  readWorkspaceFilePreview: mocks.readWorkspaceFilePreviewMock,
  resolveCodexServerRequest: mocks.resolveCodexServerRequestMock,
  runPreflight: mocks.runPreflightMock,
  setThreadGoal: mocks.setThreadGoalMock,
  startCodexLogin: mocks.startCodexLoginMock,
  stopCodex: mocks.stopCodexMock,
}));

vi.mock("./db", () => ({
  archiveRun: mocks.archiveRunMock,
  appendRunEvent: mocks.appendRunEventMock,
  completeDuplicateProfileCleanup: mocks.completeDuplicateProfileCleanupMock,
  createCodexAccount: mocks.createCodexAccountMock,
  createRun: mocks.createRunMock,
  createTask: mocks.createTaskMock,
  getAnalyticsSummary: mocks.getAnalyticsSummaryMock,
  listCodexAccounts: mocks.listCodexAccountsMock,
  listDuplicateProfilesPendingCleanup:
    mocks.listDuplicateProfilesPendingCleanupMock,
  listWorkspaceRuns: mocks.listWorkspaceRunsMock,
  listWorkspaces: mocks.listWorkspacesMock,
  recordTokenUsage: mocks.recordTokenUsageMock,
  renameCodexAccount: mocks.renameCodexAccountMock,
  softDeleteWorkspace: mocks.softDeleteWorkspaceMock,
  savePreflightReport: mocks.savePreflightReportMock,
  softDeleteCodexAccount: mocks.softDeleteCodexAccountMock,
  updateCodexAccount: mocks.updateCodexAccountMock,
  updateRun: mocks.updateRunMock,
  updateTaskStatus: mocks.updateTaskStatusMock,
  unarchiveRun: mocks.unarchiveRunMock,
  upsertWorkspace: mocks.upsertWorkspaceMock,
}));

const workspace = {
  id: 1,
  path: "/repo/orchestrator",
  label: "orchestrator",
  default_account_id: null,
  last_opened_at: "2026-06-22T00:00:00Z",
  created_at: "2026-06-22T00:00:00Z",
};

const pendingAccount = {
  id: 7,
  label: "New Codex account",
  email: null,
  plan_type: null,
  status: "pending" as const,
  last_error: null,
  last_used_at: null,
  created_at: "2026-06-22T00:00:00Z",
  updated_at: "2026-06-22T00:00:00Z",
  deleted_at: null,
};

const signedInAccount = {
  ...pendingAccount,
  label: "dev@example.com",
  email: "dev@example.com",
  plan_type: "pro" as const,
  status: "signed_in" as const,
};

const signedInAccount2 = {
  ...signedInAccount,
  id: 8,
  label: "personal@example.com",
  email: "personal@example.com",
  plan_type: "plus" as const,
};

const analytics = {
  run_count: 0,
  completed_count: 0,
  failed_count: 0,
  total_tokens: 0,
  cached_tokens: 0,
  avg_duration_ms: null,
};

const preflight = {
  workspacePath: workspace.path,
  tokenEstimate: 42,
  contextBudget: 128000,
  routeRecommendation: "direct-run" as const,
  improvedPrompt: "Objective\n\nFix auth",
  checks: [],
  recommendations: [],
};

function workspaceRunFixture(
  overrides: Partial<{
    id: number;
    original_prompt: string;
    final_message: string | null;
    archived_at: string | null;
  }> = {},
) {
  return {
    id: overrides.id ?? 301,
    task_id: 101,
    workspace_id: workspace.id,
    account_id: 7,
    account_label: "dev@example.com",
    account_email: "dev@example.com",
    codex_thread_id: "thread-1",
    codex_turn_id: "turn-1",
    model: "GPT-5.5",
    model_provider: null,
    sandbox: "workspace-write",
    approval_policy: "on-request",
    status: "completed",
    started_at: "2026-06-30T09:00:00Z",
    completed_at: "2026-06-30T09:01:00Z",
    duration_ms: 60000,
    final_message: overrides.final_message ?? "Done.",
    error: null,
    archived_at: overrides.archived_at ?? null,
    original_prompt: overrides.original_prompt ?? "Fix the app",
    improved_prompt: "Objective\nFix the app",
    route_recommendation: "direct-run" as const,
    budget_tokens: 42,
    latest_total_tokens: 1280,
    latest_model_context_window: 128000,
  };
}

function prepareDefaults() {
  mocks.connectCodexMock.mockResolvedValue({
    alreadyConnected: false,
    pid: 1234,
    initialize: {},
  });
  mocks.commitWorkspaceChangesMock.mockResolvedValue({
    message: "Committed workspace changes",
    branch: "main",
  });
  mocks.pushWorkspaceBranchMock.mockResolvedValue({
    message: "Pushed main",
    branch: "main",
  });
  mocks.deleteCodexProfileMock.mockResolvedValue(undefined);
  mocks.readCodexAccountMock.mockResolvedValue({
    account: null,
    requiresOpenaiAuth: true,
  });
  mocks.startCodexLoginMock.mockResolvedValue({
    type: "chatgpt",
    loginId: "login-1",
    authUrl: "https://example.com/auth",
  });
  mocks.stopCodexMock.mockResolvedValue(undefined);
  mocks.cancelCodexLoginMock.mockResolvedValue(undefined);
  mocks.logoutCodexAccountMock.mockResolvedValue(undefined);
  mocks.listCodexModelsMock.mockResolvedValue([]);
  mocks.listCodexSkillsMock.mockResolvedValue([]);
  mocks.listGitBranchesMock.mockResolvedValue({
    branches: ["main"],
    currentBranch: "main",
  });
  mocks.listWorkspaceGitStatusMock.mockResolvedValue({
    workspacePath: workspace.path,
    gitRoot: workspace.path,
    currentBranch: "main",
    aheadCount: 0,
    hasUpstream: true,
    hasOrigin: true,
    canPush: false,
    files: [],
  });
  mocks.readWorkspaceGitDiffMock.mockResolvedValue({
    path: "/repo/orchestrator/README.md",
    relativePath: "README.md",
    sections: [],
  });
  mocks.listWorkspaceDirectoryMock.mockResolvedValue([]);
  mocks.readWorkspaceFilePreviewMock.mockResolvedValue({
    path: "/repo/orchestrator/README.md",
    relativePath: "README.md",
    content: "preview",
    truncated: false,
    isBinary: false,
  });
  mocks.checkoutGitBranchMock.mockResolvedValue({ branch: "main" });
  mocks.runPreflightMock.mockResolvedValue(preflight);
  mocks.readCodexFileMock.mockResolvedValue("file contents");
  mocks.setThreadGoalMock.mockResolvedValue(undefined);
  mocks.resolveCodexServerRequestMock.mockResolvedValue(undefined);
  mocks.codexRpcMock.mockResolvedValue(undefined);
  mocks.listWorkspacesMock.mockResolvedValue([workspace]);
  mocks.listCodexAccountsMock.mockResolvedValue([]);
  mocks.listDuplicateProfilesPendingCleanupMock.mockResolvedValue([]);
  mocks.completeDuplicateProfileCleanupMock.mockResolvedValue(undefined);
  mocks.listWorkspaceRunsMock.mockResolvedValue([]);
  mocks.createCodexAccountMock.mockResolvedValue(pendingAccount);
  mocks.updateCodexAccountMock.mockResolvedValue(undefined);
  mocks.renameCodexAccountMock.mockResolvedValue(undefined);
  mocks.softDeleteWorkspaceMock.mockResolvedValue(undefined);
  mocks.softDeleteCodexAccountMock.mockResolvedValue(undefined);
  mocks.getAnalyticsSummaryMock.mockResolvedValue(analytics);
  mocks.createTaskMock.mockResolvedValue({ id: 101 });
  mocks.createRunMock.mockResolvedValue({ id: 202 });
  mocks.savePreflightReportMock.mockResolvedValue(undefined);
  mocks.updateRunMock.mockResolvedValue(undefined);
  mocks.updateTaskStatusMock.mockResolvedValue(undefined);
  mocks.appendRunEventMock.mockResolvedValue(undefined);
  mocks.recordTokenUsageMock.mockResolvedValue(undefined);
  mocks.archiveRunMock.mockResolvedValue(undefined);
  mocks.unarchiveRunMock.mockResolvedValue(undefined);
  mocks.upsertWorkspaceMock.mockResolvedValue(workspace);
  mocks.openDialogMock.mockResolvedValue(null);
}

async function renderApp() {
  const user = userEvent.setup();
  render(<App />);
  await waitFor(() => expect(mocks.listCodexAccountsMock).toHaveBeenCalled());
  return { user };
}

function createContextFileDataTransfer(files: unknown[]) {
  let dropEffect = "none";

  return {
    types: [ORCHESTRATOR_CONTEXT_FILE_MIME],
    effectAllowed: "copy",
    get dropEffect() {
      return dropEffect;
    },
    set dropEffect(value: string) {
      dropEffect = value;
    },
    getData: (type: string) =>
      type === ORCHESTRATOR_CONTEXT_FILE_MIME ? JSON.stringify(files) : "",
    setData: vi.fn(),
  };
}

function mockElementRect(element: Element, rect: Partial<DOMRect> = {}) {
  vi.spyOn(element, "getBoundingClientRect").mockReturnValue({
    bottom: 900,
    height: 900,
    left: 0,
    right: 1600,
    top: 0,
    width: 1600,
    x: 0,
    y: 0,
    toJSON: () => ({}),
    ...rect,
  } as DOMRect);
}

function startPointerDragFileIntoTaskSurface(
  fileButton: HTMLElement,
  pointerId = 1,
) {
  fireEvent.pointerDown(fileButton, {
    button: 0,
    buttons: 1,
    clientX: 40,
    clientY: 40,
    pointerId,
  });
  fireEvent.pointerMove(fileButton, {
    buttons: 1,
    clientX: 520,
    clientY: 360,
    pointerId,
  });
}

function finishPointerDragFileIntoTaskSurface(
  fileButton: HTMLElement,
  pointerId = 1,
) {
  fireEvent.pointerUp(fileButton, {
    button: 0,
    buttons: 0,
    clientX: 520,
    clientY: 360,
    pointerId,
  });
}

function pointerDragFileIntoTaskSurface(fileButton: HTMLElement) {
  startPointerDragFileIntoTaskSurface(fileButton);
  finishPointerDragFileIntoTaskSurface(fileButton);
}

function pointerTapFile(fileButton: HTMLElement) {
  fireEvent.pointerDown(fileButton, {
    button: 0,
    buttons: 1,
    clientX: 40,
    clientY: 40,
    pointerId: 2,
  });
  fireEvent.pointerUp(fileButton, {
    button: 0,
    buttons: 0,
    clientX: 41,
    clientY: 41,
    pointerId: 2,
  });
}

function holdNextAnimationFrames() {
  const callbacks = new Map<number, FrameRequestCallback>();
  let nextId = 1;
  const requestAnimationFrameSpy = vi
    .spyOn(window, "requestAnimationFrame")
    .mockImplementation((callback) => {
      const id = nextId;
      nextId += 1;
      callbacks.set(id, callback);
      return id;
    });
  const cancelAnimationFrameSpy = vi
    .spyOn(window, "cancelAnimationFrame")
    .mockImplementation((id) => {
      callbacks.delete(id);
    });

  return {
    async flush() {
      const pendingCallbacks = Array.from(callbacks.values());
      callbacks.clear();
      pendingCallbacks.forEach((callback) => callback(performance.now()));
      await act(async () => {
        await new Promise((resolve) => window.setTimeout(resolve, 0));
      });
    },
    restore() {
      requestAnimationFrameSpy.mockRestore();
      cancelAnimationFrameSpy.mockRestore();
    },
  };
}

function prepareSignedInRun() {
  mocks.listCodexAccountsMock.mockResolvedValue([signedInAccount]);
  mocks.readCodexAccountMock.mockResolvedValue({
    account: {
      type: "chatgpt",
      email: signedInAccount.email,
      planType: signedInAccount.plan_type,
    },
    requiresOpenaiAuth: true,
  });
  mocks.codexRpcMock.mockImplementation(
    async (_accountId: number, method: string) => {
      if (method === "thread/start") {
        return { thread: { id: "thread-1" } };
      }
      if (method === "turn/start") {
        return { turn: { id: "turn-1" } };
      }
      return {};
    },
  );
}

async function startMockRun(user: ReturnType<typeof userEvent.setup>, prompt: string) {
  await user.type(screen.getByLabelText("Prompt"), prompt);
  await user.click(screen.getByRole("button", { name: /run codex/i }));
  await waitFor(() =>
    expect(mocks.codexRpcMock).toHaveBeenCalledWith(
      7,
      "turn/start",
      expect.any(Object),
    ),
  );
}

async function emitCodexNotification(message: unknown) {
  await act(async () => {
    mocks.listeners.get("codex:notification")?.({
      payload: { accountId: 7, message },
    });
    await Promise.resolve();
  });
}

async function emitCodexServerRequest(message: unknown) {
  await act(async () => {
    mocks.listeners.get("codex:server-request")?.({
      payload: { accountId: 7, message },
    });
    await Promise.resolve();
  });
}

function setWindowWidth(width: number) {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    writable: true,
    value: width,
  });
  window.dispatchEvent(new Event("resize"));
}

describe("App Codex auth", () => {
  beforeEach(() => {
    mocks.listeners.clear();
    vi.clearAllMocks();
    vi.useRealTimers();
    localStorage.clear();
    setWindowWidth(1024);
    document.documentElement.removeAttribute("data-theme");
    prepareDefaults();
  });

  it("shows only sign in when the account is disconnected", async () => {
    mocks.connectCodexMock.mockRejectedValue(new Error("codex app-server missing"));

    const { user } = await renderApp();

    const signIn = await screen.findByLabelText("Sign in to Codex");
    expect(signIn).toHaveTextContent("Sign in to Codex");
    expect(signIn.querySelector(".account-avatar")).not.toBeInTheDocument();
    expect(signIn).not.toHaveAttribute("aria-expanded");
    expect(screen.queryByLabelText("Codex account")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Connect Codex")).not.toBeInTheDocument();
    expect(screen.queryByText("Refresh")).not.toBeInTheDocument();

    await user.click(signIn);
    await waitFor(() => expect(mocks.connectCodexMock).toHaveBeenCalledWith(7));
  });

  it("lists workspaces without paths and opens the picker from the sidebar", async () => {
    const secondWorkspace = {
      ...workspace,
      id: 2,
      path: "/repo/mobile-client",
      label: "mobile-client",
      default_account_id: null,
    };
    mocks.listWorkspacesMock.mockResolvedValue([workspace, secondWorkspace]);
    mocks.openDialogMock.mockResolvedValue("/repo/new-workspace");

    const { user } = await renderApp();
    const primaryNav = screen.getByRole("navigation", {
      name: "Primary",
    });
    expect(
      within(primaryNav).queryByRole("button", { name: "Task" }),
    ).not.toBeInTheDocument();
    expect(
      within(primaryNav).queryByRole("button", { name: "Runs" }),
    ).not.toBeInTheDocument();
    const workspaceNav = screen.getByRole("navigation", {
      name: "Workspaces",
    });
    expect(
      within(workspaceNav).getByRole("button", { name: "orchestrator" }),
    ).toBeInTheDocument();
    const secondWorkspaceButton = within(workspaceNav).getByRole("button", {
      name: "mobile-client",
    });
    expect(secondWorkspaceButton).toBeInTheDocument();
    expect(within(workspaceNav).queryByText(workspace.path)).not.toBeInTheDocument();
    expect(
      within(workspaceNav).queryByText(secondWorkspace.path),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("combobox", { name: "Folder" }),
    ).not.toBeInTheDocument();
    const workspacesHeading = screen.getByText("Workspaces");
    const addWorkspaceButton = screen.getByRole("button", {
      name: "Add workspace",
    });
    expect(workspacesHeading.parentElement).toContainElement(addWorkspaceButton);
    expect(addWorkspaceButton).not.toHaveTextContent("Add workspace");

    await user.click(within(primaryNav).getByRole("button", { name: "Analytics" }));
    expect(screen.queryByLabelText("Task composer")).not.toBeInTheDocument();
    expect(
      within(workspaceNav).getByRole("button", { name: "orchestrator" }),
    ).not.toHaveAttribute("aria-current");
    expect(screen.queryByLabelText("Run history")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Codex run console")).not.toBeInTheDocument();

    await user.click(secondWorkspaceButton);
    expect(secondWorkspaceButton).toHaveAttribute("aria-current", "page");
    expect(screen.getByLabelText("Task composer")).toBeInTheDocument();
    expect(mocks.listWorkspaceDirectoryMock).not.toHaveBeenCalled();

    await user.click(addWorkspaceButton);

    await waitFor(() =>
      expect(mocks.openDialogMock).toHaveBeenCalledWith({
        directory: true,
        multiple: false,
        title: "Choose a repository workspace",
      }),
    );
    expect(mocks.upsertWorkspaceMock).toHaveBeenCalledWith(
      "/repo/new-workspace",
    );
  });

  it("opens a workspace context menu and cancels workspace removal", async () => {
    const { user } = await renderApp();
    const workspaceNav = screen.getByRole("navigation", {
      name: "Workspaces",
    });
    const workspaceButton = within(workspaceNav).getByRole("button", {
      name: "orchestrator",
    });

    fireEvent.contextMenu(workspaceButton, { clientX: 60, clientY: 140 });

    const menu = screen.getByRole("menu", {
      name: "orchestrator workspace actions",
    });
    expect(menu).toBeInTheDocument();
    await user.click(
      within(menu).getByRole("menuitem", {
        name: "Remove from Orchestrator",
      }),
    );

    const dialog = screen.getByRole("dialog", { name: "Remove workspace?" });
    expect(
      within(dialog).getByText(/The folder on disk will not be deleted/i),
    ).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));

    expect(mocks.softDeleteWorkspaceMock).not.toHaveBeenCalled();
    expect(
      within(workspaceNav).getByRole("button", { name: "orchestrator" }),
    ).toBeInTheDocument();
  });

  it("soft-deletes the selected workspace and falls back to the next workspace", async () => {
    const secondWorkspace = {
      ...workspace,
      id: 2,
      path: "/repo/mobile-client",
      label: "mobile-client",
      default_account_id: null,
    };
    mocks.listWorkspacesMock.mockResolvedValue([workspace, secondWorkspace]);

    const { user } = await renderApp();
    const workspaceNav = screen.getByRole("navigation", {
      name: "Workspaces",
    });

    fireEvent.contextMenu(
      within(workspaceNav).getByRole("button", { name: "orchestrator" }),
      { clientX: 60, clientY: 140 },
    );
    await user.click(
      screen.getByRole("menuitem", { name: "Remove from Orchestrator" }),
    );
    await user.click(
      within(screen.getByRole("dialog", { name: "Remove workspace?" })).getByRole(
        "button",
        { name: "Remove" },
      ),
    );

    await waitFor(() => expect(mocks.softDeleteWorkspaceMock).toHaveBeenCalledWith(1));
    expect(
      within(workspaceNav).queryByRole("button", { name: "orchestrator" }),
    ).not.toBeInTheDocument();
    const fallbackWorkspace = within(workspaceNav).getByRole("button", {
      name: "mobile-client",
    });
    expect(fallbackWorkspace).toHaveAttribute("aria-current", "page");
    expect(screen.getByLabelText("Selected folder")).toHaveTextContent("mobile-client");
  });

  it("opens and closes the workspace context menu from the keyboard", async () => {
    const { user } = await renderApp();
    const workspaceNav = screen.getByRole("navigation", {
      name: "Workspaces",
    });
    const workspaceButton = within(workspaceNav).getByRole("button", {
      name: "orchestrator",
    });

    workspaceButton.focus();
    fireEvent.keyDown(workspaceButton, { key: "F10", shiftKey: true });
    expect(
      screen.getByRole("menu", { name: "orchestrator workspace actions" }),
    ).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(
      screen.queryByRole("menu", { name: "orchestrator workspace actions" }),
    ).not.toBeInTheDocument();
  });

  it("expands a workspace independently from selection and previews files", async () => {
    const secondWorkspace = {
      ...workspace,
      id: 2,
      path: "/repo/mobile-client",
      label: "mobile-client",
      default_account_id: null,
    };
    const readmeEntry = {
      name: "README.md",
      path: "/repo/mobile-client/README.md",
      relativePath: "README.md",
      kind: "file" as const,
    };
    mocks.listWorkspacesMock.mockResolvedValue([workspace, secondWorkspace]);
    mocks.listWorkspaceDirectoryMock.mockResolvedValue([
      {
        name: "src",
        path: "/repo/mobile-client/src",
        relativePath: "src",
        kind: "directory",
      },
      readmeEntry,
    ]);
    mocks.readWorkspaceFilePreviewMock.mockResolvedValue({
      path: readmeEntry.path,
      relativePath: readmeEntry.relativePath,
      content: "# Mobile client",
      truncated: false,
      isBinary: false,
    });

    const { user } = await renderApp();
    const workspaceNav = screen.getByRole("navigation", {
      name: "Workspaces",
    });
    const selectedWorkspaceButton = within(workspaceNav).getByRole("button", {
      name: "orchestrator",
    });
    const secondWorkspaceButton = within(workspaceNav).getByRole("button", {
      name: "mobile-client",
    });

    await user.click(
      within(workspaceNav).getByRole("button", { name: "Expand mobile-client" }),
    );

    await waitFor(() =>
      expect(mocks.listWorkspaceDirectoryMock).toHaveBeenCalledWith(
        secondWorkspace.path,
        secondWorkspace.path,
      ),
    );
    expect(selectedWorkspaceButton).toHaveAttribute("aria-current", "page");
    expect(secondWorkspaceButton).not.toHaveAttribute("aria-current");
    expect(await within(workspaceNav).findByTitle("README.md")).toBeInTheDocument();

    pointerTapFile(within(workspaceNav).getByRole("button", { name: "README.md" }));

    await waitFor(() =>
      expect(mocks.readWorkspaceFilePreviewMock).toHaveBeenCalledWith(
        secondWorkspace.path,
        readmeEntry.path,
      ),
    );
    expect(screen.getByRole("complementary", { name: "File preview" })).toHaveTextContent(
      "# Mobile client",
    );
    expect(screen.queryByLabelText("Selected context files")).not.toBeInTheDocument();
  });

  it("dedupes repeated file preview requests while a preview is loading", async () => {
    const readmeEntry = {
      name: "README.md",
      path: "/repo/orchestrator/README.md",
      relativePath: "README.md",
      kind: "file" as const,
    };
    let resolvePreview: (preview: unknown) => void = () => undefined;
    const pendingPreview = new Promise((resolve) => {
      resolvePreview = resolve;
    });
    mocks.listWorkspaceDirectoryMock.mockResolvedValue([readmeEntry]);
    mocks.readWorkspaceFilePreviewMock.mockReturnValue(pendingPreview);

    const { user } = await renderApp();
    const workspaceNav = screen.getByRole("navigation", {
      name: "Workspaces",
    });

    await user.click(
      within(workspaceNav).getByRole("button", { name: "Expand orchestrator" }),
    );
    const readmeButton = await within(workspaceNav).findByRole("button", {
      name: "README.md",
    });

    await user.click(readmeButton);
    await user.click(readmeButton);

    expect(mocks.readWorkspaceFilePreviewMock).toHaveBeenCalledTimes(1);

    resolvePreview({
      path: readmeEntry.path,
      relativePath: readmeEntry.relativePath,
      content: "# Cached preview",
      truncated: false,
      isBinary: false,
    });
    expect(await screen.findByText("# Cached preview")).toBeInTheDocument();
  });

  it("loads git status for the selected workspace", async () => {
    await renderApp();

    await waitFor(() =>
      expect(mocks.listWorkspaceGitStatusMock).toHaveBeenCalledWith(workspace.path),
    );
  });

  it("shows git status markers for workspaces that are not selected", async () => {
    const otherWorkspace = {
      ...workspace,
      id: 2,
      path: "/repo/other",
      label: "other",
    };

    mocks.listWorkspacesMock.mockResolvedValue([workspace, otherWorkspace]);
    mocks.listWorkspaceGitStatusMock.mockImplementation(async (workspacePath: string) => {
      if (workspacePath === otherWorkspace.path) {
        return {
          workspacePath: otherWorkspace.path,
          gitRoot: otherWorkspace.path,
          files: [
            {
              path: "/repo/other/Changed.ts",
              relativePath: "Changed.ts",
              oldRelativePath: null,
              indexStatus: " ",
              worktreeStatus: "M",
              statusKind: "modified",
              badge: "M",
            },
          ],
        };
      }

      return {
        workspacePath: workspace.path,
        gitRoot: workspace.path,
        files: [],
      };
    });

    const { user } = await renderApp();
    const workspaceNav = screen.getByRole("navigation", {
      name: "Workspaces",
    });

    await waitFor(() =>
      expect(mocks.listWorkspaceGitStatusMock).toHaveBeenCalledWith(
        otherWorkspace.path,
      ),
    );
    expect(
      within(within(workspaceNav).getByTitle("other")).getByLabelText(
        "Contains changes",
      ),
    ).toBeInTheDocument();

    await user.click(
      within(workspaceNav).getByRole("button", { name: "Expand other" }),
    );

    expect(await within(workspaceNav).findByTitle("Changed.ts")).toBeInTheDocument();
    expect(within(workspaceNav).getByLabelText("modified file")).toHaveTextContent(
      "M",
    );
  });

  it("renders a selected folder banner with workspace, branch, and clean git state", async () => {
    await renderApp();

    const banner = screen.getByRole("region", { name: "Selected folder" });
    expect(within(banner).getByText("orchestrator")).toBeInTheDocument();
    expect(within(banner).getByText(workspace.path)).toBeInTheDocument();
    expect(await within(banner).findByText("main")).toBeInTheDocument();
    expect(await within(banner).findByText("Clean")).toBeInTheDocument();
  });

  it("summarizes changed files in the selected folder banner", async () => {
    mocks.listWorkspaceGitStatusMock.mockResolvedValue({
      workspacePath: workspace.path,
      gitRoot: workspace.path,
      files: [
        {
          path: "/repo/orchestrator/src/App.tsx",
          relativePath: "src/App.tsx",
          oldRelativePath: null,
          indexStatus: " ",
          worktreeStatus: "M",
          statusKind: "modified",
          badge: "M",
        },
        {
          path: "/repo/orchestrator/src/New.tsx",
          relativePath: "src/New.tsx",
          oldRelativePath: null,
          indexStatus: "A",
          worktreeStatus: " ",
          statusKind: "added",
          badge: "A",
        },
        {
          path: "/repo/orchestrator/src/Renamed.tsx",
          relativePath: "src/Renamed.tsx",
          oldRelativePath: "src/Old.tsx",
          indexStatus: "R",
          worktreeStatus: " ",
          statusKind: "renamed",
          badge: "R",
        },
        {
          path: "/repo/orchestrator/src/Deleted.tsx",
          relativePath: "src/Deleted.tsx",
          oldRelativePath: null,
          indexStatus: " ",
          worktreeStatus: "D",
          statusKind: "deleted",
          badge: "D",
        },
        {
          path: "/repo/orchestrator/notes.md",
          relativePath: "notes.md",
          oldRelativePath: null,
          indexStatus: "?",
          worktreeStatus: "?",
          statusKind: "untracked",
          badge: "U",
        },
        {
          path: "/repo/orchestrator/src/conflict.ts",
          relativePath: "src/conflict.ts",
          oldRelativePath: null,
          indexStatus: "U",
          worktreeStatus: "U",
          statusKind: "conflicted",
          badge: "U",
        },
      ],
    });

    await renderApp();

    const banner = screen.getByRole("region", { name: "Selected folder" });
    expect(await within(banner).findByText("6 changed")).toBeInTheDocument();
    expect(within(banner).getByTitle("Modified files")).toHaveTextContent("M1");
    expect(within(banner).getByTitle("Added, renamed, or copied files")).toHaveTextContent(
      "A/R/C2",
    );
    expect(within(banner).getByTitle("Deleted files")).toHaveTextContent("D1");
    expect(within(banner).getByTitle("Untracked files")).toHaveTextContent("U1");
    expect(within(banner).getByTitle("Conflicted files")).toHaveTextContent("U1");
  });

  it("commits all workspace changes from the selected folder banner", async () => {
    mocks.listWorkspaceGitStatusMock.mockResolvedValue({
      workspacePath: workspace.path,
      gitRoot: workspace.path,
      currentBranch: "main",
      aheadCount: 0,
      hasUpstream: true,
      hasOrigin: true,
      canPush: false,
      files: [
        {
          path: "/repo/orchestrator/src/App.tsx",
          relativePath: "src/App.tsx",
          oldRelativePath: null,
          indexStatus: " ",
          worktreeStatus: "M",
          statusKind: "modified",
          badge: "M",
        },
      ],
    });

    const { user } = await renderApp();
    const banner = screen.getByRole("region", { name: "Selected folder" });
    await user.click(await within(banner).findByRole("button", { name: /commit all/i }));

    const messageInput = within(banner).getByLabelText(/commit message/i);
    expect(messageInput).toHaveValue("Update App.tsx");
    await user.clear(messageInput);
    await user.type(messageInput, "Update app shell");
    await user.click(within(banner).getByRole("button", { name: /^commit$/i }));

    await waitFor(() =>
      expect(mocks.commitWorkspaceChangesMock).toHaveBeenCalledWith(
        workspace.path,
        "Update app shell",
      ),
    );
    await waitFor(() =>
      expect(mocks.listWorkspaceGitStatusMock).toHaveBeenCalledWith(workspace.path),
    );
  });

  it("pushes the current branch from the selected folder banner when clean and ahead", async () => {
    mocks.listWorkspaceGitStatusMock.mockResolvedValue({
      workspacePath: workspace.path,
      gitRoot: workspace.path,
      currentBranch: "main",
      aheadCount: 2,
      hasUpstream: true,
      hasOrigin: true,
      canPush: true,
      files: [],
    });

    const { user } = await renderApp();
    const banner = screen.getByRole("region", { name: "Selected folder" });
    await user.click(await within(banner).findByRole("button", { name: /push 2/i }));

    await waitFor(() =>
      expect(mocks.pushWorkspaceBranchMock).toHaveBeenCalledWith(workspace.path),
    );
  });

  it("shows live context usage in the selected folder banner", async () => {
    prepareSignedInRun();

    const { user } = await renderApp();
    const banner = screen.getByRole("region", { name: "Selected folder" });
    expect(within(banner).getByText("Context loading")).toBeInTheDocument();

    await startMockRun(user, "Measure context");
    await emitCodexNotification({
      method: "thread/tokenUsage/updated",
      params: {
        threadId: "thread-1",
        turnId: "turn-1",
        tokenUsage: {
          total: {
            totalTokens: 1280,
            inputTokens: 1000,
            cachedInputTokens: 100,
            outputTokens: 200,
            reasoningOutputTokens: 80,
          },
          modelContextWindow: 128000,
        },
      },
    });

    expect(
      within(banner).getByText("1,280 / 128,000 (1%)"),
    ).toBeInTheDocument();
  });

  it("opens workspace chat history and archives or restores persisted chats", async () => {
    const activeRun = workspaceRunFixture({
      id: 301,
      original_prompt: "Fix the app header",
      final_message: "Header fixed.",
      archived_at: null,
    });
    const archivedRun = workspaceRunFixture({
      id: 302,
      original_prompt: "Old archived chat",
      final_message: "Archived result.",
      archived_at: "2026-06-30T10:00:00Z",
    });
    mocks.listWorkspaceRunsMock.mockImplementation(
      async (_workspaceId: number, options?: { archived?: boolean }) =>
        options?.archived ? [archivedRun] : [activeRun],
    );

    const { user } = await renderApp();
    const banner = screen.getByRole("region", { name: "Selected folder" });
    await user.click(within(banner).getByRole("button", { name: /history/i }));

    const drawer = await screen.findByRole("complementary", {
      name: "Workspace chat history",
    });
    expect(within(drawer).getAllByText("Fix the app header").length).toBeGreaterThan(0);
    expect(within(drawer).getByText("Header fixed.")).toBeInTheDocument();

    await user.click(within(drawer).getByRole("button", { name: /archive/i }));
    await waitFor(() => expect(mocks.archiveRunMock).toHaveBeenCalledWith(301));

    await user.click(within(drawer).getByRole("tab", { name: /archived/i }));
    await waitFor(() =>
      expect(within(drawer).getAllByText("Old archived chat").length).toBeGreaterThan(0),
    );
    await user.click(within(drawer).getByRole("button", { name: /restore/i }));
    await waitFor(() => expect(mocks.unarchiveRunMock).toHaveBeenCalledWith(302));
  });

  it("renders an empty selected folder banner when no workspace is selected", async () => {
    mocks.listWorkspacesMock.mockResolvedValue([]);

    await renderApp();

    const banner = screen.getByRole("region", { name: "Selected folder" });
    expect(within(banner).getByText("No folder selected")).toBeInTheDocument();
    expect(
      within(banner).getByText("Add or choose a workspace to start a task."),
    ).toBeInTheDocument();
  });

  it("keeps goal mode and plan mode mutually exclusive", async () => {
    const { user } = await renderApp();

    const goalModeButton = screen.getByRole("button", { name: /goal mode/i });
    const planModeButton = screen.getByRole("button", { name: /plan mode/i });

    await user.click(goalModeButton);
    expect(goalModeButton).toHaveAttribute("aria-pressed", "true");
    expect(planModeButton).toHaveAttribute("aria-pressed", "false");

    await user.click(planModeButton);
    expect(planModeButton).toHaveAttribute("aria-pressed", "true");
    expect(goalModeButton).toHaveAttribute("aria-pressed", "false");
  });

  it("auto-refreshes git status when files change outside Orchestrator", async () => {
    const readmeEntry = {
      name: "README.md",
      path: "/repo/orchestrator/README.md",
      relativePath: "README.md",
      kind: "file" as const,
    };
    const externalFilePath = "/repo/orchestrator/external.md";
    const cleanStatus = {
      workspacePath: workspace.path,
      gitRoot: workspace.path,
      files: [],
    };
    const modifiedStatus = {
      workspacePath: workspace.path,
      gitRoot: workspace.path,
      files: [
        {
          path: readmeEntry.path,
          relativePath: readmeEntry.relativePath,
          oldRelativePath: null,
          indexStatus: " ",
          worktreeStatus: "M",
          statusKind: "modified",
          badge: "M",
        },
        {
          path: externalFilePath,
          relativePath: "external.md",
          oldRelativePath: null,
          indexStatus: "?",
          worktreeStatus: "?",
          statusKind: "untracked",
          badge: "U",
        },
      ],
    };

    mocks.listWorkspaceDirectoryMock.mockResolvedValue([readmeEntry]);
    mocks.listWorkspaceGitStatusMock
      .mockResolvedValueOnce(cleanStatus)
      .mockResolvedValueOnce(modifiedStatus)
      .mockResolvedValue(modifiedStatus);

    const { user } = await renderApp();
    const workspaceNav = screen.getByRole("navigation", {
      name: "Workspaces",
    });

    await user.click(
      within(workspaceNav).getByRole("button", { name: "Expand orchestrator" }),
    );

    expect(await within(workspaceNav).findByTitle("README.md")).toBeInTheDocument();
    expect(within(workspaceNav).queryByLabelText("modified file")).not.toBeInTheDocument();
    expect(within(workspaceNav).queryByTitle("external.md")).not.toBeInTheDocument();
    const banner = screen.getByRole("region", { name: "Selected folder" });
    expect(await within(banner).findByText("Clean")).toBeInTheDocument();

    await waitFor(
      () =>
        expect(mocks.listWorkspaceGitStatusMock.mock.calls.length).toBeGreaterThanOrEqual(
          2,
        ),
      { timeout: 4500 },
    );
    expect(within(workspaceNav).getByLabelText("modified file")).toHaveTextContent("M");
    expect(within(workspaceNav).getByTitle("external.md")).toBeInTheDocument();
    expect(within(workspaceNav).getByLabelText("untracked file")).toHaveTextContent("U");
    expect(within(banner).getByText("2 changed")).toBeInTheDocument();
    expect(within(banner).getByTitle("Modified files")).toHaveTextContent("M1");
    expect(within(banner).getByTitle("Untracked files")).toHaveTextContent("U1");
  });

  it("refreshes expanded directories when files are deleted outside Orchestrator", async () => {
    const helloEntry = {
      name: "hello.txt",
      path: "/repo/orchestrator/hello.txt",
      relativePath: "hello.txt",
      kind: "file" as const,
    };
    let directoryRequestCount = 0;

    mocks.listWorkspaceDirectoryMock.mockImplementation(async () => {
      directoryRequestCount += 1;
      return directoryRequestCount === 1 ? [helloEntry] : [];
    });
    mocks.listWorkspaceGitStatusMock.mockResolvedValue({
      workspacePath: workspace.path,
      gitRoot: workspace.path,
      files: [],
    });

    const { user } = await renderApp();
    const workspaceNav = screen.getByRole("navigation", {
      name: "Workspaces",
    });

    await user.click(
      within(workspaceNav).getByRole("button", { name: "Expand orchestrator" }),
    );
    expect(await within(workspaceNav).findByTitle("hello.txt")).toBeInTheDocument();

    await waitFor(
      () =>
        expect(mocks.listWorkspaceDirectoryMock.mock.calls.length).toBeGreaterThanOrEqual(
          2,
        ),
      { timeout: 4500 },
    );
    await waitFor(() =>
      expect(within(workspaceNav).queryByTitle("hello.txt")).not.toBeInTheDocument(),
    );
  });

  it("marks changed files and parent folders in the workspace explorer", async () => {
    mocks.listWorkspaceDirectoryMock.mockResolvedValue([
      {
        name: "src",
        path: "/repo/orchestrator/src",
        relativePath: "src",
        kind: "directory",
      },
      {
        name: "README.md",
        path: "/repo/orchestrator/README.md",
        relativePath: "README.md",
        kind: "file",
      },
    ]);
    mocks.listWorkspaceGitStatusMock.mockResolvedValue({
      workspacePath: workspace.path,
      gitRoot: workspace.path,
      files: [
        {
          path: "/repo/orchestrator/README.md",
          relativePath: "README.md",
          oldRelativePath: null,
          indexStatus: " ",
          worktreeStatus: "M",
          statusKind: "modified",
          badge: "M",
        },
        {
          path: "/repo/orchestrator/src/App.tsx",
          relativePath: "src/App.tsx",
          oldRelativePath: null,
          indexStatus: " ",
          worktreeStatus: "M",
          statusKind: "modified",
          badge: "M",
        },
      ],
    });

    const { user } = await renderApp();
    const workspaceNav = screen.getByRole("navigation", {
      name: "Workspaces",
    });

    await user.click(
      within(workspaceNav).getByRole("button", { name: "Expand orchestrator" }),
    );

    expect(await within(workspaceNav).findByTitle("README.md")).toBeInTheDocument();
    expect(within(workspaceNav).getAllByLabelText("modified file")).toHaveLength(1);
    expect(within(workspaceNav).getAllByLabelText("Contains changes")).toHaveLength(2);
  });

  it("hides files deleted outside Orchestrator from the workspace explorer", async () => {
    mocks.listWorkspaceDirectoryMock.mockImplementation(
      async (_workspacePath: string, directoryPath: string) => {
        if (directoryPath === workspace.path) {
          return [
            {
              name: "src",
              path: "/repo/orchestrator/src",
              relativePath: "src",
              kind: "directory",
            },
          ];
        }

        if (directoryPath === "/repo/orchestrator/src") {
          return [
            {
              name: "old.ts",
              path: "/repo/orchestrator/src/old.ts",
              relativePath: "src/old.ts",
              kind: "file",
            },
          ];
        }

        return [];
      },
    );
    mocks.listWorkspaceGitStatusMock.mockResolvedValue({
      workspacePath: workspace.path,
      gitRoot: workspace.path,
      files: [
        {
          path: "/repo/orchestrator/src/old.ts",
          relativePath: "src/old.ts",
          oldRelativePath: null,
          indexStatus: " ",
          worktreeStatus: "D",
          statusKind: "deleted",
          badge: "D",
        },
      ],
    });
    const { user } = await renderApp();
    const workspaceNav = screen.getByRole("navigation", {
      name: "Workspaces",
    });

    await user.click(
      within(workspaceNav).getByRole("button", { name: "Expand orchestrator" }),
    );
    await user.click(await within(workspaceNav).findByRole("button", { name: "Expand src" }));
    expect(within(workspaceNav).queryByTitle("src/old.ts")).not.toBeInTheDocument();
    expect(mocks.readWorkspaceGitDiffMock).not.toHaveBeenCalled();
    expect(mocks.readWorkspaceFilePreviewMock).not.toHaveBeenCalledWith(
      workspace.path,
      "/repo/orchestrator/src/old.ts",
    );
  });

  it("opens changed files in preview mode and loads diff from the drawer toggle", async () => {
    const readmeEntry = {
      name: "README.md",
      path: "/repo/orchestrator/README.md",
      relativePath: "README.md",
      kind: "file" as const,
    };
    mocks.listWorkspaceDirectoryMock.mockResolvedValue([readmeEntry]);
    mocks.listWorkspaceGitStatusMock.mockResolvedValue({
      workspacePath: workspace.path,
      gitRoot: workspace.path,
      files: [
        {
          path: readmeEntry.path,
          relativePath: readmeEntry.relativePath,
          oldRelativePath: null,
          indexStatus: " ",
          worktreeStatus: "M",
          statusKind: "modified",
          badge: "M",
        },
      ],
    });
    mocks.readWorkspaceFilePreviewMock.mockResolvedValue({
      path: readmeEntry.path,
      relativePath: readmeEntry.relativePath,
      content: "# Orchestrator",
      truncated: false,
      isBinary: false,
    });
    mocks.readWorkspaceGitDiffMock.mockResolvedValue({
      path: readmeEntry.path,
      relativePath: readmeEntry.relativePath,
      sections: [
        {
          kind: "unstaged",
          title: "Working tree changes",
          baseLabel: "Index:README.md",
          headLabel: "Working tree:README.md",
          baseContent: "A\nOld\nZ\n",
          headContent: "A\nNew\nZ\n",
          baseTruncated: false,
          headTruncated: false,
          content:
            "diff --git a/README.md b/README.md\n@@ -1,3 +1,3 @@\n A\n-Old\n+New\n Z\n",
          isBinary: false,
        },
      ],
    });

    const { user } = await renderApp();
    const workspaceNav = screen.getByRole("navigation", {
      name: "Workspaces",
    });

    await user.click(
      within(workspaceNav).getByRole("button", { name: "Expand orchestrator" }),
    );
    await user.click(await within(workspaceNav).findByTitle("README.md"));

    expect(await screen.findByText("# Orchestrator")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Preview" })).toHaveClass("active");

    await user.click(screen.getByRole("button", { name: "Diff" }));

    await waitFor(() =>
      expect(mocks.readWorkspaceGitDiffMock).toHaveBeenCalledWith(
        workspace.path,
        readmeEntry.path,
      ),
    );
    expect(screen.getByRole("button", { name: "Diff" })).toHaveClass("active");
    const previewDrawer = screen.getByRole("complementary", { name: "File preview" });
    expect(previewDrawer).toHaveTextContent("A");
    expect(previewDrawer).toHaveTextContent("Old");
    expect(previewDrawer).toHaveTextContent("New");
    expect(previewDrawer).toHaveTextContent("Z");

    await user.click(screen.getByRole("button", { name: "Preview" }));
    await user.click(screen.getByRole("button", { name: "Diff" }));
    expect(mocks.readWorkspaceGitDiffMock).toHaveBeenCalledTimes(1);
  });

  it("shows binary and truncated file preview states", async () => {
    const binaryEntry = {
      name: "image.png",
      path: "/repo/orchestrator/image.png",
      relativePath: "image.png",
      kind: "file" as const,
    };
    const largeEntry = {
      name: "large.ts",
      path: "/repo/orchestrator/large.ts",
      relativePath: "large.ts",
      kind: "file" as const,
    };
    mocks.listWorkspaceDirectoryMock.mockResolvedValue([binaryEntry, largeEntry]);
    mocks.readWorkspaceFilePreviewMock.mockImplementation(
      async (_workspacePath: string, filePath: string) => {
        if (filePath === binaryEntry.path) {
          return {
            path: binaryEntry.path,
            relativePath: binaryEntry.relativePath,
            content: "",
            truncated: false,
            isBinary: true,
          };
        }

        return {
          path: largeEntry.path,
          relativePath: largeEntry.relativePath,
          content: "const value = 1;",
          truncated: true,
          isBinary: false,
        };
      },
    );

    const { user } = await renderApp();
    const workspaceNav = screen.getByRole("navigation", {
      name: "Workspaces",
    });

    await user.click(
      within(workspaceNav).getByRole("button", { name: "Expand orchestrator" }),
    );
    await user.click(await within(workspaceNav).findByRole("button", { name: "image.png" }));

    expect(await screen.findByText("Binary or unsupported file preview.")).toBeInTheDocument();
    expect(
      screen.queryByLabelText("Highlighted file preview"),
    ).not.toBeInTheDocument();

    await user.click(within(workspaceNav).getByRole("button", { name: "large.ts" }));

    expect(await screen.findByText("Preview truncated to 512 KB.")).toBeInTheDocument();
    expect(await screen.findByText("Truncated")).toBeInTheDocument();
    expect(screen.getByLabelText("Highlighted file preview")).toHaveTextContent(
      "const value = 1;",
    );
  });

  it("resizes the file preview drawer horizontally", async () => {
    setWindowWidth(1200);
    const readmeEntry = {
      name: "README.md",
      path: "/repo/orchestrator/README.md",
      relativePath: "README.md",
      kind: "file" as const,
    };
    mocks.listWorkspaceDirectoryMock.mockResolvedValue([readmeEntry]);
    mocks.readWorkspaceFilePreviewMock.mockResolvedValue({
      path: readmeEntry.path,
      relativePath: readmeEntry.relativePath,
      content: "# Orchestrator",
      truncated: false,
      isBinary: false,
    });

    const { user } = await renderApp();
    const workspaceNav = screen.getByRole("navigation", {
      name: "Workspaces",
    });

    await user.click(
      within(workspaceNav).getByRole("button", { name: "Expand orchestrator" }),
    );
    await user.click(await within(workspaceNav).findByRole("button", { name: "README.md" }));

    const drawer = screen.getByRole("complementary", { name: "File preview" });
    const handle = screen.getByRole("separator", { name: "Resize file preview" });
    expect(drawer).toHaveStyle({ width: "520px" });

    fireEvent.pointerDown(handle, { clientX: 680 });
    await waitFor(() => expect(drawer).toHaveClass("resizing"));
    fireEvent.pointerMove(window, { clientX: 480 });
    await waitFor(() => expect(drawer).toHaveStyle({ width: "720px" }));

    fireEvent.pointerUp(window);
    fireEvent.keyDown(handle, { key: "ArrowRight" });
    expect(drawer).toHaveStyle({ width: "680px" });
  });

  it("toggles workspace expansion from the workspace label", async () => {
    mocks.listWorkspaceDirectoryMock.mockResolvedValue([
      {
        name: "src",
        path: "/repo/orchestrator/src",
        relativePath: "src",
        kind: "directory",
      },
    ]);

    const { user } = await renderApp();
    const primaryNav = screen.getByRole("navigation", {
      name: "Primary",
    });
    const workspaceNav = screen.getByRole("navigation", {
      name: "Workspaces",
    });
    const workspaceButton = within(workspaceNav).getByRole("button", {
      name: "orchestrator",
    });

    await user.click(workspaceButton);

    await waitFor(() =>
      expect(mocks.listWorkspaceDirectoryMock).toHaveBeenCalledWith(
        workspace.path,
        workspace.path,
      ),
    );
    expect(workspaceButton).toHaveAttribute("aria-current", "page");
    expect(await within(workspaceNav).findByRole("button", { name: "src" })).toBeInTheDocument();

    await user.click(within(primaryNav).getByRole("button", { name: "Settings" }));
    expect(workspaceButton).not.toHaveAttribute("aria-current");
    expect(within(workspaceNav).getByRole("button", { name: "src" })).toBeInTheDocument();

    await user.click(workspaceButton);
    expect(screen.getByLabelText("Task composer")).toBeInTheDocument();
    expect(workspaceButton).toHaveAttribute("aria-current", "page");
    expect(within(workspaceNav).getByRole("button", { name: "src" })).toBeInTheDocument();

    await user.click(workspaceButton);

    expect(within(workspaceNav).queryByRole("button", { name: "src" })).not.toBeInTheDocument();

    await user.click(workspaceButton);
    expect(await within(workspaceNav).findByRole("button", { name: "src" })).toBeInTheDocument();
    expect(mocks.listWorkspaceDirectoryMock).toHaveBeenCalledTimes(2);
  });

  it("shows nested loading state while expanding directories", async () => {
    let resolveNestedDirectory: (entries: unknown[]) => void = () => undefined;
    const nestedDirectory = new Promise<unknown[]>((resolve) => {
      resolveNestedDirectory = resolve;
    });
    mocks.listWorkspaceDirectoryMock.mockImplementation(
      async (_workspacePath: string, directoryPath: string) => {
        if (directoryPath === "/repo/orchestrator/src") {
          return nestedDirectory;
        }

        return [
          {
            name: "src",
            path: "/repo/orchestrator/src",
            relativePath: "src",
            kind: "directory",
          },
        ];
      },
    );

    const { user } = await renderApp();
    const workspaceNav = screen.getByRole("navigation", {
      name: "Workspaces",
    });

    await user.click(
      within(workspaceNav).getByRole("button", { name: "Expand orchestrator" }),
    );
    await user.click(await within(workspaceNav).findByRole("button", { name: "Expand src" }));

    expect(within(workspaceNav).getByText("Loading")).toBeInTheDocument();

    resolveNestedDirectory([
      {
        name: "App.tsx",
        path: "/repo/orchestrator/src/App.tsx",
        relativePath: "src/App.tsx",
        kind: "file",
      },
    ]);
    expect(await within(workspaceNav).findByRole("button", { name: "App.tsx" })).toBeInTheDocument();
  });

  it("adds explorer files to context through composer drop and dedupes repeats", async () => {
    await renderApp();
    const composer = screen.getByLabelText("Task composer");
    const dataTransfer = createContextFileDataTransfer([
      {
        path: "/repo/orchestrator/README.md",
        name: "README.md",
        source: "explorer",
        status: "ready",
      },
    ]);

    fireEvent.dragOver(composer, { dataTransfer });
    fireEvent.drop(composer, { dataTransfer });
    fireEvent.drop(composer, { dataTransfer });

    const contextList = await screen.findByLabelText("Selected context files");
    expect(within(contextList).getAllByText("README.md")).toHaveLength(1);
  });

  it("adds files dragged from the workspace explorer into the task chat surface", async () => {
    mocks.listWorkspaceDirectoryMock.mockResolvedValue([
      {
        name: "README.md",
        path: "/repo/orchestrator/README.md",
        relativePath: "README.md",
        kind: "file",
      },
    ]);

    const { user } = await renderApp();
    const workspaceNav = screen.getByRole("navigation", {
      name: "Workspaces",
    });
    await user.click(
      within(workspaceNav).getByRole("button", { name: "Expand orchestrator" }),
    );

    const readmeButton = await within(workspaceNav).findByRole("button", {
      name: "README.md",
    });
    const composer = screen.getByLabelText("Task composer");
    mockElementRect(composer);
    startPointerDragFileIntoTaskSurface(readmeButton);

    const dragPreview = screen.getByLabelText("Dragging README.md");
    expect(dragPreview).toHaveTextContent("README.md");
    expect(dragPreview).toHaveTextContent("Drop to add");
    expect(composer).toHaveClass("drop-target-active");

    finishPointerDragFileIntoTaskSurface(readmeButton);

    const contextList = await screen.findByLabelText("Selected context files");
    expect(within(contextList).getByText("README.md")).toBeInTheDocument();
    expect(screen.queryByLabelText("Dragging README.md")).not.toBeInTheDocument();
    expect(composer).not.toHaveClass("drop-target-active");
  });

  it("dedupes repeated pointer drags from the workspace explorer", async () => {
    mocks.listWorkspaceDirectoryMock.mockResolvedValue([
      {
        name: "hello.txt",
        path: "/repo/orchestrator/hello.txt",
        relativePath: "hello.txt",
        kind: "file",
      },
    ]);

    const { user } = await renderApp();
    const workspaceNav = screen.getByRole("navigation", {
      name: "Workspaces",
    });
    await user.click(
      within(workspaceNav).getByRole("button", { name: "Expand orchestrator" }),
    );

    const fileButton = await within(workspaceNav).findByRole("button", {
      name: "hello.txt",
    });
    mockElementRect(screen.getByLabelText("Task composer"));

    pointerDragFileIntoTaskSurface(fileButton);
    pointerDragFileIntoTaskSurface(fileButton);

    const contextList = await screen.findByLabelText("Selected context files");
    expect(within(contextList).getAllByText("hello.txt")).toHaveLength(1);
  });

  it("indexes workspace files for @ mentions and adds the selected file to context", async () => {
    mocks.listWorkspaceDirectoryMock.mockImplementation(
      async (_workspacePath: string, directoryPath: string) => {
        if (directoryPath === workspace.path) {
          return [
            {
              name: "src",
              path: `${workspace.path}/src`,
              relativePath: "src",
              kind: "directory",
            },
            {
              name: "README.md",
              path: `${workspace.path}/README.md`,
              relativePath: "README.md",
              kind: "file",
            },
          ];
        }

        if (directoryPath === `${workspace.path}/src`) {
          return [
            {
              name: "App.tsx",
              path: `${workspace.path}/src/App.tsx`,
              relativePath: "src/App.tsx",
              kind: "file",
            },
          ];
        }

        return [];
      },
    );

    const { user } = await renderApp();
    const promptInput = screen.getByLabelText("Prompt");

    await user.type(promptInput, "@app");
    const option = await screen.findByRole("option", { name: /app\.tsx/i });
    await user.click(option);

    await waitFor(() =>
      expect(mocks.listWorkspaceDirectoryMock).toHaveBeenCalledWith(
        workspace.path,
        workspace.path,
      ),
    );
    expect(mocks.listWorkspaceDirectoryMock).toHaveBeenCalledWith(
      workspace.path,
      `${workspace.path}/src`,
    );
    expect(promptInput).toHaveValue("TSX App.tsx ");
    expect(screen.queryByLabelText("Selected context files")).not.toBeInTheDocument();

    const secondPromptInput = screen.getByLabelText("Prompt");
    await user.click(secondPromptInput);
    await user.type(secondPromptInput, "@app");
    await user.click(await screen.findByRole("option", { name: /app\.tsx/i }));
    expect(secondPromptInput).toHaveValue("TSX App.tsx TSX App.tsx ");
    expect(screen.queryByLabelText("Selected context files")).not.toBeInTheDocument();
  });

  it("sorts @ mention search results and limits visible files", async () => {
    mocks.listWorkspaceDirectoryMock.mockResolvedValue([
      {
        name: "happy-app.ts",
        path: `${workspace.path}/happy-app.ts`,
        relativePath: "happy-app.ts",
        kind: "file",
      },
      {
        name: "application.md",
        path: `${workspace.path}/application.md`,
        relativePath: "application.md",
        kind: "file",
      },
      {
        name: "App.tsx",
        path: `${workspace.path}/App.tsx`,
        relativePath: "App.tsx",
        kind: "file",
      },
      {
        name: "app.config.ts",
        path: `${workspace.path}/app.config.ts`,
        relativePath: "app.config.ts",
        kind: "file",
      },
      {
        name: "mapped.ts",
        path: `${workspace.path}/mapped.ts`,
        relativePath: "mapped.ts",
        kind: "file",
      },
      {
        name: "wrapped.ts",
        path: `${workspace.path}/wrapped.ts`,
        relativePath: "wrapped.ts",
        kind: "file",
      },
      {
        name: "app-state.ts",
        path: `${workspace.path}/app-state.ts`,
        relativePath: "app-state.ts",
        kind: "file",
      },
      {
        name: "mapper-app.ts",
        path: `${workspace.path}/mapper-app.ts`,
        relativePath: "mapper-app.ts",
        kind: "file",
      },
      {
        name: "app-router.ts",
        path: `${workspace.path}/app-router.ts`,
        relativePath: "app-router.ts",
        kind: "file",
      },
    ]);

    const { user } = await renderApp();
    await user.type(screen.getByLabelText("Prompt"), "@app");

    const listbox = await screen.findByRole("listbox", {
      name: "Workspace file suggestions",
    });
    const options = within(listbox).getAllByRole("option");
    expect(options).toHaveLength(8);
    expect(options[0]).toHaveTextContent("App.tsx");
    expect(options[1]).toHaveTextContent("app-state.ts");
  });

  it("rebuilds @ mention search after switching workspaces", async () => {
    const mobileWorkspace = {
      ...workspace,
      id: 2,
      path: "/repo/mobile-client",
      label: "mobile-client",
      default_account_id: null,
    };
    mocks.listWorkspacesMock.mockResolvedValue([workspace, mobileWorkspace]);
    mocks.listWorkspaceDirectoryMock.mockImplementation(
      async (workspacePath: string) => {
        if (workspacePath === workspace.path) {
          return [
            {
              name: "App.tsx",
              path: `${workspace.path}/src/App.tsx`,
              relativePath: "src/App.tsx",
              kind: "file",
            },
          ];
        }

        return [
          {
            name: "MobileApp.tsx",
            path: `${mobileWorkspace.path}/src/MobileApp.tsx`,
            relativePath: "src/MobileApp.tsx",
            kind: "file",
          },
        ];
      },
    );

    const { user } = await renderApp();
    const promptInput = screen.getByLabelText("Prompt");

    await user.type(promptInput, "@app");
    await user.click(await screen.findByRole("option", { name: /app\.tsx/i }));

    const workspaceNav = screen.getByRole("navigation", {
      name: "Workspaces",
    });
    await user.click(
      within(workspaceNav).getByRole("button", { name: "mobile-client" }),
    );

    await user.type(screen.getByLabelText("Prompt"), "@mobile");
    expect(
      await screen.findByRole("option", { name: /mobileapp\.tsx/i }),
    ).toBeInTheDocument();
    expect(mocks.listWorkspaceDirectoryMock).toHaveBeenCalledWith(
      mobileWorkspace.path,
      mobileWorkspace.path,
    );
  });

  it("uses the shared dropdown for OSS provider selection", async () => {
    const { user } = await renderApp();

    await user.click(screen.getByRole("button", { name: "Settings" }));

    const providerSelect = screen.getByRole("combobox", {
      name: "Settings OSS provider",
    });
    expect(providerSelect).toBeDisabled();
    expect(providerSelect.closest(".composer-select")).toHaveClass(
      "settings-provider-select",
    );
    expect(document.querySelector("select")).not.toBeInTheDocument();

    await user.click(screen.getByRole("checkbox"));
    expect(providerSelect).toBeEnabled();
    await user.click(providerSelect);
    await user.click(screen.getByRole("option", { name: "LM Studio" }));

    expect(providerSelect).toHaveTextContent("LM Studio");
  });

  it("changes and persists the interface theme from settings", async () => {
    const { user } = await renderApp();

    await user.click(screen.getByRole("button", { name: "Settings" }));

    const systemTheme = screen.getByRole("radio", { name: "System" });
    const darkTheme = screen.getByRole("radio", { name: "Dark" });
    const lightTheme = screen.getByRole("radio", { name: "Light" });

    expect(systemTheme).toHaveAttribute("aria-checked", "true");

    darkTheme.focus();
    await user.keyboard(" ");
    expect(darkTheme).toHaveAttribute("aria-checked", "true");
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    expect(localStorage.getItem("orchestrator.theme")).toBe("dark");

    await user.click(lightTheme);
    expect(lightTheme).toHaveAttribute("aria-checked", "true");
    expect(document.documentElement).toHaveAttribute("data-theme", "light");
    expect(localStorage.getItem("orchestrator.theme")).toBe("light");
  });

  it("removes consolidated duplicate profile directories during startup", async () => {
    mocks.listDuplicateProfilesPendingCleanupMock.mockResolvedValue([11]);

    await renderApp();

    await waitFor(() =>
      expect(mocks.deleteCodexProfileMock).toHaveBeenCalledWith(11),
    );
    expect(mocks.completeDuplicateProfileCleanupMock).toHaveBeenCalledWith(11);
  });

  it("maps account/read into signed-in auth UI", async () => {
    mocks.listCodexAccountsMock.mockResolvedValue([signedInAccount]);
    mocks.readCodexAccountMock.mockResolvedValue({
      account: {
        type: "chatgpt",
        email: "dev@example.com",
        planType: "pro",
      },
      requiresOpenaiAuth: true,
    });

    await renderApp();

    const accountButton = await screen.findByLabelText("Codex account");
    expect(within(accountButton).getByText("dev@example.com")).toBeInTheDocument();
    expect(within(accountButton).getByText("Pro")).toBeInTheDocument();
    expect(screen.queryByLabelText("Log out of Codex")).not.toBeInTheDocument();
  });

  it("starts browser login and shows waiting status", async () => {
    const { user } = await renderApp();

    expect(await screen.findByText("Sign in to Codex")).toBeInTheDocument();
    await user.click(screen.getByLabelText("Sign in to Codex"));

    await waitFor(() =>
      expect(mocks.openUrlMock).toHaveBeenCalledWith("https://example.com/auth"),
    );
    expect(mocks.startCodexLoginMock).toHaveBeenCalledWith(7);
    expect(await screen.findByText("Waiting for browser sign-in")).toBeInTheDocument();
    expect(screen.getByText("Click to cancel")).toBeInTheDocument();
    expect(screen.getByLabelText("Cancel Codex sign-in")).toBeInTheDocument();
    expect(screen.queryByLabelText("Codex account")).not.toBeInTheDocument();
  });

  it("surfaces account profile creation failures instead of leaving sign-in inert", async () => {
    mocks.createCodexAccountMock.mockRejectedValue(
      new Error("SQL execute permission denied"),
    );

    const { user } = await renderApp();
    await user.click(screen.getByLabelText("Sign in to Codex"));

    expect(await screen.findByText("Sign-in failed")).toBeInTheDocument();
    expect(
      screen.getByText("SQL execute permission denied"),
    ).toBeInTheDocument();
    expect(mocks.connectCodexMock).not.toHaveBeenCalled();
  });

  it("shows device code login and cancels the pending flow", async () => {
    mocks.startCodexLoginMock.mockResolvedValue({
      type: "chatgptDeviceCode",
      loginId: "login-2",
      verificationUrl: "https://example.com/device",
      userCode: "CODE-123",
    });

    const { user } = await renderApp();
    await user.click(screen.getByLabelText("Sign in to Codex"));

    await waitFor(() =>
      expect(mocks.openUrlMock).toHaveBeenCalledWith("https://example.com/device"),
    );
    expect(await screen.findByText("Enter code CODE-123")).toBeInTheDocument();

    await user.click(screen.getByLabelText("Cancel Codex sign-in"));
    await waitFor(() =>
      expect(mocks.cancelCodexLoginMock).toHaveBeenCalledWith(7, "login-2"),
    );
    expect(mocks.deleteCodexProfileMock).toHaveBeenCalledWith(7);
    expect(mocks.softDeleteCodexAccountMock).toHaveBeenCalledWith(7);
    expect(await screen.findByText("Sign in to Codex")).toBeInTheDocument();
    expect(screen.queryByLabelText("Codex account")).not.toBeInTheDocument();
  });

  it("completes sign-in from notifications and supports logout", async () => {
    mocks.readCodexAccountMock
      .mockResolvedValueOnce({
        account: {
          type: "chatgpt",
          email: "dev@example.com",
          planType: "pro",
        },
        requiresOpenaiAuth: true,
      });

    const { user } = await renderApp();
    await user.click(screen.getByLabelText("Sign in to Codex"));

    const notificationHandler = mocks.listeners.get("codex:notification");
    expect(notificationHandler).toBeDefined();

    await act(async () => {
      notificationHandler?.({
        payload: {
          accountId: 7,
          message: {
            method: "account/login/completed",
            params: {
              success: true,
              loginId: "login-1",
            },
          },
        },
      });
    });

    const accountButton = await screen.findByLabelText("Codex account");
    expect(within(accountButton).getByText("dev@example.com")).toBeInTheDocument();
    expect(within(accountButton).getByText("Pro")).toBeInTheDocument();

    await user.click(accountButton);
    expect(await screen.findByLabelText("Log out of Codex")).toBeInTheDocument();
    expect(screen.getByText("Refresh account")).toBeInTheDocument();
    expect(screen.queryByLabelText("Stop Codex")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Codex accounts")).not.toBeInTheDocument();

    await user.click(screen.getByLabelText("Log out of Codex"));
    await waitFor(() => expect(mocks.logoutCodexAccountMock).toHaveBeenCalledWith(7));
    expect(await screen.findByText("Sign in to Codex")).toBeInTheDocument();
    expect(screen.queryByLabelText("Codex account")).not.toBeInTheDocument();
  });

  it("refreshes account state with polling when login completion notifications are missed", async () => {
    mocks.readCodexAccountMock
      .mockResolvedValueOnce({
        account: {
          type: "chatgpt",
          email: "poll@example.com",
          planType: "plus",
        },
        requiresOpenaiAuth: true,
      });

    const { user } = await renderApp();
    await user.click(screen.getByLabelText("Sign in to Codex"));

    await waitFor(() => expect(mocks.openUrlMock).toHaveBeenCalledWith("https://example.com/auth"));

    const accountButton = await screen.findByLabelText(
      "Codex account",
      {},
      { timeout: 3500 },
    );
    expect(within(accountButton).getByText("poll@example.com")).toBeInTheDocument();
    expect(within(accountButton).getByText("Plus")).toBeInTheDocument();
  });

  it("refreshes account state from account/updated notifications", async () => {
    mocks.listCodexAccountsMock.mockResolvedValue([signedInAccount]);
    mocks.readCodexAccountMock
      .mockResolvedValueOnce({
        account: null,
        requiresOpenaiAuth: true,
      })
      .mockResolvedValueOnce({
        account: {
          type: "chatgpt",
          email: "updated@example.com",
          planType: "plus",
        },
        requiresOpenaiAuth: true,
      });

    await renderApp();

    const notificationHandler = mocks.listeners.get("codex:notification");
    expect(notificationHandler).toBeDefined();

    await act(async () => {
      notificationHandler?.({
        payload: {
          accountId: 7,
          message: {
            method: "account/updated",
            params: {
              authMode: "chatgpt",
              planType: "plus",
            },
          },
        },
      });
    });

    const accountButton = await screen.findByLabelText("Codex account");
    expect(within(accountButton).getByText("updated@example.com")).toBeInTheDocument();
    expect(within(accountButton).getByText("Plus")).toBeInTheDocument();
  });

  it("adds a second isolated account from the account menu", async () => {
    mocks.listCodexAccountsMock.mockResolvedValue([signedInAccount]);
    mocks.createCodexAccountMock.mockResolvedValue({
      ...pendingAccount,
      id: 8,
    });
    mocks.readCodexAccountMock.mockResolvedValue({
      account: {
        type: "chatgpt",
        email: "dev@example.com",
        planType: "pro",
      },
      requiresOpenaiAuth: true,
    });

    const { user } = await renderApp();
    await user.click(await screen.findByLabelText("Codex account"));
    await user.click(screen.getByRole("button", { name: "Add account" }));

    await waitFor(() => expect(mocks.connectCodexMock).toHaveBeenCalledWith(8));
    expect(mocks.startCodexLoginMock).toHaveBeenCalledWith(8);
    expect(mocks.openUrlMock).toHaveBeenCalledWith("https://example.com/auth");
  });

  it("renders account actions as an anchored popover", async () => {
    mocks.listCodexAccountsMock.mockResolvedValue([signedInAccount]);
    mocks.readCodexAccountMock.mockResolvedValue({
      account: {
        type: "chatgpt",
        email: signedInAccount.email,
        planType: signedInAccount.plan_type,
      },
      requiresOpenaiAuth: true,
    });

    const { user } = await renderApp();
    const accountButton = await screen.findByLabelText("Codex account");
    await user.click(accountButton);

    const menu = document.getElementById("codex-account-menu");
    expect(menu).toBeInTheDocument();
    expect(menu).toHaveClass("account-menu");
    expect(accountButton).toHaveAttribute("aria-expanded", "true");
    expect(accountButton.closest(".account-card")).toContainElement(menu);
  });

  it("closes the account actions popover when clicking elsewhere on the screen", async () => {
    mocks.listCodexAccountsMock.mockResolvedValue([signedInAccount]);
    mocks.readCodexAccountMock.mockResolvedValue({
      account: {
        type: "chatgpt",
        email: signedInAccount.email,
        planType: signedInAccount.plan_type,
      },
      requiresOpenaiAuth: true,
    });

    const { user } = await renderApp();
    const accountButton = await screen.findByLabelText("Codex account");
    await user.click(accountButton);

    expect(document.getElementById("codex-account-menu")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /analytics/i }));

    await waitFor(() =>
      expect(document.getElementById("codex-account-menu")).not.toBeInTheDocument(),
    );
    expect(accountButton).toHaveAttribute("aria-expanded", "false");
  });

  it("switches accounts from the account menu", async () => {
    mocks.listCodexAccountsMock.mockResolvedValue([
      signedInAccount,
      signedInAccount2,
    ]);
    mocks.readCodexAccountMock.mockImplementation(async (accountId: number) => ({
      account: {
        type: "chatgpt",
        email:
          accountId === signedInAccount2.id
            ? signedInAccount2.email
            : signedInAccount.email,
        planType:
          accountId === signedInAccount2.id
            ? signedInAccount2.plan_type
            : signedInAccount.plan_type,
      },
      requiresOpenaiAuth: true,
    }));

    const { user } = await renderApp();
    await user.click(await screen.findByLabelText("Codex account"));
    const accountList = screen.getByLabelText("Codex accounts");
    expect(
      within(accountList).queryByRole("button", { name: /dev@example.com/i }),
    ).not.toBeInTheDocument();
    await user.click(
      within(accountList).getByRole("button", { name: /personal@example.com/i }),
    );

    await waitFor(() =>
      expect(
        screen.getByRole("combobox", { name: "Run account" }),
      ).toHaveTextContent("personal@example.com"),
    );
  });

  it("rejects and removes a second profile with the same email address", async () => {
    mocks.listCodexAccountsMock.mockResolvedValue([signedInAccount]);
    mocks.createCodexAccountMock.mockResolvedValue({
      ...pendingAccount,
      id: 8,
    });
    mocks.readCodexAccountMock.mockResolvedValue({
      account: {
        type: "chatgpt",
        email: signedInAccount.email,
        planType: "pro",
      },
      requiresOpenaiAuth: true,
    });

    const { user } = await renderApp();
    await user.click(await screen.findByLabelText("Codex account"));
    await user.click(screen.getByRole("button", { name: "Add account" }));

    const notificationHandler = mocks.listeners.get("codex:notification");
    await act(async () => {
      notificationHandler?.({
        payload: {
          accountId: 8,
          message: {
            method: "account/login/completed",
            params: {
              success: true,
              loginId: "login-1",
            },
          },
        },
      });
    });

    await waitFor(() =>
      expect(mocks.deleteCodexProfileMock).toHaveBeenCalledWith(8),
    );
    expect(mocks.softDeleteCodexAccountMock).toHaveBeenCalledWith(8);
    expect(
      mocks.updateCodexAccountMock,
    ).not.toHaveBeenCalledWith(
      8,
      expect.objectContaining({ email: signedInAccount.email }),
    );

    const accountButton = await screen.findByLabelText("Codex account");
    expect(
      within(accountButton).getByText(signedInAccount.email),
    ).toBeInTheDocument();
    await user.click(accountButton);
    expect(screen.queryByLabelText("Codex accounts")).not.toBeInTheDocument();
  });

  it("keeps account notifications isolated by account id", async () => {
    mocks.listCodexAccountsMock.mockResolvedValue([
      signedInAccount,
      signedInAccount2,
    ]);
    mocks.readCodexAccountMock.mockImplementation(async (accountId: number) => ({
      account: {
        type: "chatgpt",
        email:
          accountId === signedInAccount2.id
            ? "updated-personal@example.com"
            : signedInAccount.email,
        planType: accountId === signedInAccount2.id ? "plus" : "pro",
      },
      requiresOpenaiAuth: true,
    }));

    await renderApp();
    const selectedButton = await screen.findByLabelText("Codex account");
    expect(within(selectedButton).getByText("dev@example.com")).toBeInTheDocument();

    await act(async () => {
      mocks.listeners.get("codex:notification")?.({
        payload: {
          accountId: 8,
          message: {
            method: "account/updated",
            params: { authMode: "chatgpt", planType: "plus" },
          },
        },
      });
    });

    expect(within(selectedButton).getByText("dev@example.com")).toBeInTheDocument();
    expect(
      within(selectedButton).queryByText("updated-personal@example.com"),
    ).not.toBeInTheDocument();
  });

  it("removes only the selected managed account profile", async () => {
    mocks.listCodexAccountsMock.mockResolvedValue([signedInAccount]);
    mocks.readCodexAccountMock.mockResolvedValue({
      account: {
        type: "chatgpt",
        email: signedInAccount.email,
        planType: signedInAccount.plan_type,
      },
      requiresOpenaiAuth: true,
    });

    const { user } = await renderApp();
    await user.click(screen.getByRole("button", { name: "Settings" }));
    await user.click(
      await screen.findByRole("button", { name: "Remove dev@example.com" }),
    );

    expect(mocks.deleteCodexProfileMock).toHaveBeenCalledWith(7);
    expect(mocks.softDeleteCodexAccountMock).toHaveBeenCalledWith(7);
  });

  it("records the selected account when creating a run", async () => {
    prepareSignedInRun();

    const { user } = await renderApp();
    await user.type(screen.getByLabelText("Prompt"), "Fix the auth flow");
    await user.click(screen.getByRole("button", { name: /run codex/i }));

    await waitFor(() =>
      expect(mocks.createRunMock).toHaveBeenCalledWith(
        expect.objectContaining({
          accountId: 7,
          accountLabel: "dev@example.com",
          accountEmail: "dev@example.com",
        }),
      ),
    );
    expect(mocks.codexRpcMock).toHaveBeenCalledWith(
      7,
      "thread/start",
      expect.any(Object),
    );
    expect(screen.getByLabelText("Prompt")).toHaveValue("");
    const transcript = screen.getByLabelText("Task chat transcript");
    expect(transcript).toBeInTheDocument();
    expect(within(transcript).getByLabelText("Submitted prompt")).toHaveTextContent(
      "Fix the auth flow",
    );
    expect(screen.queryByLabelText("Run history")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Codex run console")).not.toBeInTheDocument();
  });

  it("shows the submitted prompt immediately while run setup is pending", async () => {
    prepareSignedInRun();
    let resolveCreateTask!: (value: { id: number }) => void;
    mocks.createTaskMock.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveCreateTask = resolve;
      }),
    );

    const { user } = await renderApp();
    const animationFrames = holdNextAnimationFrames();
    await user.type(screen.getByLabelText("Prompt"), "Fix slow submission");
    try {
      await user.keyboard("{Enter}");

      expect(screen.getByLabelText("Prompt")).toHaveValue("");
      const transcript = await screen.findByLabelText("Task chat transcript");
      expect(within(transcript).getByLabelText("Submitted prompt")).toHaveTextContent(
        "Fix slow submission",
      );
      expect(screen.getByLabelText("Preparing run")).toHaveTextContent(
        "Preparing run...",
      );
      expect(screen.queryByRole("button", { name: /run codex/i })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: /stop codex/i })).toBeEnabled();
      expect(mocks.runPreflightMock).not.toHaveBeenCalled();
      expect(mocks.createTaskMock).not.toHaveBeenCalled();
      expect(mocks.codexRpcMock).not.toHaveBeenCalled();

      await animationFrames.flush();
      await waitFor(() => expect(mocks.createTaskMock).toHaveBeenCalledTimes(1));

      await act(async () => {
        resolveCreateTask({ id: 101 });
      });
      await waitFor(() =>
        expect(mocks.codexRpcMock).toHaveBeenCalledWith(
          7,
          "turn/start",
          expect.any(Object),
        ),
      );
      expect(screen.getAllByLabelText("Submitted prompt")).toHaveLength(1);
    } finally {
      animationFrames.restore();
    }
  });

  it("stops an optimistic run before deferred setup starts", async () => {
    prepareSignedInRun();

    const { user } = await renderApp();
    const animationFrames = holdNextAnimationFrames();
    await user.type(screen.getByLabelText("Prompt"), "Stop while preparing");
    try {
      await user.keyboard("{Enter}");

      expect(mocks.runPreflightMock).not.toHaveBeenCalled();
      expect(mocks.createTaskMock).not.toHaveBeenCalled();

      await user.click(screen.getByRole("button", { name: /stop codex/i }));

      expect(screen.getByLabelText("Prompt")).toHaveValue("Stop while preparing");
      expect(
        within(screen.getByLabelText("Run summary")).getByText("Stopped by user."),
      ).toBeInTheDocument();
      expect(mocks.stopCodexMock).not.toHaveBeenCalled();
      expect(mocks.runPreflightMock).not.toHaveBeenCalled();
      expect(mocks.createTaskMock).not.toHaveBeenCalled();
      expect(mocks.createRunMock).not.toHaveBeenCalled();
      expect(mocks.codexRpcMock).not.toHaveBeenCalled();

      await animationFrames.flush();
      expect(mocks.runPreflightMock).not.toHaveBeenCalled();
      expect(mocks.createTaskMock).not.toHaveBeenCalled();
      expect(mocks.codexRpcMock).not.toHaveBeenCalled();
    } finally {
      animationFrames.restore();
    }
  });

  it("restores the prompt and marks the optimistic entry failed when setup fails before a run is created", async () => {
    prepareSignedInRun();
    let rejectPreflight!: (error: Error) => void;
    mocks.runPreflightMock.mockReturnValueOnce(
      new Promise((_resolve, reject) => {
        rejectPreflight = reject;
      }),
    );

    const { user } = await renderApp();
    const promptInput = screen.getByLabelText("Prompt");
    await user.type(promptInput, "Try a failing setup");
    await user.keyboard("{Enter}");

    expect(promptInput).toHaveValue("");
    expect(screen.getByLabelText("Preparing run")).toHaveTextContent(
      "Preparing run...",
    );
    await waitFor(() => expect(mocks.runPreflightMock).toHaveBeenCalledTimes(1));
    await act(async () => {
      rejectPreflight(new Error("Preflight failed"));
    });
    expect(await screen.findByText("Preflight failed")).toBeInTheDocument();
    expect(screen.getByLabelText("Prompt")).toHaveValue("Try a failing setup");
    expect(mocks.createTaskMock).not.toHaveBeenCalled();
    expect(mocks.createRunMock).not.toHaveBeenCalled();
    expect(mocks.codexRpcMock).not.toHaveBeenCalled();
  });

  it("ignores duplicate Enter submissions while optimistic setup is active", async () => {
    prepareSignedInRun();
    let resolveCreateTask!: (value: { id: number }) => void;
    mocks.createTaskMock.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveCreateTask = resolve;
      }),
    );

    const { user } = await renderApp();
    await user.type(screen.getByLabelText("Prompt"), "Run only once");
    await user.keyboard("{Enter}{Enter}");

    await screen.findByLabelText("Task chat transcript");
    await waitFor(() => expect(mocks.createTaskMock).toHaveBeenCalledTimes(1));
    expect(screen.getAllByLabelText("Submitted prompt")).toHaveLength(1);

    await act(async () => {
      resolveCreateTask({ id: 101 });
    });
    await waitFor(() =>
      expect(mocks.codexRpcMock).toHaveBeenCalledWith(
        7,
        "turn/start",
        expect.any(Object),
      ),
    );
  });

  it("stops an active Codex run from the composer stop button", async () => {
    prepareSignedInRun();

    const { user } = await renderApp();
    await startMockRun(user, "Stop the live run");

    const stopButton = screen.getByRole("button", { name: /stop codex/i });
    expect(stopButton).toBeEnabled();
    await user.click(stopButton);

    await waitFor(() => expect(mocks.stopCodexMock).toHaveBeenCalledWith(7));
    await waitFor(() =>
      expect(mocks.updateRunMock).toHaveBeenCalledWith(
        202,
        expect.objectContaining({
          status: "interrupted",
          error: "Stopped by user.",
        }),
      ),
    );
    expect(mocks.updateTaskStatusMock).toHaveBeenCalledWith(101, "interrupted");
    expect(screen.queryByRole("button", { name: /stop codex/i })).not.toBeInTheDocument();
  });

  it("streams Codex output into the task chat transcript", async () => {
    prepareSignedInRun();

    const { user } = await renderApp();
    await startMockRun(user, "Fix the streaming output");

    await emitCodexNotification({
      method: "item/agentMessage/delta",
      params: { delta: "Updated the auth flow." },
    });

    const transcript = screen.getByLabelText("Task chat transcript");
    expect(transcript).toBeInTheDocument();
    expect(within(transcript).getByLabelText("Submitted prompt")).toHaveTextContent(
      "Fix the streaming output",
    );
    expect(within(transcript).getByText("Updated the auth flow.")).toBeInTheDocument();
  });

  it("renders approval requests inline and resolves them from the chat", async () => {
    prepareSignedInRun();

    const { user } = await renderApp();
    await startMockRun(user, "Run the tests");

    await emitCodexServerRequest({
      id: 9,
      method: "item/commandExecution/requestApproval",
      params: { command: "npm test" },
    });

    expect(screen.getByText("item/commandExecution/requestApproval")).toBeInTheDocument();
    expect(screen.getByText(/npm test/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /approve/i }));
    await waitFor(() =>
      expect(mocks.resolveCodexServerRequestMock).toHaveBeenCalledWith(
        7,
        9,
        expect.any(Object),
      ),
    );
  });

  it("marks completed chat runs and persists the final assistant message", async () => {
    prepareSignedInRun();

    const { user } = await renderApp();
    await startMockRun(user, "Finish the task");

    await emitCodexNotification({
      method: "item/agentMessage/delta",
      params: { itemId: "commentary-1", delta: "I will inspect the repo first." },
    });
    await emitCodexNotification({
      method: "item/completed",
      params: {
        item: {
          type: "agentMessage",
          id: "commentary-1",
          text: "I will inspect the repo first.",
          phase: "commentary",
        },
      },
    });
    await emitCodexNotification({
      method: "item/agentMessage/delta",
      params: { itemId: "final-1", delta: "Done." },
    });
    await emitCodexNotification({
      method: "item/completed",
      params: {
        item: {
          type: "agentMessage",
          id: "final-1",
          text: "Done.",
          phase: "final_answer",
        },
      },
    });
    await emitCodexNotification({
      method: "turn/completed",
      params: { turn: { status: "completed", durationMs: 1234 } },
    });

    await waitFor(() =>
      expect(mocks.updateRunMock).toHaveBeenCalledWith(
        202,
        expect.objectContaining({
          status: "completed",
          durationMs: 1234,
          finalMessage: "Done.",
        }),
      ),
    );
    expect(within(screen.getByLabelText("Run summary")).getByText("Done.")).toBeInTheDocument();
    expect(
      within(screen.getByLabelText("Run summary")).queryByText(
        "I will inspect the repo first.",
      ),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("completed")).not.toBeInTheDocument();
  });

  it("opens completed summary file links in the app preview drawer", async () => {
    prepareSignedInRun();
    mocks.readWorkspaceFilePreviewMock.mockResolvedValue({
      path: "/repo/orchestrator/hello-world.txt",
      relativePath: "hello-world.txt",
      content: "hello world",
      truncated: false,
      isBinary: false,
    });

    const { user } = await renderApp();
    await startMockRun(user, "Update hello-world");

    await emitCodexNotification({
      method: "item/agentMessage/delta",
      params: {
        itemId: "final-1",
        delta: "Updated [hello-world.txt](http://localhost:1420/repo/orchestrator/hello-world.txt).",
      },
    });
    await emitCodexNotification({
      method: "item/completed",
      params: {
        item: {
          type: "agentMessage",
          id: "final-1",
          text: "Updated [hello-world.txt](http://localhost:1420/repo/orchestrator/hello-world.txt).",
          phase: "final_answer",
        },
      },
    });
    await emitCodexNotification({
      method: "turn/completed",
      params: { turn: { status: "completed", durationMs: 1234 } },
    });

    await user.click(
      within(screen.getByLabelText("Run summary")).getByRole("link", {
        name: "hello-world.txt",
      }),
    );

    await waitFor(() =>
      expect(mocks.readWorkspaceFilePreviewMock).toHaveBeenCalledWith(
        workspace.path,
        "/repo/orchestrator/hello-world.txt",
      ),
    );
    expect(screen.getByRole("complementary", { name: "File preview" })).toHaveTextContent(
      "hello world",
    );
  });

  it("strips line references from completed summary file links before previewing", async () => {
    prepareSignedInRun();
    mocks.readWorkspaceFilePreviewMock.mockResolvedValue({
      path: "/repo/orchestrator/hello-world.txt",
      relativePath: "hello-world.txt",
      content: "hello world\npoat",
      truncated: false,
      isBinary: false,
    });

    const { user } = await renderApp();
    await startMockRun(user, "Update hello-world");

    await emitCodexNotification({
      method: "item/agentMessage/delta",
      params: {
        itemId: "final-1",
        delta:
          "Updated [hello-world.txt](http://localhost:1420/repo/orchestrator/hello-world.txt:8).",
      },
    });
    await emitCodexNotification({
      method: "item/completed",
      params: {
        item: {
          type: "agentMessage",
          id: "final-1",
          text:
            "Updated [hello-world.txt](http://localhost:1420/repo/orchestrator/hello-world.txt:8).",
          phase: "final_answer",
        },
      },
    });
    await emitCodexNotification({
      method: "turn/completed",
      params: { turn: { status: "completed", durationMs: 1234 } },
    });

    await user.click(
      within(screen.getByLabelText("Run summary")).getByRole("link", {
        name: "hello-world.txt",
      }),
    );

    await waitFor(() =>
      expect(mocks.readWorkspaceFilePreviewMock).toHaveBeenCalledWith(
        workspace.path,
        "/repo/orchestrator/hello-world.txt",
      ),
    );
    expect(screen.getByRole("complementary", { name: "File preview" })).toHaveTextContent(
      "poat",
    );
  });

  it("opens fresh file contents from completed summary links after a run changes a cached file", async () => {
    prepareSignedInRun();
    const fileEntry = {
      name: "hello-world.txt",
      path: "/repo/orchestrator/hello-world.txt",
      relativePath: "hello-world.txt",
      kind: "file" as const,
    };
    mocks.listWorkspaceDirectoryMock.mockResolvedValue([fileEntry]);
    mocks.readWorkspaceFilePreviewMock
      .mockResolvedValueOnce({
        path: fileEntry.path,
        relativePath: fileEntry.relativePath,
        content: "hello\nhello world\n",
        truncated: false,
        isBinary: false,
      })
      .mockResolvedValue({
        path: fileEntry.path,
        relativePath: fileEntry.relativePath,
        content: "hello\nhello world\npoat\n",
        truncated: false,
        isBinary: false,
      });

    const { user } = await renderApp();
    const workspaceNav = screen.getByRole("navigation", {
      name: "Workspaces",
    });
    await user.click(
      within(workspaceNav).getByRole("button", { name: "Expand orchestrator" }),
    );
    pointerTapFile(
      await within(workspaceNav).findByRole("button", { name: "hello-world.txt" }),
    );
    expect(await screen.findByText("hello world")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Close file preview" }));

    await startMockRun(user, "Add poat");

    await emitCodexNotification({
      method: "item/agentMessage/delta",
      params: {
        itemId: "final-1",
        delta:
          "Added poat to [hello-world.txt](http://localhost:1420/repo/orchestrator/hello-world.txt).",
      },
    });
    await emitCodexNotification({
      method: "item/completed",
      params: {
        item: {
          type: "agentMessage",
          id: "final-1",
          text:
            "Added poat to [hello-world.txt](http://localhost:1420/repo/orchestrator/hello-world.txt).",
          phase: "final_answer",
        },
      },
    });
    await emitCodexNotification({
      method: "turn/completed",
      params: { turn: { status: "completed", durationMs: 1234 } },
    });

    await user.click(
      within(screen.getByLabelText("Run summary")).getByRole("link", {
        name: "hello-world.txt",
      }),
    );

    await waitFor(() =>
      expect(mocks.readWorkspaceFilePreviewMock).toHaveBeenCalledTimes(2),
    );
    expect(screen.getByRole("complementary", { name: "File preview" })).toHaveTextContent(
      "poat",
    );
  });

  it("adds selected slash skills to the next run prompt", async () => {
    mocks.listCodexAccountsMock.mockResolvedValue([signedInAccount]);
    mocks.readCodexAccountMock.mockResolvedValue({
      account: {
        type: "chatgpt",
        email: signedInAccount.email,
        planType: signedInAccount.plan_type,
      },
      requiresOpenaiAuth: true,
    });
    mocks.listCodexSkillsMock.mockResolvedValue([
      {
        id: "docs",
        name: "Docs",
        description: "Use repository documentation",
      },
    ]);
    mocks.codexRpcMock.mockImplementation(
      async (_accountId: number, method: string) => {
        if (method === "thread/start") {
          return { thread: { id: "thread-1" } };
        }
        if (method === "turn/start") {
          return { turn: { id: "turn-1" } };
        }
        return {};
      },
    );

    const { user } = await renderApp();
    const promptInput = screen.getByLabelText("Prompt");
    await user.type(promptInput, "Fix the docs /docs");
    await user.click(await screen.findByRole("option", { name: /docs/i }));
    expect(screen.getByText("Docs")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /run codex/i }));

    await waitFor(() =>
      expect(mocks.codexRpcMock).toHaveBeenCalledWith(
        7,
        "turn/start",
        expect.objectContaining({
          input: [
            expect.objectContaining({
              text: expect.stringContaining("Use these Codex skills"),
            }),
          ],
        }),
      ),
    );
    expect(mocks.codexRpcMock).toHaveBeenCalledWith(
      7,
      "turn/start",
      expect.objectContaining({
        input: [
          expect.objectContaining({
            text: expect.stringContaining("Docs: Use repository documentation"),
          }),
        ],
      }),
    );
  });

  it("blocks unauthenticated runs before thread/start", async () => {
    const { user } = await renderApp();

    await user.type(screen.getByLabelText("Prompt"), "Fix the Codex auth flow");
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /run codex/i })).toBeEnabled(),
    );

    await user.click(screen.getByRole("button", { name: /run codex/i }));

    expect(mocks.runPreflightMock).not.toHaveBeenCalled();
    expect(mocks.createTaskMock).not.toHaveBeenCalled();
    expect(mocks.codexRpcMock).not.toHaveBeenCalled();
  });
});
