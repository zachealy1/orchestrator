UPDATE chats
SET native_workspace_binding_status = 'pending',
    native_workspace_binding_error = NULL,
    native_workspace_binding_updated_at = CURRENT_TIMESTAMP
WHERE deleted_at IS NULL
  AND origin <> 'codex_external'
  AND codex_thread_id IS NOT NULL
  AND (
      profile_key = 'default'
      OR surface = 'kanban'
  );
