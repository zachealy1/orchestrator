import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Workspace } from "../../features/workspaces/types";
import type { FrontendDatabase } from "../database";
import { createWorkspaceRepository } from "./workspaces";

const connection = {
  execute: vi.fn(),
  select: vi.fn(),
};
const database = {
  get: vi.fn(async () => connection),
  selectOne: vi.fn(),
} as unknown as FrontendDatabase;

describe("workspace repository", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    connection.execute.mockResolvedValue({ lastInsertId: 1, rowsAffected: 1 });
    vi.mocked(database.selectOne).mockResolvedValue({
      id: 1,
      path: "/workspace/new-project",
      label: "new-project",
      default_account_id: null,
      default_profile_key: "default",
      selected_git_repository_path: null,
      last_opened_at: "2026-08-20T10:00:00Z",
      created_at: "2026-08-20T10:00:00Z",
    } satisfies Workspace);
  });

  it("creates workspaces with the shared Codex profile without overwriting explicit defaults", async () => {
    const repository = createWorkspaceRepository(database);

    await repository.upsertWorkspace("/workspace/new-project");

    expect(connection.execute).toHaveBeenCalledWith(
      expect.stringMatching(
        /VALUES \(\$1, \$2, NULL, 'default', CURRENT_TIMESTAMP\)[\s\S]+ON CONFLICT\(path\) DO UPDATE SET[\s\S]+last_opened_at = CURRENT_TIMESTAMP/,
      ),
      ["/workspace/new-project", "new-project"],
    );
    const query = connection.execute.mock.calls[0]?.[0] as string;
    const conflictUpdate = query.slice(query.indexOf("ON CONFLICT"));
    expect(conflictUpdate).not.toContain("default_profile_key");
    expect(conflictUpdate).not.toContain("default_account_id");
  });
});
