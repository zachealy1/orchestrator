CREATE TABLE gitlab_connections (
    host TEXT PRIMARY KEY,
    login TEXT,
    display_name TEXT,
    avatar_url TEXT,
    status TEXT NOT NULL DEFAULT 'disconnected'
        CHECK (status IN ('connected', 'disconnected', 'reconnect_required')),
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE kanban_pull_requests ADD COLUMN provider TEXT NOT NULL DEFAULT 'github'
    CHECK (provider IN ('github', 'gitlab'));
ALTER TABLE kanban_pull_requests ADD COLUMN host TEXT NOT NULL DEFAULT 'github.com';
ALTER TABLE kanban_pull_requests ADD COLUMN project_id INTEGER;
ALTER TABLE kanban_pull_requests ADD COLUMN project_path TEXT;
UPDATE kanban_pull_requests SET project_path = owner || '/' || repository
    WHERE owner IS NOT NULL AND repository IS NOT NULL;
CREATE INDEX idx_kanban_requests_provider_host
    ON kanban_pull_requests(provider, host, project_id, pull_request_number);

-- Replace only the constrained column; keep the parent table, foreign keys,
-- triggers, and indexes intact (SQLite supports DROP COLUMN since 3.35).
ALTER TABLE kanban_cards ADD COLUMN next_review_channel TEXT
    CHECK (next_review_channel IS NULL OR next_review_channel IN ('github','gitlab','mixed','local'));
UPDATE kanban_cards SET next_review_channel = review_channel;
ALTER TABLE kanban_cards DROP COLUMN review_channel;
ALTER TABLE kanban_cards RENAME COLUMN next_review_channel TO review_channel;
