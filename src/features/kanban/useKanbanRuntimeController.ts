import { useRef } from "react";
import type { CodexAccountProfile } from "../accounts/types";
import type {
  CodexModel,
  CodexProfileKey,
  OssProvider,
} from "../codex/types";
import type { ChatRecord } from "../conversations/types";
import type {
  RunSetupSnapshot,
  StopActiveRunResult,
} from "../runs/runtimeTypes";
import type { RunExecutionSettings } from "../runs/types";
import type { BrowserExecutionTarget } from "../browser/types";
import type { Workspace } from "../workspaces/types";
import { accessSettings } from "../../lib/codexAccess";
import {
  createRunExecutionSettings,
  parseRunExecutionSettings,
  serializeRunExecutionSettings,
} from "../../lib/runExecutionSettings";
import { improvePrompt } from "../../lib/taskAnalysis";
import {
  accountIdFromProfileKey,
  profileKeyForAccountId,
} from "../codex/runtimeHelpers";
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
  computerUseEnabled: boolean;
  browserExecutionTarget: BrowserExecutionTarget;
  ossProvider: OssProvider;
};

export type KanbanRuntimeControllerDependencies<
  RunControl extends KanbanRuntimeRunControl = KanbanRuntimeRunControl,
> = {
  getState: () => KanbanRuntimeState;
  listModels: (
    profileKey: CodexProfileKey,
    accountId: number,
  ) => Promise<CodexModel[]>;
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
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
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
    const capturedSettings =
      options?.executionSettings ??
      parseRunExecutionSettings(card.executionSettingsJson);
    const profileKey = (
      capturedSettings?.profileKey ??
      workspace.default_profile_key ??
      profileKeyForAccountId(
        card.accountId ?? workspace.default_account_id ?? state.selectedAccountId,
      )
    ) as CodexProfileKey;
    const accountId = profileKey === "default"
      ? 0
      : capturedSettings?.accountId ??
        card.accountId ??
        accountIdFromProfileKey(profileKey) ??
        workspace.default_account_id ??
        state.selectedAccountId;
    if (accountId === null || accountId === undefined) {
      throw new Error(
        "Choose a signed-in Codex account before starting this card.",
      );
    }
    const account =
      state.accounts.find((candidate) => candidate.id === accountId) ?? null;
    if (profileKey !== "default" && (!account || account.status !== "signed_in")) {
      throw new Error("The card's Codex account is unavailable or signed out.");
    }
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
    if (card.repositories.length === 0) {
      throw new Error(
        "This card has no captured Git repositories. Edit it before starting and select a repository scope.",
      );
    }

    const executionSettings = capturedSettings ??
      createRunExecutionSettings({
        accountId,
        profileKey,
        selectedRepositoryPath: null,
        selectedBranch: null,
        mode: "run",
        intent: "normal",
        accessMode: card.accessMode,
        computerUseEnabled: state.computerUseEnabled,
        browserExecutionTarget: state.browserExecutionTarget,
        model: selectedModel?.model ?? card.model,
        reasoningEffort:
          card.reasoningLevel ?? selectedModel?.defaultReasoningEffort ?? null,
        useOss: false,
        ossProvider: state.ossProvider,
        contextFiles: [],
        selectedSkills: [],
        goalMode: true,
      });
    const access = accessSettings({ accessMode: executionSettings.accessMode });
    const reservationKey = `${card.workspaceId}:${card.chatId}`;
    if (
      launchReservations.has(reservationKey) ||
      dependencies.findRunControl(card.workspaceId, card.chatId, card.id)
    ) {
      throw new Error(
        "This card conversation already has an active or starting run.",
      );
    }

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
          repositories: card.repositories,
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
          onExecutionRoot: (nextExecutionRoot) => {
            executionRoot = nextExecutionRoot;
          },
        });
        executionRoot = repositoryExecution.executionRoot;
        const selectedBinding =
          repositoryExecution.bindings.find(
            (binding) =>
              binding.sourceRepositoryPath ===
              executionSettings.selectedRepositoryPath,
          ) ?? repositoryExecution.bindings[0] ?? null;
        const runExecutionSettings = selectedBinding
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
        await dependencies.updateChat(chat.id, {
          accountId: profileKey === "default" ? null : accountId,
          profileKey,
          status: "starting",
        });
        const turnIndex = await dependencies.getNextTurnIndex(chat.id);
        const currentThreadId = chat.codex_thread_id;
        const profileChanged = Boolean(
          chat.profile_key && chat.profile_key !== profileKey,
        );
        const inheritedContext = currentThreadId && !profileChanged
          ? null
          : await native.loadInheritedContext(card.id);
        const snapshot: RunSetupSnapshot = {
          promptText: effectivePrompt,
          promptFallback: effectivePrompt,
          workspace: { ...workspace, path: executionRoot },
          accountId,
          account,
          profileKey,
          chatOrigin: "orchestrator",
          externalThreadId: null,
          selectedRepositoryPath: runExecutionSettings.selectedRepositoryPath,
          selectedBranch: runExecutionSettings.selectedBranch,
          cachedPreflight: null,
          mode: runExecutionSettings.mode,
          intent: runExecutionSettings.intent,
          access,
          computerUseEnabled: runExecutionSettings.computerUseEnabled,
          model: runExecutionSettings.model,
          effort: runExecutionSettings.reasoningEffort,
          useOss: runExecutionSettings.useOss,
          ossProvider: runExecutionSettings.ossProvider,
          improvedPrompt: improvePrompt(effectivePrompt),
          contextFiles: runExecutionSettings.contextFiles,
          selectedSkills: runExecutionSettings.selectedSkills,
          goalMode: runExecutionSettings.goalMode,
          loginState: "idle",
          chatId: chat.id,
          threadId: profileChanged ? null : currentThreadId,
          turnIndex,
          threadStrategy: profileChanged
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
              : { kind: "fresh" },
          previousChatContext: inheritedContext,
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
