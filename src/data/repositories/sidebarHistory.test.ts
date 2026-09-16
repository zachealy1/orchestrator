// @ts-expect-error Vitest runs in Node; the application intentionally omits Node types.
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import type { FrontendDatabase } from "../database";
import { createTranscriptRepository } from "./transcripts";

// Execute the repository's actual queries against SQLite and the application's migrations.
const sqlite = String.raw`
import sys, json, sqlite3
from pathlib import Path
payload = json.load(sys.stdin)
db = sqlite3.connect(':memory:')
for migration in sorted(Path('src-tauri/migrations').glob('*.sql')):
    db.executescript(migration.read_text())
db.execute('PRAGMA foreign_keys = OFF')
for table, rows in payload['tables'].items():
    for row in rows:
        columns = ','.join(row.keys())
        placeholders = ','.join('?' for _ in row)
        db.execute(f'INSERT INTO {table} ({columns}) VALUES ({placeholders})', list(row.values()))
db.row_factory = sqlite3.Row
print(json.dumps([dict(row) for row in db.execute(payload['sql'], {str(index + 1): value for index, value in enumerate(payload['bindings'])})]))
`;
type Row = Record<string, string | number | null>;
const now = "2026-09-12T12:00:00.000Z";
function chat(id: number, fields: Row = {}): Row {
  return {
    id,
    workspace_id: 1,
    title: `Chat ${id}`,
    status: "completed",
    ...fields,
  };
}
function run(
  id: number,
  chatId: number,
  completedAt: string | null,
  fields: Row = {},
): Row {
  return {
    id,
    task_id: 1,
    workspace_id: 1,
    chat_id: chatId,
    status: "completed",
    started_at: "2026-09-12T09:00:00Z",
    completed_at: completedAt,
    ...fields,
  };
}
function repository(tables: Record<string, Row[]>) {
  return createTranscriptRepository({
    get: async () => ({
      select: async (sql: string, bindings: unknown[]) =>
        JSON.parse(
          execFileSync("python3", ["-c", sqlite], {
            input: JSON.stringify({
              sql,
              bindings,
              tables: {
                workspaces: [
                  { id: 1, path: "/repo", label: "Repo" },
                  {
                    id: 2,
                    path: "/removed",
                    label: "Removed",
                    deleted_at: now,
                  },
                ],
                ...tables,
              },
            }),
            encoding: "utf8",
          }),
        ),
    }),
  } as unknown as FrontendDatabase);
}

describe("sidebar repository queries", () => {
  it("paginates beyond the legacy 50-row limit without changing legacy callers", async () => {
    const repo = repository({
      chats: Array.from({ length: 61 }, (_, index) => chat(index + 1)),
    });
    expect(await repo.listWorkspaceChats(1)).toHaveLength(50);
    const first = await repo.listSidebarWorkspaceChats(1, 50, 0);
    const second = await repo.listSidebarWorkspaceChats(1, 50, 50);
    expect(first).toHaveLength(50);
    expect(second).toHaveLength(11);
    expect(new Set([...first, ...second].map((row) => row.id)).size).toBe(61);
  });

  it("orders by actual latest finish, covers all outcomes and excludes cutoff, future, missing and removed data", async () => {
    const repo = repository({
      chats: [
        chat(1),
        chat(2),
        chat(3),
        chat(4),
        chat(5),
        chat(6),
        chat(7, { deleted_at: now }),
        chat(8, { workspace_id: 2 }),
        chat(9),
      ],
      runs: [
        run(1, 1, "2026-09-12T10:00:00Z"),
        run(2, 1, "2026-09-12T11:00:00Z", { status: "failed" }),
        run(3, 2, "2026-09-12T11:00:00Z", { status: "interrupted" }),
        run(4, 3, "2026-09-11T12:00:00Z"),
        run(5, 4, "2026-09-12T12:00:01Z"),
        run(6, 5, null),
        run(7, 6, "2026-09-11T11:59:59Z"),
        run(8, 7, now),
        run(9, 8, now),
        run(10, 9, "2026-09-11T12:00:00.001Z"),
      ],
    });
    const rows = await repo.listPriorityChats(now);
    expect(rows.map((row) => [row.id, row.latest_finished_status])).toEqual([
      [2, "cancelled"],
      [1, "failed"],
      [9, "completed"],
    ]);
    expect(rows[1].latest_finished_at).toBe("2026-09-12T11:00:00.000Z");
  });

  it("hides active reruns and preserves accepted Kanban eligibility", async () => {
    const repo = repository({
      chats: [
        chat(1),
        chat(2, { surface: "kanban" }),
        chat(3, { surface: "kanban" }),
      ],
      runs: [
        run(1, 1, now),
        run(2, 1, null, { status: "running" }),
        run(3, 2, now),
        run(4, 3, now, { codex_turn_id: "accepted" }),
      ],
    });
    expect((await repo.listPriorityChats(now)).map((row) => row.id)).toEqual([
      3,
    ]);
  });

  it("uses only the current external snapshot, deduplicates accepted local turns and respects external active runs", async () => {
    const turn = (chatId: number, slot: number, fields: Row = {}): Row => ({
      chat_id: chatId,
      source_version: "v2",
      slot_index: slot,
      external_turn_id: `turn-${chatId}-${slot}`,
      prompt: "Prompt",
      final_message: "Result",
      status: "completed",
      completed_at: now,
      ...fields,
    });
    const repo = repository({
      chats: [
        chat(1, { origin: "codex_external" }),
        chat(2),
        chat(3),
        chat(4),
        chat(5),
      ],
      runs: [run(1, 2, "2026-09-12T10:00:00Z", { codex_turn_id: "turn-2-0" })],
      external_chat_transcript_snapshots: [1, 2, 3, 4, 5].map((id) => ({
        chat_id: id,
        source_version: "v2",
        turn_count: 2,
      })),
      external_chat_turn_summaries: [
        turn(1, 0),
        turn(2, 0, { status: "running", completed_at: null }),
        turn(3, 0),
        turn(3, 1, { status: "inProgress", completed_at: null }),
        turn(4, 0, { source_version: "v1" }),
        turn(5, 0, { completed_at: null }),
      ],
    });
    const rows = await repo.listPriorityChats(now);
    expect(rows.map((row) => row.id)).toEqual([1, 2]);
    expect(rows[1].latest_finished_at).toBe("2026-09-12T10:00:00.000Z");
  });
});
