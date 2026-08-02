
                DROP INDEX IF EXISTS idx_chats_external_thread;
                CREATE UNIQUE INDEX IF NOT EXISTS idx_chats_external_thread
                    ON chats(external_thread_id)
                    WHERE origin = 'codex_external'
                      AND deleted_at IS NULL
                      AND external_thread_id IS NOT NULL;
            