import { describe, expect, it, vi } from "vitest";
import type { ChatRecord } from "../conversations/types";
import type {
  KanbanBoardSnapshotRecord,
  KanbanCardRecord,
  KanbanGitBinding,
} from "./api";
import { prepareCardBranchTitle } from "./branchTitleReadiness";

const card = {
  id: "card-1",
  chatId: 7,
  workspaceId: 1,
  stateVersion: 1,
  title: "Generating title...",
  description: "Fix naming",
  repositories: [{ repositoryPath: "/repo" }],
} as KanbanCardRecord;
const title = { title: "Fix readable branch names" } as ChatRecord;
function setup(latest: Partial<KanbanCardRecord> = {}) {
  const dependencies = {
    loadBindings: vi.fn(async () => [] as KanbanGitBinding[]),
    loadBoard: vi.fn(
      async () =>
        ({
          cards: [{ ...card, title: title.title, ...latest }],
        }) as KanbanBoardSnapshotRecord,
    ),
  };
  const ensureTitle = vi.fn(async () => title);
  const abort = new AbortController();
  const prepare = () =>
    prepareCardBranchTitle(
      card,
      card.repositories,
      abort.signal,
      ensureTitle,
      dependencies,
    );
  return { dependencies, ensureTitle, abort, prepare };
}

describe("card branch title readiness", () => {
  it("waits before reloading the card, discarding the original placeholder snapshot", async () => {
    const { dependencies, ensureTitle, prepare } = setup();
    let settle!: (chat: ChatRecord) => void;
    ensureTitle.mockImplementation(
      () =>
        new Promise((resolve) => {
          settle = resolve;
        }),
    );
    const ready = prepare();
    await vi.waitFor(() => expect(ensureTitle).toHaveBeenCalledOnce());
    expect(dependencies.loadBoard).not.toHaveBeenCalled();
    settle(title);
    expect((await ready).title).toBe(title.title);
  });

  it("reuses existing bindings without waiting or renaming", async () => {
    const { dependencies, ensureTitle, prepare } = setup();
    dependencies.loadBindings.mockResolvedValue([
      {
        sourceRepositoryPath: "/repo",
        cardBranch: "codex/generating-title",
      } as KanbanGitBinding,
    ]);
    expect(await prepare()).toBe(card);
    expect(ensureTitle).not.toHaveBeenCalled();
    expect(dependencies.loadBoard).not.toHaveBeenCalled();
  });

  it("waits when expanding to a missing repository", async () => {
    const { dependencies, ensureTitle, prepare } = setup();
    dependencies.loadBindings.mockResolvedValue([
      { sourceRepositoryPath: "/other" } as KanbanGitBinding,
    ]);
    await prepare();
    expect(ensureTitle).toHaveBeenCalledOnce();
  });

  it.each([{ stateVersion: 2 }, { archivedAt: "now" }, { deletedAt: "now" }])(
    "rejects a changed or unavailable card: %j",
    async (change) => {
      await expect(setup(change).prepare()).rejects.toThrow();
    },
  );

  it("propagates failed persistence without proceeding", async () => {
    const { dependencies, ensureTitle, prepare } = setup();
    ensureTitle.mockRejectedValue(new Error("Could not save title"));
    await expect(prepare()).rejects.toThrow("Could not save title");
    expect(dependencies.loadBoard).not.toHaveBeenCalled();
  });
});
