import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatRecord } from "../../features/conversations/types";
import type { FrontendDatabase } from "../database";
import { createChatRepository } from "./chats";
import { createTranscriptRepository } from "./transcripts";

const connection = {
  execute: vi.fn(),
  select: vi.fn(),
};
const database = {
  get: vi.fn(async () => connection),
  selectOne: vi.fn(),
} as unknown as FrontendDatabase;

function chat(overrides: Partial<ChatRecord> = {}): ChatRecord {
  return {
    id: 11,
    workspace_id: 7,
    account_id: 3,
    title: "Kanban card",
    codex_thread_id: null,
    status: "idle",
    surface: "kanban",
    origin: "orchestrator",
    profile_key: "account:3",
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

describe("conversation surface repositories", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    connection.execute.mockResolvedValue({ lastInsertId: 11, rowsAffected: 1 });
    connection.select.mockResolvedValue([]);
    vi.mocked(database.selectOne).mockResolvedValue(chat());
  });

  it("persists an explicitly owned Kanban chat surface", async () => {
    const repository = createChatRepository(database);

    await repository.createChat({
      workspaceId: 7,
      accountId: 3,
      title: "Kanban card",
      status: "idle",
      surface: "kanban",
    });

    expect(connection.execute).toHaveBeenCalledWith(
      expect.stringContaining("workspace_id, account_id, title, status, surface"),
      [
        7,
        3,
        "Kanban card",
        "idle",
        "kanban",
        "account:3",
        "complete",
        null,
      ],
    );
  });

  it("updates the account and profile selected for a card conversation", async () => {
    const repository = createChatRepository(database);

    await repository.updateChat(11, {
      accountId: 4,
      profileKey: "account:4",
      status: "starting",
    });

    expect(connection.execute).toHaveBeenCalledWith(
      expect.stringMatching(
        /account_id = \$1, profile_key = \$2, status = \$3, updated_at = CURRENT_TIMESTAMP/,
      ),
      [4, "account:4", "starting", 11],
    );
  });

  it("includes Kanban conversations in history only after Codex accepts a turn", async () => {
    const repository = createTranscriptRepository(database);

    await repository.listWorkspaceChats(7);

    expect(connection.select).toHaveBeenCalledWith(
      expect.stringMatching(
        /chats\.surface = 'chat'[\s\S]+chats\.surface = 'kanban'[\s\S]+accepted_runs\.codex_turn_id IS NOT NULL/,
      ),
      [7],
    );
  });
});
