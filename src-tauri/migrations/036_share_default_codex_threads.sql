ALTER TABLE workspaces
    ADD COLUMN default_profile_key TEXT NOT NULL DEFAULT 'default';

UPDATE workspaces
SET default_profile_key = 'account:' || default_account_id
WHERE default_account_id IS NOT NULL;

ALTER TABLE chats ADD COLUMN native_thread_updated_at TEXT;
ALTER TABLE chats ADD COLUMN native_last_synced_at TEXT;
ALTER TABLE chats ADD COLUMN native_sync_status TEXT;

UPDATE chats
SET profile_key = 'default'
WHERE origin = 'orchestrator'
  AND account_id IS NULL
  AND profile_key IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_chats_shared_native_thread
    ON chats(codex_thread_id)
    WHERE profile_key = 'default'
      AND codex_thread_id IS NOT NULL
      AND deleted_at IS NULL;
