import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App";
import { AppServices } from "../runtime/AppServices";
import { renderWithAppServices } from "../test/renderWithAppServices";
import { ORCHESTRATOR_CONTEXT_FILE_MIME } from "../features/composer/types";
import type { PromptQueueItem } from "../features/queue/types";
import type { RunListItem } from "../features/runs/types";

const mocks = vi.hoisted(() => ({
  listeners: new Map<string, (event: { payload: unknown }) => void>(),
  openDialogMock: vi.fn(),
  openUrlMock: vi.fn(),
  connectCodexMock: vi.fn(),
  connectDefaultCodexProfileMock: vi.fn(),
  continueTaskInCodexDesktopMock: vi.fn(),
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
  listChatWorktreeBindingsMock: vi.fn(),
  renameChatMock: vi.fn(),
  reconcileSharedNativeThreadsMock: vi.fn(),
  saveChatWorktreeBindingsMock: vi.fn(),
  createChatWithQueuedPromptMock: vi.fn(),
  claimChatTitleGenerationMock: vi.fn(),
  completeChatTitleGenerationMock: vi.fn(),
  failChatTitleGenerationMock: vi.fn(),
  recoverAbandonedRunsMock: vi.fn(),
  recoverInterruptedChatTitleGenerationsMock: vi.fn(),
  recoverInterruptedKanbanAttemptsMock: vi.fn(),
  getKanbanCardForChatMock: vi.fn(),
  rejectKanbanPlanMock: vi.fn(),
  claimKanbanAttemptMock: vi.fn(),
  cleanupKanbanGitMock: vi.fn(),
  loadKanbanBoardMock: vi.fn(),
  loadKanbanGitBindingsMock: vi.fn(),
  readKanbanGitStatusMock: vi.fn(),
  readKanbanGitDiffMock: vi.fn(),
  readKanbanGitFileDiffMock: vi.fn(),
  commitKanbanGitMock: vi.fn(),
  pushKanbanGitMock: vi.fn(),
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

vi.mock("../lib/nativeContextFileDrop", () => ({
  registerNativeContextFileDrop: mocks.registerNativeContextFileDropMock,
}));

vi.mock("../assets/brand/orchestrator-wordmark.png", () => ({
  default: "orchestrator-wordmark.png",
}));

vi.mock("../features/kanban/KanbanWorkspace", async () => {
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
    hasStartedTurn: true,
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
    KanbanWorkspace: ({ onLaunch, onPause, onOpenConversation }: any) => {
      const [result, setResult] = React.useState("idle");
      const run = (
        action: () => Promise<void>,
        pending: string,
        done: string,
      ) => {
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
          <button type="button" onClick={() => onOpenConversation(card)}>
            Open test Kanban conversation
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

vi.mock("../codexClient", () => ({
  cancelCodexLogin: mocks.cancelCodexLoginMock,
  codexDefaultProfileRpc: mocks.codexDefaultProfileRpcMock,
  codexRpc: mocks.codexRpcMock,
  commitWorkspaceChanges: mocks.commitWorkspaceChangesMock,
  connectDefaultCodexProfile: mocks.connectDefaultCodexProfileMock,
  continueTaskInCodexDesktop: mocks.continueTaskInCodexDesktopMock,
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

vi.mock("../features/kanban/api", async () => {
  const actual = await vi.importActual<typeof import("../features/kanban/api")>(
    "../features/kanban/api",
  );
  return {
    ...actual,
    claimKanbanAttempt: mocks.claimKanbanAttemptMock,
    cleanupKanbanGit: mocks.cleanupKanbanGitMock,
    loadKanbanBoard: mocks.loadKanbanBoardMock,
    loadKanbanGitBindings: mocks.loadKanbanGitBindingsMock,
    readKanbanGitStatus: mocks.readKanbanGitStatusMock,
    readKanbanGitDiff: mocks.readKanbanGitDiffMock,
    readKanbanGitFileDiff: mocks.readKanbanGitFileDiffMock,
    commitKanbanGit: mocks.commitKanbanGitMock,
    pushKanbanGit: mocks.pushKanbanGitMock,
    loadKanbanInheritedContext: mocks.loadKanbanInheritedContextMock,
    provisionKanbanGit: mocks.provisionKanbanGitMock,
    reconcileKanbanGit: mocks.reconcileKanbanGitMock,
    recoverInterruptedKanbanAttempts:
      mocks.recoverInterruptedKanbanAttemptsMock,
    rejectKanbanPlan: mocks.rejectKanbanPlanMock,
    getKanbanCardForChat: mocks.getKanbanCardForChatMock,
    saveKanbanGitBindings: mocks.saveKanbanGitBindingsMock,
    updateKanbanAttempt: mocks.updateKanbanAttemptMock,
  };
});

vi.mock("../data/repositories", () => ({
  createAppRepositories: () => ({
    accounts: {
      completeDuplicateProfileCleanup: mocks.completeDuplicateProfileCleanupMock,
      createCodexAccount: mocks.createCodexAccountMock,
      listCodexAccounts: mocks.listCodexAccountsMock,
      listDuplicateProfilesPendingCleanup:
        mocks.listDuplicateProfilesPendingCleanupMock,
      renameCodexAccount: mocks.renameCodexAccountMock,
      setWorkspaceDefaultAccount: vi.fn(),
      setWorkspaceDefaultProfile: vi.fn(),
      softDeleteCodexAccount: mocks.softDeleteCodexAccountMock,
      updateCodexAccount: mocks.updateCodexAccountMock,
    },
    analytics: {
      getAnalyticsSummary: mocks.getAnalyticsSummaryMock,
    },
    chats: {
      activateChatAccountHandoff: mocks.activateChatAccountHandoffMock,
      chatHasPendingPlanReview: mocks.chatHasPendingPlanReviewMock,
      claimChatTitleGeneration: mocks.claimChatTitleGenerationMock,
      completeChatTitleGeneration: mocks.completeChatTitleGenerationMock,
      createChat: mocks.createChatMock,
      failChatTitleGeneration: mocks.failChatTitleGenerationMock,
      getChatRecord: mocks.getChatRecordMock,
      getSharedChatByThreadId: vi.fn().mockResolvedValue(null),
      getNextChatTurnIndex: mocks.getNextChatTurnIndexMock,
      listChatWorktreeBindings: mocks.listChatWorktreeBindingsMock,
      recoverAbandonedRuns: mocks.recoverAbandonedRunsMock,
      recoverInterruptedChatTitleGenerations:
        mocks.recoverInterruptedChatTitleGenerationsMock,
      renameChat: mocks.renameChatMock,
      reconcileSharedNativeThreads: mocks.reconcileSharedNativeThreadsMock,
      saveChatWorktreeBindings: mocks.saveChatWorktreeBindingsMock,
      updateChat: mocks.updateChatMock,
      upsertExternalCodexChats: mocks.upsertExternalCodexChatsMock,
    },
    promptQueue: {
      acceptPromptQueueItem: mocks.acceptPromptQueueItemMock,
      advanceChatConversationRevision: mocks.advanceChatConversationRevisionMock,
      claimPromptQueueItem: mocks.claimPromptQueueItemMock,
      completePromptQueueItem: mocks.completePromptQueueItemMock,
      createChatWithQueuedPrompt: mocks.createChatWithQueuedPromptMock,
      enqueuePromptQueueItem: mocks.enqueuePromptQueueItemMock,
      failPromptQueueItem: mocks.failPromptQueueItemMock,
      holdRestoredPromptQueueItems: mocks.listRestoredPromptQueueItemsMock,
      listPromptQueueItems: mocks.listPromptQueueItemsMock,
      listRestoredPromptQueueItems: mocks.listRestoredPromptQueueItemsMock,
      markPromptQueueItemStale: mocks.markPromptQueueItemStaleMock,
      markPromptQueueItemSteering: mocks.markPromptQueueItemSteeringMock,
      prioritizePromptQueueItem: mocks.prioritizePromptQueueItemMock,
      readPromptQueueItem: mocks.readPromptQueueItemMock,
      recoverInterruptedPromptQueueItems:
        mocks.recoverInterruptedPromptQueueItemsMock,
      removePromptQueueItem: mocks.removePromptQueueItemMock,
      reorderPromptQueueItems: mocks.reorderPromptQueueItemsMock,
      reschedulePromptQueueItemAfterSteeringRace:
        mocks.reschedulePromptQueueItemAfterSteeringRaceMock,
      retryPromptQueueItem: mocks.retryPromptQueueItemMock,
      setPromptQueueItemAutoSend: mocks.setPromptQueueItemAutoSendMock,
      updatePromptQueueItemContextFingerprint:
        mocks.updatePromptQueueItemContextFingerprintMock,
      updatePromptQueueItemSnapshot: mocks.updatePromptQueueItemSnapshotMock,
    },
    runs: {
      appendRunEvent: mocks.appendRunEventMock,
      appendRunEvents: mocks.appendRunEventsMock,
      createRun: mocks.createRunMock,
      createTask: mocks.createTaskMock,
      listWorkspaceRuns: mocks.listWorkspaceRunsMock,
      recordTokenUsage: mocks.recordTokenUsageMock,
      savePreflightReport: mocks.savePreflightReportMock,
      softDeleteRun: mocks.softDeleteRunMock,
      updateRun: mocks.updateRunMock,
      updateTaskStatus: mocks.updateTaskStatusMock,
    },
    transcripts: {
      activateExternalTranscriptSnapshot:
        mocks.activateExternalTranscriptSnapshotMock,
      buildLocalChatHistoryIndex: mocks.buildLocalChatHistoryIndexMock,
      deleteExternalTranscriptSnapshots: vi.fn(),
      getChatWithRuns: mocks.getChatWithRunsMock,
      listChatRunsPage: mocks.listChatRunsPageMock,
      listChatSubagents: mocks.listChatSubagentsMock,
      listLocalChatTranscript: mocks.listLocalChatTranscriptMock,
      listWorkspaceChats: mocks.listWorkspaceChatsMock,
      readExternalChatHistoryIndex: mocks.readExternalChatHistoryIndexMock,
      readExternalTranscriptSnapshot: mocks.readExternalTranscriptSnapshotMock,
      saveExternalChatHistoryIndex: mocks.saveExternalChatHistoryIndexMock,
      softDeleteChat: mocks.softDeleteChatMock,
      upsertRunSubagent: mocks.upsertRunSubagentMock,
    },
    workspaces: {
      listWorkspaces: mocks.listWorkspacesMock,
      softDeleteWorkspace: mocks.softDeleteWorkspaceMock,
      updateWorkspaceSelectedGitRepository:
        mocks.updateWorkspaceSelectedGitRepositoryMock,
      upsertWorkspace: mocks.upsertWorkspaceMock,
    },
  }),
}));

export const workspace = {
  id: 1,
  path: "/repo/orchestrator",
  label: "orchestrator",
  default_account_id: null,
  last_opened_at: "2026-06-22T00:00:00Z",
  created_at: "2026-06-22T00:00:00Z",
};

export const pendingAccount = {
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

export const signedInAccount = {
  ...pendingAccount,
  label: "dev@example.com",
  email: "dev@example.com",
  plan_type: "pro" as const,
  status: "signed_in" as const,
};

export const signedInAccount2 = {
  ...signedInAccount,
  id: 8,
  label: "personal@example.com",
  email: "personal@example.com",
  plan_type: "plus" as const,
};

export const defaultCodexModel = {
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

export const analytics = {
  run_count: 0,
  completed_count: 0,
  failed_count: 0,
  total_tokens: 0,
  cached_tokens: 0,
  avg_duration_ms: null,
};

export const preflight = {
  workspacePath: workspace.path,
  tokenEstimate: 42,
  contextBudget: 128000,
  routeRecommendation: "direct-run" as const,
  improvedPrompt: "Objective\n\nFix auth",
  checks: [],
  recommendations: [],
};

export type WorkspaceRunFixture = RunListItem & {
  latest_diff?: string | null;
};

export function workspaceRunFixture(
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

export function workspaceChatFixture(
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

export function workspaceChatWithRunsFixture(
  chat = workspaceChatFixture(),
  runs = [workspaceRunFixture({ chat_id: chat.id, original_prompt: chat.title })],
) {
  return { chat, runs };
}

export function externalTurnFixture(index: number) {
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

export function externalTranscriptSnapshotFixture(count: number) {
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

export function promptQueueItemFixture(input: {
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

export function updatePromptQueueFixture(
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

export function prepareDefaults() {
  [
    mocks.createChatMock,
    mocks.createTaskMock,
    mocks.createRunMock,
    mocks.continueTaskInCodexDesktopMock,
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
    mocks.getKanbanCardForChatMock,
    mocks.rejectKanbanPlanMock,
    mocks.claimKanbanAttemptMock,
    mocks.cleanupKanbanGitMock,
    mocks.loadKanbanBoardMock,
    mocks.loadKanbanGitBindingsMock,
    mocks.readKanbanGitStatusMock,
    mocks.readKanbanGitDiffMock,
    mocks.commitKanbanGitMock,
    mocks.pushKanbanGitMock,
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
  mocks.continueTaskInCodexDesktopMock.mockResolvedValue(undefined);
  mocks.recoverInterruptedKanbanAttemptsMock.mockResolvedValue(0);
  mocks.getKanbanCardForChatMock.mockResolvedValue(null);
  mocks.rejectKanbanPlanMock.mockResolvedValue(null);
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
      worktreePath:
        "/repo/.codex-kanban/card-run-control-test/orchestrator",
      status: "ready",
      error: null,
    },
  ]);
  mocks.loadKanbanInheritedContextMock.mockResolvedValue(null);
  mocks.readKanbanGitStatusMock.mockImplementation(async (binding) => ({
    binding,
    headCommit: binding.baseCommit,
    baseBranchHead: binding.baseCommit,
    aheadOfBase: 0,
    behindBase: 0,
    aheadOfTarget: 0,
    behindTarget: 0,
    hasChanges: false,
    hasConflicts: false,
    stagedCount: 0,
    unstagedCount: 0,
    untrackedCount: 0,
    files: [],
  }));
  mocks.readKanbanGitDiffMock.mockImplementation(async (binding) => ({
    binding,
    baseCommit: binding.baseCommit,
    headCommit: binding.baseCommit,
    content: "",
    untrackedPaths: [],
    isEmpty: true,
  }));
  mocks.readKanbanGitFileDiffMock.mockImplementation(async (binding, filePath) => ({
    path: `${binding.worktreePath}/${filePath}`,
    relativePath: filePath,
    sections: [],
  }));
  mocks.commitKanbanGitMock.mockImplementation(
    async ({ binding, message }) => ({
      binding,
      status: "committed",
      message,
      branch: binding.cardBranch,
      headCommit: binding.baseCommit,
    }),
  );
  mocks.pushKanbanGitMock.mockImplementation(async (binding) => ({
    binding,
    status: "pushed",
    message: `Pushed ${binding.cardBranch}`,
    branch: binding.cardBranch,
    headCommit: binding.baseCommit,
  }));
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
  mocks.readWorkspaceFilePreviewChunkMock.mockResolvedValue({
    path: "/repo/orchestrator/README.md",
    relativePath: "README.md",
    content: "",
    truncated: false,
    isBinary: false,
    complete: true,
    nextOffset: null,
    totalBytes: 7,
    version: "preview-v1",
  });
  mocks.readWorkspaceFilePreviewVersionMock.mockResolvedValue("preview-v1");
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
  mocks.listChatWorktreeBindingsMock.mockResolvedValue([]);
  mocks.renameChatMock.mockResolvedValue(undefined);
  mocks.saveChatWorktreeBindingsMock.mockResolvedValue(undefined);
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
  mocks.reconcileSharedNativeThreadsMock.mockResolvedValue([]);
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

export let appServices: AppServices;

export function getMocks() {
  return mocks;
}

export async function renderApp() {
  const user = userEvent.setup();
  appServices = new AppServices();
  renderWithAppServices(<App />, {}, appServices);
  await waitFor(() => expect(mocks.listCodexAccountsMock).toHaveBeenCalled());
  return { user };
}

export function createContextFileDataTransfer(files: unknown[]) {
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

export function mockElementRect(element: Element, rect: Partial<DOMRect> = {}) {
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

export function composerInputZone() {
  const zone = screen.getByLabelText("Prompt").closest(".composer-input-zone");
  if (!(zone instanceof HTMLElement)) {
    throw new Error("Composer input zone was not rendered");
  }
  return zone;
}

export async function emitNativeContextFileDrop(
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

export function startPointerDragFileIntoTaskSurface(
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

export function finishPointerDragFileIntoTaskSurface(
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

export function pointerDragFileIntoTaskSurface(fileButton: HTMLElement) {
  startPointerDragFileIntoTaskSurface(fileButton);
  finishPointerDragFileIntoTaskSurface(fileButton);
}

export function pointerTapFile(fileButton: HTMLElement) {
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

export function holdNextAnimationFrames() {
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

export function prepareSignedInRun() {
  mocks.listWorkspacesMock.mockResolvedValue([
    {
      ...workspace,
      default_account_id: signedInAccount.id,
      default_profile_key: `account:${signedInAccount.id}`,
    },
  ]);
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

export function prepareKanbanRun() {
  prepareSignedInRun();
  mocks.listCodexModelsMock.mockResolvedValue([defaultCodexModel]);
  mocks.getChatRecordMock.mockResolvedValue({
    ...workspaceChatFixture({ id: 777, status: "draft", turn_count: 0 }),
    codex_thread_id: null,
  });
  mocks.getNextChatTurnIndexMock.mockResolvedValue(1);
}

export async function startMockRun(user: ReturnType<typeof userEvent.setup>, prompt: string) {
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

export async function emitCodexNotification(message: unknown) {
  await act(async () => {
    mocks.listeners.get("codex:notification")?.({
      payload: { accountId: 7, message },
    });
    await Promise.resolve();
  });
}

export async function emitCodexServerRequest(
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

export function setWindowWidth(width: number) {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    writable: true,
    value: width,
  });
  window.dispatchEvent(new Event("resize"));
}

export {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
  userEvent,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  AppServices,
  renderWithAppServices,
  ORCHESTRATOR_CONTEXT_FILE_MIME,
};
export type { PromptQueueItem, RunListItem };
