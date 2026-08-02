
                ALTER TABLE chats ADD COLUMN origin TEXT NOT NULL DEFAULT 'orchestrator';
                ALTER TABLE chats ADD COLUMN profile_key TEXT;
                ALTER TABLE chats ADD COLUMN external_thread_id TEXT;
                ALTER TABLE chats ADD COLUMN source_kind TEXT;
                ALTER TABLE chats ADD COLUMN sync_status TEXT;
                ALTER TABLE chats ADD COLUMN external_cwd TEXT;
                ALTER TABLE chats ADD COLUMN external_created_at TEXT;
                ALTER TABLE chats ADD COLUMN external_updated_at TEXT;
                ALTER TABLE chats ADD COLUMN last_synced_at TEXT;

                UPDATE chats
                SET origin = 'orchestrator',
                    profile_key = CASE
                        WHEN account_id IS NULL THEN NULL
                        ELSE 'account:' || account_id
                    END
                WHERE origin IS NULL OR origin = 'orchestrator';

                CREATE UNIQUE INDEX IF NOT EXISTS idx_chats_external_thread
                    ON chats(profile_key, external_thread_id)
                    WHERE origin = 'codex_external'
                      AND deleted_at IS NULL
                      AND external_thread_id IS NOT NULL;

                CREATE INDEX IF NOT EXISTS idx_chats_origin_workspace_updated
                    ON chats(workspace_id, origin, deleted_at, updated_at DESC);
            