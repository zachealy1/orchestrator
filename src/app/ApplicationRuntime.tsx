import { open } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import { listen } from "@tauri-apps/api/event";
import {
  AlertCircle,
  BarChart3,
  FileText,
  RefreshCw,
  Settings,
  Trash2,
} from "lucide-react";
import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { flushSync } from "react-dom";
import type {
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from "react";
import "../App.css";
import {
  buildCommitIntentContext,
} from "../lib/commitMessage";
import {
  clearRunningGitOperation,
  gitOperationFailureCopy,
  gitOperationRetryLabel,
  gitOperationRunningCopy,
  gitOperationSuccessCopy,
  persistRunningGitOperation,
  type GitOperationPhase,
  type WorkspaceGitOperationRequest,
  type WorkspaceGitOperationState,
} from "../lib/gitOperations";
import type { RunEventInput } from "../data/repositories";
import {
  cancelCodexLogin,
  cancelDefaultProfileThreadTranscript,
  codexDefaultProfileRpc,
  codexRpc,
  commitWorkspaceChanges,
  connectDefaultCodexProfile,
  connectCodex,
  checkoutGitBranch,
  createGitBranch,
  deleteCodexProfile,
  generateWorkspaceCommitMessage,
  generateChatTitle,
  focusBrowserSession,
  inspectPromptQueueContext,
  inspectDroppedContextPaths,
  listGitBranches,
  listCodexModels,
  listCodexSkills,
  listWorkspaceGitStatus,
  listWorkspaceDirectory,
  loadDefaultProfileTurnActivity,
  logoutCodexAccount,
  pushWorkspaceBranch,
  readActiveCodexLogin,
  readDefaultCodexFile,
  readCodexFile,
  readCodexAccount,
  readBrowserSessionStatus,
  readProjectedSubagentThread,
  resolveCodexServerRequest,
  resolveDefaultCodexServerRequest,
  removeAgentNotification,
  requestAgentNotificationPermission,
  prepareBrowserSession,
  probeLocalWebPreview,
  runPreflight,
  setThreadGoal,
  startCodexLogin,
  stopCodex,
  stopDefaultCodexProfile,
  stopBrowserSession,
  sendAgentNotification,
  syncDefaultProfileThreadTranscript,
  takePendingAgentNotificationActivation,
  updateBrowserSessionTarget,
  undoWorkspaceGitDiff,
  openAgentNotificationSettings,
} from "../codexClient";
import {
  fallbackChatTitle,
  GENERATING_CHAT_TITLE,
  sanitizeGeneratedChatTitle,
} from "../lib/chatTitles";
import { AnalyticsSummary } from "../components/AnalyticsSummary";
import type { ComposerSelectOption } from "../components/ComposerSelect";
import { FilePreviewDrawer } from "../components/FilePreviewDrawer";
import type { TaskChatEntry } from "../components/TaskChatTurn";
import {
  VirtuosoTaskChatTranscript,
  type TranscriptNotificationFocusRequest,
  type TranscriptViewportSnapshot,
  type VirtuosoTaskChatTranscriptHandle,
} from "../components/VirtuosoTaskChatTranscript";
import { TaskTranscriptErrorBoundary } from "../components/TaskTranscriptErrorBoundary";
import { TaskComposer } from "../components/TaskComposer";
import { SubagentInspector } from "../components/SubagentInspector";
import { KanbanWorkspace } from "../features/kanban/KanbanWorkspace";
import {
  createKanbanCard,
  getKanbanCardForChat,
  loadKanbanGitBindings,
  recoverInterruptedKanbanAttempts,
  reopenKanbanCard,
  type KanbanCardRecord,
  type KanbanGitBinding,
} from "../features/kanban/api";
import {
  KanbanAttemptStateController,
  acknowledgeKanbanStopWithTurn,
  createPendingKanbanStopRequest,
  kanbanStatusAfterFailedStop,
} from "../features/kanban/attemptLifecycle";
import { useKanbanRuntimeController } from "../features/kanban/useKanbanRuntimeController";
import {
  beginGithubConnection,
  cancelGithubConnection,
  disconnectGithub,
  loadGithubConnection,
  type GithubConnectionStatus,
} from "../features/github/api";
import {
  persistWorkspaceSurfaceMode,
  readWorkspaceSurfaceMode,
  type WorkspaceSurfaceMode,
} from "../features/kanban/preferences";
import {
  FLOATING_STATUS_NOTICE_TIMEOUT_MS,
  FloatingHeaderStatusBubble,
  type FloatingStatusNotice,
} from "../components/FloatingHeaderStatusBubble";
import {
  addApprovalRequest,
  addServerRequest,
  applyCodexMessage,
  emptyRunView,
  markApprovalAwaitingResolution,
  markApprovalError,
  markApprovalSubmitting,
  resolveApprovalRequest,
  resolveServerRequest,
  setServerRequestSubmissionState,
  updateNativePlanReview,
  updateRunElapsed,
  type RunEditedFile,
  type RunViewState,
} from "../lib/codexEventReducer";
import {
  findSafeApprovalDenialChoice,
  parseApprovalRequest,
  type ApprovalChoice,
  type CodexApprovalRequest,
} from "../lib/codexApprovals";
import { selectRunControlForIds } from "../lib/runControlRouting";
import {
  ASK_FOR_APPROVAL_PERMISSION_PROFILE,
  accessModeWarning,
  accessSettings,
  persistCodexAccessPreference,
  readCodexAccessPreference,
  type CodexAccessSettings,
} from "../lib/codexAccess";
import {
  createRunExecutionSettings,
  serializeRunExecutionSettings,
} from "../lib/runExecutionSettings";
import {
  comparePromptQueueDisplayOrder,
  comparePromptQueueDispatchOrder,
  createPromptQueueItemId,
  createQueuedPromptSnapshot,
  isPromptQueueItemAutoDispatchEligible,
  isPromptQueueItemMutable,
  isPromptQueueItemPending,
  rebaselinePromptQueueContextFingerprint,
  validatePromptQueueDraft,
} from "../lib/promptQueue";
import {
  buildCodexTurnInput,
  isImageContextFile,
  normalizeContextFileMedia,
  prepareContextImageFiles,
} from "../lib/imageAttachments";
import {
  createStableClientMessageId,
  isCollaborationModeMask,
  isNativeUserInputRequest,
  requestKey,
  selectNativePlanModes,
  type CollaborationMode,
  type CollaborationModeMask,
  type NativeUserInputRequest,
  type RunIntent,
  type UserInputResponse,
} from "../lib/nativePlanMode";
import {
  deriveGoalProgressIndicator,
  goalKeepsRunOpen,
  parseThreadGoal,
  type GoalProgressAction,
  type ThreadGoalSetResponse,
  type ThreadGoalStatus,
} from "../lib/goalProgress";
import { derivePlanProgressIndicator } from "../lib/planProgress";
import {
  isActiveSubagentStatus,
  lifecycleFromChildTurn,
  lifecycleFromCollabToolCall,
  parseCollabToolCalls,
  parseLegacySubagentActivity,
  subagentConversationKey,
  type SubagentRecord,
} from "../lib/subagents";
import { useAppServices } from "../runtime/AppServices";
import {
  formatCodexAuthMessage,
  getCodexAccountSummary,
  formatLoginStartStatus,
  isCodexSignedIn,
  shouldBlockRunForAuth,
} from "../lib/codexAuth";
import {
  cancelHistoricalTranscriptPreparation,
  HISTORICAL_RENDER_PIPELINE_VERSION,
  prepareHistoricalTranscript,
} from "../lib/historicalTranscriptPreparation";
import { useConversationLayoutController } from "../features/conversations/useConversationLayoutController";
import {
  HistoryChatLoading,
  WorkspaceHistoryDrawer,
} from "../features/conversations/WorkspaceHistoryDrawer";
import {
  buildPreviousChatContext,
  createTaskChatEntriesFromExternalTranscriptSnapshot,
  createTaskChatEntryFromHistoryRun,
  formatHistoryTimestamp,
  historyActivityTime,
  historyChatVersion,
  isAdoptedExternalChat,
  normalizeHistoricalProposedPlan,
} from "../features/conversations/historyProjection";
import {
  buildRunPrompt,
  estimateTokens,
  improvePrompt,
} from "../lib/taskAnalysis";
import {
  coalesceFrameBatchedCodexMessages,
  shouldFrameBatchCodexMessage,
} from "../lib/codexNotificationBatch";
import {
  commandOutputTail,
  extractLocalWebPreviewCandidates,
  readWebPreviewCommandSignal,
  serializeRunWebPreview,
  type RunWebPreview,
} from "../lib/webPreview";
import {
  restorePromptInlineFileReferencesForComposer,
  serializePromptInlineFileReferences,
} from "../lib/contextFiles";
import {
  registerNativeContextFileDrop,
  type NativeContextFileDropEvent,
} from "../lib/nativeContextFileDrop";
import {
  useMacOsWindowDragRegionsEnabled,
  windowDragRegionValue,
} from "../lib/windowDragging";
import {
  buildSafeAgentNotificationCopy,
  createAgentNotificationEventKey,
  isAgentNotificationTargetNavigable,
  readAgentNotificationPreferences,
  recordAgentNotificationDelivered,
  shouldSendAgentNotification,
  wasAgentNotificationDelivered,
  type AgentNotificationKind,
  type AgentNotificationPreferences,
  type AgentNotificationTarget,
} from "../lib/agentNotifications";
import type { ActiveCodexLogin, AccountLoginCompletedNotification, AccountUpdatedNotification, CodexAccessMode, CodexMessage, CodexLoginState, CodexModel, CodexProcessEvent, CodexProfileKey, RunInteractionMode } from "../features/codex/types";
import type { AdditionalContextEntry, PreflightReport, RunExecutionSettings } from "../features/runs/types";
import { useAnalyticsController } from "../features/analytics/useAnalyticsController";
import type { ChatListItem, ChatRecord, HistoricalChatOpenRequest, HistoricalTranscriptState, WorkspaceChatSession } from "../features/conversations/types";
import { useConversationController } from "../features/conversations/useConversationController";
import { ChatDeleteDialog } from "../features/conversations/ChatDeleteDialog";
import {
  createTaskChatClientId,
  mergeCommandActivities,
  mergeEditedFileActivities,
  replaceChatEntries,
} from "../features/conversations/runtimeHelpers";
import type {
  AgentNotificationNavigationPhase,
  PendingApprovalAttention,
} from "../features/notifications/types";
import { useNotificationController } from "../features/notifications/useNotificationController";
import {
  approvalNotificationEventKey,
  externalActionNotificationEventKey,
  planNotificationEventKey,
  userInputNotificationEventKey,
} from "../features/notifications/eventKeys";
import {
  approvalRequestMatchesRun,
  pendingApprovalCouldBelongToControl,
  pendingApprovalMatchesEntry,
} from "../features/notifications/approvalRouting";
import { SettingsView } from "../features/settings/SettingsView";
import type { BrowserSessionState } from "../features/browser/types";
import { useComputerUseController } from "../features/browser/useComputerUseController";
import { cleanupAbandonedCodexProfiles } from "../features/accounts/abandonedProfiles";
import type {
  CodexAccountProfile,
  CodexAccountStatus,
  PendingAccountHandoff,
} from "../features/accounts/types";
import {
  buildBoundedAccountHandoffContext,
  type AccountHandoffContextTurn,
} from "../features/accounts/handoff";
import { useAccountController } from "../features/accounts/useAccountController";
import { AccountHandoffDialog } from "../features/accounts/AccountHandoffDialog";
import {
  CodexAccountCard,
  type AuthRowState,
} from "../features/accounts/CodexAccountCard";
import type {
  CodexSkillSummary,
  ComposerContextFile,
  SlashCommandItem,
} from "../features/composer/types";
import { useComposerController } from "../features/composer/useComposerController";
import type { PromptQueueContextFingerprint, PromptQueueItem, PromptQueueComposerEditState } from "../features/queue/types";
import { usePromptQueueController } from "../features/queue/usePromptQueueController";
import { useAppearanceController } from "../features/settings/useAppearanceController";
import type {
  Workspace,
  WorkspaceGitFileStatus,
  WorkspaceGitOverview,
  WorkspaceGitStatusSnapshot,
  WorkspaceTreeEntry,
} from "../features/workspaces/types";
import {
  filesIncludedInCommitMessage,
  gitChangeFingerprint,
  gitStatusSnapshotKey,
  normalizeWorkspaceGitOverview,
  preferredWorkspaceGitRepository,
  summarizeWorkspaceGitFiles,
  summarizeWorkspaceGitStatus,
  workspaceCacheKey,
  type HeaderGitAction,
} from "../features/workspaces/gitModel";
import { WorkspaceContextBanner } from "../features/workspaces/WorkspaceContextBanner";
import { useWorkspaceController } from "../features/workspaces/useWorkspaceController";
import { useWorkspacePreviewController } from "../features/workspaces/useWorkspacePreviewController";
import { WorkspaceSidebar } from "../features/workspaces/WorkspaceSidebar";
import {
  BranchCreationDialog,
} from "../features/workspaces/BranchCreationDialog";
import { WorkspaceDeleteDialog } from "../features/workspaces/WorkspaceDeleteDialog";
import { GitActionDialog } from "../features/workspaces/GitActionDialog";
import {
  PlanImplementationDialog,
} from "../features/runs/PlanImplementationDialog";
import {
  GoalEditDialog,
  type GoalEditCandidate,
} from "../features/runs/GoalEditDialog";
import {
  RunStoppedError,
  isActiveRunControl,
  type AccountHandoffRunStrategy,
  type ActiveRunControl,
  type ChatTitleGenerationRequest,
  type PendingKanbanStopRequest,
  type PlanFollowUpExecutionSelection,
  type RunPersistenceStageResult,
  type RunPreparationStageResult,
  type RunSetupFailureState,
  type RunSetupSnapshot,
  type RunThreadStageResult,
  type RunTurnPayloadStageResult,
  type StartedRunThread,
  type StopActiveRunResult,
  type WebPreviewProbeAttempt,
} from "../features/runs/runtimeTypes";
import { useRunController } from "../features/runs/useRunController";
import {
  BUILTIN_SLASH_COMMANDS,
  addPlanImplementationProgressInstructions,
  applyPromptDraft,
  applySelectedSkillsToPrompt,
  buildCodeReviewDraft,
  buildComposerStatusMessage,
  buildInitInstructionsDraft,
  buildSlashCommandResults,
  contextFileFromPath,
  formatReasoningEffort,
  mergeContextFiles,
  normalizeDialogSelection,
  parseSavedDefaultCollaborationMode,
  pruneMissingInlineContextFiles,
} from "../features/composer/promptHelpers";
import {
  collectWorkspaceFiles,
  normalizeWorkspacePath,
  searchWorkspaceFiles,
  workspaceFileEntryFromResponseLink,
} from "../features/workspaces/workspaceFiles";
import {
  cleanGeneratedCommitSubject,
  generatedCommitSubjectRejectionReason,
} from "../features/workspaces/commitSubjectValidation";
import {
  accountIdFromProfileKey,
  formatMcpStatus,
  getCodexModelContextWindow,
  isCodexThreadNotFoundError,
  isCodexTurnAlreadyTerminalError,
  readAccountLoginCompleted,
  readAccountUpdated,
  readExpectedActiveTurnId,
  readTokenUsage,
} from "../features/codex/runtimeHelpers";
import {
  readArray,
  readNumber,
  readObject,
  readString,
} from "../shared/valueReaders";
import {
  markPerformance,
  scheduleAfterNextPaint,
  useStableEvent,
  waitForNextPaint,
} from "../shared/reactRuntime";
import { workspaceTreeEntriesEqual } from "../features/workspaces/treeHelpers";
import {
  readCodexMessageRunIdentity,
  readSubagentError,
  readSubagentTurnStatus,
  readSubagentVisibleResult,
} from "../features/subagents/eventProjection";
import {
  AGENT_NOTIFICATION_FOCUS_TIMEOUT_MS,
  BACKGROUND_INTERACTION_GRACE_MS,
  BACKGROUND_REFRESH_RETRY_MS,
  BUFFERABLE_RUN_NOTIFICATION_METHODS,
  CODEX_LOGIN_TIMEOUT_MS,
  COMMIT_MESSAGE_GENERATION_ERROR,
  DEFAULT_CODEX_PROFILE_KEY,
  DEFAULT_CONTEXT_WINDOW,
  EMPTY_GIT_STATUS_BY_PATH,
  EXTERNAL_CODEX_SOURCE_KINDS,
  GIT_STATUS_AUTO_REFRESH_INTERVAL_MS,
  HISTORY_ACTIVITY_PAGE_SIZE,
  HISTORY_CHAT_PAGE_SIZE,
  HISTORY_VIRTUOSO_BASE_INDEX,
  RUN_NOTIFICATION_BINDING_BUFFER_LIMIT,
  RUN_NOTIFICATION_BINDING_TTL_MS,
  TASK_QUOTES,
  WEB_PREVIEW_PROBE_RETRY_DELAYS_MS,
} from "./runtimeConstants";
import type { AppView } from "./types";
import { DuplicateCodexAccountError } from "../features/accounts/errors";
import type {
  LoadWorkspaceHistoryOptions,
  SelectHistoryChatOptions,
  WorkspaceTaskMemory,
  WorkspaceTaskSelection,
} from "../features/conversations/runtimeState";
import type {
  AgentNotificationNavigationResult,
  PendingRunBindingNotification,
} from "../features/notifications/runtimeState";
import type {
  CommitMessageGenerationSnapshot,
  RefreshWorkspaceGitStatusOptions,
} from "../features/workspaces/runtimeState";
import {
  collectStartupWarnings,
  withStartupFallback,
} from "./bootstrapRecovery";

type KanbanChatGitContext = {
  chatId: number;
  cardId: string;
  bindings: KanbanGitBinding[];
};

function App() {
  const appServices = useAppServices();
  const {
    imageAttachments,
    repositories,
    subagents: subagentStore,
    activeRuns: activeRunRegistry,
    workspaceFilePreviews,
  } = appServices;
  const {
    completeDuplicateProfileCleanup,
    createCodexAccount,
    listCodexAccounts,
    listDuplicateProfilesPendingCleanup,
    renameCodexAccount,
    softDeleteCodexAccount,
    updateCodexAccount,
  } = repositories.accounts;
  const { getAnalyticsSummary } = repositories.analytics;
  const {
    activateChatAccountHandoff,
    chatHasPendingPlanReview,
    claimChatTitleGeneration,
    completeChatTitleGeneration,
    createChat,
    failChatTitleGeneration,
    getChatRecord,
    getNextChatTurnIndex,
    recoverAbandonedRuns,
    recoverInterruptedChatTitleGenerations,
    updateChat,
    upsertExternalCodexChats,
  } = repositories.chats;
  const {
    acceptPromptQueueItem,
    advanceChatConversationRevision,
    claimPromptQueueItem,
    completePromptQueueItem,
    createChatWithQueuedPrompt,
    enqueuePromptQueueItem,
    failPromptQueueItem,
    holdRestoredPromptQueueItems,
    listPromptQueueItems,
    markPromptQueueItemSteering,
    prioritizePromptQueueItem,
    readPromptQueueItem,
    recoverInterruptedPromptQueueItems,
    removePromptQueueItem,
    reorderPromptQueueItems,
    reschedulePromptQueueItemAfterSteeringRace,
    retryPromptQueueItem,
    setPromptQueueItemAutoSend,
    updatePromptQueueItemContextFingerprint,
    updatePromptQueueItemSnapshot,
  } = repositories.promptQueue;
  const {
    appendRunEvent,
    createRun,
    createTask,
    recordTokenUsage,
    savePreflightReport,
    softDeleteRun,
    updateRun,
    updateTaskStatus,
  } = repositories.runs;
  const {
    activateExternalTranscriptSnapshot,
    getChatWithRuns,
    listChatSubagents,
    listLocalChatTranscript,
    listWorkspaceChats,
    readExternalTranscriptSnapshot,
    softDeleteChat,
    upsertRunSubagent,
  } = repositories.transcripts;
  const {
    listWorkspaces,
    softDeleteWorkspace,
    updateWorkspaceSelectedGitRepository,
    upsertWorkspace,
  } = repositories.workspaces;
  const {
    codexAccounts,
    setCodexAccounts,
    codexAccountsRef,
    selectedAccountId,
    setSelectedAccountId,
    selectedAccountIdRef,
    connectedAccountIds,
    setConnectedAccountIds,
    connectedAccountIdsRef,
    codexAccount,
    setCodexAccount,
    requiresOpenaiAuth,
    setRequiresOpenaiAuth,
    loginState,
    setLoginState,
    pendingLoginId,
    setPendingLoginId,
    pendingLoginIdRef,
    pendingLoginAccountId,
    setPendingLoginAccountId,
    pendingLoginAccountIdRef,
    activeCodexLogin,
    setActiveCodexLogin,
    loginUserCode,
    setLoginUserCode,
    loginError,
    setLoginError,
    accountMenuOpen,
    setAccountMenuOpen,
    accountMenuContainerRef,
    useOss,
    setUseOss,
    ossProvider,
    setOssProvider,
    models,
    setModels,
    modelsRef,
    modelLoadError,
    setModelLoadError,
    modelLoadErrorRef,
    selectedModelId,
    setSelectedModelId,
    selectedReasoningEffort,
    setSelectedReasoningEffort,
    pendingAccountHandoffs,
    setPendingAccountHandoffs,
    pendingAccountHandoffsRef,
    accountHandoffCandidate,
    setAccountHandoffCandidate,
  } = useAccountController();
  const {
    prompt,
    promptRevision,
    promptRef,
    replaceComposerPrompt,
    goalMode,
    setGoalMode,
    planMode,
    setPlanMode,
    accessMode,
    setAccessMode,
    contextFiles,
    setContextFiles,
    contextFilesRef,
    selectedSkills,
    setSelectedSkills,
    selectedSkillsRef,
    taskContextDropActive,
    setTaskContextDropActive,
    taskContextDropActiveRef,
    nativeContextDropPathsRef,
    explorerDragPreview,
    setExplorerDragPreview,
    explorerDragContextFileRef,
    explorerPointerDragRef,
    explorerPointerDragCleanupRef,
    suppressWorkspaceFileClickRef,
    taskContextDropSurfaceRef,
    taskComposerPromptRef,
    handleTaskComposerDropSurfaceElementChange,
    handleTaskComposerPromptElementChange,
    mentionResults,
    setMentionResults,
    mentionSearchStatus,
    setMentionSearchStatus,
    mentionSearchError,
    setMentionSearchError,
    slashCommandResults,
    setSlashCommandResults,
    slashCommandSearchStatus,
    setSlashCommandSearchStatus,
    slashCommandSearchError,
    setSlashCommandSearchError,
  } = useComposerController({
    initialAccessMode: readCodexAccessPreference().accessMode,
    initialSlashCommands: BUILTIN_SLASH_COMMANDS,
  });
  const {
    workspaces,
    setWorkspaces,
    workspacesRef,
    selectedWorkspace,
    setSelectedWorkspace,
    selectedWorkspaceRef,
    workspaceLocationsKey,
    workspaceContextMenu,
    setWorkspaceContextMenu,
    workspaceContextMenuRef,
    workspaceDeleteCandidate,
    setWorkspaceDeleteCandidate,
    expandedWorkspaceIds,
    setExpandedWorkspaceIds,
    expandedDirectoryPaths,
    setExpandedDirectoryPaths,
    directoryStates,
    setDirectoryStates,
    directoryEntriesCache,
    directoryRequestCache,
    directoryRequestGenerations,
    gitStatusStates,
    setGitStatusStates,
    branches,
    setBranches,
    selectedBranch,
    setSelectedBranch,
    branchCreationDialog,
    setBranchCreationDialog,
    branchCreationPendingWorkspaceId,
    setBranchCreationPendingWorkspaceId,
    branchCreationInputRef,
    branchCreationInFlightRef,
    commitDialogOpen,
    setCommitDialogOpen,
    commitIntentContext,
    setCommitIntentContext,
    commitMessage,
    setCommitMessage,
    commitDialogMessage,
    setCommitDialogMessage,
    commitDialogError,
    setCommitDialogError,
    includeUnstagedChanges,
    setIncludeUnstagedChanges,
    gitOperationsByWorkspace,
    setGitOperationsByWorkspace,
    lastCommitSubjectsRef,
    gitActionInFlightRef,
    gitOperationInFlightWorkspaceIdsRef,
    gitOperationSequenceRef,
    gitStatusRefreshCache,
    workspaceFileIndexCache,
    workspaceFileIndexRequestCache,
  } = useWorkspaceController();
  const [kanbanChatGitContext, setKanbanChatGitContext] =
    useState<KanbanChatGitContext | null>(null);
  const {
    taskChatEntries,
    setTaskChatEntries,
    taskChatEntriesRef,
    activeChatEntryId,
    setActiveChatEntryId,
    activeChatEntryIdRef,
    selectedDraftChatEntryId,
    setSelectedDraftChatEntryId,
    selectedDraftChatEntryIdRef,
    unreadCompletedChats,
    setUnreadCompletedChats,
    historyState,
    setHistoryState,
    historyStateRef,
    historyChatLoadState,
    setHistoryChatLoadState,
    selectedHistoryChatId,
    setSelectedHistoryChatId,
    historyOpenRequest,
    setHistoryOpenRequest,
    historicalTranscript,
    setHistoricalTranscript,
    historicalTranscriptRef,
    workspaceChatSessions,
    setWorkspaceChatSessions,
    workspaceChatSessionsRef,
    chatHistoryContextMenu,
    setChatHistoryContextMenu,
    chatHistoryContextMenuRef,
    chatHistoryDeleteCandidate,
    setChatHistoryDeleteCandidate,
    historyChatLoadIdRef,
  } = useConversationController();
  const {
    promptQueuesByChat,
    setPromptQueuesByChat,
    promptQueuesByChatRef,
    promptQueueActionPendingItemId,
    setPromptQueueActionPendingItemId,
    promptQueueComposerEdit,
    setPromptQueueComposerEdit,
    promptQueueComposerEditRef,
    pausedPromptQueueChatIdsRef,
    promptQueuePauseReasonsRef,
    promptQueueEnqueueOperationsRef,
    promptQueuePendingSubmissionKeysRef,
    promptQueueClaimLocksRef,
    promptQueueActionLocksRef,
    promptQueueDispatchTimersRef,
    setChatPromptQueue,
    upsertPromptQueueItem: upsertPromptQueueItemInMemory,
    removePromptQueueItem: removePromptQueueItemFromMemory,
    refreshPromptQueue,
    setPromptQueuePaused,
  } = usePromptQueueController({ listItems: listPromptQueueItems });
  const {
    agentNotificationPreferences,
    setAgentNotificationPreferences,
    agentNotificationPreferencesRef,
    agentNotificationPermission,
    setAgentNotificationPermission,
    agentNotificationPermissionRef,
    appFocusedRef,
    appVisibleRef,
    transcriptNotificationFocusRequest,
    setTranscriptNotificationFocusRequest,
    setAgentNotificationNavigation,
    unroutedApprovals,
    setUnroutedApprovals,
    unroutedApprovalsRef,
    approvalSafetyWarning,
    setApprovalSafetyWarning,
    editedPromptNotice,
    setEditedPromptNotice,
    handledNotificationActivationKeysRef,
    notificationActivationsInFlightRef,
    pendingNotificationDeliveryKeysRef,
    bootstrapCompleteRef,
    pendingNotificationActivationRef,
    notificationFocusSequenceRef,
    notificationNavigationSequenceRef,
    pendingAgentNotificationFocusRef,
    orphanApprovalResolutionLocksRef,
    resolvedOrphanApprovalKeysRef,
    userInputAutoResolutionTimersRef,
    requestActionLocksRef,
  } = useNotificationController(readAgentNotificationPreferences());
  const { themePreference, setThemePreference, resolvedTheme } =
    useAppearanceController();
  const { computerUseEnabled, setComputerUseEnabled, browserRuntimeStatus } =
    useComputerUseController();
  const macOsWindowDragRegionsEnabled = useMacOsWindowDragRegionsEnabled();
  const selfWindowDragRegion = windowDragRegionValue(
    macOsWindowDragRegionsEnabled,
    "true",
  );
  const deepWindowDragRegion = windowDragRegionValue(
    macOsWindowDragRegionsEnabled,
    "deep",
  );
  const { analytics, refreshAnalytics: refreshWorkspaceData } =
    useAnalyticsController({ loadSummary: getAnalyticsSummary });
  const [activeView, setActiveView] = useState<AppView>("task");
  const [workspaceSurfaceMode, setWorkspaceSurfaceMode] =
    useState<WorkspaceSurfaceMode>(readWorkspaceSurfaceMode);
  const [kanbanToolbarHost, setKanbanToolbarHost] =
    useState<HTMLDivElement | null>(null);
  const [kanbanRefreshToken, setKanbanRefreshToken] = useState(0);
  const [githubConnection, setGithubConnection] =
    useState<GithubConnectionStatus | null>(null);
  const [githubConnectionPending, setGithubConnectionPending] = useState(false);
  const [kanbanCardCreatePending, setKanbanCardCreatePending] = useState(false);
  const kanbanCardCreatePendingRef = useRef(false);
  const kanbanConversationNavigationIdRef = useRef(0);
  const [retainTranscriptDuringWorkspaceSwitch, setRetainTranscriptDuringWorkspaceSwitch] =
    useState(false);
  const kanbanAttempts = useMemo(
    () =>
      new KanbanAttemptStateController({
        onBoardChanged: () => setKanbanRefreshToken((current) => current + 1),
      }),
    [],
  );
  const {
    preflightRef,
    runView,
    setRunView,
    runViewRef,
    activeRunControlRef,
    currentRunId,
    currentTaskId,
    currentRunAccountId,
    currentRunProfileKey,
    planImplementationDialog,
    setPlanImplementationDialog,
    planImplementationDialogRequestRef,
    planImplementationDialogRef,
    planImplementationReturnFocusRef,
    goalEditCandidate,
    setGoalEditCandidate,
    goalTermination,
    setGoalTermination,
    collaborationModeMasksRef,
    planActionLocksRef,
  } = useRunController();
  const activeRunRegistryVersion = useSyncExternalStore(
    activeRunRegistry.subscribe,
    activeRunRegistry.getSnapshot,
    activeRunRegistry.getSnapshot,
  );
  const conversationLayout = useConversationLayoutController();
  const {
    drawerPhase: historyDrawerPhase,
    drawerOpen: historyDrawerOpen,
    drawerSpaceReserved: historyDrawerSpaceReserved,
    inspectorTarget: subagentInspectorTarget,
    inspectorTargetRef: subagentInspectorTargetRef,
    taskViewportElement,
    taskViewportWidth,
    taskViewportStable,
    setTaskViewportElement,
    closeDrawer: closeHistoryDrawer,
    toggleDrawer: toggleHistoryDrawer,
    waitForDrawerClosed: waitForHistoryDrawerClosed,
    handleDrawerTransitionEnd: handleHistoryDrawerTransitionEnd,
    openInspector: openConversationInspector,
    closeInspector: closeSubagentInspector,
    handleTranscriptScrollActivityChange,
    deferStableTranscriptCommit,
    markTranscriptViewportUnstable,
    waitForTranscriptViewportStable,
    cancelPendingTranscriptCommit,
    resetTranscriptInteraction,
    isTranscriptScrolling,
    isTranscriptViewportStable,
    getDrawerPhase,
  } = conversationLayout;
  const [statusMessage, setStatusMessage] = useState("Choose a workspace to begin.");
  const activeViewRef = useRef<AppView>("task");
  const chatTitleGenerationsInFlightRef = useRef(new Set<number>());
  const workspaceTaskMemories = appServices.workspaceTaskMemories;
  const taskChatTranscriptRef =
    useRef<VirtuosoTaskChatTranscriptHandle | null>(null);
  const taskChatTranscriptHasMountedRef = useRef(false);
  const lastForegroundInteractionAtRef = useRef(0);
  const activeExternalTranscriptSyncRef = useRef<{
    chatId: number;
    requestId: string;
  } | null>(null);
  const historicalPreparationAbortRef = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      historicalPreparationAbortRef.current?.abort();
      cancelHistoricalTranscriptPreparation();
    },
    [],
  );
  activeViewRef.current = activeView;
  const pendingRunBindingNotificationsRef = useRef<
    PendingRunBindingNotification[]
  >([]);
  const mentionSearchRequestId = useRef(0);
  const slashCommandSearchRequestId = useRef(0);
  const codexSkillCache = useRef(new Map<number, CodexSkillSummary[]>());
  const codexSkillRequestCache = useRef(
    new Map<number, Promise<CodexSkillSummary[]>>(),
  );
  const openSubagentInspector = useCallback(
    (record: SubagentRecord) => {
      const conversationKey = subagentConversationKey(record);
      if (!conversationKey) return;
      openConversationInspector({ conversationKey, subagentId: record.id });
    },
    [openConversationInspector],
  );

  const loadSubagentTranscript = useStableEvent(
    async (record: SubagentRecord) => {
      await ensureCodexProfileConnected(
        record.profileKey as CodexProfileKey,
        record.accountId,
      );
      return readProjectedSubagentThread({
        accountId: record.accountId,
        profileKey: record.profileKey,
        threadId: record.childThreadId,
      });
    },
  );

  const steerSubagent = useStableEvent(
    async (record: SubagentRecord, instruction: string) => {
      const current =
        subagentStore.findByThread(record.profileKey, record.childThreadId) ??
        record;
      if (
        !current.childTurnId ||
        !isActiveSubagentStatus(current.status) ||
        current.needsAttention
      ) {
        throw new Error(
          "This subagent does not have an active turn that can accept instructions.",
        );
      }
      await ensureCodexProfileConnected(
        current.profileKey as CodexProfileKey,
        current.accountId,
      );
      await codexRpcForProfile(
        current.profileKey as CodexProfileKey,
        current.accountId,
        "turn/steer",
        {
          threadId: current.childThreadId,
          expectedTurnId: current.childTurnId,
          clientUserMessageId: createStableClientMessageId(),
          input: [{ type: "text", text: instruction.trim() }],
        },
      );
      const updated = {
        ...current,
        status: "running" as const,
        error: null,
        updatedAt: new Date().toISOString(),
      };
      saveSubagentRecord(updated);
    },
  );

  const stopSubagent = useStableEvent(async (record: SubagentRecord) => {
    const records = subagentStore.getConversation(
      subagentConversationKey(record),
    );
    const byThread = new Map(
      records.map((candidate) => [candidate.childThreadId, candidate]),
    );
    const isDescendantOf = (
      candidate: SubagentRecord,
      ancestorThreadId: string,
    ) => {
      let parentThreadId = candidate.parentThreadId;
      const visited = new Set<string>();
      while (parentThreadId && !visited.has(parentThreadId)) {
        if (parentThreadId === ancestorThreadId) return true;
        visited.add(parentThreadId);
        parentThreadId =
          byThread.get(parentThreadId)?.parentThreadId ?? "";
      }
      return false;
    };
    const hierarchyDepth = (candidate: SubagentRecord) => {
      let depth = 1;
      let parentThreadId = candidate.parentThreadId;
      const visited = new Set<string>([candidate.childThreadId]);
      while (parentThreadId && !visited.has(parentThreadId)) {
        visited.add(parentThreadId);
        const parent = byThread.get(parentThreadId);
        if (!parent) break;
        depth += 1;
        parentThreadId = parent.parentThreadId;
      }
      return depth;
    };
    const targets = records
      .filter(
        (candidate) =>
          isActiveSubagentStatus(candidate.status) &&
          (candidate.childThreadId === record.childThreadId ||
            isDescendantOf(candidate, record.childThreadId)),
      )
      .sort((left, right) => hierarchyDepth(right) - hierarchyDepth(left));
    if (targets.length === 0) {
      throw new Error("This subagent is no longer running.");
    }

    for (const target of targets) {
      const current =
        subagentStore.findByThread(target.profileKey, target.childThreadId) ??
        target;
      if (!current.childTurnId) {
        throw new Error(
          `The active turn for ${current.task || "this subagent"} is unavailable.`,
        );
      }
      saveSubagentRecord({
        ...current,
        status: "stopping",
        updatedAt: new Date().toISOString(),
      });
      try {
        await ensureCodexProfileConnected(
          current.profileKey as CodexProfileKey,
          current.accountId,
        );
        const interruptedTurnId = await interruptTurnForProfile(
          current.profileKey as CodexProfileKey,
          current.accountId,
          current.childThreadId,
          current.childTurnId,
        );
        if (interruptedTurnId === null) {
          saveSubagentRecord({
            ...current,
            status: "stopped",
            needsAttention: false,
            statusBeforeAttention: null,
            completedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
        }
      } catch (error) {
        saveSubagentRecord({
          ...current,
          status: current.status,
          error: error instanceof Error ? error.message : String(error),
          updatedAt: new Date().toISOString(),
        });
        throw error;
      }
    }

    window.setTimeout(() => {
      targets.forEach((target) => {
        const current = subagentStore.findByThread(
          target.profileKey,
          target.childThreadId,
        );
        if (!current || current.status !== "stopping") return;
        void loadSubagentTranscript(current)
          .then((transcript) => {
            const latest = subagentStore.findByThread(
              current.profileKey,
              current.childThreadId,
            );
            if (!latest || latest.status !== "stopping") return;
            if (transcript.activeTurnId) {
              saveSubagentRecord({
                ...latest,
                childTurnId: transcript.activeTurnId,
                status: "running",
                updatedAt: new Date().toISOString(),
              });
              return;
            }
            saveSubagentRecord({
              ...latest,
              status: "stopped",
              needsAttention: false,
              statusBeforeAttention: null,
              completedAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            });
          })
          .catch(() => undefined);
      });
    }, 4_000);
  });

  const clearHistoricalLatestPositionRequest = useCallback((
    request: HistoricalChatOpenRequest,
  ) => {
    setHistoricalTranscript((current) => {
      if (
        current?.openAtLatestRequest?.requestId !== request.requestId ||
        current.openAtLatestRequest.chatId !== request.chatId ||
        current.openAtLatestRequest.transcriptVersion !==
          request.transcriptVersion
      ) {
        return current;
      }
      const next: HistoricalTranscriptState = {
        ...current,
        positionIntent: "preserve",
        openAtLatestRequest: null,
      };
      historicalTranscriptRef.current = next;
      const workspaceId = selectedWorkspaceRef.current?.id;
      if (workspaceId !== undefined) {
        const remembered = workspaceTaskMemories.records[workspaceId];
        if (
          remembered?.selection.kind === "chat" &&
          remembered.selection.session.chatId === next.chatId
        ) {
          workspaceTaskMemories.records[workspaceId] = {
            ...remembered,
            historicalTranscript: next,
          };
        }
      }
      return next;
    });
  }, []);
  const resolveTranscriptRequest = useStableEvent(handleResolveRequest);
  const answerTranscriptUserInput = useStableEvent(handleAnswerUserInput);
  const implementTranscriptPlan = useStableEvent(handleImplementPlan);
  const reviseTranscriptPlan = useStableEvent(handleRevisePlan);
  const cancelTranscriptPlan = useStableEvent(handleCancelPlan);
  const openTranscriptWebPreview = useStableEvent(handleOpenWebPreview);
  const reviewTranscriptEditedFile = useStableEvent(handleReviewEditedFile);
  const undoTranscriptEditedFiles = useStableEvent(handleUndoEditedFiles);
  const editTranscriptPrompt = useStableEvent(handleEditLatestPrompt);
  const loadTranscriptHistoricalActivity = useStableEvent(loadHistoricalActivity);
  const rememberTranscriptViewport = useStableEvent(
    rememberTranscriptViewportSnapshot,
  );
  const activateAgentNotification = useStableEvent(
    handleAgentNotificationActivation,
  );
  const completeAgentNotificationFocus = useStableEvent(
    (
      request: TranscriptNotificationFocusRequest,
      found: boolean,
    ) => {
      setTranscriptNotificationFocusRequest((current) =>
        current?.requestId === request.requestId ? null : current,
      );
      const pendingFocus = pendingAgentNotificationFocusRef.current;
      if (pendingFocus?.requestId === request.requestId) {
        pendingAgentNotificationFocusRef.current = null;
        window.clearTimeout(pendingFocus.timeoutId);
        pendingFocus.resolve(found);
      }
    },
  );
  const dispatchAgentNotificationActivation = useStableEvent(
    (target: AgentNotificationTarget | null) => {
      if (!target) return;
      if (!bootstrapCompleteRef.current) {
        pendingNotificationActivationRef.current = target;
        return;
      }
      if (
        handledNotificationActivationKeysRef.current.has(target.eventKey) ||
        notificationActivationsInFlightRef.current.has(target.eventKey)
      ) {
        return;
      }

      notificationActivationsInFlightRef.current.add(target.eventKey);
      void activateAgentNotification(target)
        .then((result) => {
          if (result === "complete" || result === "terminal") {
            handledNotificationActivationKeysRef.current.add(target.eventKey);
          }
        })
        .catch(() => {
          setStatusMessage("Could not open the chat for that notification.");
        })
        .finally(() => {
          notificationActivationsInFlightRef.current.delete(target.eventKey);
        });
    },
  );
  const selectHistoryChatFromDrawer = useStableEvent((chat: ChatListItem) => {
    void selectHistoryChat(chat);
  });
  const openChatHistoryContextMenuFromDrawer = useStableEvent(
    openChatHistoryContextMenu,
  );
  const changeComposerPrompt = useStableEvent((nextPrompt: string) => {
    lastForegroundInteractionAtRef.current = Date.now();
    promptRef.current = nextPrompt;
    preflightRef.current = null;
    const queueEdit = promptQueueComposerEditRef.current;
    if (queueEdit?.error) {
      setPromptQueueComposerEditState({ ...queueEdit, error: null });
    }
    if (contextFiles.some((file) => file.source === "search")) {
      setContextFiles((current) => {
        const nextFiles = pruneMissingInlineContextFiles(current, nextPrompt);
        return nextFiles.length === current.length ? current : nextFiles;
      });
    }
  });
  const changeWorkspaceSurfaceMode = useStableEvent(
    (nextMode: WorkspaceSurfaceMode) => {
      replaceComposerPrompt(promptRef.current);
      setWorkspaceSurfaceMode(nextMode);
    },
  );
  const selectComposerAccount = useStableEvent((accountId: number) => {
    requestCodexAccountSelection(accountId);
  });
  const chooseComposerContextFiles = useStableEvent(() => {
    void chooseContextFiles();
  });
  const pickKanbanCardContextFiles = useStableEvent(() => pickContextFiles());
  const searchComposerMentionFiles = useStableEvent((query: string) => {
    void searchMentionFiles(query);
  });
  const selectComposerMentionFile = useStableEvent(addMentionFileToContext);
  const closeComposerMentionSearch = useStableEvent(closeMentionSearch);
  const searchComposerSlashCommands = useStableEvent((query: string) => {
    void searchSlashCommands(query);
  });
  const selectComposerSlashCommand = useStableEvent(handleSlashCommandSelect);
  const closeComposerSlashSearch = useStableEvent(closeSlashCommandSearch);
  const dropComposerContextFiles = useStableEvent(addDroppedContextFiles);
  const receiveNativeContextFileDrop = useStableEvent(
    handleNativeContextFileDrop,
  );
  const getComposerContextFileDropFallback = useStableEvent(
    getExplorerDragContextFiles,
  );
  const completeComposerContextFileDrop = useStableEvent(endWorkspaceFileDrag);
  const removeComposerContextFile = useStableEvent((path: string) => {
    setContextFiles((current) => current.filter((file) => file.path !== path));
  });
  const removeComposerSkill = useStableEvent((skillId: string) => {
    setSelectedSkills((current) =>
      current.filter((skill) => skill.id !== skillId),
    );
  });
  const runComposerPrompt = useStableEvent((nextPrompt: string) => {
    if (promptQueueComposerEditRef.current) {
      void savePromptQueueComposerEdit(nextPrompt);
      return;
    }
    void launchRun(nextPrompt);
  });
  const runKanbanComposerPrompt = useStableEvent((nextPrompt: string) => {
    void createCardFromKanbanPrompt(nextPrompt);
  });
  const dispatchSelectedPromptQueue = useStableEvent(() => {
    const chatId =
      workspaceChatSessionsRef.current[selectedWorkspaceRef.current?.id ?? -1]
        ?.chatId;
    if (chatId) {
      schedulePromptQueueDispatch(chatId);
    }
  });
  const editComposerQueuedPrompt = useStableEvent(openPromptQueueComposerEdit);
  const cancelComposerQueuedPromptEdit = useStableEvent(
    cancelPromptQueueComposerEdit,
  );
  const removeComposerQueuedPrompt = useStableEvent((item: PromptQueueItem) => {
    void removeQueuedPrompt(item);
  });
  const retryComposerQueuedPrompt = useStableEvent((item: PromptQueueItem) => {
    void retryQueuedPrompt(item);
  });
  const changeComposerQueuedPromptAutoSend = useStableEvent(
    (item: PromptQueueItem, enabled: boolean) => {
      void changeQueuedPromptAutoSend(item, enabled);
    },
  );
  const sendComposerQueuedPromptNow = useStableEvent(
    (item: PromptQueueItem) => {
      void sendQueuedPromptNow(item);
    },
  );
  const reorderComposerPromptQueue = useStableEvent(
    (orderedItemIds: string[]) => {
      void reorderSelectedPromptQueue(orderedItemIds);
    },
  );
  const stopComposerRun = useStableEvent(() => {
    void stopActiveRun();
  });
  useEffect(() => {
    if (activeView !== "task") return;

    let disposed = false;
    let unregister: () => void = () => undefined;
    void registerNativeContextFileDrop(receiveNativeContextFileDrop)
      .then((cleanup) => {
        if (disposed) {
          cleanup();
        } else {
          unregister = cleanup;
        }
      })
      .catch((error) => {
        if (disposed) return;
        nativeContextDropPathsRef.current = [];
        setTaskContextDropActiveValue(false);
        setStatusMessage(
          `Native file dropping is unavailable: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      });

    return () => {
      disposed = true;
      unregister();
      nativeContextDropPathsRef.current = [];
      taskContextDropActiveRef.current = false;
    };
  }, [activeView, receiveNativeContextFileDrop]);

  useEffect(() => {
    nativeContextDropPathsRef.current = [];
    setTaskContextDropActiveValue(false);
  }, [activeView, selectedWorkspace?.id]);

  const hasComposerContextFileDropFallback = useCallback(
    () => explorerDragContextFileRef.current !== null,
    [],
  );

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
  const signedInAccounts = useMemo(
    () => codexAccounts.filter((account) => account.status === "signed_in"),
    [codexAccounts],
  );
  const codexConnected =
    selectedAccountId !== null && connectedAccountIds.has(selectedAccountId);
  const selectedWorkspaceChatSession = selectedWorkspace
    ? (workspaceChatSessions[selectedWorkspace.id] ?? null)
    : null;
  const selectedSubagentConversationKey =
    subagentConversationKey({
      chatId: selectedWorkspaceChatSession?.chatId,
      ownerClientId: selectedDraftChatEntryId,
    });
  const selectedPromptQueueItems = selectedWorkspaceChatSession
    ? (promptQueuesByChat[selectedWorkspaceChatSession.chatId] ?? [])
        .filter(isPromptQueueItemPending)
        .sort(comparePromptQueueDisplayOrder)
    : [];
  useEffect(() => {
    if (
      subagentInspectorTarget &&
      subagentInspectorTarget.conversationKey !==
        selectedSubagentConversationKey
    ) {
      closeSubagentInspector();
    }
  }, [
    closeSubagentInspector,
    selectedSubagentConversationKey,
    subagentInspectorTarget,
  ]);
  const inspectedSubagentParentEntry = useMemo(() => {
    if (!subagentInspectorTarget) return null;
    const record = subagentStore.getConversation(
      subagentInspectorTarget.conversationKey,
    ).find(
      (candidate) => candidate.id === subagentInspectorTarget.subagentId,
    );
    if (!record) return null;
    return (
      taskChatEntries.find(
        (entry) =>
          (record.ownerClientId &&
            entry.clientId === record.ownerClientId) ||
          (record.runId !== null && entry.runId === record.runId),
      ) ?? null
    );
  }, [subagentInspectorTarget, taskChatEntries]);
  useEffect(() => {
    const edit = promptQueueComposerEditRef.current;
    if (
      !edit ||
      (selectedWorkspace?.id === edit.item.workspaceId &&
        selectedWorkspaceChatSession?.chatId === edit.item.chatId)
    ) {
      return;
    }
    setPromptQueueComposerEditState(null);
    restorePromptQueueComposer(edit);
  }, [selectedWorkspace?.id, selectedWorkspaceChatSession?.chatId]);
  const selectedPendingAccountHandoff = selectedWorkspaceChatSession
    ? pendingAccountHandoffs[selectedWorkspaceChatSession.chatId] ?? null
    : null;
  const selectedComposerAccountId =
    selectedPendingAccountHandoff?.targetAccountId ??
    accountIdFromProfileKey(selectedWorkspaceChatSession?.profileKey) ??
    (selectedWorkspaceChatSession ? null : selectedAccountId);
  const selectedComposerAccountPlaceholder =
    selectedWorkspaceChatSession?.profileKey === DEFAULT_CODEX_PROFILE_KEY &&
    !selectedPendingAccountHandoff
      ? "Codex default profile"
      : "Sign in required";
  const planImplementationSelectedModel =
    planImplementationDialog?.models.find(
      (model) => model.id === planImplementationDialog.selectedModelId,
    ) ?? null;
  const planImplementationAccountOptions = useMemo(() => {
    const options: ComposerSelectOption[] = [
      ...(planImplementationDialog?.allowDefaultProfile
        ? [{ value: "default", label: "Codex default profile" }]
        : []),
      ...signedInAccounts.map((account) => ({
        value: account.id.toString(),
        label: account.label,
      })),
    ];
    if (
      planImplementationDialog &&
      planImplementationDialog.profileKey !== DEFAULT_CODEX_PROFILE_KEY &&
      !options.some(
        (option) =>
          option.value === planImplementationDialog.accountId.toString(),
      )
    ) {
      const unavailableAccount = codexAccounts.find(
        (account) => account.id === planImplementationDialog.accountId,
      );
      options.push({
        value: planImplementationDialog.accountId.toString(),
        label: `${
          unavailableAccount?.label ?? "Original Codex account"
        } (sign in required)`,
        disabled: true,
      });
    }
    return options;
  }, [
    codexAccounts,
    planImplementationDialog,
    signedInAccounts,
  ]);
  const planImplementationModelOptions =
    planImplementationDialog?.models.map((model) => ({
      value: model.id,
      label: model.displayName || model.model,
    })) ?? [];
  const planImplementationReasoningOptions =
    planImplementationSelectedModel?.supportedReasoningEfforts.map(
      (option) => ({
        value: option.reasoningEffort,
        label: formatReasoningEffort(option.reasoningEffort),
      }),
    ) ?? [];
  const selectedActiveRunControl = useMemo(() => {
    if (!selectedWorkspace) return null;
    const controls = [...activeRunRegistry.values()];
    if (selectedDraftChatEntryId) {
      return (
        controls.find(
          (control) =>
            control.workspaceId === selectedWorkspace.id &&
            control.clientId === selectedDraftChatEntryId,
        ) ?? null
      );
    }
    if (selectedWorkspaceChatSession?.chatId !== undefined) {
      return (
        controls.find(
          (control) =>
            control.workspaceId === selectedWorkspace.id &&
            control.chatId === selectedWorkspaceChatSession.chatId,
        ) ?? null
      );
    }
    return null;
  }, [
    activeRunRegistryVersion,
    selectedDraftChatEntryId,
    selectedWorkspace,
    selectedWorkspaceChatSession?.chatId,
  ]);
  const runIsActive = Boolean(
    selectedActiveRunControl && isActiveRunControl(selectedActiveRunControl),
  );
  const activeRunAccountIds = new Set(
    [...activeRunRegistry.values()]
      .filter(isActiveRunControl)
      .map((control) => control.accountId),
  );
  const selectedGoalTerminationPending =
    goalTermination?.workspaceId === selectedWorkspace?.id;
  const selectedGoalProgress = deriveGoalProgressIndicator(
    selectedActiveRunControl?.goal ?? null,
    selectedActiveRunControl?.goalActionPending ?? null,
  );
  const selectedPlanProgress = useMemo(
    () =>
      derivePlanProgressIndicator(selectedActiveRunControl?.runView ?? null),
    [selectedActiveRunControl?.runView],
  );
  const selectedWorkspaceRunningChatActivity = (() => {
    const activityByChatId = new Map<number, string>();
    if (!selectedWorkspace) return activityByChatId;
    activeRunRegistry.forEach((control) => {
      if (
        control.workspaceId === selectedWorkspace.id &&
        control.chatId !== null &&
        isActiveRunControl(control)
      ) {
        const startedAt = control.runView.startedAt;
        if (
          startedAt &&
          historyActivityTime(startedAt) >
            historyActivityTime(activityByChatId.get(control.chatId))
        ) {
          activityByChatId.set(control.chatId, startedAt);
        }
      }
    });
    return activityByChatId;
  })();
  const selectedWorkspaceUnreadChatCount = selectedWorkspace
    ? (unreadCompletedChats[selectedWorkspace.id]?.length ?? 0)
    : 0;
  const canRun = Boolean(selectedWorkspace);
  const selectedGitStatusState = selectedWorkspace
    ? gitStatusStates[selectedWorkspace.id] ?? {
        status: "idle" as const,
        snapshot: null,
        error: null,
      }
    : null;
  const selectedGitOverview = selectedGitStatusState?.snapshot ?? null;
  const selectedGitRepository = preferredWorkspaceGitRepository(
    selectedGitOverview,
    selectedWorkspace?.selected_git_repository_path,
  );
  const selectedKanbanGitBinding = useMemo(() => {
    if (
      !kanbanChatGitContext ||
      kanbanChatGitContext.chatId !== selectedWorkspaceChatSession?.chatId
    ) {
      return null;
    }
    const selectedRepositoryPath =
      selectedGitRepository?.repository.rootPath ?? null;
    return (
      kanbanChatGitContext.bindings.find(
        (binding) => binding.sourceRepositoryPath === selectedRepositoryPath,
      ) ?? kanbanChatGitContext.bindings[0] ?? null
    );
  }, [
    kanbanChatGitContext,
    selectedGitRepository?.repository.rootPath,
    selectedWorkspaceChatSession?.chatId,
  ]);
  useEffect(() => {
    const chatId = selectedWorkspaceChatSession?.chatId ?? null;
    if (chatId === null) {
      setKanbanChatGitContext(null);
      return;
    }

    let disposed = false;
    void (async () => {
      try {
        const card = await getKanbanCardForChat(chatId);
        if (disposed) return;
        if (!card?.hasStartedTurn) {
          setKanbanChatGitContext(null);
          return;
        }
        const bindings = await loadKanbanGitBindings(card.id);
        if (disposed) return;
        setKanbanChatGitContext({ chatId, cardId: card.id, bindings });
        const workspace = selectedWorkspaceRef.current;
        const firstBinding = bindings[0];
        if (
          workspace &&
          firstBinding &&
          workspace.selected_git_repository_path !==
            firstBinding.sourceRepositoryPath &&
          !bindings.some(
            (binding) =>
              binding.sourceRepositoryPath ===
              workspace.selected_git_repository_path,
          )
        ) {
          rememberWorkspaceGitRepository(
            workspace.id,
            firstBinding.sourceRepositoryPath,
          );
          void updateWorkspaceSelectedGitRepository(
            workspace.id,
            firstBinding.sourceRepositoryPath,
          ).catch(() => undefined);
        }
      } catch {
        if (!disposed) setKanbanChatGitContext(null);
      }
    })();

    return () => {
      disposed = true;
    };
  }, [selectedWorkspaceChatSession?.chatId]);
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
  const workspacePreview = useWorkspacePreviewController({
    filePreviews: workspaceFilePreviews,
    workspaces,
    selectedWorkspace,
    gitStatusStates,
    gitStatusByWorkspaceId,
    gitStatusByRelativePath,
  });
  const {
    previewResizingRef,
    openWorkspaceFilePreview,
    openTaskResponseFileLink,
    invalidateWorkspacePreviewCaches,
    closeWorkspaceFilePreview,
    removeWorkspacePreview,
  } = workspacePreview;
  const openTranscriptFileLink = useStableEvent((href: string) => {
    const cardGitContext = kanbanChatGitContext;
    if (
      selectedWorkspace &&
      cardGitContext &&
      cardGitContext.chatId === selectedWorkspaceChatSession?.chatId
    ) {
      for (const binding of cardGitContext.bindings) {
        const worktreeWorkspace = {
          ...selectedWorkspace,
          path: binding.worktreePath,
        };
        const file = workspaceFileEntryFromResponseLink(
          href,
          worktreeWorkspace,
        );
        if (!file) continue;
        void openWorkspaceFilePreview(worktreeWorkspace, file, {
          forceRefresh: true,
        });
        return true;
      }
    }
    return openTaskResponseFileLink(href);
  });
  useEffect(() => {
    persistWorkspaceSurfaceMode(workspaceSurfaceMode);
    if (workspaceSurfaceMode === "kanban") {
      closeHistoryDrawer();
      closeWorkspaceFilePreview();
    }
  }, [closeHistoryDrawer, closeWorkspaceFilePreview, workspaceSurfaceMode]);
  const selectedGitSummary = useMemo(
    () => summarizeWorkspaceGitStatus(selectedGitStatusState?.snapshot ?? null),
    [selectedGitStatusState?.snapshot],
  );
  const selectedRepositoryGitSummary = useMemo(
    () =>
      summarizeWorkspaceGitFiles(
        selectedGitRepository?.files ?? [],
        selectedGitRepository?.additions,
        selectedGitRepository?.deletions,
      ),
    [selectedGitRepository],
  );
  const selectedGitFiles = selectedGitRepository?.files ?? [];
  const commitMessageFiles = useMemo(
    () => filesIncludedInCommitMessage(selectedGitFiles, includeUnstagedChanges),
    [includeUnstagedChanges, selectedGitFiles],
  );
  const commitMessageSummary = useMemo(
    () =>
      includeUnstagedChanges
        ? summarizeWorkspaceGitFiles(
            commitMessageFiles,
            selectedGitRepository?.additions,
            selectedGitRepository?.deletions,
          )
        : summarizeWorkspaceGitFiles(commitMessageFiles),
    [
      commitMessageFiles,
      includeUnstagedChanges,
      selectedGitRepository?.additions,
      selectedGitRepository?.deletions,
    ],
  );
  const commitMessageChangeKey = useMemo(
    () =>
      gitChangeFingerprint(
        selectedGitRepository?.repository.rootPath ?? null,
        commitMessageFiles,
        commitMessageSummary,
        includeUnstagedChanges,
      ),
    [
      commitMessageFiles,
      commitMessageSummary,
      includeUnstagedChanges,
      selectedGitRepository?.repository.rootPath,
    ],
  );
  const selectedHasStagedGitChanges = useMemo(
    () =>
      selectedGitFiles.some(
        (file) =>
          file.indexStatus !== " " &&
          file.indexStatus !== "?" &&
          file.indexStatus !== "",
      ),
    [selectedGitFiles],
  );
  const selectedGitOperation = selectedWorkspace
    ? gitOperationsByWorkspace[selectedWorkspace.id] ?? null
    : null;
  const selectedGitActionStatus =
    selectedGitOperation?.status === "running"
      ? selectedGitOperation.phase
      : "idle";
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
    const snapshot = selectedGitRepository;
    const canPush = Boolean(snapshot?.canPush);
    if (selectedRepositoryGitSummary.total > 0) {
      return {
        label: baseLabel,
        disabled: false,
        canCommit: true,
        canPush,
        statusLabel: `${selectedRepositoryGitSummary.total} changed`,
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
    selectedRepositoryGitSummary.total,
    selectedWorkspace,
  ]);
  const canCommitFromDialog =
    headerGitAction.canCommit &&
    (includeUnstagedChanges || selectedHasStagedGitChanges);
  const selectedWorkspaceBaseChatEntries = useMemo(
    () => {
      if (!selectedWorkspace) return [];
      if (selectedWorkspaceChatSession) {
        return taskChatEntries.filter(
          (entry) =>
            entry.workspaceId === selectedWorkspace.id &&
            entry.chatId === selectedWorkspaceChatSession.chatId,
        );
      }
      if (selectedDraftChatEntryId) {
        return taskChatEntries.filter(
          (entry) =>
            entry.workspaceId === selectedWorkspace.id &&
            entry.clientId === selectedDraftChatEntryId,
        );
      }
      return [];
    },
    [
      selectedDraftChatEntryId,
      selectedWorkspace,
      selectedWorkspaceChatSession,
      taskChatEntries,
    ],
  );
  const pendingApprovalAttentions = useMemo(() => {
    const activeControls = [...activeRunRegistry.values()];
    const attentions = unroutedApprovals.filter((attention) =>
      activeControls.some((control) =>
        pendingApprovalCouldBelongToControl(attention, control, subagentStore),
      ),
    );
    const knownKeys = new Set(
      attentions.map(
        ({ request }) => `${request.profileKey}:${request.key}`,
      ),
    );

    activeControls.forEach((control) => {
      if (!isActiveRunControl(control)) return;
      control.runView.approvalRequests.forEach((request) => {
        const key = `${request.profileKey}:${request.key}`;
        if (knownKeys.has(key)) return;
        knownKeys.add(key);
        attentions.push({
          accountId: control.accountId,
          request,
          target: {
            eventKey: approvalNotificationEventKey(request),
            kind: "approval-required",
            workspaceId: control.workspaceId,
            chatId: control.chatId,
            runId: control.runId,
            entryClientId: control.clientId,
            requestId: request.key,
            planItemId: null,
            accountId:
              control.profileKey === DEFAULT_CODEX_PROFILE_KEY
                ? null
                : control.accountId,
            profileKey: control.profileKey,
            threadId: request.threadId ?? control.threadId,
            turnId: request.turnId ?? control.turnId,
            subagentThreadId:
              subagentStore.findByThread(
                control.profileKey,
                request.threadId,
              )?.ownerClientId === control.clientId
                ? request.threadId
                : null,
          },
        });
      });
    });

    return attentions;
  }, [activeRunRegistryVersion, taskChatEntries, unroutedApprovals]);
  const selectedWorkspaceChatEntries = useMemo(() => {
    if (
      selectedWorkspaceBaseChatEntries.length === 0 ||
      pendingApprovalAttentions.length === 0
    ) {
      return selectedWorkspaceBaseChatEntries;
    }

    let changed = false;
    const entries = selectedWorkspaceBaseChatEntries.map((entry) => {
      const matchingRequests = pendingApprovalAttentions
        .filter((attention) =>
          pendingApprovalMatchesEntry(attention, entry),
        )
        .map((attention) => attention.request);
      if (matchingRequests.length === 0) return entry;

      let nextRunView = entry.runView;
      matchingRequests.forEach((request) => {
        nextRunView = addApprovalRequest(nextRunView, request);
      });
      if (nextRunView === entry.runView) return entry;
      changed = true;
      return {
        ...entry,
        runView: nextRunView,
      };
    });

    return changed ? entries : selectedWorkspaceBaseChatEntries;
  }, [pendingApprovalAttentions, selectedWorkspaceBaseChatEntries]);
  const visibleTaskChatEntries = selectedWorkspaceChatEntries;
  useEffect(() => {
    if (visibleTaskChatEntries.length > 0) {
      taskChatTranscriptHasMountedRef.current = true;
    }
  }, [visibleTaskChatEntries.length]);
  const crossConversationApprovals = useMemo(
    () =>
      pendingApprovalAttentions.filter(
        (attention) =>
          !selectedWorkspaceChatEntries.some((entry) =>
            pendingApprovalMatchesEntry(attention, entry),
          ),
    ),
    [pendingApprovalAttentions, selectedWorkspaceChatEntries],
  );
  const crossConversationApprovalRevision = useMemo(
    () =>
      crossConversationApprovals
        .map(({ request }) => `${request.profileKey}:${request.key}`)
        .sort()
        .join("|"),
    [crossConversationApprovals],
  );
  const floatingStatusNotices = useMemo<FloatingStatusNotice[]>(() => {
    const notices: FloatingStatusNotice[] = [];
    if (crossConversationApprovals.length > 0) {
      const count = crossConversationApprovals.length;
      notices.push({
        id: "cross-conversation-approvals",
        revisionKey: crossConversationApprovalRevision,
        tone: "approval",
        title: count === 1 ? "Approval needed" : `${count} approvals needed`,
        detail:
          count === 1
            ? "Another chat is waiting for your approval"
            : "Other chats are waiting for your approval",
        actionLabel:
          count === 1
            ? "Open chat awaiting approval"
            : "Open oldest chat awaiting approval",
        timeoutMs: null,
      });
    }
    if (approvalSafetyWarning) {
      notices.push({
        id: "approval-safety-warning",
        revisionKey: approvalSafetyWarning,
        tone: "warning",
        title: "Approval unavailable",
        detail: approvalSafetyWarning,
        timeoutMs: FLOATING_STATUS_NOTICE_TIMEOUT_MS,
      });
    }
    if (selectedActiveRunControl?.goalActionError) {
      notices.push({
        id: "goal-action-error",
        revisionKey: selectedActiveRunControl.goalActionError,
        tone: "warning",
        title: "Goal update failed",
        detail: selectedActiveRunControl.goalActionError,
        timeoutMs: FLOATING_STATUS_NOTICE_TIMEOUT_MS,
      });
    }
    if (
      selectedGitOperation &&
      (selectedGitOperation.status === "succeeded" ||
        selectedGitOperation.status === "failed")
    ) {
      notices.push({
        id: `git-operation-${selectedGitOperation.id}`,
        revisionKey: `${selectedGitOperation.status}:${selectedGitOperation.detail}`,
        tone:
          selectedGitOperation.status === "succeeded" ? "success" : "warning",
        title: selectedGitOperation.title,
        detail: selectedGitOperation.detail,
        actionLabel:
          selectedGitOperation.status === "failed"
            ? gitOperationRetryLabel(selectedGitOperation.retryRequest)
            : undefined,
        timeoutMs: FLOATING_STATUS_NOTICE_TIMEOUT_MS,
      });
    }
    return notices;
  }, [
    approvalSafetyWarning,
    crossConversationApprovalRevision,
    crossConversationApprovals.length,
    selectedActiveRunControl?.goalActionError,
    selectedGitOperation,
  ]);
  const activateFloatingStatusNotice = useStableEvent((noticeId: string) => {
    if (noticeId === "cross-conversation-approvals") {
      const oldest = [...crossConversationApprovals].sort((left, right) =>
        left.request.receivedAt.localeCompare(right.request.receivedAt),
      )[0];
      if (oldest) {
        void openPendingApprovalAttention(oldest);
      }
      return;
    }
    if (
      selectedGitOperation?.status === "failed" &&
      noticeId === `git-operation-${selectedGitOperation.id}`
    ) {
      if (selectedGitOperation.retryRequest) {
        retryWorkspaceGitOperation(selectedGitOperation.retryRequest);
      } else {
        openCommitDialog();
      }
    }
  });
  const planReviewAwaiting = visibleTaskChatEntries.some(
    (entry) => entry.runView.nativePlan.reviewState === "available",
  );
  const selectedWorkspaceChatMeta = useMemo(() => {
    let latestPromptEntry: TaskChatEntry | null = null;
    let latestTokenUsage: RunViewState["tokenUsage"] = null;

    for (let index = selectedWorkspaceChatEntries.length - 1; index >= 0; index -= 1) {
      const entry = selectedWorkspaceChatEntries[index];
      if (!latestPromptEntry && entry.prompt.trim().length > 0) {
        latestPromptEntry = entry;
      }
      if (!latestTokenUsage && entry.runView.tokenUsage) {
        latestTokenUsage = entry.runView.tokenUsage;
      }
      if (latestPromptEntry && latestTokenUsage) {
        break;
      }
    }

    return {
      latestPromptEntry,
      latestTokenUsage,
    };
  }, [selectedWorkspaceChatEntries]);
  const selectedHistoryChatLoading =
    selectedWorkspace && historyChatLoadState?.workspaceId === selectedWorkspace.id
      ? historyChatLoadState
      : null;
  const shouldSuspendTaskChatTranscript =
    visibleTaskChatEntries.length === 0 &&
    retainTranscriptDuringWorkspaceSwitch;
  const shouldRenderTaskChatTranscript =
    visibleTaskChatEntries.length > 0 ||
    (taskChatTranscriptHasMountedRef.current && shouldSuspendTaskChatTranscript);
  const selectedHistoricalTranscript =
    selectedWorkspace &&
    historicalTranscript?.chatId === selectedWorkspaceChatSession?.chatId
      ? historicalTranscript
      : null;
  const selectedTranscriptIdentity = selectedWorkspaceChatSession?.chatId
    ? `chat:${selectedWorkspaceChatSession.chatId}`
    : selectedDraftChatEntryId
      ? `draft:${selectedDraftChatEntryId}`
      : `workspace:${selectedWorkspace?.id ?? "none"}:live`;
  const selectedTranscriptViewportSnapshot = selectedWorkspace
    ? workspaceTaskMemories.records[selectedWorkspace.id]
        ?.transcriptViewportSnapshot ?? null
    : null;
  const suggestedCommitIntentContext = useMemo(
    () => buildCommitIntentContext(selectedWorkspaceChatEntries),
    [selectedWorkspaceChatEntries],
  );
  const editablePromptEntryId = useMemo(() => {
    if (runIsActive || activeChatEntryId !== null) {
      return null;
    }
    if (
      selectedWorkspaceChatSession?.origin === "codex_external" &&
      selectedWorkspaceChatSession.profileKey === DEFAULT_CODEX_PROFILE_KEY
    ) {
      return null;
    }
    const latestEntry = selectedWorkspaceChatMeta.latestPromptEntry;
    if (
      !latestEntry ||
      latestEntry.status === "connecting" ||
      latestEntry.status === "running"
    ) {
      return null;
    }
    return latestEntry.clientId;
  }, [
    activeChatEntryId,
    runIsActive,
    selectedWorkspaceChatSession?.origin,
    selectedWorkspaceChatSession?.profileKey,
    selectedWorkspaceChatMeta.latestPromptEntry,
  ]);
  const selectedWorkspaceContextUsage = selectedWorkspaceChatMeta.latestTokenUsage;
  const hasTaskChat =
    visibleTaskChatEntries.length > 0 || selectedHistoryChatLoading !== null;
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
        subtitle: "Choose the intended ChatGPT account in your browser",
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
    void bootstrap().catch((error) => {
      bootstrapCompleteRef.current = true;
      const message = error instanceof Error ? error.message : String(error);
      setStatusMessage(`Orchestrator could not finish starting: ${message}`);
    });
  }, []);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | null = null;

    void listen<AgentNotificationTarget>(
      "orchestrator:agent-notification-activated",
      (event) => {
        if (!disposed) {
          dispatchAgentNotificationActivation(event.payload);
        }
      },
    ).then((dispose) => {
      if (disposed) dispose();
      else unlisten = dispose;
    });
    void takePendingAgentNotificationActivation()
      .then((target) => {
        if (!disposed) {
          dispatchAgentNotificationActivation(target);
        }
      })
      .catch(() => undefined);

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [dispatchAgentNotificationActivation]);

  useEffect(() => {
    if (!selectedWorkspace) {
      return;
    }

    void refreshWorkspaceData(selectedWorkspace.id);
    void refreshWorkspaceGitStatus(selectedWorkspace);
  }, [selectedWorkspace?.id, selectedWorkspace?.path]);

  useEffect(() => {
    if (!historyDrawerOpen || !selectedWorkspace) {
      return;
    }

    void loadWorkspaceRunHistory(selectedWorkspace, {
      syncExternal: false,
      showLoading: true,
    });
  }, [historyDrawerOpen, selectedWorkspace?.id]);

  useEffect(() => {
    if (historyDrawerPhase !== "open" || !selectedWorkspace) {
      return;
    }

    void loadWorkspaceRunHistory(selectedWorkspace, {
      syncExternal: true,
      showLoading: false,
    });
  }, [historyDrawerPhase, selectedWorkspace?.id]);

  useEffect(() => {
    workspaces.forEach((workspace) => {
      void refreshWorkspaceGitStatus(workspace, { showLoading: false });
    });
  }, [workspaceLocationsKey]);

  useEffect(() => {
    const markForegroundInteraction = () => {
      lastForegroundInteractionAtRef.current = Date.now();
    };

    window.addEventListener("pointerdown", markForegroundInteraction, true);
    window.addEventListener("wheel", markForegroundInteraction, {
      capture: true,
      passive: true,
    });
    window.addEventListener("touchstart", markForegroundInteraction, {
      capture: true,
      passive: true,
    });
    return () => {
      window.removeEventListener("pointerdown", markForegroundInteraction, true);
      window.removeEventListener("wheel", markForegroundInteraction, true);
      window.removeEventListener("touchstart", markForegroundInteraction, true);
    };
  }, []);

  useEffect(() => {
    if (workspaces.length === 0) {
      return;
    }

    let cancelled = false;
    let timeoutId: number | null = null;

    const shouldDeferRefresh = () =>
      document.visibilityState === "hidden" ||
      isTranscriptScrolling() ||
      previewResizingRef.current ||
      getDrawerPhase() === "opening" ||
      getDrawerPhase() === "closing" ||
      Date.now() - lastForegroundInteractionAtRef.current <
        BACKGROUND_INTERACTION_GRACE_MS;

    const scheduleRefresh = (delay = GIT_STATUS_AUTO_REFRESH_INTERVAL_MS) => {
      if (cancelled) {
        return;
      }

      timeoutId = window.setTimeout(async () => {
        timeoutId = null;
        if (shouldDeferRefresh()) {
          scheduleRefresh(BACKGROUND_REFRESH_RETRY_MS);
          return;
        }

        const selectedWorkspaceId = selectedWorkspaceRef.current?.id ?? null;
        const orderedWorkspaces = [...workspaces].sort(
          (left, right) =>
            Number(right.id === selectedWorkspaceId) -
            Number(left.id === selectedWorkspaceId),
        );

        for (const workspace of orderedWorkspaces) {
          if (cancelled || shouldDeferRefresh()) break;
          await refreshWorkspaceGitStatus(workspace, {
            showLoading: false,
            background: true,
          }).catch(() => undefined);
          if (cancelled || shouldDeferRefresh()) break;
          await refreshVisibleWorkspaceDirectories(workspace);
        }
        scheduleRefresh();
      }, delay);
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
    setSelectedRunAliases(selectedActiveRunControl);
  }, [selectedActiveRunControl]);

  useEffect(() => {
    const hasActiveRuns = [...activeRunRegistry.values()].some(
      isActiveRunControl,
    );
    if (!hasActiveRuns) {
      return;
    }

    const tick = () => {
      activeRunRegistry.forEach((control) => {
        if (isActiveRunControl(control)) {
          updateRunControlView(control, (current) => updateRunElapsed(current));
        }
      });
    };

    tick();
    const intervalId = window.setInterval(tick, 1000);
    return () => window.clearInterval(intervalId);
  }, [activeRunRegistryVersion]);

  useEffect(() => {
    if (unroutedApprovals.length === 0) return;
    reconcileUnroutedApprovals();
  }, [activeRunRegistryVersion, taskChatEntries, unroutedApprovals]);

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
    if (!historyDrawerOpen) {
      setChatHistoryContextMenu(null);
    }
  }, [historyDrawerOpen]);

  useEffect(() => {
    if (
      branchCreationDialog &&
      branchCreationDialog.status === "idle" &&
      branchCreationDialog.workspace.id !== selectedWorkspace?.id
    ) {
      setBranchCreationDialog(null);
    }
  }, [branchCreationDialog, selectedWorkspace?.id]);

  useEffect(() => {
    if (selectedWorkspace) {
      workspaceFileIndexCache.current.delete(selectedWorkspace.id);
    }
  }, [selectedWorkspace?.id, selectedGitStatusState?.snapshot]);

  useEffect(() => {
    if (!codexSignedIn) {
      setAccountMenuOpen(false);
    }
  }, [codexSignedIn]);

  const handleCodexProcessEvent = useStableEvent(
    async (event: CodexProcessEvent) => {
      const profileKey = event.profileKey;
      const profileControls = [...activeRunRegistry.values()].filter(
        (control) => control.profileKey === profileKey,
      );
      if (
        selectedAccountIdRef.current === event.accountId ||
        profileControls.length > 0
      ) {
        setStatusMessage(event.message);
      }
      if (event.status === "exited" || event.status === "stopped") {
        [
          ...profileControls.flatMap(
            (control) => control.runView.approvalRequests,
          ),
          ...unroutedApprovalsRef.current.map(
            (attention) => attention.request,
          ),
        ]
          .filter((request) => request.profileKey === profileKey)
          .forEach((request) => {
            void removeAgentNotification(
              approvalNotificationEventKey(request),
            ).catch(() => undefined);
          });
        profileControls
          .flatMap((control) =>
            control.runView.serverRequests
              .filter(isNativeUserInputRequest)
              .map((request) => ({ control, request })),
          )
          .forEach(({ control, request }) => {
            void removeAgentNotification(
              userInputNotificationEventKey(control.profileKey, request),
            ).catch(() => undefined);
          });
        setApprovalSafetyWarning(null);
        const remainingUnroutedApprovals =
          unroutedApprovalsRef.current.filter(
            (attention) => attention.request.profileKey !== profileKey,
          );
        unroutedApprovalsRef.current = remainingUnroutedApprovals;
        setUnroutedApprovals(remainingUnroutedApprovals);
      }
      if (profileControls.length > 0) {
        flushFrameBatchedCodexNotifications();
        profileControls.forEach((control) => {
          void persistRunEvent(control, "process", event.status, event);
        });
        if (event.status === "exited" || event.status === "stopped") {
          profileControls.forEach((control) => {
            updateRunControlView(control, (current) => ({
              ...current,
              approvalRequests: [],
              approvalResourcesByItemId: {},
              serverRequests: [],
            }));
            if (control.kanbanAttempt) {
              void terminalizeKanbanRunAfterProcessStop(
                control,
                event.message,
              );
            }
          });
        }
      }
      setConnectedAccountIds((current) => {
        const next = new Set(current);
        if (event.status === "connected") next.add(event.accountId);
        if (event.status === "exited" || event.status === "stopped") {
          next.delete(event.accountId);
        }
        return next;
      });
      if (event.status === "exited" || event.status === "stopped") {
        collaborationModeMasksRef.current.delete(profileKey);
        if (selectedAccountIdRef.current === event.accountId) {
          setRequiresOpenaiAuth(true);
        }
        if (pendingLoginAccountIdRef.current === event.accountId) {
          const message = "Codex stopped before sign-in completed. Try again.";
          dismissExternalLoginNotification(
            event.accountId,
            pendingLoginIdRef.current,
          );
          resetLoginFlow("failed");
          setLoginError(message);
          void markCodexAccountLoginError(event.accountId, message);
        }
      }
    },
  );

  useEffect(() => {
    let disposed = false;
    let unsubscribe: (() => void) | null = null;
    void appServices.codexEvents
      .subscribe({
        onBrowserSession: (state) => {
          const control = [...activeRunRegistry.values()].find(
            (candidate) => candidate.browserSession?.token === state.token,
          );
          if (control) updateRunControlBrowserState(control, state);
        },
        onNotification: ({ accountId, profileKey, message }) =>
          handleCodexNotification(accountId, profileKey, message),
        onServerRequest: ({
          accountId,
          profileKey,
          message,
          requestToken,
        }) =>
          handleCodexServerRequest(
            accountId,
            profileKey,
            message,
            requestToken,
          ),
        onProcess: handleCodexProcessEvent,
        onMalformedEvent: (eventName) => {
          console.error(`Rejected malformed native event: ${eventName}`);
        },
      })
      .then((dispose) => {
        if (disposed) dispose();
        else unsubscribe = dispose;
      });

    return () => {
      disposed = true;
      unsubscribe?.();
    };
  }, [appServices.codexEvents, handleCodexProcessEvent]);

  useEffect(() => {
    if (
      loginState !== "starting" ||
      !activeCodexLogin ||
      activeCodexLogin.state !== "starting" ||
      activeCodexLogin.loginId !== null ||
      pendingLoginAccountId !== activeCodexLogin.accountId
    ) {
      return;
    }

    let disposed = false;
    let timeoutId: number | null = null;

    const pollNativeLogin = async () => {
      let nativeAttempt: ActiveCodexLogin | null;
      try {
        nativeAttempt = await readActiveCodexLogin();
      } catch {
        if (!disposed) {
          timeoutId = window.setTimeout(pollNativeLogin, 500);
        }
        return;
      }
      if (disposed) {
        return;
      }
      if (
        nativeAttempt?.accountId === activeCodexLogin.accountId &&
        nativeAttempt.connectionGeneration ===
          activeCodexLogin.connectionGeneration
      ) {
        if (nativeAttempt.loginId) {
          await restoreActiveLogin(nativeAttempt);
          return;
        }
        if (Date.now() < nativeAttempt.expiresAtMs) {
          timeoutId = window.setTimeout(pollNativeLogin, 250);
          return;
        }
      }

      try {
        const response = await refreshAccountState(
          activeCodexLogin.accountId,
          true,
        );
        if (response.account) {
          resetLoginFlow();
          if (selectedAccountIdRef.current === activeCodexLogin.accountId) {
            await refreshCodexModels(activeCodexLogin.accountId);
          }
          setStatusMessage("Codex sign-in completed.");
          return;
        }
      } catch (error) {
        if (error instanceof DuplicateCodexAccountError) {
          return;
        }
      }

      const message = "Codex sign-in was interrupted. Try again.";
      await markCodexAccountLoginError(activeCodexLogin.accountId, message);
      if (!disposed) {
        resetLoginFlow("failed");
        setLoginError(message);
        setStatusMessage(message);
      }
    };

    timeoutId = window.setTimeout(pollNativeLogin, 250);
    return () => {
      disposed = true;
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [activeCodexLogin, loginState, pendingLoginAccountId]);

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
    const loginExpiresAtMs =
      activeCodexLogin?.accountId === pendingLoginAccountId
        ? activeCodexLogin.expiresAtMs
        : Date.now() + CODEX_LOGIN_TIMEOUT_MS;

    const pollAccount = async () => {
      try {
        const response = await refreshAccountState(pendingLoginAccountId, true);
        if (response.account) {
          dismissExternalLoginNotification(pendingLoginAccountId, pendingLoginId);
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

      if (Date.now() >= loginExpiresAtMs) {
        await cancelCodexLogin(pendingLoginAccountId, pendingLoginId).catch(
          () => undefined,
        );
        dismissExternalLoginNotification(pendingLoginAccountId, pendingLoginId);
        const message = "Codex sign-in timed out. Try again.";
        await markCodexAccountLoginError(pendingLoginAccountId, message);
        resetLoginFlow("failed");
        setLoginError(message);
        setStatusMessage(message);
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
    activeCodexLogin,
    loginState,
    pendingLoginAccountId,
    pendingLoginId,
  ]);

  async function bootstrap() {
    const startupWarnings = await collectStartupWarnings([
      recoverAbandonedRuns(),
      recoverInterruptedChatTitleGenerations(),
      recoverInterruptedPromptQueueItems(),
      recoverInterruptedKanbanAttempts(),
    ]);
    const restoredQueueItems = await withStartupFallback(
      holdRestoredPromptQueueItems(),
      [],
      startupWarnings,
    );
    const restoredQueues = restoredQueueItems.reduce<
      Record<number, PromptQueueItem[]>
    >((queues, item) => {
      (queues[item.chatId] ??= []).push(item);
      return queues;
    }, {});
    const restoredPausedChatIds = new Set(
      restoredQueueItems.map((item) => item.chatId),
    );
    promptQueuesByChatRef.current = restoredQueues;
    pausedPromptQueueChatIdsRef.current = restoredPausedChatIds;
    promptQueuePauseReasonsRef.current = new Map(
      [...restoredPausedChatIds].map((chatId) => [chatId, "restart"]),
    );
    setPromptQueuesByChat(restoredQueues);
    const duplicateProfileIds = await withStartupFallback(
      listDuplicateProfilesPendingCleanup(),
      [],
      startupWarnings,
    );
    await Promise.allSettled(
      duplicateProfileIds.map(async (accountId) => {
        await deleteCodexProfile(accountId);
        await completeDuplicateProfileCleanup(accountId);
      }),
    );

    const [workspaceRows, loadedAccountRows, nativeActiveLogin] =
      await Promise.all([
        withStartupFallback(listWorkspaces(), [], startupWarnings),
        withStartupFallback(listCodexAccounts(), [], startupWarnings),
        withStartupFallback(readActiveCodexLogin(), null, startupWarnings),
      ]);
    const abandonedProfileCleanup = await cleanupAbandonedCodexProfiles(
      loadedAccountRows,
      nativeActiveLogin?.accountId ?? null,
      softDeleteCodexAccount,
      deleteCodexProfile,
    );
    startupWarnings.push(...abandonedProfileCleanup.warnings);
    const storedAccountRows = abandonedProfileCleanup.accounts;
    const strandedAccounts = nativeActiveLogin
      ? []
      : storedAccountRows.filter(
          (account) =>
            account.status === "pending" ||
            account.last_error?.includes("sign-in is already active"),
        );
    if (strandedAccounts.length > 0) {
      await Promise.allSettled(
        strandedAccounts.map((account) =>
          updateCodexAccount(account.id, {
            status: "signed_out",
            lastError: null,
          }),
        ),
      );
    }
    const accountRows = storedAccountRows.map((account) =>
      strandedAccounts.some((stranded) => stranded.id === account.id)
        ? {
            ...account,
            status: "signed_out" as const,
            last_error: null,
          }
        : account,
    );
    const workspace = workspaceRows[0] ?? null;
    const preferredAccount =
      accountRows.find((account) => account.id === nativeActiveLogin?.accountId) ??
      accountRows.find(
        (account) =>
          account.id === workspace?.default_account_id &&
          account.status === "signed_in",
      ) ??
      accountRows.find((account) => account.status === "signed_in") ??
      accountRows[0] ??
      null;

    setWorkspaces(workspaceRows);
    workspacesRef.current = workspaceRows;
    setSelectedWorkspace(workspace);
    selectedWorkspaceRef.current = workspace;
    setCodexAccounts(accountRows);
    codexAccountsRef.current = accountRows;
    setSelectedAccountId(preferredAccount?.id ?? null);
    selectedAccountIdRef.current = preferredAccount?.id ?? null;

    let activeLoginRecoveryFailedAccountId: number | null = null;
    if (nativeActiveLogin) {
      const pendingAccount = accountRows.find(
        (account) => account.id === nativeActiveLogin.accountId,
      );
      if (pendingAccount) {
        const recovered = await restoreActiveLogin(nativeActiveLogin);
        if (!recovered) {
          activeLoginRecoveryFailedAccountId = pendingAccount.id;
        }
      } else if (nativeActiveLogin.loginId) {
        await cancelCodexLogin(
          nativeActiveLogin.accountId,
          nativeActiveLogin.loginId,
        ).catch(() => undefined);
      }
    }

    await Promise.allSettled(
      accountRows
        .filter(
          (account) =>
            account.status === "signed_in" ||
            (account.id === nativeActiveLogin?.accountId &&
              account.id !== activeLoginRecoveryFailedAccountId),
        )
        .map(async (account) => {
          await ensureCodexConnected(account.id);
          await refreshAccountState(account.id, true);
        }),
    );

    if (
      preferredAccount &&
      preferredAccount.id !== activeLoginRecoveryFailedAccountId
    ) {
      await refreshCodexModels(preferredAccount.id);
    }

    bootstrapCompleteRef.current = true;
    const pendingActivation = pendingNotificationActivationRef.current;
    pendingNotificationActivationRef.current = null;
    dispatchAgentNotificationActivation(pendingActivation);
    if (startupWarnings.length > 0) {
      setStatusMessage(
        "Orchestrator started, but some interrupted work could not be recovered.",
      );
    }
  }

  async function syncExternalCodexChats(workspace: Workspace) {
    try {
      await connectDefaultCodexProfile();
      setConnectedAccountIds((current) => {
        const next = new Set(current).add(0);
        connectedAccountIdsRef.current = next;
        return next;
      });
      const response = await codexDefaultProfileRpc<unknown>("thread/list", {
        cwd: workspace.path,
        sourceKinds: EXTERNAL_CODEX_SOURCE_KINDS,
        archived: false,
        sortKey: "recency_at",
        sortDirection: "desc",
        limit: 100,
      });
      const root = readObject(response);
      const threads =
        readArray(root.threads).length > 0
          ? readArray(root.threads)
          : readArray(root.data).length > 0
            ? readArray(root.data)
            : readArray(root.items);
      await upsertExternalCodexChats(
        threads.flatMap((threadValue) => {
          const thread = readObject(threadValue);
          const id = readString(thread.id);
          if (!id) {
            return [];
          }
          const threadSource = readString(thread.threadSource);
          if (threadSource === "orchestrator") {
            return [];
          }
          const sourceKind =
            threadSource ?? readString(readObject(thread.source).kind) ?? "unknown";
          const title =
            readString(thread.name) ??
            readString(thread.preview) ??
            "Untitled Codex chat";
          return [
            {
              workspaceId: workspace.id,
              profileKey: "default" as const,
              externalThreadId: id,
              title,
              status: readString(thread.status) ?? "completed",
              sourceKind,
              cwd: readString(thread.cwd),
              createdAt: readString(thread.createdAt),
              updatedAt: readString(thread.updatedAt),
            },
          ];
        }),
      );
    } catch (error) {
      setStatusMessage(
        `Could not sync Codex history: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  function updateHistoryChatTitle(
    chatId: number,
    title: string,
    generationState: "complete" | "failed",
  ) {
    setHistoryState((current) => {
      const index = current.chats.findIndex((chat) => chat.id === chatId);
      if (index < 0) return current;
      const existing = current.chats[index];
      if (
        existing?.title === title &&
        existing.title_generation_state === generationState
      ) {
        return current;
      }
      const chats = current.chats.slice();
      chats[index] = {
        ...existing,
        title,
        title_generation_state: generationState,
        title_generation_started_at: null,
      };
      return { ...current, chats };
    });
  }

  function startChatTitleGeneration(request: ChatTitleGenerationRequest) {
    if (chatTitleGenerationsInFlightRef.current.has(request.chatId)) return;
    chatTitleGenerationsInFlightRef.current.add(request.chatId);

    void (async () => {
      try {
        if (!(await claimChatTitleGeneration(request.chatId))) return;
        const result = await generateChatTitle({
          workspacePath: request.workspacePath,
          accountId: request.accountId,
          model: request.model,
          initialPrompt: request.initialPrompt,
        });
        const title = sanitizeGeneratedChatTitle(result.title);
        if (!title) {
          throw new Error("Codex returned an invalid conversation title");
        }
        if (await completeChatTitleGeneration(request.chatId, title)) {
          updateHistoryChatTitle(request.chatId, title, "complete");
        }
      } catch (error) {
        console.warn(
          `AI chat title generation failed for chat ${request.chatId}; using the prompt-based fallback.`,
          error,
        );
        if (await failChatTitleGeneration(request.chatId).catch(() => false)) {
          updateHistoryChatTitle(
            request.chatId,
            request.fallbackTitle,
            "failed",
          );
          setStatusMessage(
            "AI title generation failed; using the prompt-based title.",
          );
        }
      } finally {
        chatTitleGenerationsInFlightRef.current.delete(request.chatId);
        request.onSettled?.();
      }
    })();
  }

  async function loadWorkspaceRunHistory(
    workspaceOrId: Workspace | number,
    options: LoadWorkspaceHistoryOptions = {},
  ) {
    const syncExternal = options.syncExternal ?? true;
    const showLoading = options.showLoading ?? true;
    const workspace =
      typeof workspaceOrId === "number"
        ? workspaces.find((candidate) => candidate.id === workspaceOrId) ??
          (selectedWorkspaceRef.current?.id === workspaceOrId
            ? selectedWorkspaceRef.current
            : null)
        : workspaceOrId;
    const workspaceId =
      typeof workspaceOrId === "number" ? workspaceOrId : workspaceOrId.id;
    if (showLoading) {
      setHistoryState((current) => ({
        ...current,
        status: "loading",
        error: null,
      }));
    }
    try {
      if (workspace && syncExternal) {
        await syncExternalCodexChats(workspace);
      }
      const chats = await listWorkspaceChats(workspaceId);
      setHistoryState((current) => {
        const currentById = new Map(current.chats.map((chat) => [chat.id, chat]));
        const mergedChats = chats.map((chat) => {
          const existing = currentById.get(chat.id);
          const incomingIsPending =
            chat.title_generation_state === "pending" ||
            chat.title_generation_state === "generating";
          const existingIsSettled =
            existing?.title_generation_state === "complete" ||
            existing?.title_generation_state === "failed";
          return incomingIsPending && existingIsSettled
            ? {
                ...chat,
                title: existing.title,
                title_generation_state: existing.title_generation_state,
                title_generation_started_at: null,
              }
            : chat;
        });
        return { status: "loaded", chats: mergedChats, error: null };
      });
    } catch (error) {
      if (showLoading) {
        setHistoryState({
          status: "error",
          chats: [],
          error: error instanceof Error ? error.message : String(error),
        });
      } else {
        setStatusMessage(
          `Could not refresh chat history: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }

  async function refreshSelectedWorkspaceHistory() {
    if (!selectedWorkspaceRef.current || !historyDrawerOpen) {
      return;
    }
    await loadWorkspaceRunHistory(selectedWorkspaceRef.current);
  }

  async function refreshWorkspaceGitStatus(
    workspace: Workspace,
    options: RefreshWorkspaceGitStatusOptions = {},
  ) {
    const existingRefresh = gitStatusRefreshCache.current.get(workspace.id);
    if (existingRefresh) {
      if (!options.force) {
        return existingRefresh;
      }

      // A completion refresh must observe the filesystem after the turn. An
      // in-flight poll may have captured the pre-run state, so wait for it and
      // issue one new request instead of reusing its potentially stale result.
      await existingRefresh.catch(() => undefined);
      return refreshWorkspaceGitStatus(workspace, {
        ...options,
        force: true,
      });
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

    const statusRequest = options.force
      ? listWorkspaceGitStatus(workspace.path, true)
      : listWorkspaceGitStatus(workspace.path);
    const refresh = statusRequest
      .then((rawSnapshot) => {
        const currentWorkspace =
          selectedWorkspaceRef.current?.id === workspace.id
            ? selectedWorkspaceRef.current
            : workspacesRef.current.find(
                (candidate) => candidate.id === workspace.id,
              ) ?? null;
        if (!currentWorkspace || currentWorkspace.path !== workspace.path) {
          return;
        }
        const snapshot = normalizeWorkspaceGitOverview(
          workspace.path,
          rawSnapshot as WorkspaceGitOverview | WorkspaceGitStatusSnapshot,
        );
        const preferredRepository = preferredWorkspaceGitRepository(
          snapshot,
          currentWorkspace.selected_git_repository_path,
        );
        if (
          preferredRepository &&
          preferredRepository.repository.rootPath !==
            currentWorkspace.selected_git_repository_path
        ) {
          rememberWorkspaceGitRepository(
            workspace.id,
            preferredRepository.repository.rootPath,
          );
          void updateWorkspaceSelectedGitRepository(
            workspace.id,
            preferredRepository.repository.rootPath,
          ).catch(() => undefined);
        }
        const update = () => {
          setGitStatusStates((current) => {
            const previous = current[workspace.id];
            if (
              previous?.status === "loaded" &&
              previous.error === null &&
              gitStatusSnapshotKey(previous.snapshot) ===
                gitStatusSnapshotKey(snapshot)
            ) {
              return current;
            }

            return {
              ...current,
              [workspace.id]: { status: "loaded", snapshot, error: null },
            };
          });
        };
        if (options.background) startTransition(update);
        else update();
        if (
          selectedWorkspaceRef.current?.id === workspace.id &&
          preferredRepository
        ) {
          void refreshBranches(
            {
              ...currentWorkspace,
              selected_git_repository_path:
                preferredRepository.repository.rootPath,
            },
            preferredRepository.repository.rootPath,
          );
        }
      })
      .catch((error) => {
        const currentWorkspace =
          selectedWorkspaceRef.current?.id === workspace.id
            ? selectedWorkspaceRef.current
            : workspacesRef.current.find(
                (candidate) => candidate.id === workspace.id,
              ) ?? null;
        if (!currentWorkspace || currentWorkspace.path !== workspace.path) {
          return;
        }
        const errorMessage = error instanceof Error ? error.message : String(error);
        const update = () => {
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
        };
        if (options.background) startTransition(update);
        else update();
      })
      .finally(() => {
        gitStatusRefreshCache.current.delete(workspace.id);
      });

    gitStatusRefreshCache.current.set(workspace.id, refresh);
    return refresh;
  }

  function rememberWorkspaceGitRepository(
    workspaceId: number,
    repositoryPath: string | null,
  ) {
    setWorkspaces((current) => {
      const next = current.map((workspace) =>
        workspace.id === workspaceId
          ? { ...workspace, selected_git_repository_path: repositoryPath }
          : workspace,
      );
      workspacesRef.current = next;
      return next;
    });
    if (selectedWorkspaceRef.current?.id === workspaceId) {
      const next = {
        ...selectedWorkspaceRef.current,
        selected_git_repository_path: repositoryPath,
      };
      selectedWorkspaceRef.current = next;
      setSelectedWorkspace(next);
    }
  }

  async function refreshBranches(
    workspace: Workspace,
    repositoryPath = workspace.selected_git_repository_path,
  ) {
    try {
      if (!repositoryPath) {
        setBranches([]);
        setSelectedBranch(null);
        return;
      }
      const result = await listGitBranches(workspace.path, repositoryPath);
      if (
        selectedWorkspaceRef.current?.id !== workspace.id ||
        selectedWorkspaceRef.current.selected_git_repository_path !==
          repositoryPath
      ) {
        return;
      }
      setBranches(result.branches);
      setSelectedBranch(result.currentBranch ?? result.branches[0] ?? null);
    } catch (error) {
      if (
        selectedWorkspaceRef.current?.id !== workspace.id ||
        selectedWorkspaceRef.current.selected_git_repository_path !==
          repositoryPath
      ) {
        return;
      }
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
    setActiveCodexLogin(null);
    setLoginUserCode(null);
    pendingLoginIdRef.current = null;
    pendingLoginAccountIdRef.current = null;
  }

  async function markCodexAccountLoginError(
    accountId: number,
    message: string,
  ) {
    await updateCodexAccount(accountId, {
      status: "error",
      lastError: message,
    }).catch(() => undefined);
    setCodexAccounts((current) => {
      const next = current.map((account) =>
        account.id === accountId
          ? { ...account, status: "error" as const, last_error: message }
          : account,
      );
      codexAccountsRef.current = next;
      return next;
    });
  }

  function applyActiveLogin(attempt: ActiveCodexLogin) {
    setActiveCodexLogin(attempt);
    setPendingLoginAccountId(attempt.accountId);
    setPendingLoginId(attempt.loginId);
    pendingLoginAccountIdRef.current = attempt.accountId;
    pendingLoginIdRef.current = attempt.loginId;
    setLoginState(attempt.state);
    setLoginUserCode(null);
  }

  async function restoreActiveLogin(attempt: ActiveCodexLogin) {
    applyActiveLogin(attempt);
    if (!attempt.authUrl) {
      return true;
    }
    try {
      await openUrl(attempt.authUrl);
      return true;
    } catch {
      if (attempt.loginId) {
        await cancelCodexLogin(attempt.accountId, attempt.loginId).catch(
          () => undefined,
        );
      }
      dismissExternalLoginNotification(attempt.accountId, attempt.loginId);
      const message = "Could not open Codex sign-in. Try again.";
      await markCodexAccountLoginError(attempt.accountId, message);
      resetLoginFlow("failed");
      setLoginError(message);
      setStatusMessage(message);
      return false;
    }
  }

  async function captureStartedLogin(
    accountId: number,
    loginId: string,
    authUrl: string,
  ) {
    const nativeAttempt = await readActiveCodexLogin().catch(() => null);
    if (
      nativeAttempt?.accountId === accountId &&
      nativeAttempt.loginId === loginId
    ) {
      applyActiveLogin({
        ...nativeAttempt,
        authUrl: nativeAttempt.authUrl ?? authUrl,
      });
      return;
    }
    const startedAtMs = Date.now();
    applyActiveLogin({
      accountId,
      loginId,
      authUrl,
      connectionGeneration: nativeAttempt?.connectionGeneration ?? 0,
      startedAtMs,
      expiresAtMs: startedAtMs + CODEX_LOGIN_TIMEOUT_MS,
      state: "waiting",
    });
  }

  async function recoverActiveLoginIfPresent() {
    const activeLogin = await readActiveCodexLogin().catch(() => null);
    if (!activeLogin) {
      return false;
    }
    const account = codexAccountsRef.current.find(
      (candidate) => candidate.id === activeLogin.accountId,
    );
    if (!account) {
      if (activeLogin.loginId) {
        await cancelCodexLogin(
          activeLogin.accountId,
          activeLogin.loginId,
        ).catch(() => undefined);
      }
      return false;
    }
    setSelectedAccountId(account.id);
    selectedAccountIdRef.current = account.id;
    const recovered = await restoreActiveLogin(activeLogin);
    if (recovered) {
      setLoginError(null);
      setStatusMessage(`Complete sign-in for ${account.label} in your browser.`);
    }
    return true;
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
        : pendingLoginAccountIdRef.current === accountId
          ? "pending"
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
        // A failed account/read request is transport state, not evidence that
        // the user signed out. Preserve the last confirmed account so a
        // transient timeout can be retried after connectivity returns.
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

  async function listCodexModelsForProfile(
    profileKey: CodexProfileKey,
    accountId: number,
  ) {
    await ensureCodexProfileConnected(profileKey, accountId);
    if (profileKey !== DEFAULT_CODEX_PROFILE_KEY) {
      return listCodexModels(accountId);
    }

    const visibleModels: CodexModel[] = [];
    let cursor: string | null = null;
    do {
      const response: {
        data?: CodexModel[];
        nextCursor?: string | null;
      } = await codexDefaultProfileRpc("model/list", {
        includeHidden: false,
        limit: 100,
        cursor,
      });
      visibleModels.push(
        ...(response.data ?? []).filter((model: CodexModel) => !model.hidden),
      );
      cursor = response.nextCursor ?? null;
    } while (cursor);
    return visibleModels;
  }

  async function chooseWorkspace() {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Choose a repository workspace",
      });

      if (typeof selected !== "string") {
        return;
      }

      cancelAgentNotificationNavigation();
      const workspace = await upsertWorkspace(selected);
      const workspaceRows = await listWorkspaces();
      historyChatLoadIdRef.current += 1;
      cancelActiveExternalTranscriptSync();
      cancelActiveHistoricalTranscriptPreparation();
      resetTranscriptInteraction();
      historicalTranscriptRef.current = null;
      workspacesRef.current = workspaceRows;
      selectedWorkspaceRef.current = workspace;
      workspaceTaskMemories.records[workspace.id] ??=
        createEmptyWorkspaceTaskMemory();
      flushSync(() => {
        setHistoryChatLoadState(null);
        setHistoryOpenRequest(null);
        setHistoricalTranscript(null);
        setWorkspaces(workspaceRows);
        setBranches([]);
        setSelectedBranch(null);
        setSelectedWorkspace(workspace);
        setSelectedDraftChat(null);
        setSelectedHistoryChatId(null);
        setWorkspaceChatSession(workspace.id, undefined);
        setSelectedRunAliases(null);
        setActiveView("task");
      });
      setStatusMessage(`Selected ${workspace.label}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatusMessage(`Could not add workspace: ${message}`);
    }
  }

  function createEmptyWorkspaceTaskMemory(): WorkspaceTaskMemory {
    return {
      selection: { kind: "new" },
      prompt: "",
      contextFiles: [],
      selectedSkills: [],
      historicalTranscript: null,
      transcriptViewportSnapshot: null,
    };
  }

  function sanitizeRememberedHistoricalTranscript(
    transcript: HistoricalTranscriptState | null,
  ) {
    return transcript
      ? {
          ...transcript,
          positionIntent: "preserve" as const,
          openAtLatestRequest: null,
        }
      : null;
  }

  function rememberCurrentWorkspaceTaskMemory() {
    const workspace = selectedWorkspaceRef.current;
    if (!workspace) return;

    const session = workspaceChatSessionsRef.current[workspace.id];
    const selection: WorkspaceTaskSelection = selectedDraftChatEntryIdRef.current
      ? { kind: "draft", clientId: selectedDraftChatEntryIdRef.current }
      : session
        ? { kind: "chat", session: { ...session } }
        : { kind: "new" };
    const transcript =
      session && historicalTranscriptRef.current?.chatId === session.chatId
        ? sanitizeRememberedHistoricalTranscript(
            historicalTranscriptRef.current,
          )
        : null;

    const existing = workspaceTaskMemories.records[workspace.id];
    workspaceTaskMemories.records[workspace.id] = {
      selection,
      prompt: promptRef.current,
      contextFiles: [...contextFilesRef.current],
      selectedSkills: [...selectedSkillsRef.current],
      historicalTranscript: transcript,
      transcriptViewportSnapshot:
        existing?.transcriptViewportSnapshot ?? null,
    };
  }

  function rememberTranscriptViewportSnapshot(
    snapshot: TranscriptViewportSnapshot,
  ) {
    const memory = workspaceTaskMemories.records[snapshot.workspaceId];
    if (!memory) return;
    const expectedIdentity =
      memory.selection.kind === "chat"
        ? `chat:${memory.selection.session.chatId}`
        : memory.selection.kind === "draft"
          ? `workspace:${snapshot.workspaceId}:live`
          : null;
    if (snapshot.transcriptIdentity !== expectedIdentity) return;
    workspaceTaskMemories.records[snapshot.workspaceId] = {
      ...memory,
      transcriptViewportSnapshot: snapshot,
    };
  }

  function rememberWorkspaceTaskSelection(
    workspaceId: number,
    selection: WorkspaceTaskSelection,
    transcript: HistoricalTranscriptState | null = null,
  ) {
    const existing =
      workspaceTaskMemories.records[workspaceId] ??
      createEmptyWorkspaceTaskMemory();
    const useVisibleComposer =
      selectedWorkspaceRef.current?.id === workspaceId;
    workspaceTaskMemories.records[workspaceId] = {
      selection,
      prompt: useVisibleComposer ? promptRef.current : existing.prompt,
      contextFiles: useVisibleComposer
        ? [...contextFilesRef.current]
        : [...existing.contextFiles],
      selectedSkills: useVisibleComposer
        ? [...selectedSkillsRef.current]
        : [...existing.selectedSkills],
      historicalTranscript: sanitizeRememberedHistoricalTranscript(transcript),
      transcriptViewportSnapshot: null,
    };
  }

  function updateRememberedWorkspaceChatSession(
    workspaceId: number,
    chatId: number,
    session: WorkspaceChatSession,
  ) {
    const memory = workspaceTaskMemories.records[workspaceId];
    if (
      memory?.selection.kind !== "chat" ||
      memory.selection.session.chatId !== chatId
    ) {
      return false;
    }

    workspaceTaskMemories.records[workspaceId] = {
      ...memory,
      selection: { kind: "chat", session: { ...session } },
    };
    setWorkspaceChatSession(workspaceId, session);
    return true;
  }

  function promoteRememberedWorkspaceDraft(
    workspaceId: number,
    clientId: string,
    session: WorkspaceChatSession,
  ) {
    const memory = workspaceTaskMemories.records[workspaceId];
    const selectedDraftMatches =
      selectedWorkspaceRef.current?.id === workspaceId &&
      selectedDraftChatEntryIdRef.current === clientId;
    const rememberedDraftMatches =
      memory?.selection.kind === "draft" &&
      memory.selection.clientId === clientId;
    if (!selectedDraftMatches && !rememberedDraftMatches) {
      return false;
    }

    rememberWorkspaceTaskSelection(
      workspaceId,
      { kind: "chat", session },
      null,
    );
    setWorkspaceChatSession(workspaceId, session);
    if (selectedDraftMatches) {
      setSelectedDraftChat(null);
      setSelectedHistoryChatId(session.chatId);
    }
    return true;
  }

  function restoreWorkspaceComposer(memory: WorkspaceTaskMemory) {
    replaceComposerPrompt(memory.prompt);
    contextFilesRef.current = [...memory.contextFiles];
    selectedSkillsRef.current = [...memory.selectedSkills];
    setContextFiles([...memory.contextFiles]);
    setSelectedSkills([...memory.selectedSkills]);
  }

  function updateRememberedWorkspaceComposer(
    workspaceId: number,
    update: Partial<
      Pick<
        WorkspaceTaskMemory,
        "prompt" | "contextFiles" | "selectedSkills"
      >
    >,
  ) {
    const existing =
      workspaceTaskMemories.records[workspaceId] ??
      createEmptyWorkspaceTaskMemory();
    const next: WorkspaceTaskMemory = {
      ...existing,
      ...update,
      contextFiles: update.contextFiles
        ? [...update.contextFiles]
        : existing.contextFiles,
      selectedSkills: update.selectedSkills
        ? [...update.selectedSkills]
        : existing.selectedSkills,
    };
    workspaceTaskMemories.records[workspaceId] = next;
    if (selectedWorkspaceRef.current?.id !== workspaceId) return;
    if (update.prompt !== undefined) {
      replaceComposerPrompt(update.prompt);
    }
    if (update.contextFiles) {
      contextFilesRef.current = [...update.contextFiles];
      setContextFiles([...update.contextFiles]);
    }
    if (update.selectedSkills) {
      selectedSkillsRef.current = [...update.selectedSkills];
      setSelectedSkills([...update.selectedSkills]);
    }
  }

  function removeSubmittedImagesFromWorkspaceComposer(
    workspaceId: number,
    submittedFiles: ComposerContextFile[],
  ) {
    const submittedImagePaths = new Set(
      submittedFiles
        .filter(isImageContextFile)
        .flatMap((file) => [file.path, file.canonicalPath])
        .filter((path): path is string => Boolean(path)),
    );
    if (submittedImagePaths.size === 0) return;

    const currentFiles =
      selectedWorkspaceRef.current?.id === workspaceId
        ? contextFilesRef.current
        : workspaceTaskMemories.records[workspaceId]?.contextFiles ?? [];
    updateRememberedWorkspaceComposer(workspaceId, {
      contextFiles: currentFiles.filter(
        (file) =>
          !submittedImagePaths.has(file.path) &&
          (!file.canonicalPath ||
            !submittedImagePaths.has(file.canonicalPath)),
      ),
    });
  }

  function restoreRunComposerForRetry(
    workspaceId: number,
    prompt: string,
    imageFiles: ComposerContextFile[],
  ) {
    const currentFiles =
      selectedWorkspaceRef.current?.id === workspaceId
        ? contextFilesRef.current
        : workspaceTaskMemories.records[workspaceId]?.contextFiles ?? [];
    updateRememberedWorkspaceComposer(workspaceId, {
      prompt,
      contextFiles: mergeContextFiles(currentFiles, imageFiles),
    });
  }

  function rememberedWorkspaceSelectionStillMatches(
    workspaceId: number,
    selection: WorkspaceTaskSelection,
  ) {
    const current = workspaceTaskMemories.records[workspaceId]?.selection;
    if (!current || current.kind !== selection.kind) return false;
    if (selection.kind === "new") return true;
    if (selection.kind === "draft") {
      return current.kind === "draft" && current.clientId === selection.clientId;
    }
    return (
      current.kind === "chat" &&
      current.session.chatId === selection.session.chatId
    );
  }

  function fallBackToNewWorkspaceChat(workspace: Workspace, message: string) {
    const previousSession = workspaceChatSessionsRef.current[workspace.id];
    if (previousSession) {
      clearPendingAccountHandoff(previousSession.chatId);
    }
    const existing =
      workspaceTaskMemories.records[workspace.id] ??
      createEmptyWorkspaceTaskMemory();
    workspaceTaskMemories.records[workspace.id] = {
      ...existing,
      selection: { kind: "new" },
      historicalTranscript: null,
      transcriptViewportSnapshot: null,
    };
    if (selectedWorkspaceRef.current?.id !== workspace.id) return;

    flushSync(() => {
      setRetainTranscriptDuringWorkspaceSwitch(false);
      setWorkspaceChatSession(workspace.id, undefined);
      setSelectedDraftChat(null);
      setSelectedHistoryChatId(null);
      setHistoryChatLoadState(null);
      setHistoryOpenRequest(null);
      historicalTranscriptRef.current = null;
      setHistoricalTranscript(null);
      setSelectedRunAliases(null);
    });
    setStatusMessage(message);
  }

  async function reloadRememberedWorkspaceChat(
    workspace: Workspace,
    selection: Extract<WorkspaceTaskSelection, { kind: "chat" }>,
  ) {
    try {
      const chatWithRuns = await getChatWithRuns(selection.session.chatId);
      if (
        selectedWorkspaceRef.current?.id !== workspace.id ||
        !rememberedWorkspaceSelectionStillMatches(workspace.id, selection)
      ) {
        return;
      }
      await selectHistoryChat(chatWithRuns.chat, {
        source: "workspace",
        workspace,
        positionIntent: "preserve",
      });
    } catch (error) {
      if (
        selectedWorkspaceRef.current?.id !== workspace.id ||
        !rememberedWorkspaceSelectionStillMatches(workspace.id, selection)
      ) {
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      if (/chat (?:was )?not found/i.test(message)) {
        fallBackToNewWorkspaceChat(
          workspace,
          "The previous chat is no longer available. Started a new chat.",
        );
        return;
      }
      setHistoryChatLoadState((current) =>
        current?.workspaceId === workspace.id &&
        current.chatId === selection.session.chatId
          ? { ...current, error: message }
          : current,
      );
      setStatusMessage(`Could not restore the previous chat: ${message}`);
    }
  }

  function selectWorkspace(workspaceId: number) {
    const workspace = workspaces.find((candidate) => candidate.id === workspaceId);
    if (!workspace) {
      return;
    }

    kanbanConversationNavigationIdRef.current += 1;
    cancelAgentNotificationNavigation();
    const previousWorkspaceId = selectedWorkspaceRef.current?.id ?? null;
    if (previousWorkspaceId === workspace.id) {
      setWorkspaceContextMenu(null);
      setActiveView("task");
      setStatusMessage(`Selected ${workspace.label}`);
      return;
    }

    taskChatTranscriptRef.current?.captureViewportState();
    rememberCurrentWorkspaceTaskMemory();
    historyChatLoadIdRef.current += 1;
    cancelActiveExternalTranscriptSync();
    cancelActiveHistoricalTranscriptPreparation();
    resetTranscriptInteraction();

    const memory =
      workspaceTaskMemories.records[workspace.id] ??
      createEmptyWorkspaceTaskMemory();
    workspaceTaskMemories.records[workspace.id] = memory;
    let selection = memory.selection;
    let restoredTranscript = memory.historicalTranscript;
    let restoredEntries: TaskChatEntry[] | null = null;
    let selectedRunControl: ActiveRunControl | null = null;
    let needsHistoryReload = false;

    if (selection.kind === "draft") {
      const draftSelection = selection;
      const draftExists = taskChatEntriesRef.current.some(
        (entry) =>
          entry.workspaceId === workspace.id &&
          entry.clientId === draftSelection.clientId,
      );
      selectedRunControl =
        activeRunRegistry.get(draftSelection.clientId) ?? null;
      if (!draftExists && selectedRunControl?.entry) {
        restoredEntries = [
          ...taskChatEntriesRef.current.filter(
            (entry) => entry.clientId !== selectedRunControl?.clientId,
          ),
          selectedRunControl.entry,
        ];
      }
      if (!draftExists && !selectedRunControl) {
        selection = { kind: "new" };
        workspaceTaskMemories.records[workspace.id] = {
          ...memory,
          selection,
          historicalTranscript: null,
          transcriptViewportSnapshot: null,
        };
      }
    } else if (selection.kind === "chat") {
      const chatSelection = selection;
      selectedRunControl = findRunControlByChat(
        workspace.id,
        chatSelection.session.chatId,
      );
      const chatEntriesExist = taskChatEntriesRef.current.some(
        (entry) =>
          entry.workspaceId === workspace.id &&
          entry.chatId === chatSelection.session.chatId,
      );
      if (!chatEntriesExist) {
        const cached = appServices.historicalTranscripts.get(
          chatSelection.session.chatId,
        );
        if (cached) {
          const cachedEntries = selectedRunControl?.entry
            ? [
                ...cached.entries.filter(
                  (entry) => entry.clientId !== selectedRunControl?.clientId,
                ),
                selectedRunControl.entry,
              ]
            : cached.entries;
          restoredEntries = replaceChatEntries(
            taskChatEntriesRef.current,
            workspace.id,
            chatSelection.session.chatId,
            cachedEntries,
          );
          restoredTranscript =
            restoredTranscript ??
            sanitizeRememberedHistoricalTranscript(cached.transcript);
        } else if (selectedRunControl?.entry) {
          restoredEntries = replaceChatEntries(
            taskChatEntriesRef.current,
            workspace.id,
            chatSelection.session.chatId,
            [selectedRunControl.entry],
          );
        } else {
          needsHistoryReload = true;
        }
      }
    }

    const selectedChatSession =
      selection.kind === "chat" ? selection.session : undefined;
    const selectedDraftId =
      selection.kind === "draft" ? selection.clientId : null;
    const selectedChatId =
      selection.kind === "chat" ? selection.session.chatId : null;

    flushSync(() => {
      setWorkspaceContextMenu(null);
      selectedWorkspaceRef.current = workspace;
      setSelectedWorkspace(workspace);
      setRetainTranscriptDuringWorkspaceSwitch(selection.kind === "new");
      setBranches([]);
      setSelectedBranch(null);
      restoreWorkspaceComposer(
        workspaceTaskMemories.records[workspace.id] ?? memory,
      );
      setWorkspaceChatSession(workspace.id, selectedChatSession);
      setSelectedDraftChat(selectedDraftId);
      setSelectedHistoryChatId(selectedChatId);
      setHistoryOpenRequest(null);
      const nextTranscript =
        selection.kind === "chat"
          ? sanitizeRememberedHistoricalTranscript(restoredTranscript)
          : null;
      historicalTranscriptRef.current = nextTranscript;
      setHistoricalTranscript(nextTranscript);
      setHistoryChatLoadState(
        needsHistoryReload && selection.kind === "chat"
          ? {
              chatId: selection.session.chatId,
              workspaceId: workspace.id,
              title: "Previous chat",
              error: null,
            }
          : null,
      );
      if (restoredEntries) {
        taskChatEntriesRef.current = restoredEntries;
        setTaskChatEntries(restoredEntries);
      }
      setSelectedRunAliases(selectedRunControl);
      setActiveView("task");
    });

    preflightRef.current = null;
    setStatusMessage(
      selection.kind === "new"
        ? `Selected ${workspace.label}. Started a new chat.`
        : `Selected ${workspace.label}. Restored the previous chat.`,
    );
    selectWorkspaceExecutionAccount(workspace, selectedChatSession ?? null);
    if (needsHistoryReload && selection.kind === "chat") {
      void reloadRememberedWorkspaceChat(workspace, selection);
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

  function setSelectedDraftChat(clientId: string | null) {
    selectedDraftChatEntryIdRef.current = clientId;
    setSelectedDraftChatEntryId(clientId);
  }

  function setSelectedRunAliases(control: ActiveRunControl | null) {
    activeRunControlRef.current = control;
    activeChatEntryIdRef.current = control?.clientId ?? null;
    currentRunId.current = control?.runId ?? null;
    currentTaskId.current = control?.taskId ?? null;
    currentRunAccountId.current = control?.accountId ?? null;
    currentRunProfileKey.current = control?.profileKey ?? null;
    runViewRef.current = control?.runView ?? emptyRunView;
    setActiveChatEntryId(control?.clientId ?? null);
    setRunView(control?.runView ?? emptyRunView);
  }

  function runControlIsSelected(control: ActiveRunControl) {
    if (selectedWorkspaceRef.current?.id !== control.workspaceId) return false;
    if (selectedDraftChatEntryIdRef.current === control.clientId) return true;
    const session = workspaceChatSessionsRef.current[control.workspaceId];
    return control.chatId !== null && session?.chatId === control.chatId;
  }

  function selectedRunIsActiveNow() {
    return [...activeRunRegistry.values()].some(
      (control) =>
        runControlIsSelected(control) && isActiveRunControl(control),
    );
  }

  function registerRunControl(control: ActiveRunControl) {
    activeRunRegistry.set(control.clientId, control);
    if (runControlIsSelected(control)) {
      setSelectedRunAliases(control);
    }
  }

  function updateRunControlBrowserState(
    control: ActiveRunControl,
    state: BrowserSessionState,
  ) {
    if (
      !control.browserSession ||
      control.browserSession.token !== state.token
    ) {
      return;
    }
    control.browserSession = {
      ...control.browserSession,
      state,
    };
    activeRunRegistry.touch();
  }

  async function refreshRunControlBrowserState(control: ActiveRunControl) {
    const token = control.browserSession?.token;
    if (!token) return;
    try {
      updateRunControlBrowserState(
        control,
        await readBrowserSessionStatus(token),
      );
    } catch {
      // MCP startup events remain the primary source; status refresh is supplementary.
    }
  }

  function setRunControlBrowserLifecycle(
    control: ActiveRunControl,
    status: BrowserSessionState["status"],
    error: string | null = null,
  ) {
    const session = control.browserSession;
    if (!session) return;
    updateRunControlBrowserState(control, {
      ...session.state,
      status,
      error,
    });
  }

  function applyBrowserLifecycleNotification(
    control: ActiveRunControl,
    method: string | null,
    params: Record<string, unknown>,
  ) {
    if (
      method === "turn/completed" ||
      method === "turn/interrupted" ||
      method === "error"
    ) {
      control.activePlaywrightToolCalls.clear();
    }
    if (!control.browserSession) return;
    if (
      method === "mcpServer/startupStatus/updated" &&
      readString(params.name) === "playwright"
    ) {
      const status = readString(params.status);
      if (status === "starting" || status === "ready") {
        setRunControlBrowserLifecycle(control, status);
      } else if (status === "failed") {
        setRunControlBrowserLifecycle(
          control,
          "error",
          readString(params.error) ?? "The browser service could not start.",
        );
      } else if (status === "cancelled") {
        setRunControlBrowserLifecycle(control, "stopped");
      }
      void refreshRunControlBrowserState(control);
      return;
    }

    if (method === "item/started" || method === "item/completed") {
      const item = readObject(params.item);
      if (
        readString(item.type) !== "mcpToolCall" ||
        readString(item.server) !== "playwright"
      ) {
        return;
      }
      const itemId = readString(item.id);
      if (itemId) {
        if (method === "item/started") {
          const threadId = readString(params.threadId) ?? control.threadId;
          const turnId = readString(params.turnId) ?? control.turnId;
          const tool = readString(item.tool);
          if (threadId && turnId && tool) {
            control.activePlaywrightToolCalls.set(itemId, {
              itemId,
              threadId,
              turnId,
              tool,
              arguments: item.arguments ?? {},
            });
          }
        } else {
          control.activePlaywrightToolCalls.delete(itemId);
        }
      }
      setRunControlBrowserLifecycle(
        control,
        method === "item/started" &&
          control.browserSession.state.browserPid === null
          ? "starting"
          : "running",
        readString(readObject(item.error).message),
      );
      void refreshRunControlBrowserState(control);
    }
  }

  async function cleanupRunBrowserSession(
    control: ActiveRunControl,
    options: { unsubscribe?: boolean } = {},
  ) {
    const session = control.browserSession;
    if (!session) return;
    control.browserSession = null;
    activeRunRegistry.touch();

    if (options.unsubscribe !== false && control.threadId) {
      await codexRpcForProfile(
        control.profileKey,
        control.accountId,
        "thread/unsubscribe",
        { threadId: control.threadId },
      ).catch(() => undefined);
    }
    await stopBrowserSession(session.token).catch(() => undefined);
  }

  function clearUnroutedApprovalsForRun(
    profileKey: CodexProfileKey,
    threadId: string | null,
    turnId: string | null,
  ) {
    const current = unroutedApprovalsRef.current;
    const removed = current.filter(({ request }) =>
      approvalRequestMatchesRun(request, profileKey, threadId, turnId),
    );
    if (removed.length === 0) return;

    const next = current.filter(
      ({ request }) =>
        !approvalRequestMatchesRun(request, profileKey, threadId, turnId),
    );
    unroutedApprovalsRef.current = next;
    setUnroutedApprovals(next);
    removed.forEach(({ request }) => {
      void removeAgentNotification(
        approvalNotificationEventKey(request),
      ).catch(() => undefined);
    });
  }

  function removeUnroutedApprovalByKey(requestKey: string) {
    const current = unroutedApprovalsRef.current;
    if (
      !current.some(({ request }) => request.key === requestKey)
    ) {
      return;
    }
    const next = current.filter(
      ({ request }) => request.key !== requestKey,
    );
    unroutedApprovalsRef.current = next;
    setUnroutedApprovals(next);
  }

  function rememberResolvedOrphanApproval(requestKey: string) {
    const resolved = resolvedOrphanApprovalKeysRef.current;
    resolved.add(requestKey);
    if (resolved.size <= 256) return;
    const oldest = resolved.values().next().value;
    if (typeof oldest === "string") resolved.delete(oldest);
  }

  function markCodexProfileDisconnected(
    profileKey: CodexProfileKey,
    accountId: number,
  ) {
    const connectionId =
      profileKey === DEFAULT_CODEX_PROFILE_KEY ? 0 : accountId;
    const next = new Set(connectedAccountIdsRef.current);
    next.delete(connectionId);
    connectedAccountIdsRef.current = next;
    setConnectedAccountIds(next);
    collaborationModeMasksRef.current.delete(profileKey);
  }

  function approvalResolutionAlreadyTerminal(error: unknown) {
    const message =
      error instanceof Error ? error.message : String(error);
    return /stale|already resolved|already submitted|not connected/iu.test(
      message,
    );
  }

  async function rejectOrphanedApproval(
    attention: PendingApprovalAttention,
  ) {
    const requestKey = attention.request.key;
    if (
      resolvedOrphanApprovalKeysRef.current.has(requestKey) ||
      orphanApprovalResolutionLocksRef.current.has(requestKey)
    ) {
      return;
    }
    orphanApprovalResolutionLocksRef.current.add(requestKey);

    try {
      const denial = findSafeApprovalDenialChoice(attention.request);
      if (denial) {
        if (
          attention.request.profileKey === DEFAULT_CODEX_PROFILE_KEY
        ) {
          await resolveDefaultCodexServerRequest(
            attention.request.id,
            attention.request.requestToken,
            denial.response,
          );
        } else {
          await resolveCodexServerRequest(
            attention.accountId,
            attention.request.id,
            attention.request.requestToken,
            denial.response,
          );
        }
      } else {
        let interrupted = false;
        if (attention.request.threadId && attention.request.turnId) {
          try {
            await codexRpcForProfile(
              attention.request.profileKey,
              attention.accountId,
              "turn/interrupt",
              {
                threadId: attention.request.threadId,
                turnId: attention.request.turnId,
              },
            );
            interrupted = true;
          } catch {
            // If the stale turn cannot be interrupted, an idle profile can be
            // restarted without disrupting a bound agent turn.
          }
        }

        if (!interrupted) {
          const hasBoundProfileTurn = [
            ...activeRunRegistry.values(),
          ].some(
            (control) =>
              isActiveRunControl(control) &&
              control.profileKey === attention.request.profileKey &&
              control.turnId !== null,
          );
          if (hasBoundProfileTurn) {
            throw new Error(
              "The stale request could not be cancelled without interrupting another active turn.",
            );
          }
          if (
            attention.request.profileKey === DEFAULT_CODEX_PROFILE_KEY
          ) {
            await stopDefaultCodexProfile();
          } else {
            await stopCodex(attention.accountId);
          }
          markCodexProfileDisconnected(
            attention.request.profileKey,
            attention.accountId,
          );
        }
      }

      rememberResolvedOrphanApproval(requestKey);
      removeUnroutedApprovalByKey(requestKey);
      void removeAgentNotification(
        approvalNotificationEventKey(attention.request),
      ).catch(() => undefined);
    } catch (error) {
      if (approvalResolutionAlreadyTerminal(error)) {
        rememberResolvedOrphanApproval(requestKey);
        removeUnroutedApprovalByKey(requestKey);
        return;
      }
      setApprovalSafetyWarning(
        "Codex has a stale approval request that could not be cancelled safely. Stop the affected turn or restart its Codex profile.",
      );
    } finally {
      orphanApprovalResolutionLocksRef.current.delete(requestKey);
    }
  }

  function reconcileUnroutedApprovals() {
    const controls = [...activeRunRegistry.values()];
    for (const attention of unroutedApprovalsRef.current) {
      const exactControl = findRunControlForIds(
        attention.request.profileKey,
        attention.request.threadId,
        attention.request.turnId,
      );
      if (exactControl) {
        updateRunControlView(exactControl, (current) =>
          addApprovalRequest(current, attention.request),
        );
        const child = subagentStore.findByThread(
          attention.request.profileKey,
          attention.request.threadId,
        );
        if (child?.ownerClientId === exactControl.clientId) {
          setSubagentAttention(
            exactControl,
            child.childThreadId,
            true,
          );
        }
        removeUnroutedApprovalByKey(attention.request.key);
        continue;
      }
      if (
        !controls.some((control) =>
          pendingApprovalCouldBelongToControl(
            attention,
            control,
            subagentStore,
          ),
        )
      ) {
        void rejectOrphanedApproval(attention);
      }
    }
  }

  function clearApprovalAttentionForRun(
    profileKey: CodexProfileKey,
    threadId: string | null,
    turnId: string | null,
  ) {
    activeRunRegistry.forEach((control) => {
      const matchingRequests = control.runView.approvalRequests.filter(
        (request) =>
          approvalRequestMatchesRun(
            request,
            profileKey,
            threadId,
            turnId,
          ),
      );
      matchingRequests.forEach((request) => {
        void removeAgentNotification(
          approvalNotificationEventKey(request),
        ).catch(() => undefined);
      });
      if (matchingRequests.length > 0) {
        updateRunControlView(control, (current) =>
          matchingRequests.reduce(
            (next, request) =>
              resolveApprovalRequest(
                next,
                request.id,
                request.threadId ?? undefined,
              ),
            current,
          ),
        );
      }
    });
    clearUnroutedApprovalsForRun(profileKey, threadId, turnId);
  }

  function removeRunControl(
    control: ActiveRunControl,
    options: { cleanupBrowser?: boolean } = {},
  ) {
    if (activeRunRegistry.get(control.clientId) !== control) return;
    if (control.runView.status === "completed") {
      appServices.runCoordinator.tryTransition(control.clientId, "completing");
      appServices.runCoordinator.tryTransition(control.clientId, "completed");
    } else if (control.runView.status === "failed") {
      appServices.runCoordinator.tryTransition(control.clientId, "rolling-back");
      appServices.runCoordinator.tryTransition(
        control.clientId,
        "failed",
        control.runView.error,
      );
    } else if (control.stopped) {
      appServices.runCoordinator.tryTransition(control.clientId, "cancelling");
    }
    control.activePlaywrightToolCalls.clear();
    cancelWebPreviewDetection(control);
    if (options.cleanupBrowser !== false && control.browserSession) {
      void cleanupRunBrowserSession(control);
    }
    control.runView.serverRequests
      .filter(isNativeUserInputRequest)
      .forEach((request) => {
        void removeAgentNotification(
          userInputNotificationEventKey(control.profileKey, request),
        ).catch(() => undefined);
      });
    control.runView.approvalRequests.forEach((request) => {
      void removeAgentNotification(
        approvalNotificationEventKey(request),
      ).catch(() => undefined);
    });
    clearUnroutedApprovalsForRun(
      control.profileKey,
      control.threadId,
      control.turnId,
    );
    activeRunRegistry.delete(control.clientId);
    pendingRunBindingNotificationsRef.current =
      pendingRunBindingNotificationsRef.current.filter((pending) => {
        if (pending.profileKey !== control.profileKey) return true;
        const identity = readCodexMessageRunIdentity(pending.message);
        if (control.turnId && identity.turnId === control.turnId) return false;
        return !(
          control.threadId &&
          identity.threadId === control.threadId &&
          (!identity.turnId || !control.turnId)
        );
      });
    if (activeRunControlRef.current === control) {
      setSelectedRunAliases(null);
    }
  }

  function findRunControlByChat(workspaceId: number, chatId: number) {
    return (
      [...activeRunRegistry.values()].find(
        (control) =>
          isActiveRunControl(control) &&
          control.workspaceId === workspaceId &&
          control.chatId === chatId,
      ) ?? null
    );
  }

  function findRunControlForMessage(
    profileKey: CodexProfileKey,
    message: CodexMessage,
  ) {
    const {
      threadId: messageThreadId,
      turnId: messageTurnId,
    } = readCodexMessageRunIdentity(message);
    return findRunControlForIds(
      profileKey,
      messageThreadId,
      messageTurnId,
      message.method === "turn/started",
    );
  }

  function prunePendingRunBindingNotifications(now = Date.now()) {
    pendingRunBindingNotificationsRef.current =
      pendingRunBindingNotificationsRef.current.filter(
        (pending) => now - pending.receivedAt <= RUN_NOTIFICATION_BINDING_TTL_MS,
      );
  }

  function bufferPendingRunBindingNotification(
    accountId: number,
    profileKey: CodexProfileKey,
    message: CodexMessage,
  ) {
    const method = message.method ?? "";
    if (!BUFFERABLE_RUN_NOTIFICATION_METHODS.has(method)) return;

    const identity = readCodexMessageRunIdentity(message);
    if (!identity.threadId && !identity.turnId) return;
    const hasProfileRun = [...activeRunRegistry.values()].some(
      (control) => !control.stopped && control.profileKey === profileKey,
    );
    if (!hasProfileRun) return;

    prunePendingRunBindingNotifications();
    pendingRunBindingNotificationsRef.current.push({
      accountId,
      profileKey,
      message,
      receivedAt: Date.now(),
    });
    const overflow =
      pendingRunBindingNotificationsRef.current.length -
      RUN_NOTIFICATION_BINDING_BUFFER_LIMIT;
    if (overflow > 0) {
      pendingRunBindingNotificationsRef.current.splice(0, overflow);
    }
  }

  async function flushPendingRunBindingNotifications(
    control: ActiveRunControl,
  ) {
    prunePendingRunBindingNotifications();
    const replay: PendingRunBindingNotification[] = [];
    pendingRunBindingNotificationsRef.current =
      pendingRunBindingNotificationsRef.current.filter((pending) => {
        const match = findRunControlForMessage(
          pending.profileKey,
          pending.message,
        );
        if (match !== control) return true;
        replay.push(pending);
        return false;
      });

    for (const pending of replay) {
      await handleCodexNotification(
        pending.accountId,
        pending.profileKey,
        pending.message,
      );
    }
  }

  function saveSubagentRecord(record: SubagentRecord) {
    subagentStore.upsert(record);
    if (record.runId === null) return;
    void upsertRunSubagent(record).catch((error) => {
      console.error("Could not persist subagent lifecycle", error);
    });
  }

  function trackSubagentCollaboration(
    control: ActiveRunControl,
    message: CodexMessage,
  ) {
    const identity = readCodexMessageRunIdentity(message);
    const now = new Date().toISOString();
    const records = parseCollabToolCalls(message).map((call) => {
      const existing = subagentStore.findByThread(
        control.profileKey,
        call.childThreadId,
      );
      const hierarchyParent =
        call.senderThreadId === control.threadId
          ? null
          : subagentStore.findByThread(control.profileKey, call.senderThreadId);
      const status = lifecycleFromCollabToolCall(
        call,
        message.method,
        existing?.status ?? null,
      );
      const terminal = !isActiveSubagentStatus(status);
      const record: SubagentRecord = {
        id:
          existing?.id ??
          `${control.profileKey}:${control.runId ?? control.clientId}:${call.childThreadId}`,
        ownerClientId: control.clientId,
        workspaceId: control.workspaceId,
        chatId: control.chatId,
        runId: control.runId,
        parentTurnId:
          existing?.parentTurnId ??
          identity.turnId ??
          hierarchyParent?.childTurnId ??
          control.turnId,
        profileKey: control.profileKey,
        accountId: control.accountId,
        rootThreadId:
          existing?.rootThreadId ??
          control.threadId ??
          call.senderThreadId,
        parentThreadId: call.senderThreadId,
        childThreadId: call.childThreadId,
        childTurnId: existing?.childTurnId ?? null,
        spawnItemId:
          call.tool === "spawn_agent"
            ? call.itemId
            : existing?.spawnItemId ?? null,
        task: call.prompt ?? existing?.task ?? "Subagent task",
        depth:
          existing?.depth ??
          (hierarchyParent ? hierarchyParent.depth + 1 : 1),
        status,
        statusBeforeAttention:
          status === "needs-attention"
            ? existing?.statusBeforeAttention ??
              existing?.status ??
              "running"
            : null,
        agentStatus: call.agentStatus ?? existing?.agentStatus ?? null,
        needsAttention: status === "needs-attention",
        error:
          status === "failed"
            ? existing?.error ?? "The subagent operation failed."
            : null,
        finalResult: existing?.finalResult ?? null,
        startedAt: existing?.startedAt ?? now,
        updatedAt: now,
        completedAt: terminal ? existing?.completedAt ?? now : null,
      };
      saveSubagentRecord(record);
      return record;
    });
    if (records.length > 0) return records;

    const legacy = parseLegacySubagentActivity(message);
    if (!legacy) return [];
    const existing = subagentStore.findByThread(
      control.profileKey,
      legacy.childThreadId,
    );
    const parentThreadId =
      identity.threadId ?? control.threadId ?? legacy.childThreadId;
    const hierarchyParent =
      parentThreadId === control.threadId
        ? null
        : subagentStore.findByThread(control.profileKey, parentThreadId);
    const terminal = !isActiveSubagentStatus(legacy.status);
    const record: SubagentRecord = {
      id:
        existing?.id ??
        `${control.profileKey}:${control.runId ?? control.clientId}:${legacy.childThreadId}`,
      ownerClientId: control.clientId,
      workspaceId: control.workspaceId,
      chatId: control.chatId,
      runId: control.runId,
      parentTurnId:
        existing?.parentTurnId ??
        identity.turnId ??
        hierarchyParent?.childTurnId ??
        control.turnId,
      profileKey: control.profileKey,
      accountId: control.accountId,
      rootThreadId:
        existing?.rootThreadId ??
        control.threadId ??
        parentThreadId,
      parentThreadId,
      childThreadId: legacy.childThreadId,
      childTurnId: existing?.childTurnId ?? null,
      spawnItemId: existing?.spawnItemId ?? legacy.itemId,
      task:
        existing?.task ??
        (legacy.agentPath
          ? `Subagent ${legacy.agentPath}`
          : "Subagent task"),
      depth:
        existing?.depth ??
        (hierarchyParent ? hierarchyParent.depth + 1 : 1),
      status: legacy.status,
      statusBeforeAttention: existing?.statusBeforeAttention ?? null,
      agentStatus: existing?.agentStatus ?? null,
      needsAttention: false,
      error: existing?.error ?? null,
      finalResult: existing?.finalResult ?? null,
      startedAt: existing?.startedAt ?? now,
      updatedAt: now,
      completedAt: terminal ? existing?.completedAt ?? now : null,
    };
    saveSubagentRecord(record);
    return [record];
  }

  function updateSubagentFromNotification(
    control: ActiveRunControl,
    record: SubagentRecord,
    message: CodexMessage,
  ) {
    const identity = readCodexMessageRunIdentity(message);
    const now = new Date().toISOString();
    const lifecycle = lifecycleFromChildTurn(
      message.method,
      readSubagentTurnStatus(message),
    );
    const visibleResult = readSubagentVisibleResult(message);
    const failed = lifecycle === "failed" || message.method === "error";
    const status =
      lifecycle ??
      (message.method === "thread/status/changed"
        ? readString(readObject(readObject(message.params).status).type) ===
          "idle"
          ? "waiting"
          : record.status
        : record.status);
    const terminal = !isActiveSubagentStatus(status);
    const next: SubagentRecord = {
      ...record,
      ownerClientId: control.clientId,
      chatId: control.chatId,
      runId: control.runId,
      childTurnId:
        message.method?.startsWith("turn/")
          ? identity.turnId ?? record.childTurnId
          : record.childTurnId,
      status,
      statusBeforeAttention:
        status === "needs-attention"
          ? record.statusBeforeAttention ?? record.status
          : record.statusBeforeAttention,
      needsAttention:
        status === "needs-attention" ? true : record.needsAttention,
      error: failed ? readSubagentError(message) ?? record.error : record.error,
      finalResult: visibleResult ?? record.finalResult,
      updatedAt: now,
      completedAt: terminal ? record.completedAt ?? now : null,
    };
    saveSubagentRecord(next);
    return next;
  }

  function setSubagentAttention(
    control: ActiveRunControl,
    threadId: string | null,
    needsAttention: boolean,
  ) {
    if (!threadId) return null;
    const next = subagentStore.updateByThread(
      control.profileKey,
      threadId,
      (record) => ({
        ...record,
        status: needsAttention
          ? "needs-attention"
          : !isActiveSubagentStatus(record.status)
            ? record.status
            : record.statusBeforeAttention &&
                isActiveSubagentStatus(record.statusBeforeAttention)
              ? record.statusBeforeAttention
              : "running",
        statusBeforeAttention: needsAttention
          ? record.status === "needs-attention"
            ? record.statusBeforeAttention
            : record.status
          : null,
        needsAttention,
        updatedAt: new Date().toISOString(),
      }),
    );
    if (next?.runId !== null && next?.runId !== undefined) {
      void upsertRunSubagent(next).catch((error) => {
        console.error("Could not persist subagent attention", error);
      });
    }
    return next;
  }

  function subagentHasPendingInteractions(
    control: ActiveRunControl,
    threadId: string,
  ) {
    return (
      control.runView.approvalRequests.some(
        (request) =>
          request.threadId === threadId &&
          request.status !== "stale",
      ) ||
      control.runView.serverRequests.some((request) => {
        const identity = readCodexMessageRunIdentity(request);
        return identity.threadId === threadId;
      })
    );
  }

  function clearSubagentInteractions(
    control: ActiveRunControl,
    threadId: string,
  ) {
    const approvals = control.runView.approvalRequests.filter(
      (request) => request.threadId === threadId,
    );
    const questions = control.runView.serverRequests
      .filter(isNativeUserInputRequest)
      .filter((request) => request.params.threadId === threadId);
    approvals.forEach((request) => {
      void removeAgentNotification(
        approvalNotificationEventKey(request),
      ).catch(() => undefined);
    });
    questions.forEach((request) => {
      clearUserInputAutoResolutionTimer(control.profileKey, request.id);
      void removeAgentNotification(
        userInputNotificationEventKey(control.profileKey, request),
      ).catch(() => undefined);
    });
    if (approvals.length > 0 || questions.length > 0) {
      updateRunControlView(control, (current) => {
        const withoutApprovals = approvals.reduce(
          (next, request) =>
            resolveApprovalRequest(
              next,
              request.id,
              request.threadId ?? undefined,
            ),
          current,
        );
        return questions.reduce(
          (next, request) => resolveServerRequest(next, request.id),
          withoutApprovals,
        );
      });
    }
    setSubagentAttention(control, threadId, false);
  }

  function findRunControlForIds(
    profileKey: CodexProfileKey,
    threadId: string | null,
    turnId: string | null,
    allowThreadContinuation = false,
  ) {
    const child = subagentStore.findByThread(profileKey, threadId);
    if (child?.ownerClientId) {
      const owner =
        activeRunRegistry.get(child.ownerClientId) ?? null;
      if (
        owner &&
        !owner.stopped &&
        owner.profileKey === profileKey &&
        (!turnId ||
          !child.childTurnId ||
          child.childTurnId === turnId ||
          child.status === "starting")
      ) {
        return owner;
      }
    }
    return (
      selectRunControlForIds(
        [...activeRunRegistry.values()].map((control) => ({
          control,
          profileKey: control.profileKey,
          stopped: control.stopped,
          threadId: control.threadId,
          turnId: control.turnId,
          startedAt: control.runView.startedAt,
          acceptsThreadContinuation:
            control.acceptsThreadContinuation && control.goalTurnCompleted,
        })),
        profileKey,
        threadId,
        turnId,
        allowThreadContinuation,
      )?.control ?? null
    );
  }

  function startTaskChatEntry(entry: TaskChatEntry) {
    setSelectedHistoryChatId(entry.chatId ?? null);
    if (entry.chatId === null) setSelectedDraftChat(entry.clientId);
    setTaskChatEntries((current) => [...current, entry]);
  }

  function replaceTaskChatEntry(targetClientId: string, entry: TaskChatEntry) {
    setSelectedHistoryChatId(entry.chatId ?? null);
    if (entry.chatId === null) setSelectedDraftChat(entry.clientId);
    setTaskChatEntries((current) =>
      current.map((currentEntry) =>
        currentEntry.clientId === targetClientId ? entry : currentEntry,
      ),
    );
  }

  function restoreTaskChatEntry(targetClientId: string, entry: TaskChatEntry) {
    setTaskChatEntries((current) =>
      current.map((currentEntry) =>
        currentEntry.clientId === targetClientId ? entry : currentEntry,
      ),
    );
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
    const control = activeRunRegistry.get(clientId);
    if (control?.entry) {
      control.entry = { ...control.entry, ...ids };
    }
    if (ids.chatId !== undefined) {
      subagentStore.promoteConversation(clientId, ids.chatId);
    }
    if (ids.runId !== undefined) {
      const conversationKey = subagentConversationKey({
        chatId: ids.chatId ?? control?.chatId ?? null,
        ownerClientId: clientId,
      });
      if (conversationKey) {
        subagentStore.getConversation(conversationKey)
          .filter((record) => record.ownerClientId === clientId)
          .forEach((record) => {
            saveSubagentRecord({
              ...record,
              runId: ids.runId ?? record.runId,
              chatId: ids.chatId ?? record.chatId,
              updatedAt: new Date().toISOString(),
            });
          });
      }
    }
    setTaskChatEntries((current) =>
      current.map((entry) =>
        entry.clientId === clientId ? { ...entry, ...ids } : entry,
      ),
    );
  }

  function updateTaskChatEntry(
    clientId: string,
    updater: (entry: TaskChatEntry) => TaskChatEntry,
  ) {
    const control = activeRunRegistry.get(clientId);
    if (control?.entry) {
      control.entry = updater(control.entry);
    }
    setTaskChatEntries((current) =>
      current.map((entry) =>
        entry.clientId === clientId ? updater(entry) : entry,
      ),
    );
  }

  function updateTaskChatEntryRunView(
    clientId: string,
    updater: (runView: RunViewState) => RunViewState,
  ) {
    const control = activeRunRegistry.get(clientId);
    let controlledRunView: RunViewState | null = null;
    if (control?.entry) {
      const nextRunView = updater(control.entry.runView);
      controlledRunView = nextRunView;
      control.entry = {
        ...control.entry,
        status: nextRunView.status,
        runView: nextRunView,
      };
      control.runView = nextRunView;
    }
    setTaskChatEntries((current) =>
      current.map((entry) => {
        if (entry.clientId !== clientId) return entry;
        const nextRunView = controlledRunView ?? updater(entry.runView);
        return { ...entry, status: nextRunView.status, runView: nextRunView };
      }),
    );
  }

  function updateRunControlView(
    control: ActiveRunControl,
    updater: (current: RunViewState) => RunViewState,
  ) {
    const nextRunView = updater(control.runView);
    control.runView = nextRunView;
    if (control.entry) {
      control.entry = {
        ...control.entry,
        status: nextRunView.status,
        runView: nextRunView,
      };
    }
    if (activeRunControlRef.current === control) {
      runViewRef.current = nextRunView;
      setRunView(nextRunView);
    }
    setTaskChatEntries((current) =>
      current.map((entry) =>
        entry.clientId === control.clientId
          ? { ...entry, status: nextRunView.status, runView: nextRunView }
          : entry,
      ),
    );
    return nextRunView;
  }

  function inspectCodexMessageForWebPreview(
    control: ActiveRunControl,
    message: CodexMessage,
  ) {
    const signal = readWebPreviewCommandSignal(message);
    if (!signal || control.webPreviewDetection.disposed) return;

    const current = control.webPreviewDetection.commands.get(signal.commandId) ?? {
      command: "",
      output: "",
    };
    const next = {
      command: signal.command || current.command,
      output: commandOutputTail(current.output, signal.outputDelta),
    };
    control.webPreviewDetection.commands.set(signal.commandId, next);

    extractLocalWebPreviewCandidates(next).forEach((url) => {
      scheduleWebPreviewProbe(control, url, signal.commandId);
    });

    if (
      signal.completed &&
      control.runView.webPreview?.sourceCommandId === signal.commandId
    ) {
      void recheckWebPreview(control.runView.webPreview, {
        control,
        entryClientId: control.clientId,
        runId: control.runId,
      });
    }
  }

  function scheduleWebPreviewProbe(
    control: ActiveRunControl,
    url: string,
    sourceCommandId: string,
  ) {
    const detection = control.webPreviewDetection;
    if (
      detection.disposed ||
      detection.probes.has(url) ||
      control.runView.webPreview?.url === url
    ) {
      return;
    }

    const sequence = detection.nextSequence + 1;
    detection.nextSequence = sequence;
    const probe: WebPreviewProbeAttempt = {
      sequence,
      sourceCommandId,
      timers: new Set(),
    };
    detection.probes.set(url, probe);

    const attempt = (attemptIndex: number) => {
      if (
        detection.disposed ||
        detection.probes.get(url) !== probe
      ) {
        return;
      }
      const delay = WEB_PREVIEW_PROBE_RETRY_DELAYS_MS[attemptIndex];
      const timer = window.setTimeout(() => {
        probe.timers.delete(timer);
        void probeLocalWebPreview(url)
          .then((result) => {
            if (
              detection.disposed ||
              detection.probes.get(url) !== probe
            ) {
              return;
            }
            if (!result.reachable) {
              if (attemptIndex + 1 < WEB_PREVIEW_PROBE_RETRY_DELAYS_MS.length) {
                attempt(attemptIndex + 1);
              } else {
                detection.probes.delete(url);
              }
              return;
            }

            detection.probes.delete(url);
            if (probe.sequence < detection.confirmedSequence) return;
            detection.confirmedSequence = probe.sequence;
            const preview: RunWebPreview = {
              version: 1,
              url: result.normalizedUrl,
              origin: new URL(result.normalizedUrl).origin,
              detectedAt: new Date().toISOString(),
              sourceCommandId,
              availability: "available",
            };
            updateRunControlView(control, (currentRunView) => ({
              ...currentRunView,
              webPreview: preview,
            }));
            if (control.runId !== null) {
              void updateRun(control.runId, {
                webPreviewJson: serializeRunWebPreview(preview),
              }).catch((error) => {
                console.error("Could not persist the web preview", error);
              });
            }
          })
          .catch((error) => {
            detection.probes.delete(url);
            console.error("Could not probe the local web preview", error);
            setStatusMessage(
              "Web preview detection is unavailable. Restart Orchestrator and try again.",
            );
          });
      }, delay);
      probe.timers.add(timer);
    };

    attempt(0);
  }

  async function recheckWebPreview(
    preview: RunWebPreview,
    target: {
      control?: ActiveRunControl;
      entryClientId: string;
      runId: number | null;
    },
  ) {
    let result;
    try {
      result = await probeLocalWebPreview(preview.url);
    } catch {
      result = { normalizedUrl: preview.url, reachable: false };
    }
    const nextPreview: RunWebPreview = {
      ...preview,
      url: result.normalizedUrl,
      origin: new URL(result.normalizedUrl).origin,
      availability: result.reachable ? "available" : "unavailable",
    };
    if (
      target.control &&
      !target.control.webPreviewDetection.disposed &&
      target.control.runView.webPreview?.url === preview.url
    ) {
      updateRunControlView(target.control, (current) => ({
        ...current,
        webPreview: nextPreview,
      }));
    } else {
      updateTaskChatEntryRunView(target.entryClientId, (current) =>
        current.webPreview?.url === preview.url
          ? { ...current, webPreview: nextPreview }
          : current,
      );
    }
    if (target.runId !== null) {
      await updateRun(target.runId, {
        webPreviewJson: serializeRunWebPreview(nextPreview),
      }).catch(() => undefined);
    }
    return nextPreview;
  }

  function probeTerminalWebPreview(
    url: string,
    sourceCommandId: string,
    target: {
      entryClientId: string;
      runId: number | null;
    },
  ) {
    const attempt = (attemptIndex: number) => {
      window.setTimeout(() => {
        void probeLocalWebPreview(url)
          .then((result) => {
            if (!result.reachable) {
              if (attemptIndex + 1 < WEB_PREVIEW_PROBE_RETRY_DELAYS_MS.length) {
                attempt(attemptIndex + 1);
              }
              return;
            }
            const preview: RunWebPreview = {
              version: 1,
              url: result.normalizedUrl,
              origin: new URL(result.normalizedUrl).origin,
              detectedAt: new Date().toISOString(),
              sourceCommandId,
              availability: "available",
            };
            updateTaskChatEntryRunView(target.entryClientId, (current) => ({
              ...current,
              webPreview: preview,
            }));
            if (target.runId !== null) {
              void updateRun(target.runId, {
                webPreviewJson: serializeRunWebPreview(preview),
              }).catch(() => undefined);
            }
          })
          .catch((error) => {
            console.error("Could not probe the local web preview", error);
            setStatusMessage(
              "Web preview detection is unavailable. Restart Orchestrator and try again.",
            );
          });
      }, WEB_PREVIEW_PROBE_RETRY_DELAYS_MS[attemptIndex]);
    };

    attempt(0);
  }

  function cancelWebPreviewDetection(control: ActiveRunControl) {
    const detection = control.webPreviewDetection;
    detection.disposed = true;
    detection.probes.forEach((probe) => {
      probe.timers.forEach((timer) => window.clearTimeout(timer));
      probe.timers.clear();
    });
    detection.probes.clear();
    detection.commands.clear();
  }

  function clearActiveChatRun() {
    activeChatEntryIdRef.current = null;
    setActiveChatEntryId(null);
  }

  function ensureRunControlActive(control: ActiveRunControl) {
    if (
      control.stopped ||
      (control.kanbanStopRequest !== null && control.turnId === null) ||
      activeRunRegistry.get(control.clientId) !== control
    ) {
      throw new RunStoppedError();
    }
  }

  function markRunInterrupted(
    control: ActiveRunControl,
    message = "Stopped by user.",
  ) {
    const completedAt = new Date().toISOString();
    const stoppedRunView = updateRunControlView(control, (current) => {
      const elapsedRunView = updateRunElapsed(current);
      return {
        ...elapsedRunView,
        status: "interrupted",
        completedAt,
        error: message,
        approvalRequests: [],
        approvalResourcesByItemId: {},
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
        nativePlan:
          elapsedRunView.nativePlan.mode === "plan"
            ? {
                ...elapsedRunView.nativePlan,
                phase: "cancelled",
                reviewState: "cancelled",
              }
            : elapsedRunView.nativePlan,
      };
    });

    return { completedAt, stoppedRunView };
  }

  function refreshKanbanBoards() {
    setKanbanRefreshToken((current) => current + 1);
  }

  async function terminalizeKanbanRunAfterProcessStop(
    control: ActiveRunControl,
    processMessage: string,
  ) {
    if (
      !control.kanbanAttempt ||
      activeRunRegistry.get(control.clientId) !== control
    ) {
      return;
    }
    const error = processMessage || "The Codex app-server stopped unexpectedly.";
    const { completedAt, stoppedRunView } = markRunInterrupted(control, error);
    const persistence = await kanbanAttempts.persist(
      control,
      "interrupted",
      error,
      { retryCount: 1 },
    );
    await Promise.all([
      control.runId === null
        ? Promise.resolve()
        : updateRun(control.runId, {
            status: "interrupted",
            completedAt,
            durationMs: stoppedRunView.elapsedMs,
            error,
          }).catch(() => undefined),
      control.taskId === null
        ? Promise.resolve()
        : updateTaskStatus(control.taskId, "interrupted").catch(
            () => undefined,
          ),
      control.chatId === null
        ? Promise.resolve()
        : updateChat(control.chatId, { status: "interrupted" }).catch(
            () => undefined,
          ),
    ]);
    if (persistence.persisted) {
      removeRunControl(control);
      return;
    }
    setStatusMessage(
      `The Codex app-server stopped, but the Kanban attempt could not be saved: ${persistence.error}`,
    );
  }

  async function persistInterruptedRun(
    control: ActiveRunControl | null,
    completedAt: string,
    stoppedRunView: RunViewState,
  ) {
    const runId = control?.runId ?? null;
    const taskId = control?.taskId ?? null;

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

    if (control?.kanbanAttempt) {
      await kanbanAttempts.persist(
        control,
        control.kanbanStopStatus ?? "stopped",
        control.kanbanStopStatus === "paused"
          ? null
          : stoppedRunView.error ?? "Stopped by user.",
      );
    }
  }

  async function stopActiveRun(
    targetControl?: ActiveRunControl | null,
  ): Promise<StopActiveRunResult> {
    const control =
      targetControl === undefined
        ? selectedActiveRunControl ?? activeRunControlRef.current
        : targetControl;
    const accountId =
      control?.accountId ?? currentRunAccountId.current ?? selectedAccountIdRef.current;
    const profileKey =
      control?.profileKey ??
      currentRunProfileKey.current ??
      (accountId ? (`account:${accountId}` as CodexProfileKey) : null);

    if (!control) {
      return { stopped: false, goalCleared: false };
    }

    let kanbanStopRequest: PendingKanbanStopRequest | null = null;
    if (control.kanbanAttempt) {
      if (control.kanbanStopRequest) {
        setStatusMessage("This Kanban run already has a stop request in progress.");
        return { stopped: false, goalCleared: false };
      }
      control.kanbanStopStatus ??= "stopped";
      kanbanStopRequest = createPendingKanbanStopRequest();
      control.kanbanStopRequest = kanbanStopRequest;
      control.cancelScheduledSetup?.();
      control.cancelScheduledSetup = null;
      if (control.turnId === null && !control.turnStartPending) {
        kanbanStopRequest.settle({ acknowledged: true });
      }
      await kanbanAttempts.persist(
        control,
        control.kanbanStopStatus === "paused"
          ? "pause_requested"
          : "stop_requested",
      );
    }

    flushFrameBatchedCodexNotifications();
    await flushBufferedRunEvents().catch(() => undefined);

    if (kanbanStopRequest) {
      if (
        !kanbanStopRequest.settled &&
        control.threadId !== null &&
        control.turnId !== null
      ) {
        void acknowledgeKanbanStopWithTurn(
          control,
          kanbanStopRequest,
          control.threadId,
          control.turnId,
          interruptTurnForProfile,
        );
      } else if (
        !kanbanStopRequest.settled &&
        control.turnId === null &&
        !control.turnStartPending
      ) {
        kanbanStopRequest.settle({ acknowledged: true });
      }

      const acknowledgement = await kanbanStopRequest.promise;
      if (!acknowledgement.acknowledged) {
        if (
          activeRunRegistry.get(control.clientId) !== control ||
          !isActiveRunControl(control)
        ) {
          control.kanbanStopRequest = null;
          control.kanbanStopStatus = null;
          return { stopped: true, goalCleared: false };
        }
        if (control.kanbanStopRequest === kanbanStopRequest) {
          control.kanbanStopRequest = null;
        }
        const action = control.kanbanStopStatus === "paused" ? "pause" : "stop";
        control.kanbanStopStatus = null;
        await kanbanAttempts.persist(
          control,
          kanbanStatusAfterFailedStop(control.runView),
        );
        setStatusMessage(
          `Could not ${action} the Kanban run; it is still active: ${acknowledgement.error}`,
        );
        return { stopped: false, goalCleared: false };
      }
      if (
        control.stopped ||
        activeRunRegistry.get(control.clientId) !== control
      ) {
        control.kanbanStopRequest = null;
        control.kanbanStopStatus = null;
        return { stopped: false, goalCleared: false };
      }
    }

    const threadId = control.threadId ?? runViewRef.current.threadId;
    const turnId = control.turnId ?? runViewRef.current.turnId;

    const planningThreadId = control?.runView.threadId ?? null;
    const planningTurnId = control?.runView.turnId ?? null;
    const interruptNativePlan =
      control?.runView.nativePlan.mode === "plan" &&
      planningThreadId !== null &&
      planningTurnId !== null &&
      profileKey !== null;
    const shouldStopCodex =
      kanbanStopRequest === null &&
      !interruptNativePlan &&
      profileKey !== null &&
      threadId !== null &&
      turnId !== null;
    const shouldClearThreadGoal =
      Boolean(control?.acceptsThreadContinuation) &&
      profileKey !== null &&
      threadId !== null;
    let goalClearError: string | null = null;

    if (control) {
      control.stopped = true;
      control.cancelScheduledSetup?.();
      control.cancelScheduledSetup = null;
    }

    const shouldRestorePrompt =
      control.queueItemId === null &&
      control.turnId === null &&
      Boolean(control.promptFallback);
    const { completedAt, stoppedRunView } = markRunInterrupted(control);
    if (shouldRestorePrompt && control) {
      updateTaskChatEntry(control.clientId, (entry) => ({
        ...entry,
        imageAttachmentDelivery: entry.imageAttachmentDelivery
          ? { status: "failed", error: "Stopped before the image was sent." }
          : undefined,
      }));
      restoreRunComposerForRetry(
        control.workspaceId,
        control.promptFallback,
        control.imageContextFilesFallback,
      );
    }
    await persistInterruptedRun(control, completedAt, stoppedRunView);
    if (control.queueItemId) {
      const failedQueueItem = await failPromptQueueItem(
        control.queueItemId,
        "The queued prompt was cancelled.",
      ).catch(() => null);
      if (failedQueueItem) {
        upsertPromptQueueItemInMemory(failedQueueItem);
      }
      if (control.chatId !== null) {
        setPromptQueuePaused(control.chatId, true, "failure");
      }
    } else if (
      control.chatId !== null &&
      (promptQueuesByChatRef.current[control.chatId] ?? []).some(
        isPromptQueueItemPending,
      )
    ) {
      setPromptQueuePaused(control.chatId, true, "failure");
    }

    if (
      shouldClearThreadGoal &&
      profileKey !== null &&
      accountId !== null &&
      threadId !== null
    ) {
      try {
        await clearThreadGoalForProfile(profileKey, accountId, threadId);
        control.acceptsThreadContinuation = false;
        control.goal = null;
        control.goalActionPending = null;
        control.goalActionError = null;
      } catch (error) {
        goalClearError =
          error instanceof Error ? error.message : String(error);
      }
    }

    if (interruptNativePlan && profileKey !== null && accountId !== null) {
      try {
        await codexRpcForProfile(profileKey, accountId, "turn/interrupt", {
          threadId: planningThreadId,
          turnId: planningTurnId,
        });
        const modes = await collaborationModesForRun(
          profileKey,
          accountId,
          selectedModel?.model ?? null,
          selectedReasoningEffort,
          false,
        );
        await codexRpcForProfile(profileKey, accountId, "thread/settings/update", {
          threadId: planningThreadId,
          collaborationMode: modes.default,
        });
        if (control?.chatId !== null && control?.chatId !== undefined) {
          await updateChat(control.chatId, { collaborationMode: "default" });
        }
      } catch (error) {
        setStatusMessage(
          `Plan turn stopped locally, but mode reset failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    removeRunControl(control, { cleanupBrowser: false });
    setStatusMessage(
      goalClearError
        ? `Codex run stopped, but its Goal Mode state could not be cleared: ${goalClearError}`
        : control.kanbanStopStatus === "paused"
          ? "Codex run paused."
          : "Codex run stopped.",
    );

    if (shouldStopCodex) {
      try {
        const interruptedTurnId = await interruptTurnForProfile(
          profileKey,
          accountId ?? 0,
          threadId,
          turnId,
        );
        if (interruptedTurnId) {
          control.turnId = interruptedTurnId;
        }
      } catch (error) {
        setStatusMessage(
          `Run stopped locally, but Codex could not be interrupted safely: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
    void cleanupRunBrowserSession(control);
    return {
      stopped: true,
      goalCleared: goalClearError === null,
    };
  }

  async function focusSelectedBrowserSession() {
    const control = selectedActiveRunControl;
    const token = control?.browserSession?.token;
    if (!control || !token) return;
    try {
      updateRunControlBrowserState(
        control,
        await focusBrowserSession(token),
      );
    } catch (error) {
      setStatusMessage(
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  async function stopSelectedBrowserSession() {
    const control = selectedActiveRunControl;
    const token = control?.browserSession?.token;
    if (!control || !token) return;
    try {
      updateRunControlBrowserState(
        control,
        await stopBrowserSession(token),
      );
      setStatusMessage("Browser session stopped.");
    } catch (error) {
      setStatusMessage(
        error instanceof Error ? error.message : String(error),
      );
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
    if (
      [...activeRunRegistry.values()].some(
        (control) =>
          isActiveRunControl(control) && control.workspaceId === workspace.id,
      )
    ) {
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
    if (findRunControlByChat(chat.workspace_id, chat.id)) {
      setStatusMessage("Wait for the active run to finish before removing this chat.");
      return;
    }

    setChatHistoryDeleteCandidate(chat);
  }

  function cacheStableHistoryChat(
    chat: ChatListItem,
    entries: TaskChatEntry[],
    transcript: HistoricalTranscriptState,
  ) {
    const cacheableTranscript: HistoricalTranscriptState = {
      ...transcript,
      positionIntent: "preserve",
      openAtLatestRequest: null,
    };
    const sourceCharacters = entries.reduce(
      (total, entry) => total + entry.runView.finalMessage.length,
      0,
    );
    appServices.historicalTranscripts.set(chat.id, {
      version: historyChatVersion(chat),
      renderVersion: HISTORICAL_RENDER_PIPELINE_VERSION,
      entries,
      transcript: cacheableTranscript,
      sourceCharacters,
    });
  }

  function publishStableHistoryChat(
    chat: ChatListItem,
    entries: TaskChatEntry[],
    transcript: HistoricalTranscriptState,
    loadId: number,
    positionIntent: HistoricalTranscriptState["positionIntent"] = "latest",
  ) {
    if (historyChatLoadIdRef.current !== loadId) return;
    const publishedTranscript: HistoricalTranscriptState = {
      ...transcript,
      positionIntent,
      openAtLatestRequest:
        positionIntent === "latest"
          ? {
              requestId: loadId,
              chatId: chat.id,
              transcriptVersion: transcript.sourceVersion,
            }
          : null,
    };
    const allEntries = replaceChatEntries(
      taskChatEntriesRef.current,
      chat.workspace_id,
      chat.id,
      entries,
    );
    taskChatEntriesRef.current = allEntries;
    historicalTranscriptRef.current = publishedTranscript;
    const remembered = workspaceTaskMemories.records[chat.workspace_id];
    if (
      remembered?.selection.kind === "chat" &&
      remembered.selection.session.chatId === chat.id
    ) {
      workspaceTaskMemories.records[chat.workspace_id] = {
        ...remembered,
        historicalTranscript:
          sanitizeRememberedHistoricalTranscript(publishedTranscript),
      };
    }
    startTransition(() => {
      setTaskChatEntries(allEntries);
      setHistoricalTranscript(publishedTranscript);
      setHistoryChatLoadState(null);
      setHistoryOpenRequest(null);
    });
    cacheStableHistoryChat(chat, entries, publishedTranscript);
    if (
      (chat.origin === "orchestrator" || isAdoptedExternalChat(chat)) &&
      entries.some((entry) => entry.runView.nativePlan.reviewState === "available")
    ) {
      void reconcileReopenedPlanWorkflow(chat, entries, loadId);
    }
  }

  async function reconcileReopenedPlanWorkflow(
    chat: ChatListItem,
    entries: TaskChatEntry[],
    loadId: number,
  ) {
    const entry = [...entries]
      .reverse()
      .find((candidate) => candidate.runView.nativePlan.reviewState === "available");
    const threadId = entry?.runView.threadId ?? chat.codex_thread_id;
    if (!entry || !threadId) return;
    const profileKey =
      chat.profile_key ??
      (chat.account_id === null
        ? null
        : (`account:${chat.account_id}` as CodexProfileKey));
    if (!profileKey) return;
    const accountId = profileKey === DEFAULT_CODEX_PROFILE_KEY
      ? 0
      : Number(profileKey.slice("account:".length));
    if (!Number.isFinite(accountId)) return;

    try {
      await ensureCodexProfileConnected(profileKey, accountId);
      const response = await codexRpcForProfile<{ thread?: unknown }>(
        profileKey,
        accountId,
        "thread/read",
        { threadId, includeTurns: true },
      );
      if (historyChatLoadIdRef.current !== loadId) return;
      const thread = readObject(response.thread);
      const turn = (Array.isArray(thread.turns) ? thread.turns : [])
        .map(readObject)
        .find((candidate) => readString(candidate.id) === entry.runView.turnId);
      const planItem = (turn && Array.isArray(turn.items) ? turn.items : [])
        .map(readObject)
        .find((item) => item.type === "plan");
      const text = planItem ? readString(planItem.text) : null;
      if (text && text !== entry.runView.nativePlan.completedText) {
        updateTaskChatEntryRunView(entry.clientId, (current) => ({
          ...current,
          latestPlan: text,
          nativePlan: {
            ...current.nativePlan,
            planItemId: readString(planItem?.id) ?? current.nativePlan.planItemId,
            previewText: text,
            completedText: text,
          },
        }));
        if (entry.runId !== null) {
          await updateRun(entry.runId, {
            completedPlanItemId: readString(planItem?.id),
            completedPlanText: text,
          });
        }
      }
    } catch {
      // The persisted completed plan remains reviewable while App Server reconnects.
    }
  }

  function cancelActiveExternalTranscriptSync() {
    const active = activeExternalTranscriptSyncRef.current;
    activeExternalTranscriptSyncRef.current = null;
    if (active) {
      void cancelDefaultProfileThreadTranscript(active.requestId).catch(() => undefined);
    }
  }

  function cancelActiveHistoricalTranscriptPreparation() {
    historicalPreparationAbortRef.current?.abort();
    historicalPreparationAbortRef.current = null;
    cancelHistoricalTranscriptPreparation();
  }

  async function prepareHistoryChatEntries(
    chat: ChatListItem,
    entries: TaskChatEntry[],
    transcript: HistoricalTranscriptState,
    loadId: number,
  ) {
    cancelActiveHistoricalTranscriptPreparation();
    const controller = new AbortController();
    historicalPreparationAbortRef.current = controller;
    try {
      const preparedEntries = await prepareHistoricalTranscript(
        entries,
        `${HISTORICAL_RENDER_PIPELINE_VERSION}:${chat.id}:${transcript.sourceVersion}`,
        controller.signal,
      );
      if (
        controller.signal.aborted ||
        historyChatLoadIdRef.current !== loadId ||
        selectedWorkspaceRef.current?.id !== chat.workspace_id
      ) {
        return null;
      }
      return preparedEntries;
    } finally {
      if (historicalPreparationAbortRef.current === controller) {
        historicalPreparationAbortRef.current = null;
      }
    }
  }

  async function synchronizeExternalTranscript(
    chat: ChatListItem,
    loadId: number,
    publication: "none" | "initial",
    positionIntent: HistoricalTranscriptState["positionIntent"] = "latest",
  ) {
    if (isAdoptedExternalChat(chat)) {
      return;
    }
    const threadId = chat.external_thread_id ?? chat.codex_thread_id;
    if (!threadId) return;
    const sourceVersion = chat.external_updated_at ?? chat.updated_at;
    const requestId = `transcript-${chat.id}-${Date.now().toString(36)}`;
    activeExternalTranscriptSyncRef.current = { chatId: chat.id, requestId };
    try {
      await ensureCodexProfileConnected(DEFAULT_CODEX_PROFILE_KEY, 0);
      const snapshot = await syncDefaultProfileThreadTranscript({
        threadId,
        sourceVersion,
        pageSize: HISTORY_CHAT_PAGE_SIZE,
        requestId,
      });
      if (activeExternalTranscriptSyncRef.current?.requestId !== requestId) {
        return;
      }
      await activateExternalTranscriptSnapshot(chat.id, snapshot);
      const completeEntries = createTaskChatEntriesFromExternalTranscriptSnapshot(
        chat,
        snapshot,
      );
      const transcript: HistoricalTranscriptState = {
        chatId: chat.id,
        sourceVersion,
        complete: true,
        firstItemIndex: HISTORY_VIRTUOSO_BASE_INDEX,
        positionIntent:
          publication === "initial" ? positionIntent : "preserve",
        openAtLatestRequest: null,
        syncStatus: "complete",
      };
      if (publication === "none") {
        appServices.historicalTranscripts.delete(chat.id);
        return;
      }
      const preparedEntries = await prepareHistoryChatEntries(
        chat,
        completeEntries,
        transcript,
        loadId,
      );
      if (!preparedEntries) return;
      cacheStableHistoryChat(chat, preparedEntries, transcript);
      if (
        historyChatLoadIdRef.current === loadId &&
        selectedWorkspaceRef.current?.id === chat.workspace_id
      ) {
        const publish = () => {
          publishStableHistoryChat(
            chat,
            preparedEntries,
            transcript,
            loadId,
            publication === "initial" ? positionIntent : "preserve",
          );
          setStatusMessage(
            `Opened chat from ${formatHistoryTimestamp(chat.latest_activity_at)}.`,
          );
        };
        if (
          publication === "initial" &&
          isTranscriptViewportStable() &&
          !isTranscriptScrolling()
        ) {
          publish();
        } else {
          deferStableTranscriptCommit(publish);
        }
      }
    } catch (error) {
      if (publication === "initial") {
        if (/method not found|unknown method|-32601/i.test(String(error))) {
          throw new Error(
            "Paged Codex history is unavailable. Update Codex and try again.",
          );
        }
        throw error;
      }
      if (
        historyChatLoadIdRef.current === loadId &&
        !/cancelled/i.test(String(error))
      ) {
        setHistoricalTranscript((current) =>
          current?.chatId === chat.id
            ? { ...current, syncStatus: "error" }
            : current,
        );
        setStatusMessage(
          `Opened the available turns, but transcript sync failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    } finally {
      if (activeExternalTranscriptSyncRef.current?.requestId === requestId) {
        activeExternalTranscriptSyncRef.current = null;
      }
    }
  }

  async function loadExternalCodexChat(
    chat: ChatListItem,
    loadId: number,
    positionIntent: HistoricalTranscriptState["positionIntent"],
  ) {
    if (isAdoptedExternalChat(chat)) {
      const snapshot = await readExternalTranscriptSnapshot(chat.id);
      if (!snapshot) {
        throw new Error(
          "The frozen imported transcript is unavailable for this adopted chat.",
        );
      }
      const localRuns = await listLocalChatTranscript(chat.id);
      if (historyChatLoadIdRef.current !== loadId) return;
      const entries = [
        ...createTaskChatEntriesFromExternalTranscriptSnapshot(chat, snapshot),
        ...localRuns.map(createTaskChatEntryFromHistoryRun),
      ].sort(
        (left, right) =>
          (left.turnIndex ?? Number.MAX_SAFE_INTEGER) -
          (right.turnIndex ?? Number.MAX_SAFE_INTEGER),
      );
      const transcript: HistoricalTranscriptState = {
        chatId: chat.id,
        sourceVersion: historyChatVersion(chat),
        complete: true,
        firstItemIndex: HISTORY_VIRTUOSO_BASE_INDEX,
        positionIntent,
        openAtLatestRequest: null,
        syncStatus: "complete",
      };
      const preparedEntries = await prepareHistoryChatEntries(
        chat,
        entries,
        transcript,
        loadId,
      );
      if (!preparedEntries) return;
      publishStableHistoryChat(
        chat,
        preparedEntries,
        transcript,
        loadId,
        positionIntent,
      );
      setStatusMessage(
        `Opened chat from ${formatHistoryTimestamp(chat.latest_activity_at)}.`,
      );
      return;
    }

    const threadId = chat.external_thread_id ?? chat.codex_thread_id;
    if (!threadId) {
      throw new Error("External Codex chat is missing its thread id.");
    }
    const sourceVersion = chat.external_updated_at ?? chat.updated_at;
    const currentSnapshot = await readExternalTranscriptSnapshot(chat.id, sourceVersion);
    if (historyChatLoadIdRef.current !== loadId) return;
    if (currentSnapshot) {
      const entries = createTaskChatEntriesFromExternalTranscriptSnapshot(
        chat,
        currentSnapshot,
      );
      const transcript: HistoricalTranscriptState = {
        chatId: chat.id,
        sourceVersion,
        complete: true,
        firstItemIndex: HISTORY_VIRTUOSO_BASE_INDEX,
        positionIntent,
        openAtLatestRequest: null,
        syncStatus: "complete",
      };
      const preparedEntries = await prepareHistoryChatEntries(
        chat,
        entries,
        transcript,
        loadId,
      );
      if (!preparedEntries) return;
      publishStableHistoryChat(
        chat,
        preparedEntries,
        transcript,
        loadId,
        positionIntent,
      );
      setStatusMessage(`Opened chat from ${formatHistoryTimestamp(chat.latest_activity_at)}.`);
      return;
    }

    const staleSnapshot = await readExternalTranscriptSnapshot(chat.id);
    if (historyChatLoadIdRef.current !== loadId) return;
    if (staleSnapshot) {
      const entries = createTaskChatEntriesFromExternalTranscriptSnapshot(chat, staleSnapshot);
      const transcript: HistoricalTranscriptState = {
        chatId: chat.id,
        sourceVersion: staleSnapshot.sourceVersion,
        complete: true,
        firstItemIndex: HISTORY_VIRTUOSO_BASE_INDEX,
        positionIntent,
        openAtLatestRequest: null,
        syncStatus: "syncing",
      };
      const preparedEntries = await prepareHistoryChatEntries(
        chat,
        entries,
        transcript,
        loadId,
      );
      if (!preparedEntries) return;
      publishStableHistoryChat(
        chat,
        preparedEntries,
        transcript,
        loadId,
        positionIntent,
      );
      void synchronizeExternalTranscript(chat, loadId, "none", positionIntent);
      return;
    }

    await synchronizeExternalTranscript(
      chat,
      loadId,
      "initial",
      positionIntent,
    );
  }

  function markWorkspaceChatRead(workspaceId: number, chatId: number) {
    setUnreadCompletedChats((current) => {
      const currentWorkspaceChats = current[workspaceId] ?? [];
      const remaining = currentWorkspaceChats.filter(
        (candidateChatId) => candidateChatId !== chatId,
      );
      if (remaining.length === currentWorkspaceChats.length) {
        return current;
      }
      const next = { ...current };
      if (remaining.length > 0) next[workspaceId] = remaining;
      else delete next[workspaceId];
      return next;
    });
  }

  function applyWorkspaceForChatNavigation(workspace: Workspace) {
    const switchingWorkspace = selectedWorkspaceRef.current?.id !== workspace.id;
    if (switchingWorkspace) {
      taskChatTranscriptRef.current?.captureViewportState();
      rememberCurrentWorkspaceTaskMemory();
    }
    const memory =
      workspaceTaskMemories.records[workspace.id] ??
      createEmptyWorkspaceTaskMemory();
    workspaceTaskMemories.records[workspace.id] = memory;
    setWorkspaceContextMenu(null);
    setRetainTranscriptDuringWorkspaceSwitch(false);
    selectedWorkspaceRef.current = workspace;
    setSelectedWorkspace(workspace);
    if (switchingWorkspace) {
      setBranches([]);
      setSelectedBranch(null);
    }
    restoreWorkspaceComposer(memory);
    activeViewRef.current = "task";
    setActiveView("task");
    preflightRef.current = null;
  }

  function selectWorkspaceExecutionAccount(
    workspace: Workspace,
    session: WorkspaceChatSession | null,
  ) {
    const accountId =
      accountIdFromProfileKey(session?.profileKey) ??
      (!session ? workspace.default_account_id : null);
    if (accountId && accountId !== selectedAccountIdRef.current) {
      void selectCodexAccount(accountId);
    }
  }

  async function selectHistoryChat(
    chat: ChatListItem,
    options: SelectHistoryChatOptions = {},
  ): Promise<boolean> {
    if (options.source !== "kanban") {
      kanbanConversationNavigationIdRef.current += 1;
    }
    if (options.source !== "notification") {
      cancelAgentNotificationNavigation();
    }
    const targetWorkspace =
      options.workspace ??
      workspacesRef.current.find(
        (candidate) => candidate.id === chat.workspace_id,
      ) ??
      null;
    if (!targetWorkspace) {
      setStatusMessage("The workspace for that chat is no longer available.");
      return false;
    }

    const loadId = historyChatLoadIdRef.current + 1;
    historyChatLoadIdRef.current = loadId;
    cancelActiveExternalTranscriptSync();
    cancelActiveHistoricalTranscriptPreparation();
    resetTranscriptInteraction();
    const session: WorkspaceChatSession = {
      chatId: chat.id,
      threadId: isAdoptedExternalChat(chat)
        ? chat.codex_thread_id
        : chat.external_thread_id ?? chat.codex_thread_id,
      origin: chat.origin,
      profileKey: chat.profile_key,
      externalThreadId: chat.external_thread_id,
      nextTurnIndex: Math.max(1, (Number(chat.turn_count) || 0) + 1),
      savedDefaultCollaborationMode: parseSavedDefaultCollaborationMode(
        chat.saved_default_collaboration_mode_json,
      ),
    };
    const subagentKey = subagentConversationKey({ chatId: chat.id });
    if (
      subagentKey &&
      subagentStore.getConversation(subagentKey).length === 0
    ) {
      void listChatSubagents(chat.id)
        .then((records) => {
          subagentStore.replaceConversation(subagentKey, records);
        })
        .catch((error) => {
          console.error("Could not restore chat subagents", error);
        });
    }
    const runningControl = findRunControlByChat(chat.workspace_id, chat.id);
    const positionIntent = options.positionIntent ?? "latest";

    markWorkspaceChatRead(chat.workspace_id, chat.id);
    rememberWorkspaceTaskSelection(
      chat.workspace_id,
      { kind: "chat", session },
      null,
    );

    if (runningControl) {
      const liveEntry = runningControl.entry;
      flushSync(() => {
        if (options.source === "kanban") {
          setWorkspaceSurfaceMode("chat");
        }
        applyWorkspaceForChatNavigation(targetWorkspace);
        setChatHistoryContextMenu(null);
        setSelectedDraftChat(null);
        setSelectedHistoryChatId(chat.id);
        setWorkspaceChatSession(chat.workspace_id, session);
        setHistoryChatLoadState(null);
        setHistoryOpenRequest(null);
        historicalTranscriptRef.current = null;
        setHistoricalTranscript(null);
        closeHistoryDrawer();
        if (liveEntry) {
          setTaskChatEntries((current) => {
            const existing = current.filter(
              (entry) =>
                entry.workspaceId === chat.workspace_id &&
                entry.chatId === chat.id,
            );
            const nextEntries = existing.some(
              (entry) => entry.clientId === runningControl.clientId,
            )
              ? existing.map((entry) =>
                  entry.clientId === runningControl.clientId
                    ? liveEntry
                    : entry,
                )
              : [...existing, liveEntry];
            return replaceChatEntries(
              current,
              chat.workspace_id,
              chat.id,
              nextEntries,
            );
          });
        }
        setSelectedRunAliases(runningControl);
      });
      selectWorkspaceExecutionAccount(targetWorkspace, session);
      setStatusMessage("Opened running chat.");
      return true;
    }

    flushSync(() => {
      if (options.source === "kanban") {
        setWorkspaceSurfaceMode("chat");
      }
      applyWorkspaceForChatNavigation(targetWorkspace);
      setChatHistoryContextMenu(null);
      setSelectedDraftChat(null);
      setSelectedHistoryChatId(chat.id);
      setWorkspaceChatSession(chat.workspace_id, session);
      setHistoryChatLoadState({
        chatId: chat.id,
        workspaceId: chat.workspace_id,
        title: chat.title,
        error: null,
      });
      setHistoryOpenRequest({
        workspaceId: chat.workspace_id,
        chatId: chat.id,
        requestId: loadId,
        phase: "loading",
      });
      historicalTranscriptRef.current = null;
      setHistoricalTranscript(null);
      setTaskChatEntries((current) =>
        replaceChatEntries(current, chat.workspace_id, chat.id, []),
      );
      closeHistoryDrawer();
      setSelectedRunAliases(null);
    });
    selectWorkspaceExecutionAccount(targetWorkspace, session);

    setStatusMessage(`Opening chat from ${formatHistoryTimestamp(chat.latest_activity_at)}.`);
    try {
      await waitForNextPaint();
      await waitForHistoryDrawerClosed();
      markTranscriptViewportUnstable();
      await waitForNextPaint();
      await waitForTranscriptViewportStable();
      if (historyChatLoadIdRef.current !== loadId) {
        return false;
      }

      const cached = appServices.historicalTranscripts.get(chat.id);
      if (
        cached?.version === historyChatVersion(chat) &&
        cached.renderVersion === HISTORICAL_RENDER_PIPELINE_VERSION
      ) {
        publishStableHistoryChat(
          chat,
          cached.entries,
          cached.transcript,
          loadId,
          positionIntent,
        );
        setStatusMessage(
          `Opened chat from ${formatHistoryTimestamp(chat.latest_activity_at)}.`,
        );
        return true;
      }

      if (chat.origin === "codex_external") {
        await loadExternalCodexChat(chat, loadId, positionIntent);
        return (
          historyChatLoadIdRef.current === loadId &&
          selectedWorkspaceRef.current?.id === chat.workspace_id
        );
      }

      await loadLocalHistoryChatProgressively(
        chat,
        loadId,
        positionIntent,
      );
      return (
        historyChatLoadIdRef.current === loadId &&
        selectedWorkspaceRef.current?.id === chat.workspace_id
      );
    } catch (error) {
      if (historyChatLoadIdRef.current !== loadId) {
        return false;
      }
      const message = error instanceof Error ? error.message : String(error);
      setHistoryChatLoadState((current) =>
        current?.chatId === chat.id ? { ...current, error: message } : current,
      );
      historicalTranscriptRef.current = null;
      setHistoricalTranscript(null);
      setHistoryOpenRequest((current) =>
        current?.requestId === loadId ? null : current,
      );
      setStatusMessage(
        `Could not open chat: ${message}`,
      );
      return false;
    }
  }

  async function openKanbanCardConversation(card: KanbanCardRecord) {
    if (!card.hasStartedTurn) return;
    const targetWorkspace = workspacesRef.current.find(
      (workspace) => workspace.id === card.workspaceId,
    );
    if (!targetWorkspace) {
      setStatusMessage("The workspace for that card is no longer available.");
      return;
    }

    const navigationId = kanbanConversationNavigationIdRef.current + 1;
    kanbanConversationNavigationIdRef.current = navigationId;
    try {
      const chatWithRuns = await getChatWithRuns(card.chatId);
      if (kanbanConversationNavigationIdRef.current !== navigationId) return;
      if (!chatWithRuns) {
        setStatusMessage("The conversation for that card is no longer available.");
        return;
      }
      const opened = await selectHistoryChat(chatWithRuns.chat, {
        source: "kanban",
        workspace: targetWorkspace,
        positionIntent: "latest",
      });
      if (
        opened &&
        kanbanConversationNavigationIdRef.current === navigationId
      ) {
        const latestRun =
          chatWithRuns.runs[chatWithRuns.runs.length - 1] ?? null;
        if (latestRun) {
          notificationFocusSequenceRef.current += 1;
          setTranscriptNotificationFocusRequest({
            requestId: notificationFocusSequenceRef.current,
            kind: "prompt",
            runId: latestRun.id,
            turnId: latestRun.codex_turn_id,
          });
        }
      }
      if (
        !opened &&
        kanbanConversationNavigationIdRef.current === navigationId
      ) {
        setWorkspaceSurfaceMode("kanban");
      }
    } catch (error) {
      if (kanbanConversationNavigationIdRef.current !== navigationId) return;
      const message = error instanceof Error ? error.message : String(error);
      setStatusMessage(`Could not open the card conversation: ${message}`);
    }
  }

  async function loadLocalHistoryChatProgressively(
    chat: ChatListItem,
    loadId: number,
    positionIntent: HistoricalTranscriptState["positionIntent"],
  ) {
    const runs = await listLocalChatTranscript(chat.id);
    if (historyChatLoadIdRef.current !== loadId) {
      return;
    }
    const entries = runs.map(createTaskChatEntryFromHistoryRun);
    const transcript: HistoricalTranscriptState = {
      chatId: chat.id,
      sourceVersion: historyChatVersion(chat),
      complete: true,
      firstItemIndex: HISTORY_VIRTUOSO_BASE_INDEX,
      positionIntent,
      openAtLatestRequest: null,
      syncStatus: "complete",
    };
    const preparedEntries = await prepareHistoryChatEntries(
      chat,
      entries,
      transcript,
      loadId,
    );
    if (!preparedEntries) return;
    publishStableHistoryChat(
      chat,
      preparedEntries,
      transcript,
      loadId,
      positionIntent,
    );
    setStatusMessage(`Opened chat from ${formatHistoryTimestamp(chat.latest_activity_at)}.`);
  }

  async function loadHistoricalActivity(entry: TaskChatEntry) {
    const activity = entry.historicalActivity;
    if (!activity || activity.status === "loading") {
      return;
    }
    const cursor =
      activity.status === "loaded" ? activity.nextCursor : activity.nextCursor ?? null;
    if (activity.status === "loaded" && !cursor) {
      return;
    }

    updateHistoricalActivityEntry(entry.clientId, (current) => ({
      ...current,
      historicalActivity: current.historicalActivity
        ? { ...current.historicalActivity, status: "loading", error: null }
        : current.historicalActivity,
    }));

    const cacheKey = `${activity.threadId}:${activity.turnId}:${cursor ?? "latest"}`;
    try {
      const response = await appServices.historicalActivities.getOrLoad(
        cacheKey,
        () =>
          ensureCodexProfileConnected(DEFAULT_CODEX_PROFILE_KEY, 0).then(
            () =>
              loadDefaultProfileTurnActivity({
                threadId: activity.threadId,
                turnId: activity.turnId,
                cursor,
                limit: HISTORY_ACTIVITY_PAGE_SIZE,
              }),
          ),
      );

      if (!taskChatEntriesRef.current.some((item) => item.clientId === entry.clientId)) {
        return;
      }
      updateHistoricalActivityEntry(entry.clientId, (current) => ({
        ...current,
        runView: {
          ...current.runView,
          commands: mergeCommandActivities(
            current.runView.commands,
            response.commands.map((command) => ({ ...command, output: "" })),
          ),
          editedFiles: mergeEditedFileActivities(
            current.runView.editedFiles,
            response.editedFiles,
          ),
        },
        historicalActivity: current.historicalActivity
          ? {
              ...current.historicalActivity,
              status: "loaded",
              nextCursor: response.nextCursor,
              error: null,
            }
          : current.historicalActivity,
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      updateHistoricalActivityEntry(entry.clientId, (current) => ({
        ...current,
        historicalActivity: current.historicalActivity
          ? { ...current.historicalActivity, status: "error", error: message }
          : current.historicalActivity,
      }));
    }
  }

  function updateHistoricalActivityEntry(
    clientId: string,
    updater: (entry: TaskChatEntry) => TaskChatEntry,
  ) {
    setTaskChatEntries((current) => {
      const next = current.map((entry) =>
        entry.clientId === clientId ? updater(entry) : entry,
      );
      taskChatEntriesRef.current = next;
      return next;
    });
  }

  function startNewWorkspaceChat() {
    if (!selectedWorkspace) {
      setStatusMessage("Choose a workspace before starting a new chat.");
      return;
    }
    cancelAgentNotificationNavigation();
    const previousSession =
      workspaceChatSessionsRef.current[selectedWorkspace.id];
    if (previousSession) {
      clearPendingAccountHandoff(previousSession.chatId);
    }
    historyChatLoadIdRef.current += 1;
    cancelActiveExternalTranscriptSync();
    cancelActiveHistoricalTranscriptPreparation();
    resetTranscriptInteraction();
    setHistoryChatLoadState(null);
    setHistoryOpenRequest(null);
    setRetainTranscriptDuringWorkspaceSwitch(false);
    historicalTranscriptRef.current = null;
    setHistoricalTranscript(null);
    rememberWorkspaceTaskSelection(
      selectedWorkspace.id,
      { kind: "new" },
      null,
    );
    setWorkspaceChatSession(selectedWorkspace.id, undefined);
    setSelectedDraftChat(null);
    setSelectedHistoryChatId(null);
    setSelectedRunAliases(null);
    preflightRef.current = null;
    setStatusMessage("Started a new chat.");
  }

  async function confirmChatHistoryDelete() {
    const chat = chatHistoryDeleteCandidate;
    if (!chat) {
      return;
    }

    await softDeleteChat(chat.id);
    const queueDispatchTimer =
      promptQueueDispatchTimersRef.current.get(chat.id);
    if (queueDispatchTimer !== undefined) {
      window.clearTimeout(queueDispatchTimer);
      promptQueueDispatchTimersRef.current.delete(chat.id);
    }
    promptQueueClaimLocksRef.current.delete(chat.id);
    setChatPromptQueue(chat.id, []);
    setPromptQueuePaused(chat.id, false);
    clearPendingAccountHandoff(chat.id);
    appServices.historicalTranscripts.delete(chat.id);
    appServices.invalidateChat(chat.id);
    const remembered = workspaceTaskMemories.records[chat.workspace_id];
    if (
      remembered?.selection.kind === "chat" &&
      remembered.selection.session.chatId === chat.id
    ) {
      workspaceTaskMemories.records[chat.workspace_id] = {
        ...remembered,
        selection: { kind: "new" },
        historicalTranscript: null,
        transcriptViewportSnapshot: null,
      };
    }
    if (
      historyChatLoadState?.chatId === chat.id ||
      historyOpenRequest?.chatId === chat.id ||
      selectedHistoryChatId === chat.id
    ) {
      historyChatLoadIdRef.current += 1;
      cancelActiveExternalTranscriptSync();
      cancelActiveHistoricalTranscriptPreparation();
      resetTranscriptInteraction();
    }
    setHistoryChatLoadState((current) =>
      current?.chatId === chat.id ? null : current,
    );
    setHistoryOpenRequest((current) =>
      current?.chatId === chat.id ? null : current,
    );
    setHistoricalTranscript((current) =>
      current?.chatId === chat.id ? null : current,
    );
    if (
      selectedHistoryChatId === chat.id ||
      workspaceChatSessionsRef.current[chat.workspace_id]?.chatId === chat.id
    ) {
      historicalTranscriptRef.current = null;
      setSelectedHistoryChatId(null);
      setWorkspaceChatSession(chat.workspace_id, undefined);
      setSelectedDraftChat(null);
      setSelectedRunAliases(null);
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

    const wasSelected = selectedWorkspaceRef.current?.id === workspace.id;
    await softDeleteWorkspace(workspace.id);
    appServices.invalidateWorkspace(workspace.id);
    setWorkspaceDeleteCandidate(null);
    clearWorkspaceRuntimeState(workspace);

    const remaining = workspacesRef.current.filter(
      (candidate) => candidate.id !== workspace.id,
    );
    workspacesRef.current = remaining;
    setWorkspaces(remaining);

    if (wasSelected) {
      const nextWorkspace = remaining[0] ?? null;
      selectedWorkspaceRef.current = null;
      setSelectedWorkspace(null);
      if (nextWorkspace) {
        selectWorkspace(nextWorkspace.id);
        setStatusMessage(
          `Removed ${workspace.label}. Restored ${nextWorkspace.label}.`,
        );
      } else {
        setStatusMessage(
          `Removed ${workspace.label}. Add or choose a workspace to continue.`,
        );
      }
      return;
    }

    setStatusMessage(`Removed ${workspace.label} from Orchestrator.`);
  }

  function clearWorkspaceRuntimeState(workspace: Workspace) {
    if (
      historyChatLoadState?.workspaceId === workspace.id ||
      historyOpenRequest?.workspaceId === workspace.id
    ) {
      historyChatLoadIdRef.current += 1;
      cancelActiveExternalTranscriptSync();
      cancelActiveHistoricalTranscriptPreparation();
      resetTranscriptInteraction();
    }
    setHistoricalTranscript((current) =>
      current?.chatId === workspaceChatSessionsRef.current[workspace.id]?.chatId
        ? null
        : current,
    );
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
    setGitOperationsByWorkspace((current) => {
      if (!current[workspace.id]) return current;
      const next = { ...current };
      delete next[workspace.id];
      return next;
    });
    clearRunningGitOperation(workspace.id);
    setContextFiles((current) =>
      current.filter((file) => !belongsToWorkspace(file.path)),
    );
    setTaskChatEntries((current) =>
      current.filter((entry) => entry.workspaceId !== workspace.id),
    );
    const workspaceQueueChatIds = Object.values(
      promptQueuesByChatRef.current,
    ).flatMap((items) =>
      (items ?? [])
        .filter((item) => item.workspaceId === workspace.id)
        .map((item) => item.chatId),
    );
    for (const chatId of new Set(workspaceQueueChatIds)) {
      const dispatchTimer = promptQueueDispatchTimersRef.current.get(chatId);
      if (dispatchTimer !== undefined) {
        window.clearTimeout(dispatchTimer);
        promptQueueDispatchTimersRef.current.delete(chatId);
      }
      promptQueueClaimLocksRef.current.delete(chatId);
      setChatPromptQueue(chatId, []);
      setPromptQueuePaused(chatId, false);
    }
    if (
      promptQueueComposerEditRef.current?.item.workspaceId === workspace.id
    ) {
      setPromptQueueComposerEditState(null);
    }
    promptQueueEnqueueOperationsRef.current.delete(workspace.id);
    promptQueuePendingSubmissionKeysRef.current.delete(workspace.id);
    delete workspaceTaskMemories.records[workspace.id];
    const remainingHandoffs = Object.fromEntries(
      Object.entries(pendingAccountHandoffsRef.current).filter(
        ([, handoff]) => handoff?.workspaceId !== workspace.id,
      ),
    );
    pendingAccountHandoffsRef.current = remainingHandoffs;
    setPendingAccountHandoffs(remainingHandoffs);
    setWorkspaceChatSession(workspace.id, undefined);
    setHistoryChatLoadState((current) =>
      current?.workspaceId === workspace.id ? null : current,
    );
    setHistoryOpenRequest((current) =>
      current?.workspaceId === workspace.id ? null : current,
    );
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
    preflightRef.current = null;

    removeWorkspacePreview(workspace);

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
    gitStatusRefreshCache.current.delete(workspace.id);
    workspaceFileIndexCache.current.delete(workspace.id);
    workspaceFileIndexRequestCache.current.delete(workspace.id);
  }

  function openBranchCreationDialog() {
    const workspace = selectedWorkspaceRef.current;
    const overview = workspace
      ? gitStatusStates[workspace.id]?.snapshot ?? null
      : null;
    const repository = preferredWorkspaceGitRepository(
      overview,
      workspace?.selected_git_repository_path,
    );
    if (
      !workspace ||
      !repository ||
      branchCreationInFlightRef.current ||
      branchCreationPendingWorkspaceId !== null ||
      selectedGitActionStatus !== "idle" ||
      selectedGitStatusState?.status !== "loaded"
    ) {
      return;
    }

    setBranchCreationDialog({
      workspace,
      repositoryPath: repository.repository.rootPath,
      repositoryLabel: repository.repository.label,
      baseBranch: selectedBranch,
      branchName: "",
      status: "idle",
      error: null,
    });
  }

  async function confirmBranchCreation() {
    const dialog = branchCreationDialog;
    if (!dialog || dialog.status !== "idle" || branchCreationInFlightRef.current) {
      return;
    }

    const branchName = dialog.branchName.trim();
    if (!branchName) {
      setBranchCreationDialog((current) =>
        current
          ? { ...current, error: "Enter a branch name before creating it." }
          : current,
      );
      return;
    }

    branchCreationInFlightRef.current = true;
    setBranchCreationPendingWorkspaceId(dialog.workspace.id);
    setBranchCreationDialog((current) =>
      current?.workspace.id === dialog.workspace.id
        ? {
            ...current,
            branchName,
            status: "creating",
            error: null,
          }
        : current,
    );

    try {
      const result = await createGitBranch(
        dialog.workspace.path,
        branchName,
        dialog.repositoryPath,
      );
      preflightRef.current = null;
      await Promise.allSettled([
        refreshBranches(dialog.workspace, dialog.repositoryPath),
        refreshWorkspaceGitStatus(dialog.workspace, {
          showLoading: false,
          force: true,
        }),
      ]);
      if (selectedWorkspaceRef.current?.id === dialog.workspace.id) {
        setSelectedBranch(result.branch);
        setStatusMessage(
          `Created and switched to ${result.branch} in ${dialog.repositoryLabel}.`,
        );
      }
      setBranchCreationDialog((current) =>
        current?.workspace.id === dialog.workspace.id ? null : current,
      );
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      setBranchCreationDialog((current) =>
        current?.workspace.id === dialog.workspace.id
          ? {
              ...current,
              status: "idle",
              error: `Could not create branch: ${detail}`,
            }
          : current,
      );
    } finally {
      branchCreationInFlightRef.current = false;
      setBranchCreationPendingWorkspaceId((current) =>
        current === dialog.workspace.id ? null : current,
      );
    }
  }

  async function selectBranch(branch: string) {
    const repositoryPath = selectedGitRepository?.repository.rootPath ?? null;
    if (!selectedWorkspace || !repositoryPath || !branch) {
      return;
    }

    setSelectedBranch(branch);
    preflightRef.current = null;
    try {
      await checkoutGitBranch(selectedWorkspace.path, branch, repositoryPath);
      await refreshBranches(selectedWorkspace, repositoryPath);
      await refreshWorkspaceGitStatus(selectedWorkspace);
      setStatusMessage(`Working on ${selectedWorkspace.label} at ${branch}.`);
    } catch (error) {
      await refreshBranches(selectedWorkspace, repositoryPath);
      await refreshWorkspaceGitStatus(selectedWorkspace);
      setStatusMessage(
        `Could not switch to ${branch}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async function selectVisibleBranch(branch: string) {
    if (selectedKanbanGitBinding) {
      if (branch !== selectedKanbanGitBinding.cardBranch) {
        setStatusMessage(
          "Card conversations remain scoped to their isolated worktree branch.",
        );
        return;
      }
      setStatusMessage(
        `Working in the card branch ${selectedKanbanGitBinding.cardBranch}.`,
      );
      return;
    }
    await selectBranch(branch);
  }

  async function selectGitRepository(repositoryPath: string) {
    const workspace = selectedWorkspaceRef.current;
    const overview = workspace
      ? gitStatusStates[workspace.id]?.snapshot ?? null
      : null;
    const repository = overview?.repositories.find(
      (candidate) => candidate.repository.rootPath === repositoryPath,
    );
    if (!workspace || !repository || selectedGitActionStatus !== "idle") {
      return;
    }
    rememberWorkspaceGitRepository(workspace.id, repositoryPath);
    setSelectedBranch(repository.currentBranch ?? null);
    setBranches(repository.currentBranch ? [repository.currentBranch] : []);
    setCommitMessage("");
    setCommitDialogMessage("");
    setCommitDialogError(false);
    preflightRef.current = null;
    try {
      await updateWorkspaceSelectedGitRepository(workspace.id, repositoryPath);
      await refreshBranches(
        { ...workspace, selected_git_repository_path: repositoryPath },
        repositoryPath,
      );
      setStatusMessage(`Git actions now target ${repository.repository.label}.`);
    } catch (error) {
      setStatusMessage(
        `Could not select ${repository.repository.label}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  async function ensureRunBranch(
    workspace: Workspace,
    repositoryPath: string | null,
    branch: string | null,
  ) {
    if (!branch) {
      return true;
    }
    if (!repositoryPath) {
      setStatusMessage(
        "Choose the Git repository for this run before switching branches.",
      );
      return false;
    }

    try {
      await checkoutGitBranch(workspace.path, branch, repositoryPath);
      return true;
    } catch (error) {
      await refreshBranches(workspace, repositoryPath);
      await refreshWorkspaceGitStatus(workspace);
      setStatusMessage(
        `Could not switch to ${branch}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return false;
    }
  }

  async function pickContextFiles() {
    const selected = await open({
      directory: false,
      multiple: true,
      title: "Add files to context",
    });
    const paths = normalizeDialogSelection(selected);
    return paths.map(contextFileFromPath);
  }

  async function chooseContextFiles() {
    const files = await pickContextFiles();
    if (files.length === 0) return;
    setContextFiles((current) => mergeContextFiles(current, files));
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
            tokenEstimate: estimateTokens(promptRef.current),
            contextFiles,
            selectedSkills,
            gitSummary: selectedGitSummary,
            runView,
          }),
        );
        return;
      case "review":
        replaceComposerPrompt((current) =>
          applyPromptDraft(
            current,
            buildCodeReviewDraft(
              selectedWorkspaceRef.current,
              selectedBranch,
              selectedGitSummary,
            ),
          ),
        );
        preflightRef.current = null;
        setStatusMessage("Prepared a code review prompt.");
        return;
      case "mcp":
        void showMcpStatus();
        return;
      case "init":
        replaceComposerPrompt((current) =>
          applyPromptDraft(current, buildInitInstructionsDraft(selectedWorkspaceRef.current)),
        );
        preflightRef.current = null;
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

  async function ensureCodexProfileConnected(
    profileKey: CodexProfileKey,
    accountId: number,
  ) {
    if (profileKey !== DEFAULT_CODEX_PROFILE_KEY) {
      await ensureCodexConnected(accountId);
      await probeCollaborationModes(profileKey, accountId);
      return;
    }

    if (!connectedAccountIdsRef.current.has(0)) {
      const connection = await connectDefaultCodexProfile();
      setConnectedAccountIds((current) => {
        const next = new Set(current).add(0);
        connectedAccountIdsRef.current = next;
        return next;
      });
      setStatusMessage(
        connection.alreadyConnected
          ? "Default Codex profile already connected."
          : `Default Codex profile connected${
              connection.pid ? ` as ${connection.pid}` : ""
            }.`,
      );
    }
    await probeCollaborationModes(profileKey, accountId);
  }

  function probeCollaborationModes(
    profileKey: CodexProfileKey,
    accountId: number,
  ) {
    const cached = collaborationModeMasksRef.current.get(profileKey);
    if (cached) return cached;
    const request = codexRpcForProfile<{ data?: CollaborationModeMask[] }>(
      profileKey,
      accountId,
      "collaborationMode/list",
      {},
    )
      .then((response) =>
        (Array.isArray(response.data) ? response.data : []).filter(
          isCollaborationModeMask,
        ),
      )
      .catch(() => {
        collaborationModeMasksRef.current.delete(profileKey);
        return [];
      });
    collaborationModeMasksRef.current.set(profileKey, request);
    return request;
  }

  async function collaborationModesForRun(
    profileKey: CodexProfileKey,
    accountId: number,
    model: string | null,
    effort: string | null,
    requirePlan: boolean,
  ) {
    const masks = await probeCollaborationModes(profileKey, accountId);
    if (masks.length > 0) {
      try {
        return selectNativePlanModes(masks, model, effort);
      } catch (error) {
        if (requirePlan) throw error;
      }
    }
    if (requirePlan) {
      throw new Error(
        "Plan mode requires a Codex app-server with native collaboration-mode support.",
      );
    }
    const defaultMode: CollaborationMode = {
      mode: "default",
      settings: {
        model: model ?? "",
        reasoning_effort: effort,
        developer_instructions: null,
      },
    };
    return { plan: null, default: defaultMode };
  }

  function codexRpcForProfile<T>(
    profileKey: CodexProfileKey,
    accountId: number,
    method: string,
    params: unknown = {},
  ) {
    return profileKey === DEFAULT_CODEX_PROFILE_KEY
      ? codexDefaultProfileRpc<T>(method, params)
      : codexRpc<T>(accountId, method, params);
  }

  function readCodexFileForProfile(
    profileKey: CodexProfileKey,
    accountId: number,
    path: string,
  ) {
    return profileKey === DEFAULT_CODEX_PROFILE_KEY
      ? readDefaultCodexFile(path)
      : readCodexFile(accountId, path);
  }

  function setThreadGoalForProfile(
    profileKey: CodexProfileKey,
    accountId: number,
    threadId: string,
    objective: string,
  ): Promise<ThreadGoalSetResponse> {
    return profileKey === DEFAULT_CODEX_PROFILE_KEY
      ? codexDefaultProfileRpc<ThreadGoalSetResponse>("thread/goal/set", {
          threadId,
          objective,
          status: "active",
          tokenBudget: null,
        })
      : setThreadGoal(accountId, threadId, objective);
  }

  function updateThreadGoalStatusForProfile(
    profileKey: CodexProfileKey,
    accountId: number,
    threadId: string,
    status: Extract<ThreadGoalStatus, "active" | "paused">,
  ) {
    return codexRpcForProfile<ThreadGoalSetResponse>(
      profileKey,
      accountId,
      "thread/goal/set",
      { threadId, status },
    );
  }

  function clearThreadGoalForProfile(
    profileKey: CodexProfileKey,
    accountId: number,
    threadId: string,
  ) {
    return codexRpcForProfile<{ cleared: boolean }>(
      profileKey,
      accountId,
      "thread/goal/clear",
      { threadId },
    );
  }

  async function interruptTurnForProfile(
    profileKey: CodexProfileKey,
    accountId: number,
    threadId: string,
    turnId: string,
  ) {
    let activeTurnId = turnId;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        await codexRpcForProfile(profileKey, accountId, "turn/interrupt", {
          threadId,
          turnId: activeTurnId,
        });
        return activeTurnId;
      } catch (error) {
        const expectedTurnId = readExpectedActiveTurnId(error);
        if (
          attempt === 0 &&
          expectedTurnId &&
          expectedTurnId !== activeTurnId
        ) {
          activeTurnId = expectedTurnId;
          continue;
        }
        if (isCodexTurnAlreadyTerminalError(error)) {
          return null;
        }
        throw error;
      }
    }

    return null;
  }

  async function selectCodexAccount(accountId: number) {
    if (runIsActive) {
      return false;
    }

    const profile = codexAccountsRef.current.find(
      (account) => account.id === accountId,
    );
    if (!profile) {
      return false;
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
      return true;
    } catch (error) {
      setStatusMessage(
        `Could not select ${profile.label}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return false;
    }
  }

  function setPendingAccountHandoff(handoff: PendingAccountHandoff) {
    const next = {
      ...pendingAccountHandoffsRef.current,
      [handoff.chatId]: handoff,
    };
    pendingAccountHandoffsRef.current = next;
    setPendingAccountHandoffs(next);
  }

  function clearPendingAccountHandoff(chatId: number) {
    if (!pendingAccountHandoffsRef.current[chatId]) return;
    const next = { ...pendingAccountHandoffsRef.current };
    delete next[chatId];
    pendingAccountHandoffsRef.current = next;
    setPendingAccountHandoffs(next);
  }

  function requestCodexAccountSelection(accountId: number) {
    const account = codexAccountsRef.current.find(
      (candidate) => candidate.id === accountId && candidate.status === "signed_in",
    );
    if (!account) {
      setStatusMessage("Sign in to that Codex account before selecting it.");
      return;
    }

    const workspace = selectedWorkspaceRef.current;
    const session = workspace
      ? workspaceChatSessionsRef.current[workspace.id] ?? null
      : null;
    if (!workspace || !session) {
      void selectCodexAccount(accountId);
      return;
    }
    if (selectedRunIsActiveNow()) {
      setStatusMessage("Wait for the active turn to finish before switching accounts.");
      return;
    }

    const targetProfileKey = `account:${accountId}` as CodexProfileKey;
    if (session.profileKey === targetProfileKey) {
      clearPendingAccountHandoff(session.chatId);
      void selectCodexAccount(accountId);
      return;
    }

    const currentAccountId = accountIdFromProfileKey(session.profileKey);
    const currentAccount =
      currentAccountId === null
        ? null
        : codexAccountsRef.current.find(
            (candidate) => candidate.id === currentAccountId,
          ) ?? null;
    setAccountHandoffCandidate({
      workspaceId: workspace.id,
      chatId: session.chatId,
      fromProfileKey: session.profileKey,
      fromThreadId: session.threadId,
      targetAccountId: accountId,
      targetProfileKey,
      fromLabel:
        session.profileKey === DEFAULT_CODEX_PROFILE_KEY
          ? "Codex default profile"
          : currentAccount?.label ?? "Current Codex account",
      targetLabel: account.label,
      status: "idle",
      error: null,
    });
  }

  async function confirmAccountHandoff() {
    const candidate = accountHandoffCandidate;
    const workspace = selectedWorkspaceRef.current;
    const session = workspace
      ? workspaceChatSessionsRef.current[workspace.id] ?? null
      : null;
    if (
      !candidate ||
      !workspace ||
      workspace.id !== candidate.workspaceId ||
      !session ||
      session.chatId !== candidate.chatId ||
      session.profileKey !== candidate.fromProfileKey ||
      session.threadId !== candidate.fromThreadId ||
      selectedRunIsActiveNow()
    ) {
      setAccountHandoffCandidate(null);
      setStatusMessage("The chat changed before the account handoff could be confirmed.");
      return;
    }

    setAccountHandoffCandidate({ ...candidate, status: "selecting", error: null });
    try {
      await ensureCodexProfileConnected(
        candidate.targetProfileKey,
        candidate.targetAccountId,
      );
      const authState = await refreshAccountState(
        candidate.targetAccountId,
        true,
      );
      if (shouldBlockRunForAuth(authState.requiresOpenaiAuth, authState.account)) {
        throw new Error("Sign in to the selected Codex account first.");
      }

      if (!useOss && !modelLoadError) {
        const currentModel =
          models.find((model) => model.id === selectedModelId) ??
          models[0] ??
          null;
        if (!currentModel) {
          throw new Error("Choose an available model before switching accounts.");
        }
        const targetModels = await listCodexModels(candidate.targetAccountId);
        const targetModel =
          targetModels.find(
            (model) =>
              model.id === currentModel.id ||
              model.model === currentModel.model,
          ) ?? null;
        if (!targetModel) {
          throw new Error(
            `${currentModel.displayName || currentModel.model} is unavailable for the selected account.`,
          );
        }
        if (
          selectedReasoningEffort &&
          !targetModel.supportedReasoningEfforts.some(
            (option) =>
              option.reasoningEffort === selectedReasoningEffort,
          )
        ) {
          throw new Error(
            `${formatReasoningEffort(
              selectedReasoningEffort,
            )} reasoning is unavailable for the selected account.`,
          );
        }
      }
      await updateCodexAccount(candidate.targetAccountId, {
        touchLastUsed: true,
      });
    } catch (error) {
      setAccountHandoffCandidate((current) =>
        current?.chatId === candidate.chatId
          ? {
              ...current,
              status: "idle",
              error:
                error instanceof Error
                  ? error.message
                  : "Could not prepare the selected Codex account.",
            }
          : current,
      );
      return;
    }

    const latestSession =
      workspaceChatSessionsRef.current[candidate.workspaceId] ?? null;
    if (
      selectedWorkspaceRef.current?.id !== candidate.workspaceId ||
      !latestSession ||
      latestSession.chatId !== candidate.chatId ||
      latestSession.profileKey !== candidate.fromProfileKey ||
      latestSession.threadId !== candidate.fromThreadId ||
      selectedRunIsActiveNow()
    ) {
      setAccountHandoffCandidate(null);
      setStatusMessage(
        "The chat changed before the account handoff could be confirmed.",
      );
      return;
    }

    setPendingAccountHandoff({
      workspaceId: candidate.workspaceId,
      chatId: candidate.chatId,
      fromProfileKey: candidate.fromProfileKey,
      fromThreadId: candidate.fromThreadId,
      targetAccountId: candidate.targetAccountId,
      targetProfileKey: candidate.targetProfileKey,
    });
    setAccountHandoffCandidate(null);
    setStatusMessage(
      `The next turn will continue with ${candidate.targetLabel} in a fresh Codex thread.`,
    );
  }

  function notifyExternalLoginAction(accountId: number, loginId: string) {
    const account = codexAccountsRef.current.find(
      (candidate) => candidate.id === accountId,
    );
    const eventKey = externalActionNotificationEventKey(accountId, loginId);
    void deliverAgentNotification({
      kind: "external-action",
      target: {
        eventKey,
        kind: "external-action",
        workspaceId: null,
        chatId: null,
        runId: null,
        entryClientId: null,
        requestId: loginId,
        planItemId: null,
        accountId,
        profileKey: `account:${accountId}`,
        threadId: null,
        turnId: null,
      },
      accountLabel: account?.label ?? account?.email,
    });
  }

  function dismissExternalLoginNotification(
    accountId: number,
    loginId: string | null,
  ) {
    if (!loginId) return;
    void removeAgentNotification(
      externalActionNotificationEventKey(accountId, loginId),
    ).catch(() => undefined);
  }

  async function handleLogin() {
    if (loginState === "starting" || loginState === "waiting") {
      setStatusMessage("A Codex sign-in is already in progress.");
      return;
    }
    if (await recoverActiveLoginIfPresent()) {
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
      setPendingLoginId(null);
      pendingLoginIdRef.current = null;
      setPendingLoginAccountId(loginAccountId);
      pendingLoginAccountIdRef.current = loginAccountId;
      setActiveCodexLogin(null);

      await ensureCodexConnected(loginAccountId);
      const response = await startCodexLogin(loginAccountId);

      if (response.type === "chatgpt") {
        await captureStartedLogin(
          loginAccountId,
          response.loginId,
          response.authUrl,
        );
        await openUrl(response.authUrl);
        notifyExternalLoginAction(loginAccountId, response.loginId);
      } else if (response.type === "chatgptDeviceCode") {
        await captureStartedLogin(
          loginAccountId,
          response.loginId,
          response.verificationUrl,
        );
        setLoginUserCode(response.userCode);
        await openUrl(response.verificationUrl);
        notifyExternalLoginAction(loginAccountId, response.loginId);
      } else {
        resetLoginFlow("failed");
        setLoginError(formatLoginStartStatus(response));
      }

      setStatusMessage(formatLoginStartStatus(response));
    } catch (error) {
      if (loginAccountId !== null) {
        if (
          pendingLoginAccountIdRef.current === loginAccountId &&
          pendingLoginIdRef.current
        ) {
          await cancelCodexLogin(
            loginAccountId,
            pendingLoginIdRef.current,
          ).catch(() => undefined);
        }
        dismissExternalLoginNotification(
          loginAccountId,
          pendingLoginIdRef.current,
        );
      }
      resetLoginFlow("failed");
      const message = error instanceof Error ? error.message : String(error);
      if (loginAccountId !== null) {
        await markCodexAccountLoginError(loginAccountId, message);
      }
      setLoginError(message);
      setStatusMessage(`Sign-in failed: ${message}`);
    }
  }

  async function handleAddAccount() {
    if (loginState === "starting" || loginState === "waiting") {
      return;
    }
    if (await recoverActiveLoginIfPresent()) {
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
    if (await recoverActiveLoginIfPresent()) {
      return;
    }
    setPendingLoginId(null);
    pendingLoginIdRef.current = null;
    setPendingLoginAccountId(account.id);
    pendingLoginAccountIdRef.current = account.id;
    setActiveCodexLogin(null);
    setLoginState("starting");
    setLoginError(null);

    try {
      await ensureCodexConnected(account.id);
      const response = await startCodexLogin(account.id);
      if (response.type === "chatgpt") {
        await captureStartedLogin(
          account.id,
          response.loginId,
          response.authUrl,
        );
        await openUrl(response.authUrl);
        notifyExternalLoginAction(account.id, response.loginId);
      } else if (response.type === "chatgptDeviceCode") {
        await captureStartedLogin(
          account.id,
          response.loginId,
          response.verificationUrl,
        );
        setLoginUserCode(response.userCode);
        await openUrl(response.verificationUrl);
        notifyExternalLoginAction(account.id, response.loginId);
      } else {
        resetLoginFlow("failed");
        setLoginError(formatLoginStartStatus(response));
      }
      setStatusMessage(formatLoginStartStatus(response));
    } catch (error) {
      if (
        pendingLoginAccountIdRef.current === account.id &&
        pendingLoginIdRef.current
      ) {
        await cancelCodexLogin(
          account.id,
          pendingLoginIdRef.current,
        ).catch(() => undefined);
      }
      dismissExternalLoginNotification(account.id, pendingLoginIdRef.current);
      resetLoginFlow("failed");
      const message = error instanceof Error ? error.message : String(error);
      await markCodexAccountLoginError(account.id, message);
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
      dismissExternalLoginNotification(pendingLoginAccountId, pendingLoginId);
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
    if (!accountId || activeRunAccountIds.has(accountId)) {
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
    if (activeRunAccountIds.has(accountId)) {
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

  function openCommitDialog() {
    if (
      !selectedWorkspace ||
      !selectedGitRepository ||
      gitOperationInFlightWorkspaceIdsRef.current.has(selectedWorkspace.id)
    ) {
      return;
    }
    setGitOperationsByWorkspace((current) => {
      if (!current[selectedWorkspace.id]) return current;
      const next = { ...current };
      delete next[selectedWorkspace.id];
      return next;
    });
    clearRunningGitOperation(selectedWorkspace.id);
    setCommitIntentContext(suggestedCommitIntentContext);
    setCommitMessage("");
    setCommitDialogMessage("");
    setCommitDialogError(false);
    setIncludeUnstagedChanges(true);
    setCommitDialogOpen(true);
  }

  function handleHeaderGitAction() {
    if (
      !selectedWorkspace ||
      selectedGitActionStatus !== "idle" ||
      gitActionInFlightRef.current
    ) {
      return;
    }

    if (commitDialogOpen) {
      setCommitDialogOpen(false);
    } else {
      openCommitDialog();
    }
  }

  function updateWorkspaceGitOperation(
    workspaceId: number,
    operationId: number,
    update:
      | Partial<WorkspaceGitOperationState>
      | ((
          current: WorkspaceGitOperationState,
        ) => WorkspaceGitOperationState),
  ) {
    setGitOperationsByWorkspace((current) => {
      const operation = current[workspaceId];
      if (!operation || operation.id !== operationId) {
        return current;
      }
      const nextOperation =
        typeof update === "function"
          ? update(operation)
          : { ...operation, ...update };
      return {
        ...current,
        [workspaceId]: nextOperation,
      };
    });
  }

  async function refreshWorkspaceAfterGitOperation(workspace: Workspace) {
    await refreshWorkspaceGitStatus(workspace, {
      showLoading: false,
      force: true,
    });
  }

  async function executeWorkspaceGitOperation(
    workspace: Workspace,
    request: WorkspaceGitOperationRequest,
    operationId: number,
  ) {
    let phase: GitOperationPhase =
      request.kind === "push" ? "pushing" : "committing";
    let commitCompleted = false;

    try {
      if (request.kind !== "push") {
        await commitWorkspaceChanges(
          workspace.path,
          request.commitMessage ?? "",
          request.includeUnstaged,
          request.repositoryPath,
        );
        commitCompleted = true;
        if (request.commitMessage && request.changeKey) {
          lastCommitSubjectsRef.current.set(request.repositoryPath, {
            subject: cleanGeneratedCommitSubject(request.commitMessage),
            changeKey: request.changeKey,
          });
        }
      }

      if (request.kind !== "commit") {
        phase = "pushing";
        persistRunningGitOperation(request, phase);
        const runningCopy = gitOperationRunningCopy(request.kind, phase);
        updateWorkspaceGitOperation(workspace.id, operationId, (current) => ({
          ...current,
          phase,
          ...runningCopy,
        }));
        await pushWorkspaceBranch(workspace.path, request.repositoryPath);
      }

      await refreshWorkspaceAfterGitOperation(workspace);
      const successCopy = gitOperationSuccessCopy(request.kind);
      const successDetail = `${successCopy.detail} Repository: ${request.repositoryLabel}.`;
      updateWorkspaceGitOperation(workspace.id, operationId, {
        status: "succeeded",
        retryRequest: null,
        ...successCopy,
        detail: successDetail,
      });
      if (selectedWorkspaceRef.current?.id === workspace.id) {
        setStatusMessage(successDetail);
      }
    } catch (error) {
      await refreshWorkspaceAfterGitOperation(workspace);
      const failureCopy = gitOperationFailureCopy(
        phase,
        error,
        commitCompleted,
      );
      const failureDetail = `${failureCopy.detail} Repository: ${request.repositoryLabel}.`;
      const retryRequest =
        commitCompleted && phase === "pushing"
          ? {
              ...request,
              kind: "push" as const,
              commitMessage: null,
              changeKey: null,
            }
          : request;
      updateWorkspaceGitOperation(workspace.id, operationId, {
        status: "failed",
        retryRequest,
        ...failureCopy,
        detail: failureDetail,
      });
      if (selectedWorkspaceRef.current?.id === workspace.id) {
        setStatusMessage(failureDetail);
      }
    } finally {
      gitOperationInFlightWorkspaceIdsRef.current.delete(workspace.id);
      clearRunningGitOperation(workspace.id);
    }
  }

  function registerWorkspaceGitOperation(
    request: WorkspaceGitOperationRequest,
    phase: GitOperationPhase,
  ) {
    if (
      gitOperationInFlightWorkspaceIdsRef.current.has(request.workspaceId)
    ) {
      return null;
    }
    const workspace =
      workspacesRef.current.find(
        (candidate) =>
          candidate.id === request.workspaceId &&
          candidate.path === request.workspacePath,
      ) ?? null;
    if (!workspace) {
      return null;
    }

    gitOperationInFlightWorkspaceIdsRef.current.add(workspace.id);
    const operationId = ++gitOperationSequenceRef.current;
    const runningCopy = gitOperationRunningCopy(request.kind, phase);
    const operation: WorkspaceGitOperationState = {
      id: operationId,
      request,
      phase,
      status: "running",
      retryRequest: null,
      ...runningCopy,
    };

    persistRunningGitOperation(request, phase);
    flushSync(() => {
      setGitOperationsByWorkspace((current) => ({
        ...current,
        [workspace.id]: operation,
      }));
      setCommitDialogOpen(false);
      setCommitIntentContext(null);
      setCommitMessage("");
      setCommitDialogMessage("");
      setCommitDialogError(false);
    });
    return { operationId, workspace };
  }

  function startWorkspaceGitOperation(request: WorkspaceGitOperationRequest) {
    const phase: GitOperationPhase =
      request.kind === "push" ? "pushing" : "committing";
    const registered = registerWorkspaceGitOperation(request, phase);
    if (!registered) return false;
    void executeWorkspaceGitOperation(
      registered.workspace,
      request,
      registered.operationId,
    );
    return true;
  }

  function retryWorkspaceGitOperation(request: WorkspaceGitOperationRequest) {
    if (!startWorkspaceGitOperation(request)) {
      setStatusMessage(
        gitOperationInFlightWorkspaceIdsRef.current.has(request.workspaceId)
          ? "A Git operation is already running for this workspace."
          : "This workspace is no longer available.",
      );
    }
  }

  function handlePushOnly() {
    const workspace = selectedWorkspace;
    const repository = selectedGitRepository;
    if (
      !workspace ||
      !repository ||
      !headerGitAction.canPush ||
      selectedGitActionStatus !== "idle" ||
      gitActionInFlightRef.current
    ) {
      return;
    }

    gitActionInFlightRef.current = true;
    try {
      startWorkspaceGitOperation({
        workspaceId: workspace.id,
        workspacePath: workspace.path,
        workspaceLabel: workspace.label,
        repositoryPath: repository.repository.rootPath,
        repositoryLabel: repository.repository.label,
        kind: "push",
        commitMessage: null,
        includeUnstaged: true,
        changeKey: null,
      });
    } finally {
      gitActionInFlightRef.current = false;
    }
  }

  async function generateCommitMessageForOperation(
    workspace: Workspace,
    snapshot: CommitMessageGenerationSnapshot,
  ) {
    const result = await generateWorkspaceCommitMessage({
      workspacePath: workspace.path,
      repositoryPath: snapshot.repositoryPath,
      accountId: snapshot.accountId,
      includeUnstaged: snapshot.includeUnstaged,
      model: snapshot.model,
      intentContext: snapshot.intentContext,
    });
    const rejection = generatedCommitSubjectRejectionReason(
      result.message,
      snapshot.files,
    );
    if (rejection) {
      throw new Error(rejection);
    }
    const generated = cleanGeneratedCommitSubject(result.message);
    const previous = lastCommitSubjectsRef.current.get(snapshot.repositoryPath);
    if (
      previous &&
      previous.changeKey !== snapshot.changeKey &&
      previous.subject.toLowerCase() === generated.toLowerCase()
    ) {
      throw new Error("Codex repeated a subject for different changes.");
    }
    return generated;
  }

  async function executeWorkspaceCommitGeneration(
    workspace: Workspace,
    request: WorkspaceGitOperationRequest,
    snapshot: CommitMessageGenerationSnapshot,
    operationId: number,
  ) {
    let message: string;
    try {
      message = await generateCommitMessageForOperation(
        workspace,
        snapshot,
      );
    } catch {
      updateWorkspaceGitOperation(workspace.id, operationId, {
        status: "failed",
        retryRequest: null,
        title: "Commit message unavailable",
        detail: COMMIT_MESSAGE_GENERATION_ERROR,
      });
      if (selectedWorkspaceRef.current?.id === workspace.id) {
        setStatusMessage(COMMIT_MESSAGE_GENERATION_ERROR);
      }
      gitOperationInFlightWorkspaceIdsRef.current.delete(workspace.id);
      clearRunningGitOperation(workspace.id);
      return;
    }

    const generatedRequest: WorkspaceGitOperationRequest = {
      ...request,
      commitMessage: message,
    };
    const runningCopy = gitOperationRunningCopy(
      generatedRequest.kind,
      "committing",
    );
    persistRunningGitOperation(generatedRequest, "committing");
    updateWorkspaceGitOperation(workspace.id, operationId, (current) => ({
      ...current,
      request: generatedRequest,
      phase: "committing",
      ...runningCopy,
    }));
    await executeWorkspaceGitOperation(
      workspace,
      generatedRequest,
      operationId,
    );
  }

  function startWorkspaceCommitGeneration(
    request: WorkspaceGitOperationRequest,
    snapshot: CommitMessageGenerationSnapshot,
  ) {
    const registered = registerWorkspaceGitOperation(request, "generating");
    if (!registered) return false;
    void executeWorkspaceCommitGeneration(
      registered.workspace,
      request,
      snapshot,
      registered.operationId,
    );
    return true;
  }

  function handleCommitAll(options: { pushAfter?: boolean } = {}) {
    const workspace = selectedWorkspace;
    const repository = selectedGitRepository;
    if (
      !workspace ||
      !repository ||
      !canCommitFromDialog ||
      selectedGitActionStatus !== "idle" ||
      gitActionInFlightRef.current
    ) {
      return;
    }

    gitActionInFlightRef.current = true;
    try {
      const authoredMessage = commitMessage.trim();
      const request: WorkspaceGitOperationRequest = {
        workspaceId: workspace.id,
        workspacePath: workspace.path,
        workspaceLabel: workspace.label,
        repositoryPath: repository.repository.rootPath,
        repositoryLabel: repository.repository.label,
        kind: options.pushAfter ? "commit-and-push" : "commit",
        commitMessage: authoredMessage || null,
        includeUnstaged: includeUnstagedChanges,
        changeKey: commitMessageChangeKey,
      };
      if (authoredMessage) {
        startWorkspaceGitOperation(request);
      } else {
        startWorkspaceCommitGeneration(request, {
          repositoryPath: repository.repository.rootPath,
          accountId: selectedAccountId,
          includeUnstaged: includeUnstagedChanges,
          model: selectedModel?.model ?? selectedModel?.id ?? null,
          intentContext: commitIntentContext,
          files: [...commitMessageFiles],
          changeKey: commitMessageChangeKey,
        });
      }
    } finally {
      gitActionInFlightRef.current = false;
    }
  }

  function beginOptimisticRun(snapshot: RunSetupSnapshot) {
    if (snapshot.chatId !== null) {
      const existing = findRunControlByChat(snapshot.workspace.id, snapshot.chatId);
      if (existing) {
        throw new Error("This conversation already has an active Codex run.");
      }
      if (
        kanbanRuntime.isLaunchReserved(snapshot.workspace.id, snapshot.chatId) &&
        !snapshot.kanbanAttempt
      ) {
        throw new Error("This card conversation is currently starting from Kanban.");
      }
    }
    const selectedSession = selectedWorkspaceRef.current
      ? workspaceChatSessionsRef.current[selectedWorkspaceRef.current.id] ?? null
      : null;
    const visibleTarget =
      selectedWorkspaceRef.current?.id === snapshot.workspace.id &&
      (snapshot.chatId === null ||
        selectedSession?.chatId === snapshot.chatId);
    if (visibleTarget) {
      historyChatLoadIdRef.current += 1;
      cancelActiveExternalTranscriptSync();
      cancelActiveHistoricalTranscriptPreparation();
      cancelPendingTranscriptCommit();
      setHistoryChatLoadState(null);
      setHistoryOpenRequest(null);
      historicalTranscriptRef.current = null;
      setHistoricalTranscript(null);
    }
    const clientId = snapshot.queueItemId ?? createTaskChatClientId();
    appServices.runCoordinator.begin(clientId);
    const intent: RunIntent =
      snapshot.intent ?? (snapshot.mode === "plan" ? "plan" : "normal");
    const clientUserMessageId =
      snapshot.clientUserMessageId ?? createStableClientMessageId();
    snapshot.intent = intent;
    snapshot.clientUserMessageId = clientUserMessageId;
    const submittedAt = new Date().toISOString();
    const resumesExistingThread = snapshot.threadStrategy.kind === "resume";
    const previousThreadUsage =
      snapshot.profileKey !== DEFAULT_CODEX_PROFILE_KEY &&
      snapshot.threadId !== null &&
      resumesExistingThread
        ? [...selectedWorkspaceChatEntries]
            .reverse()
            .find(
              (entry) =>
                entry.chatId === snapshot.chatId &&
                entry.runView.threadId === snapshot.threadId &&
                entry.runView.tokenUsage !== null,
            )?.runView.tokenUsage ?? null
        : null;
    const startsFreshThread = !resumesExistingThread;
    const initialRunView = {
      ...emptyRunView,
      status: "connecting" as const,
      startedAt: submittedAt,
      tokenUsageStartTotal: startsFreshThread
        ? 0
        : previousThreadUsage?.totalTokens ?? null,
      tokenUsageStartCachedInput: startsFreshThread
        ? 0
        : previousThreadUsage?.cachedInputTokens ?? null,
      nativePlan: {
        ...emptyRunView.nativePlan,
        intent,
        mode:
          intent === "plan" || intent === "plan-revision" ? "plan" as const : "default" as const,
        phase:
          intent === "plan" || intent === "plan-revision"
            ? "activating" as const
            : intent === "plan-implementation"
              ? "implementing" as const
              : "inactive" as const,
      },
    };
    const runControl: ActiveRunControl = {
      accountId: snapshot.accountId,
      profileKey: snapshot.profileKey,
      workspaceId: snapshot.workspace.id,
      clientId,
      promptFallback: snapshot.promptFallback,
      imageContextFilesFallback: snapshot.contextFiles
        .filter(isImageContextFile)
        .map((file) => ({ ...file })),
      chatId: snapshot.chatId,
      stopped: false,
      taskId: null,
      runId: null,
      setupStarted: false,
      turnStartPending: false,
      cancelScheduledSetup: null,
      interactionMode: interactionModeForSnapshot(snapshot),
      acceptsThreadContinuation: snapshot.goalMode,
      goal: null,
      goalActionPending: null,
      goalActionError: null,
      goalTurnCompleted: false,
      threadId: snapshot.threadId,
      turnId: null,
      intent,
      clientUserMessageId,
      executionSettings: snapshot.executionSettings,
      entry: null,
      runView: initialRunView,
      eventSequence: 0,
      queueItemId: snapshot.queueItemId ?? null,
      queueAdvanceBlocked: false,
      browserSession: null,
      activePlaywrightToolCalls: new Map(),
      webPreviewDetection: {
        commands: new Map(),
        probes: new Map(),
        nextSequence: 0,
        confirmedSequence: 0,
        disposed: false,
      },
      kanbanAttempt: snapshot.kanbanAttempt ?? null,
      kanbanStopStatus: null,
      kanbanStopRequest: null,
    };
    const nextEntry: TaskChatEntry = {
      clientId,
      workspaceId: snapshot.workspace.id,
      chatId: snapshot.chatId,
      turnIndex: snapshot.turnIndex,
      runId: null,
      taskId: null,
      prompt: snapshot.promptText,
      contextFiles: snapshot.contextFiles,
      executionSettings: {
        settings: snapshot.executionSettings,
        source: "captured",
      },
      submittedAt,
      status: initialRunView.status,
      runView: initialRunView,
      imageAttachmentDelivery:
        snapshot.contextFiles.some(isImageContextFile)
          ? { status: "preparing", error: null }
          : undefined,
    };
    runControl.entry = nextEntry;
    if (visibleTarget) {
      // Queue state is committed before dispatch. Let Virtuoso own the
      // subsequent append so it cannot compete with a second anchor.
      if (!snapshot.fromQueue) {
        taskChatTranscriptRef.current?.stabilizeForSubmission();
      }
      flushSync(() => {
        if (snapshot.replacementClientId) {
          replaceTaskChatEntry(snapshot.replacementClientId, nextEntry);
        } else {
          startTaskChatEntry(nextEntry);
        }
        if (snapshot.restorePromptOnSetupFailure !== false) {
          replaceComposerPrompt("");
          removeSubmittedImagesFromWorkspaceComposer(
            snapshot.workspace.id,
            snapshot.contextFiles,
          );
        }
      });
      if (!snapshot.fromQueue) {
        taskChatTranscriptRef.current?.settleAfterSubmission();
      }
    }
    registerRunControl(runControl);
    if (visibleTarget) {
      rememberCurrentWorkspaceTaskMemory();
    }
    markPerformance("orchestrator:submit:optimistic-committed");

    return runControl;
  }

  async function prepareRunSetupStage(
    runControl: ActiveRunControl,
    snapshot: RunSetupSnapshot,
    accountHandoff: AccountHandoffRunStrategy | null,
  ): Promise<RunPreparationStageResult> {
    if (
      !(await ensureRunBranch(
        snapshot.workspace,
        snapshot.selectedRepositoryPath,
        snapshot.selectedBranch,
      ))
    ) {
      throw new Error(
        snapshot.selectedBranch
          ? `Could not switch to ${snapshot.selectedBranch}.`
          : "Could not prepare the selected branch.",
      );
    }
    ensureRunControlActive(runControl);

    snapshot.contextFiles = await prepareContextImageFiles(
      snapshot.contextFiles,
      imageAttachments,
    );
    snapshot.executionSettings = createRunExecutionSettings({
      ...snapshot.executionSettings,
      contextFiles: snapshot.contextFiles,
    });
    runControl.executionSettings = snapshot.executionSettings;
    runControl.imageContextFilesFallback = snapshot.contextFiles
      .filter(isImageContextFile)
      .map((file) => ({ ...file }));
    updateTaskChatEntry(runControl.clientId, (entry) => ({
      ...entry,
      contextFiles: snapshot.contextFiles.map((file) => ({ ...file })),
      executionSettings: {
        settings: snapshot.executionSettings,
        source: "captured",
      },
      imageAttachmentDelivery: snapshot.contextFiles.some(isImageContextFile)
        ? { status: "preparing", error: null }
        : undefined,
    }));
    if (snapshot.restorePromptOnSetupFailure !== false) {
      removeSubmittedImagesFromWorkspaceComposer(
        snapshot.workspace.id,
        snapshot.contextFiles,
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
    preflightRef.current = report;

    appServices.runCoordinator.transition(runControl.clientId, "connecting");
    await ensureCodexProfileConnected(snapshot.profileKey, snapshot.accountId);
    ensureRunControlActive(runControl);
    const collaborationModes = await collaborationModesForRun(
      snapshot.profileKey,
      snapshot.accountId,
      snapshot.model,
      snapshot.effort,
      snapshot.mode === "plan",
    );
    const collaborationMode =
      snapshot.mode === "plan"
        ? collaborationModes.plan
        : snapshot.defaultCollaborationMode ?? collaborationModes.default;
    if (!collaborationMode) {
      throw new Error("Codex did not return a native Plan collaboration mode.");
    }
    ensureRunControlActive(runControl);
    if (snapshot.profileKey !== DEFAULT_CODEX_PROFILE_KEY) {
      const authState = await refreshAccountState(snapshot.accountId, true);
      ensureRunControlActive(runControl);
      if (shouldBlockRunForAuth(authState.requiresOpenaiAuth, authState.account)) {
        throw new Error(
          snapshot.loginState === "waiting"
            ? "Finish Codex sign-in before starting a run."
            : "Sign in to Codex before starting a run.",
        );
      }
    }
    if (accountHandoff) {
      snapshot.previousChatContext = await buildAccountHandoffContext(
        snapshot,
        runControl,
      );
      ensureRunControlActive(runControl);
    }

    return { report, collaborationModes, collaborationMode };
  }

  async function persistRunSetupStage(
    runControl: ActiveRunControl,
    snapshot: RunSetupSnapshot,
    report: PreflightReport,
    collaborationMode: CollaborationMode,
    initialChatId: number | null,
    initialThreadId: string | null,
  ): Promise<RunPersistenceStageResult> {
    appServices.runCoordinator.transition(runControl.clientId, "persisting");
    let chatId = initialChatId;
    let threadId = initialThreadId;
    let pendingChatTitleGeneration: ChatTitleGenerationRequest | null = null;

    if (chatId === null) {
      if (snapshot.chatOrigin !== "orchestrator") {
        throw new Error(
          "External Codex chats must be opened from history before continuing.",
        );
      }
      const initialTitlePrompt = restorePromptInlineFileReferencesForComposer(
        snapshot.promptText,
        snapshot.contextFiles.filter((file) => file.source === "search"),
      );
      const fallbackTitle = fallbackChatTitle(initialTitlePrompt);
      const chat = await createChat({
        workspaceId: snapshot.workspace.id,
        accountId: snapshot.accountId,
        title: fallbackTitle,
        status: "starting",
        generateTitle: true,
      });
      chatId = chat.id;
      threadId = chat.codex_thread_id;
      pendingChatTitleGeneration = {
        chatId: chat.id,
        workspacePath: snapshot.workspace.path,
        accountId: snapshot.accountId,
        model: snapshot.model,
        initialPrompt: initialTitlePrompt,
        fallbackTitle,
      };
      runControl.chatId = chat.id;
      promoteRememberedWorkspaceDraft(snapshot.workspace.id, runControl.clientId, {
        chatId: chat.id,
        threadId,
        origin: snapshot.chatOrigin,
        profileKey: snapshot.profileKey,
        externalThreadId: snapshot.externalThreadId,
        nextTurnIndex: snapshot.turnIndex + 1,
      });
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
    runControl.taskId = task.id;
    if (activeRunControlRef.current === runControl) {
      currentTaskId.current = task.id;
    }
    ensureRunControlActive(runControl);

    await savePreflightReport(snapshot.workspace.id, task.id, report);
    ensureRunControlActive(runControl);

    const run = await createRun({
      taskId: task.id,
      workspaceId: snapshot.workspace.id,
      chatId,
      turnIndex: snapshot.turnIndex,
      accountId:
        snapshot.profileKey === DEFAULT_CODEX_PROFILE_KEY
          ? null
          : snapshot.accountId,
      accountLabel: snapshot.account?.label ?? "Codex default profile",
      accountEmail: snapshot.account?.email ?? null,
      status: "starting",
      sandbox: snapshot.access.sandbox,
      approvalPolicy: snapshot.access.approvalPolicy,
      model: snapshot.model,
      modelProvider: snapshot.useOss ? "oss" : null,
      collaborationMode: collaborationMode.mode,
      runIntent: runControl.intent,
      clientUserMessageId: runControl.clientUserMessageId,
      executionSettingsJson: serializeRunExecutionSettings(
        snapshot.executionSettings,
      ),
    });
    runControl.runId = run.id;
    if (activeRunControlRef.current === runControl) {
      currentRunId.current = run.id;
      currentRunAccountId.current = snapshot.accountId;
      currentRunProfileKey.current = snapshot.profileKey;
    }
    ensureRunControlActive(runControl);
    for (const supersededRunId of snapshot.supersededRunIds ?? []) {
      await softDeleteRun(supersededRunId);
      ensureRunControlActive(runControl);
    }
    flushFrameBatchedCodexNotifications();
    await flushBufferedRunEvents().catch(() => undefined);
    runControl.eventSequence = 0;
    updateTaskChatEntryIds(runControl.clientId, {
      taskId: task.id,
      runId: run.id,
      chatId,
      turnIndex: snapshot.turnIndex,
    });

    return {
      chatId,
      threadId,
      taskId: task.id,
      runId: run.id,
      pendingChatTitleGeneration,
    };
  }

  async function rollbackRunSetupStage(
    runControl: ActiveRunControl,
    snapshot: RunSetupSnapshot,
    error: unknown,
    state: RunSetupFailureState,
  ) {
    runControl.turnStartPending = false;
    const {
      chatId,
      taskId,
      runId,
      accountHandoff,
      accountHandoffActivated,
      pendingChatTitleGeneration,
    } = state;
    if (pendingChatTitleGeneration) {
      const titleRequest = pendingChatTitleGeneration;
      if (await failChatTitleGeneration(titleRequest.chatId).catch(() => false)) {
        updateHistoryChatTitle(
          titleRequest.chatId,
          titleRequest.fallbackTitle,
          "failed",
        );
      }
    }
    const pendingKanbanStop = runControl.kanbanStopRequest;
    if (pendingKanbanStop) {
      if (!pendingKanbanStop.settled && runControl.turnId === null) {
        pendingKanbanStop.settle({ acknowledged: true });
      }
      const acknowledgement = await pendingKanbanStop.promise;
      if (acknowledgement.acknowledged) {
        await persistInterruptedRun(
          runControl,
          new Date().toISOString(),
          runControl.runView,
        );
        removeRunControl(runControl);
        appServices.runCoordinator.tryTransition(
          runControl.clientId,
          "cancelled",
        );
        return;
      }
    }
    if (error instanceof RunStoppedError || runControl.stopped) {
      appServices.runCoordinator.tryTransition(runControl.clientId, "cancelling");
      appServices.runCoordinator.tryTransition(
        runControl.clientId,
        "rolling-back",
      );
      await persistInterruptedRun(
        runControl,
        new Date().toISOString(),
        runControl.runView,
      );
      if (snapshot.queueItemId) {
        const failedQueueItem = await failPromptQueueItem(
          snapshot.queueItemId,
          "The queued prompt was cancelled before Codex accepted it.",
        ).catch(() => null);
        if (failedQueueItem) upsertPromptQueueItemInMemory(failedQueueItem);
        if (chatId !== null) setPromptQueuePaused(chatId, true, "failure");
      }
      removeRunControl(runControl);
      appServices.runCoordinator.tryTransition(runControl.clientId, "cancelled");
      return;
    }

    const message = error instanceof Error ? error.message : String(error);
    appServices.runCoordinator.tryTransition(runControl.clientId, "rolling-back");
    const handoffDidNotActivate = Boolean(
      accountHandoff && !accountHandoffActivated,
    );
    if (runControl.turnId === null) {
      updateTaskChatEntry(runControl.clientId, (entry) => ({
        ...entry,
        imageAttachmentDelivery: entry.imageAttachmentDelivery
          ? { status: "failed", error: message }
          : undefined,
      }));
    }
    if (snapshot.sourcePlanEntry) {
      restoreTaskChatEntry(
        snapshot.sourcePlanEntry.clientId,
        snapshot.sourcePlanEntry,
      );
      planActionLocksRef.current.delete(snapshot.sourcePlanEntry.clientId);
      if (snapshot.sourcePlanEntry.runId !== null) {
        await updateRun(snapshot.sourcePlanEntry.runId, {
          planReviewState: "available",
        }).catch(() => undefined);
      }
    }
    const completedAt = new Date().toISOString();
    const failedRunView = updateRunControlView(runControl, (current) => {
      const elapsedRunView = updateRunElapsed(current);
      return {
        ...elapsedRunView,
        status: "failed" as const,
        completedAt,
        error: message,
        streamEvents:
          elapsedRunView.streamEvents.length > 0
            ? elapsedRunView.streamEvents
            : [
                {
                  id: `setup-error-${completedAt}`,
                  kind: "system" as const,
                  text: `Setup failed: ${message}`,
                  timestamp: completedAt,
                },
              ],
      };
    });
    if (runId === null) {
      if (snapshot.restoreEntryOnSetupFailure) {
        restoreTaskChatEntry(
          runControl.clientId,
          snapshot.restoreEntryOnSetupFailure,
        );
      }
    } else {
      await updateRun(runId, {
        status: "failed",
        completedAt,
        durationMs: failedRunView.elapsedMs,
        error: message,
      }).catch(() => undefined);
    }
    if (
      (runControl.turnId === null || handoffDidNotActivate) &&
      snapshot.restorePromptOnSetupFailure !== false
    ) {
      restoreRunComposerForRetry(
        snapshot.workspace.id,
        snapshot.promptFallback,
        runControl.imageContextFilesFallback,
      );
    }
    if (taskId !== null) {
      await updateTaskStatus(taskId, "failed").catch(() => undefined);
    }
    await kanbanAttempts.persist(runControl, "failed", message);
    if (chatId !== null && !handoffDidNotActivate) {
      await updateChat(chatId, { status: "failed" }).catch(() => undefined);
    }
    if (snapshot.queueItemId) {
      const failedQueueItem = await failPromptQueueItem(
        snapshot.queueItemId,
        message,
      ).catch(() => null);
      if (failedQueueItem) upsertPromptQueueItemInMemory(failedQueueItem);
      if (chatId !== null) setPromptQueuePaused(chatId, true, "failure");
    }
    removeRunControl(runControl);
    appServices.runCoordinator.tryTransition(runControl.clientId, "failed", message);
    setStatusMessage(`Run setup failed: ${message}`);
  }

  async function establishRunGoalStage(
    runControl: ActiveRunControl,
    snapshot: RunSetupSnapshot,
    threadId: string,
    warnings: string[],
    freshThread: boolean,
  ) {
    if (!snapshot.goalMode) return;
    try {
      const response = await setThreadGoalForProfile(
        snapshot.profileKey,
        snapshot.accountId,
        threadId,
        snapshot.promptText,
      );
      const goal = parseThreadGoal(response.goal, {
        fallbackThreadId: threadId,
      });
      if (!goal) throw new Error("Codex returned invalid goal state.");
      runControl.acceptsThreadContinuation = true;
      runControl.goal = goal;
      runControl.goalActionPending = null;
      runControl.goalActionError = null;
      activeRunRegistry.touch();
      ensureRunControlActive(runControl);
    } catch (error) {
      if (error instanceof RunStoppedError) throw error;
      runControl.acceptsThreadContinuation = false;
      runControl.goal = null;
      runControl.goalActionPending = null;
      runControl.goalActionError = null;
      warnings.push(
        `Goal mode could not set a thread goal${
          freshThread ? " on the fresh thread" : ""
        }: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async function prepareRunTurnPayloadStage(
    runControl: ActiveRunControl,
    snapshot: RunSetupSnapshot,
    report: PreflightReport,
    warnings: string[],
  ): Promise<RunTurnPayloadStageResult> {
    const baseTurnText =
      runControl.intent === "plan-revision" ||
      runControl.intent === "plan-implementation"
        ? snapshot.promptText
        : snapshot.mode === "plan"
          ? report.improvedPrompt || snapshot.improvedPrompt
          : buildRunPrompt(
              report.improvedPrompt || snapshot.improvedPrompt,
              report.recommendations,
            );
    const progressAwareTurnText =
      runControl.intent === "plan-implementation"
        ? addPlanImplementationProgressInstructions(baseTurnText)
        : baseTurnText;
    const text = applySelectedSkillsToPrompt(
      progressAwareTurnText,
      snapshot.selectedSkills,
    );
    let { additionalContext, skippedFiles } = await buildAdditionalContext(
      snapshot.profileKey,
      snapshot.accountId,
      snapshot.contextFiles,
      snapshot.workspace.id,
    );
    if (snapshot.previousChatContext) {
      additionalContext = {
        ...(additionalContext ?? {}),
        "chat:previous-turns": {
          kind: "application",
          value: snapshot.previousChatContext,
        },
      };
    }
    ensureRunControlActive(runControl);
    if (skippedFiles.length > 0) {
      warnings.push(
        `Skipped context file${skippedFiles.length === 1 ? "" : "s"}: ${skippedFiles.join(", ")}`,
      );
    }
    return { text, additionalContext };
  }

  async function startRunThreadStage(
    runControl: ActiveRunControl,
    snapshot: RunSetupSnapshot,
    collaborationModes: RunPreparationStageResult["collaborationModes"],
    collaborationMode: CollaborationMode,
    accountHandoff: AccountHandoffRunStrategy | null,
    chatId: number,
    runId: number,
    initialThreadId: string | null,
  ): Promise<RunThreadStageResult> {
    appServices.runCoordinator.transition(
      runControl.clientId,
      "preparing-browser",
    );
    const browserSession = snapshot.computerUseEnabled
      ? await prepareBrowserSession({
          profileKey: snapshot.profileKey,
          workspaceId: snapshot.workspace.id,
          chatId,
          runId,
          entryId: runControl.clientId,
          threadId: initialThreadId,
          turnId: null,
          accessMode: snapshot.access.accessMode,
        })
      : null;
    runControl.browserSession = browserSession;
    if (browserSession) {
      activeRunRegistry.touch();
    }
    const threadConfig = {
      ...(snapshot.useOss
        ? { model_provider: "oss", oss_provider: snapshot.ossProvider }
        : {}),
      ...(browserSession?.config ?? {}),
    };

    appServices.runCoordinator.transition(runControl.clientId, "starting-thread");
    let threadId = initialThreadId;
    let threadModel: string | null | undefined = snapshot.model;
    let threadModelProvider: string | null | undefined = snapshot.useOss
      ? "oss"
      : null;
    let resumedThread = false;
    const startFreshThread = async (): Promise<StartedRunThread> => {
      if (
        snapshot.profileKey === DEFAULT_CODEX_PROFILE_KEY &&
        !accountHandoff
      ) {
        throw new Error(
          "External Codex chats cannot be restarted as Orchestrator threads.",
        );
      }
      const thread = await codexRpcForProfile<{
        thread: { id: string };
        model?: string;
        modelProvider?: string;
        serviceTier?: string | null;
        approvalPolicy?: string;
        activePermissionProfile?: { id?: string | null } | null;
      }>(snapshot.profileKey, snapshot.accountId, "thread/start", {
        cwd: snapshot.workspace.path,
        model: snapshot.model,
        approvalPolicy: snapshot.access.approvalPolicy,
        approvalsReviewer: "user",
        permissions: snapshot.access.permissionProfile,
        serviceName: "orchestrator",
        threadSource: "orchestrator",
        config: threadConfig,
      });
      ensureRunControlActive(runControl);
      assertRuntimeAccessMatches(thread, snapshot.access);
      const nextThreadId = thread.thread.id;
      runControl.threadId = nextThreadId;
      void flushPendingRunBindingNotifications(runControl).catch((error) => {
        console.error("Could not replay buffered Codex notifications", error);
      });
      const nextThreadModel = thread.model ?? snapshot.model;
      const nextThreadModelProvider =
        thread.modelProvider ?? (snapshot.useOss ? "oss" : null);
      if (!accountHandoff) {
        await updateChat(chatId, {
          codexThreadId: nextThreadId,
          status: "running",
        });
        updateRememberedWorkspaceChatSession(snapshot.workspace.id, chatId, {
          chatId,
          threadId: nextThreadId,
          origin: snapshot.chatOrigin,
          profileKey: snapshot.profileKey,
          externalThreadId: snapshot.externalThreadId,
          nextTurnIndex: snapshot.turnIndex + 1,
        });
      }
      return {
        threadId: nextThreadId,
        model: nextThreadModel,
        modelProvider: nextThreadModelProvider,
      };
    };

    if (!threadId) {
      const thread = await startFreshThread();
      threadId = thread.threadId;
      threadModel = thread.model;
      threadModelProvider = thread.modelProvider;
    } else {
      runControl.threadId = threadId;
      void flushPendingRunBindingNotifications(runControl).catch((error) => {
        console.error("Could not replay buffered Codex notifications", error);
      });
      try {
        const resumed = await codexRpcForProfile<{
          model?: string;
          modelProvider?: string;
          approvalPolicy?: string;
          activePermissionProfile?: { id?: string | null } | null;
        }>(snapshot.profileKey, snapshot.accountId, "thread/resume", {
          threadId,
          cwd: snapshot.workspace.path,
          approvalPolicy: snapshot.access.approvalPolicy,
          approvalsReviewer: "user",
          permissions: snapshot.access.permissionProfile,
          config: threadConfig,
        });
        resumedThread = true;
        assertRuntimeAccessMatches(resumed, snapshot.access);
        threadModel = resumed.model ?? threadModel;
        threadModelProvider = resumed.modelProvider ?? threadModelProvider;
      } catch (error) {
        if (
          snapshot.profileKey !== DEFAULT_CODEX_PROFILE_KEY &&
          isCodexThreadNotFoundError(error)
        ) {
          const thread = await startFreshThread();
          threadId = thread.threadId;
          threadModel = thread.model;
          threadModelProvider = thread.modelProvider;
          updateRunControlView(runControl, (current) => ({
            ...current,
            tokenUsageStartTotal: 0,
            tokenUsageStartCachedInput: 0,
          }));
        } else if (snapshot.profileKey === DEFAULT_CODEX_PROFILE_KEY) {
          throw new Error(
            `Could not resume the external Codex thread: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        } else {
          throw error;
        }
      }
      if (resumedThread && !snapshot.goalMode) {
        try {
          await clearThreadGoalForProfile(
            snapshot.profileKey,
            snapshot.accountId,
            threadId,
          );
        } catch (error) {
          throw new Error(
            `Could not clear the previous Goal Mode state before starting this turn: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }
      try {
        await codexRpcForProfile(
          snapshot.profileKey,
          snapshot.accountId,
          "thread/settings/update",
          { threadId, collaborationMode },
        );
      } catch (error) {
        if (!isCodexThreadNotFoundError(error)) throw error;
      }
      ensureRunControlActive(runControl);
      await updateChat(chatId, { status: "running" });
    }
    if (!accountHandoff) {
      await updateChat(chatId, {
        collaborationMode: collaborationMode.mode,
        savedDefaultCollaborationModeJson:
          snapshot.mode === "plan"
            ? JSON.stringify(
                snapshot.defaultCollaborationMode ?? collaborationModes.default,
              )
            : null,
      });
      updateRememberedWorkspaceChatSession(snapshot.workspace.id, chatId, {
        chatId,
        threadId,
        origin: snapshot.chatOrigin,
        profileKey: snapshot.profileKey,
        externalThreadId: snapshot.externalThreadId,
        nextTurnIndex: snapshot.turnIndex + 1,
        savedDefaultCollaborationMode:
          snapshot.mode === "plan"
            ? snapshot.defaultCollaborationMode ?? collaborationModes.default
            : null,
      });
    }
    ensureRunControlActive(runControl);
    if (browserSession) {
      updateRunControlBrowserState(
        runControl,
        await updateBrowserSessionTarget(browserSession.token, {
          ...browserSession.state.target,
          chatId,
          runId,
          threadId,
          turnId: null,
        }),
      );
    }
    await updateRun(runId, {
      codexThreadId: threadId,
      model: threadModel ?? snapshot.model,
      modelProvider: threadModelProvider ?? (snapshot.useOss ? "oss" : null),
      status: "running",
      collaborationMode: collaborationMode.mode,
      runIntent: runControl.intent,
    });
    ensureRunControlActive(runControl);

    return {
      threadId,
      model: threadModel,
      modelProvider: threadModelProvider,
      browserSession,
      startFreshThread,
    };
  }

  async function continueRunSetup(
    runControl: ActiveRunControl,
    snapshot: RunSetupSnapshot,
  ) {
    appServices.runCoordinator.transition(runControl.clientId, "preparing");
    let chatId = snapshot.chatId;
    const accountHandoff =
      snapshot.threadStrategy.kind === "handoff"
        ? snapshot.threadStrategy.handoff
        : null;
    let threadId =
      snapshot.threadStrategy.kind === "resume" ? snapshot.threadId : null;
    let taskId: number | null = null;
    let runId: number | null = null;
    let accountHandoffActivated = false;
    let pendingChatTitleGeneration: ChatTitleGenerationRequest | null = null;
    const warnings: string[] = [];

    setStatusMessage("Preparing run...");
    preflightRef.current = null;

    try {
      const { report, collaborationModes, collaborationMode } =
        await prepareRunSetupStage(runControl, snapshot, accountHandoff);

      const persisted = await persistRunSetupStage(
        runControl,
        snapshot,
        report,
        collaborationMode,
        chatId,
        threadId,
      );
      chatId = persisted.chatId;
      threadId = persisted.threadId;
      taskId = persisted.taskId;
      runId = persisted.runId;
      pendingChatTitleGeneration = persisted.pendingChatTitleGeneration;
      const startedThread = await startRunThreadStage(
        runControl,
        snapshot,
        collaborationModes,
        collaborationMode,
        accountHandoff,
        chatId,
        runId,
        threadId,
      );
      threadId = startedThread.threadId;
      let threadModel = startedThread.model;
      let threadModelProvider = startedThread.modelProvider;
      const browserSession = startedThread.browserSession;
      const startThread = startedThread.startFreshThread;

      await establishRunGoalStage(
        runControl,
        snapshot,
        threadId,
        warnings,
        false,
      );

      const { text, additionalContext } = await prepareRunTurnPayloadStage(
        runControl,
        snapshot,
        report,
        warnings,
      );

      appServices.runCoordinator.transition(runControl.clientId, "starting-turn");
      const startTurn = (nextThreadId: string) =>
        codexRpcForProfile<{ turn: { id: string } }>(
          snapshot.profileKey,
          snapshot.accountId,
          "turn/start",
          {
            threadId: nextThreadId,
            input: buildCodexTurnInput(text, snapshot.contextFiles),
            additionalContext,
            cwd: snapshot.workspace.path,
            approvalPolicy: snapshot.access.approvalPolicy,
            approvalsReviewer: "user",
            permissions: snapshot.access.permissionProfile,
            model: snapshot.model,
            effort: snapshot.effort,
            collaborationMode,
            clientUserMessageId: runControl.clientUserMessageId,
          },
        );

      let turn: { turn: { id: string } };
      try {
        runControl.turnStartPending = true;
        turn = await startTurn(threadId);
      } catch (error) {
        runControl.turnStartPending = false;
        ensureRunControlActive(runControl);
        if (
          !isCodexThreadNotFoundError(error) ||
          snapshot.profileKey === DEFAULT_CODEX_PROFILE_KEY
        ) {
          throw error;
        }
        warnings.push(
          "Previous Codex thread was no longer available, so Orchestrator started a fresh thread for this chat.",
        );
        const thread = await startThread();
        threadId = thread.threadId;
        threadModel = thread.model;
        threadModelProvider = thread.modelProvider;
        updateRunControlView(runControl, (current) => ({
          ...current,
          tokenUsageStartTotal: 0,
          tokenUsageStartCachedInput: 0,
        }));
        await updateRun(runId, {
          codexThreadId: threadId,
          model: threadModel ?? snapshot.model,
          modelProvider: threadModelProvider ?? (snapshot.useOss ? "oss" : null),
          status: "running",
          collaborationMode: collaborationMode.mode,
          runIntent: runControl.intent,
        });
        ensureRunControlActive(runControl);
        await establishRunGoalStage(
          runControl,
          snapshot,
          threadId,
          warnings,
          true,
        );
        turn = await startTurn(threadId);
      }
      runControl.threadId = threadId;
      runControl.turnId = turn.turn.id;
      runControl.turnStartPending = false;
      const pendingKanbanStop = runControl.kanbanStopRequest;
      if (pendingKanbanStop) {
        const acknowledgement = await acknowledgeKanbanStopWithTurn(
          runControl,
          pendingKanbanStop,
          threadId,
          turn.turn.id,
          interruptTurnForProfile,
        );
        if (acknowledgement.acknowledged) {
          throw new RunStoppedError();
        }
      } else if (
        runControl.stopped ||
        activeRunRegistry.get(runControl.clientId) !== runControl
      ) {
        await interruptTurnForProfile(
          runControl.profileKey,
          runControl.accountId,
          threadId,
          turn.turn.id,
        ).catch((interruptError) => {
          console.error(
            "Could not interrupt a turn that started after cancellation",
            interruptError,
          );
        });
        throw new RunStoppedError();
      }
      ensureRunControlActive(runControl);
      appServices.runCoordinator.transition(runControl.clientId, "active");
      if (accountHandoff) {
        let activated = false;
        try {
          activated = await activateChatAccountHandoff({
            chatId,
            expectedProfileKey: accountHandoff.fromProfileKey,
            expectedThreadId: accountHandoff.fromThreadId,
            accountId: accountHandoff.targetAccountId,
            profileKey: accountHandoff.targetProfileKey,
            codexThreadId: threadId,
            status: "running",
          });
        } catch (error) {
          await codexRpcForProfile(
            snapshot.profileKey,
            snapshot.accountId,
            "turn/interrupt",
            { threadId, turnId: turn.turn.id },
          ).catch(() => undefined);
          throw error;
        }
        if (!activated) {
          await codexRpcForProfile(
            snapshot.profileKey,
            snapshot.accountId,
            "turn/interrupt",
            { threadId, turnId: turn.turn.id },
          ).catch(() => undefined);
          throw new Error(
            "The chat changed before the account handoff could be activated.",
          );
        }
        accountHandoffActivated = true;
        await updateChat(chatId, {
          collaborationMode: collaborationMode.mode,
          savedDefaultCollaborationModeJson:
            snapshot.mode === "plan"
              ? JSON.stringify(
                  snapshot.defaultCollaborationMode ??
                    collaborationModes.default,
                )
              : null,
        }).catch(() => {
          warnings.push(
            "The account handoff succeeded, but its collaboration-mode metadata could not be saved.",
          );
        });
        updateRememberedWorkspaceChatSession(
          snapshot.workspace.id,
          chatId,
          {
            chatId,
            threadId,
            origin: snapshot.chatOrigin,
            profileKey: snapshot.profileKey,
            externalThreadId: snapshot.externalThreadId,
            nextTurnIndex: snapshot.turnIndex + 1,
            savedDefaultCollaborationMode:
              snapshot.mode === "plan"
                ? snapshot.defaultCollaborationMode ?? collaborationModes.default
                : null,
          },
        );
        clearPendingAccountHandoff(chatId);
      }
      if (browserSession) {
        updateRunControlBrowserState(
          runControl,
          await updateBrowserSessionTarget(browserSession.token, {
            ...browserSession.state.target,
            chatId,
            runId,
            threadId,
            turnId: turn.turn.id,
          }),
        );
      }
      if (snapshot.queueItemId && runId !== null) {
        const acceptedQueueItem = await acceptPromptQueueItem({
          itemId: snapshot.queueItemId,
          runId,
          turnId: turn.turn.id,
        });
        if (!acceptedQueueItem) {
          await codexRpcForProfile(
            snapshot.profileKey,
            snapshot.accountId,
            "turn/interrupt",
            { threadId, turnId: turn.turn.id },
          ).catch(() => undefined);
          throw new Error(
            "The queued prompt changed before Codex accepted it.",
          );
        }
        upsertPromptQueueItemInMemory(acceptedQueueItem);
        await advanceChatConversationRevision(chatId, { queueOwned: true });
        await refreshPromptQueue(chatId);
      }

      updateRunControlView(runControl, (current) => ({
        ...current,
        status: "running",
        threadId,
        turnId: turn.turn.id,
      }));
      reconcileUnroutedApprovals();
      updateTaskChatEntry(runControl.clientId, (entry) => ({
        ...entry,
        imageAttachmentDelivery: entry.imageAttachmentDelivery
          ? { status: "sent", error: null }
          : undefined,
      }));
      await updateRun(runId, {
        codexTurnId: turn.turn.id,
        status: "running",
      });
      ensureRunControlActive(runControl);
      await updateTaskStatus(taskId, "running");
      ensureRunControlActive(runControl);
      await kanbanAttempts.persist(runControl, "running");
      ensureRunControlActive(runControl);
      void flushPendingRunBindingNotifications(runControl).catch((error) => {
        console.error("Could not replay buffered Codex notifications", error);
      });
      if (pendingChatTitleGeneration) {
        const titleRequest = pendingChatTitleGeneration;
        pendingChatTitleGeneration = null;
        startChatTitleGeneration(titleRequest);
      }
      await refreshWorkspaceData(snapshot.workspace.id);
      ensureRunControlActive(runControl);
      if (selectedWorkspaceRef.current?.id === snapshot.workspace.id) {
        void refreshSelectedWorkspaceHistory();
      }
      const runStartedMessage =
        snapshot.mode === "plan" ? "Plan mode turn started." : "Codex run started.";
      setStatusMessage(
        warnings.length > 0
          ? `${runStartedMessage} ${warnings.join(" ")}`
          : runStartedMessage,
      );
      preflightRef.current = null;
    } catch (error) {
      await rollbackRunSetupStage(runControl, snapshot, error, {
        chatId,
        taskId,
        runId,
        accountHandoff,
        accountHandoffActivated,
        pendingChatTitleGeneration,
      });
    }
  }

  function scheduleRunSetup(runControl: ActiveRunControl, snapshot: RunSetupSnapshot) {
    runControl.cancelScheduledSetup = scheduleAfterNextPaint(() => {
      runControl.cancelScheduledSetup = null;
      if (
        runControl.stopped ||
        activeRunRegistry.get(runControl.clientId) !== runControl
      ) {
        return;
      }
      runControl.setupStarted = true;
      markPerformance("orchestrator:submit:setup-start");
      void continueRunSetup(runControl, snapshot);
    });
  }

  async function capturePromptQueueContextFingerprint(input: {
    workspace: Workspace;
    chat: ChatRecord;
    executionSettings: RunExecutionSettings;
  }): Promise<PromptQueueContextFingerprint> {
    const inspection = await inspectPromptQueueContext(
      input.workspace.path,
      input.executionSettings.contextFiles.map((file) => file.path),
    );
    return {
      version: 2,
      workspacePath: inspection.workspacePath,
      repositories: inspection.repositories,
      profileKey:
        (input.chat.profile_key as CodexProfileKey | null) ??
        input.executionSettings.profileKey,
      threadId:
        input.chat.codex_thread_id ??
        (input.chat.origin === "codex_external"
          ? input.chat.external_thread_id
          : null),
      conversationRevision: Number(input.chat.conversation_revision ?? 0),
      files: inspection.files,
    };
  }

  function queueContextStaleReasons(
    item: PromptQueueItem,
    chat: ChatRecord,
    inspection: Awaited<ReturnType<typeof inspectPromptQueueContext>>,
  ) {
    const expected = item.snapshot.contextFingerprint;
    const reasons: string[] = [];
    if (inspection.workspacePath !== expected.workspacePath) {
      reasons.push("The workspace location changed.");
    }
    const expectedRepositories = new Map(
      expected.repositories.map((repository) => [
        repository.repositoryPath ?? "legacy",
        repository,
      ]),
    );
    const currentRepositories = new Map(
      inspection.repositories.map((repository) => [
        repository.repositoryPath ?? "legacy",
        repository,
      ]),
    );
    if (
      expectedRepositories.size !== currentRepositories.size ||
      [...expectedRepositories.keys()].some(
        (repositoryPath) => !currentRepositories.has(repositoryPath),
      )
    ) {
      reasons.push("The workspace Git repositories changed.");
    }
    expectedRepositories.forEach((expectedRepository, repositoryPath) => {
      const currentRepository = currentRepositories.get(repositoryPath);
      if (!currentRepository) return;
      if (expectedRepository.branch !== currentRepository.branch) {
        reasons.push("A repository branch changed.");
      }
      if (expectedRepository.headCommit !== currentRepository.headCommit) {
        reasons.push("A repository HEAD changed.");
      }
      if (
        expectedRepository.worktreeFingerprint !==
        currentRepository.worktreeFingerprint
      ) {
        reasons.push("Workspace files changed.");
      }
    });
    if (
      Number(chat.conversation_revision ?? 0) !==
      expected.conversationRevision
    ) {
      reasons.push("The conversation changed after this prompt was queued.");
    }
    const currentProfileKey =
      (chat.profile_key as CodexProfileKey | null) ??
      item.snapshot.executionSettings.profileKey;
    const currentThreadId =
      chat.codex_thread_id ??
      (chat.origin === "codex_external" ? chat.external_thread_id : null);
    if (
      expected.profileKey !== currentProfileKey ||
      expected.threadId !== currentThreadId
    ) {
      reasons.push("The conversation account or Codex thread changed.");
    }
    const currentFiles = new Map(
      inspection.files.map((file) => [file.path, file]),
    );
    for (const expectedFile of expected.files) {
      const currentFile = currentFiles.get(expectedFile.path);
      if (!currentFile?.available) {
        reasons.push(`Attachment is unavailable: ${expectedFile.path}`);
        continue;
      }
      if (
        expectedFile.canonicalPath !== currentFile.canonicalPath ||
        expectedFile.size !== currentFile.size ||
        expectedFile.modifiedAtMs !== currentFile.modifiedAtMs
      ) {
        reasons.push(`Attachment changed: ${expectedFile.path}`);
      }
    }
    return [...new Set(reasons)];
  }

  async function refreshQueuedPromptCurrentContext(
    item: PromptQueueItem,
    chat: ChatRecord,
    inspection: Awaited<ReturnType<typeof inspectPromptQueueContext>>,
  ) {
    const currentProfileKey =
      (chat.profile_key as CodexProfileKey | null) ??
      item.snapshot.executionSettings.profileKey;
    const currentThreadId =
      chat.codex_thread_id ??
      (chat.origin === "codex_external" ? chat.external_thread_id : null);
    const contextFingerprint = rebaselinePromptQueueContextFingerprint({
      expected: item.snapshot.contextFingerprint,
      inspection,
      executionProfileKey: item.snapshot.executionSettings.profileKey,
      currentProfileKey,
      currentThreadId,
      conversationRevision: Number(chat.conversation_revision ?? 0),
    });
    const originalSettings = item.snapshot.executionSettings;
    const executionSettings = createRunExecutionSettings({
      ...originalSettings,
      selectedRepositoryPath:
        originalSettings.selectedRepositoryPath ??
        (inspection.repositories.length === 1
          ? inspection.repositories[0].repositoryPath
          : null),
    });
    const updated = await updatePromptQueueItemContextFingerprint(
      item.id,
      createQueuedPromptSnapshot({
        prompt: item.prompt,
        executionSettings,
        contextFingerprint,
      }),
    );
    if (updated) upsertPromptQueueItemInMemory(updated);
    return updated;
  }

  async function rebaselineQueuedPromptContexts(chatId: number) {
    const [chat, items] = await Promise.all([
      getChatRecord(chatId),
      listPromptQueueItems(chatId),
    ]);
    if (!chat || items.length === 0) {
      setChatPromptQueue(chatId, items);
      return;
    }
    const pendingItems = items.filter((item) =>
      ["queued", "scheduled-next"].includes(item.status),
    );
    if (pendingItems.length === 0) {
      setChatPromptQueue(chatId, items);
      return;
    }
    const profileKey =
      (chat.profile_key as CodexProfileKey | null) ??
      pendingItems[0]?.snapshot.executionSettings.profileKey ??
      DEFAULT_CODEX_PROFILE_KEY;
    const threadId =
      chat.codex_thread_id ??
      (chat.origin === "codex_external" ? chat.external_thread_id : null);
    const conversationRevision = Number(chat.conversation_revision ?? 0);
    const workspace =
      workspacesRef.current.find(
        (candidate) => candidate.id === chat.workspace_id,
      ) ?? null;
    if (!workspace) {
      setChatPromptQueue(chatId, items);
      return;
    }
    const inspections = new Map<
      string,
      Promise<Awaited<ReturnType<typeof inspectPromptQueueContext>>>
    >();
    const inspectItemContext = (item: PromptQueueItem) => {
      const paths = item.snapshot.executionSettings.contextFiles.map(
        (file) => file.path,
      );
      const key = JSON.stringify(paths);
      const existing = inspections.get(key);
      if (existing) return existing;
      const inspection = inspectPromptQueueContext(workspace.path, paths);
      inspections.set(key, inspection);
      return inspection;
    };
    const updated = await Promise.all(
      pendingItems.map(async (item) => {
        const expected = item.snapshot.contextFingerprint;
        const inspection = await inspectItemContext(item);
        const contextFingerprint =
          rebaselinePromptQueueContextFingerprint({
            expected,
            inspection,
            executionProfileKey:
              item.snapshot.executionSettings.profileKey,
            currentProfileKey: profileKey,
            currentThreadId: threadId,
            conversationRevision,
          });
        return updatePromptQueueItemContextFingerprint(
          item.id,
          createQueuedPromptSnapshot({
            prompt: item.prompt,
            executionSettings: item.snapshot.executionSettings,
            contextFingerprint,
          }),
        );
      }),
    );
    const updatedById = new Map(
      updated
        .filter((item): item is PromptQueueItem => item !== null)
        .map((item) => [item.id, item]),
    );
    setChatPromptQueue(
      chatId,
      items.map((item) => updatedById.get(item.id) ?? item),
    );
  }

  async function chatBlocksPromptQueue(chatId: number) {
    const activeControl = [...activeRunRegistry.values()].find(
      (control) =>
        control.chatId === chatId && isActiveRunControl(control),
    );
    if (activeControl) return true;
    const conversationKey = subagentConversationKey({ chatId });
    if (
      conversationKey &&
      subagentStore.getConversation(conversationKey).some(
        (record) =>
          record.needsAttention || record.status === "needs-attention",
      )
    ) {
      return true;
    }

    return chatHasPendingPlanReview(chatId).catch(() => true);
  }

  function schedulePromptQueueDispatch(chatId: number, delayMs = 0) {
    if (promptQueueDispatchTimersRef.current.has(chatId)) return;
    const timer = window.setTimeout(() => {
      promptQueueDispatchTimersRef.current.delete(chatId);
      void dispatchPromptQueue(chatId);
    }, delayMs);
    promptQueueDispatchTimersRef.current.set(chatId, timer);
  }

  async function dispatchPromptQueue(chatId: number) {
    if (
      promptQueueClaimLocksRef.current.has(chatId) ||
      pausedPromptQueueChatIdsRef.current.has(chatId)
    ) {
      return;
    }
    promptQueueClaimLocksRef.current.add(chatId);
    try {
      if (await chatBlocksPromptQueue(chatId)) return;
      const items = await refreshPromptQueue(chatId);
      let item = items
        .filter(isPromptQueueItemPending)
        .filter(isPromptQueueItemAutoDispatchEligible)
        .sort(comparePromptQueueDispatchOrder)[0];
      if (!item) return;
      if (item.status === "failed") {
        setPromptQueuePaused(
          chatId,
          true,
          "failure",
        );
        setStatusMessage(
          "Retry, edit, skip, or remove the failed prompt before resuming the queue.",
        );
        return;
      }
      if (item.status === "stale") {
        const recovered = await retryPromptQueueItem(item.id, {
          autoSendEnabled: item.autoSendEnabled,
        });
        if (!recovered) return;
        item = recovered;
        upsertPromptQueueItemInMemory(recovered);
      }
      if (
        item.status !== "queued" &&
        item.status !== "scheduled-next"
      ) {
        return;
      }
      const [chat, workspace] = await Promise.all([
        getChatRecord(chatId),
        Promise.resolve(
          workspacesRef.current.find(
            (candidate) => candidate.id === item.workspaceId,
          ) ?? null,
        ),
      ]);
      if (!chat || !workspace) {
        const failed = await failPromptQueueItem(
          item.id,
          "The queued prompt's workspace or chat is no longer available.",
        );
        if (failed) upsertPromptQueueItemInMemory(failed);
        setPromptQueuePaused(chatId, true, "failure");
        return;
      }
      const inspection = await inspectPromptQueueContext(
        workspace.path,
        item.snapshot.executionSettings.contextFiles.map((file) => file.path),
      );
      const staleReasons = queueContextStaleReasons(item, chat, inspection);
      if (staleReasons.length > 0) {
        const refreshedItem = await refreshQueuedPromptCurrentContext(
          item,
          chat,
          inspection,
        );
        if (!refreshedItem) return;
        item = refreshedItem;
      }
      const claimed = await claimPromptQueueItem(item.id);
      if (!claimed) return;
      upsertPromptQueueItemInMemory(claimed);
      await launchQueuedPrompt(claimed, chat, workspace);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const currentItems = promptQueuesByChatRef.current[chatId] ?? [];
      const startingItem = currentItems.find(
        (item) => item.status === "starting",
      );
      if (startingItem) {
        const failed = await failPromptQueueItem(
          startingItem.id,
          message,
        ).catch(() => null);
        if (failed) upsertPromptQueueItemInMemory(failed);
      }
      setPromptQueuePaused(chatId, true, "failure");
      setStatusMessage(`Queued prompt could not start: ${message}`);
    } finally {
      promptQueueClaimLocksRef.current.delete(chatId);
    }
  }

  async function launchQueuedPrompt(
    item: PromptQueueItem,
    chat: ChatRecord,
    workspace: Workspace,
  ) {
    const settings = item.snapshot.executionSettings;
    const profileKey = settings.profileKey;
    const accountId = settings.accountId;
    const account =
      profileKey === DEFAULT_CODEX_PROFILE_KEY
        ? null
        : codexAccountsRef.current.find(
            (candidate) => candidate.id === accountId,
          ) ?? null;
    if (
      profileKey !== DEFAULT_CODEX_PROFILE_KEY &&
      (!account || account.status !== "signed_in")
    ) {
      throw new Error("The queued prompt's Codex account is unavailable.");
    }
    const availableModels = settings.useOss
      ? []
      : await listCodexModelsForProfile(profileKey, accountId);
    const selectedQueuedModel = settings.model
      ? availableModels.find(
          (model) =>
            model.model === settings.model || model.id === settings.model,
        ) ?? null
      : null;
    if (settings.model && !selectedQueuedModel) {
      throw new Error("The queued prompt's model is no longer available.");
    }
    if (
      settings.reasoningEffort &&
      selectedQueuedModel &&
      !selectedQueuedModel.supportedReasoningEfforts.some(
        (option) =>
          option.reasoningEffort === settings.reasoningEffort,
      )
    ) {
      throw new Error(
        "The queued prompt's reasoning level is no longer available.",
      );
    }
    let kanbanCard = await getKanbanCardForChat(chat.id);
    if (kanbanCard?.hasStartedTurn) {
      if (
        ["starting", "running", "waiting_user", "waiting_approval"].includes(
          kanbanCard.executionState,
        )
      ) {
        throw new Error("The card still has an active workflow.");
      }
      if (kanbanCard.stage === "done") {
        kanbanCard = await reopenKanbanCard(kanbanCard);
        refreshKanbanBoards();
      }
      const continuationKind = ["paused", "blocked", "interrupted"].includes(
        kanbanCard.executionState,
      )
        ? "resume"
        : ["failed", "stopped"].includes(kanbanCard.executionState)
          ? "retry"
          : "request_changes";
      await kanbanRuntime.launchCard(
        kanbanCard,
        continuationKind,
        item.prompt,
        {
          executionSettings: settings,
          queueItemId: item.id,
          clientUserMessageId: item.clientMessageId,
        },
      );
      return;
    }
    const currentProfileKey =
      (chat.profile_key as CodexProfileKey | null) ?? profileKey;
    const currentThreadId =
      chat.codex_thread_id ??
      (chat.origin === "codex_external" ? chat.external_thread_id : null);
    const accountHandoff: AccountHandoffRunStrategy | null =
      currentProfileKey !== profileKey
        ? {
            workspaceId: workspace.id,
            chatId: chat.id,
            fromProfileKey: currentProfileKey,
            fromThreadId: currentThreadId,
            targetAccountId: accountId,
            targetProfileKey: profileKey,
            adoptingExternalChat:
              chat.origin === "codex_external" &&
              currentProfileKey === DEFAULT_CODEX_PROFILE_KEY,
          }
        : null;
    const mode = settings.mode;
    const intent = settings.intent;
    const turnIndex = await getNextChatTurnIndex(chat.id);
    const snapshot: RunSetupSnapshot = {
      promptText: item.prompt,
      promptFallback: item.prompt,
      workspace: { ...workspace },
      accountId,
      account: account ? { ...account } : null,
      profileKey,
      chatOrigin: chat.origin,
      externalThreadId: chat.external_thread_id,
      selectedRepositoryPath: settings.selectedRepositoryPath,
      selectedBranch: settings.selectedBranch,
      cachedPreflight: null,
      mode,
      intent,
      clientUserMessageId: item.clientMessageId,
      access: accessSettings({ accessMode: settings.accessMode }),
      computerUseEnabled: settings.computerUseEnabled,
      model: settings.model,
      effort: settings.reasoningEffort,
      useOss: settings.useOss,
      ossProvider: settings.ossProvider,
      improvedPrompt: improvePrompt(item.prompt),
      contextFiles: settings.contextFiles.map((file) => ({ ...file })),
      selectedSkills: settings.selectedSkills.map((skill) => ({ ...skill })),
      goalMode: settings.goalMode,
      loginState: "idle",
      chatId: chat.id,
      threadId: accountHandoff ? null : currentThreadId,
      turnIndex,
      threadStrategy: accountHandoff
        ? { kind: "handoff", handoff: accountHandoff }
        : currentThreadId
          ? { kind: "resume" }
          : { kind: "fresh" },
      handoffContextBudgetTokens: Math.max(
        1,
        Math.floor(
          (getCodexModelContextWindow(selectedQueuedModel) ??
            DEFAULT_CONTEXT_WINDOW) * 0.25,
        ),
      ),
      executionSettings: settings,
      restorePromptOnSetupFailure: false,
      queueItemId: item.id,
      fromQueue: true,
    };
    const runControl = beginOptimisticRun(snapshot);
    scheduleRunSetup(runControl, snapshot);
  }

  const kanbanRuntime = useKanbanRuntimeController<ActiveRunControl>({
    getState: () => ({
      workspaces: workspacesRef.current,
      accounts: codexAccountsRef.current,
      selectedAccountId: selectedAccountIdRef.current,
      computerUseEnabled,
      ossProvider,
    }),
    listModels: listCodexModelsForProfile,
    loadChat: getChatRecord,
    updateChat,
    getNextTurnIndex: getNextChatTurnIndex,
    findRunControl: findRunControlByChat,
    beginRun: beginOptimisticRun,
    scheduleRun: scheduleRunSetup,
    stopRun: stopActiveRun,
    attempts: kanbanAttempts,
    refreshBoards: refreshKanbanBoards,
  });

  function queuedPromptCanSteerActiveTurn(
    item: PromptQueueItem,
    control: ActiveRunControl,
  ) {
    const queued = item.snapshot.executionSettings;
    const active = control.executionSettings;
    const imagesOnly = queued.contextFiles.every(isImageContextFile);
    const selectedSession =
      workspaceChatSessionsRef.current[item.workspaceId] ?? null;
    return (
      control.chatId === item.chatId &&
      control.threadId !== null &&
      control.turnId !== null &&
      control.runId !== null &&
      control.interactionMode === "chat" &&
      control.intent === "normal" &&
      control.goal === null &&
      control.runView.nativePlan.reviewState === "none" &&
      control.runView.approvalRequests.length === 0 &&
      control.runView.serverRequests.length === 0 &&
      !pendingAccountHandoffsRef.current[item.chatId] &&
      queued.mode === "run" &&
      queued.intent === "normal" &&
      !queued.goalMode &&
      queued.profileKey === control.profileKey &&
      queued.accountId === control.accountId &&
      queued.selectedRepositoryPath === active.selectedRepositoryPath &&
      queued.selectedBranch === active.selectedBranch &&
      queued.model === active.model &&
      queued.reasoningEffort === active.reasoningEffort &&
      queued.accessMode === active.accessMode &&
      queued.computerUseEnabled === active.computerUseEnabled &&
      queued.useOss === active.useOss &&
      queued.ossProvider === active.ossProvider &&
      selectedSession?.threadId === control.threadId &&
      imagesOnly
    );
  }

  async function steerQueuedPrompt(
    item: PromptQueueItem,
    control: ActiveRunControl,
  ) {
    if (
      !queuedPromptCanSteerActiveTurn(item, control) ||
      !control.threadId ||
      !control.turnId ||
      control.runId === null
    ) {
      return false;
    }
    const workspace = workspacesRef.current.find(
      (candidate) => candidate.id === item.workspaceId,
    );
    const chat = await getChatRecord(item.chatId);
    if (!workspace || !chat) return false;
    const inspection = await inspectPromptQueueContext(
      workspace.path,
      item.snapshot.executionSettings.contextFiles.map((file) => file.path),
    );
    const staleReasons = queueContextStaleReasons(item, chat, inspection);
    if (staleReasons.length > 0) {
      const refreshedItem = await refreshQueuedPromptCurrentContext(
        item,
        chat,
        inspection,
      );
      if (!refreshedItem) {
        throw new Error(
          "The queued prompt changed before its current context could be applied.",
        );
      }
    }
    const steeringItem = await markPromptQueueItemSteering(item.id);
    if (!steeringItem) return true;
    upsertPromptQueueItemInMemory(steeringItem);
    try {
      const preparedFiles = await prepareContextImageFiles(
        item.snapshot.executionSettings.contextFiles,
        imageAttachments,
      );
      const text = applySelectedSkillsToPrompt(
        item.prompt,
        item.snapshot.executionSettings.selectedSkills,
      );
      await codexRpcForProfile(
        control.profileKey,
        control.accountId,
        "turn/steer",
        {
          threadId: control.threadId,
          expectedTurnId: control.turnId,
          clientUserMessageId: item.clientMessageId,
          input: buildCodexTurnInput(text, preparedFiles),
        },
      );
      await persistRunEvent(control, "client-action", "turn/steer", {
        queueItemId: item.id,
        clientUserMessageId: item.clientMessageId,
        prompt: item.prompt,
      });
      updateTaskChatEntry(control.clientId, (entry) => ({
        ...entry,
        steeredPrompts: [
          ...(entry.steeredPrompts ?? []),
          {
            id: item.id,
            prompt: item.prompt,
            submittedAt: new Date().toISOString(),
          },
        ],
      }));
      await completePromptQueueItem(item.id);
      removePromptQueueItemFromMemory(item.chatId, item.id);
      setStatusMessage("Queued prompt was sent to the active turn.");
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/turn.+(complete|not active|not found|mismatch)/i.test(message)) {
        const scheduled =
          await reschedulePromptQueueItemAfterSteeringRace(item.id);
        if (scheduled) {
          upsertPromptQueueItemInMemory(scheduled);
        }
        schedulePromptQueueDispatch(item.chatId);
        setStatusMessage(
          "The active turn finished first, so the prompt is scheduled next.",
        );
        return true;
      }
      const failed = await failPromptQueueItem(item.id, message);
      if (failed) upsertPromptQueueItemInMemory(failed);
      setPromptQueuePaused(item.chatId, true, "failure");
      setStatusMessage(`Could not send queued prompt: ${message}`);
      return true;
    }
  }

  async function launchRun(composerPrompt = promptRef.current) {
    markPerformance("orchestrator:submit:start");
    setApprovalSafetyWarning(null);
    setEditedPromptNotice(null);

    const workspace = selectedWorkspaceRef.current;
    if (!workspace) {
      setStatusMessage("Select a workspace before adding a prompt.");
      return;
    }
    const promptText = serializePromptInlineFileReferences(
      composerPrompt.trim(),
      contextFilesRef.current.filter((file) => file.source === "search"),
    );
    let session = workspaceChatSessionsRef.current[workspace.id] ?? null;
    const pendingHandoff = session
      ? pendingAccountHandoffsRef.current[session.chatId] ?? null
      : null;
    const profileKey: CodexProfileKey =
      pendingHandoff?.targetProfileKey ??
      session?.profileKey ??
      (`account:${selectedAccountIdRef.current}` as CodexProfileKey);
    const accountId =
      profileKey === DEFAULT_CODEX_PROFILE_KEY
        ? 0
        : accountIdFromProfileKey(profileKey);
    const account =
      accountId && accountId !== 0
        ? codexAccountsRef.current.find(
            (candidate) => candidate.id === accountId,
          ) ?? null
        : null;
    if (!promptText) {
      if (session) schedulePromptQueueDispatch(session.chatId);
      return;
    }
    if (
      profileKey !== DEFAULT_CODEX_PROFILE_KEY &&
      (!accountId || !account || account.status !== "signed_in")
    ) {
      setStatusMessage("Sign in to a Codex account before queuing a prompt.");
      return;
    }
    const selectedQueuedModel =
      modelsRef.current.find((model) => model.id === selectedModelId) ??
      modelsRef.current[0] ??
      null;
    const mode = planMode ? "plan" : "run";
    const intent: RunIntent = planMode ? "plan" : "normal";
    const executionSettings = createRunExecutionSettings({
      accountId: accountId ?? 0,
      profileKey,
      selectedRepositoryPath:
        selectedGitRepository?.repository.rootPath ?? null,
      selectedBranch,
      mode,
      intent,
      accessMode,
      computerUseEnabled,
      model:
        useOss || modelLoadErrorRef.current
          ? null
          : selectedQueuedModel?.model ?? null,
      reasoningEffort:
        useOss || modelLoadErrorRef.current
          ? null
          : selectedReasoningEffort,
      useOss,
      ossProvider,
      contextFiles: contextFilesRef.current,
      selectedSkills: selectedSkillsRef.current,
      goalMode,
    });
    const currentQueueSize = session
      ? (promptQueuesByChatRef.current[session.chatId] ?? []).filter(
          isPromptQueueItemPending,
        ).length
      : 0;
    const validationError = validatePromptQueueDraft({
      prompt: promptText,
      attachmentCount: executionSettings.contextFiles.length,
      currentQueueSize,
    });
    if (validationError) {
      setStatusMessage(validationError);
      return;
    }
    const submissionKey = `${promptText}\u0000${JSON.stringify(
      executionSettings,
    )}`;
    const pendingSubmissionKeys =
      promptQueuePendingSubmissionKeysRef.current.get(workspace.id) ??
      new Set<string>();
    if (pendingSubmissionKeys.has(submissionKey)) {
      return;
    }
    pendingSubmissionKeys.add(submissionKey);
    promptQueuePendingSubmissionKeysRef.current.set(
      workspace.id,
      pendingSubmissionKeys,
    );
    const previousEnqueue =
      promptQueueEnqueueOperationsRef.current.get(workspace.id) ??
      Promise.resolve();
    let releaseEnqueue!: () => void;
    const enqueueGate = new Promise<void>((resolve) => {
      releaseEnqueue = resolve;
    });
    const serializedEnqueue = previousEnqueue
      .catch(() => undefined)
      .then(() => enqueueGate);
    promptQueueEnqueueOperationsRef.current.set(
      workspace.id,
      serializedEnqueue,
    );
    await previousEnqueue.catch(() => undefined);
    session = workspaceChatSessionsRef.current[workspace.id] ?? null;

    let createdChat: ChatRecord | null = null;
    try {
      let queuedItem: PromptQueueItem | null = null;
      if (!session) {
        const initialTitlePrompt = restorePromptInlineFileReferencesForComposer(
          promptText,
          executionSettings.contextFiles.filter(
            (file) => file.source === "search",
          ),
        );
        const fallbackTitle = fallbackChatTitle(initialTitlePrompt);
        const inspection = await inspectPromptQueueContext(
          workspace.path,
          executionSettings.contextFiles.map((file) => file.path),
        );
        const contextFingerprint: PromptQueueContextFingerprint = {
          version: 2,
          workspacePath: inspection.workspacePath,
          repositories: inspection.repositories,
          profileKey,
          threadId: null,
          conversationRevision: 0,
          files: inspection.files,
        };
        const snapshot = createQueuedPromptSnapshot({
          prompt: promptText,
          executionSettings,
          contextFingerprint,
        });
        const queuedConversation = await createChatWithQueuedPrompt({
          workspaceId: workspace.id,
          accountId:
            profileKey === DEFAULT_CODEX_PROFILE_KEY ? null : accountId,
          title: fallbackTitle,
          status: "queued",
          generateTitle: true,
          itemId: createPromptQueueItemId(),
          clientMessageId: createStableClientMessageId(),
          prompt: promptText,
          snapshot,
        });
        createdChat = queuedConversation.chat;
        queuedItem = queuedConversation.item;
        session = {
          chatId: createdChat.id,
          threadId: null,
          origin: "orchestrator",
          profileKey,
          externalThreadId: null,
          nextTurnIndex: 1,
        };
        setWorkspaceChatSession(workspace.id, session);
        rememberWorkspaceTaskSelection(
          workspace.id,
          { kind: "chat", session },
          null,
        );
        setSelectedDraftChat(null);
        setSelectedHistoryChatId(createdChat.id);
      } else {
        const chat = await getChatRecord(session.chatId);
        if (!chat) {
          throw new Error("The conversation could not be prepared.");
        }
        const contextFingerprint =
          await capturePromptQueueContextFingerprint({
            workspace,
            chat,
            executionSettings,
          });
        const snapshot = createQueuedPromptSnapshot({
          prompt: promptText,
          executionSettings,
          contextFingerprint,
        });
        queuedItem = await enqueuePromptQueueItem({
          id: createPromptQueueItemId(),
          clientMessageId: createStableClientMessageId(),
          workspaceId: workspace.id,
          chatId: session.chatId,
          prompt: promptText,
          snapshot,
        });
      }
      if (!queuedItem) {
        throw new Error("The prompt was not added to the queue.");
      }
      taskChatTranscriptRef.current?.stabilizeForSubmission();
      const submittedWorkspacePrompt =
        selectedWorkspaceRef.current?.id === workspace.id
          ? promptRef.current
          : workspaceTaskMemories.records[workspace.id]?.prompt ??
            composerPrompt;
      const composerStillMatchesSubmission =
        submittedWorkspacePrompt.trim() === composerPrompt.trim();
      flushSync(() => {
        upsertPromptQueueItemInMemory(queuedItem);
        if (composerStillMatchesSubmission) {
          updateRememberedWorkspaceComposer(workspace.id, { prompt: "" });
          removeSubmittedImagesFromWorkspaceComposer(
            workspace.id,
            executionSettings.contextFiles,
          );
        }
        if (executionSettings.mode === "plan" && planMode) setPlanMode(false);
      });
      taskChatTranscriptRef.current?.settleAfterSubmission();
      if (createdChat) {
        const initialPrompt = restorePromptInlineFileReferencesForComposer(
          promptText,
          executionSettings.contextFiles.filter(
            (file) => file.source === "search",
          ),
        );
        const fallbackTitle = fallbackChatTitle(initialPrompt);
        startChatTitleGeneration({
          chatId: createdChat.id,
          workspacePath: workspace.path,
          accountId: accountId ?? 0,
          model: executionSettings.model,
          initialPrompt,
          fallbackTitle,
        });
      }
      setStatusMessage(
        runIsActive
          ? "Prompt added to this chat's queue."
          : "Prompt queued.",
      );
      schedulePromptQueueDispatch(session.chatId);
    } catch (error) {
      setStatusMessage(
        `Could not queue prompt: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    } finally {
      pendingSubmissionKeys.delete(submissionKey);
      if (pendingSubmissionKeys.size === 0) {
        promptQueuePendingSubmissionKeysRef.current.delete(workspace.id);
      }
      releaseEnqueue();
      void serializedEnqueue.finally(() => {
        if (
          promptQueueEnqueueOperationsRef.current.get(workspace.id) ===
          serializedEnqueue
        ) {
          promptQueueEnqueueOperationsRef.current.delete(workspace.id);
        }
      });
    }
  }

  async function createCardFromKanbanPrompt(
    composerPrompt = promptRef.current,
  ) {
    if (kanbanCardCreatePendingRef.current) return;
    const workspace = selectedWorkspaceRef.current;
    const repository = selectedGitRepository;
    const promptText = serializePromptInlineFileReferences(
      composerPrompt.trim(),
      contextFilesRef.current.filter((file) => file.source === "search"),
    );
    if (!workspace || !promptText) return;
    if (!repository) {
      setStatusMessage(
        "Select a Git repository before creating a Kanban card.",
      );
      return;
    }

    const session = workspaceChatSessionsRef.current[workspace.id] ?? null;
    const pendingHandoff = session
      ? pendingAccountHandoffsRef.current[session.chatId] ?? null
      : null;
    const profileKey: CodexProfileKey =
      pendingHandoff?.targetProfileKey ??
      session?.profileKey ??
      (`account:${selectedAccountIdRef.current}` as CodexProfileKey);
    const accountId =
      profileKey === DEFAULT_CODEX_PROFILE_KEY
        ? 0
        : accountIdFromProfileKey(profileKey);
    const account =
      accountId && accountId !== 0
        ? codexAccountsRef.current.find((candidate) => candidate.id === accountId) ??
          null
        : null;
    if (
      profileKey !== DEFAULT_CODEX_PROFILE_KEY &&
      (!accountId || !account || account.status !== "signed_in")
    ) {
      setStatusMessage("Sign in to a Codex account before creating a card.");
      return;
    }

    const selectedCardModel =
      modelsRef.current.find((model) => model.id === selectedModelId) ??
      modelsRef.current[0] ??
      null;
    const mode = planMode ? "plan" : "run";
    const executionSettings = createRunExecutionSettings({
      accountId: accountId ?? 0,
      profileKey,
      selectedRepositoryPath: repository.repository.rootPath,
      selectedBranch,
      mode,
      intent: planMode ? "plan" : "normal",
      accessMode,
      computerUseEnabled,
      model:
        useOss || modelLoadErrorRef.current
          ? null
          : selectedCardModel?.model ?? null,
      reasoningEffort:
        useOss || modelLoadErrorRef.current
          ? null
          : selectedReasoningEffort,
      useOss,
      ossProvider,
      contextFiles: contextFilesRef.current,
      selectedSkills: selectedSkillsRef.current,
      goalMode,
    });
    const initialPrompt = restorePromptInlineFileReferencesForComposer(
      promptText,
      executionSettings.contextFiles.filter((file) => file.source === "search"),
    );
    const fallbackTitle = fallbackChatTitle(initialPrompt);

    kanbanCardCreatePendingRef.current = true;
    setKanbanCardCreatePending(true);
    try {
      const card = await createKanbanCard(workspace.id, {
        title: GENERATING_CHAT_TITLE,
        description: promptText,
        accountId:
          profileKey === DEFAULT_CODEX_PROFILE_KEY ? null : accountId ?? null,
        accessMode,
        model: executionSettings.model,
        reasoningLevel: executionSettings.reasoningEffort,
        repositoryScope: "selected",
        repositories: [
          {
            repositoryPath: repository.repository.rootPath,
            relativePath: repository.repository.relativePath,
            label: repository.repository.label,
            includeDirtyChanges: false,
          },
        ],
        executionSettingsJson: serializeRunExecutionSettings(executionSettings),
        generateTitle: true,
        titleFallback: fallbackTitle,
      });

      const composerStillMatchesSubmission =
        selectedWorkspaceRef.current?.id === workspace.id &&
        promptRef.current.trim() === composerPrompt.trim();
      flushSync(() => {
        if (composerStillMatchesSubmission) {
          updateRememberedWorkspaceComposer(workspace.id, { prompt: "" });
          removeSubmittedImagesFromWorkspaceComposer(
            workspace.id,
            executionSettings.contextFiles,
          );
        }
        if (executionSettings.mode === "plan" && planMode) setPlanMode(false);
        setKanbanRefreshToken((current) => current + 1);
      });
      startChatTitleGeneration({
        chatId: card.chatId,
        workspacePath: workspace.path,
        accountId: accountId ?? 0,
        model: executionSettings.model,
        initialPrompt,
        fallbackTitle,
        onSettled: () => setKanbanRefreshToken((current) => current + 1),
      });
      setStatusMessage("Card added to To do.");
    } catch (error) {
      setStatusMessage(
        `Could not create card: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    } finally {
      kanbanCardCreatePendingRef.current = false;
      setKanbanCardCreatePending(false);
    }
  }

  function restorePromptQueueComposer(edit: PromptQueueComposerEditState) {
    updateRememberedWorkspaceComposer(edit.item.workspaceId, {
      prompt: edit.previousComposer.prompt,
      contextFiles: edit.previousComposer.contextFiles,
      selectedSkills: edit.previousComposer.selectedSkills,
    });
    setSelectedModelId(edit.previousComposer.selectedModelId);
    setSelectedReasoningEffort(
      edit.previousComposer.selectedReasoningEffort,
    );
    setGoalMode(edit.previousComposer.goalMode);
    setPlanMode(edit.previousComposer.planMode);
  }

  function setPromptQueueComposerEditState(
    next: PromptQueueComposerEditState | null,
  ) {
    promptQueueComposerEditRef.current = next;
    setPromptQueueComposerEdit(next);
  }

  function focusPromptQueueComposer(selectAll = false) {
    window.requestAnimationFrame(() => {
      const textarea = taskComposerPromptRef.current;
      textarea?.focus({ preventScroll: true });
      if (selectAll && textarea) {
        textarea.setSelectionRange(0, textarea.value.length);
      }
    });
  }

  function openPromptQueueComposerEdit(item: PromptQueueItem) {
    if (!isPromptQueueItemMutable(item)) return;
    const selectedSession =
      workspaceChatSessionsRef.current[item.workspaceId] ?? null;
    if (
      selectedWorkspaceRef.current?.id !== item.workspaceId ||
      selectedSession?.chatId !== item.chatId
    ) {
      setStatusMessage(
        "Open this queued prompt's conversation before editing it.",
      );
      return;
    }

    const settings = item.snapshot.executionSettings;
    const queuedModel = settings.model
      ? modelsRef.current.find(
          (model) =>
            model.id === settings.model || model.model === settings.model,
        ) ?? null
      : null;
    if (!settings.useOss && settings.model && !queuedModel) {
      setStatusMessage(
        `The queued prompt's model ${settings.model} is no longer available.`,
      );
      return;
    }
    const existingEdit = promptQueueComposerEditRef.current;
    if (existingEdit?.status === "saving") return;
    if (existingEdit) restorePromptQueueComposer(existingEdit);

    const nextEdit: PromptQueueComposerEditState = {
      item,
      previousComposer: {
        prompt: existingEdit
          ? existingEdit.previousComposer.prompt
          : promptRef.current,
        contextFiles: (
          existingEdit
            ? existingEdit.previousComposer.contextFiles
            : contextFilesRef.current
        ).map((file) => ({ ...file })),
        selectedSkills: (
          existingEdit
            ? existingEdit.previousComposer.selectedSkills
            : selectedSkillsRef.current
        ).map((skill) => ({ ...skill })),
        selectedModelId: existingEdit
          ? existingEdit.previousComposer.selectedModelId
          : selectedModelId,
        selectedReasoningEffort: existingEdit
          ? existingEdit.previousComposer.selectedReasoningEffort
          : selectedReasoningEffort,
        goalMode: existingEdit
          ? existingEdit.previousComposer.goalMode
          : goalMode,
        planMode: existingEdit
          ? existingEdit.previousComposer.planMode
          : planMode,
      },
      status: "editing",
      error: null,
    };
    setPromptQueueComposerEditState(nextEdit);
    updateRememberedWorkspaceComposer(item.workspaceId, {
      prompt: restorePromptInlineFileReferencesForComposer(
        item.prompt,
        settings.contextFiles.filter((file) => file.source === "search"),
      ),
      contextFiles: settings.contextFiles,
      selectedSkills: settings.selectedSkills,
    });
    if (!settings.useOss) {
      setSelectedModelId(queuedModel?.id ?? null);
      setSelectedReasoningEffort(settings.reasoningEffort);
    }
    const queuedPlanMode = settings.mode === "plan";
    setGoalMode(!queuedPlanMode && settings.goalMode);
    setPlanMode(queuedPlanMode);
    focusPromptQueueComposer(true);
  }

  function cancelPromptQueueComposerEdit() {
    const edit = promptQueueComposerEditRef.current;
    if (!edit || edit.status === "saving") return;
    setPromptQueueComposerEditState(null);
    restorePromptQueueComposer(edit);
    focusPromptQueueComposer();
    setStatusMessage("Queued prompt edit cancelled.");
  }

  async function savePromptQueueComposerEdit(nextPrompt: string) {
    const editor = promptQueueComposerEditRef.current;
    if (!editor || editor.status !== "editing") return;
    setPromptQueueComposerEditState({
      ...editor,
      status: "saving",
      error: null,
    });
    let currentItem: PromptQueueItem | null;
    try {
      currentItem = await readPromptQueueItem(editor.item.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setPromptQueueComposerEditState({
        ...editor,
        status: "editing",
        error: message,
      });
      setStatusMessage(`Could not load queued prompt: ${message}`);
      return;
    }
    if (!currentItem || !isPromptQueueItemMutable(currentItem)) {
      const message = "This queued prompt has already started.";
      setPromptQueueComposerEditState({
        ...editor,
        status: "editing",
        error: message,
      });
      setStatusMessage(message);
      return;
    }
    const serializedPrompt = serializePromptInlineFileReferences(
      nextPrompt.trim(),
      contextFilesRef.current.filter((file) => file.source === "search"),
    );
    const queueSize = (
      promptQueuesByChatRef.current[editor.item.chatId] ?? []
    ).filter(
      (item) => item.id !== editor.item.id && isPromptQueueItemPending(item),
    ).length;
    const validationError = validatePromptQueueDraft({
      prompt: serializedPrompt,
      attachmentCount: contextFilesRef.current.length,
      currentQueueSize: queueSize,
    });
    if (validationError) {
      setPromptQueueComposerEditState({
        ...editor,
        status: "editing",
        error: validationError,
      });
      setStatusMessage(validationError);
      return;
    }
    try {
      const [chat, workspace] = await Promise.all([
        getChatRecord(editor.item.chatId),
        Promise.resolve(
          workspacesRef.current.find(
            (candidate) => candidate.id === editor.item.workspaceId,
          ) ?? null,
        ),
      ]);
      if (!chat || !workspace) {
        throw new Error("The queued prompt's chat is no longer available.");
      }
      const originalSettings = currentItem.snapshot.executionSettings;
      const selectedEditedModel = originalSettings.useOss
        ? null
        : modelsRef.current.find(
            (model) => model.id === selectedModelId,
          ) ?? null;
      if (!originalSettings.useOss && !selectedEditedModel) {
        throw new Error("Select an available model for the queued prompt.");
      }
      if (
        selectedReasoningEffort &&
        selectedEditedModel &&
        !selectedEditedModel.supportedReasoningEfforts.some(
          (option) =>
            option.reasoningEffort === selectedReasoningEffort,
        )
      ) {
        throw new Error(
          "Select an available reasoning level for the queued prompt.",
        );
      }
      const editedPlanMode = planMode;
      const editedGoalMode = !editedPlanMode && goalMode;
      const executionSettings = createRunExecutionSettings({
        accountId: originalSettings.accountId,
        profileKey: originalSettings.profileKey,
        selectedRepositoryPath: originalSettings.selectedRepositoryPath,
        selectedBranch: originalSettings.selectedBranch,
        mode: editedPlanMode ? "plan" : "run",
        intent: editedPlanMode ? "plan" : "normal",
        accessMode: originalSettings.accessMode,
        computerUseEnabled: originalSettings.computerUseEnabled,
        model: originalSettings.useOss
          ? originalSettings.model
          : selectedEditedModel?.model ?? null,
        reasoningEffort: originalSettings.useOss
          ? originalSettings.reasoningEffort
          : selectedReasoningEffort,
        useOss: originalSettings.useOss,
        ossProvider: originalSettings.ossProvider,
        contextFiles: contextFilesRef.current,
        selectedSkills: selectedSkillsRef.current,
        goalMode: editedGoalMode,
      });
      const contextFingerprint =
        await capturePromptQueueContextFingerprint({
          workspace,
          chat,
          executionSettings,
        });
      const snapshot = createQueuedPromptSnapshot({
        prompt: serializedPrompt,
        executionSettings,
        contextFingerprint,
      });
      const updated = await updatePromptQueueItemSnapshot(
        editor.item.id,
        snapshot,
      );
      if (!updated) {
        throw new Error("This queued prompt changed before it could be saved.");
      }
      upsertPromptQueueItemInMemory(updated);
      setPromptQueueComposerEditState(null);
      restorePromptQueueComposer(editor);
      focusPromptQueueComposer();
      setStatusMessage("Queued prompt updated.");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setPromptQueueComposerEditState({
        ...editor,
        status: "editing",
        error: message,
      });
      setStatusMessage(`Could not update queued prompt: ${message}`);
    }
  }

  async function removeQueuedPrompt(item: PromptQueueItem) {
    if (!isPromptQueueItemMutable(item)) return;
    setPromptQueueActionPendingItemId(item.id);
    try {
      if (!(await removePromptQueueItem(item.id))) {
        throw new Error("The prompt has already started.");
      }
      removePromptQueueItemFromMemory(item.chatId, item.id);
      setStatusMessage("Queued prompt removed.");
    } catch (error) {
      setStatusMessage(
        `Could not remove queued prompt: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    } finally {
      setPromptQueueActionPendingItemId(null);
    }
  }

  async function retryQueuedPrompt(item: PromptQueueItem) {
    setPromptQueueActionPendingItemId(item.id);
    try {
      const retried = await retryPromptQueueItem(item.id);
      if (!retried) throw new Error("The prompt is no longer retryable.");
      upsertPromptQueueItemInMemory(retried);
      setPromptQueuePaused(item.chatId, false);
      setStatusMessage("Queued prompt ready to retry.");
      schedulePromptQueueDispatch(item.chatId);
    } catch (error) {
      setStatusMessage(
        `Could not retry queued prompt: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    } finally {
      setPromptQueueActionPendingItemId(null);
    }
  }

  async function changeQueuedPromptAutoSend(
    item: PromptQueueItem,
    enabled: boolean,
  ) {
    const actionKey = `auto-send:${item.id}`;
    if (promptQueueActionLocksRef.current.has(actionKey)) return;
    promptQueueActionLocksRef.current.add(actionKey);
    setPromptQueueActionPendingItemId(item.id);
    try {
      const updated = await setPromptQueueItemAutoSend(item.id, enabled);
      if (!updated) {
        throw new Error(
          enabled
            ? "The prompt can no longer be restored."
            : "The prompt can no longer be held.",
        );
      }
      upsertPromptQueueItemInMemory(updated);

      const pauseReason = promptQueuePauseReasonsRef.current.get(item.chatId);
      if (
        enabled ||
        (!enabled && (pauseReason === "failure" || pauseReason === "stale"))
      ) {
        setPromptQueuePaused(item.chatId, false);
      }
      if (!pausedPromptQueueChatIdsRef.current.has(item.chatId)) {
        schedulePromptQueueDispatch(item.chatId);
      }
      setStatusMessage(
        enabled
          ? "Automatic sending restored for the queued prompt."
          : "Queued prompt held from automatic sending.",
      );
    } catch (error) {
      setStatusMessage(
        `Could not ${enabled ? "restore" : "hold"} queued prompt: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    } finally {
      promptQueueActionLocksRef.current.delete(actionKey);
      setPromptQueueActionPendingItemId(null);
    }
  }

  async function sendQueuedPromptNow(item: PromptQueueItem) {
    if (promptQueueActionPendingItemId === item.id) return;
    setPromptQueueActionPendingItemId(item.id);
    try {
      let prioritized = item;
      if (item.status === "failed" || item.status === "stale") {
        const retried = await retryPromptQueueItem(item.id, {
          autoSendEnabled: item.autoSendEnabled,
        });
        if (!retried) throw new Error("The prompt is no longer retryable.");
        prioritized = retried;
      }
      const next = await prioritizePromptQueueItem(prioritized.id);
      if (!next) throw new Error("The prompt could not be prioritized.");
      upsertPromptQueueItemInMemory(next);
      const activeControl = [...activeRunRegistry.values()].find(
        (control) =>
          control.chatId === item.chatId && isActiveRunControl(control),
      );
      if (activeControl && (await steerQueuedPrompt(next, activeControl))) {
        return;
      }
      setPromptQueuePaused(item.chatId, false);
      schedulePromptQueueDispatch(item.chatId);
      setStatusMessage(
        activeControl
          ? "Queued prompt scheduled to run next."
          : "Queued prompt moved to the front.",
      );
    } catch (error) {
      setStatusMessage(
        `Could not prioritize queued prompt: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    } finally {
      setPromptQueueActionPendingItemId(null);
    }
  }

  async function reorderSelectedPromptQueue(orderedItemIds: string[]) {
    const chatId = selectedWorkspaceChatSession?.chatId;
    if (!chatId) return;
    const current = promptQueuesByChatRef.current[chatId] ?? [];
    const currentById = new Map(current.map((item) => [item.id, item]));
    const ordered = orderedItemIds
      .map((id) => currentById.get(id))
      .filter((item): item is PromptQueueItem => Boolean(item));
    const optimistic = ordered.map((item, index) => ({
      ...item,
      position: index,
    }));
    setChatPromptQueue(chatId, optimistic);
    try {
      if (!(await reorderPromptQueueItems(chatId, orderedItemIds))) {
        throw new Error("The queue changed while it was being reordered.");
      }
      await refreshPromptQueue(chatId);
    } catch (error) {
      await refreshPromptQueue(chatId).catch(() => undefined);
      setStatusMessage(
        `Could not reorder queue: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  async function handleEditLatestPrompt(
    entry: TaskChatEntry,
    nextPrompt: string,
  ) {
    markPerformance("orchestrator:submit:start");
    setEditedPromptNotice(null);

    const resolvedExecutionSettings = entry.executionSettings;
    const originalSettings = resolvedExecutionSettings?.settings;
    const originalContextFiles =
      originalSettings?.contextFiles ?? entry.contextFiles ?? [];
    const promptText = serializePromptInlineFileReferences(
      nextPrompt.trim(),
      originalContextFiles.filter((file) => file.source === "search"),
    );
    const workspace = selectedWorkspace;
    const showRerunIssue = (message: string) => {
      setStatusMessage(message);
      setEditedPromptNotice({
        kind: "rerun-error",
        workspaceId: entry.workspaceId,
        entryId: entry.clientId,
        message,
      });
    };

    if (!workspace || !promptText) {
      showRerunIssue("Select a workspace and provide a prompt before rerunning.");
      return;
    }
    if (!originalSettings) {
      showRerunIssue(
        "The original execution settings are unavailable, so this prompt cannot be rerun safely.",
      );
      return;
    }
    if (
      selectedWorkspaceChatSession?.origin === "codex_external" &&
      selectedWorkspaceChatSession.profileKey === DEFAULT_CODEX_PROFILE_KEY
    ) {
      showRerunIssue("External Codex chats can be continued, but edited prompts require an Orchestrator chat.");
      return;
    }
    if (entry.clientId !== editablePromptEntryId) {
      showRerunIssue("Only the latest prompt can be edited.");
      return;
    }
    if (selectedRunIsActiveNow()) {
      showRerunIssue("Wait for the active run to finish before editing a prompt.");
      return;
    }
    if (originalSettings.profileKey === DEFAULT_CODEX_PROFILE_KEY) {
      showRerunIssue(
        "Edited prompts are unavailable for runs from the default external Codex profile.",
      );
      return;
    }

    const account = codexAccountsRef.current.find(
      (candidate) => candidate.id === originalSettings.accountId,
    );
    if (!account) {
      showRerunIssue(
        "The Codex account used by the original prompt is no longer available.",
      );
      return;
    }
    if (account.status === "signed_out") {
      showRerunIssue(
        "Sign in to the Codex account used by the original prompt before rerunning it.",
      );
      return;
    }
    if (
      originalSettings.accessMode === "full-access" &&
      !window.confirm(accessModeWarning("full-access") ?? "")
    ) {
      return;
    }

    let originalRepositoryPath = originalSettings.selectedRepositoryPath;
    try {
      if (!originalRepositoryPath) {
        const overview = normalizeWorkspaceGitOverview(
          workspace.path,
          await listWorkspaceGitStatus(workspace.path, true),
        );
        if (overview.repositories.length !== 1) {
          showRerunIssue(
            "Choose a repository before rerunning this older prompt in a multi-repository workspace.",
          );
          return;
        }
        originalRepositoryPath = overview.repositories[0].repository.rootPath;
      }
      const branchList = await listGitBranches(
        workspace.path,
        originalRepositoryPath,
      );
      if (
        originalSettings.selectedBranch &&
        !branchList.branches.includes(originalSettings.selectedBranch)
      ) {
        showRerunIssue(
          `The original branch ${originalSettings.selectedBranch} is no longer available.`,
        );
        return;
      }

      if (!originalSettings.useOss && originalSettings.model) {
        await ensureCodexProfileConnected(
          originalSettings.profileKey,
          originalSettings.accountId,
        );
        const availableModels = await listCodexModels(originalSettings.accountId);
        const originalModel = availableModels.find(
          (candidate) =>
            candidate.model === originalSettings.model ||
            candidate.id === originalSettings.model,
        );
        if (!originalModel) {
          showRerunIssue(
            `The original model ${originalSettings.model} is no longer available.`,
          );
          return;
        }
        if (
          originalSettings.reasoningEffort &&
          !originalModel.supportedReasoningEfforts.some(
            (option) =>
              option.reasoningEffort === originalSettings.reasoningEffort,
          )
        ) {
          showRerunIssue(
            `The original reasoning option ${formatReasoningEffort(
              originalSettings.reasoningEffort,
            )} is no longer available for ${originalModel.displayName}.`,
          );
          return;
        }
      }
    } catch (error) {
      showRerunIssue(
        `Could not validate the original run settings: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return;
    }

    const chatId = entry.chatId ?? selectedWorkspaceChatSession?.chatId ?? null;

    const editedTurnIndex =
      entry.turnIndex ??
      Math.max(
        1,
        visibleTaskChatEntries.findIndex(
          (chatEntry) => chatEntry.clientId === entry.clientId,
        ) + 1,
      );
    const previousEntries = visibleTaskChatEntries.filter((chatEntry) => {
      if (chatEntry.clientId === entry.clientId) {
        return false;
      }
      const currentTurnIndex = chatEntry.turnIndex ?? 0;
      return currentTurnIndex > 0 && currentTurnIndex < editedTurnIndex;
    });
    const snapshot: RunSetupSnapshot = {
      promptText,
      promptFallback: nextPrompt,
      workspace: { ...workspace },
      accountId: originalSettings.accountId,
      account: { ...account },
      profileKey: originalSettings.profileKey,
      chatOrigin: "orchestrator",
      externalThreadId: null,
      selectedRepositoryPath: originalRepositoryPath,
      selectedBranch: originalSettings.selectedBranch,
      cachedPreflight: null,
      mode: originalSettings.mode,
      intent: originalSettings.intent,
      access: accessSettings({ accessMode: originalSettings.accessMode }),
      computerUseEnabled: originalSettings.computerUseEnabled,
      model: originalSettings.model,
      effort: originalSettings.reasoningEffort,
      useOss: originalSettings.useOss,
      ossProvider: originalSettings.ossProvider,
      improvedPrompt: improvePrompt(promptText),
      contextFiles: originalContextFiles.map((file) => ({ ...file })),
      selectedSkills: originalSettings.selectedSkills.map((skill) => ({
        ...skill,
      })),
      goalMode: originalSettings.goalMode,
      loginState,
      chatId,
      threadId: null,
      turnIndex: editedTurnIndex,
      threadStrategy: { kind: "fresh" },
      previousChatContext: buildPreviousChatContext(previousEntries),
      supersededRunIds: entry.runId !== null ? [entry.runId] : [],
      replacementClientId: entry.clientId,
      restoreEntryOnSetupFailure: entry,
      restorePromptOnSetupFailure: false,
      executionSettings: createRunExecutionSettings({
        ...originalSettings,
        selectedRepositoryPath: originalRepositoryPath,
        contextFiles: originalContextFiles,
      }),
    };

    const runControl = beginOptimisticRun(snapshot);
    scheduleRunSetup(runControl, snapshot);
  }

  async function buildAccountHandoffContext(
    snapshot: RunSetupSnapshot,
    runControl: ActiveRunControl,
  ) {
    if (
      snapshot.threadStrategy.kind !== "handoff" ||
      snapshot.chatId === null
    ) {
      return null;
    }

    const chatWithRuns = await getChatWithRuns(snapshot.chatId);
    ensureRunControlActive(runControl);
    const turns: AccountHandoffContextTurn[] = [];

    if (chatWithRuns.chat.origin === "codex_external") {
      const sourceVersion =
        chatWithRuns.chat.external_updated_at ?? chatWithRuns.chat.updated_at;
      let externalSnapshot =
        (await readExternalTranscriptSnapshot(snapshot.chatId, sourceVersion)) ??
        (await readExternalTranscriptSnapshot(snapshot.chatId));
      ensureRunControlActive(runControl);

      if (
        chatWithRuns.chat.sync_status !== "adopted" &&
        (!externalSnapshot || externalSnapshot.sourceVersion !== sourceVersion)
      ) {
        const externalThreadId = chatWithRuns.chat.external_thread_id;
        if (!externalThreadId) {
          throw new Error("The imported chat is missing its source thread.");
        }
        try {
          await ensureCodexProfileConnected(DEFAULT_CODEX_PROFILE_KEY, 0);
          ensureRunControlActive(runControl);
          const synced = await syncDefaultProfileThreadTranscript({
            threadId: externalThreadId,
            sourceVersion,
            pageSize: HISTORY_CHAT_PAGE_SIZE,
            requestId: `handoff-${snapshot.chatId}-${runControl.clientId}`,
          });
          ensureRunControlActive(runControl);
          await activateExternalTranscriptSnapshot(snapshot.chatId, synced);
          externalSnapshot = await readExternalTranscriptSnapshot(
            snapshot.chatId,
            sourceVersion,
          );
        } catch (error) {
          if (!externalSnapshot) {
            throw new Error(
              `Could not prepare the imported chat for account handoff: ${
                error instanceof Error ? error.message : String(error)
              }`,
            );
          }
        }
      }

      externalSnapshot?.turns.forEach((turn) => {
        const normalizedPlan = normalizeHistoricalProposedPlan(turn.finalMessage);
        turns.push({
          turnIndex: turn.slotIndex + 1,
          prompt: turn.prompt,
          finalMessage:
            normalizedPlan.finalMessage || turn.error || "",
          completedPlan: normalizedPlan.planText,
          intent: normalizedPlan.planText ? "plan" : "normal",
          planReviewState: normalizedPlan.planText ? "available" : null,
        });
      });
    }

    chatWithRuns.runs.forEach((run, index) => {
      const normalizedPlan = normalizeHistoricalProposedPlan(
        run.final_message ?? "",
        run.completed_plan_text,
      );
      turns.push({
        turnIndex: run.turn_index ?? index + 1,
        prompt: run.original_prompt,
        finalMessage: normalizedPlan.finalMessage || run.error || "",
        completedPlan: normalizedPlan.planText,
        intent: run.run_intent,
        planReviewState: run.plan_review_state,
      });
    });

    return buildBoundedAccountHandoffContext(
      turns,
      snapshot.sourcePlanEntry?.runView.nativePlan.completedText ?? "",
      snapshot.handoffContextBudgetTokens ?? 16_000,
    );
  }

  async function buildAdditionalContext(
    profileKey: CodexProfileKey,
    accountId: number,
    files: ComposerContextFile[],
    workspaceId: number,
  ) {
    const additionalContext: Record<string, AdditionalContextEntry> = {};
    const errors = new Map<string, string>();
    const skippedFiles: string[] = [];

    for (const file of files.filter((file) => !isImageContextFile(file))) {
      try {
        const content = await readCodexFileForProfile(
          profileKey,
          accountId,
          file.path,
        );
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

    const rememberedFiles =
      workspaceTaskMemories.records[workspaceId]?.contextFiles ?? files;
    updateRememberedWorkspaceComposer(workspaceId, {
      contextFiles: rememberedFiles.map((file) =>
        isImageContextFile(file)
          ? { ...file, status: "ready", error: null }
          : errors.has(file.path)
            ? { ...file, status: "error", error: errors.get(file.path) }
            : { ...file, status: "ready", error: null },
      ),
    });

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
    dismissExternalLoginNotification(accountId, activeLoginId);

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
    await markCodexAccountLoginError(accountId, message);
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

  function flushFrameBatchedCodexNotifications() {
    const pending = appServices.codexNotificationFrames.drain();
    if (pending.length === 0) {
      return runViewRef.current;
    }
    const messagesByControl = new Map<ActiveRunControl, CodexMessage[]>();
    pending.forEach(({ profileKey, message }) => {
      const control = findRunControlForMessage(profileKey, message);
      if (!control) return;
      const messages = messagesByControl.get(control) ?? [];
      messages.push(message);
      messagesByControl.set(control, messages);
    });
    messagesByControl.forEach((messages, control) => {
      const coalesced = coalesceFrameBatchedCodexMessages(messages);
      updateRunControlView(control, (current) =>
        coalesced.reduce(applyCodexMessage, current),
      );
    });
    return runViewRef.current;
  }

  function queueFrameBatchedCodexNotification(
    profileKey: CodexProfileKey,
    message: CodexMessage,
  ) {
    appServices.codexNotificationFrames.enqueue(
      { profileKey, message },
      flushFrameBatchedCodexNotifications,
    );
  }

  function createRunEventInput(
    control: ActiveRunControl,
    eventType: RunEventInput["eventType"],
    method: string | null,
    payload: unknown,
  ) {
    const runId = control.runId;
    if (!runId) return null;

    control.eventSequence += 1;
    return {
      runId,
      sequence: control.eventSequence,
      eventType,
      method,
      payload,
    } satisfies RunEventInput;
  }

  function flushBufferedRunEvents() {
    return appServices.runEvents.flush();
  }

  function queueBufferedRunEvent(
    control: ActiveRunControl,
    eventType: RunEventInput["eventType"],
    method: string | null,
    payload: unknown,
  ) {
    const input = createRunEventInput(control, eventType, method, payload);
    if (!input) return;

    appServices.runEvents.enqueue(input);
  }

  function agentNotificationTargetVisible(target: AgentNotificationTarget) {
    if (target.kind === "external-action") {
      return target.accountId === selectedAccountIdRef.current;
    }

    if (
      activeViewRef.current !== "task" ||
      target.workspaceId !== selectedWorkspaceRef.current?.id
    ) {
      return false;
    }
    const session = target.workspaceId
      ? workspaceChatSessionsRef.current[target.workspaceId]
      : null;
    const targetChatVisible =
      target.chatId !== null && target.chatId !== undefined
        ? session?.chatId === target.chatId
        : taskChatEntriesRef.current.some(
            (entry) => entry.clientId === target.entryClientId,
          );
    if (target.subagentThreadId) {
      if (!targetChatVisible) return false;
      const inspected = subagentInspectorTargetRef.current;
      const record = subagentStore.findByThread(
        (target.profileKey ?? DEFAULT_CODEX_PROFILE_KEY) as CodexProfileKey,
        target.subagentThreadId,
      );
      if (!inspected || inspected.subagentId !== record?.id) return false;
      const kind =
        target.kind === "approval-required"
          ? "approval"
          : target.kind === "user-input-required"
            ? "user-input"
            : null;
      if (!kind) return true;
      const control = Array.from(
        document.querySelectorAll<HTMLElement>(
          `.subagent-inspector [data-agent-notification-target="${kind}"]`,
        ),
      ).find(
        (candidate) =>
          !target.requestId ||
          candidate.dataset.agentNotificationId === target.requestId,
      );
      if (!control) return false;
      const bounds = control.getBoundingClientRect();
      return (
        bounds.bottom > 0 &&
        bounds.right > 0 &&
        bounds.top < window.innerHeight &&
        bounds.left < window.innerWidth
      );
    }
    if (!targetChatVisible || target.kind !== "user-input-required") {
      return targetChatVisible;
    }

    const question = Array.from(
      document.querySelectorAll<HTMLElement>(
        '[data-agent-notification-target="user-input"]',
      ),
    ).find(
      (candidate) =>
        !target.requestId ||
        candidate.dataset.agentNotificationId === target.requestId,
    );
    if (!question) return false;
    const bounds = question.getBoundingClientRect();
    if (bounds.width === 0 && bounds.height === 0) return true;
    return (
      bounds.bottom > 0 &&
      bounds.right > 0 &&
      bounds.top < window.innerHeight &&
      bounds.left < window.innerWidth
    );
  }

  async function deliverAgentNotification(input: {
    kind: AgentNotificationKind;
    target: AgentNotificationTarget;
    chatTitle?: string | null;
    workspaceLabel?: string | null;
    accountLabel?: string | null;
    targetVisible?: boolean;
  }) {
    if (
      pendingNotificationDeliveryKeysRef.current.has(input.target.eventKey) ||
      wasAgentNotificationDelivered(input.target.eventKey)
    ) {
      return;
    }
    if (
      !shouldSendAgentNotification({
        kind: input.kind,
        preferences: agentNotificationPreferencesRef.current,
        permissionStatus: agentNotificationPermissionRef.current,
        appFocused: appFocusedRef.current,
        appVisible: appVisibleRef.current,
        targetVisible:
          input.targetVisible ?? agentNotificationTargetVisible(input.target),
      })
    ) {
      return;
    }

    pendingNotificationDeliveryKeysRef.current.add(input.target.eventKey);
    const copy = buildSafeAgentNotificationCopy(input);
    try {
      const result = await sendAgentNotification({
        ...copy,
        groupKey:
          input.target.chatId !== null && input.target.chatId !== undefined
            ? `chat:${input.target.chatId}`
            : input.target.workspaceId !== null &&
                input.target.workspaceId !== undefined
              ? `workspace:${input.target.workspaceId}`
              : input.target.accountId !== null &&
                  input.target.accountId !== undefined
                ? `account:${input.target.accountId}`
                : null,
        target: input.target,
      });
      agentNotificationPermissionRef.current = result.permissionStatus;
      setAgentNotificationPermission(result.permissionStatus);
      if (result.delivered) {
        recordAgentNotificationDelivered(input.target.eventKey);
      }
    } catch {
      // Notifications are supplementary; native delivery failures must not affect a run.
    } finally {
      pendingNotificationDeliveryKeysRef.current.delete(input.target.eventKey);
    }
  }

  function setAgentNotificationNavigationPhase(
    requestId: number,
    target: AgentNotificationTarget,
    phase: AgentNotificationNavigationPhase,
  ) {
    if (notificationNavigationSequenceRef.current !== requestId) return;
    setAgentNotificationNavigation({ requestId, target, phase });
  }

  function cancelPendingAgentNotificationFocus() {
    const pendingFocus = pendingAgentNotificationFocusRef.current;
    pendingAgentNotificationFocusRef.current = null;
    if (pendingFocus) {
      window.clearTimeout(pendingFocus.timeoutId);
      pendingFocus.resolve(false);
    }
    setTranscriptNotificationFocusRequest(null);
  }

  function cancelAgentNotificationNavigation() {
    notificationNavigationSequenceRef.current += 1;
    cancelPendingAgentNotificationFocus();
    setAgentNotificationNavigation(null);
  }

  function agentNotificationNavigationIsCurrent(requestId: number) {
    return notificationNavigationSequenceRef.current === requestId;
  }

  function findRunControlForAgentNotification(
    target: AgentNotificationTarget,
  ) {
    return (
      [...activeRunRegistry.values()].find(
        (control) =>
          control.workspaceId === target.workspaceId &&
          ((target.entryClientId &&
            control.clientId === target.entryClientId) ||
            (target.runId !== null &&
              target.runId !== undefined &&
              control.runId === target.runId) ||
            (target.turnId && control.turnId === target.turnId) ||
            (target.chatId !== null &&
              target.chatId !== undefined &&
              control.chatId === target.chatId)),
      ) ?? null
    );
  }

  async function resolvePendingApprovalTarget(
    attention: PendingApprovalAttention,
  ): Promise<AgentNotificationTarget | null> {
    if (isAgentNotificationTargetNavigable(attention.target)) {
      return attention.target;
    }

    const entry = taskChatEntriesRef.current.find((candidate) =>
      pendingApprovalMatchesEntry(attention, candidate),
    );
    if (entry) {
      return {
        ...attention.target,
        workspaceId: entry.workspaceId,
        chatId: entry.chatId,
        runId: entry.runId,
        entryClientId: entry.clientId,
      };
    }

    const threadId = attention.request.threadId;
    if (!threadId) return null;

    const cachedChat = historyStateRef.current.chats.find(
      (chat) =>
        !chat.deleted_at &&
        (chat.codex_thread_id === threadId ||
          chat.external_thread_id === threadId),
    );
    if (cachedChat) {
      return {
        ...attention.target,
        workspaceId: cachedChat.workspace_id,
        chatId: cachedChat.id,
      };
    }

    const workspaceHistories = await Promise.all(
      workspacesRef.current.map(async (workspace) => {
        try {
          return await listWorkspaceChats(workspace.id);
        } catch {
          return [];
        }
      }),
    );
    const chat = workspaceHistories
      .flat()
      .find(
        (candidate) =>
          !candidate.deleted_at &&
          (candidate.codex_thread_id === threadId ||
            candidate.external_thread_id === threadId),
      );
    if (!chat) return null;

    return {
      ...attention.target,
      workspaceId: chat.workspace_id,
      chatId: chat.id,
    };
  }

  async function openPendingApprovalAttention(
    attention: PendingApprovalAttention,
  ) {
    const target = await resolvePendingApprovalTarget(attention);
    if (!target || !isAgentNotificationTargetNavigable(target)) {
      setStatusMessage(
        "The chat waiting for approval is no longer available.",
      );
      return;
    }

    setUnroutedApprovals((current) =>
      current.map((candidate) =>
        candidate.request.key === attention.request.key
          ? { ...candidate, target }
          : candidate,
      ),
    );
    const result = await handleAgentNotificationActivation(target);
    if (result === "retryable") {
      setStatusMessage("Could not open the chat waiting for approval.");
    }
  }

  function findEntryForAgentNotification(
    target: AgentNotificationTarget,
    workspaceId: number,
  ) {
    const workspaceEntries = taskChatEntriesRef.current.filter(
      (entry) =>
        entry.workspaceId === workspaceId &&
        (target.chatId === null ||
          target.chatId === undefined ||
          entry.chatId === target.chatId),
    );
    return (
      workspaceEntries.find(
        (entry) =>
          (target.entryClientId &&
            entry.clientId === target.entryClientId) ||
          (target.runId !== null &&
            target.runId !== undefined &&
            entry.runId === target.runId) ||
          (target.turnId && entry.runView.turnId === target.turnId),
      ) ??
      (target.entryClientId || target.runId !== null || target.turnId
        ? null
        : workspaceEntries[workspaceEntries.length - 1] ?? null)
    );
  }

  function openInMemoryAgentNotificationChat(
    workspace: Workspace,
    target: AgentNotificationTarget,
    runningControl: ActiveRunControl | null,
  ) {
    const entry = findEntryForAgentNotification(target, workspace.id);
    if (!entry) return false;

    const chatId = target.chatId ?? runningControl?.chatId ?? entry.chatId;
    const existingSession = workspaceChatSessionsRef.current[workspace.id];
    let session: WorkspaceChatSession | undefined;
    if (chatId !== null && chatId !== undefined) {
      if (existingSession?.chatId === chatId) {
        session = existingSession;
      } else if (runningControl && runningControl.chatId === chatId) {
        const chatEntries = taskChatEntriesRef.current.filter(
          (candidate) =>
            candidate.workspaceId === workspace.id &&
            candidate.chatId === chatId,
        );
        const latestTurnIndex = chatEntries.reduce(
          (latest, candidate) =>
            Math.max(latest, candidate.turnIndex ?? 0),
          0,
        );
        session = {
          chatId,
          threadId: runningControl.threadId,
          origin:
            runningControl.profileKey === DEFAULT_CODEX_PROFILE_KEY
              ? "codex_external"
              : "orchestrator",
          profileKey: runningControl.profileKey,
          externalThreadId:
            runningControl.profileKey === DEFAULT_CODEX_PROFILE_KEY
              ? runningControl.threadId
              : null,
          nextTurnIndex: Math.max(1, latestTurnIndex + 1),
        };
      } else {
        return false;
      }
    }

    const selectedSession =
      selectedWorkspaceRef.current?.id === workspace.id
        ? workspaceChatSessionsRef.current[workspace.id]
        : null;
    const sameVisibleChat =
      selectedWorkspaceRef.current?.id === workspace.id &&
      ((chatId !== null &&
        chatId !== undefined &&
        selectedSession?.chatId === chatId) ||
        (chatId === null &&
          selectedDraftChatEntryIdRef.current === entry.clientId));

    if (session) {
      rememberWorkspaceTaskSelection(
        workspace.id,
        { kind: "chat", session },
        null,
      );
    } else {
      rememberWorkspaceTaskSelection(
        workspace.id,
        { kind: "draft", clientId: entry.clientId },
        null,
      );
    }

    if (!sameVisibleChat) {
      historyChatLoadIdRef.current += 1;
      cancelActiveExternalTranscriptSync();
      cancelActiveHistoricalTranscriptPreparation();
      resetTranscriptInteraction();
    }

    flushSync(() => {
      applyWorkspaceForChatNavigation(workspace);
      setChatHistoryContextMenu(null);
      if (session) {
        setWorkspaceChatSession(workspace.id, session);
        setSelectedDraftChat(null);
        setSelectedHistoryChatId(session.chatId);
      } else {
        setWorkspaceChatSession(workspace.id, undefined);
        setSelectedDraftChat(entry.clientId);
        setSelectedHistoryChatId(null);
      }
      if (!sameVisibleChat) {
        setHistoryChatLoadState(null);
        setHistoryOpenRequest(null);
        historicalTranscriptRef.current = null;
        setHistoricalTranscript(null);
      }
      closeHistoryDrawer();
      setSelectedRunAliases(runningControl);
    });
    if (chatId !== null && chatId !== undefined) {
      markWorkspaceChatRead(workspace.id, chatId);
    }
    selectWorkspaceExecutionAccount(workspace, session ?? null);
    return true;
  }

  async function focusSubagentNotificationTarget(
    target: AgentNotificationTarget,
    navigationRequestId: number,
  ) {
    if (!target.subagentThreadId) return false;
    let record = subagentStore.findByThread(
      (target.profileKey ?? DEFAULT_CODEX_PROFILE_KEY) as CodexProfileKey,
      target.subagentThreadId,
    );
    if (!record && target.chatId !== null && target.chatId !== undefined) {
      try {
        const records = await listChatSubagents(target.chatId);
        const conversationKey = subagentConversationKey({
          chatId: target.chatId,
        });
        if (conversationKey) {
          subagentStore.replaceConversation(conversationKey, records);
        }
        record =
          records.find(
            (candidate) =>
              candidate.childThreadId === target.subagentThreadId &&
              (!target.profileKey ||
                candidate.profileKey === target.profileKey),
          ) ?? null;
      } catch {
        return false;
      }
    }
    if (
      !record ||
      !agentNotificationNavigationIsCurrent(navigationRequestId)
    ) {
      return false;
    }

    openSubagentInspector(record);
    setAgentNotificationNavigationPhase(
      navigationRequestId,
      target,
      "focusing",
    );
    const notificationKind =
      target.kind === "approval-required"
        ? "approval"
        : target.kind === "user-input-required"
          ? "user-input"
          : null;
    if (!notificationKind) return true;

    const deadline = Date.now() + AGENT_NOTIFICATION_FOCUS_TIMEOUT_MS;
    while (
      Date.now() < deadline &&
      agentNotificationNavigationIsCurrent(navigationRequestId)
    ) {
      await waitForNextPaint();
      const candidates = Array.from(
        document.querySelectorAll<HTMLElement>(
          `.subagent-inspector [data-agent-notification-target="${notificationKind}"]`,
        ),
      );
      const targetElement =
        candidates.find(
          (candidate) =>
            !target.requestId ||
            candidate.dataset.agentNotificationId === target.requestId,
        ) ?? null;
      if (targetElement) {
        const focusTarget =
          targetElement.querySelector<HTMLElement>(
            'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
          ) ?? targetElement;
        focusTarget.focus({ preventScroll: true });
        return true;
      }
      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, 40);
      });
    }
    return false;
  }

  function focusAgentNotificationTarget(
    target: AgentNotificationTarget,
    navigationRequestId: number,
  ) {
    if (!agentNotificationNavigationIsCurrent(navigationRequestId)) {
      return Promise.resolve(false);
    }
    if (target.subagentThreadId) {
      return focusSubagentNotificationTarget(
        target,
        navigationRequestId,
      );
    }

    notificationFocusSequenceRef.current += 1;
    const focusRequest: TranscriptNotificationFocusRequest = {
      requestId: notificationFocusSequenceRef.current,
      kind:
        target.kind === "approval-required"
          ? "approval"
          : target.kind === "user-input-required"
            ? "user-input"
            : target.kind === "plan-ready"
              ? "plan"
              : "response",
      entryClientId: target.entryClientId ?? null,
      runId: target.runId ?? null,
      turnId: target.turnId ?? null,
      targetId: target.requestId ?? target.planItemId ?? null,
    };
    cancelPendingAgentNotificationFocus();
    setAgentNotificationNavigationPhase(
      navigationRequestId,
      target,
      "focusing",
    );
    return new Promise<boolean>((resolve) => {
      const timeoutId = window.setTimeout(() => {
        const pendingFocus = pendingAgentNotificationFocusRef.current;
        if (pendingFocus?.requestId !== focusRequest.requestId) return;
        pendingAgentNotificationFocusRef.current = null;
        setTranscriptNotificationFocusRequest((current) =>
          current?.requestId === focusRequest.requestId ? null : current,
        );
        resolve(false);
      }, AGENT_NOTIFICATION_FOCUS_TIMEOUT_MS);
      pendingAgentNotificationFocusRef.current = {
        requestId: focusRequest.requestId,
        timeoutId,
        resolve,
      };
      setTranscriptNotificationFocusRequest(focusRequest);
    });
  }

  async function completeAgentNotificationChatNavigation(
    target: AgentNotificationTarget,
    navigationRequestId: number,
  ): Promise<AgentNotificationNavigationResult> {
    await waitForHistoryDrawerClosed();
    await waitForNextPaint();
    if (!agentNotificationNavigationIsCurrent(navigationRequestId)) {
      return "retryable";
    }

    const focused = await focusAgentNotificationTarget(
      target,
      navigationRequestId,
    );
    if (!agentNotificationNavigationIsCurrent(navigationRequestId)) {
      return "retryable";
    }
    if (!focused) {
      setStatusMessage(
        "That notification target is no longer available in this chat.",
      );
      setAgentNotificationNavigation(null);
      return "retryable";
    }

    setAgentNotificationNavigationPhase(
      navigationRequestId,
      target,
      "complete",
    );
    return "complete";
  }

  async function handleAgentNotificationActivation(
    target: AgentNotificationTarget,
  ): Promise<AgentNotificationNavigationResult> {
    if (!isAgentNotificationTargetNavigable(target)) {
      setStatusMessage("That notification target is no longer available.");
      return "terminal";
    }

    cancelPendingAgentNotificationFocus();
    const navigationRequestId =
      notificationNavigationSequenceRef.current + 1;
    notificationNavigationSequenceRef.current = navigationRequestId;
    setAgentNotificationNavigation({
      requestId: navigationRequestId,
      target,
      phase: "resolving",
    });

    if (target.kind === "external-action") {
      const account = codexAccountsRef.current.find(
        (candidate) => candidate.id === target.accountId,
      );
      if (!account || account.status === "signed_in") {
        setStatusMessage("That sign-in action is no longer pending.");
        setAgentNotificationNavigation(null);
        return "terminal";
      }
      setSelectedAccountId(account.id);
      selectedAccountIdRef.current = account.id;
      activeViewRef.current = "settings";
      setActiveView("settings");
      window.requestAnimationFrame(() => {
        document
          .querySelector<HTMLElement>(`[data-managed-account-id="${account.id}"]`)
          ?.focus({ preventScroll: true });
      });
      setAgentNotificationNavigationPhase(
        navigationRequestId,
        target,
        "complete",
      );
      return "complete";
    }

    const workspace = workspacesRef.current.find(
      (candidate) => candidate.id === target.workspaceId,
    );
    if (!workspace) {
      setStatusMessage("The workspace for that notification is no longer available.");
      setAgentNotificationNavigation(null);
      return "terminal";
    }

    const runningControl = findRunControlForAgentNotification(target);
    if (
      runningControl &&
      openInMemoryAgentNotificationChat(
        workspace,
        target,
        runningControl,
      )
    ) {
      return completeAgentNotificationChatNavigation(
        target,
        navigationRequestId,
      );
    }

    if (
      openInMemoryAgentNotificationChat(
        workspace,
        target,
        null,
      )
    ) {
      return completeAgentNotificationChatNavigation(
        target,
        navigationRequestId,
      );
    }

    if (!agentNotificationNavigationIsCurrent(navigationRequestId)) {
      return "retryable";
    }
    setAgentNotificationNavigationPhase(
      navigationRequestId,
      target,
      "opening-chat",
    );

    let chats: ChatListItem[];
    try {
      chats = await listWorkspaceChats(workspace.id);
    } catch {
      setStatusMessage("Could not load the chat for that notification.");
      setAgentNotificationNavigation(null);
      return "retryable";
    }
    if (!agentNotificationNavigationIsCurrent(navigationRequestId)) {
      return "retryable";
    }
    const chat = chats.find(
      (candidate) =>
        candidate.id === target.chatId ||
        (target.threadId &&
          (candidate.codex_thread_id === target.threadId ||
            candidate.external_thread_id === target.threadId)),
    );
    if (!chat || chat.deleted_at) {
      setStatusMessage("That notification belongs to a deleted or unavailable chat.");
      setAgentNotificationNavigation(null);
      return "terminal";
    }

    const opened = await selectHistoryChat(chat, {
      source: "notification",
      workspace,
    });
    if (
      !opened ||
      !agentNotificationNavigationIsCurrent(navigationRequestId)
    ) {
      setAgentNotificationNavigation(null);
      return "retryable";
    }

    return completeAgentNotificationChatNavigation(
      target,
      navigationRequestId,
    );
  }

  async function handleCodexNotification(
    accountId: number,
    profileKey: CodexProfileKey,
    message: CodexMessage,
  ) {
    const method = message.method ?? null;

    const params = readObject(message.params);

    if (profileKey !== DEFAULT_CODEX_PROFILE_KEY && method === "account/login/completed") {
      await handleAccountLoginCompleted(accountId, readAccountLoginCompleted(params));
    }

    if (profileKey !== DEFAULT_CODEX_PROFILE_KEY && method === "account/updated") {
      await handleAccountUpdated(accountId, readAccountUpdated(params));
    }

    if (method === "serverRequest/resolved") {
      const requestId = params.requestId;
      const threadId = readString(params.threadId);
      const resolvedUserInputRequests = [
        ...activeRunRegistry.values(),
      ].flatMap((control) =>
        control.profileKey === profileKey
          ? control.runView.serverRequests
              .filter(isNativeUserInputRequest)
              .filter(
                (request) =>
                  String(request.id) === String(requestId) &&
                  (!threadId || request.params.threadId === threadId),
              )
              .map((request) => ({ control, request }))
          : [],
      );
      const resolvedApprovals = [
        ...[...activeRunRegistry.values()].flatMap(
          (control) => control.runView.approvalRequests,
        ),
        ...unroutedApprovalsRef.current.map(
          (attention) => attention.request,
        ),
      ].filter(
        (request) =>
          request.profileKey === profileKey &&
          String(request.id) === String(requestId) &&
          (!threadId || request.threadId === threadId),
      );
      resolvedApprovals.forEach((request) => {
        void removeAgentNotification(
          approvalNotificationEventKey(request),
        ).catch(() => undefined);
      });
      resolvedUserInputRequests.forEach(({ control, request }) => {
        void removeAgentNotification(
          userInputNotificationEventKey(control.profileKey, request),
        ).catch(() => undefined);
      });
      const remainingUnroutedApprovals =
        unroutedApprovalsRef.current.filter(
          ({ request }) =>
            request.profileKey !== profileKey ||
            String(request.id) !== String(requestId) ||
            Boolean(threadId && request.threadId !== threadId),
        );
      unroutedApprovalsRef.current = remainingUnroutedApprovals;
      setUnroutedApprovals(remainingUnroutedApprovals);
      if (typeof requestId === "string" || typeof requestId === "number") {
        activeRunRegistry.forEach((control) => {
          if (control.profileKey !== profileKey) return;
          updateRunControlView(control, (current) =>
            resolveApprovalRequest(
              current,
              requestId,
              threadId ?? undefined,
            ),
          );
        });
      }
    }

    if (
      method === "turn/completed" ||
      method === "turn/interrupted" ||
      method === "error"
    ) {
      const identity = readCodexMessageRunIdentity(message);
      clearApprovalAttentionForRun(
        profileKey,
        identity.threadId,
        identity.turnId,
      );
    }

    const control = findRunControlForMessage(profileKey, message);
    if (!control) {
      bufferPendingRunBindingNotification(accountId, profileKey, message);
      return;
    }
    const identity = readCodexMessageRunIdentity(message);
    const trackedSubagents = trackSubagentCollaboration(control, message);
    if (
      trackedSubagents.length > 0 &&
      pendingRunBindingNotificationsRef.current.length > 0
    ) {
      await flushPendingRunBindingNotifications(control);
    }
    const childRecord = subagentStore.findByThread(profileKey, identity.threadId);
    const isChildThread =
      childRecord?.ownerClientId === control.clientId &&
      childRecord.childThreadId !== control.threadId;
    if (isChildThread && childRecord) {
      if (method === "item/started" || method === "item/completed") {
        applyBrowserLifecycleNotification(control, method, params);
      }
      const updatedChild = updateSubagentFromNotification(
        control,
        childRecord,
        message,
      );
      if (
        method === "turn/completed" ||
        method === "turn/interrupted" ||
        method === "error"
      ) {
        clearSubagentInteractions(control, childRecord.childThreadId);
        void loadSubagentTranscript(updatedChild)
          .then((transcript) => {
            const finalResult =
              transcript.turns
                .flatMap((turn) => turn.items)
                .reverse()
                .find(
                  (item) =>
                    item.kind === "assistant" &&
                    item.phase === "final_answer" &&
                    item.text.trim(),
                ) ?? null;
            if (!finalResult || finalResult.kind !== "assistant") return;
            const latest = subagentStore.findByThread(
              updatedChild.profileKey,
              updatedChild.childThreadId,
            );
            if (!latest) return;
            saveSubagentRecord({
              ...latest,
              finalResult: finalResult.text,
              updatedAt: new Date().toISOString(),
            });
          })
          .catch(() => undefined);
      }
      if (
        method === "serverRequest/resolved" &&
        !subagentHasPendingInteractions(control, childRecord.childThreadId)
      ) {
        setSubagentAttention(control, childRecord.childThreadId, false);
      }
      return;
    }
    if (
      method === "turn/started" &&
      identity.turnId &&
      control.acceptsThreadContinuation
    ) {
      if (
        identity.turnId === control.turnId &&
        control.goalTurnCompleted
      ) {
        return;
      }
      control.turnId = identity.turnId;
      control.goalTurnCompleted = false;
      if (control.runId !== null) {
        void updateRun(control.runId, {
          codexTurnId: identity.turnId,
          status: "running",
        }).catch(() => undefined);
      }
    }
    if (method === "thread/goal/updated") {
      const goal = parseThreadGoal(params.goal, {
        fallbackThreadId: readString(params.threadId),
      });
      if (goal) {
        if (identity.turnId && identity.turnId !== control.turnId) {
          control.turnId = identity.turnId;
          if (goal.status !== "complete") {
            control.goalTurnCompleted = false;
          }
          if (control.runId !== null) {
            void updateRun(control.runId, {
              codexTurnId: identity.turnId,
              status: "running",
            }).catch(() => undefined);
          }
        }
        control.goal = goal;
        if (control.kanbanAttempt) {
          const kanbanGoalStatus =
            goal.status === "paused"
              ? "paused"
              : goal.status === "blocked" ||
                  goal.status === "usageLimited" ||
                  goal.status === "budgetLimited"
                ? "blocked"
                : goal.status === "active"
                  ? "running"
                  : null;
          if (kanbanGoalStatus) {
            void kanbanAttempts.persist(control, kanbanGoalStatus);
          }
        }
        if (!control.goalActionPending) {
          control.goalActionError = null;
        }
        control.acceptsThreadContinuation = true;
      }
    } else if (method === "thread/goal/cleared") {
      control.goal = null;
      control.goalActionPending = null;
      control.goalActionError = null;
      control.acceptsThreadContinuation = false;
    }
    const intermediateGoalTurnCompleted =
      method === "turn/completed" &&
      control.acceptsThreadContinuation &&
      goalKeepsRunOpen(control.goal);
    const terminalTurnCompleted =
      method === "turn/completed" && !intermediateGoalTurnCompleted;
    const terminalProtocolError =
      method === "error" && Boolean(control.kanbanAttempt);
    const terminalKanbanInterrupted =
      method === "turn/interrupted" &&
      Boolean(control.kanbanAttempt) &&
      control.kanbanStopRequest === null &&
      !goalKeepsRunOpen(control.goal);
    const terminalRunFinished =
      terminalTurnCompleted || terminalProtocolError || terminalKanbanInterrupted;
    const terminalTurn = readObject(params.turn);
    const terminalStatus: "completed" | "failed" | "interrupted" | null =
      terminalRunFinished
        ? terminalKanbanInterrupted
          ? "interrupted"
          : terminalProtocolError || readString(terminalTurn.status) === "failed"
            ? "failed"
            : "completed"
        : null;
    inspectCodexMessageForWebPreview(control, message);
    applyBrowserLifecycleNotification(control, method, params);

    if (shouldFrameBatchCodexMessage(message)) {
      queueBufferedRunEvent(control, "notification", method, message);
      queueFrameBatchedCodexNotification(profileKey, message);
      return;
    }

    flushFrameBatchedCodexNotifications();

    const nextRunView = updateRunControlView(control, (current) => {
      let next = applyCodexMessage(current, message);
      if (intermediateGoalTurnCompleted) {
        next = {
          ...next,
          status: "running",
          completedAt: null,
          error: null,
        };
      }
      if (method !== "serverRequest/resolved") return next;
      const requestId = params.requestId;
      if (typeof requestId !== "string" && typeof requestId !== "number") {
        return next;
      }
      return resolveApprovalRequest(
        next,
        requestId,
        readString(params.threadId) ?? undefined,
      );
    });
    const terminalError =
      terminalStatus === "failed"
        ? readSubagentError(message) ??
          nextRunView.error ??
          "Codex could not complete this card."
        : terminalStatus === "interrupted"
          ? nextRunView.error ?? "The Codex turn ended unexpectedly."
          : null;
    if (method === "serverRequest/resolved" && control.kanbanAttempt) {
      const hasPendingUserInput = nextRunView.serverRequests
        .filter(isNativeUserInputRequest)
        .some((request) => request.params.threadId === control.threadId);
      const hasPendingApproval = nextRunView.approvalRequests.some(
        (request) => !request.threadId || request.threadId === control.threadId,
      );
      void kanbanAttempts.persist(
        control,
        hasPendingUserInput
          ? "waiting_user"
          : hasPendingApproval
            ? "waiting_approval"
            : "running",
      );
    }
    if (
      method === "turn/completed" ||
      (method === "turn/interrupted" &&
        !control.stopped &&
        goalKeepsRunOpen(control.goal))
    ) {
      control.goalTurnCompleted = true;
    }
    if (terminalRunFinished) {
      const terminalPreview = nextRunView.webPreview;
      if (terminalPreview) {
        void recheckWebPreview(terminalPreview, {
          entryClientId: control.clientId,
          runId: control.runId,
        });
      } else {
        const pendingCandidate = [
          ...control.webPreviewDetection.probes.entries(),
        ].sort((left, right) => right[1].sequence - left[1].sequence)[0];
        if (pendingCandidate) {
          probeTerminalWebPreview(
            pendingCandidate[0],
            pendingCandidate[1].sourceCommandId,
            {
              entryClientId: control.clientId,
              runId: control.runId,
            },
          );
        }
      }
    }
    await persistRunEvent(control, "notification", method, message);

    if (terminalStatus) {
      const persistence = await kanbanAttempts.persist(
        control,
        terminalStatus,
        terminalError,
        { retryCount: 1 },
      );
      if (persistence.persisted) {
        removeRunControl(control);
      } else if (
        activeRunRegistry.get(control.clientId) === control
      ) {
        setStatusMessage(
          `The run finished, but the Kanban attempt could not be saved: ${persistence.error}`,
        );
      }
    }

    if (method === "serverRequest/resolved") {
      const requestId = params.requestId;
      if (requestId !== undefined) {
        clearUserInputAutoResolutionTimer(profileKey, requestId as string | number);
      }
    }

    if (method === "thread/settings/updated") {
      const collaborationMode = readObject(
        readObject(params.threadSettings).collaborationMode,
      );
      const mode = readString(collaborationMode.mode);
      const chatId = control.chatId;
      if (chatId !== null && (mode === "plan" || mode === "default")) {
        await updateChat(chatId, { collaborationMode: mode });
      }
    }

    const runId = control.runId;
    if (!runId) {
      return;
    }

    if (method === "thread/tokenUsage/updated") {
      const reportedTokenUsage = readTokenUsage(params);
      const tokenUsage = reportedTokenUsage ? nextRunView.tokenUsage : null;
      if (tokenUsage) {
        await recordTokenUsage({
          runId,
          threadId: readString(params.threadId),
          turnId: readString(params.turnId),
          ...tokenUsage,
        });
      }
    }

    if (terminalStatus) {
      const turn = terminalTurn;
      const status = terminalStatus;
      const completedControl = control;
      const completedEntry =
        taskChatEntriesRef.current.find(
          (entry) => entry.clientId === completedControl.clientId,
        ) ?? null;
      if (status === "completed") {
        const planReady = nextRunView.nativePlan.reviewState === "available";
        const kind: AgentNotificationKind = planReady
          ? "plan-ready"
          : "response-completed";
        const eventKey = planReady
          ? planNotificationEventKey(completedControl.profileKey, {
              runId,
              runView: nextRunView,
            })
          : createAgentNotificationEventKey(
              kind,
              completedControl.profileKey,
              nextRunView.threadId,
              nextRunView.turnId,
              runId,
            );
        const workspace = workspacesRef.current.find(
          (candidate) => candidate.id === completedEntry?.workspaceId,
        );
        void deliverAgentNotification({
          kind,
          target: {
            eventKey,
            kind,
            workspaceId: completedEntry?.workspaceId ?? null,
            chatId: completedControl.chatId,
            runId,
            entryClientId: completedControl.clientId,
            requestId: null,
            planItemId: nextRunView.nativePlan.planItemId,
            accountId:
              completedControl.profileKey === DEFAULT_CODEX_PROFILE_KEY
                ? null
                : completedControl.accountId,
            profileKey: completedControl.profileKey,
            threadId: nextRunView.threadId,
            turnId: nextRunView.turnId,
          },
          chatTitle: completedEntry?.prompt,
          workspaceLabel: workspace?.label,
        });
      }
      await updateRun(runId, {
        status,
        completedAt: new Date().toISOString(),
        durationMs: readNumber(turn.durationMs) ?? nextRunView.elapsedMs,
        finalMessage: nextRunView.finalMessage,
        error:
          status === "failed"
            ? JSON.stringify(turn.error ?? terminalError ?? "Turn failed")
            : status === "interrupted"
              ? terminalError
              : null,
        collaborationMode: nextRunView.nativePlan.mode,
        runIntent: nextRunView.nativePlan.intent,
        completedPlanItemId: nextRunView.nativePlan.planItemId,
        completedPlanText: nextRunView.nativePlan.completedText || null,
        planReviewState:
          nextRunView.nativePlan.reviewState === "submitting"
            ? "available"
            : nextRunView.nativePlan.reviewState,
      });
      if (completedControl.taskId) {
        await updateTaskStatus(completedControl.taskId, status);
      }
      const activeChatId = completedControl.chatId;
      if (activeChatId !== null) {
        await updateChat(activeChatId, { status }).catch(() => undefined);
      }
      if (completedControl.queueItemId && activeChatId !== null) {
        if (status === "completed") {
          await completePromptQueueItem(completedControl.queueItemId).catch(
            () => null,
          );
          removePromptQueueItemFromMemory(
            activeChatId,
            completedControl.queueItemId,
          );
          await rebaselineQueuedPromptContexts(activeChatId).catch(
            () => undefined,
          );
          if (nextRunView.nativePlan.reviewState === "available") {
            setPromptQueuePaused(activeChatId, true, "workflow");
          } else if (completedControl.queueAdvanceBlocked) {
            setPromptQueuePaused(activeChatId, true, "manual");
            setStatusMessage(
              "Prompt queue paused after an approval was denied or a question went unanswered.",
            );
          } else {
            schedulePromptQueueDispatch(activeChatId);
          }
        } else {
          const failedQueueItem = await failPromptQueueItem(
            completedControl.queueItemId,
            nextRunView.error ?? "Codex could not complete this queued prompt.",
          ).catch(() => null);
          if (failedQueueItem) {
            upsertPromptQueueItemInMemory(failedQueueItem);
          }
          setPromptQueuePaused(activeChatId, true, "failure");
        }
      } else if (activeChatId !== null) {
        await advanceChatConversationRevision(activeChatId, {
          queueOwned: false,
        }).catch(() => undefined);
        const pendingQueue = await refreshPromptQueue(activeChatId).catch(
          () => [],
        );
        if (pendingQueue.length > 0) {
          if (status === "failed") {
            setPromptQueuePaused(activeChatId, true, "failure");
          } else if (nextRunView.nativePlan.reviewState === "available") {
            setPromptQueuePaused(activeChatId, true, "workflow");
          } else if (completedControl.queueAdvanceBlocked) {
            setPromptQueuePaused(activeChatId, true, "manual");
            setStatusMessage(
              "Prompt queue paused after an approval was denied or a question went unanswered.",
            );
          } else {
            const pauseReason =
              promptQueuePauseReasonsRef.current.get(activeChatId);
            if (pauseReason === "workflow") {
              setPromptQueuePaused(activeChatId, false);
            }
            if (!pausedPromptQueueChatIdsRef.current.has(activeChatId)) {
              schedulePromptQueueDispatch(activeChatId);
            }
          }
        }
      }
      const completedWorkspace = completedControl
        ? workspacesRef.current.find(
            (workspace) => workspace.id === completedControl.workspaceId,
          ) ?? null
        : null;
      if (completedWorkspace) {
        invalidateWorkspacePreviewCaches(completedWorkspace, undefined, {
          reloadOpenPreview: true,
        });
        await Promise.all([
          refreshWorkspaceGitStatus(completedWorkspace, {
            showLoading: false,
            force: true,
          }),
          refreshWorkspaceDirectoriesAfterRun(completedWorkspace),
          selectedWorkspaceRef.current?.id === completedWorkspace.id
            ? refreshWorkspaceData(completedWorkspace.id)
            : Promise.resolve(),
        ]);
      }
      if (
        activeChatId !== null &&
        !(
          activeViewRef.current === "task" &&
          runControlIsSelected(completedControl)
        )
      ) {
        setUnreadCompletedChats((current) => {
          const workspaceChats = current[completedControl.workspaceId] ?? [];
          if (workspaceChats.includes(activeChatId)) return current;
          return {
            ...current,
            [completedControl.workspaceId]: [...workspaceChats, activeChatId],
          };
        });
      }
      if (selectedWorkspaceRef.current?.id === completedControl.workspaceId) {
        await refreshSelectedWorkspaceHistory();
      }
    }
    if (
      method === "thread/goal/updated" &&
      control.goal?.status === "complete" &&
      control.goalTurnCompleted &&
      activeRunRegistry.get(control.clientId) === control
    ) {
      control.goalTurnCompleted = false;
      await handleCodexNotification(accountId, profileKey, {
        method: "turn/completed",
        params: {
          threadId: control.threadId,
          turn: {
            id: control.turnId,
            status: "completed",
            durationMs: control.runView.elapsedMs,
            error: null,
          },
        },
      });
    }
  }

  async function handleCodexServerRequest(
    accountId: number,
    profileKey: CodexProfileKey,
    request: CodexMessage,
    requestToken: string | null,
  ) {
    if (!requestToken) {
      const warning =
        "Codex sent a server request without a one-shot request token. It was left unresolved for safety.";
      setStatusMessage(warning);
      setApprovalSafetyWarning(warning);
      return;
    }
    flushFrameBatchedCodexNotifications();
    const {
      threadId: requestThreadId,
      turnId: requestTurnId,
    } = readCodexMessageRunIdentity(request);
    const control = findRunControlForIds(
      profileKey,
      requestThreadId,
      requestTurnId,
    );
    const requestSubagent = subagentStore.findByThread(
      profileKey,
      requestThreadId,
    );
    const requestBelongsToSubagent =
      control !== null &&
      requestSubagent?.ownerClientId === control.clientId;
    if (control?.kanbanAttempt && !requestBelongsToSubagent) {
      void kanbanAttempts.persist(
        control,
        isNativeUserInputRequest(request) ? "waiting_user" : "waiting_approval",
      );
    }
    const parsed = parseApprovalRequest({
      message: request,
      profileKey,
      requestToken,
      interactionMode: control?.interactionMode ?? "chat",
      activePlaywrightToolCalls:
        control?.browserSession?.state.target.accessMode ===
        "ask-for-approval"
          ? [...control.activePlaywrightToolCalls.values()]
          : [],
    });
    if (parsed && !isNativeUserInputRequest(request)) {
      if (
        parsed.kind === "browser" &&
        (!control?.browserSession ||
          control.browserSession.token !==
            parsed.browserRequest?.sessionToken)
      ) {
        parsed.kind = "unsupported";
        parsed.browserRequest = null;
        parsed.choices = [];
        parsed.error =
          "This browser approval did not match the active isolated browser session.";
      }
      if (
        parsed.kind === "browser-tool" &&
        (!control?.browserSession ||
          control.browserSession.state.target.accessMode !==
            "ask-for-approval" ||
          !parsed.browserToolRequest ||
          !control.activePlaywrightToolCalls.has(
            parsed.browserToolRequest.itemId,
          ))
      ) {
        parsed.kind = "unsupported";
        parsed.browserToolRequest = null;
        parsed.choices = [];
        parsed.error =
          "This browser tool approval did not match the active isolated browser session.";
      }
      const belongsToActiveRun = control !== null;
      const shouldNotify = [
        "command",
        "file-change",
        "permissions",
        "legacy-command",
        "legacy-file-change",
        "browser",
        "browser-tool",
      ].includes(parsed.kind);
      const historyChat = !belongsToActiveRun
        ? historyStateRef.current.chats.find(
            (chat) =>
              chat.profile_key === profileKey &&
              Boolean(parsed.threadId) &&
              (chat.codex_thread_id === parsed.threadId ||
                chat.external_thread_id === parsed.threadId),
          ) ?? null
        : null;
      const activeEntry = belongsToActiveRun
        ? taskChatEntriesRef.current.find(
            (entry) => entry.clientId === control?.clientId,
          ) ?? null
        : null;
      const workspaceId =
        activeEntry?.workspaceId ?? historyChat?.workspace_id ?? null;
      const workspace = workspacesRef.current.find(
        (candidate) => candidate.id === workspaceId,
      );
      const eventKey = approvalNotificationEventKey(parsed);
      const notificationTarget: AgentNotificationTarget = {
        eventKey,
        kind: "approval-required",
        workspaceId,
        chatId: control?.chatId ?? historyChat?.id ?? null,
        runId: control?.runId ?? null,
        entryClientId: control?.clientId ?? null,
        requestId: parsed.key,
        planItemId: null,
        accountId:
          profileKey === DEFAULT_CODEX_PROFILE_KEY ? null : accountId,
        profileKey,
        threadId: parsed.threadId,
        turnId: parsed.turnId,
        subagentThreadId: requestBelongsToSubagent
          ? requestSubagent.childThreadId
          : null,
      };
      const notifyApproval = () => {
        if (!shouldNotify) return;
        void deliverAgentNotification({
          kind: "approval-required",
          target: notificationTarget,
          chatTitle: requestBelongsToSubagent
            ? requestSubagent?.task
            : activeEntry?.prompt ?? historyChat?.title,
          workspaceLabel: workspace?.label,
        });
      };

      if (!belongsToActiveRun) {
        const attention: PendingApprovalAttention = {
          accountId,
          request: parsed,
          target: notificationTarget,
        };
        const hasPotentialOwner = [
          ...activeRunRegistry.values(),
        ].some((candidate) =>
          pendingApprovalCouldBelongToControl(
            attention,
            candidate,
            subagentStore,
          ),
        );
        if (!hasPotentialOwner) {
          void rejectOrphanedApproval(attention);
          return;
        }
        if (
          !unroutedApprovalsRef.current.some(
            (candidate) => candidate.request.key === parsed.key,
          )
        ) {
          const next = [...unroutedApprovalsRef.current, attention];
          unroutedApprovalsRef.current = next;
          setUnroutedApprovals(next);
        }
        setStatusMessage(
          "Codex is waiting for approval in another conversation. The request remains blocked and was not approved.",
        );
        notifyApproval();
        return;
      }

      updateRunControlView(control, (current) => addApprovalRequest(current, parsed));
      if (requestBelongsToSubagent) {
        setSubagentAttention(control, requestSubagent.childThreadId, true);
      }
      if (parsed.kind === "browser" || parsed.kind === "browser-tool") {
        setRunControlBrowserLifecycle(control, "awaiting-approval");
      }
      notifyApproval();
      await persistRunEvent(
        control,
        "server-request",
        request.method ?? null,
        request,
      );
      return;
    }

    if (!control) return;
    if (
      request.id !== undefined &&
      control.runView.serverRequests.some(
        (existing) => String(existing.id) === String(request.id),
      )
    ) {
      return;
    }
    const routedRequest = { ...request, requestToken };
    updateRunControlView(control, (current) =>
      addServerRequest(current, routedRequest),
    );
    await persistRunEvent(
      control,
      "server-request",
      request.method ?? null,
      request,
    );
    if (isNativeUserInputRequest(routedRequest)) {
      const activeEntry =
        taskChatEntriesRef.current.find(
          (entry) => entry.clientId === control.clientId,
        ) ?? null;
      const workspace =
        workspacesRef.current.find(
          (candidate) => candidate.id === control.workspaceId,
        ) ?? null;
      const eventKey = userInputNotificationEventKey(
        profileKey,
        routedRequest,
      );
      const target: AgentNotificationTarget = {
        eventKey,
        kind: "user-input-required",
        workspaceId: control.workspaceId,
        chatId: control.chatId,
        runId: control.runId,
        entryClientId: control.clientId,
        requestId: requestKey(routedRequest),
        planItemId: null,
        accountId:
          profileKey === DEFAULT_CODEX_PROFILE_KEY ? null : accountId,
        profileKey,
        threadId: routedRequest.params.threadId,
        turnId: routedRequest.params.turnId,
        subagentThreadId: requestBelongsToSubagent
          ? requestSubagent.childThreadId
          : null,
      };
      if (requestBelongsToSubagent) {
        setSubagentAttention(control, requestSubagent.childThreadId, true);
      }
      window.requestAnimationFrame(() => {
        if (
          activeRunRegistry.get(control.clientId) !== control ||
          !control.runView.serverRequests.some(
            (candidate) =>
              isNativeUserInputRequest(candidate) &&
              requestKey(candidate) === requestKey(routedRequest),
          )
        ) {
          return;
        }
        void deliverAgentNotification({
          kind: "user-input-required",
          target,
          chatTitle: requestBelongsToSubagent
            ? requestSubagent?.task
            : activeEntry?.prompt ?? control.promptFallback,
          workspaceLabel: workspace?.label,
        });
      });
    }
    if (isNativeUserInputRequest(request) && request.params.autoResolutionMs) {
      const routedUserInputRequest = { ...request, requestToken };
      const timerKey = `${profileKey}:${requestKey(request)}`;
      const timer = window.setTimeout(() => {
        userInputAutoResolutionTimersRef.current.delete(timerKey);
        const activeEntry = taskChatEntriesRef.current.find(
          (entry) => entry.clientId === control.clientId,
        );
        if (activeEntry) {
          control.queueAdvanceBlocked = true;
          void handleAnswerUserInput(activeEntry, routedUserInputRequest, {
            answers: {},
          });
        }
      }, request.params.autoResolutionMs);
      userInputAutoResolutionTimersRef.current.set(timerKey, timer);
    }
  }

  function clearUserInputAutoResolutionTimer(
    profileKey: CodexProfileKey,
    requestId: string | number,
  ) {
    const key = `${profileKey}:${String(requestId)}`;
    const timer = userInputAutoResolutionTimersRef.current.get(key);
    if (timer !== undefined) window.clearTimeout(timer);
    userInputAutoResolutionTimersRef.current.delete(key);
  }

  async function persistRunEvent(
    control: ActiveRunControl,
    eventType: "notification" | "server-request" | "process" | "client-action",
    method: string | null,
    payload: unknown,
  ) {
    await flushBufferedRunEvents();
    const input = createRunEventInput(control, eventType, method, payload);
    if (input) await appendRunEvent(input);
  }

  async function handleResolveRequest(
    request: CodexApprovalRequest,
    choice: ApprovalChoice,
  ) {
    const control = findRunControlForIds(
      request.profileKey,
      request.threadId,
      request.turnId,
    );
    if (!control) {
      const attention = unroutedApprovalsRef.current.find(
        (candidate) => candidate.request.key === request.key,
      );
      const currentRequest = attention?.request;
      const selectedChoice = currentRequest?.choices.find(
        (candidate) => candidate.id === choice.id,
      );
      if (
        !attention ||
        !currentRequest ||
        (currentRequest.status !== "pending" &&
          currentRequest.status !== "error") ||
        !selectedChoice
      ) {
        return;
      }

      setUnroutedApprovals((current) =>
        current.map((candidate) =>
          candidate.request.key === currentRequest.key
            ? {
                ...candidate,
                request: {
                  ...candidate.request,
                  status: "submitting",
                  selectedChoiceId: selectedChoice.id,
                  error: null,
                },
              }
            : candidate,
        ),
      );
      try {
        if (currentRequest.profileKey === DEFAULT_CODEX_PROFILE_KEY) {
          await resolveDefaultCodexServerRequest(
            currentRequest.id,
            currentRequest.requestToken,
            selectedChoice.response,
          );
        } else {
          await resolveCodexServerRequest(
            attention.accountId,
            currentRequest.id,
            currentRequest.requestToken,
            selectedChoice.response,
          );
        }
        void removeAgentNotification(
          approvalNotificationEventKey(currentRequest),
        ).catch(() => undefined);
        setUnroutedApprovals((current) =>
          current.map((candidate) =>
            candidate.request.key === currentRequest.key
              ? {
                  ...candidate,
                  request: {
                    ...candidate.request,
                    status: "awaiting-resolution",
                    error: null,
                  },
                }
              : candidate,
          ),
        );
      } catch (error) {
        setUnroutedApprovals((current) =>
          current.map((candidate) =>
            candidate.request.key === currentRequest.key
              ? {
                  ...candidate,
                  request: {
                    ...candidate.request,
                    status: "error",
                    error:
                      error instanceof Error
                        ? error.message
                        : String(error),
                  },
                }
              : candidate,
          ),
        );
      }
      return;
    }
    const accountId = control.accountId;
    const profileKey = control.profileKey;
    const currentRequest = control.runView.approvalRequests.find(
      (candidate) => candidate.key === request.key,
    );
    const requestSubagent = subagentStore.findByThread(
      currentRequest?.profileKey ?? request.profileKey,
      currentRequest?.threadId ?? request.threadId,
    );
    const requestBelongsToSubagent =
      requestSubagent?.ownerClientId === control.clientId;
    const selectedChoice = currentRequest?.choices.find(
      (candidate) => candidate.id === choice.id,
    );
    if (
      !currentRequest ||
      (currentRequest.status !== "pending" && currentRequest.status !== "error") ||
      !selectedChoice ||
      currentRequest.profileKey !== profileKey
    ) {
      return;
    }
    if (
      currentRequest.threadId &&
      control?.threadId &&
      currentRequest.threadId !== control.threadId &&
      !requestBelongsToSubagent
    ) {
      updateRunControlView(control, (current) =>
        markApprovalError(
          current,
          request.key,
          "This approval belongs to a different Codex thread.",
        ),
      );
      return;
    }
    if (
      currentRequest.turnId &&
      ((requestBelongsToSubagent &&
        requestSubagent?.childTurnId &&
        currentRequest.turnId !== requestSubagent.childTurnId) ||
        (!requestBelongsToSubagent &&
          control?.turnId &&
          currentRequest.turnId !== control.turnId))
    ) {
      updateRunControlView(control, (current) =>
        markApprovalError(
          current,
          currentRequest.key,
          "This approval belongs to a different Codex turn.",
        ),
      );
      return;
    }

    updateRunControlView(control, (current) =>
      markApprovalSubmitting(current, currentRequest.key, selectedChoice.id),
    );
    try {
      if (profileKey === DEFAULT_CODEX_PROFILE_KEY) {
        await resolveDefaultCodexServerRequest(
          currentRequest.id,
          currentRequest.requestToken,
          selectedChoice.response,
        );
      } else {
        await resolveCodexServerRequest(
          accountId,
          currentRequest.id,
          currentRequest.requestToken,
          selectedChoice.response,
        );
      }
      if (selectedChoice.tone === "danger") {
        control.queueAdvanceBlocked = true;
      }
      void removeAgentNotification(
        approvalNotificationEventKey(currentRequest),
      ).catch(() => undefined);
      updateRunControlView(control, (current) =>
        markApprovalAwaitingResolution(current, currentRequest.key),
      );
      if (
        currentRequest.kind === "browser" ||
        currentRequest.kind === "browser-tool"
      ) {
        setRunControlBrowserLifecycle(control, "running");
        void refreshRunControlBrowserState(control);
      }
    } catch (error) {
      updateRunControlView(control, (current) =>
        markApprovalError(
          current,
          currentRequest.key,
          error instanceof Error ? error.message : String(error),
        ),
      );
    }
  }

  async function handleAnswerUserInput(
    entry: TaskChatEntry,
    request: NativeUserInputRequest,
    response: UserInputResponse,
  ) {
    const actionKey = `${request.params.threadId}:${request.params.turnId}:${requestKey(request)}`;
    if (requestActionLocksRef.current.has(actionKey)) return;
    const control = activeRunRegistry.get(entry.clientId) ?? null;
    if (!control) {
      setStatusMessage("That Codex question is no longer active.");
      return;
    }
    const activeEntryId = control.clientId;
    const accountId = control.accountId;
    const profileKey = control.profileKey;
    const requestSubagent = subagentStore.findByThread(
      profileKey,
      request.params.threadId,
    );
    const requestBelongsToSubagent =
      requestSubagent?.ownerClientId === control.clientId;
    const matchesThread =
      request.params.threadId === control.threadId ||
      requestBelongsToSubagent;
    const matchesTurn = requestBelongsToSubagent
      ? !requestSubagent?.childTurnId ||
        requestSubagent.childTurnId === request.params.turnId
      : request.params.turnId === control.turnId;
    if (
      activeEntryId !== entry.clientId ||
      !matchesThread ||
      !matchesTurn ||
      !control.runView.serverRequests.some(
        (candidate) => String(candidate.id) === String(request.id),
      )
    ) {
      setStatusMessage("That Codex question is no longer active.");
      return;
    }
    requestActionLocksRef.current.add(actionKey);

    const requestToken = request.requestToken;
    if (!requestToken) {
      requestActionLocksRef.current.delete(actionKey);
      setStatusMessage("That Codex question is missing its native request token.");
      return;
    }

    updateRunControlView(control, (current) =>
      setServerRequestSubmissionState(current, request, "submitting"),
    );
    clearUserInputAutoResolutionTimer(profileKey, request.id);
    try {
      if (profileKey === DEFAULT_CODEX_PROFILE_KEY) {
        await resolveDefaultCodexServerRequest(request.id, requestToken, response);
      } else {
        await resolveCodexServerRequest(accountId, request.id, requestToken, response);
      }
      void removeAgentNotification(
        userInputNotificationEventKey(profileKey, request),
      ).catch(() => undefined);
    } catch (error) {
      requestActionLocksRef.current.delete(actionKey);
      updateRunControlView(control, (current) =>
        setServerRequestSubmissionState(current, request, "failed"),
      );
      setStatusMessage(
        `Could not send Codex input: ${error instanceof Error ? error.message : String(error)}`,
      );
      return;
    }

    try {
      await persistRunEvent(control, "client-action", request.method, {
        requestId: request.id,
        threadId: request.params.threadId,
        turnId: request.params.turnId,
        response: {
          answers: Object.fromEntries(
            request.params.questions.map((question) => [
              question.id,
              question.isSecret
                ? { answers: ["<redacted>"] }
                : response.answers[question.id] ?? { answers: [] },
            ]),
          ),
        },
      });
    } catch (error) {
      setStatusMessage(
        `Codex accepted the answer, but Orchestrator could not save its audit event: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
    updateRunControlView(control, (current) =>
      resolveServerRequest(current, request.id),
    );
    if (
      requestBelongsToSubagent &&
      requestSubagent &&
      !subagentHasPendingInteractions(control, requestSubagent.childThreadId)
    ) {
      setSubagentAttention(control, requestSubagent.childThreadId, false);
    }
    requestActionLocksRef.current.delete(actionKey);
  }

  function choosePlanImplementationModel(
    availableModels: CodexModel[],
    preferredModel: string | null | undefined,
  ) {
    return (
      availableModels.find(
        (model) =>
          model.id === preferredModel || model.model === preferredModel,
      ) ??
      availableModels.find((model) => model.isDefault) ??
      availableModels[0] ??
      null
    );
  }

  function choosePlanImplementationReasoning(
    model: CodexModel | null,
    preferredEffort: string | null | undefined,
  ) {
    if (!model) return null;
    const supported = model.supportedReasoningEfforts.map(
      (option) => option.reasoningEffort,
    );
    if (preferredEffort && supported.includes(preferredEffort)) {
      return preferredEffort;
    }
    if (supported.includes(model.defaultReasoningEffort)) {
      return model.defaultReasoningEffort;
    }
    return supported[0] ?? null;
  }

  async function listValidatedPlanImplementationModels(
    profileKey: CodexProfileKey,
    accountId: number,
  ) {
    await ensureCodexProfileConnected(profileKey, accountId);
    if (profileKey !== DEFAULT_CODEX_PROFILE_KEY) {
      const authState = await refreshAccountState(accountId, true);
      if (
        shouldBlockRunForAuth(
          authState.requiresOpenaiAuth,
          authState.account,
        )
      ) {
        throw new Error("Sign in to the selected Codex account first.");
      }
    }
    return listCodexModelsForProfile(profileKey, accountId);
  }

  function closePlanImplementationDialog() {
    planImplementationDialogRequestRef.current += 1;
    setPlanImplementationDialog(null);
    const returnTarget = planImplementationReturnFocusRef.current;
    planImplementationReturnFocusRef.current = null;
    window.requestAnimationFrame(() => {
      if (returnTarget?.isConnected) {
        returnTarget.focus({ preventScroll: true });
      }
    });
  }

  function trapPlanImplementationDialogFocus(
    event: ReactKeyboardEvent<HTMLElement>,
  ) {
    if (event.key !== "Tab") return;
    const dialog = planImplementationDialogRef.current;
    if (!dialog || !dialog.contains(event.target as Node)) return;
    const focusable = Array.from(
      dialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [role="combobox"]:not([aria-disabled="true"]), [href], input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ).filter(
      (element) =>
        element.getAttribute("aria-hidden") !== "true" && !element.hidden,
    );
    if (focusable.length === 0) {
      event.preventDefault();
      dialog.focus({ preventScroll: true });
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus({ preventScroll: true });
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus({ preventScroll: true });
    }
  }

  async function openPlanImplementationDialog(entry: TaskChatEntry) {
    const workspace = selectedWorkspaceRef.current;
    const session = workspace
      ? workspaceChatSessionsRef.current[workspace.id] ?? null
      : null;
    if (
      !workspace ||
      !session ||
      entry.chatId === null ||
      session.chatId !== entry.chatId ||
      !session.threadId
    ) {
      setStatusMessage("Reopen the plan's chat before implementing it.");
      return;
    }
    if (selectedRunIsActiveNow()) {
      setStatusMessage("Wait for the active turn to finish first.");
      return;
    }

    const preferredSettings =
      entry.executionSettings?.source === "captured"
        ? entry.executionSettings.settings
        : null;
    const preferredProfileKey = preferredSettings?.profileKey ?? null;
    const profileKey: CodexProfileKey =
      preferredProfileKey === DEFAULT_CODEX_PROFILE_KEY &&
      session.profileKey !== DEFAULT_CODEX_PROFILE_KEY
        ? session.profileKey ?? DEFAULT_CODEX_PROFILE_KEY
        : preferredProfileKey ??
          session.profileKey ??
          DEFAULT_CODEX_PROFILE_KEY;
    const accountId =
      profileKey === DEFAULT_CODEX_PROFILE_KEY
        ? 0
        : accountIdFromProfileKey(profileKey);
    if (accountId === null) {
      setStatusMessage("The plan's Codex account is unavailable.");
      return;
    }

    const requestId = planImplementationDialogRequestRef.current + 1;
    planImplementationDialogRequestRef.current = requestId;
    if (document.activeElement instanceof HTMLElement) {
      planImplementationReturnFocusRef.current = document.activeElement;
    }
    setPlanImplementationDialog({
      requestId,
      workspaceId: workspace.id,
      chatId: session.chatId,
      entry,
      allowDefaultProfile:
        session.profileKey === DEFAULT_CODEX_PROFILE_KEY,
      accountId,
      profileKey,
      models: [],
      selectedModelId: null,
      reasoningEffort: preferredSettings?.reasoningEffort ?? null,
      status: "loading",
      error: null,
    });

    try {
      const availableModels = await listValidatedPlanImplementationModels(
        profileKey,
        accountId,
      );
      if (planImplementationDialogRequestRef.current !== requestId) return;
      const selectedModel = choosePlanImplementationModel(
        availableModels,
        preferredSettings?.model ??
          (models.find((model) => model.id === selectedModelId)?.model ?? null),
      );
      setPlanImplementationDialog((current) =>
        current?.requestId === requestId
          ? {
              ...current,
              models: availableModels,
              selectedModelId: selectedModel?.id ?? null,
              reasoningEffort: choosePlanImplementationReasoning(
                selectedModel,
                current.reasoningEffort,
              ),
              status: "idle",
              error:
                selectedModel === null
                  ? "No compatible Codex models are available for this account."
                  : null,
            }
          : current,
      );
    } catch (error) {
      if (planImplementationDialogRequestRef.current !== requestId) return;
      setPlanImplementationDialog((current) =>
        current?.requestId === requestId
          ? {
              ...current,
              status: "idle",
              error:
                error instanceof Error
                  ? error.message
                  : "Could not load models for this account.",
            }
          : current,
      );
    }
  }

  async function changePlanImplementationAccount(value: string) {
    const current = planImplementationDialog;
    if (!current || current.status !== "idle") return;
    const accountId = value === "default" ? 0 : Number(value);
    const profileKey: CodexProfileKey =
      value === "default"
        ? DEFAULT_CODEX_PROFILE_KEY
        : (`account:${accountId}` as CodexProfileKey);
    if (
      (value === "default" && !current.allowDefaultProfile) ||
      (value !== "default" &&
        !codexAccountsRef.current.some(
          (account) =>
            account.id === accountId && account.status === "signed_in",
        ))
    ) {
      return;
    }

    const requestId = planImplementationDialogRequestRef.current + 1;
    planImplementationDialogRequestRef.current = requestId;
    setPlanImplementationDialog({
      ...current,
      requestId,
      accountId,
      profileKey,
      models: [],
      selectedModelId: null,
      status: "loading",
      error: null,
    });
    try {
      const availableModels = await listValidatedPlanImplementationModels(
        profileKey,
        accountId,
      );
      if (planImplementationDialogRequestRef.current !== requestId) return;
      const previousModel = current.models.find(
        (model) => model.id === current.selectedModelId,
      );
      const selectedModel = choosePlanImplementationModel(
        availableModels,
        previousModel?.model,
      );
      setPlanImplementationDialog((latest) =>
        latest?.requestId === requestId
          ? {
              ...latest,
              models: availableModels,
              selectedModelId: selectedModel?.id ?? null,
              reasoningEffort: choosePlanImplementationReasoning(
                selectedModel,
                current.reasoningEffort,
              ),
              status: "idle",
              error:
                selectedModel === null
                  ? "No compatible Codex models are available for this account."
                  : null,
            }
          : latest,
      );
    } catch (error) {
      if (planImplementationDialogRequestRef.current !== requestId) return;
      setPlanImplementationDialog((latest) =>
        latest?.requestId === requestId
          ? {
              ...latest,
              status: "idle",
              error:
                error instanceof Error
                  ? error.message
                  : "Could not load models for this account.",
            }
          : latest,
      );
    }
  }

  function changePlanImplementationModel(modelId: string) {
    setPlanImplementationDialog((current) => {
      if (!current || current.status !== "idle") return current;
      const model =
        current.models.find((candidate) => candidate.id === modelId) ?? null;
      return {
        ...current,
        selectedModelId: model?.id ?? null,
        reasoningEffort: choosePlanImplementationReasoning(
          model,
          current.reasoningEffort,
        ),
      };
    });
  }

  function confirmPlanImplementation() {
    const dialog = planImplementationDialog;
    const workspace = selectedWorkspaceRef.current;
    const session = workspace
      ? workspaceChatSessionsRef.current[workspace.id] ?? null
      : null;
    if (
      !dialog ||
      dialog.status !== "idle" ||
      !workspace ||
      workspace.id !== dialog.workspaceId ||
      !session ||
      session.chatId !== dialog.chatId ||
      selectedRunIsActiveNow()
    ) {
      return;
    }
    const model =
      dialog.models.find(
        (candidate) => candidate.id === dialog.selectedModelId,
      ) ?? null;
    if (!model) {
      setPlanImplementationDialog({
        ...dialog,
        error: "Choose an available model before implementing the plan.",
      });
      return;
    }
    if (
      dialog.reasoningEffort &&
      !model.supportedReasoningEfforts.some(
        (option) => option.reasoningEffort === dialog.reasoningEffort,
      )
    ) {
      setPlanImplementationDialog({
        ...dialog,
        error:
          "Choose a reasoning level supported by the selected model.",
      });
      return;
    }

    if (dialog.profileKey !== session.profileKey) {
      setPendingAccountHandoff({
        workspaceId: workspace.id,
        chatId: session.chatId,
        fromProfileKey: session.profileKey,
        fromThreadId: session.threadId,
        targetAccountId: dialog.accountId,
        targetProfileKey: dialog.profileKey,
      });
    } else {
      clearPendingAccountHandoff(session.chatId);
    }

    setPlanImplementationDialog({ ...dialog, status: "starting", error: null });
    const started = launchPlanFollowUp(
      dialog.entry,
      "Implement the plan.",
      "plan-implementation",
      {
        accountId: dialog.accountId,
        profileKey: dialog.profileKey,
        model,
        reasoningEffort: dialog.reasoningEffort,
      },
    );
    if (started) {
      closePlanImplementationDialog();
    } else {
      setPlanImplementationDialog((current) =>
        current?.requestId === dialog.requestId
          ? {
              ...current,
              status: "idle",
              error: "The implementation could not be started.",
            }
          : current,
      );
    }
  }

  function launchPlanFollowUp(
    entry: TaskChatEntry,
    promptText: string,
    intent: "plan-revision" | "plan-implementation",
    executionSelection?: PlanFollowUpExecutionSelection,
  ): boolean {
    const workspace = selectedWorkspaceRef.current;
    const chatSession = workspace
      ? workspaceChatSessionsRef.current[workspace.id] ?? null
      : null;
    if (
      !workspace ||
      !chatSession ||
      entry.chatId === null ||
      chatSession.chatId !== entry.chatId ||
      !chatSession.threadId
    ) {
      setStatusMessage("Reopen the plan's chat before continuing this workflow.");
      return false;
    }
    if (selectedRunIsActiveNow()) {
      setStatusMessage("Wait for the active turn to finish first.");
      return false;
    }
    if (entry.runView.nativePlan.reviewState !== "available") {
      setStatusMessage("That plan is no longer awaiting review.");
      return false;
    }
    const pendingHandoff =
      pendingAccountHandoffsRef.current[chatSession.chatId] ?? null;
    if (
      pendingHandoff &&
      (pendingHandoff.workspaceId !== workspace.id ||
        pendingHandoff.fromProfileKey !== chatSession.profileKey ||
        pendingHandoff.fromThreadId !== chatSession.threadId)
    ) {
      clearPendingAccountHandoff(pendingHandoff.chatId);
      setStatusMessage(
        "The chat changed after the account switch was confirmed. Select the account again.",
      );
      return false;
    }
    const sessionProfileKey = chatSession.profileKey;
    const profileKey: CodexProfileKey =
      executionSelection?.profileKey ??
      pendingHandoff?.targetProfileKey ??
      sessionProfileKey ??
      DEFAULT_CODEX_PROFILE_KEY;
    const usesDefaultProfile = profileKey === DEFAULT_CODEX_PROFILE_KEY;
    const sessionAccountId =
      profileKey?.startsWith("account:")
        ? Number(profileKey.slice("account:".length))
        : null;
    const accountId = executionSelection?.accountId ?? (usesDefaultProfile
      ? 0
      : Number.isFinite(sessionAccountId)
        ? sessionAccountId
        : selectedAccountIdRef.current);
    const account = usesDefaultProfile
      ? null
      : codexAccountsRef.current.find((candidate) => candidate.id === accountId) ?? null;
    if (!usesDefaultProfile && (!accountId || !account)) {
      setStatusMessage("Sign in to the plan's Codex account before continuing.");
      return false;
    }
    const accountHandoff: AccountHandoffRunStrategy | null =
      pendingHandoff && pendingHandoff.targetProfileKey !== chatSession.profileKey
        ? {
            ...pendingHandoff,
            adoptingExternalChat:
              chatSession.origin === "codex_external" &&
              chatSession.profileKey === DEFAULT_CODEX_PROFILE_KEY,
          }
        : null;
    if (planActionLocksRef.current.has(entry.clientId)) return false;
    planActionLocksRef.current.add(entry.clientId);
    const selectedModel =
      executionSelection?.model ??
      models.find((option) => option.id === selectedModelId) ??
      models[0] ??
      null;
    const followUpUseOss = executionSelection ? false : useOss;
    const model = executionSelection
      ? selectedModel?.model ?? null
      : useOss || modelLoadError
        ? null
        : selectedModel?.model ?? null;
    const reasoningEffort = executionSelection
      ? executionSelection.reasoningEffort
      : selectedReasoningEffort;
    void removeAgentNotification(
      planNotificationEventKey(profileKey, entry),
    ).catch(() => undefined);

    updateTaskChatEntryRunView(entry.clientId, (current) =>
      updateNativePlanReview(
        current,
        intent === "plan-revision" ? "superseded" : "approved",
        "transitioning",
      ),
    );
    if (entry.runId !== null) {
      void updateRun(entry.runId, {
        planReviewState:
          intent === "plan-revision" ? "superseded" : "approved",
      });
    }
    setPlanMode(intent === "plan-revision");
    setGoalMode(false);

    const mode = intent === "plan-revision" ? "plan" : "run";
    const executionSettings = createRunExecutionSettings({
      accountId: accountId ?? 0,
      profileKey,
      selectedRepositoryPath:
        selectedGitRepository?.repository.rootPath ?? null,
      selectedBranch,
      mode,
      intent,
      accessMode,
      computerUseEnabled,
      model,
      reasoningEffort: model ? reasoningEffort : null,
      useOss: followUpUseOss,
      ossProvider,
      contextFiles: [],
      selectedSkills: [],
      goalMode: false,
    });
    const snapshot: RunSetupSnapshot = {
      promptText,
      promptFallback: promptText,
      workspace: { ...workspace },
      accountId: accountId ?? 0,
      account: account ? { ...account } : null,
      profileKey,
      chatOrigin: chatSession.origin,
      externalThreadId: chatSession.externalThreadId,
      selectedRepositoryPath:
        selectedGitRepository?.repository.rootPath ?? null,
      selectedBranch,
      cachedPreflight: null,
      mode,
      intent,
      clientUserMessageId: createStableClientMessageId(),
      access: accessSettings({ accessMode }),
      computerUseEnabled,
      model,
      effort: model ? reasoningEffort : null,
      useOss: followUpUseOss,
      ossProvider,
      improvedPrompt: promptText,
      contextFiles: [],
      selectedSkills: [],
      goalMode: false,
      loginState,
      chatId: entry.chatId,
      threadId: accountHandoff ? null : chatSession.threadId,
      turnIndex: chatSession.nextTurnIndex,
      restorePromptOnSetupFailure: false,
      sourcePlanEntry: entry,
      defaultCollaborationMode: chatSession.savedDefaultCollaborationMode,
      executionSettings,
      threadStrategy: accountHandoff
        ? { kind: "handoff", handoff: accountHandoff }
        : { kind: "resume" },
      handoffContextBudgetTokens: accountHandoff
        ? Math.max(
            1_024,
            Math.floor(
              (getCodexModelContextWindow(selectedModel) ?? 128_000) * 0.25,
            ),
          )
        : undefined,
    };
    const runControl = beginOptimisticRun(snapshot);
    scheduleRunSetup(runControl, snapshot);
    return true;
  }

  function handleImplementPlan(entry: TaskChatEntry) {
    void openPlanImplementationDialog(entry);
  }

  function handleRevisePlan(entry: TaskChatEntry, revision: string) {
    return launchPlanFollowUp(entry, revision, "plan-revision");
  }

  async function handleCancelPlan(entry: TaskChatEntry) {
    if (entry.runView.nativePlan.reviewState !== "available") {
      setStatusMessage("That plan is no longer awaiting review.");
      return;
    }
    const workspace = selectedWorkspaceRef.current;
    const session = workspace
      ? workspaceChatSessionsRef.current[workspace.id] ?? null
      : null;
    if (!session?.threadId || entry.chatId === null || session.chatId !== entry.chatId) {
      setStatusMessage("Reopen the plan's chat before cancelling it.");
      return;
    }
    const usesDefaultProfile =
      session.profileKey === DEFAULT_CODEX_PROFILE_KEY;
    const sessionAccountId = accountIdFromProfileKey(session.profileKey);
    const accountId = usesDefaultProfile
      ? 0
      : Number.isFinite(sessionAccountId)
        ? sessionAccountId
        : selectedAccountIdRef.current;
    if (!usesDefaultProfile && !accountId) return;
    if (planActionLocksRef.current.has(entry.clientId)) return;
    planActionLocksRef.current.add(entry.clientId);
    updateTaskChatEntryRunView(entry.clientId, (current) =>
      updateNativePlanReview(current, "submitting", "cancelling"),
    );
    const profileKey: CodexProfileKey =
      session.profileKey ??
      (`account:${accountId}` as CodexProfileKey);
    try {
      await ensureCodexProfileConnected(profileKey, accountId ?? 0);
      const modes = await collaborationModesForRun(
        profileKey,
        accountId ?? 0,
        selectedModel?.model ?? null,
        selectedReasoningEffort,
        false,
      );
      await codexRpcForProfile(profileKey, accountId ?? 0, "thread/settings/update", {
        threadId: session.threadId,
        collaborationMode: session.savedDefaultCollaborationMode ?? modes.default,
      });
      updateTaskChatEntryRunView(entry.clientId, (current) =>
        updateNativePlanReview(current, "cancelled", "cancelled"),
      );
      void removeAgentNotification(
        planNotificationEventKey(profileKey, entry),
      ).catch(() => undefined);
      if (entry.runId !== null) {
        await updateRun(entry.runId, { planReviewState: "cancelled" });
      }
      await updateChat(entry.chatId, {
        status: "completed",
        collaborationMode: "default",
        savedDefaultCollaborationModeJson: null,
      });
      await advanceChatConversationRevision(entry.chatId, {
        queueOwned: false,
      }).catch(() => undefined);
      const pendingQueue = await refreshPromptQueue(entry.chatId).catch(
        () => [],
      );
      if (pendingQueue.length > 0) {
        if (
          promptQueuePauseReasonsRef.current.get(entry.chatId) === "workflow"
        ) {
          setPromptQueuePaused(entry.chatId, false);
        }
        if (!pausedPromptQueueChatIdsRef.current.has(entry.chatId)) {
          schedulePromptQueueDispatch(entry.chatId);
        }
      }
      setPlanMode(false);
      setStatusMessage("Plan cancelled. Codex returned to Default mode.");
      planActionLocksRef.current.delete(entry.clientId);
    } catch (error) {
      planActionLocksRef.current.delete(entry.clientId);
      updateTaskChatEntryRunView(entry.clientId, (current) =>
        updateNativePlanReview(current, "available", "awaiting-approval"),
      );
      setStatusMessage(
        `Could not cancel Plan mode: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  function requestWorkspaceDirectoryEntries(
    workspace: Workspace,
    directoryPath: string,
    force = false,
  ) {
    const cacheKey = workspaceCacheKey(workspace.path, directoryPath);
    const existingRequest = directoryRequestCache.current.get(cacheKey);
    if (existingRequest && !force) {
      return {
        cacheKey,
        generation: directoryRequestGenerations.current.get(cacheKey) ?? 0,
        request: existingRequest,
      };
    }

    const generation =
      (directoryRequestGenerations.current.get(cacheKey) ?? 0) + 1;
    directoryRequestGenerations.current.set(cacheKey, generation);

    let request: Promise<WorkspaceTreeEntry[]>;
    request = listWorkspaceDirectory(workspace.path, directoryPath).finally(() => {
      if (directoryRequestCache.current.get(cacheKey) === request) {
        directoryRequestCache.current.delete(cacheKey);
      }
    });
    directoryRequestCache.current.set(cacheKey, request);

    return { cacheKey, generation, request };
  }

  function workspaceDirectoryRequestIsCurrent(
    cacheKey: string,
    generation: number,
  ) {
    return directoryRequestGenerations.current.get(cacheKey) === generation;
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

    const { generation, request } = requestWorkspaceDirectoryEntries(
      workspace,
      directoryPath,
      force,
    );

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
      if (!workspaceDirectoryRequestIsCurrent(cacheKey, generation)) {
        return;
      }
      directoryEntriesCache.current.set(cacheKey, entries);
      setDirectoryStates((current) => ({
        ...current,
        [directoryPath]: { status: "loaded", entries, error: null },
      }));
    } catch (error) {
      if (!workspaceDirectoryRequestIsCurrent(cacheKey, generation)) {
        return;
      }
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

  async function refreshWorkspaceDirectoryInBackground(
    workspace: Workspace,
    directoryPath: string,
    force = false,
  ) {
    const cacheKey = workspaceCacheKey(workspace.path, directoryPath);
    const { generation, request } = requestWorkspaceDirectoryEntries(
      workspace,
      directoryPath,
      force,
    );

    try {
      const entries = await request;
      if (!workspaceDirectoryRequestIsCurrent(cacheKey, generation)) {
        return;
      }
      const cachedEntries = directoryEntriesCache.current.get(cacheKey);
      if (workspaceTreeEntriesEqual(cachedEntries, entries)) return;

      directoryEntriesCache.current.set(cacheKey, entries);
      startTransition(() => {
        setDirectoryStates((current) => {
          const existing = current[directoryPath];
          if (
            existing?.status === "loaded" &&
            existing.error === null &&
            workspaceTreeEntriesEqual(existing.entries, entries)
          ) {
            return current;
          }
          return {
            ...current,
            [directoryPath]: { status: "loaded", entries, error: null },
          };
        });
      });
    } catch {
      // Background polling is intentionally quiet. Explicit expansion still
      // exposes directory errors through loadWorkspaceDirectory().
    }
  }

  async function refreshWorkspaceDirectoriesAfterRun(workspace: Workspace) {
    const cachePrefix = `${workspace.path}\u0000`;
    const directoryPaths = new Set<string>([workspace.path]);

    for (const cacheKey of directoryEntriesCache.current.keys()) {
      if (cacheKey.startsWith(cachePrefix)) {
        directoryPaths.add(cacheKey.slice(cachePrefix.length));
      }
    }
    for (const cacheKey of directoryRequestCache.current.keys()) {
      if (cacheKey.startsWith(cachePrefix)) {
        directoryPaths.add(cacheKey.slice(cachePrefix.length));
      }
    }

    await Promise.all(
      [...directoryPaths].map((directoryPath) =>
        refreshWorkspaceDirectoryInBackground(workspace, directoryPath, true),
      ),
    );
  }

  async function refreshVisibleWorkspaceDirectories(workspace: Workspace) {
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

    for (const directoryPath of visibleDirectoryPaths) {
      await refreshWorkspaceDirectoryInBackground(workspace, directoryPath);
    }
  }

  async function handleOpenWebPreview(
    entry: TaskChatEntry,
    preview: RunWebPreview,
  ) {
    const control = activeRunRegistry.get(entry.clientId);
    const nextPreview = await recheckWebPreview(preview, {
      control,
      entryClientId: entry.clientId,
      runId: entry.runId,
    });
    if (nextPreview.availability !== "available") {
      throw new Error("This web preview is no longer running.");
    }
    await openUrl(nextPreview.url);
  }

  async function handleReviewEditedFile(
    entry: TaskChatEntry,
    editedFile: RunEditedFile,
  ) {
    const workspace = selectedWorkspaceRef.current;
    if (!workspace || workspace.id !== entry.workspaceId) {
      throw new Error("Open the workspace for this edit before reviewing it");
    }

    const file = workspaceFileEntryFromResponseLink(editedFile.path, workspace);
    if (!file) {
      throw new Error("That edited file is outside the selected workspace");
    }

    await openWorkspaceFilePreview(workspace, file, {
      forceRefresh: true,
      mode: "diff",
    });
  }

  async function handleUndoEditedFiles(entry: TaskChatEntry) {
    const workspace = selectedWorkspaceRef.current;
    if (!workspace || workspace.id !== entry.workspaceId) {
      throw new Error("Open the workspace for this edit before undoing it");
    }
    if (entry.runView.fileChangesReverted) {
      return;
    }
    if (!entry.runView.latestDiff.trim()) {
      throw new Error("The exact edit diff is unavailable for this run");
    }
    if (
      [...activeRunRegistry.values()].some(
        (control) =>
          isActiveRunControl(control) && control.workspaceId === workspace.id,
      )
    ) {
      throw new Error("Stop the active agent in this workspace before undoing changes");
    }

    const result = await undoWorkspaceGitDiff(
      workspace.path,
      entry.runView.latestDiff,
    );
    updateTaskChatEntryRunView(entry.clientId, (current) => ({
      ...current,
      fileChangesReverted: true,
    }));
    invalidateWorkspacePreviewCaches(workspace, undefined, {
      reloadOpenPreview: true,
    });
    await Promise.all([
      refreshWorkspaceGitStatus(workspace, {
        showLoading: false,
        force: true,
      }),
      refreshWorkspaceDirectoriesAfterRun(workspace),
    ]);
    setStatusMessage(result.message);
  }

  const handleGoalModeChange = useCallback((nextGoalMode: boolean) => {
    setGoalMode(nextGoalMode);
    if (nextGoalMode) {
      setPlanMode(false);
    }
  }, []);

  async function terminateSelectedGoal(
    control: ActiveRunControl,
    action: Extract<GoalProgressAction, "stopping" | "editing">,
  ) {
    if (
      !control.threadId ||
      !control.goal ||
      control.goalActionPending ||
      !isActiveRunControl(control)
    ) {
      return false;
    }

    const actionLabel =
      action === "editing" ? "prepare the goal for editing" : "stop the goal";
    setGoalTermination({
      workspaceId: control.workspaceId,
      clientId: control.clientId,
      action,
    });
    control.goalActionPending = action;
    control.goalActionError = null;
    activeRunRegistry.touch();

    try {
      await clearThreadGoalForProfile(
        control.profileKey,
        control.accountId,
        control.threadId,
      );
      if (
        control.stopped ||
        activeRunRegistry.get(control.clientId) !== control
      ) {
        return false;
      }

      control.acceptsThreadContinuation = false;
      control.goal = null;
      control.goalActionPending = null;
      control.goalActionError = null;
      activeRunRegistry.touch();

      const result = await stopActiveRun(control);
      return result.stopped && result.goalCleared;
    } catch (error) {
      const message = `Could not ${actionLabel}: ${
        error instanceof Error ? error.message : String(error)
      }`;
      if (
        !control.stopped &&
        activeRunRegistry.get(control.clientId) === control
      ) {
        control.goalActionPending = null;
        control.goalActionError = message;
        activeRunRegistry.touch();
      }
      setStatusMessage(message);
      return false;
    } finally {
      setGoalTermination((current) =>
        current?.clientId === control.clientId && current.action === action
          ? null
          : current,
      );
    }
  }

  async function stopSelectedGoal() {
    const control = selectedActiveRunControl;
    if (!control) return;
    if (await terminateSelectedGoal(control, "stopping")) {
      setGoalMode(false);
    }
  }

  function focusGoalObjectiveInComposer(
    workspaceId: number,
    objective: string,
  ) {
    flushSync(() => {
      setPlanMode(false);
      setGoalMode(true);
      updateRememberedWorkspaceComposer(workspaceId, {
        prompt: objective,
      });
    });
    preflightRef.current = null;

    window.requestAnimationFrame(() => {
      if (selectedWorkspaceRef.current?.id !== workspaceId) return;
      const textarea = taskComposerPromptRef.current;
      if (!textarea) return;
      textarea.focus({ preventScroll: true });
      textarea.setSelectionRange(0, textarea.value.length);
    });
  }

  async function editSelectedGoal(candidate: GoalEditCandidate) {
    const control = activeRunRegistry.get(candidate.clientId) ?? null;
    if (
      !control ||
      selectedWorkspaceRef.current?.id !== candidate.workspaceId ||
      control.workspaceId !== candidate.workspaceId ||
      control.goal?.objective !== candidate.objective
    ) {
      setGoalEditCandidate(null);
      setStatusMessage("That goal changed before it could be edited.");
      return;
    }

    setGoalEditCandidate((current) =>
      current?.clientId === candidate.clientId
        ? { ...current, status: "stopping", error: null }
        : current,
    );
    const stopped = await terminateSelectedGoal(control, "editing");
    if (!stopped) {
      setGoalEditCandidate((current) =>
        current?.clientId === candidate.clientId
          ? {
              ...current,
              status: "idle",
              error: "The goal could not be stopped. Try again.",
            }
          : current,
      );
      return;
    }

    setGoalEditCandidate(null);
    focusGoalObjectiveInComposer(candidate.workspaceId, candidate.objective);
    setStatusMessage("Goal stopped. Edit the objective, then submit it to continue.");
  }

  function requestEditSelectedGoal() {
    const control = selectedActiveRunControl;
    const objective = control?.goal?.objective.trim() ?? "";
    if (
      !control ||
      !objective ||
      control.goalActionPending ||
      !isActiveRunControl(control)
    ) {
      return;
    }

    const candidate: GoalEditCandidate = {
      workspaceId: control.workspaceId,
      clientId: control.clientId,
      objective,
      status: "idle",
      error: null,
    };
    const currentDraft = promptRef.current.trim();
    if (currentDraft && currentDraft !== objective) {
      setGoalEditCandidate(candidate);
      return;
    }

    void editSelectedGoal(candidate);
  }

  async function updateSelectedGoalStatus(
    status: Extract<ThreadGoalStatus, "active" | "paused">,
  ) {
    const control = selectedActiveRunControl;
    if (
      !control ||
      !control.threadId ||
      !control.goal ||
      control.goalActionPending ||
      !isActiveRunControl(control)
    ) {
      return;
    }

    const action: GoalProgressAction =
      status === "paused" ? "pausing" : "resuming";
    control.goalActionPending = action;
    control.goalActionError = null;
    activeRunRegistry.touch();

    try {
      const response = await updateThreadGoalStatusForProfile(
        control.profileKey,
        control.accountId,
        control.threadId,
        status,
      );
      const goal = parseThreadGoal(response.goal, {
        fallbackThreadId: control.threadId,
      });
      if (!goal) {
        throw new Error("Codex returned invalid goal state.");
      }
      if (
        control.stopped ||
        activeRunRegistry.get(control.clientId) !== control
      ) {
        return;
      }
      control.goal = goal;
      control.goalActionError = null;
      activeRunRegistry.touch();

      if (
        control.stopped ||
        activeRunRegistry.get(control.clientId) !== control
      ) {
        return;
      }
      control.goalActionPending = null;
      control.goalActionError = null;
      activeRunRegistry.touch();
    } catch (error) {
      if (activeRunRegistry.get(control.clientId) === control) {
        control.goalActionPending = null;
        control.goalActionError = `Could not ${
          status === "paused" ? "pause" : "resume"
        } goal: ${error instanceof Error ? error.message : String(error)}`;
        activeRunRegistry.touch();
      }
      setStatusMessage(
        control.goalActionError ??
          `Could not ${status === "paused" ? "pause" : "resume"} goal.`,
      );
    }
  }

  const handlePlanModeChange = useCallback((nextPlanMode: boolean) => {
    setPlanMode(nextPlanMode);
    if (nextPlanMode) {
      setGoalMode(false);
    }
  }, []);

  const handleAccessModeChange = useCallback(
    (nextAccessMode: CodexAccessMode) => {
      const warning = accessModeWarning(nextAccessMode);
      if (warning && !window.confirm(warning)) return;
      setAccessMode(nextAccessMode);
      persistCodexAccessPreference({
        accessMode: nextAccessMode,
      });
    },
    [],
  );

  const handleAgentNotificationPreferenceChange = useCallback(
    (key: keyof AgentNotificationPreferences, enabled: boolean) => {
      setAgentNotificationPreferences((current) => ({
        ...current,
        [key]: enabled,
      }));
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;
    void loadGithubConnection()
      .then((connection) => {
        if (!cancelled) {
          setGithubConnection(connection);
          setGithubConnectionPending(connection.status === "connecting");
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setGithubConnection({
            available: false,
            connected: false,
            login: null,
            displayName: null,
            avatarUrl: null,
            status: "unavailable",
            message: error instanceof Error ? error.message : String(error),
            cliVersion: null,
            deviceCode: null,
            verificationUri: null,
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceSurfaceMode]);

  useEffect(() => {
    if (githubConnection?.status !== "connecting") return;
    const interval = window.setInterval(() => {
      void loadGithubConnection()
        .then((connection) => {
          setGithubConnection(connection);
          if (connection.status !== "connecting") {
            setGithubConnectionPending(false);
          }
        })
        .catch(() => undefined);
    }, 1_000);
    return () => window.clearInterval(interval);
  }, [githubConnection?.status]);

  const handleConnectGithub = useCallback(async () => {
    if (githubConnectionPending) return;
    setGithubConnectionPending(true);
    setGithubConnection((current) => ({
      available: current?.available ?? true,
      connected: false,
      login: null,
      displayName: null,
      avatarUrl: null,
      status: "connecting",
      message: "Complete GitHub sign-in in your browser.",
      cliVersion: current?.cliVersion ?? null,
      deviceCode: null,
      verificationUri: null,
    }));
    setStatusMessage("Complete GitHub sign-in in your browser.");
    try {
      const connection = await beginGithubConnection();
      setGithubConnection(connection);
      setStatusMessage(`Connected GitHub as ${connection.login ?? "your account"}.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatusMessage(
        message === "GitHub sign-in cancelled."
          ? message
          : `Could not connect GitHub: ${message}`,
      );
      try {
        setGithubConnection(await loadGithubConnection());
      } catch {
        // Preserve the actionable sign-in error when status recovery is unavailable.
      }
    } finally {
      setGithubConnectionPending(false);
    }
  }, [githubConnectionPending]);

  const handleCancelGithubConnection = useCallback(async () => {
    try {
      await cancelGithubConnection();
      setGithubConnectionPending(false);
      setGithubConnection(await loadGithubConnection());
      setStatusMessage("GitHub sign-in cancelled.");
    } catch (error) {
      setStatusMessage(
        `Could not cancel GitHub sign-in: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }, []);

  const handleDisconnectGithub = useCallback(async () => {
    if (githubConnectionPending) return;
    setGithubConnectionPending(true);
    try {
      await disconnectGithub();
      setGithubConnection(await loadGithubConnection());
      setStatusMessage("GitHub disconnected.");
    } catch (error) {
      setStatusMessage(
        `Could not disconnect GitHub: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    } finally {
      setGithubConnectionPending(false);
    }
  }, [githubConnectionPending]);

  const handleEnableAgentNotifications = useCallback(async () => {
    try {
      const permission = await requestAgentNotificationPermission();
      agentNotificationPermissionRef.current = permission;
      setAgentNotificationPermission(permission);
      setStatusMessage(
        permission === "allowed"
          ? "macOS notifications enabled."
          : permission === "denied"
            ? "macOS notification permission was denied."
            : "Notifications are unavailable in this build.",
      );
    } catch (error) {
      setStatusMessage(
        `Could not enable notifications: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }, []);

  const handleOpenAgentNotificationSettings = useCallback(async () => {
    try {
      await openAgentNotificationSettings();
    } catch (error) {
      setStatusMessage(
        `Could not open notification settings: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }, []);

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

  function getExplorerDragContextFiles() {
    return explorerDragContextFileRef.current
      ? [explorerDragContextFileRef.current]
      : [];
  }

  function contextFileFromWorkspaceEntry(file: WorkspaceTreeEntry): ComposerContextFile {
    return normalizeContextFileMedia({
      path: file.path,
      name: file.name,
      source: "explorer",
      status: "ready",
    });
  }

  function addDroppedContextFiles(files: ComposerContextFile[]) {
    const workspaceId = selectedWorkspaceRef.current?.id;
    if (workspaceId === undefined || files.length === 0) return;

    const added = addDroppedContextFilesToWorkspace(workspaceId, files);
    if (added > 0) {
      setStatusMessage(
        `Added ${added === 1 ? "1 file" : `${added} files`} to context.`,
      );
    }
  }

  function addDroppedContextFilesToWorkspace(
    workspaceId: number,
    files: ComposerContextFile[],
  ) {
    const current =
      selectedWorkspaceRef.current?.id === workspaceId
        ? contextFilesRef.current
        : workspaceTaskMemories.records[workspaceId]?.contextFiles ?? [];
    const next = mergeContextFiles(current, files);
    const added = next.length - current.length;
    if (added > 0) {
      updateRememberedWorkspaceComposer(workspaceId, {
        contextFiles: next,
      });
    }
    return added;
  }

  function handleNativeContextFileDrop(event: NativeContextFileDropEvent) {
    if (event.type === "leave") {
      nativeContextDropPathsRef.current = [];
      setTaskContextDropActiveValue(false);
      return;
    }

    if (event.type === "enter") {
      nativeContextDropPathsRef.current = [...event.paths];
    }

    const paths =
      event.type === "drop"
        ? event.paths
        : nativeContextDropPathsRef.current;
    const overInput =
      activeViewRef.current === "task" &&
      selectedWorkspaceRef.current !== null &&
      paths.length > 0 &&
      isPointInTaskContextDropSurface(event.clientX, event.clientY);

    if (event.type !== "drop") {
      setTaskContextDropActiveValue(overInput);
      return;
    }

    nativeContextDropPathsRef.current = [];
    setTaskContextDropActiveValue(false);
    const workspaceId = selectedWorkspaceRef.current?.id;
    if (!overInput || workspaceId === undefined || paths.length === 0) return;

    const textarea = taskComposerPromptRef.current;
    const selection = textarea
      ? {
          start: textarea.selectionStart,
          end: textarea.selectionEnd,
          direction: textarea.selectionDirection,
        }
      : null;
    void inspectAndAttachNativeContextFiles(
      workspaceId,
      paths,
      textarea,
      selection,
    );
  }

  async function inspectAndAttachNativeContextFiles(
    workspaceId: number,
    paths: string[],
    textarea: HTMLTextAreaElement | null,
    selection: {
      start: number;
      end: number;
      direction: "forward" | "backward" | "none" | null;
    } | null,
  ) {
    try {
      const inspection = await inspectDroppedContextPaths(paths);
      const files = inspection.files.map((file) =>
        normalizeContextFileMedia({
          path: file.path,
          canonicalPath: file.canonicalPath,
          name: file.name,
          source: "picker",
          status: "ready",
        }),
      );
      const added = addDroppedContextFilesToWorkspace(workspaceId, files);
      if (selectedWorkspaceRef.current?.id === workspaceId) {
        if (added > 0) {
          setStatusMessage(
            `Added ${added === 1 ? "1 file" : `${added} files`} to context.${
              inspection.rejected.length > 0
                ? ` Skipped ${inspection.rejected.length} unsupported item${
                    inspection.rejected.length === 1 ? "" : "s"
                  }.`
                : ""
            }`,
          );
        } else if (inspection.rejected.length > 0) {
          setStatusMessage(
            `Skipped ${inspection.rejected.length} dropped item${
              inspection.rejected.length === 1 ? "" : "s"
            } because only readable files can be attached.`,
          );
        }
      }
    } catch (error) {
      if (selectedWorkspaceRef.current?.id === workspaceId) {
        setStatusMessage(
          `Could not inspect dropped files: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    } finally {
      restorePromptFocusAfterNativeDrop(workspaceId, textarea, selection);
    }
  }

  function restorePromptFocusAfterNativeDrop(
    workspaceId: number,
    textarea: HTMLTextAreaElement | null,
    selection: {
      start: number;
      end: number;
      direction: "forward" | "backward" | "none" | null;
    } | null,
  ) {
    if (!textarea) return;
    window.requestAnimationFrame(() => {
      if (
        selectedWorkspaceRef.current?.id !== workspaceId ||
        taskComposerPromptRef.current !== textarea
      ) {
        return;
      }

      textarea.focus({ preventScroll: true });
      if (selection) {
        const end = textarea.value.length;
        textarea.setSelectionRange(
          Math.min(selection.start, end),
          Math.min(selection.end, end),
          selection.direction ?? undefined,
        );
      }
    });
  }

  return (
    <main className="app-shell" data-tauri-drag-region={selfWindowDragRegion}>
      <aside className="app-rail" data-tauri-drag-region={deepWindowDragRegion}>
        <div
          className="app-rail-titlebar-drag-region"
          data-tauri-drag-region={selfWindowDragRegion}
          aria-hidden="true"
        />
        <nav
          className="primary-nav"
          aria-label="Primary"
          data-tauri-drag-region={selfWindowDragRegion}
        >
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

        <WorkspaceSidebar
          model={{
            workspaces,
            selectedWorkspaceId: selectedWorkspace?.id ?? null,
            taskViewActive: activeView === "task",
            runIsActive,
            expandedWorkspaceIds,
            expandedDirectoryPaths,
            directoryStates,
            gitStatusByWorkspaceId,
            dirtyDirectoryPathsByWorkspaceId,
            contextMenu: workspaceContextMenu,
            contextMenuRef: workspaceContextMenuRef,
            headerDragRegion: selfWindowDragRegion,
          }}
          actions={{
            addWorkspace: () => void chooseWorkspace(),
            toggleWorkspace: toggleWorkspaceExpanded,
            selectWorkspace,
            handleWorkspaceKeyDown: handleWorkspaceLabelKeyDown,
            openWorkspaceContextMenu,
            requestWorkspaceDelete,
            toggleDirectory: toggleDirectoryExpanded,
            startFileDrag: startWorkspaceFilePointerDrag,
            updateFileDrag: updateWorkspaceFilePointerDrag,
            finishFileDrag: finishWorkspaceFilePointerDrag,
            cancelFileDrag: cancelWorkspaceFilePointerDrag,
            shouldSuppressFileClick: shouldSuppressWorkspaceFileClick,
            openFile: (workspace, entry) => {
              void openWorkspaceFilePreview(workspace, entry);
            },
          }}
        />

        <CodexAccountCard
          model={{
            authRow,
            signedIn: codexSignedIn,
            menuOpen: accountMenuOpen,
            accounts: codexAccounts,
            selectedAccountId,
            activeRunAccountIds,
            runIsActive,
            loginState,
            showCancelLogin,
            containerRef: accountMenuContainerRef,
          }}
          actions={{
            setMenuOpen: setAccountMenuOpen,
            selectAccount: (accountId) => void selectCodexAccount(accountId),
            addAccount: () => void handleAddAccount(),
            manageAccounts: () => {
              setActiveView("settings");
              setAccountMenuOpen(false);
            },
            refreshAccount: handleRefreshAccount,
            logout: handleLogout,
            login: handleLogin,
            cancelLogin: handleCancelLogin,
          }}
        />
      </aside>

      {accountHandoffCandidate ? (
        <AccountHandoffDialog
          candidate={accountHandoffCandidate}
          onCancel={() => setAccountHandoffCandidate(null)}
          onConfirm={() => void confirmAccountHandoff()}
        />
      ) : null}

      {branchCreationDialog ? (
        <BranchCreationDialog
          dialog={branchCreationDialog}
          inputRef={branchCreationInputRef}
          onBranchNameChange={(branchName) =>
            setBranchCreationDialog((current) =>
              current ? { ...current, branchName, error: null } : current,
            )
          }
          onCancel={() => setBranchCreationDialog(null)}
          onConfirm={() => void confirmBranchCreation()}
        />
      ) : null}

      {planImplementationDialog ? (
        <PlanImplementationDialog
          dialog={planImplementationDialog}
          defaultProfileKey={DEFAULT_CODEX_PROFILE_KEY}
          accountOptions={planImplementationAccountOptions}
          modelOptions={planImplementationModelOptions}
          reasoningOptions={planImplementationReasoningOptions}
          hasSelectedModel={Boolean(planImplementationSelectedModel)}
          dialogRef={planImplementationDialogRef}
          onTrapFocus={trapPlanImplementationDialogFocus}
          onClose={closePlanImplementationDialog}
          onAccountChange={(value) =>
            void changePlanImplementationAccount(value)
          }
          onModelChange={changePlanImplementationModel}
          onReasoningChange={(reasoningEffort) =>
            setPlanImplementationDialog((current) =>
              current ? { ...current, reasoningEffort } : current,
            )
          }
          onConfirm={confirmPlanImplementation}
        />
      ) : null}

      {goalEditCandidate ? (
        <GoalEditDialog
          candidate={goalEditCandidate}
          onCancel={() => setGoalEditCandidate(null)}
          onConfirm={() => void editSelectedGoal(goalEditCandidate)}
        />
      ) : null}

      {workspaceDeleteCandidate ? (
        <WorkspaceDeleteDialog
          workspace={workspaceDeleteCandidate}
          onCancel={() => setWorkspaceDeleteCandidate(null)}
          onConfirm={() => void confirmWorkspaceDelete()}
        />
      ) : null}

      {chatHistoryDeleteCandidate ? (
        <ChatDeleteDialog
          chat={chatHistoryDeleteCandidate}
          onCancel={() => setChatHistoryDeleteCandidate(null)}
          onConfirm={() => void confirmChatHistoryDelete()}
        />
      ) : null}

      {commitDialogOpen ? (
        <GitActionDialog
          model={{
            actionStatus: selectedGitActionStatus,
            branch: selectedBranch,
            overview: selectedGitOverview,
            repository: selectedGitRepository,
            summary: selectedRepositoryGitSummary,
            headerAction: headerGitAction,
            commitMessage,
            feedback: commitDialogMessage,
            feedbackIsError: commitDialogError,
            includeUnstagedChanges,
            canCommit: canCommitFromDialog,
          }}
          actions={{
            onClose: () => setCommitDialogOpen(false),
            onRepositoryChange: (repositoryPath) =>
              void selectGitRepository(repositoryPath),
            onCommitMessageChange: (message) => {
              setCommitMessage(message);
              setCommitDialogMessage("");
              setCommitDialogError(false);
            },
            onIncludeUnstagedChange: setIncludeUnstagedChanges,
            onCommit: () => void handleCommitAll(),
            onCommitAndPush: () => void handleCommitAll({ pushAfter: true }),
            onPush: () => void handlePushOnly(),
          }}
        />
      ) : null}

      <section
        className={`main ${activeView === "task" ? "task-main" : ""}`}
        data-tauri-drag-region={
          activeView === "task" ? selfWindowDragRegion : "false"
        }
      >
        <FloatingHeaderStatusBubble
          notices={floatingStatusNotices}
          anchorElement={taskViewportElement}
          active={activeView === "task"}
          onActivate={activateFloatingStatusNotice}
        />
        {activeView !== "task" ? (
          <>
            <header
              className="topbar"
              data-tauri-drag-region={deepWindowDragRegion}
            >
              <div data-tauri-drag-region="false">
                <p className="eyebrow">{selectedWorkspacePath}</p>
                <h2>{selectedWorkspaceName}</h2>
              </div>
              <div className="topbar-actions" data-tauri-drag-region="false">
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

            <div
              className="status-strip"
              data-tauri-drag-region={selfWindowDragRegion}
            >
              <span>Status</span>
              <p>{statusMessage}</p>
            </div>
          </>
        ) : null}

        {activeView === "task" ? (
          <div className="codex-workspace">
            <WorkspaceContextBanner
              workspace={selectedWorkspace}
              surfaceMode={workspaceSurfaceMode}
              onSurfaceModeChange={changeWorkspaceSurfaceMode}
              kanbanToolbarHostRef={setKanbanToolbarHost}
              repositories={selectedGitOverview?.repositories ?? []}
              repositoryPath={
                selectedGitRepository?.repository.rootPath ?? null
              }
              branch={selectedKanbanGitBinding?.cardBranch ?? selectedBranch}
              branches={
                selectedKanbanGitBinding
                  ? [selectedKanbanGitBinding.cardBranch]
                  : branches
              }
              gitState={selectedGitStatusState}
              gitSummary={selectedGitSummary}
              gitAction={headerGitAction}
              gitActionStatus={selectedGitActionStatus}
              commitDialogOpen={commitDialogOpen}
              contextUsage={selectedWorkspaceContextUsage}
              contextWindow={selectedModelContextWindow}
              onGitAction={() => void handleHeaderGitAction()}
              onRepositoryChange={(repositoryPath) =>
                void selectGitRepository(repositoryPath)
              }
              onBranchChange={(branch) => void selectVisibleBranch(branch)}
              branchCreationBusy={branchCreationPendingWorkspaceId !== null}
              onCreateBranch={
                selectedKanbanGitBinding ? undefined : openBranchCreationDialog
              }
              newChatDisabled={false}
              onNewChat={startNewWorkspaceChat}
              historyOpen={historyDrawerOpen}
              historyNotificationCount={selectedWorkspaceUnreadChatCount}
              onToggleHistory={toggleHistoryDrawer}
              browserSession={
                selectedActiveRunControl?.browserSession?.state ?? null
              }
              onFocusBrowser={() => void focusSelectedBrowserSession()}
              onStopBrowser={() => void stopSelectedBrowserSession()}
              windowDragRegionsEnabled={macOsWindowDragRegionsEnabled}
            />
            {selectedWorkspace && workspaceSurfaceMode === "kanban" ? (
              <div className="kanban-workspace-mount">
                <KanbanWorkspace
                  resolvedTheme={resolvedTheme}
                  key={selectedWorkspace.id}
                  workspace={selectedWorkspace}
                  repositories={selectedGitOverview?.repositories ?? []}
                  accounts={signedInAccounts}
                  models={models}
                  refreshToken={kanbanRefreshToken}
                  listChatTranscript={listLocalChatTranscript}
                  onLaunch={kanbanRuntime.launchCard}
                  onPause={kanbanRuntime.pauseCard}
                  onStop={kanbanRuntime.stopCard}
                  onOpenConversation={openKanbanCardConversation}
                  onPickContextFiles={pickKanbanCardContextFiles}
                  githubConnection={githubConnection}
                  githubConnectionPending={githubConnectionPending}
                  onConnectGithub={() => void handleConnectGithub()}
                  onCancelGithub={() => void handleCancelGithubConnection()}
                  toolbarHost={kanbanToolbarHost}
                />
                <div className="kanban-composer-shell">
                  <TaskComposer
                    model={{
                      disabled: !canRun || kanbanCardCreatePending,
                      runActive: false,
                      prompt,
                      promptRevision,
                      submitLabel: "Create Kanban card",
                      accounts: signedInAccounts,
                      selectedAccountId: selectedComposerAccountId,
                      accountPlaceholder: selectedComposerAccountPlaceholder,
                      accountSelectionDisabled: kanbanCardCreatePending,
                      modelSelectionDisabled: kanbanCardCreatePending,
                      models,
                      modelLoadError,
                      selectedModelId,
                      selectedReasoningEffort,
                      goalMode,
                      planMode,
                      goalProgress: null,
                      planProgress: null,
                      subagentConversationKey: null,
                      queueItems: [],
                      queueActionPendingItemId: null,
                      queueEditActive: false,
                      queueEditSaving: false,
                      queueEditError: null,
                      accessMode,
                      contextFiles,
                      selectedSkills,
                      mentionResults,
                      mentionSearchStatus,
                      mentionSearchError,
                      slashCommandResults,
                      slashCommandSearchStatus,
                      slashCommandSearchError,
                      contextDropActive: taskContextDropActive,
                    }}
                    actions={{
                      onAccountChange: selectComposerAccount,
                      onPromptChange: changeComposerPrompt,
                      onModelChange: setSelectedModelId,
                      onReasoningEffortChange: setSelectedReasoningEffort,
                      onGoalModeChange: handleGoalModeChange,
                      onPlanModeChange: handlePlanModeChange,
                      onPauseGoal: () => undefined,
                      onResumeGoal: () => undefined,
                      onEditGoal: () => undefined,
                      onStopGoal: () => undefined,
                      onQueueEdit: () => undefined,
                      onQueueRemove: () => undefined,
                      onQueueRetry: () => undefined,
                      onQueueAutoSendChange: () => undefined,
                      onQueueSendNow: () => undefined,
                      onQueueReorder: () => undefined,
                      onInspectSubagent: () => undefined,
                      onQueueEditCancel: () => undefined,
                      onDispatchQueued: () => undefined,
                      onAccessModeChange: handleAccessModeChange,
                      onAddFiles: chooseComposerContextFiles,
                      onMentionSearch: searchComposerMentionFiles,
                      onMentionFileSelect: selectComposerMentionFile,
                      onMentionClose: closeComposerMentionSearch,
                      onSlashCommandSearch: searchComposerSlashCommands,
                      onSlashCommandSelect: selectComposerSlashCommand,
                      onSlashCommandClose: closeComposerSlashSearch,
                      onContextFilesDrop: dropComposerContextFiles,
                      onContextFilesDropError: setStatusMessage,
                      onDropSurfaceElementChange:
                        handleTaskComposerDropSurfaceElementChange,
                      onPromptElementChange:
                        handleTaskComposerPromptElementChange,
                      hasContextFileDropFallback:
                        hasComposerContextFileDropFallback,
                      getContextFileDropFallback:
                        getComposerContextFileDropFallback,
                      onContextFileDropHandled:
                        completeComposerContextFileDrop,
                      onRemoveFile: removeComposerContextFile,
                      onRemoveSkill: removeComposerSkill,
                      onRun: runKanbanComposerPrompt,
                      onStop: () => undefined,
                    }}
                  />
                </div>
              </div>
            ) : null}
            <div
              className={`codex-workspace-body${
                historyDrawerSpaceReserved ? " history-space-reserved" : ""
              }${historyDrawerOpen ? " history-open" : ""}${
                subagentInspectorTarget ? " subagent-inspector-open" : ""
              }`}
              style={
                workspaceSurfaceMode === "kanban"
                  ? { display: "none" }
                  : undefined
              }
              data-history-transition-phase={historyDrawerPhase}
            >
              <section
                className={`task-hero ${hasTaskChat ? "has-chat" : ""}`}
                aria-label="Task chat"
                data-tauri-drag-region={selfWindowDragRegion}
                ref={setTaskViewportElement}
              >
                {shouldRenderTaskChatTranscript ? (
                  <TaskTranscriptErrorBoundary
                    resetKey={
                      selectedHistoricalTranscript
                        ? `history:${selectedHistoricalTranscript.chatId}:${selectedHistoricalTranscript.sourceVersion}`
                        : `live:${selectedWorkspace?.id ?? "none"}`
                    }
                    onError={(error) => {
                      setStatusMessage(
                        `Could not display chat: ${error.message}`,
                      );
                    }}
                  >
                    <VirtuosoTaskChatTranscript
                      ref={taskChatTranscriptRef}
                      model={{
                        entries: visibleTaskChatEntries,
                        transcriptIdentity: selectedTranscriptIdentity,
                        transcriptVersion:
                          selectedHistoricalTranscript?.sourceVersion ?? "live",
                        suspended: shouldSuspendTaskChatTranscript,
                        restoredViewportSnapshot:
                          selectedTranscriptViewportSnapshot,
                        viewportWidth: taskViewportWidth,
                        viewportStable: taskViewportStable,
                        firstItemIndex:
                          selectedHistoricalTranscript?.firstItemIndex ??
                          HISTORY_VIRTUOSO_BASE_INDEX,
                        openAtLatestRequest:
                          selectedHistoricalTranscript?.openAtLatestRequest ??
                          null,
                        liveFollow: runIsActive,
                        fileUndoDisabled:
                          selectedWorkspaceRunningChatActivity.size > 0,
                        editablePromptEntryId,
                        notificationFocusRequest:
                          transcriptNotificationFocusRequest,
                      }}
                      actions={{
                        onViewportSnapshotChange: rememberTranscriptViewport,
                        onOpenAtLatestApplied:
                          clearHistoricalLatestPositionRequest,
                        onOpenAtLatestCancelled:
                          clearHistoricalLatestPositionRequest,
                        onResolveRequest: resolveTranscriptRequest,
                        onAnswerUserInput: answerTranscriptUserInput,
                        onImplementPlan: implementTranscriptPlan,
                        onRevisePlan: reviseTranscriptPlan,
                        onCancelPlan: cancelTranscriptPlan,
                        onOpenFileLink: openTranscriptFileLink,
                        onOpenWebPreview: openTranscriptWebPreview,
                        onReviewEditedFile: reviewTranscriptEditedFile,
                        onUndoEditedFiles: undoTranscriptEditedFiles,
                        onEditPrompt: editTranscriptPrompt,
                        onScrollActivityChange:
                          handleTranscriptScrollActivityChange,
                        onLoadHistoricalActivity:
                          loadTranscriptHistoricalActivity,
                        onNotificationFocusApplied:
                          completeAgentNotificationFocus,
                      }}
                    />
                  </TaskTranscriptErrorBoundary>
                ) : null}
                {visibleTaskChatEntries.length === 0 && selectedHistoryChatLoading ? (
                  <HistoryChatLoading
                    title={selectedHistoryChatLoading.title}
                    error={selectedHistoryChatLoading.error}
                  />
                ) : visibleTaskChatEntries.length === 0 ? (
                  <h1>{taskQuote}</h1>
                ) : null}
                {editedPromptNotice &&
                editedPromptNotice.kind === "rerun-error" &&
                editedPromptNotice.workspaceId === selectedWorkspace?.id &&
                visibleTaskChatEntries.some(
                  (entry) => entry.clientId === editedPromptNotice.entryId,
                ) ? (
                  <div
                    className="edited-prompt-notice"
                    role="alert"
                  >
                    <AlertCircle size={16} aria-hidden="true" />
                    <span>{editedPromptNotice.message}</span>
                  </div>
                ) : null}
                {workspaceSurfaceMode === "chat" ? <TaskComposer
                  model={{
                    disabled: !canRun || selectedGoalTerminationPending,
                    runActive: runIsActive,
                    prompt,
                    promptRevision,
                    accounts: signedInAccounts,
                    selectedAccountId: selectedComposerAccountId,
                    accountPlaceholder: selectedComposerAccountPlaceholder,
                    accountSelectionDisabled:
                      runIsActive || selectedGoalTerminationPending,
                    modelSelectionDisabled:
                      planReviewAwaiting || selectedGoalTerminationPending,
                    models,
                    modelLoadError,
                    selectedModelId,
                    selectedReasoningEffort,
                    goalMode,
                    planMode,
                    goalProgress: selectedGoalProgress,
                    planProgress: selectedPlanProgress,
                    subagentConversationKey: selectedSubagentConversationKey,
                    queueItems: selectedPromptQueueItems,
                    queueActionPendingItemId: promptQueueActionPendingItemId,
                    queueEditActive: promptQueueComposerEdit !== null,
                    queueEditSaving:
                      promptQueueComposerEdit?.status === "saving",
                    queueEditError: promptQueueComposerEdit?.error ?? null,
                    accessMode,
                    contextFiles,
                    selectedSkills,
                    mentionResults,
                    mentionSearchStatus,
                    mentionSearchError,
                    slashCommandResults,
                    slashCommandSearchStatus,
                    slashCommandSearchError,
                    contextDropActive: taskContextDropActive,
                  }}
                  actions={{
                    onAccountChange: selectComposerAccount,
                    onPromptChange: changeComposerPrompt,
                    onModelChange: setSelectedModelId,
                    onReasoningEffortChange: setSelectedReasoningEffort,
                    onGoalModeChange: handleGoalModeChange,
                    onPlanModeChange: handlePlanModeChange,
                    onPauseGoal: () => {
                      void updateSelectedGoalStatus("paused");
                    },
                    onResumeGoal: () => {
                      void updateSelectedGoalStatus("active");
                    },
                    onEditGoal: requestEditSelectedGoal,
                    onStopGoal: () => {
                      void stopSelectedGoal();
                    },
                    onQueueEdit: editComposerQueuedPrompt,
                    onQueueRemove: removeComposerQueuedPrompt,
                    onQueueRetry: retryComposerQueuedPrompt,
                    onQueueAutoSendChange:
                      changeComposerQueuedPromptAutoSend,
                    onQueueSendNow: sendComposerQueuedPromptNow,
                    onQueueReorder: reorderComposerPromptQueue,
                    onInspectSubagent: openSubagentInspector,
                    onQueueEditCancel: cancelComposerQueuedPromptEdit,
                    onDispatchQueued: dispatchSelectedPromptQueue,
                    onAccessModeChange: handleAccessModeChange,
                    onAddFiles: chooseComposerContextFiles,
                    onMentionSearch: searchComposerMentionFiles,
                    onMentionFileSelect: selectComposerMentionFile,
                    onMentionClose: closeComposerMentionSearch,
                    onSlashCommandSearch: searchComposerSlashCommands,
                    onSlashCommandSelect: selectComposerSlashCommand,
                    onSlashCommandClose: closeComposerSlashSearch,
                    onContextFilesDrop: dropComposerContextFiles,
                    onContextFilesDropError: setStatusMessage,
                    onDropSurfaceElementChange:
                      handleTaskComposerDropSurfaceElementChange,
                    onPromptElementChange:
                      handleTaskComposerPromptElementChange,
                    hasContextFileDropFallback:
                      hasComposerContextFileDropFallback,
                    getContextFileDropFallback:
                      getComposerContextFileDropFallback,
                    onContextFileDropHandled:
                      completeComposerContextFileDrop,
                    onRemoveFile: removeComposerContextFile,
                    onRemoveSkill: removeComposerSkill,
                    onRun: runComposerPrompt,
                    onStop: stopComposerRun,
                  }}
                /> : null}
              </section>
              <WorkspaceHistoryDrawer
                phase={historyDrawerPhase}
                workspace={selectedWorkspace}
                historyState={historyState}
                selectedChatId={selectedHistoryChatId ?? selectedWorkspaceChatSession?.chatId ?? null}
                runningChatActivity={selectedWorkspaceRunningChatActivity}
                onSelectChat={selectHistoryChatFromDrawer}
                onOpenChatContextMenu={openChatHistoryContextMenuFromDrawer}
                onTransitionEnd={handleHistoryDrawerTransitionEnd}
              />
              {subagentInspectorTarget ? (
                <SubagentInspector
                  conversationKey={
                    subagentInspectorTarget.conversationKey
                  }
                  subagentId={subagentInspectorTarget.subagentId}
                  parentEntry={inspectedSubagentParentEntry}
                  parentRunView={
                    inspectedSubagentParentEntry?.runView ?? null
                  }
                  onClose={closeSubagentInspector}
                  onLoadTranscript={loadSubagentTranscript}
                  onResolveRequest={resolveTranscriptRequest}
                  onAnswerUserInput={answerTranscriptUserInput}
                  onSteer={steerSubagent}
                  onStop={stopSubagent}
                />
              ) : null}
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
                      findRunControlByChat(
                        chatHistoryContextMenu.chat.workspace_id,
                        chatHistoryContextMenu.chat.id,
                      ) !== null
                    }
                  >
                    <Trash2 size={15} aria-hidden="true" />
                    <span>Remove chat</span>
                  </button>
                </div>
              ) : null}
            </div>
            <FilePreviewDrawer
              {...workspacePreview.drawerProps}
              resolvedTheme={resolvedTheme}
            />
          </div>
        ) : null}

        {activeView === "analytics" ? (
          <div
            className="view-stack"
            data-tauri-drag-region={selfWindowDragRegion}
          >
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
          <div
            className="settings-grid"
            data-tauri-drag-region={selfWindowDragRegion}
          >
            <SettingsView
              model={{
                dragRegion: selfWindowDragRegion,
                themePreference,
                computerUseEnabled,
                browserRuntimeStatus,
                githubConnection,
                githubConnectionPending,
                notificationPreferences: agentNotificationPreferences,
                notificationPermission: agentNotificationPermission,
                codexConnected,
                accounts: codexAccounts,
                selectedAccountId,
                pendingLoginAccountId,
                pendingLoginId,
                loginState,
                activeRunAccountIds,
                runIsActive,
                authMessage,
                showLogout,
                useOss,
                ossProvider,
              }}
              actions={{
                setThemePreference,
                setComputerUseEnabled,
                connectGithub: () => void handleConnectGithub(),
                cancelGithubConnection: () => void handleCancelGithubConnection(),
                disconnectGithub: () => void handleDisconnectGithub(),
                setNotificationPreference: handleAgentNotificationPreferenceChange,
                openNotificationSettings: () =>
                  void handleOpenAgentNotificationSettings(),
                enableNotifications: () => void handleEnableAgentNotifications(),
                renameAccount: (accountId, label) =>
                  void handleRenameAccount(accountId, label),
                selectAccount: (accountId) => void selectCodexAccount(accountId),
                cancelLogin: () => void handleCancelLogin(),
                loginAccount: (account) => {
                  setSelectedAccountId(account.id);
                  selectedAccountIdRef.current = account.id;
                  void handleLoginForAccount(account);
                },
                removeAccount: (accountId) => void handleRemoveAccount(accountId),
                addAccount: () => void handleAddAccount(),
                connectAccount: (accountId) => void ensureCodexConnected(accountId),
                logout: handleLogout,
                setUseOss,
                setOssProvider,
              }}
            />

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


function interactionModeForSnapshot(snapshot: RunSetupSnapshot): RunInteractionMode {
  if (snapshot.goalMode && snapshot.mode === "plan") return "goal-plan";
  if (snapshot.goalMode) return "goal";
  return snapshot.mode === "plan" ? "plan" : "chat";
}

function assertRuntimeAccessMatches(
  runtime: {
    approvalPolicy?: string;
    activePermissionProfile?: { id?: string | null } | null;
  },
  expected: CodexAccessSettings,
) {
  if (
    runtime.approvalPolicy &&
    runtime.approvalPolicy !== expected.approvalPolicy
  ) {
    throw new Error(
      `Codex activated approval policy ${runtime.approvalPolicy}, but the application requested ${expected.approvalPolicy}. The run was stopped to avoid a permission mismatch.`,
    );
  }
  const activeProfile = runtime.activePermissionProfile?.id;
  if (activeProfile && activeProfile !== expected.permissionProfile) {
    const compatibilityHint =
      expected.permissionProfile === ASK_FOR_APPROVAL_PERMISSION_PROFILE
        ? " Ask for approval requires a Codex version with custom permission-profile support. Update Codex and retry."
        : "";
    throw new Error(
      `Codex activated permission profile ${activeProfile}, but the application requested ${expected.permissionProfile}. The run was stopped to avoid a sandbox mismatch.${compatibilityHint}`,
    );
  }
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

export default App;
