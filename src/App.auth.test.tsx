import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";

const mocks = vi.hoisted(() => ({
  listeners: new Map<string, (event: { payload: unknown }) => void>(),
  openUrlMock: vi.fn(),
  connectCodexMock: vi.fn(),
  stopCodexMock: vi.fn(),
  deleteCodexProfileMock: vi.fn(),
  readCodexAccountMock: vi.fn(),
  startCodexLoginMock: vi.fn(),
  cancelCodexLoginMock: vi.fn(),
  logoutCodexAccountMock: vi.fn(),
  listCodexModelsMock: vi.fn(),
  listGitBranchesMock: vi.fn(),
  checkoutGitBranchMock: vi.fn(),
  runPreflightMock: vi.fn(),
  readCodexFileMock: vi.fn(),
  setThreadGoalMock: vi.fn(),
  resolveCodexServerRequestMock: vi.fn(),
  codexRpcMock: vi.fn(),
  listWorkspacesMock: vi.fn(),
  listCodexAccountsMock: vi.fn(),
  createCodexAccountMock: vi.fn(),
  updateCodexAccountMock: vi.fn(),
  renameCodexAccountMock: vi.fn(),
  setWorkspaceDefaultAccountMock: vi.fn(),
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
  open: vi.fn(),
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
  listCodexModels: mocks.listCodexModelsMock,
  logoutCodexAccount: mocks.logoutCodexAccountMock,
  readCodexAccount: mocks.readCodexAccountMock,
  readCodexFile: mocks.readCodexFileMock,
  resolveCodexServerRequest: mocks.resolveCodexServerRequestMock,
  runPreflight: mocks.runPreflightMock,
  setThreadGoal: mocks.setThreadGoalMock,
  startCodexLogin: mocks.startCodexLoginMock,
  stopCodex: mocks.stopCodexMock,
}));

vi.mock("./db", () => ({
  appendRunEvent: mocks.appendRunEventMock,
  createCodexAccount: mocks.createCodexAccountMock,
  createRun: mocks.createRunMock,
  createTask: mocks.createTaskMock,
  getAnalyticsSummary: mocks.getAnalyticsSummaryMock,
  listCodexAccounts: mocks.listCodexAccountsMock,
  listWorkspaceRuns: mocks.listWorkspaceRunsMock,
  listWorkspaces: mocks.listWorkspacesMock,
  recordTokenUsage: mocks.recordTokenUsageMock,
  renameCodexAccount: mocks.renameCodexAccountMock,
  savePreflightReport: mocks.savePreflightReportMock,
  setWorkspaceDefaultAccount: mocks.setWorkspaceDefaultAccountMock,
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
  mocks.stopCodexMock.mockResolvedValue(undefined);
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
  mocks.checkoutGitBranchMock.mockResolvedValue({ branch: "main" });
  mocks.runPreflightMock.mockResolvedValue(preflight);
  mocks.readCodexFileMock.mockResolvedValue("file contents");
  mocks.setThreadGoalMock.mockResolvedValue(undefined);
  mocks.resolveCodexServerRequestMock.mockResolvedValue(undefined);
  mocks.codexRpcMock.mockResolvedValue(undefined);
  mocks.listWorkspacesMock.mockResolvedValue([workspace]);
  mocks.listCodexAccountsMock.mockResolvedValue([]);
  mocks.createCodexAccountMock.mockResolvedValue(pendingAccount);
  mocks.updateCodexAccountMock.mockResolvedValue(undefined);
  mocks.renameCodexAccountMock.mockResolvedValue(undefined);
  mocks.setWorkspaceDefaultAccountMock.mockResolvedValue(undefined);
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
}

async function renderApp() {
  const user = userEvent.setup();
  render(<App />);
  await waitFor(() => expect(mocks.listCodexAccountsMock).toHaveBeenCalled());
  return { user };
}

describe("App Codex auth", () => {
  beforeEach(() => {
    mocks.listeners.clear();
    vi.clearAllMocks();
    vi.useRealTimers();
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
    expect(screen.queryByLabelText("Stop Codex")).not.toBeInTheDocument();
    expect(screen.queryByText("Refresh")).not.toBeInTheDocument();

    await user.click(signIn);
    await waitFor(() => expect(mocks.connectCodexMock).toHaveBeenCalledWith(7));
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
    expect(screen.getByLabelText("Stop Codex")).toBeInTheDocument();
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

  it("switches accounts and saves the workspace default", async () => {
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
    await user.click(
      within(accountList).getByRole("button", { name: /personal@example.com/i }),
    );

    await waitFor(() =>
      expect(screen.getByLabelText("Run account")).toHaveValue("8"),
    );
    await user.click(
      screen.getByRole("button", {
        name: "Use selected account as workspace default",
      }),
    );
    expect(mocks.setWorkspaceDefaultAccountMock).toHaveBeenCalledWith(1, 8);
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
