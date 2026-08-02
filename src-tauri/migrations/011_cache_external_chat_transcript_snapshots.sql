
                CREATE TABLE IF NOT EXISTS external_chat_transcript_snapshots (
                    chat_id INTEGER PRIMARY KEY,
                    source_version TEXT NOT NULL,
                    turn_count INTEGER NOT NULL,
                    synced_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS external_chat_turn_summaries (
                    chat_id INTEGER NOT NULL,
                    source_version TEXT NOT NULL,
                    slot_index INTEGER NOT NULL,
                    external_turn_id TEXT,
                    prompt TEXT NOT NULL,
                    final_message TEXT NOT NULL,
                    status TEXT NOT NULL,
                    started_at TEXT,
                    completed_at TEXT,
                    duration_ms INTEGER,
                    total_tokens INTEGER,
                    model_context_window INTEGER,
                    PRIMARY KEY (chat_id, source_version, slot_index),
                    FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE
                );

                CREATE INDEX IF NOT EXISTS idx_external_chat_turn_summaries_active
                    ON external_chat_turn_summaries(chat_id, source_version, slot_index);
            