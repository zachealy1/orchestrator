ALTER TABLE chats ADD COLUMN native_workspace_binding_json TEXT;
ALTER TABLE chats ADD COLUMN native_workspace_binding_status TEXT;
ALTER TABLE chats ADD COLUMN native_workspace_binding_error TEXT;
ALTER TABLE chats ADD COLUMN native_workspace_binding_updated_at TEXT;

CREATE INDEX IF NOT EXISTS idx_chats_native_workspace_binding_status
    ON chats(workspace_id, native_workspace_binding_status)
    WHERE deleted_at IS NULL
      AND surface = 'kanban';
