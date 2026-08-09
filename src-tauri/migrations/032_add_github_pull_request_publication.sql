CREATE TABLE github_connections (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    github_user_id INTEGER NOT NULL,
    login TEXT NOT NULL,
    display_name TEXT,
    avatar_url TEXT,
    token_key TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'connected'
        CHECK (status IN ('connected', 'reconnect_required')),
    connected_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE github_installations (
    installation_id INTEGER PRIMARY KEY,
    account_login TEXT NOT NULL,
    account_type TEXT NOT NULL,
    repository_selection TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE github_installation_repositories (
    installation_id INTEGER NOT NULL,
    repository_id INTEGER NOT NULL,
    owner TEXT NOT NULL,
    name TEXT NOT NULL,
    full_name TEXT NOT NULL,
    private INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (installation_id, repository_id),
    UNIQUE (owner, name),
    FOREIGN KEY (installation_id) REFERENCES github_installations(installation_id)
        ON DELETE CASCADE
);

CREATE TABLE kanban_pull_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    card_id TEXT NOT NULL,
    source_repository_path TEXT NOT NULL,
    relative_path TEXT NOT NULL,
    owner TEXT,
    repository TEXT,
    pull_request_number INTEGER,
    pull_request_url TEXT,
    base_branch TEXT NOT NULL,
    head_branch TEXT NOT NULL,
    head_commit TEXT,
    draft INTEGER NOT NULL DEFAULT 1,
    pull_request_state TEXT NOT NULL DEFAULT 'unknown'
        CHECK (pull_request_state IN ('unknown', 'open', 'closed', 'merged')),
    publication_status TEXT NOT NULL DEFAULT 'queued'
        CHECK (publication_status IN (
            'queued', 'publishing', 'draft', 'ready', 'closed', 'merged',
            'failed', 'nothing_to_publish'
        )),
    last_error TEXT,
    etag TEXT,
    attempt_count INTEGER NOT NULL DEFAULT 0,
    last_synced_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (card_id, source_repository_path),
    FOREIGN KEY (card_id) REFERENCES kanban_cards(id) ON DELETE CASCADE
);

CREATE INDEX idx_kanban_pull_requests_status
    ON kanban_pull_requests(publication_status, updated_at);
CREATE INDEX idx_kanban_pull_requests_repository
    ON kanban_pull_requests(owner, repository, pull_request_number);
