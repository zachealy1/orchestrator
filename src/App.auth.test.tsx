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
  deleteCodexProfileMock: vi.fn(),
  readCodexAccountMock: vi.fn(),
  startCodexLoginMock: vi.fn(),
  cancelCodexLoginMock: vi.fn(),
  logoutCodexAccountMock: vi.fn(),
  listCodexModelsMock: vi.fn(),
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
  createCodexAccountMock: vi.fn(),
  updateCodexAccountMock: vi.fn(),
  renameCodexAccountMock: vi.fn(),
  softDeleteCodexAccountMock: vi.fn(),
  listWorkspaceRunsMock: vi.fn(),
  getAnalyticsSummaryMock: vi.fn(),
  createTaskMock: vi.fn(),
  createRunMock: vi.fn(),
  savePreflightReportMock: vi.fn(),
  updateRunMock: vi.fn(),
  updateTaskStatusMock: vi.fn(),
  appendRunEventMock: vi.fn(),
  recordTokenUsageMock: vi.fn(),
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
  connectCodex: mocks.connectCodexMock,
  checkoutGitBranch: mocks.checkoutGitBranchMock,
  deleteCodexProfile: mocks.deleteCodexProfileMock,
  listGitBranches: mocks.listGitBranchesMock,
  listWorkspaceGitStatus: mocks.listWorkspaceGitStatusMock,
  readWorkspaceGitDiff: mocks.readWorkspaceGitDiffMock,
  listCodexModels: mocks.listCodexModelsMock,
  listWorkspaceDirectory: mocks.listWorkspaceDirectoryMock,
  logoutCodexAccount: mocks.logoutCodexAccountMock,
  readCodexAccount: mocks.readCodexAccountMock,
  readCodexFile: mocks.readCodexFileMock,
  readWorkspaceFilePreview: mocks.readWorkspaceFilePreviewMock,
  resolveCodexServerRequest: mocks.resolveCodexServerRequestMock,
  runPreflight: mocks.runPreflightMock,
  setThreadGoal: mocks.setThreadGoalMock,
  startCodexLogin: mocks.startCodexLoginMock,
}));

vi.mock("./db", () => ({
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
  savePreflightReport: mocks.savePreflightReportMock,
  softDeleteCodexAccount: mocks.softDeleteCodexAccountMock,
  updateCodexAccount: mocks.updateCodexAccountMock,
  updateRun: mocks.updateRunMock,
  updateTaskStatus: mocks.updateTaskStatusMock,
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

function prepareDefaults() {
  mocks.connectCodexMock.mockResolvedValue({
    alreadyConnected: false,
    pid: 1234,
    initialize: {},
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
  mocks.cancelCodexLoginMock.mockResolvedValue(undefined);
  mocks.logoutCodexAccountMock.mockResolvedValue(undefined);
  mocks.listCodexModelsMock.mockResolvedValue([]);
  mocks.listGitBranchesMock.mockResolvedValue({
    branches: ["main"],
    currentBranch: "main",
  });
  mocks.listWorkspaceGitStatusMock.mockResolvedValue({
    workspacePath: workspace.path,
    gitRoot: workspace.path,
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
  mocks.createCodexAccountMock.mockResolvedValue(pendingAccount);
  mocks.updateCodexAccountMock.mockResolvedValue(undefined);
  mocks.renameCodexAccountMock.mockResolvedValue(undefined);
  mocks.softDeleteCodexAccountMock.mockResolvedValue(undefined);
  mocks.listWorkspaceRunsMock.mockResolvedValue([]);
  mocks.getAnalyticsSummaryMock.mockResolvedValue(analytics);
  mocks.createTaskMock.mockResolvedValue({ id: 101 });
  mocks.createRunMock.mockResolvedValue({ id: 202 });
  mocks.savePreflightReportMock.mockResolvedValue(undefined);
  mocks.updateRunMock.mockResolvedValue(undefined);
  mocks.updateTaskStatusMock.mockResolvedValue(undefined);
  mocks.appendRunEventMock.mockResolvedValue(undefined);
  mocks.recordTokenUsageMock.mockResolvedValue(undefined);
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

    await user.click(within(primaryNav).getByRole("button", { name: "Runs" }));
    expect(screen.queryByLabelText("Task composer")).not.toBeInTheDocument();
    expect(
      within(workspaceNav).getByRole("button", { name: "orchestrator" }),
    ).not.toHaveAttribute("aria-current");

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

    await user.click(within(workspaceNav).getByRole("button", { name: "README.md" }));

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
          badge: "?",
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

    await waitFor(
      () =>
        expect(mocks.listWorkspaceGitStatusMock.mock.calls.length).toBeGreaterThanOrEqual(
          2,
        ),
      { timeout: 4500 },
    );
    expect(within(workspaceNav).getByLabelText("modified file")).toHaveTextContent("M");
    expect(within(workspaceNav).getByTitle("external.md")).toBeInTheDocument();
    expect(within(workspaceNav).getByLabelText("untracked file")).toHaveTextContent("?");
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

  it("renders deleted ghost files and opens their git diff by default", async () => {
    mocks.listWorkspaceDirectoryMock.mockResolvedValue([]);
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
    mocks.readWorkspaceGitDiffMock.mockResolvedValue({
      path: "/repo/orchestrator/src/old.ts",
      relativePath: "src/old.ts",
      sections: [
        {
          kind: "unstaged",
          title: "Working tree changes",
          baseLabel: "Index:src/old.ts",
          headLabel: "/dev/null",
          baseContent: "export const old = true;\n",
          headContent: "",
          baseTruncated: false,
          headTruncated: false,
          content:
            "diff --git a/src/old.ts b/src/old.ts\n--- a/src/old.ts\n+++ /dev/null\n@@ -1 +0,0 @@\n-export const old = true;\n",
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
    await user.click(await within(workspaceNav).findByRole("button", { name: "Expand src" }));
    const deletedFile = await within(workspaceNav).findByTitle("src/old.ts");
    expect(deletedFile).toHaveAttribute("draggable", "false");

    await user.click(deletedFile);

    await waitFor(() =>
      expect(mocks.readWorkspaceGitDiffMock).toHaveBeenCalledWith(
        workspace.path,
        "/repo/orchestrator/src/old.ts",
      ),
    );
    expect(mocks.readWorkspaceFilePreviewMock).not.toHaveBeenCalledWith(
      workspace.path,
      "/repo/orchestrator/src/old.ts",
    );
    expect(screen.getByRole("button", { name: "Diff" })).toHaveClass("active");
    expect(screen.getByRole("complementary", { name: "File preview" })).toHaveTextContent(
      "export const old = true;",
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
    expect(mocks.listWorkspaceDirectoryMock).toHaveBeenCalledTimes(1);
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
