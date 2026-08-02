
                CREATE TABLE IF NOT EXISTS run_subagents (
                    id TEXT PRIMARY KEY,
                    run_id INTEGER NOT NULL,
                    profile_key TEXT NOT NULL,
                    account_id INTEGER NOT NULL,
                    root_thread_id TEXT NOT NULL,
                    parent_thread_id TEXT NOT NULL,
                    parent_turn_id TEXT,
                    child_thread_id TEXT NOT NULL,
                    child_turn_id TEXT,
                    spawn_item_id TEXT,
                    task_prompt TEXT NOT NULL,
                    hierarchy_depth INTEGER NOT NULL DEFAULT 0,
                    status TEXT NOT NULL,
                    status_before_attention TEXT,
                    agent_status TEXT,
                    needs_attention INTEGER NOT NULL DEFAULT 0,
                    error TEXT,
                    final_result TEXT,
                    started_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    completed_at TEXT,
                    FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE,
                    UNIQUE (run_id, child_thread_id)
                );

                CREATE INDEX IF NOT EXISTS idx_run_subagents_run_status
                    ON run_subagents(run_id, status, updated_at);
                CREATE INDEX IF NOT EXISTS idx_run_subagents_child_thread
                    ON run_subagents(profile_key, child_thread_id);
            