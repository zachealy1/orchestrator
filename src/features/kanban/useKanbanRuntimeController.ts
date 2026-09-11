import { useRef } from "react";
import type { CodexAccountProfile } from "../accounts/types";
import { executionAccountAvailable } from "../accounts/executionAccount";
import { profileKeyForAccountId } from "../codex/runtimeHelpers";
import type {
  CodexModel,
  CodexProfileKey,
} from "../codex/types";
import type { ChatRecord } from "../conversations/types";
import type {
  RunSetupSnapshot,
  StopActiveRunResult,
} from "../runs/runtimeTypes";
import type { RunExecutionSettings } from "../runs/types";
import type {
  Workspace,
  WorkspaceGitRepositoryStatus,
} from "../workspaces/types";
import { formatWorkspaceRepositoryContext } from "../workspaces/repositoryTopology";
import { accessSettingsForRun } from "../../lib/codexAccess";
import {
  createRunExecutionSettings,
  parseRunExecutionSettings,
  serializeRunExecutionSettings,
} from "../../lib/runExecutionSettings";
import {
  createKanbanNativeTaskWorkspaceBinding,
  parseNativeTaskWorkspaceBinding,
} from "../../lib/nativeTaskWorkspaceBinding";
import {
  claimKanbanAttempt,
  loadKanbanInheritedContext,
  stopInactiveKanbanCard,
  type KanbanAttemptRecord,
  type KanbanCardRecord,
} from "./api";
import type {
  KanbanAttemptControl,
  KanbanAttemptStateController,
} from "./attemptLifecycle";
import { prepareKanbanRepositoryExecution } from "./repositoryExecution";

export type KanbanLaunchKind = KanbanAttemptRecord["kind"];

export type KanbanRuntimeRunControl = KanbanAttemptControl & {
  kanbanStopStatus: "paused" | "stopped" | null;
};

export type KanbanRuntimeState = {
  workspaces: Workspace[];
  accounts: CodexAccountProfile[];
  selectedAccountId: number | null;
  sharedProfileAvailable: boolean;
  computerUseEnabled: boolean;
};

export type KanbanRuntimeControllerDependencies<
  RunControl extends KanbanRuntimeRunControl = KanbanRuntimeRunControl,
> = {
  getState: () => KanbanRuntimeState;
  listModels: (
    profileKey: CodexProfileKey,
    accountId: number,
  ) => Promise<CodexModel[]>;
  listWorkspaceRepositories: (
    workspace: Workspace,
  ) => Promise<WorkspaceGitRepositoryStatus[]>;
  loadChat: (chatId: number) => Promise<ChatRecord | null>;
  updateChat: (
    chatId: number,
    fields: {
      accountId: number | null;
      profileKey: CodexProfileKey;
      status: string;
    },
  ) => Promise<unknown>;
  getNextTurnIndex: (chatId: number) => Promise<number>;
  findRunControl: (
    workspaceId: number,
    chatId: number,
    cardId: string,
  ) => RunControl | null;
  beginRun: (snapshot: RunSetupSnapshot) => RunControl;
  scheduleRun: (control: RunControl, snapshot: RunSetupSnapshot) => void;
  stopRun: (control: RunControl) => Promise<StopActiveRunResult>;
  attempts: Pick<KanbanAttemptStateController, "persist">;
  refreshBoards: () => void;
};

export type KanbanRuntimeNativeDependencies = {
  claimAttempt: typeof claimKanbanAttempt;
  prepareRepositoryExecution: typeof prepareKanbanRepositoryExecution;
  loadInheritedContext: typeof loadKanbanInheritedContext;
  stopInactiveCard: typeof stopInactiveKanbanCard;
};

const nativeDependencies: KanbanRuntimeNativeDependencies = {
  claimAttempt: claimKanbanAttempt,
  prepareRepositoryExecution: prepareKanbanRepositoryExecution,
  loadInheritedContext: loadKanbanInheritedContext,
  stopInactiveCard: stopInactiveKanbanCard,
};

