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

function binding(): KanbanGitBinding {
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
  };
}

type TestRunControl = KanbanRuntimeRunControl & { clientId: string };

function runControl(): TestRunControl {
  return {
    clientId: "run-control-1",
    accountId: account.id,
    profileKey: "account:3",
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
      computerUseEnabled: true,
      browserExecutionTarget: "default-browser" as const,
      ossProvider: "ollama" as const,
    })),
    listModels: vi.fn(async () => [model]),
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
        accountId: account.id,
        accessMode: target.accessMode,
        model: model.model,
        reasoningLevel: model.defaultReasoningEffort,
        repositories: target.repositories,
      },
    });
    expect(dependencies.updateChat).toHaveBeenCalledWith(target.chatId, {
      accountId: account.id,
      profileKey: "account:3",
      status: "starting",
    });
    expect(native.loadInheritedContext).toHaveBeenCalledWith(target.id);
    const [snapshot] = dependencies.beginRun.mock.calls[0]!;
    expect(snapshot).toMatchObject({
      promptText: target.description,
      workspace: { id: workspace.id, path: "/cards/card-1/root" },
      accountId: account.id,
      profileKey: "account:3",
      computerUseEnabled: true,
      model: model.model,
      effort: model.defaultReasoningEffort,
      chatId: target.chatId,
      threadId: null,
      turnIndex: 2,
      threadStrategy: { kind: "fresh" },
      previousChatContext: "Inherited card context",
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
      useOss: false,
      ossProvider: "ollama",
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
    expect(snapshot.executionSettings).toEqual(
      expect.objectContaining({
        ...executionSettings,
        selectedRepositoryPath: "/cards/card-1/root/repo",
        selectedBranch: "codex/card-1",
      }),
    );
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
      useOss: false,
      ossProvider: "ollama",
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
        accountId: account.id,
        profileKey: "account:3",
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

    expect(control.kanbanStopStatus).toBe("paused");
    expect(dependencies.stopRun).toHaveBeenCalledWith(control);
  });

  it("stops an inactive card natively and refreshes the board", async () => {
    const { controller, dependencies, native } = harness();
    const target = card();

    await controller.stopCard(target);

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
