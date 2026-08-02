
                CREATE TABLE IF NOT EXISTS external_chat_history_indexes (
                    chat_id INTEGER PRIMARY KEY,
                    thread_id TEXT NOT NULL,
                    source_version TEXT NOT NULL,
                    page_size INTEGER NOT NULL,
                    total_turns INTEGER NOT NULL,
                    pages_json TEXT NOT NULL,
                    hints_json TEXT NOT NULL,
                    indexed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE
                );

                CREATE INDEX IF NOT EXISTS idx_external_chat_history_index_version
                    ON external_chat_history_indexes(thread_id, source_version);
            