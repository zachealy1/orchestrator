import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { ASK_FOR_APPROVAL_PERMISSION_PROFILE } from "./lib/codexAccess";
import {
  ORCHESTRATOR_CONTEXT_FILE_MIME,
  type RunListItem,
} from "./types";

const mocks = vi.hoisted(() => ({
  listeners: new Map<string, (event: { payload: unknown }) => void>(),
  openDialogMock: vi.fn(),
  openUrlMock: vi.fn(),
  connectCodexMock: vi.fn(),
  connectDefaultCodexProfileMock: vi.fn(),
  commitWorkspaceChangesMock: vi.fn(),
  generateChatTitleMock: vi.fn(),
  generateWorkspaceCommitMessageMock: vi.fn(),
  pushWorkspaceBranchMock: vi.fn(),
  deleteCodexProfileMock: vi.fn(),
  readCodexAccountMock: vi.fn(),
  startCodexLoginMock: vi.fn(),
  stopCodexMock: vi.fn(),
  stopDefaultCodexProfileMock: vi.fn(),
  readBrowserRuntimeStatusMock: vi.fn(),
  prepareBrowserSessionMock: vi.fn(),
  readBrowserSessionStatusMock: vi.fn(),
  focusBrowserSessionMock: vi.fn(),
  updateBrowserSessionTargetMock: vi.fn(),
  stopBrowserSessionMock: vi.fn(),
  readAgentNotificationPermissionStatusMock: vi.fn(),
  requestAgentNotificationPermissionMock: vi.fn(),
  sendAgentNotificationMock: vi.fn(),
  removeAgentNotificationMock: vi.fn(),
  takePendingAgentNotificationActivationMock: vi.fn(),
  openAgentNotificationSettingsMock: vi.fn(),
  cancelCodexLoginMock: vi.fn(),
  logoutCodexAccountMock: vi.fn(),
  listCodexModelsMock: vi.fn(),
  listCodexSkillsMock: vi.fn(),
  listGitBranchesMock: vi.fn(),
  listWorkspaceGitStatusMock: vi.fn(),
  readWorkspaceGitDiffMock: vi.fn(),
  undoWorkspaceGitDiffMock: vi.fn(),
  listWorkspaceDirectoryMock: vi.fn(),
  readWorkspaceFilePreviewMock: vi.fn(),
  prepareImageAttachmentMock: vi.fn(),
  checkoutGitBranchMock: vi.fn(),
  runPreflightMock: vi.fn(),
  readCodexFileMock: vi.fn(),
  readDefaultCodexFileMock: vi.fn(),
  setThreadGoalMock: vi.fn(),
  resolveCodexServerRequestMock: vi.fn(),
  resolveDefaultCodexServerRequestMock: vi.fn(),
  codexRpcMock: vi.fn(),
  codexDefaultProfileRpcMock: vi.fn(),
  loadDefaultProfileTurnActivityMock: vi.fn(),
  indexDefaultProfileThreadMock: vi.fn(),
  cancelDefaultProfileThreadIndexMock: vi.fn(),
  syncDefaultProfileThreadTranscriptMock: vi.fn(),
  cancelDefaultProfileThreadTranscriptMock: vi.fn(),
  listWorkspacesMock: vi.fn(),
  listCodexAccountsMock: vi.fn(),
  listDuplicateProfilesPendingCleanupMock: vi.fn(),
  completeDuplicateProfileCleanupMock: vi.fn(),
  createChatMock: vi.fn(),
  claimChatTitleGenerationMock: vi.fn(),
  completeChatTitleGenerationMock: vi.fn(),
  failChatTitleGenerationMock: vi.fn(),
  recoverInterruptedChatTitleGenerationsMock: vi.fn(),
  updateChatMock: vi.fn(),
  listWorkspaceChatsMock: vi.fn(),
  getChatWithRunsMock: vi.fn(),
  listChatRunsPageMock: vi.fn(),
  buildLocalChatHistoryIndexMock: vi.fn(),
  readExternalChatHistoryIndexMock: vi.fn(),
  saveExternalChatHistoryIndexMock: vi.fn(),
  listLocalChatTranscriptMock: vi.fn(),
  readExternalTranscriptSnapshotMock: vi.fn(),
  activateExternalTranscriptSnapshotMock: vi.fn(),
  softDeleteChatMock: vi.fn(),
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
  appendRunEventsMock: vi.fn(),
  recordTokenUsageMock: vi.fn(),
  softDeleteRunMock: vi.fn(),
  upsertWorkspaceMock: vi.fn(),
  upsertExternalCodexChatsMock: vi.fn(),
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

vi.mock("react-virtuoso", async () => {
  const React = await import("react");
  return {
    Virtuoso: React.forwardRef(function TestVirtuoso(props: any, ref) {
      const scrollerRef = React.useRef<HTMLDivElement | null>(null);
      React.useImperativeHandle(ref, () => ({
        getState: (callback: (state: unknown) => void) =>
          callback({ ranges: [], scrollTop: 0 }),
        scrollToIndex: () => undefined,
      }));
      React.useEffect(() => {
        props.scrollerRef?.(scrollerRef.current);
        return () => props.scrollerRef?.(null);
      }, [props.scrollerRef]);
      React.useEffect(() => {
        const data = props.data ?? [];
        if (data.length > 0) {
          props.rangeChanged?.({
            startIndex: props.firstItemIndex,
            endIndex: props.firstItemIndex + data.length - 1,
          });
          props.atBottomStateChange?.(true);
        }
      }, [props.data?.length, props.firstItemIndex]);

      const data = props.data ?? [];
      const startIndex = Math.max(0, data.length - 24);

      return (
        <div
          aria-label={props["aria-label"]}
          className={props.className}
          ref={scrollerRef}
          role={props.role}
          tabIndex={props.tabIndex}
        >
          {data.slice(startIndex).map((entry: any, offset: number) => {
            const index = startIndex + offset;
            return (
              <div key={props.computeItemKey(index, entry)}>
                {props.itemContent(index, entry)}
              </div>
            );
          })}
        </div>
      );
    }),
  };
});

vi.mock("./codexClient", () => ({
  cancelCodexLogin: mocks.cancelCodexLoginMock,
  codexDefaultProfileRpc: mocks.codexDefaultProfileRpcMock,
  codexRpc: mocks.codexRpcMock,
  commitWorkspaceChanges: mocks.commitWorkspaceChangesMock,
  connectDefaultCodexProfile: mocks.connectDefaultCodexProfileMock,
  connectCodex: mocks.connectCodexMock,
  checkoutGitBranch: mocks.checkoutGitBranchMock,
  deleteCodexProfile: mocks.deleteCodexProfileMock,
  generateChatTitle: mocks.generateChatTitleMock,
  generateWorkspaceCommitMessage: mocks.generateWorkspaceCommitMessageMock,
  listGitBranches: mocks.listGitBranchesMock,
  listWorkspaceGitStatus: mocks.listWorkspaceGitStatusMock,
  readWorkspaceGitDiff: mocks.readWorkspaceGitDiffMock,
  undoWorkspaceGitDiff: mocks.undoWorkspaceGitDiffMock,
  listCodexModels: mocks.listCodexModelsMock,
  listCodexSkills: mocks.listCodexSkillsMock,
  listWorkspaceDirectory: mocks.listWorkspaceDirectoryMock,
  loadDefaultProfileTurnActivity: mocks.loadDefaultProfileTurnActivityMock,
  indexDefaultProfileThread: mocks.indexDefaultProfileThreadMock,
  cancelDefaultProfileThreadIndex: mocks.cancelDefaultProfileThreadIndexMock,
  syncDefaultProfileThreadTranscript:
    mocks.syncDefaultProfileThreadTranscriptMock,
  cancelDefaultProfileThreadTranscript:
    mocks.cancelDefaultProfileThreadTranscriptMock,
  logoutCodexAccount: mocks.logoutCodexAccountMock,
  pushWorkspaceBranch: mocks.pushWorkspaceBranchMock,
  readCodexAccount: mocks.readCodexAccountMock,
  readCodexFile: mocks.readCodexFileMock,
  readDefaultCodexFile: mocks.readDefaultCodexFileMock,
  readWorkspaceFilePreview: mocks.readWorkspaceFilePreviewMock,
  prepareImageAttachment: mocks.prepareImageAttachmentMock,
  resolveDefaultCodexServerRequest: mocks.resolveDefaultCodexServerRequestMock,
  resolveCodexServerRequest: mocks.resolveCodexServerRequestMock,
  runPreflight: mocks.runPreflightMock,
  setThreadGoal: mocks.setThreadGoalMock,
  startCodexLogin: mocks.startCodexLoginMock,
  stopDefaultCodexProfile: mocks.stopDefaultCodexProfileMock,
  stopCodex: mocks.stopCodexMock,
  readBrowserRuntimeStatus: mocks.readBrowserRuntimeStatusMock,
  prepareBrowserSession: mocks.prepareBrowserSessionMock,
  readBrowserSessionStatus: mocks.readBrowserSessionStatusMock,
  focusBrowserSession: mocks.focusBrowserSessionMock,
  updateBrowserSessionTarget: mocks.updateBrowserSessionTargetMock,
  stopBrowserSession: mocks.stopBrowserSessionMock,
  readAgentNotificationPermissionStatus:
    mocks.readAgentNotificationPermissionStatusMock,
  requestAgentNotificationPermission: mocks.requestAgentNotificationPermissionMock,
  sendAgentNotification: mocks.sendAgentNotificationMock,
  removeAgentNotification: mocks.removeAgentNotificationMock,
  takePendingAgentNotificationActivation:
    mocks.takePendingAgentNotificationActivationMock,
  openAgentNotificationSettings: mocks.openAgentNotificationSettingsMock,
}));

vi.mock("./db", () => ({
  appendRunEvent: mocks.appendRunEventMock,
  appendRunEvents: mocks.appendRunEventsMock,
  buildLocalChatHistoryIndex: mocks.buildLocalChatHistoryIndexMock,
  claimChatTitleGeneration: mocks.claimChatTitleGenerationMock,
  completeDuplicateProfileCleanup: mocks.completeDuplicateProfileCleanupMock,
  completeChatTitleGeneration: mocks.completeChatTitleGenerationMock,
  createChat: mocks.createChatMock,
  createCodexAccount: mocks.createCodexAccountMock,
  createRun: mocks.createRunMock,
  createTask: mocks.createTaskMock,
  getChatWithRuns: mocks.getChatWithRunsMock,
  getAnalyticsSummary: mocks.getAnalyticsSummaryMock,
  listChatRunsPage: mocks.listChatRunsPageMock,
  listCodexAccounts: mocks.listCodexAccountsMock,
  listDuplicateProfilesPendingCleanup:
    mocks.listDuplicateProfilesPendingCleanupMock,
  listWorkspaceChats: mocks.listWorkspaceChatsMock,
  listWorkspaceRuns: mocks.listWorkspaceRunsMock,
  listWorkspaces: mocks.listWorkspacesMock,
  recordTokenUsage: mocks.recordTokenUsageMock,
  readExternalChatHistoryIndex: mocks.readExternalChatHistoryIndexMock,
  readExternalTranscriptSnapshot: mocks.readExternalTranscriptSnapshotMock,
  recoverInterruptedChatTitleGenerations:
    mocks.recoverInterruptedChatTitleGenerationsMock,
  renameCodexAccount: mocks.renameCodexAccountMock,
  softDeleteWorkspace: mocks.softDeleteWorkspaceMock,
  savePreflightReport: mocks.savePreflightReportMock,
  saveExternalChatHistoryIndex: mocks.saveExternalChatHistoryIndexMock,
  activateExternalTranscriptSnapshot:
    mocks.activateExternalTranscriptSnapshotMock,
  listLocalChatTranscript: mocks.listLocalChatTranscriptMock,
  softDeleteChat: mocks.softDeleteChatMock,
  softDeleteCodexAccount: mocks.softDeleteCodexAccountMock,
  softDeleteRun: mocks.softDeleteRunMock,
  failChatTitleGeneration: mocks.failChatTitleGenerationMock,
  updateCodexAccount: mocks.updateCodexAccountMock,
  updateChat: mocks.updateChatMock,
  updateRun: mocks.updateRunMock,
  updateTaskStatus: mocks.updateTaskStatusMock,
  upsertExternalCodexChats: mocks.upsertExternalCodexChatsMock,
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

type WorkspaceRunFixture = RunListItem & {
  latest_diff?: string | null;
};

function workspaceRunFixture(
  overrides: Partial<WorkspaceRunFixture> = {},
): WorkspaceRunFixture {
  return {
    id: 301,
    task_id: 101,
    workspace_id: workspace.id,
    chat_id: 401,
    turn_index: 1,
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
    final_message: "Done.",
    error: null,
    original_prompt: "Fix the app",
    improved_prompt: "Objective\nFix the app",
    route_recommendation: "direct-run" as const,
    budget_tokens: 42,
    latest_total_tokens: 1280,
    latest_run_tokens: 640,
    latest_run_cached_input_tokens: 50,
    latest_context_tokens: 640,
    latest_model_context_window: 128000,
    collaboration_mode: "default" as const,
    run_intent: "normal" as const,
    client_user_message_id: null,
    completed_plan_item_id: null,
    completed_plan_text: null,
    plan_review_state: "none" as const,
    execution_settings_json: null,
    ...overrides,
  };
}

function workspaceChatFixture(
  overrides: Partial<{
    id: number;
    title: string;
    codex_thread_id: string | null;
    origin: "orchestrator" | "codex_external";
    profile_key: `account:${number}` | "default" | null;
    external_thread_id: string | null;
    source_kind: string | null;
    status: string;
    turn_count: number;
    total_tokens: number | null;
    duration_ms: number | null;
    latest_activity_at: string;
  }> = {},
) {
  return {
    id: overrides.id ?? 401,
    workspace_id: workspace.id,
    account_id: 7,
    account_label: "dev@example.com",
    account_email: "dev@example.com",
    title: overrides.title ?? "Fix the app",
    codex_thread_id: overrides.codex_thread_id ?? "thread-1",
    origin: overrides.origin ?? "orchestrator",
    profile_key: overrides.profile_key ?? "account:7",
    external_thread_id: overrides.external_thread_id ?? null,
    source_kind: overrides.source_kind ?? null,
    sync_status: "synced",
    external_cwd: null,
    external_created_at: null,
    external_updated_at: null,
    last_synced_at: null,
    status: overrides.status ?? "completed",
    created_at: "2026-06-30T09:00:00Z",
    updated_at: "2026-06-30T09:01:00Z",
    deleted_at: null,
    latest_activity_at: overrides.latest_activity_at ?? "2026-06-30T09:01:00Z",
    turn_count: overrides.turn_count ?? 1,
    total_tokens: overrides.total_tokens ?? 1280,
    duration_ms: overrides.duration_ms ?? 60000,
    latest_model: "GPT-5.5",
  };
}

function workspaceChatWithRunsFixture(
  chat = workspaceChatFixture(),
  runs = [workspaceRunFixture({ chat_id: chat.id, original_prompt: chat.title })],
) {
  return { chat, runs };
}

function externalTurnFixture(index: number) {
  return {
    id: `external-turn-${index}`,
    status: "completed",
    createdAt: `2026-06-30T09:${String(index % 60).padStart(2, "0")}:00Z`,
    completedAt: `2026-06-30T09:${String(index % 60).padStart(2, "0")}:30Z`,
    items: [
      { type: "userMessage", text: `External prompt ${index}` },
      {
        type: "agentMessage",
        phase: "final_answer",
        text: `External result ${index}.`,
      },
    ],
  };
}

function externalTranscriptSnapshotFixture(count: number) {
  return {
    requestId: "transcript-sync-large",
    threadId: "external-thread-large",
    sourceVersion: "2026-06-30T10:30:00Z",
    totalTurns: count,
    turns: Array.from({ length: count }, (_, slotIndex) => ({
      slotIndex,
      turnId: `external-turn-${slotIndex + 1}`,
      prompt: `External prompt ${slotIndex + 1}`,
      finalMessage: `External result ${slotIndex + 1}.`,
      error: null,
      status: "completed",
      startedAt: "2026-06-30T09:00:00Z",
      completedAt: "2026-06-30T09:00:30Z",
      durationMs: 30_000,
      totalTokens: 1_000 + slotIndex,
      modelContextWindow: 128_000,
    })),
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
  mocks.generateWorkspaceCommitMessageMock.mockRejectedValue(
    new Error("Codex unavailable"),
  );
  mocks.generateChatTitleMock.mockResolvedValue({
    title: "Fix Authentication Flow",
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
  mocks.stopDefaultCodexProfileMock.mockResolvedValue(undefined);
  mocks.readBrowserRuntimeStatusMock.mockResolvedValue({
    available: true,
    message: null,
  });
  mocks.prepareBrowserSessionMock.mockImplementation(async (target) => ({
    token: "0123456789abcdef0123456789abcdef",
    config: {
      mcp_servers: {
        playwright: {
          enabled: true,
        },
      },
    },
    state: {
      token: "0123456789abcdef0123456789abcdef",
      status: "prepared",
      target,
      browserPid: null,
      error: null,
    },
  }));
  mocks.readBrowserSessionStatusMock.mockImplementation(async (token) => ({
    token,
    status: "ready",
    target: {
      profileKey: "account:1",
      workspaceId: 1,
      chatId: null,
      runId: null,
      entryId: "entry",
      threadId: null,
      turnId: null,
      accessMode: "ask-for-approval",
    },
    browserPid: null,
    error: null,
  }));
  mocks.focusBrowserSessionMock.mockImplementation(
    async (token) => ({
      ...(await mocks.readBrowserSessionStatusMock(token)),
      status: "running",
    }),
  );
  mocks.updateBrowserSessionTargetMock.mockImplementation(
    async (token, target) => ({
      token,
      status: "ready",
      target,
      browserPid: null,
      error: null,
    }),
  );
  mocks.stopBrowserSessionMock.mockImplementation(async (token) => ({
    ...(await mocks.readBrowserSessionStatusMock(token)),
    status: "stopped",
  }));
  mocks.readAgentNotificationPermissionStatusMock.mockResolvedValue("unavailable");
  mocks.requestAgentNotificationPermissionMock.mockResolvedValue("allowed");
  mocks.sendAgentNotificationMock.mockResolvedValue({
    delivered: true,
    notificationId: "notification-1",
    permissionStatus: "allowed",
  });
  mocks.removeAgentNotificationMock.mockResolvedValue(undefined);
  mocks.takePendingAgentNotificationActivationMock.mockResolvedValue(null);
  mocks.openAgentNotificationSettingsMock.mockResolvedValue(undefined);
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
  mocks.prepareImageAttachmentMock.mockImplementation(async (path: string) =>
    /\.(?:gif|jpe?g|png|webp)$/i.test(path)
      ? {
          path,
          mimeType: "image/png",
          width: 640,
          height: 480,
          thumbnailDataUrl:
            "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB",
        }
      : null,
  );
  mocks.undoWorkspaceGitDiffMock.mockResolvedValue({
    message: "Undid changes to 1 file",
    branch: "main",
  });
  mocks.checkoutGitBranchMock.mockResolvedValue({ branch: "main" });
  mocks.runPreflightMock.mockResolvedValue(preflight);
  mocks.readCodexFileMock.mockResolvedValue("file contents");
  mocks.readDefaultCodexFileMock.mockResolvedValue("file contents");
  mocks.setThreadGoalMock.mockResolvedValue(undefined);
  mocks.resolveCodexServerRequestMock.mockResolvedValue(undefined);
  mocks.resolveDefaultCodexServerRequestMock.mockResolvedValue(undefined);
  mocks.codexRpcMock.mockResolvedValue(undefined);
  mocks.codexDefaultProfileRpcMock.mockResolvedValue(undefined);
  mocks.loadDefaultProfileTurnActivityMock.mockResolvedValue({
    commands: [],
    editedFiles: [],
    nextCursor: null,
  });
  mocks.cancelDefaultProfileThreadIndexMock.mockResolvedValue(undefined);
  mocks.cancelDefaultProfileThreadTranscriptMock.mockResolvedValue(undefined);
  mocks.syncDefaultProfileThreadTranscriptMock.mockResolvedValue({
    requestId: "transcript-sync-1",
    threadId: "thread-external",
    sourceVersion: "2026-06-30T09:01:00Z",
    totalTurns: 1,
    turns: [
      {
        slotIndex: 0,
        turnId: "turn-external",
        prompt: "External prompt",
        finalMessage: "External answer.",
        error: null,
        status: "completed",
        startedAt: "2026-06-30T09:00:00Z",
        completedAt: "2026-06-30T09:01:00Z",
        durationMs: 60_000,
        totalTokens: 1_280,
        modelContextWindow: 128_000,
      },
    ],
  });
  mocks.indexDefaultProfileThreadMock.mockResolvedValue({
    requestId: "history-index-1",
    threadId: "thread-external",
    sourceVersion: "2026-06-30T09:01:00Z",
    totalTurns: 1,
    pageSize: 20,
    pages: [
      {
        id: "external:thread-external:0",
        pageIndex: 0,
        startIndex: 0,
        turnCount: 1,
        cursor: null,
        localOffset: null,
      },
    ],
    hints: [
      {
        slotIndex: 0,
        turnId: "turn-external",
        promptCharacters: 24,
        responseCharacters: 32,
        promptLines: 1,
        responseLines: 1,
      },
    ],
  });
  mocks.connectDefaultCodexProfileMock.mockResolvedValue({
    pid: 500,
    alreadyConnected: false,
    initialize: {},
  });
  mocks.listWorkspacesMock.mockResolvedValue([workspace]);
  mocks.listCodexAccountsMock.mockResolvedValue([]);
  mocks.listDuplicateProfilesPendingCleanupMock.mockResolvedValue([]);
  mocks.completeDuplicateProfileCleanupMock.mockResolvedValue(undefined);
  mocks.recoverInterruptedChatTitleGenerationsMock.mockResolvedValue(undefined);
  mocks.claimChatTitleGenerationMock.mockResolvedValue(true);
  mocks.completeChatTitleGenerationMock.mockResolvedValue(true);
  mocks.failChatTitleGenerationMock.mockResolvedValue(true);
  mocks.createChatMock.mockResolvedValue({
    id: 401,
    workspace_id: workspace.id,
    account_id: 7,
    title: "Fix the auth flow",
    codex_thread_id: null,
    status: "starting",
    origin: "orchestrator",
    profile_key: "account:7",
    external_thread_id: null,
    source_kind: null,
    sync_status: null,
    external_cwd: null,
    external_created_at: null,
    external_updated_at: null,
    last_synced_at: null,
    created_at: "2026-06-30T09:00:00Z",
    updated_at: "2026-06-30T09:00:00Z",
    deleted_at: null,
  });
  mocks.updateChatMock.mockResolvedValue(undefined);
  mocks.listWorkspaceChatsMock.mockResolvedValue([]);
  mocks.getChatWithRunsMock.mockImplementation(async (chatId: number) =>
    workspaceChatWithRunsFixture(workspaceChatFixture({ id: chatId })),
  );
  mocks.listChatRunsPageMock.mockImplementation(
    async (chatId: number, offset: number, limit: number) => {
      const chat = await mocks.getChatWithRunsMock(chatId);
      return chat.runs.slice(offset, offset + limit);
    },
  );
  mocks.listLocalChatTranscriptMock.mockImplementation(async (chatId: number) => {
    const chat = await mocks.getChatWithRunsMock(chatId);
    return chat.runs;
  });
  mocks.readExternalTranscriptSnapshotMock.mockResolvedValue(null);
  mocks.activateExternalTranscriptSnapshotMock.mockResolvedValue(undefined);
  mocks.buildLocalChatHistoryIndexMock.mockImplementation(async (chat: any) => {
    const totalTurns = Math.max(0, Number(chat.turn_count) || 0);
    const pages = [];
    for (let startIndex = 0; startIndex < totalTurns; startIndex += 20) {
      const pageIndex: number = pages.length;
      pages.push({
        id: `local:${chat.id}:${pageIndex}`,
        pageIndex,
        startIndex,
        turnCount: Math.min(20, totalTurns - startIndex),
        cursor: null,
        localOffset: startIndex,
      });
    }
    return {
      chatId: chat.id,
      threadId: chat.codex_thread_id,
      sourceVersion: chat.updated_at,
      totalTurns,
      pageSize: 20,
      pages,
      hints: Array.from({ length: totalTurns }, (_, slotIndex) => ({
        slotIndex,
        turnId: `turn-${slotIndex + 1}`,
        promptCharacters: 24,
        responseCharacters: 32,
        promptLines: 1,
        responseLines: 1,
      })),
    };
  });
  mocks.readExternalChatHistoryIndexMock.mockResolvedValue(null);
  mocks.saveExternalChatHistoryIndexMock.mockResolvedValue(undefined);
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
  mocks.appendRunEventsMock.mockResolvedValue(undefined);
  mocks.recordTokenUsageMock.mockResolvedValue(undefined);
  mocks.softDeleteChatMock.mockResolvedValue(undefined);
  mocks.softDeleteRunMock.mockResolvedValue(undefined);
  mocks.upsertExternalCodexChatsMock.mockResolvedValue(undefined);
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

async function emitCodexServerRequest(
  message: unknown,
  options: {
    accountId?: number;
    profileKey?: `account:${number}` | "default";
    requestToken?: string | null;
  } = {},
) {
  await act(async () => {
    mocks.listeners.get("codex:server-request")?.({
      payload: {
        accountId: options.accountId ?? 7,
        profileKey: options.profileKey ?? "account:7",
        ...(options.requestToken === null
          ? {}
          : {
              requestToken:
                options.requestToken ?? "server-request-7-1-9",
            }),
        message,
      },
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
    const keepWorkspaceButton = within(dialog).getByRole("button", {
      name: "Keep workspace",
    });
    expect(keepWorkspaceButton).toHaveTextContent("");
    expect(keepWorkspaceButton).toHaveAttribute(
      "data-tooltip",
      "Keep workspace",
    );
    await user.click(keepWorkspaceButton);

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

    await user.click(
      within(workspaceNav).getByRole("button", { name: "mobile-client" }),
    );
    await user.type(screen.getByLabelText("Prompt"), "Remember this draft");
    await user.click(
      within(workspaceNav).getByRole("button", { name: "orchestrator" }),
    );

    fireEvent.contextMenu(
      within(workspaceNav).getByRole("button", { name: "orchestrator" }),
      { clientX: 60, clientY: 140 },
    );
    await user.click(
      screen.getByRole("menuitem", { name: "Remove from Orchestrator" }),
    );
    const removeWorkspaceButton = within(
      screen.getByRole("dialog", { name: "Remove workspace?" }),
    ).getByRole("button", { name: "Remove workspace" });
    expect(removeWorkspaceButton).toHaveTextContent("");
    expect(removeWorkspaceButton).toHaveAttribute(
      "data-tooltip",
      "Remove workspace",
    );
    await user.click(removeWorkspaceButton);

    await waitFor(() => expect(mocks.softDeleteWorkspaceMock).toHaveBeenCalledWith(1));
    expect(
      within(workspaceNav).queryByRole("button", { name: "orchestrator" }),
    ).not.toBeInTheDocument();
    const fallbackWorkspace = within(workspaceNav).getByRole("button", {
      name: "mobile-client",
    });
    expect(fallbackWorkspace).toHaveAttribute("aria-current", "page");
    expect(screen.getByLabelText("Selected folder")).toHaveTextContent("mobile-client");
    expect(screen.getByLabelText("Prompt")).toHaveValue("Remember this draft");
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
    mocks.listGitBranchesMock.mockResolvedValue({
      branches: ["main", "feature/chat-controls"],
      currentBranch: "main",
    });

    const { user } = await renderApp();

    const banner = screen.getByRole("region", { name: "Selected folder" });
    expect(within(banner).getByText("orchestrator")).toBeInTheDocument();
    expect(within(banner).getByText(workspace.path)).toBeInTheDocument();
    const branchSelect = await within(banner).findByRole("combobox", {
      name: "Branch",
    });
    await waitFor(() => expect(branchSelect).toHaveTextContent("main"));
    expect(
      within(screen.getByLabelText("Task composer")).queryByRole("combobox", {
        name: "Branch",
      }),
    ).not.toBeInTheDocument();
    await user.click(branchSelect);
    await user.click(
      screen.getByRole("option", { name: "feature/chat-controls" }),
    );
    await waitFor(() =>
      expect(mocks.checkoutGitBranchMock).toHaveBeenCalledWith(
        workspace.path,
        "feature/chat-controls",
      ),
    );
    expect(await within(banner).findByText("Clean")).toBeInTheDocument();
  });

  it("summarizes changed files in the selected folder banner", async () => {
    mocks.listWorkspaceGitStatusMock.mockResolvedValue({
      workspacePath: workspace.path,
      gitRoot: workspace.path,
      additions: 167,
      deletions: 82,
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
    const changeSummary = await within(banner).findByLabelText(
      "6 changed (1 modified, 2 added, 1 deleted, 1 untracked, 1 conflicted); 167 additions, 82 deletions",
    );
    expect(changeSummary).toHaveClass("git-summary");
    expect(within(changeSummary).getByText("+167")).toBeInTheDocument();
    expect(within(changeSummary).getByText("-82")).toBeInTheDocument();
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
    await user.click(
      await within(banner).findByRole("button", { name: /commit or push/i }),
    );

    const dialog = screen.getByRole("dialog", { name: "Commit or push" });
    expect(document.querySelector(".commit-popover")).toBeNull();
    expect(dialog.querySelectorAll(".git-action-branch svg")).toHaveLength(1);
    expect(within(dialog).getByText("Include unstaged changes")).toBeInTheDocument();
    const messageInput = within(dialog).getByLabelText(/commit message/i);
    expect(messageInput).toHaveValue("");
    expect(messageInput).toHaveAttribute(
      "placeholder",
      "Commit message (leave blank to generate)...",
    );
    await user.type(messageInput, "Update app shell");
    await user.click(within(dialog).getByRole("button", { name: /^commit$/i }));

    await waitFor(() =>
      expect(mocks.commitWorkspaceChangesMock).toHaveBeenCalledWith(
        workspace.path,
        "Update app shell",
        true,
      ),
    );
    await waitFor(() =>
      expect(mocks.listWorkspaceGitStatusMock).toHaveBeenCalledWith(workspace.path),
    );
  });

  it("can commit only staged changes when unstaged changes are excluded", async () => {
    mocks.listWorkspaceGitStatusMock.mockResolvedValue({
      workspacePath: workspace.path,
      gitRoot: workspace.path,
      currentBranch: "main",
      aheadCount: 0,
      hasUpstream: true,
      hasOrigin: true,
      canPush: true,
      additions: 8,
      deletions: 1,
      files: [
        {
          path: "/repo/orchestrator/src/App.tsx",
          relativePath: "src/App.tsx",
          oldRelativePath: null,
          indexStatus: "M",
          worktreeStatus: "M",
          statusKind: "modified",
          badge: "M",
        },
      ],
    });

    const { user } = await renderApp();
    const banner = screen.getByRole("region", { name: "Selected folder" });
    await user.click(
      await within(banner).findByRole("button", { name: /commit or push/i }),
    );

    const dialog = screen.getByRole("dialog", { name: "Commit or push" });
    const includeUnstaged = within(dialog).getByRole("checkbox", {
      name: /include unstaged changes/i,
    });
    expect(includeUnstaged).toBeChecked();

    await user.click(includeUnstaged);
    expect(includeUnstaged).not.toBeChecked();
    await user.type(
      within(dialog).getByLabelText(/commit message/i),
      "Commit staged app source",
    );
    await user.click(within(dialog).getByRole("button", { name: /^commit$/i }));

    await waitFor(() =>
      expect(mocks.commitWorkspaceChangesMock).toHaveBeenCalledWith(
        workspace.path,
        "Commit staged app source",
        false,
      ),
    );
  });

  it("does not use a diff-topic fallback when generation fails", async () => {
    mocks.listWorkspaceGitStatusMock.mockResolvedValue({
      workspacePath: workspace.path,
      gitRoot: workspace.path,
      currentBranch: "main",
      aheadCount: 0,
      hasUpstream: true,
      hasOrigin: true,
      canPush: true,
      additions: 14,
      deletions: 5,
      files: [
        {
          path: "/repo/orchestrator/src/components/TaskChatTranscript.tsx",
          relativePath: "src/components/TaskChatTranscript.tsx",
          oldRelativePath: null,
          indexStatus: " ",
          worktreeStatus: "M",
          statusKind: "modified",
          badge: "M",
        },
        {
          path: "/repo/orchestrator/src/components/TaskChatTranscript.test.tsx",
          relativePath: "src/components/TaskChatTranscript.test.tsx",
          oldRelativePath: null,
          indexStatus: " ",
          worktreeStatus: "A",
          statusKind: "added",
          badge: "A",
        },
        {
          path: "/repo/orchestrator/src/components/taskChatFormatting.ts",
          relativePath: "src/components/taskChatFormatting.ts",
          oldRelativePath: null,
          indexStatus: " ",
          worktreeStatus: "D",
          statusKind: "deleted",
          badge: "D",
        },
      ],
    });

    const { user } = await renderApp();
    const banner = screen.getByRole("region", { name: "Selected folder" });
    await user.click(
      await within(banner).findByRole("button", { name: /commit or push/i }),
    );

    const dialog = screen.getByRole("dialog", { name: "Commit or push" });
    await user.click(within(dialog).getByRole("button", { name: /^commit$/i }));

    const alert = await within(dialog).findByRole("alert");
    expect(alert).toHaveTextContent(
      "Could not generate a commit message. Enter a message manually or try again.",
    );
    expect(alert.querySelector("svg")).toBeInTheDocument();
    expect(alert.parentElement).toHaveClass("git-action-feedback-slot");
    expect(mocks.commitWorkspaceChangesMock).not.toHaveBeenCalled();
  });

  it("uses an AI-generated commit message when the commit message is blank", async () => {
    prepareSignedInRun();
    mocks.generateWorkspaceCommitMessageMock.mockResolvedValue({
      message: "Make staged-only commits respect the checkbox",
      source: "codex",
    });
    mocks.listWorkspaceGitStatusMock.mockResolvedValue({
      workspacePath: workspace.path,
      gitRoot: workspace.path,
      currentBranch: "main",
      aheadCount: 0,
      hasUpstream: true,
      hasOrigin: true,
      canPush: true,
      additions: 14,
      deletions: 4,
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
          path: "/repo/orchestrator/src-tauri/src/lib.rs",
          relativePath: "src-tauri/src/lib.rs",
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
    await user.click(
      await within(banner).findByRole("button", { name: /commit or push/i }),
    );

    const dialog = screen.getByRole("dialog", { name: "Commit or push" });
    await user.click(within(dialog).getByRole("button", { name: /^commit$/i }));

    await waitFor(() =>
      expect(mocks.generateWorkspaceCommitMessageMock).toHaveBeenCalledWith(
        expect.objectContaining({
          workspacePath: workspace.path,
          accountId: 7,
          includeUnstaged: true,
        }),
      ),
    );
    await waitFor(() =>
      expect(mocks.commitWorkspaceChangesMock).toHaveBeenCalledWith(
        workspace.path,
        "Make staged-only commits respect the checkbox",
        true,
      ),
    );
  });

  it("generates a message before committing and pushing when the message is blank", async () => {
    prepareSignedInRun();
    mocks.generateWorkspaceCommitMessageMock.mockResolvedValue({
      message: "Keep header controls on one row",
      source: "codex",
    });
    mocks.listWorkspaceGitStatusMock.mockResolvedValue({
      workspacePath: workspace.path,
      gitRoot: workspace.path,
      currentBranch: "main",
      aheadCount: 0,
      hasUpstream: true,
      hasOrigin: true,
      canPush: true,
      additions: 10,
      deletions: 2,
      files: [
        {
          path: "/repo/orchestrator/src/App.css",
          relativePath: "src/App.css",
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
    await user.click(
      await within(banner).findByRole("button", { name: /commit or push/i }),
    );

    const dialog = screen.getByRole("dialog", { name: "Commit or push" });
    await user.click(
      within(dialog).getByRole("button", { name: /^commit and push$/i }),
    );

    await waitFor(() =>
      expect(mocks.generateWorkspaceCommitMessageMock).toHaveBeenCalled(),
    );
    await waitFor(() =>
      expect(mocks.commitWorkspaceChangesMock).toHaveBeenCalledWith(
        workspace.path,
        "Keep header controls on one row",
        true,
      ),
    );
    await waitFor(() =>
      expect(mocks.pushWorkspaceBranchMock).toHaveBeenCalledWith(workspace.path),
    );
  });

  it("fails closed when no account is available for message generation", async () => {
    mocks.generateWorkspaceCommitMessageMock.mockRejectedValue(
      new Error("Sign in to Codex or enter a commit message manually"),
    );
    mocks.listWorkspaceGitStatusMock.mockResolvedValue({
      workspacePath: workspace.path,
      gitRoot: workspace.path,
      currentBranch: "main",
      aheadCount: 0,
      hasUpstream: true,
      hasOrigin: true,
      canPush: true,
      additions: 5,
      deletions: 2,
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
    await user.click(
      await within(banner).findByRole("button", { name: /commit or push/i }),
    );

    const dialog = screen.getByRole("dialog", { name: "Commit or push" });
    await user.click(
      within(dialog).getByRole("button", { name: /^commit and push$/i }),
    );

    await waitFor(() =>
      expect(mocks.generateWorkspaceCommitMessageMock).toHaveBeenCalledWith(
        expect.objectContaining({
          workspacePath: workspace.path,
          accountId: null,
          includeUnstaged: true,
        }),
      ),
    );
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Could not generate a commit message. Enter a message manually or try again.",
    );
    expect(mocks.commitWorkspaceChangesMock).not.toHaveBeenCalled();
    expect(mocks.pushWorkspaceBranchMock).not.toHaveBeenCalled();

    await user.type(
      within(dialog).getByLabelText(/commit message/i),
      "Fix manual commit fallback",
    );
    await user.click(
      within(dialog).getByRole("button", { name: /^commit and push$/i }),
    );
    await waitFor(() =>
      expect(mocks.commitWorkspaceChangesMock).toHaveBeenCalledWith(
        workspace.path,
        "Fix manual commit fallback",
        true,
      ),
    );
    await waitFor(() =>
      expect(mocks.pushWorkspaceBranchMock).toHaveBeenCalledWith(workspace.path),
    );
  });

  it("retries commit-message generation without duplicating the commit", async () => {
    prepareSignedInRun();
    mocks.generateWorkspaceCommitMessageMock
      .mockRejectedValueOnce(new Error("request timed out"))
      .mockResolvedValueOnce({
        message: "Keep Snake controls responsive",
        source: "codex",
      });
    mocks.listWorkspaceGitStatusMock.mockResolvedValue({
      workspacePath: workspace.path,
      gitRoot: workspace.path,
      currentBranch: "main",
      aheadCount: 0,
      hasUpstream: true,
      hasOrigin: true,
      canPush: true,
      additions: 410,
      deletions: 0,
      files: [
        {
          path: "/repo/orchestrator/src/app.js",
          relativePath: "src/app.js",
          oldRelativePath: null,
          indexStatus: "M",
          worktreeStatus: " ",
          statusKind: "modified",
          badge: "M",
        },
      ],
    });

    const { user } = await renderApp();
    const banner = screen.getByRole("region", { name: "Selected folder" });
    await user.click(
      await within(banner).findByRole("button", { name: /commit or push/i }),
    );
    const dialog = screen.getByRole("dialog", { name: "Commit or push" });
    const commit = within(dialog).getByRole("button", { name: /^commit$/i });

    await user.click(commit);
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Could not generate a commit message. Enter a message manually or try again.",
    );
    await user.click(commit);

    await waitFor(() =>
      expect(mocks.generateWorkspaceCommitMessageMock).toHaveBeenCalledTimes(2),
    );
    await waitFor(() =>
      expect(mocks.commitWorkspaceChangesMock).toHaveBeenCalledWith(
        workspace.path,
        "Keep Snake controls responsive",
        true,
      ),
    );
    expect(mocks.commitWorkspaceChangesMock).toHaveBeenCalledTimes(1);
  });

  it("ignores duplicate commit-and-push actions while generation is pending", async () => {
    prepareSignedInRun();
    let resolveGeneration:
      | ((value: { message: string; source: "codex" }) => void)
      | null = null;
    let resolveCommit:
      | ((value: { message: string; branch: string }) => void)
      | null = null;
    mocks.generateWorkspaceCommitMessageMock.mockImplementation(
      () =>
        new Promise<{ message: string; source: "codex" }>((resolve) => {
          resolveGeneration = resolve;
        }),
    );
    mocks.commitWorkspaceChangesMock.mockImplementation(
      () =>
        new Promise<{ message: string; branch: string }>((resolve) => {
          resolveCommit = resolve;
        }),
    );
    mocks.listWorkspaceGitStatusMock.mockResolvedValue({
      workspacePath: workspace.path,
      gitRoot: workspace.path,
      currentBranch: "main",
      aheadCount: 0,
      hasUpstream: true,
      hasOrigin: true,
      canPush: true,
      additions: 24,
      deletions: 2,
      files: [
        {
          path: "/repo/orchestrator/src/app.js",
          relativePath: "src/app.js",
          oldRelativePath: null,
          indexStatus: "M",
          worktreeStatus: " ",
          statusKind: "modified",
          badge: "M",
        },
      ],
    });

    const { user } = await renderApp();
    const banner = screen.getByRole("region", { name: "Selected folder" });
    await user.click(
      await within(banner).findByRole("button", { name: /commit or push/i }),
    );
    const dialog = screen.getByRole("dialog", { name: "Commit or push" });
    const commitAndPush = within(dialog).getByRole("button", {
      name: /^commit and push$/i,
    });

    act(() => {
      commitAndPush.click();
      commitAndPush.click();
    });
    expect(mocks.generateWorkspaceCommitMessageMock).toHaveBeenCalledTimes(1);
    expect(
      within(dialog).queryByText(/generating an intent-driven commit message/i),
    ).not.toBeInTheDocument();

    await act(async () => {
      resolveGeneration?.({
        message: "Keep Snake controls responsive",
        source: "codex",
      });
      await Promise.resolve();
    });

    await waitFor(() =>
      expect(mocks.commitWorkspaceChangesMock).toHaveBeenCalledTimes(1),
    );
    expect(within(dialog).getByLabelText(/commit message/i)).toHaveValue(
      "Keep Snake controls responsive",
    );
    expect(within(dialog).queryByText(/^Generated:/i)).not.toBeInTheDocument();

    await act(async () => {
      resolveCommit?.({
        message: "Committed workspace changes",
        branch: "main",
      });
      await Promise.resolve();
    });
    await waitFor(() =>
      expect(mocks.pushWorkspaceBranchMock).toHaveBeenCalledTimes(1),
    );
  });

  it("rejects broad AI commit messages that only describe changed areas", async () => {
    prepareSignedInRun();
    mocks.generateWorkspaceCommitMessageMock.mockResolvedValue({
      message: "Refine Tauri bridge and app styling",
      source: "codex",
    });
    mocks.listWorkspaceGitStatusMock.mockResolvedValue({
      workspacePath: workspace.path,
      gitRoot: workspace.path,
      currentBranch: "main",
      aheadCount: 0,
      hasUpstream: true,
      hasOrigin: true,
      canPush: true,
      additions: 8,
      deletions: 3,
      files: [
        {
          path: "/repo/orchestrator/src/App.css",
          relativePath: "src/App.css",
          oldRelativePath: null,
          indexStatus: " ",
          worktreeStatus: "M",
          statusKind: "modified",
          badge: "M",
        },
        {
          path: "/repo/orchestrator/src-tauri/src/lib.rs",
          relativePath: "src-tauri/src/lib.rs",
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
    await user.click(
      await within(banner).findByRole("button", { name: /commit or push/i }),
    );

    const dialog = screen.getByRole("dialog", { name: "Commit or push" });
    await user.click(within(dialog).getByRole("button", { name: /^commit$/i }));

    await waitFor(() =>
      expect(mocks.generateWorkspaceCommitMessageMock).toHaveBeenCalled(),
    );
    expect(mocks.commitWorkspaceChangesMock).not.toHaveBeenCalled();
    expect(within(dialog).getByRole("alert")).toHaveTextContent(
      "Could not generate a commit message. Enter a message manually or try again.",
    );
  });

  it.each([
    "Implement the plan",
    "Scaffold minimal Express health service (5 added)",
  ])(
    "fails closed when Codex returns %s",
    async (generatedMessage) => {
      prepareSignedInRun();
      mocks.generateWorkspaceCommitMessageMock.mockResolvedValue({
        message: generatedMessage,
        source: "codex",
      });
      mocks.listWorkspaceGitStatusMock.mockResolvedValue({
        workspacePath: workspace.path,
        gitRoot: workspace.path,
        currentBranch: "main",
        aheadCount: 0,
        hasUpstream: true,
        hasOrigin: true,
        canPush: true,
        additions: 5,
        deletions: 0,
        files: [
          {
            path: "/repo/orchestrator/src/app.js",
            relativePath: "src/app.js",
            oldRelativePath: null,
            indexStatus: "A",
            worktreeStatus: " ",
            statusKind: "added",
            badge: "A",
          },
        ],
      });

      const { user } = await renderApp();
      const banner = screen.getByRole("region", { name: "Selected folder" });
      await user.click(
        await within(banner).findByRole("button", {
          name: /commit or push/i,
        }),
      );

      const dialog = screen.getByRole("dialog", { name: "Commit or push" });
      await user.click(
        within(dialog).getByRole("button", { name: /^commit$/i }),
      );

      expect(await within(dialog).findByRole("alert")).toHaveTextContent(
        "Could not generate a commit message. Enter a message manually or try again.",
      );
      expect(mocks.commitWorkspaceChangesMock).not.toHaveBeenCalled();
      expect(dialog).toBeInTheDocument();
    },
  );

  it("fails closed when Codex repeats a commit message for different changes", async () => {
    prepareSignedInRun();
    mocks.generateWorkspaceCommitMessageMock.mockResolvedValue({
      message: "Improve commit dialog staging controls",
      source: "codex",
    });

    let currentStatus = {
      workspacePath: workspace.path,
      gitRoot: workspace.path,
      currentBranch: "main",
      aheadCount: 0,
      hasUpstream: true,
      hasOrigin: true,
      canPush: true,
      additions: 18,
      deletions: 4,
      files: [
        {
          path: "/repo/orchestrator/src/App.tsx",
          relativePath: "src/App.tsx",
          oldRelativePath: null,
          indexStatus: " ",
          worktreeStatus: "M",
          statusKind: "modified" as const,
          badge: "M",
        },
        {
          path: "/repo/orchestrator/src-tauri/src/lib.rs",
          relativePath: "src-tauri/src/lib.rs",
          oldRelativePath: null,
          indexStatus: " ",
          worktreeStatus: "M",
          statusKind: "modified" as const,
          badge: "M",
        },
      ],
    };
    const nextStatus = {
      ...currentStatus,
      additions: 9,
      deletions: 2,
      files: [
        {
          path: "/repo/orchestrator/src/components/FilePreviewDrawer.tsx",
          relativePath: "src/components/FilePreviewDrawer.tsx",
          oldRelativePath: null,
          indexStatus: " ",
          worktreeStatus: "M",
          statusKind: "modified" as const,
          badge: "M",
        },
        {
          path: "/repo/orchestrator/src/components/CodePreview.tsx",
          relativePath: "src/components/CodePreview.tsx",
          oldRelativePath: null,
          indexStatus: " ",
          worktreeStatus: "M",
          statusKind: "modified" as const,
          badge: "M",
        },
      ],
    };
    mocks.listWorkspaceGitStatusMock.mockImplementation(async () => currentStatus);
    mocks.commitWorkspaceChangesMock.mockImplementation(async () => {
      currentStatus = nextStatus;
      return {
        message: "Committed workspace changes",
        branch: "main",
      };
    });

    const { user } = await renderApp();
    const banner = screen.getByRole("region", { name: "Selected folder" });

    await user.click(
      await within(banner).findByRole("button", { name: /commit or push/i }),
    );
    let dialog = screen.getByRole("dialog", { name: "Commit or push" });
    await user.click(within(dialog).getByRole("button", { name: /^commit$/i }));

    await waitFor(() =>
      expect(mocks.commitWorkspaceChangesMock).toHaveBeenNthCalledWith(
        1,
        workspace.path,
        "Improve commit dialog staging controls",
        true,
      ),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Commit or push" })).toBeNull(),
    );

    await user.click(
      await within(banner).findByRole("button", { name: /commit or push/i }),
    );
    dialog = screen.getByRole("dialog", { name: "Commit or push" });
    await user.click(within(dialog).getByRole("button", { name: /^commit$/i }));

    await waitFor(() =>
      expect(mocks.generateWorkspaceCommitMessageMock).toHaveBeenCalledTimes(2),
    );
    expect(mocks.commitWorkspaceChangesMock).toHaveBeenCalledTimes(1);
  });

  it("commits and pushes from the commit or push dialog", async () => {
    mocks.listWorkspaceGitStatusMock.mockResolvedValue({
      workspacePath: workspace.path,
      gitRoot: workspace.path,
      currentBranch: "main",
      aheadCount: 0,
      hasUpstream: true,
      hasOrigin: true,
      canPush: true,
      additions: 10,
      deletions: 2,
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
    await user.click(
      await within(banner).findByRole("button", { name: /commit or push/i }),
    );

    const dialog = screen.getByRole("dialog", { name: "Commit or push" });
    expect(within(dialog).getByText("+10")).toBeInTheDocument();
    expect(within(dialog).getByText("-2")).toBeInTheDocument();
    await user.type(
      within(dialog).getByLabelText(/commit message/i),
      "Commit workspace changes",
    );
    await user.click(
      within(dialog).getByRole("button", { name: /^commit and push$/i }),
    );

    await waitFor(() =>
      expect(mocks.commitWorkspaceChangesMock).toHaveBeenCalledWith(
        workspace.path,
        "Commit workspace changes",
        true,
      ),
    );
    await waitFor(() =>
      expect(mocks.pushWorkspaceBranchMock).toHaveBeenCalledWith(workspace.path),
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
    await user.click(
      await within(banner).findByRole("button", { name: /commit or push/i }),
    );
    const dialog = screen.getByRole("dialog", { name: "Commit or push" });
    expect(within(dialog).getByText("2 ahead")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: /^push$/i }));

    await waitFor(() =>
      expect(mocks.pushWorkspaceBranchMock).toHaveBeenCalledWith(workspace.path),
    );
  });

  it("opens the commit or push menu even when the workspace has no git action", async () => {
    const { user } = await renderApp();
    const banner = screen.getByRole("region", { name: "Selected folder" });
    await user.click(
      await within(banner).findByRole("button", { name: /commit or push/i }),
    );

    const dialog = screen.getByRole("dialog", { name: "Commit or push" });
    expect(within(dialog).getByText("No changes")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: /^commit$/i })).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: /^push$/i })).toBeDisabled();
  });

  it("closes the commit or push dialog from the backdrop without running git actions", async () => {
    const { user } = await renderApp();
    const banner = screen.getByRole("region", { name: "Selected folder" });
    await user.click(
      await within(banner).findByRole("button", { name: /commit or push/i }),
    );

    const dialog = screen.getByRole("dialog", { name: "Commit or push" });
    fireEvent.mouseDown(dialog.parentElement as HTMLElement);

    expect(screen.queryByRole("dialog", { name: "Commit or push" })).not.toBeInTheDocument();
    expect(mocks.commitWorkspaceChangesMock).not.toHaveBeenCalled();
    expect(mocks.pushWorkspaceBranchMock).not.toHaveBeenCalled();
  });

  it("shows live context usage in the selected folder banner", async () => {
    prepareSignedInRun();

    const { user } = await renderApp();
    const banner = screen.getByRole("region", { name: "Selected folder" });
    const emptyMeter = within(banner).getByRole("meter", { name: "Context usage" });
    expect(within(emptyMeter).getByText("0 / 258,400")).toBeInTheDocument();
    expect(within(emptyMeter).getByText("0%")).toBeInTheDocument();
    expect(emptyMeter).toHaveAttribute("aria-valuenow", "0");
    expect(emptyMeter).toHaveAttribute("aria-valuetext", "0 / 258,400 (0%)");
    expect(within(banner).queryByText("Context loading")).not.toBeInTheDocument();

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
          last: {
            totalTokens: 640,
            inputTokens: 560,
            cachedInputTokens: 100,
            outputTokens: 80,
            reasoningOutputTokens: 20,
          },
          modelContextWindow: 128000,
        },
      },
    });

    expect(within(banner).getByText("640 / 128,000")).toBeInTheDocument();
    expect(within(banner).getByText("1%")).toBeInTheDocument();
    const meter = within(banner).getByRole("meter", { name: "Context usage" });
    expect(meter).toHaveAttribute("aria-valuenow", "1");
    expect(meter).toHaveAttribute("aria-valuetext", "640 / 128,000 (1%)");
    await waitFor(() =>
      expect(mocks.recordTokenUsageMock).toHaveBeenCalledWith(
        expect.objectContaining({
          totalTokens: 1280,
          turnTokens: 1280,
          contextTokens: 640,
          modelContextWindow: 128000,
        }),
      ),
    );
  });

  it("opens workspace chat history without extra drawer controls", async () => {
    const activeChat = workspaceChatFixture({
      id: 401,
      title: "Fix the app header",
    });
    mocks.listWorkspaceChatsMock.mockResolvedValue([activeChat]);

    const { user } = await renderApp();
    const banner = screen.getByRole("region", { name: "Selected folder" });
    const historyButton = within(banner).getByRole("button", {
      name: /open chat history/i,
    });
    const composer = screen.getByLabelText("Task composer");
    expect(historyButton).toHaveTextContent("");
    expect(historyButton).toHaveAttribute("title", "Open history");
    await user.click(historyButton);

    const drawer = await screen.findByRole("complementary", {
      name: "Workspace chat history",
    });
    expect(historyButton).toHaveAttribute("aria-label", "Close chat history");
    expect(historyButton).toHaveAttribute("aria-pressed", "true");
    const layout = drawer.closest(".codex-workspace-body");
    expect(layout).toHaveClass("history-open");
    const taskChat = within(layout as HTMLElement).getByLabelText("Task chat");
    expect(taskChat).toBeInTheDocument();
    expect(taskChat).toHaveClass("task-hero");
    expect(drawer.previousElementSibling).toBe(taskChat);
    expect(drawer).toHaveClass("workspace-history-drawer", "opening");
    expect(drawer.parentElement).toHaveClass("codex-workspace-body");
    expect(drawer.parentElement).toHaveClass("history-space-reserved");
    expect(drawer.parentElement).toHaveAttribute(
      "data-history-transition-phase",
      "opening",
    );
    expect(screen.getByLabelText("Task composer")).toBe(composer);
    expect(within(drawer).queryByRole("tab")).not.toBeInTheDocument();
    expect(
      within(drawer).queryByRole("button", { name: /close chat history/i }),
    ).not.toBeInTheDocument();

    expect(within(drawer).getAllByText("Fix the app header").length).toBeGreaterThan(0);
    expect(within(drawer).queryByText("Header fixed.")).not.toBeInTheDocument();
    expect(
      within(drawer).queryByRole("article", { name: /selected chat/i }),
    ).not.toBeInTheDocument();
    expect(mocks.codexDefaultProfileRpcMock).not.toHaveBeenCalledWith(
      "thread/list",
      expect.anything(),
    );

    fireEvent.transitionEnd(drawer, { propertyName: "transform" });
    expect(drawer).toHaveClass("open");
    expect(drawer.parentElement).toHaveClass("history-space-reserved");
    expect(drawer.parentElement).toHaveAttribute(
      "data-history-transition-phase",
      "open",
    );
    expect(screen.getByLabelText("Task composer")).toBe(composer);
    await waitFor(() =>
      expect(mocks.codexDefaultProfileRpcMock).toHaveBeenCalledWith(
        "thread/list",
        expect.objectContaining({ cwd: workspace.path }),
      ),
    );

    await user.click(historyButton);
    const closedDrawer = document.querySelector(".workspace-history-drawer");
    expect(closedDrawer).toBeInTheDocument();
    expect(closedDrawer).toHaveAttribute("aria-hidden", "true");
    expect(closedDrawer).toHaveAttribute("inert");
    await waitFor(() => expect(closedDrawer).toHaveClass("closing"));
    expect(closedDrawer?.parentElement).not.toHaveClass(
      "history-space-reserved",
    );
    expect(closedDrawer?.parentElement).toHaveAttribute(
      "data-history-transition-phase",
      "closing",
    );
    expect(screen.getByLabelText("Task composer")).toBe(composer);
    expect(historyButton).toHaveAttribute("aria-label", "Open chat history");
    expect(historyButton).toHaveAttribute("aria-pressed", "false");

    fireEvent.transitionEnd(closedDrawer as HTMLElement, {
      propertyName: "transform",
    });
    expect(closedDrawer).toHaveClass("closed");
    expect(closedDrawer?.parentElement).not.toHaveClass("history-space-reserved");
  });

  it("moves the most recently started running chat to the top of history", async () => {
    prepareSignedInRun();
    const completedChat = workspaceChatFixture({
      id: 401,
      title: "Earlier completed chat",
      status: "completed",
      latest_activity_at: "2020-07-23T08:21:00.000Z",
    });
    const runningChat = workspaceChatFixture({
      id: 402,
      title: "Build Snake Web App",
      status: "running",
      latest_activity_at: "2019-07-23 11:01:00",
    });
    mocks.createChatMock.mockResolvedValue({
      ...runningChat,
      codex_thread_id: null,
    });
    mocks.listWorkspaceChatsMock.mockResolvedValue([
      completedChat,
      runningChat,
    ]);

    const { user } = await renderApp();
    await startMockRun(user, "Build Snake Web App");

    const banner = screen.getByRole("region", { name: "Selected folder" });
    await user.click(
      within(banner).getByRole("button", { name: /open chat history/i }),
    );
    const drawer = await screen.findByRole("complementary", {
      name: "Workspace chat history",
    });
    const rows = drawer.querySelectorAll<HTMLElement>(".history-run-item");

    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("Build Snake Web App");
    expect(within(rows[0] as HTMLElement).getByLabelText("Agent running"))
      .toBeInTheDocument();
    expect(rows[1]).toHaveTextContent("Earlier completed chat");
  });

  it("coordinates drawer and composer phases without remounting the prompt", async () => {
    mocks.listWorkspaceChatsMock.mockResolvedValue([]);
    const { user } = await renderApp();
    const prompt = screen.getByLabelText("Prompt");
    await user.type(prompt, "Keep this draft");
    const banner = screen.getByRole("region", { name: "Selected folder" });
    const historyButton = within(banner).getByRole("button", {
      name: /open chat history/i,
    });

    await user.click(historyButton);
    const drawer = screen.getByRole("complementary", {
      name: "Workspace chat history",
    });
    const layout = drawer.closest<HTMLElement>(".codex-workspace-body");
    expect(layout).not.toBeNull();

    await waitFor(() =>
      expect(layout).toHaveAttribute("data-history-transition-phase", "opening"),
    );
    expect(layout).toHaveClass("history-space-reserved");
    expect(screen.getByLabelText("Prompt")).toBe(prompt);
    expect(prompt).toHaveValue("Keep this draft");

    fireEvent.transitionEnd(drawer, { propertyName: "transform" });
    await waitFor(() =>
      expect(layout).toHaveAttribute("data-history-transition-phase", "open"),
    );
    expect(layout).toHaveClass("history-space-reserved");

    await user.click(historyButton);
    await waitFor(() =>
      expect(layout).toHaveAttribute("data-history-transition-phase", "closing"),
    );
    expect(layout).not.toHaveClass("history-space-reserved");

    fireEvent.transitionEnd(drawer, { propertyName: "transform" });
    await waitFor(() =>
      expect(layout).toHaveAttribute("data-history-transition-phase", "closed"),
    );
    expect(screen.getByLabelText("Prompt")).toBe(prompt);
    expect(prompt).toHaveValue("Keep this draft");
  });

  it("reverses rapid drawer toggles without remounting or losing the prompt", async () => {
    mocks.listWorkspaceChatsMock.mockResolvedValue([]);
    const { user } = await renderApp();
    const prompt = screen.getByLabelText("Prompt");
    await user.type(prompt, "Keep this draft through reversal");
    const promptTextarea = prompt as HTMLTextAreaElement;
    promptTextarea.setSelectionRange(9, 9);
    const banner = screen.getByRole("region", { name: "Selected folder" });
    const historyButton = within(banner).getByRole("button", {
      name: /open chat history/i,
    });

    await user.click(historyButton);
    const drawer = screen.getByRole("complementary", {
      name: "Workspace chat history",
    });
    const layout = drawer.closest<HTMLElement>(".codex-workspace-body");
    expect(layout).toHaveAttribute("data-history-transition-phase", "opening");
    expect(layout).toHaveClass("history-space-reserved");

    await user.click(historyButton);
    expect(layout).toHaveAttribute("data-history-transition-phase", "closing");
    expect(layout).not.toHaveClass("history-space-reserved");

    await user.click(historyButton);
    expect(layout).toHaveAttribute("data-history-transition-phase", "opening");
    expect(layout).toHaveClass("history-space-reserved");

    fireEvent.transitionEnd(drawer, { propertyName: "transform" });
    expect(layout).toHaveAttribute("data-history-transition-phase", "open");
    expect(screen.getByLabelText("Prompt")).toBe(prompt);
    expect(prompt).toHaveValue("Keep this draft through reversal");
    expect(promptTextarea.selectionStart).toBe(9);
    expect(promptTextarea.selectionEnd).toBe(9);
    await waitFor(() =>
      expect(mocks.codexDefaultProfileRpcMock).toHaveBeenCalledWith(
        "thread/list",
        expect.objectContaining({ cwd: workspace.path }),
      ),
    );
  });

  it("settles the shared drawer transition immediately for reduced motion", async () => {
    const matchMediaSpy = vi
      .spyOn(window, "matchMedia")
      .mockImplementation((query: string) => ({
        matches: query === "(prefers-reduced-motion: reduce)",
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(() => false),
      }));
    mocks.listWorkspaceChatsMock.mockResolvedValue([]);

    const { user } = await renderApp();
    const historyButton = within(
      screen.getByRole("region", { name: "Selected folder" }),
    ).getByRole("button", { name: /open chat history/i });
    await user.click(historyButton);

    const drawer = screen.getByRole("complementary", {
      name: "Workspace chat history",
    });
    await waitFor(() => expect(drawer).toHaveClass("open"));
    expect(drawer.parentElement).toHaveAttribute(
      "data-history-transition-phase",
      "open",
    );

    await user.click(historyButton);
    await waitFor(() => expect(drawer).toHaveClass("closed"));
    expect(drawer.parentElement).toHaveAttribute(
      "data-history-transition-phase",
      "closed",
    );
    matchMediaSpy.mockRestore();
  });

  it("waits for transcript momentum to settle before resizing the chat viewport", async () => {
    const historicalChat = workspaceChatFixture({
      id: 405,
      title: "Scroll-safe history chat",
    });
    mocks.listWorkspaceChatsMock.mockResolvedValue([historicalChat]);
    mocks.listLocalChatTranscriptMock.mockResolvedValue([
      workspaceRunFixture({
        id: 305,
        chat_id: historicalChat.id,
        original_prompt: "Keep scrolling smooth",
        final_message: "The transcript is ready.",
      }),
    ]);
    const { user } = await renderApp();
    const banner = screen.getByRole("region", { name: "Selected folder" });
    const historyButton = within(banner).getByRole("button", {
      name: /open chat history/i,
    });

    await user.click(historyButton);
    const drawer = screen.getByRole("complementary", {
      name: "Workspace chat history",
    });
    await user.click(
      await within(drawer).findByRole("button", {
        name: /scroll-safe history chat/i,
      }),
    );
    expect(await screen.findByText("The transcript is ready.")).toBeInTheDocument();

    const transcript = screen.getByLabelText("Task chat transcript");
    const layout = transcript.closest<HTMLElement>(".codex-workspace-body");
    expect(layout).toHaveAttribute("data-history-transition-phase", "closed");
    fireEvent.wheel(transcript, { deltaY: -120 });
    await user.click(historyButton);

    expect(layout).toHaveAttribute("data-history-transition-phase", "closed");
    await waitFor(
      () =>
        expect(layout).toHaveAttribute(
          "data-history-transition-phase",
          "opening",
        ),
      { timeout: 1_000 },
    );
  });

  it("opens a clicked chat history row in the chat window and closes the drawer", async () => {
    const historicalChat = workspaceChatFixture({
      id: 401,
      title: "Fix the app header",
    });
    const historicalRun = workspaceRunFixture({
      id: 301,
      chat_id: historicalChat.id,
      original_prompt: "Fix the app header",
      final_message: "Header fixed.",
    });
    mocks.listWorkspaceChatsMock.mockResolvedValue([historicalChat]);
    mocks.getChatWithRunsMock.mockResolvedValue(
      workspaceChatWithRunsFixture(historicalChat, [historicalRun]),
    );

    const { user } = await renderApp();
    const banner = screen.getByRole("region", { name: "Selected folder" });
    await user.click(
      within(banner).getByRole("button", { name: /open chat history/i }),
    );

    const drawer = await screen.findByRole("complementary", {
      name: "Workspace chat history",
    });
    const row = within(drawer).getByRole("button", {
      name: /fix the app header/i,
    });
    expect(row).toHaveClass("history-run-item");

    await user.hover(row);
    row.focus();
    expect(row).toHaveFocus();
    await user.click(row);

    await waitFor(() => expect(drawer).toHaveClass("closed"));
    expect(drawer).toHaveAttribute("aria-hidden", "true");
    const submittedPrompt = await screen.findByLabelText("Submitted prompt");
    const transcript = screen.getByLabelText("Task chat transcript");
    expect(submittedPrompt).toHaveTextContent("Fix the app header");
    expect(within(transcript).getByText("Header fixed.")).toBeInTheDocument();
    expect(within(transcript).getByText("1m 0s")).toBeInTheDocument();
    expect(within(transcript).getByText("640 tokens")).toBeInTheDocument();
  });

  it("opens another history chat while the current plan awaits review", async () => {
    prepareSignedInRun();
    const historicalChat = workspaceChatFixture({
      id: 402,
      title: "Previously completed chat",
      codex_thread_id: "thread-history",
    });
    const historicalRun = workspaceRunFixture({
      id: 302,
      chat_id: historicalChat.id,
      original_prompt: "Previously completed chat",
      final_message: "Historical response loaded.",
    });
    mocks.listWorkspaceChatsMock.mockResolvedValue([historicalChat]);
    mocks.getChatWithRunsMock.mockResolvedValue(
      workspaceChatWithRunsFixture(historicalChat, [historicalRun]),
    );

    const { user } = await renderApp();
    await startMockRun(user, "Prepare a plan before switching chats");
    await emitCodexNotification({
      method: "item/completed",
      params: {
        threadId: "thread-1",
        turnId: "turn-1",
        item: {
          type: "agentMessage",
          id: "pending-plan-message",
          phase: "final_answer",
          text: "<proposed_plan>\n# Pending plan\n\n- Review this later.\n</proposed_plan>",
        },
      },
    });
    await emitCodexNotification({
      method: "turn/completed",
      params: {
        threadId: "thread-1",
        turnId: "turn-1",
        turn: { id: "turn-1", status: "completed", durationMs: 100 },
      },
    });
    expect(await screen.findByLabelText("Codex plan")).toBeInTheDocument();

    const banner = screen.getByRole("region", { name: "Selected folder" });
    await user.click(
      within(banner).getByRole("button", { name: /open chat history/i }),
    );
    const drawer = await screen.findByRole("complementary", {
      name: "Workspace chat history",
    });
    await user.click(
      within(drawer).getByRole("button", { name: /previously completed chat/i }),
    );

    await waitFor(() => expect(drawer).toHaveClass("closed"));
    expect(await screen.findByText("Historical response loaded.")).toBeInTheDocument();
  });

  it("opens and focuses a historical response from a pending native notification", async () => {
    const historicalChat = workspaceChatFixture({
      id: 412,
      title: "Notification target chat",
    });
    const historicalRun = workspaceRunFixture({
      id: 312,
      chat_id: historicalChat.id,
      original_prompt: "Notification target chat",
      final_message: "Opened from a native notification.",
    });
    mocks.listWorkspaceChatsMock.mockResolvedValue([historicalChat]);
    mocks.getChatWithRunsMock.mockResolvedValue(
      workspaceChatWithRunsFixture(historicalChat, [historicalRun]),
    );
    mocks.takePendingAgentNotificationActivationMock.mockResolvedValue({
      eventKey: "response-completed:account:7:thread-1:turn-1:312",
      kind: "response-completed",
      workspaceId: workspace.id,
      chatId: historicalChat.id,
      runId: historicalRun.id,
      entryClientId: null,
      requestId: null,
      planItemId: null,
      accountId: 7,
      profileKey: "account:7",
      threadId: "thread-1",
      turnId: "turn-1",
    });

    await renderApp();

    expect(
      await screen.findByText("Opened from a native notification."),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(
        document.querySelector<HTMLElement>(
          '[data-agent-notification-target="response"]',
        ),
      ).toHaveFocus(),
    );
  });

  it("atomically switches workspaces and opens the chat targeted by a notification", async () => {
    const otherWorkspace = {
      ...workspace,
      id: 2,
      path: "/repo/mobile-client",
      label: "mobile-client",
    };
    const historicalChat = {
      ...workspaceChatFixture({
        id: 413,
        title: "Mobile notification target",
        codex_thread_id: "thread-mobile",
      }),
      workspace_id: otherWorkspace.id,
    };
    const historicalRun = {
      ...workspaceRunFixture({
        id: 313,
        chat_id: historicalChat.id,
        original_prompt: "Mobile notification target",
        final_message: "Opened in the other workspace.",
      }),
      workspace_id: otherWorkspace.id,
      codex_thread_id: "thread-mobile",
      codex_turn_id: "turn-mobile",
    };
    mocks.listWorkspacesMock.mockResolvedValue([workspace, otherWorkspace]);
    mocks.listWorkspaceChatsMock.mockImplementation(async (workspaceId: number) =>
      workspaceId === otherWorkspace.id ? [historicalChat] : [],
    );
    mocks.listLocalChatTranscriptMock.mockResolvedValue([historicalRun]);
    mocks.takePendingAgentNotificationActivationMock.mockResolvedValue({
      eventKey: "response-completed:account:7:thread-mobile:turn-mobile:313",
      kind: "response-completed",
      workspaceId: otherWorkspace.id,
      chatId: historicalChat.id,
      runId: historicalRun.id,
      entryClientId: null,
      requestId: null,
      planItemId: null,
      accountId: 7,
      profileKey: "account:7",
      threadId: "thread-mobile",
      turnId: "turn-mobile",
    });

    await renderApp();

    expect(
      await screen.findByText("Opened in the other workspace."),
    ).toBeInTheDocument();
    const banner = screen.getByRole("region", { name: "Selected folder" });
    expect(within(banner).getByText("mobile-client")).toBeInTheDocument();
    await waitFor(() =>
      expect(
        document.querySelector<HTMLElement>(
          '[data-agent-notification-target="response"]',
        ),
      ).toHaveFocus(),
    );
  });

  it("allows a notification activation to retry after history loading fails", async () => {
    const historicalChat = workspaceChatFixture({
      id: 414,
      title: "Retry notification target",
    });
    const historicalRun = workspaceRunFixture({
      id: 314,
      chat_id: historicalChat.id,
      original_prompt: "Retry notification target",
      final_message: "Opened after retrying the notification.",
    });
    const target = {
      eventKey: "response-completed:account:7:thread-1:turn-1:314",
      kind: "response-completed" as const,
      workspaceId: workspace.id,
      chatId: historicalChat.id,
      runId: historicalRun.id,
      entryClientId: null,
      requestId: null,
      planItemId: null,
      accountId: 7,
      profileKey: "account:7" as const,
      threadId: "thread-1",
      turnId: "turn-1",
    };
    mocks.listWorkspaceChatsMock
      .mockRejectedValueOnce(new Error("Database temporarily unavailable"))
      .mockResolvedValue([historicalChat]);
    mocks.listLocalChatTranscriptMock.mockResolvedValue([historicalRun]);

    await renderApp();
    await act(async () => {
      mocks.listeners.get("orchestrator:agent-notification-activated")?.({
        payload: target,
      });
      await Promise.resolve();
    });
    await waitFor(() =>
      expect(mocks.listWorkspaceChatsMock).toHaveBeenCalledTimes(1),
    );
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 0));
      mocks.listeners.get("orchestrator:agent-notification-activated")?.({
        payload: target,
      });
      await Promise.resolve();
    });

    expect(
      await screen.findByText("Opened after retrying the notification."),
    ).toBeInTheDocument();
    expect(mocks.listWorkspaceChatsMock).toHaveBeenCalledTimes(2);
    await waitFor(() =>
      expect(
        document.querySelector<HTMLElement>(
          '[data-agent-notification-target="response"]',
        ),
      ).toHaveFocus(),
    );
  });

  it("loads a complete local transcript once and performs no history reads while scrolling", async () => {
    const historicalChat = workspaceChatFixture({
      id: 451,
      title: "Large history chat",
      turn_count: 65,
    });
    const historicalRuns = Array.from({ length: 65 }, (_, index) =>
      workspaceRunFixture({
        id: 500 + index,
        chat_id: historicalChat.id,
        turn_index: index + 1,
        original_prompt: `Prompt ${index + 1}`,
        final_message: `Result ${index + 1}.`,
      }),
    );
    mocks.listWorkspaceChatsMock.mockResolvedValue([historicalChat]);
    mocks.listLocalChatTranscriptMock.mockResolvedValue(historicalRuns);

    const { user } = await renderApp();
    const banner = screen.getByRole("region", { name: "Selected folder" });
    await user.click(
      within(banner).getByRole("button", { name: /open chat history/i }),
    );
    const drawer = await screen.findByRole("complementary", {
      name: "Workspace chat history",
    });

    await user.click(
      within(drawer).getByRole("button", { name: /large history chat/i }),
    );

    expect(drawer).toHaveClass("closing");
    expect(screen.getByLabelText("Loading chat")).toHaveTextContent(
      "Loading Large history chat",
    );
    expect(await screen.findByText("Result 65.")).toBeInTheDocument();
    expect(screen.queryByText("Result 1.")).not.toBeInTheDocument();
    expect(mocks.listLocalChatTranscriptMock).toHaveBeenCalledTimes(1);
    expect(mocks.listLocalChatTranscriptMock).toHaveBeenCalledWith(451);

    const transcript = screen.getByLabelText("Task chat transcript");
    fireEvent.wheel(transcript, { deltaY: -120 });
    fireEvent.scroll(transcript);
    expect(mocks.listLocalChatTranscriptMock).toHaveBeenCalledTimes(1);
    expect(mocks.listChatRunsPageMock).not.toHaveBeenCalled();
    expect(screen.queryByText("Loading older messages...")).not.toBeInTheDocument();

    const promptInput = screen.getByLabelText("Prompt") as HTMLTextAreaElement;
    await user.type(promptInput, "Draft while the large chat stays mounted");
    promptInput.setSelectionRange(12, 12);
    expect(promptInput).toHaveValue("Draft while the large chat stays mounted");

    const firstTranscriptRow = transcript.querySelector(
      "[data-transcript-entry-id]",
    );
    const transcriptRows = Array.from(
      transcript.querySelectorAll<HTMLElement>("[data-transcript-entry-id]"),
    );
    let transcriptRowShift = 0;
    Object.defineProperties(transcript, {
      clientHeight: { configurable: true, value: 500 },
      scrollHeight: { configurable: true, value: 4_000 },
    });
    transcript.getBoundingClientRect = () =>
      ({ top: 100, bottom: 600 } as DOMRect);
    transcriptRows.forEach((row, index) => {
      row.getBoundingClientRect = () => {
        const top =
          80 +
          index * 120 +
          transcriptRowShift -
          (transcript.scrollTop - 640);
        return { top, bottom: top + 100 } as DOMRect;
      };
    });
    transcript.scrollTop = 640;
    await user.click(
      within(banner).getByRole("button", { name: /open chat history/i }),
    );
    const reopenedDrawer = await screen.findByRole("complementary", {
      name: "Workspace chat history",
    });
    expect(reopenedDrawer).toHaveClass("opening");
    expect(screen.getByLabelText("Task chat transcript")).toBe(transcript);
    expect(
      transcript.querySelector("[data-transcript-entry-id]"),
    ).toBe(firstTranscriptRow);
    expect(screen.getByLabelText("Prompt")).toBe(promptInput);
    expect(promptInput).toHaveValue("Draft while the large chat stays mounted");
    expect(promptInput.selectionStart).toBe(12);
    expect(promptInput.selectionEnd).toBe(12);
    expect(transcript.scrollTop).toBe(640);

    transcriptRowShift = -60;
    fireEvent.transitionEnd(reopenedDrawer, { propertyName: "transform" });
    await waitFor(() => expect(transcript.scrollTop).toBe(580));
    transcriptRowShift = -90;
    await waitFor(() => expect(transcript.scrollTop).toBe(550));
    fireEvent.wheel(transcript, { deltaY: -120 });
    fireEvent.scroll(transcript);
    await user.click(
      within(banner).getByRole("button", { name: /close chat history/i }),
    );
    expect(reopenedDrawer).toHaveClass("open");
    expect(screen.getByLabelText("Task chat transcript")).toBe(transcript);
    expect(transcript.scrollTop).toBe(550);
    expect(reopenedDrawer.parentElement).toHaveClass("history-space-reserved");
    await waitFor(() => expect(reopenedDrawer).toHaveClass("closing"));
    expect(reopenedDrawer.parentElement).not.toHaveClass(
      "history-space-reserved",
    );
    transcriptRowShift = 0;
    fireEvent.transitionEnd(reopenedDrawer, { propertyName: "transform" });
    await waitFor(() => expect(reopenedDrawer).toHaveClass("closed"));
    expect(reopenedDrawer.parentElement).not.toHaveClass(
      "history-space-reserved",
    );
    expect(transcript.scrollTop).toBe(640);
  });

  it("reopens the same historical chat at its latest turn instead of restoring the top", async () => {
    const historicalChat = workspaceChatFixture({
      id: 455,
      title: "Reselected history chat",
      turn_count: 2,
    });
    const historicalRuns = [
      workspaceRunFixture({
        id: 610,
        chat_id: historicalChat.id,
        turn_index: 1,
        original_prompt: "First prompt",
        final_message: "First result.",
      }),
      workspaceRunFixture({
        id: 611,
        chat_id: historicalChat.id,
        turn_index: 2,
        original_prompt: "Latest prompt",
        final_message: "Latest result.",
      }),
    ];
    mocks.listWorkspaceChatsMock.mockResolvedValue([historicalChat]);
    mocks.listLocalChatTranscriptMock.mockResolvedValue(historicalRuns);

    const { user } = await renderApp();
    const banner = screen.getByRole("region", { name: "Selected folder" });
    const historyButton = within(banner).getByRole("button", {
      name: /open chat history/i,
    });
    await user.click(historyButton);
    let drawer = await screen.findByRole("complementary", {
      name: "Workspace chat history",
    });
    await user.click(
      within(drawer).getByRole("button", { name: /reselected history chat/i }),
    );
    expect(await screen.findByText("Latest result.")).toBeInTheDocument();

    await user.click(historyButton);
    drawer = await screen.findByRole("complementary", {
      name: "Workspace chat history",
    });
    await user.click(
      within(drawer).getByRole("button", { name: /reselected history chat/i }),
    );
    expect(await screen.findByText("Latest result.")).toBeInTheDocument();

    const transcript = screen.getByRole("region", {
      name: "Task chat transcript",
    });
    expect(transcript).toHaveClass("virtuoso-transcript");
    expect(transcript.querySelectorAll(".task-chat-virtuoso-row")).toHaveLength(2);
  });

  it("publishes an uncached external transcript once after its full snapshot is ready", async () => {
    const historicalChat = {
      ...workspaceChatFixture({
      id: 452,
      title: "External history chat",
      codex_thread_id: "external-thread-large",
      origin: "codex_external",
      profile_key: "default",
      external_thread_id: "external-thread-large",
      source_kind: "vscode",
      turn_count: 65,
      }),
      account_id: null,
      account_label: null,
      account_email: null,
      external_updated_at: "2026-06-30T10:30:00Z",
    };
    let resolveSnapshot:
      | ((snapshot: ReturnType<typeof externalTranscriptSnapshotFixture>) => void)
      | null = null;
    const snapshotPromise = new Promise<
      ReturnType<typeof externalTranscriptSnapshotFixture>
    >(
      (resolve) => {
        resolveSnapshot = resolve;
      },
    );
    mocks.listWorkspaceChatsMock.mockResolvedValue([historicalChat]);
    mocks.codexDefaultProfileRpcMock.mockImplementation(async (method: string) => {
      if (method === "thread/list") return { threads: [] };
      if (method === "thread/turns/list") {
        return {
          data: Array.from({ length: 20 }, (_, index) =>
            externalTurnFixture(65 - index),
          ),
        };
      }
      return {};
    });
    mocks.syncDefaultProfileThreadTranscriptMock.mockReturnValue(snapshotPromise);

    const { user } = await renderApp();
    const banner = screen.getByRole("region", { name: "Selected folder" });
    await user.click(
      within(banner).getByRole("button", { name: /open chat history/i }),
    );
    const drawer = await screen.findByRole("complementary", {
      name: "Workspace chat history",
    });
    await user.click(
      within(drawer).getByRole("button", { name: /external history chat/i }),
    );
    expect(screen.getByLabelText("Loading chat")).toHaveTextContent(
      "Loading External history chat",
    );
    expect(screen.queryByText("External result 65.")).not.toBeInTheDocument();
    expect(screen.queryByText("External result 1.")).not.toBeInTheDocument();

    await act(async () => {
      resolveSnapshot?.(externalTranscriptSnapshotFixture(65));
      await Promise.resolve();
    });
    await waitFor(() =>
      expect(mocks.activateExternalTranscriptSnapshotMock).toHaveBeenCalled(),
    );
    expect(await screen.findByText("External result 65.")).toBeInTheDocument();
    expect(screen.queryByText("External result 1.")).not.toBeInTheDocument();
    expect(
      screen
        .getByRole("region", { name: "Task chat transcript" })
        .querySelectorAll(".task-chat-virtuoso-row"),
    ).toHaveLength(24);
    expect(mocks.syncDefaultProfileThreadTranscriptMock).toHaveBeenCalledTimes(1);
    expect(mocks.codexDefaultProfileRpcMock).not.toHaveBeenCalledWith(
      "thread/turns/list",
      expect.anything(),
    );
    expect(mocks.listChatRunsPageMock).not.toHaveBeenCalled();
  });

  it("defers complete transcript hydration until drawer resizing has settled", async () => {
    let notifyTaskResize: ((width: number) => void) | null = null;
    vi.stubGlobal(
      "ResizeObserver",
      class {
        private callback: ResizeObserverCallback;

        constructor(callback: ResizeObserverCallback) {
          this.callback = callback;
        }

        observe(element: Element) {
          if (element.classList.contains("task-hero")) {
            notifyTaskResize = (width: number) => {
              this.callback(
                [{ contentRect: { width } } as ResizeObserverEntry],
                this as unknown as ResizeObserver,
              );
            };
          }
        }

        unobserve() {}

        disconnect() {}
      },
    );

    try {
      const historicalChat = {
        ...workspaceChatFixture({
          id: 462,
          title: "Resize-safe external chat",
          codex_thread_id: "external-thread-resize",
          origin: "codex_external",
          profile_key: "default",
          external_thread_id: "external-thread-resize",
          source_kind: "vscode",
          turn_count: 65,
        }),
        account_id: null,
        account_label: null,
        account_email: null,
        external_updated_at: "2026-06-30T10:30:00Z",
      };
      let resolveSnapshot:
        | ((snapshot: ReturnType<typeof externalTranscriptSnapshotFixture>) => void)
        | null = null;
      mocks.listWorkspaceChatsMock.mockResolvedValue([historicalChat]);
      mocks.codexDefaultProfileRpcMock.mockImplementation(async (method: string) => {
        if (method === "thread/list") return { threads: [] };
        if (method === "thread/turns/list") {
          return {
            data: Array.from({ length: 20 }, (_, index) =>
              externalTurnFixture(65 - index),
            ),
          };
        }
        return {};
      });
      mocks.syncDefaultProfileThreadTranscriptMock.mockReturnValue(
        new Promise((resolve) => {
          resolveSnapshot = resolve;
        }),
      );

      const { user } = await renderApp();
      const banner = screen.getByRole("region", { name: "Selected folder" });
      await user.click(
        within(banner).getByRole("button", { name: /open chat history/i }),
      );
      const drawer = await screen.findByRole("complementary", {
        name: "Workspace chat history",
      });
      await user.click(
        within(drawer).getByRole("button", { name: /resize-safe external chat/i }),
      );

      const triggerResize = notifyTaskResize as ((width: number) => void) | null;
      expect(triggerResize).not.toBeNull();
      if (!triggerResize) {
        throw new Error("Task viewport ResizeObserver was not attached.");
      }
      act(() => triggerResize(900));
      expect(screen.getByLabelText("Loading chat")).toHaveTextContent(
        "Loading Resize-safe external chat",
      );

      act(() => {
        resolveSnapshot?.(externalTranscriptSnapshotFixture(65));
      });
      act(() => triggerResize(880));
      await act(async () => {
        await new Promise((resolve) => window.setTimeout(resolve, 80));
      });
      act(() => triggerResize(860));
      await act(async () => {
        await new Promise((resolve) => window.setTimeout(resolve, 80));
      });
      act(() => triggerResize(840));
      await act(async () => {
        await new Promise((resolve) => window.setTimeout(resolve, 100));
      });
      expect(screen.queryByText("External result 65.")).not.toBeInTheDocument();
      expect(screen.queryByText("External result 1.")).not.toBeInTheDocument();

      act(() => triggerResize(820));
      expect(await screen.findByText("External result 65.")).toBeInTheDocument();
      expect(screen.queryByText("External result 1.")).not.toBeInTheDocument();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("opens a current external transcript snapshot without an app-server history request", async () => {
    const historicalChat = {
      ...workspaceChatFixture({
        id: 453,
        title: "Cached external chat",
        codex_thread_id: "external-thread-large",
        origin: "codex_external",
        profile_key: "default",
        external_thread_id: "external-thread-large",
        source_kind: "vscode",
        turn_count: 3,
      }),
      account_id: null,
      account_label: null,
      account_email: null,
      external_updated_at: "2026-06-30T10:30:00Z",
    };
    const cachedSnapshot = {
      ...externalTranscriptSnapshotFixture(3),
      requestId: "cached",
      chatId: historicalChat.id,
      syncedAt: "2026-06-30T10:31:00Z",
    };
    mocks.listWorkspaceChatsMock.mockResolvedValue([historicalChat]);
    mocks.readExternalTranscriptSnapshotMock.mockImplementation(
      async (_chatId: number, sourceVersion?: string) =>
        sourceVersion === historicalChat.external_updated_at ? cachedSnapshot : null,
    );

    const { user } = await renderApp();
    const banner = screen.getByRole("region", { name: "Selected folder" });
    await user.click(
      within(banner).getByRole("button", { name: /open chat history/i }),
    );
    const drawer = await screen.findByRole("complementary", {
      name: "Workspace chat history",
    });
    await user.click(
      within(drawer).getByRole("button", { name: /cached external chat/i }),
    );

    expect(await screen.findByText("External result 3.")).toBeInTheDocument();
    expect(screen.getByText("External result 1.")).toBeInTheDocument();
    expect(mocks.syncDefaultProfileThreadTranscriptMock).not.toHaveBeenCalled();
    expect(mocks.activateExternalTranscriptSnapshotMock).not.toHaveBeenCalled();
    expect(mocks.codexDefaultProfileRpcMock).not.toHaveBeenCalledWith(
      "thread/turns/list",
      expect.anything(),
    );
  });

  it("keeps a stale cached transcript visible when its background refresh fails", async () => {
    const historicalChat = {
      ...workspaceChatFixture({
        id: 454,
        title: "Stale external chat",
        codex_thread_id: "external-thread-large",
        origin: "codex_external",
        profile_key: "default",
        external_thread_id: "external-thread-large",
        source_kind: "vscode",
        turn_count: 3,
      }),
      account_id: null,
      account_label: null,
      account_email: null,
      external_updated_at: "2026-06-30T11:30:00Z",
    };
    const staleSnapshot = {
      ...externalTranscriptSnapshotFixture(3),
      requestId: "cached",
      chatId: historicalChat.id,
      sourceVersion: "2026-06-30T10:30:00Z",
      syncedAt: "2026-06-30T10:31:00Z",
    };
    mocks.listWorkspaceChatsMock.mockResolvedValue([historicalChat]);
    mocks.readExternalTranscriptSnapshotMock.mockImplementation(
      async (_chatId: number, sourceVersion?: string) =>
        sourceVersion ? null : staleSnapshot,
    );
    mocks.syncDefaultProfileThreadTranscriptMock.mockRejectedValue(
      new Error("History sync unavailable"),
    );

    const { user } = await renderApp();
    const banner = screen.getByRole("region", { name: "Selected folder" });
    await user.click(
      within(banner).getByRole("button", { name: /open chat history/i }),
    );
    const drawer = await screen.findByRole("complementary", {
      name: "Workspace chat history",
    });
    await user.click(
      within(drawer).getByRole("button", { name: /stale external chat/i }),
    );

    expect(await screen.findByText("External result 3.")).toBeInTheDocument();
    await waitFor(() =>
      expect(mocks.syncDefaultProfileThreadTranscriptMock).toHaveBeenCalledTimes(1),
    );
    expect(screen.getByText("External result 1.")).toBeInTheDocument();
    expect(mocks.activateExternalTranscriptSnapshotMock).not.toHaveBeenCalled();
    expect(mocks.codexDefaultProfileRpcMock).not.toHaveBeenCalledWith(
      "thread/turns/list",
      expect.anything(),
    );
  });

  it("ignores a stale history load after another chat is selected", async () => {
    const firstChat = workspaceChatFixture({ id: 461, title: "Slow chat" });
    const secondChat = workspaceChatFixture({ id: 462, title: "Fast chat" });
    let resolveSlowChat: ((runs: ReturnType<typeof workspaceRunFixture>[]) => void) | null =
      null;
    const slowChatRuns = new Promise<ReturnType<typeof workspaceRunFixture>[]>(
      (resolve) => {
        resolveSlowChat = resolve;
      },
    );
    mocks.listWorkspaceChatsMock.mockResolvedValue([firstChat, secondChat]);
    mocks.listLocalChatTranscriptMock.mockImplementation(async (chatId: number) => {
      if (chatId === firstChat.id) {
        return slowChatRuns;
      }
      return [
        workspaceRunFixture({
          id: 602,
          chat_id: secondChat.id,
          original_prompt: "Fast chat prompt",
          final_message: "Fast chat result.",
        }),
      ];
    });

    const { user } = await renderApp();
    const banner = screen.getByRole("region", { name: "Selected folder" });
    const historyButton = within(banner).getByRole("button", {
      name: /open chat history/i,
    });
    await user.click(historyButton);
    let drawer = await screen.findByRole("complementary", {
      name: "Workspace chat history",
    });
    await user.click(within(drawer).getByRole("button", { name: /slow chat/i }));
    await waitFor(() =>
      expect(mocks.listLocalChatTranscriptMock).toHaveBeenCalledWith(461),
    );

    await user.click(historyButton);
    drawer = await screen.findByRole("complementary", {
      name: "Workspace chat history",
    });
    await user.click(within(drawer).getByRole("button", { name: /fast chat/i }));
    expect(await screen.findByText("Fast chat result.")).toBeInTheDocument();

    await act(async () => {
      resolveSlowChat?.([
        workspaceRunFixture({
          id: 601,
          chat_id: firstChat.id,
          original_prompt: "Slow chat prompt",
          final_message: "Slow chat result.",
        }),
      ]);
      await Promise.resolve();
    });

    expect(screen.getByText("Fast chat result.")).toBeInTheDocument();
    expect(screen.queryByText("Slow chat result.")).not.toBeInTheDocument();
  });

  it("opens a multi-turn chat history row in the chat window", async () => {
    const historicalChat = workspaceChatFixture({
      id: 405,
      title: "Fix the app header",
      turn_count: 2,
      total_tokens: 2560,
      duration_ms: 90000,
    });
    const firstRun = workspaceRunFixture({
      id: 305,
      chat_id: historicalChat.id,
      turn_index: 1,
      original_prompt: "Fix the app header",
      final_message: "Header fixed.",
    });
    const secondRun = workspaceRunFixture({
      id: 306,
      chat_id: historicalChat.id,
      turn_index: 2,
      original_prompt: "Add the history button",
      final_message: "History button added.",
    });
    mocks.listWorkspaceChatsMock.mockResolvedValue([historicalChat]);
    mocks.getChatWithRunsMock.mockResolvedValue(
      workspaceChatWithRunsFixture(historicalChat, [firstRun, secondRun]),
    );

    const { user } = await renderApp();
    const banner = screen.getByRole("region", { name: "Selected folder" });
    await user.click(
      within(banner).getByRole("button", { name: /open chat history/i }),
    );
    const drawer = await screen.findByRole("complementary", {
      name: "Workspace chat history",
    });

    expect(within(drawer).getByText(/2 turns/)).toBeInTheDocument();
    await user.click(within(drawer).getByRole("button", { name: /fix the app header/i }));

    await screen.findByText("History button added.");
    const transcript = screen.getByLabelText("Task chat transcript");
    expect(within(transcript).getAllByLabelText("Submitted prompt")).toHaveLength(2);
    expect(transcript).toHaveTextContent("Fix the app header");
    expect(transcript).toHaveTextContent("Header fixed.");
    expect(transcript).toHaveTextContent("Add the history button");
    expect(transcript).toHaveTextContent("History button added.");
  });

  it("syncs, opens, and continues an external Codex chat through the default profile", async () => {
    const externalChat = {
      ...workspaceChatFixture({
        id: 501,
        title: "External VS Code task",
        codex_thread_id: "external-thread-1",
        origin: "codex_external",
        profile_key: "default",
        external_thread_id: "external-thread-1",
        source_kind: "vscode",
      }),
      account_id: null,
      account_label: null,
      account_email: null,
      turn_count: 1,
      total_tokens: 340,
    };
    mocks.listWorkspaceChatsMock.mockResolvedValue([externalChat]);
    mocks.syncDefaultProfileThreadTranscriptMock.mockResolvedValue({
      requestId: "transcript-sync-external-thread-1",
      threadId: "external-thread-1",
      sourceVersion: externalChat.external_updated_at ?? externalChat.updated_at,
      totalTurns: 1,
      turns: [
        {
          slotIndex: 0,
          turnId: "external-turn-1",
          prompt: "Prompt from VS Code",
          finalMessage: "Answer from the Codex extension.",
          error: null,
          status: "completed",
          startedAt: "2026-07-07T10:00:00Z",
          completedAt: "2026-07-07T10:02:00Z",
          durationMs: 120_000,
          totalTokens: 340,
          modelContextWindow: 128_000,
        },
      ],
    });
    mocks.codexDefaultProfileRpcMock.mockImplementation(async (method: string) => {
      if (method === "thread/list") {
        return {
          threads: [
            {
              id: "external-thread-1",
              preview: "External VS Code task",
              cwd: workspace.path,
              threadSource: "vscode",
              status: "completed",
              createdAt: "2026-07-07T10:00:00Z",
              updatedAt: "2026-07-07T10:02:00Z",
            },
          ],
        };
      }
      if (method === "thread/turns/list") {
        return {
          data: [
            {
              id: "external-turn-1",
              status: "completed",
              createdAt: "2026-07-07T10:00:00Z",
              completedAt: "2026-07-07T10:02:00Z",
              items: [
                { type: "userMessage", text: "Prompt from VS Code" },
                {
                  type: "agentMessage",
                  phase: "final_answer",
                  text: "Answer from the Codex extension.",
                },
              ],
            },
          ],
          nextCursor: null,
        };
      }
      if (method === "turn/start") {
        return { turn: { id: "external-turn-2" } };
      }
      return {};
    });

    const { user } = await renderApp();
    const banner = screen.getByRole("region", { name: "Selected folder" });
    await user.click(
      within(banner).getByRole("button", { name: /open chat history/i }),
    );

    await waitFor(() =>
      expect(mocks.upsertExternalCodexChatsMock).toHaveBeenCalledWith([
        expect.objectContaining({
          externalThreadId: "external-thread-1",
          profileKey: "default",
          sourceKind: "vscode",
        }),
      ]),
    );
    const drawer = await screen.findByRole("complementary", {
      name: "Workspace chat history",
    });
    const row = within(drawer).getByRole("button", {
      name: /external vs code task/i,
    });
    expect(row).toHaveTextContent("VS Code");
    await user.click(row);

    const submittedPrompt = await screen.findByLabelText("Submitted prompt");
    const transcript = screen.getByLabelText("Task chat transcript");
    expect(submittedPrompt).toHaveTextContent("Prompt from VS Code");
    expect(transcript).toHaveTextContent("Answer from the Codex extension.");
    expect(mocks.syncDefaultProfileThreadTranscriptMock).toHaveBeenCalledWith(
      expect.objectContaining({
        threadId: "external-thread-1",
        pageSize: 20,
      }),
    );
    expect(
      mocks.codexDefaultProfileRpcMock.mock.calls.some(
        ([method]) => method === "thread/read",
      ),
    ).toBe(false);

    expect(mocks.loadDefaultProfileTurnActivityMock).not.toHaveBeenCalled();
    mocks.loadDefaultProfileTurnActivityMock.mockResolvedValueOnce({
      commands: [
        {
          id: "command-1",
          command: "npm test -- --run",
          status: "completed",
          durationMs: 1200,
        },
      ],
      editedFiles: [],
      nextCursor: null,
    });
    await user.click(within(transcript).getByLabelText("Run trace"));
    await waitFor(() =>
      expect(mocks.loadDefaultProfileTurnActivityMock).toHaveBeenCalledWith({
        threadId: "external-thread-1",
        turnId: "external-turn-1",
        cursor: null,
        limit: 50,
      }),
    );
    expect(await within(transcript).findByText("Ran 1 command")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Prompt"), "Continue external thread");
    await user.click(screen.getByRole("button", { name: /run codex/i }));
    await waitFor(() =>
      expect(mocks.codexDefaultProfileRpcMock).toHaveBeenCalledWith(
        "turn/start",
        expect.objectContaining({
          threadId: "external-thread-1",
          approvalPolicy: "untrusted",
          approvalsReviewer: "user",
          permissions: ASK_FOR_APPROVAL_PERMISSION_PROFILE,
        }),
      ),
    );
    expect(mocks.codexDefaultProfileRpcMock).toHaveBeenCalledWith(
      "thread/resume",
      expect.objectContaining({
        threadId: "external-thread-1",
        cwd: workspace.path,
        approvalPolicy: "untrusted",
        approvalsReviewer: "user",
        permissions: ASK_FOR_APPROVAL_PERMISSION_PROFILE,
        config: expect.objectContaining({
          mcp_servers: {
            playwright: {
              enabled: true,
            },
          },
        }),
      }),
    );
    expect(mocks.prepareBrowserSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        profileKey: "default",
        workspaceId: workspace.id,
        chatId: 501,
      }),
    );
    expect(
      mocks.codexRpcMock.mock.calls.some((call) => call[1] === "turn/start"),
    ).toBe(false);
    expect(mocks.createRunMock).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: null,
        accountLabel: "Codex default profile",
        chatId: 501,
        turnIndex: 2,
      }),
    );
  });

  it("renders an external proposed-plan envelope as a read-only native Plan", async () => {
    const markdown = "# External plan\n\n## Steps\n- Inspect the workspace.";
    const externalChat = {
      ...workspaceChatFixture({
        id: 511,
        title: "External proposed plan",
        codex_thread_id: "external-plan-thread",
        origin: "codex_external",
        profile_key: "default",
        external_thread_id: "external-plan-thread",
        source_kind: "vscode",
      }),
      account_id: null,
      account_label: null,
      account_email: null,
    };
    mocks.listWorkspaceChatsMock.mockResolvedValue([externalChat]);
    mocks.syncDefaultProfileThreadTranscriptMock.mockResolvedValue({
      requestId: "transcript-sync-external-plan",
      threadId: "external-plan-thread",
      sourceVersion: externalChat.external_updated_at ?? externalChat.updated_at,
      totalTurns: 1,
      turns: [
        {
          slotIndex: 0,
          turnId: "external-plan-turn",
          prompt: "Create a plan",
          finalMessage: `<proposed_plan>\n${markdown}\n</proposed_plan>`,
          error: null,
          status: "completed",
          startedAt: "2026-07-07T10:00:00Z",
          completedAt: "2026-07-07T10:01:00Z",
          durationMs: 60_000,
          totalTokens: 340,
          modelContextWindow: 128_000,
        },
      ],
    });

    const { user } = await renderApp();
    const banner = screen.getByRole("region", { name: "Selected folder" });
    await user.click(
      within(banner).getByRole("button", { name: /open chat history/i }),
    );
    const drawer = await screen.findByRole("complementary", {
      name: "Workspace chat history",
    });
    await user.click(
      within(drawer).getByRole("button", { name: /external proposed plan/i }),
    );

    const plan = await screen.findByLabelText("Codex plan");
    expect(
      within(plan).getByRole("heading", { name: "External plan" }),
    ).toBeInTheDocument();
    expect(within(plan).getByText("Completed plan")).toBeInTheDocument();
    expect(
      within(plan).queryByRole("button", { name: "Implement plan" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/<proposed_plan>/)).not.toBeInTheDocument();
  });

  it("shows upgrade guidance instead of falling back to unbounded external history", async () => {
    const externalChat = {
      ...workspaceChatFixture({
        id: 502,
        title: "Unsupported external history",
        codex_thread_id: "external-thread-unsupported",
        origin: "codex_external",
        profile_key: "default",
        external_thread_id: "external-thread-unsupported",
        source_kind: "vscode",
      }),
      account_id: null,
      account_label: null,
      account_email: null,
    };
    mocks.listWorkspaceChatsMock.mockResolvedValue([externalChat]);
    mocks.syncDefaultProfileThreadTranscriptMock.mockRejectedValue(
      new Error("method not found"),
    );
    mocks.codexDefaultProfileRpcMock.mockImplementation(async (method: string) => {
      if (method === "thread/list") {
        return { threads: [] };
      }
      if (method === "thread/turns/list") {
        throw new Error("method not found");
      }
      return {};
    });

    const { user } = await renderApp();
    const banner = screen.getByRole("region", { name: "Selected folder" });
    await user.click(
      within(banner).getByRole("button", { name: /open chat history/i }),
    );
    const drawer = await screen.findByRole("complementary", {
      name: "Workspace chat history",
    });
    await user.click(
      within(drawer).getByRole("button", { name: /unsupported external history/i }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Paged Codex history is unavailable. Update Codex and try again.",
    );
    expect(
      mocks.codexDefaultProfileRpcMock.mock.calls.some(
        ([method]) => method === "thread/read",
      ),
    ).toBe(false);
  });

  it("opens a chat history row with keyboard activation", async () => {
    const historicalChat = workspaceChatFixture({
      id: 402,
      title: "Keyboard open chat",
    });
    const historicalRun = workspaceRunFixture({
      id: 302,
      chat_id: historicalChat.id,
      original_prompt: "Keyboard open chat",
      final_message: "Opened from keyboard.",
    });
    mocks.listWorkspaceChatsMock.mockResolvedValue([historicalChat]);
    mocks.getChatWithRunsMock.mockResolvedValue(
      workspaceChatWithRunsFixture(historicalChat, [historicalRun]),
    );

    const { user } = await renderApp();
    const banner = screen.getByRole("region", { name: "Selected folder" });
    await user.click(
      within(banner).getByRole("button", { name: /open chat history/i }),
    );
    const drawer = await screen.findByRole("complementary", {
      name: "Workspace chat history",
    });
    const row = within(drawer).getByRole("button", {
      name: /keyboard open chat/i,
    });

    row.focus();
    await user.keyboard("{Enter}");

    await waitFor(() => expect(drawer).toHaveClass("closed"));
    expect(await screen.findByText("Opened from keyboard.")).toBeInTheDocument();
  });

  it("removes a chat from history through the row context menu", async () => {
    const activeChat = workspaceChatFixture({
      id: 401,
      title: "Fix the app header",
    });
    mocks.listWorkspaceChatsMock
      .mockResolvedValueOnce([activeChat])
      .mockResolvedValueOnce([]);

    const { user } = await renderApp();
    const banner = screen.getByRole("region", { name: "Selected folder" });
    await user.click(
      within(banner).getByRole("button", { name: /open chat history/i }),
    );
    const drawer = await screen.findByRole("complementary", {
      name: "Workspace chat history",
    });
    const row = within(drawer)
      .getByText("Fix the app header")
      .closest(".history-run-item");
    expect(row).toBeInstanceOf(HTMLElement);

    fireEvent.contextMenu(row as HTMLElement, { clientX: 120, clientY: 140 });
    expect(screen.queryByLabelText("Task chat transcript")).not.toBeInTheDocument();
    expect(
      screen.getByRole("menu", { name: /fix the app header chat actions/i }),
    ).toHaveClass("workspace-context-menu");
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() =>
      expect(
        screen.queryByRole("menu", { name: /fix the app header chat actions/i }),
      ).not.toBeInTheDocument(),
    );

    fireEvent.contextMenu(row as HTMLElement, { clientX: 120, clientY: 140 });
    fireEvent.pointerDown(document.body);
    await waitFor(() =>
      expect(
        screen.queryByRole("menu", { name: /fix the app header chat actions/i }),
      ).not.toBeInTheDocument(),
    );

    fireEvent.contextMenu(row as HTMLElement, { clientX: 120, clientY: 140 });
    const removeMenuItem = screen.getByRole("menuitem", { name: /remove chat/i });
    expect(removeMenuItem).toHaveClass("workspace-context-menu-item", "danger");
    await user.click(removeMenuItem);

    const dialog = screen.getByRole("dialog", { name: "Remove chat?" });
    expect(
      within(dialog).getByText(/not permanently deleted/i),
    ).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(mocks.softDeleteChatMock).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog", { name: "Remove chat?" })).not.toBeInTheDocument();

    fireEvent.contextMenu(row as HTMLElement, { clientX: 120, clientY: 140 });
    await user.click(screen.getByRole("menuitem", { name: /remove chat/i }));
    await user.click(
      within(screen.getByRole("dialog", { name: "Remove chat?" })).getByRole(
        "button",
        { name: "Remove chat" },
      ),
    );

    await waitFor(() => expect(mocks.softDeleteChatMock).toHaveBeenCalledWith(401));
    await waitFor(() =>
      expect(within(drawer).queryByText("Fix the app header")).not.toBeInTheDocument(),
    );
  });

  it("switches to another history chat while a run remains active", async () => {
    prepareSignedInRun();
    const historicalChat = workspaceChatFixture({
      id: 403,
      title: "Old chat",
    });
    const historicalRun = workspaceRunFixture({
      id: 303,
      chat_id: historicalChat.id,
      original_prompt: "Old chat",
      final_message: "Old result.",
    });
    mocks.listWorkspaceChatsMock.mockResolvedValue([historicalChat]);
    mocks.getChatWithRunsMock.mockResolvedValue(
      workspaceChatWithRunsFixture(historicalChat, [historicalRun]),
    );

    const { user } = await renderApp();
    await user.type(screen.getByLabelText("Prompt"), "Current active run");
    await user.keyboard("{Enter}");

    const transcript = await screen.findByLabelText("Task chat transcript");
    expect(within(transcript).getByLabelText("Submitted prompt")).toHaveTextContent(
      "Current active run",
    );
    const banner = screen.getByRole("region", { name: "Selected folder" });
    await user.click(
      within(banner).getByRole("button", { name: /open chat history/i }),
    );
    const drawer = await screen.findByRole("complementary", {
      name: "Workspace chat history",
    });
    const row = within(drawer).getByRole("button", { name: /old chat/i });
    expect(row).not.toHaveAttribute("aria-disabled");

    await user.click(row);

    expect(await screen.findByText("Old result.")).toBeInTheDocument();
    expect(screen.queryByText("Current active run")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /run codex/i })).toBeInTheDocument();
  });

  it("scopes active agents to their chats across workspace switches", async () => {
    const mobileWorkspace = {
      ...workspace,
      id: 2,
      path: "/repo/mobile-client",
      label: "mobile-client",
    };
    const chatsByWorkspace = new Map<
      number,
      Omit<ReturnType<typeof workspaceChatFixture>, "codex_thread_id"> & {
        codex_thread_id: string | null;
      }
    >();
    let threadSequence = 0;
    let taskSequence = 100;
    let runSequence = 200;

    prepareSignedInRun();
    mocks.listWorkspacesMock.mockResolvedValue([workspace, mobileWorkspace]);
    mocks.createChatMock.mockImplementation(async (input: { workspaceId: number; title: string }) => {
      const id = 400 + input.workspaceId;
      const chat = {
        ...workspaceChatFixture({
          id,
          title: input.title,
          status: "running",
          turn_count: 1,
        }),
        workspace_id: input.workspaceId,
        codex_thread_id: null,
      };
      chatsByWorkspace.set(input.workspaceId, chat);
      return chat;
    });
    mocks.listWorkspaceChatsMock.mockImplementation(async (workspaceId: number) => {
      const chat = chatsByWorkspace.get(workspaceId);
      return chat ? [chat] : [];
    });
    mocks.createTaskMock.mockImplementation(async () => ({ id: ++taskSequence }));
    mocks.createRunMock.mockImplementation(async () => ({ id: ++runSequence }));
    mocks.codexRpcMock.mockImplementation(
      async (_accountId: number, method: string, params: Record<string, unknown>) => {
        if (method === "thread/start") {
          threadSequence += 1;
          return { thread: { id: `thread-${threadSequence}` } };
        }
        if (method === "turn/start") {
          return { turn: { id: `turn-${String(params.threadId)}` } };
        }
        return {};
      },
    );

    const { user } = await renderApp();
    await startMockRun(user, "Run in orchestrator");

    const firstBanner = screen.getByRole("region", { name: "Selected folder" });
    await user.click(
      within(firstBanner).getByRole("button", { name: /open chat history/i }),
    );
    const firstDrawer = await screen.findByRole("complementary", {
      name: "Workspace chat history",
    });
    expect(within(firstDrawer).getByLabelText("Agent running")).toBeInTheDocument();
    await user.click(
      within(firstBanner).getByRole("button", { name: /close chat history/i }),
    );

    const workspaceNav = screen.getByRole("navigation", { name: "Workspaces" });
    await user.click(
      within(workspaceNav).getByRole("button", { name: "mobile-client" }),
    );

    expect(screen.getByRole("button", { name: /run codex/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /stop codex/i })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("article", { name: "Submitted prompt" }),
    ).not.toBeInTheDocument();

    await startMockRun(user, "Run in mobile client");
    await waitFor(() =>
      expect(
        mocks.codexRpcMock.mock.calls.filter(([, method]) => method === "thread/start"),
      ).toHaveLength(2),
    );

    await emitCodexNotification({
      method: "turn/completed",
      params: {
        threadId: "thread-1",
        turnId: "turn-thread-1",
        turn: { id: "turn-thread-1", status: "completed", durationMs: 1_000 },
      },
    });

    await user.click(
      within(workspaceNav).getByRole("button", { name: "orchestrator" }),
    );
    expect(await screen.findByLabelText("1 completed chat")).toBeInTheDocument();
    expect(
      within(screen.getByLabelText("Task chat transcript")).getByLabelText(
        "Submitted prompt",
      ),
    ).toHaveTextContent("Run in orchestrator");
    expect(screen.queryByText("Run in mobile client")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /run codex/i })).toBeInTheDocument();

    await user.click(
      within(workspaceNav).getByRole("button", { name: "mobile-client" }),
    );
    expect(
      within(screen.getByLabelText("Task chat transcript")).getByLabelText(
        "Submitted prompt",
      ),
    ).toHaveTextContent("Run in mobile client");
    expect(screen.getByRole("button", { name: /stop codex/i })).toBeInTheDocument();
  });

  it("restores composer drafts, context files, and skills per workspace", async () => {
    const mobileWorkspace = {
      ...workspace,
      id: 2,
      path: "/repo/mobile-client",
      label: "mobile-client",
    };
    prepareSignedInRun();
    mocks.listWorkspacesMock.mockResolvedValue([workspace, mobileWorkspace]);
    mocks.listCodexSkillsMock.mockResolvedValue([
      {
        id: "docs",
        name: "Docs",
        description: "Use repository documentation",
      },
    ]);

    const { user } = await renderApp();
    const workspaceNav = screen.getByRole("navigation", { name: "Workspaces" });
    const prompt = screen.getByLabelText("Prompt");
    await user.type(prompt, "Draft for orchestrator");
    const composer = screen.getByLabelText("Task composer");
    const dataTransfer = createContextFileDataTransfer([
      {
        path: "/repo/orchestrator/README.md",
        name: "README.md",
        source: "explorer",
        status: "ready",
      },
    ]);
    fireEvent.drop(composer, { dataTransfer });
    await user.type(prompt, " /docs");
    await user.click(await screen.findByRole("option", { name: /docs/i }));

    await user.click(
      within(workspaceNav).getByRole("button", { name: "mobile-client" }),
    );
    expect(screen.getByLabelText("Prompt")).toHaveValue("");
    expect(screen.queryByLabelText("Selected context files")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Selected skills")).not.toBeInTheDocument();

    await user.type(screen.getByLabelText("Prompt"), "Draft for mobile");
    await user.click(
      within(workspaceNav).getByRole("button", { name: "orchestrator" }),
    );

    expect(
      (screen.getByLabelText("Prompt") as HTMLTextAreaElement).value,
    ).toContain("Draft for orchestrator");
    expect(
      within(screen.getByLabelText("Selected context files")).getByText(
        "README.md",
      ),
    ).toBeInTheDocument();
    expect(
      within(screen.getByLabelText("Selected skills")).getByText("Docs"),
    ).toBeInTheDocument();

    await user.click(
      within(workspaceNav).getByRole("button", { name: "mobile-client" }),
    );
    expect(screen.getByLabelText("Prompt")).toHaveValue("Draft for mobile");
  });

  it("promotes an optimistic chat while its workspace is in the background", async () => {
    const mobileWorkspace = {
      ...workspace,
      id: 2,
      path: "/repo/mobile-client",
      label: "mobile-client",
    };
    let resolveCreateChat:
      | ((chat: ReturnType<typeof workspaceChatFixture>) => void)
      | null = null;
    prepareSignedInRun();
    mocks.listWorkspacesMock.mockResolvedValue([workspace, mobileWorkspace]);
    mocks.createChatMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveCreateChat = resolve;
        }),
    );

    const { user } = await renderApp();
    await user.type(screen.getByLabelText("Prompt"), "Background setup");
    await user.keyboard("{Enter}");
    await waitFor(() => expect(mocks.createChatMock).toHaveBeenCalledTimes(1));

    const workspaceNav = screen.getByRole("navigation", { name: "Workspaces" });
    await user.click(
      within(workspaceNav).getByRole("button", { name: "mobile-client" }),
    );
    expect(screen.queryByText("Background setup")).not.toBeInTheDocument();

    await act(async () => {
      resolveCreateChat?.(
        workspaceChatFixture({
          id: 407,
          title: "Background setup",
          status: "starting",
        }),
      );
      await Promise.resolve();
    });
    await waitFor(() =>
      expect(mocks.codexRpcMock).toHaveBeenCalledWith(
        7,
        "turn/start",
        expect.any(Object),
      ),
    );

    await user.click(
      within(workspaceNav).getByRole("button", { name: "orchestrator" }),
    );
    expect(
      within(screen.getByLabelText("Task chat transcript")).getByLabelText(
        "Submitted prompt",
      ),
    ).toHaveTextContent("Background setup");
    expect(screen.getByRole("button", { name: /stop codex/i })).toBeInTheDocument();
    expect(mocks.getChatWithRunsMock).not.toHaveBeenCalledWith(407);
  });

  it("restores a historical chat and keeps an explicit new chat empty", async () => {
    const mobileWorkspace = {
      ...workspace,
      id: 2,
      path: "/repo/mobile-client",
      label: "mobile-client",
    };
    const historicalChat = workspaceChatFixture({
      id: 406,
      title: "Remembered history",
    });
    const historicalRun = workspaceRunFixture({
      id: 306,
      chat_id: historicalChat.id,
      original_prompt: "Remember this prompt",
      final_message: "Remembered result.",
    });
    mocks.listWorkspacesMock.mockResolvedValue([workspace, mobileWorkspace]);
    mocks.listWorkspaceChatsMock.mockImplementation(async (workspaceId: number) =>
      workspaceId === workspace.id ? [historicalChat] : [],
    );
    mocks.getChatWithRunsMock.mockResolvedValue(
      workspaceChatWithRunsFixture(historicalChat, [historicalRun]),
    );
    mocks.listLocalChatTranscriptMock.mockResolvedValue([historicalRun]);

    const { user } = await renderApp();
    const banner = screen.getByRole("region", { name: "Selected folder" });
    await user.click(
      within(banner).getByRole("button", { name: /open chat history/i }),
    );
    const drawer = await screen.findByRole("complementary", {
      name: "Workspace chat history",
    });
    await user.click(
      within(drawer).getByRole("button", { name: /remembered history/i }),
    );
    expect(await screen.findByText("Remembered result.")).toBeInTheDocument();

    const workspaceNav = screen.getByRole("navigation", { name: "Workspaces" });
    await user.click(
      within(workspaceNav).getByRole("button", { name: "mobile-client" }),
    );
    await user.click(
      within(workspaceNav).getByRole("button", { name: "orchestrator" }),
    );
    expect(screen.getByText("Remembered result.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /new chat/i }));
    expect(screen.queryByText("Remembered result.")).not.toBeInTheDocument();
    await user.click(
      within(workspaceNav).getByRole("button", { name: "mobile-client" }),
    );
    await user.click(
      within(workspaceNav).getByRole("button", { name: "orchestrator" }),
    );
    expect(screen.queryByText("Remembered result.")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("article", { name: "Submitted prompt" }),
    ).not.toBeInTheDocument();
  });

  it("keeps a selected history chat visible when submitting a follow-up prompt", async () => {
    prepareSignedInRun();
    const historicalChat = workspaceChatFixture({
      id: 404,
      title: "Old selected chat",
    });
    const historicalRun = workspaceRunFixture({
      id: 304,
      chat_id: historicalChat.id,
      original_prompt: "Old selected chat",
      final_message: "Old selected result.",
    });
    mocks.listWorkspaceChatsMock.mockResolvedValue([historicalChat]);
    mocks.getChatWithRunsMock.mockResolvedValue(
      workspaceChatWithRunsFixture(historicalChat, [historicalRun]),
    );

    const { user } = await renderApp();
    const banner = screen.getByRole("region", { name: "Selected folder" });
    await user.click(
      within(banner).getByRole("button", { name: /open chat history/i }),
    );
    const drawer = await screen.findByRole("complementary", {
      name: "Workspace chat history",
    });
    await user.click(
      within(drawer).getByRole("button", { name: /old selected chat/i }),
    );
    expect(await screen.findByText("Old selected result.")).toBeInTheDocument();

    const animationFrames = holdNextAnimationFrames();
    try {
      await user.type(screen.getByLabelText("Prompt"), "Start fresh work");
      await user.keyboard("{Enter}");

      const transcript = screen.getByLabelText("Task chat transcript");
      expect(transcript).toHaveTextContent("Start fresh work");
      expect(transcript).toHaveTextContent("Old selected result.");
    } finally {
      animationFrames.restore();
    }
  });

  it("starts a fresh Codex thread when a restored history thread is no longer available", async () => {
    prepareSignedInRun();
    const historicalChat = workspaceChatFixture({
      id: 405,
      title: "Restarted chat",
      codex_thread_id: "stale-thread",
    });
    const historicalRun = workspaceRunFixture({
      id: 305,
      chat_id: historicalChat.id,
      original_prompt: "Restarted chat",
      final_message: "Older result.",
    });
    mocks.listWorkspaceChatsMock.mockResolvedValue([historicalChat]);
    mocks.getChatWithRunsMock.mockResolvedValue(
      workspaceChatWithRunsFixture(historicalChat, [historicalRun]),
    );
    mocks.codexRpcMock.mockImplementation(
      async (_accountId: number, method: string, params?: unknown) => {
        if (method === "thread/start") {
          return { thread: { id: "fresh-thread" } };
        }
        if (method === "turn/start") {
          const threadId =
            params && typeof params === "object" && "threadId" in params
              ? (params as { threadId?: string }).threadId
              : null;
          if (threadId === "stale-thread") {
            throw new Error(
              JSON.stringify({
                code: -32600,
                message: "thread not found: stale-thread",
              }),
            );
          }
          return { turn: { id: "fresh-turn" } };
        }
        return {};
      },
    );

    const { user } = await renderApp();
    const banner = screen.getByRole("region", { name: "Selected folder" });
    await user.click(
      within(banner).getByRole("button", { name: /open chat history/i }),
    );
    const drawer = await screen.findByRole("complementary", {
      name: "Workspace chat history",
    });
    await user.click(within(drawer).getByRole("button", { name: /restarted chat/i }));

    await user.type(screen.getByLabelText("Prompt"), "Continue after restart");
    await user.keyboard("{Enter}");

    await waitFor(() =>
      expect(mocks.codexRpcMock).toHaveBeenCalledWith(
        7,
        "turn/start",
        expect.objectContaining({ threadId: "fresh-thread" }),
      ),
    );
    expect(mocks.codexRpcMock).toHaveBeenCalledWith(
      7,
      "turn/start",
      expect.objectContaining({ threadId: "stale-thread" }),
    );
    expect(mocks.codexRpcMock).toHaveBeenCalledWith(
      7,
      "thread/start",
      expect.objectContaining({ cwd: workspace.path }),
    );
    expect(mocks.updateChatMock).toHaveBeenCalledWith(405, {
      codexThreadId: "fresh-thread",
      status: "running",
    });
    expect(mocks.updateRunMock).toHaveBeenCalledWith(
      202,
      expect.objectContaining({ codexThreadId: "fresh-thread" }),
    );
    expect(screen.queryByText(/thread not found/i)).not.toBeInTheDocument();
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

  it("uses native Plan collaboration mode and implements the completed plan on the same thread", async () => {
    prepareSignedInRun();
    let turnNumber = 0;
    mocks.codexRpcMock.mockImplementation(
      async (_accountId: number, method: string) => {
        if (method === "collaborationMode/list") {
          return {
            data: [
              {
                name: "Plan",
                mode: "plan",
                model: null,
                reasoning_effort: "medium",
              },
              {
                name: "Default",
                mode: "default",
                model: null,
                reasoning_effort: null,
              },
            ],
          };
        }
        if (method === "thread/start") {
          return { thread: { id: "thread-plan" } };
        }
        if (method === "turn/start") {
          turnNumber += 1;
          return { turn: { id: `turn-${turnNumber}` } };
        }
        return {};
      },
    );

    const { user } = await renderApp();
    const planModeButton = screen.getByRole("button", { name: /plan mode/i });
    await user.click(planModeButton);
    expect(planModeButton).toHaveAttribute("aria-pressed", "true");
    await user.type(screen.getByLabelText("Prompt"), "Design native planning");
    await user.click(screen.getByRole("button", { name: /run codex/i }));
    expect(planModeButton).toHaveAttribute("aria-pressed", "false");

    await waitFor(() =>
      expect(mocks.codexRpcMock).toHaveBeenCalledWith(
        7,
        "turn/start",
        expect.objectContaining({
          threadId: "thread-plan",
          collaborationMode: expect.objectContaining({
            mode: "plan",
            settings: expect.objectContaining({
              reasoning_effort: "medium",
              developer_instructions: null,
            }),
          }),
          clientUserMessageId: expect.any(String),
        }),
      ),
    );
    const planningCall = mocks.codexRpcMock.mock.calls.find(
      (call) => call[1] === "turn/start",
    );
    expect(planningCall?.[2]).toEqual(
      expect.objectContaining({
        input: [
          expect.objectContaining({
            text: expect.not.stringContaining("Do not edit files yet"),
          }),
        ],
      }),
    );

    await emitCodexServerRequest({
      id: "question-1",
      method: "item/tool/requestUserInput",
      params: {
        threadId: "thread-plan",
        turnId: "turn-1",
        itemId: "question-item-1",
        autoResolutionMs: null,
        questions: [
          {
            id: "scope",
            header: "Scope",
            question: "Choose the implementation scope",
            isOther: false,
            isSecret: false,
            options: [
              { label: "Focused", description: "Keep the change small" },
              { label: "Broad", description: "Include adjacent cleanup" },
            ],
          },
        ],
      },
    });
    await user.click(screen.getByRole("radio", { name: /Focused/ }));
    await waitFor(() =>
      expect(mocks.resolveCodexServerRequestMock).toHaveBeenCalledWith(
        7,
        "question-1",
        "server-request-7-1-9",
        { answers: { scope: { answers: ["Focused"] } } },
      ),
    );
    await emitCodexServerRequest(
      {
        id: "question-auto",
        method: "item/tool/requestUserInput",
        params: {
          threadId: "thread-plan",
          turnId: "turn-1",
          itemId: "question-item-auto",
          autoResolutionMs: 5,
          questions: [
            {
              id: "optional",
              header: "Optional",
              question: "This may auto-resolve",
              isOther: false,
              isSecret: false,
              options: null,
            },
          ],
        },
      },
      { requestToken: "server-request-7-1-question-auto" },
    );
    await waitFor(() =>
      expect(mocks.resolveCodexServerRequestMock).toHaveBeenCalledWith(
        7,
        "question-auto",
        "server-request-7-1-question-auto",
        { answers: {} },
      ),
    );

    await emitCodexNotification({
      method: "item/plan/delta",
      params: {
        threadId: "thread-plan",
        turnId: "turn-1",
        itemId: "plan-item-1",
        delta: "Draft preview",
      },
    });
    await emitCodexNotification({
      method: "item/completed",
      params: {
        threadId: "thread-plan",
        turnId: "turn-1",
        item: {
          type: "plan",
          id: "plan-item-1",
          text: "# Native plan\n\n1. Apply the change",
        },
      },
    });
    expect(
      screen.queryByRole("button", { name: "Implement plan" }),
    ).not.toBeInTheDocument();

    await emitCodexNotification({
      method: "turn/completed",
      params: {
        threadId: "thread-plan",
        turnId: "turn-1",
        turn: { id: "turn-1", status: "completed", durationMs: 100 },
      },
    });

    const implement = await screen.findByRole("button", {
      name: "Implement plan",
    });
    expect(screen.getByRole("combobox", { name: "Run account" })).toBeDisabled();
    expect(screen.getByRole("combobox", { name: "Agent" })).toBeDisabled();
    fireEvent.click(implement);
    fireEvent.click(implement);

    await waitFor(() => {
      const turnCalls = mocks.codexRpcMock.mock.calls.filter(
        (call) => call[1] === "turn/start",
      );
      expect(turnCalls).toHaveLength(2);
      expect(turnCalls[1][2]).toEqual(
        expect.objectContaining({
          threadId: "thread-plan",
          collaborationMode: expect.objectContaining({ mode: "default" }),
          input: [
            expect.objectContaining({
              text: expect.stringContaining(
                "Before changing files, call `update_plan`",
              ),
            }),
          ],
        }),
      );
    });
    expect(mocks.codexRpcMock).toHaveBeenCalledWith(
      7,
      "thread/settings/update",
      expect.objectContaining({
        threadId: "thread-plan",
        collaborationMode: expect.objectContaining({ mode: "default" }),
      }),
    );
    expect(mocks.prepareBrowserSessionMock).toHaveBeenCalledTimes(2);
  });

  it("promotes and persists a proposed-plan final answer as a native Plan", async () => {
    prepareSignedInRun();
    mocks.readAgentNotificationPermissionStatusMock.mockResolvedValue("allowed");
    const markdown = [
      "# Add greeting text",
      "",
      "## Key Changes",
      "- Update `hello-world.txt`.",
      "",
      "```text",
      "Hello hello hello",
      "```",
    ].join("\n");
    const { user } = await renderApp();
    await startMockRun(user, "Make a plan for the greeting");
    window.dispatchEvent(new Event("blur"));

    await emitCodexNotification({
      method: "item/completed",
      params: {
        threadId: "thread-1",
        turnId: "turn-1",
        item: {
          type: "agentMessage",
          id: "proposed-plan-message",
          phase: "final_answer",
          text: `<proposed_plan>\n${markdown}\n</proposed_plan>`,
        },
      },
    });
    await emitCodexNotification({
      method: "turn/completed",
      params: {
        threadId: "thread-1",
        turnId: "turn-1",
        turn: { id: "turn-1", status: "completed", durationMs: 100 },
      },
    });

    const plan = await screen.findByLabelText("Codex plan");
    expect(
      within(plan).getByRole("heading", { name: "Add greeting text" }),
    ).toBeInTheDocument();
    expect(within(plan).getByText("Hello hello hello")).toBeInTheDocument();
    expect(
      within(plan).getByRole("button", { name: "Implement plan" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/<proposed_plan>/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Run summary")).not.toBeInTheDocument();
    await waitFor(() =>
      expect(mocks.updateRunMock).toHaveBeenCalledWith(
        202,
        expect.objectContaining({
          finalMessage: "",
          collaborationMode: "plan",
          runIntent: "plan",
          completedPlanItemId: "proposed-plan-message",
          completedPlanText: markdown,
          planReviewState: "available",
        }),
      ),
    );
    await waitFor(() =>
      expect(mocks.sendAgentNotificationMock).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Plan ready",
          body: "Make a plan for the greeting has a plan ready to review.",
          target: expect.objectContaining({
            kind: "plan-ready",
            planItemId: "proposed-plan-message",
            runId: 202,
          }),
        }),
      ),
    );
    expect(
      mocks.sendAgentNotificationMock.mock.calls.some(
        ([request]) => request.title === "Response complete",
      ),
    ).toBe(false);
  });

  it("fails closed when native Plan and Default presets are unavailable", async () => {
    prepareSignedInRun();
    mocks.codexRpcMock.mockImplementation(
      async (_accountId: number, method: string) => {
        if (method === "collaborationMode/list") {
          return { data: [{ name: "Default", mode: "default" }] };
        }
        return {};
      },
    );

    const { user } = await renderApp();
    await user.click(screen.getByRole("button", { name: /plan mode/i }));
    await user.type(screen.getByLabelText("Prompt"), "Plan unsupported work");
    await user.click(screen.getByRole("button", { name: /run codex/i }));

    await waitFor(() =>
      expect(screen.getByLabelText("Prompt")).toHaveValue("Plan unsupported work"),
    );
    expect(mocks.createChatMock).not.toHaveBeenCalled();
    expect(
      mocks.codexRpcMock.mock.calls.some((call) => call[1] === "turn/start"),
    ).toBe(false);
  });

  it("reconstructs and reconciles a persisted completed Plan when history reopens", async () => {
    prepareSignedInRun();
    const defaultMode = {
      mode: "default",
      settings: {
        model: "gpt-5.5",
        reasoning_effort: "high",
        developer_instructions: null,
      },
    };
    const chat = {
      ...workspaceChatFixture({ title: "Persisted native plan" }),
      collaboration_mode: "plan",
      saved_default_collaboration_mode_json: JSON.stringify(defaultMode),
    };
    const run = {
      ...workspaceRunFixture({
        chat_id: chat.id,
        original_prompt: "Plan persisted work",
        final_message: null,
      }),
      collaboration_mode: "plan",
      run_intent: "plan",
      client_user_message_id: "client-message-1",
      completed_plan_item_id: "plan-item-1",
      completed_plan_text: "# Persisted plan\n\n1. Reconcile it",
      plan_review_state: "available",
    } satisfies WorkspaceRunFixture;
    mocks.listWorkspaceChatsMock.mockResolvedValue([chat]);
    mocks.getChatWithRunsMock.mockResolvedValue(
      workspaceChatWithRunsFixture(chat, [run]),
    );
    mocks.listLocalChatTranscriptMock.mockResolvedValue([run]);
    mocks.codexRpcMock.mockImplementation(
      async (_accountId: number, method: string) => {
        if (method === "collaborationMode/list") {
          return {
            data: [
              { name: "Plan", mode: "plan", reasoning_effort: "medium" },
              { name: "Default", mode: "default" },
            ],
          };
        }
        if (method === "thread/resume") {
          return { thread: { id: "thread-1" } };
        }
        if (method === "thread/read") {
          return {
            thread: {
              id: "thread-1",
              turns: [
                {
                  id: "turn-1",
                  status: "completed",
                  items: [
                    {
                      type: "plan",
                      id: "plan-item-1",
                      text: "# Persisted plan\n\n1. Reconcile it",
                    },
                  ],
                },
              ],
            },
          };
        }
        return {};
      },
    );

    const { user } = await renderApp();
    const banner = screen.getByRole("region", { name: "Selected folder" });
    await user.click(
      within(banner).getByRole("button", { name: /open chat history/i }),
    );
    const drawer = await screen.findByRole("complementary", {
      name: "Workspace chat history",
    });
    await user.click(
      within(drawer).getByRole("button", { name: /persisted native plan/i }),
    );

    expect(
      await screen.findByRole("button", { name: "Implement plan" }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(mocks.codexRpcMock).toHaveBeenCalledWith(
        7,
        "thread/read",
        { threadId: "thread-1", includeTurns: true },
      ),
    );
    expect(mocks.codexRpcMock).toHaveBeenCalledWith(
      7,
      "thread/resume",
      { threadId: "thread-1", cwd: workspace.path },
    );

    const newChatButton = within(banner).getByRole("button", {
      name: /new chat/i,
    });
    expect(newChatButton).toBeEnabled();
    await user.click(newChatButton);

    expect(screen.queryByLabelText("Task chat transcript")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Implement plan" }),
    ).not.toBeInTheDocument();
  });

  it("reconstructs a legacy proposed-plan envelope as a native Plan", async () => {
    prepareSignedInRun();
    const markdown = [
      "# Add `Hello hello hello` To `hello-world.txt`",
      "",
      "## Summary",
      "Add the requested line without unrelated changes.",
      "",
      "## Test Plan",
      "- Run `git status --short`.",
    ].join("\n");
    const chat = workspaceChatFixture({
      id: 436,
      title: "Make a plan for adding the greeting",
    });
    const run = {
      ...workspaceRunFixture({
        id: 336,
        chat_id: chat.id,
        original_prompt: "Make a plan for adding the greeting",
        final_message: `<proposed_plan>\n${markdown}\n</proposed_plan>`,
      }),
      collaboration_mode: "default",
      run_intent: "normal",
      client_user_message_id: "legacy-proposed-plan-message",
      completed_plan_item_id: null,
      completed_plan_text: null,
      plan_review_state: "none",
    } satisfies WorkspaceRunFixture;
    mocks.listWorkspaceChatsMock.mockResolvedValue([chat]);
    mocks.getChatWithRunsMock.mockResolvedValue(
      workspaceChatWithRunsFixture(chat, [run]),
    );
    mocks.listLocalChatTranscriptMock.mockResolvedValue([run]);

    const { user } = await renderApp();
    const banner = screen.getByRole("region", { name: "Selected folder" });
    await user.click(
      within(banner).getByRole("button", { name: /open chat history/i }),
    );
    const drawer = await screen.findByRole("complementary", {
      name: "Workspace chat history",
    });
    await user.click(
      within(drawer).getByRole("button", {
        name: /make a plan for adding the greeting/i,
      }),
    );

    const plan = await screen.findByLabelText("Codex plan");
    expect(
      within(plan).getByRole("heading", {
        name: "Add Hello hello hello To hello-world.txt",
      }),
    ).toBeInTheDocument();
    expect(within(plan).getByText("Summary")).toBeInTheDocument();
    expect(
      within(plan).getByRole("button", { name: "Implement plan" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/<proposed_plan>/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Run summary")).not.toBeInTheDocument();
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
      additions: 1,
      deletions: 0,
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
    const changeSummary = within(banner).getByLabelText(
      "2 changed (1 modified, 1 untracked); 1 addition, 0 deletions",
    );
    expect(changeSummary).toHaveClass("git-summary");
    expect(within(changeSummary).getByText("+1")).toBeInTheDocument();
    expect(within(changeSummary).getByText("-0")).toBeInTheDocument();
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

  it("moves submitted images into the message and sends them as native image input", async () => {
    prepareSignedInRun();
    const imagePath = `${workspace.path}/screenshot.png`;
    let resolvePreflight!: (value: typeof preflight) => void;
    mocks.runPreflightMock.mockReturnValue(
      new Promise((resolve) => {
        resolvePreflight = resolve;
      }),
    );
    mocks.openDialogMock.mockResolvedValue(imagePath);

    const { user } = await renderApp();
    await user.click(screen.getByRole("button", { name: "Add files" }));
    await waitFor(() =>
      expect(mocks.prepareImageAttachmentMock).toHaveBeenCalledWith(imagePath),
    );
    await user.type(screen.getByLabelText("Prompt"), "Review this screenshot");
    await user.click(screen.getByRole("button", { name: /run codex/i }));

    expect(screen.getByLabelText("Prompt")).toHaveValue("");
    expect(screen.queryByLabelText("Selected context files")).not.toBeInTheDocument();
    const submittedImages = screen.getByLabelText("Submitted image");
    expect(within(submittedImages).getByRole("img", { name: "screenshot.png" }))
      .toBeInTheDocument();
    expect(within(submittedImages).queryByText("screenshot.png"))
      .not.toBeInTheDocument();
    expect(within(submittedImages).queryByText("Preparing image"))
      .not.toBeInTheDocument();
    await waitFor(() => expect(mocks.runPreflightMock).toHaveBeenCalledTimes(1));
    expect(
      mocks.codexRpcMock.mock.calls.some(([, method]) => method === "turn/start"),
    ).toBe(false);

    await act(async () => {
      resolvePreflight(preflight);
      await Promise.resolve();
    });

    await waitFor(() =>
      expect(
        mocks.codexRpcMock.mock.calls.some(([, method]) => method === "turn/start"),
      ).toBe(true),
    );
    const turnStart = mocks.codexRpcMock.mock.calls.find(
      ([, method]) => method === "turn/start",
    )?.[2];
    expect(turnStart).toEqual(
      expect.objectContaining({
        input: [
          expect.objectContaining({
            type: "text",
          }),
          {
            type: "localImage",
            path: imagePath,
            detail: "auto",
          },
        ],
        additionalContext: null,
      }),
    );
    expect(mocks.readCodexFileMock).not.toHaveBeenCalledWith(7, imagePath);
    expect(
      JSON.parse(mocks.createRunMock.mock.calls[0]?.[0].executionSettingsJson),
    ).toEqual(
      expect.objectContaining({
        contextFiles: [
          expect.objectContaining({
            path: imagePath,
            mediaKind: "image",
            mimeType: "image/png",
            width: 640,
            height: 480,
          }),
        ],
      }),
    );
  });

  it("restores images and prompt when image preparation fails before turn start", async () => {
    prepareSignedInRun();
    const imagePath = `${workspace.path}/broken.png`;
    mocks.openDialogMock.mockResolvedValue(imagePath);
    mocks.prepareImageAttachmentMock.mockRejectedValue(
      new Error("Selected image could not be decoded"),
    );

    const { user } = await renderApp();
    await user.click(screen.getByRole("button", { name: "Add files" }));
    await user.type(screen.getByLabelText("Prompt"), "Inspect this image");
    await user.click(screen.getByRole("button", { name: /run codex/i }));

    await waitFor(() =>
      expect(screen.getByLabelText("Prompt")).toHaveValue("Inspect this image"),
    );
    const contextList = screen.getByLabelText("Selected context files");
    expect(within(contextList).getByText("broken.png")).toBeInTheDocument();
    expect(screen.getByText("Image not sent")).toBeInTheDocument();
    expect(mocks.createTaskMock).not.toHaveBeenCalled();
    expect(
      mocks.codexRpcMock.mock.calls.some(([, method]) => method === "turn/start"),
    ).toBe(false);
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

  it("submits @ file references as Markdown without changing their visual token", async () => {
    prepareSignedInRun();
    mocks.listWorkspaceDirectoryMock.mockResolvedValue([
      {
        name: "App.tsx",
        path: `${workspace.path}/src/App.tsx`,
        relativePath: "src/App.tsx",
        kind: "file",
      },
    ]);

    const { user } = await renderApp();
    const promptInput = screen.getByLabelText("Prompt");
    await user.type(promptInput, "Update @app");
    await user.click(await screen.findByRole("option", { name: /app\.tsx/i }));

    expect(promptInput).toHaveValue("Update TSX App.tsx ");
    await user.click(screen.getByRole("button", { name: /run codex/i }));

    const markdownPrompt =
      "Update [App.tsx](/repo/orchestrator/src/App.tsx:1)";
    await waitFor(() =>
      expect(mocks.createTaskMock).toHaveBeenCalledWith(
        expect.objectContaining({ originalPrompt: markdownPrompt }),
      ),
    );
    expect(mocks.runPreflightMock).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: markdownPrompt }),
    );

    const submittedPrompt = within(
      screen.getByLabelText("Task chat transcript"),
    ).getByLabelText("Submitted prompt");
    const fileLink = within(submittedPrompt).getByRole("link", {
      name: "App.tsx",
    });
    expect(within(fileLink).getByText("TSX")).toBeInTheDocument();
    expect(fileLink).toHaveAttribute(
      "href",
      "/repo/orchestrator/src/App.tsx:1",
    );
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

    await user.click(
      screen.getByRole("checkbox", { name: /Use local OSS provider/ }),
    );
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

  it("requests notification permission only from Settings and persists each category", async () => {
    mocks.readAgentNotificationPermissionStatusMock.mockResolvedValue(
      "not-enabled",
    );
    const { user } = await renderApp();

    expect(mocks.requestAgentNotificationPermissionMock).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Settings" }));
    expect(screen.getByText("Not enabled")).toBeInTheDocument();

    await user.click(
      screen.getByRole("checkbox", { name: /Completed responses/ }),
    );
    await user.click(
      screen.getByRole("checkbox", { name: /Agent questions/ }),
    );
    await waitFor(() =>
      expect(
        JSON.parse(
          localStorage.getItem("orchestrator.agent-notifications.v1") ?? "{}",
        ),
      ).toEqual(
        expect.objectContaining({
          responseCompleted: false,
          approvalRequired: true,
          userInputRequired: false,
          planReady: true,
          externalAction: true,
        }),
      ),
    );

    await user.click(
      screen.getByRole("button", { name: "Enable notifications" }),
    );
    await waitFor(() =>
      expect(mocks.requestAgentNotificationPermissionMock).toHaveBeenCalledTimes(
        1,
      ),
    );
    expect(await screen.findByText("Allowed")).toBeInTheDocument();
  });

  it("opens macOS notification settings after permission is denied", async () => {
    mocks.readAgentNotificationPermissionStatusMock.mockResolvedValue("denied");
    const { user } = await renderApp();

    await user.click(screen.getByRole("button", { name: "Settings" }));
    expect(await screen.findByText("Denied")).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Open macOS settings" }),
    );

    expect(mocks.openAgentNotificationSettingsMock).toHaveBeenCalledTimes(1);
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
    mocks.readAgentNotificationPermissionStatusMock.mockResolvedValue("allowed");
    const { user } = await renderApp();

    expect(await screen.findByText("Sign in to Codex")).toBeInTheDocument();
    window.dispatchEvent(new Event("blur"));
    await user.click(screen.getByLabelText("Sign in to Codex"));

    await waitFor(() =>
      expect(mocks.openUrlMock).toHaveBeenCalledWith("https://example.com/auth"),
    );
    expect(mocks.startCodexLoginMock).toHaveBeenCalledWith(7);
    expect(await screen.findByText("Waiting for browser sign-in")).toBeInTheDocument();
    expect(screen.getByText("Click to cancel")).toBeInTheDocument();
    expect(screen.getByLabelText("Cancel Codex sign-in")).toBeInTheDocument();
    expect(screen.queryByLabelText("Codex account")).not.toBeInTheDocument();
    await waitFor(() =>
      expect(mocks.sendAgentNotificationMock).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Action required",
          body: expect.not.stringContaining("https://example.com/auth"),
          target: expect.objectContaining({
            kind: "external-action",
            accountId: 7,
            requestId: "login-1",
          }),
        }),
      ),
    );
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

  it("enables computer use by default and persists Settings changes", async () => {
    const { user } = await renderApp();
    await user.click(screen.getByRole("button", { name: "Settings" }));

    const computerUse = screen.getByRole("checkbox", {
      name: /enable browser computer use/i,
    });
    expect(computerUse).toBeChecked();
    expect(
      screen.getByRole("region", { name: "Computer use settings" }),
    ).toHaveTextContent("Available");

    await user.click(computerUse);
    expect(computerUse).not.toBeChecked();
    expect(
      JSON.parse(localStorage.getItem("orchestrator.computer-use.v1")!),
    ).toEqual({ enabled: false });
  });

  it("omits the scoped Playwright server when computer use is disabled", async () => {
    localStorage.setItem(
      "orchestrator.computer-use.v1",
      JSON.stringify({ enabled: false }),
    );
    prepareSignedInRun();

    const { user } = await renderApp();
    await startMockRun(user, "Make this change without a browser");

    expect(mocks.prepareBrowserSessionMock).not.toHaveBeenCalled();
    const threadStart = mocks.codexRpcMock.mock.calls.find(
      ([, method]) => method === "thread/start",
    );
    expect(threadStart?.[2]).toEqual(
      expect.objectContaining({
        config: expect.not.objectContaining({
          mcp_servers: expect.anything(),
        }),
      }),
    );
    expect(mocks.updateBrowserSessionTargetMock).not.toHaveBeenCalled();
  });

  it("reports an unavailable bundled browser without preventing Settings", async () => {
    mocks.readBrowserRuntimeStatusMock.mockResolvedValueOnce({
      available: false,
      message: "The pinned Chromium executable is unavailable.",
    });

    const { user } = await renderApp();
    await user.click(screen.getByRole("button", { name: "Settings" }));

    const settings = screen.getByRole("region", {
      name: "Computer use settings",
    });
    expect(await within(settings).findByText("Unavailable")).toBeInTheDocument();
    expect(within(settings).getByRole("alert")).toHaveTextContent(
      "The pinned Chromium executable is unavailable.",
    );
  });

  it("scopes the Playwright MCP browser to one turn and cleans it up", async () => {
    prepareSignedInRun();
    mocks.readBrowserSessionStatusMock.mockImplementationOnce(
      async (token) => ({
        token,
        status: "running",
        target: {
          profileKey: "account:7",
          workspaceId: workspace.id,
          chatId: 44,
          runId: 60,
          entryId: "entry",
          threadId: "thread-1",
          turnId: "turn-1",
          accessMode: "ask-for-approval",
        },
        browserPid: 4321,
        error: null,
      }),
    );

    const { user } = await renderApp();
    await startMockRun(user, "Check the app in a browser");

    expect(mocks.prepareBrowserSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        profileKey: "account:7",
        workspaceId: workspace.id,
        accessMode: "ask-for-approval",
      }),
    );
    const threadStart = mocks.codexRpcMock.mock.calls.find(
      ([, method]) => method === "thread/start",
    );
    expect(threadStart?.[2]).toEqual(
      expect.objectContaining({
        config: expect.objectContaining({
          mcp_servers: {
            playwright: {
              enabled: true,
            },
          },
        }),
      }),
    );

    await emitCodexNotification({
      method: "item/started",
      params: {
        threadId: "thread-1",
        turnId: "turn-1",
        item: {
          type: "mcpToolCall",
          id: "browser-call-1",
          server: "playwright",
          tool: "browser_navigate",
          status: "inProgress",
        },
      },
    });
    const browserButton = await screen.findByRole("button", {
      name: "Browser session",
    });
    await user.click(browserButton);
    expect(mocks.focusBrowserSessionMock).toHaveBeenCalledWith(
      "0123456789abcdef0123456789abcdef",
    );

    await emitCodexServerRequest({
      id: 77,
      method: "mcpServer/elicitation/request",
      params: {
        threadId: "thread-1",
        turnId: "turn-1",
        serverName: "playwright",
        mode: "form",
        _meta: {
          "orchestrator/browser-approval": {
            version: 1,
            nonce: "approval-1",
            sessionToken: "0123456789abcdef0123456789abcdef",
            kind: "origin",
            origin: "https://example.com",
            action: "navigate",
          },
        },
      },
    });
    expect(
      await screen.findByText(
        "Codex needs approval to open an external website",
      ),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Allow for this turn" }),
    );
    expect(mocks.resolveCodexServerRequestMock).toHaveBeenCalledWith(
      7,
      77,
      expect.any(String),
      {
        action: "accept",
        content: { decision: "allow" },
        _meta: null,
      },
    );

    await emitCodexNotification({
      method: "turn/completed",
      params: {
        threadId: "thread-1",
        turnId: "turn-1",
        turn: { id: "turn-1", status: "completed", durationMs: 100 },
      },
    });
    await waitFor(() =>
      expect(mocks.stopBrowserSessionMock).toHaveBeenCalledWith(
        "0123456789abcdef0123456789abcdef",
      ),
    );
    expect(mocks.codexRpcMock).toHaveBeenCalledWith(
      7,
      "thread/unsubscribe",
      { threadId: "thread-1" },
    );
  });

  it("generates a concise chat title without delaying the initial turn", async () => {
    prepareSignedInRun();
    let resolveTitle!: (value: { title: string }) => void;
    mocks.generateChatTitleMock.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveTitle = resolve;
      }),
    );
    const pendingChat = {
      ...workspaceChatFixture({
        id: 401,
        title: "Generating title...",
        status: "running",
      }),
      title_generation_state: "generating" as const,
    };
    mocks.createChatMock.mockResolvedValueOnce(pendingChat);
    mocks.listWorkspaceChatsMock.mockResolvedValue([pendingChat]);

    const { user } = await renderApp();
    await startMockRun(
      user,
      "Investigate and fix OAuth callback failures in the desktop app",
    );

    expect(mocks.createChatMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Investigate and fix OAuth callback failures in",
        generateTitle: true,
      }),
    );
    await waitFor(() =>
      expect(mocks.generateChatTitleMock).toHaveBeenCalledWith({
        workspacePath: workspace.path,
        accountId: 7,
        model: null,
        initialPrompt:
          "Investigate and fix OAuth callback failures in the desktop app",
      }),
    );
    expect(mocks.codexRpcMock).toHaveBeenCalledWith(
      7,
      "turn/start",
      expect.any(Object),
    );

    const banner = screen.getByRole("region", { name: "Selected folder" });
    await user.click(
      within(banner).getByRole("button", { name: /open chat history/i }),
    );
    const drawer = await screen.findByRole("complementary", {
      name: "Workspace chat history",
    });
    expect(within(drawer).getByText("Generating title...")).toBeInTheDocument();

    await act(async () => {
      resolveTitle({ title: "**Repair OAuth Callback Handling.**" });
    });
    await waitFor(() =>
      expect(mocks.completeChatTitleGenerationMock).toHaveBeenCalledWith(
        401,
        "Repair OAuth Callback Handling",
      ),
    );
    expect(
      within(drawer).getByText("Repair OAuth Callback Handling"),
    ).toBeInTheDocument();
  });

  it("recovers interrupted title generation once during startup", async () => {
    await renderApp();

    expect(
      mocks.recoverInterruptedChatTitleGenerationsMock,
    ).toHaveBeenCalledTimes(1);
    expect(mocks.generateChatTitleMock).not.toHaveBeenCalled();
  });

  it("falls back once when AI title generation fails", async () => {
    const warning = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);
    prepareSignedInRun();
    mocks.generateChatTitleMock.mockRejectedValueOnce(
      new Error("Title generation unavailable"),
    );

    try {
      const { user } = await renderApp();
      await startMockRun(user, "Repair the desktop OAuth callback flow");

      await waitFor(() =>
        expect(mocks.failChatTitleGenerationMock).toHaveBeenCalledWith(401),
      );
      expect(mocks.generateChatTitleMock).toHaveBeenCalledTimes(1);
      expect(mocks.completeChatTitleGenerationMock).not.toHaveBeenCalled();
      expect(warning).toHaveBeenCalledWith(
        "AI chat title generation failed for chat 401; using the prompt-based fallback.",
        expect.any(Error),
      );
    } finally {
      warning.mockRestore();
    }
  });

  it("uses Ask for approval for new threads and turns by default", async () => {
    prepareSignedInRun();

    const { user } = await renderApp();
    expect(screen.getByRole("combobox", { name: "Access" })).toHaveTextContent(
      "Ask for approval",
    );

    await startMockRun(user, "Run with native approvals");
    const threadStart = mocks.codexRpcMock.mock.calls.find(
      (call) => call[1] === "thread/start",
    );
    const turnStart = mocks.codexRpcMock.mock.calls.find(
      (call) => call[1] === "turn/start",
    );
    expect(threadStart?.[2]).toEqual(
      expect.objectContaining({
        approvalPolicy: "untrusted",
        approvalsReviewer: "user",
        permissions: ASK_FOR_APPROVAL_PERMISSION_PROFILE,
      }),
    );
    expect(turnStart?.[2]).toEqual(
      expect.objectContaining({
        approvalPolicy: "untrusted",
        approvalsReviewer: "user",
        permissions: ASK_FOR_APPROVAL_PERMISSION_PROFILE,
      }),
    );
    expect(mocks.createRunMock).toHaveBeenCalledWith(
      expect.objectContaining({
        approvalPolicy: "untrusted",
        sandbox: "workspace-write",
      }),
    );
  });

  it("sends and persists Full access on every turn", async () => {
    prepareSignedInRun();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);

    const { user } = await renderApp();
    await user.click(screen.getByRole("combobox", { name: "Access" }));
    await user.click(screen.getByRole("option", { name: "Full access" }));
    expect(confirm).toHaveBeenCalledWith(expect.stringMatching(/full access removes/i));

    await startMockRun(user, "First guarded turn");
    const threadStart = mocks.codexRpcMock.mock.calls.find(
      (call) => call[1] === "thread/start",
    );
    const firstTurnStart = mocks.codexRpcMock.mock.calls.find(
      (call) => call[1] === "turn/start",
    );
    expect(threadStart?.[2]).toEqual(
      expect.objectContaining({
        approvalPolicy: "never",
        approvalsReviewer: "user",
        permissions: ":danger-full-access",
      }),
    );
    expect(firstTurnStart?.[2]).toEqual(
      expect.objectContaining({
        approvalPolicy: "never",
        approvalsReviewer: "user",
        permissions: ":danger-full-access",
      }),
    );
    expect(mocks.createRunMock).toHaveBeenCalledWith(
      expect.objectContaining({
        approvalPolicy: "never",
        sandbox: "danger-full-access",
      }),
    );
    expect(JSON.parse(localStorage.getItem("orchestrator.codex-access.v2")!)).toEqual({
      accessMode: "full-access",
    });
    expect(screen.getByRole("combobox", { name: "Access" })).toBeDisabled();

    await emitCodexNotification({
      method: "turn/completed",
      params: { turn: { id: "turn-1", status: "completed", durationMs: 1000 } },
    });
    await user.type(screen.getByLabelText("Prompt"), "Follow-up guarded turn");
    await user.click(screen.getByRole("button", { name: /run codex/i }));
    await waitFor(() =>
      expect(
        mocks.codexRpcMock.mock.calls.filter((call) => call[1] === "turn/start"),
      ).toHaveLength(2),
    );
    const secondTurnStart = mocks.codexRpcMock.mock.calls.filter(
      (call) => call[1] === "turn/start",
    )[1];
    expect(secondTurnStart[2]).toEqual(
      expect.objectContaining({
        approvalPolicy: "never",
        approvalsReviewer: "user",
        permissions: ":danger-full-access",
      }),
    );
  });

  it("fails closed when Codex reports a different active permission profile", async () => {
    prepareSignedInRun();
    mocks.codexRpcMock.mockImplementation(
      async (_accountId: number, method: string) => {
        if (method === "thread/start") {
          return {
            thread: { id: "thread-1" },
            approvalPolicy: "untrusted",
            activePermissionProfile: { id: ":danger-full-access" },
          };
        }
        if (method === "turn/start") {
          return { turn: { id: "turn-1" } };
        }
        return {};
      },
    );

    const { user } = await renderApp();
    await user.type(screen.getByLabelText("Prompt"), "Do not weaken access");
    await user.click(screen.getByRole("button", { name: /run codex/i }));

    expect(
      await screen.findByText(/stopped to avoid a sandbox mismatch/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/update codex and retry/i)).toBeInTheDocument();
    expect(
      mocks.codexRpcMock.mock.calls.some((call) => call[1] === "turn/start"),
    ).toBe(false);
  });

  it("requires confirmation before enabling Full access", async () => {
    prepareSignedInRun();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);

    const { user } = await renderApp();
    await user.click(screen.getByRole("combobox", { name: "Access" }));
    await user.click(screen.getByRole("option", { name: "Full access" }));

    expect(confirm).toHaveBeenCalledWith(
      expect.stringMatching(/disables native approval prompts/i),
    );
    expect(screen.getByRole("combobox", { name: "Access" })).toHaveTextContent(
      "Ask for approval",
    );
    expect(localStorage.getItem("orchestrator.codex-access.v2")).toBeNull();
  });

  it("reuses the same Codex thread for follow-up prompts in one chat", async () => {
    prepareSignedInRun();

    const { user } = await renderApp();
    await startMockRun(user, "First prompt");
    await emitCodexNotification({
      method: "turn/completed",
      params: { turn: { status: "completed", durationMs: 1000 } },
    });

    await user.type(screen.getByLabelText("Prompt"), "Follow-up prompt");
    await user.click(screen.getByRole("button", { name: /run codex/i }));
    await waitFor(() =>
      expect(
        mocks.codexRpcMock.mock.calls.filter((call) => call[1] === "turn/start"),
      ).toHaveLength(2),
    );

    const threadStarts = mocks.codexRpcMock.mock.calls.filter(
      (call) => call[1] === "thread/start",
    );
    const turnStarts = mocks.codexRpcMock.mock.calls.filter(
      (call) => call[1] === "turn/start",
    );
    expect(threadStarts).toHaveLength(1);
    expect(turnStarts[1]?.[2]).toEqual(
      expect.objectContaining({ threadId: "thread-1" }),
    );
    expect(mocks.createChatMock).toHaveBeenCalledTimes(1);
    expect(mocks.createTaskMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ chatId: 401, turnIndex: 2 }),
    );
    expect(mocks.createRunMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ chatId: 401, turnIndex: 2 }),
    );
  });

  it("edits and reruns only the latest submitted prompt on a fresh thread", async () => {
    prepareSignedInRun();
    mocks.createTaskMock
      .mockResolvedValueOnce({ id: 101 })
      .mockResolvedValueOnce({ id: 102 });
    mocks.createRunMock
      .mockResolvedValueOnce({ id: 202 })
      .mockResolvedValueOnce({ id: 203 });

    const { user } = await renderApp();
    await startMockRun(user, "Original prompt");
    await emitCodexNotification({
      method: "item/agentMessage/delta",
      params: { itemId: "final-1", delta: "Original result." },
    });
    await emitCodexNotification({
      method: "item/completed",
      params: {
        item: {
          type: "agentMessage",
          id: "final-1",
          text: "Original result.",
          phase: "final_answer",
        },
      },
    });
    await emitCodexNotification({
      method: "turn/completed",
      params: { turn: { status: "completed", durationMs: 1000 } },
    });

    await user.click(await screen.findByRole("button", { name: "Edit prompt" }));
    await user.clear(screen.getByLabelText("Edit submitted prompt"));
    await user.type(screen.getByLabelText("Edit submitted prompt"), "Edited prompt");
    await user.click(screen.getByRole("button", { name: "Run edited prompt" }));

    await waitFor(() => expect(mocks.createTaskMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(mocks.createRunMock).toHaveBeenCalledTimes(2));
    expect(mocks.softDeleteRunMock).toHaveBeenCalledWith(202);
    expect(mocks.createTaskMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        chatId: 401,
        turnIndex: 1,
        originalPrompt: "Edited prompt",
      }),
    );
    expect(mocks.createRunMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ chatId: 401, turnIndex: 1 }),
    );
    expect(
      mocks.codexRpcMock.mock.calls.filter((call) => call[1] === "thread/start"),
    ).toHaveLength(2);
    const transcript = screen.getByLabelText("Task chat transcript");
    expect(within(transcript).getByLabelText("Submitted prompt")).toHaveTextContent(
      "Edited prompt",
    );
    expect(
      within(transcript).queryByText("Original prompt"),
    ).not.toBeInTheDocument();
  });

  it("reruns an edited prompt with its original execution settings", async () => {
    prepareSignedInRun();
    const originalModel = {
      id: "gpt-original",
      model: "gpt-original",
      displayName: "Original model",
      description: "Original model",
      hidden: false,
      supportedReasoningEfforts: [
        { reasoningEffort: "low", description: "Low" },
        { reasoningEffort: "high", description: "High" },
      ],
      defaultReasoningEffort: "high",
      isDefault: true,
    };
    const currentModel = {
      id: "gpt-current",
      model: "gpt-current",
      displayName: "Current model",
      description: "Current model",
      hidden: false,
      supportedReasoningEfforts: [
        { reasoningEffort: "medium", description: "Medium" },
      ],
      defaultReasoningEffort: "medium",
      isDefault: false,
    };
    mocks.listCodexModelsMock.mockResolvedValue([originalModel, currentModel]);
    mocks.listCodexSkillsMock.mockResolvedValue([
      {
        id: "docs",
        name: "Docs",
        description: "Use repository documentation",
      },
    ]);
    const imagePath = `${workspace.path}/reference.png`;
    mocks.openDialogMock.mockResolvedValue([
      `${workspace.path}/README.md`,
      imagePath,
    ]);
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);

    const { user } = await renderApp();
    await user.click(await screen.findByRole("combobox", { name: "Reasoning" }));
    await user.click(screen.getByRole("option", { name: "Low" }));
    await user.click(screen.getByRole("button", { name: "Add files" }));
    await user.click(screen.getByRole("button", { name: "Goal mode" }));
    const promptInput = screen.getByLabelText("Prompt");
    await user.type(promptInput, "Fix docs /docs");
    await user.click(await screen.findByRole("option", { name: /docs/i }));
    await user.click(screen.getByRole("button", { name: /run codex/i }));

    await waitFor(() => expect(mocks.createRunMock).toHaveBeenCalledTimes(1));
    const firstSettings = JSON.parse(
      mocks.createRunMock.mock.calls[0]?.[0].executionSettingsJson,
    );
    expect(firstSettings).toEqual(
      expect.objectContaining({
        version: 1,
        accountId: 7,
        profileKey: "account:7",
        selectedBranch: "main",
        mode: "run",
        intent: "normal",
        accessMode: "ask-for-approval",
        computerUseEnabled: true,
        model: "gpt-original",
        reasoningEffort: "low",
        useOss: false,
        ossProvider: "ollama",
        goalMode: true,
        contextFiles: [
          expect.objectContaining({
            path: `${workspace.path}/README.md`,
            source: "picker",
          }),
          expect.objectContaining({
            path: imagePath,
            source: "picker",
            mediaKind: "image",
            mimeType: "image/png",
          }),
        ],
        selectedSkills: [
          expect.objectContaining({ id: "docs", name: "Docs" }),
        ],
      }),
    );

    await emitCodexNotification({
      method: "turn/completed",
      params: { turn: { status: "completed", durationMs: 1000 } },
    });
    mocks.readCodexFileMock.mockResolvedValue("updated file contents");
    await user.click(screen.getByRole("button", { name: "Goal mode" }));
    await user.click(screen.getByRole("combobox", { name: "Agent" }));
    await user.click(screen.getByRole("option", { name: "Current model" }));
    await user.click(screen.getByRole("combobox", { name: "Access" }));
    await user.click(screen.getByRole("option", { name: "Full access" }));

    await user.click(await screen.findByRole("button", { name: "Edit prompt" }));
    await user.clear(screen.getByLabelText("Edit submitted prompt"));
    await user.type(
      screen.getByLabelText("Edit submitted prompt"),
      "Fix docs more carefully",
    );
    await user.click(screen.getByRole("button", { name: "Run edited prompt" }));

    await waitFor(() => expect(mocks.createRunMock).toHaveBeenCalledTimes(2));
    const secondSettings = JSON.parse(
      mocks.createRunMock.mock.calls[1]?.[0].executionSettingsJson,
    );
    expect(secondSettings).toEqual(firstSettings);
    expect(mocks.createRunMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        sandbox: "workspace-write",
        approvalPolicy: "untrusted",
        model: "gpt-original",
      }),
    );
    expect(mocks.setThreadGoalMock).toHaveBeenCalledTimes(2);
    expect(mocks.readCodexFileMock).toHaveBeenCalledWith(
      7,
      `${workspace.path}/README.md`,
    );
    const turnStarts = mocks.codexRpcMock.mock.calls.filter(
      ([, method]) => method === "turn/start",
    );
    expect(turnStarts[1]?.[2]).toEqual(
      expect.objectContaining({
        model: "gpt-original",
        effort: "low",
        approvalPolicy: "untrusted",
        permissions: ASK_FOR_APPROVAL_PERMISSION_PROFILE,
        additionalContext: {
          [`file:${workspace.path}/README.md`]: {
            kind: "untrusted",
            value: expect.stringContaining("updated file contents"),
          },
        },
        input: [
          expect.objectContaining({
            text: expect.stringContaining(
              "Docs: Use repository documentation",
            ),
          }),
          {
            type: "localImage",
            path: imagePath,
            detail: "auto",
          },
        ],
      }),
    );
    expect(mocks.readCodexFileMock).not.toHaveBeenCalledWith(7, imagePath);
    expect(mocks.prepareBrowserSessionMock).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("combobox", { name: "Agent" })).toHaveTextContent(
      "Current model",
    );
    expect(screen.getByRole("combobox", { name: "Access" })).toHaveTextContent(
      "Full access",
    );
    expect(screen.getByRole("button", { name: "Goal mode" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(confirm).toHaveBeenCalledTimes(1);
  });

  it("requires Full access confirmation again before replacing an edited turn", async () => {
    prepareSignedInRun();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);

    const { user } = await renderApp();
    await user.click(screen.getByRole("combobox", { name: "Access" }));
    await user.click(screen.getByRole("option", { name: "Full access" }));
    await startMockRun(user, "Original full-access prompt");
    await emitCodexNotification({
      method: "turn/completed",
      params: { turn: { status: "completed", durationMs: 1000 } },
    });

    confirm.mockReturnValue(false);
    await user.click(await screen.findByRole("button", { name: "Edit prompt" }));
    await user.clear(screen.getByLabelText("Edit submitted prompt"));
    await user.type(screen.getByLabelText("Edit submitted prompt"), "Edited prompt");
    await user.click(screen.getByRole("button", { name: "Run edited prompt" }));

    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(2));
    expect(mocks.createRunMock).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("Submitted prompt")).toHaveTextContent(
      "Original full-access prompt",
    );
  });

  it("preserves Plan Mode when rerunning an edited prompt after the toggle resets", async () => {
    prepareSignedInRun();
    mocks.codexRpcMock.mockImplementation(
      async (_accountId: number, method: string) => {
        if (method === "collaborationMode/list") {
          return {
            data: [
              { name: "Plan", mode: "plan", reasoning_effort: "medium" },
              { name: "Default", mode: "default", reasoning_effort: null },
            ],
          };
        }
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
    await user.click(screen.getByRole("button", { name: "Plan mode" }));
    await startMockRun(user, "Plan the original change");
    expect(screen.getByRole("button", { name: "Plan mode" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    await emitCodexNotification({
      method: "turn/completed",
      params: { turn: { status: "completed", durationMs: 1000 } },
    });

    await user.click(await screen.findByRole("button", { name: "Edit prompt" }));
    await user.clear(screen.getByLabelText("Edit submitted prompt"));
    await user.type(
      screen.getByLabelText("Edit submitted prompt"),
      "Plan the corrected change",
    );
    await user.click(screen.getByRole("button", { name: "Run edited prompt" }));

    await waitFor(() => expect(mocks.createRunMock).toHaveBeenCalledTimes(2));
    const settings = JSON.parse(
      mocks.createRunMock.mock.calls[1]?.[0].executionSettingsJson,
    );
    expect(settings).toEqual(
      expect.objectContaining({
        mode: "plan",
        intent: "plan",
        goalMode: false,
      }),
    );
    const turnStarts = mocks.codexRpcMock.mock.calls.filter(
      ([, method]) => method === "turn/start",
    );
    expect(turnStarts[1]?.[2]).toEqual(
      expect.objectContaining({
        collaborationMode: expect.objectContaining({ mode: "plan" }),
      }),
    );
    expect(screen.getByRole("button", { name: "Plan mode" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("loads persisted execution settings before editing a historical prompt", async () => {
    prepareSignedInRun();
    const originalModel = {
      id: "gpt-original",
      model: "gpt-original",
      displayName: "Original model",
      description: "Original model",
      hidden: false,
      supportedReasoningEfforts: [
        { reasoningEffort: "high", description: "High" },
      ],
      defaultReasoningEffort: "high",
      isDefault: true,
    };
    mocks.listCodexModelsMock.mockResolvedValue([originalModel]);
    const historicalChat = workspaceChatFixture({
      id: 408,
      title: "Persist original settings",
    });
    const historicalImagePath = `${workspace.path}/reference.png`;
    const persistedSettings = {
      version: 1,
      accountId: 7,
      profileKey: "account:7",
      selectedBranch: "main",
      mode: "run",
      intent: "normal",
      accessMode: "ask-for-approval",
      computerUseEnabled: false,
      model: "gpt-original",
      reasoningEffort: "high",
      useOss: false,
      ossProvider: "lmstudio",
      contextFiles: [
        {
          path: `${workspace.path}/README.md`,
          name: "README.md",
          relativePath: "README.md",
          source: "picker",
          status: "ready",
        },
        {
          path: historicalImagePath,
          canonicalPath: historicalImagePath,
          name: "reference.png",
          source: "picker",
          mediaKind: "image",
          mimeType: "image/png",
          width: 640,
          height: 480,
          status: "ready",
          error: null,
        },
      ],
      selectedSkills: [
        {
          id: "docs",
          name: "Docs",
          description: "Use repository documentation",
        },
      ],
      goalMode: false,
    };
    const historicalRun = {
      ...workspaceRunFixture({
        id: 308,
        chat_id: historicalChat.id,
        original_prompt: "Persist original settings",
        final_message: "Original response.",
      }),
      run_intent: "normal",
      collaboration_mode: "default",
      completed_plan_item_id: null,
      completed_plan_text: null,
      plan_review_state: "none",
      execution_settings_json: JSON.stringify(persistedSettings),
    } satisfies WorkspaceRunFixture;
    mocks.listWorkspaceChatsMock.mockResolvedValue([historicalChat]);
    mocks.getChatWithRunsMock.mockResolvedValue(
      workspaceChatWithRunsFixture(historicalChat, [historicalRun]),
    );
    mocks.listLocalChatTranscriptMock.mockResolvedValue([historicalRun]);

    const { user } = await renderApp();
    const banner = screen.getByRole("region", { name: "Selected folder" });
    await user.click(
      within(banner).getByRole("button", { name: /open chat history/i }),
    );
    const drawer = await screen.findByRole("complementary", {
      name: "Workspace chat history",
    });
    await user.click(
      within(drawer).getByRole("button", { name: /persist original settings/i }),
    );
    expect(
      await screen.findByRole("img", { name: "reference.png" }),
    ).toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: "Edit prompt" }));
    await user.click(screen.getByRole("button", { name: "Run edited prompt" }));

    await waitFor(() => expect(mocks.createRunMock).toHaveBeenCalledTimes(1));
    expect(
      JSON.parse(mocks.createRunMock.mock.calls[0]?.[0].executionSettingsJson),
    ).toEqual(persistedSettings);
    expect(mocks.prepareBrowserSessionMock).not.toHaveBeenCalled();
    expect(mocks.readCodexFileMock).toHaveBeenCalledWith(
      7,
      `${workspace.path}/README.md`,
    );
    expect(mocks.readCodexFileMock).not.toHaveBeenCalledWith(
      7,
      historicalImagePath,
    );
    expect(
      mocks.codexRpcMock.mock.calls.find(([, method]) => method === "turn/start")
        ?.[2],
    ).toEqual(
      expect.objectContaining({
        model: "gpt-original",
        effort: "high",
        input: [
          expect.objectContaining({
            text: expect.stringContaining("Docs: Use repository documentation"),
          }),
          {
            type: "localImage",
            path: historicalImagePath,
            detail: "auto",
          },
        ],
      }),
    );
  });

  it("keeps the original turn visible when its saved model is unavailable", async () => {
    prepareSignedInRun();
    const unavailableModel = {
      id: "removed-model",
      model: "removed-model",
      displayName: "Removed model",
      description: "Removed model",
      hidden: false,
      supportedReasoningEfforts: [
        { reasoningEffort: "high", description: "High" },
      ],
      defaultReasoningEffort: "high",
      isDefault: true,
    };
    mocks.listCodexModelsMock.mockResolvedValueOnce([unavailableModel]);

    const { user } = await renderApp();
    expect(
      await screen.findByRole("combobox", { name: "Agent" }),
    ).toHaveTextContent("Removed model");
    await startMockRun(user, "Keep this prompt visible");
    await emitCodexNotification({
      method: "turn/completed",
      params: { turn: { status: "completed", durationMs: 1000 } },
    });
    mocks.listCodexModelsMock.mockResolvedValue([]);

    await user.click(await screen.findByRole("button", { name: "Edit prompt" }));
    await user.clear(screen.getByLabelText("Edit submitted prompt"));
    await user.type(screen.getByLabelText("Edit submitted prompt"), "Do not replace");
    await user.click(screen.getByRole("button", { name: "Run edited prompt" }));

    expect(
      await screen.findByText(
        "The original model removed-model is no longer available.",
      ),
    ).toBeInTheDocument();
    expect(mocks.createRunMock).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("Submitted prompt")).toHaveTextContent(
      "Keep this prompt visible",
    );
  });

  it("reconstructs malformed legacy settings without changing composer defaults", async () => {
    prepareSignedInRun();
    const historicalChat = workspaceChatFixture({
      id: 409,
      title: "Legacy settings",
      turn_count: 1,
    });
    const historicalRun = {
      ...workspaceRunFixture({
        id: 309,
        chat_id: historicalChat.id,
        original_prompt: "Legacy prompt",
        final_message: "Legacy response.",
      }),
      model: null,
      model_provider: null,
      execution_settings_json: "{invalid",
    };
    mocks.listWorkspaceChatsMock.mockResolvedValue([historicalChat]);
    mocks.getChatWithRunsMock.mockResolvedValue(
      workspaceChatWithRunsFixture(historicalChat, [historicalRun]),
    );
    mocks.listLocalChatTranscriptMock.mockResolvedValue([historicalRun]);

    const { user } = await renderApp();
    const banner = screen.getByRole("region", { name: "Selected folder" });
    await user.click(
      within(banner).getByRole("button", { name: /open chat history/i }),
    );
    const drawer = await screen.findByRole("complementary", {
      name: "Workspace chat history",
    });
    await user.click(
      within(drawer).getByRole("button", { name: /legacy settings/i }),
    );
    await user.click(await screen.findByRole("button", { name: "Edit prompt" }));
    await user.click(screen.getByRole("button", { name: "Run edited prompt" }));

    await waitFor(() => expect(mocks.createRunMock).toHaveBeenCalledTimes(1));
    expect(
      screen.queryByText(/predates saved execution settings/i),
    ).not.toBeInTheDocument();
    expect(
      JSON.parse(mocks.createRunMock.mock.calls[0]?.[0].executionSettingsJson),
    ).toEqual(
      expect.objectContaining({
        accountId: 7,
        profileKey: "account:7",
        mode: "run",
        accessMode: "ask-for-approval",
        computerUseEnabled: false,
        model: null,
        reasoningEffort: null,
        contextFiles: [],
        selectedSkills: [],
        goalMode: false,
      }),
    );
    expect(screen.getByRole("combobox", { name: "Access" })).toHaveTextContent(
      "Ask for approval",
    );
  });

  it("retries an edited prompt after account/read times out before chat creation", async () => {
    prepareSignedInRun();
    let accountReadCount = 0;
    mocks.readCodexAccountMock.mockImplementation(async () => {
      accountReadCount += 1;
      if (accountReadCount === 2) {
        throw new Error("Timed out waiting for Codex response to account/read");
      }
      return {
        account: {
          type: "chatgpt",
          email: signedInAccount.email,
          planType: signedInAccount.plan_type,
        },
        requiresOpenaiAuth: true,
      };
    });

    const { user } = await renderApp();
    await screen.findByLabelText("Codex account");
    await user.type(screen.getByLabelText("Prompt"), "Build snake");
    await user.click(screen.getByRole("button", { name: /run codex/i }));

    expect(
      await screen.findByText(
        "Timed out waiting for Codex response to account/read",
      ),
    ).toBeInTheDocument();
    expect(mocks.createChatMock).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Codex account")).toBeInTheDocument();
    expect(screen.queryByLabelText("Sign in to Codex")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Edit prompt" }));
    expect(screen.getByLabelText("Edit submitted prompt")).toHaveValue(
      "Build snake",
    );
    await user.click(screen.getByRole("button", { name: "Run edited prompt" }));

    await waitFor(() =>
      expect(mocks.codexRpcMock).toHaveBeenCalledWith(
        7,
        "turn/start",
        expect.any(Object),
      ),
    );
    expect(mocks.createChatMock).toHaveBeenCalledTimes(1);
    expect(mocks.createTaskMock).toHaveBeenCalledWith(
      expect.objectContaining({
        chatId: 401,
        turnIndex: 1,
        originalPrompt: "Build snake",
      }),
    );
    expect(screen.getByLabelText("Submitted prompt")).toHaveTextContent(
      "Build snake",
    );
  });

  it("starts a fresh Codex thread after New chat is clicked", async () => {
    prepareSignedInRun();
    mocks.createChatMock
      .mockResolvedValueOnce({
        id: 401,
        workspace_id: workspace.id,
        account_id: 7,
        title: "First prompt",
        codex_thread_id: null,
        status: "starting",
        created_at: "2026-06-30T09:00:00Z",
        updated_at: "2026-06-30T09:00:00Z",
        deleted_at: null,
      })
      .mockResolvedValueOnce({
        id: 402,
        workspace_id: workspace.id,
        account_id: 7,
        title: "Second prompt",
        codex_thread_id: null,
        status: "starting",
        created_at: "2026-06-30T09:02:00Z",
        updated_at: "2026-06-30T09:02:00Z",
        deleted_at: null,
      });

    const { user } = await renderApp();
    await startMockRun(user, "First prompt");
    await emitCodexNotification({
      method: "turn/completed",
      params: { turn: { status: "completed", durationMs: 1000 } },
    });

    await user.click(screen.getByRole("button", { name: /new chat/i }));
    expect(screen.queryByLabelText("Task chat transcript")).not.toBeInTheDocument();
    await user.type(screen.getByLabelText("Prompt"), "Second prompt");
    await user.click(screen.getByRole("button", { name: /run codex/i }));
    await waitFor(() =>
      expect(
        mocks.codexRpcMock.mock.calls.filter((call) => call[1] === "thread/start"),
      ).toHaveLength(2),
    );
    expect(mocks.createChatMock).toHaveBeenCalledTimes(2);
    expect(mocks.createRunMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ chatId: 402, turnIndex: 1 }),
    );
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

    await waitFor(() =>
      expect(mocks.codexRpcMock).toHaveBeenCalledWith(7, "turn/interrupt", {
        threadId: "thread-1",
        turnId: "turn-1",
      }),
    );
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

    const promptInput = screen.getByLabelText("Prompt") as HTMLTextAreaElement;
    await user.type(promptInput, "Prepare the follow-up while Codex streams");
    promptInput.setSelectionRange(11, 11);

    await emitCodexNotification({
      method: "item/agentMessage/delta",
      params: { delta: "Updated the auth flow." },
    });

    const transcript = screen.getByLabelText("Task chat transcript");
    expect(transcript).toBeInTheDocument();
    expect(within(transcript).getByLabelText("Submitted prompt")).toHaveTextContent(
      "Fix the streaming output",
    );
    await waitFor(() =>
      expect(
        within(transcript).getByText("Updated the auth flow."),
      ).toBeInTheDocument(),
    );
    expect(screen.getByLabelText("Prompt")).toBe(promptInput);
    expect(promptInput).toHaveValue("Prepare the follow-up while Codex streams");
    expect(promptInput.selectionStart).toBe(11);
    expect(promptInput.selectionEnd).toBe(11);
  });

  it("shows native multi-step progress without disturbing composer focus", async () => {
    prepareSignedInRun();

    const { user } = await renderApp();
    await startMockRun(user, "Implement the planned workspace changes");
    const promptInput = screen.getByLabelText("Prompt") as HTMLTextAreaElement;
    await user.type(promptInput, "Keep this follow-up draft");
    promptInput.setSelectionRange(9, 9);

    await emitCodexNotification({
      method: "turn/plan/updated",
      params: {
        threadId: "thread-1",
        turnId: "turn-1",
        plan: [
          { step: "Inspect the repository", status: "completed" },
          { step: "Implement the change", status: "in_progress" },
          { step: "Run verification", status: "pending" },
        ],
      },
    });

    const composer = screen.getByLabelText("Task composer");
    const progress = await within(composer).findByRole("status");
    expect(progress).toHaveTextContent("Step 2 / 3");
    expect(progress).toHaveTextContent("Implement the change");
    expect(promptInput).toHaveFocus();
    expect(promptInput.selectionStart).toBe(9);

    await emitCodexNotification({
      method: "thread/status/changed",
      params: {
        threadId: "thread-1",
        status: {
          type: "active",
          activeFlags: ["waitingOnApproval"],
        },
      },
    });
    expect(within(composer).getByRole("status")).toHaveTextContent(
      "Waiting for approval",
    );

    await emitCodexNotification({
      method: "turn/plan/updated",
      params: {
        threadId: "thread-1",
        turnId: "turn-1",
        plan: [
          { step: "Inspect the repository", status: "completed" },
          { step: "Implement the change", status: "completed" },
          { step: "Run verification", status: "completed" },
        ],
      },
    });
    expect(within(composer).queryByRole("status")).not.toBeInTheDocument();
    expect(promptInput).toHaveFocus();
    expect(promptInput).toHaveValue("Keep this follow-up draft");
  });

  it("replays plan progress received before the turn identity is bound", async () => {
    prepareSignedInRun();
    let resolveTurnStart!: (value: { turn: { id: string } }) => void;
    const turnStart = new Promise<{ turn: { id: string } }>((resolve) => {
      resolveTurnStart = resolve;
    });
    mocks.codexRpcMock.mockImplementation(
      async (_accountId: number, method: string) => {
        if (method === "thread/start") {
          return { thread: { id: "thread-early-progress" } };
        }
        if (method === "turn/start") {
          return turnStart;
        }
        return {};
      },
    );

    const { user } = await renderApp();
    await startMockRun(user, "Implement the approved plan");

    await emitCodexNotification({
      method: "turn/plan/updated",
      params: {
        threadId: "thread-early-progress",
        turnId: "turn-early-progress",
        plan: [
          { step: "Inspect the repository", status: "completed" },
          { step: "Implement the change", status: "inProgress" },
          { step: "Run verification", status: "pending" },
        ],
      },
    });

    await act(async () => {
      resolveTurnStart({ turn: { id: "turn-early-progress" } });
      await turnStart;
    });

    const composer = screen.getByLabelText("Task composer");
    const progress = await within(composer).findByRole("status");
    expect(progress).toHaveTextContent("Step 2 / 3");
    expect(progress).toHaveTextContent("Implement the change");
  });

  it("opens edited files in the diff drawer and undoes their exact saved patch", async () => {
    prepareSignedInRun();
    mocks.readWorkspaceGitDiffMock.mockResolvedValue({
      path: "/repo/orchestrator/README.md",
      relativePath: "README.md",
      sections: [],
    });

    const { user } = await renderApp();
    await startMockRun(user, "Update the readme");
    const diff = [
      "diff --git a/README.md b/README.md",
      "--- a/README.md",
      "+++ b/README.md",
      "@@ -1 +1 @@",
      "-Old",
      "+New",
    ].join("\n");

    await emitCodexNotification({
      method: "turn/diff/updated",
      params: { diff },
    });

    expect(screen.queryByLabelText("Edited 1 file")).not.toBeInTheDocument();

    await emitCodexNotification({
      method: "turn/completed",
      params: { turn: { status: "completed", durationMs: 1234 } },
    });

    const summary = await screen.findByLabelText("Edited 1 file");
    await user.click(
      within(summary).getByRole("button", { name: "Review README.md" }),
    );

    await waitFor(() =>
      expect(mocks.readWorkspaceGitDiffMock).toHaveBeenCalledWith(
        workspace.path,
        "/repo/orchestrator/README.md",
      ),
    );
    expect(
      within(screen.getByRole("complementary", { name: "File preview" })).getByText(
        "Git diff",
      ),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Close file preview" }));

    await waitFor(() =>
      expect(within(screen.getByLabelText("Edited 1 file")).getByRole("button", {
        name: "Undo file changes",
      })).toBeEnabled(),
    );

    const completedSummary = screen.getByLabelText("Edited 1 file");
    await user.click(
      within(completedSummary).getByRole("button", {
        name: "Undo file changes",
      }),
    );
    await user.click(
      within(
        screen.getByRole("dialog", { name: "Undo changes?" }),
      ).getByRole("button", { name: "Undo changes" }),
    );

    await waitFor(() =>
      expect(mocks.undoWorkspaceGitDiffMock).toHaveBeenCalledWith(
        workspace.path,
        diff,
      ),
    );
    expect(within(completedSummary).queryByText("Changes undone.")).toBeNull();
    expect(
      within(completedSummary).getByRole("button", {
        name: "File changes undone",
      }),
    ).toBeDisabled();
  });

  it("coalesces bursty app-server deltas without disturbing active typing", async () => {
    prepareSignedInRun();

    const { user } = await renderApp();
    await startMockRun(user, "Stream a large response");
    const promptInput = screen.getByLabelText("Prompt") as HTMLTextAreaElement;
    await user.type(promptInput, "Keep this follow-up responsive");
    promptInput.focus();
    promptInput.setSelectionRange(9, 9);

    await act(async () => {
      const listener = mocks.listeners.get("codex:notification");
      for (let index = 0; index < 120; index += 1) {
        listener?.({
          payload: {
            accountId: 7,
            message: {
              method: "item/agentMessage/delta",
              params: { itemId: "commentary-1", delta: "x" },
            },
          },
        });
      }
    });

    await waitFor(() =>
      expect(
        within(screen.getByLabelText("Task chat transcript")).getByText(
          "x".repeat(120),
        ),
      ).toBeInTheDocument(),
    );
    await waitFor(() =>
      expect(
        mocks.appendRunEventsMock.mock.calls.flatMap(([events]) => events),
      ).toHaveLength(120),
    );

    expect(mocks.appendRunEventsMock.mock.calls.length).toBeLessThanOrEqual(3);
    expect(screen.getByLabelText("Prompt")).toBe(promptInput);
    expect(promptInput).toHaveValue("Keep this follow-up responsive");
    expect(promptInput).toHaveFocus();
    expect(promptInput.selectionStart).toBe(9);
    expect(promptInput.selectionEnd).toBe(9);
  });

  it("keeps ordinary prompt typing off the native bridge and database path", async () => {
    prepareSignedInRun();
    const { user } = await renderApp();
    const before = {
      rpc: mocks.codexRpcMock.mock.calls.length,
      createTask: mocks.createTaskMock.mock.calls.length,
      createRun: mocks.createRunMock.mock.calls.length,
      appendOne: mocks.appendRunEventMock.mock.calls.length,
      appendBatch: mocks.appendRunEventsMock.mock.calls.length,
      tokenWrites: mocks.recordTokenUsageMock.mock.calls.length,
    };

    await user.type(
      screen.getByLabelText("Prompt"),
      "Typing stays entirely inside the composer until the user submits it.",
    );

    expect(mocks.codexRpcMock).toHaveBeenCalledTimes(before.rpc);
    expect(mocks.createTaskMock).toHaveBeenCalledTimes(before.createTask);
    expect(mocks.createRunMock).toHaveBeenCalledTimes(before.createRun);
    expect(mocks.appendRunEventMock).toHaveBeenCalledTimes(before.appendOne);
    expect(mocks.appendRunEventsMock).toHaveBeenCalledTimes(before.appendBatch);
    expect(mocks.recordTokenUsageMock).toHaveBeenCalledTimes(before.tokenWrites);
  });

  it("renders approval requests inline and resolves them from the chat", async () => {
    prepareSignedInRun();
    mocks.readAgentNotificationPermissionStatusMock.mockResolvedValue("allowed");

    const { user } = await renderApp();
    await startMockRun(user, "Run the tests");
    window.dispatchEvent(new Event("blur"));

    await emitCodexServerRequest({
      id: 9,
      method: "item/commandExecution/requestApproval",
      params: {
        threadId: "thread-1",
        turnId: "turn-1",
        itemId: "command-1",
        command: "npm test",
        cwd: "/repo/orchestrator",
        environmentId: "local",
        reason: "Tests require access outside the current sandbox.",
        availableDecisions: ["accept", "decline", "cancel"],
      },
    });

    const approval = screen
      .getByText("Codex needs approval to run a command")
      .closest("article")!;
    expect(approval).toBeInTheDocument();
    expect(within(approval).getByText(/npm test/)).toBeInTheDocument();
    const workingDirectory = within(approval).getByText("/repo/orchestrator");
    expect(workingDirectory.tagName).toBe("PRE");
    expect(workingDirectory).toHaveClass("approval-code-surface");
    expect(workingDirectory.parentElement).toHaveClass(
      "approval-context-code-row",
    );
    expect(within(approval).queryByText("Environment")).not.toBeInTheDocument();
    expect(within(approval).queryByText("local")).not.toBeInTheDocument();
    await waitFor(() =>
      expect(mocks.sendAgentNotificationMock).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Approval required",
          body: expect.not.stringContaining("npm test"),
          target: expect.objectContaining({
            kind: "approval-required",
            workspaceId: workspace.id,
            chatId: 401,
            runId: 202,
            requestId: expect.any(String),
          }),
        }),
      ),
    );
    const approvalEventKey = mocks.sendAgentNotificationMock.mock.calls[0][0]
      .target.eventKey;

    await user.click(screen.getByRole("button", { name: /approve once/i }));
    await waitFor(() =>
      expect(mocks.resolveCodexServerRequestMock).toHaveBeenCalledWith(
        7,
        9,
        "server-request-7-1-9",
        { decision: "accept" },
      ),
    );
    await waitFor(() =>
      expect(mocks.removeAgentNotificationMock).toHaveBeenCalledWith(
        approvalEventKey,
      ),
    );
    expect(screen.getByText(/waiting for codex to resolve/i)).toBeInTheDocument();

    await emitCodexNotification({
      method: "serverRequest/resolved",
      params: { threadId: "thread-1", requestId: 9 },
    });
    expect(
      screen.queryByText("Codex needs approval to run a command"),
    ).not.toBeInTheDocument();
  });

  it("renders exact outside-workspace permissions and grants them for one turn only", async () => {
    prepareSignedInRun();
    const { user } = await renderApp();
    await startMockRun(user, "Install the project dependencies");

    await emitCodexServerRequest({
      id: 9,
      method: "item/permissions/requestApproval",
      params: {
        threadId: "thread-1",
        turnId: "turn-1",
        itemId: "permissions-1",
        permissions: {
          fileSystem: {
            entries: [
              {
                access: "write",
                path: { type: "path", path: "/Users/example/.npm" },
              },
            ],
          },
        },
      },
    });

    const approval = screen
      .getByText("Codex needs approval to write outside the workspace")
      .closest("article")!;
    expect(within(approval).getByText("Write")).toBeInTheDocument();
    expect(within(approval).getByText("/Users/example/.npm")).toHaveClass(
      "approval-code-surface",
    );
    expect(
      within(approval).queryByText("Requested permission scope"),
    ).not.toBeInTheDocument();
    expect(
      within(approval).queryByRole("button", { name: /session/i }),
    ).not.toBeInTheDocument();

    await user.click(
      within(approval).getByRole("button", {
        name: "Allow for this turn",
      }),
    );
    expect(mocks.resolveCodexServerRequestMock).toHaveBeenCalledWith(
      7,
      9,
      "server-request-7-1-9",
      {
        permissions: {
          fileSystem: {
            entries: [
              {
                access: "write",
                path: { type: "path", path: "/Users/example/.npm" },
              },
            ],
          },
        },
        scope: "turn",
      },
    );
  });

  it("fails closed when Codex requests a broad filesystem permission", async () => {
    prepareSignedInRun();
    const { user } = await renderApp();
    await startMockRun(user, "Install the project dependencies");

    await emitCodexServerRequest({
      id: 9,
      method: "item/permissions/requestApproval",
      params: {
        threadId: "thread-1",
        turnId: "turn-1",
        permissions: {
          fileSystem: {
            entries: [
              {
                access: "write",
                path: {
                  type: "glob_pattern",
                  pattern: "/Users/example/**",
                },
              },
            ],
          },
        },
      },
    });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /exact, absolute, non-root paths/i,
    );
    expect(
      screen.queryByRole("button", { name: "Allow for this turn" }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Deny access" }));
    expect(mocks.resolveCodexServerRequestMock).toHaveBeenCalledWith(
      7,
      9,
      "server-request-7-1-9",
      { permissions: {}, scope: "turn" },
    );
  });

  it("notifies for a Codex question outside the visible chat and focuses it on activation", async () => {
    prepareSignedInRun();
    mocks.readAgentNotificationPermissionStatusMock.mockResolvedValue("allowed");

    const { user } = await renderApp();
    await startMockRun(user, "Design the Snake controls");
    window.dispatchEvent(new Event("focus"));
    await user.click(screen.getByRole("button", { name: "Analytics" }));

    await emitCodexServerRequest({
      id: "question-notification-1",
      method: "item/tool/requestUserInput",
      params: {
        threadId: "thread-1",
        turnId: "turn-1",
        itemId: "question-item-1",
        autoResolutionMs: null,
        questions: [
          {
            id: "controls",
            header: "Controls",
            question: "Which controls should the game support?",
            isOther: false,
            isSecret: false,
            options: [
              {
                label: "Keyboard",
                description: "Support keyboard controls.",
              },
              {
                label: "Keyboard and touch",
                description: "Support keyboard and touch controls.",
              },
            ],
          },
        ],
      },
    });

    await waitFor(() =>
      expect(mocks.sendAgentNotificationMock).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Input required",
          body: "Design the Snake controls needs your answer before Codex can continue.",
          target: expect.objectContaining({
            kind: "user-input-required",
            workspaceId: workspace.id,
            chatId: 401,
            runId: 202,
            requestId: "question-notification-1",
          }),
        }),
      ),
    );
    await emitCodexServerRequest({
      id: "question-notification-1",
      method: "item/tool/requestUserInput",
      params: {
        threadId: "thread-1",
        turnId: "turn-1",
        itemId: "question-item-1",
        autoResolutionMs: null,
        questions: [
          {
            id: "controls",
            header: "Controls",
            question: "Which controls should the game support?",
            isOther: false,
            isSecret: false,
            options: [
              {
                label: "Keyboard",
                description: "Support keyboard controls.",
              },
            ],
          },
        ],
      },
    });
    expect(
      mocks.sendAgentNotificationMock.mock.calls.filter(
        ([request]) => request.target.kind === "user-input-required",
      ),
    ).toHaveLength(1);
    const notification = mocks.sendAgentNotificationMock.mock.calls.find(
      ([request]) => request.target.kind === "user-input-required",
    )?.[0];
    expect(notification).toBeDefined();

    await act(async () => {
      mocks.listeners.get("orchestrator:agent-notification-activated")?.({
        payload: notification.target,
      });
      await Promise.resolve();
    });

    const question = await screen.findByText(
      "Which controls should the game support?",
    );
    const questionCard = question.closest(
      '[data-agent-notification-target="user-input"]',
    );
    expect(questionCard).toHaveAttribute(
      "data-agent-notification-id",
      "question-notification-1",
    );
    await waitFor(() => expect(questionCard).toHaveFocus());

    await user.click(screen.getByRole("radio", { name: "Keyboard" }));
    await waitFor(() =>
      expect(mocks.removeAgentNotificationMock).toHaveBeenCalledWith(
        notification.target.eventKey,
      ),
    );
  });

  it("returns to a running chat in another workspace when its notification is activated", async () => {
    const otherWorkspace = {
      ...workspace,
      id: 2,
      path: "/repo/mobile-client",
      label: "mobile-client",
    };
    prepareSignedInRun();
    mocks.listWorkspacesMock.mockResolvedValue([workspace, otherWorkspace]);
    mocks.readAgentNotificationPermissionStatusMock.mockResolvedValue("allowed");

    const { user } = await renderApp();
    await startMockRun(user, "Wait for project input");
    const workspaceNav = screen.getByRole("navigation", { name: "Workspaces" });
    await user.click(
      within(workspaceNav).getByRole("button", { name: "mobile-client" }),
    );
    const otherWorkspaceBanner = screen.getByRole("region", {
      name: "Selected folder",
    });
    await user.click(
      within(otherWorkspaceBanner).getByRole("button", {
        name: /open chat history/i,
      }),
    );
    const drawer = await screen.findByRole("complementary", {
      name: "Workspace chat history",
    });

    await emitCodexServerRequest({
      id: "cross-workspace-question",
      method: "item/tool/requestUserInput",
      params: {
        threadId: "thread-1",
        turnId: "turn-1",
        itemId: "cross-workspace-question-item",
        autoResolutionMs: null,
        questions: [
          {
            id: "framework",
            header: "Framework",
            question: "Which framework should Codex use?",
            isOther: false,
            isSecret: false,
            options: [
              {
                label: "React",
                description: "Use React.",
              },
            ],
          },
        ],
      },
    });
    await waitFor(() =>
      expect(mocks.sendAgentNotificationMock).toHaveBeenCalledWith(
        expect.objectContaining({
          target: expect.objectContaining({
            kind: "user-input-required",
            workspaceId: workspace.id,
            chatId: 401,
          }),
        }),
      ),
    );
    const target = mocks.sendAgentNotificationMock.mock.calls.find(
      ([request]) => request.target.kind === "user-input-required",
    )?.[0].target;
    expect(target).toBeDefined();
    if (!target) {
      throw new Error("Expected a user-input notification target.");
    }

    await act(async () => {
      mocks.listeners.get("orchestrator:agent-notification-activated")?.({
        payload: target,
      });
      await Promise.resolve();
    });

    const banner = screen.getByRole("region", { name: "Selected folder" });
    await waitFor(() =>
      expect(within(banner).getByText("orchestrator")).toBeInTheDocument(),
    );
    await waitFor(() => expect(drawer).toHaveClass("closed"));
    const question = await screen.findByText(
      "Which framework should Codex use?",
    );
    const questionCard = question.closest(
      '[data-agent-notification-target="user-input"]',
    );
    await waitFor(() => expect(questionCard).toHaveFocus());
    expect(screen.getByRole("button", { name: /stop codex/i })).toBeInTheDocument();
  });

  it("suppresses a Codex question notification when the question is already visible", async () => {
    prepareSignedInRun();
    mocks.readAgentNotificationPermissionStatusMock.mockResolvedValue("allowed");

    const { user } = await renderApp();
    await startMockRun(user, "Choose an implementation");
    window.dispatchEvent(new Event("focus"));

    await emitCodexServerRequest({
      id: "visible-question",
      method: "item/tool/requestUserInput",
      params: {
        threadId: "thread-1",
        turnId: "turn-1",
        itemId: "visible-question-item",
        autoResolutionMs: null,
        questions: [
          {
            id: "shape",
            header: "Shape",
            question: "Which implementation should Codex use?",
            isOther: false,
            isSecret: false,
            options: [
              {
                label: "Static",
                description: "Use static HTML and JavaScript.",
              },
            ],
          },
        ],
      },
    });

    expect(
      await screen.findByText("Which implementation should Codex use?"),
    ).toBeInTheDocument();
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 40));
    });
    expect(
      mocks.sendAgentNotificationMock.mock.calls.some(
        ([request]) => request.target.kind === "user-input-required",
      ),
    ).toBe(false);
  });

  it("removes a question notification when Codex resolves the request", async () => {
    prepareSignedInRun();
    mocks.readAgentNotificationPermissionStatusMock.mockResolvedValue("allowed");

    const { user } = await renderApp();
    await startMockRun(user, "Collect project requirements");
    window.dispatchEvent(new Event("blur"));
    await emitCodexServerRequest({
      id: "resolved-question",
      method: "item/tool/requestUserInput",
      params: {
        threadId: "thread-1",
        turnId: "turn-1",
        itemId: "resolved-question-item",
        autoResolutionMs: null,
        questions: [
          {
            id: "scope",
            header: "Scope",
            question: "Which scope should Codex use?",
            isOther: false,
            isSecret: false,
            options: null,
          },
        ],
      },
    });

    await waitFor(() =>
      expect(mocks.sendAgentNotificationMock).toHaveBeenCalledWith(
        expect.objectContaining({
          target: expect.objectContaining({
            kind: "user-input-required",
            requestId: "resolved-question",
          }),
        }),
      ),
    );
    const eventKey = mocks.sendAgentNotificationMock.mock.calls.find(
      ([request]) => request.target.kind === "user-input-required",
    )?.[0].target.eventKey;

    await emitCodexNotification({
      method: "serverRequest/resolved",
      params: { threadId: "thread-1", requestId: "resolved-question" },
    });

    await waitFor(() =>
      expect(mocks.removeAgentNotificationMock).toHaveBeenCalledWith(eventKey),
    );
    expect(
      screen.queryByText("Which scope should Codex use?"),
    ).not.toBeInTheDocument();
  });

  it("submits a native approval at most once during rapid clicks", async () => {
    prepareSignedInRun();
    let finishSubmission!: () => void;
    mocks.resolveCodexServerRequestMock.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finishSubmission = resolve;
      }),
    );

    const { user } = await renderApp();
    await startMockRun(user, "Run a guarded command");
    await emitCodexServerRequest({
      id: 9,
      method: "item/commandExecution/requestApproval",
      params: {
        threadId: "thread-1",
        turnId: "turn-1",
        command: "npm test",
        availableDecisions: ["accept", "cancel"],
      },
    });

    const approve = screen.getByRole("button", { name: /approve once/i });
    fireEvent.click(approve);
    fireEvent.click(approve);
    expect(mocks.resolveCodexServerRequestMock).toHaveBeenCalledTimes(1);
    expect(approve).toBeDisabled();

    await act(async () => finishSubmission());
    expect(screen.getByText(/waiting for codex to resolve/i)).toBeInTheDocument();
  });

  it("keeps a failed approval visible and retries with the exact selected decision", async () => {
    prepareSignedInRun();
    mocks.resolveCodexServerRequestMock
      .mockRejectedValueOnce(new Error("native stdin closed"))
      .mockResolvedValueOnce(undefined);

    const { user } = await renderApp();
    await startMockRun(user, "Run a guarded command");
    await emitCodexServerRequest({
      id: 9,
      method: "item/commandExecution/requestApproval",
      params: {
        threadId: "thread-1",
        turnId: "turn-1",
        command: "npm test",
        availableDecisions: ["accept", "decline", "cancel"],
      },
    });

    await user.click(screen.getByRole("button", { name: /approve once/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "native stdin closed",
    );
    await user.click(screen.getByRole("button", { name: /reject/i }));

    expect(mocks.resolveCodexServerRequestMock).toHaveBeenNthCalledWith(
      2,
      7,
      9,
      "server-request-7-1-9",
      { decision: "decline" },
    );
  });

  it("passes session and command-rule choices through without translating them", async () => {
    prepareSignedInRun();
    const ruleDecision = {
      acceptWithExecpolicyAmendment: {
        execpolicy_amendment: ["npm", "test"],
      },
    };

    const { user } = await renderApp();
    await startMockRun(user, "Run guarded commands");
    await emitCodexServerRequest({
      id: 9,
      method: "item/commandExecution/requestApproval",
      params: {
        threadId: "thread-1",
        turnId: "turn-1",
        command: "npm test",
        availableDecisions: ["acceptForSession", ruleDecision, "cancel"],
      },
    });

    await user.click(
      screen.getByRole("button", { name: /approve for session/i }),
    );
    expect(mocks.resolveCodexServerRequestMock).toHaveBeenLastCalledWith(
      7,
      9,
      "server-request-7-1-9",
      { decision: "acceptForSession" },
    );
    await emitCodexNotification({
      method: "serverRequest/resolved",
      params: { threadId: "thread-1", requestId: 9 },
    });

    await emitCodexServerRequest(
      {
        id: 10,
        method: "item/commandExecution/requestApproval",
        params: {
          threadId: "thread-1",
          turnId: "turn-1",
          command: "npm test -- --run",
          availableDecisions: [ruleDecision, "cancel"],
        },
      },
      { requestToken: "server-request-7-1-10" },
    );
    await user.click(
      screen.getByRole("button", { name: /approve command rule/i }),
    );
    expect(mocks.resolveCodexServerRequestMock).toHaveBeenLastCalledWith(
      7,
      10,
      "server-request-7-1-10",
      { decision: ruleDecision },
    );
  });

  it("deduplicates approval replays and leaves mismatched or untracked requests blocked", async () => {
    prepareSignedInRun();
    mocks.readAgentNotificationPermissionStatusMock.mockResolvedValue("allowed");
    let finishNotificationDelivery!: () => void;
    mocks.sendAgentNotificationMock.mockReturnValueOnce(
      new Promise((resolve) => {
        finishNotificationDelivery = () =>
          resolve({
            delivered: true,
            notificationId: "notification-approval-9",
            permissionStatus: "allowed",
          });
      }),
    );

    const { user } = await renderApp();
    await startMockRun(user, "Run guarded commands");
    window.dispatchEvent(new Event("blur"));
    const request = {
      id: 9,
      method: "item/commandExecution/requestApproval",
      params: {
        threadId: "thread-1",
        turnId: "turn-1",
        command: "npm test",
        availableDecisions: ["accept", "cancel"],
      },
    };
    await emitCodexServerRequest(request);
    await emitCodexServerRequest(request);
    expect(
      screen.getAllByText("Codex needs approval to run a command"),
    ).toHaveLength(1);
    expect(mocks.sendAgentNotificationMock).toHaveBeenCalledTimes(1);
    await act(async () => finishNotificationDelivery());

    await emitCodexServerRequest(
      {
        ...request,
        id: 10,
        params: { ...request.params, threadId: "thread-other" },
      },
      { requestToken: "server-request-7-1-10" },
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      /approval in another conversation/i,
    );

    await emitCodexServerRequest(
      { ...request, id: 11 },
      { requestToken: null },
    );
    expect(screen.getByText(/without a one-shot request token/i)).toBeInTheDocument();
    expect(mocks.resolveCodexServerRequestMock).not.toHaveBeenCalled();
  });

  it("shows lifecycle file paths without interaction mode metadata", async () => {
    prepareSignedInRun();
    mocks.codexRpcMock.mockImplementation(
      async (_accountId: number, method: string) => {
        if (method === "collaborationMode/list") {
          return {
            data: [
              { name: "Plan", mode: "plan", reasoning_effort: "medium" },
              { name: "Default", mode: "default", reasoning_effort: null },
            ],
          };
        }
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
    await user.click(screen.getByRole("button", { name: /plan mode/i }));
    await startMockRun(user, "Plan a guarded edit");
    await emitCodexNotification({
      method: "item/started",
      params: {
        item: {
          id: "file-change-1",
          type: "fileChange",
          changes: [
            { path: "/repo/orchestrator/src/App.tsx", kind: "update", diff: "" },
            { path: "/repo/orchestrator/src/App.css", kind: "update", diff: "" },
          ],
        },
      },
    });
    await emitCodexServerRequest({
      id: 9,
      method: "item/fileChange/requestApproval",
      params: {
        threadId: "thread-1",
        turnId: "turn-1",
        itemId: "file-change-1",
        reason: "The edit is outside the current write scope.",
      },
    });

    const approval = screen
      .getByText("Codex needs approval to change files")
      .closest("article")!;
    expect(within(approval).queryByText("Plan Mode")).not.toBeInTheDocument();
    for (const resource of [
      "/repo/orchestrator/src/App.tsx",
      "/repo/orchestrator/src/App.css",
    ]) {
      const resourceSurface = within(approval).getByText(resource);
      expect(resourceSurface.tagName).toBe("PRE");
      expect(resourceSurface).toHaveClass("approval-code-surface");
      expect(resourceSurface.parentElement).toHaveClass(
        "approval-resource-list",
      );
    }
    const decisionRow = approval.querySelector(".approval-decision-row")!;
    expect(decisionRow).toContainElement(
      within(approval).getByText("Affected resources").closest("dl"),
    );
    expect(decisionRow).toContainElement(
      within(approval).getByRole("group", { name: "Approval choices" }),
    );
    expect(
      within(approval).queryByText(
        "Codex is blocked until you choose one of the native options.",
      ),
    ).not.toBeInTheDocument();
    for (const label of [
      "Approve once",
      "Approve files for session",
      "Reject changes",
      "Cancel operation",
    ]) {
      const action = within(approval).getByRole("button", { name: label });
      expect(action).toHaveAttribute(
        "data-tooltip",
        expect.stringContaining(`${label}:`),
      );
      expect(action.querySelector("svg")).toBeInTheDocument();
    }
  });

  it("keeps Goal Mode on the same native approval path", async () => {
    prepareSignedInRun();

    const { user } = await renderApp();
    await user.click(screen.getByRole("button", { name: /goal mode/i }));
    await startMockRun(user, "Run a goal command");
    expect(mocks.prepareBrowserSessionMock).toHaveBeenCalledTimes(1);
    await emitCodexServerRequest({
      id: 9,
      method: "item/commandExecution/requestApproval",
      params: {
        threadId: "thread-1",
        turnId: "turn-1",
        command: "npm test",
        availableDecisions: ["accept", "cancel"],
      },
    });

    const approval = screen
      .getByText("Codex needs approval to run a command")
      .closest("article")!;
    expect(within(approval).queryByText("Goal Mode")).not.toBeInTheDocument();
  });

  it("removes pending approval controls when the App Server disconnects", async () => {
    prepareSignedInRun();

    const { user } = await renderApp();
    await startMockRun(user, "Run a guarded command");
    await emitCodexServerRequest({
      id: 9,
      method: "item/commandExecution/requestApproval",
      params: {
        threadId: "thread-1",
        turnId: "turn-1",
        command: "npm test",
        availableDecisions: ["accept", "cancel"],
      },
    });
    expect(
      screen.getByText("Codex needs approval to run a command"),
    ).toBeInTheDocument();

    await act(async () => {
      mocks.listeners.get("codex:process")?.({
        payload: {
          accountId: 7,
          profileKey: "account:7",
          status: "exited",
          message: "Codex app-server stdout closed",
        },
      });
    });

    expect(
      screen.queryByText("Codex needs approval to run a command"),
    ).not.toBeInTheDocument();
    expect(mocks.resolveCodexServerRequestMock).not.toHaveBeenCalled();
    expect(mocks.removeAgentNotificationMock).toHaveBeenCalledWith(
      expect.stringContaining("approval-required:account:7"),
    );
  });

  it("marks completed chat runs and persists the final assistant message", async () => {
    prepareSignedInRun();
    mocks.readAgentNotificationPermissionStatusMock.mockResolvedValue("allowed");

    const { user } = await renderApp();
    await startMockRun(user, "Finish the task");
    window.dispatchEvent(new Event("blur"));

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
    await waitFor(() =>
      expect(mocks.sendAgentNotificationMock).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Response complete",
          body: "Finish the task is ready to review.",
          target: expect.objectContaining({
            kind: "response-completed",
            workspaceId: workspace.id,
            chatId: 401,
            runId: 202,
            turnId: "turn-1",
          }),
        }),
      ),
    );
  });

  it("refreshes git status and the empty workspace explorer after a run creates the first file", async () => {
    prepareSignedInRun();
    const generatedEntry = {
      name: "index.html",
      path: "/repo/orchestrator/index.html",
      relativePath: "index.html",
      kind: "file" as const,
    };
    let fileCreated = false;
    mocks.listWorkspaceDirectoryMock.mockImplementation(async () =>
      fileCreated ? [generatedEntry] : [],
    );
    mocks.listWorkspaceGitStatusMock.mockImplementation(async () => ({
      workspacePath: workspace.path,
      gitRoot: workspace.path,
      currentBranch: "main",
      aheadCount: 0,
      hasUpstream: true,
      hasOrigin: true,
      canPush: false,
      files: fileCreated
        ? [
            {
              path: generatedEntry.path,
              relativePath: generatedEntry.relativePath,
              oldRelativePath: null,
              indexStatus: "?",
              worktreeStatus: "?",
              statusKind: "untracked",
              badge: "U",
            },
          ]
        : [],
    }));

    const { user } = await renderApp();
    const workspaceNav = screen.getByRole("navigation", { name: "Workspaces" });
    await user.click(
      within(workspaceNav).getByRole("button", { name: "Expand orchestrator" }),
    );
    expect(await within(workspaceNav).findByText("Empty folder")).toBeInTheDocument();
    const directoryCallsBeforeCompletion =
      mocks.listWorkspaceDirectoryMock.mock.calls.length;
    const gitCallsBeforeCompletion = mocks.listWorkspaceGitStatusMock.mock.calls.length;

    await startMockRun(user, "Create the starter app");
    fileCreated = true;
    await emitCodexNotification({
      method: "turn/completed",
      params: { turn: { status: "completed", durationMs: 1234 } },
    });

    await waitFor(() =>
      expect(mocks.listWorkspaceDirectoryMock.mock.calls.length).toBeGreaterThan(
        directoryCallsBeforeCompletion,
      ),
    );
    await waitFor(() =>
      expect(mocks.listWorkspaceGitStatusMock.mock.calls.length).toBeGreaterThan(
        gitCallsBeforeCompletion,
      ),
    );
    expect(await within(workspaceNav).findByTitle("index.html")).toBeInTheDocument();
    expect(within(workspaceNav).getByLabelText("untracked file")).toHaveTextContent(
      "U",
    );
    expect(
      within(
        screen.getByRole("region", { name: "Selected folder" }),
      ).getByLabelText(/1 changed \(1 untracked\)/i),
    ).toBeInTheDocument();
  });

  it("keeps a fresh post-run directory listing when an older empty request resolves later", async () => {
    prepareSignedInRun();
    const generatedEntry = {
      name: "main.ts",
      path: "/repo/orchestrator/main.ts",
      relativePath: "main.ts",
      kind: "file" as const,
    };
    let resolveStaleDirectory: ((entries: typeof generatedEntry[]) => void) | null =
      null;
    mocks.listWorkspaceDirectoryMock
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveStaleDirectory = resolve;
          }),
      )
      .mockResolvedValue([generatedEntry]);

    const { user } = await renderApp();
    const workspaceNav = screen.getByRole("navigation", { name: "Workspaces" });
    await user.click(
      within(workspaceNav).getByRole("button", { name: "Expand orchestrator" }),
    );
    await waitFor(() => expect(mocks.listWorkspaceDirectoryMock).toHaveBeenCalledTimes(1));

    await startMockRun(user, "Create main.ts");
    await emitCodexNotification({
      method: "turn/completed",
      params: { turn: { status: "completed", durationMs: 1234 } },
    });

    await waitFor(() => expect(mocks.listWorkspaceDirectoryMock).toHaveBeenCalledTimes(2));
    expect(await within(workspaceNav).findByTitle("main.ts")).toBeInTheDocument();

    await act(async () => {
      resolveStaleDirectory?.([]);
      await Promise.resolve();
    });
    expect(within(workspaceNav).getByTitle("main.ts")).toBeInTheDocument();
  });

  it("runs a fresh git status request after an in-flight pre-completion snapshot", async () => {
    prepareSignedInRun();
    let resolveStaleGitStatus: ((snapshot: unknown) => void) | null = null;
    const cleanStatus = {
      workspacePath: workspace.path,
      gitRoot: workspace.path,
      currentBranch: "main",
      aheadCount: 0,
      hasUpstream: true,
      hasOrigin: true,
      canPush: false,
      files: [],
    };
    const changedStatus = {
      ...cleanStatus,
      files: [
        {
          path: "/repo/orchestrator/app.js",
          relativePath: "app.js",
          oldRelativePath: null,
          indexStatus: "?",
          worktreeStatus: "?",
          statusKind: "untracked",
          badge: "U",
        },
      ],
    };
    mocks.listWorkspaceGitStatusMock
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveStaleGitStatus = resolve;
          }),
      )
      .mockResolvedValue(changedStatus);

    const { user } = await renderApp();
    await waitFor(() => expect(mocks.listWorkspaceGitStatusMock).toHaveBeenCalledTimes(1));
    await startMockRun(user, "Create app.js");
    await emitCodexNotification({
      method: "turn/completed",
      params: { turn: { status: "completed", durationMs: 1234 } },
    });

    await act(async () => {
      resolveStaleGitStatus?.(cleanStatus);
      await Promise.resolve();
    });

    await waitFor(() => expect(mocks.listWorkspaceGitStatusMock).toHaveBeenCalledTimes(2));
    expect(
      await within(
        screen.getByRole("region", { name: "Selected folder" }),
      ).findByLabelText(/1 changed \(1 untracked\)/i),
    ).toBeInTheDocument();
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
