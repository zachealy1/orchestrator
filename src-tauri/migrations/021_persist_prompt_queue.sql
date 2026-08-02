
                ALTER TABLE chats ADD COLUMN conversation_revision INTEGER NOT NULL DEFAULT 0;

                CREATE TABLE IF NOT EXISTS prompt_queue_items (
                    id TEXT PRIMARY KEY,
                    client_message_id TEXT NOT NULL UNIQUE,
                    workspace_id INTEGER NOT NULL,
                    chat_id INTEGER NOT NULL,
                    position INTEGER NOT NULL,
                    send_now_priority INTEGER,
                    prompt_text TEXT NOT NULL,
                    execution_snapshot_json TEXT NOT NULL,
                    context_fingerprint_json TEXT NOT NULL,
                    status TEXT NOT NULL,
                    linked_run_id INTEGER,
                    linked_turn_id TEXT,
                    error TEXT,
                    stale_reasons_json TEXT,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    accepted_at TEXT,
                    completed_at TEXT,
                    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
                    FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE,
                    FOREIGN KEY (linked_run_id) REFERENCES runs(id) ON DELETE SET NULL
                );

                CREATE INDEX IF NOT EXISTS idx_prompt_queue_chat_position
                    ON prompt_queue_items(chat_id, position, created_at);
                CREATE INDEX IF NOT EXISTS idx_prompt_queue_dispatch
                    ON prompt_queue_items(
                        chat_id, status, send_now_priority, position
                    );
            