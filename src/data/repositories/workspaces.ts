import { commands } from "../../generated/tauri";
import type { Workspace } from "../../features/workspaces/types";
import { FrontendDatabase } from "../database";

export function createWorkspaceRepository(database: FrontendDatabase) {
  const getDatabase = () => database.get();
  const selectOne = <T>(query: string, bindValues: unknown[] = []) =>
    database.selectOne<T>(query, bindValues);

  function workspaceLabel(path: string) {
    const parts = path.split(/[\\/]/).filter(Boolean);
    return parts[parts.length - 1] ?? path;
  }

  async function listWorkspaces() {
    const db = await getDatabase();
    return db.select<Workspace[]>(
      `SELECT id, path, label, default_account_id, default_profile_key,
        selected_git_repository_path,
        last_opened_at, created_at
       FROM workspaces
       WHERE deleted_at IS NULL
       ORDER BY last_opened_at DESC`,
    );
  }

  async function upsertWorkspace(path: string) {
    const db = await getDatabase();
    const label = workspaceLabel(path);

    await db.execute(
      `INSERT INTO workspaces (
         path,
         label,
         default_account_id,
         default_profile_key,
         last_opened_at
       )
       VALUES ($1, $2, NULL, 'default', CURRENT_TIMESTAMP)
       ON CONFLICT(path) DO UPDATE SET
         label = excluded.label,
         last_opened_at = CURRENT_TIMESTAMP,
         deleted_at = NULL`,
      [path, label],
    );

    const workspace = await selectOne<Workspace>(
      `SELECT id, path, label, default_account_id, default_profile_key,
        selected_git_repository_path,
        last_opened_at, created_at
       FROM workspaces
       WHERE path = $1 AND deleted_at IS NULL`,
      [path],
    );

    if (!workspace) {
      throw new Error("Workspace was not saved");
    }

    return workspace;
  }

  async function updateWorkspaceSelectedGitRepository(
    workspaceId: number,
    repositoryPath: string | null,
  ) {
    const db = await getDatabase();
    await db.execute(
      `UPDATE workspaces
       SET selected_git_repository_path = $1
       WHERE id = $2 AND deleted_at IS NULL`,
      [repositoryPath, workspaceId],
    );
  }

  async function softDeleteWorkspace(workspaceId: number) {
    await commands.softDeleteWorkspaceTransaction(workspaceId);
  }

  return {
    listWorkspaces,
    upsertWorkspace,
    updateWorkspaceSelectedGitRepository,
    softDeleteWorkspace,
  };
}

export type WorkspaceRepository = ReturnType<typeof createWorkspaceRepository>;