export type KanbanRuntimeController = {
  isLaunchReserved: (workspaceId: number, chatId: number) => boolean;
  launchCard: (
    card: KanbanCardRecord,
    kind: KanbanLaunchKind,
    promptText: string,
    options?: KanbanLaunchOptions,
  ) => Promise<void>;
  pauseCard: (card: KanbanCardRecord) => Promise<void>;
  stopCard: (card: KanbanCardRecord) => Promise<void>;
};

export type KanbanLaunchOptions = {
  executionSettings?: RunExecutionSettings;
  queueItemId?: string;
  clientUserMessageId?: string;
  turnIndex?: number;
  threadStrategy?: RunSetupSnapshot["threadStrategy"];
  previousChatContext?: string | null;
  supersededRunIds?: number[];
  replacementClientId?: string | null;
  restoreEntryOnSetupFailure?: RunSetupSnapshot["restoreEntryOnSetupFailure"];
  promptFallback?: string;
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function samePathSet(left: string[], right: string[]) {
  const sortedLeft = [...new Set(left)].sort();
  const sortedRight = [...new Set(right)].sort();
  return (
    sortedLeft.length === sortedRight.length &&
    sortedLeft.every((path, index) => path === sortedRight[index])
  );
}

function workspaceForCard(state: KanbanRuntimeState, card: KanbanCardRecord) {
  const workspace = state.workspaces.find(
    (candidate) => candidate.id === card.workspaceId,
  );
  if (!workspace) {
    throw new Error("The card workspace is no longer available.");
  }
  return workspace;
}

function modelForCard(card: KanbanCardRecord, models: CodexModel[]) {
  return card.model
    ? models.find(
        (model) => model.model === card.model || model.id === card.model,
      ) ?? null
    : models.find((model) => model.isDefault) ?? models[0] ?? null;
}

export function createKanbanRuntimeController<
  RunControl extends KanbanRuntimeRunControl = KanbanRuntimeRunControl,
>(
  getDependencies: () => KanbanRuntimeControllerDependencies<RunControl>,
  native: KanbanRuntimeNativeDependencies = nativeDependencies,
): KanbanRuntimeController {
  const launchReservations = new Set<string>();

  async function launchCard(
    card: KanbanCardRecord,
    kind: KanbanLaunchKind,
    promptText: string,
    options?: KanbanLaunchOptions,
  ) {
    const dependencies = getDependencies();
    const state = dependencies.getState();
    const workspace = workspaceForCard(state, card);
    const reservationKey = `${card.workspaceId}:${card.chatId}`;
    if (
      launchReservations.has(reservationKey) ||
      dependencies.findRunControl(card.workspaceId, card.chatId, card.id)
    ) {
      throw new Error(
        "This card conversation already has an active or starting run.",
      );
    }
    const discoveredRepositories =
      await dependencies.listWorkspaceRepositories(workspace);
    if (discoveredRepositories.length === 0) {
      throw new Error(
        "No Git repositories are currently available in this workspace.",
      );
    }
    const multiRepositoryWorkspace = discoveredRepositories.length > 1;
    const includeDirtyForUnstartedCard =
      !card.hasStartedTurn &&
      card.repositories.some((repository) => repository.includeDirtyChanges);
    const repositories = multiRepositoryWorkspace
      ? discoveredRepositories.map((repository) => {
          const existing = card.repositories.find(
            (selection) =>
              selection.repositoryPath === repository.repository.rootPath,
          );
          return {
            repositoryPath: repository.repository.rootPath,
            relativePath: repository.repository.relativePath,
            label: repository.repository.label,
            includeDirtyChanges:
              existing?.includeDirtyChanges ?? includeDirtyForUnstartedCard,
          };
        })
      : card.repositories;
    const capturedSettings =
      options?.executionSettings ??
      parseRunExecutionSettings(card.executionSettingsJson);
    const accountId = capturedSettings?.accountId ?? card.accountId ?? 0;
    const profileKey = capturedSettings?.profileKey ?? profileKeyForAccountId(accountId);
    if (profileKey !== profileKeyForAccountId(accountId)) {
      throw new Error("The account saved on this card is inconsistent. Edit its account before starting.");
    }
    if (!executionAccountAvailable(accountId, state.accounts, state.sharedProfileAvailable)) {
      throw new Error("The account saved on this card is signed out or unavailable. Sign in to that account, or edit an unstarted card to select another account.");
    }
    const account = state.accounts.find((candidate) => candidate.id === accountId) ?? null;
    const availableModels = await dependencies.listModels(profileKey, accountId);
    const requestedModel = capturedSettings?.model ?? card.model;
    const selectedModel = requestedModel
      ? availableModels.find(
          (model) => model.id === requestedModel || model.model === requestedModel,
        ) ?? null
      : modelForCard(card, availableModels);
    if (requestedModel && !selectedModel) {
      throw new Error("The model saved on this card is no longer available.");
    }
    const requestedReasoning =
      capturedSettings?.reasoningEffort ?? card.reasoningLevel;
    if (
      requestedReasoning &&
      selectedModel &&
      !selectedModel.supportedReasoningEfforts.some(
        (option) => option.reasoningEffort === requestedReasoning,
      )
    ) {
      throw new Error(
        "The reasoning level saved on this card is no longer available.",
      );
    }
    if (!multiRepositoryWorkspace && repositories.length === 0) {
      throw new Error(
        "This card has no captured Git repositories. Edit it before starting and select a repository scope.",
      );
    }

    const executionSettings = createRunExecutionSettings(
      capturedSettings
        ? {
            ...capturedSettings,
            accountId,
            profileKey,
            selectedRepositoryPath: multiRepositoryWorkspace
              ? null
              : capturedSettings.selectedRepositoryPath,
            selectedBranch: multiRepositoryWorkspace
              ? null
              : capturedSettings.selectedBranch,
          }
        : {
            accountId,
            profileKey,
            selectedRepositoryPath: null,
            selectedBranch: null,
            mode: "run",
            intent: "normal",
            accessMode: card.accessMode,
            computerUseEnabled: state.computerUseEnabled,
            model: selectedModel?.model ?? card.model,
            reasoningEffort:
              card.reasoningLevel ?? selectedModel?.defaultReasoningEffort ?? null,
            contextFiles: [],
            selectedSkills: [],
            goalMode: true,
          },
    );
    const access = accessSettingsForRun(
      { accessMode: executionSettings.accessMode },
      executionSettings.mode,
    );
    launchReservations.add(reservationKey);
    try {
      const claimed = await native.claimAttempt({
        card,
        kind,
        prompt: promptText,
        configSnapshot: {
          version: 1,
          cardId: card.id,
          title: card.title,
          accountId,
          accessMode: executionSettings.accessMode,
          model: executionSettings.model,
          reasoningLevel: executionSettings.reasoningEffort,
          repositories,
        },
        executionSettingsJson:
          kind === "implement_plan"
            ? serializeRunExecutionSettings(executionSettings)
            : null,
      });
      dependencies.refreshBoards();

      let executionRoot: string | null = null;
      try {
        const effectivePrompt = claimed.attempt.prompt;
        const repositoryExecution = await native.prepareRepositoryExecution({
          card,
          claimedCard: claimed.card,
          repositories,
          repositoryConfiguration: multiRepositoryWorkspace
            ? {
                repositoryScope: "all",
                repositories,
                executionSettingsJson:
                  serializeRunExecutionSettings(executionSettings),
              }
            : null,
          onExecutionRoot: (nextExecutionRoot) => {
            executionRoot = nextExecutionRoot;
          },
        });
        executionRoot = repositoryExecution.executionRoot;
        if (multiRepositoryWorkspace) dependencies.refreshBoards();
        const selectedBinding =
          repositoryExecution.bindings.find(
            (binding) =>
              binding.sourceRepositoryPath ===
              executionSettings.selectedRepositoryPath,
          ) ?? repositoryExecution.bindings[0] ?? null;
        const runExecutionSettings = multiRepositoryWorkspace
          ? createRunExecutionSettings({
              ...executionSettings,
              selectedRepositoryPath: null,
              selectedBranch: null,
            })
          : selectedBinding
            ? createRunExecutionSettings({
                ...executionSettings,
                selectedRepositoryPath: selectedBinding.worktreePath,
                selectedBranch: selectedBinding.cardBranch,
              })
            : executionSettings;
        const chat = await dependencies.loadChat(card.chatId);
        if (!chat) {
          throw new Error("The card conversation is no longer available.");
        }
        const storedNativeBinding = parseNativeTaskWorkspaceBinding(
          chat.native_workspace_binding_json,
        );
        const runtimeWorkspaceRoots = [
          ...new Set([
            executionRoot,
            ...repositoryExecution.bindings.map(
              (binding) => binding.worktreePath,
            ),
          ]),
        ];
        const nativeTaskWorkspaceBinding =
          createKanbanNativeTaskWorkspaceBinding({
            cardId: card.id,
            sourceWorkspacePath: workspace.path,
            executionDirectory: executionRoot,
            bindings: repositoryExecution.bindings,
            pendingContinuationContext:
              storedNativeBinding?.pendingContinuationContext ?? null,
            sourceRootAssociation:
              storedNativeBinding?.sourceWorkspacePath === workspace.path
                ? storedNativeBinding.sourceRootAssociation
                : "pending",
            verifiedEnvironmentThreadId:
              storedNativeBinding?.executionDirectory === executionRoot &&
              samePathSet(
                storedNativeBinding.runtimeWorkspaceRoots,
                runtimeWorkspaceRoots,
              )
                ? storedNativeBinding.verifiedEnvironmentThreadId
                : null,
          });
        await dependencies.updateChat(chat.id, {
          accountId: profileKey === "default" ? null : accountId,
          profileKey,
          status: "starting",
        });
        const turnIndex =
          options?.turnIndex ?? (await dependencies.getNextTurnIndex(chat.id));
        const currentThreadId = chat.codex_thread_id;
        const profileChanged = Boolean(
          chat.profile_key && chat.profile_key !== profileKey,
        );
        const inheritedContext = currentThreadId && !profileChanged
          ? null
          : await native.loadInheritedContext(card.id);
        const defaultThreadStrategy: RunSetupSnapshot["threadStrategy"] =
          profileChanged
            ? {
                kind: "handoff",
                handoff: {
                  workspaceId: workspace.id,
                  chatId: chat.id,
                  fromProfileKey: chat.profile_key as CodexProfileKey,
                  fromThreadId: currentThreadId,
                  targetAccountId: accountId,
                  targetProfileKey: profileKey,
                  adoptingExternalChat: false,
                },
              }
            : currentThreadId
              ? { kind: "resume" }
              : { kind: "fresh" };
        const threadStrategy = options?.threadStrategy ?? defaultThreadStrategy;
        const hasExplicitPreviousContext =
          options !== undefined &&
          Object.prototype.hasOwnProperty.call(options, "previousChatContext");
        const snapshot: RunSetupSnapshot = {
          promptText: effectivePrompt,
          promptFallback: options?.promptFallback ?? effectivePrompt,
          workspace: { ...workspace, path: executionRoot },
          sourceWorkspacePath: workspace.path,
          nativeTaskWorkspaceBinding,
          accountId,
          account,
          profileKey,
          chatOrigin: "orchestrator",
          externalThreadId: null,
          selectedRepositoryPath: runExecutionSettings.selectedRepositoryPath,
          selectedBranch: runExecutionSettings.selectedBranch,
          workspaceRepositoryRoots: repositoryExecution.bindings.map(
            (binding) => binding.worktreePath,
          ),
          workspaceRepositoryContext: multiRepositoryWorkspace
            ? formatWorkspaceRepositoryContext(
                repositories.map((repository) => ({
                  repository: {
                    label: repository.label,
                    relativePath: repository.relativePath,
                  },
                })),
              )
            : null,
          cachedPreflight: null,
          mode: runExecutionSettings.mode,
          intent: runExecutionSettings.intent,
          access,
          computerUseEnabled: runExecutionSettings.computerUseEnabled,
          model: runExecutionSettings.model,
          effort: runExecutionSettings.reasoningEffort,
          contextFiles: runExecutionSettings.contextFiles,
          selectedSkills: runExecutionSettings.selectedSkills,
          goalMode: runExecutionSettings.goalMode,
          loginState: "idle",
          chatId: chat.id,
          threadId:
            threadStrategy.kind === "fresh" || profileChanged
              ? null
              : currentThreadId,
          turnIndex,
          threadStrategy,
          previousChatContext: hasExplicitPreviousContext
            ? options?.previousChatContext ?? null
            : nativeTaskWorkspaceBinding.pendingContinuationContext ??
              inheritedContext,
          supersededRunIds: options?.supersededRunIds,
          replacementClientId: options?.replacementClientId,
          restoreEntryOnSetupFailure: options?.restoreEntryOnSetupFailure,
          executionSettings: runExecutionSettings,
          restorePromptOnSetupFailure: false,
          queueItemId: options?.queueItemId ?? null,
          fromQueue: Boolean(options?.queueItemId),
          clientUserMessageId: options?.clientUserMessageId,
          kanbanAttempt: {
            cardId: card.id,
            attemptId: claimed.attempt.id,
            generation: claimed.attempt.generation,
            executionRoot,
            eventSequence: 0,
          },
        };
        const runControl = dependencies.beginRun(snapshot);
        dependencies.scheduleRun(runControl, snapshot);
      } catch (launchError) {
        await dependencies.attempts.persist(
          {
            accountId,
            profileKey,
            runId: null,
            taskId: null,
            threadId: null,
            turnId: null,
            kanbanAttempt: {
              cardId: card.id,
              attemptId: claimed.attempt.id,
              generation: claimed.attempt.generation,
              executionRoot,
              eventSequence: 0,
            },
          },
          "failed",
          errorMessage(launchError),
        );
        throw launchError;
      }
    } finally {
      launchReservations.delete(reservationKey);
    }
  }

  async function pauseCard(card: KanbanCardRecord) {
    const dependencies = getDependencies();
    const control = dependencies.findRunControl(
      card.workspaceId,
      card.chatId,
      card.id,
    );
    if (!control || control.kanbanAttempt?.cardId !== card.id) {
      throw new Error("This card no longer has a live turn to pause.");
    }
    control.kanbanStopStatus = "paused";
    const result = await dependencies.stopRun(control);
    if (!result.stopped) {
      throw new Error("The card turn could not be paused.");
    }
  }

  async function stopCard(card: KanbanCardRecord) {
    const dependencies = getDependencies();
    const control = dependencies.findRunControl(
      card.workspaceId,
      card.chatId,
      card.id,
    );
    if (!control || control.kanbanAttempt?.cardId !== card.id) {
      await native.stopInactiveCard(card);
      dependencies.refreshBoards();
      return;
    }
    control.kanbanStopStatus = "stopped";
    const result = await dependencies.stopRun(control);
    if (!result.stopped) {
      throw new Error("The card turn could not be stopped.");
    }
  }

  return {
    isLaunchReserved: (workspaceId, chatId) =>
      launchReservations.has(`${workspaceId}:${chatId}`),
    launchCard,
    pauseCard,
    stopCard,
  };
}

export function useKanbanRuntimeController<
  RunControl extends KanbanRuntimeRunControl = KanbanRuntimeRunControl,
>(
  dependencies: KanbanRuntimeControllerDependencies<RunControl>,
): KanbanRuntimeController {
  const dependenciesRef = useRef(dependencies);
  dependenciesRef.current = dependencies;
  const controllerRef = useRef<KanbanRuntimeController | null>(null);
  controllerRef.current ??= createKanbanRuntimeController(
    () => dependenciesRef.current,
  );
  return controllerRef.current;
}
