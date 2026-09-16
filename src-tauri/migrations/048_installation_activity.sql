CREATE TABLE installation_analytics (
    singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
    installation_id TEXT NOT NULL UNIQUE,
    enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1))
);

CREATE TABLE installation_active_days (
    installation_id TEXT NOT NULL,
    active_date TEXT NOT NULL,
    event_uuid TEXT NOT NULL UNIQUE,
    occurred_at TEXT NOT NULL,
    app_version TEXT NOT NULL,
    environment TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'sent', 'cancelled', 'expired', 'failed')),
    attempts INTEGER NOT NULL DEFAULT 0,
    next_attempt_at INTEGER NOT NULL,
    PRIMARY KEY (installation_id, active_date)
);

CREATE INDEX installation_active_days_pending
    ON installation_active_days (next_attempt_at) WHERE status = 'pending';
