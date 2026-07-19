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
  listWorkspaceChats,
  recordTokenUsage,
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
  });
});
