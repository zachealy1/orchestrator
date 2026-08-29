import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  invoke: vi.fn(),
  load: vi.fn(),
  select: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: mocks.invoke,
}));

vi.mock("@tauri-apps/plugin-sql", () => ({
  default: {
    load: mocks.load,
  },
}));

import { FrontendDatabase } from "./data/database";
import {
  createAppRepositories,
  type RunEventInput,
} from "./data/repositories";
import { createQueuedPromptSnapshot } from "./lib/promptQueue";
import { createRunExecutionSettings } from "./lib/runExecutionSettings";

const repositories = createAppRepositories(new FrontendDatabase());
const {
  activateChatAccountHandoff,
  chatHasPendingPlanReview,
  claimChatTitleGeneration,
  completeChatTitleGeneration,
  createChat,
  failChatTitleGeneration,
  recoverAbandonedRuns,
  recoverInterruptedChatTitleGenerations,
  renameChat,
  upsertExternalCodexChats,
} = repositories.chats;
const {
  createChatWithQueuedPrompt,
  holdRestoredPromptQueueItems,
  listRestoredPromptQueueItems,
  recoverInterruptedPromptQueueItems,
  setPromptQueueItemAutoSend,
} = repositories.promptQueue;
const {
  appendRunEvents,
  createRun,
  recordTokenUsage,
  updateRun,
} = repositories.runs;
const {
  listLocalChatTranscript,
  listWorkspaceChats,
  softDeleteChat,
} = repositories.transcripts;
const { softDeleteWorkspace } = repositories.workspaces;

beforeEach(() => {
  mocks.execute.mockReset();
  mocks.execute.mockResolvedValue({ rowsAffected: 1 });
  mocks.invoke.mockReset();
  mocks.invoke.mockResolvedValue(null);
  mocks.load.mockReset();
  mocks.select.mockReset();
  mocks.select.mockResolvedValue([]);
  mocks.load.mockResolvedValue({
    execute: mocks.execute,
    select: mocks.select,
  });
});

function queuedPromptSnapshot() {
  const executionSettings = createRunExecutionSettings({
    accountId: 7,
    profileKey: "account:7",
    selectedBranch: "main",
    mode: "run",
    intent: "normal",
    accessMode: "ask-for-approval",
    computerUseEnabled: true,
    model: "gpt-5.6",
    reasoningEffort: "medium",
    contextFiles: [],
    selectedSkills: [],
    goalMode: false,
  });
  return createQueuedPromptSnapshot({
    prompt: "Implement durable queuing",
    executionSettings,
    contextFingerprint: {
      version: 2,
      workspacePath: "/workspace/project",
      repositories: [
        {
          repositoryPath: "/workspace/project",
          branch: "main",
          headCommit: "abc",
          worktreeFingerprint: "clean",
        },
      ],
      profileKey: "account:7",
      threadId: null,
      conversationRevision: 0,
      files: [],
    },
  });
}

