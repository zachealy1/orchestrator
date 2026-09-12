import { beforeEach, describe, expect, it, vi } from "vitest";
import type { KanbanBoardSnapshotRecord } from "./api";
import { assertKanbanTargetReady, persistKanbanBoardPreferences, readKanbanTargetBranch } from "./boardPreferences";

const mocks = vi.hoisted(() => ({ loadKanbanBoard: vi.fn(), saveKanbanPreferences: vi.fn() }));
vi.mock("./api", () => mocks);

const target = { repositoryPath: "/repo", branch: "release" };
let board: KanbanBoardSnapshotRecord;
const input = (workspaceId = 1) => ({ workspaceId, expectedRevision: 0, preferences: { search: "find" }, columnOrder: [] });

beforeEach(() => {
  vi.resetAllMocks();
  board = { workspaceId: 1, revision: 3, preferencesJson: "{}", cards: [], columns: [] };
  mocks.loadKanbanBoard.mockImplementation(async () => board);
  mocks.saveKanbanPreferences.mockImplementation(async (request) => {
    board = { ...board, revision: board.revision + 1, preferencesJson: JSON.stringify(request.preferences) };
    return board;
  });
});

describe("Kanban target persistence", () => {
  it("reads legacy and malformed preferences without inventing a target", () => {
    for (const json of ["{}", "null", "broken", '{"targetBranch":{"branch":"main"}}']) {
      expect(readKanbanTargetBranch(json)).toBeUndefined();
    }
    expect(readKanbanTargetBranch(JSON.stringify({ targetBranch: target }))).toEqual(target);
  });

  it("does not overwrite a persisted selection when initializing from a stale cache", async () => {
    board.preferencesJson = JSON.stringify({ targetBranch: target });
    const saved = await persistKanbanBoardPreferences(input(), { ...target, branch: "main" }, true);
    expect(readKanbanTargetBranch(saved.preferencesJson)).toEqual(target);
  });

  it("blocks launches immediately during a target save and persists the selection", async () => {
    let finish!: (board: KanbanBoardSnapshotRecord) => void;
    mocks.saveKanbanPreferences.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const saving = persistKanbanBoardPreferences(input(), target);
    expect(() => assertKanbanTargetReady(1)).toThrow("being saved");
    expect(() => assertKanbanTargetReady(2)).not.toThrow();
    await vi.waitFor(() => expect(finish).toBeDefined());
    finish({ ...board, preferencesJson: JSON.stringify({ targetBranch: target }) });
    const saved = await saving;
    expect(readKanbanTargetBranch(saved.preferencesJson)).toEqual(target);
    expect(() => assertKanbanTargetReady(1)).not.toThrow();
  });

  it("retries with a fresh revision and releases the launch gate on failure", async () => {
    mocks.saveKanbanPreferences.mockRejectedValue(new Error("database unavailable"));
    await expect(persistKanbanBoardPreferences(input(), target)).rejects.toThrow("database unavailable");
    expect(mocks.loadKanbanBoard).toHaveBeenCalledTimes(2);
    expect(readKanbanTargetBranch(board.preferencesJson)).toBeUndefined();
    expect(() => assertKanbanTargetReady(1)).not.toThrow();
  });

  it("serializes filter writes without restoring a stale target", async () => {
    const selecting = persistKanbanBoardPreferences(input(), target);
    const filtering = persistKanbanBoardPreferences({ ...input(), preferences: { search: "new search", targetBranch: { ...target, branch: "main" } } });
    await selecting;
    const saved = await filtering;
    expect(JSON.parse(saved.preferencesJson)).toEqual({ search: "new search", targetBranch: target });
    expect(mocks.saveKanbanPreferences.mock.calls[1][0].expectedRevision).toBe(4);
  });
});
