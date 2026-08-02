
                CREATE TABLE IF NOT EXISTS kanban_attempts (
                    id TEXT PRIMARY KEY,
                    card_id TEXT NOT NULL,
                    generation INTEGER NOT NULL,
                    attempt_kind TEXT NOT NULL
                        CHECK (attempt_kind IN ('start', 'retry', 'resume', 'request_changes')),
                    status TEXT NOT NULL
                        CHECK (status IN (
                            'provisioning', 'starting', 'running', 'waiting_user',
                            'waiting_approval', 'pause_requested', 'paused',
                            'stop_requested', 'stopped', 'blocked', 'failed',
                            'interrupted', 'completed'
                        )),
                    prompt TEXT NOT NULL,
                    config_snapshot_json TEXT NOT NULL,
                    run_id INTEGER,
                    task_id INTEGER,
                    thread_id TEXT,
                    turn_id TEXT,
                    execution_root TEXT,
                    recoverable INTEGER NOT NULL DEFAULT 0,
                    error TEXT,
                    started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    completed_at TEXT,
                    UNIQUE (card_id, generation),
                    FOREIGN KEY (card_id) REFERENCES kanban_cards(id) ON DELETE CASCADE,
                    FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE SET NULL,
                    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL
                );

                CREATE UNIQUE INDEX IF NOT EXISTS idx_kanban_attempt_one_active
                    ON kanban_attempts(card_id)
                    WHERE status IN (
                        'provisioning', 'starting', 'running', 'waiting_user',
                        'waiting_approval', 'pause_requested', 'stop_requested'
                    );

                CREATE TABLE IF NOT EXISTS kanban_repository_bindings (
                    id TEXT PRIMARY KEY,
                    card_id TEXT NOT NULL,
                    repository_path TEXT NOT NULL,
                    relative_path TEXT NOT NULL,
                    base_branch TEXT NOT NULL,
                    base_commit TEXT NOT NULL,
                    card_branch TEXT NOT NULL,
                    worktree_path TEXT NOT NULL UNIQUE,
                    include_dirty INTEGER NOT NULL DEFAULT 0,
                    state TEXT NOT NULL DEFAULT 'ready'
                        CHECK (state IN ('provisioning', 'ready', 'conflicted', 'missing', 'cleanup_pending', 'cleanup_failed', 'removed')),
                    head_commit TEXT,
                    status_fingerprint TEXT,
                    last_error TEXT,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE (card_id, repository_path),
                    FOREIGN KEY (card_id) REFERENCES kanban_cards(id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS kanban_operations (
                    operation_id TEXT PRIMARY KEY,
                    workspace_id INTEGER NOT NULL,
                    card_id TEXT,
                    operation_kind TEXT NOT NULL,
                    status TEXT NOT NULL
                        CHECK (status IN ('applying', 'completed', 'failed')),
                    result_json TEXT,
                    error_code TEXT,
                    error TEXT,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    completed_at TEXT,
                    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
                    FOREIGN KEY (card_id) REFERENCES kanban_cards(id) ON DELETE SET NULL
                );

                CREATE TABLE IF NOT EXISTS kanban_pending_requests (
                    id TEXT PRIMARY KEY,
                    card_id TEXT NOT NULL,
                    attempt_id TEXT NOT NULL,
                    request_kind TEXT NOT NULL CHECK (request_kind IN ('approval', 'user_input')),
                    request_key TEXT NOT NULL,
                    payload_json TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'submitting', 'resolved', 'denied', 'expired', 'failed')),
                    resolution_json TEXT,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    resolved_at TEXT,
                    UNIQUE (attempt_id, request_key),
                    FOREIGN KEY (card_id) REFERENCES kanban_cards(id) ON DELETE CASCADE,
                    FOREIGN KEY (attempt_id) REFERENCES kanban_attempts(id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS kanban_review_decisions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    card_id TEXT NOT NULL,
                    attempt_id TEXT,
                    decision TEXT NOT NULL CHECK (decision IN ('changes_requested', 'approved', 'reopened')),
                    message TEXT,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (card_id) REFERENCES kanban_cards(id) ON DELETE CASCADE,
                    FOREIGN KEY (attempt_id) REFERENCES kanban_attempts(id) ON DELETE SET NULL
                );

                CREATE TABLE IF NOT EXISTS kanban_runtime_events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    card_id TEXT NOT NULL,
                    attempt_id TEXT,
                    generation INTEGER NOT NULL DEFAULT 0,
                    sequence INTEGER NOT NULL,
                    event_key TEXT NOT NULL UNIQUE,
                    event_type TEXT NOT NULL,
                    payload_json TEXT NOT NULL,
                    applied INTEGER NOT NULL DEFAULT 1,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE (attempt_id, generation, sequence),
                    FOREIGN KEY (card_id) REFERENCES kanban_cards(id) ON DELETE CASCADE,
                    FOREIGN KEY (attempt_id) REFERENCES kanban_attempts(id) ON DELETE CASCADE
                );

                CREATE INDEX IF NOT EXISTS idx_kanban_attempts_card_generation
                    ON kanban_attempts(card_id, generation DESC);
                CREATE INDEX IF NOT EXISTS idx_kanban_bindings_card_state
                    ON kanban_repository_bindings(card_id, state);
                CREATE INDEX IF NOT EXISTS idx_kanban_requests_attempt_status
                    ON kanban_pending_requests(attempt_id, status, created_at);
                CREATE INDEX IF NOT EXISTS idx_kanban_events_card_cursor
                    ON kanban_runtime_events(card_id, id);
            
