ALTER TABLE chats ADD COLUMN continued_from_chat_id INTEGER REFERENCES chats(id) ON DELETE SET NULL;
ALTER TABLE chats ADD COLUMN continuation_kind TEXT CHECK (
    continuation_kind IS NULL OR continuation_kind IN ('chat', 'worktree')
);
ALTER TABLE chats ADD COLUMN continuation_snapshot_json TEXT;
ALTER TABLE chats ADD COLUMN continuation_settings_json TEXT;
ALTER TABLE chats ADD COLUMN continuation_turn_count INTEGER NOT NULL DEFAULT 0;

CREATE TABLE chat_worktree_bindings (
    chat_id INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
    source_repository_path TEXT NOT NULL,
    relative_path TEXT NOT NULL,
    execution_root TEXT NOT NULL,
    source_branch TEXT NOT NULL,
    base_branch TEXT NOT NULL,
    base_commit TEXT NOT NULL,
    continuation_branch TEXT NOT NULL,
    worktree_path TEXT NOT NULL,
    status TEXT NOT NULL,
    error_json TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (chat_id, source_repository_path)
);

CREATE INDEX idx_chat_continuations_source
    ON chats(continued_from_chat_id)
    WHERE continued_from_chat_id IS NOT NULL;

