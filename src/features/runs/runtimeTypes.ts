import type { CodexAccessSettings } from "../../lib/codexAccess";
import type { RunViewState } from "../../lib/codexEventReducer";
import type { CollaborationMode, RunIntent } from "../../lib/nativePlanMode";
import type { GoalProgressAction, ThreadGoalState } from "../../lib/goalProgress";
import type { PreparedBrowserSession } from "../browser/types";
import type { TaskChatEntry } from "../conversations/types";
import type { PendingAccountHandoff } from "../accounts/AccountHandoffDialog";
import type { CodexAccountProfile } from "../accounts/types";
import type {
  CodexLoginState,
  CodexModel,
  CodexProfileKey,
  OssProvider,
  RunInteractionMode,
} from "../codex/types";
import type { ComposerContextFile, SelectedComposerSkill } from "../composer/types";
import type { ChatOrigin } from "../conversations/types";
import type { AdditionalContextEntry, PreflightReport, RunExecutionSettings } from "./types";
import type { Workspace } from "../workspaces/types";
import type {
  KanbanRunAttemptBinding,
  PendingKanbanStopRequest,
} from "../kanban/attemptLifecycle";
import type { NativeTaskWorkspaceBinding } from "../../lib/nativeTaskWorkspaceBinding";

export type {
  KanbanAttemptPersistenceResult,
  KanbanRunAttemptBinding,
  KanbanStopAcknowledgement,
  PendingKanbanStopRequest,
} from "../kanban/attemptLifecycle";

export type WebPreviewCommandBuffer = { command: string; output: string };
export type WebPreviewProbeAttempt = {
  sequence: number;
  sourceCommandId: string;
  timers: Set<number>;
};
export type WebPreviewDetectionState = {
  commands: Map<string, WebPreviewCommandBuffer>;
  probes: Map<string, WebPreviewProbeAttempt>;
  nextSequence: number;
  confirmedSequence: number;
  disposed: boolean;
};

export type ActiveRunControl = {
  accountId: number;
  profileKey: CodexProfileKey;
  workspaceId: number;
  clientId: string;
  promptFallback: string;
  imageContextFilesFallback: ComposerContextFile[];
  chatId: number | null;
  stopped: boolean;
  taskId: number | null;
  runId: number | null;
  setupStarted: boolean;
  turnStartPending: boolean;
  cancelScheduledSetup: (() => void) | null;
  interactionMode: RunInteractionMode;
  acceptsThreadContinuation: boolean;
  goal: ThreadGoalState | null;
  goalActionPending: GoalProgressAction | null;
  goalActionError: string | null;
  goalTurnCompleted: boolean;
  threadId: string | null;
  turnId: string | null;
  intent: RunIntent;
  clientUserMessageId: string;
  executionSettings: RunExecutionSettings;
  entry: TaskChatEntry | null;
  runView: RunViewState;
  eventSequence: number;
  queueItemId: string | null;
  queueAdvanceBlocked: boolean;
  browserSession: PreparedBrowserSession | null;
  webPreviewDetection: WebPreviewDetectionState;
  kanbanAttempt: KanbanRunAttemptBinding | null;
  kanbanStopStatus: "paused" | "stopped" | null;
  kanbanStopRequest: PendingKanbanStopRequest | null;
  nativeTaskWorkspaceBinding: NativeTaskWorkspaceBinding | null;
  nativeTaskCommandExecutionObserved: boolean;
  nativeTaskExecutionViolation: string | null;
};

export function isActiveRunControl(
  control: Pick<ActiveRunControl, "stopped" | "runView">,
) {
  return (
    !control.stopped &&
    (control.runView.status === "connecting" || control.runView.status === "running")
  );
}

export function isNavigableRunControl(
  control: Pick<ActiveRunControl, "stopped" | "runView">,
) {
  return (
    !control.stopped &&
    (isActiveRunControl(control) ||
      control.runView.serverRequests.length > 0 ||
      control.runView.approvalRequests.length > 0)
  );
}

export class RunStoppedError extends Error {
  constructor() {
    super("Run stopped by user.");
    this.name = "RunStoppedError";
  }
}