describe("prompt queue persistence", () => {
  it("creates a first chat and its queued prompt in one transaction", async () => {
    const snapshot = queuedPromptSnapshot();
    const now = "2026-07-26T10:00:00Z";
    mocks.invoke.mockResolvedValueOnce({ chatId: 42 });
    mocks.select
      .mockResolvedValueOnce([
        {
          id: 42,
          workspace_id: 3,
          account_id: 7,
          title: "Generating title...",
          codex_thread_id: null,
          status: "queued",
          origin: "orchestrator",
          profile_key: "account:7",
          external_thread_id: null,
          source_kind: null,
          sync_status: null,
          external_cwd: null,
          external_created_at: null,
          external_updated_at: null,
          last_synced_at: null,
          title_generation_state: "pending",
          title_fallback: "Implement durable queuing",
          title_manually_edited: 0,
          title_generation_started_at: null,
          conversation_revision: 0,
          created_at: now,
          updated_at: now,
          deleted_at: null,
        },
      ])
      .mockResolvedValueOnce([
        {
          id: "queue-1",
          client_message_id: "message-1",
          workspace_id: 3,
          chat_id: 42,
          position: 0,
          send_now_priority: null,
          auto_send_enabled: 1,
          prompt_text: snapshot.prompt,
          execution_snapshot_json: JSON.stringify(snapshot),
          context_fingerprint_json: JSON.stringify(
            snapshot.contextFingerprint,
          ),
          conversation_revision: 0,
          status: "queued",
          linked_run_id: null,
          linked_turn_id: null,
          error: null,
          stale_reasons_json: null,
          created_at: now,
          updated_at: now,
          accepted_at: null,
          completed_at: null,
        },
      ]);

    await expect(
      createChatWithQueuedPrompt({
        workspaceId: 3,
        accountId: 7,
        title: "Implement durable queuing",
        status: "queued",
        generateTitle: true,
        itemId: "queue-1",
        clientMessageId: "message-1",
        prompt: snapshot.prompt,
        snapshot,
      }),
    ).resolves.toEqual({
      chat: expect.objectContaining({ id: 42 }),
      item: expect.objectContaining({ id: "queue-1", chatId: 42 }),
    });

    expect(mocks.invoke).toHaveBeenCalledWith(
      "create_chat_with_queued_prompt",
      {
        request: expect.objectContaining({
          workspaceId: 3,
          accountId: 7,
          itemId: "queue-1",
          clientMessageId: "message-1",
          conversationRevision: 0,
        }),
      },
    );
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("rolls back a newly created chat when durable enqueue fails", async () => {
    const snapshot = queuedPromptSnapshot();
    mocks.invoke.mockRejectedValueOnce(
      new Error("Prompt was not added to the queue."),
    );

    await expect(
      createChatWithQueuedPrompt({
        workspaceId: 3,
        accountId: 7,
        title: "Implement durable queuing",
        status: "queued",
        generateTitle: true,
        itemId: "queue-1",
        clientMessageId: "message-1",
        prompt: snapshot.prompt,
        snapshot,
      }),
    ).rejects.toThrow("Prompt was not added to the queue");

    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it("recovers uncertain delivery states as retryable failures", async () => {
    mocks.execute.mockResolvedValueOnce({ rowsAffected: 3 });

    await expect(recoverInterruptedPromptQueueItems()).resolves.toBe(3);

    const [query] = mocks.execute.mock.calls[0] ?? [];
    expect(query).toContain("WHERE status IN ('starting', 'steering', 'active')");
    expect(query).toContain("status = 'failed'");
    expect(query).toContain("delivery could be confirmed");
    expect(query).toContain("send_now_priority = NULL");
  });

  it("holds a queued item without archiving it", async () => {
    await setPromptQueueItemAutoSend("queue-1", false);

    const [query, values] = mocks.execute.mock.calls[0] ?? [];
    expect(query).toContain("SET auto_send_enabled = $1");
    expect(query).toContain("WHEN $1 = 0 THEN NULL");
    expect(query).toContain(
      "WHEN $1 = 0 AND status = 'scheduled-next' THEN 'queued'",
    );
    expect(query).not.toContain("status = 'skipped'");
    expect(values).toEqual([0, "queue-1"]);
  });

  it("restores held queue items with their automatic-send state intact", async () => {
    const snapshot = queuedPromptSnapshot();
    mocks.select.mockResolvedValueOnce([
      {
        id: "queue-held",
        client_message_id: "message-held",
        workspace_id: 3,
        chat_id: 42,
        position: 1,
        send_now_priority: null,
        auto_send_enabled: 0,
        prompt_text: snapshot.prompt,
        execution_snapshot_json: JSON.stringify(snapshot),
        context_fingerprint_json: JSON.stringify(
          snapshot.contextFingerprint,
        ),
        conversation_revision: 0,
        status: "queued",
        linked_run_id: null,
        linked_turn_id: null,
        error: null,
        stale_reasons_json: null,
        created_at: "2026-07-26T10:00:00Z",
        updated_at: "2026-07-26T10:00:00Z",
        accepted_at: null,
        completed_at: null,
      },
    ]);

    await expect(listRestoredPromptQueueItems()).resolves.toEqual([
      expect.objectContaining({
        id: "queue-held",
        autoSendEnabled: false,
        status: "queued",
      }),
    ]);
    expect(mocks.select.mock.calls[0]?.[0]).toContain(
      "WHERE status NOT IN ('skipped', 'completed')",
    );
    expect(mocks.select.mock.calls[0]?.[0]).toContain("auto_send_enabled");
  });

  it("holds every restored queue item before returning it to the app", async () => {
    mocks.execute.mockResolvedValueOnce({ rowsAffected: 2 });
    mocks.select.mockResolvedValueOnce([]);

    await expect(holdRestoredPromptQueueItems()).resolves.toEqual([]);

    const [query] = mocks.execute.mock.calls[0] ?? [];
    expect(query).toContain("SET auto_send_enabled = 0");
    expect(query).toContain("send_now_priority = NULL");
    expect(query).toContain(
      "WHEN status = 'scheduled-next' THEN 'queued'",
    );
    expect(query).toContain("WHERE status NOT IN ('skipped', 'completed')");
  });

  it("removes durable queue items when a chat is soft-deleted", async () => {
    await softDeleteChat(42);

    expect(mocks.invoke).toHaveBeenCalledWith(
      "soft_delete_chat_transaction",
      { chatId: 42 },
    );
  });

  it("removes durable queue items when a workspace is soft-deleted", async () => {
    await softDeleteWorkspace(7);

    expect(mocks.invoke).toHaveBeenCalledWith(
      "soft_delete_workspace_transaction",
      { workspaceId: 7 },
    );
  });

  it("checks plan-review blocking without loading the chat transcript", async () => {
    mocks.select.mockResolvedValueOnce([{ has_pending_review: 1 }]);

    await expect(chatHasPendingPlanReview(42)).resolves.toBe(true);

    expect(mocks.select).toHaveBeenCalledWith(
      expect.stringContaining("plan_review_state = 'available'"),
      [42],
    );
  });
});

describe("chat title generation persistence", () => {
  it("creates new chats with a durable temporary title and fallback", async () => {
    mocks.execute.mockResolvedValueOnce({ lastInsertId: 42, rowsAffected: 1 });
    mocks.select.mockResolvedValueOnce([
      {
        id: 42,
        workspace_id: 3,
        account_id: 7,
        title: "Generating title...",
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
        title_generation_state: "pending",
        title_fallback: "Fix OAuth callback failures",
        title_manually_edited: 0,
        title_generation_started_at: null,
        created_at: "2026-07-22T10:00:00Z",
        updated_at: "2026-07-22T10:00:00Z",
        deleted_at: null,
      },
    ]);

    await createChat({
      workspaceId: 3,
      accountId: 7,
      title: "Fix OAuth callback failures",
      status: "starting",
      generateTitle: true,
    });

    const [query, values] = mocks.execute.mock.calls[0] ?? [];
    expect(query).toContain("title_generation_state, title_fallback");
    expect(values).toEqual([
      3,
      7,
      "Generating title...",
      "starting",
      "chat",
      "account:7",
      "pending",
      "Fix OAuth callback failures",
      null,
      null,
      null,
      null,
      0,
    ]);
  });

  it("claims and completes a title generation only through guarded states", async () => {
    expect(await claimChatTitleGeneration(42)).toBe(true);
    expect(await completeChatTitleGeneration(42, "Repair OAuth Callback Flow")).toBe(
      true,
    );

    expect(mocks.execute.mock.calls[0]?.[0]).toContain(
      "title_generation_state = 'pending'",
    );
    expect(mocks.execute.mock.calls[1]?.[0]).toContain(
      "title_manually_edited = 0",
    );
    expect(mocks.execute.mock.calls[1]?.[1]).toEqual([
      "Repair OAuth Callback Flow",
      42,
    ]);
  });

  it("falls back interrupted generations without issuing another request", async () => {
    await recoverInterruptedChatTitleGenerations();
    await failChatTitleGeneration(42);

    expect(mocks.execute.mock.calls[0]?.[0]).toContain(
      "title_generation_state IN ('pending', 'generating')",
    );
    expect(mocks.execute.mock.calls[0]?.[0]).toContain("title_fallback");
    expect(mocks.execute.mock.calls[1]?.[0]).toContain("title_fallback");
  });

  it("marks explicit title edits so background generation cannot overwrite them", async () => {
    await renameChat(42, "Manual OAuth Investigation");

    const [query, values] = mocks.execute.mock.calls[0] ?? [];
    expect(query).toContain("title_manually_edited = 1");
    expect(query).toContain("title_generation_state = 'complete'");
    expect(values).toEqual(["Manual OAuth Investigation", 42]);
  });
});

describe("abandoned run recovery", () => {
  it("marks process-owned run state interrupted before history loads", async () => {
    mocks.invoke.mockResolvedValueOnce({ runs: 3, tasks: 2, chats: 1 });

    await expect(recoverAbandonedRuns()).resolves.toEqual({
      runs: 3,
      tasks: 2,
      chats: 1,
    });

    expect(mocks.invoke).toHaveBeenCalledWith(
      "recover_abandoned_runs_transaction",
    );
  });
});

describe("run event persistence", () => {
  it("sends high-volume run events through one atomic native write", async () => {
    const events: RunEventInput[] = Array.from({ length: 101 }, (_, index) => ({
      runId: 7,
      sequence: index + 1,
      eventType: "notification",
      method: "item/agentMessage/delta",
      payload: { params: { delta: String(index) } },
    }));

    await appendRunEvents(events);

    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    expect(mocks.invoke).toHaveBeenCalledWith(
      "append_run_events_transaction",
      { events },
    );
  });

  it("persists active context separately from cumulative token usage", async () => {
    await recordTokenUsage({
      runId: 7,
      threadId: "thread-1",
      turnId: "turn-1",
      totalTokens: 173_959,
      inputTokens: 171_922,
      cachedInputTokens: 131_968,
      outputTokens: 2_037,
      reasoningOutputTokens: 103,
      turnTokens: 55_573,
      turnCachedInputTokens: 31_674,
      contextTokens: 18_757,
      modelContextWindow: 258_400,
    });

    const [query, values] = mocks.execute.mock.calls[0] ?? [];
    expect(query).toContain("context_tokens, model_context_window");
    expect(values).toEqual([
      7,
      "thread-1",
      "turn-1",
      173_959,
      171_922,
      131_968,
      2_037,
      103,
      55_573,
      31_674,
      18_757,
      258_400,
    ]);
  });
});

describe("run execution settings persistence", () => {
  it("stores the immutable settings JSON when creating a run", async () => {
    const executionSettingsJson = JSON.stringify({
      version: 1,
      accountId: 7,
      profileKey: "account:7",
    });
    mocks.execute.mockResolvedValueOnce({ lastInsertId: 81, rowsAffected: 1 });
    mocks.select.mockResolvedValueOnce([
      {
        id: 81,
        execution_settings_json: executionSettingsJson,
      },
    ]);

    await createRun({
      taskId: 10,
      workspaceId: 3,
      accountId: 7,
      accountLabel: "Work",
      status: "starting",
      sandbox: "workspace-write",
      approvalPolicy: "untrusted",
      executionSettingsJson,
    });

    const [insert, values] = mocks.execute.mock.calls[0] ?? [];
    const [select] = mocks.select.mock.calls[0] ?? [];
    expect(insert).toContain("execution_settings_json");
    expect(values?.at(-1)).toBe(executionSettingsJson);
    expect(select).toContain("execution_settings_json");
  });

  it("loads execution settings with local historical transcript rows", async () => {
    await listLocalChatTranscript(42);

    const query = mocks.select.mock.calls[0]?.[0] as string;
    expect(query).toContain("runs.execution_settings_json");
    expect(query).toContain("runs.account_id");
    expect(query).toContain("runs.model");
    expect(query).toContain(
      "latest_tokens.cached_input_tokens AS latest_cached_input_tokens",
    );
  });
});

describe("run web preview persistence", () => {
  it("updates and loads the latest preview metadata", async () => {
    const webPreviewJson = JSON.stringify({
      version: 1,
      url: "http://localhost:5173/",
      origin: "http://localhost:5173",
      detectedAt: "2026-07-24T12:00:00.000Z",
      sourceCommandId: "command-1",
      availability: "available",
    });

    await updateRun(81, { webPreviewJson });
    const [updateQuery, updateValues] = mocks.execute.mock.calls[0] ?? [];
    expect(updateQuery).toContain("web_preview_json = $1");
    expect(updateValues).toEqual([webPreviewJson, 81]);

    mocks.select.mockClear();
    await listLocalChatTranscript(42);
    const transcriptQuery = mocks.select.mock.calls[0]?.[0] as string;
    expect(transcriptQuery).toContain("runs.web_preview_json");
  });
});

describe("external chat metadata", () => {
  it("forwards source metadata to the atomic external-chat upsert", async () => {
    await upsertExternalCodexChats([
      {
        workspaceId: 3,
        profileKey: "default",
        externalThreadId: "thread-large",
        title: "Large chat",
        status: "completed",
        sourceKind: "vscode",
        cwd: "/workspace",
        createdAt: "2026-07-01T10:00:00Z",
        updatedAt: null,
      },
    ]);

    expect(mocks.invoke).toHaveBeenCalledWith(
      "upsert_external_codex_chats_transaction",
      {
        chats: [
          expect.objectContaining({
            externalThreadId: "thread-large",
            updatedAt: null,
          }),
        ],
      },
    );
  });

  it("delegates adopted-chat protection to the atomic native upsert", async () => {
    await upsertExternalCodexChats([
      {
        workspaceId: 3,
        profileKey: "default",
        externalThreadId: "thread-large",
        title: "Changed source title",
        status: "completed",
        sourceKind: "vscode",
        cwd: "/workspace",
        createdAt: "2026-07-01T10:00:00Z",
        updatedAt: "2026-07-20T08:00:00Z",
      },
    ]);

    expect(mocks.invoke).toHaveBeenCalledWith(
      "upsert_external_codex_chats_transaction",
      { chats: [expect.objectContaining({ externalThreadId: "thread-large" })] },
    );
  });

  it("atomically activates a chat account handoff", async () => {
    expect(
      await activateChatAccountHandoff({
        chatId: 34,
        expectedProfileKey: "default",
        expectedThreadId: "external-thread",
        accountId: 8,
        profileKey: "account:8",
        codexThreadId: "managed-thread",
        status: "running",
      }),
    ).toBe(true);

    const [query, values] = mocks.execute.mock.calls[0] ?? [];
    expect(query).toContain("sync_status = CASE");
    expect(query).toContain("profile_key IS $6");
    expect(query).toContain("codex_thread_id IS $7");
    expect(values).toEqual([
      8,
      "account:8",
      "managed-thread",
      "running",
      34,
      "default",
      "external-thread",
    ]);
  });

  it("uses cached external snapshot counts in the history list", async () => {
    await listWorkspaceChats(3);

    const query = mocks.select.mock.calls[0]?.[0] as string;
    expect(query).toContain(
      "LEFT JOIN external_chat_transcript_snapshots external_snapshot",
    );
    expect(query).toContain("MAX(external_snapshot.turn_count)");
    expect(query).toContain("+ COUNT(runs.id)");
    expect(query).toContain("SUM(latest_tokens.run_tokens)");
    expect(query).toContain("strftime(");
    expect(query).toContain("COALESCE(runs.completed_at, runs.started_at)");
    expect(query).toContain("ORDER BY julianday(latest_activity_at) DESC");
  });
});
