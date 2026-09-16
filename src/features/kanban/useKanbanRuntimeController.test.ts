import * as boardPreferences from "./boardPreferences";
import { describe, expect, it, vi } from "vitest";
import type { CodexAccountProfile } from "../accounts/types";
import type { CodexModel } from "../codex/types";
import type { ChatRecord } from "../conversations/types";
import type { Workspace } from "../workspaces/types";
import type { RunSetupSnapshot } from "../runs/runtimeTypes";
import {
  createRunExecutionSettings,
  serializeRunExecutionSettings,
} from "../../lib/runExecutionSettings";
import type {
  KanbanAttemptRecord,
  KanbanAttemptResult,
  KanbanCardRecord,
  KanbanGitBinding,
} from "./api";
import {
  createKanbanRuntimeController,
  type KanbanRuntimeControllerDependencies,
  type KanbanRuntimeNativeDependencies,
  type KanbanRuntimeRunControl,
} from "./useKanbanRuntimeController";

const workspace: Workspace = {
  id: 7,
  path: "/workspace",
  label: "Workspace",
  default_account_id: 3,
  selected_git_repository_path: null,
  last_opened_at: "2026-08-02T10:00:00Z",
  created_at: "2026-08-02T10:00:00Z",
};

const account: CodexAccountProfile = {
  id: 3,
  label: "Codex",
  email: "codex@example.com",
  plan_type: "plus",
  status: "signed_in",
  last_error: null,
  last_used_at: null,
  created_at: "2026-08-02T10:00:00Z",
  updated_at: "2026-08-02T10:00:00Z",
  deleted_at: null,
};

const model: CodexModel = {
  id: "gpt-5.6",
  model: "gpt-5.6",
  displayName: "GPT-5.6",
  description: "Test model",
  hidden: false,
  supportedReasoningEfforts: [
    { reasoningEffort: "high", description: "Deep reasoning" },
  ],
  defaultReasoningEffort: "high",
  isDefault: true,
};

function card(overrides: Partial<KanbanCardRecord> = {}): KanbanCardRecord {
  return {
    id: "card-1",
    workspaceId: workspace.id,
    chatId: 11,
    title: "Runtime card",
    description: "Exercise the runtime controller",
    accountId: null,
    accessMode: "ask-for-approval",
    model: null,
    reasoningLevel: null,
    repositoryScope: "selected",
    stage: "todo",
    sortPosition: 1_024,
    executionState: "idle",
    reviewState: "none",
    currentAttemptId: null,
    stateVersion: 4,
    archivedAt: null,
    deletedAt: null,
    approvedAt: null,
    lastError: null,
    hasInheritedContext: false,
    hasStartedTurn: false,
    createdAt: "2026-08-02T10:00:00Z",
    updatedAt: "2026-08-02T10:00:00Z",
    repositories: [
      {
        repositoryPath: "/workspace/repo",
        relativePath: "repo",
        label: "repo",
        includeDirtyChanges: false,
      },
    ],
    ...overrides,
  };
}

function chatRecord(overrides: Partial<ChatRecord> = {}): ChatRecord {
  return {
    id: 11,
    workspace_id: workspace.id,
    account_id: null,
    title: "Runtime card",
    codex_thread_id: null,
    status: "idle",
    surface: "kanban",
    origin: "orchestrator",
    profile_key: null,
    external_thread_id: null,
    source_kind: null,
    sync_status: null,
    external_cwd: null,
    external_created_at: null,
    external_updated_at: null,
    last_synced_at: null,
    created_at: "2026-08-02T10:00:00Z",
    updated_at: "2026-08-02T10:00:00Z",
    deleted_at: null,
    ...overrides,
  };
}

function attempt(): KanbanAttemptRecord {
  return {
    id: "attempt-1",
    cardId: "card-1",
    generation: 1,
    kind: "start",
    status: "starting",
    prompt: "Exercise the runtime controller",
    runId: null,
    taskId: null,
    threadId: null,
    turnId: null,
    executionRoot: null,
    lastEventSequence: 0,
    error: null,
    startedAt: "2026-08-02T10:01:00Z",
    completedAt: null,
  };
}

