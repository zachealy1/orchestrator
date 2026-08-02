
                ALTER TABLE chats
                    ADD COLUMN surface TEXT NOT NULL DEFAULT 'chat'
                    CHECK (surface IN ('chat', 'kanban'));

                CREATE TABLE IF NOT EXISTS kanban_boards (
                    workspace_id INTEGER PRIMARY KEY,
                    revision INTEGER NOT NULL DEFAULT 0,
                    preferences_json TEXT NOT NULL DEFAULT '{}',
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS kanban_columns (
                    workspace_id INTEGER NOT NULL,
                    column_key TEXT NOT NULL
                        CHECK (column_key IN ('todo', 'in_progress', 'in_review', 'done')),
                    position INTEGER NOT NULL,
                    PRIMARY KEY (workspace_id, column_key),
                    UNIQUE (workspace_id, position),
                    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS kanban_cards (
                    id TEXT PRIMARY KEY,
                    workspace_id INTEGER NOT NULL,
                    chat_id INTEGER NOT NULL UNIQUE,
                    title TEXT NOT NULL,
                    description TEXT NOT NULL,
                    account_id INTEGER,
                    access_mode TEXT NOT NULL
                        CHECK (access_mode IN ('ask-for-approval', 'full-access')),
                    model TEXT,
                    reasoning_level TEXT,
                    repository_scope TEXT NOT NULL DEFAULT 'all'
                        CHECK (repository_scope IN ('all', 'selected')),
                    stage TEXT NOT NULL DEFAULT 'todo'
                        CHECK (stage IN ('todo', 'in_progress', 'in_review', 'done')),
                    sort_position INTEGER NOT NULL,
                    execution_state TEXT NOT NULL DEFAULT 'idle'
                        CHECK (execution_state IN (
                            'idle', 'starting', 'running', 'paused', 'waiting_user',
                            'waiting_approval', 'blocked', 'failed', 'stopped',
                            'interrupted', 'completed'
                        )),
                    review_state TEXT NOT NULL DEFAULT 'none'
                        CHECK (review_state IN ('none', 'awaiting_review', 'changes_requested', 'approved')),
                    current_attempt_id TEXT,
                    state_version INTEGER NOT NULL DEFAULT 0,
                    archived_at TEXT,
                    deleted_at TEXT,
                    approved_at TEXT,
                    last_error TEXT,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
                    FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE,
                    FOREIGN KEY (account_id) REFERENCES codex_accounts(id) ON DELETE SET NULL
                );

                CREATE TABLE IF NOT EXISTS kanban_card_repository_selections (
                    card_id TEXT NOT NULL,
                    repository_path TEXT NOT NULL,
                    relative_path TEXT NOT NULL DEFAULT '.',
                    label TEXT NOT NULL,
                    PRIMARY KEY (card_id, repository_path),
                    FOREIGN KEY (card_id) REFERENCES kanban_cards(id) ON DELETE CASCADE
                );

                INSERT OR IGNORE INTO kanban_boards (workspace_id)
                    SELECT id FROM workspaces WHERE deleted_at IS NULL;
                INSERT OR IGNORE INTO kanban_columns (workspace_id, column_key, position)
                    SELECT id, 'todo', 0 FROM workspaces WHERE deleted_at IS NULL;
                INSERT OR IGNORE INTO kanban_columns (workspace_id, column_key, position)
                    SELECT id, 'in_progress', 1 FROM workspaces WHERE deleted_at IS NULL;
                INSERT OR IGNORE INTO kanban_columns (workspace_id, column_key, position)
                    SELECT id, 'in_review', 2 FROM workspaces WHERE deleted_at IS NULL;
                INSERT OR IGNORE INTO kanban_columns (workspace_id, column_key, position)
                    SELECT id, 'done', 3 FROM workspaces WHERE deleted_at IS NULL;

                CREATE INDEX IF NOT EXISTS idx_kanban_cards_workspace_stage_position
                    ON kanban_cards(workspace_id, archived_at, deleted_at, stage, sort_position);
                CREATE INDEX IF NOT EXISTS idx_kanban_card_repositories_path
                    ON kanban_card_repository_selections(repository_path, card_id);
            
