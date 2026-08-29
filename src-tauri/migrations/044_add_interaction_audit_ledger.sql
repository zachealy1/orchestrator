CREATE TABLE IF NOT EXISTS interaction_sessions (
    id TEXT PRIMARY KEY,
    run_id INTEGER,
    thread_id TEXT,
    turn_id TEXT,
    state TEXT NOT NULL,
    current_surface_kind TEXT,
    browser_provider_version TEXT,
    desktop_provider_version TEXT,
    started_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    completed_at TEXT,
    error_code TEXT,
    FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS interaction_steps (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    sequence INTEGER NOT NULL,
    surface_kind TEXT NOT NULL,
    action_kind TEXT NOT NULL,
    grounding_kind TEXT NOT NULL,
    consequence TEXT NOT NULL,
    policy_decision TEXT NOT NULL,
    result_status TEXT,
    retry_count INTEGER NOT NULL DEFAULT 0,
    duration_ms INTEGER,
    error_code TEXT,
    observation_generation INTEGER NOT NULL,
    state_hash_before TEXT,
    state_hash_after TEXT,
    started_at TEXT NOT NULL,
    completed_at TEXT,
    FOREIGN KEY (session_id) REFERENCES interaction_sessions(id) ON DELETE CASCADE,
    UNIQUE (session_id, sequence)
);

CREATE TABLE IF NOT EXISTS interaction_permissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scope_kind TEXT NOT NULL,
    scope_key TEXT NOT NULL,
    decision TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    expires_at TEXT,
    UNIQUE (scope_kind, scope_key)
);

CREATE INDEX IF NOT EXISTS idx_interaction_sessions_run
    ON interaction_sessions(run_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_interaction_steps_session
    ON interaction_steps(session_id, sequence);
CREATE INDEX IF NOT EXISTS idx_interaction_permissions_scope
    ON interaction_permissions(scope_kind, scope_key);