function binding(overrides: Partial<KanbanGitBinding> = {}): KanbanGitBinding {
  return {
    sourceRepositoryPath: "/workspace/repo",
    relativePath: "repo",
    executionRoot: "/cards/card-1/root",
    sourceBranch: "main",
    baseBranch: "main",
    baseCommit: "base",
    cardBranch: "codex/card-1",
    worktreePath: "/cards/card-1/root/repo",
    status: "ready",
    error: null,
    ...overrides,
  };
}

type TestRunControl = KanbanRuntimeRunControl & { clientId: string };

function runControl(): TestRunControl {
  return {
    clientId: "run-control-1",
    accountId: 0,
    profileKey: "default",
    runId: null,
    taskId: null,
    threadId: null,
    turnId: null,
    kanbanAttempt: {
      cardId: "card-1",
      attemptId: "attempt-1",
      generation: 1,
      executionRoot: "/cards/card-1/root",
      eventSequence: 0,
    },
    kanbanStopStatus: null,
  };
}

function harness() {
  const control = runControl();
  const dependencies = {
    getState: vi.fn(() => ({
      workspaces: [workspace],
      accounts: [account],
      selectedAccountId: account.id,
      sharedProfileAvailable: true,
      computerUseEnabled: true,
      browserExecutionTarget: "default-browser" as const,
    })),
    listModels: vi.fn(async () => [model]),
    listWorkspaceRepositories: vi.fn(async () => [
      {
        workspacePath: workspace.path,
        gitRoot: "/workspace/repo",
        currentBranch: "main",
        files: [],
        repository: {
          rootPath: "/workspace/repo",
          relativePath: "repo",
          label: "repo",
        },
      },
    ]),
    prepareCardTitle: vi.fn(async (value: KanbanCardRecord, _repositories: KanbanCardRecord["repositories"], _signal: AbortSignal) => value),
    loadChat: vi.fn(async () => chatRecord()),
    updateChat: vi.fn(async () => undefined),
    getNextTurnIndex: vi.fn(async () => 2),
    findRunControl: vi.fn(() => null as TestRunControl | null),
    beginRun: vi.fn((_snapshot: RunSetupSnapshot) => control),
    scheduleRun: vi.fn(
      (_control: TestRunControl, _snapshot: RunSetupSnapshot) => undefined,
    ),
    stopRun: vi.fn(async () => ({ stopped: true, goalCleared: false })),
    attempts: {
      persist: vi.fn(async () => ({ persisted: true as const, error: null })),
    },
    refreshBoards: vi.fn(),
  } satisfies KanbanRuntimeControllerDependencies<TestRunControl>;
  const claimed: KanbanAttemptResult = {
    card: card({ stateVersion: 5, executionState: "starting" }),
    attempt: attempt(),
  };
  const gitBinding = binding();
  const native = {
    claimAttempt: vi.fn(async () => claimed),
    prepareRepositoryExecution: vi.fn(async (input) => {
      input.onExecutionRoot?.(gitBinding.executionRoot);
      return {
        executionRoot: gitBinding.executionRoot,
        bindings: [gitBinding],
      };
    }),
    loadInheritedContext: vi.fn(async () => "Inherited card context"),
    stopInactiveCard: vi.fn(async () => card({ executionState: "stopped" })),
  } as unknown as KanbanRuntimeNativeDependencies;
  const controller = createKanbanRuntimeController(
    () => dependencies,
    native,
  );
  return { controller, control, dependencies, native, claimed, gitBinding };
}

