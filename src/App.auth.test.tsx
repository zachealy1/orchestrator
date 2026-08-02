import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App, { buildBoundedAccountHandoffContext } from "./App";
import { clearTranscriptStateCache } from "./components/VirtuosoTaskChatTranscript";
import { ASK_FOR_APPROVAL_PERMISSION_PROFILE } from "./lib/codexAccess";
import { persistRunningGitOperation } from "./lib/gitOperations";
import { createQueuedPromptSnapshot } from "./lib/promptQueue";
import { createRunExecutionSettings } from "./lib/runExecutionSettings";
import { clearSubagentStore } from "./lib/subagents";
import {
  ORCHESTRATOR_CONTEXT_FILE_MIME,
  type PromptQueueItem,
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
  readActiveCodexLoginMock: vi.fn(),
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
  createGitBranchMock: vi.fn(),
  listWorkspaceGitStatusMock: vi.fn(),
  readWorkspaceGitDiffMock: vi.fn(),
  undoWorkspaceGitDiffMock: vi.fn(),
  listWorkspaceDirectoryMock: vi.fn(),
  readWorkspaceFilePreviewMock: vi.fn(),
  readWorkspaceFilePreviewChunkMock: vi.fn(),
  readWorkspaceFilePreviewVersionMock: vi.fn(),
  prepareImageAttachmentMock: vi.fn(),
  inspectDroppedContextPathsMock: vi.fn(),
  inspectPromptQueueContextMock: vi.fn(),
  probeLocalWebPreviewMock: vi.fn(),
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
  readProjectedSubagentThreadMock: vi.fn(),
  indexDefaultProfileThreadMock: vi.fn(),
  cancelDefaultProfileThreadIndexMock: vi.fn(),
  syncDefaultProfileThreadTranscriptMock: vi.fn(),
  cancelDefaultProfileThreadTranscriptMock: vi.fn(),
  listWorkspacesMock: vi.fn(),
  updateWorkspaceSelectedGitRepositoryMock: vi.fn(),
  listCodexAccountsMock: vi.fn(),
  listDuplicateProfilesPendingCleanupMock: vi.fn(),
  completeDuplicateProfileCleanupMock: vi.fn(),
  createChatMock: vi.fn(),
  createChatWithQueuedPromptMock: vi.fn(),
  claimChatTitleGenerationMock: vi.fn(),
  completeChatTitleGenerationMock: vi.fn(),
  failChatTitleGenerationMock: vi.fn(),
  recoverAbandonedRunsMock: vi.fn(),
  recoverInterruptedChatTitleGenerationsMock: vi.fn(),
  recoverInterruptedKanbanAttemptsMock: vi.fn(),
  claimKanbanAttemptMock: vi.fn(),
  cleanupKanbanGitMock: vi.fn(),
  loadKanbanBoardMock: vi.fn(),
  loadKanbanGitBindingsMock: vi.fn(),
  loadKanbanInheritedContextMock: vi.fn(),
  provisionKanbanGitMock: vi.fn(),
  reconcileKanbanGitMock: vi.fn(),
  saveKanbanGitBindingsMock: vi.fn(),
  updateKanbanAttemptMock: vi.fn(),
  updateChatMock: vi.fn(),
  chatHasPendingPlanReviewMock: vi.fn(),
  getChatRecordMock: vi.fn(),
  getNextChatTurnIndexMock: vi.fn(),
  listPromptQueueItemsMock: vi.fn(),
  listRestoredPromptQueueItemsMock: vi.fn(),
  enqueuePromptQueueItemMock: vi.fn(),
  readPromptQueueItemMock: vi.fn(),
  updatePromptQueueItemSnapshotMock: vi.fn(),
  updatePromptQueueItemContextFingerprintMock: vi.fn(),
  reorderPromptQueueItemsMock: vi.fn(),
  prioritizePromptQueueItemMock: vi.fn(),
  claimPromptQueueItemMock: vi.fn(),
  markPromptQueueItemSteeringMock: vi.fn(),
  reschedulePromptQueueItemAfterSteeringRaceMock: vi.fn(),
  acceptPromptQueueItemMock: vi.fn(),
  completePromptQueueItemMock: vi.fn(),
  failPromptQueueItemMock: vi.fn(),
  markPromptQueueItemStaleMock: vi.fn(),
  retryPromptQueueItemMock: vi.fn(),
  setPromptQueueItemAutoSendMock: vi.fn(),
  removePromptQueueItemMock: vi.fn(),
  recoverInterruptedPromptQueueItemsMock: vi.fn(),
  advanceChatConversationRevisionMock: vi.fn(),
  listWorkspaceChatsMock: vi.fn(),
  getChatWithRunsMock: vi.fn(),
  listChatRunsPageMock: vi.fn(),
  listChatSubagentsMock: vi.fn(),
  buildLocalChatHistoryIndexMock: vi.fn(),
  readExternalChatHistoryIndexMock: vi.fn(),
  saveExternalChatHistoryIndexMock: vi.fn(),
  listLocalChatTranscriptMock: vi.fn(),
  readExternalTranscriptSnapshotMock: vi.fn(),
  activateExternalTranscriptSnapshotMock: vi.fn(),
  activateChatAccountHandoffMock: vi.fn(),
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
  upsertRunSubagentMock: vi.fn(),
  registerNativeContextFileDropMock: vi.fn(),
  virtuosoState: {
    ranges: [{ startIndex: 0, endIndex: 0 }],
    scrollTop: 0,
  },
  promptQueueItems: new Map<string, any>(),
  promptQueueChats: new Map<number, any>(),
  promptQueueState: {
    priority: 0,
    revision: 0,
  },
  nativeContextFileDropHandler: null as
    | ((event: {
        type: "enter" | "drop";
        paths: string[];
        clientX: number;
        clientY: number;
      } | {
        type: "over";
        clientX: number;
        clientY: number;
      } | {
        type: "leave";
      }) => void)
    | null,
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

vi.mock("./lib/nativeContextFileDrop", () => ({
  registerNativeContextFileDrop: mocks.registerNativeContextFileDropMock,
}));

vi.mock("./assets/brand/orchestrator-mark.png", () => ({
  default: "orchestrator-mark.png",
}));

vi.mock("./assets/brand/orchestrator-wordmark.png", () => ({
  default: "orchestrator-wordmark.png",
}));

vi.mock("./features/kanban/KanbanWorkspace", async () => {
  const React = await import("react");
  const card = {
    id: "card-run-control-test",
    workspaceId: 1,
    chatId: 777,
    title: "Kanban run-control test",
    description: "Exercise Kanban pause semantics",
    accountId: 7,
    accessMode: "ask-for-approval" as const,
    model: null,
    reasoningLevel: null,
    repositoryScope: "all" as const,
    stage: "todo" as const,
    sortPosition: 1_000,
    executionState: "idle" as const,
    reviewState: "none" as const,
    currentAttemptId: null,
    stateVersion: 1,
    archivedAt: null,
    deletedAt: null,
    approvedAt: null,
    lastError: null,
    hasInheritedContext: false,
    createdAt: "2026-06-30T09:00:00Z",
    updatedAt: "2026-06-30T09:00:00Z",
    repositories: [
      {
        repositoryPath: "/repo/orchestrator",
        relativePath: ".",
        label: "orchestrator",
        includeDirtyChanges: false,
      },
    ],
  };

  return {
    KanbanWorkspace: ({ onLaunch, onPause }: any) => {
      const [result, setResult] = React.useState("idle");
      const run = (action: () => Promise<void>, pending: string, done: string) => {
        setResult(pending);
        void action().then(
          () => setResult(done),
          (error) =>
            setResult(error instanceof Error ? error.message : String(error)),
        );
      };
      return (
        <section aria-label="Kanban run-control test harness">
          <button
            type="button"
            onClick={() =>
              run(
                () => onLaunch(card, "start", card.description),
                "starting",
                "started",
              )
            }
          >
            Start test Kanban agent
          </button>
          <button
            type="button"
            onClick={() => run(() => onPause(card), "pausing", "paused")}
          >
            Pause test Kanban agent
          </button>
          <output aria-label="Kanban test result">{result}</output>
        </section>
      );
    },
  };
});

vi.mock("react-virtuoso", async () => {
  const React = await import("react");
  return {
    Virtuoso: React.forwardRef(function TestVirtuoso(props: any, ref) {
      const scrollerRef = React.useRef<HTMLDivElement | null>(null);
      React.useImperativeHandle(ref, () => ({
        getState: (callback: (state: unknown) => void) =>
          callback(mocks.virtuosoState),
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
          data-restored-scroll-top={
            props.restoredViewportSnapshot?.snapshot.scrollTop ??
            props.restoreStateFrom?.scrollTop
          }
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
  createGitBranch: mocks.createGitBranchMock,
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
  readProjectedSubagentThread: mocks.readProjectedSubagentThreadMock,
  indexDefaultProfileThread: mocks.indexDefaultProfileThreadMock,
  cancelDefaultProfileThreadIndex: mocks.cancelDefaultProfileThreadIndexMock,
  syncDefaultProfileThreadTranscript:
    mocks.syncDefaultProfileThreadTranscriptMock,
  cancelDefaultProfileThreadTranscript:
    mocks.cancelDefaultProfileThreadTranscriptMock,
  logoutCodexAccount: mocks.logoutCodexAccountMock,
  pushWorkspaceBranch: mocks.pushWorkspaceBranchMock,
  readActiveCodexLogin: mocks.readActiveCodexLoginMock,
  readCodexAccount: mocks.readCodexAccountMock,
  readCodexFile: mocks.readCodexFileMock,
  readDefaultCodexFile: mocks.readDefaultCodexFileMock,
  readWorkspaceFilePreview: mocks.readWorkspaceFilePreviewMock,
  readWorkspaceFilePreviewChunk: mocks.readWorkspaceFilePreviewChunkMock,
  readWorkspaceFilePreviewVersion: mocks.readWorkspaceFilePreviewVersionMock,
  prepareImageAttachment: mocks.prepareImageAttachmentMock,
  inspectDroppedContextPaths: mocks.inspectDroppedContextPathsMock,
  inspectPromptQueueContext: mocks.inspectPromptQueueContextMock,
  probeLocalWebPreview: mocks.probeLocalWebPreviewMock,
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
  activateChatAccountHandoff: mocks.activateChatAccountHandoffMock,
  acceptPromptQueueItem: mocks.acceptPromptQueueItemMock,
  advanceChatConversationRevision: mocks.advanceChatConversationRevisionMock,
  appendRunEvent: mocks.appendRunEventMock,
  appendRunEvents: mocks.appendRunEventsMock,
  buildLocalChatHistoryIndex: mocks.buildLocalChatHistoryIndexMock,
  claimChatTitleGeneration: mocks.claimChatTitleGenerationMock,
  completeDuplicateProfileCleanup: mocks.completeDuplicateProfileCleanupMock,
  completeChatTitleGeneration: mocks.completeChatTitleGenerationMock,
  completePromptQueueItem: mocks.completePromptQueueItemMock,
  chatHasPendingPlanReview: mocks.chatHasPendingPlanReviewMock,
  createChat: mocks.createChatMock,
  createChatWithQueuedPrompt: mocks.createChatWithQueuedPromptMock,
  createCodexAccount: mocks.createCodexAccountMock,
  createRun: mocks.createRunMock,
  createTask: mocks.createTaskMock,
  enqueuePromptQueueItem: mocks.enqueuePromptQueueItemMock,
  failPromptQueueItem: mocks.failPromptQueueItemMock,
  getChatRecord: mocks.getChatRecordMock,
  getChatWithRuns: mocks.getChatWithRunsMock,
  getNextChatTurnIndex: mocks.getNextChatTurnIndexMock,
  getAnalyticsSummary: mocks.getAnalyticsSummaryMock,
  listChatRunsPage: mocks.listChatRunsPageMock,
  listChatSubagents: mocks.listChatSubagentsMock,
  listCodexAccounts: mocks.listCodexAccountsMock,
  listDuplicateProfilesPendingCleanup:
    mocks.listDuplicateProfilesPendingCleanupMock,
  listPromptQueueItems: mocks.listPromptQueueItemsMock,
  holdRestoredPromptQueueItems: mocks.listRestoredPromptQueueItemsMock,
  listWorkspaceChats: mocks.listWorkspaceChatsMock,
  listWorkspaceRuns: mocks.listWorkspaceRunsMock,
  listWorkspaces: mocks.listWorkspacesMock,
  recordTokenUsage: mocks.recordTokenUsageMock,
  readExternalChatHistoryIndex: mocks.readExternalChatHistoryIndexMock,
  readExternalTranscriptSnapshot: mocks.readExternalTranscriptSnapshotMock,
  readPromptQueueItem: mocks.readPromptQueueItemMock,
  recoverAbandonedRuns: mocks.recoverAbandonedRunsMock,
  recoverInterruptedPromptQueueItems:
    mocks.recoverInterruptedPromptQueueItemsMock,
  recoverInterruptedChatTitleGenerations:
    mocks.recoverInterruptedChatTitleGenerationsMock,
  renameCodexAccount: mocks.renameCodexAccountMock,
  removePromptQueueItem: mocks.removePromptQueueItemMock,
  reorderPromptQueueItems: mocks.reorderPromptQueueItemsMock,
  reschedulePromptQueueItemAfterSteeringRace:
    mocks.reschedulePromptQueueItemAfterSteeringRaceMock,
  retryPromptQueueItem: mocks.retryPromptQueueItemMock,
  softDeleteWorkspace: mocks.softDeleteWorkspaceMock,
  setPromptQueueItemAutoSend: mocks.setPromptQueueItemAutoSendMock,
  savePreflightReport: mocks.savePreflightReportMock,
  saveExternalChatHistoryIndex: mocks.saveExternalChatHistoryIndexMock,
  activateExternalTranscriptSnapshot:
    mocks.activateExternalTranscriptSnapshotMock,
  listLocalChatTranscript: mocks.listLocalChatTranscriptMock,
  softDeleteChat: mocks.softDeleteChatMock,
  softDeleteCodexAccount: mocks.softDeleteCodexAccountMock,
  softDeleteRun: mocks.softDeleteRunMock,
  failChatTitleGeneration: mocks.failChatTitleGenerationMock,
  prioritizePromptQueueItem: mocks.prioritizePromptQueueItemMock,
  claimPromptQueueItem: mocks.claimPromptQueueItemMock,
  markPromptQueueItemStale: mocks.markPromptQueueItemStaleMock,
  markPromptQueueItemSteering: mocks.markPromptQueueItemSteeringMock,
  updateCodexAccount: mocks.updateCodexAccountMock,
  updateChat: mocks.updateChatMock,
  updatePromptQueueItemContextFingerprint:
    mocks.updatePromptQueueItemContextFingerprintMock,
  updatePromptQueueItemSnapshot: mocks.updatePromptQueueItemSnapshotMock,
  updateRun: mocks.updateRunMock,
  updateTaskStatus: mocks.updateTaskStatusMock,
  updateWorkspaceSelectedGitRepository:
    mocks.updateWorkspaceSelectedGitRepositoryMock,
  upsertExternalCodexChats: mocks.upsertExternalCodexChatsMock,
  upsertRunSubagent: mocks.upsertRunSubagentMock,
  upsertWorkspace: mocks.upsertWorkspaceMock,
}));

vi.mock("./features/kanban/api", async () => {
  const actual = await vi.importActual<typeof import("./features/kanban/api")>(
    "./features/kanban/api",
  );
  return {
    ...actual,
    claimKanbanAttempt: mocks.claimKanbanAttemptMock,
    cleanupKanbanGit: mocks.cleanupKanbanGitMock,
    loadKanbanBoard: mocks.loadKanbanBoardMock,
    loadKanbanGitBindings: mocks.loadKanbanGitBindingsMock,
    loadKanbanInheritedContext: mocks.loadKanbanInheritedContextMock,
    provisionKanbanGit: mocks.provisionKanbanGitMock,
    reconcileKanbanGit: mocks.reconcileKanbanGitMock,
    recoverInterruptedKanbanAttempts:
      mocks.recoverInterruptedKanbanAttemptsMock,
    saveKanbanGitBindings: mocks.saveKanbanGitBindingsMock,
    updateKanbanAttempt: mocks.updateKanbanAttemptMock,
  };
});

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

const defaultCodexModel = {
  id: "gpt-5.5",
  model: "gpt-5.5",
  displayName: "GPT-5.5",
  description: "General purpose model",
  hidden: false,
  contextWindow: 128_000,
  supportedReasoningEfforts: [
    { reasoningEffort: "medium", description: "Balanced reasoning" },
    { reasoningEffort: "high", description: "Deeper reasoning" },
  ],
  defaultReasoningEffort: "medium",
  isDefault: true,
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
    latest_cached_input_tokens: 100,
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
    web_preview_json: null,
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
    conversation_revision: number;
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
    conversation_revision: overrides.conversation_revision ?? 0,
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

function promptQueueItemFixture(input: {
  id: string;
  clientMessageId: string;
  workspaceId: number;
  chatId: number;
  prompt: string;
  snapshot: any;
}): PromptQueueItem {
  const position = Array.from(mocks.promptQueueItems.values()).filter(
    (item) =>
      item.chatId === input.chatId &&
      item.status !== "completed" &&
      item.status !== "skipped",
  ).length;
  return {
    id: input.id,
    clientMessageId: input.clientMessageId,
    workspaceId: input.workspaceId,
    chatId: input.chatId,
    position,
    sendNowPriority: null,
    autoSendEnabled: true,
    prompt: input.prompt,
    snapshot: input.snapshot,
    status: "queued",
    linkedRunId: null,
    linkedTurnId: null,
    error: null,
    staleReasons: [],
    createdAt: "2026-06-30T09:00:00Z",
    updatedAt: "2026-06-30T09:00:00Z",
    acceptedAt: null,
    completedAt: null,
  };
}

function updatePromptQueueFixture(
  itemId: string,
  update: Record<string, unknown>,
) {
  const current = mocks.promptQueueItems.get(itemId);
  if (!current) return null;
  const next = {
    ...current,
    ...update,
    updatedAt: "2026-06-30T09:00:01Z",
  };
  mocks.promptQueueItems.set(itemId, next);
  return next;
}

function prepareDefaults() {
  [
    mocks.createChatMock,
    mocks.createTaskMock,
    mocks.createRunMock,
    mocks.chatHasPendingPlanReviewMock,
    mocks.generateChatTitleMock,
    mocks.inspectDroppedContextPathsMock,
    mocks.listCodexModelsMock,
    mocks.listChatSubagentsMock,
    mocks.loadDefaultProfileTurnActivityMock,
    mocks.readProjectedSubagentThreadMock,
    mocks.readBrowserRuntimeStatusMock,
    mocks.readBrowserSessionStatusMock,
    mocks.recoverInterruptedKanbanAttemptsMock,
    mocks.claimKanbanAttemptMock,
    mocks.cleanupKanbanGitMock,
    mocks.loadKanbanBoardMock,
    mocks.loadKanbanGitBindingsMock,
    mocks.loadKanbanInheritedContextMock,
    mocks.provisionKanbanGitMock,
    mocks.reconcileKanbanGitMock,
    mocks.saveKanbanGitBindingsMock,
    mocks.updateKanbanAttemptMock,
    mocks.resolveCodexServerRequestMock,
    mocks.runPreflightMock,
    mocks.sendAgentNotificationMock,
    mocks.updateWorkspaceSelectedGitRepositoryMock,
    mocks.updateRunMock,
  ].forEach((mock) => mock.mockReset());
  mocks.promptQueueItems.clear();
  mocks.promptQueueChats.clear();
  mocks.promptQueueState.priority = 0;
  mocks.promptQueueState.revision = 0;
  mocks.chatHasPendingPlanReviewMock.mockResolvedValue(false);
  mocks.recoverInterruptedKanbanAttemptsMock.mockResolvedValue(0);
  mocks.cleanupKanbanGitMock.mockImplementation(async ({ binding }) => ({
    binding: { ...binding, status: "cleaned" },
    status: "cleaned",
    worktreeRemoved: true,
    branchDeleted: true,
    executionRootRemoved: true,
    errors: [],
  }));
  mocks.claimKanbanAttemptMock.mockResolvedValue({
    card: {
      id: "card-run-control-test",
      workspaceId: 1,
      chatId: 777,
      title: "Kanban run-control test",
      description: "Exercise Kanban pause semantics",
      accountId: 7,
      accessMode: "ask-for-approval",
      model: null,
      reasoningLevel: null,
      repositoryScope: "all",
      stage: "in_progress",
      sortPosition: 1_000,
      executionState: "starting",
      reviewState: "none",
      currentAttemptId: "attempt-run-control-test",
      stateVersion: 2,
      archivedAt: null,
      deletedAt: null,
      approvedAt: null,
      lastError: null,
      hasInheritedContext: false,
      createdAt: "2026-06-30T09:00:00Z",
      updatedAt: "2026-06-30T09:00:01Z",
      repositories: [
        {
          repositoryPath: "/repo/orchestrator",
          relativePath: ".",
          label: "orchestrator",
          includeDirtyChanges: false,
        },
      ],
    },
    attempt: {
      id: "attempt-run-control-test",
      cardId: "card-run-control-test",
      generation: 1,
      kind: "start",
      status: "provisioning",
      prompt: "Exercise Kanban pause semantics",
      runId: null,
      taskId: null,
      threadId: null,
      turnId: null,
      executionRoot: null,
      lastEventSequence: 0,
      error: null,
      startedAt: "2026-06-30T09:00:01Z",
      completedAt: null,
    },
  });
  mocks.loadKanbanGitBindingsMock.mockResolvedValue([
    {
      sourceRepositoryPath: "/repo/orchestrator",
      relativePath: ".",
      executionRoot: "/repo/.codex-kanban/card-run-control-test",
      sourceBranch: "main",
      baseBranch: "main",
      baseCommit: "0123456789abcdef",
      cardBranch: "codex/kanban-run-control-test",
      worktreePath: "/repo/.codex-kanban/card-run-control-test/orchestrator",
      status: "ready",
      error: null,
    },
  ]);
  mocks.loadKanbanInheritedContextMock.mockResolvedValue(null);
  mocks.reconcileKanbanGitMock.mockImplementation(async (binding) => ({
    binding,
    sourceAvailable: true,
    worktreeAvailable: true,
    branchAvailable: true,
    branchMatches: true,
    baseBranchHead: binding.baseCommit,
    headCommit: binding.baseCommit,
    targetMoved: false,
    hasChanges: false,
    hasConflicts: false,
  }));
  mocks.saveKanbanGitBindingsMock.mockImplementation(
    async (_card, bindings) => bindings,
  );
  mocks.updateKanbanAttemptMock.mockResolvedValue(undefined);
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
  mocks.readActiveCodexLoginMock.mockResolvedValue(null);
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
  mocks.listChatSubagentsMock.mockResolvedValue([]);
  mocks.readProjectedSubagentThreadMock.mockResolvedValue({
    threadId: "child-thread",
    status: "idle",
    activeTurnId: null,
    turns: [],
  });
  mocks.upsertRunSubagentMock.mockResolvedValue(undefined);
  mocks.listCodexSkillsMock.mockResolvedValue([]);
  mocks.listGitBranchesMock.mockResolvedValue({
    branches: ["main"],
    currentBranch: "main",
  });
  mocks.createGitBranchMock.mockResolvedValue({
    branch: "feature/new-branch",
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
  mocks.readWorkspaceFilePreviewVersionMock.mockResolvedValue("preview-version");
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
  mocks.inspectDroppedContextPathsMock.mockImplementation(
    async (paths: string[]) => ({
      files: paths.map((path) => ({
        path,
        canonicalPath: path,
        name: path.split("/").filter(Boolean).pop() ?? path,
      })),
      rejected: [],
    }),
  );
  mocks.inspectPromptQueueContextMock.mockImplementation(
    async (workspacePath: string, paths: string[]) => ({
      workspacePath,
      repositories: [
        {
          repositoryPath: workspacePath,
          branch: "main",
          headCommit: "0123456789abcdef",
          worktreeFingerprint: "clean",
        },
      ],
      files: paths.map((path) => ({
        path,
        canonicalPath: path,
        size: 128,
        modifiedAtMs: 1_750_000_000_000,
        available: true,
      })),
    }),
  );
  mocks.probeLocalWebPreviewMock.mockImplementation(async (url: string) => ({
    normalizedUrl: url,
    reachable: true,
  }));
  mocks.undoWorkspaceGitDiffMock.mockResolvedValue({
    message: "Undid changes to 1 file",
    branch: "main",
  });
  mocks.checkoutGitBranchMock.mockResolvedValue({ branch: "main" });
  mocks.runPreflightMock.mockResolvedValue(preflight);
  mocks.readCodexFileMock.mockResolvedValue("file contents");
  mocks.readDefaultCodexFileMock.mockResolvedValue("file contents");
  mocks.setThreadGoalMock.mockImplementation(
    async (_accountId: number, threadId: string, objective: string) => ({
      goal: {
        threadId,
        objective,
        status: "active",
        timeUsedSeconds: 0,
      },
    }),
  );
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
  mocks.updateWorkspaceSelectedGitRepositoryMock.mockResolvedValue(undefined);
  mocks.listCodexAccountsMock.mockResolvedValue([]);
  mocks.listDuplicateProfilesPendingCleanupMock.mockResolvedValue([]);
  mocks.completeDuplicateProfileCleanupMock.mockResolvedValue(undefined);
  mocks.recoverInterruptedChatTitleGenerationsMock.mockResolvedValue(undefined);
  mocks.claimChatTitleGenerationMock.mockResolvedValue(true);
  mocks.completeChatTitleGenerationMock.mockResolvedValue(true);
  mocks.failChatTitleGenerationMock.mockResolvedValue(true);
  mocks.recoverAbandonedRunsMock.mockResolvedValue({
    runs: 0,
    tasks: 0,
    chats: 0,
  });
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
    conversation_revision: 0,
  });
  mocks.createChatWithQueuedPromptMock.mockImplementation(async (input) => {
    const created = await mocks.createChatMock({
      workspaceId: input.workspaceId,
      accountId: input.accountId,
      title: input.title,
      status: input.status,
      generateTitle: input.generateTitle,
    });
    const chat = {
      ...created,
      codex_thread_id: null,
      status: input.status,
      workspace_id: input.workspaceId,
      account_id: input.accountId,
      profile_key:
        input.accountId === null ? null : `account:${input.accountId}`,
      conversation_revision: created.conversation_revision ?? 0,
    };
    const item = promptQueueItemFixture({
      id: input.itemId,
      clientMessageId: input.clientMessageId,
      workspaceId: input.workspaceId,
      chatId: chat.id,
      prompt: input.prompt,
      snapshot: input.snapshot,
    });
    mocks.promptQueueChats.set(chat.id, chat);
    mocks.promptQueueItems.set(item.id, item);
    return { chat, item };
  });
  mocks.enqueuePromptQueueItemMock.mockImplementation(async (input) => {
    const item = promptQueueItemFixture(input);
    mocks.promptQueueItems.set(item.id, item);
    return item;
  });
  mocks.readPromptQueueItemMock.mockImplementation(async (itemId: string) =>
    mocks.promptQueueItems.get(itemId) ?? null,
  );
  mocks.listPromptQueueItemsMock.mockImplementation(async (chatId: number) =>
    Array.from(mocks.promptQueueItems.values())
      .filter(
        (item) =>
          item.chatId === chatId &&
          item.status !== "completed" &&
          item.status !== "skipped",
      )
      .sort(
        (left, right) =>
          (left.sendNowPriority ?? Number.MAX_SAFE_INTEGER) -
            (right.sendNowPriority ?? Number.MAX_SAFE_INTEGER) ||
          left.position - right.position,
      ),
  );
  mocks.listRestoredPromptQueueItemsMock.mockResolvedValue([]);
  mocks.getChatRecordMock.mockImplementation(async (chatId: number) => {
    const queuedChat = mocks.promptQueueChats.get(chatId);
    if (queuedChat) return queuedChat;
    const listedChats = await mocks.listWorkspaceChatsMock(workspace.id);
    const listedChat = listedChats.find((chat: any) => chat.id === chatId);
    if (listedChat) return listedChat;
    const result = await mocks.getChatWithRunsMock(chatId);
    return result?.chat ?? null;
  });
  mocks.getNextChatTurnIndexMock.mockImplementation(async (chatId: number) => {
    const chat = await mocks.getChatRecordMock(chatId);
    return Math.max(1, Number(chat?.turn_count ?? 0) + 1);
  });
  mocks.updatePromptQueueItemSnapshotMock.mockImplementation(
    async (itemId: string, snapshot: any) =>
      updatePromptQueueFixture(itemId, {
        prompt: snapshot.prompt,
        snapshot,
        status: "queued",
        error: null,
        staleReasons: [],
      }),
  );
  mocks.updatePromptQueueItemContextFingerprintMock.mockImplementation(
    async (itemId: string, snapshot: any) =>
      updatePromptQueueFixture(itemId, { snapshot }),
  );
  mocks.reorderPromptQueueItemsMock.mockImplementation(
    async (_chatId: number, orderedItemIds: string[]) => {
      orderedItemIds.forEach((itemId, position) => {
        updatePromptQueueFixture(itemId, { position });
      });
      return true;
    },
  );
  mocks.prioritizePromptQueueItemMock.mockImplementation(
    async (itemId: string) =>
      updatePromptQueueFixture(itemId, {
        status: "scheduled-next",
        sendNowPriority: ++mocks.promptQueueState.priority,
        error: null,
      }),
  );
  mocks.claimPromptQueueItemMock.mockImplementation(async (itemId: string) => {
    const item = mocks.promptQueueItems.get(itemId);
    if (!item || !["queued", "scheduled-next"].includes(item.status)) {
      return null;
    }
    return updatePromptQueueFixture(itemId, {
      status: "starting",
      error: null,
      staleReasons: [],
    });
  });
  mocks.markPromptQueueItemSteeringMock.mockImplementation(
    async (itemId: string) =>
      updatePromptQueueFixture(itemId, {
        status: "steering",
        error: null,
      }),
  );
  mocks.reschedulePromptQueueItemAfterSteeringRaceMock.mockImplementation(
    async (itemId: string) =>
      updatePromptQueueFixture(itemId, {
        status: "scheduled-next",
        error: null,
      }),
  );
  mocks.acceptPromptQueueItemMock.mockImplementation(async (input) =>
    updatePromptQueueFixture(input.itemId, {
      status: "active",
      linkedRunId: input.runId,
      linkedTurnId: input.turnId,
      error: null,
      acceptedAt: "2026-06-30T09:00:02Z",
    }),
  );
  mocks.completePromptQueueItemMock.mockImplementation(
    async (itemId: string) => {
      const item = mocks.promptQueueItems.get(itemId);
      const completed = updatePromptQueueFixture(itemId, {
        status: "completed",
        error: null,
        completedAt: "2026-06-30T09:01:00Z",
      });
      if (item) {
        const chat = mocks.promptQueueChats.get(item.chatId);
        if (chat) {
          mocks.promptQueueChats.set(item.chatId, {
            ...chat,
            turn_count: Number(chat.turn_count ?? 0) + 1,
          });
        }
      }
      return completed;
    },
  );
  mocks.failPromptQueueItemMock.mockImplementation(
    async (itemId: string, error: string) =>
      updatePromptQueueFixture(itemId, {
        status: "failed",
        sendNowPriority: null,
        error,
      }),
  );
  mocks.markPromptQueueItemStaleMock.mockImplementation(
    async (itemId: string, reasons: string[]) =>
      updatePromptQueueFixture(itemId, {
        status: "stale",
        error: null,
        staleReasons: reasons,
      }),
  );
  mocks.retryPromptQueueItemMock.mockImplementation(
    async (
      itemId: string,
      options: { autoSendEnabled?: boolean } = {},
    ) =>
      updatePromptQueueFixture(itemId, {
        status: "queued",
        autoSendEnabled: options.autoSendEnabled ?? true,
        error: null,
        staleReasons: [],
      }),
  );
  mocks.setPromptQueueItemAutoSendMock.mockImplementation(
    async (itemId: string, enabled: boolean) => {
      const item = mocks.promptQueueItems.get(itemId);
      if (
        !item ||
        !["queued", "scheduled-next", "failed", "stale"].includes(item.status)
      ) {
        return null;
      }
      return updatePromptQueueFixture(itemId, {
        autoSendEnabled: enabled,
        sendNowPriority: enabled ? item.sendNowPriority : null,
        status:
          !enabled && item.status === "scheduled-next"
            ? "queued"
            : item.status,
      });
    },
  );
  mocks.removePromptQueueItemMock.mockImplementation(async (itemId: string) =>
    mocks.promptQueueItems.delete(itemId),
  );
  mocks.recoverInterruptedPromptQueueItemsMock.mockResolvedValue(0);
  mocks.advanceChatConversationRevisionMock.mockImplementation(
    async (chatId: number, options: { queueOwned: boolean }) => {
      const revision = ++mocks.promptQueueState.revision;
      const chat = mocks.promptQueueChats.get(chatId);
      if (chat) {
        mocks.promptQueueChats.set(chatId, {
          ...chat,
          conversation_revision: revision,
        });
      }
      if (options.queueOwned) {
        Array.from(mocks.promptQueueItems.values()).forEach((item) => {
          if (
            item.chatId === chatId &&
            ["queued", "scheduled-next"].includes(item.status)
          ) {
            updatePromptQueueFixture(item.id, {
              snapshot: {
                ...item.snapshot,
                contextFingerprint: {
                  ...item.snapshot.contextFingerprint,
                  conversationRevision: revision,
                },
              },
            });
          }
        });
      }
      return revision;
    },
  );
  mocks.updateChatMock.mockImplementation(async (chatId: number, fields) => {
    const chat = mocks.promptQueueChats.get(chatId);
    if (!chat) return;
    mocks.promptQueueChats.set(chatId, {
      ...chat,
      ...("title" in fields ? { title: fields.title } : {}),
      ...("codexThreadId" in fields
        ? { codex_thread_id: fields.codexThreadId }
        : {}),
      ...("status" in fields ? { status: fields.status } : {}),
      ...("collaborationMode" in fields
        ? { collaboration_mode: fields.collaborationMode }
        : {}),
    });
  });
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
  mocks.activateChatAccountHandoffMock.mockResolvedValue(true);
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
  mocks.nativeContextFileDropHandler = null;
  mocks.registerNativeContextFileDropMock.mockImplementation(
    async (handler: NonNullable<typeof mocks.nativeContextFileDropHandler>) => {
      mocks.nativeContextFileDropHandler = handler;
      return () => {
        if (mocks.nativeContextFileDropHandler === handler) {
          mocks.nativeContextFileDropHandler = null;
        }
      };
    },
  );
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

function composerInputZone() {
  const zone = screen.getByLabelText("Prompt").closest(".composer-input-zone");
  if (!(zone instanceof HTMLElement)) {
    throw new Error("Composer input zone was not rendered");
  }
  return zone;
}

async function emitNativeContextFileDrop(
  event: Parameters<
    NonNullable<typeof mocks.nativeContextFileDropHandler>
  >[0],
) {
  await waitFor(() =>
    expect(mocks.nativeContextFileDropHandler).not.toBeNull(),
  );
  await act(async () => {
    mocks.nativeContextFileDropHandler?.(event);
    await Promise.resolve();
    await Promise.resolve();
  });
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

function prepareKanbanRun() {
  prepareSignedInRun();
  mocks.listCodexModelsMock.mockResolvedValue([defaultCodexModel]);
  mocks.getChatRecordMock.mockResolvedValue({
    ...workspaceChatFixture({ id: 777, status: "draft", turn_count: 0 }),
    codex_thread_id: null,
  });
  mocks.getNextChatTurnIndexMock.mockResolvedValue(1);
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

describe("buildBoundedAccountHandoffContext", () => {
  it("keeps the objective and approved plan while omitting synthetic implementation prompts", () => {
    const context = buildBoundedAccountHandoffContext(
      [
        {
          turnIndex: 1,
          prompt: "Build a responsive Snake game",
          finalMessage: "Prepared the implementation plan.",
          completedPlan: "# Snake plan\n\nImplement keyboard and touch controls.",
          intent: "plan",
          planReviewState: "approved",
        },
        {
          turnIndex: 2,
          prompt: "Implement the plan.",
          finalMessage: "Implemented the game and verified its controls.",
          completedPlan: "",
          intent: "plan-implementation",
          planReviewState: null,
        },
      ],
      "",
      2_000,
    );

    expect(context).toContain("Build a responsive Snake game");
    expect(context).toContain("Implement keyboard and touch controls");
    expect(context).toContain("Implemented the game");
    expect(context).not.toContain("User: Implement the plan.");
  });

  it("honours the transfer budget while retaining the original objective", () => {
    const context = buildBoundedAccountHandoffContext(
      [
        {
          turnIndex: 1,
          prompt: "Preserve this objective",
          finalMessage: "x".repeat(20_000),
          completedPlan: "",
          intent: "normal",
          planReviewState: null,
        },
      ],
      "",
      80,
    );

    expect(context).toContain("Preserve this objective");
    expect(context.length).toBeLessThan(1_000);
  });
});

describe("App Codex auth", () => {
  beforeEach(() => {
    mocks.listeners.clear();
    vi.clearAllMocks();
    vi.useRealTimers();
    localStorage.clear();
    setWindowWidth(1024);
    document.documentElement.removeAttribute("data-theme");
    clearTranscriptStateCache();
    clearSubagentStore();
    mocks.virtuosoState = {
      ranges: [{ startIndex: 0, endIndex: 0 }],
      scrollTop: 0,
    };
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

  it("does not reopen a removed workspace when its pending preview finishes", async () => {
    const entry = {
      name: "pending.txt",
      path: "/repo/orchestrator/pending.txt",
      relativePath: "pending.txt",
      kind: "file" as const,
    };
    let resolvePreview: (preview: unknown) => void = () => undefined;
    mocks.listWorkspaceDirectoryMock.mockResolvedValue([entry]);
    mocks.readWorkspaceFilePreviewMock.mockReturnValue(
      new Promise((resolve) => {
        resolvePreview = resolve;
      }),
    );

    const { user } = await renderApp();
    const workspaceNav = screen.getByRole("navigation", { name: "Workspaces" });
    await user.click(
      within(workspaceNav).getByRole("button", { name: "Expand orchestrator" }),
    );
    await user.click(
      await within(workspaceNav).findByRole("button", { name: "pending.txt" }),
    );
    expect(screen.getByRole("complementary", { name: "File preview" })).toHaveTextContent(
      "Loading preview",
    );

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
        { name: "Remove workspace" },
      ),
    );

    await act(async () => {
      resolvePreview({
        path: entry.path,
        relativePath: entry.relativePath,
        content: "must stay closed",
        truncated: false,
        isBinary: false,
      });
    });

    expect(screen.queryByRole("complementary", { name: "File preview" })).toBeNull();
    expect(screen.queryByText("must stay closed")).not.toBeInTheDocument();
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

  it("publishes the first chunk when a file is reopened before its request resolves", async () => {
    const firstEntry = {
      name: "first.txt",
      path: "/repo/orchestrator/first.txt",
      relativePath: "first.txt",
      kind: "file" as const,
    };
    const secondEntry = {
      name: "second.txt",
      path: "/repo/orchestrator/second.txt",
      relativePath: "second.txt",
      kind: "file" as const,
    };
    let resolveFirstChunk: (preview: unknown) => void = () => undefined;
    let resolveFinalChunk: (preview: unknown) => void = () => undefined;
    const firstChunk = new Promise((resolve) => {
      resolveFirstChunk = resolve;
    });
    const finalChunk = new Promise((resolve) => {
      resolveFinalChunk = resolve;
    });
    mocks.listWorkspaceDirectoryMock.mockResolvedValue([firstEntry, secondEntry]);
    mocks.readWorkspaceFilePreviewMock.mockImplementation(
      (_workspacePath: string, filePath: string) =>
        filePath === firstEntry.path
          ? firstChunk
          : Promise.resolve({
              path: secondEntry.path,
              relativePath: secondEntry.relativePath,
              content: "second file",
              truncated: false,
              isBinary: false,
            }),
    );
    mocks.readWorkspaceFilePreviewChunkMock.mockReturnValue(finalChunk);

    const { user } = await renderApp();
    const workspaceNav = screen.getByRole("navigation", { name: "Workspaces" });
    await user.click(
      within(workspaceNav).getByRole("button", { name: "Expand orchestrator" }),
    );
    const firstButton = await within(workspaceNav).findByRole("button", {
      name: "first.txt",
    });
    await user.click(firstButton);
    await user.click(
      within(workspaceNav).getByRole("button", { name: "second.txt" }),
    );
    expect(await screen.findByText("second file")).toBeInTheDocument();
    await user.click(firstButton);

    await act(async () => {
      resolveFirstChunk({
        path: firstEntry.path,
        relativePath: firstEntry.relativePath,
        content: "first partial\n",
        truncated: false,
        isBinary: false,
        complete: false,
        nextOffset: 14,
        totalBytes: 24,
        version: "first-v1",
      });
    });

    expect(await screen.findByText("first partial")).toBeInTheDocument();
    expect(screen.getByText("Loading complete file…")).toBeInTheDocument();
    expect(mocks.readWorkspaceFilePreviewMock).toHaveBeenCalledTimes(2);

    await act(async () => {
      resolveFinalChunk({
        path: firstEntry.path,
        relativePath: firstEntry.relativePath,
        content: "first tail",
        truncated: false,
        isBinary: false,
        complete: true,
        nextOffset: 24,
        totalBytes: 24,
        version: "first-v1",
      });
    });
    expect(await screen.findByText("first tail")).toBeInTheDocument();
  });

  it("shows a bounded first chunk immediately and then exposes the complete file", async () => {
    const largeTotalBytes = 2 * 1024 * 1024 + 1;
    const entry = {
      name: "large.txt",
      path: "/repo/orchestrator/large.txt",
      relativePath: "large.txt",
      kind: "file" as const,
    };
    let resolveFinalChunk: (preview: unknown) => void = () => undefined;
    const finalChunk = new Promise((resolve) => {
      resolveFinalChunk = resolve;
    });
    mocks.listWorkspaceDirectoryMock.mockResolvedValue([entry]);
    mocks.readWorkspaceFilePreviewMock.mockResolvedValue({
      path: entry.path,
      relativePath: entry.relativePath,
      content: "one\r",
      truncated: false,
      isBinary: false,
      complete: false,
      nextOffset: 4,
      totalBytes: largeTotalBytes,
      version: "13-1",
    });
    mocks.readWorkspaceFilePreviewChunkMock.mockReturnValue(finalChunk);

    const { user } = await renderApp();
    const workspaceNav = screen.getByRole("navigation", { name: "Workspaces" });
    await user.click(
      within(workspaceNav).getByRole("button", { name: "Expand orchestrator" }),
    );
    await user.click(
      await within(workspaceNav).findByRole("button", { name: "large.txt" }),
    );

    expect(await screen.findByText("one")).toBeInTheDocument();
    expect(screen.getByText("Loading complete file…")).toBeInTheDocument();
    expect(screen.queryByText("Truncated")).not.toBeInTheDocument();
    expect(mocks.readWorkspaceFilePreviewChunkMock).toHaveBeenCalledWith(
      workspace.path,
      entry.path,
      4,
      "13-1",
    );

    await act(async () => {
      resolveFinalChunk({
        path: entry.path,
        relativePath: entry.relativePath,
        content: "\ntwo\nthree",
        truncated: false,
        isBinary: false,
        complete: true,
        nextOffset: largeTotalBytes,
        totalBytes: largeTotalBytes,
        version: "13-1",
      });
    });

    expect(await screen.findByText("three")).toBeInTheDocument();
    expect(
      screen.getByLabelText("Highlighted file preview").closest(".code-preview"),
    ).toHaveAttribute("data-indexed-lines", "true");
    expect(
      screen.getByLabelText("Highlighted file preview").closest(".code-preview"),
    ).toHaveAttribute("data-line-count", "3");
    expect(screen.queryByText("Loading complete file…")).not.toBeInTheDocument();
    expect(screen.queryByText("Truncated")).not.toBeInTheDocument();
  });

  it("stops a stale large-file transfer after switching files", async () => {
    const largeEntry = {
      name: "large.txt",
      path: "/repo/orchestrator/large.txt",
      relativePath: "large.txt",
      kind: "file" as const,
    };
    const otherEntry = {
      name: "other.txt",
      path: "/repo/orchestrator/other.txt",
      relativePath: "other.txt",
      kind: "file" as const,
    };
    let largeReads = 0;
    let resolveStaleChunk: (preview: unknown) => void = () => undefined;
    mocks.listWorkspaceDirectoryMock.mockResolvedValue([largeEntry, otherEntry]);
    mocks.readWorkspaceFilePreviewMock.mockImplementation(
      (_workspacePath: string, filePath: string) => {
        if (filePath === otherEntry.path) {
          return Promise.resolve({
            path: otherEntry.path,
            relativePath: otherEntry.relativePath,
            content: "other file",
            truncated: false,
            isBinary: false,
          });
        }
        largeReads += 1;
        return Promise.resolve(
          largeReads === 1
            ? {
                path: largeEntry.path,
                relativePath: largeEntry.relativePath,
                content: "partial large\n",
                truncated: false,
                isBinary: false,
                complete: false,
                nextOffset: 14,
                totalBytes: 24,
                version: "large-v1",
              }
            : {
                path: largeEntry.path,
                relativePath: largeEntry.relativePath,
                content: "restarted complete file",
                truncated: false,
                isBinary: false,
              },
        );
      },
    );
    mocks.readWorkspaceFilePreviewChunkMock.mockReturnValue(
      new Promise((resolve) => {
        resolveStaleChunk = resolve;
      }),
    );

    const { user } = await renderApp();
    const workspaceNav = screen.getByRole("navigation", { name: "Workspaces" });
    await user.click(
      within(workspaceNav).getByRole("button", { name: "Expand orchestrator" }),
    );
    await user.click(
      await within(workspaceNav).findByRole("button", { name: "large.txt" }),
    );
    expect(await screen.findByText("partial large")).toBeInTheDocument();

    await user.click(
      within(workspaceNav).getByRole("button", { name: "other.txt" }),
    );
    expect(await screen.findByText("other file")).toBeInTheDocument();
    await act(async () => {
      resolveStaleChunk({
        path: largeEntry.path,
        relativePath: largeEntry.relativePath,
        content: "stale tail",
        truncated: false,
        isBinary: false,
        complete: true,
        nextOffset: 24,
        totalBytes: 24,
        version: "large-v1",
      });
      await Promise.resolve();
    });
    expect(screen.queryByText("stale tail")).not.toBeInTheDocument();

    await user.click(
      within(workspaceNav).getByRole("button", { name: "large.txt" }),
    );
    expect(await screen.findByText("restarted complete file")).toBeInTheDocument();
    expect(largeReads).toBe(2);
  });

  it("validates a cached preview version before reopening a file", async () => {
    const entry = {
      name: "changing.txt",
      path: "/repo/orchestrator/changing.txt",
      relativePath: "changing.txt",
      kind: "file" as const,
    };
    mocks.listWorkspaceDirectoryMock.mockResolvedValue([entry]);
    mocks.readWorkspaceFilePreviewMock
      .mockResolvedValueOnce({
        path: entry.path,
        relativePath: entry.relativePath,
        content: "old contents",
        truncated: false,
        isBinary: false,
        complete: true,
        nextOffset: 12,
        totalBytes: 12,
        version: "12-old",
      })
      .mockResolvedValueOnce({
        path: entry.path,
        relativePath: entry.relativePath,
        content: "fresh contents",
        truncated: false,
        isBinary: false,
        complete: true,
        nextOffset: 14,
        totalBytes: 14,
        version: "14-new",
      });
    mocks.readWorkspaceFilePreviewVersionMock.mockResolvedValue("14-new");

    const { user } = await renderApp();
    const workspaceNav = screen.getByRole("navigation", { name: "Workspaces" });
    await user.click(
      within(workspaceNav).getByRole("button", { name: "Expand orchestrator" }),
    );
    const fileButton = await within(workspaceNav).findByRole("button", {
      name: "changing.txt",
    });
    await user.click(fileButton);
    expect(await screen.findByText("old contents")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Close file preview" }));

    await user.click(fileButton);

    expect(await screen.findByText("fresh contents")).toBeInTheDocument();
    expect(mocks.readWorkspaceFilePreviewVersionMock).toHaveBeenCalledWith(
      workspace.path,
      entry.path,
    );
    expect(mocks.readWorkspaceFilePreviewMock).toHaveBeenCalledTimes(2);
  });

  it("ignores a stale file preview response after switching files", async () => {
    const firstEntry = {
      name: "first.txt",
      path: "/repo/orchestrator/first.txt",
      relativePath: "first.txt",
      kind: "file" as const,
    };
    const secondEntry = {
      name: "second.txt",
      path: "/repo/orchestrator/second.txt",
      relativePath: "second.txt",
      kind: "file" as const,
    };
    let resolveFirst: (preview: unknown) => void = () => undefined;
    let resolveSecond: (preview: unknown) => void = () => undefined;
    const firstPreview = new Promise((resolve) => {
      resolveFirst = resolve;
    });
    const secondPreview = new Promise((resolve) => {
      resolveSecond = resolve;
    });
    mocks.listWorkspaceDirectoryMock.mockResolvedValue([firstEntry, secondEntry]);
    mocks.readWorkspaceFilePreviewMock.mockImplementation(
      (_workspacePath: string, filePath: string) =>
        filePath === firstEntry.path ? firstPreview : secondPreview,
    );

    const { user } = await renderApp();
    const workspaceNav = screen.getByRole("navigation", {
      name: "Workspaces",
    });

    await user.click(
      within(workspaceNav).getByRole("button", { name: "Expand orchestrator" }),
    );
    await user.click(
      await within(workspaceNav).findByRole("button", { name: "first.txt" }),
    );
    await user.click(within(workspaceNav).getByRole("button", { name: "second.txt" }));

    await act(async () => {
      resolveSecond({
        path: secondEntry.path,
        relativePath: secondEntry.relativePath,
        content: "current second file",
        truncated: false,
        isBinary: false,
      });
    });
    expect(await screen.findByText("current second file")).toBeInTheDocument();

    await act(async () => {
      resolveFirst({
        path: firstEntry.path,
        relativePath: firstEntry.relativePath,
        content: "stale first file",
        truncated: false,
        isBinary: false,
      });
    });

    const drawer = screen.getByRole("complementary", { name: "File preview" });
    expect(drawer).toHaveTextContent("second.txt");
    expect(drawer).toHaveTextContent("current second file");
    expect(drawer).not.toHaveTextContent("stale first file");

    await user.click(
      within(workspaceNav).getByRole("button", { name: "first.txt" }),
    );
    expect(await screen.findByText("stale first file")).toBeInTheDocument();
    expect(mocks.readWorkspaceFilePreviewMock).toHaveBeenCalledTimes(2);
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
        workspace.path,
      ),
    );
    expect(await within(banner).findByText("Clean")).toBeInTheDocument();
  });

  it("creates and selects a branch from the header branch menu", async () => {
    let currentBranch = "main";
    mocks.listGitBranchesMock.mockImplementation(async () => ({
      branches:
        currentBranch === "main"
          ? ["main"]
          : ["feature/chat-controls", "main"],
      currentBranch,
    }));
    mocks.createGitBranchMock.mockImplementation(
      async (_path: string, branch: string) => {
        currentBranch = branch;
        return { branch };
      },
    );

    const { user } = await renderApp();
    const banner = screen.getByRole("region", { name: "Selected folder" });
    const branchSelect = await within(banner).findByRole("combobox", {
      name: "Branch",
    });
    await waitFor(() => expect(branchSelect).toBeEnabled());

    await user.click(branchSelect);
    await user.click(
      screen.getByRole("option", { name: "Create branch..." }),
    );
    const dialog = screen.getByRole("dialog", { name: "Create branch" });
    expect(dialog).toHaveTextContent("from main");
    const input = within(dialog).getByRole("textbox", { name: "Branch name" });
    await waitFor(() => expect(input).toHaveFocus());
    await user.type(input, "feature/chat-controls");
    await user.keyboard("{Enter}");

    await waitFor(() =>
      expect(mocks.createGitBranchMock).toHaveBeenCalledWith(
        workspace.path,
        "feature/chat-controls",
        workspace.path,
      ),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Create branch" }),
      ).not.toBeInTheDocument(),
    );
    expect(branchSelect).toHaveTextContent("feature/chat-controls");
    expect(mocks.checkoutGitBranchMock).not.toHaveBeenCalled();
  });

  it("keeps branch creation open for validation and Git failures", async () => {
    mocks.createGitBranchMock.mockRejectedValue(
      new Error("Branch `feature/existing` already exists"),
    );

    const { user } = await renderApp();
    const banner = screen.getByRole("region", { name: "Selected folder" });
    const branchSelect = await within(banner).findByRole("combobox", {
      name: "Branch",
    });
    await waitFor(() => expect(branchSelect).toBeEnabled());
    await user.click(branchSelect);
    await user.click(
      screen.getByRole("option", { name: "Create branch..." }),
    );

    const dialog = screen.getByRole("dialog", { name: "Create branch" });
    await user.click(
      within(dialog).getByRole("button", { name: "Create branch" }),
    );
    expect(
      within(dialog).getByText("Enter a branch name before creating it."),
    ).toBeInTheDocument();
    expect(mocks.createGitBranchMock).not.toHaveBeenCalled();

    await user.type(
      within(dialog).getByRole("textbox", { name: "Branch name" }),
      "feature/existing",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Create branch" }),
    );

    expect(
      await within(dialog).findByText(
        "Could not create branch: Branch `feature/existing` already exists",
      ),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("textbox", { name: "Branch name" }),
    ).toHaveValue("feature/existing");
    expect(branchSelect).toHaveTextContent("main");
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

  it("selects one repository for branch and commit actions in a multi-repo workspace", async () => {
    const frontendPath = `${workspace.path}/frontend`;
    const backendPath = `${workspace.path}/backend`;
    const frontendFile = {
      path: `${frontendPath}/src/App.tsx`,
      relativePath: "frontend/src/App.tsx",
      repositoryPath: frontendPath,
      repositoryRelativePath: "src/App.tsx",
      oldRelativePath: null,
      indexStatus: " ",
      worktreeStatus: "M",
      statusKind: "modified",
      badge: "M",
    };
    const backendFile = {
      path: `${backendPath}/src/server.ts`,
      relativePath: "backend/src/server.ts",
      repositoryPath: backendPath,
      repositoryRelativePath: "src/server.ts",
      oldRelativePath: null,
      indexStatus: " ",
      worktreeStatus: "M",
      statusKind: "modified",
      badge: "M",
    };
    mocks.listWorkspaceGitStatusMock.mockResolvedValue({
      workspacePath: workspace.path,
      repositories: [
        {
          repository: {
            rootPath: frontendPath,
            relativePath: "frontend",
            label: "frontend",
          },
          workspacePath: workspace.path,
          gitRoot: frontendPath,
          currentBranch: "main",
          aheadCount: 0,
          additions: 5,
          deletions: 1,
          hasUpstream: true,
          hasOrigin: true,
          canPush: false,
          files: [frontendFile],
        },
        {
          repository: {
            rootPath: backendPath,
            relativePath: "backend",
            label: "backend",
          },
          workspacePath: workspace.path,
          gitRoot: backendPath,
          currentBranch: "release",
          aheadCount: 2,
          additions: 8,
          deletions: 3,
          hasUpstream: true,
          hasOrigin: true,
          canPush: true,
          files: [backendFile],
        },
      ],
      additions: 13,
      deletions: 4,
      changedRepositoryCount: 2,
      files: [frontendFile, backendFile],
      discoveryTruncated: false,
    });
    mocks.listGitBranchesMock.mockImplementation(
      async (_workspacePath: string, repositoryPath: string) =>
        repositoryPath === backendPath
          ? { branches: ["release", "main"], currentBranch: "release" }
          : { branches: ["main"], currentBranch: "main" },
    );

    const { user } = await renderApp();
    const banner = screen.getByRole("region", { name: "Selected folder" });
    const repositorySelect = await within(banner).findByRole("combobox", {
      name: "Git repository",
    });
    const branchSelect = within(banner).getByRole("combobox", {
      name: "Branch",
    });
    expect(
      repositorySelect.compareDocumentPosition(branchSelect) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(repositorySelect).toHaveTextContent("frontend · main");
    expect(within(banner).getByText("+13")).toBeInTheDocument();
    expect(within(banner).getByText("-4")).toBeInTheDocument();

    await user.click(
      within(banner).getByRole("button", { name: /commit or push/i }),
    );
    const dialog = screen.getByRole("dialog", { name: "Commit or push" });
    const dialogRepositorySelect = within(dialog).getByRole("combobox", {
      name: "Commit repository",
    });
    const dialogBranch = within(dialog).getByText("main");
    expect(
      dialogBranch.compareDocumentPosition(dialogRepositorySelect) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(dialogRepositorySelect).toHaveTextContent("frontend");
    expect(dialogRepositorySelect).not.toHaveTextContent("main");
    expect(dialogRepositorySelect).not.toHaveTextContent("changed");
    expect(
      dialog.querySelector(
        ".git-action-status-row .git-action-repository-select",
      ),
    ).not.toBeNull();
    expect(
      dialog.querySelector(":scope > .git-action-repository-select"),
    ).toBeNull();
    await user.type(
      within(dialog).getByLabelText(/commit message/i),
      "Frontend message",
    );
    await user.click(dialogRepositorySelect);
    await user.click(
      screen.getByRole("option", {
        name: "backend",
      }),
    );

    expect(within(dialog).getByLabelText(/commit message/i)).toHaveValue("");
    expect(within(dialog).getByText("release")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("8 additions, 3 deletions"))
      .toBeInTheDocument();
    await waitFor(() =>
      expect(mocks.updateWorkspaceSelectedGitRepositoryMock).toHaveBeenCalledWith(
        workspace.id,
        backendPath,
      ),
    );
    expect(mocks.listGitBranchesMock).toHaveBeenCalledWith(
      workspace.path,
      backendPath,
    );

    await user.type(
      within(dialog).getByLabelText(/commit message/i),
      "Update backend",
    );
    await user.click(within(dialog).getByRole("button", { name: /^commit$/i }));
    await waitFor(() =>
      expect(mocks.commitWorkspaceChangesMock).toHaveBeenCalledWith(
        workspace.path,
        "Update backend",
        true,
        backendPath,
      ),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Commit or push" }))
        .not.toBeInTheDocument(),
    );
    await user.click(
      within(banner).getByRole("button", { name: /commit or push/i }),
    );
    await user.click(
      within(screen.getByRole("dialog", { name: "Commit or push" })).getByRole(
        "button",
        { name: /^push$/i },
      ),
    );
    await waitFor(() =>
      expect(mocks.pushWorkspaceBranchMock).toHaveBeenCalledWith(
        workspace.path,
        backendPath,
      ),
    );
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
        workspace.path,
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
        workspace.path,
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

    expect(
      screen.queryByRole("dialog", { name: "Commit or push" }),
    ).not.toBeInTheDocument();
    const review = await screen.findByRole("button", {
      name: "Open Git actions",
    });
    expect(review).toHaveTextContent(
      "Could not generate a commit message. Enter a message manually or try again.",
    );
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
          repositoryPath: workspace.path,
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
        workspace.path,
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
        workspace.path,
      ),
    );
    await waitFor(() =>
      expect(mocks.pushWorkspaceBranchMock).toHaveBeenCalledWith(
        workspace.path,
        workspace.path,
      ),
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
          repositoryPath: workspace.path,
          accountId: null,
          includeUnstaged: true,
        }),
      ),
    );
    const review = await screen.findByRole("button", {
      name: "Open Git actions",
    });
    expect(review).toHaveTextContent(
      "Could not generate a commit message. Enter a message manually or try again.",
    );
    expect(mocks.commitWorkspaceChangesMock).not.toHaveBeenCalled();
    expect(mocks.pushWorkspaceBranchMock).not.toHaveBeenCalled();

    await user.click(review);
    const retryDialog = screen.getByRole("dialog", { name: "Commit or push" });
    await user.type(
      within(retryDialog).getByLabelText(/commit message/i),
      "Fix manual commit fallback",
    );
    await user.click(
      within(retryDialog).getByRole("button", { name: /^commit and push$/i }),
    );
    await waitFor(() =>
      expect(mocks.commitWorkspaceChangesMock).toHaveBeenCalledWith(
        workspace.path,
        "Fix manual commit fallback",
        true,
        workspace.path,
      ),
    );
    await waitFor(() =>
      expect(mocks.pushWorkspaceBranchMock).toHaveBeenCalledWith(
        workspace.path,
        workspace.path,
      ),
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
    let dialog = screen.getByRole("dialog", { name: "Commit or push" });

    await user.click(within(dialog).getByRole("button", { name: /^commit$/i }));
    const review = await screen.findByRole("button", {
      name: "Open Git actions",
    });
    expect(review).toHaveTextContent(
      "Could not generate a commit message. Enter a message manually or try again.",
    );
    await user.click(review);
    dialog = screen.getByRole("dialog", { name: "Commit or push" });
    await user.click(within(dialog).getByRole("button", { name: /^commit$/i }));

    await waitFor(() =>
      expect(mocks.generateWorkspaceCommitMessageMock).toHaveBeenCalledTimes(2),
    );
    await waitFor(() =>
      expect(mocks.commitWorkspaceChangesMock).toHaveBeenCalledWith(
        workspace.path,
        "Keep Snake controls responsive",
        true,
        workspace.path,
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
    expect(
      screen.queryByRole("dialog", { name: "Commit or push" }),
    ).not.toBeInTheDocument();
    expect(
      within(banner).getByRole("button", { name: /commit or push/i }),
    ).toHaveAttribute("aria-busy", "true");
    expect(
      within(banner).getByRole("button", { name: /commit or push/i }),
    ).toBeDisabled();
    expect(mocks.commitWorkspaceChangesMock).toHaveBeenCalledWith(
      workspace.path,
      "Keep Snake controls responsive",
      true,
      workspace.path,
    );

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
    await waitFor(() =>
      expect(
        within(banner).getByRole("button", { name: /commit or push/i }),
      ).toHaveAttribute("aria-busy", "false"),
    );
  });

  it("closes the dialog while an accepted commit runs in the background", async () => {
    let resolveCommit:
      | ((value: { message: string; branch: string }) => void)
      | null = null;
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
      canPush: false,
      additions: 4,
      deletions: 1,
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
    const gitButton = await within(banner).findByRole("button", {
      name: /commit or push/i,
    });
    await user.click(gitButton);
    const dialog = screen.getByRole("dialog", { name: "Commit or push" });
    await user.type(
      within(dialog).getByLabelText(/commit message/i),
      "Keep Git actions responsive",
    );
    await user.click(within(dialog).getByRole("button", { name: /^commit$/i }));

    expect(
      screen.queryByRole("dialog", { name: "Commit or push" }),
    ).not.toBeInTheDocument();
    expect(gitButton).toBeDisabled();
    expect(gitButton).toHaveAttribute("aria-busy", "true");
    expect(
      within(banner)
        .getByRole("status", { name: "Committing changes" })
        .querySelector(".spin"),
    ).toBeInTheDocument();

    await act(async () => {
      resolveCommit?.({
        message: "Committed workspace changes",
        branch: "main",
      });
      await Promise.resolve();
    });

    expect(
      await screen.findByText(
        "Workspace changes were committed successfully. Repository: orchestrator.",
      ),
    ).toBeInTheDocument();
    await waitFor(() => expect(gitButton).toHaveAttribute("aria-busy", "false"));
  });

  it("closes the dialog immediately while generating a commit message", async () => {
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
      canPush: false,
      additions: 4,
      deletions: 1,
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
    const gitButton = await within(banner).findByRole("button", {
      name: /commit or push/i,
    });
    await user.click(gitButton);
    const dialog = screen.getByRole("dialog", { name: "Commit or push" });
    await user.click(within(dialog).getByRole("button", { name: /^commit$/i }));

    expect(
      screen.queryByRole("dialog", { name: "Commit or push" }),
    ).not.toBeInTheDocument();
    expect(mocks.generateWorkspaceCommitMessageMock).toHaveBeenCalledTimes(1);
    expect(gitButton).toHaveAttribute("aria-busy", "true");
    expect(
      within(banner)
        .getByRole("button", { name: /commit or push/i })
        .querySelector(".spin"),
    ).toBeInTheDocument();

    await act(async () => {
      resolveGeneration?.({
        message: "Preserve workspace scroll position",
        source: "codex",
      });
      await Promise.resolve();
    });
    await waitFor(() =>
      expect(mocks.commitWorkspaceChangesMock).toHaveBeenCalledWith(
        workspace.path,
        "Preserve workspace scroll position",
        true,
        workspace.path,
      ),
    );

    await act(async () => {
      resolveCommit?.({
        message: "Committed workspace changes",
        branch: "main",
      });
      await Promise.resolve();
    });
  });

  it("reports a failed background commit and retries without reopening the dialog", async () => {
    mocks.commitWorkspaceChangesMock
      .mockRejectedValueOnce(new Error("commit timed out"))
      .mockResolvedValueOnce({
        message: "Committed workspace changes",
        branch: "main",
      });
    mocks.listWorkspaceGitStatusMock.mockResolvedValue({
      workspacePath: workspace.path,
      gitRoot: workspace.path,
      currentBranch: "main",
      aheadCount: 0,
      hasUpstream: true,
      hasOrigin: true,
      canPush: false,
      additions: 4,
      deletions: 1,
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
    await user.type(
      within(dialog).getByLabelText(/commit message/i),
      "Keep failed Git actions retryable",
    );
    await user.click(within(dialog).getByRole("button", { name: /^commit$/i }));

    const retry = await screen.findByRole("button", { name: "Retry commit" });
    expect(retry).toHaveTextContent(
      "Commit timed out. Check your connection and try again.",
    );
    expect(
      screen.queryByRole("dialog", { name: "Commit or push" }),
    ).not.toBeInTheDocument();

    await user.click(retry);
    await waitFor(() =>
      expect(mocks.commitWorkspaceChangesMock).toHaveBeenCalledTimes(2),
    );
    expect(
      await screen.findByText(
        "Workspace changes were committed successfully. Repository: orchestrator.",
      ),
    ).toBeInTheDocument();
  });

  it("shows a retryable composer warning when a background push fails", async () => {
    mocks.pushWorkspaceBranchMock
      .mockRejectedValueOnce(
        new Error("failed to push some refs (non-fast-forward)"),
      )
      .mockResolvedValueOnce({
        message: "Pushed main",
        branch: "main",
      });
    mocks.listWorkspaceGitStatusMock.mockResolvedValue({
      workspacePath: workspace.path,
      gitRoot: workspace.path,
      currentBranch: "main",
      aheadCount: 1,
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
    await user.click(within(dialog).getByRole("button", { name: /^push$/i }));

    expect(
      screen.queryByRole("dialog", { name: "Commit or push" }),
    ).not.toBeInTheDocument();
    const retry = await screen.findByRole("button", { name: "Retry push" });
    expect(retry).toHaveTextContent(
      "Push was rejected. Pull or resolve the remote changes, then try again.",
    );

    await user.click(retry);
    await waitFor(() =>
      expect(mocks.pushWorkspaceBranchMock).toHaveBeenCalledTimes(2),
    );
    expect(
      await screen.findByText(
        "The current branch was pushed successfully. Repository: orchestrator.",
      ),
    ).toBeInTheDocument();
  });

  it("retries only the push after a combined operation commits successfully", async () => {
    mocks.pushWorkspaceBranchMock
      .mockRejectedValueOnce(new Error("authentication failed"))
      .mockResolvedValueOnce({
        message: "Pushed main",
        branch: "main",
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
      deletions: 0,
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
    await user.type(
      within(dialog).getByLabelText(/commit message/i),
      "Keep background Git operations isolated",
    );
    await user.click(
      within(dialog).getByRole("button", { name: /^commit and push$/i }),
    );

    const retry = await screen.findByRole("button", { name: "Retry push" });
    expect(retry).toHaveTextContent(
      "The commit succeeded, but the push failed.",
    );
    await user.click(retry);

    await waitFor(() =>
      expect(mocks.pushWorkspaceBranchMock).toHaveBeenCalledTimes(2),
    );
    expect(mocks.commitWorkspaceChangesMock).toHaveBeenCalledTimes(1);
  });

  it("keeps background Git progress scoped to its workspace", async () => {
    const otherWorkspace = {
      ...workspace,
      id: 2,
      path: "/repo/other",
      label: "other",
    };
    let resolvePush:
      | ((value: { message: string; branch: string }) => void)
      | null = null;
    mocks.listWorkspacesMock.mockResolvedValue([workspace, otherWorkspace]);
    mocks.listWorkspaceGitStatusMock.mockImplementation(
      async (workspacePath: string) => ({
        workspacePath,
        gitRoot: workspacePath,
        currentBranch: "main",
        aheadCount: workspacePath === workspace.path ? 1 : 0,
        hasUpstream: true,
        hasOrigin: true,
        canPush: workspacePath === workspace.path,
        files: [],
      }),
    );
    mocks.pushWorkspaceBranchMock.mockImplementation(
      () =>
        new Promise<{ message: string; branch: string }>((resolve) => {
          resolvePush = resolve;
        }),
    );

    const { user } = await renderApp();
    let banner = screen.getByRole("region", { name: "Selected folder" });
    await user.click(
      await within(banner).findByRole("button", { name: /commit or push/i }),
    );
    await user.click(
      within(screen.getByRole("dialog", { name: "Commit or push" })).getByRole(
        "button",
        { name: /^push$/i },
      ),
    );
    expect(
      within(banner).getByRole("button", { name: /commit or push/i }),
    ).toHaveAttribute("aria-busy", "true");

    const workspaceNav = screen.getByRole("navigation", { name: "Workspaces" });
    await user.click(
      within(workspaceNav).getByRole("button", { name: "other" }),
    );
    banner = screen.getByRole("region", { name: "Selected folder" });
    expect(within(banner).getByText("other")).toBeInTheDocument();
    expect(
      within(banner).getByRole("button", { name: /commit or push/i }),
    ).toHaveAttribute("aria-busy", "false");

    await user.click(
      within(workspaceNav).getByRole("button", { name: "orchestrator" }),
    );
    banner = screen.getByRole("region", { name: "Selected folder" });
    expect(
      within(banner).getByRole("button", { name: /commit or push/i }),
    ).toHaveAttribute("aria-busy", "true");

    await act(async () => {
      resolvePush?.({ message: "Pushed main", branch: "main" });
      await Promise.resolve();
    });
    await waitFor(() =>
      expect(
        within(banner).getByRole("button", { name: /commit or push/i }),
      ).toHaveAttribute("aria-busy", "false"),
    );
  });

  it("recovers an interrupted Git operation without retrying it after restart", async () => {
    persistRunningGitOperation(
      {
        workspaceId: workspace.id,
        workspacePath: workspace.path,
        workspaceLabel: workspace.label,
        repositoryPath: workspace.path,
        repositoryLabel: workspace.label,
        kind: "commit-and-push",
        commitMessage: "Do not retain this message",
        includeUnstaged: true,
        changeKey: "old-change",
      },
      "pushing",
    );

    const { user } = await renderApp();
    const banner = screen.getByRole("region", { name: "Selected folder" });
    expect(
      within(banner).getByRole("button", { name: /commit or push/i }),
    ).toHaveAttribute("aria-busy", "false");
    const review = await screen.findByRole("button", {
      name: "Open Git actions",
    });
    expect(review).toHaveTextContent(
      "Review the current Git status before starting another commit or push.",
    );
    expect(mocks.commitWorkspaceChangesMock).not.toHaveBeenCalled();
    expect(mocks.pushWorkspaceBranchMock).not.toHaveBeenCalled();

    await user.click(review);
    expect(
      screen.getByRole("dialog", { name: "Commit or push" }),
    ).toBeInTheDocument();
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
    expect(
      screen.queryByRole("dialog", { name: "Commit or push" }),
    ).not.toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: "Open Git actions" }),
    ).toHaveTextContent(
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

      expect(
        screen.queryByRole("dialog", { name: "Commit or push" }),
      ).not.toBeInTheDocument();
      expect(
        await screen.findByRole("button", { name: "Open Git actions" }),
      ).toHaveTextContent(
        "Could not generate a commit message. Enter a message manually or try again.",
      );
      expect(mocks.commitWorkspaceChangesMock).not.toHaveBeenCalled();
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
        workspace.path,
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
        workspace.path,
      ),
    );
    await waitFor(() =>
      expect(mocks.pushWorkspaceBranchMock).toHaveBeenCalledWith(
        workspace.path,
        workspace.path,
      ),
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
      expect(mocks.pushWorkspaceBranchMock).toHaveBeenCalledWith(
        workspace.path,
        workspace.path,
      ),
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

  it("opens the exact history chat selected on every drawer click", async () => {
    const chats = [
      workspaceChatFixture({ id: 411, title: "Alpha conversation" }),
      workspaceChatFixture({ id: 412, title: "Beta conversation" }),
      workspaceChatFixture({ id: 413, title: "Gamma conversation" }),
    ];
    mocks.listWorkspaceChatsMock.mockResolvedValue(chats);
    mocks.listLocalChatTranscriptMock.mockImplementation(async (chatId: number) => [
      workspaceRunFixture({
        id: chatId + 1_000,
        chat_id: chatId,
        original_prompt: `Prompt for chat ${chatId}`,
        final_message: `Result for chat ${chatId}.`,
      }),
    ]);

    const { user } = await renderApp();
    const banner = screen.getByRole("region", { name: "Selected folder" });
    const historyButton = within(banner).getByRole("button", {
      name: /open chat history/i,
    });

    const selectChat = async (title: string, chatId: number) => {
      await user.click(historyButton);
      const drawer = await screen.findByRole("complementary", {
        name: "Workspace chat history",
      });
      const row = within(drawer).getByRole("button", {
        name: new RegExp(title, "i"),
      });
      await user.click(row);

      await waitFor(() => {
        const visibleLayer = document.querySelector<HTMLElement>(
          ".task-chat-transcript-layer.is-visible",
        );
        expect(visibleLayer).not.toBeNull();
        expect(
          within(visibleLayer as HTMLElement).getByText(
            `Result for chat ${chatId}.`,
          ),
        ).toBeInTheDocument();
      });

      await user.click(historyButton);
      const reopenedDrawer = await screen.findByRole("complementary", {
        name: "Workspace chat history",
      });
      expect(
        within(reopenedDrawer).getByRole("button", {
          name: new RegExp(title, "i"),
        }),
      ).toHaveAttribute("aria-pressed", "true");
      await user.click(historyButton);
    };

    await selectChat("Alpha conversation", 411);
    await selectChat("Gamma conversation", 413);
    await selectChat("Beta conversation", 412);
    await selectChat("Alpha conversation", 411);

    await user.click(screen.getByRole("button", { name: /new chat/i }));
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();

    await selectChat("Gamma conversation", 413);
    expect(mocks.listLocalChatTranscriptMock).toHaveBeenCalledWith(411);
    expect(mocks.listLocalChatTranscriptMock).toHaveBeenCalledWith(412);
    expect(mocks.listLocalChatTranscriptMock).toHaveBeenCalledWith(413);
  });

  it("restores a held queue item after restart and keeps the chat queue paused", async () => {
    const historicalChat = workspaceChatFixture({
      id: 409,
      title: "Persisted prompt queue",
    });
    const historicalRun = workspaceRunFixture({
      id: 309,
      chat_id: historicalChat.id,
      original_prompt: "Initial completed work",
      final_message: "Initial work complete.",
    });
    const executionSettings = createRunExecutionSettings({
      accountId: signedInAccount.id,
      profileKey: `account:${signedInAccount.id}`,
      selectedBranch: "main",
      mode: "run",
      intent: "normal",
      accessMode: "ask-for-approval",
      computerUseEnabled: true,
      model: "gpt-5.6",
      reasoningEffort: "medium",
      useOss: false,
      ossProvider: "ollama",
      contextFiles: [],
      selectedSkills: [],
      goalMode: false,
    });
    const snapshot = createQueuedPromptSnapshot({
      prompt: "Keep this prompt held",
      executionSettings,
      contextFingerprint: {
        version: 2,
        workspacePath: workspace.path,
        repositories: [
          {
            repositoryPath: workspace.path,
            branch: "main",
            headCommit: "abc123",
            worktreeFingerprint: "clean",
          },
        ],
        profileKey: `account:${signedInAccount.id}`,
        threadId: historicalChat.codex_thread_id,
        conversationRevision: historicalChat.conversation_revision,
        files: [],
      },
    });
    const heldItem: PromptQueueItem = {
      id: "restored-held-queue-item",
      clientMessageId: "restored-held-message",
      workspaceId: workspace.id,
      chatId: historicalChat.id,
      position: 0,
      sendNowPriority: null,
      autoSendEnabled: false,
      prompt: snapshot.prompt,
      snapshot,
      status: "queued",
      linkedRunId: null,
      linkedTurnId: null,
      error: null,
      staleReasons: [],
      createdAt: "2026-07-26T10:00:00Z",
      updatedAt: "2026-07-26T10:00:00Z",
      acceptedAt: null,
      completedAt: null,
    };
    mocks.listRestoredPromptQueueItemsMock.mockResolvedValue([heldItem]);
    mocks.promptQueueItems.set(heldItem.id, heldItem);
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
      within(drawer).getByRole("button", {
        name: /persisted prompt queue/i,
      }),
    );

    expect(await screen.findByText("Queued")).toBeInTheDocument();
    expect(screen.queryByText("Queue paused")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^Queued/ }));
    expect(screen.getAllByText("Held").length).toBeGreaterThan(0);
    const restore = screen.getByRole("button", {
      name: "Restore automatic sending",
    });
    expect(
      mocks.codexRpcMock.mock.calls.some(([, method]) => method === "turn/start"),
    ).toBe(false);
    await user.click(restore);
    await waitFor(() =>
      expect(mocks.setPromptQueueItemAutoSendMock).toHaveBeenCalledWith(
        heldItem.id,
        true,
      ),
    );
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

    await waitFor(() => {
      const visibleLayer = document.querySelector<HTMLElement>(
        ".task-chat-transcript-layer.is-visible",
      );
      expect(visibleLayer).not.toBeNull();
      const transcript = within(visibleLayer as HTMLElement).getByRole(
        "region",
        { name: "Task chat transcript" },
      );
      expect(transcript).toHaveClass("virtuoso-transcript");
      expect(
        transcript.querySelectorAll(".task-chat-virtuoso-row"),
      ).toHaveLength(2);
    });
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

  it("adopts an external chat into a managed account without losing imported turns", async () => {
    prepareSignedInRun();
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
    mocks.listCodexModelsMock.mockResolvedValue([defaultCodexModel]);
    const sourceVersion = "2026-07-07T10:02:00Z";
    const externalChat = {
      ...workspaceChatFixture({
        id: 502,
        title: "Imported browser task",
        codex_thread_id: "external-thread-2",
        origin: "codex_external",
        profile_key: "default",
        external_thread_id: "external-thread-2",
        source_kind: "vscode",
        turn_count: 1,
      }),
      account_id: null,
      account_label: null,
      account_email: null,
      sync_status: "synced",
      external_updated_at: sourceVersion,
    };
    const externalSnapshot = {
      ...externalTranscriptSnapshotFixture(1),
      threadId: "external-thread-2",
      sourceVersion,
      turns: [
        {
          ...externalTranscriptSnapshotFixture(1).turns[0],
          prompt: "Build the imported browser shell",
          finalMessage: "Created the imported browser shell.",
        },
      ],
    };
    mocks.listWorkspaceChatsMock.mockResolvedValue([externalChat]);
    mocks.getChatWithRunsMock.mockResolvedValue({
      chat: externalChat,
      runs: [],
    });
    mocks.readExternalTranscriptSnapshotMock.mockResolvedValue(
      externalSnapshot,
    );
    mocks.codexRpcMock.mockImplementation(
      async (accountId: number, method: string) => {
        if (method === "thread/start") {
          expect(accountId).toBe(8);
          return { thread: { id: "managed-thread-2" } };
        }
        if (method === "turn/start") {
          return { turn: { id: "managed-turn-1" } };
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
      within(drawer).getByRole("button", { name: /imported browser task/i }),
    );
    await screen.findByText("Created the imported browser shell.");

    await user.click(screen.getByRole("combobox", { name: "Run account" }));
    await user.click(
      screen.getByRole("option", { name: "personal@example.com" }),
    );
    const handoffDialog = await screen.findByRole("dialog", {
      name: "Switch account for this chat?",
    });
    await user.click(
      within(handoffDialog).getByRole("button", { name: "Switch account" }),
    );
    await user.type(screen.getByLabelText("Prompt"), "Add session restore");
    await user.keyboard("{Enter}");

    await waitFor(() =>
      expect(mocks.activateChatAccountHandoffMock).toHaveBeenCalledWith({
        chatId: 502,
        expectedProfileKey: "default",
        expectedThreadId: "external-thread-2",
        accountId: 8,
        profileKey: "account:8",
        codexThreadId: "managed-thread-2",
        status: "running",
      }),
    );
    expect(mocks.syncDefaultProfileThreadTranscriptMock).not.toHaveBeenCalled();
    expect(
      mocks.codexDefaultProfileRpcMock.mock.calls.some(
        ([method]) => method === "thread/resume" || method === "turn/start",
      ),
    ).toBe(false);
    const handoffTurn = mocks.codexRpcMock.mock.calls.find(
      ([accountId, method]) => accountId === 8 && method === "turn/start",
    );
    expect(
      (
        handoffTurn?.[2] as {
          additionalContext?: Record<string, { value?: string }>;
        }
      )?.additionalContext?.["chat:previous-turns"]?.value,
    ).toContain("Created the imported browser shell.");
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

    await waitFor(() => {
      const visibleLayer = document.querySelector<HTMLElement>(
        ".task-chat-transcript-layer.is-visible",
      );
      expect(visibleLayer).not.toBeNull();
      expect(
        within(visibleLayer as HTMLElement).getByText("Old result."),
      ).toBeInTheDocument();
    });
    expect(screen.queryByText("Current active run")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /run codex/i })).toBeInTheDocument();
  });

  it("surfaces a routed approval below the header outside the composer", async () => {
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
    await startMockRun(user, "Current active run");
    const banner = screen.getByRole("region", { name: "Selected folder" });
    await user.click(
      within(banner).getByRole("button", { name: /open chat history/i }),
    );
    await user.click(
      within(
        await screen.findByRole("complementary", {
          name: "Workspace chat history",
        }),
      ).getByRole("button", { name: /old chat/i }),
    );

    await emitCodexServerRequest(
      {
        id: 13,
        method: "item/commandExecution/requestApproval",
        params: {
          threadId: "thread-1",
          turnId: "turn-1",
          command: "npm run release",
          availableDecisions: ["accept", "cancel"],
        },
      },
      { requestToken: "server-request-7-1-13" },
    );

    const openApprovalChat = screen.getByRole("button", {
      name: "Open chat awaiting approval",
    });
    expect(
      openApprovalChat.closest(".floating-header-status-bubble"),
    ).not.toBeNull();
    expect(openApprovalChat.closest(".composer-panel")).toBeNull();
    expect(openApprovalChat.closest(".task-hero")).not.toBeNull();
    await user.click(openApprovalChat);

    const approvalCard = await screen.findByRole("article", {
      name: "Codex needs approval to run a command",
    });
    expect(screen.getByLabelText("Submitted prompt")).toHaveTextContent(
      "Current active run",
    );
    await waitFor(() => expect(approvalCard).toHaveFocus());
    expect(
      screen.queryByRole("button", {
        name: "Open chat awaiting approval",
      }),
    ).not.toBeInTheDocument();

    await user.click(
      within(approvalCard).getByRole("button", { name: "Approve once" }),
    );
    await waitFor(() =>
      expect(mocks.resolveCodexServerRequestMock).toHaveBeenCalledWith(
        7,
        13,
        "server-request-7-1-13",
        expect.any(Object),
      ),
    );
  });

  it("removes a cross-chat approval notice when its turn completes", async () => {
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
    await startMockRun(user, "Current active run");
    const banner = screen.getByRole("region", { name: "Selected folder" });
    await user.click(
      within(banner).getByRole("button", { name: /open chat history/i }),
    );
    await user.click(
      within(
        await screen.findByRole("complementary", {
          name: "Workspace chat history",
        }),
      ).getByRole("button", { name: /old chat/i }),
    );
    await emitCodexServerRequest({
      id: 14,
      method: "item/commandExecution/requestApproval",
      params: {
        threadId: "thread-1",
        turnId: "turn-1",
        command: "npm run release",
        availableDecisions: ["accept", "cancel"],
      },
    });
    expect(
      screen.getByRole("button", {
        name: "Open chat awaiting approval",
      }),
    ).toBeInTheDocument();

    await emitCodexNotification({
      method: "turn/completed",
      params: {
        threadId: "thread-1",
        turn: {
          id: "turn-1",
          status: "failed",
          durationMs: 1_000,
          error: "Turn ended before approval.",
        },
      },
    });

    await waitFor(() =>
      expect(
        screen.queryByRole("button", {
          name: "Open chat awaiting approval",
        }),
      ).not.toBeInTheDocument(),
    );
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
    await waitFor(() =>
      expect(
        within(screen.getByLabelText("Task chat transcript")).getByLabelText(
          "Submitted prompt",
        ),
      ).toHaveTextContent("Run in orchestrator"),
    );
    expect(screen.queryByText("Run in mobile client")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /run codex/i })).toBeInTheDocument();

    await user.click(
      within(workspaceNav).getByRole("button", { name: "mobile-client" }),
    );
    await waitFor(() =>
      expect(
        within(screen.getByLabelText("Task chat transcript")).getByLabelText(
          "Submitted prompt",
        ),
      ).toHaveTextContent("Run in mobile client"),
    );
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
    const composer = composerInputZone();
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
    const transcript = await screen.findByLabelText("Task chat transcript");
    expect(
      within(transcript).getByLabelText("Submitted prompt"),
    ).toHaveTextContent("Background setup");
    expect(screen.getByRole("button", { name: /stop codex/i })).toBeInTheDocument();
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

  it("keeps the remembered chat viewport mounted while switching workspaces", async () => {
    const mobileWorkspace = {
      ...workspace,
      id: 2,
      path: "/repo/mobile-client",
      label: "mobile-client",
    };
    const historicalChat = workspaceChatFixture({
      id: 416,
      title: "ExpressJS App Scaffolding Plan",
    });
    const historicalRuns = Array.from({ length: 18 }, (_, index) =>
      workspaceRunFixture({
        id: 316 + index,
        task_id: 116 + index,
        chat_id: historicalChat.id,
        turn_index: index + 1,
        original_prompt: `Prompt ${index + 1}`,
        final_message: `Result ${index + 1}.`,
      }),
    );
    mocks.listWorkspacesMock.mockResolvedValue([workspace, mobileWorkspace]);
    mocks.listWorkspaceChatsMock.mockImplementation(async (workspaceId: number) =>
      workspaceId === workspace.id ? [historicalChat] : [],
    );
    mocks.getChatWithRunsMock.mockResolvedValue(
      workspaceChatWithRunsFixture(historicalChat, historicalRuns),
    );
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
      within(drawer).getByRole("button", {
        name: /expressjs app scaffolding plan/i,
      }),
    );
    expect(await screen.findByText("Result 18.")).toBeInTheDocument();
    const transcriptBeforeSwitch = screen.getByLabelText(
      "Task chat transcript",
    );

    mocks.virtuosoState = {
      ranges: [{ startIndex: 7, endIndex: 13 }],
      scrollTop: 1_842,
    };
    const workspaceNav = screen.getByRole("navigation", { name: "Workspaces" });
    await user.click(
      within(workspaceNav).getByRole("button", { name: "mobile-client" }),
    );
    const suspendedTranscript = document.querySelector<HTMLElement>(
      ".task-chat-transcript-switcher.is-suspended",
    );
    expect(suspendedTranscript).not.toBeNull();
    expect(suspendedTranscript).toHaveTextContent("Result 18.");

    // Clearing the fallback cache must not force the retained viewport to remount.
    clearTranscriptStateCache();
    await user.click(
      within(workspaceNav).getByRole("button", { name: "orchestrator" }),
    );

    expect(await screen.findByLabelText("Task chat transcript")).toBe(
      transcriptBeforeSwitch,
    );
    expect(screen.getByText("Result 18.")).toBeInTheDocument();
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
    const transcriptBeforeSubmission = screen.getByLabelText(
      "Task chat transcript",
    );

    const animationFrames = holdNextAnimationFrames();
    try {
      await user.type(screen.getByLabelText("Prompt"), "Start fresh work");
      await user.keyboard("{Enter}");

      const transcript = screen.getByLabelText("Task chat transcript");
      expect(transcript).toBe(transcriptBeforeSubmission);
      expect(transcript).toHaveTextContent("Start fresh work");
      expect(transcript).toHaveTextContent("Old selected result.");
    } finally {
      animationFrames.restore();
    }
  });

  it("clears a stale Goal Mode objective before continuing a historical chat normally", async () => {
    prepareSignedInRun();
    const historicalChat = workspaceChatFixture({
      id: 404,
      title: "ExpressJS App Scaffolding Plan",
      codex_thread_id: "thread-1",
    });
    const historicalRun = workspaceRunFixture({
      id: 304,
      chat_id: historicalChat.id,
      original_prompt: "Scaffold the ExpressJS app",
      final_message: "Prepared the app.",
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
    await user.click(
      within(
        await screen.findByRole("complementary", {
          name: "Workspace chat history",
        }),
      ).getByRole("button", { name: /expressjs app scaffolding plan/i }),
    );
    await screen.findByText("Prepared the app.");

    await user.type(screen.getByLabelText("Prompt"), "Report the working directory");
    await user.keyboard("{Enter}");

    await waitFor(() =>
      expect(mocks.codexRpcMock).toHaveBeenCalledWith(
        7,
        "thread/goal/clear",
        { threadId: "thread-1" },
      ),
    );
    await waitFor(() =>
      expect(
        mocks.codexRpcMock.mock.calls.some(([, method]) => method === "turn/start"),
      ).toBe(true),
    );
    const methods = mocks.codexRpcMock.mock.calls.map(([, method]) => method);
    expect(methods.indexOf("thread/resume")).toBeLessThan(
      methods.indexOf("thread/goal/clear"),
    );
    expect(methods.indexOf("thread/goal/clear")).toBeLessThan(
      methods.indexOf("turn/start"),
    );
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
    mocks.listCodexModelsMock.mockResolvedValue([defaultCodexModel]);
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
    expect(screen.getByRole("combobox", { name: "Run account" })).toBeEnabled();
    expect(screen.getByRole("combobox", { name: "Agent" })).toBeDisabled();
    await user.click(implement);
    const implementationDialog = await screen.findByRole("dialog", {
      name: "Confirm implementation settings",
    });
    expect(
      within(implementationDialog).queryByText("Plan implementation"),
    ).not.toBeInTheDocument();
    expect(
      within(implementationDialog).getByRole("combobox", {
        name: "Implementation account",
      }),
    ).toHaveTextContent("dev@example.com");
    expect(
      within(implementationDialog).getByRole("combobox", {
        name: "Implementation model",
      }),
    ).toHaveTextContent("GPT-5.5");
    await user.click(
      within(implementationDialog).getByRole("button", {
        name: "Implement plan",
      }),
    );

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

  it("confirms captured Plan settings and applies changes only to implementation", async () => {
    prepareSignedInRun();
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
    const equivalentTargetModel = {
      ...defaultCodexModel,
      id: "target-gpt-5.5",
      displayName: "GPT-5.5 Target",
      isDefault: true,
    };
    const implementationModel = {
      ...defaultCodexModel,
      id: "o4-implementation",
      model: "o4-implementation",
      displayName: "O4 Implementation",
      supportedReasoningEfforts: [
        { reasoningEffort: "low", description: "Faster reasoning" },
        { reasoningEffort: "high", description: "Deeper reasoning" },
      ],
      defaultReasoningEffort: "high",
      isDefault: false,
    };
    mocks.listCodexModelsMock.mockImplementation(async (accountId: number) =>
      accountId === signedInAccount2.id
        ? [equivalentTargetModel, implementationModel]
        : [defaultCodexModel],
    );
    const planChat = workspaceChatFixture({
      id: 430,
      title: "Implement configurable plan",
      codex_thread_id: "thread-plan-account-7",
    });
    const planRun = workspaceRunFixture({
      id: 330,
      chat_id: planChat.id,
      codex_thread_id: "thread-plan-account-7",
      collaboration_mode: "plan",
      run_intent: "plan",
      original_prompt: "Plan the configurable implementation",
      final_message: "",
      completed_plan_item_id: "plan-settings-item",
      completed_plan_text: "# Plan\n\nImplement the selected approach.",
      plan_review_state: "available",
      execution_settings_json: JSON.stringify({
        version: 1,
        accountId: signedInAccount.id,
        profileKey: "account:7",
        selectedBranch: "main",
        mode: "plan",
        intent: "plan",
        accessMode: "ask-for-approval",
        computerUseEnabled: true,
        model: defaultCodexModel.model,
        reasoningEffort: "medium",
        useOss: false,
        ossProvider: "ollama",
        contextFiles: [],
        selectedSkills: [],
        goalMode: false,
      }),
    });
    mocks.listWorkspaceChatsMock.mockResolvedValue([planChat]);
    mocks.getChatWithRunsMock.mockResolvedValue(
      workspaceChatWithRunsFixture(planChat, [planRun]),
    );
    mocks.codexRpcMock.mockImplementation(
      async (accountId: number, method: string) => {
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
          expect(accountId).toBe(signedInAccount2.id);
          return { thread: { id: "thread-plan-account-8" } };
        }
        if (method === "turn/start") {
          expect(accountId).toBe(signedInAccount2.id);
          return { turn: { id: "turn-plan-account-8" } };
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
      within(drawer).getByRole("button", {
        name: /implement configurable plan/i,
      }),
    );

    await user.click(screen.getByRole("combobox", { name: "Run account" }));
    await user.click(
      screen.getByRole("option", { name: "personal@example.com" }),
    );
    const handoffDialog = await screen.findByRole("dialog", {
      name: "Switch account for this chat?",
    });
    await user.click(
      within(handoffDialog).getByRole("button", { name: "Switch account" }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("combobox", { name: "Run account" }),
      ).toHaveTextContent("personal@example.com"),
    );

    await user.click(
      await screen.findByRole("button", { name: "Implement plan" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Confirm implementation settings",
    });
    expect(
      within(dialog).getByRole("combobox", {
        name: "Implementation account",
      }),
    ).toHaveTextContent("dev@example.com");
    expect(
      within(dialog).getByRole("combobox", {
        name: "Implementation model",
      }),
    ).toHaveTextContent("GPT-5.5");
    expect(
      within(dialog).getByRole("combobox", {
        name: "Implementation reasoning",
      }),
    ).toHaveTextContent("Medium");

    await user.click(
      within(dialog).getByRole("combobox", {
        name: "Implementation account",
      }),
    );
    await user.click(
      screen.getByRole("option", { name: "personal@example.com" }),
    );
    await waitFor(() =>
      expect(
        within(dialog).getByRole("combobox", {
          name: "Implementation model",
        }),
      ).toHaveTextContent("GPT-5.5 Target"),
    );
    expect(mocks.readCodexAccountMock).toHaveBeenCalledWith(
      signedInAccount2.id,
      { refreshToken: true },
    );

    await user.click(
      within(dialog).getByRole("combobox", {
        name: "Implementation model",
      }),
    );
    await user.click(
      screen.getByRole("option", { name: "O4 Implementation" }),
    );
    expect(
      within(dialog).getByRole("combobox", {
        name: "Implementation reasoning",
      }),
    ).toHaveTextContent("High");
    await user.click(
      within(dialog).getByRole("combobox", {
        name: "Implementation reasoning",
      }),
    );
    await user.click(screen.getByRole("option", { name: "Low" }));
    await user.click(
      within(dialog).getByRole("button", { name: "Implement plan" }),
    );

    await waitFor(() =>
      expect(mocks.codexRpcMock).toHaveBeenCalledWith(
        signedInAccount2.id,
        "turn/start",
        expect.objectContaining({
          threadId: "thread-plan-account-8",
          model: "o4-implementation",
          effort: "low",
        }),
      ),
    );
    expect(mocks.activateChatAccountHandoffMock).toHaveBeenCalledWith({
      chatId: planChat.id,
      expectedProfileKey: "account:7",
      expectedThreadId: "thread-plan-account-7",
      accountId: signedInAccount2.id,
      profileKey: "account:8",
      codexThreadId: "thread-plan-account-8",
      status: "running",
    });
    expect(screen.getByRole("combobox", { name: "Agent" })).toHaveTextContent(
      "GPT-5.5",
    );
    expect(
      screen.getByRole("combobox", { name: "Reasoning" }),
    ).toHaveTextContent("Medium");
    expect(mocks.createRunMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        accountId: signedInAccount2.id,
        model: "o4-implementation",
        executionSettingsJson: expect.stringContaining(
          '"reasoningEffort":"low"',
        ),
      }),
    );
  });

  it("cancels Plan implementation settings while models load and ignores stale results", async () => {
    prepareSignedInRun();
    let resolveImplementationModels!: (models: typeof defaultCodexModel[]) => void;
    mocks.listCodexModelsMock
      .mockResolvedValueOnce([defaultCodexModel])
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveImplementationModels = resolve;
          }),
      );
    const planChat = workspaceChatFixture({
      id: 431,
      title: "Cancel implementation settings",
      codex_thread_id: "thread-plan-cancel",
    });
    const planRun = workspaceRunFixture({
      id: 331,
      chat_id: planChat.id,
      codex_thread_id: "thread-plan-cancel",
      collaboration_mode: "plan",
      run_intent: "plan",
      original_prompt: "Plan a cancellable implementation",
      final_message: "",
      completed_plan_item_id: "plan-cancel-item",
      completed_plan_text: "# Plan\n\nKeep the review state available.",
      plan_review_state: "available",
    });
    mocks.listWorkspaceChatsMock.mockResolvedValue([planChat]);
    mocks.getChatWithRunsMock.mockResolvedValue(
      workspaceChatWithRunsFixture(planChat, [planRun]),
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
      within(drawer).getByRole("button", {
        name: /cancel implementation settings/i,
      }),
    );

    const implement = await screen.findByRole("button", {
      name: "Implement plan",
    });
    await user.click(implement);
    const dialog = await screen.findByRole("dialog", {
      name: "Confirm implementation settings",
    });
    const cancel = within(dialog).getByRole("button", {
      name: "Cancel implementation",
    });
    expect(cancel).toBeEnabled();
    await waitFor(() => expect(cancel).toHaveFocus());
    await user.tab();
    expect(cancel).toHaveFocus();
    await user.click(cancel);
    expect(
      screen.queryByRole("dialog", {
        name: "Confirm implementation settings",
      }),
    ).not.toBeInTheDocument();

    await act(async () => {
      resolveImplementationModels([defaultCodexModel]);
      await Promise.resolve();
    });
    expect(
      screen.queryByRole("dialog", {
        name: "Confirm implementation settings",
      }),
    ).not.toBeInTheDocument();
    await waitFor(() => expect(implement).toHaveFocus());
    expect(mocks.codexRpcMock).not.toHaveBeenCalledWith(
      7,
      "turn/start",
      expect.any(Object),
    );
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

  it("fails and pauses a queued Plan when native Plan presets are unavailable", async () => {
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
      expect(mocks.failPromptQueueItemMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringMatching(/Plan/i),
      ),
    );
    expect(screen.getByLabelText("Prompt")).toHaveValue("");
    expect(screen.queryByText("Queue paused")).not.toBeInTheDocument();
    expect(screen.getByText("Queued")).toBeInTheDocument();
    expect(mocks.createChatMock).toHaveBeenCalledTimes(1);
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
    expect(mocks.codexRpcMock).not.toHaveBeenCalledWith(
      7,
      "thread/resume",
      expect.anything(),
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
      () => {
        expect(mocks.listWorkspaceGitStatusMock.mock.calls.length).toBeGreaterThanOrEqual(
          2,
        );
        expect(
          within(workspaceNav).getByLabelText("modified file"),
        ).toHaveTextContent("M");
      },
      { timeout: 4500 },
    );
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
        workspace.path,
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

  it("shows binary files and complete large text previews", async () => {
    const binaryEntry = {
      name: "image.png",
      path: "/repo/orchestrator/image.png",
      relativePath: "image.png",
      kind: "file" as const,
    };
    const largeEntry = {
      name: "large.txt",
      path: "/repo/orchestrator/large.txt",
      relativePath: "large.txt",
      kind: "file" as const,
    };
    const largeContent = Array.from(
      { length: 10_001 },
      (_, index) => `complete line ${index + 1}`,
    ).join("\n");
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
          content: largeContent,
          truncated: false,
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

    await user.click(within(workspaceNav).getByRole("button", { name: "large.txt" }));

    const preview = await screen.findByLabelText("Highlighted file preview");
    expect(screen.queryByText("Preview truncated to 512 KB.")).not.toBeInTheDocument();
    expect(screen.queryByText("Truncated")).not.toBeInTheDocument();
    expect(preview.closest(".code-preview")).toHaveAttribute("data-line-count", "10001");
    expect(preview.closest(".code-preview")).toHaveAttribute(
      "data-line-number-digits",
      "5",
    );
    expect(preview).toHaveTextContent("complete line 1");
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
    const composer = composerInputZone();
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

  it("accepts native Finder drops only inside the input and restores prompt focus", async () => {
    const { user } = await renderApp();
    const zone = composerInputZone();
    const composer = screen.getByLabelText("Task composer");
    const prompt = screen.getByLabelText("Prompt") as HTMLTextAreaElement;
    mockElementRect(zone, {
      left: 100,
      right: 700,
      top: 200,
      bottom: 500,
      width: 600,
      height: 300,
    });
    await user.type(prompt, "Draft prompt");
    prompt.setSelectionRange(2, 7, "forward");

    await emitNativeContextFileDrop({
      type: "drop",
      paths: ["/Users/example/Desktop/outside.txt"],
      clientX: 20,
      clientY: 20,
    });
    expect(mocks.inspectDroppedContextPathsMock).not.toHaveBeenCalled();

    await emitNativeContextFileDrop({
      type: "enter",
      paths: ["/Users/example/Desktop/reference.png"],
      clientX: 400,
      clientY: 300,
    });
    expect(composer).toHaveClass("drop-target-active");

    await emitNativeContextFileDrop({
      type: "drop",
      paths: ["/Users/example/Desktop/reference.png"],
      clientX: 400,
      clientY: 300,
    });

    await waitFor(() =>
      expect(mocks.inspectDroppedContextPathsMock).toHaveBeenCalledWith([
        "/Users/example/Desktop/reference.png",
      ]),
    );
    const contextList = await screen.findByLabelText("Selected context files");
    expect(within(contextList).getByTitle("/Users/example/Desktop/reference.png"))
      .toBeInTheDocument();
    await waitFor(() => expect(prompt).toHaveFocus());
    expect(prompt.selectionStart).toBe(2);
    expect(prompt.selectionEnd).toBe(7);
    expect(composer).not.toHaveClass("drop-target-active");
  });

  it("deduplicates native and HTML drops by canonical path", async () => {
    await renderApp();
    const zone = composerInputZone();
    mockElementRect(zone, {
      left: 100,
      right: 700,
      top: 200,
      bottom: 500,
      width: 600,
      height: 300,
    });
    fireEvent.drop(zone, {
      dataTransfer: createContextFileDataTransfer([
        {
          path: "/Users/example/Desktop/notes.txt",
          name: "notes.txt",
          source: "explorer",
          status: "ready",
        },
      ]),
    });
    mocks.inspectDroppedContextPathsMock.mockResolvedValueOnce({
      files: [
        {
          path: "/Users/example/Desktop/notes-link.txt",
          canonicalPath: "/Users/example/Desktop/notes.txt",
          name: "notes-link.txt",
        },
      ],
      rejected: [],
    });

    await emitNativeContextFileDrop({
      type: "drop",
      paths: ["/Users/example/Desktop/notes-link.txt"],
      clientX: 400,
      clientY: 300,
    });

    await waitFor(() =>
      expect(mocks.inspectDroppedContextPathsMock).toHaveBeenCalledWith([
        "/Users/example/Desktop/notes-link.txt",
      ]),
    );
    const contextList = screen.getByLabelText("Selected context files");
    expect(within(contextList).getAllByText("notes.txt")).toHaveLength(1);
    expect(within(contextList).queryByText("notes-link.txt")).not.toBeInTheDocument();
  });

  it("routes an inspected native drop back to its originating workspace", async () => {
    const mobileWorkspace = {
      ...workspace,
      id: 2,
      path: "/repo/mobile-client",
      label: "mobile-client",
    };
    mocks.listWorkspacesMock.mockResolvedValue([workspace, mobileWorkspace]);
    let resolveInspection!: (value: {
      files: Array<{
        path: string;
        canonicalPath: string;
        name: string;
      }>;
      rejected: [];
    }) => void;
    mocks.inspectDroppedContextPathsMock.mockReturnValue(
      new Promise((resolve) => {
        resolveInspection = resolve;
      }),
    );

    const { user } = await renderApp();
    const zone = composerInputZone();
    mockElementRect(zone, {
      left: 100,
      right: 700,
      top: 200,
      bottom: 500,
      width: 600,
      height: 300,
    });
    await emitNativeContextFileDrop({
      type: "drop",
      paths: ["/Users/example/Desktop/notes.txt"],
      clientX: 400,
      clientY: 300,
    });
    await waitFor(() =>
      expect(mocks.inspectDroppedContextPathsMock).toHaveBeenCalledOnce(),
    );

    const workspaceNav = screen.getByRole("navigation", { name: "Workspaces" });
    await user.click(
      within(workspaceNav).getByRole("button", { name: "mobile-client" }),
    );
    await act(async () => {
      resolveInspection({
        files: [
          {
            path: "/Users/example/Desktop/notes.txt",
            canonicalPath: "/Users/example/Desktop/notes.txt",
            name: "notes.txt",
          },
        ],
        rejected: [],
      });
      await Promise.resolve();
    });
    expect(screen.queryByLabelText("Selected context files")).not.toBeInTheDocument();

    await user.click(
      within(workspaceNav).getByRole("button", { name: "orchestrator" }),
    );
    expect(
      within(await screen.findByLabelText("Selected context files")).getByText(
        "notes.txt",
      ),
    ).toBeInTheDocument();
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
    expect(
      submittedImages.querySelector(".submitted-image-preparing-spinner"),
    ).toBeNull();
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

  it("retains images in a failed queue item when preparation fails before turn start", async () => {
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
      expect(mocks.failPromptQueueItemMock).toHaveBeenCalledWith(
        expect.any(String),
        "Unable to prepare broken.png: Selected image could not be decoded",
      ),
    );
    expect(screen.getByLabelText("Prompt")).toHaveValue("");
    expect(screen.queryByText("Queue paused")).not.toBeInTheDocument();
    expect(screen.getByText("Queued")).toBeInTheDocument();
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
    mockElementRect(composerInputZone());
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
    mockElementRect(composerInputZone());

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

  it("recovers an active native sign-in after the webview reloads", async () => {
    const signingInAccount = { ...pendingAccount, id: 8 };
    mocks.listCodexAccountsMock.mockResolvedValue([signingInAccount]);
    mocks.readActiveCodexLoginMock.mockResolvedValue({
      accountId: 8,
      loginId: "login-recovered",
      authUrl: "https://example.com/recovered-auth",
      connectionGeneration: 4,
      startedAtMs: Date.now(),
      expiresAtMs: Date.now() + 600_000,
      state: "waiting",
    });

    const { user } = await renderApp();

    expect(await screen.findByText("Waiting for browser sign-in")).toBeInTheDocument();
    expect(mocks.startCodexLoginMock).not.toHaveBeenCalled();
    expect(mocks.openUrlMock).toHaveBeenCalledWith(
      "https://example.com/recovered-auth",
    );
    await user.click(screen.getByRole("button", { name: "Settings" }));
    expect(await screen.findByText(/Signing in/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancel sign-in" }));

    expect(mocks.cancelCodexLoginMock).toHaveBeenCalledWith(
      8,
      "login-recovered",
    );
    expect(mocks.deleteCodexProfileMock).toHaveBeenCalledWith(8);
  });

  it("recovers a login id that arrives after the webview reloads", async () => {
    const now = Date.now();
    const startingLogin = {
      accountId: 8,
      loginId: null,
      authUrl: null,
      connectionGeneration: 4,
      startedAtMs: now,
      expiresAtMs: now + 600_000,
      state: "starting" as const,
    };
    mocks.listCodexAccountsMock.mockResolvedValue([
      { ...pendingAccount, id: 8 },
    ]);
    mocks.readActiveCodexLoginMock
      .mockResolvedValueOnce(startingLogin)
      .mockResolvedValue({
        ...startingLogin,
        loginId: "login-after-reload",
        authUrl: "https://example.com/after-reload",
        state: "waiting",
      });

    await renderApp();

    expect(await screen.findByText("Waiting for browser sign-in")).toBeInTheDocument();
    expect(mocks.startCodexLoginMock).not.toHaveBeenCalled();
    expect(mocks.openUrlMock).toHaveBeenCalledWith(
      "https://example.com/after-reload",
    );
  });

  it("reconciles a stranded active-login error during startup", async () => {
    mocks.listCodexAccountsMock.mockResolvedValue([
      {
        ...pendingAccount,
        id: 11,
        status: "error",
        last_error: "Another Codex sign-in is already active for account 10",
      },
    ]);

    await renderApp();

    await waitFor(() =>
      expect(mocks.updateCodexAccountMock).toHaveBeenCalledWith(11, {
        status: "signed_out",
        lastError: null,
      }),
    );
  });

  it("adds another account while the selected account has an active turn", async () => {
    prepareSignedInRun();
    mocks.createCodexAccountMock.mockResolvedValue({
      ...pendingAccount,
      id: 8,
    });
    const { user } = await renderApp();
    await startMockRun(user, "Keep working in this account");

    await user.click(await screen.findByLabelText("Codex account"));
    const addAccount = screen.getByRole("button", { name: "Add account" });
    expect(addAccount).toBeEnabled();
    await user.click(addAccount);

    await waitFor(() => expect(mocks.startCodexLoginMock).toHaveBeenCalledWith(8));
    expect(mocks.codexRpcMock).not.toHaveBeenCalledWith(
      7,
      "turn/interrupt",
      expect.anything(),
    );
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

  it("resolves a correlated native Playwright tool approval without exposing sensitive parameters", async () => {
    prepareSignedInRun();

    const { user } = await renderApp();
    await startMockRun(user, "Open the local app in a browser");

    await emitCodexNotification({
      method: "item/started",
      params: {
        threadId: "thread-1",
        turnId: "turn-1",
        item: {
          type: "mcpToolCall",
          id: "browser-call-1",
          server: "playwright",
          tool: "browser_tabs",
          status: "inProgress",
          arguments: {
            action: "new",
            url: "http://127.0.0.1:3001/?token=secret",
            text: "private input",
          },
        },
      },
    });
    await emitCodexServerRequest({
      id: 78,
      method: "mcpServer/elicitation/request",
      params: {
        threadId: "thread-1",
        turnId: "turn-1",
        serverName: "playwright",
        mode: "form",
        message: 'Allow the playwright MCP server to run tool "browser_tabs"?',
        requestedSchema: { type: "object", properties: {} },
        _meta: {
          codex_approval_kind: "mcp_tool_call",
          persist: ["session", "always"],
          tool_description: "List, create, close, or select a browser tab.",
          tool_params: {
            text: "private input",
            url: "http://127.0.0.1:3001/?token=secret",
            action: "new",
          },
          tool_params_display: [
            { display_name: "Action", name: "action", value: "new" },
            {
              display_name: "URL",
              name: "url",
              value: "http://127.0.0.1:3001/?token=secret",
            },
            {
              display_name: "Text",
              name: "text",
              value: "private input",
            },
          ],
        },
      },
    });

    expect(
      await screen.findByText("Codex needs approval to use the browser"),
    ).toBeInTheDocument();
    expect(screen.getByText("Browser Tabs")).toBeInTheDocument();
    expect(
      screen.getByText("List, create, close, or select a browser tab."),
    ).toBeInTheDocument();
    expect(screen.getByText("http://127.0.0.1:3001/")).toBeInTheDocument();
    expect(screen.queryByText("private input")).not.toBeInTheDocument();
    expect(screen.queryByText(/token=secret/u)).not.toBeInTheDocument();
    expect(
      screen.queryByText("Unsupported native Codex request"),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Allow once" }));
    expect(mocks.resolveCodexServerRequestMock).toHaveBeenCalledWith(
      7,
      78,
      expect.any(String),
      {
        action: "accept",
        content: {},
        _meta: null,
      },
    );

    await emitCodexNotification({
      method: "serverRequest/resolved",
      params: {
        threadId: "thread-1",
        turnId: "turn-1",
        requestId: 78,
      },
    });
    await emitCodexNotification({
      method: "item/completed",
      params: {
        threadId: "thread-1",
        turnId: "turn-1",
        item: {
          type: "mcpToolCall",
          id: "browser-call-1",
          server: "playwright",
          tool: "browser_tabs",
          status: "completed",
          arguments: {
            action: "new",
            url: "http://127.0.0.1:3001/?token=secret",
            text: "private input",
          },
        },
      },
    });
    await emitCodexServerRequest({
      id: 79,
      method: "mcpServer/elicitation/request",
      params: {
        threadId: "thread-1",
        turnId: "turn-1",
        serverName: "playwright",
        mode: "form",
        requestedSchema: { type: "object", properties: {} },
        _meta: {
          codex_approval_kind: "mcp_tool_call",
          tool_description: "List, create, close, or select a browser tab.",
          tool_params: {
            action: "new",
            url: "http://127.0.0.1:3001/?token=secret",
            text: "private input",
          },
          tool_params_display: [],
        },
      },
    });
    expect(
      await screen.findByText("Unsupported native Codex request"),
    ).toBeInTheDocument();
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

    expect(mocks.recoverAbandonedRunsMock).toHaveBeenCalledTimes(1);
    expect(
      mocks.recoverInterruptedChatTitleGenerationsMock,
    ).toHaveBeenCalledTimes(1);
    expect(
      mocks.recoverAbandonedRunsMock.mock.invocationCallOrder[0],
    ).toBeLessThan(mocks.listWorkspacesMock.mock.invocationCallOrder[0] ?? 0);
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
    expect(screen.getByRole("combobox", { name: "Access" })).toBeEnabled();

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

  it("hands an idle chat to another account on a fresh thread", async () => {
    prepareSignedInRun();
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
    mocks.listCodexModelsMock.mockResolvedValue([defaultCodexModel]);
    const historicalChat = workspaceChatFixture({
      id: 451,
      title: "Build Snake controls",
      codex_thread_id: "thread-account-7",
      turn_count: 2,
    });
    const historicalRuns = [
      workspaceRunFixture({
        id: 351,
        chat_id: historicalChat.id,
        turn_index: 1,
        original_prompt: "Build responsive Snake controls",
        final_message: "Prepared a focused implementation plan.",
        completed_plan_text: "# Plan\n\nAdd keyboard and touch controls.",
        plan_review_state: "approved",
        run_intent: "plan",
      }),
      workspaceRunFixture({
        id: 352,
        chat_id: historicalChat.id,
        turn_index: 2,
        original_prompt: "Implement the plan.",
        final_message: "Implemented the control system.",
        run_intent: "plan-implementation",
      }),
    ];
    mocks.listWorkspaceChatsMock.mockResolvedValue([historicalChat]);
    mocks.getChatWithRunsMock.mockResolvedValue(
      workspaceChatWithRunsFixture(historicalChat, historicalRuns),
    );
    mocks.codexRpcMock.mockImplementation(
      async (accountId: number, method: string) => {
        if (method === "thread/start") {
          expect(accountId).toBe(8);
          return { thread: { id: "thread-account-8" } };
        }
        if (method === "turn/start") {
          expect(accountId).toBe(8);
          return { turn: { id: "turn-account-8" } };
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
      within(drawer).getByRole("button", { name: /build snake controls/i }),
    );
    await screen.findByText("Build responsive Snake controls");

    await user.click(screen.getByRole("combobox", { name: "Run account" }));
    await user.click(
      screen.getByRole("option", { name: "personal@example.com" }),
    );
    const handoffDialog = await screen.findByRole("dialog", {
      name: "Switch account for this chat?",
    });
    expect(handoffDialog).toHaveTextContent(/fresh Codex thread/i);
    await user.click(
      within(handoffDialog).getByRole("button", { name: "Switch account" }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("combobox", { name: "Run account" }),
      ).toHaveTextContent("personal@example.com"),
    );

    await user.type(screen.getByLabelText("Prompt"), "Polish gamepad input");
    await user.keyboard("{Enter}");

    await waitFor(() =>
      expect(mocks.activateChatAccountHandoffMock).toHaveBeenCalledWith({
        chatId: 451,
        expectedProfileKey: "account:7",
        expectedThreadId: "thread-account-7",
        accountId: 8,
        profileKey: "account:8",
        codexThreadId: "thread-account-8",
        status: "running",
      }),
    );
    expect(mocks.codexRpcMock).toHaveBeenCalledWith(
      8,
      "thread/start",
      expect.any(Object),
    );
    expect(mocks.codexRpcMock).not.toHaveBeenCalledWith(
      8,
      "thread/resume",
      expect.objectContaining({ threadId: "thread-account-7" }),
    );
    const handoffTurn = mocks.codexRpcMock.mock.calls.find(
      (call) =>
        call[0] === 8 &&
        call[1] === "turn/start" &&
        (call[2] as { threadId?: string })?.threadId === "thread-account-8",
    );
    const handoffContext = (
      handoffTurn?.[2] as {
        additionalContext?: Record<string, { value?: string }>;
      }
    )?.additionalContext?.["chat:previous-turns"]?.value;
    expect(handoffContext).toContain("Build responsive Snake controls");
    expect(handoffContext).toContain("Add keyboard and touch controls");
    expect(handoffContext).toContain("Implemented the control system");
    expect(handoffContext).not.toContain("User: Implement the plan.");
  });

  it("fails the queued handoff without changing the current chat owner", async () => {
    prepareSignedInRun();
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
    mocks.listCodexModelsMock.mockResolvedValue([defaultCodexModel]);
    mocks.activateChatAccountHandoffMock.mockResolvedValue(false);
    const historicalChat = workspaceChatFixture({
      id: 452,
      title: "Keep original ownership",
      codex_thread_id: "thread-account-7",
    });
    const historicalRun = workspaceRunFixture({
      id: 353,
      chat_id: historicalChat.id,
      turn_index: 1,
      original_prompt: "Create the initial implementation",
      final_message: "Created the initial implementation.",
    });
    mocks.listWorkspaceChatsMock.mockResolvedValue([historicalChat]);
    mocks.getChatWithRunsMock.mockResolvedValue(
      workspaceChatWithRunsFixture(historicalChat, [historicalRun]),
    );
    mocks.codexRpcMock.mockImplementation(
      async (accountId: number, method: string) => {
        if (method === "thread/start") {
          expect(accountId).toBe(8);
          return { thread: { id: "thread-account-8" } };
        }
        if (method === "turn/start") {
          return { turn: { id: "turn-account-8" } };
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
      within(drawer).getByRole("button", {
        name: /keep original ownership/i,
      }),
    );
    await screen.findByText("Create the initial implementation");

    await user.click(screen.getByRole("combobox", { name: "Run account" }));
    await user.click(
      screen.getByRole("option", { name: "personal@example.com" }),
    );
    const handoffDialog = await screen.findByRole("dialog", {
      name: "Switch account for this chat?",
    });
    await user.click(
      within(handoffDialog).getByRole("button", { name: "Switch account" }),
    );

    const prompt = screen.getByLabelText("Prompt");
    await user.type(prompt, "Retry this handoff");
    await user.keyboard("{Enter}");

    await waitFor(() =>
      expect(mocks.codexRpcMock).toHaveBeenCalledWith(
        8,
        "turn/interrupt",
        {
          threadId: "thread-account-8",
          turnId: "turn-account-8",
        },
      ),
    );
    expect(prompt).toHaveValue("");
    expect(screen.queryByText("Queue paused")).not.toBeInTheDocument();
    expect(screen.getByText("Queued")).toBeInTheDocument();
    expect(mocks.failPromptQueueItemMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringMatching(/persist|ownership|activate/i),
    );
    expect(mocks.updateChatMock).not.toHaveBeenCalledWith(
      452,
      expect.objectContaining({ status: "failed" }),
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
        version: 2,
        accountId: 7,
        profileKey: "account:7",
        selectedRepositoryPath: workspace.path,
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
    await emitCodexNotification({
      method: "thread/goal/updated",
      params: {
        threadId: "thread-1",
        goal: {
          threadId: "thread-1",
          objective: "Fix docs /docs",
          status: "complete",
          timeUsedSeconds: 1,
        },
      },
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
    ).toEqual({
      ...persistedSettings,
      version: 2,
      selectedRepositoryPath: workspace.path,
    });
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
    mocks.listCodexModelsMock.mockResolvedValue([unavailableModel]);

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
    expect(mocks.createChatMock).toHaveBeenCalledTimes(1);
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
      expect(
        mocks.codexRpcMock.mock.calls.some(([, method]) =>
          ["thread/start", "turn/start"].includes(method),
        ),
      ).toBe(false);

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

      expect(screen.getByLabelText("Prompt")).toHaveValue("");
      expect(
        within(screen.getByLabelText("Run summary")).getByText("Stopped by user."),
      ).toBeInTheDocument();
      expect(screen.queryByText("Queue paused")).not.toBeInTheDocument();
      expect(screen.getByText("Queued")).toBeInTheDocument();
      expect(mocks.stopCodexMock).not.toHaveBeenCalled();
      expect(mocks.runPreflightMock).not.toHaveBeenCalled();
      expect(mocks.createTaskMock).not.toHaveBeenCalled();
      expect(mocks.createRunMock).not.toHaveBeenCalled();
      expect(
        mocks.codexRpcMock.mock.calls.some(([, method]) =>
          ["thread/start", "turn/start"].includes(method),
        ),
      ).toBe(false);

      await animationFrames.flush();
      expect(mocks.runPreflightMock).not.toHaveBeenCalled();
      expect(mocks.createTaskMock).not.toHaveBeenCalled();
      expect(
        mocks.codexRpcMock.mock.calls.some(([, method]) =>
          ["thread/start", "turn/start"].includes(method),
        ),
      ).toBe(false);
    } finally {
      animationFrames.restore();
    }
  });

  it("marks the queued item failed when setup fails before a run is created", async () => {
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
    expect(screen.getByLabelText("Prompt")).toHaveValue("");
    expect(screen.queryByText("Queue paused")).not.toBeInTheDocument();
    expect(screen.getByText("Queued")).toBeInTheDocument();
    expect(mocks.failPromptQueueItemMock).toHaveBeenCalledWith(
      expect.any(String),
      "Preflight failed",
    );
    expect(mocks.createTaskMock).not.toHaveBeenCalled();
    expect(mocks.createRunMock).not.toHaveBeenCalled();
    expect(
      mocks.codexRpcMock.mock.calls.some(([, method]) =>
        ["thread/start", "turn/start"].includes(method),
      ),
    ).toBe(false);
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

  it("serializes distinct single-Enter queue submissions while a prior enqueue is pending", async () => {
    prepareSignedInRun();

    const { user } = await renderApp();
    await startMockRun(user, "Start the active task");

    let firstEnqueueInput: any;
    let resolveFirstEnqueue!: (item: PromptQueueItem) => void;
    mocks.enqueuePromptQueueItemMock.mockImplementationOnce(
      (input) =>
        new Promise<PromptQueueItem>((resolve) => {
          firstEnqueueInput = input;
          resolveFirstEnqueue = resolve;
        }),
    );

    const promptInput = screen.getByLabelText("Prompt");
    await user.type(promptInput, "Queue the first follow-up");
    await user.keyboard("{Enter}");
    await waitFor(() =>
      expect(mocks.enqueuePromptQueueItemMock).toHaveBeenCalledTimes(1),
    );

    await user.clear(promptInput);
    await user.type(promptInput, "Queue the second follow-up");
    await user.keyboard("{Enter}");
    expect(mocks.enqueuePromptQueueItemMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      const firstItem = promptQueueItemFixture(firstEnqueueInput);
      mocks.promptQueueItems.set(firstItem.id, firstItem);
      resolveFirstEnqueue(firstItem);
      await Promise.resolve();
    });

    await waitFor(() =>
      expect(mocks.enqueuePromptQueueItemMock).toHaveBeenCalledTimes(2),
    );
    expect(
      mocks.enqueuePromptQueueItemMock.mock.calls.map(([input]) => input.prompt),
    ).toEqual([
      "Queue the first follow-up",
      "Queue the second follow-up",
    ]);
    await waitFor(() => expect(promptInput).toHaveValue(""));

    await user.click(screen.getByRole("button", { name: /^Queue/ }));
    expect(screen.getByText("Queue the first follow-up")).toBeInTheDocument();
    expect(screen.getByText("Queue the second follow-up")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /stop codex/i }));
  });

  it("edits a queued prompt in the composer without changing its queue position", async () => {
    prepareSignedInRun();
    const queuedCodexModel = {
      ...defaultCodexModel,
      id: "gpt-5.5-max",
      model: "gpt-5.5-max",
      displayName: "GPT-5.5 Max",
      supportedReasoningEfforts: [
        {
          reasoningEffort: "high",
          description: "Deeper reasoning",
        },
      ],
      defaultReasoningEffort: "high",
      isDefault: false,
    };
    mocks.listCodexModelsMock.mockResolvedValue([
      defaultCodexModel,
      queuedCodexModel,
    ]);

    const { user } = await renderApp();
    await startMockRun(user, "Start the active task");

    const promptInput = screen.getByLabelText("Prompt");
    await user.click(screen.getByRole("button", { name: "Plan mode" }));
    await user.click(screen.getByRole("combobox", { name: "Agent" }));
    await user.click(
      screen.getByRole("option", { name: queuedCodexModel.displayName }),
    );
    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: "Reasoning" })).toHaveTextContent(
        "High",
      ),
    );
    await user.type(promptInput, "Original queued follow-up");
    await user.keyboard("{Enter}");
    await waitFor(() =>
      expect(mocks.enqueuePromptQueueItemMock).toHaveBeenCalledTimes(1),
    );
    await waitFor(() => expect(promptInput).toHaveValue(""));
    const queuedItemId =
      mocks.enqueuePromptQueueItemMock.mock.calls[0][0].id;
    const originalQueuePosition =
      mocks.promptQueueItems.get(queuedItemId)?.position;

    await user.click(screen.getByRole("combobox", { name: "Agent" }));
    await user.click(
      screen.getByRole("option", { name: defaultCodexModel.displayName }),
    );
    await user.click(screen.getByRole("combobox", { name: "Reasoning" }));
    await user.click(screen.getByRole("option", { name: "Medium" }));
    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: "Reasoning" })).toHaveTextContent(
        "Medium",
      ),
    );
    await user.type(promptInput, "Keep this unrelated draft");
    await user.click(screen.getByRole("button", { name: /^Queue/ }));
    const originalQueuedActions = screen.getByRole("toolbar", {
      name: /Actions for queued prompt: Original queued follow-up/i,
    });
    await user.click(
      within(originalQueuedActions).getByRole("button", {
        name: "Edit queued prompt",
      }),
    );

    expect(
      screen.queryByRole("dialog", { name: /edit queued prompt/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Editing queued prompt")).not.toBeInTheDocument();
    expect(promptInput).toHaveValue("Original queued follow-up");
    expect(screen.getByRole("button", { name: "Plan mode" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Goal mode" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByRole("combobox", { name: "Agent" })).toHaveTextContent(
      queuedCodexModel.displayName,
    );
    expect(
      screen.getByRole("combobox", { name: "Reasoning" }),
    ).toHaveTextContent("High");
    await waitFor(() => expect(promptInput).toHaveFocus());

    await user.click(screen.getByRole("button", { name: "Goal mode" }));
    await user.click(screen.getByRole("combobox", { name: "Agent" }));
    await user.click(
      screen.getByRole("option", { name: defaultCodexModel.displayName }),
    );
    await user.click(screen.getByRole("combobox", { name: "Reasoning" }));
    await user.click(screen.getByRole("option", { name: "Medium" }));
    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: "Reasoning" })).toHaveTextContent(
        "Medium",
      ),
    );
    await user.clear(promptInput);
    await user.type(promptInput, "Refined queued follow-up");
    await user.keyboard("{Enter}");

    await waitFor(() =>
      expect(mocks.updatePromptQueueItemSnapshotMock).toHaveBeenCalledWith(
        queuedItemId,
        expect.objectContaining({
          prompt: "Refined queued follow-up",
          executionSettings: expect.objectContaining({
            mode: "run",
            intent: "normal",
            goalMode: true,
            model: defaultCodexModel.model,
            reasoningEffort: "medium",
          }),
        }),
      ),
    );
    expect(mocks.enqueuePromptQueueItemMock).toHaveBeenCalledTimes(1);
    expect(mocks.promptQueueItems.get(queuedItemId)).toEqual(
      expect.objectContaining({
        prompt: "Refined queued follow-up",
        position: originalQueuePosition,
      }),
    );
    await waitFor(() =>
      expect(promptInput).toHaveValue("Keep this unrelated draft"),
    );
    expect(screen.getByRole("button", { name: "Goal mode" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByRole("button", { name: "Plan mode" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByRole("combobox", { name: "Agent" })).toHaveTextContent(
      defaultCodexModel.displayName,
    );
    expect(
      screen.getByRole("combobox", { name: "Reasoning" }),
    ).toHaveTextContent("Medium");

    await user.click(screen.getByRole("button", { name: /^Queue/ }));
    const refinedQueuedActions = screen.getByRole("toolbar", {
      name: /Actions for queued prompt: Refined queued follow-up/i,
    });
    await user.click(
      within(refinedQueuedActions).getByRole("button", {
        name: "Edit queued prompt",
      }),
    );
    expect(screen.getByRole("button", { name: "Goal mode" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("combobox", { name: "Agent" })).toHaveTextContent(
      defaultCodexModel.displayName,
    );
    expect(
      screen.getByRole("combobox", { name: "Reasoning" }),
    ).toHaveTextContent("Medium");
    await user.click(screen.getByRole("button", { name: "Goal mode" }));
    expect(screen.getByRole("button", { name: "Goal mode" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByRole("button", { name: "Plan mode" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    await user.click(screen.getByRole("button", { name: "Plan mode" }));
    await user.click(screen.getByRole("combobox", { name: "Agent" }));
    await user.click(
      screen.getByRole("option", { name: queuedCodexModel.displayName }),
    );
    await user.clear(promptInput);
    await user.type(promptInput, "Do not save this edit");
    await user.keyboard("{Escape}");

    expect(mocks.updatePromptQueueItemSnapshotMock).toHaveBeenCalledTimes(1);
    expect(mocks.promptQueueItems.get(queuedItemId)?.prompt).toBe(
      "Refined queued follow-up",
    );
    expect(
      mocks.promptQueueItems.get(queuedItemId)?.snapshot.executionSettings,
    ).toEqual(
      expect.objectContaining({
        mode: "run",
        intent: "normal",
        goalMode: true,
        model: defaultCodexModel.model,
        reasoningEffort: "medium",
      }),
    );
    expect(promptInput).toHaveValue("Keep this unrelated draft");
    expect(screen.getByRole("button", { name: "Goal mode" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByRole("button", { name: "Plan mode" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByRole("combobox", { name: "Agent" })).toHaveTextContent(
      defaultCodexModel.displayName,
    );
    expect(
      screen.getByRole("combobox", { name: "Reasoning" }),
    ).toHaveTextContent("Medium");
  });

  it("steers a compatible queued normal prompt into the active turn", async () => {
    prepareSignedInRun();

    const { user } = await renderApp();
    await startMockRun(user, "Start the active task");

    await user.type(
      screen.getByLabelText("Prompt"),
      "Add this detail to the active task",
    );
    await user.click(
      screen.getByRole("button", { name: "Add prompt to queue" }),
    );

    await user.click(screen.getByRole("button", { name: /^Queue/ }));
    await user.click(
      screen.getByRole("button", { name: "Send queued prompt now" }),
    );

    await waitFor(() =>
      expect(mocks.codexRpcMock).toHaveBeenCalledWith(
        7,
        "turn/steer",
        expect.objectContaining({
          threadId: "thread-1",
          expectedTurnId: "turn-1",
          input: [
            {
              type: "text",
              text: "Add this detail to the active task",
              text_elements: [],
            },
          ],
        }),
      ),
    );
    expect(mocks.appendRunEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: 202,
        eventType: "client-action",
        method: "turn/steer",
      }),
    );
    expect(mocks.completePromptQueueItemMock).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("Task chat transcript")).toHaveTextContent(
      "Add this detail to the active task",
    );

    await user.click(screen.getByRole("button", { name: /stop codex/i }));
  });

  it("automatically uses current context when a queued prompt becomes stale", async () => {
    prepareSignedInRun();
    let inspectionCount = 0;
    mocks.inspectPromptQueueContextMock.mockImplementation(
      async (workspacePath: string, paths: string[]) => {
        inspectionCount += 1;
        const changed = inspectionCount > 1;
        return {
          workspacePath,
          repositories: [
            {
              repositoryPath: workspacePath,
              branch: "main",
              headCommit: changed
                ? "fedcba9876543210"
                : "0123456789abcdef",
              worktreeFingerprint: changed ? "modified" : "clean",
            },
          ],
          files: paths.map((path) => ({
            path,
            canonicalPath: path,
            size: 128,
            modifiedAtMs: 1_750_000_000_000,
            available: true,
          })),
        };
      },
    );

    const { user } = await renderApp();
    await user.type(
      screen.getByLabelText("Prompt"),
      "Run with whichever context is current",
    );
    await user.keyboard("{Enter}");

    await waitFor(() =>
      expect(
        mocks.updatePromptQueueItemContextFingerprintMock,
      ).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          contextFingerprint: expect.objectContaining({
            repositories: [
              expect.objectContaining({
                repositoryPath: workspace.path,
                headCommit: "fedcba9876543210",
                worktreeFingerprint: "modified",
              }),
            ],
          }),
        }),
      ),
    );
    expect(
      screen.queryByRole("dialog", { name: /review changed context/i }),
    ).not.toBeInTheDocument();
    expect(mocks.markPromptQueueItemStaleMock).not.toHaveBeenCalled();
    await waitFor(() => expect(mocks.runPreflightMock).toHaveBeenCalled());
  });

  it("automatically refreshes current context before steering a queued prompt", async () => {
    prepareSignedInRun();

    const { user } = await renderApp();
    await startMockRun(user, "Start the active task");
    await user.type(
      screen.getByLabelText("Prompt"),
      "Steer using the latest workspace state",
    );
    await user.click(
      screen.getByRole("button", { name: "Add prompt to queue" }),
    );

    mocks.inspectPromptQueueContextMock.mockImplementation(
      async (workspacePath: string, paths: string[]) => ({
        workspacePath,
        repositories: [
          {
            repositoryPath: workspacePath,
            branch: "main",
            headCommit: "new-head-after-queueing",
            worktreeFingerprint: "modified-after-queueing",
          },
        ],
        files: paths.map((path) => ({
          path,
          canonicalPath: path,
          size: 128,
          modifiedAtMs: 1_750_000_000_000,
          available: true,
        })),
      }),
    );
    await user.click(screen.getByRole("button", { name: /^Queue/ }));
    await user.click(
      screen.getByRole("button", { name: "Send queued prompt now" }),
    );

    await waitFor(() =>
      expect(
        mocks.updatePromptQueueItemContextFingerprintMock,
      ).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          contextFingerprint: expect.objectContaining({
            repositories: [
              expect.objectContaining({
                repositoryPath: workspace.path,
                headCommit: "new-head-after-queueing",
                worktreeFingerprint: "modified-after-queueing",
              }),
            ],
          }),
        }),
      ),
    );
    expect(
      screen.queryByRole("dialog", { name: /review changed context/i }),
    ).not.toBeInTheDocument();
    expect(mocks.markPromptQueueItemStaleMock).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(mocks.codexRpcMock).toHaveBeenCalledWith(
        7,
        "turn/steer",
        expect.objectContaining({
          input: [
            {
              type: "text",
              text: "Steer using the latest workspace state",
              text_elements: [],
            },
          ],
        }),
      ),
    );

    await user.click(screen.getByRole("button", { name: /stop codex/i }));
  });

  it("schedules a steering prompt next when the active turn finishes first", async () => {
    prepareSignedInRun();

    const { user } = await renderApp();
    await startMockRun(user, "Start the active task");
    await user.type(
      screen.getByLabelText("Prompt"),
      "Run this after the completion race",
    );
    await user.click(
      screen.getByRole("button", { name: "Add prompt to queue" }),
    );
    await user.click(screen.getByRole("button", { name: /^Queue/ }));
    mocks.codexRpcMock.mockRejectedValueOnce(
      new Error("turn is not active because it completed"),
    );
    await user.click(
      screen.getByRole("button", { name: "Send queued prompt now" }),
    );

    await waitFor(() =>
      expect(
        mocks.reschedulePromptQueueItemAfterSteeringRaceMock,
      ).toHaveBeenCalledTimes(1),
    );
    expect(screen.getByText("Next")).toBeInTheDocument();
    expect(mocks.failPromptQueueItemMock).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /stop codex/i }));
  });

  it("queues an Enter retry while terminal failure persistence is pending", async () => {
    prepareSignedInRun();
    let resolveFailedRunPersistence!: () => void;
    let failedPersistenceCalls = 0;
    let turnStartCalls = 0;
    mocks.createTaskMock
      .mockResolvedValueOnce({ id: 101 })
      .mockResolvedValueOnce({ id: 102 });
    mocks.createRunMock
      .mockResolvedValueOnce({ id: 202 })
      .mockResolvedValueOnce({ id: 203 });
    mocks.updateRunMock.mockImplementation(async (_runId, updates) => {
      if (updates.status === "failed" && failedPersistenceCalls === 0) {
        failedPersistenceCalls += 1;
        await new Promise<void>((resolve) => {
          resolveFailedRunPersistence = resolve;
        });
      }
    });
    mocks.codexRpcMock.mockImplementation(
      async (_accountId: number, method: string) => {
        if (method === "thread/start") {
          return { thread: { id: "thread-1" } };
        }
        if (method === "turn/start") {
          turnStartCalls += 1;
          if (turnStartCalls === 1) {
            throw new Error("First turn failed");
          }
          return { turn: { id: "turn-2" } };
        }
        return {};
      },
    );

    const { user } = await renderApp();
    await user.type(screen.getByLabelText("Prompt"), "Run the first attempt");
    await user.keyboard("{Enter}");

    await waitFor(() =>
      expect(mocks.updateRunMock).toHaveBeenCalledWith(
        202,
        expect.objectContaining({ status: "failed" }),
      ),
    );

    await user.type(screen.getByLabelText("Prompt"), "Run the retry");
    expect(screen.getByRole("button", { name: /run codex/i })).toBeEnabled();
    await user.keyboard("{Enter}");

    expect(screen.getByLabelText("Prompt")).toHaveValue("");
    expect(screen.getAllByLabelText("Submitted prompt")).toHaveLength(1);
    expect(turnStartCalls).toBe(1);

    await act(async () => {
      resolveFailedRunPersistence();
      await Promise.resolve();
    });
    await waitFor(() =>
      expect(screen.getByText("Queued")).toBeInTheDocument(),
    );
    expect(screen.queryByText("Queue paused")).not.toBeInTheDocument();
    expect(turnStartCalls).toBe(1);

    await user.click(
      screen.getByRole("button", { name: /^Queued/ }),
    );
    const failedActions = screen.getByRole("toolbar", {
      name: /Actions for queued prompt: Run the first attempt/i,
    });
    await user.click(
      within(failedActions).getByRole("button", {
        name: "Skip automatic sending",
      }),
    );
    await waitFor(() => expect(turnStartCalls).toBe(2));
    const submittedPrompts = screen.getAllByLabelText("Submitted prompt");
    expect(submittedPrompts).toHaveLength(2);
    expect(submittedPrompts[1]).toHaveTextContent("Run the retry");
    await user.click(screen.getByRole("button", { name: /stop codex/i }));
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

  it("keeps a Kanban run active when its pause interrupt is rejected", async () => {
    prepareKanbanRun();
    mocks.codexRpcMock.mockImplementation(
      async (_accountId: number, method: string, params: any) => {
        if (method === "thread/start") {
          return { thread: { id: "thread-kanban" } };
        }
        if (method === "thread/goal/set") {
          return {
            goal: {
              threadId: params.threadId,
              objective: params.objective,
              status: "active",
              timeUsedSeconds: 0,
            },
          };
        }
        if (method === "turn/start") {
          return { turn: { id: "turn-kanban" } };
        }
        if (method === "turn/interrupt") {
          throw new Error("Interrupt service unavailable");
        }
        return {};
      },
    );

    const { user } = await renderApp();
    await user.click(await screen.findByRole("radio", { name: "Kanban" }));
    await user.click(
      screen.getByRole("button", { name: "Start test Kanban agent" }),
    );

    await waitFor(() =>
      expect(mocks.updateKanbanAttemptMock).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "running",
          sequence: 1,
          turnId: "turn-kanban",
        }),
      ),
    );
    await user.click(
      screen.getByRole("button", { name: "Pause test Kanban agent" }),
    );

    await waitFor(() =>
      expect(screen.getByLabelText("Kanban test result")).toHaveTextContent(
        "The card turn could not be paused.",
      ),
    );
    expect(mocks.codexRpcMock).toHaveBeenCalledWith(7, "turn/interrupt", {
      threadId: "thread-kanban",
      turnId: "turn-kanban",
    });
    expect(
      mocks.updateKanbanAttemptMock.mock.calls.map(([input]) => ({
        status: input.status,
        sequence: input.sequence,
      })),
    ).toEqual([
      { status: "running", sequence: 1 },
      { status: "pause_requested", sequence: 2 },
      { status: "running", sequence: 3 },
    ]);
    expect(mocks.updateKanbanAttemptMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ status: "paused" }),
    );
    expect(mocks.updateRunMock).not.toHaveBeenCalledWith(
      202,
      expect.objectContaining({ status: "interrupted" }),
    );
    expect(mocks.updateTaskStatusMock).not.toHaveBeenCalledWith(101, "interrupted");
    expect(mocks.codexRpcMock).not.toHaveBeenCalledWith(
      7,
      "thread/goal/clear",
      expect.any(Object),
    );
  });

  it("interrupts a Kanban turn that starts after pause won the setup race", async () => {
    prepareKanbanRun();
    let resolveTurnStart!: (value: { turn: { id: string } }) => void;
    mocks.codexRpcMock.mockImplementation(
      async (_accountId: number, method: string, params: any) => {
        if (method === "thread/start") {
          return { thread: { id: "thread-kanban-race" } };
        }
        if (method === "thread/goal/set") {
          return {
            goal: {
              threadId: params.threadId,
              objective: params.objective,
              status: "active",
              timeUsedSeconds: 0,
            },
          };
        }
        if (method === "turn/start") {
          return new Promise<{ turn: { id: string } }>((resolve) => {
            resolveTurnStart = resolve;
          });
        }
        return {};
      },
    );

    const { user } = await renderApp();
    await user.click(await screen.findByRole("radio", { name: "Kanban" }));
    await user.click(
      screen.getByRole("button", { name: "Start test Kanban agent" }),
    );
    await waitFor(() =>
      expect(
        mocks.codexRpcMock.mock.calls.some(([, method]) => method === "turn/start"),
      ).toBe(true),
    );

    await user.click(
      screen.getByRole("button", { name: "Pause test Kanban agent" }),
    );
    await waitFor(() =>
      expect(mocks.updateKanbanAttemptMock).toHaveBeenCalledWith(
        expect.objectContaining({ status: "pause_requested", sequence: 1 }),
      ),
    );
    expect(mocks.updateKanbanAttemptMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ status: "paused" }),
    );
    expect(
      mocks.codexRpcMock.mock.calls.some(([, method]) => method === "turn/interrupt"),
    ).toBe(false);

    await act(async () => {
      resolveTurnStart({ turn: { id: "turn-kanban-race" } });
      await Promise.resolve();
    });

    await waitFor(() =>
      expect(mocks.codexRpcMock).toHaveBeenCalledWith(7, "turn/interrupt", {
        threadId: "thread-kanban-race",
        turnId: "turn-kanban-race",
      }),
    );
    await waitFor(() =>
      expect(mocks.updateKanbanAttemptMock).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "paused",
          sequence: 2,
          threadId: "thread-kanban-race",
          turnId: "turn-kanban-race",
        }),
      ),
    );
    expect(screen.getByLabelText("Kanban test result")).toHaveTextContent("paused");
    expect(mocks.updateRunMock).toHaveBeenCalledWith(
      202,
      expect.objectContaining({ status: "interrupted" }),
    );
    expect(mocks.updateTaskStatusMock).toHaveBeenCalledWith(101, "interrupted");
  });

  it("retries terminal Kanban persistence before completing the run record", async () => {
    prepareKanbanRun();

    const { user } = await renderApp();
    await user.click(await screen.findByRole("radio", { name: "Kanban" }));
    await user.click(
      screen.getByRole("button", { name: "Start test Kanban agent" }),
    );
    await waitFor(() =>
      expect(mocks.updateKanbanAttemptMock).toHaveBeenCalledWith(
        expect.objectContaining({ status: "running", sequence: 1 }),
      ),
    );

    let completionAttempts = 0;
    mocks.updateKanbanAttemptMock.mockImplementation(async (input) => {
      if (input.status === "completed" && completionAttempts++ === 0) {
        throw new Error("Temporary Kanban database contention");
      }
      return undefined;
    });
    await emitCodexNotification({
      method: "thread/goal/updated",
      params: {
        threadId: "thread-1",
        goal: {
          threadId: "thread-1",
          objective: "Exercise Kanban pause semantics",
          status: "complete",
          timeUsedSeconds: 1,
        },
      },
    });
    await emitCodexNotification({
      method: "turn/completed",
      params: {
        threadId: "thread-1",
        turn: {
          id: "turn-1",
          status: "completed",
          durationMs: 250,
        },
      },
    });

    await waitFor(() => {
      const terminalCalls = mocks.updateKanbanAttemptMock.mock.calls.filter(
        ([input]) => input.status === "completed",
      );
      expect(terminalCalls).toHaveLength(2);
      expect(terminalCalls[0][0]).toEqual(
        expect.objectContaining({ sequence: 2 }),
      );
      expect(terminalCalls[1][0]).toEqual(
        expect.objectContaining({
          sequence: 2,
          operationId: terminalCalls[0][0].operationId,
        }),
      );
      expect(mocks.updateRunMock).toHaveBeenCalledWith(
        202,
        expect.objectContaining({ status: "completed" }),
      );
    });

    let secondTerminalCallIndex = -1;
    mocks.updateKanbanAttemptMock.mock.calls.forEach(([input], index) => {
      if (input.status === "completed") secondTerminalCallIndex = index;
    });
    const completedRunCallIndex = mocks.updateRunMock.mock.calls.findIndex(
      ([runId, update]) => runId === 202 && update.status === "completed",
    );
    expect(
      mocks.updateKanbanAttemptMock.mock.invocationCallOrder[
        secondTerminalCallIndex
      ],
    ).toBeLessThan(
      mocks.updateRunMock.mock.invocationCallOrder[completedRunCallIndex],
    );
  });

  it("terminalizes a root protocol error as a failed Kanban attempt", async () => {
    prepareKanbanRun();

    const { user } = await renderApp();
    await user.click(await screen.findByRole("radio", { name: "Kanban" }));
    await user.click(
      screen.getByRole("button", { name: "Start test Kanban agent" }),
    );
    await waitFor(() =>
      expect(mocks.updateKanbanAttemptMock).toHaveBeenCalledWith(
        expect.objectContaining({ status: "running", sequence: 1 }),
      ),
    );

    await emitCodexNotification({
      method: "error",
      params: {
        threadId: "thread-1",
        turnId: "turn-1",
        error: { message: "Root protocol stream failed" },
      },
    });

    await waitFor(() =>
      expect(mocks.updateKanbanAttemptMock).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "failed",
          sequence: 2,
          error: "Root protocol stream failed",
        }),
      ),
    );
    expect(mocks.updateRunMock).toHaveBeenCalledWith(
      202,
      expect.objectContaining({ status: "failed" }),
    );
    expect(mocks.updateTaskStatusMock).toHaveBeenCalledWith(101, "failed");
  });

  it("terminalizes an unexpected root interruption when no Goal can continue", async () => {
    prepareKanbanRun();

    const { user } = await renderApp();
    await user.click(await screen.findByRole("radio", { name: "Kanban" }));
    await user.click(
      screen.getByRole("button", { name: "Start test Kanban agent" }),
    );
    await waitFor(() =>
      expect(mocks.updateKanbanAttemptMock).toHaveBeenCalledWith(
        expect.objectContaining({ status: "running", sequence: 1 }),
      ),
    );

    await emitCodexNotification({
      method: "thread/goal/cleared",
      params: { threadId: "thread-1" },
    });
    await emitCodexNotification({
      method: "turn/interrupted",
      params: {
        threadId: "thread-1",
        turn: { id: "turn-1" },
      },
    });

    await waitFor(() =>
      expect(mocks.updateKanbanAttemptMock).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "interrupted",
          sequence: 2,
        }),
      ),
    );
    expect(mocks.updateRunMock).toHaveBeenCalledWith(
      202,
      expect.objectContaining({ status: "interrupted" }),
    );
    expect(mocks.updateTaskStatusMock).toHaveBeenCalledWith(101, "interrupted");
  });

  it("waits for interrupted Kanban persistence when the App Server exits", async () => {
    prepareKanbanRun();

    const { user } = await renderApp();
    await user.click(await screen.findByRole("radio", { name: "Kanban" }));
    await user.click(
      screen.getByRole("button", { name: "Start test Kanban agent" }),
    );
    await waitFor(() =>
      expect(mocks.updateKanbanAttemptMock).toHaveBeenCalledWith(
        expect.objectContaining({ status: "running", sequence: 1 }),
      ),
    );

    let resolveInterruptedPersistence!: () => void;
    mocks.updateKanbanAttemptMock.mockImplementation(
      (input) =>
        input.status === "interrupted"
          ? new Promise<void>((resolve) => {
              resolveInterruptedPersistence = resolve;
            })
          : Promise.resolve(undefined),
    );
    await act(async () => {
      mocks.listeners.get("codex:process")?.({
        payload: {
          accountId: 7,
          profileKey: "account:7",
          status: "exited",
          message: "Codex app-server stdout closed",
        },
      });
      await Promise.resolve();
    });
    await waitFor(() =>
      expect(mocks.updateKanbanAttemptMock).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "interrupted",
          sequence: 2,
          error: "Codex app-server stdout closed",
        }),
      ),
    );
    expect(mocks.updateRunMock).not.toHaveBeenCalledWith(
      202,
      expect.objectContaining({ status: "interrupted" }),
    );

    await act(async () => {
      resolveInterruptedPersistence();
      await Promise.resolve();
    });
    await waitFor(() =>
      expect(mocks.updateRunMock).toHaveBeenCalledWith(
        202,
        expect.objectContaining({ status: "interrupted" }),
      ),
    );
    expect(mocks.updateTaskStatusMock).toHaveBeenCalledWith(101, "interrupted");
  });

  it("does not restore a Kanban run when its failed pause races process exit", async () => {
    prepareKanbanRun();
    let rejectInterrupt!: (error: Error) => void;
    mocks.codexRpcMock.mockImplementation(
      async (_accountId: number, method: string) => {
        if (method === "thread/start") {
          return { thread: { id: "thread-kanban-process-race" } };
        }
        if (method === "turn/start") {
          return { turn: { id: "turn-kanban-process-race" } };
        }
        if (method === "turn/interrupt") {
          return new Promise((_resolve, reject) => {
            rejectInterrupt = reject;
          });
        }
        return {};
      },
    );

    const { user } = await renderApp();
    await user.click(await screen.findByRole("radio", { name: "Kanban" }));
    await user.click(
      screen.getByRole("button", { name: "Start test Kanban agent" }),
    );
    await waitFor(() =>
      expect(mocks.updateKanbanAttemptMock).toHaveBeenCalledWith(
        expect.objectContaining({ status: "running", sequence: 1 }),
      ),
    );

    await user.click(
      screen.getByRole("button", { name: "Pause test Kanban agent" }),
    );
    await waitFor(() =>
      expect(mocks.codexRpcMock).toHaveBeenCalledWith(
        7,
        "turn/interrupt",
        expect.any(Object),
      ),
    );
    await act(async () => {
      mocks.listeners.get("codex:process")?.({
        payload: {
          accountId: 7,
          profileKey: "account:7",
          status: "exited",
          message: "Codex app-server exited during pause",
        },
      });
      await Promise.resolve();
    });
    await waitFor(() =>
      expect(mocks.updateKanbanAttemptMock).toHaveBeenCalledWith(
        expect.objectContaining({ status: "interrupted", sequence: 3 }),
      ),
    );
    await act(async () => {
      rejectInterrupt(new Error("Connection closed"));
      await Promise.resolve();
    });

    await waitFor(() =>
      expect(screen.getByLabelText("Kanban test result")).toHaveTextContent(
        "paused",
      ),
    );
    expect(
      mocks.updateKanbanAttemptMock.mock.calls
        .map(([input]) => input.status)
        .filter((status) => status === "running"),
    ).toEqual(["running"]);
  });

  it("retries newly provisioned binding persistence with the latest card version", async () => {
    prepareKanbanRun();
    const binding = {
      sourceRepositoryPath: "/repo/orchestrator",
      relativePath: ".",
      executionRoot: "/repo/.codex-kanban/card-run-control-test",
      sourceBranch: "main",
      baseBranch: "main",
      baseCommit: "0123456789abcdef",
      cardBranch: "codex/kanban-run-control-test",
      worktreePath: "/repo/.codex-kanban/card-run-control-test/orchestrator",
      status: "ready",
      error: null,
    };
    mocks.loadKanbanGitBindingsMock.mockResolvedValue([]);
    mocks.provisionKanbanGitMock.mockResolvedValue({
      cardId: "card-run-control-test",
      executionRoot: binding.executionRoot,
      repositories: [binding],
      errors: [],
      complete: true,
      rolledBack: false,
    });
    mocks.saveKanbanGitBindingsMock
      .mockRejectedValueOnce(new Error("The card version changed"))
      .mockResolvedValueOnce([binding]);
    mocks.loadKanbanBoardMock.mockImplementation(async () => {
      const claimed = await mocks.claimKanbanAttemptMock.mock.results[0].value;
      return {
        workspaceId: 1,
        revision: 3,
        preferencesJson: "{}",
        columns: [],
        cards: [{ ...claimed.card, stateVersion: 3 }],
      };
    });

    const { user } = await renderApp();
    await user.click(await screen.findByRole("radio", { name: "Kanban" }));
    await user.click(
      screen.getByRole("button", { name: "Start test Kanban agent" }),
    );

    await waitFor(() =>
      expect(mocks.saveKanbanGitBindingsMock).toHaveBeenCalledTimes(2),
    );
    expect(mocks.saveKanbanGitBindingsMock.mock.calls[0][0]).toEqual(
      expect.objectContaining({ stateVersion: 2 }),
    );
    expect(mocks.saveKanbanGitBindingsMock.mock.calls[1][0]).toEqual(
      expect.objectContaining({ stateVersion: 3 }),
    );
    expect(mocks.cleanupKanbanGitMock).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(mocks.updateKanbanAttemptMock).toHaveBeenCalledWith(
        expect.objectContaining({ status: "running" }),
      ),
    );
  });

  it("persists and accepts a reconciled target-moved binding", async () => {
    prepareKanbanRun();
    mocks.reconcileKanbanGitMock.mockImplementation(async (binding) => ({
      binding: { ...binding, status: "targetMoved" },
      sourceAvailable: true,
      worktreeAvailable: true,
      branchAvailable: true,
      branchMatches: true,
      baseBranchHead: "fedcba9876543210",
      headCommit: binding.baseCommit,
      targetMoved: true,
      hasChanges: false,
      hasConflicts: false,
    }));

    const { user } = await renderApp();
    await user.click(await screen.findByRole("radio", { name: "Kanban" }));
    await user.click(
      screen.getByRole("button", { name: "Start test Kanban agent" }),
    );

    await waitFor(() =>
      expect(mocks.saveKanbanGitBindingsMock).toHaveBeenCalledWith(
        expect.objectContaining({ stateVersion: 2 }),
        [expect.objectContaining({ status: "targetMoved" })],
      ),
    );
    await waitFor(() =>
      expect(mocks.updateKanbanAttemptMock).toHaveBeenCalledWith(
        expect.objectContaining({ status: "running" }),
      ),
    );
    expect(mocks.cleanupKanbanGitMock).not.toHaveBeenCalled();
  });

  it("cleans only newly provisioned artifacts when binding persistence cannot recover", async () => {
    prepareKanbanRun();
    const binding = {
      sourceRepositoryPath: "/repo/orchestrator",
      relativePath: ".",
      executionRoot: "/repo/.codex-kanban/card-run-control-test",
      sourceBranch: "main",
      baseBranch: "main",
      baseCommit: "0123456789abcdef",
      cardBranch: "codex/kanban-run-control-test",
      worktreePath: "/repo/.codex-kanban/card-run-control-test/orchestrator",
      status: "ready",
      error: null,
    };
    mocks.loadKanbanGitBindingsMock.mockResolvedValue([]);
    mocks.provisionKanbanGitMock.mockResolvedValue({
      cardId: "card-run-control-test",
      executionRoot: binding.executionRoot,
      repositories: [binding],
      errors: [],
      complete: true,
      rolledBack: false,
    });
    mocks.saveKanbanGitBindingsMock.mockRejectedValue(
      new Error("Kanban binding storage unavailable"),
    );
    mocks.loadKanbanBoardMock.mockImplementation(async () => {
      const claimed = await mocks.claimKanbanAttemptMock.mock.results[0].value;
      return {
        workspaceId: 1,
        revision: 3,
        preferencesJson: "{}",
        columns: [],
        cards: [{ ...claimed.card, stateVersion: 3 }],
      };
    });

    const { user } = await renderApp();
    await user.click(await screen.findByRole("radio", { name: "Kanban" }));
    await user.click(
      screen.getByRole("button", { name: "Start test Kanban agent" }),
    );

    await waitFor(() =>
      expect(screen.getByLabelText("Kanban test result")).toHaveTextContent(
        "The card worktrees could not be saved",
      ),
    );
    expect(mocks.cleanupKanbanGitMock).toHaveBeenCalledTimes(1);
    expect(mocks.cleanupKanbanGitMock).toHaveBeenCalledWith({
      binding,
      deleteBranch: true,
      force: true,
    });
    expect(mocks.updateKanbanAttemptMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "failed",
        sequence: 1,
        executionRoot: binding.executionRoot,
      }),
    );
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
        workspace.path,
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

  it("allows undo after completion while terminal run housekeeping is pending", async () => {
    prepareSignedInRun();
    let releaseCompletionEvent!: () => void;
    const pendingCompletionEvent = new Promise<void>((resolve) => {
      releaseCompletionEvent = resolve;
    });
    mocks.appendRunEventMock.mockImplementation(
      async (input: { method?: string }) => {
        if (input.method === "turn/completed") {
          await pendingCompletionEvent;
        }
      },
    );

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
    await emitCodexNotification({
      method: "turn/completed",
      params: { turn: { status: "completed", durationMs: 1234 } },
    });

    const summary = await screen.findByLabelText("Edited 1 file");
    const undoButton = within(summary).getByRole("button", {
      name: "Undo file changes",
    });
    expect(undoButton).toBeEnabled();
    await user.click(undoButton);
    await user.click(
      within(screen.getByRole("dialog", { name: "Undo changes?" })).getByRole(
        "button",
        { name: "Undo changes" },
      ),
    );

    await waitFor(() =>
      expect(mocks.undoWorkspaceGitDiffMock).toHaveBeenCalledWith(
        workspace.path,
        diff,
      ),
    );

    await act(async () => {
      releaseCompletionEvent();
      await pendingCompletionEvent;
    });
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

  it("routes child turns into the subagent inspector without completing the parent run", async () => {
    prepareSignedInRun();
    mocks.readProjectedSubagentThreadMock.mockResolvedValue({
      threadId: "child-thread-1",
      status: "active",
      activeTurnId: "child-turn-1",
      turns: [
        {
          id: "child-turn-1",
          status: "running",
          startedAt: "2026-07-29T10:00:00.000Z",
          completedAt: null,
          items: [
            {
              id: "child-user-1",
              kind: "user",
              text: "Inspect the integration tests",
            },
            {
              id: "child-assistant-1",
              kind: "assistant",
              text: "Reviewing the existing coverage.",
              phase: "commentary",
            },
          ],
        },
      ],
    });

    const { user } = await renderApp();
    await startMockRun(user, "Coordinate the implementation");

    await emitCodexNotification({
      method: "item/started",
      params: {
        threadId: "thread-1",
        turnId: "turn-1",
        item: {
          type: "collabAgentToolCall",
          id: "spawn-child-1",
          tool: "spawnAgent",
          status: "inProgress",
          senderThreadId: "thread-1",
          receiverThreadIds: ["child-thread-1"],
          prompt: "Inspect the integration tests",
          agentsStates: {
            "child-thread-1": {
              status: "running",
              message: null,
            },
          },
        },
      },
    });
    await emitCodexNotification({
      method: "turn/started",
      params: {
        threadId: "child-thread-1",
        turn: {
          id: "child-turn-1",
          status: "inProgress",
        },
      },
    });

    const subagents = await screen.findByRole("button", {
      name: /Subagents, 1 active · 0 completed/i,
    });
    await user.click(subagents);
    await user.click(
      screen.getByRole("button", {
        name: /Inspect the integration tests.*Open inspector/i,
      }),
    );

    expect(
      await screen.findByText("Reviewing the existing coverage."),
    ).toBeInTheDocument();
    expect(mocks.readProjectedSubagentThreadMock).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: 7,
        profileKey: "account:7",
        threadId: "child-thread-1",
      }),
    );

    const instruction = screen.getByRole("textbox", {
      name: "Send instruction to subagent",
    });
    await user.type(instruction, "Check the failure path{enter}");
    await waitFor(() =>
      expect(mocks.codexRpcMock).toHaveBeenCalledWith(
        7,
        "turn/steer",
        expect.objectContaining({
          threadId: "child-thread-1",
          expectedTurnId: "child-turn-1",
          input: [{ type: "text", text: "Check the failure path" }],
        }),
      ),
    );

    await emitCodexNotification({
      method: "turn/completed",
      params: {
        threadId: "child-thread-1",
        turn: {
          id: "child-turn-1",
          status: "completed",
        },
      },
    });

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /Subagents/i }),
      ).toHaveTextContent("0 active · 1 completed"),
    );
    expect(
      screen.getByRole("button", { name: /stop codex/i }),
    ).toBeInTheDocument();
    expect(mocks.upsertRunSubagentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: 202,
        childThreadId: "child-thread-1",
        status: "completed",
      }),
    );
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

  it("deduplicates approval replays and safely rejects requests from untracked runs", async () => {
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
    expect(
      screen.queryByRole("button", {
        name: "Open chat awaiting approval",
      }),
    ).not.toBeInTheDocument();

    await emitCodexServerRequest(
      { ...request, id: 11 },
      { requestToken: null },
    );
    expect(screen.getByText(/without a one-shot request token/i)).toBeInTheDocument();
    expect(
      mocks.resolveCodexServerRequestMock.mock.calls.some(
        ([, requestId]) => requestId === 11,
      ),
    ).toBe(false);
  });

  it("denies an orphaned approval so a later prompt can start normally", async () => {
    prepareSignedInRun();
    const { user } = await renderApp();

    await emitCodexServerRequest(
      {
        id: 12,
        method: "item/commandExecution/requestApproval",
        params: {
          threadId: "thread-from-completed-chat",
          turnId: "turn-from-completed-chat",
          command: "npm test",
          availableDecisions: ["accept", "cancel"],
        },
      },
      { requestToken: "server-request-orphan-12" },
    );

    expect(
      screen.queryByRole("button", {
        name: "Open chat awaiting approval",
      }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Approval needed")).not.toBeInTheDocument();
    expect(mocks.sendAgentNotificationMock).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(mocks.resolveCodexServerRequestMock).toHaveBeenCalledWith(
        7,
        12,
        "server-request-orphan-12",
        { decision: "cancel" },
      ),
    );
    await emitCodexServerRequest(
      {
        id: 12,
        method: "item/commandExecution/requestApproval",
        params: {
          threadId: "thread-from-completed-chat",
          turnId: "turn-from-completed-chat",
          command: "npm test",
          availableDecisions: ["accept", "cancel"],
        },
      },
      { requestToken: "server-request-orphan-12" },
    );
    expect(mocks.resolveCodexServerRequestMock).toHaveBeenCalledTimes(1);

    await startMockRun(user, "Start after stale approval");
    expect(
      mocks.codexRpcMock.mock.calls.some(([, method]) => method === "turn/start"),
    ).toBe(true);
  });

  it("routes an approval that arrives before turn/start returns", async () => {
    prepareSignedInRun();
    let finishTurnStart!: (value: { turn: { id: string } }) => void;
    const pendingTurnStart = new Promise<{ turn: { id: string } }>(
      (resolve) => {
        finishTurnStart = resolve;
      },
    );
    mocks.codexRpcMock.mockImplementation(
      async (_accountId: number, method: string) => {
        if (method === "thread/start") {
          return { thread: { id: "thread-1" } };
        }
        if (method === "turn/start") {
          return pendingTurnStart;
        }
        return {};
      },
    );

    const { user } = await renderApp();
    await user.type(screen.getByLabelText("Prompt"), "Run guarded setup");
    await user.click(screen.getByRole("button", { name: /run codex/i }));
    await waitFor(() =>
      expect(
        mocks.codexRpcMock.mock.calls.some(
          ([, method]) => method === "turn/start",
        ),
      ).toBe(true),
    );

    await emitCodexServerRequest(
      {
        id: 15,
        method: "item/commandExecution/requestApproval",
        params: {
          threadId: "thread-1",
          turnId: "turn-delayed",
          command: "npm test",
          availableDecisions: ["accept", "cancel"],
        },
      },
      { requestToken: "server-request-before-turn-start" },
    );
    expect(
      mocks.resolveCodexServerRequestMock.mock.calls.some(
        ([, requestId]) => requestId === 15,
      ),
    ).toBe(false);

    await act(async () => {
      finishTurnStart({ turn: { id: "turn-delayed" } });
      await pendingTurnStart;
    });
    const approvalCard = await screen.findByRole("article", {
      name: "Codex needs approval to run a command",
    });
    await user.click(
      within(approvalCard).getByRole("button", {
        name: "Cancel operation",
      }),
    );
    await waitFor(() =>
      expect(mocks.resolveCodexServerRequestMock).toHaveBeenCalledWith(
        7,
        15,
        "server-request-before-turn-start",
        { decision: "cancel" },
      ),
    );
  });

  it("clears an approval when Codex resolves it without thread metadata", async () => {
    prepareSignedInRun();

    const { user } = await renderApp();
    await startMockRun(user, "Run a guarded command");
    await emitCodexServerRequest(
      {
        id: 12,
        method: "item/commandExecution/requestApproval",
        params: {
          threadId: "thread-1",
          turnId: "turn-1",
          command: "npm test",
          availableDecisions: ["accept", "cancel"],
        },
      },
      { requestToken: "server-request-7-1-12" },
    );
    expect(
      screen.getByRole("article", {
        name: "Codex needs approval to run a command",
      }),
    ).toBeInTheDocument();

    await emitCodexNotification({
      method: "serverRequest/resolved",
      params: { requestId: "12" },
    });
    await waitFor(() =>
      expect(
        screen.queryByRole("article", {
          name: "Codex needs approval to run a command",
        }),
      ).not.toBeInTheDocument(),
    );
    expect(
      screen.queryByRole("button", {
        name: "Open chat awaiting approval",
      }),
    ).not.toBeInTheDocument();
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

    await emitCodexNotification({
      method: "turn/completed",
      params: {
        threadId: "thread-1",
        turn: {
          id: "turn-1",
          status: "completed",
          durationMs: 1_000,
        },
      },
    });
    expect(
      screen.getByRole("button", { name: /stop codex/i }),
    ).toBeInTheDocument();

    await emitCodexNotification({
      method: "turn/started",
      params: {
        threadId: "thread-1",
        turn: { id: "turn-goal-continuation" },
      },
    });
    await emitCodexServerRequest({
      id: 9,
      method: "item/commandExecution/requestApproval",
      params: {
        threadId: "thread-1",
        turnId: "turn-goal-continuation",
        command: "npm test",
        availableDecisions: ["accept", "cancel"],
      },
    });

    const approval = screen
      .getByText("Codex needs approval to run a command")
      .closest("article")!;
    expect(within(approval).queryByText("Goal Mode")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: "Open chat awaiting approval",
      }),
    ).not.toBeInTheDocument();
    expect(mocks.resolveCodexServerRequestMock).not.toHaveBeenCalled();

    await emitCodexNotification({
      method: "turn/completed",
      params: {
        threadId: "thread-1",
        turn: {
          id: "turn-goal-continuation",
          status: "completed",
          durationMs: 2_000,
        },
      },
    });
    expect(
      screen.getByRole("button", { name: /stop codex/i }),
    ).toBeInTheDocument();

    await emitCodexNotification({
      method: "thread/goal/updated",
      params: {
        threadId: "thread-1",
        goal: {
          threadId: "thread-1",
          objective: "Run a goal command",
          status: "complete",
          timeUsedSeconds: 3,
        },
      },
    });

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /run codex/i }),
      ).toBeInTheDocument(),
    );
    expect(mocks.updateRunMock).toHaveBeenCalledWith(
      202,
      expect.objectContaining({ status: "completed" }),
    );
  });

  it("shows native Goal progress and pauses or resumes without ending the run", async () => {
    prepareSignedInRun();
    mocks.codexRpcMock.mockImplementation(
      async (_accountId: number, method: string, params: any) => {
        if (method === "thread/start") {
          return { thread: { id: "thread-1" } };
        }
        if (method === "turn/start") {
          return { turn: { id: "turn-1" } };
        }
        if (method === "thread/goal/set") {
          return {
            goal: {
              threadId: params.threadId,
              objective: "Finish the workspace migration",
              status: params.status,
              timeUsedSeconds: 3_723,
            },
          };
        }
        return {};
      },
    );

    const { user } = await renderApp();
    await user.click(screen.getByRole("button", { name: /goal mode/i }));
    await startMockRun(user, "Finish the workspace migration");

    await emitCodexNotification({
      method: "thread/goal/updated",
      params: {
        threadId: "thread-1",
        goal: {
          threadId: "thread-1",
          objective: "Finish the workspace migration",
          status: "active",
          timeUsedSeconds: 3_723,
        },
      },
    });
    await emitCodexNotification({
      method: "turn/plan/updated",
      params: {
        threadId: "thread-1",
        turnId: "turn-1",
        plan: [
          { step: "Inspect the repository", status: "in_progress" },
          { step: "Complete the migration", status: "pending" },
        ],
      },
    });

    const composer = screen.getByLabelText("Task composer");
    const goalProgress = within(composer).getByLabelText("Goal progress");
    const planProgress = within(composer).getByRole("status");
    expect(goalProgress).toHaveTextContent("Finish the workspace migration");
    expect(goalProgress).toHaveTextContent("1hr 2m 3s");
    expect(
      goalProgress.compareDocumentPosition(planProgress) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).not.toBe(0);

    await user.click(
      within(goalProgress).getByRole("button", { name: "Pause goal" }),
    );
    await waitFor(() =>
      expect(mocks.codexRpcMock).toHaveBeenCalledWith(
        7,
        "thread/goal/set",
        { threadId: "thread-1", status: "paused" },
      ),
    );
    expect(
      mocks.codexRpcMock.mock.calls.filter(
        ([, method]) => method === "turn/interrupt",
      ),
    ).toHaveLength(0);
    expect(
      within(composer).getByRole("button", { name: "Resume goal" }),
    ).toBeInTheDocument();

    await emitCodexNotification({
      method: "turn/interrupted",
      params: {
        threadId: "thread-1",
        turn: {
          id: "turn-1",
        },
      },
    });
    expect(screen.getByRole("button", { name: /stop codex/i })).toBeInTheDocument();
    expect(within(composer).getByLabelText("Goal progress")).toHaveTextContent(
      "Paused",
    );

    await user.click(
      within(composer).getByRole("button", { name: "Resume goal" }),
    );
    await waitFor(() =>
      expect(mocks.codexRpcMock).toHaveBeenCalledWith(
        7,
        "thread/goal/set",
        { threadId: "thread-1", status: "active" },
      ),
    );
    expect(
      within(composer).getByRole("button", { name: "Pause goal" }),
    ).toBeInTheDocument();

    await emitCodexNotification({
      method: "thread/goal/updated",
      params: {
        threadId: "thread-1",
        goal: {
          threadId: "thread-1",
          objective: "Finish the workspace migration",
          status: "complete",
          timeUsedSeconds: 3_725,
        },
      },
    });
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /run codex/i }),
      ).toBeInTheDocument(),
    );
    expect(
      within(composer).queryByLabelText("Goal progress"),
    ).not.toBeInTheDocument();
  });

  it("stops a Goal with Codex's current active turn when the cached turn is stale", async () => {
    prepareSignedInRun();
    const activeTurnId = "019f9fc5-25dd-76a1-b223-b439ce5af283";
    mocks.codexRpcMock.mockImplementation(
      async (_accountId: number, method: string, params: any) => {
        if (method === "thread/start") {
          return { thread: { id: "thread-1" } };
        }
        if (method === "turn/start") {
          return { turn: { id: "turn-1" } };
        }
        if (method === "thread/goal/set") {
          return {
            goal: {
              threadId: params.threadId,
              objective: "Finish the workspace migration",
              status: params.status,
              timeUsedSeconds: 42,
            },
          };
        }
        if (method === "turn/interrupt" && params.turnId === "turn-1") {
          throw new Error(
            JSON.stringify({
              code: -32600,
              message: `expected active turn id ${activeTurnId}, got turn-1`,
            }),
          );
        }
        return {};
      },
    );

    const { user } = await renderApp();
    const goalMode = screen.getByRole("button", { name: "Goal mode" });
    await user.click(goalMode);
    await startMockRun(user, "Finish the workspace migration");

    await user.click(screen.getByRole("button", { name: "Stop goal" }));

    await waitFor(() =>
      expect(mocks.codexRpcMock).toHaveBeenCalledWith(
        7,
        "thread/goal/clear",
        { threadId: "thread-1" },
      ),
    );
    await waitFor(() =>
      expect(screen.getByText("Queued")).toBeInTheDocument(),
    );
    expect(screen.queryByText("Queue paused")).not.toBeInTheDocument();
    expect(mocks.codexRpcMock).toHaveBeenCalledWith(
      7,
      "turn/interrupt",
      { threadId: "thread-1", turnId: "turn-1" },
    );
    expect(mocks.codexRpcMock).toHaveBeenCalledWith(
      7,
      "turn/interrupt",
      { threadId: "thread-1", turnId: activeTurnId },
    );
    expect(screen.queryByLabelText("Goal progress")).not.toBeInTheDocument();
    expect(goalMode).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("stops a Goal and moves its objective into the focused composer for editing", async () => {
    prepareSignedInRun();
    mocks.codexRpcMock.mockImplementation(
      async (_accountId: number, method: string, params: any) => {
        if (method === "thread/start") {
          return { thread: { id: "thread-1" } };
        }
        if (method === "turn/start") {
          return { turn: { id: "turn-1" } };
        }
        if (method === "thread/goal/set") {
          return {
            goal: {
              threadId: params.threadId,
              objective: "Finish the workspace migration",
              status: params.status,
              timeUsedSeconds: 42,
            },
          };
        }
        return {};
      },
    );

    const { user } = await renderApp();
    await user.click(screen.getByRole("button", { name: "Goal mode" }));
    await startMockRun(user, "Finish the workspace migration");
    await user.click(screen.getByRole("button", { name: "Edit goal" }));

    const prompt = screen.getByLabelText("Prompt");
    await waitFor(() =>
      expect(prompt).toHaveValue("Finish the workspace migration"),
    );
    await waitFor(() => expect(prompt).toHaveFocus());
    expect((prompt as HTMLTextAreaElement).selectionStart).toBe(0);
    expect((prompt as HTMLTextAreaElement).selectionEnd).toBe(
      "Finish the workspace migration".length,
    );
    expect(screen.getByRole("button", { name: "Goal mode" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.queryByLabelText("Goal progress")).not.toBeInTheDocument();
  });

  it("confirms before replacing an unsent draft while editing a Goal", async () => {
    prepareSignedInRun();
    mocks.codexRpcMock.mockImplementation(
      async (_accountId: number, method: string, params: any) => {
        if (method === "thread/start") {
          return { thread: { id: "thread-1" } };
        }
        if (method === "turn/start") {
          return { turn: { id: "turn-1" } };
        }
        if (method === "thread/goal/set") {
          return {
            goal: {
              threadId: params.threadId,
              objective: "Finish the workspace migration",
              status: params.status,
              timeUsedSeconds: 42,
            },
          };
        }
        return {};
      },
    );

    const { user } = await renderApp();
    await user.click(screen.getByRole("button", { name: "Goal mode" }));
    await startMockRun(user, "Finish the workspace migration");
    const prompt = screen.getByLabelText("Prompt");
    await user.type(prompt, "Keep this draft");
    await user.click(screen.getByRole("button", { name: "Edit goal" }));

    const dialog = screen.getByRole("dialog", {
      name: "Replace draft and edit goal?",
    });
    expect(prompt).toHaveValue("Keep this draft");
    expect(screen.getByLabelText("Goal progress")).toBeInTheDocument();
    expect(mocks.codexRpcMock).not.toHaveBeenCalledWith(
      7,
      "thread/goal/clear",
      expect.anything(),
    );

    await user.click(
      within(dialog).getByRole("button", { name: "Keep current goal" }),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(prompt).toHaveValue("Keep this draft");
    expect(screen.getByLabelText("Goal progress")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Edit goal" }));
    await user.click(
      within(
        screen.getByRole("dialog", {
          name: "Replace draft and edit goal?",
        }),
      ).getByRole("button", { name: "Stop and edit goal" }),
    );
    await waitFor(() =>
      expect(prompt).toHaveValue("Finish the workspace migration"),
    );
  });

  it("keeps a Goal and composer draft unchanged when Goal clearing fails", async () => {
    prepareSignedInRun();
    mocks.codexRpcMock.mockImplementation(
      async (_accountId: number, method: string, params: any) => {
        if (method === "thread/start") {
          return { thread: { id: "thread-1" } };
        }
        if (method === "turn/start") {
          return { turn: { id: "turn-1" } };
        }
        if (method === "thread/goal/set") {
          return {
            goal: {
              threadId: params.threadId,
              objective: "Finish the workspace migration",
              status: params.status,
              timeUsedSeconds: 42,
            },
          };
        }
        if (method === "thread/goal/clear") {
          throw new Error("Goal service unavailable");
        }
        return {};
      },
    );

    const { user } = await renderApp();
    await user.click(screen.getByRole("button", { name: "Goal mode" }));
    await startMockRun(user, "Finish the workspace migration");
    await user.click(screen.getByRole("button", { name: "Edit goal" }));

    await screen.findByText(
      "Could not prepare the goal for editing: Goal service unavailable",
    );
    expect(screen.getByLabelText("Prompt")).toHaveValue("");
    expect(screen.getByLabelText("Goal progress")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit goal" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Goal mode" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(mocks.codexRpcMock).not.toHaveBeenCalledWith(
      7,
      "turn/interrupt",
      expect.anything(),
    );
  });

  it("keeps the current Goal state when a pause request fails", async () => {
    prepareSignedInRun();
    mocks.codexRpcMock.mockImplementation(
      async (_accountId: number, method: string) => {
        if (method === "thread/start") {
          return { thread: { id: "thread-1" } };
        }
        if (method === "turn/start") {
          return { turn: { id: "turn-1" } };
        }
        if (method === "thread/goal/set") {
          throw new Error("Goal service unavailable");
        }
        return {};
      },
    );

    const { user } = await renderApp();
    await user.click(screen.getByRole("button", { name: /goal mode/i }));
    await startMockRun(user, "Finish the workspace migration");

    const composer = screen.getByLabelText("Task composer");
    await user.click(
      within(composer).getByRole("button", { name: "Pause goal" }),
    );

    await screen.findByText(
      "Could not pause goal: Goal service unavailable",
    );
    expect(
      within(composer).getByRole("button", { name: "Pause goal" }),
    ).toBeEnabled();
    expect(within(composer).getByLabelText("Goal progress")).toHaveTextContent(
      "In progress",
    );
    expect(
      screen.getByRole("button", { name: /stop codex/i }),
    ).toBeInTheDocument();
  });

  it("does not manually interrupt a Goal turn when pausing between turns", async () => {
    prepareSignedInRun();
    mocks.codexRpcMock.mockImplementation(
      async (_accountId: number, method: string, params: any) => {
        if (method === "thread/start") {
          return { thread: { id: "thread-1" } };
        }
        if (method === "turn/start") {
          return { turn: { id: "turn-1" } };
        }
        if (method === "thread/goal/set") {
          return {
            goal: {
              threadId: params.threadId,
              objective: "Finish the workspace migration",
              status: params.status,
              timeUsedSeconds: 42,
            },
          };
        }
        return {};
      },
    );

    const { user } = await renderApp();
    await user.click(screen.getByRole("button", { name: /goal mode/i }));
    await startMockRun(user, "Finish the workspace migration");
    await emitCodexNotification({
      method: "turn/completed",
      params: {
        threadId: "thread-1",
        turn: {
          id: "turn-1",
          status: "completed",
          durationMs: 4_000,
        },
      },
    });

    await user.click(screen.getByRole("button", { name: "Pause goal" }));

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Resume goal" }),
      ).toBeInTheDocument(),
    );
    expect(
      mocks.codexRpcMock.mock.calls.filter(
        ([, method]) => method === "turn/interrupt",
      ),
    ).toHaveLength(0);
    expect(
      screen.getByRole("button", { name: /stop codex/i }),
    ).toBeInTheDocument();
  });

  it("does not issue a stale turn interruption after native Goal pause", async () => {
    prepareSignedInRun();
    mocks.codexRpcMock.mockImplementation(
      async (_accountId: number, method: string, params: any) => {
        if (method === "thread/start") {
          return { thread: { id: "thread-1" } };
        }
        if (method === "turn/start") {
          return { turn: { id: "turn-1" } };
        }
        if (method === "thread/goal/set") {
          return {
            goal: {
              threadId: params.threadId,
              objective: "Finish the workspace migration",
              status: params.status,
              timeUsedSeconds: 42,
            },
          };
        }
        if (method === "turn/interrupt") {
          throw new Error(
            JSON.stringify({
              code: -32600,
              message:
                "expected active turn id 019f9fc5-25dd-76a1-b223-b439ce5af283, got turn-1",
            }),
          );
        }
        return {};
      },
    );

    const { user } = await renderApp();
    await user.click(screen.getByRole("button", { name: /goal mode/i }));
    await startMockRun(user, "Finish the workspace migration");
    await user.click(screen.getByRole("button", { name: "Pause goal" }));

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Resume goal" }),
      ).toBeInTheDocument(),
    );
    expect(
      mocks.codexRpcMock.mock.calls.filter(
        ([, method]) => method === "turn/interrupt",
      ),
    ).toHaveLength(0);
    expect(
      screen.queryByText(/Could not pause goal/i),
    ).not.toBeInTheDocument();
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

  it("detects a reachable structured command preview and opens it in the default browser", async () => {
    prepareSignedInRun();
    const { user } = await renderApp();
    await startMockRun(user, "Start the local preview");

    await emitCodexNotification({
      method: "item/started",
      params: {
        threadId: "thread-1",
        turnId: "turn-1",
        item: {
          id: "command-preview",
          type: "commandExecution",
          command: "npm run dev",
        },
      },
    });
    await emitCodexNotification({
      method: "item/commandExecution/outputDelta",
      params: {
        threadId: "thread-1",
        turnId: "turn-1",
        itemId: "command-preview",
        delta: "  Local: http://localhost:5173/\n",
      },
    });

    await waitFor(() =>
      expect(mocks.updateRunMock).toHaveBeenCalledWith(202, {
        webPreviewJson: expect.stringContaining("http://localhost:5173/"),
      }),
    );
    expect(
      screen.queryByRole("button", {
        name: "Open web preview in browser",
      }),
    ).not.toBeInTheDocument();

    await emitCodexNotification({
      method: "turn/completed",
      params: {
        threadId: "thread-1",
        turnId: "turn-1",
        turn: { id: "turn-1", status: "completed", durationMs: 100 },
      },
    });

    const openPreview = await screen.findByRole("button", {
      name: "Open web preview in browser",
    });

    await user.click(openPreview);
    await waitFor(() =>
      expect(mocks.openUrlMock).toHaveBeenCalledWith(
        "http://localhost:5173/",
      ),
    );
    expect(mocks.openUrlMock).toHaveBeenCalledTimes(1);
  });

  it("detects a port-only ready message from npm start output", async () => {
    prepareSignedInRun();
    const { user } = await renderApp();
    await startMockRun(user, "Start the app");

    await emitCodexNotification({
      method: "item/started",
      params: {
        threadId: "thread-1",
        turnId: "turn-1",
        item: {
          id: "command-npm-start",
          type: "commandExecution",
          command: "/bin/zsh -lc 'npm start'",
        },
      },
    });
    await emitCodexNotification({
      method: "item/commandExecution/outputDelta",
      params: {
        threadId: "thread-1",
        turnId: "turn-1",
        itemId: "command-npm-start",
        delta:
          "\r\n> snake-test@1.0.0 start\r\n> node src/server.js\r\n\r\n",
      },
    });
    await emitCodexNotification({
      method: "item/commandExecution/outputDelta",
      params: {
        threadId: "thread-1",
        turnId: "turn-1",
        itemId: "command-npm-start",
        delta: "Server listening on port 3000\r\n",
      },
    });

    await waitFor(() =>
      expect(mocks.probeLocalWebPreviewMock).toHaveBeenCalledWith(
        "http://localhost:3000/",
      ),
    );
    await waitFor(() =>
      expect(mocks.updateRunMock).toHaveBeenCalledWith(202, {
        webPreviewJson: expect.stringContaining("http://localhost:3000/"),
      }),
    );
    expect(
      screen.queryByRole("button", {
        name: "Open web preview in browser",
      }),
    ).not.toBeInTheDocument();

    await emitCodexNotification({
      method: "turn/completed",
      params: {
        threadId: "thread-1",
        turnId: "turn-1",
        turn: { id: "turn-1", status: "completed", durationMs: 100 },
      },
    });

    expect(
      await screen.findByRole("button", {
        name: "Open web preview in browser",
      }),
    ).toBeInTheDocument();
  });

  it("keeps probing the latest server candidate after the turn completes", async () => {
    prepareSignedInRun();
    mocks.probeLocalWebPreviewMock
      .mockResolvedValueOnce({
        normalizedUrl: "http://localhost:4173/",
        reachable: false,
      })
      .mockResolvedValue({
        normalizedUrl: "http://localhost:4173/",
        reachable: true,
      });
    const { user } = await renderApp();
    await startMockRun(user, "Start a slower preview");

    await emitCodexNotification({
      method: "item/started",
      params: {
        threadId: "thread-1",
        turnId: "turn-1",
        item: {
          id: "command-slow-preview",
          type: "commandExecution",
          command: "vite --port 4173",
        },
      },
    });
    await waitFor(() =>
      expect(mocks.probeLocalWebPreviewMock).toHaveBeenCalledTimes(1),
    );
    await emitCodexNotification({
      method: "turn/completed",
      params: {
        threadId: "thread-1",
        turnId: "turn-1",
        turn: { id: "turn-1", status: "completed", durationMs: 100 },
      },
    });

    expect(
      await screen.findByRole("button", {
        name: "Open web preview in browser",
      }),
    ).toBeInTheDocument();
    expect(mocks.probeLocalWebPreviewMock).toHaveBeenCalledTimes(2);
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
