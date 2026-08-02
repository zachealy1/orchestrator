
                CREATE TABLE IF NOT EXISTS chats (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    workspace_id INTEGER NOT NULL,
                    account_id INTEGER,
                    title TEXT NOT NULL,
                    codex_thread_id TEXT,
                    status TEXT NOT NULL,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    deleted_at TEXT,
                    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
                    FOREIGN KEY (account_id) REFERENCES codex_accounts(id) ON DELETE SET NULL
                );

                ALTER TABLE tasks ADD COLUMN chat_id INTEGER REFERENCES chats(id) ON DELETE SET NULL;
                ALTER TABLE tasks ADD COLUMN turn_index INTEGER;
                ALTER TABLE runs ADD COLUMN chat_id INTEGER REFERENCES chats(id) ON DELETE SET NULL;
                ALTER TABLE runs ADD COLUMN turn_index INTEGER;

                INSERT INTO chats (
                    id, workspace_id, account_id, title, codex_thread_id, status,
                    created_at, updated_at, deleted_at
                )
                SELECT
                    runs.id,
                    runs.workspace_id,
                    runs.account_id,
                    SUBSTR(tasks.original_prompt, 1, 120),
                    runs.codex_thread_id,
                    runs.status,
                    runs.started_at,
                    COALESCE(runs.completed_at, runs.started_at),
                    runs.deleted_at
                FROM runs
                JOIN tasks ON tasks.id = runs.task_id
                WHERE runs.chat_id IS NULL;

                UPDATE tasks
                SET chat_id = (
                    SELECT runs.id FROM runs WHERE runs.task_id = tasks.id LIMIT 1
                ),
                    turn_index = 1
                WHERE chat_id IS NULL
                  AND EXISTS (SELECT 1 FROM runs WHERE runs.task_id = tasks.id);

                UPDATE runs
                SET chat_id = runs.id,
                    turn_index = 1
                WHERE chat_id IS NULL;

                CREATE INDEX IF NOT EXISTS idx_chats_workspace_updated
                    ON chats(workspace_id, deleted_at, updated_at DESC);
                CREATE INDEX IF NOT EXISTS idx_runs_chat_turn
                    ON runs(chat_id, turn_index, started_at);
                CREATE INDEX IF NOT EXISTS idx_tasks_chat_turn
                    ON tasks(chat_id, turn_index, created_at);
            