describe("Kanban runtime controller", () => {
  it("reserves a launch while awaiting its title and provisions with the reloaded card", async () => {
    const { controller, dependencies, native } = harness();
    const target = card({ title: "Generating title..." });
    let settle!: (value: KanbanCardRecord) => void;
    dependencies.prepareCardTitle.mockImplementation(() => new Promise((resolve) => { settle = resolve; }));
    vi.mocked(native.claimAttempt).mockImplementation(async (input) => ({ card: card({ ...input.card, title: "Fix readable branch names", executionState: "starting" }), attempt: attempt() }));
    const launch = controller.launchCard(target, "start", target.description);
    expect(controller.isLaunchReserved(target.workspaceId, target.chatId)).toBe(true);
    await vi.waitFor(() => expect(dependencies.prepareCardTitle).toHaveBeenCalledOnce());
    expect(native.claimAttempt).not.toHaveBeenCalled();
    expect(native.prepareRepositoryExecution).not.toHaveBeenCalled();
    await expect(controller.launchCard(target, "start", target.description)).rejects.toThrow("active or starting");
    settle({ ...target, title: "Fix readable branch names" });
    await launch;
    expect(native.prepareRepositoryExecution).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      card: expect.objectContaining({ title: "Fix readable branch names" }),
    }));
    expect(controller.isLaunchReserved(target.workspaceId, target.chatId)).toBe(false);
  });

  it("cancels a title wait without creating an attempt or worktree and releases the reservation", async () => {
    const { controller, dependencies, native } = harness();
    const target = card();
    let settle!: (value: KanbanCardRecord) => void;
    dependencies.prepareCardTitle.mockImplementation(() => new Promise((resolve) => { settle = resolve; }));
    const launch = controller.launchCard(target, "start", target.description);
    await vi.waitFor(() => expect(dependencies.prepareCardTitle).toHaveBeenCalledOnce());
    await controller.stopCard(target);
    await expect(launch).rejects.toThrow("cancelled");
    settle(target);
    expect(native.claimAttempt).not.toHaveBeenCalled();
    expect(native.prepareRepositoryExecution).not.toHaveBeenCalled();
    expect(controller.isLaunchReserved(target.workspaceId, target.chatId)).toBe(false);
  });

  it("rejects launches before claiming an attempt while the target is being saved", async () => {
    const { controller, native, dependencies } = harness();
    const gate = vi.spyOn(boardPreferences, "assertKanbanTargetReady").mockImplementation(() => {
      throw new Error("The Kanban target branch is being saved.");
    });
    try {
      await expect(controller.launchCard(card(), "start", "Start", { queueItemId: "queued-card" })).rejects.toThrow("being saved");
      expect(native.claimAttempt).not.toHaveBeenCalled();
      expect(native.prepareRepositoryExecution).not.toHaveBeenCalled();
      expect(dependencies.beginRun).not.toHaveBeenCalled();
    } finally {
      gate.mockRestore();
    }
    await controller.launchCard(card(), "start", "Start");
    expect(native.claimAttempt).toHaveBeenCalledOnce();
  });

  it("passes a card question unchanged to the common submission path", async () => {
    const { controller, dependencies, claimed } = harness();
    const prompt = "Why am I seeing this error in the orchestrator UI?";
    claimed.attempt.prompt = prompt;
    await controller.launchCard(card(), "start", prompt);
    const snapshot = dependencies.beginRun.mock.calls[0][0];
    expect(snapshot.promptText).toBe(prompt);
    expect(snapshot).not.toHaveProperty("improvedPrompt");
  });

  it("claims, provisions, and schedules an isolated card run", async () => {
    const { controller, control, dependencies, native } = harness();
    const target = card();

    await controller.launchCard(target, "start", target.description);

    expect(native.claimAttempt).toHaveBeenCalledWith({
      card: target,
      kind: "start",
      prompt: target.description,
      configSnapshot: {
        version: 1,
        cardId: target.id,
        title: target.title,
        accountId: 0,
        accessMode: target.accessMode,
        model: model.model,
        reasoningLevel: model.defaultReasoningEffort,
        repositories: target.repositories,
      },
      executionSettingsJson: null,
    });
    expect(dependencies.updateChat).toHaveBeenCalledWith(target.chatId, {
      accountId: null,
      profileKey: "default",
      status: "starting",
    });
    expect(native.loadInheritedContext).toHaveBeenCalledWith(target.id);
    const [snapshot] = dependencies.beginRun.mock.calls[0]!;
    expect(snapshot).toMatchObject({
      promptText: target.description,
      workspace: { id: workspace.id, path: "/cards/card-1/root" },
      sourceWorkspacePath: workspace.path,
      accountId: 0,
      profileKey: "default",
      computerUseEnabled: true,
      model: model.model,
      effort: model.defaultReasoningEffort,
      chatId: target.chatId,
      threadId: null,
      turnIndex: 2,
      threadStrategy: { kind: "fresh" },
      previousChatContext: "Inherited card context",
      nativeTaskWorkspaceBinding: expect.objectContaining({
        kind: "kanban",
        sourceWorkspacePath: workspace.path,
        executionDirectory: "/cards/card-1/root",
        runtimeWorkspaceRoots: [
          "/cards/card-1/root",
          "/cards/card-1/root/repo",
        ],
      }),
      kanbanAttempt: {
        cardId: target.id,
        attemptId: "attempt-1",
        generation: 1,
        executionRoot: "/cards/card-1/root",
        eventSequence: 0,
      },
    });
    expect(snapshot.access).toMatchObject({
      accessMode: "ask-for-approval",
      approvalPolicy: "untrusted",
      sandbox: "workspace-write",
    });
    expect(dependencies.scheduleRun).toHaveBeenCalledWith(control, snapshot);
    expect(dependencies.refreshBoards).toHaveBeenCalledOnce();
  });

  it("upgrades multi-repository cards to the authoritative workspace inventory", async () => {
    const { controller, dependencies, native, gitBinding } = harness();
    const docsBinding = binding({
      sourceRepositoryPath: "/workspace/docs",
      relativePath: "docs",
      worktreePath: "/cards/card-1/root/docs",
      cardBranch: "codex/card-1-docs",
    });
    dependencies.listWorkspaceRepositories.mockResolvedValue([
      {
        workspacePath: workspace.path,
        gitRoot: "/workspace/repo",
        currentBranch: "main",
        files: [],
        repository: {
          rootPath: "/workspace/repo",
          relativePath: "repo",
          label: "repo",
        },
      },
      {
        workspacePath: workspace.path,
        gitRoot: "/workspace/docs",
        currentBranch: "docs-main",
        files: [],
        repository: {
          rootPath: "/workspace/docs",
          relativePath: "docs",
          label: "docs",
        },
      },
    ]);
    vi.mocked(native.prepareRepositoryExecution).mockImplementation(
      async (input) => {
        input.onExecutionRoot?.(gitBinding.executionRoot);
        return {
          executionRoot: gitBinding.executionRoot,
          bindings: [gitBinding, docsBinding],
        };
      },
    );
    const target = card({
      hasStartedTurn: true,
      executionState: "failed",
      repositoryScope: "selected",
      executionSettingsJson: serializeRunExecutionSettings(
        createRunExecutionSettings({
          accountId: 0,
          profileKey: "default",
          selectedRepositoryPath: "/workspace/repo",
          selectedBranch: "main",
          mode: "run",
          intent: "normal",
          accessMode: "ask-for-approval",
          computerUseEnabled: true,
          model: model.model,
          reasoningEffort: "high",
          contextFiles: [],
          selectedSkills: [],
          goalMode: false,
        }),
      ),
    });

    await controller.launchCard(target, "retry", target.description);

    expect(native.claimAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        configSnapshot: expect.objectContaining({
          repositories: [
            expect.objectContaining({ repositoryPath: "/workspace/repo" }),
            expect.objectContaining({
              repositoryPath: "/workspace/docs",
              includeDirtyChanges: false,
            }),
          ],
        }),
      }),
    );
    expect(native.prepareRepositoryExecution).toHaveBeenCalledWith(
      expect.objectContaining({
        repositories: [
          expect.objectContaining({ repositoryPath: "/workspace/repo" }),
          expect.objectContaining({ repositoryPath: "/workspace/docs" }),
        ],
        repositoryConfiguration: expect.objectContaining({
          repositoryScope: "all",
          executionSettingsJson: expect.stringContaining(
            '"selectedRepositoryPath":null',
          ),
        }),
      }),
    );
    const [snapshot] = dependencies.beginRun.mock.calls[0]!;
    expect(snapshot).toMatchObject({
      selectedRepositoryPath: null,
      selectedBranch: null,
      workspaceRepositoryRoots: [
        "/cards/card-1/root/repo",
        "/cards/card-1/root/docs",
      ],
    });
    expect(snapshot.workspaceRepositoryContext).toContain(
      "no repository is preselected",
    );
    expect(snapshot.executionSettings).toMatchObject({
      selectedRepositoryPath: null,
      selectedBranch: null,
    });
  });

  it("preserves edited-prompt replacement state on a claimed Kanban retry", async () => {
    const { controller, dependencies, native, claimed } = harness();
    const target = card({
      executionState: "failed",
      hasStartedTurn: true,
      currentAttemptId: "attempt-failed",
    });
    const restoreEntry = { clientId: "submitted-1" } as never;
    vi.mocked(native.claimAttempt).mockImplementation(async (input) => ({
      ...claimed,
      attempt: {
        ...claimed.attempt,
        kind: input.kind,
        prompt: input.prompt,
      },
    }));

    await controller.launchCard(target, "retry", "Edited card prompt", {
      turnIndex: 4,
      threadStrategy: { kind: "fresh" },
      previousChatContext: "Earlier completed conversation",
      supersededRunIds: [19],
      replacementClientId: "submitted-1",
      restoreEntryOnSetupFailure: restoreEntry,
      promptFallback: "Edited card prompt fallback",
    });

    expect(native.claimAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        card: target,
        kind: "retry",
        prompt: "Edited card prompt",
      }),
    );
    expect(dependencies.getNextTurnIndex).not.toHaveBeenCalled();
    const [snapshot] = dependencies.beginRun.mock.calls[0]!;
    expect(snapshot).toMatchObject({
      promptText: "Edited card prompt",
      promptFallback: "Edited card prompt fallback",
      turnIndex: 4,
      threadId: null,
      threadStrategy: { kind: "fresh" },
      previousChatContext: "Earlier completed conversation",
      supersededRunIds: [19],
      replacementClientId: "submitted-1",
      restoreEntryOnSetupFailure: restoreEntry,
      kanbanAttempt: expect.objectContaining({ attemptId: "attempt-1" }),
    });
  });

  it("replays captured composer settings for newly created cards", async () => {
    const { controller, dependencies } = harness();
    const executionSettings = createRunExecutionSettings({
      accountId: account.id,
      profileKey: "account:3",
      selectedRepositoryPath: "/workspace/repo",
      selectedBranch: "feature/board",
      mode: "plan",
      intent: "plan",
      accessMode: "full-access",
      computerUseEnabled: false,
      model: model.model,
      reasoningEffort: "high",
      contextFiles: [
        {
          path: "/workspace/repo/spec.md",
          name: "spec.md",
          source: "picker",
        },
      ],
      selectedSkills: [
        {
          id: "skill-1",
          name: "Board skill",
          description: "Build boards",
        },
      ],
      goalMode: false,
    });
    const target = card({
      accountId: account.id,
      executionSettingsJson: serializeRunExecutionSettings(executionSettings),
    });

    await controller.launchCard(target, "start", target.description);

    expect(dependencies.listModels).toHaveBeenCalledWith("account:3", account.id);
    expect(dependencies.updateChat).toHaveBeenCalledWith(target.chatId, {
      accountId: account.id, profileKey: "account:3", status: "starting",
    });
    const [snapshot] = dependencies.beginRun.mock.calls[0]!;
    expect(snapshot).toMatchObject({
      mode: "plan",
      intent: "plan",
      computerUseEnabled: false,
      selectedRepositoryPath: "/cards/card-1/root/repo",
      selectedBranch: "codex/card-1",
      contextFiles: [expect.objectContaining({ name: "spec.md" })],
      selectedSkills: [expect.objectContaining({ id: "skill-1" })],
      goalMode: false,
    });
    expect(snapshot.access.accessMode).toBe("full-access");
    expect(snapshot.access).toEqual({
      accessMode: "full-access",
      approvalPolicy: "never",
      permissionProfile: ":read-only",
      sandbox: "read-only",
    });
    expect(snapshot.executionSettings).toEqual(
      expect.objectContaining({
        ...executionSettings,
        selectedRepositoryPath: "/cards/card-1/root/repo",
        selectedBranch: "codex/card-1",
      }),
    );
  });

  it("starts a shared-profile Plan card without persisting the synthetic account id", async () => {
    const { controller, dependencies } = harness();
    const executionSettings = createRunExecutionSettings({
      accountId: 0,
      profileKey: "default",
      selectedRepositoryPath: "/workspace/repo",
      selectedBranch: "main",
      mode: "plan",
      intent: "plan",
      accessMode: "full-access",
      computerUseEnabled: true,
      model: model.model,
      reasoningEffort: "high",
      contextFiles: [],
      selectedSkills: [],
      goalMode: false,
    });
    const target = card({
      executionSettingsJson: serializeRunExecutionSettings(executionSettings),
    });
    dependencies.loadChat.mockResolvedValue(
      chatRecord({ profile_key: "default" }),
    );

    await controller.launchCard(target, "start", target.description);

    expect(dependencies.updateChat).toHaveBeenCalledWith(target.chatId, {
      accountId: null,
      profileKey: "default",
      status: "starting",
    });
    const [snapshot] = dependencies.beginRun.mock.calls[0]!;
    expect(snapshot).toMatchObject({
      accountId: 0,
      profileKey: "default",
      workspace: { path: "/cards/card-1/root" },
      sourceWorkspacePath: workspace.path,
      mode: "plan",
      intent: "plan",
    });
    expect(dependencies.scheduleRun).toHaveBeenCalledWith(
      expect.anything(),
      snapshot,
    );
  });

  it("does not switch a saved card to another account when its account is unavailable", async () => {
    const { controller, dependencies, native } = harness();
    dependencies.getState.mockReturnValue({
      ...dependencies.getState(), sharedProfileAvailable: false,
    });
    await expect(controller.launchCard(card(), "start", "Do the work"))
      .rejects.toThrow("account saved on this card is signed out or unavailable");
    expect(dependencies.listModels).not.toHaveBeenCalled();
    expect(native.claimAttempt).not.toHaveBeenCalled();
    expect(native.prepareRepositoryExecution).not.toHaveBeenCalled();
  });

  it("hands an isolated Kanban chat to the selected shared profile", async () => {
    const { controller, dependencies } = harness();
    const executionSettings = createRunExecutionSettings({
      accountId: 0,
      profileKey: "default",
      selectedRepositoryPath: "/workspace/repo",
      selectedBranch: "main",
      mode: "run",
      intent: "normal",
      accessMode: "full-access",
      computerUseEnabled: true,
      model: model.model,
      reasoningEffort: "high",
      contextFiles: [],
      selectedSkills: [],
      goalMode: false,
    });
    dependencies.loadChat.mockResolvedValue(
      chatRecord({
        account_id: account.id,
        profile_key: "account:3",
        codex_thread_id: "isolated-thread",
      }),
    );

    await controller.launchCard(card(), "start", "Continue this card", {
      executionSettings,
    });

    const [snapshot] = dependencies.beginRun.mock.calls[0]!;
    expect(snapshot.threadStrategy).toEqual({
      kind: "handoff",
      handoff: expect.objectContaining({
        fromThreadId: "isolated-thread",
        targetProfileKey: "default",
      }),
    });
  });

  it("implements an approved Plan on the existing card with authoritative settings and prompt", async () => {
    const { controller, dependencies, native, claimed } = harness();
    const implementationSettings = createRunExecutionSettings({
      accountId: account.id,
      profileKey: "account:3",
      selectedRepositoryPath: "/workspace/repo",
      selectedBranch: "main",
      mode: "run",
      intent: "plan-implementation",
      accessMode: "full-access",
      computerUseEnabled: false,
      model: model.model,
      reasoningEffort: "high",
      contextFiles: [],
      selectedSkills: [],
      goalMode: false,
    });
    const approvedPrompt = "Implement this approved plan:\n\n1. Add the feature";
    vi.mocked(native.claimAttempt).mockResolvedValue({
      ...claimed,
      attempt: {
        ...claimed.attempt,
        kind: "implement_plan",
        prompt: approvedPrompt,
      },
    });
    dependencies.loadChat.mockResolvedValue(
      chatRecord({
        account_id: account.id,
        profile_key: "account:3",
        codex_thread_id: "thread-card",
      }),
    );
    const target = card({
      stage: "in_review",
      executionState: "completed",
      reviewState: "awaiting_review",
      currentAttemptId: "attempt-plan",
      hasStartedTurn: true,
    });

    await controller.launchCard(
      target,
      "implement_plan",
      "Implement the approved plan.",
      { executionSettings: implementationSettings },
    );

    expect(native.claimAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        card: target,
        kind: "implement_plan",
        executionSettingsJson:
          serializeRunExecutionSettings(implementationSettings),
      }),
    );
    const [snapshot] = dependencies.beginRun.mock.calls[0]!;
    expect(snapshot).toMatchObject({
      promptText: approvedPrompt,
      promptFallback: approvedPrompt,
      chatId: target.chatId,
      threadId: "thread-card",
      threadStrategy: { kind: "resume" },
      mode: "run",
      intent: "plan-implementation",
      model: model.model,
      effort: "high",
      selectedRepositoryPath: "/cards/card-1/root/repo",
      selectedBranch: "codex/card-1",
      fromQueue: false,
      kanbanAttempt: { cardId: target.id },
    });
  });

  it("keeps queued continuations inside the card attempt and worktree", async () => {
    const { controller, dependencies, native } = harness();
    const executionSettings = createRunExecutionSettings({
      accountId: account.id,
      profileKey: "account:3",
      selectedRepositoryPath: "/workspace/repo",
      selectedBranch: "main",
      mode: "run",
      intent: "normal",
      accessMode: "ask-for-approval",
      computerUseEnabled: true,
      model: model.model,
      reasoningEffort: "high",
      contextFiles: [],
      selectedSkills: [],
      goalMode: false,
    });
    dependencies.loadChat.mockResolvedValue(
      chatRecord({ codex_thread_id: "thread-card" }),
    );

    await controller.launchCard(
      card({ hasStartedTurn: true, executionState: "completed" }),
      "request_changes",
      "Add another validation case",
      {
        executionSettings,
        queueItemId: "queue-1",
        clientUserMessageId: "message-1",
      },
    );

    expect(native.claimAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "request_changes",
        prompt: "Add another validation case",
      }),
    );
    const [snapshot] = dependencies.beginRun.mock.calls[0]!;
    expect(snapshot).toMatchObject({
      workspace: { path: "/cards/card-1/root" },
      threadId: "thread-card",
      threadStrategy: { kind: "resume" },
      queueItemId: "queue-1",
      fromQueue: true,
      clientUserMessageId: "message-1",
      selectedRepositoryPath: "/cards/card-1/root/repo",
      selectedBranch: "codex/card-1",
      kanbanAttempt: { cardId: "card-1" },
    });
  });

  it("prevents concurrent launches for the same card conversation", async () => {
    const { controller, native } = harness();
    const target = card();
    let resolveClaim!: (result: KanbanAttemptResult) => void;
    let markClaimStarted!: () => void;
    const claimStarted = new Promise<void>((resolve) => {
      markClaimStarted = resolve;
    });
    const pendingClaim = new Promise<KanbanAttemptResult>((resolve) => {
      resolveClaim = resolve;
    });
    const claimed: KanbanAttemptResult = {
      card: card({ stateVersion: 5 }),
      attempt: attempt(),
    };
    vi.mocked(native.claimAttempt).mockImplementation(async () => {
      markClaimStarted();
      return pendingClaim;
    });

    const firstLaunch = controller.launchCard(
      target,
      "start",
      target.description,
    );
    await claimStarted;
    await expect(
      controller.launchCard(target, "start", target.description),
    ).rejects.toThrow(
      "This card conversation already has an active or starting run.",
    );
    resolveClaim(claimed);
    await firstLaunch;
    expect(native.claimAttempt).toHaveBeenCalledOnce();
  });

  it("persists a failed claimed attempt with a discovered execution root", async () => {
    const { controller, dependencies, native } = harness();
    vi.mocked(native.prepareRepositoryExecution).mockImplementation(
      async (input) => {
        input.onExecutionRoot?.("/cards/card-1/partial");
        throw new Error("Repository setup failed");
      },
    );

    await expect(
      controller.launchCard(card(), "start", "Start the card"),
    ).rejects.toThrow("Repository setup failed");
    expect(dependencies.attempts.persist).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: 0,
        profileKey: "default",
        kanbanAttempt: expect.objectContaining({
          cardId: "card-1",
          executionRoot: "/cards/card-1/partial",
        }),
      }),
      "failed",
      "Repository setup failed",
    );
    expect(dependencies.beginRun).not.toHaveBeenCalled();
  });

  it("rejects a saved model that is no longer available", async () => {
    const { controller, dependencies, native } = harness();
    dependencies.listModels.mockResolvedValue([]);

    await expect(
      controller.launchCard(card({ model: "removed-model" }), "start", "Go"),
    ).rejects.toThrow("The model saved on this card is no longer available.");
    expect(native.claimAttempt).not.toHaveBeenCalled();
  });

  it("pauses a matching live card run through the shared stop bridge", async () => {
    const { controller, control, dependencies } = harness();
    dependencies.findRunControl.mockReturnValue(control);

    await controller.pauseCard(card());

    expect(dependencies.findRunControl).toHaveBeenCalledWith(
      workspace.id,
      11,
      "card-1",
    );
    expect(control.kanbanStopStatus).toBe("paused");
    expect(dependencies.stopRun).toHaveBeenCalledWith(control);
  });

  it("stops a waiting live card through the shared stop bridge", async () => {
    const { controller, control, dependencies, native } = harness();
    dependencies.findRunControl.mockReturnValue(control);

    await controller.stopCard(card({ executionState: "waiting_user" }));

    expect(dependencies.findRunControl).toHaveBeenCalledWith(
      workspace.id,
      11,
      "card-1",
    );
    expect(control.kanbanStopStatus).toBe("stopped");
    expect(dependencies.stopRun).toHaveBeenCalledWith(control);
    expect(native.stopInactiveCard).not.toHaveBeenCalled();
  });

  it("stops an inactive card natively and refreshes the board", async () => {
    const { controller, dependencies, native } = harness();
    const target = card();

    await controller.stopCard(target);

    expect(dependencies.findRunControl).toHaveBeenCalledWith(
      workspace.id,
      target.chatId,
      target.id,
    );
    expect(native.stopInactiveCard).toHaveBeenCalledWith(target);
    expect(dependencies.stopRun).not.toHaveBeenCalled();
    expect(dependencies.refreshBoards).toHaveBeenCalledOnce();
  });

  it("rejects a pause when the shared stop bridge does not stop the run", async () => {
    const { controller, control, dependencies } = harness();
    dependencies.findRunControl.mockReturnValue(control);
    dependencies.stopRun.mockResolvedValue({
      stopped: false,
      goalCleared: false,
    });

    await expect(controller.pauseCard(card())).rejects.toThrow(
      "The card turn could not be paused.",
    );
  });
});
