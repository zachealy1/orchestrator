import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  load: vi.fn(),
  select: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-sql", () => ({
  default: {
    load: mocks.load,
  },
}));

import {
  appendRunEvents,
  claimChatTitleGeneration,
  completeChatTitleGeneration,
  createChat,
  failChatTitleGeneration,
  listWorkspaceChats,
  recordTokenUsage,
  recoverInterruptedChatTitleGenerations,
  renameChat,
  upsertExternalCodexChats,
  type RunEventInput,
} from "./db";

beforeEach(() => {
  mocks.execute.mockReset();
  mocks.execute.mockResolvedValue({ rowsAffected: 1 });
  mocks.load.mockReset();
  mocks.select.mockReset();
  mocks.select.mockResolvedValue([]);
  mocks.load.mockResolvedValue({
    execute: mocks.execute,
    select: mocks.select,
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
      "account:7",
      "pending",
      "Fix OAuth callback failures",
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

describe("run event persistence", () => {
  it("persists high-volume run events in bounded multi-row inserts", async () => {
    const events: RunEventInput[] = Array.from({ length: 101 }, (_, index) => ({
      runId: 7,
      sequence: index + 1,
      eventType: "notification",
      method: "item/agentMessage/delta",
      payload: { params: { delta: String(index) } },
    }));

    await appendRunEvents(events);

    expect(mocks.execute).toHaveBeenCalledTimes(2);
    const [firstQuery, firstValues] = mocks.execute.mock.calls[0] ?? [];
    const [secondQuery, secondValues] = mocks.execute.mock.calls[1] ?? [];

    expect(firstQuery).toContain("VALUES ($1, $2, $3, $4, $5)");
    expect(firstQuery).toContain("($496, $497, $498, $499, $500)");
    expect(firstValues).toHaveLength(500);
    expect(firstValues?.slice(0, 5)).toEqual([
      7,
      1,
      "notification",
      "item/agentMessage/delta",
      JSON.stringify(events[0]?.payload),
    ]);
    expect(secondQuery).toContain("VALUES ($1, $2, $3, $4, $5)");
    expect(secondValues).toEqual([
      7,
      101,
      "notification",
      "item/agentMessage/delta",
      JSON.stringify(events[100]?.payload),
    ]);
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

describe("external chat metadata", () => {
  it("preserves the known source version when a sync omits updatedAt", async () => {
    mocks.select.mockResolvedValueOnce([
      {
        id: 34,
        deleted_at: null,
        external_created_at: "2026-07-01T10:00:00Z",
        external_updated_at: "2026-07-19T08:00:00Z",
      },
    ]);

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

    expect(mocks.execute).toHaveBeenCalledTimes(1);
    expect(mocks.execute.mock.calls[0]?.[1]).toContain(
      "2026-07-19T08:00:00Z",
    );
    expect(mocks.execute.mock.calls[0]?.[0]).not.toContain(
      "DELETE FROM external_chat_history_indexes",
    );
  });

  it("uses cached external snapshot counts in the history list", async () => {
    await listWorkspaceChats(3);

    const query = mocks.select.mock.calls[0]?.[0] as string;
    expect(query).toContain(
      "LEFT JOIN external_chat_transcript_snapshots external_snapshot",
    );
    expect(query).toContain("MAX(external_snapshot.turn_count)");
    expect(query).toContain("SUM(latest_tokens.run_tokens)");
    expect(query).toContain("strftime(");
    expect(query).toContain("COALESCE(runs.completed_at, runs.started_at)");
    expect(query).toContain("ORDER BY julianday(latest_activity_at) DESC");
  });
});