export type AccountHandoffRunStrategy = PendingAccountHandoff & {
  adoptingExternalChat: boolean;
};
export type RunThreadStrategy =
  | { kind: "resume" }
  | { kind: "fresh" }
  | { kind: "handoff"; handoff: AccountHandoffRunStrategy };

export type RunSetupSnapshot = {
  promptText: string;
  promptFallback: string;
  workspace: Workspace;
  /** Source workspace for shared-profile thread ownership when execution is isolated. */
  sourceWorkspacePath?: string | null;
  nativeTaskWorkspaceBinding?: NativeTaskWorkspaceBinding | null;
  accountId: number;
  account: CodexAccountProfile | null;
  profileKey: CodexProfileKey;
  chatOrigin: ChatOrigin;
  externalThreadId: string | null;
  selectedRepositoryPath: string | null;
  selectedBranch: string | null;
  cachedPreflight: PreflightReport | null;
  mode: "plan" | "run";
  intent?: RunIntent;
  clientUserMessageId?: string;
  access: CodexAccessSettings;
  computerUseEnabled: boolean;
  model: string | null;
  effort: string | null;
  useOss: boolean;
  ossProvider: OssProvider;
  improvedPrompt: string;
  contextFiles: ComposerContextFile[];
  selectedSkills: SelectedComposerSkill[];
  goalMode: boolean;
  loginState: CodexLoginState;
  chatId: number | null;
  threadId: string | null;
  turnIndex: number;
  threadStrategy: RunThreadStrategy;
  previousChatContext?: string | null;
  handoffContextBudgetTokens?: number;
  supersededRunIds?: number[];
  replacementClientId?: string | null;
  restoreEntryOnSetupFailure?: TaskChatEntry | null;
  restorePromptOnSetupFailure?: boolean;
  sourcePlanEntry?: TaskChatEntry;
  defaultCollaborationMode?: CollaborationMode | null;
  executionSettings: RunExecutionSettings;
  queueItemId?: string | null;
  fromQueue?: boolean;
  kanbanAttempt?: KanbanRunAttemptBinding | null;
};

export type ChatTitleGenerationRequest = {
  chatId: number;
  workspacePath: string;
  accountId: number;
  model: string | null;
  initialPrompt: string;
  fallbackTitle: string;
  onSettled?: () => void;
};
export type RunPreparationStageResult = {
  report: PreflightReport;
  collaborationModes: { plan: CollaborationMode | null; default: CollaborationMode };
  collaborationMode: CollaborationMode;
};
export type RunPersistenceStageResult = {
  chatId: number;
  threadId: string | null;
  taskId: number;
  runId: number;
  pendingChatTitleGeneration: ChatTitleGenerationRequest | null;
};
export type RunSetupFailureState = {
  chatId: number | null;
  taskId: number | null;
  runId: number | null;
  accountHandoff: AccountHandoffRunStrategy | null;
  accountHandoffActivated: boolean;
  pendingChatTitleGeneration: ChatTitleGenerationRequest | null;
};
export type RunTurnPayloadStageResult = {
  text: string;
  additionalContext: Record<string, AdditionalContextEntry> | null;
};
export type StartedRunThread = {
  threadId: string;
  model: string | null | undefined;
  modelProvider: string | null | undefined;
  activePermissionProfile: string | null;
  nativeTaskWorkspaceBinding?: NativeTaskWorkspaceBinding | null;
  supersededThreadId?: string | null;
};
export type RunThreadStageResult = StartedRunThread & {
  browserSession: PreparedBrowserSession | null;
  startFreshThread: () => Promise<StartedRunThread>;
  nativeTaskWorkspaceBinding: NativeTaskWorkspaceBinding | null;
};
export type GoalTerminationState = {
  workspaceId: number;
  clientId: string;
  action: Extract<GoalProgressAction, "stopping" | "editing">;
};
export type StopActiveRunResult = { stopped: boolean; goalCleared: boolean };
export type PlanFollowUpExecutionSelection = {
  accountId: number;
  profileKey: CodexProfileKey;
  model: CodexModel | null;
  reasoningEffort: string | null;
};
