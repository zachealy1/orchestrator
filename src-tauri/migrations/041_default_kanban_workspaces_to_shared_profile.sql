UPDATE workspaces
SET default_profile_key = 'default',
    default_account_id = NULL
WHERE deleted_at IS NULL
  AND EXISTS (
      SELECT 1
      FROM kanban_boards
      WHERE kanban_boards.workspace_id = workspaces.id
  );
