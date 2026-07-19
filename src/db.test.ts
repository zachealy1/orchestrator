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
  });
});
