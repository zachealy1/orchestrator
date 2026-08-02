
                ALTER TABLE chats ADD COLUMN title_generation_state TEXT NOT NULL DEFAULT 'complete';
                ALTER TABLE chats ADD COLUMN title_fallback TEXT;
                ALTER TABLE chats ADD COLUMN title_manually_edited INTEGER NOT NULL DEFAULT 0;
                ALTER TABLE chats ADD COLUMN title_generation_started_at TEXT;

                CREATE INDEX IF NOT EXISTS idx_chats_title_generation_state
                    ON chats(title_generation_state, title_manually_edited)
                    WHERE deleted_at IS NULL AND origin = 'orchestrator';
            